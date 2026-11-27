import { useEffect, useRef } from "react";

/*
 * Botão/gesto "voltar" do celular fecha a CAMADA aberta, não a conversa (26/11/2026).
 *
 * Só a conversa empilhava uma entrada no histórico (pages/Atendimento.jsx). Com uma foto aberta,
 * a prévia de envio, o menu da mensagem ou o modo seleção, o "voltar" do Android tirava a
 * conversa inteira da tela (e perdia a legenda digitada). Este hook empilha uma entrada por
 * camada, COPIANDO o estado atual (que já tem a marca da conversa): no "voltar", o
 * Atendimento vê a marca e não faz nada, e só a camada fecha.
 *
 * - Só no celular (≤640px). No desktop não mexe no histórico.
 * - Fechou pela interface (X, ESC, enviar): consome a própria entrada com um back ADIADO
 *   (um setTimeout 0, depois de o React terminar o commit).
 *
 * Passagem de entrada (27/11/2026). Uma camada que fecha e outra que abre no MESMO commit
 * ("Selecionar"/"Encaminhar" na folha da mensagem, "Encaminhar" no visualizador, "Apagar" que
 * abre a confirmação): o React roda a limpeza da primeira e o efeito da segunda no mesmo
 * tique. Antes a limpeza chamava history.back() na hora e o efeito seguinte fazia pushState —
 * o Chrome resolve o back contra a entrada da época e DESCARTA o push. A segunda camada ficava
 * sem entrada, e o voltar seguinte fechava a conversa inteira. Agora o back fica pendente até
 * o fim do commit; se outra camada abre nesse meio-tempo, ela HERDA a entrada (replaceState)
 * em vez de empilhar uma nova. Resultado: exatamente uma entrada por camada aberta.
 *
 * - Várias camadas fechando juntas (encaminhar enviado fecha o modal E a seleção): um único
 *   history.go(-k).
 * - Camada que fecha por baixo de outra ainda aberta: a entrada dela fica "morta" e é pulada
 *   junto no próximo voltar — nunca um voltar "morto" que não fecha nada.
 * - StrictMode (dev): monta → limpa → monta vira uma herança, não push/back/push.
 * - Camada que fecha com um back nosso ainda em voo (aparelho lento; a seleção que sai logo
 *   depois do confirm por cima dela): fica marcada e é consumida quando esse popstate chega.
 *
 * Contrato público inalterado: useMobileOverlayBack(open, onClose, key).
 */

let ignorarPops = 0;
let ouvinteGlobal = false;
/** Entradas que este hook empilhou, na ordem do histórico (a última é o topo). */
const pilha = [];
/** Camadas fechadas pela interface no ciclo atual, à espera do back adiado. */
const fechando = new Set();
let timerFechar = 0;
/** Aberturas que esperam um back nosso ainda em voo (o push seria descartado pelo navegador). */
let pushesPendentes = [];
let timerPendentes = 0;
/* Rede de segurança se o popstate do nosso back nunca chegar. Folgada: num aparelho lento o
   popstate pode demorar, e empilhar com o back ainda em voo faria o navegador descartar a
   entrada nova (o problema que a fila existe para evitar). */
const ESPERA_MAX_POP_MS = 1000;

function topoDoHistorico() {
  try {
    return window.history.state?.waOverlay ?? null;
  } catch {
    return null;
  }
}

/** A pilha passa a terminar na entrada em que o histórico está agora. */
function sincronizarPilha() {
  const atual = topoDoHistorico();
  const idx = atual == null ? -1 : pilha.findIndex((p) => p.token === atual);
  pilha.length = idx + 1;
}

function voltar(passos) {
  if (passos <= 0) return;
  ignorarPops += 1;
  try {
    if (passos === 1) window.history.back();
    else window.history.go(-passos);
  } catch {
    ignorarPops = Math.max(0, ignorarPops - 1);
  }
}

/** Consome, num passo só, as entradas de camadas já fechadas que estão no topo. */
function pularMortasNoTopo() {
  let k = 0;
  for (let i = pilha.length - 1; i >= 0 && pilha[i].morta; i -= 1) k += 1;
  if (!k) return;
  pilha.length -= k;
  voltar(k);
}

function executarPendentes() {
  if (timerPendentes) {
    clearTimeout(timerPendentes);
    timerPendentes = 0;
  }
  const fila = pushesPendentes;
  pushesPendentes = [];
  fila.forEach((fn) => fn());
}

function processarFechamentos() {
  timerFechar = 0;
  if (!fechando.size) return;
  for (const p of pilha) {
    if (fechando.has(p.token)) p.morta = true;
  }
  fechando.clear();
  /* Um back nosso ainda está em voo (aparelho lento; ou a seleção fecha logo depois do confirm
     por cima dela): o history.state ainda é o da entrada que está saindo. Realinhar agora
     apagaria da pilha a camada que acabou de fechar e a entrada dela ficaria pendurada (um
     voltar "morto" depois). As mortas ficam marcadas; o popstate desse back as consome. */
  if (ignorarPops > 0) return;
  // O usuário (ou outra navegação) mexeu no histórico no meio: só realinha, sem navegar às cegas.
  if (!pilha.length || pilha[pilha.length - 1].token !== topoDoHistorico()) {
    sincronizarPilha();
    return;
  }
  pularMortasNoTopo();
}

function agendarFechamento(token) {
  fechando.add(token);
  if (!timerFechar) timerFechar = setTimeout(processarFechamentos, 0);
}

function garantirOuvinteGlobal() {
  if (ouvinteGlobal || typeof window === "undefined") return;
  ouvinteGlobal = true;
  /* Registrado antes das camadas (captura): consome os pops que nós mesmos provocamos e
     realinha a pilha antes de cada camada decidir se fecha. */
  window.addEventListener(
    "popstate",
    (e) => {
      // Evento sintético (swBridge) não é a resposta de um back nosso.
      if (e.isTrusted !== false && ignorarPops > 0) {
        ignorarPops -= 1;
        e.__waOverlayIgnorado = true;
        sincronizarPilha();
        if (ignorarPops === 0) {
          // Camada que fechou enquanto este back viajava: a entrada dela é a nova do topo.
          pularMortasNoTopo();
          if (ignorarPops === 0) executarPendentes();
        }
        return;
      }
      sincronizarPilha();
      // O voltar do usuário caiu na entrada de uma camada já fechada: pula direto.
      pularMortasNoTopo();
    },
    true
  );
}

function ehCelular() {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)")?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Quantas entradas de camada estão acima da entrada da conversa (inclui as que acabaram de
 * fechar e ainda não foram consumidas). Para quem precisa sair da conversa de uma vez.
 */
export function contarEntradasDeCamada() {
  return pilha.length;
}

/**
 * Volta para ANTES de todas as camadas abertas, mais `passosExtras` entradas (1 = a da conversa),
 * num único history.go — a seta "Voltar para lista de conversas" no modo seleção, por exemplo.
 * As camadas fecham pelo próprio popstate.
 */
export function voltarAlemDasCamadas(passosExtras = 1) {
  if (typeof window === "undefined") return;
  /* Um back nosso em voo: contar agora daria um passo a mais ou a menos. Espera o popstate. */
  if (ignorarPops > 0) {
    pushesPendentes.push(() => voltarAlemDasCamadas(passosExtras));
    if (!timerPendentes) timerPendentes = setTimeout(executarPendentes, ESPERA_MAX_POP_MS);
    return;
  }
  if (timerFechar) {
    clearTimeout(timerFechar);
    timerFechar = 0;
  }
  fechando.clear();
  const passos = pilha.length + Math.max(0, passosExtras);
  if (passos <= 0) return;
  try {
    if (passos === 1) window.history.back();
    else window.history.go(-passos);
  } catch {
    /* ignore */
  }
}

let seq = 0;

export function useMobileOverlayBack(open, onClose, key = "overlay") {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !ehCelular()) return undefined;
    garantirOuvinteGlobal();
    seq += 1;
    const token = `${key}:${seq}`;
    let ativo = true;
    let empilhado = false;

    const empilhar = () => {
      if (!ativo) return;
      try {
        const estado = window.history.state || {};
        const topo = estado.waOverlay;
        const herda =
          topo != null && fechando.has(topo) && pilha.length > 0 && pilha[pilha.length - 1].token === topo;
        if (herda) {
          // A camada de baixo fechou neste mesmo commit e o back dela ainda não saiu: herda a entrada.
          fechando.delete(topo);
          pilha.pop();
          window.history.replaceState({ ...estado, waOverlay: token }, "", window.location.href);
        } else {
          window.history.pushState({ ...estado, waOverlay: token }, "", window.location.href);
        }
        pilha.push({ token, morta: false });
        empilhado = true;
      } catch {
        /* sem histórico: a camada só não fecha pelo voltar */
      }
    };

    if (ignorarPops > 0) {
      pushesPendentes.push(empilhar);
      if (!timerPendentes) timerPendentes = setTimeout(executarPendentes, ESPERA_MAX_POP_MS);
    } else {
      empilhar();
    }

    const onPop = (e) => {
      if (!ativo || !empilhado || e.__waOverlayIgnorado) return;
      // A minha entrada continua no histórico (o voltar fechou uma camada acima): fico aberta.
      if (pilha.some((p) => p.token === token)) return;
      ativo = false;
      onCloseRef.current?.();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!ativo) return;
      ativo = false;
      if (!empilhado) return;
      if (pilha.some((p) => p.token === token && !p.morta)) agendarFechamento(token);
    };
  }, [open, key]);
}
