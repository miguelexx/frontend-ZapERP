/**
 * Teste de PROPRIEDADE da ordem de rajadas sob relógios dessincronizados.
 *
 * A propriedade certa NÃO é "a ordem exibida é a ordem de envio": se o servidor carimbar
 * duas mensagens fora da ordem de envio, a ordem correta passa a ser a dele (é a que
 * aparece após o F5, e o comparador trata o horário do servidor como fonte de verdade).
 *
 * A propriedade que interessa ao atendente é a ausência de PULO:
 *   enquanto parte da rajada reconcilia e parte ainda é otimista, a ordem exibida tem de
 *   ser IGUAL à ordem final. Nada muda de lugar na tela.
 *
 * Era exatamente isso que quebrava: a bolha otimista nascia no relógio do navegador e as já
 * reconciliadas pulavam para o relógio do servidor, adiantado ~2-3 s (medido em produção em
 * 10/10/2026), de modo que a última da rajada aparecia em primeiro por alguns segundos.
 *
 * Roda: node --import ./scripts/vite-env-shim.mjs scripts/test-burst-order-property.mjs
 */
import { sortMensagensChronological } from "../src/conversa/conversaOutboundMediaMerge.js";
import { resolveOptimisticCriadoEm } from "../src/conversa/conversaOptimisticMessage.js";
import {
  estimatedServerNowMs,
  observeServerTimestamp,
  resetServerClockSkew,
} from "../src/conversa/serverClockSkew.js";

/** PRNG determinístico — falha reproduzível vale mais que aleatoriedade real. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ordemExibida = (lista) =>
  sortMensagensChronological(lista)
    .map((m) => m.__idx)
    .join(",");

/**
 * Uma rajada completa. `compensar` liga a âncora pelo relógio estimado do servidor;
 * `conheceSkew` simula já ter reconciliado algo antes (caso normal fora do 1º envio).
 */
function rodarRajada({ seed, compensar, conheceSkew }) {
  const rand = rng(seed);
  const skewReal = Math.floor(rand() * 6000) - 1000; // servidor de -1 s a +5 s
  const base = 1_760_000_000_000;
  const n = 2 + Math.floor(rand() * 6);

  resetServerClockSkew();
  if (compensar && conheceSkew) {
    observeServerTimestamp(base - 60_000 + skewReal, base - 60_000);
  }

  const lista = [];
  const pendentes = [];
  let relogioServidor = base + skewReal - 1;
  for (let i = 0; i < n; i++) {
    const agoraCliente = base + i * (5 + Math.floor(rand() * 45));
    const ancora = compensar ? estimatedServerNowMs(agoraCliente) : agoraCliente;
    const msg = {
      __idx: i,
      tempId: `tmp-${i}`,
      direcao: "out",
      criado_em: resolveOptimisticCriadoEm(ancora, lista),
      _stableInsertSeq: i,
    };
    lista.push(msg);
    // O servidor recebe os envios em sequência pela mesma conexão: carimbo monotônico.
    relogioServidor = Math.max(relogioServidor + 1, agoraCliente + skewReal);
    pendentes.push({ msg, srv: relogioServidor });
  }

  // Os ACKs voltam fora de ordem (rede/mídia são assíncronas).
  const ordemAck = [...pendentes];
  for (let i = ordemAck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ordemAck[i], ordemAck[j]] = [ordemAck[j], ordemAck[i]];
  }

  const intermediarias = [ordemExibida(lista)];
  for (const { msg, srv } of ordemAck) {
    if (compensar) observeServerTimestamp(srv, srv - skewReal);
    msg.id = 9000 + msg.__idx;
    delete msg.tempId;
    msg.criado_em = new Date(srv).toISOString();
    intermediarias.push(ordemExibida(lista));
  }

  const final = intermediarias[intermediarias.length - 1];
  const pulou = intermediarias.some((o) => o !== final);
  return { pulou, final };
}

function medir({ compensar, conheceSkew, rodadas = 400, seed0 = 11 }) {
  let pulos = 0;
  for (let r = 0; r < rodadas; r++) {
    if (rodarRajada({ seed: seed0 + r * 101, compensar, conheceSkew }).pulou) pulos++;
  }
  return pulos;
}

const RODADAS = 400;
const semCorrecao = medir({ compensar: false, conheceSkew: false, rodadas: RODADAS });
const comCorrecaoFrio = medir({ compensar: true, conheceSkew: false, rodadas: RODADAS });
const comCorrecaoQuente = medir({ compensar: true, conheceSkew: true, rodadas: RODADAS });

console.log(`  sem compensação .................. ${semCorrecao}/${RODADAS} rajadas com pulo`);
console.log(`  com compensação, 1º envio ........ ${comCorrecaoFrio}/${RODADAS} rajadas com pulo`);
console.log(`  com compensação, skew conhecido .. ${comCorrecaoQuente}/${RODADAS} rajadas com pulo`);

let falhou = false;

// 1) A simulação precisa reproduzir o bug — teste que passa dos dois lados não prova nada.
if (semCorrecao === 0) {
  console.error("FALHOU: sem compensação nada pulou; a simulação não reproduz o defeito.");
  falhou = true;
}

// 2) Caso normal (já houve uma reconciliação antes nesta sessão): nunca pode pular.
if (comCorrecaoQuente !== 0) {
  console.error(`FALHOU: com a dessincronia conhecida ainda houve ${comCorrecaoQuente} pulos.`);
  falhou = true;
}

// 3) LIMITAÇÃO CONHECIDA, travada aqui de propósito: no PRIMEIRO envio depois de abrir a
//    tela o cliente ainda não observou nenhum horário do servidor, então a âncora cai no
//    relógio local e a rajada ainda pode pular. Fechar isso exige o backend expor o header
//    `Date` via Access-Control-Expose-Headers (ou um endpoint de hora), para o cliente
//    aprender a dessincronia antes do primeiro envio.
if (comCorrecaoFrio < semCorrecao * 0.5) {
  console.error(
    "FALHOU (bom problema): o 1º envio melhorou mais do que o esperado — reavalie se a " +
      "limitação documentada ainda existe e atualize este teste."
  );
  falhou = true;
}

resetServerClockSkew();
if (falhou) process.exit(1);
console.log(`OK — ordem de rajadas: ${RODADAS * 3} simulações, sem pulo quando o skew é conhecido.`);
