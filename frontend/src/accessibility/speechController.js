// One read-aloud player for the whole app, so two voices never overlap.
// Dependencies are passed in so the logic can be tested without a browser.
export function createSpeechController({ fetchAudio, makeAudio, synth, urls, cacheSize = 8 }) {
  let state = { status: "idle", source: null, message: "" };
  let audio = null;
  let token = 0;
  const listeners = new Set();
  const cache = new Map();

  function set(next) {
    state = { ...state, ...next };
    listeners.forEach((fn) => fn(state));
  }

  function remember(key, url) {
    cache.set(key, url);
    while (cache.size > cacheSize) {
      const [oldKey, oldUrl] = cache.entries().next().value;
      cache.delete(oldKey);
      urls.revoke(oldUrl);
    }
  }

  function halt() {
    token += 1;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio = null;
    }
    synth?.cancel();
  }

  function browserSpeak(text, warning = "") {
    if (!synth || !synth.makeUtterance) {
      set({ status: "error", source: null, message: "This browser cannot speak text. You can still read it on screen." });
      return { ok: false };
    }
    const mine = token;
    const utterance = synth.makeUtterance(text);
    utterance.onend = () => { if (mine === token) set({ status: "idle", source: null }); };
    utterance.onerror = () => { if (mine === token) set({ status: "idle", source: null }); };
    set({ status: "playing", source: "browser", message: warning });
    synth.speak(utterance);
    return { ok: true, used: "browser", warning };
  }

  async function speak(text, { mode = "browser", voiceId = "", owner = null } = {}) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    halt();
    set({ owner });
    if (!clean || mode === "off") {
      set({ status: "idle", source: null, message: "" });
      return { ok: false, skipped: true };
    }
    if (mode !== "elevenlabs") return browserSpeak(clean);

    const mine = token;
    const key = `${voiceId}\n${clean}`;
    let url = cache.get(key);
    if (!url) {
      set({ status: "loading", source: "elevenlabs", message: "" });
      const result = await fetchAudio(clean, voiceId);
      if (mine !== token) return { ok: false, cancelled: true };
      if (!result.ok) return browserSpeak(clean, `${result.error} Using browser speech instead.`);
      url = urls.create(result.blob);
      remember(key, url);
    }

    audio = makeAudio(url);
    audio.onended = () => { if (mine === token) { audio = null; set({ status: "idle", source: null }); } };
    audio.onerror = () => {
      if (mine !== token) return;
      const failed = audio;
      audio = null;
      try { failed.pause(); } catch { /* already stopped */ }
      browserSpeak(clean, "The audio could not play. Using browser speech instead.");
    };
    try {
      await audio.play();
      if (mine !== token) return { ok: false, cancelled: true };
      set({ status: "playing", source: "elevenlabs", message: "" });
      return { ok: true, used: "elevenlabs" };
    } catch {
      if (mine !== token) return { ok: false, cancelled: true };
      audio = null;
      return browserSpeak(clean, "The browser blocked audio playback. Using browser speech instead.");
    }
  }

  function pause() {
    if (state.status !== "playing") return;
    if (audio) audio.pause();
    else synth?.pause();
    set({ status: "paused" });
  }

  function resume() {
    if (state.status !== "paused") return;
    if (audio) audio.play().catch(() => {});
    else synth?.resume();
    set({ status: "playing" });
  }

  function stop() {
    halt();
    set({ status: "idle", source: null, message: "" });
  }

  function dispose() {
    stop();
    cache.forEach((url) => urls.revoke(url));
    cache.clear();
  }

  return {
    speak,
    pause,
    resume,
    stop,
    dispose,
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    cacheSize: () => cache.size,
  };
}
