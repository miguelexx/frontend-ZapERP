/**
 * Pré-carga dos chunks do atendimento logo após o boot com sessão ativa.
 *
 * POR QUE EXISTE: a rota inicial é uma cascata de lazy (index → MainLayout → Atendimento
 * → chatList/ConversaView = 3+ viagens de rede em série). Disparar os import() em paralelo
 * no primeiro render achata essa cascata. O runtime do Vite deduplica estes import() com
 * os das rotas lazy, então nada baixa duas vezes.
 *
 * POR QUE O ConversaView É DIFERENTE (medido em 2026-10-23, doc
 * `docs/audits/boot-mobile-2026-10-23.md`): é o maior chunk do boot — 428 kB de JS +
 * 330 kB de CSS (183 kB gzip, ~40% dos bytes do boot inteiro). E o painel da conversa só
 * renderiza quando há conversa aberta; sem conversa, em <=640px o `Atendimento` renderiza
 * `null` (acima disso mostra o `AtendimentoEmptyState`, que é outro chunk). Ou seja: no
 * celular, entrar no app baixava 183 kB gzip para não mostrar coisa nenhuma, disputando
 * banda e CPU com a lista — a única coisa que o atendente vê.
 *
 * Adiar não é arriscado: se o utilizador tocar numa conversa antes de a pré-carga rodar,
 * o `React.lazy` da rota baixa o chunk na hora, com o `ConversaPanelFallback` que já
 * existe. A pré-carga é otimização, não requisito.
 */
import { scheduleAfterInitialPaint } from "../chats/scheduleAfterInitialPaint.js";

/**
 * MESMO breakpoint do `isAtendimentoMobileNav` em `pages/Atendimento.jsx`. É só abaixo
 * dele que o painel da conversa renderiza `null`. Se mudar lá, mude aqui — senão o
 * adiamento passa a valer para uma largura que mostra alguma coisa.
 */
export const ATENDIMENTO_PAINEL_MOBILE_QUERY = "(max-width: 640px)";

/**
 * Atraso MÍNIMO antes de considerar ocioso. Some-se a isto o `requestIdleCallback` do
 * `scheduleAfterInitialPaint` (timeout 2500 ms), e a espera pelo chunk da lista ter
 * chegado. Fica na mesma faixa do resto do boot mobile escalonado
 * (`MOBILE_SECONDARY_REFRESH_DELAY_MS = 2800` em `chats/chatList.jsx`).
 */
export const PRELOAD_CONVERSA_VIEW_MOBILE_DELAY_MS = 1200;

const CARREGADORES_PADRAO = Object.freeze({
  mainLayout: () => import("../layouts/MainLayout"),
  atendimento: () => import("../pages/Atendimento"),
  chatList: () => import("../chats/chatList"),
  conversaView: () => import("../conversa/ConversaView"),
});

/**
 * O boot já aponta para uma conversa específica? Então pré-carregar o ConversaView é
 * exatamente o que foi pedido, e adiar só atrasaria.
 *
 * Dois caminhos reais:
 *  - `?conversa=<id>` — link de notificação / deep link (é o caso de boot frio);
 *  - `location.state.openConversaId` — vindo do CRM/Dashboard/IA/MainLayout. Normalmente
 *    é navegação interna (app já carregado), mas o `history.state` sobrevive a um F5.
 *
 * O react-router 6 guarda o `location.state` em `history.state.usr` (verificado na 6.30.4).
 * A leitura é defensiva de propósito: se essa forma mudar, caímos no adiamento, que é o
 * lado seguro (pior caso = o chunk baixa na hora, com o Suspense que já existe).
 */
function bootJaAbreConversa(win) {
  try {
    const busca = win?.location?.search;
    if (busca && new URLSearchParams(busca).get("conversa")) return true;
  } catch (_) {
    /* URL malformada: segue para o próximo sinal */
  }
  try {
    const estado = win?.history?.state;
    if (estado && typeof estado === "object") {
      if (estado.usr && typeof estado.usr === "object" && estado.usr.openConversaId != null) {
        return true;
      }
      if (estado.openConversaId != null) return true;
    }
  } catch (_) {
    /* history bloqueado (sandbox): trata como "não abre conversa" */
  }
  return false;
}

/**
 * Decide se a pré-carga do ConversaView espera a lista pintar.
 * @param {Window} [win]
 * @returns {boolean} true = adiar (só no celular, e só sem conversa no boot)
 */
export function deveAdiarPreloadConversaView(win) {
  if (!win || typeof win.matchMedia !== "function") return false;
  let ehPainelMobile = false;
  try {
    ehPainelMobile = win.matchMedia(ATENDIMENTO_PAINEL_MOBILE_QUERY)?.matches === true;
  } catch (_) {
    // Sem matchMedia confiável não dá para afirmar que o painel renderiza `null`:
    // mantém o comportamento antigo (paralelo) em vez de adiar às cegas.
    return false;
  }
  if (!ehPainelMobile) return false;
  return !bootJaAbreConversa(win);
}

/**
 * Dispara a pré-carga dos chunks do atendimento.
 *
 * MainLayout, Atendimento e chatList saem sempre em paralelo (são o caminho da lista).
 * O ConversaView sai junto, EXCETO no celular sem conversa no boot: aí espera o chunk da
 * lista chegar e, depois, uma janela ociosa.
 *
 * @param {{
 *   win?: Window,
 *   carregadores?: Record<string, () => Promise<unknown>>,
 *   agendar?: (cb: () => void, delayMs: number) => () => void,
 *   delayMs?: number,
 * }} [opcoes] Os parâmetros existem para o teste conseguir injetar dublês.
 * @returns {() => void} cancela o que ainda não disparou
 */
export function preloadChunksAtendimento(opcoes = {}) {
  const {
    win = typeof window !== "undefined" ? window : undefined,
    carregadores = CARREGADORES_PADRAO,
    agendar = scheduleAfterInitialPaint,
    delayMs = PRELOAD_CONVERSA_VIEW_MOBILE_DELAY_MS,
  } = opcoes;

  let cancelado = false;
  let cancelarAgendamento = null;

  const ignorar = () => {};
  /** Um carregador que estoure de forma síncrona não pode derrubar os outros. */
  const chamar = (fn) => {
    try {
      return Promise.resolve(fn()).catch(ignorar);
    } catch (_) {
      return Promise.resolve();
    }
  };

  void chamar(carregadores.mainLayout);
  void chamar(carregadores.atendimento);
  const listaPronta = chamar(carregadores.chatList);

  if (!deveAdiarPreloadConversaView(win)) {
    void chamar(carregadores.conversaView);
    return () => {
      cancelado = true;
    };
  }

  // `listaPronta` nunca rejeita (o `chamar` já engoliu): mesmo se o chunk da lista
  // falhar, o ConversaView acaba pré-carregado — só não antes da lista.
  void listaPronta.then(() => {
    if (cancelado) return;
    cancelarAgendamento = agendar(() => {
      if (cancelado) return;
      void chamar(carregadores.conversaView);
    }, delayMs);
  });

  return () => {
    cancelado = true;
    if (cancelarAgendamento) {
      cancelarAgendamento();
      cancelarAgendamento = null;
    }
  };
}
