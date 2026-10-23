export function matchVoiceCommand(transcript) {
  const text = String(transcript || "").toLowerCase();
  if (/\bnot now\b/.test(text)) return "notnow";
  if (/\b(do it|start focus|mark done|complete)\b/.test(text)) {
    return /\b(mark done|complete)\b/.test(text) ? "complete" : "do";
  }
  if (/\bsmaller\b/.test(text)) return "smaller";
  if (/\b(change|another task)\b/.test(text)) return "change";
  if (/\brest\b/.test(text)) return "rest";
  return null;
}

export function startDictation({ onResult, onError, onEnd }) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    onError?.("Voice input is not available in this browser. Typing and buttons still work.");
    return null;
  }
  const recognition = new Speech();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    onResult?.(transcript);
  };
  recognition.onerror = (event) => {
    const blocked = event.error === "not-allowed" || event.error === "service-not-allowed";
    onError?.(blocked
      ? "Microphone permission was blocked. You can type or use the buttons."
      : "Voice input stopped. You can type or use the buttons.");
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
