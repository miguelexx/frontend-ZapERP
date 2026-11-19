// Ranking gamificado — regras de apresentação (contagem regressiva, celebração única,
// texto do campeão com empate, datas no fuso da competição).

import assert from "node:assert/strict";

if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
}

const u = await import("../src/ranking/rankingUtils.js");

// --- contagem regressiva ------------------------------------------------------
assert.equal(u.formatarTempoRestante(0), "apurando resultado…");
assert.equal(u.formatarTempoRestante(-5000), "apurando resultado…");
assert.equal(u.formatarTempoRestante((2 * 86400 + 5 * 3600 + 12 * 60) * 1000), "2d 5h 12min");
assert.equal(u.formatarTempoRestante((5 * 3600 + 7 * 60) * 1000), "5h 07min");
assert.equal(u.formatarTempoRestante((12 * 60 + 8) * 1000), "12min 08s");

// --- medalhas -----------------------------------------------------------------
assert.equal(u.medalhaDaPosicao(1), "🥇");
assert.equal(u.medalhaDaPosicao(3), "🥉");
assert.equal(u.medalhaDaPosicao(4), null);

// --- texto do campeão ---------------------------------------------------------
const um = u.mensagemCampeao({ vencedores: [{ nome: "João" }], total_vencedor: 87 });
assert.equal(um.titulo, "Temos um campeão!");
assert.equal(um.destaque, "João conquistou o 1º lugar nesta semana!");
assert.equal(um.total, "Foram 87 atendimentos realizados.");
const empate = u.mensagemCampeao({ vencedores: [{ nome: "Ana" }, { nome: "João" }, { nome: "Maria" }], total_vencedor: 10 });
assert.equal(empate.titulo, "Temos campeões!");
assert.equal(empate.destaque, "Ana, João e Maria dividiram o 1º lugar nesta semana!");
assert.equal(u.mensagemCampeao({ vencedores: [] }), null);
assert.equal(u.rotuloAtendimentos(1), "1 atendimento");

// --- celebração: uma vez por pessoa, só recente e com vencedor ------------------
const agora = Date.parse("2026-11-20T21:05:00Z");
const ciclo = { id: 12, status: "encerrado", vencedores: [{ nome: "João" }], encerrado_em: "2026-11-20T21:00:30Z", fim: "2026-11-20T21:00:00Z" };
assert.equal(u.deveCelebrar(ciclo, 0, agora), true);
assert.equal(u.deveCelebrar(ciclo, 12, agora), false, "já visto");
assert.equal(u.deveCelebrar({ ...ciclo, vencedores: [] }, 0, agora), false, "sem vencedor");
assert.equal(u.deveCelebrar({ ...ciclo, status: "cancelado" }, 0, agora), false, "cancelado");
assert.equal(u.deveCelebrar(ciclo, 0, agora + 4 * 86400000), false, "antigo demais");

const user = { id: 3, company_id: 7 };
assert.equal(u.lerCelebracaoVista(user), 0);
u.marcarCelebracaoVista(user, 12);
assert.equal(u.lerCelebracaoVista(user), 12);
u.marcarCelebracaoVista(user, 5); // nunca regride
assert.equal(u.lerCelebracaoVista(user), 12);
assert.equal(u.lerCelebracaoVista({ id: 3, company_id: 8 }), 0, "chave por empresa+usuário");

// --- datas no fuso da competição ---------------------------------------------
assert.match(u.formatarDataHora("2026-11-20T21:00:00Z", "America/Sao_Paulo"), /20\/11 às 18:00$/);
assert.match(u.formatarDataHora("2026-11-20T21:00:00Z", "America/Cuiaba"), /20\/11 às 17:00$/);
assert.equal(u.formatarDataHora(null), "—");
assert.equal(u.formatarPeriodo("2026-11-13T21:00:00Z", "2026-11-20T21:00:00Z", "America/Sao_Paulo"), "13/11 – 20/11/2026");
assert.equal(u.juntarNomes(["A", "B"]), "A e B");

console.log("test-ranking-gamificado: ok");
