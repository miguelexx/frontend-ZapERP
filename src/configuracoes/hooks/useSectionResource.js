import { useCallback, useEffect, useRef, useState } from "react";

export function useSectionResource(load, initialValue, errorMessage) {
  const mountedRef = useRef(false);
  const requestRef = useRef(0);
  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await load();
      if (mountedRef.current && requestId === requestRef.current) {
        setData(next);
      }
      return next;
    } catch (cause) {
      if (mountedRef.current && requestId === requestRef.current) {
        setError(cause?.response?.data?.error || errorMessage);
      }
      throw cause;
    } finally {
      if (mountedRef.current && requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [errorMessage, load]);

  useEffect(() => {
    mountedRef.current = true;
    reload().catch(() => {});
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [reload]);

  return { data, setData, loading, error, reload };
}
