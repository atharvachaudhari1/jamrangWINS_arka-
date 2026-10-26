import { concatFloats, downsample, encodeWav } from "./wav";

const TARGET_RATE = 16000;

// Records one short phrase and returns a WAV blob. The microphone is released
// when recording ends, including when the caller stops it.
export function recordWav({ maxMs = 7000, silenceMs = 1100, threshold = 0.02 } = {}) {
  let cancelled = false;
  let finish = () => { cancelled = true; };
  const done = new Promise((resolve, reject) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      reject(Object.assign(new Error("This browser cannot use a microphone. You can still use the buttons."), { code: "unsupported" }));
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          reject(Object.assign(new Error("stopped"), { code: "aborted" }));
          return;
        }
        const ctx = new AudioContext();
        ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        const silent = ctx.createGain();
        silent.gain.value = 0;
        source.connect(processor);
        processor.connect(silent);
        silent.connect(ctx.destination);

        const chunks = [];
        let heard = false;
        let quietFor = 0;
        let settled = false;
        const started = performance.now();

        const watchdog = setTimeout(() => release(), maxMs + 800);
        function release(error) {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          processor.onaudioprocess = null;
          try { processor.disconnect(); source.disconnect(); silent.disconnect(); } catch { /* already stopped */ }
          stream.getTracks().forEach((track) => track.stop());
          ctx.close().catch(() => {});
          if (error) reject(error);
          else if (!heard) reject(Object.assign(new Error("No speech was heard. Press the microphone and try again."), { code: "no-speech" }));
          else {
            const pcm = downsample(concatFloats(chunks), ctx.sampleRate, TARGET_RATE);
            const bytes = encodeWav(pcm, TARGET_RATE);
            resolve(new Blob([bytes], { type: "audio/wav" }));
          }
        }

        finish = () => release();
        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);
          chunks.push(new Float32Array(input));
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          const rms = Math.sqrt(sum / input.length);
          if (rms >= threshold) {
            heard = true;
            quietFor = 0;
          } else if (heard) {
            quietFor += (input.length / ctx.sampleRate) * 1000;
          }
          if ((heard && quietFor >= silenceMs) || performance.now() - started >= maxMs) release();
        };
      })
      .catch((err) => {
        const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
        reject(Object.assign(new Error(denied
          ? "Microphone permission was blocked. Allow the microphone for this site, or use the buttons."
          : "No microphone was found. The buttons still work."), { code: denied ? "not-allowed" : "no-mic" }));
      });
  });
  return { done, stop: () => finish() };
}
