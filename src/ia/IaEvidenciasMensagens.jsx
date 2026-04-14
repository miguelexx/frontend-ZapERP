import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, Paperclip } from "lucide-react";
import {
  getMensagensAnaliticasLista,
  partitionMensagensPorAuto,
  orderMainPorPeso,
  getEvidenciasColapsoInicial,
} from "./extractMensagensAnaliticas.js";

function safeExternalUrl(u) {
  const s = String(u || "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

function isImageTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  return t === "imagem" || t === "image" || t === "sticker" || t === "figurinha";
}

/**
 * @param {{ data: unknown }} props
 */
export default function IaEvidenciasMensagens({ data }) {
  const [expanded, setExpanded] = useState(false);
  const { auto, mainOrdered, colapso, hasMore } = useMemo(() => {
    const list = getMensagensAnaliticasLista(data);
    const { auto, main } = partitionMensagensPorAuto(list);
    const mainOrdered = orderMainPorPeso(main);
    const colapso = getEvidenciasColapsoInicial(data);
    const hasMore = mainOrdered.length > colapso;
    return { auto, mainOrdered, colapso, hasMore };
  }, [data]);

  const visibleMain = expanded || !hasMore ? mainOrdered : mainOrdered.slice(0, colapso);

  if (!auto.length && !mainOrdered.length) return null;

  function renderMsgCard(m, key) {
    const snippet = m.texto?.trim() || "(sem texto)";
    const autoCls = m.flags?.provavel_automatica ? " ia-analitica-msg--auto" : "";
    const midiaCls = m.flags?.eh_midia ? " ia-analitica-msg--midia" : "";
    const extUrl = m.url ? safeExternalUrl(m.url) : null;
    const nome = m.nome_arquivo || (isImageTipo(m.tipo) ? "Imagem" : extUrl ? "Anexo" : "");

    return (
      <article key={key} className={`ia-analitica-msg${autoCls}${midiaCls}`}>
        <div className="ia-analitica-msg-meta">
          {m.conversa_id != null ? (
            <Link className="ia-analitica-msg-link" to="/atendimento" state={{ openConversaId: Number(m.conversa_id) }}>
              Conversa #{m.conversa_id}
            </Link>
          ) : null}
          {m.flags?.peso_resumo > 0 ? (
            <span className="ia-analitica-msg-peso" title="Peso no resumo">
              Peso {m.flags.peso_resumo}
            </span>
          ) : null}
        </div>
        <p className="ia-analitica-msg-text">{snippet.length > 280 ? `${snippet.slice(0, 280)}…` : snippet}</p>
        {extUrl || nome ? (
          <div className="ia-analitica-msg-media">
            {isImageTipo(m.tipo) ? (
              <ImageIcon size={16} className="ia-analitica-msg-media-ico" aria-hidden />
            ) : (
              <Paperclip size={16} className="ia-analitica-msg-media-ico" aria-hidden />
            )}
            {extUrl ? (
              <a href={extUrl} target="_blank" rel="noopener noreferrer" className="ia-analitica-msg-filelink">
                {nome || "Abrir ficheiro"}
              </a>
            ) : (
              <span className="ia-analitica-msg-filename">{nome}</span>
            )}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="ia-analitica-evidencias-wrap" aria-label="Evidências em mensagens">
      {mainOrdered.length > 0 ? (
        <>
          <div className="ia-analitica-evidencias-title">Evidências</div>
          <div className="ia-analitica-evidencias">{visibleMain.map((m, i) => renderMsgCard(m, `m-${m.id ?? i}`))}</div>
          {hasMore ? (
            <button
              type="button"
              className="ia-analitica-ver-mais"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? "Ver menos" : `Ver mais evidências (${mainOrdered.length - colapso} restantes)`}
            </button>
          ) : null}
        </>
      ) : null}

      {auto.length > 0 ? (
        <details className="ia-analitica-auto-accordion">
          <summary className="ia-analitica-auto-summary">
            Mensagens automáticas / roteiro ({auto.length})
          </summary>
          <div className="ia-analitica-evidencias ia-analitica-evidencias--auto">{auto.map((m, i) => renderMsgCard(m, `a-${m.id ?? i}`))}</div>
        </details>
      ) : null}
    </div>
  );
}
