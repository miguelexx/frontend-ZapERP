import "./forwardModal.css";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { safeString } from "../utils/conversaViewHelpers";
import { IconClose, IconForward } from "../conversaViewIcons";
import { IconSearch } from "@tabler/icons-react";
import { DestRow } from "./DestRow";

/** Nome exibido do contato (mesma regra da lista: nome, senão telefone). */
function nomeDoContato(c) {
  return safeString(c?.nome || c?.pushname || c?.telefone) || "Contato";
}

/** Letra do cabeçalho (sem acento, dígito/símbolo cai em "#"). */
function letraInicial(nome) {
  const s = String(nome || "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  const ch = s.charAt(0);
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
  const secoes = useMemo(() => {
    const arr = (Array.isArray(list) ? list : []).filter((c) => c?.id != null);
    const ordenada = arr
      .map((c) => ({ c, nome: nomeDoContato(c) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    const out = [];
    let atual = null;
    ordenada.forEach(({ c, nome }) => {
      const letra = letraInicial(nome);
      if (!atual || atual.letra !== letra) {
        atual = { letra, itens: [] };
        out.push(atual);
      }
      atual.itens.push({ c, nome });
    });
    return out;
  }, [list]);

  if (!open) return null;

  const totalSel = selecionados.size;
  const temBusca = safeString(query).trim().length > 0;
  const vazia = secoes.length === 0;

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
            secoes.map((sec) => (
              <div className="wa-forwardSection wa-shareSection" key={`sec-${sec.letra}`}>
                <div className="wa-forwardSectionTitle wa-shareLetter">{sec.letra}</div>
                <div className="wa-forwardList">
                  {sec.itens.map(({ c, nome }) => {
                    const idStr = String(c.id);
                    const marcado = selecionados.has(idStr);
                    return (
                      <DestRow
                        key={`cli-${idStr}`}
                        name={nome}
                        sub={c?.telefone ? String(c.telefone) : null}
                        foto={c?.foto_perfil ?? null}
                        checked={marcado}
                        disabled={sending}
                        onToggle={() => onToggleContact?.(c)}
                      />
                    );
                  })}
                </div>
              </div>
            ))
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
