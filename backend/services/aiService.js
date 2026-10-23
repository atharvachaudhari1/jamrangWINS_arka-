const OpenAI = require("openai");

function getClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function safeJsonParse(content, fallback) {
  try {
    // Strip markdown code fences if present
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(stripped);
  } catch {
    return fallback;
  }
}

function normalizeDueAt(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function chunkTask(text) {
  const client = getClient();
  if (!client) {
    return [`${text} — step 1`, `${text} — step 2`, `${text} — step 3`];
  }

  try {
    const prompt = `
You are an ADHD productivity coach.

Break this task into small actionable steps.

Rules:
- 3 to 6 steps
- Each step <= 20 minutes
- Keep it simple

Task:
"${text}"

Return JSON:
["step1", "step2", "step3"]
`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0].message.content;
    const parsed = safeJsonParse(content, null);
    if (Array.isArray(parsed)) return parsed;
    if (typeof content === "string") return content.split("\n").filter(Boolean);
    return [];
  } catch (err) {
    console.warn("chunkTask AI failed, using fallback:", err.message);
    return [`${text} — step 1`, `${text} — step 2`, `${text} — step 3`];
  }
}

function lineSplitFallback(text) {
  return text
    .split(/\n|,|;|\. /)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((title) => ({ title, estimateMins: 30, dreadScore: 3, importance: 1, dueAt: null }));
}

async function parseBrainDump(text) {
  const client = getClient();
  if (!client) return lineSplitFallback(text);

  try {
    const prompt = `
You are an ADHD productivity coach helping a user turn a messy brain dump into clear tasks.

Convert the user's text into a JSON array of actionable tasks.

Rules:
- Return only valid JSON.
- Extract 1 or more concrete tasks from the text.
- Rewrite vague thoughts into short actionable task titles.
- Keep titles concise and specific.
- If something is not actionable, skip it.
- estimateMins must be a number between 10 and 180.
- dreadScore must be a number from 1 to 5.
- importance must be a number from 1 to 5.
- dueAt must be either null or an ISO 8601 datetime string if the user clearly mentioned a deadline.

Return this exact shape:
[
  {
    "title": "string",
    "estimateMins": 30,
    "dreadScore": 3,
    "importance": 3,
    "dueAt": null
  }
]

User brain dump:
"""${text}"""
`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0].message.content;
    const parsed = safeJsonParse(content, []);

    if (!Array.isArray(parsed) || parsed.length === 0) return lineSplitFallback(text);

    return parsed
      .filter((task) => task && typeof task.title === "string" && task.title.trim())
      .map((task) => ({
        title: task.title.trim(),
        estimateMins: Math.max(10, Math.min(180, Number(task.estimateMins) || 30)),
        dreadScore: Math.max(1, Math.min(5, Number(task.dreadScore) || 3)),
        importance: Math.max(1, Math.min(5, Number(task.importance) || 3)),
        dueAt: normalizeDueAt(task.dueAt),
      }));
  } catch (err) {
    console.warn("parseBrainDump AI failed, using fallback:", err.message);
    return lineSplitFallback(text);
  }
}

async function streamChatResponse(messages, systemPrompt, res) {
  const client = getClient();
  if (!client) {
    return res.status(503).json({ error: "AI service not configured" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
    }
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

module.exports = { chunkTask, parseBrainDump, streamChatResponse };
