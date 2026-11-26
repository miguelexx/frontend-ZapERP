import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconFileInvoice, IconLayoutGrid, IconLock, IconPlugConnected } from "@tabler/icons-react";
import { useAuthStore } from "../auth/authStore";
import { usePermissoesStore } from "../auth/permissoesStore";
import { canAcessarOrcamento, isSupervisorOrAdmin } from "../auth/permissions";
import { consultarStatusErp, obterIntegracaoOrcamento } from "../api/wmOrcamentosService";
import IcthusHero from "../integracoes/IcthusHero";
import IntegracaoVisaoGeral from "../integracoes/IntegracaoVisaoGeral";
import OrcamentosTab from "../integracoes/OrcamentosTab";
import "../integracoes/integracoes.css";

const ABAS = [
  { id: "visao", rotulo: "Visão geral", icon: IconLayoutGrid },
  { id: "orcamentos", rotulo: "Orçamentos", icon: IconFileInvoice },
];

/**
 * Integrações — hoje com o Icthus (ERP) via API WM.
 *
 * Gate: o módulo de orçamento vem de `user.orcamento_wm_habilitado` (getMe/login) +
 * `orcamentos.ver`. Com o módulo desligado a página NÃO chama as rotas `/api/orcamentos/*`
 * (que responderiam 403 de módulo): mostra o estado "não ativada" a partir da flag.
 */
export default function Integracoes() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  usePermissoesStore((s) => s.permissoes);
  const ativo = canAcessarOrcamento(user);
  const [params, setParams] = useSearchParams();
  const aba = params.get("tab") === "orcamentos" ? "orcamentos" : "visao";

  const [integracao, setIntegracao] = useState(null);
  const [statusErp, setStatusErp] = useState(null);
  const [verificando, setVerificando] = useState(false);

  const verificar = useCallback(async () => {
    if (!ativo) return;
    setVerificando(true);
    try {
      setStatusErp(await consultarStatusErp());
    } catch {
      // "Não sei" ≠ "loja fora do ar": sem resposta, não pinta aviso (ver wmOrcamentosService).
    } finally {
      setVerificando(false);
    }
  }, [ativo]);

  useEffect(() => {
    if (!ativo) return undefined;
    const ac = new AbortController();
    obterIntegracaoOrcamento({ signal: ac.signal })
      .then((r) => setIntegracao(r))
      .catch(() => {});
    void verificar();
    return () => ac.abort();
  }, [ativo, verificar]);

  const trocarAba = useCallback(
    (id) => {
      const p = new URLSearchParams(params);
      if (id === "visao") p.delete("tab");
      else p.set("tab", id);
      setParams(p, { replace: true });
    },
    [params, setParams]
  );

  // Indicador deslizante das abas.
  const abasRef = useRef(null);
  const [indicador, setIndicador] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = abasRef.current?.querySelector('[aria-selected="true"]');
    if (el) setIndicador({ x: el.offsetLeft, w: el.offsetWidth });
  }, [aba]);
  useEffect(() => {
    const raiz = abasRef.current;
    if (!raiz || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      const el = raiz.querySelector('[aria-selected="true"]');
      if (el) setIndicador({ x: el.offsetLeft, w: el.offsetWidth });
    });
    ro.observe(raiz);
    return () => ro.disconnect();
  }, []);

  const outras = useMemo(() => {
    const lista = [];
    if (isSupervisorOrAdmin(user)) {
      lista.push({ id: "whatsapp", to: "/configuracoes?tab=whapi", titulo: "WhatsApp", sub: "Números conectados e sincronização" });
    }
    if (user?.crm_habilitado) {
      lista.push({ id: "crm", to: "/crm", titulo: "CRM", sub: "Funil de vendas e leads" });
    }
    return lista;
  }, [user]);

  const abrirConversa = useCallback((id) => navigate(`/atendimento?conversa=${encodeURIComponent(id)}`), [navigate]);
  const podeVerEmpresa = integracao?.permissoes?.ver_historico_empresa === true;

  return (
    <div className="intg-page">
      <header className="intg-header">
        <div className="intg-header-icon" aria-hidden="true">
          <IconPlugConnected size={22} stroke={1.8} />
        </div>
        <div>
          <p className="intg-eyebrow">Conectores</p>
          <h1>Integrações</h1>
          <p className="intg-header-desc">Seus sistemas conversando com o atendimento — sem copiar e colar.</p>
        </div>
      </header>

      <IcthusHero ativo={ativo} integracao={integracao} statusErp={statusErp} verificando={verificando} onVerificar={verificar} />

      <div className="intg-tabs" role="tablist" aria-label="Seções da integração" ref={abasRef}>
        {ABAS.map(({ id, rotulo, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`intg-tab-${id}`}
            aria-selected={aba === id}
            aria-controls={`intg-panel-${id}`}
            className={`intg-tab${aba === id ? " is-on" : ""}`}
            onClick={() => trocarAba(id)}
          >
            <Icon size={17} stroke={1.9} />
            {rotulo}
            {id === "orcamentos" && ativo && integracao?.total_orcamentos_criados ? (
              <span className="intg-tab-count">{integracao.total_orcamentos_criados}</span>
            ) : null}
            {id === "orcamentos" && !ativo ? <IconLock size={14} className="intg-tab-lock" /> : null}
          </button>
        ))}
        <span className="intg-tabs-ink" style={{ transform: `translateX(${indicador.x}px)`, width: indicador.w }} aria-hidden="true" />
      </div>

      <div
        role="tabpanel"
        id={`intg-panel-${aba}`}
        aria-labelledby={`intg-tab-${aba}`}
        className="intg-panel"
        key={aba}
      >
        {aba === "visao" ? (
          <IntegracaoVisaoGeral ativo={ativo} statusErp={statusErp} onIrParaOrcamentos={() => trocarAba("orcamentos")} outras={outras} />
        ) : ativo ? (
          <OrcamentosTab podeVerEmpresa={podeVerEmpresa} onAbrirConversa={abrirConversa} />
        ) : (
          <div className="intg-card intg-state intg-state--locked">
            <span className="intg-state-art" aria-hidden="true">
              <IconLock size={24} stroke={1.7} />
            </span>
            <strong>Orçamentos aparecem aqui quando o Icthus estiver ativo</strong>
            <p>Depois de ativada, esta aba mostra cada orçamento criado pelo atendimento, com valores, itens e quem fez.</p>
          </div>
        )}
      </div>
    </div>
  );
}
