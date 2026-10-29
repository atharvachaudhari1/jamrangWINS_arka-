let currentAudio;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'doorway:playNudgeAudio' || typeof message.audio !== 'string') return;
  currentAudio?.pause();
  const bytes = Uint8Array.from(atob(message.audio), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  const audio = new Audio(url);
  currentAudio = audio;
  const clean = () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  };
  audio.addEventListener('ended', clean, { once: true });
  audio.addEventListener('error', clean, { once: true });
  audio.play().then(() => sendResponse({ ok: true })).catch(() => {
    clean();
    sendResponse({ ok: false });
  });
  return true;
});
