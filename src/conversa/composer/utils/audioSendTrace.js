/**
 * Cronómetro do envio de áudio — desligado por omissão.
 *
 * Em 05/11/2026 o Miguel relatou que no telemóvel o áudio "não aparece de primeira".
 * Reproduzi o caminho inteiro num Chromium com microfone falso — desktop e telemóvel,
 * conversa curta (renderizador estático) e longa de 220 mensagens (virtualizado) — e a
 * bolha otimista apareceu sempre em ~120 ms. As duas suspeitas óbvias ficaram medidas e
 * descartadas: `inspectRecordedAudioBlob` custa 42–316 ms (nunca chega ao timeout de
 * 1500 ms, nem com 60 s de áudio) e `garantirConversaAbertaParaEnvio` não faz HTTP com a
 * conversa aberta.
 *
 * Ou seja: o atraso depende de algo do aparelho real — codec do iOS (mp4 em vez de webm),
 * CPU mais lenta, ou a rede. Em vez de adivinhar, isto mede lá.
 *
 * LIGAR no aparelho: `localStorage.setItem("zap_audio_trace", "1")` e recarregar.
 * DESLIGAR: `localStorage.removeItem("zap_audio_trace")`.
 *
 * Com a flag desligada cada chamada é uma leitura de variável e um `return` — nada de
 * `performance.now()`, nada de strings. É seguro deixar no caminho quente.
 */

let ligado = null;
let t0 = 0;
let marcas = [];

function estaLigado() {
  if (ligado !== null) return ligado;
  try {
    ligado = localStorage.getItem("zap_audio_trace") === "1";
  } catch {
    ligado = false;
  }
  return ligado;
}

/** Começa um envio. Chamar quando o utilizador solta o botão de enviar. */
export function audioTraceInicio() {
  if (!estaLigado()) return;
  t0 = performance.now();
  marcas = [];
}

/** Marca um ponto do caminho. */
export function audioTraceMarca(nome, extra) {
  if (!estaLigado() || !t0) return;
  marcas.push({ nome, ms: Math.round(performance.now() - t0), ...(extra ? { extra } : {}) });
}

/** Fecha o envio e imprime a linha do tempo. */
export function audioTraceFim(nome = "fim") {
  if (!estaLigado() || !t0) return;
  audioTraceMarca(nome);
  // Uma linha por marca, com o delta desde a anterior: é o delta que diz onde o tempo foi.
  const linhas = marcas.map((m, i) => {
    const anterior = i > 0 ? marcas[i - 1].ms : 0;
    return `${String(m.ms).padStart(6)}ms  (+${String(m.ms - anterior).padStart(5)}ms)  ${m.nome}${
      m.extra ? "  " + JSON.stringify(m.extra) : ""
    }`;
  });
  console.info("[áudio] linha do tempo do envio:\n" + linhas.join("\n"));
  t0 = 0;
  marcas = [];
}
