/**
 * Regressão: "Salvar como…" de QUALQUER mídia (auditoria de mídia 2026-10-20).
 *
 * Antes desta auditoria só documento tinha download. Imagem/vídeo/áudio/figurinha não tinham
 * nenhuma ação de salvar, e o menu nativo do navegador também não alcança a mídia — a bolha
 * desliga `pointer-events`/`-webkit-touch-callout` de propósito para o gesto cair no menu do
 * app. Este teste trava:
 *   1) quais mensagens oferecem o item "Salvar como…";
 *   2) o nome do arquivo gravado (nome real do cliente + extensão certa, nunca sem extensão);
 *   3) o nome gerado quando a mídia não tem nome (padrão IMG-/VID-/AUD-/STK-);
 *   4) o href de download continua autenticado (proxy com attachment) e `/uploads` direto.
 *
 * Executar: node --import ./scripts/vite-env-shim.mjs scripts/test-media-download.mjs
 */
import {
  extensionFromMimeType,
  extensionFromUrl,
  fallbackMediaFilename,
  resolveMediaSaveFilename,
  sanitizeSaveFilename,
} from "../src/conversa/mediaSaveName.js";
import { podeBaixarMidiaDaMensagem } from "../src/conversa/mediaDownload.js";
import {
  buildMediaDownloadHref,
  resolveDownloadFilename,
} from "../src/conversa/utils/conversaViewHelpers.js";

let falhas = 0;
let cenarios = 0;
function checar(nome, condicao, detalhe) {
  cenarios += 1;
  if (condicao) return;
  falhas += 1;
  console.error(`FALHOU: ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
}

const CRIADO = "2026-10-20T15:30:45.000Z";
const PROXY = "https://api.local/media/proxy?url=https%3A%2F%2Fmmg.whatsapp.net%2Fv%2Ft62%2Fabc";

// ---------------------------------------------------------------- 1) quem pode baixar
{
  const imagem = { id: 10, conversa_id: 1, tipo: "imagem", direcao: "in", url: "/uploads/inbound-c1-m10-ab.jpg" };
  checar("imagem recebida oferece salvar", podeBaixarMidiaDaMensagem(imagem, { mediaUrl: "/uploads/x.jpg", out: false }));

  const audio = { id: 11, conversa_id: 1, tipo: "voice", direcao: "out", url: "/uploads/a.ogg" };
  checar("áudio enviado oferece salvar", podeBaixarMidiaDaMensagem(audio, { mediaUrl: "/uploads/a.ogg", out: true }));

  const texto = { id: 12, conversa_id: 1, tipo: "texto", direcao: "in", texto: "oi" };
  checar("texto não oferece salvar", !podeBaixarMidiaDaMensagem(texto, { mediaUrl: "", out: false }));

  const revogada = { id: 13, conversa_id: 1, tipo: "imagem", direcao: "in", url: "/uploads/x.jpg", apagada_para_todos: true };
  checar("mídia apagada para todos não oferece salvar", !podeBaixarMidiaDaMensagem(revogada, { mediaUrl: "/uploads/x.jpg", out: false }));

  const semUrlRecuperavel = { id: 14, conversa_id: 1, tipo: "imagem", direcao: "in", url: "" };
  checar(
    "mídia recebida sem URL ainda oferece salvar (backend pode recuperar a cópia)",
    podeBaixarMidiaDaMensagem(semUrlRecuperavel, { mediaUrl: "", out: false })
  );

  const outSemUrl = { id: 15, conversa_id: 1, tipo: "imagem", direcao: "out", url: "" };
  checar(
    "mídia nossa sem URL não oferece salvar (nada para baixar)",
    !podeBaixarMidiaDaMensagem(outSemUrl, { mediaUrl: "", out: true })
  );

  // Documento reconhecido só pelo texto (tipo='texto'): a bolha é de arquivo, mas sem URL não
  // existe cópia para o backend recuperar — não oferece uma ação que só daria erro.
  const textoQueParaceArquivo = { id: 16, conversa_id: 1, tipo: "texto", direcao: "in", texto: "Contrato.pdf" };
  checar(
    "documento só-texto sem URL não oferece salvar",
    !podeBaixarMidiaDaMensagem(textoQueParaceArquivo, { mediaUrl: "", out: false, ehMidia: true })
  );
  checar(
    "documento só-texto COM URL oferece salvar",
    podeBaixarMidiaDaMensagem(
      { ...textoQueParaceArquivo, url: "/uploads/inbound-c1-m16-ab.pdf" },
      { mediaUrl: "/uploads/inbound-c1-m16-ab.pdf", out: false, ehMidia: true }
    )
  );

  const otimista = { tempId: "tmp-1", conversa_id: 1, tipo: "imagem", direcao: "out", url: "blob:http://app.local/a" };
  checar(
    "bolha otimista (sem id do banco) oferece salvar pelo blob local",
    podeBaixarMidiaDaMensagem(otimista, { mediaUrl: "blob:http://app.local/a", out: true })
  );
}

// ---------------------------------------------------------------- 2) nome real preservado
{
  checar(
    "nome real com extensão é mantido",
    resolveMediaSaveFilename({ nomeArquivo: "Contrato Social 2026.pdf", url: "/uploads/inbound-c1-m2-7f3a.pdf", tipo: "arquivo" }) ===
      "Contrato Social 2026.pdf"
  );
  checar(
    "nome real SEM extensão herda a do arquivo (antes salvava o nome técnico do disco)",
    resolveMediaSaveFilename({ nomeArquivo: "Contrato Social", url: "/uploads/inbound-c1-m2-7f3a.pdf", tipo: "arquivo" }) ===
      "Contrato Social.pdf"
  );
  // URL absoluta de propósito: `filenameFromUrl` resolve path relativo com `window.location`,
  // que não existe no node.
  const UPLOAD_ABS = "https://api.local/uploads/inbound-c1-m2-7f3a.pdf";
  checar(
    "resolveDownloadFilename (card do documento) também preserva o nome real",
    resolveDownloadFilename("Contrato Social", UPLOAD_ABS) === "Contrato Social.pdf",
    resolveDownloadFilename("Contrato Social", UPLOAD_ABS)
  );
  checar(
    "resolveDownloadFilename sem nome continua usando o arquivo da URL",
    resolveDownloadFilename("", UPLOAD_ABS) === "inbound-c1-m2-7f3a.pdf",
    resolveDownloadFilename("", UPLOAD_ABS)
  );
  checar(
    "caminho relativo não escapa do nome do arquivo",
    sanitizeSaveFilename('../../etc/pass"wd.pdf') === "passwd.pdf",
    sanitizeSaveFilename('../../etc/pass"wd.pdf')
  );
  checar(
    "caminho do Windows vira só o nome",
    sanitizeSaveFilename("C:\\Users\\x\\Relatório.pdf") === "Relatório.pdf",
    sanitizeSaveFilename("C:\\Users\\x\\Relatório.pdf")
  );
  checar("placeholder 'arquivo' não vira nome", !resolveMediaSaveFilename({ nomeArquivo: "arquivo", tipo: "imagem", criadoEm: CRIADO }).startsWith("arquivo"));
}

// ---------------------------------------------------------------- 3) nome gerado por tipo
{
  const imagem = resolveMediaSaveFilename({ tipo: "imagem", url: PROXY, criadoEm: CRIADO, mimeType: "image/jpeg" });
  checar("imagem sem nome recebe IMG-… .jpg", /^IMG-\d{8}-\d{6}\.jpg$/.test(imagem), imagem);

  const video = resolveMediaSaveFilename({ tipo: "video", criadoEm: CRIADO, mimeType: "video/mp4" });
  checar("vídeo sem nome recebe VID-… .mp4", /^VID-\d{8}-\d{6}\.mp4$/.test(video), video);

  const audio = resolveMediaSaveFilename({ tipo: "voice", criadoEm: CRIADO });
  checar("áudio sem nome e sem mime cai em .ogg (formato do WhatsApp)", /^AUD-\d{8}-\d{6}\.ogg$/.test(audio), audio);

  const sticker = resolveMediaSaveFilename({ tipo: "figurinha", criadoEm: CRIADO });
  checar("figurinha sem nome recebe STK-… .webp", /^STK-\d{8}-\d{6}\.webp$/.test(sticker), sticker);

  /*
   * Content-Type que contradiz o tipo da mensagem não decide a extensão: o proxy já anunciou
   * vídeo MP4 sem extensão como `audio/mp4` (sniffer de áudio), e salvar daria VID-….m4a.
   */
  const videoComMimeDeAudio = resolveMediaSaveFilename({ tipo: "video", criadoEm: CRIADO, mimeType: "audio/mp4" });
  checar("vídeo anunciado como audio/mp4 ainda salva .mp4", /^VID-\d{8}-\d{6}\.mp4$/.test(videoComMimeDeAudio), videoComMimeDeAudio);
  const audioEmWebm = resolveMediaSaveFilename({ tipo: "voice", criadoEm: CRIADO, mimeType: "audio/webm" });
  checar("contêiner ambíguo (webm) é respeitado", /\.webm$/.test(audioEmWebm), audioEmWebm);
  const imagemPng = resolveMediaSaveFilename({ tipo: "imagem", criadoEm: CRIADO, mimeType: "image/png" });
  checar("imagem PNG salva .png (mime coerente manda)", /\.png$/.test(imagemPng), imagemPng);

  checar("nunca sai nome sem extensão quando há mime", !!extensionFromMimeType("audio/ogg; codecs=opus"));
  checar("mime desconhecido não inventa 'octet'", extensionFromMimeType("application/octet-stream") === "");
  const semExt = fallbackMediaFilename({ tipo: "imagem", criadoEm: CRIADO });
  checar("fallback sem extensão não deixa ponto solto", /^IMG-\d{8}-\d{6}$/.test(semExt), semExt);
  checar(
    "tipo desconhecido ainda gera nome utilizável",
    /^ZAP-\d{8}-\d{6}\.bin$/.test(fallbackMediaFilename({ tipo: "coisa", criadoEm: CRIADO, ext: "bin" }))
  );
}

// ---------------------------------------------------------------- 4) extensão a partir da URL
{
  checar("extensão sai da URL interna do proxy", extensionFromUrl("https://api.local/media/proxy?url=https%3A%2F%2Fx.s3.amazonaws.com%2Fultramsgmedia%2Ffoto.jpeg") === "jpeg");
  checar("extensão sai do filename do proxy", extensionFromUrl("https://api.local/media/proxy?url=https%3A%2F%2Fx%2Fsemext&filename=Boleto.pdf") === "pdf");
  checar("URL sem extensão não inventa", extensionFromUrl("https://mmg.whatsapp.net/v/t62/abc") === "");
  checar("blob local não tem extensão", extensionFromUrl("blob:http://app.local/abc") === "");
}

// ---------------------------------------------------------------- 5) href do download
{
  const externo = buildMediaDownloadHref("https://mmg.whatsapp.net/v/t62/abc", null, "IMG-20261020-153045.jpg");
  const parsed = new URL(externo);
  checar("mídia externa baixa pelo proxy autenticado", parsed.pathname.endsWith("/media/proxy"), externo);
  checar("download força attachment", parsed.searchParams.get("disposition") === "attachment", externo);
  checar("download leva o nome do arquivo", parsed.searchParams.get("filename") === "IMG-20261020-153045.jpg", externo);

  const local = buildMediaDownloadHref("/uploads/inbound-c1-m10-ab.jpg", null, "IMG-20261020-153045.jpg");
  const parsedLocal = new URL(local);
  checar("mídia em /uploads baixa direto (sem proxy)", parsedLocal.pathname === "/uploads/inbound-c1-m10-ab.jpg", local);
  checar("/uploads recebe filename+attachment", parsedLocal.searchParams.get("disposition") === "attachment", local);

  const blob = buildMediaDownloadHref("blob:http://app.local/abc", null, "IMG.jpg");
  checar("blob otimista continua sendo o próprio blob", blob === "blob:http://app.local/abc", blob);
}

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam de ${cenarios}.`);
  process.exit(1);
}
console.log(`OK — regressão de "Salvar como…" de mídia passou (${cenarios} verificações).`);
