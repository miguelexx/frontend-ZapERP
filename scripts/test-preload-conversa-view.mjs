/**
 * Guarda do ADIAMENTO DA PRE-CARGA DO ConversaView NO CELULAR.
 *
 * Medido em 23/10/2026 no dist de producao (doc `docs/audits/boot-mobile-2026-10-23.md`):
 * entrar em /atendimento baixava ~459 kB gzip, e o ConversaView sozinho era 183 kB gzip
 * (428 kB de JS + 330 kB de CSS) = ~40% dos bytes do boot.
 *
 * So que o painel da conversa so renderiza quando HA conversa aberta. Sem conversa, em
 * <=640px o `Atendimento` renderiza `null` (acima disso mostra o AtendimentoEmptyState,
 * que e' outro chunk). Ou seja: no celular, esses 183 kB disputavam banda e CPU com a
 * lista — a unica coisa visivel — para nao mostrar NADA.
 *
 * O que este teste trava:
 *   1. a lista (MainLayout/Atendimento/chatList) NUNCA e' adiada — e' o caminho quente;
 *   2. no celular sem conversa, o ConversaView so sai DEPOIS do chunk da lista chegar
 *      E de uma janela ociosa;
 *   3. fora do celular nada muda (continua em paralelo, como antes);
 *   4. boot que ja aponta para uma conversa (?conversa= de notificacao, ou
 *      openConversaId sobrevivendo a um F5) NAO adia — seria atrasar o que foi pedido;
 *   5. sem matchMedia confiavel, cai no comportamento antigo em vez de adiar as cegas;
 *   6. desmontar antes da janela ociosa nao dispara a pre-carga.
 */

import {
  preloadChunksAtendimento,
  deveAdiarPreloadConversaView,
  ATENDIMENTO_PAINEL_MOBILE_QUERY,
} from "../src/routes/preloadAtendimento.js";

let falhas = 0;
const checar = (ok, msg) => {
  if (!ok) {
    falhas++;
    console.error(`FALHOU: ${msg}`);
  }
};

/** Deixa as promessas pendentes resolverem. */
const virarMicrotasks = () => new Promise((r) => setTimeout(r, 0));

function criarWindow({ mobile = false, search = "", historyState = null, semMatchMedia = false } = {}) {
  const win = {
    location: { search },
    history: { state: historyState },
  };
  if (!semMatchMedia) {
    win.matchMedia = (q) => ({ matches: q === ATENDIMENTO_PAINEL_MOBILE_QUERY ? mobile : false });
  }
  return win;
}

/** Carregadores dublês: registram a ordem em que foram chamados. */
function criarCarregadores({ chatListFalha = false } = {}) {
  const chamados = [];
  let resolverChatList;
  const chatListPronta = new Promise((r) => {
    resolverChatList = r;
  });
  return {
    chamados,
    liberarChatList: () => {
      resolverChatList();
      return virarMicrotasks();
    },
    carregadores: {
      mainLayout: () => {
        chamados.push("mainLayout");
        return Promise.resolve();
      },
      atendimento: () => {
        chamados.push("atendimento");
        return Promise.resolve();
      },
      chatList: () => {
        chamados.push("chatList");
        return chatListPronta.then(() =>
          chatListFalha ? Promise.reject(new Error("chunk 404")) : undefined
        );
      },
      conversaView: () => {
        chamados.push("conversaView");
        return Promise.resolve();
      },
    },
  };
}

/** Agendador dublê: guarda o callback para o teste decidir quando a janela ociosa chega. */
function criarAgendador() {
  const agendados = [];
  return {
    agendados,
    cancelados: () => agendados.filter((a) => a.cancelado).length,
    dispararOcioso: async () => {
      for (const a of agendados) if (!a.cancelado) a.cb();
      await virarMicrotasks();
    },
    agendar: (cb, delayMs) => {
      const reg = { cb, delayMs, cancelado: false };
      agendados.push(reg);
      return () => {
        reg.cancelado = true;
      };
    },
  };
}

// ---------------------------------------------------------------------------
// 1 + 3: fora do celular nada muda — tudo em paralelo, sem agendamento
// ---------------------------------------------------------------------------
{
  const { chamados, carregadores } = criarCarregadores();
  const ag = criarAgendador();
  preloadChunksAtendimento({
    win: criarWindow({ mobile: false }),
    carregadores,
    agendar: ag.agendar,
  });
  await virarMicrotasks();

  checar(
    chamados.includes("conversaView"),
    "desktop: o ConversaView tem de continuar a sair em paralelo (nao regredir o ganho da cascata)"
  );
  checar(
    ag.agendados.length === 0,
    "desktop: nao deve haver agendamento nenhum — e' caminho direto"
  );
  checar(
    ["mainLayout", "atendimento", "chatList"].every((c) => chamados.includes(c)),
    "desktop: MainLayout/Atendimento/chatList continuam pre-carregados"
  );
}

// ---------------------------------------------------------------------------
// 1 + 2: celular sem conversa — lista na hora, ConversaView so depois dela + ocioso
// ---------------------------------------------------------------------------
{
  const { chamados, carregadores, liberarChatList } = criarCarregadores();
  const ag = criarAgendador();
  preloadChunksAtendimento({
    win: criarWindow({ mobile: true }),
    carregadores,
    agendar: ag.agendar,
    delayMs: 1200,
  });
  await virarMicrotasks();

  checar(
    ["mainLayout", "atendimento", "chatList"].every((c) => chamados.includes(c)),
    "celular: o caminho da lista NUNCA pode ser adiado"
  );
  checar(
    !chamados.includes("conversaView"),
    "celular: o ConversaView nao pode sair junto com a lista — sao 183 kB gzip para um painel que renderiza null"
  );
  checar(
    ag.agendados.length === 0,
    "celular: o agendamento so pode ser criado DEPOIS de o chunk da lista chegar"
  );

  await liberarChatList();
  checar(
    ag.agendados.length === 1,
    "celular: chegado o chunk da lista, tem de haver exatamente um agendamento"
  );
  checar(
    ag.agendados[0]?.delayMs === 1200,
    "celular: o atraso configurado tem de ser respeitado"
  );
  checar(
    !chamados.includes("conversaView"),
    "celular: nem depois da lista o ConversaView pode sair antes da janela ociosa"
  );

  await ag.dispararOcioso();
  checar(
    chamados.includes("conversaView"),
    "celular: na janela ociosa o ConversaView TEM de ser pre-carregado (tocar numa conversa precisa ser instantaneo)"
  );
  checar(
    chamados.indexOf("chatList") < chamados.indexOf("conversaView"),
    "celular: a ordem tem de ser lista primeiro, ConversaView depois"
  );
}

// ---------------------------------------------------------------------------
// 4: boot que ja aponta para uma conversa nunca adia
// ---------------------------------------------------------------------------
for (const [rotulo, win] of [
  ["?conversa= (notificacao / deep link)", criarWindow({ mobile: true, search: "?conversa=123" })],
  [
    "history.state.usr.openConversaId (F5 depois do CRM/Dashboard/IA)",
    criarWindow({ mobile: true, historyState: { usr: { openConversaId: 77 } } }),
  ],
  [
    "history.state.openConversaId (forma plana)",
    criarWindow({ mobile: true, historyState: { openConversaId: 77 } }),
  ],
]) {
  const { chamados, carregadores } = criarCarregadores();
  const ag = criarAgendador();
  preloadChunksAtendimento({ win, carregadores, agendar: ag.agendar });
  await virarMicrotasks();

  checar(
    chamados.includes("conversaView"),
    `celular com ${rotulo}: adiar seria atrasar exatamente a conversa que foi pedida`
  );
  checar(ag.agendados.length === 0, `celular com ${rotulo}: nao deve agendar, deve ir direto`);
}

// `?conversa=` vazio nao conta como conversa pedida.
checar(
  deveAdiarPreloadConversaView(criarWindow({ mobile: true, search: "?conversa=" })) === true,
  "celular com ?conversa= VAZIO: continua sem conversa, logo continua a adiar"
);
checar(
  deveAdiarPreloadConversaView(criarWindow({ mobile: true, search: "?outro=1" })) === true,
  "celular com outro parametro na URL: continua a adiar"
);

// ---------------------------------------------------------------------------
// 5: sem sinal confiavel, comportamento antigo (nunca adiar as cegas)
// ---------------------------------------------------------------------------
checar(
  deveAdiarPreloadConversaView(criarWindow({ mobile: true, semMatchMedia: true })) === false,
  "sem matchMedia: nao da' para afirmar que o painel renderiza null — tem de manter o paralelo antigo"
);
checar(
  deveAdiarPreloadConversaView(undefined) === false,
  "sem window (SSR/teste): nao pode adiar"
);
{
  const win = criarWindow({ mobile: true });
  win.matchMedia = () => {
    throw new Error("bloqueado");
  };
  checar(
    deveAdiarPreloadConversaView(win) === false,
    "matchMedia a estourar: cai no comportamento antigo em vez de adiar"
  );
}
{
  // history bloqueado (sandbox) nao pode derrubar a decisao.
  const win = criarWindow({ mobile: true });
  Object.defineProperty(win, "history", {
    get() {
      throw new Error("bloqueado");
    },
  });
  checar(
    deveAdiarPreloadConversaView(win) === true,
    "history bloqueado: trata como 'sem conversa' e adia (o lado seguro no celular)"
  );
}

// ---------------------------------------------------------------------------
// 6: cancelar (desmontar / logout) antes da janela ociosa nao pre-carrega
// ---------------------------------------------------------------------------
{
  const { chamados, carregadores, liberarChatList } = criarCarregadores();
  const ag = criarAgendador();
  const cancelar = preloadChunksAtendimento({
    win: criarWindow({ mobile: true }),
    carregadores,
    agendar: ag.agendar,
  });
  await liberarChatList();
  cancelar();
  await ag.dispararOcioso();

  checar(
    !chamados.includes("conversaView"),
    "cancelado: o ConversaView nao pode ser baixado depois de desmontar/logout"
  );
  checar(ag.cancelados() === 1, "cancelado: o agendamento tem de ser cancelado, nao so' ignorado");
}

// Cancelar ANTES de a lista chegar tambem barra (a corrida mais provavel no boot).
{
  const { chamados, carregadores, liberarChatList } = criarCarregadores();
  const ag = criarAgendador();
  const cancelar = preloadChunksAtendimento({
    win: criarWindow({ mobile: true }),
    carregadores,
    agendar: ag.agendar,
  });
  cancelar();
  await liberarChatList();
  await ag.dispararOcioso();

  checar(
    !chamados.includes("conversaView"),
    "cancelado antes do chunk da lista: nao pode agendar nem pre-carregar depois"
  );
  checar(
    ag.agendados.length === 0,
    "cancelado antes do chunk da lista: nem chega a criar agendamento"
  );
}

// ---------------------------------------------------------------------------
// Robustez: chunk da lista a falhar nao pode deixar o ConversaView preso para sempre
// ---------------------------------------------------------------------------
{
  const { chamados, carregadores, liberarChatList } = criarCarregadores({ chatListFalha: true });
  const ag = criarAgendador();
  preloadChunksAtendimento({
    win: criarWindow({ mobile: true }),
    carregadores,
    agendar: ag.agendar,
  });
  await liberarChatList();
  await ag.dispararOcioso();

  checar(
    chamados.includes("conversaView"),
    "chunk da lista a falhar (404 pos-deploy): o ConversaView ainda assim tem de ser pre-carregado"
  );
}

// Carregador que estoura de forma SINCRONA nao pode derrubar os outros.
{
  const chamados = [];
  const ag = criarAgendador();
  preloadChunksAtendimento({
    win: criarWindow({ mobile: false }),
    agendar: ag.agendar,
    carregadores: {
      mainLayout: () => {
        throw new Error("import sincrono estourou");
      },
      atendimento: () => {
        chamados.push("atendimento");
        return Promise.resolve();
      },
      chatList: () => {
        chamados.push("chatList");
        return Promise.resolve();
      },
      conversaView: () => {
        chamados.push("conversaView");
        return Promise.resolve();
      },
    },
  });
  await virarMicrotasks();

  checar(
    chamados.includes("atendimento") && chamados.includes("chatList") && chamados.includes("conversaView"),
    "um carregador a estourar de forma sincrona nao pode impedir a pre-carga dos outros"
  );
}

if (falhas) {
  console.error(`preload-conversa-view: ${falhas} falha(s)`);
  process.exit(1);
}
console.log("OK — adiamento da pre-carga do ConversaView no celular (18 asserts).");
