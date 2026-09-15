import { useEffect, useState } from "react";

/** Keeps only the visual surface alive during exit; actions close immediately. */
export default function useMotionPresence(open) {
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRetained(false);
      return;
    }
    const timer = window.setTimeout(() => setRetained(false), 120);
    return () => window.clearTimeout(timer);
  }, [open]);
  return { present: open || retained, state: open ? "open" : "closing" };
}
