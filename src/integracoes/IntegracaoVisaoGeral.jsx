import { Link } from "react-router-dom";
import {
  IconArrowRight,
  IconBrandWhatsapp,
  IconBuildingStore,
  IconCloudComputing,
  IconDatabase,
  IconDiscount2,
  IconFileInvoice,
  IconFilter,
  IconMessageCircle,
  IconPackage,
  IconShieldCheck,
  IconUserSearch,
  IconUsers,
} from "@tabler/icons-react";
import { infoStatusErp } from "./integracoesFormat";

const RECURSOS = [
  { icon: IconMessageCircle, titulo: "Orçamento na conversa", texto: "Monte o orçamento sem sair do atendimento, com a conversa do cliente ao lado." },
  { icon: IconPackage, titulo: "Produtos, preço e estoque", texto: "Catálogo do Icthus com preço oficial e saldo em tempo real na prévia." },
  { icon: IconUserSearch, titulo: "Clientes do ERP", texto: "Busca pelo nome cadastrado, com documento para separar homônimos." },
  { icon: IconUsers, titulo: "Vendedores", texto: "A lista de vendedores abre pronta, e o último escolhido fica lembrado." },
  { icon: IconDiscount2, titulo: "Preço negociado", texto: "Desconto por item com conferência: o que o ERP aplicou é o que aparece." },
  { icon: IconShieldCheck, titulo: "Sem duplicidade", texto: "Duplo clique, duas abas ou queda de rede não criam o mesmo orçamento duas vezes." },
];

function NoFluxo({ icon: Icon, titulo, sub, tom }) {
  return (
    <div className={`intg-flow-node intg-flow-node--${tom}`}>
      <span className="intg-flow-icon" aria-hidden="true">
        <Icon size={20} stroke={1.8} />
      </span>
      <strong>{titulo}</strong>
      <small>{sub}</small>
    </div>
  );
}

export default function IntegracaoVisaoGeral({ ativo, statusErp, onIrParaOrcamentos, outras }) {
  const st = infoStatusErp(statusErp);
  const tomLoja = !ativo ? "off" : st.tom;
  const tomNuvem = !ativo ? "off" : statusErp ? (statusErp.motivo === "indisponivel" ? "erro" : "ok") : "neutro";

  return (
    <div className="intg-overview">
      <section className="intg-card intg-flow" aria-labelledby="intg-flow-title">
        <header className="intg-card-head">
          <div>
            <h3 id="intg-flow-title">Como a conexão funciona</h3>
            <p>{ativo ? "Cada orçamento percorre este caminho — o status de cada etapa é medido agora." : "O caminho que cada orçamento vai percorrer depois da ativação."}</p>
          </div>
        </header>
        <div className="intg-flow-track">
          <NoFluxo icon={IconMessageCircle} titulo="ZapERP" sub="Atendimento" tom={ativo ? "ok" : "off"} />
          <span className={`intg-flow-link intg-flow-link--${tomNuvem}`} aria-hidden="true"><i /></span>
          <NoFluxo icon={IconCloudComputing} titulo="API WM" sub="Nuvem segura (HTTPS)" tom={tomNuvem} />
          <span className={`intg-flow-link intg-flow-link--${tomLoja}`} aria-hidden="true"><i /></span>
          <NoFluxo icon={IconBuildingStore} titulo="Sincronizador" sub={ativo ? st.rotulo : "Na sua loja"} tom={tomLoja} />
          <span className={`intg-flow-link intg-flow-link--${tomLoja}`} aria-hidden="true"><i /></span>
          <NoFluxo icon={IconDatabase} titulo="Icthus" sub="Seu ERP" tom={tomLoja} />
        </div>
        {ativo && statusErp && !statusErp.erp_alcancavel ? (
          <p className="intg-flow-hint">
            <strong>{st.rotulo}:</strong> {st.detalhe}. A busca de produtos continua funcionando; cliente e
            cálculo voltam assim que o computador da loja religar o sincronizador.
          </p>
        ) : null}
      </section>

      <section className="intg-card" aria-labelledby="intg-rec-title">
        <header className="intg-card-head">
          <div>
            <h3 id="intg-rec-title">O que a integração faz</h3>
            <p>Tudo que o atendente precisa para orçar sem abrir o ERP.</p>
          </div>
          {ativo ? (
            <button type="button" className="intg-btn intg-btn--soft" onClick={onIrParaOrcamentos}>
              <IconFileInvoice size={16} stroke={1.9} /> Ver orçamentos <IconArrowRight size={15} />
            </button>
          ) : null}
        </header>
        <ul className="intg-features">
          {RECURSOS.map(({ icon: Icon, titulo, texto }, i) => (
            <li key={titulo} className="intg-feature" style={{ "--i": i }}>
              <span className="intg-feature-icon" aria-hidden="true">
                <Icon size={19} stroke={1.8} />
              </span>
              <div>
                <strong>{titulo}</strong>
                <p>{texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {outras?.length ? (
        <section className="intg-card" aria-labelledby="intg-outras-title">
          <header className="intg-card-head">
            <div>
              <h3 id="intg-outras-title">Outras conexões do ZapERP</h3>
              <p>Atalhos para as integrações que já moram em outras telas.</p>
            </div>
          </header>
          <div className="intg-connectors">
            {outras.map((c) => (
              <Link key={c.to} to={c.to} className="intg-connector">
                <span className={`intg-connector-logo intg-connector-logo--${c.id}`} aria-hidden="true">
                  {c.id === "whatsapp" ? <IconBrandWhatsapp size={20} stroke={1.8} /> : <IconFilter size={20} stroke={1.8} />}
                </span>
                <span className="intg-connector-txt">
                  <strong>{c.titulo}</strong>
                  <small>{c.sub}</small>
                </span>
                <IconArrowRight size={16} className="intg-connector-go" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
