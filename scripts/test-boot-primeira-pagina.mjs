/**
 * Guarda da 1a PAGINA DO BOOT da lista (menor + entregue na hora).
 *
 * Medido em 23/10/2026 (`docs/audits/boot-mobile-2026-10-23.md`): o prefetch do boot
 * chamava `fetchMinhaFilaChatsProgressivo` SEM `onFirstPage` e SEM `badgeCount`, logo
 * pedia `limit=250` e so' resolvia no fim do laco (ate' 50 paginas em serie). A lista
 * nao pintava enquanto a fila inteira nao chegasse — e no celular cabem ~8 linhas.
 * Cada linha e' gorda: o select do backend traz cliente + cliente_tags + tags +
 * atendente + departamentos + a ultima mensagem completa.
 *
 * O PERIGO desta mudanca, e a razao deste teste existir: a aba "Minha fila" NAO tem
 * "Carregar mais" (forca `hasMore: false`). Entregar uma pagina parcial como resultado
 * final, ou calcular mal o numero de paginas, some com conversas DE VEZ na UI.
 *
 * O que fica travado aqui:
 *   1. a 1a pagina do boot usa o limite pequeno; as seguintes continuam em 250;
 *   2. o resultado final continua a ser a lista COMPLETA (nunca a 1a pagina);
 *   3. com 1a pagina menor + badge, o numero de paginas NAO trunca a fila
 *      (a conta antiga `ceil(badge/250)` daria 1 pagina para 250 conversas = -210);
 *   4. sem `primeiraPaginaLimit`, a conta de paginas e' identica a' antiga;
 *   5. a 1a pagina chega ANTES da lista completa (e' o ganho todo);
 *   6. so' a lista COMPLETA vai para o cache de sessao — gravar a parcial faria o
 *      proximo boot hidratar uma fila truncada e sair cedo por `fromCache`.
 */

import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

/** localStorage/sessionStorage de mentira: `sessionMatchesUser` e o cache precisam deles. */
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
    _mapa: mapa,
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
  const service = await vite.ssrLoadModule("/src/chats/chatService.js");

  /**
   * Devolve `total` conversas repartidas conforme o `limit` pedido em cada request.
   * Regista o limite de cada chamada para as asserções de tamanho de página.
   */
  function montarApi(total, { atrasoDepoisDaPrimeira = 0 } = {}) {
    const limites = [];
    let entregues = 0;
    api.get = async (url) => {
      const u = new URL(url, "http://local.test");
      const limit = Number(u.searchParams.get("limit"));
      limites.push(limit);
      if (limites.length > 1 && atrasoDepoisDaPrimeira > 0) {
        await new Promise((r) => setTimeout(r, atrasoDepoisDaPrimeira));
      }
      const faltam = Math.max(0, total - entregues);
      const nesta = Math.min(limit, faltam);
      const conversas = Array.from({ length: nesta }, (_, i) => ({ id: entregues + i + 1 }));
      entregues += nesta;
      const has_more = entregues < total;
      return {
        data: {
          conversas,
          has_more,
          next_cursor: has_more ? `cursor-${entregues}` : null,
          next_cursor_id: has_more ? String(entregues) : null,
          total_count: total,
        },
      };
    };
    return { limites };
  }

  // -------------------------------------------------------------------------
  // 1 + 2: 1a pagina pequena, seguintes em 250, resultado final COMPLETO
  // -------------------------------------------------------------------------
  {
    const { limites } = montarApi(300);
    const primeiras = [];
    const lista = await service.fetchMinhaFilaChatsProgressivo(
      { minha_fila: "1" },
      { primeiraPaginaLimit: 40 },
      (p) => primeiras.push(p)
    );

    assert.equal(limites[0], 40, "a 1a pagina do boot tem de usar o limite pequeno");
    assert.ok(
      limites.slice(1).every((l) => l === 250),
      `as paginas seguintes continuam em 250 (recebido: ${limites.join(",")})`
    );
    assert.equal(primeiras.length, 1, "onFirstPage tem de ser chamado exatamente uma vez");
    assert.equal(primeiras[0].length, 40, "onFirstPage recebe a 1a pagina (40), nao a fila toda");
    assert.equal(
      lista.length,
      300,
      "RESULTADO FINAL tem de ser a fila COMPLETA — a aba nao tem 'Carregar mais'"
    );
    assert.equal(
      service.getChatsPageMeta(lista).hasMore,
      false,
      "contrato da aba: lista completa, sem continuacao"
    );
  }

  // Fila que cabe na 1a pagina pequena: uma request so', e onFirstPage nao corre.
  {
    const { limites } = montarApi(12);
    const primeiras = [];
    const lista = await service.fetchMinhaFilaChatsProgressivo(
      { minha_fila: "1" },
      { primeiraPaginaLimit: 40 },
      (p) => primeiras.push(p)
    );
    assert.equal(limites.length, 1, "fila pequena nao pode gerar request extra");
    assert.equal(primeiras.length, 0, "fila que cabe numa pagina nao chama onFirstPage");
    assert.equal(lista.length, 12, "fila pequena volta inteira");
  }

  // -------------------------------------------------------------------------
  // 3: O PERIGO — 1a pagina menor + badge nao pode truncar a fila
  // -------------------------------------------------------------------------
  {
    const { limites } = montarApi(250);
    const lista = await service.fetchMinhaFilaChatsProgressivo(
      { minha_fila: "1" },
      { primeiraPaginaLimit: 40 },
      () => {},
      250 // badge diz 250; a conta antiga daria ceil(250/250) = 1 pagina = -210 conversas
    );
    assert.equal(
      lista.length,
      250,
      "badge 250 com 1a pagina de 40 TEM de buscar as paginas restantes (senao somem 210 conversas)"
    );
    assert.ok(limites.length >= 2, "tem de haver mais de uma request");
  }

  // -------------------------------------------------------------------------
  // 4: sem primeiraPaginaLimit, a conta de paginas e' a mesma de antes
  // -------------------------------------------------------------------------
  for (const [badge, paginasEsperadas] of [
    [250, 1],
    [251, 2],
    [500, 2],
    [501, 3],
  ]) {
    // Fila "infinita": o laco so' para pelo teto de paginas, revelando o maxPages.
    const { limites } = montarApi(1_000_000);
    await service.fetchMinhaFilaChatsProgressivo({ minha_fila: "1" }, {}, () => {}, badge);
    assert.equal(
      limites.length,
      paginasEsperadas,
      `badge ${badge} sem 1a pagina menor: ${paginasEsperadas} pagina(s), como na conta antiga`
    );
    assert.ok(
      limites.every((l) => l === 250),
      "sem primeiraPaginaLimit todas as paginas continuam em 250"
    );
  }

  // Sem badge (o caso do boot): nao pode parar cedo.
  {
    const { limites } = montarApi(600);
    const lista = await service.fetchMinhaFilaChatsProgressivo(
      { minha_fila: "1" },
      { primeiraPaginaLimit: 40 },
      () => {}
    );
    assert.equal(lista.length, 600, "sem badge o laco vai ate' has_more acabar");
    assert.deepEqual(limites, [40, 250, 250, 250], "40 + paginas de 250 ate' esgotar");
  }

  // -------------------------------------------------------------------------
  // 5 + 6: prefetch do boot — 1a pagina ANTES da completa, cache so' com a completa
  // -------------------------------------------------------------------------
  {
    const prefetch = await vite.ssrLoadModule("/src/chats/prefetchDefaultChatList.js");
    const filtros = await vite.ssrLoadModule("/src/chats/chatListFilters.js");
    globalThis.sessionStorage.clear();

    const { limites } = montarApi(300, { atrasoDepoisDaPrimeira: 60 });
    const chave = filtros.buildDefaultChatListFilterRequestKey(USER);

    const ordem = [];
    const completaPromise = prefetch.prefetchDefaultChatList(USER);
    const primeiraPromise = prefetch.takePrefetchedDefaultChatListPrimeiraPagina(USER, chave);

    assert.ok(primeiraPromise, "a 1a pagina tem de estar disponivel enquanto o GET esta' em voo");

    const primeira = primeiraPromise.then((p) => {
      ordem.push("primeira");
      return p;
    });
    const completa = completaPromise.then((r) => {
      ordem.push("completa");
      return r;
    });
    const [pagina1, resultado] = await Promise.all([primeira, completa]);

    // Ordem sozinha nao basta: quem espera e' destravado com `null` pelo `.finally`,
    // entao "primeira antes de completa" passaria ate' sem entrega nenhuma. O que
    // prova o item e' a 1a pagina chegar COM CONTEUDO.
    assert.ok(
      Array.isArray(pagina1) && pagina1.length === 40,
      `a 1a pagina TEM de ser entregue cedo com as 40 linhas (recebido: ${
        pagina1 === null ? "null" : JSON.stringify(pagina1?.length)
      }). Null aqui = o boot voltou a so' pintar no fim do laco.`
    );
    assert.deepEqual(
      ordem,
      ["primeira", "completa"],
      "a 1a pagina TEM de chegar antes da lista completa — e' o ganho todo do item"
    );
    assert.equal(
      prefetch.PREFETCH_BOOT_PRIMEIRA_PAGINA_LIMIT,
      40,
      "o limite do boot e' o esperado"
    );
    assert.equal(limites[0], 40, "o prefetch do boot tem de pedir a 1a pagina pequena");
    assert.equal(pagina1.length, 40, "a 1a pagina entregue e' a pagina, nao a fila toda");
    assert.equal(resultado.list.length, 300, "o prefetch continua a resolver com a fila COMPLETA");

    const filtrosData = await vite.ssrLoadModule("/src/chats/chatListFiltersData.js");
    const scopeKey = filtrosData.buildChatListFiltersScopeKey(USER);
    const cache = await vite.ssrLoadModule("/src/chats/chatListSidebarCache.js");
    const guardado = cache.hydrateChatListRowsForFilterFromSession(scopeKey, chave);
    assert.equal(
      guardado?.length,
      300,
      "o cache de sessao tem de guardar a lista COMPLETA — a parcial truncaria o proximo boot"
    );
  }

  // Depois de o GET completo terminar, nao faz sentido devolver pagina parcial.
  {
    const prefetch = await vite.ssrLoadModule("/src/chats/prefetchDefaultChatList.js");
    const filtros = await vite.ssrLoadModule("/src/chats/chatListFilters.js");
    const chave = filtros.buildDefaultChatListFilterRequestKey(USER);
    assert.equal(
      prefetch.takePrefetchedDefaultChatListPrimeiraPagina(USER, chave),
      null,
      "sem GET em voo nao se devolve 1a pagina (a completa ja' esta' disponivel na hora)"
    );
    assert.equal(
      prefetch.takePrefetchedDefaultChatListPrimeiraPagina(USER, "chave-de-outro-filtro"),
      null,
      "chave de outro filtro nunca recebe a 1a pagina deste"
    );
  }

  console.log("OK — 1a pagina do boot: menor, entregue na hora, sem truncar a Minha fila.");
} finally {
  await vite.close();
}
