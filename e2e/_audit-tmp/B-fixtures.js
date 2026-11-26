// Lente B — conversas realistas (fotos de celular em PNG real, proxy, 404, pendente eterna,
// áudio lento/quebrado, figurinha, vídeo, documento, link com prévia, resposta, reação, nota,
// triagem do bot, grupos, vários dias) + paginação real por `limit`/`cursor`.
import { makePng, audioOgg, PDF, API } from "./B-helpers.js";

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 21, 11, 0, 0); // 4 dias atrás

/** Escala de atraso: B_IMG_SCALE=2 dobra todos os atrasos de mídia. */
const SCALE = Number(process.env.B_IMG_SCALE || 1);

// Especificações de foto: [w, h, atrasoMs]
const PHOTO_SPECS = [
  [1080, 1920, 900], // retrato (print/câmera)
  [1600, 900, 1400], // paisagem
  [1080, 1080, 600], // quadrada
  [1080, 3000, 2200], // print muito alto (clamp 0.5625)
  [1200, 1600, 1800], // retrato 3:4
  [1920, 1080, 2500], // paisagem 16:9 lenta
];

export function buildConversation(cid, n, { group = false, lateImages = false, startIdx = 0 } = {}) {
  const out = [];
  let photo = 0;
  for (let i = 0; i < n; i++) {
    const id = cid * 10000 + i;
    const day = Math.floor((i / n) * 4);
    const criado_em = new Date(T0 + day * DAY + i * 97000).toISOString();
    const dirOut = i % 3 === 1;
    const base = {
      id, conversa_id: cid, direcao: dirOut ? "out" : "in", status: dirOut ? (i % 2 ? "lido" : "entregue") : "lido", criado_em,
      ...(dirOut ? { usuario_nome: "Eva", enviado_por_usuario: true, autor_usuario_id: 7 } : {}),
      ...(group && !dirOut ? { remetente_nome: ["Ana", "Bruno", "Carla"][i % 3], remetente_telefone: "551199990000" + (i % 3) } : {}),
    };
    const k = i % 17;
    if (k === 2 || k === 9 || k === 13) {
      const [w, h, d0] = PHOTO_SPECS[photo++ % PHOTO_SPECS.length];
      const d = Math.round((lateImages ? d0 + 1800 : d0) * SCALE);
      // metade via /uploads, metade via URL externa (passa pelo /media/proxy)
      const viaProxy = photo % 2 === 0;
      const name = `ph-${id}-${w}x${h}-${d}.png`;
      out.push({ ...base, tipo: "imagem", url: viaProxy ? `https://cdn.invalid/${name}` : `/uploads/${name}`, ...(k === 13 ? { texto: "Segue a foto do produto 👆" } : {}) });
      continue;
    }
    if (k === 4) { out.push({ ...base, tipo: "audio", url: `/uploads/au-${id}-${Math.round(300 * SCALE)}.ogg`, ...(i % 2 ? { audio_duracao_sec: 2 } : {}) }); continue; }
    if (k === 6) { out.push({ ...base, tipo: "audio", url: `/uploads/au-${id}-${Math.round(1600 * SCALE)}.ogg` }); continue; }
    if (k === 7) { out.push({ ...base, tipo: "sticker", url: `/uploads/st-${id}-512x512-${Math.round(700 * SCALE)}.png` }); continue; }
    if (k === 8) { out.push({ ...base, tipo: "documento", url: `/uploads/doc-${id}.pdf`, nome_arquivo: "Orcamento-2026.pdf", texto: "Orcamento-2026.pdf" }); continue; }
    if (k === 10) {
      out.push({ ...base, tipo: "texto", texto: "Olha esse modelo https://loja.invalid/produto/123",
        reply_meta: { link_preview: { url: "https://loja.invalid/produto/123", title: "Cadeira Gamer Pro", description: "Frete grátis para todo o Brasil", preview: `${API}/uploads/lp-${id}-1200x630-${Math.round(1100 * SCALE)}.png` } } });
      continue;
    }
    if (k === 11) { out.push({ ...base, tipo: "texto", texto: "Esse aqui?", reply_meta: { name: "Contato", snippet: "📷 Foto", replyToId: id - 2 } }); continue; }
    if (k === 12) { out.push({ ...base, direcao: "in", tipo: "reaction", texto: "Reação: 👍", reply_meta: { replyToId: id - 3 } }); continue; }
    if (k === 14) { out.push({ ...base, tipo: "internal_note", direcao: "interna", texto: "Nota interna: cliente pediu desconto de 10%" }); continue; }
    if (k === 15) { out.push({ ...base, tipo: "video", url: `/uploads/vid-${id}.mp4` }); continue; }
    if (k === 16) { out.push({ ...base, tipo: "texto", texto: "😂😂" }); continue; }
    if (k === 0) { out.push({ ...base, tipo: "texto", texto: "Bom dia! Gostaria de saber se vocês ainda têm aquele modelo disponível em estoque, e se fazem entrega para o interior. Também queria saber as formas de pagamento, se aceitam Pix e cartão parcelado em até 10x sem juros. Obrigado pela atenção, aguardo o retorno o quanto antes." }); continue; }
    out.push({ ...base, tipo: "texto", texto: `Mensagem ${i + startIdx} ${"tudo certo ".repeat((i % 4) + 1)}` });
  }
  // Uma foto 404 (proxy e direta), uma foto pendente para sempre, um áudio que falha
  out.push({ id: cid * 10000 + n, conversa_id: cid, direcao: "in", status: "lido", criado_em: new Date(T0 + 4 * DAY - 9 * 60000).toISOString(), tipo: "imagem", url: "/uploads/ph-404.png" });
  out.push({ id: cid * 10000 + n + 1, conversa_id: cid, direcao: "out", status: "entregue", usuario_nome: "Eva", enviado_por_usuario: true, criado_em: new Date(T0 + 4 * DAY - 8 * 60000).toISOString(), tipo: "imagem", url: "/uploads/ph-never.png" });
  out.push({ id: cid * 10000 + n + 2, conversa_id: cid, direcao: "in", status: "lido", criado_em: new Date(T0 + 4 * DAY - 7 * 60000).toISOString(), tipo: "audio", url: "/uploads/au-fail-500.ogg" });
  out.push({ id: cid * 10000 + n + 3, conversa_id: cid, direcao: "in", status: "lido", criado_em: new Date(T0 + 4 * DAY - 6 * 60000).toISOString(), tipo: "texto", texto: "Consegue me mandar as fotos de novo?" });
  return out;
}

/** Página real: sem cursor = últimas `limit`; com cursor = as `limit` anteriores ao índice. */
export function page(all, url, defLimit = 16) {
  const limit = Number(url.searchParams.get("limit")) || defLimit;
  const cursor = url.searchParams.get("cursor");
  const end = cursor != null ? Number(cursor) : all.length;
  const start = Math.max(0, end - limit);
  return { mensagens: all.slice(start, end), next_cursor: start > 0 ? String(start) : null, next_cursor_id: start > 0 ? all[start].id : null };
}

/** Handler de mídia: interpreta o nome do arquivo (dimensão, atraso, 404, pendente). */
export async function mediaHandler(p, url) {
  let path = p;
  if (p === "/media/proxy") {
    const inner = url.searchParams.get("url") || "";
    try { path = new URL(inner).pathname; } catch { path = inner; }
    path = "/uploads" + path.replace(/^\/uploads/, "");
  }
  if (!path.startsWith("/uploads/")) return null;
  if (/ph-404/.test(path)) return { delay: 400, status: 404, contentType: "text/plain", body: "not found" };
  if (/ph-never/.test(path)) return { never: true };
  if (/au-fail-500/.test(path)) return { delay: 600, status: 500, contentType: "text/plain", body: "err" };
  let m = path.match(/(?:ph|st|lp)-\d+-(\d+)x(\d+)-(\d+)\.png$/);
  if (m) return { delay: Number(m[3]), contentType: "image/png", body: makePng(Number(m[1]), Number(m[2]), Number(m[1]) % 7), headers: { "cache-control": "max-age=3600" } };
  m = path.match(/au-\d+-(\d+)\.ogg$/);
  if (m) return { delay: Number(m[1]), contentType: "audio/ogg", body: audioOgg };
  if (/\.pdf$/.test(path)) return { delay: 200, contentType: "application/pdf", body: PDF };
  if (/\.mp4$/.test(path)) return { delay: 500, status: 404, contentType: "text/plain", body: "gone" };
  return { status: 404, contentType: "text/plain", body: "x" };
}
