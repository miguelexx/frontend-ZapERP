import {
  IconBuildingStore,
  IconLock,
  IconRefresh,
  IconShieldCheck,
  IconFileInvoice,
  IconClockHour4,
  IconLifebuoy,
} from "@tabler/icons-react";
import { formatDataHora, formatInteiro, infoStatusErp, tempoRelativo } from "./integracoesFormat";

/**
 * Cartão principal da integração Icthus (ERP) via API WM.
 * `ativo=false` → estado "não ativada": o vínculo é provisionado pelo suporte (o telefone
 * autorizado da WM não é digitado por admin de empresa — ver doc 36 do backend, pendência 13).
 */
export default function IcthusHero({ ativo, integracao, statusErp, verificando, onVerificar }) {
  const st = ativo ? infoStatusErp(statusErp) : { tom: "neutro", rotulo: "Não ativada", detalhe: "" };
  const cfg = integracao?.integracao || null;

  return (
    <section className={`intg-hero intg-hero--${ativo ? st.tom : "off"}`} aria-labelledby="intg-hero-title">
      <div className="intg-hero-glow" aria-hidden="true" />
      <div className="intg-hero-grid" aria-hidden="true" />

      <div className="intg-hero-main">
        <div className="intg-hero-mark" aria-hidden="true">
          <span>Ic</span>
          <i className="intg-hero-mark-ring" />
        </div>
        <div className="intg-hero-id">
          <div className="intg-hero-kicker">
            <span>ERP</span>
            <span className="intg-dot-sep" aria-hidden="true" />
            <span>via API WM Sistemas</span>
          </div>
          <h2 id="intg-hero-title" className="intg-hero-title">Icthus</h2>
          <p className="intg-hero-desc">
            Orçamentos direto da conversa: produto, preço, estoque e cliente do seu ERP, gravados no
            Icthus com um clique.
          </p>
        </div>

        <div className="intg-hero-status">
          <span className={`intg-live intg-live--${ativo ? st.tom : "off"}`} role="status">
            <span className="intg-live-dot" aria-hidden="true" />
            {ativo ? (cfg?.ativo === false ? "Pausada" : "Conectada") : "Não ativada"}
          </span>
          {ativo ? (
            <button
              type="button"
              className="intg-btn intg-btn--ghost"
              onClick={onVerificar}
              disabled={verificando}
              aria-label="Testar conexão com a loja"
            >
              <IconRefresh size={16} stroke={1.9} className={verificando ? "intg-spin" : ""} />
              {verificando ? "Testando…" : "Testar conexão"}
            </button>
          ) : null}
        </div>
      </div>

      {ativo ? (
        <dl className="intg-hero-facts">
          <div className={`intg-fact intg-fact--${st.tom}`}>
            <dt>
              <IconBuildingStore size={15} stroke={1.9} /> Loja (sincronizador)
            </dt>
            <dd>
              <strong>{st.rotulo}</strong>
              <span>
                {statusErp?.verificado_em ? `verificado ${tempoRelativo(statusErp.verificado_em)}` : st.detalhe}
              </span>
            </dd>
          </div>
          <div className="intg-fact">
            <dt>
              <IconShieldCheck size={15} stroke={1.9} /> Contato autorizado
            </dt>
            <dd>
              <strong className="intg-mono">•••• {cfg?.telefone_ultimos4 || "----"}</strong>
              <span>
                {cfg?.validacao_status === "autorizado"
                  ? `validado ${cfg?.validado_em ? formatDataHora(cfg.validado_em) : ""}`.trim()
                  : "aguardando validação"}
              </span>
            </dd>
          </div>
          <div className="intg-fact">
            <dt>
              <IconFileInvoice size={15} stroke={1.9} /> Orçamentos no ERP
            </dt>
            <dd>
              <strong>{integracao ? formatInteiro(integracao.total_orcamentos_criados ?? 0) : "—"}</strong>
              <span>criados pelo ZapERP</span>
            </dd>
          </div>
          <div className="intg-fact">
            <dt>
              <IconClockHour4 size={15} stroke={1.9} /> Último orçamento
            </dt>
            <dd>
              <strong>{integracao?.ultimo_orcamento_em ? tempoRelativo(integracao.ultimo_orcamento_em) : "Nenhum ainda"}</strong>
              <span>{integracao?.ultimo_orcamento_em ? formatDataHora(integracao.ultimo_orcamento_em) : "crie pela conversa"}</span>
            </dd>
          </div>
        </dl>
      ) : (
        <div className="intg-hero-off">
          <div className="intg-hero-off-icon" aria-hidden="true">
            <IconLock size={20} stroke={1.8} />
          </div>
          <div>
            <strong>Ativação feita pela equipe ZapERP</strong>
            <p>
              Por segurança, o vínculo com o Icthus é configurado pelo suporte — assim o ZapERP lê
              apenas o ERP da sua empresa. Fale com a gente para ligar.
            </p>
          </div>
          <span className="intg-hero-off-tag">
            <IconLifebuoy size={14} stroke={1.9} /> Ativação pelo suporte
          </span>
        </div>
      )}
    </section>
  );
}
