/**
 * Estado da ligação em tempo real (`src/socket/connectionStore.js`).
 *
 * O que isto guarda:
 *  - `boot` enquanto nunca ligou: o aviso NÃO pode aparecer no login/F5 normal;
 *  - `religando` vs `offline` conforme `navigator.onLine` (são mensagens diferentes);
 *  - `reiniciar()` (logout / troca de token) volta ao `boot`, senão o banner piscava
 *    "sem ligação" por cima do ecrã de login;
 *  - as escritas são idempotentes: `marcarConectado()` repetido não emite `set()` novo
 *    (o banner assina a store e re-renderizaria à toa).
 */

import assert from "node:assert/strict";

/* O módulo lê `navigator.onLine` no load e regista listeners em `window`.
   No Node 24 `navigator` já existe e só tem getter — daí o defineProperty. */
Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true },
  configurable: true,
  writable: true,
});
const listeners = new Map();
globalThis.window = {
  addEventListener: (ev, fn) => listeners.set(ev, fn),
  removeEventListener: (ev) => listeners.delete(ev),
};

const { useConnectionStore, statusConexao } = await import("../src/socket/connectionStore.js");

const st = () => statusConexao(useConnectionStore.getState());
const api = () => useConnectionStore.getState();

// 1. Boot: nada de aviso antes da primeira ligação.
assert.equal(st(), "boot", "antes do primeiro connect o estado tem de ser boot");

// 2. Ligou.
api().marcarConectado();
assert.equal(st(), "ligado");

// 3. Escrita idempotente: marcar conectado de novo não deve emitir set().
let emissoes = 0;
const unsub = useConnectionStore.subscribe(() => {
  emissoes += 1;
});
api().marcarConectado();
assert.equal(emissoes, 0, "marcarConectado repetido não pode notificar a store");

// 4. Caiu com rede: religando.
api().marcarDesconectado();
assert.equal(st(), "religando");
assert.equal(emissoes, 1, "a queda tem de notificar uma vez");
api().marcarDesconectado();
assert.equal(emissoes, 1, "desconectar repetido não pode notificar");

// 5. Caiu a rede do aparelho: offline (mensagem diferente).
api().setOnline(false);
assert.equal(st(), "offline");
api().setOnline(false);
assert.equal(st(), "offline", "setOnline repetido é inócuo");

// 6. Rede voltou mas o socket ainda não: volta a religando, não a ligado.
api().setOnline(true);
assert.equal(st(), "religando", "rede de volta sem socket ainda é religando");

// 7. Socket voltou.
api().marcarConectado();
assert.equal(st(), "ligado");

// 8. Logout / troca de token: volta ao boot (sem aviso no login).
api().reiniciar();
assert.equal(st(), "boot");
assert.equal(api().conectado, false);
assert.equal(api().jaConectou, false);

// 9. Depois do reiniciar, uma queda ainda não pode gerar aviso (nunca ligou nesta sessão).
api().marcarDesconectado();
assert.equal(st(), "boot", "queda antes da primeira ligação continua a ser boot");

unsub();

// 10. Os listeners de rede do browser estão ligados à store.
assert.ok(listeners.has("online") && listeners.has("offline"), "online/offline têm de estar registados");
api().marcarConectado();
api().marcarDesconectado();
listeners.get("offline")();
assert.equal(st(), "offline", "o evento offline do browser tem de chegar à store");
listeners.get("online")();
assert.equal(st(), "religando");

console.log("OK — estado da ligação em tempo real (10 cenários).");
