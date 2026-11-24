/**
 * Regras do modal de Atendentes (co-atendimento). Espelham o backend
 * (attendanceController): quem inclui, quem remove, limite e encerrada.
 * Executar: node scripts/test-atendentes-regras.mjs
 */
import assert from "node:assert/strict";
import {
  MAX_CO_ATENDENTES,
  calcularPermissoes,
  filtrarDisponiveis,
  initials,
  normalizarBusca,
  perfilLabel,
} from "../src/atendimento/atendentesRegras.js";

const principal = { tipo: "principal", usuario_id: 9, usuario: { nome: "Gabriella" } };
const co = (id, addPor) => ({
  tipo: "participante",
  usuario_id: id,
  adicionado_por_usuario: addPor != null ? { id: addPor, nome: `U${addPor}` } : null,
});
const base = { participantes: [principal, co(5, 7)], podeAdicionar: true, encerrada: false };

let n = 0;
const t = (nome, fn) => { fn(); n++; console.log(`  ok  ${nome}`); };

t("responsável inclui outros e remove qualquer co-atendente", () => {
  const p = calcularPermissoes({ ...base, meuUsuarioId: "9", meuPerfil: "atendente" });
  assert.equal(p.souPrincipal, true);
  assert.equal(p.podeIncluirOutros, true);
  assert.equal(p.podeParticipar, false);
  assert.equal(p.podeRemover(co(5, 7)), true);
  assert.equal(p.podeRemover(principal), false, "principal nunca é removível (Transferir)");
});

t("atendente sem vínculo só pode Participar (backend dá 403 para terceiros)", () => {
  const p = calcularPermissoes({ ...base, meuUsuarioId: 2, meuPerfil: "atendente" });
  assert.equal(p.podeIncluirOutros, false);
  assert.equal(p.podeParticipar, true);
  assert.equal(p.podeRemover(co(5, 7)), false);
  const lista = filtrarDisponiveis(
    [{ id: 2, nome: "Eu" }, { id: 3, nome: "Outro" }],
    { participantesIds: new Set([9, 5]), busca: "", podeIncluirOutros: p.podeIncluirOutros, me: p.me }
  );
  assert.deepEqual(lista.map((u) => u.id), [2]);
});

t("co-atendente inclui outros, sai sozinho, e remove só quem ele incluiu", () => {
  const p = calcularPermissoes({
    ...base,
    participantes: [principal, co(5, 7), co(7, 9)],
    meuUsuarioId: 7,
    meuPerfil: "atendente",
  });
  assert.equal(p.souCo, true);
  assert.equal(p.podeIncluirOutros, true);
  assert.equal(p.podeRemover(co(5, 7)), true, "incluiu o 5");
  assert.equal(p.podeRemover(co(7, 9)), true, "sair");
  assert.equal(p.podeRemover(co(8, 9)), false, "não incluiu o 8");
});

t("admin/supervisor fazem tudo", () => {
  for (const perfil of ["admin", "Supervisor"]) {
    const p = calcularPermissoes({ ...base, meuUsuarioId: 1, meuPerfil: perfil });
    assert.equal(p.podeIncluirOutros, true);
    assert.equal(p.podeRemover(co(5, 7)), true);
  }
});

t("sem responsável: ninguém adiciona (backend pede para assumir)", () => {
  const p = calcularPermissoes({ ...base, participantes: [], meuUsuarioId: 1, meuPerfil: "admin" });
  assert.equal(p.podeIncluirOutros, false);
  assert.equal(p.podeParticipar, false);
});

t("encerrada: somente leitura, nem remover", () => {
  const p = calcularPermissoes({ ...base, encerrada: true, meuUsuarioId: 1, meuPerfil: "admin" });
  assert.equal(p.podeIncluirOutros, false);
  assert.equal(p.podeRemover(co(5, 7)), false);
});

t("limite de co-atendentes", () => {
  const cheios = [principal, ...Array.from({ length: MAX_CO_ATENDENTES }, (_, i) => co(20 + i, 9))];
  assert.equal(calcularPermissoes({ ...base, participantes: cheios, meuUsuarioId: 9 }).limiteAtingido, true);
  assert.equal(calcularPermissoes({ ...base, meuUsuarioId: 9 }).limiteAtingido, false);
  assert.equal(MAX_CO_ATENDENTES, 3);
});

t("busca ignora acento e caixa, também por e-mail, e esconde quem já participa", () => {
  const disp = [
    { id: 1, nome: "Gabriéla Teixeira", email: "gt@x.com" },
    { id: 2, nome: "Marcio", email: "marcio@x.com" },
    { id: 9, nome: "Gabriella" },
  ];
  const f = (busca) =>
    filtrarDisponiveis(disp, { participantesIds: new Set([9]), busca, podeIncluirOutros: true, me: 9 }).map((u) => u.id);
  assert.deepEqual(f("gabriela"), [1]);
  assert.deepEqual(f("  MARCIO@ "), [2]);
  assert.deepEqual(f(""), [1, 2]);
  assert.equal(normalizarBusca("ÁÉÍ õ"), "aei o");
});

t("rótulos e iniciais", () => {
  assert.equal(perfilLabel("admin"), "Administrador");
  assert.equal(perfilLabel("ATENDENTE"), "Atendente");
  assert.equal(perfilLabel(""), "");
  assert.equal(initials("Gabriela Teixeira"), "GT");
  assert.equal(initials("  eva "), "EV");
  assert.equal(initials(""), "?");
});

console.log(`atendentes regras: ${n} ok`);
