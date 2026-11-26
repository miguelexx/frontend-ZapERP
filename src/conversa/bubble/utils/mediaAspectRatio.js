/**
 * Proporção real da mídia da bolha (foto, vídeo, cartão de link).
 *
 * Por que isto existe: o WhatsApp monta a bolha NA FORMA da mídia — retrato fica alto e
 * estreito, paisagem fica largo e baixo, e a foto encosta nas bordas do cartão. O frame fixo
 * (1/1 na foto, 16/9 no vídeo) que havia aqui ou deixava tarja cinza dos dois lados
 * (`object-fit: contain`) ou cortava o assunto (`object-fit: cover`).
 *
 * A proporção só é conhecida depois que o arquivo decodifica, e a thread é virtualizada: ao
 * rolar de volta a linha remonta e a proporção seria "descoberta" de novo, empurrando o scroll
 * (CLS). Por isso o valor fica num cache de módulo por mensagem/URL: na remontagem a bolha já
 * nasce com a moldura certa. Antes do primeiro load vale o fallback (quadrado), igual a antes.
 */

/**
 * Retrato máximo = 9:16, a proporção da câmera e do print do celular: a foto mais comum
 * aparece INTEIRA. Mais alto que isto (print de tela 19.5:9, por exemplo) o WhatsApp corta,
 * em vez de esticar a bolha pela conversa toda.
 */
export const MEDIA_AR_MIN = 0.5625;
/** Paisagem máxima (≈ 12:5) — panorâmicas viram faixa, não bolha de 2px de altura. */
export const MEDIA_AR_MAX = 2.4;

/** Cartão de link: o WhatsApp mantém a miniatura entre quase quadrada e og:image (1.91/1). */
export const LINK_PREVIEW_AR_MIN = 0.92;
export const LINK_PREVIEW_AR_MAX = 1.91;

const MAX_ENTRIES = 600;
const cache = new Map();

/*
 * Persistência entre recargas (19/11/2026). O cache era só de módulo: depois de um F5 toda foto
 * voltava a nascer quadrada e a "descobrir" a forma ao decodificar — com rede lenta, já com a
 * conversa à vista (salto de 80–100px medido). Guardar só chaves `m:<id da mensagem>`: chave
 * `u:<url>` pode levar token do /media/proxy na query e não vai para o storage.
 */
const STORAGE_KEY = "zap_media_ar_v1";
const PERSIST_MAX = 400;
let persistTimer = 0;

function loadPersisted() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    for (const pair of arr) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [k, v] = pair;
      if (typeof k === "string" && k.startsWith("m:") && typeof v === "number" && v > 0 && v < 10) {
        cache.set(k, v);
      }
    }
  } catch {
    /* storage indisponível/corrompido: segue só com a memória */
  }
}

function schedulePersist() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = 0;
    try {
      const out = [];
      for (const [k, v] of cache) if (k.startsWith("m:")) out.push([k, v]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out.slice(-PERSIST_MAX)));
    } catch {
      /* quota/privado: ignora */
    }
  }, 1500);
}

loadPersisted();

/**
 * Normaliza largura/altura naturais em um número (w/h) já limitado à faixa.
 * Retorna 0 quando as dimensões não servem (arquivo quebrado, metadados ausentes).
 */
export function clampAspectRatio(width, height, min = MEDIA_AR_MIN, max = MEDIA_AR_MAX) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  const ratio = w / h;
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.round(Math.min(max, Math.max(min, ratio)) * 1000) / 1000;
}

/**
 * Chave estável da mídia: tempId → client_temp_id → id local → id do provedor → URL.
 * tempId PRIMEIRO (16/11/2026): numa foto enviada, `id` e `whatsapp_id` chegam em patches
 * separados da URL; com o id do provedor à frente a chave mudava, `recall` devolvia 0 e a
 * moldura voltava ao quadrado sem `onLoad` novo para a corrigir. O reconcile preserva o
 * tempId, então a chave fica igual durante toda a vida da bolha.
 */
export function mediaRatioKey(msg, fallbackSrc) {
  const m = msg && typeof msg === "object" ? msg : null;
  const id =
    (m && (m.tempId || m.client_temp_id || m.id || m.whatsapp_id)) || "";
  if (id) return `m:${id}`;
  const src = String(fallbackSrc || "").trim();
  // blob: muda a cada sessão — não serve de chave entre remontagens.
  if (!src || src.startsWith("blob:")) return "";
  return `u:${src}`;
}

export function recallAspectRatio(key) {
  if (!key) return 0;
  const value = cache.get(key);
  return typeof value === "number" && value > 0 ? value : 0;
}

export function rememberAspectRatio(key, ratio) {
  if (!key || !(ratio > 0)) return;
  if (cache.has(key)) cache.delete(key);
  cache.set(key, ratio);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  if (key.startsWith("m:")) schedulePersist();
}

/**
 * Aplica a proporção no elemento que desenha a moldura (o botão/cartão, não a imagem).
 * Feito de forma imperativa no próprio `onLoad` para a moldura acertar já no primeiro paint,
 * sem esperar o re-render do React.
 */
export function applyAspectRatioVar(el, ratio) {
  if (!el || !(ratio > 0)) return;
  /* A mesma proporção já aplicada (candidatas mudando depois do envio, React repondo o mesmo
     valor): nada a fazer. Repassar pela elegibilidade cancelava um deslize em curso — a moldura
     saltava o resto do caminho num frame (revisão 25/11/2026). */
  const aplicada = parseFloat(el.style.getPropertyValue("--wa-media-ar"));
  if (Number.isFinite(aplicada) && Math.abs(aplicada - ratio) < 0.0005) return;
  const posicao = markGlideEligibility(el, ratio);
  /*
   * Lista ESTÁTICA (celular, conversa curta): não há virtualizer para compensar linha acima da
   * tela que muda de altura, e o scroller tem `overflow-anchor: none`. Uma foto acima da dobra
   * que decodificava empurrava tudo o que o atendente via 100–130px para baixo — e, com o
   * deslize de "mensagem nova" em curso, ninguém reancorava até ele alcançar (25/11/2026).
   * Mede a linha antes/depois e devolve a diferença ao scrollTop no mesmo frame.
   */
  if (posicao === "acima") {
    const row = el.closest && el.closest(".wa-messages-static-row");
    const scroller = row && row.closest(".wa-messages");
    /* Só com a conversa no fim ou na janela pós-abertura (deslize de mensagem nova): lendo o
       histórico com o dedo, escrever scrollTop no meio do momentum o pararia no iOS. */
    const noFim =
      scroller &&
      (scroller.getAttribute("data-media-glide") === "1" ||
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= GLIDE_STICK_GAP_PX);
    if (row && scroller && noFim) {
      const antes = row.offsetHeight;
      /* Alvo ABSOLUTO a partir do scrollTop de antes: se a linha encolher com a conversa no
         fim, o browser já prende o scroll ao novo máximo ao relayoutar — somar de novo ao valor
         já preso movia tudo outra vez (166px medidos). */
      const stAntes = scroller.scrollTop;
      el.style.setProperty("--wa-media-ar", String(ratio));
      const delta = row.offsetHeight - antes;
      if (delta) {
        const alvo = Math.max(0, stAntes + delta);
        try {
          if (Math.abs(scroller.scrollTop - alvo) >= 1) scroller.scrollTop = alvo;
        } catch {
          /* ignore */
        }
      }
      return;
    }
  }
  el.style.setProperty("--wa-media-ar", String(ratio));
}

/** Duração mínima do deslize da moldura (a do CSS) e teto. */
const GLIDE_MS = 560;
const GLIDE_MAX_MS = 1400;
/*
 * Velocidade de pico da curva cubic-bezier(0.4, 0, 0.2, 1) = 2,735× a média (calculado). Para a
 * moldura nunca andar mais do que ~9px por frame no pico, a duração cresce com o trecho mais
 * íngreme da mudança de altura (ver measureFrameHeightSlope); mínimo 560ms, teto 1400ms.
 */
const GLIDE_MS_PER_PX = (2.735 * 16.67) / 9;
/** A próxima moldura da fila começa quando a anterior já passou do pico (72% da duração). */
const GLIDE_STAGGER_FRACTION = 0.72;
const GLIDE_MAX_DELAY_MS = 1600;
/** "No fim da conversa": mesma folga com que o ConversaView volta a colar a âncora (120px) + margem. */
const GLIDE_STICK_GAP_PX = 160;
let glideChainEndsAt = 0;

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/*
 * Quem desliza (transição da moldura) e quando (25/11/2026).
 *
 * Desliza só a moldura que o atendente ESTÁ VENDO com a conversa no fim (19/11/2026: foto fora da
 * tela troca de forma na hora — a âncora do fim absorve isso num frame só; animada, eram 400ms de
 * remedições a empurrar a tela). A elegibilidade era uma janela de TEMPO (3,5s após a revelação):
 * foto que chegava depois — proxy lento, print grande — trocava de forma num frame (149px no
 * desktop, 332px no celular). Agora é ESTADO: o scroller tem `data-frame-glide` enquanto a conversa
 * está revelada (fora da máscara e do carregamento de histórico) e a moldura só desliza se estiver
 * visível e com a conversa colada ao fim. Lendo o histórico continua instantânea, como sempre.
 *
 * Molduras que decodificam juntas (álbum) eram curvas independentes e a thread seguia a SOMA:
 * 28–49px por frame. Cada moldura que vai mesmo mudar de forma entra numa fila: começa quando a
 * anterior já passou do pico (a cauda de uma cruza o arranque da outra), via `--wa-ar-glide-delay`,
 * com duração proporcional à mudança de altura (`--wa-ar-glide-dur`). Atributos imperativos (o
 * React não os gere): têm de estar postos ANTES da troca da proporção, no mesmo recálculo de estilo.
 */
function markGlideEligibility(el, ratio) {
  try {
    const scroller = el.closest && el.closest(".wa-messages");
    if (!scroller) return null;
    const r = el.getBoundingClientRect();
    const v = scroller.getBoundingClientRect();
    const visivel = r.bottom > v.top && r.top < v.bottom;
    const posicao = visivel ? "visivel" : r.bottom <= v.top ? "acima" : "abaixo";
    const janela = scroller.getAttribute("data-frame-glide") === "1";
    const folga = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    /* Logo após abrir (`data-media-glide`, que sai ao rolar para cima) a thread pode estar a
       DESLIZAR até mensagens novas do servidor, ainda longe do fim: uma foto visível nesse
       caminho também desliza — trocada na hora, empurrava o que vinha abaixo 166px. */
    const colado = folga <= GLIDE_STICK_GAP_PX || scroller.getAttribute("data-media-glide") === "1";
    if (!(visivel && janela && colado)) {
      el.setAttribute("data-ar-instant", "1");
      el.removeAttribute("data-ar-glide");
      el.style.removeProperty("--wa-ar-glide-delay");
      el.style.removeProperty("--wa-ar-glide-dur");
      return posicao;
    }
    el.removeAttribute("data-ar-instant");
    el.setAttribute("data-ar-glide", "1");
    /* Deslize desta moldura ainda em curso e a proporção alvo mudou: o browser redireciona a
       transição a partir do valor atual — não medir (cancelaria a transição) nem reentrar na fila. */
    if (frameGlideRunning(el)) return "visivel";
    /* Proporção igual à atual (já veio do cache): não há transição — não ocupa a fila. */
    let atual = Number.NaN;
    try {
      atual = parseFloat(getComputedStyle(el).getPropertyValue("--wa-media-ar-anim"));
    } catch {
      /* sem estilo computado */
    }
    if (Number.isFinite(atual) && Math.abs(atual - ratio) < 0.005) {
      el.style.removeProperty("--wa-ar-glide-delay");
      return "visivel";
    }
    const duracao = Math.round(
      Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MS, measureFrameHeightSlope(el, Number.isFinite(atual) ? atual : ratio, ratio) * GLIDE_MS_PER_PX))
    );
    const agora = nowMs();
    const inicio = Math.min(agora + GLIDE_MAX_DELAY_MS, Math.max(agora, glideChainEndsAt));
    const atraso = Math.round(inicio - agora);
    glideChainEndsAt = inicio + duracao * GLIDE_STAGGER_FRACTION;
    el.style.setProperty("--wa-ar-glide-dur", `${duracao}ms`);
    if (atraso > 0) el.style.setProperty("--wa-ar-glide-delay", `${atraso}ms`);
    else el.style.removeProperty("--wa-ar-glide-delay");
    return "visivel";
  } catch {
    /* sem layout (teste/SSR): segue sem marcar */
    return null;
  }
}

/*
 * Quanto a moldura muda de altura no trecho MAIS ÍNGREME do caminho da proporção atual até a nova
 * (px por unidade de progresso). A altura não acompanha a proporção em linha reta: no retrato ela
 * satura no teto (max-h) a ~65% do caminho, e na foto deitada (altura = largura / proporção) o
 * começo é 3× mais íngreme que o fim — dimensionar pela variação total deixava picos de 19–29px
 * por frame. Amostra 6 pontos aplicando a proporção SEM transição (inline !important vence até o
 * reset de "reduzir movimento"), volta à antiga e assenta o estilo: a transição real começa da
 * altura antiga quando o chamador aplicar a nova. Só corre para moldura visível que vai deslizar.
 */
function frameGlideRunning(el) {
  try {
    const anims = typeof el.getAnimations === "function" ? el.getAnimations() : [];
    return anims.some((a) => a.transitionProperty === "--wa-media-ar-anim" && a.playState !== "finished");
  } catch {
    return false;
  }
}

function measureFrameHeightSlope(el, from, to) {
  /* Cada amostra força layout de verdade: com a moldura mais baixa o browser PRENDE o scrollTop do
     scroller ao novo máximo e não o devolve quando a altura volta. Sem repor, o frame seguinte
     pintava a conversa até ~150px abaixo (celular, lista estática) — revisão 25/11/2026. */
  const scroller = el.closest && el.closest(".wa-messages");
  const stAntes = scroller ? scroller.scrollTop : 0;
  try {
    const arAntes = el.style.getPropertyValue("--wa-media-ar");
    const trAntes = el.style.getPropertyValue("transition");
    const trPrioridade = el.style.getPropertyPriority("transition");
    el.style.setProperty("transition", "none", "important");
    const passos = 5;
    let anterior = null;
    let maior = 0;
    for (let i = 0; i <= passos; i += 1) {
      el.style.setProperty("--wa-media-ar", String(from + ((to - from) * i) / passos));
      const h = el.offsetHeight;
      if (anterior != null) maior = Math.max(maior, Math.abs(h - anterior) * passos);
      anterior = h;
    }
    if (arAntes) el.style.setProperty("--wa-media-ar", arAntes);
    else el.style.removeProperty("--wa-media-ar");
    void el.offsetHeight;
    if (trAntes) el.style.setProperty("transition", trAntes, trPrioridade);
    else el.style.removeProperty("transition");
    return maior;
  } catch {
    return 0;
  } finally {
    if (scroller && Math.abs(scroller.scrollTop - stAntes) >= 1) {
      try {
        scroller.scrollTop = stAntes;
      } catch {
        /* ignore */
      }
    }
  }
}

/** Só para testes: zera a fila de deslizes. */
export function __resetGlideQueueForTests() {
  glideChainEndsAt = 0;
}

export { GLIDE_MS as MEDIA_FRAME_GLIDE_MS };
