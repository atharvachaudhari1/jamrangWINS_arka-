import test from "node:test";
import assert from "node:assert/strict";
import { parseVoiceCommand, matchVoiceCommand, startListening } from "../src/accessibility/voice.js";
import { encodeWav, downsample } from "../src/accessibility/wav.js";
import { createGestureGate, GESTURES } from "../src/accessibility/gestureGate.js";
import { createSpeechController } from "../src/accessibility/speechController.js";

test("voice: recognises the command set", () => {
  const cases = {
    "Add task Read chapter 3": ["create", { title: "Read chapter 3" }],
    "create a task called Lab report.": ["create", { title: "Lab report" }],
    "open today": ["openToday", {}],
    "Open my tasks": ["openTasks", {}],
    "read the recommendation": ["read", {}],
    "another one": ["change", {}],
    "mark it as done": ["complete", {}],
    "stop reading": ["stopRead", {}],
    "smaller": ["smaller", {}],
    "do it": ["do", {}],
    "not now": ["notnow", {}],
    "I need a rest": ["rest", {}],
  };
  for (const [phrase, [command, args]] of Object.entries(cases)) {
    const parsed = parseVoiceCommand(phrase);
    assert.equal(parsed.command, command, phrase);
    assert.deepEqual(parsed.args, args, phrase);
  }
});

test("voice: data-changing commands need confirmation, unknown phrases do nothing", () => {
  assert.equal(parseVoiceCommand("add task essay").needsConfirm, true);
  assert.equal(parseVoiceCommand("mark done").needsConfirm, true);
  assert.equal(parseVoiceCommand("not now").needsConfirm, true);
  assert.equal(parseVoiceCommand("open today").needsConfirm, false);
  assert.equal(parseVoiceCommand("what is the weather").command, null);
  assert.equal(parseVoiceCommand("add task").incomplete, true);
  assert.equal(parseVoiceCommand(""), null);
  assert.equal(matchVoiceCommand("open today"), null);
  assert.equal(matchVoiceCommand("smaller please"), "smaller");
});

test("gestures: low confidence and unsteady frames are ignored", () => {
  const gate = createGestureGate({ threshold: 0.75, stableFrames: 3, cooldownMs: 1000 });
  assert.equal(gate("Thumb_Up", 0.5, 0), null);
  assert.equal(gate("Thumb_Up", 0.9, 10), null);
  assert.equal(gate("Victory", 0.9, 20), null, "switching gesture resets the count");
  assert.equal(gate("Victory", 0.9, 30), null);
  assert.equal(gate("Victory", 0.9, 40), "change");
});

test("gestures: cooldown prevents repeats, unknown gestures map to nothing", () => {
  const gate = createGestureGate({ threshold: 0.7, stableFrames: 2, cooldownMs: 1000 });
  gate("Open_Palm", 0.9, 0);
  assert.equal(gate("Open_Palm", 0.9, 10), "stop");
  for (let t = 20; t < 3000; t += 100) assert.equal(gate("Open_Palm", 0.9, t), null, "holding does not repeat");
  gate("None", 0, 3000);
  gate("Open_Palm", 0.9, 3010);
  assert.equal(gate("Open_Palm", 0.9, 3020), "stop", "fires again after the hand drops");
  gate("None", 0, 3030);
  gate("Open_Palm", 0.9, 3040);
  assert.equal(gate("Open_Palm", 0.9, 3050), null, "inside cooldown");
  assert.equal(gate("ILoveYou", 0.99, 5000), null);
  assert.equal(Object.values(GESTURES).includes("delete"), false);
});

function fakeEnv({ fail = false } = {}) {
  const log = [];
  const audios = [];
  const env = {
    log,
    audios,
    fetchAudio: async () => {
      log.push("fetch");
      return fail ? { ok: false, error: "ElevenLabs rejected the API key." } : { ok: true, blob: { size: 3 } };
    },
    makeAudio: (url) => {
      const audio = { url, paused: false, play: async () => { audio.paused = false; log.push(`play ${url}`); }, pause: () => { audio.paused = true; log.push("pause"); } };
      audios.push(audio);
      return audio;
    },
    urls: { n: 0, create() { this.n += 1; log.push(`create ${this.n}`); return `blob:${this.n}`; }, revoke: (url) => log.push(`revoke ${url}`) },
    synth: { makeUtterance: (text) => ({ text }), speak: (u) => log.push(`synth ${u.text}`), cancel: () => log.push("cancel"), pause: () => log.push("synth pause"), resume: () => log.push("synth resume") },
  };
  return env;
}

test("speech: plays ElevenLabs audio, caches it, pauses, resumes, and stops", async () => {
  const env = fakeEnv();
  const speech = createSpeechController({ ...env, cacheSize: 2 });
  const first = await speech.speak("Hello", { mode: "elevenlabs" });
  assert.equal(first.used, "elevenlabs");
  assert.equal(speech.getState().status, "playing");
  speech.pause();
  assert.equal(speech.getState().status, "paused");
  speech.resume();
  assert.equal(speech.getState().status, "playing");
  await speech.speak("Hello", { mode: "elevenlabs" });
  assert.equal(env.log.filter((l) => l === "fetch").length, 1, "repeat text is served from the cache");
  assert.equal(env.audios[0].paused, true, "the earlier audio stops before the next starts");
  speech.stop();
  assert.equal(speech.getState().status, "idle");
});

test("speech: evicted cache entries and disposal release blob URLs", async () => {
  const env = fakeEnv();
  const speech = createSpeechController({ ...env, cacheSize: 1 });
  await speech.speak("One", { mode: "elevenlabs" });
  await speech.speak("Two", { mode: "elevenlabs" });
  assert.ok(env.log.includes("revoke blob:1"));
  speech.dispose();
  assert.ok(env.log.includes("revoke blob:2"));
  assert.equal(speech.cacheSize(), 0);
});

test("speech: provider errors fall back to browser speech with a clear message", async () => {
  const env = fakeEnv({ fail: true });
  const speech = createSpeechController(env);
  const result = await speech.speak("Hello", { mode: "elevenlabs" });
  assert.equal(result.used, "browser");
  assert.match(speech.getState().message, /rejected the API key/);
  assert.ok(env.log.includes("synth Hello"));
});

test("wav: pcm audio is a readable RIFF file at the requested rate", () => {
  const bytes = encodeWav(downsample(Float32Array.from([0, 0.5, -0.5, 1]), 4, 2), 2);
  assert.equal(Buffer.from(bytes).toString("ascii", 0, 4), "RIFF");
  assert.equal(Buffer.from(bytes).toString("ascii", 8, 12), "WAVE");
  assert.equal(bytes.length, 44 + 2 * 2);
});

function fakeRecognizer(error) {
  return class {
    start() { this.onerror?.({ error }); this.onend?.(); }
    abort() {}
    stop() { this.onend?.(); }
  };
}

test("voice falls back to the computer when the browser speech service is missing", async () => {
  const heard = [];
  startListening({
    Speech: fakeRecognizer("network"),
    record: () => ({ done: Promise.resolve(new Uint8Array([1])), stop() {} }),
    transcribe: async () => ({ transcript: "smaller" }),
    onResult: (text) => heard.push(text),
    onError: (message) => heard.push(`err ${message}`),
    onEnd: () => heard.push("end"),
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(heard, ["smaller", "end"]);
});

test("voice does not record when the microphone is blocked", async () => {
  let recorded = false;
  const heard = [];
  startListening({
    Speech: fakeRecognizer("not-allowed"),
    record: () => { recorded = true; return { done: new Promise(() => {}), stop() {} }; },
    transcribe: async () => ({ transcript: "smaller" }),
    onError: (message) => heard.push(message),
    onEnd: () => heard.push("end"),
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(recorded, false);
  assert.match(heard[0], /Microphone permission was blocked/);
  assert.equal(heard.at(-1), "end");
});

test("speech: off mode does nothing, and a newer request cancels a pending one", async () => {
  const env = fakeEnv();
  const speech = createSpeechController(env);
  assert.equal((await speech.speak("Hi", { mode: "off" })).skipped, true);
  const slow = speech.speak("First", { mode: "elevenlabs" });
  speech.stop();
  assert.equal((await slow).cancelled, true);
  assert.equal(env.audios.length, 0);
});
