import { useEffect, useRef, useState } from "react";

/** Rotating gradient marble shown while a run is thinking. */
export function Orb({ small }: { small?: boolean }) {
  return <span className={small ? "orb orb-sm" : "orb"} aria-hidden />;
}

/** Three-dot typing wave. */
export function Dots() {
  return (
    <span className="dot-wave" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/** Number that eases to its target instead of jumping. */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const dur = 420;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
