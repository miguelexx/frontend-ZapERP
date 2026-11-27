import { useAuthStore } from "../auth/authStore";
import { canReabrir } from "../auth/permissions";
import { useConversaStore } from "./conversaStore";
import { isGroupConversation } from "../utils/conversaUtils";

/*
 * Banner discreto de atendimento encerrado (revisto em 26/11/2026).
 *
 * Antes dizia "Este atendimento foi encerrado por outro usuário." para quem era o próprio
 * responsável, e atribuía ao atendente até o encerramento AUTOMÁTICO por ausência (o nome que
 * chega é o do responsável, não o de quem encerrou — o backend não grava quem encerrou).
 * Agora o texto sai do contexto (sem afirmar QUEM encerrou, que o backend não grava):
 *   - motivo "ausencia_cliente"      → "Encerrado automaticamente por ausência do cliente."
 *   - você era o responsável         → "Atendimento encerrado — você era o responsável."
 *   - responsável conhecido          → "Atendimento encerrado · responsável: Fulano."
 *   - senão                          → "Atendimento encerrado."
 *
 * E o botão "Reabrir" daqui aparecia JUNTO com o "Reabrir atendimento" do cabeçalho (dois
 * botões iguais a 40px um do outro). O cabeçalho (AtendimentoActions) mostra Reabrir sempre
 * que `canReabrir` numa conversa individual encerrada — no desktop e na 2.ª linha do celular —
 * então o daqui só aparece quando o cabeçalho NÃO o mostra.
 */
export default function ClosedAttendancePanel({
  atendenteNome = "",
  showReopenCta = false,
  reopenBusy = false,
  onReopen,
}) {
  const conversa = useConversaStore((s) => s?.conversa);
  const user = useAuthStore((s) => s?.user);

  const motivo = String(conversa?.finalizacao_motivo || "").toLowerCase();
  const respId = conversa?.atendente_id ?? null;
  const souResponsavel = respId != null && user?.id != null && String(respId) === String(user.id);
  // O ConversaThread manda "outro usuário" quando não sabe o nome: isso não é um nome.
  const nomeLimpo = String(atendenteNome || "").trim();
  const nome = nomeLimpo && nomeLimpo.toLowerCase() !== "outro usuário" ? nomeLimpo : "";

  let texto;
  if (motivo === "ausencia_cliente") texto = "Encerrado automaticamente por ausência do cliente.";
  else if (souResponsavel) texto = "Atendimento encerrado — você era o responsável.";
  else if (nome) texto = `Atendimento encerrado · responsável: ${nome}.`;
  else texto = "Atendimento encerrado.";

  const cabecalhoMostraReabrir =
    Boolean(conversa) && !isGroupConversation(conversa) && typeof canReabrir === "function" && canReabrir(user);
  const mostrarCta = showReopenCta && !cabecalhoMostraReabrir;

  return (
    <div className="wa-closedAttendance-panel" role="region" aria-label="Atendimento finalizado">
      <p className="wa-closedAttendance-text">{texto}</p>
      {mostrarCta ? (
        <button
          type="button"
          className="wa-closedAttendance-reopenBtn"
          onClick={onReopen}
          disabled={reopenBusy}
        >
          {reopenBusy ? "Reabrindo…" : "Reabrir atendimento"}
        </button>
      ) : null}
    </div>
  );
}
