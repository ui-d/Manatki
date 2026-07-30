import { useEffect, useState } from "react";

const formatElapsed = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const s = String(total % 60).padStart(2, "0");
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

/** Elapsed-time pill: T shows it and starts counting, T again hides and
 * resets it. Renders mm:ss, growing to h:mm:ss past the hour. */
export default function PresenterTimer({ on }: { on: boolean }) {
  const [text, setText] = useState("0:00");

  useEffect(() => {
    if (!on) return;
    const startedAt = Date.now();
    setText("0:00");
    const tick = setInterval(() => {
      setText(formatElapsed(Date.now() - startedAt));
    }, 1000);
    return () => clearInterval(tick);
  }, [on]);

  return <div className={`pr-timer${on ? " show" : ""}`}>{text}</div>;
}
