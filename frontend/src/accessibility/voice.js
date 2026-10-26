// Commands that change saved data always ask for confirmation first.
const RULES = [
  { re: /^(?:please\s+)?(?:add|create|new)\s+(?:a\s+)?task\s*(?:called|named|:)?\s*(.*)$/, command: "create", needsConfirm: true, arg: "title" },
  { re: /\b(?:stop|quiet|silence)\b(?:\s+(?:reading|talking|speaking))?/, command: "stopRead" },
  { re: /\b(?:open|go to|show)\s+(?:my\s+)?today\b|\btoday card\b/, command: "openToday" },
  { re: /\b(?:open|go to|show)\s+(?:my\s+)?tasks\b/, command: "openTasks" },
  { re: /\b(?:read|say)\b.*\b(?:recommendation|suggestion|today|card|it|this)\b|\b(?:start reading|read aloud)\b/, command: "read" },
  { re: /\b(?:another|something else|different)\b|\bchange(?: task)?\b|\bnext (?:one|option|task)\b/, command: "change" },
  { re: /\bmark\b.*\b(?:done|complete|completed|finished)\b|^(?:complete|done|finished)$/, command: "complete", needsConfirm: true },
  { re: /\bnot now\b|\blater\b/, command: "notnow", needsConfirm: true },
  { re: /\bsmaller\b|\bsmall step\b/, command: "smaller" },
  { re: /\b(?:do it|start(?: focus| it)?|let's go)\b/, command: "do" },
  { re: /\brest\b|\bbreak\b/, command: "rest" },
];

export const VOICE_COMMANDS = [
  ["“Add task read chapter 3”", "Creates a task after you confirm"],
  ["“Open Today” / “Open my tasks”", "Moves to that page"],
  ["“Read the recommendation”", "Reads the Today card aloud"],
  ["“Another one”", "Shows other options"],
  ["“Mark done”", "Marks the task done after you confirm"],
  ["“Smaller” / “Do it” / “Rest” / “Not now”", "Same as the Today buttons"],
  ["“Stop reading”", "Stops read-aloud"],
];

export function parseVoiceCommand(transcript) {
  const normalized = String(transcript || "").replace(/[.,!?]+$/g, "").replace(/\s+/g, " ").trim();
  const text = normalized.toLowerCase();
  if (!text) return null;
  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    const args = {};
    if (rule.arg) {
      const value = (normalized.match(new RegExp(rule.re.source, "i"))?.[1] || "").trim();
      if (!value) return { command: rule.command, args: {}, needsConfirm: false, incomplete: true, transcript: text };
      args[rule.arg] = value.slice(0, 200);
    }
    return { command: rule.command, args, needsConfirm: !!rule.needsConfirm, transcript: text };
  }
  return { command: null, args: {}, needsConfirm: false, transcript: text };
}

// Kept for older callers: maps a phrase straight to a Today action.
export function matchVoiceCommand(transcript) {
  const parsed = parseVoiceCommand(transcript);
  return ["do", "complete", "smaller", "change", "rest", "notnow"].includes(parsed?.command) ? parsed.command : null;
}

const BROWSER_ERRORS = {
  "not-allowed": "Microphone permission was blocked. Allow the microphone for this site, or use the buttons.",
  "service-not-allowed": "service",
  "no-speech": "No speech was heard. Press the microphone and try again.",
  "audio-capture": "No microphone was found. The buttons still work.",
  network: "service",
  aborted: "",
};

// The browser speech service fails immediately in Cursor and other Chromium
// builds. Those errors mean "no speech service", not "the user is offline".
function serviceUnavailable(error) {
  return error === "network" || error === "service-not-allowed";
}

// Listens for one phrase. Uses the browser speech service when it works, and
// the Doorway server (Windows speech, audio deleted after) when it does not.
export function startListening({ onResult, onInterim, onError, onEnd, transcribe, record, Speech }) {
  const Recognition = Speech === undefined
    ? (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition))
    : Speech;
  let closed = false;
  let mode = "browser";
  let recognition = null;
  let recording = null;

  function end() {
    if (closed) return;
    closed = true;
    onEnd?.();
  }

  function fail(error) {
    if (closed) return;
    if (error?.code === "aborted") { end(); return; }
    onError?.(error?.message || "Voice input stopped. You can try again or use the buttons.");
    end();
  }

  function useComputer() {
    if (closed) return;
    mode = "computer";
    if (!record || !transcribe) {
      fail(new Error("Voice commands are not available in this browser. Open Doorway in Chrome or Edge, or use the buttons."));
      return;
    }
    recording = record();
    recording.done
      .then(async (wav) => {
        if (closed) return;
        const data = await transcribe(wav);
        if (closed) return;
        const text = String(data?.transcript || "").trim();
        if (!text) fail(new Error("No speech was heard. Press the microphone and try again."));
        else { onResult?.(text); end(); }
      })
      .catch(fail);
  }

  const embedded = typeof navigator !== "undefined" && /Cursor|Electron/i.test(navigator.userAgent || "");
  if (!Recognition || embedded) useComputer();
  else {
    recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      if (interim) onInterim?.(interim);
      if (finalText) {
        mode = "done";
        onResult?.(finalText);
        try { recognition.stop(); } catch { /* already stopping */ }
      }
    };
    recognition.onerror = (event) => {
      if (closed || mode === "done") return;
      if (serviceUnavailable(event.error)) {
        mode = "computer";
        try { recognition.abort(); } catch { /* already stopped */ }
        useComputer();
        return;
      }
      const message = BROWSER_ERRORS[event.error] ?? "Voice input stopped. You can try again or use the buttons.";
      if (message) onError?.(message);
    };
    recognition.onend = () => { if (mode === "browser" || mode === "done") end(); };
    try {
      recognition.start();
    } catch {
      useComputer();
    }
  }

  return {
    stop() {
      closed = true;
      try { recognition?.abort(); } catch { /* already stopped */ }
      recording?.stop();
      onEnd?.();
    },
  };
}

// Listens for one phrase, then stops. Nothing is recorded continuously.
export function startDictation({ onResult, onInterim, onError, onEnd }) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    onError?.("Voice commands are not available in this browser. Try Chrome or Edge, or use the buttons.");
    return null;
  }
  const recognition = new Speech();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    let finalText = "";
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) finalText += piece;
      else interim += piece;
    }
    if (interim) onInterim?.(interim);
    if (finalText) onResult?.(finalText);
  };
  recognition.onerror = (event) => {
    const message = event.error === "network"
      ? "This browser has no speech service. Voice commands use the computer’s speech recognition instead. Press the microphone again."
      : (BROWSER_ERRORS[event.error] && BROWSER_ERRORS[event.error] !== "service"
        ? BROWSER_ERRORS[event.error]
        : (event.error === "service-not-allowed"
          ? "This browser does not allow its speech service. Press the microphone again to use the computer’s speech recognition."
          : "Voice input stopped. You can try again or use the buttons."));
    if (message) onError?.(message);
  };
  recognition.onend = () => onEnd?.();
  try {
    recognition.start();
  } catch {
    onError?.("Voice input is already running.");
    return null;
  }
  return recognition;
}
