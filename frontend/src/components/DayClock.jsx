import { useRef } from "react";

const CX = 180;
const CY = 180;
const ARC_R = 118;
const MIN_SPAN = 15;
const MAX_SPAN = 720;
const STEP = 5;

const MARKS = [
  [0, "12AM", true],
  [120, "2", false],
  [240, "4", false],
  [360, "6AM", true],
  [480, "8", false],
  [600, "10", false],
  [720, "12PM", true],
  [840, "2", false],
  [960, "4", false],
  [1080, "6PM", true],
  [1200, "8", false],
  [1320, "10", false],
];

export function clockwise(from, to) {
  return (to - from + 1440) % 1440;
}

export function formatClock(mins) {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const h12 = h24 % 12 || 12;
  const suffix = h24 < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatSpan(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h === 1) return "1 hr";
  if (h) return `${h} hr`;
  return `${m} min`;
}

function snap(mins) {
  const rounded = Math.round(mins / STEP) * STEP;
  return ((rounded % 1440) + 1440) % 1440;
}

function point(mins, radius) {
  const angle = (mins / 1440) * Math.PI * 2 - Math.PI / 2;
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function minutesFromPointer(event, svg) {
  const rect = svg.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  let fromTop = Math.atan2(dy, dx) + Math.PI / 2;
  if (fromTop < 0) fromTop += Math.PI * 2;
  return snap((fromTop / (Math.PI * 2)) * 1440);
}

function nearerBound(dist, minSpan, maxSpan) {
  if (dist >= minSpan && dist <= maxSpan) return dist;
  if (dist < minSpan) return minSpan;
  const pastMax = dist - maxSpan;
  const beforeMin = 1440 - dist;
  return pastMax <= beforeMin ? maxSpan : minSpan;
}

function clampEnd(start, raw, minSpan, maxSpan) {
  return (start + nearerBound(clockwise(start, raw), minSpan, maxSpan)) % 1440;
}

function clampStart(end, raw, minSpan, maxSpan) {
  return (end - nearerBound(clockwise(raw, end), minSpan, maxSpan) + 1440) % 1440;
}

function arcPath(start, end) {
  const dist = clockwise(start, end);
  const [x1, y1] = point(start, ARC_R);
  const [x2, y2] = point(end, ARC_R);
  const large = dist > 720 ? 1 : 0;
  return `M ${x1} ${y1} A ${ARC_R} ${ARC_R} 0 ${large} 1 ${x2} ${y2}`;
}

function ticks(start, end) {
  const dist = clockwise(start, end);
  if (dist < 20) return null;
  const lines = [];
  const stepSize = dist < 90 ? 5 : 15;
  for (let step = stepSize; step < dist; step += stepSize) {
    const mins = (start + step) % 1440;
    const [x1, y1] = point(mins, ARC_R - 9);
    const [x2, y2] = point(mins, ARC_R + 9);
    lines.push(<line key={step} x1={x1} y1={y1} x2={x2} y2={y2} className="day-clock-tick" />);
  }
  return lines;
}

function Handle({ which, mins, label, icon, locked }) {
  const [x, y] = point(mins, ARC_R);
  return (
    <g
      className="day-clock-handle"
      data-handle={which}
      tabIndex={locked ? -1 : 0}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1435}
      aria-valuenow={mins}
      aria-valuetext={formatClock(mins)}
    >
      <circle cx={x} cy={y} r={16} />
      <g transform={`translate(${x - 8} ${y - 8})`} aria-hidden="true">
        {icon}
      </g>
    </g>
  );
}

const bookIcon = (
  <path d="M1.5 3.2h5.2v9.6H1.5zM9.3 3.2H14.5v9.6H9.3zM6.7 3.2v9.6" fill="none" stroke="#1c1c1e" strokeWidth="1.4" strokeLinejoin="round" />
);

const flagIcon = (
  <path d="M3.2 2.4v11.2M3.2 3.2h9.2L10 6.2l2.4 3H3.2" fill="none" stroke="#1c1c1e" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
);

export default function DayClock({
  startMinutes,
  endMinutes,
  onChange,
  startLabel = "Study start",
  endLabel = "Study end",
  caption = "Study window",
  minSpan = MIN_SPAN,
  maxSpan = MAX_SPAN,
  locked = false,
}) {
  const svgRef = useRef(null);
  const drag = useRef(null);

  function apply(which, raw) {
    if (locked) return;
    if (which === "end") onChange({ startMinutes, endMinutes: clampEnd(startMinutes, raw, minSpan, maxSpan) });
    else onChange({ startMinutes: clampStart(endMinutes, raw, minSpan, maxSpan), endMinutes });
  }

  function onPointerDown(event) {
    if (locked) return;
    const handle = event.target?.closest?.("[data-handle]");
    const which = handle?.dataset.handle;
    if (!which || !svgRef.current) return;
    drag.current = which;
    svgRef.current.setPointerCapture(event.pointerId);
    handle.focus?.();
  }

  function onPointerMove(event) {
    if (!drag.current || !svgRef.current) return;
    apply(drag.current, minutesFromPointer(event, svgRef.current));
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(event) {
    if (locked) return;
    const which = event.target?.dataset?.handle;
    if (!which) return;
    const dir = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const current = which === "end" ? endMinutes : startMinutes;
    const step = event.shiftKey ? 30 : STEP;
    apply(which, snap(current + dir * step));
  }

  const span = clockwise(startMinutes, endMinutes) || minSpan;

  return (
    <svg
      ref={svgRef}
      className={`day-clock${locked ? " is-locked" : ""}`}
      viewBox="0 0 360 360"
      role="group"
      aria-label={`${caption}, ${formatClock(startMinutes)} to ${formatClock(endMinutes)}, ${formatSpan(span)}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <circle className="day-clock-face" cx={CX} cy={CY} r={168} />
      <circle className="day-clock-track" cx={CX} cy={CY} r={ARC_R} />
      {Array.from({ length: 24 }, (_, hour) => {
        const [x1, y1] = point(hour * 60, ARC_R - 16);
        const [x2, y2] = point(hour * 60, hour % 2 === 0 ? ARC_R - 24 : ARC_R - 20);
        return <line key={hour} className="day-clock-hour" x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      <path className="day-clock-arc" d={arcPath(startMinutes, endMinutes)} />
      {ticks(startMinutes, endMinutes)}
      {MARKS.map(([mins, label, strong]) => {
        const [x, y] = point(mins, 146);
        return (
          <text key={mins} className={strong ? "day-clock-label is-strong" : "day-clock-label"} x={x} y={y}>
            {label}
          </text>
        );
      })}
      <g className="day-clock-moon" transform="translate(168 78)" aria-hidden="true">
        <path d="M12 2.2a8.2 8.2 0 1 0 7.4 12.2 6.6 6.6 0 1 1-7.4-12.2z" />
      </g>
      <g className="day-clock-sun" transform="translate(168 248)" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <line key={i} x1={12 + Math.cos(a) * 6.4} y1={12 + Math.sin(a) * 6.4} x2={12 + Math.cos(a) * 8.4} y2={12 + Math.sin(a) * 8.4} />;
        })}
      </g>
      <Handle which="start" mins={startMinutes} label={startLabel} icon={bookIcon} locked={locked} />
      <Handle which="end" mins={endMinutes} label={endLabel} icon={flagIcon} locked={locked} />
    </svg>
  );
}
