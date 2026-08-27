import { useCallback, useEffect, useRef, useState } from "react";
import { getDepartamentos } from "../../api/configService";
import * as iaApi from "../../api/iaService";
import { loadResource } from "../shared/resourceCache";

export function useTriagemAuxData(companyKey) {
  const generationRef = useRef(0);
  const [departamentos, setDepartamentos] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async () => {
    const generation = ++generationRef.current;
    try {
      const next = await loadResource(`ia:${companyKey}:logs`, () => iaApi.getLogs(50), { force: true });
      if (generation === generationRef.current) setLogs(next || []);
    } catch (err) {
      if (generation === generationRef.current) {
        setError(err?.response?.data?.error || "Não foi possível carregar os logs recentes.");
      }
    }
  }, [companyKey]);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError("");
    const [departamentosResult, logsResult] = await Promise.allSettled([
      loadResource(`ia:${companyKey}:departamentos`, getDepartamentos),
      loadResource(`ia:${companyKey}:logs`, () => iaApi.getLogs(50)),
    ]);
    if (generation !== generationRef.current) return;
    if (departamentosResult.status === "fulfilled") setDepartamentos(departamentosResult.value || []);
    else setError(departamentosResult.reason?.response?.data?.error || "Não foi possível carregar os departamentos.");
    if (logsResult.status === "fulfilled") setLogs(logsResult.value || []);
    else setError((current) => current || logsResult.reason?.response?.data?.error || "Não foi possível carregar os logs recentes.");
    setLoading(false);
  }, [companyKey]);

  useEffect(() => {
    load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  return { departamentos, logs, loading, error, reload: load, reloadLogs: loadLogs };
}
