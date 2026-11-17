import { getApiBaseUrl } from "../api/baseUrl";

/**
 * Fonte do <img> de foto de perfil.
 *
 * POR QUE ISTO EXISTE
 * A foto de perfil era o ÚNICO <img> do app que ia direto a um host de terceiros
 * (`pps.whatsapp.net` / `*.fbcdn.net`, a URL que a UltraMSG/Whapi devolve e o backend
 * guarda em `clientes.foto_perfil`). Toda a outra mídia recebida — imagem, vídeo, áudio,
 * documento — já passa pelo `/media/proxy` do backend (ver `getMediaPlaybackUrl` em
 * `conversa/utils/conversaViewHelpers.js`).
 *
 * No celular isso dava um sintoma muito específico: tudo carregava menos as fotos, e os
 * cards caíam nas iniciais. Buscar de uma origem de terceiros é exatamente o que
 * bloqueio de rastreamento do browser, DNS filtrado da operadora e modo de economia de
 * dados cortam primeiro — e no desktop, sem esses filtros, as mesmas URLs funcionavam.
 *
 * Passando pelo proxy a foto vem da MESMA origem do resto (a API), que comprovadamente
 * funciona no celular. De quebra o backend já cacheia o corpo e responde
 * `Cache-Control: private, max-age=86400, immutable`.
 *
 * O host do WhatsApp/Facebook já está na allowlist do proxy
 * (`helpers/allowedInboundMediaUrl.js`) — nada a mudar no backend.
 *
 * O token vai na query porque <img> não envia header `Authorization`; é o mesmo
 * contrato que o `/media/proxy` já usa para <audio>/<video> (`authBearerOrQuery`).
 */

function readAuthToken() {
  try {
    const raw = localStorage.getItem("zap_erp_auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.token ? String(parsed.token).trim() : null;
  } catch {
    // modo privado / storage bloqueado
    return null;
  }
}

function isMediaProxyPath(pathname) {
  const p = String(pathname || "");
  return p === "/media/proxy" || p === "/api/media/proxy";
}

/**
 * Devolve a URL que o <img> deve usar. Qualquer caso que não dê para proxiar com
 * segurança volta inalterado — o pior cenário desta função é "nada mudou".
 *
 * @param {string|null|undefined} rawUrl URL já absoluta (ver `resolveAvatarUrl`).
 * @returns {string} URL para o atributo `src` ("" quando não há foto).
 */
export function getAvatarImageSrc(rawUrl) {
  const s = rawUrl != null ? String(rawUrl).trim() : "";
  if (!s) return "";
  // blob:/data: são locais; relativo já foi resolvido antes de chegar aqui.
  if (s.startsWith("blob:") || s.startsWith("data:")) return s;
  if (!/^https?:\/\//i.test(s)) return s;

  let alvo;
  try {
    alvo = new URL(s);
  } catch {
    return s;
  }
  // Nunca proxiar o proxy: o backend rejeita esse alvo e a foto sumiria.
  if (isMediaProxyPath(alvo.pathname)) return s;

  const base = getApiBaseUrl().replace(/\/$/, "");
  let api;
  try {
    api = new URL(base.startsWith("http") ? base : `https://${base}`);
  } catch {
    return s;
  }
  // Já é da própria API (ex.: /uploads/...): vai direto, sem round-trip extra.
  if (alvo.origin === api.origin) return s;

  const token = readAuthToken();
  // Sem token o proxy responderia 401; tentar direto ainda é melhor que nada.
  if (!token) return s;

  const q = new URLSearchParams({ url: s, access_token: token });
  return `${base}/media/proxy?${q.toString()}`;
}
