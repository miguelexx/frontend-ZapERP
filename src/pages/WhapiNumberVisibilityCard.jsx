import { useCallback, useEffect, useState } from "react";
import {
  obterVisibilidadeNumeros,
  salvarVisibilidadeNumero,
} from "../api/whapiInstancesService";

/**
 * "Quem pode ver as conversas deste número".
 *
 * Por número (whatsapp_instance_id), o admin marca quais usuários veem as conversas
 * daquele número. Nenhum marcado = todos veem (padrão). Salvar um número não altera
 * a lista dos outros. Só aparece quando a empresa tem 2+ números ativos.
 *
 * Fora da thread e do composer — vive no painel de conexão (WhapiConnectPanel).
 */
export default function WhapiNumberVisibilityCard({ instanceId, enabled, showToast }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [marcados, setMarcados] = useState(() => new Set());

  const carregar = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setErro("");
    const res = await obterVisibilidadeNumeros();
    if (!res.ok) {
      setErro(res.error || "Não foi possível carregar.");
      setLoading(false);
      return;
    }
    const numero = (res.numeros || []).find(
      (n) => String(n.whatsapp_instance_id) === String(instanceId)
    );
    setUsuarios(res.usuarios || []);
    setMarcados(new Set((numero?.usuarios_marcados || []).map(Number)));
    setLoading(false);
  }, [instanceId]);

  useEffect(() => {
    if (enabled && instanceId) carregar();
  }, [enabled, instanceId, carregar]);

  if (!enabled) return null;

  const toggle = (uid) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  async function salvar(idsSet) {
    if (!instanceId || saving) return;
    setSaving(true);
    setErro("");
    const ids = [...idsSet];
    const res = await salvarVisibilidadeNumero(instanceId, ids);
    setSaving(false);
    if (!res.ok) {
      setErro(res.error || "Não foi possível salvar.");
      showToast?.({ type: "error", title: "Visibilidade", message: res.error || "Não foi possível salvar." });
      return;
    }
    setMarcados(new Set((res.usuariosMarcados || ids).map(Number)));
    showToast?.({
      type: "success",
      title: "Visibilidade salva",
      message: res.todosVeem
        ? "Todos os usuários veem as conversas deste número."
        : "Apenas os usuários marcados veem as conversas deste número.",
    });
  }

  const todosVeem = marcados.size === 0;

  return (
    <div
      className="whapi-manage"
      style={{ borderTop: "1px solid var(--border, #e5e7eb)", marginTop: 12, paddingTop: 12 }}
    >
      <h4 className="whapi-card-title">Quem pode ver as conversas deste número</h4>
      <p className="whapi-card-desc" style={{ marginTop: 0 }}>
        Marque quem atende por este número. <strong>Nenhum marcado = todos veem</strong> (padrão).
        Salvar aqui não altera os outros números.
      </p>

      {loading ? (
        <p className="whapi-card-desc">Carregando…</p>
      ) : (
        <>
          {usuarios.length === 0 ? (
            <p className="whapi-card-desc">Nenhum usuário ativo encontrado.</p>
          ) : (
            <div
              className="whapi-vis-list"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 6,
                margin: "6px 0 10px",
                maxHeight: 260,
                overflowY: "auto",
              }}
            >
              {usuarios.map((u) => {
                const uid = Number(u.id);
                const checked = marcados.has(uid);
                return (
                  <label
                    key={uid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 6px",
                      cursor: saving ? "default" : "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={() => toggle(uid)}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.nome || u.email || `Usuário ${uid}`}
                      {u.perfil ? <span className="ia-muted"> · {u.perfil}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <p className="whapi-card-desc" style={{ margin: "0 0 8px" }}>
            {todosVeem
              ? "Situação atual: todos os usuários veem este número."
              : `Situação atual: ${marcados.size} usuário(s) veem este número.`}
          </p>

          {erro ? <div className="ia-error-banner" role="alert">{erro}</div> : null}

          <div className="whapi-actions" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="ia-btn ia-btn--primary"
              onClick={() => salvar(marcados)}
              disabled={saving || loading}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              className="ia-btn ia-btn--outline"
              onClick={() => salvar(new Set())}
              disabled={saving || loading || todosVeem}
            >
              Todos veem este número
            </button>
          </div>
        </>
      )}
    </div>
  );
}
