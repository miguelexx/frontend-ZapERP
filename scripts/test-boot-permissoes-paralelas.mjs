/**
 * Guarda do PARALELISMO das chamadas de boot (permissoes/empresa x /usuarios/me).
 *
 * Antes, `authStore.restore()` so' pedia as permissoes DEPOIS de o `GET /usuarios/me`
 * responder: duas idas e voltas em serie (~490 ms cada, medido em 23/10/2026) antes de
 * o menu lateral e os gates de rota assentarem. Nenhuma das duas depende da RESPOSTA do
 * /me — so' do token, que ja' esta' em mao.
 *
 * Por que isto nao e' menos seguro: a ordem em serie parecia um portao ("so' busca mais
 * se a sessao for valida"), mas nao era — o `prefetchDefaultChatList` ja' disparava
 * `GET /chats` sem portao nenhum. Token morto e' tratado no interceptor global de 401,
 * que limpa a sessao e recarrega em /login.
 *
 * O que fica travado:
 *   1. permissoes e empresa saem SEM esperar a resposta do /usuarios/me;
 *   2. as flags do utilizador CONTINUAM a depender do /me (nao podem ser aplicadas antes);
 *   3. o boot nao dispara o /me duas vezes quando ele ja' devolveu o utilizador.
 */

import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

function criarStorage() {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k),
    clear: () => mapa.clear(),
    key: (i) => [...mapa.keys()][i] ?? null,
    get length() {
      return mapa.size;
    },
  };
}
globalThis.localStorage = criarStorage();
globalThis.sessionStorage = criarStorage();

const USER = { id: 1, user_id: 1, company_id: 1, nome: "Teste", perfil: "atendente" };
globalThis.localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: USER }));

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const { default: api } = await vite.ssrLoadModule("/src/api/http.js");
  /** Segura o /usuarios/me ate' o teste mandar responder. */
  let liberarMe = () => {};
  const meRespondido = new Promise((r) => {
    liberarMe = r;
  });

  const ordem = [];
  api.get = async (url) => {
    const caminho = new URL(url, "http://local.test").pathname;
    ordem.push(caminho);
    if (caminho === "/usuarios/me") {
      await meRespondido;
      return { data: { ...USER, crm_habilitado: true } };
    }
    if (caminho === "/usuarios/me/permissoes") return { data: { permissoes: { dashboard_acessar: true } } };
    if (caminho === "/config/empresa") return { data: { id: 1, nome: "Empresa" } };
    return { data: {} };
  };

  const { useAuthStore } = await vite.ssrLoadModule("/src/auth/authStore.js");
  const { usePermissoesStore } = await vite.ssrLoadModule("/src/auth/permissoesStore.js");
  const { useEmpresaStore } = await vite.ssrLoadModule("/src/auth/empresaStore.js");

  useAuthStore.getState().restore();

  // Deixa as microtasks/queueMicrotask correrem SEM responder ao /me.
  await new Promise((r) => setTimeout(r, 50));

  assert.ok(
    ordem.includes("/usuarios/me/permissoes"),
    `as permissoes tem de sair SEM esperar o /usuarios/me (pedidos ate' agora: ${ordem.join(", ")})`
  );
  assert.ok(
    ordem.includes("/config/empresa"),
    `a empresa tem de sair SEM esperar o /usuarios/me (pedidos ate' agora: ${ordem.join(", ")})`
  );
  assert.ok(ordem.includes("/usuarios/me"), "o /usuarios/me continua a ser pedido");

  assert.deepEqual(
    usePermissoesStore.getState().permissoes,
    { dashboard_acessar: true },
    "as permissoes tem de estar aplicadas antes de o /me responder — e' o ganho do item"
  );
  assert.equal(
    useEmpresaStore.getState().loaded,
    true,
    "a empresa tem de estar carregada antes de o /me responder"
  );

  // 2: flags do utilizador SO' depois do /me.
  assert.notEqual(
    useAuthStore.getState().user?.crm_habilitado,
    true,
    "flags do /me nao podem ser aplicadas antes de ele responder"
  );

  liberarMe();
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(
    useAuthStore.getState().user?.crm_habilitado,
    true,
    "depois do /me responder, as flags do utilizador tem de ser aplicadas"
  );

  // 3: nao pode pedir o /me duas vezes quando ele ja' devolveu o utilizador.
  assert.equal(
    ordem.filter((c) => c === "/usuarios/me").length,
    1,
    `o boot nao pode pedir /usuarios/me duas vezes (pedidos: ${ordem.join(", ")})`
  );

  console.log("OK — boot pede permissoes/empresa em paralelo com o /usuarios/me (7 asserts).");
} finally {
  await vite.close();
  // `restore()` chama `initSocket` de verdade: o socket.io deixa timers de reconexao
  // vivos e o processo NAO sai sozinho — travaria o `test-node-suite` para sempre.
  try {
    const socket = await import("../src/socket/socket.js");
    socket.disconnectSocket?.();
  } catch (_) {
    /* ignore */
  }
}

// Saida explicita: se um assert falhar, a excecao nao tratada ja' derruba com codigo 1
// antes de chegar aqui, entao isto nao mascara falha nenhuma.
process.exit(0);
