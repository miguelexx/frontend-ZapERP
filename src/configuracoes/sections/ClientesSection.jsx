import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../auth/authStore";
import { useEmpresaStore } from "../../auth/empresaStore";
import { useChatStore } from "../../chats/chatsStore";
import { useConversaStore } from "../../conversa/conversaStore";
import * as cfg from "../../api/configService";
import * as chatService from "../../chats/chatService";
import Switch from "../../components/ui/Switch";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

const CLIENTES_PAGE_LIMIT = 200;

export function SecaoClientes({ clientes, clientesTotal, onRefresh, onSyncContacts, onSearchClientes, onLoadMoreClientes, loadingMoreClientes, empresa, onUpdateEmpresa, tags }) {
  const navigate = useNavigate();
  const addChat = useChatStore((s) => s.addChat);
  const setSelectedId = useConversaStore((s) => s.setSelectedId);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncingFotos, setSyncingFotos] = useState(false);
  const [syncFotosResult, setSyncFotosResult] = useState(null);
  const [autoSyncSaving, setAutoSyncSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [searching, setSearching] = useState(false);
  const [abrindoId, setAbrindoId] = useState(null);
  const [excluindoId, setExcluindoId] = useState(null);
  const [excluindoTodos, setExcluindoTodos] = useState(false);
  const [clienteModal, setClienteModal] = useState(null); // { mode: "new"|"edit", data }
  const [importarOpen, setImportarOpen] = useState(false);
  const searchMountedRef = useRef(false);
  const searchRequestRef = useRef(0);
  const userPerfil = useAuthStore((s) => s.user?.perfil);
  const isAdmin = String(userPerfil || "").toLowerCase() === "admin";
  useEffect(() => {
    if (!onSearchClientes) return;
    if (!searchMountedRef.current) {
      searchMountedRef.current = true;
      return;
    }
    const requestId = ++searchRequestRef.current;
    const t = setTimeout(() => {
      setSearching(true);
      onSearchClientes(busca.trim() ? { palavra: busca.trim() } : {}).finally(() => {
        if (requestId === searchRequestRef.current) setSearching(false);
      });
    }, 300);
    return () => {
      clearTimeout(t);
      searchRequestRef.current += 1;
    };
  }, [busca, onSearchClientes]);

  // ✅ auto-refresh quando o backend terminar o sync on-connect (Socket → CustomEvent)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (ev) => {
      const detail = ev?.detail;
      if (!detail) return;
      setSyncResult(detail);
      onSyncContacts?.();
    };
    window.addEventListener("zapi_sync_contatos", handler);
    return () => window.removeEventListener("zapi_sync_contatos", handler);
  }, [onSyncContacts]);

  const autoSyncValue = empresa?.zapi_auto_sync_contatos ?? true;
  const handleToggleAutoSync = async (next) => {
    if (!onUpdateEmpresa) return;
    setAutoSyncSaving(true);
    try {
      await onUpdateEmpresa({ zapi_auto_sync_contatos: !!next });
    } catch (e) {
      alert(e.response?.data?.error || e.message || "Erro ao salvar preferência.");
    } finally {
      setAutoSyncSaving(false);
    }
  };

  const handleSincronizarContatos = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await chatService.sincronizarContatos();
      if (res?.ok === false) {
        setSyncResult({ error: res.message || "Erro ao sincronizar. Verifique a configuração do UltraMSG em Integrações." });
        return;
      }
      setSyncResult(res);
      onSyncContacts?.();
    } catch (e) {
      setSyncResult({ error: e.response?.data?.error || e.message || "Erro ao sincronizar" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSincronizarFotosPerfil = async () => {
    setSyncingFotos(true);
    setSyncFotosResult(null);
    try {
      const res = await chatService.sincronizarFotosPerfil();
      setSyncFotosResult(res);
      onRefresh?.();
    } catch (e) {
      setSyncFotosResult({ error: e.response?.data?.error || e.message || "Erro ao sincronizar fotos." });
    } finally {
      setSyncingFotos(false);
    }
  };

  const handleAbrirConversa = async (cliente) => {
    if (!cliente?.id || !cliente?.telefone) return;
    setAbrindoId(cliente.id);
    try {
      const { conversa } = await chatService.abrirConversaCliente(cliente.id);
      if (conversa?.id) {
        addChat(conversa);
        setSelectedId(conversa.id);
        navigate("/atendimento");
      }
    } catch (e) {
      console.error("Erro ao abrir conversa:", e);
    } finally {
      setAbrindoId(null);
    }
  };

  const handleExcluirCliente = async (cliente) => {
    if (!cliente?.id) return;
    const nome = cliente.nome || cliente.telefone || "Cliente";
    if (!window.confirm(`Excluir o cliente "${nome}"? As conversas continuarão, mas sem vínculo com este cadastro.`)) return;
    setExcluindoId(cliente.id);
    try {
      await cfg.excluirCliente(cliente.id);
      onRefresh?.();
    } catch (e) {
      console.error("Erro ao excluir cliente:", e);
      alert(e.response?.data?.erro || e.message || "Erro ao excluir cliente.");
    } finally {
      setExcluindoId(null);
    }
  };

  const handleApagarTodosClientes = async () => {
    if ((Number(clientesTotal) || 0) === 0 && !busca.trim()) {
      alert("Não há clientes para apagar.");
      return;
    }
    const msg = busca.trim()
      ? "Apagar TODOS os clientes desta empresa? (inclusive os que não aparecem na busca atual). As conversas continuarão sem vínculo. Esta ação não pode ser desfeita."
      : `Apagar TODOS os ${Number(clientesTotal) || 0} cliente(s)? As conversas continuarão sem vínculo. Esta ação não pode ser desfeita.`;
    if (!window.confirm(msg)) return;
    setExcluindoTodos(true);
    try {
      const res = await cfg.excluirTodosClientes();
      alert(res?.mensagem || `${res?.apagados ?? 0} cliente(s) apagado(s).`);
      onRefresh?.();
    } catch (e) {
      console.error("Erro ao apagar todos os clientes:", e);
      alert(e.response?.data?.erro || e.message || "Erro ao apagar clientes.");
    } finally {
      setExcluindoTodos(false);
    }
  };

  const avatarUrl = (c) => {
    const url = c?.foto_perfil;
    if (!url || !String(url).trim().startsWith("http")) return null;
    return String(url).trim();
  };

  return (
    <div className="ia-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Clientes</h4>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="ia-btn ia-btn--primary"
            onClick={() => setClienteModal({ mode: "new", data: null })}
          >
            Novo cliente
          </button>
          {isAdmin && (
            <button
              type="button"
              className="ia-btn ia-btn--outline"
              onClick={() => setImportarOpen(true)}
              title="Importar clientes de uma planilha .xlsx"
            >
              Importar clientes
            </button>
          )}
          <button
            type="button"
            className="ia-btn ia-btn--outline"
            style={{ color: "#dc2626", borderColor: "#dc2626" }}
            disabled={excluindoTodos || ((Number(clientesTotal) || 0) === 0 && !busca.trim())}
            onClick={handleApagarTodosClientes}
          >
            {excluindoTodos ? "Apagando…" : "Apagar todos os clientes"}
          </button>
        </div>
      </div>
      <div className="ia-field" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p className="ia-muted" style={{ margin: 0 }}>
            Importe nomes e fotos de perfil da agenda do celular via UltraMSG.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ia-muted">Auto-sync ao conectar</span>
            <Switch
              checked={!!autoSyncValue}
              onChange={(v) => {
                if (autoSyncSaving) return;
                handleToggleAutoSync(v);
              }}
            />
          </div>
        </div>
        {autoSyncSaving && (
          <p className="ia-muted" style={{ marginTop: 8 }}>
            Salvando preferência…
          </p>
        )}
        <button
          type="button"
          className="ia-btn ia-btn--primary"
          disabled={syncing}
          onClick={handleSincronizarContatos}
        >
          {syncing ? "Sincronizando…" : "Sincronizar contatos do celular"}
        </button>
        {syncResult && (
          <p className="ia-muted" style={{ marginTop: 8 }}>
            {syncResult.error
              ? syncResult.error
              : syncResult.job_id
                ? (syncResult.mensagem || "Sincronização enfileirada.")
                : `OK: ${syncResult.total_contatos ?? 0} contatos; ${syncResult.criados ?? 0} novos, ${syncResult.atualizados ?? 0} atualizados.${syncResult.fotos_atualizadas ? ` ${syncResult.fotos_atualizadas} fotos atualizadas.` : ""}`}
          </p>
        )}
      </div>
      <div className="ia-field" style={{ marginBottom: 16 }}>
        <p className="ia-muted">Atualize as fotos de perfil de todos os clientes a partir do WhatsApp (UltraMSG).</p>
        <button
          type="button"
          className="ia-btn ia-btn--outline"
          disabled={syncingFotos}
          onClick={handleSincronizarFotosPerfil}
        >
          {syncingFotos ? "Sincronizando fotos…" : "Sincronizar fotos de perfil"}
        </button>
        {syncFotosResult && (
          <p className="ia-muted" style={{ marginTop: 8 }}>
            {syncFotosResult.error
              ? syncFotosResult.error
              : syncFotosResult.job_id
                ? (syncFotosResult.mensagem || "Sincronização de fotos enfileirada.")
                : `OK: ${syncFotosResult.total ?? 0} clientes; ${syncFotosResult.atualizados ?? 0} fotos atualizadas.`}
          </p>
        )}
      </div>
      <div className="ia-field" style={{ marginBottom: 12 }}>
        <label className="ia-label">Pesquisar por nome ou telefone</label>
        <input
          type="search"
          className="ia-input"
          placeholder="Digite nome ou telefone..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        {searching && <span className="ia-muted" style={{ marginLeft: 8 }}>Buscando…</span>}
      </div>
      <p className="ia-muted">
        {Number(clientesTotal) || 0} cliente(s) {busca.trim() ? "encontrado(s)." : "cadastrado(s)."} — conectado à tabela <code>clientes</code> do banco.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="ia-table">
          <thead>
            <tr>
              <th style={{ width: 52 }}></th>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Email</th>
              <th>Empresa</th>
              <th>Observações</th>
              <th style={{ width: 200 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const url = avatarUrl(c);
              const iniciais = [c.nome, c.telefone].filter(Boolean)[0]
                ? String(c.nome || c.telefone || "").trim().slice(0, 2).toUpperCase()
                : "—";
              const abrindo = abrindoId === c.id;
              return (
                <tr key={c.id}>
                  <td>
                    <div style={{ position: "relative", width: 36, height: 36 }}>
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "#e2e8f0",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {iniciais}
                      </span>
                      {url && (
                        <img
                          src={url}
                          alt=""
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      )}
                    </div>
                  </td>
                  <td>{c.nome || "—"}</td>
                  <td>{c.telefone}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.email || "—"}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.empresa || "—"}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.observacoes || "—"}</td>
                  <td>
                    <div className="ia-btn-row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ia-btn ia-btn--small ia-btn--primary"
                        disabled={abrindo || !c.telefone}
                        onClick={() => handleAbrirConversa(c)}
                      >
                        {abrindo ? "Abrindo…" : "Conversar"}
                      </button>
                      <button
                        type="button"
                        className="ia-btn ia-btn--small ia-btn--outline"
                        onClick={() => setClienteModal({ mode: "edit", data: c })}
                        title="Editar cliente"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="ia-btn ia-btn--small ia-btn--outline"
                        disabled={excluindoId === c.id}
                        onClick={() => handleExcluirCliente(c)}
                        title="Excluir cliente"
                      >
                        {excluindoId === c.id ? "Excluindo…" : "Excluir"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!busca.trim() && clientes.length < (Number(clientesTotal) || 0) ? (
        <div className="ia-btn-row" style={{ justifyContent: "center", marginTop: 12 }}>
          <button
            type="button"
            className="ia-btn ia-btn--outline"
            onClick={onLoadMoreClientes}
            disabled={loadingMoreClientes}
          >
            {loadingMoreClientes
              ? "Carregando..."
              : `Carregar mais clientes (${clientes.length} de ${clientesTotal})`}
          </button>
        </div>
      ) : null}
      {clienteModal ? (
        <ModalCliente
          mode={clienteModal.mode}
          cliente={clienteModal.data}
          allTags={tags}
          onClose={() => setClienteModal(null)}
          onSaved={() => { setClienteModal(null); onRefresh?.(); }}
        />
      ) : null}
      {importarOpen ? (
        <ModalImportarClientes
          onClose={() => setImportarOpen(false)}
          onImported={() => onRefresh?.()}
        />
      ) : null}
    </div>
  );
}


function ModalCliente({ mode, cliente, onClose, onSaved, allTags = [] }) {
  const isNew = mode === "new";
  const [nome, setNome] = useState(cliente?.nome || "");
  const [telefone, setTelefone] = useState(cliente?.telefone || "");
  const [email, setEmail] = useState(cliente?.email || "");
  const [empresa, setEmpresa] = useState(cliente?.empresa || "");
  const [observacoes, setObservacoes] = useState(cliente?.observacoes || "");
  const [tagIds, setTagIds] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagBusyId, setTagBusyId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNome(cliente?.nome || "");
    setTelefone(cliente?.telefone || "");
    setEmail(cliente?.email || "");
    setEmpresa(cliente?.empresa || "");
    setObservacoes(cliente?.observacoes || "");
    setTagIds([]);
  }, [cliente?.id]);

  useEffect(() => {
    if (isNew || !cliente?.id) return;
    setTagsLoading(true);
    cfg.getClienteTags(cliente.id)
      .then((list) => {
        const ids = (Array.isArray(list) ? list : []).map((t) => String(t.id));
        setTagIds(ids);
      })
      .catch(() => setTagIds([]))
      .finally(() => setTagsLoading(false));
  }, [isNew, cliente?.id]);

  const toggleTag = async (tag) => {
    if (!cliente?.id || !tag?.id || tagBusyId) return;
    const tid = String(tag.id);
    const has = tagIds.includes(tid);
    setTagBusyId(tid);
    try {
      if (has) {
        await cfg.removeClienteTag(cliente.id, tag.id);
        setTagIds((cur) => (cur || []).filter((x) => x !== tid));
      } else {
        await cfg.addClienteTag(cliente.id, tag.id);
        setTagIds((cur) => [...new Set([...(cur || []), tid])]);
      }
    } catch (e) {
      const msg = e?.response?.data?.erro || e?.response?.data?.error || e?.message || "Erro ao atualizar tags do cliente.";
      alert(msg);
    } finally {
      setTagBusyId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) {
        if (!String(telefone || "").trim()) {
          alert("Telefone é obrigatório para criar cliente.");
          return;
        }
        await cfg.criarCliente({
          telefone: String(telefone || "").trim(),
          nome: String(nome || "").trim() || null,
          email: String(email || "").trim() || null,
          empresa: String(empresa || "").trim() || null,
          observacoes: String(observacoes || "").trim() || null,
        });
      } else {
        if (!String(telefone || "").trim()) {
          alert("Telefone é obrigatório.");
          return;
        }
        await cfg.atualizarCliente(cliente.id, {
          telefone: String(telefone || "").trim(),
          nome: String(nome || "").trim() || null,
          email: String(email || "").trim() || null,
          empresa: String(empresa || "").trim() || null,
          observacoes: String(observacoes || "").trim() || null,
        });
      }
      onSaved?.();
    } catch (e) {
      const msg = e?.response?.data?.erro || e?.response?.data?.error || e?.message || "Erro ao salvar cliente.";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 440, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
        <h4 style={{ margin: "0 0 16px 0" }}>{isNew ? "Novo cliente" : "Editar cliente"}</h4>
        <form onSubmit={handleSubmit}>
          <div className="ia-field">
            <label>Nome</label>
            <input className="ia-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente (opcional)" />
          </div>
          <div className="ia-field">
            <label>Telefone</label>
            <input
              className="ia-input"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="+55 11 99999-9999"
              required
            />
          </div>
          <div className="ia-field">
            <label>Email</label>
            <input
              className="ia-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@empresa.com (opcional)"
              inputMode="email"
              autoComplete="email"
            />
          </div>
          <div className="ia-field">
            <label>Empresa</label>
            <input className="ia-input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Nome da empresa (opcional)" />
          </div>
          <div className="ia-field">
            <label>Observações</label>
            <textarea className="ia-textarea" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Observações internas sobre o cliente..." />
          </div>
          {!isNew ? (
            <div className="ia-field">
              <label>Tags do contato</label>
              <div className="ia-muted" style={{ fontSize: 12, marginBottom: 8 }}>
                {tagsLoading ? "Carregando tags..." : "Clique para adicionar/remover tags deste contato."}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(Array.isArray(allTags) ? allTags : []).length === 0 ? (
                  <span className="ia-muted" style={{ fontSize: 12 }}>Nenhuma tag cadastrada (Configurações → Tags).</span>
                ) : (
                  (allTags || []).map((t) => {
                    const on = tagIds.includes(String(t.id));
                    const busy = tagBusyId === String(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`ia-btn ia-btn--small ${on ? "ia-btn--primary" : "ia-btn--outline"}`}
                        style={on ? { background: t.cor || undefined, borderColor: t.cor || undefined } : undefined}
                        onClick={() => toggleTag(t)}
                        disabled={busy || tagsLoading}
                        title={on ? "Remover tag" : "Adicionar tag"}
                      >
                        {t.nome}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
          <div className="ia-btn-row" style={{ marginTop: 16 }}>
            <button type="submit" className="ia-btn ia-btn--primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" className="ia-btn ia-btn--outline" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Importação de clientes por planilha (.xlsx).
 * Fluxo: selecionar arquivo → prévia (com mapeamento de colunas editável) → confirmar → resumo.
 * Colunas usadas: Nome do(a) Aluno(a) · Celular do(a) Responsável Pedagógico · Série (Ano).
 */
function ModalImportarClientes({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState("select"); // select | preview | done
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({ nome: null, telefone: null, serie: null });
  const [resultado, setResultado] = useState(null);

  const rodarPreview = async (arquivo, mapOverride) => {
    setLoading(true);
    setErro("");
    try {
      const data = await cfg.previewImportarClientes(arquivo, mapOverride || undefined);
      setPreview(data);
      setMapping({
        nome: data?.mapping?.nome ?? null,
        telefone: data?.mapping?.telefone ?? null,
        serie: data?.mapping?.serie ?? null,
      });
      setStep("preview");
    } catch (e) {
      setErro(e?.response?.data?.erro || e?.message || "Erro ao analisar a planilha.");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      setErro("Selecione um arquivo .xlsx (modelo da planilha de matrículas).");
      return;
    }
    setFile(f);
    setResultado(null);
    rodarPreview(f, null);
  };

  const handleMappingChange = (campo, valor) => {
    const idx = valor === "" ? null : Number(valor);
    const novo = { ...mapping, [campo]: idx };
    setMapping(novo);
    if (file) rodarPreview(file, novo);
  };

  const handleConfirmar = async () => {
    if (!file) return;
    setLoading(true);
    setErro("");
    try {
      const data = await cfg.confirmarImportarClientes(file, mapping);
      setResultado(data);
      setStep("done");
      onImported?.();
    } catch (e) {
      setErro(e?.response?.data?.erro || e?.message || "Erro ao importar clientes.");
    } finally {
      setLoading(false);
    }
  };

  const baixarRelatorio = () => {
    if (!resultado) return;
    const linhas = [["tipo", "linha", "nome", "telefone", "serie/tags", "motivo"]];
    (resultado.ignored || []).forEach((i) =>
      linhas.push(["Ignorada", i.linha ?? "", i.nome ?? "", i.telefone ?? "", i.serie ?? "", i.motivo ?? ""])
    );
    (resultado.conflicts || []).forEach((c) =>
      linhas.push([
        "Conflito",
        (c.linhas || []).join(" / "),
        (c.nomesConflitantes || []).join(" | "),
        c.telefone ?? "",
        (c.tags || []).join(" | "),
        "Mesmo telefone com nomes diferentes (conferir)",
      ])
    );
    (resultado.falhas || []).forEach((f) =>
      linhas.push(["Falha", "", f.nome ?? "", f.telefone ?? "", "", f.motivo ?? ""])
    );
    const csv =
      "﻿" +
      linhas
        .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio-importacao-clientes.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const headers = preview?.headers || [];
  const faltaObrigatoria = mapping.nome == null || mapping.telefone == null;
  const stats = preview?.stats || {};
  const resumo = resultado?.resumo || {};

  const colSelect = (campo, label, obrigatorio) => (
    <div className="ia-field" style={{ marginBottom: 8 }}>
      <label className="ia-label" style={{ fontSize: 13 }}>
        {label} {obrigatorio ? <span style={{ color: "#dc2626" }}>*</span> : <span className="ia-muted">(opcional)</span>}
      </label>
      <select
        className="ia-input"
        value={mapping[campo] == null ? "" : String(mapping[campo])}
        onChange={(e) => handleMappingChange(campo, e.target.value)}
        disabled={loading}
      >
        <option value="">— não usar —</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Coluna ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--ds-surface-1, #fff)",
          color: "var(--ds-text-primary, #0f172a)",
          border: "1px solid var(--ds-border, #e2e8f0)",
          borderRadius: 12,
          padding: 24,
          width: 760,
          maxWidth: "96vw",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h4 style={{ margin: "0 0 4px 0" }}>Importar clientes por planilha</h4>
        <p className="ia-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Envie o arquivo <strong>.xlsx</strong> no modelo de matrículas. Serão usadas as colunas
          <strong> Nome do(a) Aluno(a)</strong>, <strong>Celular do(a) Responsável Pedagógico</strong> e
          <strong> Série (Ano)</strong> — as demais são ignoradas. Nenhuma conversa é criada.
        </p>

        {erro ? (
          <div style={{ background: "rgba(220,38,38,0.12)", color: "#ef4444", border: "1px solid rgba(220,38,38,0.35)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
            {erro}
          </div>
        ) : null}

        {step === "select" || (!preview && step !== "done") ? (
          <div className="ia-field">
            <label className="ia-btn ia-btn--primary" style={{ display: "inline-block", cursor: "pointer" }}>
              {loading ? "Analisando…" : "Selecionar arquivo .xlsx"}
              <input type="file" accept=".xlsx" onChange={handleFile} disabled={loading} style={{ display: "none" }} />
            </label>
          </div>
        ) : null}

        {step === "preview" && preview ? (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
              <div style={{ flex: "1 1 320px" }}>
                <p className="ia-muted" style={{ fontSize: 12, margin: "0 0 6px 0" }}>
                  Confira o mapeamento das colunas (detectado automaticamente; ajuste se necessário):
                </p>
                {colSelect("nome", "Nome do cliente", true)}
                {colSelect("telefone", "Telefone / WhatsApp", true)}
                {colSelect("serie", "Série (tag)", false)}
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", fontSize: 13 }}>
                  <span className="ia-muted">Linhas na planilha</span><strong>{stats.totalLinhas ?? 0}</strong>
                  <span className="ia-muted">Contatos válidos</span><strong>{stats.telefonesUnicos ?? 0}</strong>
                  <span className="ia-muted">Linhas ignoradas</span><strong>{stats.ignoradas ?? 0}</strong>
                  <span className="ia-muted">Conflitos (conferir)</span><strong>{stats.conflitos ?? 0}</strong>
                </div>
              </div>
            </div>

            {faltaObrigatoria ? (
              <div style={{ background: "rgba(245,158,11,0.14)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
                Selecione as colunas de <strong>nome</strong> e <strong>telefone</strong> para continuar.
              </div>
            ) : null}

            <p className="ia-muted" style={{ fontSize: 12, margin: "8px 0 4px" }}>
              Prévia dos primeiros contatos:
            </p>
            <div style={{ overflowX: "auto", border: "1px solid var(--ds-border, #e2e8f0)", borderRadius: 8, maxHeight: 260, overflowY: "auto" }}>
              <table className="ia-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Tags (série)</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.amostra || []).length === 0 ? (
                    <tr><td colSpan={3} className="ia-muted">Nenhum contato válido encontrado.</td></tr>
                  ) : (
                    (preview.amostra || []).map((a, i) => (
                      <tr key={i} style={a.conflito ? { background: "rgba(234,88,12,0.12)" } : undefined}>
                        <td>
                          <div>{a.nome}</div>
                          {a.conflito && (a.nomes_conflitantes || []).length > 0 ? (
                            <div style={{ fontSize: 11, color: "#f97316", marginTop: 2, lineHeight: 1.3 }}>
                              ⚠ Mesmo telefone: {(a.nomes_conflitantes || []).join(", ")}
                            </div>
                          ) : null}
                        </td>
                        <td>{a.telefone}</td>
                        <td>{(a.tags || []).join(", ") || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="ia-btn-row" style={{ marginTop: 16 }}>
              <button type="button" className="ia-btn ia-btn--primary" onClick={handleConfirmar} disabled={loading || faltaObrigatoria || (stats.telefonesUnicos ?? 0) === 0}>
                {loading ? "Importando…" : `Confirmar importação (${stats.telefonesUnicos ?? 0})`}
              </button>
              <label className="ia-btn ia-btn--outline" style={{ cursor: "pointer" }}>
                Trocar arquivo
                <input type="file" accept=".xlsx" onChange={handleFile} disabled={loading} style={{ display: "none" }} />
              </label>
              <button type="button" className="ia-btn ia-btn--outline" onClick={onClose} disabled={loading}>
                Cancelar
              </button>
            </div>
          </>
        ) : null}

        {step === "done" && resultado ? (
          <>
            <div style={{ background: "rgba(0,168,132,0.12)", border: "1px solid rgba(0,168,132,0.4)", borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px", fontSize: 14 }}>
                <span className="ia-muted">Linhas analisadas</span><strong>{resumo.totalLinhas ?? 0}</strong>
                <span className="ia-muted">Clientes importados (novos)</span><strong>{resumo.clientesImportados ?? 0}</strong>
                <span className="ia-muted">Clientes já existentes</span><strong>{resumo.clientesJaExistentes ?? 0}</strong>
                <span className="ia-muted">Tags criadas</span><strong>{resumo.tagsCriadas ?? 0}</strong>
                <span className="ia-muted">Tags vinculadas</span><strong>{resumo.tagsVinculadas ?? 0}</strong>
                <span className="ia-muted">Tags antigas removidas</span><strong>{resumo.tagsRemovidas ?? 0}</strong>
                <span className="ia-muted">Linhas ignoradas</span><strong>{resumo.linhasIgnoradas ?? 0}</strong>
                <span className="ia-muted">Conflitos (conferir)</span><strong>{resumo.conflitos ?? 0}</strong>
                {(resumo.falhas ?? 0) > 0 ? (
                  <><span style={{ color: "#ef4444" }}>Falhas</span><strong style={{ color: "#ef4444" }}>{resumo.falhas}</strong></>
                ) : null}
              </div>
            </div>

            {(resumo.linhasIgnoradas ?? 0) + (resumo.conflitos ?? 0) + (resumo.falhas ?? 0) > 0 ? (
              <p className="ia-muted" style={{ fontSize: 13 }}>
                Há linhas que não foram importadas ou que precisam de conferência. Baixe o relatório para revisar.
              </p>
            ) : (
              <p className="ia-muted" style={{ fontSize: 13 }}>Importação concluída sem pendências. 🎉</p>
            )}

            <div className="ia-btn-row" style={{ marginTop: 12 }}>
              {(resumo.linhasIgnoradas ?? 0) + (resumo.conflitos ?? 0) + (resumo.falhas ?? 0) > 0 ? (
                <button type="button" className="ia-btn ia-btn--outline" onClick={baixarRelatorio}>
                  Baixar relatório (.csv)
                </button>
              ) : null}
              <button type="button" className="ia-btn ia-btn--primary" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function ClientesSection() {
  const requestRef = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const load = useCallback(async () => {
    const [clientesResult, empresa, tags] = await Promise.all([
      cfg.getClientesComTotal({ page: 1, limit: CLIENTES_PAGE_LIMIT }),
      cfg.getEmpresa(),
      cfg.getTags(),
    ]);
    pageRef.current = 1;
    return {
      clientes: clientesResult?.clientes || [],
      clientesTotal: Number(clientesResult?.total) || 0,
      empresa,
      tags,
    };
  }, []);
  const resource = useSectionResource(
    load,
    { clientes: [], clientesTotal: 0, empresa: null, tags: [] },
    "Erro ao carregar clientes."
  );

  const refresh = useCallback(() => {
    requestRef.current += 1;
    return resource.reload().catch(() => {});
  }, [resource.reload]);

  const loadClientes = useCallback(async (params = {}) => {
    const requestId = ++requestRef.current;
    const hasSearch = String(params?.palavra || "").trim() !== "";
    const finalParams = hasSearch ? params : { page: 1, limit: CLIENTES_PAGE_LIMIT, ...params };
    try {
      const result = await cfg.getClientesComTotal(finalParams);
      if (requestId !== requestRef.current) return;
      pageRef.current = 1;
      resource.setData((current) => ({
        ...current,
        clientes: result?.clientes || [],
        clientesTotal: Number(result?.total) || 0,
      }));
    } catch {
      if (requestId !== requestRef.current) return;
      resource.setData((current) => ({ ...current, clientes: [], clientesTotal: 0 }));
    }
  }, [resource.setData]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const result = await cfg.getClientesComTotal({ page: nextPage, limit: CLIENTES_PAGE_LIMIT });
      const nextClients = result?.clientes || [];
      if (nextClients.length > 0) {
        resource.setData((current) => ({
          ...current,
          clientes: [...current.clientes, ...nextClients],
          clientesTotal: result?.total != null ? Number(result.total) || 0 : current.clientesTotal,
        }));
        pageRef.current = nextPage;
      } else if (result?.total != null) {
        resource.setData((current) => ({ ...current, clientesTotal: Number(result.total) || 0 }));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, resource.setData]);

  const updateEmpresa = useCallback(async (patch) => {
    const updated = await cfg.putEmpresa(patch);
    resource.setData((current) => ({
      ...current,
      empresa: updated || { ...(current.empresa || {}), ...(patch || {}) },
    }));
    if (updated) useEmpresaStore.getState().setEmpresa(updated);
    return updated;
  }, [resource.setData]);

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <SecaoClientes
        clientes={resource.data.clientes}
        clientesTotal={resource.data.clientesTotal}
        onRefresh={refresh}
        onSyncContacts={refresh}
        onSearchClientes={loadClientes}
        onLoadMoreClientes={loadMore}
        loadingMoreClientes={loadingMore}
        empresa={resource.data.empresa}
        onUpdateEmpresa={updateEmpresa}
        tags={resource.data.tags}
      />
    </SectionState>
  );
}
