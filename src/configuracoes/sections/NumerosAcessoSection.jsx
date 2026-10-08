import { useCallback, useEffect, useState } from "react";
import { listarAcessoNumeros, salvarAtendentesDoNumero } from "../../api/numerosAcessoService";

function numeroLabel(inst) {
  const nome = String(inst?.nome || "").trim();
  const fone = String(inst?.display_phone || inst?.telefone_conectado || "").trim();
  if (nome && fone) return `${nome} · ${fone}`;
  return nome || fone || `Número #${inst?.id}`;
}

export default function NumerosAcessoSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disponivel, setDisponivel] = useState(true);
  const [instances, setInstances] = useState([]);
  const [atendentes, setAtendentes] = useState([]);
  const [marcados, setMarcados] = useState({});
  const [salvandoId, setSalvandoId] = useState(null);
  const [salvoId, setSalvoId] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listarAcessoNumeros();
      setDisponivel(data.configuracaoDisponivel);
      setInstances(data.instances);
      setAtendentes(data.atendentes);
      const next = {};
      for (const inst of data.instances) {
        next[String(inst.id)] = new Set((inst.atendente_ids || []).map((id) => Number(id)));
      }
      setMarcados(next);
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível carregar os números.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function toggle(instanceId, usuarioId) {
    const key = String(instanceId);
    setSalvoId(null);
    setMarcados((prev) => {
      const atual = new Set(prev[key] || []);
      if (atual.has(usuarioId)) atual.delete(usuarioId);
      else atual.add(usuarioId);
      return { ...prev, [key]: atual };
    });
  }

  async function salvar(inst) {
    const key = String(inst.id);
    setSalvandoId(inst.id);
    setError("");
    setSalvoId(null);
    try {
      const usuarioIds = [...(marcados[key] || [])];
      const data = await salvarAtendentesDoNumero(inst.id, usuarioIds);
      setMarcados((prev) => ({
        ...prev,
        [key]: new Set((data?.atendente_ids || usuarioIds).map((id) => Number(id))),
      }));
      setSalvoId(inst.id);
    } catch (err) {
      setError(err?.response?.data?.error || "Não foi possível salvar.");
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div className="config-geral-section">
      <header className="config-geral-header">
        <span className="ia-auto-reply-eyebrow">Atendimento</span>
        <h4 className="config-geral-title">Visão por número</h4>
        <p className="config-geral-lead">
          Marque quais atendentes podem ver as conversas de cada número. Quem não tiver nenhum número marcado continua vendo tudo, como hoje. Admin e supervisor sempre veem todos os números.
        </p>
      </header>

      {error ? <div className="ia-error-banner" role="alert">{error}</div> : null}
      {!disponivel ? (
        <div className="ia-error-banner" role="status">
          A configuração ainda não está disponível neste banco. Aplique a migration usuario_whatsapp_instances e atualize esta tela.
        </div>
      ) : null}
      {loading ? <p className="ia-muted">Carregando números…</p> : null}

      {!loading && instances.length === 0 ? (
        <p className="ia-muted">Nenhum número WhatsApp cadastrado nesta empresa.</p>
      ) : null}

      {!loading && atendentes.length === 0 && instances.length > 0 ? (
        <p className="ia-muted">Não há atendentes ativos para marcar.</p>
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        {instances.map((inst) => {
          const key = String(inst.id);
          const selecionados = marcados[key] || new Set();
          return (
            <section key={key} className="ia-section" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h5 style={{ margin: 0 }}>{numeroLabel(inst)}</h5>
                  <p className="ia-muted" style={{ margin: "4px 0 0" }}>
                    {inst.ativo === false ? "Inativo" : "Ativo"}
                    {selecionados.size === 0
                      ? " · nenhum atendente marcado neste número"
                      : ` · ${selecionados.size} atendente(s) marcado(s)`}
                  </p>
                </div>
                <button
                  type="button"
                  className="ia-btn ia-btn--primary"
                  onClick={() => salvar(inst)}
                  disabled={!disponivel || salvandoId === inst.id || atendentes.length === 0}
                >
                  {salvandoId === inst.id ? "Salvando…" : salvoId === inst.id ? "Salvo" : "Salvar"}
                </button>
              </div>
              {atendentes.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                  {atendentes.map((usuario) => {
                    const uid = Number(usuario.id);
                    const ligado = selecionados.has(uid);
                    return (
                      <label
                        key={uid}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: "1px solid var(--wa-border, rgba(255,255,255,0.12))",
                          cursor: disponivel ? "pointer" : "default",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={ligado}
                          disabled={!disponivel}
                          onChange={() => toggle(inst.id, uid)}
                        />
                        <span>{usuario.nome}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
