import { useCallback, useEffect, useRef, useState } from "react";
import * as iaApi from "../../api/iaService";
import { useNotificationStore } from "../../notifications/notificationStore";
import { DEFAULT_CONFIG } from "./configDefaults";
import { readIaConfigCache, writeIaConfigCache } from "./configNormalization";
import { loadIaConfig, updateIaConfigResource } from "./configResource";

export function useIaConfigSection(section, companyKey) {
  const generationRef = useRef(0);
  const showToast = useNotificationStore((state) => state.showToast);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError("");
    try {
      const merged = await loadIaConfig(companyKey);
      if (generation !== generationRef.current) return;
      setConfig(merged[section] || DEFAULT_CONFIG[section]);
      writeIaConfigCache(companyKey, merged);
    } catch (err) {
      if (generation !== generationRef.current) return;
      const cached = readIaConfigCache(companyKey);
      setConfig(cached?.[section] || DEFAULT_CONFIG[section]);
      setError(err?.response?.data?.error || "Não foi possível carregar configurações. Tente novamente.");
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [companyKey, section]);

  useEffect(() => {
    load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  const save = useCallback(async (values) => {
    setSaving(true);
    setError("");
    try {
      const raw = await iaApi.putConfig({ [section]: values });
      const merged = updateIaConfigResource(companyKey, raw);
      writeIaConfigCache(companyKey, merged);
      setConfig(merged[section] || DEFAULT_CONFIG[section]);
      showToast({ type: "success", title: "Salvo", message: "Configuração salva com sucesso." });
      return merged;
    } catch (err) {
      setError(err?.response?.data?.error || "Erro ao salvar. Verifique se a migration foi executada no banco.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [companyKey, section, showToast]);

  return { config, loading, saving, error, reload: load, save };
}
