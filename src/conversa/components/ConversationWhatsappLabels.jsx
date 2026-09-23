import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconRefresh, IconSearch, IconTag, IconX } from "@tabler/icons-react";
import {
  listarLabelsWhatsapp, listarAssociacoesLabelWhatsapp,
  associarLabelWhatsapp, desassociarLabelWhatsapp, WHAPI_LABEL_COLORS,
} from "../../api/whapiBusinessService";
import { useWhatsappLabelsStore } from "../../chats/whatsappLabelsStore";
import "./conversationWhatsappLabels.css";

// Keep phone and LID namespaces separate: the same digits may identify different people.
export function labelChatIdentity(value) {
  const raw = String(value?.chat_id ?? value?.id ?? value?.chat ?? value ?? "").trim().toLowerCase();
  if (/^lid:\d+$/.test(raw)) return `${raw.slice(4)}@lid`;
  if (/^\d+@lid$/.test(raw)) return raw;
  if (raw.includes("@") && !/@(s\.whatsapp\.net|c\.us)$/.test(raw)) return "";
  const phone = raw.replace(/@(s\.whatsapp\.net|c\.us)$/, "");
  if (!/^[+\d\s().-]+$/.test(phone)) return "";
  let digits = phone.replace(/\D/g, "");
  // Match the provider's handling of locally stored Brazilian numbers.
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^\d{7,15}$/.test(digits) ? `${digits}@s.whatsapp.net` : "";
}

function colorFor(label) {
  return WHAPI_LABEL_COLORS.includes(label.color) ? label.color : "lightskyblue";
}

export default function ConversationWhatsappLabels({ conversaId, instanceId, chat, open, onClose, onOpen }) {
  const setConversationLabels = useWhatsappLabelsStore((s) => s.setConversationLabels);
  const [labels, setLabels] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [query, setQuery] = useState("");
  const controllerRef = useRef(null);
  const mutationRef = useRef(false);
  const aliveRef = useRef(true);
  const loadedOnceRef = useRef(false);
  const dialogRef = useRef(null);
  const chatId = labelChatIdentity(chat);

  const load = useCallback(async () => {
    if (mutationRef.current) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    if (!instanceId || !chatId) {
      setError("Não foi possível identificar o número de WhatsApp deste atendimento.");
      setLoading(false);
      return;
    }
    try {
      const options = { signal: controller.signal, silent: true };
      const list = await listarLabelsWhatsapp(instanceId, options);
      const valid = list.filter((label) => label?.id != null && label?.name);
      const associations = [];
      // Limit simultaneous provider requests, including for channels with many labels.
      for (let offset = 0; offset < valid.length; offset += 4) {
        if (controller.signal.aborted) return;
        const batch = await Promise.all(valid.slice(offset, offset + 4).map(async (label) => {
          const result = await listarAssociacoesLabelWhatsapp(instanceId, label.id, options);
          return result.chats.some((item) => labelChatIdentity(item) === chatId) ? String(label.id) : null;
        }));
        associations.push(...batch.filter((id) => id !== null));
      }
      if (controller.signal.aborted) return;
      setLabels(valid);
      setSelected(associations);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err?.response?.status === 501
        ? "As etiquetas do WhatsApp não estão disponíveis neste canal."
        : "Não foi possível carregar as etiquetas. Tente atualizar.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [instanceId, chatId]);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; loadedOnceRef.current = false; controllerRef.current?.abort(); };
  }, []);

  // Read again on opening so changes made in WhatsApp are reflected in the selector.
  useEffect(() => {
    if (!open && loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    load();
  }, [load, open]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const previous = document.activeElement;
    dialogRef.current?.querySelector("input")?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
      if (event.key === "Tab") {
        const items = [...(dialogRef.current?.querySelectorAll("button:not(:disabled), input") || [])];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onClose]);

  // Espelha as etiquetas aplicadas para o card da lista. Só escreve com dados autoritativos
  // (carregado, sem erro) — não apaga o card durante o carregamento ou numa falha de rede.
  useEffect(() => {
    if (loading || error || !conversaId) return;
    const applied = labels.filter((label) => selected.includes(String(label.id)));
    setConversationLabels(conversaId, applied);
  }, [labels, selected, loading, error, conversaId, setConversationLabels]);

  async function toggle(label) {
    if (mutationRef.current || loading || error || !instanceId || !chatId) return;
    mutationRef.current = true;
    const id = String(label.id);
    const wasSelected = selected.includes(id);
    setBusy(id);
    setMutationError("");
    try {
      const mutate = wasSelected ? desassociarLabelWhatsapp : associarLabelWhatsapp;
      await mutate(instanceId, label.id, chatId);
      if (!aliveRef.current) return;
      setSelected((current) => wasSelected ? current.filter((item) => item !== id) : [...new Set([...current, id])]);
    } catch {
      if (aliveRef.current) setMutationError("Não foi possível salvar a etiqueta. Tente novamente.");
    } finally {
      mutationRef.current = false;
      if (aliveRef.current) setBusy(null);
    }
  }

  const applied = labels.filter((label) => selected.includes(String(label.id)));
  const filtered = labels.filter((label) => label.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));
  return <>
    {applied.length > 0 && <div className="wa-whatsappLabels" aria-label="Etiquetas desta conversa" aria-live="polite">
      <IconTag size={14} aria-hidden="true" />
      {applied.map((label) => <button type="button" className="wa-whatsappLabel" key={label.id} onClick={onOpen} title={label.name}>
        <i style={{ background: colorFor(label) }} />{label.name}
      </button>)}
    </div>}
    {open && createPortal(<div className="wa-labelPicker-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="wa-labelPicker" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Etiquetas do WhatsApp">
        <header><span className="wa-labelPicker-icon"><IconTag size={23} /></span><div><h2>Etiquetas do WhatsApp</h2><p>Organize este cliente com as etiquetas do canal.</p></div><button type="button" className="wa-labelPicker-close" aria-label="Fechar etiquetas" onClick={onClose}><IconX size={20} /></button></header>
        <label className="wa-labelPicker-search"><IconSearch size={18} /><input aria-label="Buscar etiquetas" placeholder="Buscar etiqueta pelo nome" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="wa-labelPicker-summary"><span>{selected.length} selecionada{selected.length === 1 ? "" : "s"}</span><button type="button" onClick={load} disabled={loading || busy !== null}><IconRefresh size={15} /> Atualizar</button></div>
        {error && <div className="wa-labelPicker-error" role="alert">{error}</div>}
        {mutationError && <div className="wa-labelPicker-error" role="alert">{mutationError}</div>}
        <div className="wa-labelPicker-list" aria-busy={loading || busy !== null}>
          {loading ? <div className="wa-labelPicker-empty" role="status">Carregando etiquetas…</div> : !error && filtered.length === 0 ? <div className="wa-labelPicker-empty">{query ? "Nenhuma etiqueta encontrada." : "Nenhuma etiqueta cadastrada neste WhatsApp."}</div> : !error && filtered.map((label) => {
            const active = selected.includes(String(label.id));
            return <button type="button" key={label.id} className={`wa-labelPicker-option${active ? " is-selected" : ""}`} aria-pressed={active} disabled={busy !== null} onClick={() => toggle(label)}>
              <span className="wa-labelPicker-dot" style={{ background: colorFor(label) }} /><span>{label.name}</span><span className="wa-labelPicker-check">{busy === String(label.id) ? <span className="wa-labelPicker-spinner" /> : active ? <IconCheck size={16} /> : null}</span>
            </button>;
          })}
        </div>
        <footer><span>As alterações são salvas no WhatsApp.</span><button type="button" onClick={onClose}>Concluir</button></footer>
      </section>
    </div>, document.body)}
  </>;
}
