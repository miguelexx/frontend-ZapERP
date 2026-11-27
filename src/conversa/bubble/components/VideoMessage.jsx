import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMmSs } from "../../utils/conversaViewHelpers";
import { IconPlay } from "../../conversaViewIcons";
import {
  applyAspectRatioVar,
  clampAspectRatio,
  mediaRatioKey,
  recallAspectRatio,
  rememberAspectRatio,
} from "../utils/mediaAspectRatio";
import MessageCaption from "./MessageCaption";
import UploadProgressRing, { uploadTempIdOf, useUploadProgress } from "./UploadProgressRing";

/** Preview estável de vídeo: evita salto de layout e oferece affordance clara no mobile. */
export function VideoBubblePreview({ msg, src, onPointerDown, onPointerUp, onClick }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const optimistic = !!msg?._optimisticBlobUrl;
  /* Upload em curso (26/11/2026): anel determinado com X no lugar do spinner.
     null = sem upload acompanhado (reenvio da outbox, mídia já reconciliada) → spinner antigo. */
  const uploadProgress = useUploadProgress(msg);
  /* Envio recusado (27/11/2026): a bolha guarda o blob de propósito (reenvio local), então
     `optimistic` seguia true — spinner e "Enviando vídeo…" ao lado de "Não foi possível
     enviar". Com falha, a prévia volta a ter o play (o vídeo local continua tocável). */
  const statusEnvio = String(msg?.status_mensagem ?? msg?.status ?? "").toLowerCase();
  const envioFalhou =
    msg?.envio_erro === true || ["erro", "error", "failed", "falhou", "blocked"].includes(statusEnvio);
  const enviandoLocal = optimistic && !envioFalhou;
  const enviando = enviandoLocal || uploadProgress != null;
  const ratioKey = useMemo(() => mediaRatioKey(msg, src), [
    msg?.whatsapp_id,
    msg?.id,
    msg?.tempId,
    msg?.client_temp_id,
    src,
  ]);
  // Mesma ideia da foto: a moldura toma a forma real do vídeo (retrato deixa de ser cortado
  // dentro de um 16/9) e a proporção fica em cache para a remontagem na lista virtual.
  const [ratio, setRatio] = useState(() => recallAspectRatio(ratioKey));

  /* Reset do player só quando o ARQUIVO muda. Antes também resetava quando só a chave
     mudava (id chegando depois do envio): `loadedmetadata` não volta a disparar com o mesmo
     src e o vídeo ficava preso em "carregando", sem duração. */
  useEffect(() => {
    setReady(false);
    setFailed(false);
    setDurationSec(0);
  }, [src]);
  useEffect(() => {
    setRatio((prev) => recallAspectRatio(ratioKey) || prev);
  }, [ratioKey]);

  const handleLoadedMetadata = useCallback((event) => {
    const el = event?.currentTarget;
    const duration = Number(el?.duration || 0);
    if (Number.isFinite(duration) && duration > 0) setDurationSec(duration);
    const r = clampAspectRatio(el?.videoWidth, el?.videoHeight);
    if (r > 0) {
      rememberAspectRatio(ratioKey, r);
      /* Mesma moldura animável da foto (25/11/2026): marca deslize/instantâneo e aplica a
         proporção no mesmo recálculo de estilo, sem esperar o re-render. O próprio envio
         (blob otimista) continua instantâneo — o snap do envio já o acompanha. */
      if (!optimistic) applyAspectRatioVar(el?.closest?.(".wa-bubble-videoLink"), r);
      setRatio((atual) => (atual === r ? atual : r));
    }
    setReady(true);
  }, [ratioKey, optimistic]);

  return (
    <button
      type="button"
      className={[
        "wa-bubble-videoLink",
        optimistic ? "isOptimistic" : "",
        ready ? "isReady" : "isLoading",
        failed ? "hasError" : "",
      ].filter(Boolean).join(" ")}
      style={ratio > 0 ? { "--wa-media-ar": ratio } : undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      aria-label={failed ? "Abrir arquivo de vídeo" : "Reproduzir vídeo"}
    >
      <video
        src={src}
        playsInline
        muted
        preload="metadata"
        className="wa-bubble-videoEl"
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <span className="wa-videoPreviewShade" aria-hidden="true" />
      {/* Com anel não é aria-hidden: o progresso e o "Cancelar este envio" precisam ser lidos. */}
      <span className="wa-videoPreviewAction" aria-hidden={uploadProgress != null ? undefined : "true"}>
        {uploadProgress != null ? (
          <UploadProgressRing tempId={uploadTempIdOf(msg)} progress={uploadProgress} variant="video" />
        ) : enviandoLocal ? (
          <span className="wa-videoPreviewSpinner" />
        ) : (
          <span className="wa-videoPreviewPlay"><IconPlay width="22" height="22" /></span>
        )}
      </span>
      {durationSec > 0 && !failed ? (
        <span className="wa-videoPreviewDuration" aria-hidden="true">{formatMmSs(durationSec)}</span>
      ) : null}
      {/* Sem o % aqui: o anel já mostra o avanço, e "Enviando vídeo… 44%" encostava na hora
          (canto inferior direito) em vídeo retrato estreito. O % fica no aria-valuetext do anel. */}
      {enviando ? <span className="wa-videoPreviewStatus">Enviando vídeo…</span> : null}
      {/* As duas pílulas ocupam o mesmo lugar (rodapé, centro): enquanto envia, o estado do
          envio vale mais do que a prévia local não decodificar (ex.: HEVC no Chrome). */}
      {failed && !enviando ? <span className="wa-videoPreviewError">Prévia indisponível</span> : null}
    </button>
  );
}

export default function VideoMessage({
  msg,
  src,
  texto,
  showCaption,
  onPointerDown,
  onPointerUp,
  onClick,
}) {
  return (
    <div className="wa-bubble-mediaStack">
      <VideoBubblePreview
        msg={msg}
        src={src}
        onPointerDown={onPointerDown}
        onPointerUp={(e) => onPointerUp?.(e, src, "video")}
        onClick={(e) => onClick?.(e, src, "video")}
      />
      <MessageCaption texto={texto} show={showCaption} />
    </div>
  );
}
