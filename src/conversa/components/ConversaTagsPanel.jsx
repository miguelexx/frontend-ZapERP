import { useRef } from "react";
import { Check } from "lucide-react";
import { IconClose } from "../conversaViewIcons";
import { useDialogFocus } from "../../atendimento/useDialogFocus";
import { useMobileOverlayBack } from "../../atendimento/useMobileOverlayBack";

/* Quem abre o painel é um item do menu "Mais opções", que já saiu da tela quando ele fecha:
   o foco volta ao gatilho do menu (cabeçalho no desktop, barra de ações no celular). */
function gatilhoMaisOpcoes() {
  const alvos = document.querySelectorAll('button[aria-label="Mais opções"]');
  for (const el of alvos) {
    if (el.getClientRects().length > 0 && !el.disabled) return el;
  }
  return null;
}

/*
 * Tags do cliente (26/11/2026):
 *  - só a etiqueta EM VOO fica travada (antes: o painel inteiro a 60% e o 2.º clique perdido);
 *  - etiqueta escolhida tem ✓ e continua azul sob o cursor (o hover genérico vencia o
 *    `.isSelected` por especificidade e ela parecia desmarcada — CSS em conversaHeaderPremium);
 *  - `aria-pressed` diz o estado ao leitor de tela; a cor da etiqueta (`tag.cor`) aparece num
 *    ponto de 8px, a mesma cor da lista.
 * `tagMutatingId`: lista de ids em voo (formato novo do useConversationTags) ou um id solto.
 *
 * 27/11/2026: o painel (role=dialog) toma o foco ao abrir (1.ª etiqueta), prende o Tab e
 * devolve o foco ao fechar; no celular o "voltar" fecha o painel, não a conversa.
 */
export default function ConversaTagsPanel({
  open,
  allTags,
  tagsLoading,
  selectedTagIds,
  tagMutatingId,
  onClose,
  onToggleTag,
}) {
  const dialogRef = useRef(null);
  useDialogFocus({
    open: Boolean(open),
    dialogRef,
    getInitialFocus: () =>
      dialogRef.current?.querySelector("button.wa-tagChip:not(:disabled)") ||
      dialogRef.current?.querySelector('.wa-tagsPanel-head button[aria-label="Fechar"]'),
    getReturnFocus: gatilhoMaisOpcoes,
  });
  useMobileOverlayBack(Boolean(open), onClose, "tags");
  if (!open) return null;
  const emVoo = Array.isArray(tagMutatingId)
    ? tagMutatingId.map(String)
    : tagMutatingId != null
      ? [String(tagMutatingId)]
      : [];
  const total = Array.isArray(selectedTagIds) ? selectedTagIds.length : 0;
  return (
    <>
      <button
        type="button"
        className="wa-floatingSheet-backdrop"
        aria-label="Fechar painel de tags"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="wa-tagsPanel wa-tagsPanel--tags wa-tagsPanel--premium"
        role="dialog"
        aria-label="Tags do cliente"
        tabIndex={-1}
      >
        <span className="wa-tagsPanel-grabber" aria-hidden="true" />
        <div className="wa-tagsPanel-head">
          <span className="wa-tagsPanel-titleWrap">
            <span className="wa-tagsPanel-title">Tags do cliente</span>
            {total > 0 ? (
              <span className="wa-tagsPanel-count">{total === 1 ? "1 escolhida" : `${total} escolhidas`}</span>
            ) : null}
          </span>
          <button type="button" className="wa-iconBtn" onClick={onClose} title="Fechar" aria-label="Fechar">
            <IconClose />
          </button>
        </div>
        <div className="wa-tagsPanel-body">
          {tagsLoading && allTags.length === 0 ? (
            <div className="wa-tagsList" aria-hidden="true">
              {[64, 92, 76, 58, 84].map((w, i) => (
                <span key={i} className="wa-tagChip wa-tagChip--skeleton" style={{ width: w }} />
              ))}
            </div>
          ) : allTags.length === 0 ? (
            <div className="wa-muted">Nenhuma tag cadastrada.</div>
          ) : (
            <div className="wa-tagsList" role="group" aria-label="Tags disponíveis">
              {allTags.map((tag) => {
                const selected = selectedTagIds.includes(String(tag.id));
                const pending = emVoo.includes(String(tag.id));
                const cor = typeof tag?.cor === "string" && tag.cor.trim() ? tag.cor.trim() : null;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`wa-tagChip${selected ? " isSelected" : ""}${pending ? " isPending" : ""}`}
                    onClick={() => onToggleTag(tag)}
                    disabled={pending}
                    aria-pressed={selected}
                    aria-busy={pending ? "true" : undefined}
                    style={cor ? { "--tag-cor": cor } : undefined}
                  >
                    {selected ? (
                      <Check className="wa-tagChip-check" size={13} strokeWidth={2.6} aria-hidden="true" />
                    ) : (
                      <span className={`wa-tagChip-dot${cor ? "" : " is-neutral"}`} aria-hidden="true" />
                    )}
                    <span className="wa-tagChip-label">{tag.nome}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
