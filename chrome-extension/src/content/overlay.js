(() => {
if (document.getElementById('doorway-overlay-root')) return;

const root = document.createElement('div');
root.id = 'doorway-overlay-root';
const shadow = root.attachShadow({ mode: 'open' });
document.documentElement.appendChild(root);

const style = document.createElement('style');
style.textContent = `
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483646;
    --surface: #fffdfb;
    --accent: #ff6d3d;
    --text: #211c19;
    --muted: #786e67;
  }
  .card {
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: 280px;
    box-sizing: border-box;
    background: var(--surface);
    color: var(--text);
    border: 1px solid #f2b39c;
    border-radius: 18px;
    padding: 16px;
    z-index: 2147483646;
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    box-shadow: 0 12px 32px rgba(42, 29, 20, 0.2);
  }
  .row { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
  p { margin: 0 0 10px; }
  .close, .text-btn, .chip, .primary {
    font: inherit;
    cursor: pointer;
    border-radius: 8px;
    pointer-events: auto;
  }
  .close {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
  }
  .chips { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
  .chip, .text-btn, .primary {
    border: 1px solid #e8ddd4;
    background: transparent;
    color: var(--text);
    text-align: left;
    padding: 8px 10px;
  }
  .primary { background: var(--accent); color: var(--text); border: 0; text-align: center; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .timer { width: 168px; }
  .clock { font-size: 28px; letter-spacing: 0.04em; margin: 4px 0 10px; }
  .tone { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); margin-top: 8px; }
`;
shadow.appendChild(style);

let hideTimer = 0;
let node = null;

function clearNode() {
  clearTimeout(hideTimer);
  if (node) node.remove();
  node = null;
}

function tracked(message) {
  return message.kind !== 'soft' && message.kind !== 'ready';
}

function report(action, message) {
  if (!tracked(message)) return;
  chrome.runtime.sendMessage({
    type: 'doorway:nudgeResponse',
    action,
    level: message.level,
    state: message.state,
    kind: message.kind,
  });
}

function finish(action, message) {
  report(action, message);
  clearNode();
}

function startChoice(message, choice) {
  report('accepted', message);
  clearNode();
  if (!choice) return;
  chrome.runtime.sendMessage({ type: 'doorway:startFromNudge', choice }, (result) => {
    if (!chrome.runtime.lastError && result?.ok) return;
    const notice = document.createElement('div');
    notice.className = 'card';
    notice.textContent = 'Could not open the focus session. Start the Doorway timer from the extension popup.';
    clearNode();
    node = notice;
    shadow.appendChild(notice);
    hideTimer = setTimeout(clearNode, 8000);
  });
}

function mount(element, message, ms, onTimeout) {
  clearNode();
  node = element;
  shadow.appendChild(element);
  const dismiss = () => finish('dismissed', message);
  element.querySelectorAll('[data-dismiss]').forEach((button) => button.addEventListener('click', dismiss));
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    document.removeEventListener('keydown', onKey, true);
    dismiss();
  };
  document.addEventListener('keydown', onKey, true);
  hideTimer = setTimeout(() => {
    document.removeEventListener('keydown', onKey, true);
    if (!node) return;
    onTimeout();
    clearNode();
  }, ms);
}

function card(message) {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  const payload = message.payload || {};
  const chips = Array.isArray(payload.chips) ? payload.chips.slice(0, 3) : [];
  wrap.innerHTML = `
    <div class="row">
      <p></p>
      <button class="close" type="button" data-dismiss aria-label="Dismiss">×</button>
    </div>
    <div class="chips"></div>
    <div class="actions"></div>
  `;
  wrap.querySelector('p').textContent = payload.text || payload.step || '';
  const chipBox = wrap.querySelector('.chips');
  const actions = wrap.querySelector('.actions');
  chips.forEach((choice) => {
    const button = document.createElement('button');
    button.className = 'chip';
    button.type = 'button';
    button.textContent = typeof choice === 'string' ? choice : choice.label;
    button.addEventListener('click', () => startChoice(message, typeof choice === 'string' ? { action: 'timer' } : choice));
    chipBox.appendChild(button);
  });
  if (message.kind === 'shrink') {
    const start = document.createElement('button');
    start.className = 'primary';
    start.type = 'button';
    start.textContent = 'Start this step';
    start.addEventListener('click', () => startChoice(message, payload.choice));
    const smaller = document.createElement('button');
    smaller.className = 'text-btn';
    smaller.type = 'button';
    smaller.textContent = 'Start a 2-minute timer';
    smaller.addEventListener('click', () => startChoice(message, { action: 'timer' }));
    actions.append(start, smaller);
  }
  if (message.kind === 'rest') {
    const reset = document.createElement('button');
    reset.className = 'primary';
    reset.type = 'button';
    reset.textContent = '5-minute reset';
    reset.addEventListener('click', () => finish('accepted', message));
    actions.append(reset);
  }
  if (message.kind === 'cowork') {
    const start = document.createElement('button');
    start.className = 'primary';
    start.type = 'button';
    start.textContent = 'Start';
    start.addEventListener('click', () => {
      report('accepted', message);
      coworkTimer();
    });
    const later = document.createElement('button');
    later.className = 'text-btn';
    later.type = 'button';
    later.dataset.dismiss = '1';
    later.textContent = 'Not now';
    actions.append(start, later);
  }
  if (message.kind === 'prompt' || message.kind === 'shrink' || message.kind === 'rest') {
    const later = document.createElement('button');
    later.className = 'text-btn';
    later.type = 'button';
    later.dataset.dismiss = '1';
    later.textContent = 'Not now';
    actions.append(later);
  }
  mount(wrap, message, 45000, () => report('ignored', message));
}

let toneContext = null;

function toneBlip() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  if (!toneContext) toneContext = new Ctx();
  const osc = toneContext.createOscillator();
  const gain = toneContext.createGain();
  osc.frequency.value = 392;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(toneContext.destination);
  osc.start();
  osc.stop(toneContext.currentTime + 0.08);
}

function coworkTimer() {
  clearNode();
  let remaining = 600;
  let paused = false;
  let tone = false;
  const wrap = document.createElement('div');
  wrap.className = 'card timer';
  const label = document.createElement('div');
  label.className = 'clock';
  const actions = document.createElement('div');
  actions.className = 'actions';
  const pause = document.createElement('button');
  pause.className = 'text-btn';
  pause.type = 'button';
  pause.textContent = 'Pause';
  const end = document.createElement('button');
  end.className = 'text-btn';
  end.type = 'button';
  end.textContent = 'End';
  const toneRow = document.createElement('label');
  toneRow.className = 'tone';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toneRow.append(toggle, document.createTextNode('Soft tone'));
  function paint() {
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    label.textContent = `${minutes}:${seconds}`;
  }
  function finishTimer(done) {
    clearInterval(timer);
    clearNode();
    if (!done) return;
    const note = document.createElement('div');
    note.className = 'card timer';
    const text = document.createElement('p');
    text.textContent = 'Nice. Take a breath, or keep going.';
    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '×';
    close.addEventListener('click', () => note.remove());
    note.append(close, text);
    node = note;
    shadow.appendChild(note);
  }
  paint();
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Resume' : 'Pause';
  });
  end.addEventListener('click', () => finishTimer(false));
  toggle.addEventListener('change', () => { tone = toggle.checked; });
  actions.append(pause, end);
  wrap.append(label, actions, toneRow);
  node = wrap;
  shadow.appendChild(wrap);
  const timer = setInterval(() => {
    if (paused) return;
    remaining -= 1;
    if (tone) toneBlip();
    paint();
    if (remaining <= 0) finishTimer(true);
  }, 1000);
}

function softBlock() {
  card({
    type: 'doorway:nudge',
    level: 1,
    kind: 'soft',
    state: 'ok',
    payload: { text: 'On a break, ready when you are' },
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'doorway:softBlock') {
    softBlock();
    return;
  }
  if (message?.type !== 'doorway:nudge') return;
  card(message);
});
})();
