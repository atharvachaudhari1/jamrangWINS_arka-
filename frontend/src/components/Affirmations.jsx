import { forwardRef, useImperativeHandle, useState } from "react";

const messages = {
  "tab-change": "Noticed a tab switch — one slow breath, then come back. You’ve got this.",
  "day-start": "Good morning — pick 2 focus tasks and start small.",
  "day-end": "You did a lot today. Note one small win — celebrate it.",
  "task-complete": "Nice work! Fist bump 👊 — celebrate briefly, then keep going.",
  "task-incomplete": "It’s fine. Break it down smaller and try again.",
};

const Affirmations = forwardRef((props, ref) => {
  const [msg, setMsg] = useState("Ready when you are.");

  useImperativeHandle(ref, () => ({
    random() {
      const arr = Object.values(messages);
      const m = arr[Math.floor(Math.random() * arr.length)];
      setMsg(m);
      return m;
    },
    messageForContext(ctx) {
      const m = messages[ctx] || this.random();
      setMsg(m);
      return m;
    },
  }));

  return <div className="affirmation-card">{msg}</div>;
});

export default Affirmations;
