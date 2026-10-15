import { useState } from "react";
import { formatHora } from "../../utils/conversaViewHelpers";
import MessageStatus from "./MessageStatus";
import EditedLabel from "./EditedLabel";
import { requestInboundMediaReprocess } from "../utils/inboundMediaReprocess";

/**
 * Áudio recebido que chegou SEM URL nenhuma (o provedor mandou o evento sem o link da mídia).
 *
 * Sem URL o player não monta — e era justamente dentro do player que morava o "tentar de novo".
 * O atendente ficava com um chip "🎤 Áudio" morto, sem nada para clicar e sem saber a que horas o
 * cliente mandou aquilo. Aqui o botão chama o MESMO endpoint de reprocesso: o backend acha o
 * arquivo no provedor pelo `whatsapp_id`, copia para /uploads e emite `nova_mensagem` — a bolha
 * vira player sozinha, sem F5.
 */
export default function MissingAudioRecover({ label, msg, isGroup, inlineMeta = true }) {
  const [estado, setEstado] = useState("idle");

  const buscar = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (estado === "buscando" || estado === "definitivo") return;
    setEstado("buscando");
    const r = await requestInboundMediaReprocess(msg);
    // Sucesso não precisa de estado: a store/socket troca esta bolha por um player.
    setEstado(r?.ok ? "idle" : r?.definitivo ? "definitivo" : "falhou");
  };

  const buscando = estado === "buscando";
  const definitivo = estado === "definitivo";

  return (
    <span className="wa-bubble-text wa-muted wa-bubble-textInline">
      <span className="wa-bubble-textBody">
        {label}
        {definitivo ? (
          <span
            className="wa-audioUnavailable wa-audioUnavailable--expired"
            data-testid="audio-sem-url-expirado"
            title="Este áudio não está mais disponível no WhatsApp e não pode ser recuperado."
          >
            Áudio expirou no WhatsApp
          </span>
        ) : (
          <button
            type="button"
            className="wa-audioUnavailable"
            data-testid="audio-sem-url-recuperar"
            disabled={buscando}
            aria-busy={buscando ? "true" : undefined}
            onClick={buscar}
            title={
              buscando
                ? "Buscando o áudio no WhatsApp…"
                : "Este áudio não chegou completo. Clique para buscar de novo."
            }
            aria-label={
              buscando ? "Buscando o áudio." : "Áudio não carregado. Buscar de novo."
            }
          >
            {buscando
              ? "Buscando…"
              : estado === "falhou"
              ? "Não veio agora — tentar de novo"
              : "Áudio não carregado — buscar"}
          </button>
        )}
      </span>
      {inlineMeta ? (
        <span className="wa-inlineMeta" aria-label="Horário e status">
          <EditedLabel msg={msg} />
          <span className="wa-inlineTime">{formatHora(msg?.criado_em)}</span>
          <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
        </span>
      ) : null}
    </span>
  );
}
