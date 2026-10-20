/**
 * Nome de arquivo para "Salvar como…" de QUALQUER mídia (imagem, vídeo, áudio, figurinha,
 * documento).
 *
 * Por que existe: o `download` de um `<a>` grava exatamente o texto que recebe. Sem extensão,
 * o Windows abre a caixa "escolha um programa" e o arquivo parece corrompido; com o nome
 * técnico do disco (`inbound-c1-m844-7f3a.pdf`) o atendente perde o nome real que o cliente
 * mandou. Mídia recebida do WhatsApp quase nunca tem `nome_arquivo` — só documento tem —,
 * então imagem/vídeo/áudio precisam de um nome derivado do tipo + data, no estilo do próprio
 * WhatsApp (IMG-20261020-153045.jpg).
 *
 * Módulo puro de propósito (sem DOM, sem store): roda nos testes de regressão em node.
 */

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/pjpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
  "video/x-m4v": "m4v",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/amr": "amr",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/json": "json",
};

/** Extensão de último recurso por tipo da mensagem (o formato que o WhatsApp entrega). */
const EXT_BY_TIPO = {
  imagem: "jpg",
  image: "jpg",
  foto: "jpg",
  photo: "jpg",
  sticker: "webp",
  figurinha: "webp",
  video: "mp4",
  "vídeo": "mp4",
  audio: "ogg",
  "áudio": "ogg",
  voice: "ogg",
  ptt: "ogg",
};

/** Prefixo do nome gerado, no padrão do próprio WhatsApp. */
const PREFIX_BY_TIPO = {
  imagem: "IMG",
  image: "IMG",
  foto: "IMG",
  photo: "IMG",
  sticker: "STK",
  figurinha: "STK",
  video: "VID",
  "vídeo": "VID",
  audio: "AUD",
  "áudio": "AUD",
  voice: "AUD",
  ptt: "AUD",
  arquivo: "DOC",
  documento: "DOC",
  document: "DOC",
  file: "DOC",
  pdf: "DOC",
};

/** Nomes que o backend grava quando NÃO sabe o nome real — não servem como nome de arquivo. */
const PLACEHOLDER_NAMES = new Set([
  "arquivo",
  "(arquivo)",
  "imagem",
  "(imagem)",
  "video",
  "vídeo",
  "(video)",
  "(vídeo)",
  "audio",
  "áudio",
  "(audio)",
  "(áudio)",
  "figurinha",
  "(figurinha)",
  "sticker",
  "null",
  "undefined",
  "download",
  "file",
  "blob",
]);

const EXT_RE = /\.([a-z0-9]{1,8})$/i;
const PROXY_PATHS = new Set(["/media/proxy", "/api/media/proxy"]);

/** Família de cada extensão, para cruzar com o tipo da mensagem. */
const FAMILY_BY_EXT = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  heic: "image",
  heif: "image",
  tiff: "image",
  svg: "image",
  avif: "image",
  mp4: "video",
  mov: "video",
  mkv: "video",
  avi: "video",
  m4v: "video",
  mp3: "audio",
  m4a: "audio",
  ogg: "audio",
  opus: "audio",
  wav: "audio",
  aac: "audio",
  amr: "audio",
};

/** Contêineres que servem áudio E vídeo — nunca contradizem o tipo da mensagem. */
const AMBIGUOUS_EXT = new Set(["webm", "3gp", "3gpp"]);

const FAMILY_BY_TIPO = {
  imagem: "image",
  image: "image",
  foto: "image",
  photo: "image",
  sticker: "image",
  figurinha: "image",
  video: "video",
  "vídeo": "video",
  audio: "audio",
  "áudio": "audio",
  voice: "audio",
  ptt: "audio",
};

function normalizeTipo(tipo) {
  return String(tipo || "").trim().toLowerCase();
}

function urlBase() {
  if (typeof window !== "undefined" && window.location && window.location.href) {
    return window.location.href;
  }
  return "https://local/";
}

/** Último trecho do caminho, sem diretórios, aspas ou caracteres proibidos em nome de arquivo. */
export function sanitizeSaveFilename(name) {
  let s = String(name == null ? "" : name);
  s = s.split(/[\\/]/).pop() || "";
  // Remove controle e os caracteres que Windows/macOS recusam em nome de arquivo.
  s = s.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^\.+/, "").trim();
  if (s.length > 180) {
    const m = s.match(EXT_RE);
    const tail = m ? m[0] : "";
    s = `${s.slice(0, 180 - tail.length).trimEnd()}${tail}`;
  }
  return s;
}

export function extensionFromFilename(name) {
  const m = sanitizeSaveFilename(name).match(EXT_RE);
  return m ? m[1].toLowerCase() : "";
}

export function extensionFromMimeType(mimeType) {
  const ct = String(mimeType || "").trim().toLowerCase().split(";")[0].trim();
  if (!ct) return "";
  if (EXT_BY_MIME[ct]) return EXT_BY_MIME[ct];
  // Tipos fora da tabela que trazem a extensão no subtipo (ex.: audio/x-flac).
  const m = ct.match(/^[a-z]+\/(?:x-)?([a-z0-9]{2,8})$/);
  if (m && m[1] !== "octet" && m[1] !== "stream") return m[1];
  return "";
}

export function extensionFromTipo(tipo) {
  return EXT_BY_TIPO[normalizeTipo(tipo)] || "";
}

/** Nome de arquivo embutido na URL (ignora proxy sem nome e paths sem extensão). */
function filenameFromUrlPath(urlStr, { seguirProxy = true } = {}) {
  const raw = String(urlStr || "").trim();
  if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return "";
  let u;
  try {
    u = new URL(raw, urlBase());
  } catch {
    const last = raw.split("?")[0].split("/").pop() || "";
    return extensionFromFilename(last) ? sanitizeSaveFilename(last) : "";
  }
  if (PROXY_PATHS.has(u.pathname)) {
    const doParam = sanitizeSaveFilename(u.searchParams.get("filename") || "");
    if (doParam && extensionFromFilename(doParam)) return doParam;
    const inner = u.searchParams.get("url");
    if (!inner || !seguirProxy) return "";
    return filenameFromUrlPath(inner, { seguirProxy: false });
  }
  const last = decodeURIComponent((u.pathname || "").split("/").pop() || "");
  return extensionFromFilename(last) ? sanitizeSaveFilename(last) : "";
}

/**
 * Extensão a partir da URL. Entende `/media/proxy?url=<real>` — a URL externa é que carrega
 * a extensão; o path do proxy nunca tem.
 */
export function extensionFromUrl(urlStr) {
  return extensionFromFilename(filenameFromUrlPath(urlStr));
}

/** AAAAMMDD-HHMMSS a partir da data da mensagem (fallback: agora). */
function stamp(criadoEm) {
  let d = criadoEm ? new Date(criadoEm) : new Date();
  if (!Number.isFinite(d.getTime())) d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function isPlaceholderName(name) {
  const s = String(name || "").trim().toLowerCase();
  if (!s) return true;
  if (PLACEHOLDER_NAMES.has(s)) return true;
  // Nome que é só extensão (".pdf") não serve como nome de arquivo.
  return /^\.[a-z0-9]{1,8}$/.test(s);
}

/**
 * Extensão do Content-Type, descartada quando contradiz o tipo da mensagem.
 *
 * O servidor pode anunciar o tipo errado para mídia sem extensão: o `/media/proxy` resolvia
 * `application/octet-stream` com o sniffer de áudio, e um vídeo MP4 saía como `audio/mp4` —
 * salvar daria `VID-….m4a`. O tipo da mensagem vem do webhook e é mais confiável para decidir
 * a FAMÍLIA do arquivo. Contêineres que servem áudio e vídeo (webm, 3gp) nunca contradizem.
 */
function extensionDoMimeCoerente(mimeType, tipo) {
  const ext = extensionFromMimeType(mimeType);
  if (!ext) return "";
  const familiaTipo = FAMILY_BY_TIPO[normalizeTipo(tipo)] || "";
  if (!familiaTipo) return ext;
  if (AMBIGUOUS_EXT.has(ext)) return ext;
  const familiaExt = FAMILY_BY_EXT[ext] || "";
  if (!familiaExt) return ext;
  return familiaExt === familiaTipo ? ext : "";
}

/** Nome gerado quando a mensagem não traz nome real (caso de quase toda mídia do WhatsApp). */
export function fallbackMediaFilename({ tipo, criadoEm, ext } = {}) {
  const prefix = PREFIX_BY_TIPO[normalizeTipo(tipo)] || "ZAP";
  const extension = String(ext || "").replace(/^\./, "").toLowerCase();
  return `${prefix}-${stamp(criadoEm)}${extension ? `.${extension}` : ""}`;
}

/**
 * Nome final do arquivo salvo.
 *
 * Ordem: nome real da mensagem (ganha sempre, só completando a extensão que falta) →
 * nome do arquivo na URL (só para documento, onde o nome técnico ainda é informativo) →
 * nome gerado por tipo + data. A extensão vem, em ordem, do próprio nome, da URL, do
 * Content-Type do blob já baixado e do tipo da mensagem.
 */
export function resolveMediaSaveFilename({ nomeArquivo, url, tipo, mimeType, criadoEm } = {}) {
  const nome = sanitizeSaveFilename(nomeArquivo);
  const extNome = extensionFromFilename(nome);
  const ext =
    extNome ||
    extensionFromUrl(url) ||
    extensionDoMimeCoerente(mimeType, tipo) ||
    extensionFromTipo(tipo);

  if (nome && !isPlaceholderName(nome)) {
    if (extNome) return nome;
    return ext ? `${nome}.${ext}` : nome;
  }

  const tipoNorm = normalizeTipo(tipo);
  const ehDocumento =
    tipoNorm === "arquivo" || tipoNorm === "documento" || tipoNorm === "document" || tipoNorm === "file";
  if (ehDocumento) {
    // Documento sem nome real: o nome em disco (com extensão) diz mais que "DOC-…".
    const daUrl = filenameFromUrlPath(url);
    if (daUrl) return daUrl;
  }

  return fallbackMediaFilename({ tipo, criadoEm, ext });
}
