/**
 * Regressão: mídia recebida SEM URL (provedor mandou o evento sem o link).
 *
 * Print de 15/10/2026 mostrava um chip "🎤 Áudio" solto e uma bolha "Mensagem", ambos SEM horário:
 * toda bolha que cai no rótulo de fallback ficava sem hora e sem tique, porque nem o meta inline
 * (que mora no TextMessage) nem o flutuante (showFloatingMetaTime) alcançavam o fallback. E a
 * caixa de citação mostrava "(mensagem)" cru, que é placeholder interno, não texto do cliente.
 *
 * Executar: node --import ./scripts/vite-env-shim.mjs scripts/test-inbound-media-no-url.mjs
 */
import {
  classifyBubbleMessage,
  getFallbackContentLabel,
  placeholderSnippetLabel,
} from "../src/conversa/bubble/utils/bubbleClassify.js";

let falhas = 0;
function check(obtido, esperado, msg) {
  if (obtido !== esperado) {
    falhas++;
    console.error(`FALHOU: ${msg}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`);
  }
}

const CRIADO = "2026-10-15T13:56:00.000Z";

// 1) Áudio recebido sem URL: cai no rótulo tipado e PRECISA do meta inline (é a única hora que terá).
const audioSemUrl = classifyBubbleMessage(
  { id: 1, tipo: "audio", texto: "(áudio)", direcao: "in", criado_em: CRIADO, url: null },
  ""
);
check(audioSemUrl.hasText, false, "áudio sem URL não tem texto renderizável");
check(audioSemUrl.fallbackContentLabel, "🎤 Áudio", "áudio sem URL usa rótulo tipado");
check(audioSemUrl.showFloatingMetaTime, false, "sem player não há meta flutuante");
check(audioSemUrl.hasInlineMetaClass, true, "áudio sem URL precisa do meta inline para ter horário");

// 2) Áudio COM URL continua como antes: hora dentro do player, sem meta inline.
const audioComUrl = classifyBubbleMessage(
  { id: 2, tipo: "audio", texto: "(áudio)", direcao: "in", criado_em: CRIADO, url: "https://cdn/a.ogg" },
  "https://cdn/a.ogg"
);
check(audioComUrl.hasInlineMetaClass, false, "áudio com player NÃO ganha meta inline (não regredir)");
check(audioComUrl.showFloatingMetaTime, true, "áudio com player mantém o meta flutuante");

// 3) Espelho de mídia enviada pelo celular sem link: bolha "Mensagem", com meta inline.
const espelho = classifyBubbleMessage(
  { id: 3, tipo: "texto", texto: "(mensagem)", direcao: "out", criado_em: CRIADO, url: null },
  ""
);
check(espelho.hasText, false, "placeholder genérico não vira texto da bolha");
check(espelho.fallbackContentLabel, "Mensagem", "placeholder genérico usa rótulo 'Mensagem'");
check(espelho.hasInlineMetaClass, true, "bolha 'Mensagem' tem meta inline");

// 4) Foto recebida sem link: agora chega como placeholder tipado (antes era descartada no backend).
check(getFallbackContentLabel("texto", "(imagem)"), "📷 Foto", "placeholder (imagem) vira 📷 Foto");
check(getFallbackContentLabel("texto", "(vídeo)"), "🎥 Vídeo", "placeholder (vídeo) vira 🎥 Vídeo");

// 5) Citação: placeholder interno nunca aparece cru para o atendente.
// (replySnippetDisplay delega a este helper; o módulo dele importa um .jsx e não roda em Node puro.)
check(placeholderSnippetLabel("(mensagem)"), "Mensagem", "citação traduz (mensagem)");
check(placeholderSnippetLabel("(áudio)"), "🎤 Áudio", "citação traduz (áudio)");
check(placeholderSnippetLabel("(mídia)"), "📎 Mídia", "citação traduz (mídia)");
check(placeholderSnippetLabel("(arquivo)"), "📄 Documento", "citação traduz (arquivo)");
check(placeholderSnippetLabel("bom dia"), null, "texto real passa intacto (null = não traduzir)");
check(placeholderSnippetLabel(""), null, "snippet vazio não vira rótulo");

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) em mídia recebida sem URL.`);
  process.exit(1);
}
console.log("OK — mídia recebida sem URL: rótulo tipado, horário na bolha e citação traduzida.");
