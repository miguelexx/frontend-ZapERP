import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, CircleDashed } from "lucide-react";
import { IconClose } from "../conversaViewIcons";
import { useDialogFocus } from "../../atendimento/useDialogFocus";
import { useMobileOverlayBack } from "../../atendimento/useMobileOverlayBack";

/*
 * Painel "Transferir setor" (26/11/2026):
 *  - o setor atual tem ✓ e a cor de destaque (antes: só o texto " (atual)" em cinza);
 *  - a linha clicada mostra o spinner enquanto o PUT viaja (antes: "Salvando..." solto no fim);
 *  - esqueleto enquanto os setores carregam, alça de arrastar na folha do celular.
 * O fechamento e o toast "Setor alterado para X" vêm do useConversationDepartments (logo após
 * o PUT, sem esperar o GET da conversa).
 *
 * 27/11/2026:
 *  - A1-09: no desktop com o chip do setor na linha do selo, a folha abre ANCORADA ao chip
 *    (antes nascia no canto direito, ~860px longe de quem a abriu);
 *  - A1-05: o diálogo recebe o foco (1.º setor escolhível), prende o Tab e devolve o foco ao
 *    chip ao fechar (useDialogFocus);
 *  - R4-05/A2-04: no celular, o "voltar" fecha só o painel (useMobileOverlayBack).
 */

/** Larguras em que o chip do setor fica na linha do selo (setorInline do ConversaHeader). */
const ANCORA_MQ = "(min-width: 641px) and (max-width: 739px), (min-width: 1025px)";
const MARGEM = 8;

function escopoDo(panel) {
  return panel?.closest?.(".wa-shell") || document;
}

/**
 * O chip do setor, só se estiver À VISTA. No desktop apertado a faixa do selo o corta (e o
 * ConversaHeader o esconde com `data-clipped`): ancorar nele punha a folha num ponto vazio, e
 * devolver o foco a ele deixava o foco invisível. Aí o painel foi aberto pelo "Mais opções".
 */
function chipDoSetor(panel) {
  if (typeof document === "undefined") return null;
  const chip = escopoDo(panel).querySelector(".wa-header button.wa-header-setorChip");
  if (!chip || chip.hasAttribute("data-clipped")) return null;
  const r = chip.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  const faixa = chip.closest(".wa-header-metaStrip");
  if (faixa) {
    const f = faixa.getBoundingClientRect();
    if (Math.min(r.right, f.right) - Math.max(r.left, f.left) < r.width - 1) return null;
  }
  return chip;
}

function ancoraAtiva() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.(ANCORA_MQ)?.matches === true;
  } catch {
    return false;
  }
}

export default function ConversaSetorPanel({
  open,
  departamentos,
  status,
  onRetry,
  conversa,
  transferirSetorLoading,
  onClose,
  onTransfer,
  onRemove,
}) {
  const [pendingId, setPendingId] = useState(null);
  useEffect(() => {
    if (!transferirSetorLoading) setPendingId(null);
  }, [transferirSetorLoading]);
  useEffect(() => {
    if (!open) setPendingId(null);
  }, [open]);

  const panelRef = useRef(null);
  /** { left, top } relativos ao contêiner do painel, ou null (posição padrão do CSS). */
  const [ancora, setAncora] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setAncora(null);
      return undefined;
    }
    let frame = 0;
    const medir = () => {
      const panel = panelRef.current;
      const chip = ancoraAtiva() ? chipDoSetor(panel) : null;
      const base = panel?.offsetParent;
      if (!panel || !chip || !base) {
        setAncora((prev) => (prev === null ? prev : null));
        return;
      }
      const c = chip.getBoundingClientRect();
      const b = base.getBoundingClientRect();
      const largura = panel.offsetWidth || 260;
      const maxLeft = Math.max(MARGEM, b.width - largura - MARGEM);
      const next = {
        left: Math.round(Math.min(Math.max(MARGEM, c.left - b.left - 4), maxLeft)),
        top: Math.round(c.bottom - b.top + 6),
      };
      setAncora((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next));
    };
    const agendar = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        medir();
      });
    };
    medir();
    window.addEventListener("resize", agendar);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", agendar);
    };
  }, [open]);

  // Plano B do foco ao fechar (quem abriu sumiu — o item do "Mais opções" — ou perdeu o foco,
  // ex.: Safari não foca botão no clique): o chip do setor se estiver à vista; senão o "Mais
  // opções" do cabeçalho (de onde o painel veio); nunca o body nem um chip escondido.
  const returnFocusRef = useMemo(
    () => ({
      get current() {
        const chip = chipDoSetor(panelRef.current);
        if (chip) return chip;
        if (typeof document === "undefined") return null;
        const escopo = escopoDo(panelRef.current);
        return (
          escopo.querySelector(".wa-header .wa-header-moreBtn") ||
          escopo.querySelector(".wa-header .wa-header-setorBtn, .wa-header-mobileRow2-sector button.wa-header-setorChip")
        );
      },
    }),
    []
  );

  useDialogFocus({
    open,
    dialogRef: panelRef,
    returnFocusRef,
    // O setor atual vem desabilitado: o foco entra no 1.º setor escolhível (ou no próprio
    // painel enquanto a lista carrega — o Tab seguinte já cai dentro dele).
    getInitialFocus: () =>
      panelRef.current?.querySelector(".wa-setorList button.wa-setorItem:not(:disabled)") || panelRef.current,
  });

  // A lista chegou com o foco ainda no painel (abriu no esqueleto): o foco desce ao 1.º setor.
  const totalDepartamentos = departamentos.length;
  useEffect(() => {
    if (!open || totalDepartamentos === 0) return undefined;
    const raf = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || document.activeElement !== panel) return;
      panel.querySelector(".wa-setorList button.wa-setorItem:not(:disabled)")?.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, totalDepartamentos]);

  useMobileOverlayBack(open, onClose, "setor");

  if (!open) return null;
  const atualId = conversa?.departamento_id != null ? Number(conversa.departamento_id) : null;
  const semSetorAtual = atualId == null;

  return (
    <>
      <button
        type="button"
        className="wa-floatingSheet-backdrop"
        aria-label="Fechar painel de setor"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`wa-tagsPanel wa-tagsPanel--setor wa-tagsPanel--premium${ancora ? " wa-tagsPanel--anchored" : ""}`}
        style={ancora ? { "--wa-setor-left": `${ancora.left}px`, "--wa-setor-top": `${ancora.top}px` } : undefined}
        role="dialog"
        tabIndex={-1}
        aria-label={semSetorAtual ? "Definir setor" : "Transferir setor"}
        aria-busy={transferirSetorLoading ? "true" : undefined}
      >
        <span className="wa-tagsPanel-grabber" aria-hidden="true" />
        <div className="wa-tagsPanel-head">
          <span className="wa-tagsPanel-titleWrap">
            <span className="wa-tagsPanel-title">{semSetorAtual ? "Definir setor" : "Transferir setor"}</span>
            <span className="wa-tagsPanel-count">A conversa vai para a fila do setor escolhido</span>
          </span>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar" aria-label="Fechar">
            <IconClose />
          </button>
        </div>
        <div className="wa-tagsPanel-body">
          {status === "error" && departamentos.length === 0 ? (
            <div className="wa-muted" role="alert">
              Não foi possível carregar os setores.{" "}
              {onRetry ? (
                <button type="button" className="wa-linkBtn" onClick={() => onRetry()}>
                  Tentar de novo
                </button>
              ) : null}
            </div>
          ) : departamentos.length === 0 && status === "ready" ? (
            <div className="wa-muted">Nenhum setor cadastrado.</div>
          ) : departamentos.length === 0 ? (
            <div className="wa-setorList" aria-hidden="true">
              {[70, 54, 82].map((w, i) => (
                <span key={i} className="wa-setorItem wa-setorItem--skeleton">
                  <span className="wa-setorItem-skel" style={{ width: `${w}%` }} />
                </span>
              ))}
            </div>
          ) : (
            <div className="wa-setorList">
              {departamentos.map((d) => {
                const isAtual = atualId != null && Number(d.id) === atualId;
                const pending = pendingId != null && Number(pendingId) === Number(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`wa-tagItem wa-setorItem${isAtual ? " is-current" : ""}${pending ? " is-pending" : ""}`}
                    onClick={() => {
                      if (isAtual || transferirSetorLoading) return;
                      setPendingId(d.id);
                      onTransfer(d.id);
                    }}
                    disabled={(transferirSetorLoading && !pending) || isAtual}
                    aria-current={isAtual ? "true" : undefined}
                    aria-busy={pending ? "true" : undefined}
                  >
                    <Building2 className="wa-setorItem-icon" size={16} strokeWidth={1.9} aria-hidden="true" />
                    <span className="wa-setorItem-name">{d.nome}</span>
                    {isAtual ? (
                      <span className="wa-setorItem-current">
                        <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                        Atual
                      </span>
                    ) : pending ? (
                      <span className="wa-setorItem-spinner" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="wa-tagItem wa-tagItem--remover wa-setorItem wa-setorItem--remover"
            onClick={onRemove}
            disabled={transferirSetorLoading || semSetorAtual}
            title={semSetorAtual ? "Conversa já está sem setor" : "Remover setor da conversa"}
          >
            <CircleDashed className="wa-setorItem-icon" size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className="wa-setorItem-name">Sem setor</span>
            {semSetorAtual ? (
              <span className="wa-setorItem-current">
                <Check size={14} strokeWidth={2.6} aria-hidden="true" />
                Atual
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </>
  );
}
