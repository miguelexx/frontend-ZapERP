import { useCallback, useEffect, useRef, useState } from "react";
import * as iaApi from "../../api/iaService";
import { getDepartamentos, getTags } from "../../api/configService";
import { clearResource, loadResource } from "../shared/resourceCache";

const EMPTY_FORM = {
  palavra_chave: "",
  resposta: "",
  departamento_id: "",
  tag_id: "",
  aplicar_tag: false,
  horario_comercial_only: false,
};

export function useRespostasAutomaticas(companyKey) {
  const resourceKey = `ia:${companyKey}:respostas`;
  const generationRef = useRef(0);
  const [regras, setRegras] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [tags, setTags] = useState([]);
  const [formRegra, setFormRegra] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    setError("");
    try {
      const bundle = await loadResource(resourceKey, async () => {
        const [nextRegras, nextDepartamentos, nextTags] = await Promise.all([
          iaApi.getRegras(),
          getDepartamentos(),
          getTags(),
        ]);
        return { nextRegras, nextDepartamentos, nextTags };
      });
      if (generation !== generationRef.current) return;
      setRegras(bundle.nextRegras || []);
      setDepartamentos(bundle.nextDepartamentos || []);
      setTags(bundle.nextTags || []);
    } catch (err) {
      if (generation === generationRef.current) {
        setError(err?.response?.data?.error || "Não foi possível carregar as respostas automáticas.");
      }
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [resourceKey]);

  useEffect(() => {
    load();
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  const add = useCallback(async (event) => {
    event.preventDefault();
    if (!formRegra.palavra_chave?.trim() || !formRegra.resposta?.trim()) return;
    setError("");
    try {
      await iaApi.postRegra({
        palavra_chave: formRegra.palavra_chave.trim(),
        resposta: formRegra.resposta.trim(),
        departamento_id: formRegra.departamento_id || null,
        tag_id: formRegra.tag_id || null,
        aplicar_tag: formRegra.aplicar_tag,
        horario_comercial_only: formRegra.horario_comercial_only,
      });
      setFormRegra(EMPTY_FORM);
      clearResource(resourceKey);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível criar a resposta automática.");
    }
  }, [formRegra, load, resourceKey]);

  const remove = useCallback(async (id) => {
    if (!confirm("Excluir esta regra?")) return;
    setError("");
    try {
      await iaApi.deleteRegra(id);
      clearResource(resourceKey);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível excluir a resposta automática.");
    }
  }, [load, resourceKey]);

  return { regras, departamentos, tags, formRegra, setFormRegra, loading, error, reload: load, add, remove };
}
