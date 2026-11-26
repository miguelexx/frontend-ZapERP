import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconCheck,
  IconCopy,
  IconLock,
  IconMessageCircle,
  IconX,
  IconCircleCheck,
  IconSend,
  IconFilePlus,
  IconAlertTriangle,
} from "@tabler/icons-react";
import {
  corDoNome,
  formatDataHora,
  formatMoeda,
  formatQuantidade,
  formatTelefone,
  infoEstado,
  iniciais,
} from "./integracoesFormat";

const TEXTO_ESTADO = {
  INCERTO:
    "A loja não confirmou a gravação a tempo. O orçamento pode ter sido criado — confira no Icthus antes de criar outro.",
  FALHA_SEGURA: "O ERP recusou ou não recebeu este orçamento. Nada foi gravado no Icthus.",
  ENVIANDO: "O orçamento está sendo gravado no Icthus agora.",
  PREPARADO: "Calculado, mas não confirmado. Rascunhos não são gravados no ERP.",
  EXPIRADO: "O prazo para confirmar acabou antes da gravação. Nada foi gravado no ERP.",
};

/** Painel lateral (bottom sheet no celular) com os itens, totais e a linha do tempo. */
export default function OrcamentoDetalheDrawer({ orcamento, onFechar, onAbrirConversa }) {
  const [copiado, setCopiado] = useState(false);
  const painelRef = useRef(null);
  const aberto = Boolean(orcamento);

  useEffect(() => {
    if (!aberto) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const t = setTimeout(() => painelRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
    };
  }, [aberto, onFechar]);

  useEffect(() => setCopiado(false), [orcamento?.operacao_id]);

  if (!orcamento) return null;
  const o = orcamento;
  const est = infoEstado(o.estado);

  const copiar = async () => {
    if (!o.numero_erp) return;
    try {
      await navigator.clipboard.writeText(o.numero_erp);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* clipboard bloqueado: sem aviso, o número continua visível */
    }
  };

  const linhaTempo = [
    { icon: IconFilePlus, rotulo: "Calculado", quando: o.criado_em },
    o.enviado_em ? { icon: IconSend, rotulo: "Enviado ao ERP", quando: o.enviado_em } : null,
    o.estado === "CRIADO" && o.concluido_em ? { icon: IconCircleCheck, rotulo: "Gravado no Icthus", quando: o.concluido_em, ok: true } : null,
    (o.estado === "INCERTO" || o.estado === "FALHA_SEGURA") && o.concluido_em
      ? { icon: IconAlertTriangle, rotulo: est.rotulo, quando: o.concluido_em, warn: true }
      : null,
  ].filter(Boolean);

  return createPortal(
    <div className="intg-drawer-root" role="presentation">
      <div className="intg-drawer-backdrop" onClick={onFechar} aria-hidden="true" />
      <aside
        ref={painelRef}
        className="intg-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intg-drawer-title"
        tabIndex={-1}
      >
        <header className="intg-drawer-head">
          <div>
            <span className={`intg-pill intg-pill--${est.tom}`}>
              <i aria-hidden="true" />
              {est.rotulo}
            </span>
            <h3 id="intg-drawer-title">
              {o.numero_erp ? (
                <>
                  Orçamento <span className="intg-mono">#{o.numero_erp}</span>
                </>
              ) : (
                "Orçamento sem número"
              )}
            </h3>
            <p>{o.documento_venda || "Icthus"} · {formatDataHora(o.concluido_em || o.criado_em)}</p>
          </div>
          <button type="button" className="intg-icon-btn" onClick={onFechar} aria-label="Fechar">
            <IconX size={18} />
          </button>
        </header>

        <div className="intg-drawer-body">
          {TEXTO_ESTADO[o.estado] ? <p className={`intg-callout intg-callout--${est.tom}`}>{TEXTO_ESTADO[o.estado]}</p> : null}

          <div className="intg-drawer-total">
            <span>Valor total</span>
            <strong>{formatMoeda(o.valor_total)}</strong>
            {o.bloqueado ? (
              <small>
                <IconLock size={13} /> Protegido contra edição no ERP
              </small>
            ) : null}
          </div>

          <dl className="intg-drawer-meta">
            <div>
              <dt>Cliente (ERP)</dt>
              <dd>
                {o.cliente?.nome || "—"}
                {o.cliente?.codigo_cliente_erp ? <small className="intg-mono">cód. {o.cliente.codigo_cliente_erp}</small> : null}
              </dd>
            </div>
            <div>
              <dt>Vendedor</dt>
              <dd>
                {o.vendedor?.nome || "—"}
                {o.vendedor?.codigo_vendedor_erp ? <small className="intg-mono">cód. {o.vendedor.codigo_vendedor_erp}</small> : null}
              </dd>
            </div>
            <div>
              <dt>Contato da conversa</dt>
              <dd>
                {o.contato?.nome || (o.contato?.telefone ? formatTelefone(o.contato.telefone) : "—")}
                {o.contato?.nome && o.contato?.telefone ? <small>{formatTelefone(o.contato.telefone)}</small> : null}
              </dd>
            </div>
            <div>
              <dt>Feito por</dt>
              <dd className="intg-who">
                {o.usuario?.nome ? (
                  <>
                    <span className="intg-avatar intg-avatar--sm" style={{ "--c": corDoNome(o.usuario.nome) }} aria-hidden="true">
                      {iniciais(o.usuario.nome)}
                    </span>
                    {o.usuario.nome}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          <section className="intg-drawer-items" aria-label="Itens do orçamento">
            <h4>
              Itens <span>{o.qtd_itens}</span>
            </h4>
            <ul>
              {o.itens.map((it, i) => (
                <li key={`${it.codigo_produto_erp}-${i}`}>
                  <div className="intg-item-main">
                    <strong>{it.descricao || "Produto"}</strong>
                    <small>
                      <span className="intg-mono">{it.codigo_produto_erp || "—"}</span> · {formatQuantidade(it.quantidade)} ×{" "}
                      {formatMoeda(it.preco_negociado ?? it.preco_unitario)}
                      {it.preco_negociado != null ? <em className="intg-tag">negociado</em> : null}
                    </small>
                  </div>
                  <span className="intg-item-total">{formatMoeda(it.valor_total)}</span>
                </li>
              ))}
            </ul>
            {o.valor_produtos != null && o.valor_produtos !== o.valor_total ? (
              <div className="intg-drawer-sub">
                <span>Produtos</span>
                <span>{formatMoeda(o.valor_produtos)}</span>
              </div>
            ) : null}
          </section>

          <section className="intg-timeline" aria-label="Linha do tempo">
            <h4>Linha do tempo</h4>
            <ol>
              {linhaTempo.map(({ icon: Icon, rotulo, quando, ok, warn }) => (
                <li key={rotulo} className={ok ? "is-ok" : warn ? "is-warn" : ""}>
                  <span className="intg-timeline-icon" aria-hidden="true">
                    <Icon size={14} stroke={2} />
                  </span>
                  <strong>{rotulo}</strong>
                  <small>{formatDataHora(quando)}</small>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <footer className="intg-drawer-foot">
          {o.numero_erp ? (
            <button type="button" className="intg-btn intg-btn--ghost" onClick={copiar}>
              {copiado ? <IconCheck size={16} /> : <IconCopy size={16} />}
              {copiado ? "Copiado" : "Copiar número"}
            </button>
          ) : null}
          {o.conversa_id ? (
            <button type="button" className="intg-btn intg-btn--primary" onClick={() => onAbrirConversa(o.conversa_id)}>
              <IconMessageCircle size={16} /> Abrir conversa
            </button>
          ) : null}
        </footer>
      </aside>
    </div>,
    document.body
  );
}
