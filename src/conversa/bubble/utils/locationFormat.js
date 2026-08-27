import { safeString } from "../../utils/conversaViewHelpers";

/** Formata coordenadas com no máx. 5 decimais */
export function formatCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const rounded = (n) => Math.round(n * 100000) / 100000;
  return `${rounded(la)}, ${rounded(ln)}`;
}

/** Extrai endereço e coordenadas do texto da mensagem de localização */
export function parseLocationText(texto) {
  const raw = safeString(texto).trim();
  if (!raw) return { address: null, coords: null, coordsFormatted: null };

  const coordsMatch = raw.match(/\(?(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)?/);
  const isCoordsOnly = /^\(?\s*-?\d+\.?\d*,\s*-?\d+\.?\d*\s*\)?$/.test(raw.replace(/\s+/g, " ").trim());
  const hasAddress = raw.includes("•") && !isCoordsOnly;

  let address = null;
  let coordsFormatted = null;

  if (coordsMatch) {
    coordsFormatted = formatCoords(coordsMatch[1], coordsMatch[2]);
  }

  if (isCoordsOnly && coordsMatch) {
    return { address: null, coords: raw, coordsFormatted };
  }

  if (hasAddress) {
    const withoutCoords = raw.replace(/\s*\(?(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)?\s*$/, "").trim().replace(/\s*•\s*$/, "").trim();
    address = withoutCoords || null;
  }

  return { address, coords: coordsMatch ? `${coordsMatch[1]}, ${coordsMatch[2]}` : null, coordsFormatted };
}

/** Mapa estático (OSM) — sem API key; fallback é só o link em `url`. */
export function buildStaticMapUrl(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${la},${ln}&zoom=15&size=320x160&maptype=mapnik&markers=${la},${ln},red-pushpin`;
}
