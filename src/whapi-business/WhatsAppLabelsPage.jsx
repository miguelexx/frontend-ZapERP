import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconHash,
  IconLink,
  IconMessageCircle,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTag,
  IconTags,
  IconTrash,
  IconUnlink,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import {
  WHAPI_LABEL_COLORS,
  apiErrorMessage,
  associarLabelWhatsapp,
  criarLabelWhatsapp,
  desassociarLabelWhatsapp,
  excluirLabelWhatsapp,
  listarAssociacoesLabelWhatsapp,
  listarLabelsWhatsapp,
  renomearLabelWhatsapp,
} from "../api/whapiBusinessService";
import { useAuthStore } from "../auth/authStore";
import { useNotificationStore } from "../notifications/notificationStore";

const COLOR_NAMES = {
  salmon: "Salmão",
  lightskyblue: "Azul céu",
  gold: "Dourado",
  plum: "Ameixa",
  silver: "Prata",
  mediumturquoise: "Turquesa",
  violet: "Violeta",
  goldenrod: "Ocre",
  cornflowerblue: "Azul centáurea",
  greenyellow: "Verde lima",
  cyan: "Ciano",
  lightpink: "Rosa claro",
  mediumaquamarine: "Água-marinha",
  orangered: "Vermelho laranja",
  deepskyblue: "Azul intenso",
  limegreen: "Verde",
  darkorange: "Laranja",
  lightsteelblue: "Azul aço",
  mediumpurple: "Roxo médio",
  rebeccapurple: "Roxo escuro",
};

function roleOf(user) {
  return String(user?.perfil || user?.role || "").trim().toLowerCase();
}

function chatIdentity(chat) {
  if (typeof chat === "string") return chat;
  return String(chat?.id || chat?.chat_id || chat?.phone || "").trim();
}

function chatName(chat) {
  if (typeof chat === "string") return chat.split("@")[0];
  return String(chat?.name || chat?.contact_name || chat?.pushname || chat?.phone || chat?.id || "Chat");
}

function LabelDot({ color, className = "" }) {
  return <span className={`wb-label-dot wb-label-dot--${color || "silver"}${className ? ` ${className}` : ""}`} aria-hidden="true" />;
}

function EmptyWhapiState({ loading }) {
  return (
    <div className="wb-empty-state">
      <span className="wb-empty-state__icon"><IconTags size={30} /></span>
      <h2>{loading ? "Buscando seus canais…" : "Conecte um canal Whapi"}</h2>
      <p>{loading ? "Isso leva apenas alguns segundos." : "Os labels oficiais ficam disponíveis assim que uma instância Whapi é cadastrada."}</p>
      {!loading ? <a href="/configuracoes?tab=whapi">Configurar Whapi</a> : null}
    </div>
  );
}

function LabelModal({ mode, label, busy, onClose, onSubmit }) {
  const isEdit = mode === "edit";
  const [name, setName] = useState(isEdit ? label?.name || "" : "");
  const [id, setId] = useState("");
  const [color, setColor] = useState(isEdit ? label?.color || "salmon" : "salmon");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return setError("Dê um nome para o label.");
    if (!isEdit && id && !/^\d{1,2}$/.test(id)) return setError("O ID deve ter 1 ou 2 dígitos.");
    setError("");
    onSubmit({ name: cleanName, id: id.trim(), color });
  }

  return (
    <div className="wb-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="wb-modal" role="dialog" aria-modal="true" aria-labelledby="wb-label-modal-title">
        <div className="wb-modal__header">
          <div>
            <span className="wb-section-kicker">{isEdit ? "Editar label" : "Novo label"}</span>
            <h2 id="wb-label-modal-title">{isEdit ? "Renomear label" : "Criar no WhatsApp"}</h2>
          </div>
          <button type="button" className="wb-icon-button" onClick={onClose} disabled={busy} aria-label="Fechar"><IconX size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <label className="wb-field wb-field--full">
            <span><IconTag size={16} /> Nome</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Cliente VIP" disabled={busy} />
          </label>

          {!isEdit ? (
            <label className="wb-field wb-field--full">
              <span><IconHash size={16} /> ID personalizado <em>opcional</em></span>
              <input inputMode="numeric" maxLength={2} value={id} onChange={(event) => setId(event.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Automático" disabled={busy} />
              <small>Deixe vazio para o WhatsApp atribuir o próximo ID.</small>
            </label>
          ) : null}

          {!isEdit ? (
            <fieldset className="wb-color-fieldset">
              <legend>Cor oficial</legend>
              <div className="wb-color-grid">
                {WHAPI_LABEL_COLORS.map((item) => (
                  <label key={item} title={COLOR_NAMES[item]}>
                    <input type="radio" name="label-color" value={item} checked={color === item} onChange={() => setColor(item)} disabled={busy} />
                    <span className={`wb-color-swatch wb-label-dot--${item}`}><IconCheck size={14} /></span>
                  </label>
                ))}
              </div>
              <small>{COLOR_NAMES[color]}</small>
            </fieldset>
          ) : (
            <div className="wb-current-color"><LabelDot color={color} /><span>A cor é mantida pelo WhatsApp ao renomear.</span></div>
          )}

          {error ? <div className="wb-inline-alert wb-inline-alert--error" role="alert">{error}</div> : null}
          <div className="wb-modal__actions">
            <button type="button" className="wb-secondary-button" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="wb-primary-button" disabled={busy}>
              {busy ? <span className="wb-button-spinner" /> : isEdit ? <IconPencil size={17} /> : <IconPlus size={17} />}
              {busy ? "Salvando…" : isEdit ? "Salvar nome" : "Criar label"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ label, busy, onClose, onConfirm }) {
  return (
    <div className="wb-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="wb-modal wb-modal--small" role="alertdialog" aria-modal="true" aria-labelledby="wb-delete-title">
        <span className="wb-danger-icon"><IconAlertTriangle size={23} /></span>
        <h2 id="wb-delete-title">Excluir “{label.name}”?</h2>
        <p>O label será apagado do WhatsApp Business deste canal. Esta ação não pode ser desfeita.</p>
        <div className="wb-modal__actions">
          <button type="button" className="wb-secondary-button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="wb-danger-button" onClick={onConfirm} disabled={busy}>
            {busy ? <span className="wb-button-spinner" /> : <IconTrash size={17} />}
            {busy ? "Excluindo…" : "Excluir label"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppLabelsPage() {
  const { selectedId, loadingInstances } = useOutletContext();
  const user = useAuthStore((state) => state.user);
  const showToast = useNotificationStore((state) => state.showToast);
  const isAdmin = roleOf(user) === "admin";
  const [labels, setLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [deleteLabel, setDeleteLabel] = useState(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [associations, setAssociations] = useState({ chats: [], messages: [] });
  const [associationsLoading, setAssociationsLoading] = useState(false);
  const [associationError, setAssociationError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [associationBusy, setAssociationBusy] = useState("");

  const selectedLabel = labels.find((label) => String(label.id) === String(selectedLabelId)) || null;
  const filteredLabels = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return labels;
    return labels.filter((label) => String(label.name || "").toLocaleLowerCase("pt-BR").includes(query) || String(label.id) === query);
  }, [labels, search]);
  const totalAssociations = useMemo(() => labels.reduce((sum, label) => sum + (Number(label.count) || 0), 0), [labels]);
  const colorCount = useMemo(() => new Set(labels.map((label) => label.color).filter(Boolean)).size, [labels]);

  async function loadLabels({ keepSelection = true } = {}) {
    if (!selectedId) return [];
    setLoading(true);
    setError("");
    try {
      const list = await listarLabelsWhatsapp(selectedId, { silent: true });
      setLabels(list);
      setSelectedLabelId((current) => {
        if (keepSelection && list.some((label) => String(label.id) === String(current))) return current;
        return list[0]?.id ?? null;
      });
      return list;
    } catch (requestError) {
      setLabels([]);
      setSelectedLabelId(null);
      setError(apiErrorMessage(requestError, "Não foi possível carregar os labels."));
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSearch("");
    setAssociations({ chats: [], messages: [] });
    setAssociationError("");
    if (!selectedId) {
      setLabels([]);
      setSelectedLabelId(null);
      return;
    }
    loadLabels({ keepSelection: false });
    // selectedId intentionally resets the complete labels workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !selectedLabelId) {
      setAssociations({ chats: [], messages: [] });
      return undefined;
    }
    const controller = new AbortController();
    setAssociationsLoading(true);
    setAssociationError("");
    listarAssociacoesLabelWhatsapp(selectedId, selectedLabelId, { signal: controller.signal, silent: true })
      .then(setAssociations)
      .catch((requestError) => {
        if (requestError?.code === "ERR_CANCELED") return;
        setAssociations({ chats: [], messages: [] });
        setAssociationError(apiErrorMessage(requestError, "Não foi possível carregar as associações."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAssociationsLoading(false);
      });
    return () => controller.abort();
  }, [selectedId, selectedLabelId]);

  async function refreshAssociations() {
    if (!selectedId || !selectedLabelId) return;
    setAssociationsLoading(true);
    setAssociationError("");
    try {
      setAssociations(await listarAssociacoesLabelWhatsapp(selectedId, selectedLabelId, { silent: true }));
    } catch (requestError) {
      setAssociationError(apiErrorMessage(requestError, "Não foi possível atualizar as associações."));
    } finally {
      setAssociationsLoading(false);
    }
  }

  async function handleModalSubmit(values) {
    if (!selectedId || !modal) return;
    setMutationBusy(true);
    try {
      if (modal.mode === "edit") {
        await renomearLabelWhatsapp(selectedId, modal.label.id, values.name);
        await loadLabels();
        showToast({ type: "success", title: "Label atualizado", message: "O novo nome já foi enviado ao WhatsApp." });
      } else {
        const response = await criarLabelWhatsapp(selectedId, values);
        const list = await loadLabels({ keepSelection: false });
        const createdId = response?.label?.id;
        const created = list.find((label) => String(label.id) === String(createdId)) || list.find((label) => label.name === values.name);
        if (created) setSelectedLabelId(created.id);
        showToast({ type: "success", title: "Label criado", message: `“${values.name}” está disponível no WhatsApp Business.` });
      }
      setModal(null);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Não foi possível salvar o label."));
      setModal(null);
    } finally {
      setMutationBusy(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !deleteLabel) return;
    setMutationBusy(true);
    try {
      await excluirLabelWhatsapp(selectedId, deleteLabel.id);
      const name = deleteLabel.name;
      setDeleteLabel(null);
      await loadLabels({ keepSelection: false });
      showToast({ type: "success", title: "Label excluído", message: `“${name}” foi removido do WhatsApp.` });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Não foi possível excluir o label."));
      setDeleteLabel(null);
    } finally {
      setMutationBusy(false);
    }
  }

  async function handleAssociate(event) {
    event.preventDefault();
    const chat = chatInput.trim();
    if (!selectedId || !selectedLabelId || !chat) return;
    setAssociationBusy("add");
    setAssociationError("");
    try {
      await associarLabelWhatsapp(selectedId, selectedLabelId, chat);
      setChatInput("");
      await Promise.all([refreshAssociations(), loadLabels()]);
      showToast({ type: "success", title: "Chat etiquetado", message: `O label “${selectedLabel?.name}” foi associado no WhatsApp.` });
    } catch (requestError) {
      setAssociationError(apiErrorMessage(requestError, "Não foi possível associar o chat."));
    } finally {
      setAssociationBusy("");
    }
  }

  async function handleUnlink(chat) {
    const chatId = chatIdentity(chat);
    if (!selectedId || !selectedLabelId || !chatId) return;
    setAssociationBusy(chatId);
    setAssociationError("");
    try {
      await desassociarLabelWhatsapp(selectedId, selectedLabelId, chatId);
      await Promise.all([refreshAssociations(), loadLabels()]);
      showToast({ type: "success", title: "Associação removida", message: "O chat não usa mais este label no WhatsApp." });
    } catch (requestError) {
      setAssociationError(apiErrorMessage(requestError, "Não foi possível remover a associação."));
    } finally {
      setAssociationBusy("");
    }
  }

  if (!selectedId) return <EmptyWhapiState loading={loadingInstances} />;

  return (
    <div className="wb-labels-workspace">
      <section className="wb-labels-main">
        <div className="wb-metric-row" aria-label="Resumo dos labels">
          <article><span><IconTags size={17} /></span><div><strong>{labels.length}</strong><small>labels no canal</small></div></article>
          <article><span><IconLink size={17} /></span><div><strong>{totalAssociations}</strong><small>associações</small></div></article>
          <article><span><IconTag size={17} /></span><div><strong>{colorCount}</strong><small>cores em uso</small></div></article>
        </div>

        <div className="wb-card wb-labels-card">
          <div className="wb-card-heading wb-card-heading--labels">
            <div>
              <span className="wb-section-kicker">Organização oficial</span>
              <h2>Labels do WhatsApp</h2>
              <p>Crie, renomeie e acompanhe as etiquetas sincronizadas com o aplicativo.</p>
            </div>
            <div className="wb-heading-actions">
              <button type="button" className="wb-icon-button" onClick={() => loadLabels()} disabled={loading} title="Atualizar labels" aria-label="Atualizar labels"><IconRefresh className={loading ? "wb-spin" : ""} size={18} /></button>
              {isAdmin ? <button type="button" className="wb-primary-button" onClick={() => setModal({ mode: "create" })}><IconPlus size={18} /> Novo label</button> : null}
            </div>
          </div>

          {!isAdmin ? <div className="wb-inline-alert"><IconAlertTriangle size={17} /><span>Você pode consultar e associar labels. Criar, renomear ou excluir é exclusivo de administradores.</span></div> : null}
          {error ? <div className="wb-inline-alert wb-inline-alert--error" role="alert">{error}</div> : null}

          <label className="wb-search-field">
            <IconSearch size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou ID" />
            {search ? <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca"><IconX size={15} /></button> : null}
          </label>

          {loading && labels.length === 0 ? (
            <div className="wb-label-skeletons"><i /><i /><i /></div>
          ) : filteredLabels.length === 0 ? (
            <div className="wb-list-empty">
              <IconTags size={28} />
              <strong>{search ? "Nenhum label encontrado" : "Ainda não há labels"}</strong>
              <span>{search ? "Tente outro nome ou ID." : "Crie o primeiro label para organizar seus chats."}</span>
            </div>
          ) : (
            <div className="wb-label-list">
              {filteredLabels.map((label) => {
                const active = String(label.id) === String(selectedLabelId);
                return (
                  <article className={`wb-label-row${active ? " is-active" : ""}`} key={label.id}>
                    <button type="button" className="wb-label-row__select" onClick={() => setSelectedLabelId(label.id)}>
                      <LabelDot color={label.color} />
                      <span><strong>{label.name}</strong><small>ID {label.id} · {Number(label.count) || 0} associações</small></span>
                      <Chevron active={active} />
                    </button>
                    {isAdmin ? (
                      <div className="wb-label-row__actions">
                        <button type="button" onClick={() => setModal({ mode: "edit", label })} title="Renomear" aria-label={`Renomear ${label.name}`}><IconPencil size={16} /></button>
                        <button type="button" className="is-danger" onClick={() => setDeleteLabel(label)} title="Excluir" aria-label={`Excluir ${label.name}`}><IconTrash size={16} /></button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="wb-card wb-associations-card">
        {selectedLabel ? (
          <>
            <div className="wb-associations-heading">
              <div><LabelDot color={selectedLabel.color} /><span><small>Label selecionado</small><strong>{selectedLabel.name}</strong></span></div>
              <button type="button" className="wb-icon-button" onClick={refreshAssociations} disabled={associationsLoading} aria-label="Atualizar associações" title="Atualizar associações"><IconRefresh className={associationsLoading ? "wb-spin" : ""} size={17} /></button>
            </div>
            <form className="wb-associate-form" onSubmit={handleAssociate}>
              <label htmlFor="wb-chat-association">Associar conversa</label>
              <div>
                <input id="wb-chat-association" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Telefone com DDI ou Chat ID" disabled={associationBusy === "add"} />
                <button type="submit" disabled={!chatInput.trim() || associationBusy === "add"}>{associationBusy === "add" ? <span className="wb-button-spinner" /> : <IconPlus size={17} />}<span>Associar</span></button>
              </div>
              <small>Ex.: 5534999998888 ou 5534999998888@s.whatsapp.net</small>
            </form>

            {associationError ? <div className="wb-inline-alert wb-inline-alert--error" role="alert">{associationError}</div> : null}

            <div className="wb-association-stats">
              <span><IconUsers size={16} /><strong>{associations.chats.length}</strong> chats</span>
              <span><IconMessageCircle size={16} /><strong>{associations.messages.length}</strong> mensagens</span>
            </div>

            <div className="wb-associated-list">
              <div className="wb-associated-list__title"><span>Conversas associadas</span></div>
              {associationsLoading ? (
                <div className="wb-label-skeletons wb-label-skeletons--small"><i /><i /></div>
              ) : associations.chats.length === 0 ? (
                <div className="wb-association-empty"><IconLink size={23} /><span>Nenhum chat associado a este label.</span></div>
              ) : associations.chats.map((chat, index) => {
                const id = chatIdentity(chat);
                return (
                  <div className="wb-associated-chat" key={id || index}>
                    <span className="wb-associated-chat__avatar">{chatName(chat).charAt(0).toUpperCase()}</span>
                    <span className="wb-associated-chat__identity"><strong>{chatName(chat)}</strong><small>{id}</small></span>
                    <button type="button" onClick={() => handleUnlink(chat)} disabled={associationBusy === id} title="Remover associação" aria-label={`Remover ${chatName(chat)} deste label`}>
                      {associationBusy === id ? <span className="wb-button-spinner" /> : <IconUnlink size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="wb-association-empty wb-association-empty--large"><IconTag size={30} /><strong>Selecione um label</strong><span>Veja os chats e mensagens associados no WhatsApp Business.</span></div>
        )}
      </aside>

      {modal ? <LabelModal key={`${modal.mode}-${modal.label?.id || "new"}`} {...modal} busy={mutationBusy} onClose={() => setModal(null)} onSubmit={handleModalSubmit} /> : null}
      {deleteLabel ? <DeleteModal label={deleteLabel} busy={mutationBusy} onClose={() => setDeleteLabel(null)} onConfirm={handleDelete} /> : null}
    </div>
  );
}

function Chevron({ active }) {
  return active ? <span className="wb-label-row__active-mark"><IconCheck size={15} /></span> : <IconChevronRight className="wb-label-row__chevron" size={17} />;
}
