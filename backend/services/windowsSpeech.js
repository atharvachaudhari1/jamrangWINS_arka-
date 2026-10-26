const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SCRIPT = path.join(__dirname, 'transcribe.ps1');

class TranscribeError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function parseOutput(stdout) {
  const line = String(stdout || '').split(/\r?\n/).map((row) => row.trim()).filter(Boolean).pop() || '';
  if (line === 'NONE' || !line) return { text: '', confidence: 0 };
  if (line.startsWith('ERROR')) {
    if (line.includes('no-recognizer')) {
      throw new TranscribeError('no-recognizer', 'Windows speech recognition is not installed. Add English (United States) in Windows speech settings, or open Doorway in Chrome or Edge.');
    }
    throw new TranscribeError('recognizer', 'Voice recognition on this computer did not start. You can still use the buttons.');
  }
  const [tag, confidence, ...rest] = line.split('\t');
  if (tag !== 'OK') throw new TranscribeError('recognizer', 'Voice recognition on this computer did not start. You can still use the buttons.');
  return { text: rest.join('\t').trim(), confidence: Number(confidence) || 0 };
}

// Recognises one short recording with the Windows speech engine, then deletes it.
// `run` is injectable so tests never start PowerShell.
function transcribeWav(buffer, { run, timeoutMs = 15000 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new TranscribeError('bad-audio', 'That recording could not be read. Press the microphone and try again.', 400);
  }
  if (buffer.length > 600 * 1024) {
    throw new TranscribeError('too-large', 'That recording is too long. Say one short command.', 400);
  }
  if (process.platform !== 'win32' && !run) {
    throw new TranscribeError('unsupported', 'This browser cannot use its own speech service, and Doorway is not running on Windows. Open Doorway in Chrome or Edge to use voice commands.');
  }

  const file = path.join(os.tmpdir(), `doorway-voice-${crypto.randomBytes(8).toString('hex')}.wav`);
  fs.writeFileSync(file, buffer);
  const invoke = run || ((wavPath) => runPowerShell(wavPath, timeoutMs));
  return Promise.resolve()
    .then(() => invoke(file))
    .then(parseOutput)
    .finally(() => { try { fs.unlinkSync(file); } catch { /* already gone */ } });
}

function runPowerShell(wavPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', SCRIPT, '-Path', wavPath,
    ], { windowsHide: true });
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new TranscribeError('timeout', 'Voice recognition took too long. Press the microphone and try a shorter phrase.'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new TranscribeError('recognizer', 'Voice recognition on this computer did not start. You can still use the buttons.'));
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(stdout);
    });
  });
}

module.exports = { transcribeWav, parseOutput, TranscribeError };
