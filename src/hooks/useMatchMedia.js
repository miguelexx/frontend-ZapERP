import { useEffect, useState } from "react";

/**
 * Subscreve a window.matchMedia (ex.: breakpoint mobile).
 * SSR-safe: assume false até montar no cliente.
 */
export function useMatchMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
