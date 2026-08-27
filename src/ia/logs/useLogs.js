import { useCallback, useEffect, useRef, useState } from "react";
import * as iaApi from "../../api/iaService";
import { loadResource } from "../shared/resourceCache";

export function useLogs(companyKey) {
  const generationRef = useRef(0);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError("");
    try {
      const next = await loadResource(`ia:${companyKey}:logs`, () => iaApi.getLogs(50), { force });
      if (generation === generationRef.current) setLogs(next || []);
    } catch (err) {
      if (generation === generationRef.current) {
        setError(err?.response?.data?.error || "Não foi possível carregar os logs do bot.");
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [companyKey]);

  useEffect(() => {
    load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  return { logs, loading, error, reload: () => load(true) };
}
