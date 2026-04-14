import { getAnaliticaUiFromData, isPlainObject } from "./aiAskTypes.js";

/** @param {unknown} m */
function normalizeFlags(m) {
  const f = isPlainObject(m.flags) ? m.flags : {};
  return {
    peso_resumo: Math.min(3, Math.max(0, Number(f.peso_resumo) || 0)),
    provavel_automatica: !!f.provavel_automatica,
    eh_midia: !!f.eh_midia,
    sinal_baixo_valor_informativo: !!f.sinal_baixo_valor_informativo,
  };
}

/** @param {unknown} raw */
function normalizeMensagem(raw) {
  if (!isPlainObject(raw)) return null;
  const id = raw.id ?? raw.mensagem_id ?? raw.message_id;
  const conversa_id = raw.conversa_id ?? raw.conversaId ?? null;
  const texto =
    [raw.texto, raw.conteudo, raw.snippet, raw.preview, raw.mensagem, raw.body]
      .map((x) => (x != null ? String(x).trim() : ""))
      .find(Boolean) || "";
  const tipo = raw.tipo != null ? String(raw.tipo).toLowerCase() : "";
  const url = raw.url != null && String(raw.url).trim() ? String(raw.url).trim() : "";
  const nome_arquivo = raw.nome_arquivo != null ? String(raw.nome_arquivo).trim() : "";
  const flags = normalizeFlags(raw);
  const ehMidia =
    flags.eh_midia ||
    !!url ||
    ["imagem", "image", "video", "áudio", "audio", "sticker", "arquivo", "documento", "ptt"].includes(tipo);

  return {
    id,
    conversa_id,
    cliente_id: raw.cliente_id ?? raw.clienteId ?? null,
    texto: texto.slice(0, 2000),
    tipo,
    url,
    nome_arquivo,
    criado_em: raw.criado_em ?? raw.created_at ?? null,
    flags: { ...flags, eh_midia: ehMidia },
  };
}

/**
 * Lista deduplicada (até 80) a partir de `mensagens_compactas` ou `mensagens`.
 * @param {unknown} data
 */
export function getMensagensAnaliticasLista(data) {
  if (!isPlainObject(data)) return [];
  const rawList =
    Array.isArray(data.mensagens_compactas) && data.mensagens_compactas.length > 0
      ? data.mensagens_compactas
      : Array.isArray(data.mensagens)
        ? data.mensagens
        : [];
  const seen = new Set();
  const out = [];
  for (const raw of rawList) {
    const m = normalizeMensagem(raw);
    if (!m) continue;
    const key = m.id != null ? `id:${m.id}` : `h:${m.conversa_id}:${m.texto.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= 80) break;
  }
  return out;
}

/**
 * @param {ReturnType<typeof getMensagensAnaliticasLista>} list
 */
export function partitionMensagensPorAuto(list) {
  const auto = [];
  const main = [];
  for (const m of list) {
    if (m.flags?.provavel_automatica) auto.push(m);
    else main.push(m);
  }
  return { auto, main };
}

/**
 * Ordena por peso (maior primeiro) para evidências principais.
 * @param {ReturnType<typeof getMensagensAnaliticasLista>} main
 */
export function orderMainPorPeso(main) {
  return [...main].sort((a, b) => {
    const pa = a.flags?.peso_resumo ?? 0;
    const pb = b.flags?.peso_resumo ?? 0;
    if (pb !== pa) return pb - pa;
    return 0;
  });
}

/**
 * @param {unknown} data
 * @returns {number}
 */
export function getEvidenciasColapsoInicial(data) {
  const ui = getAnaliticaUiFromData(data);
  const n = Number(ui?.evidencias_colapso_inicial);
  if (Number.isFinite(n) && n >= 1) return Math.min(80, Math.round(n));
  return 6;
}
