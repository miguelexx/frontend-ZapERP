/**
 * Regressão do bug de mídia duplicada (uma bolha pendente + uma entregue).
 *
 * Cenário real: usuário envia UM PDF. A bolha otimista fica pendente. O refresh de
 * consistência pós-envio (700ms/2600ms) e o F5 recarregam a conversa pelo GET
 * `detalharChat`. Se essa linha do servidor chegar SEM `client_temp_id`, ela não
 * correlaciona com a bolha otimista e, para documento, o hint por conteúdo é fraco
 * (o eco vem sem tamanho/last_modified e com URL /uploads vs blob:) → duas bolhas.
 *
 * Este teste replica o caminho de merge do refresh (`_mergeMensagensFromApi` =
 * putMensagemInDedupeMap + finalizeMensagensList) e verifica:
 *   1) COM client_temp_id (backend corrigido) → 1 bolha, otimista vira entregue.
 *   2) SEM client_temp_id (bug) → 2 bolhas (documenta por que o backend precisa enviar a coluna).
 *
 * Executar: node scripts/test-media-refresh-dedupe.mjs
 */
import {
  putMensagemInDedupeMap,
  finalizeMensagensList,
} from "../src/conversa/conversaOutboundMediaMerge.js";

const CONV = 4242;
const baseTs = Date.now();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Reproduz `_mergeMensagensFromApi(existing, fromApi, conv)` do conversaStore. */
function mergeLikeRefresh(existing, fromApi, conv) {
  const map = new Map();
  let ord = 0;
  for (const raw of [...existing, ...fromApi]) {
    putMensagemInDedupeMap(map, { ...raw, conversa_id: conv }, conv, ++ord);
  }
  return finalizeMensagensList(Array.from(map.values()));
}

/** Bolha otimista de PDF: tem tempId/client_temp_id, blob, tamanho e file_last_modified. */
function optimisticPdf(tempId) {
  return {
    tempId,
    client_temp_id: tempId,
    conversa_id: CONV,
    direcao: "out",
    tipo: "arquivo",
    texto: "NUTRIGRAOS COMERCIO E REPRESENTACOES LTDA (1).pdf",
    conteudo: "NUTRIGRAOS COMERCIO E REPRESENTACOES LTDA (1).pdf",
    nome_arquivo: "NUTRIGRAOS COMERCIO E REPRESENTACOES LTDA (1).pdf",
    tamanho: 113_562,
    file_last_modified: 1_723_600_000_000,
    status: "pending",
    status_mensagem: "pending",
    criado_em: new Date(baseTs).toISOString(),
    url: `blob:${tempId}`,
    url_absoluta: `blob:${tempId}`,
    _optimisticBlobUrl: `blob:${tempId}`,
  };
}

/**
 * Linha do servidor como o GET `detalharChat` a devolve: id + status entregue, tipo
 * pode chegar como "documento", url /uploads, SEM tamanho e SEM file_last_modified.
 * `opts.client_temp_id` controla o antes/depois da correção do backend.
 */
function refreshRowPdf(id, opts = {}) {
  return {
    id,
    ...(opts.client_temp_id ? { client_temp_id: opts.client_temp_id } : {}),
    conversa_id: CONV,
    direcao: "out",
    tipo: "documento",
    texto: "NUTRIGRAOS COMERCIO E REPRESENTACOES LTDA (1).pdf",
    conteudo: "NUTRIGRAOS COMERCIO E REPRESENTACOES LTDA (1).pdf",
    nome_arquivo: "NUTRIGRAOS COMERCIO E REPRESENTACOES LTDA (1).pdf",
    status: opts.status ?? "delivered",
    status_mensagem: opts.status_mensagem ?? opts.status ?? "delivered",
    criado_em: new Date(baseTs + 900).toISOString(),
    url: `/uploads/${id}.pdf`,
    url_absoluta: `/uploads/${id}.pdf`,
    whatsapp_id: opts.whatsapp_id ?? `wamid-${id}`,
  };
}

// 1) COM client_temp_id (backend corrigido): refresh/F5 funde na bolha otimista.
{
  const tempId = "temp-pdf-1";
  const existing = [optimisticPdf(tempId)];
  const fromApi = [refreshRowPdf(9001, { client_temp_id: tempId, status: "delivered" })];
  const list = mergeLikeRefresh(existing, fromApi, CONV);

  assert(list.length === 1, `PDF com client_temp_id deve virar 1 bolha, obteve ${list.length}`);
  assert(String(list[0].id) === "9001", "bolha reconciliada recebe o id do servidor");
  assert(list[0].tempId === tempId, "bolha reconciliada preserva o tempId da UI (chave React estável)");
  const st = String(list[0].status_mensagem || list[0].status || "").toLowerCase();
  assert(st === "delivered", `status deve evoluir pendente→entregue, obteve "${st}"`);
  // Campos locais preservados (tamanho continua exibido; não vira caixa sem info).
  assert(Number(list[0].tamanho) === 113_562, "tamanho local deve ser preservado no merge");
}

// 2) SEM client_temp_id (reprodução do bug): a mídia duplica no refresh/F5.
//    Documenta por que o GET detalharChat PRECISA incluir client_temp_id.
{
  const tempId = "temp-pdf-2";
  const existing = [optimisticPdf(tempId)];
  const fromApi = [refreshRowPdf(9002, { status: "delivered" })]; // sem client_temp_id
  const list = mergeLikeRefresh(existing, fromApi, CONV);

  assert(
    list.length === 2,
    `sem client_temp_id o documento duplica (bug conhecido); obteve ${list.length} — ` +
      "se virou 1, o backend passou a enviar client_temp_id e este teste deve ser atualizado"
  );
}

// 3) Envio legítimo do MESMO arquivo duas vezes continua gerando DUAS bolhas
//    (client_temp_id distinto por envio — não é dedupe por nome/horário).
{
  const t1 = "temp-pdf-a";
  const t2 = "temp-pdf-b";
  const existing = [optimisticPdf(t1), { ...optimisticPdf(t2), criado_em: new Date(baseTs + 50).toISOString() }];
  const fromApi = [
    refreshRowPdf(9101, { client_temp_id: t1, status: "delivered" }),
    refreshRowPdf(9102, { client_temp_id: t2, status: "delivered", whatsapp_id: "wamid-9102" }),
  ];
  const list = mergeLikeRefresh(existing, fromApi, CONV);

  assert(list.length === 2, `dois envios do mesmo PDF devem ficar em 2 bolhas, obteve ${list.length}`);
  assert(list.some((m) => String(m.id) === "9101" && m.tempId === t1), "1º envio reconciliado");
  assert(list.some((m) => String(m.id) === "9102" && m.tempId === t2), "2º envio reconciliado");
}

// 4) Áudio também duplicava no refresh/F5 sem client_temp_id — e é MAIS suscetível que
//    documento: o merge de áudio rejeita de propósito o match só por nome/tamanho (evita
//    colapsar gravações em rajada), então nem nome igual salva. Com client_temp_id → 1 bolha.
function optimisticAudio(tempId) {
  return {
    tempId,
    client_temp_id: tempId,
    conversa_id: CONV,
    direcao: "out",
    tipo: "voice",
    texto: "(áudio)",
    conteudo: "(áudio)",
    nome_arquivo: "audio-1723600000000.webm",
    tamanho: 24_680,
    file_last_modified: 1_723_600_000_000,
    audio_duracao_sec: 19,
    status: "pending",
    status_mensagem: "pending",
    criado_em: new Date(baseTs).toISOString(),
    url: `blob:${tempId}`,
    url_absoluta: `blob:${tempId}`,
    _optimisticBlobUrl: `blob:${tempId}`,
  };
}

// Linha do servidor (detalharChat) para áudio: traz audio_duracao_sec, mas (pré-fix) sem
// client_temp_id/tamanho/file_last_modified; nome renomeado pelo provedor (webm→ogg), url CDN.
function refreshRowAudio(id, opts = {}) {
  return {
    id,
    ...(opts.client_temp_id ? { client_temp_id: opts.client_temp_id } : {}),
    conversa_id: CONV,
    direcao: "out",
    tipo: "voice",
    texto: "(áudio)",
    conteudo: "(áudio)",
    nome_arquivo: opts.nome_arquivo ?? `ptt-${id}.ogg`,
    audio_duracao_sec: 19,
    status: opts.status ?? "delivered",
    status_mensagem: opts.status_mensagem ?? opts.status ?? "delivered",
    criado_em: new Date(baseTs + 900).toISOString(),
    url: opts.url ?? `https://cdn.ultramsg.com/${id}.ogg`,
    url_absoluta: opts.url ?? `https://cdn.ultramsg.com/${id}.ogg`,
    whatsapp_id: `wamid-${id}`,
  };
}

{
  const tempId = "temp-aud-1";
  const list = mergeLikeRefresh([optimisticAudio(tempId)], [refreshRowAudio(7101, { client_temp_id: tempId })], CONV);
  assert(list.length === 1, `áudio com client_temp_id deve virar 1 bolha, obteve ${list.length}`);
  assert(String(list[0].id) === "7101" && list[0].tempId === tempId, "áudio reconciliado preserva tempId e recebe id");
  const st = String(list[0].status_mensagem || list[0].status || "").toLowerCase();
  assert(st === "delivered", `áudio deve evoluir pendente→entregue, obteve "${st}"`);
}

{
  // Documenta o bug pré-fix também para áudio: nome igual + url /uploads ainda duplica.
  const tempId = "temp-aud-2";
  const list = mergeLikeRefresh(
    [optimisticAudio(tempId)],
    [refreshRowAudio(7102, { nome_arquivo: "audio-1723600000000.webm", url: "/uploads/7102.ogg" })],
    CONV
  );
  assert(
    list.length === 2,
    `áudio sem client_temp_id duplica mesmo com nome igual (bug conhecido); obteve ${list.length}`
  );
}

console.log("OK - regressao de midia duplicada no refresh/F5 passou (5 cenarios: PDF + audio).");
