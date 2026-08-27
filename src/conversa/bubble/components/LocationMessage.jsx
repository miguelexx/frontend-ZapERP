import { safeString, formatHora } from "../../utils/conversaViewHelpers";
import { formatCoords, parseLocationText, buildStaticMapUrl } from "../utils/locationFormat";
import MessageStatus from "./MessageStatus";

/** Mensagem de localização — `location_meta` + mapa/link; fallback texto/url legado */
export default function LocationMessage({ msg, selectMode, isGroup, out }) {
  const texto = safeString(msg?.texto);
  const isLive = msg?.location_live === true;
  const meta = msg?.location_meta && typeof msg.location_meta === "object" ? msg.location_meta : null;
  const latM = meta != null ? Number(meta.latitude) : NaN;
  const lngM = meta != null ? Number(meta.longitude) : NaN;
  const hasMetaCoords = Number.isFinite(latM) && Number.isFinite(lngM);

  const mapUrl =
    (msg?.url && String(msg.url).trim()) ||
    (hasMetaCoords
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${latM},${lngM}`)}`
      : `https://www.google.com/maps/search/${encodeURIComponent(texto || "localização")}`);

  const staticMapUrl = hasMetaCoords ? buildStaticMapUrl(latM, lngM) : null;

  const nomeMeta = meta ? safeString(meta.nome) : "";
  const enderecoMeta = meta ? safeString(meta.endereco) : "";

  const { address, coordsFormatted } = parseLocationText(texto);
  const hasCoords = !!coordsFormatted;
  const legacyLine =
    !hasMetaCoords && (address || (texto && !hasCoords ? texto : null) || null);

  const handleCardClick = (e) => {
    if (!selectMode) e.stopPropagation();
  };

  return (
    <div
      className={`wa-bubble-locationCard ${out ? "wa-bubble-locationCard--out" : ""}`}
      onClick={handleCardClick}
    >
      <span className="wa-bubble-locationBadge">
        {isLive ? "Localização em tempo real" : "Localização"}
      </span>
      {staticMapUrl ? (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-bubble-locationMapLink"
          onClick={(e) => e.stopPropagation()}
          aria-label="Abrir localização no mapa"
        >
          <img
            src={staticMapUrl}
            alt=""
            className="wa-bubble-locationMap"
            loading="lazy"
            decoding="async"
          />
        </a>
      ) : null}
      <div className="wa-bubble-locationContent">
        <span className="wa-bubble-locationIcon" aria-hidden="true">📍</span>
        {hasMetaCoords ? (
          <>
            {nomeMeta ? <p className="wa-bubble-locationAddress">{nomeMeta}</p> : null}
            {enderecoMeta ? (
              <p
                className={`wa-bubble-locationAddress ${nomeMeta ? "wa-bubble-locationAddress--sub" : ""}`}
              >
                {enderecoMeta}
              </p>
            ) : null}
          </>
        ) : legacyLine ? (
          <p className="wa-bubble-locationAddress">{legacyLine}</p>
        ) : null}
        {hasMetaCoords ? (
          <p className="wa-bubble-locationCoords">{formatCoords(latM, lngM)}</p>
        ) : hasCoords ? (
          <p className="wa-bubble-locationCoords">{coordsFormatted}</p>
        ) : null}
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="wa-bubble-locationCta"
          onClick={(e) => e.stopPropagation()}
        >
          Abrir no mapa
        </a>
      </div>
      <div className="wa-bubble-locationFooter">
        <span className="wa-bubble-locationTime">{formatHora(msg?.criado_em)}</span>
        <MessageStatus msg={msg} isGroup={Boolean(isGroup)} />
      </div>
    </div>
  );
}
