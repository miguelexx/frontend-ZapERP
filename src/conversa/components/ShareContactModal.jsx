import "./forwardModal.css";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { safeString } from "../utils/conversaViewHelpers";
import { IconClose, IconForward } from "../conversaViewIcons";
import { IconSearch } from "@tabler/icons-react";
import { DestRow } from "./DestRow";
import { formatBrPhoneDisplay } from "../../chats/phoneBrFormat";

const soDigitos = (v) => String(v || "").replace(/\D/g, "");

/**
 * Nome exibível do contato. Devolve null quando o cadastro não tem nome de verdade —
 * contato criado pelo inbound nasce com `nome = telefone` (ver getOrCreateCliente no
 * backend), e repetir o número em cima e embaixo não informa nada.
 */
function nomeReal(c) {
  const bruto = safeString(c?.nome || c?.pushname).trim();
  if (!bruto) return null;
  // Sem nenhuma letra não é nome: cobre o número puro ("551121214367"), o número
  // formatado ("+55 11 2121-4367") e o pushname só de emoji ("💜").
  if (!/\p{L}/u.test(bruto)) return null;
  return bruto;
}

/** Nome sem emoji/pontuação na frente — para ordenar e achar a letra ("⚠ AVISOS" → A). */
function nomeParaOrdenar(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

/** Letra do cabeçalho; dígito ou símbolo cai em "#". */
function letraInicial(nomeOrdenavel) {
  const ch = String(nomeOrdenavel || "").charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

/**
 * Modal "Enviar contato" — mesma pele do seletor de destinos do WhatsApp:
 * busca com lupa, foto do contato, seleção múltipla por quadradinho, seções por
 * letra e botão verde flutuante com a contagem. Estado e envio ficam no
 * hook useShareContact; aqui é só apresentação.
 */
export default function ShareContactModal({
  open,
  query,
  onQueryChange,
  list,
  loading,
  sending,
  selectedIds,
  maxSelecionados,
  onToggleContact,
  onConfirm,
  onClose,
}) {
  const selecionados = useMemo(
    () => new Set((selectedIds || []).map(String)),
    [selectedIds]
  );

  // Ordem alfabética + agrupamento por letra (o backend devolve por id desc).
  // Quem não tem nome salvo (só o número) vai para o fim, como na agenda do WhatsApp:
  // senão a primeira tela do modal é uma parede de números.
  const { secoes, semNome } = useMemo(() => {
    const arr = (Array.isArray(list) ? list : []).filter((c) => c?.id != null);
    const comNome = [];
    const sem = [];
    arr.forEach((c) => {
      const nome = nomeReal(c);
      if (nome) comNome.push({ c, nome, ord: nomeParaOrdenar(nome) || nome });
      else sem.push({ c, nome: formatBrPhoneDisplay(c?.telefone) || String(c?.telefone || "Contato") });
    });
    comNome.sort((a, b) => a.ord.localeCompare(b.ord, "pt-BR", { sensitivity: "base" }));
    sem.sort((a, b) => soDigitos(a.c?.telefone).localeCompare(soDigitos(b.c?.telefone)));

    const out = [];
    let atual = null;
    comNome.forEach((item) => {
      const letra = letraInicial(item.ord);
      if (!atual || atual.letra !== letra) {
        atual = { letra, itens: [] };
        out.push(atual);
      }
      atual.itens.push(item);
    });
    return { secoes: out, semNome: sem };
  }, [list]);

  if (!open) return null;

  const totalSel = selecionados.size;
  const temBusca = safeString(query).trim().length > 0;
  const vazia = secoes.length === 0 && semNome.length === 0;

  const linha = ({ c, nome }, placeholder) => {
    const idStr = String(c.id);
    const tel = formatBrPhoneDisplay(c?.telefone) || (c?.telefone ? String(c.telefone) : null);
    return (
      <DestRow
        key={`cli-${idStr}`}
        name={nome}
        /* Sem nome, o número já é o título — não repetir embaixo. */
        sub={placeholder ? null : tel}
        foto={c?.foto_perfil ?? null}
        placeholder={placeholder}
        checked={selecionados.has(idStr)}
        disabled={sending}
        onToggle={() => onToggleContact?.(c)}
      />
    );
  };

  return createPortal(
    <div
      className="wa-modalOverlay wa-forwardOverlay"
      role="dialog"
      aria-label="Enviar contato"
      onMouseDown={(e) => {
        if (sending) return;
        if (e.target !== e.currentTarget) return;
        onClose?.();
      }}
    >
      <div className="wa-modal wa-forwardModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="wa-forwardSheetHandle" aria-hidden="true" />

        <div className="wa-modal-head">
          <div className="wa-forwardHeadLeft">
            <div className="wa-modal-title">Enviar contato</div>
            <div className="wa-forwardHeadCounter" aria-live="polite">
              {totalSel > 0
                ? `${totalSel} de ${maxSelecionados} selecionado(s)`
                : "Toque nos contatos que quer enviar"}
            </div>
          </div>
          <button
            type="button"
            className="wa-iconBtn"
            onClick={() => !sending && onClose?.()}
            title="Fechar"
            aria-label="Fechar"
          >
            <IconClose />
          </button>
        </div>

        <div className="wa-modal-body wa-forwardBody">
          <div className="wa-forwardSearchWrap wa-shareSearchWrap">
            <IconSearch size={16} strokeWidth={1.8} className="wa-forwardSearchIcon" aria-hidden="true" />
            <input
              className="wa-input wa-forwardSearch"
              placeholder="Pesquisar nome ou número…"
              value={query}
              onChange={(e) => onQueryChange?.(e.target.value)}
              aria-label="Pesquisar contato"
            />
          </div>

          {loading && vazia ? (
            <div className="wa-muted wa-forwardEmpty">Carregando contatos…</div>
          ) : vazia ? (
            <div className="wa-muted wa-forwardEmpty">
              {temBusca ? "Nenhum contato encontrado." : "Nenhum contato disponível."}
            </div>
          ) : (
            <>
              {secoes.map((sec) => (
                <div className="wa-forwardSection wa-shareSection" key={`sec-${sec.letra}`}>
                  <div className="wa-forwardSectionTitle wa-shareLetter">{sec.letra}</div>
                  <div className="wa-forwardList">{sec.itens.map((item) => linha(item, false))}</div>
                </div>
              ))}
              {semNome.length > 0 ? (
                <div className="wa-forwardSection wa-shareSection">
                  <div className="wa-forwardSectionTitle wa-shareLetter wa-shareLetter--semNome">
                    Sem nome salvo
                  </div>
                  <div className="wa-forwardList">{semNome.map((item) => linha(item, true))}</div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {totalSel > 0 ? (
          <button
            type="button"
            className="wa-fwdSendFab"
            onClick={() => onConfirm?.()}
            disabled={sending}
            aria-label={`Enviar ${totalSel} contato(s)`}
            title="Enviar"
          >
            <IconForward />
            <span className="wa-fwdSendFab-badge">{totalSel}</span>
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
