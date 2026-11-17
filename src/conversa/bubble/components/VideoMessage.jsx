import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMmSs } from "../../utils/conversaViewHelpers";
import { IconPlay } from "../../conversaViewIcons";
import {
  clampAspectRatio,
  mediaRatioKey,
  recallAspectRatio,
  rememberAspectRatio,
} from "../utils/mediaAspectRatio";
import MessageCaption from "./MessageCaption";

/** Preview estavel de video: evita salto de layout e oferece affordance clara no mobile. */
export function VideoBubblePreview({ msg, src, onPointerDown, onPointerUp, onClick }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const optimistic = !!msg?._optimisticBlobUrl;
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
      setRatio((atual) => (atual === r ? atual : r));
    }
    setReady(true);
  }, [ratioKey]);

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
      aria-label={failed ? "Abrir arquivo de video" : "Reproduzir video"}
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
      <span className="wa-videoPreviewAction" aria-hidden="true">
        {optimistic ? (
          <span className="wa-videoPreviewSpinner" />
        ) : (
          <span className="wa-videoPreviewPlay"><IconPlay width="22" height="22" /></span>
        )}
      </span>
      {durationSec > 0 && !failed ? (
        <span className="wa-videoPreviewDuration" aria-hidden="true">{formatMmSs(durationSec)}</span>
      ) : null}
      {optimistic ? <span className="wa-videoPreviewStatus">Enviando video...</span> : null}
      {failed ? <span className="wa-videoPreviewError">Previa indisponivel</span> : null}
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
