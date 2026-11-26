import { useEffect, useMemo, useRef, useState } from "react";
import { pickLoadedMediaSrcFromEvent, resolveBubbleMediaCandidates } from "../../utils/conversaViewHelpers";
import { canReprocessInboundMedia, requestInboundMediaReprocess } from "../utils/inboundMediaReprocess";
import {
  applyAspectRatioVar,
  clampAspectRatio,
  mediaRatioKey,
  recallAspectRatio,
  rememberAspectRatio,
} from "../utils/mediaAspectRatio";
import MessageCaption from "./MessageCaption";

/** Sem onLoad nem onError neste prazo, o download é tratado como travado (ver vigia abaixo). */
const IMAGE_STALL_MS = 15000;

/*
 * URL de uma nova tentativa manual: acrescenta `_r=<n>` só a http(s) sem assinatura (URL
 * pré-assinada quebraria com um parâmetro a mais; blob:/data: não fazem pedido de rede). O
 * /media/proxy só lê url/filename/disposition — o parâmetro extra é ignorado lá.
 */
function withManualRetryParam(src, n) {
  if (!n || !src) return src;
  const rede = /^(https?:)?\/\//i.test(src) || src.startsWith("/");
  if (!rede) return src;
  if (/[?&](X-Amz-Signature|X-Amz-Credential|Signature|sig|Expires|token)=/i.test(src)) return src;
  return `${src}${src.includes("?") ? "&" : "?"}_r=${n}`;
}

/** Sobe do <img> até a moldura (botão) que recorta a foto — é nela que mora a proporção. */
function frameOf(el) {
  return el?.closest?.(".wa-bubble-imgLink") || el?.parentElement || null;
}

/** Imagem na bolha com fallback: blob local → URL do servidor → proxy. */
export function BubbleImage({ msg, alt, className, out, onAspectRatio }) {
  // StickerMessage não passa `out`: deriva da própria mensagem — o backend só
  // reprocessa mídia recebida, então mídia nossa não deve ganhar o botão.
  const ehOut = out !== undefined ? !!out : String(msg?.direcao || "").toLowerCase() === "out";
  const candidates = useMemo(() => resolveBubbleMediaCandidates(msg), [
    msg?._optimisticBlobUrl,
    msg?.url,
    msg?.url_absoluta,
    msg?.media_url,
    msg?.mediaUrl,
    msg?.file_url,
    msg?.fileUrl,
    msg?.download_url,
    msg?.downloadUrl,
  ]);
  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [retryRound, setRetryRound] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);
  const [reprocessDefinitivo, setReprocessDefinitivo] = useState(false);
  /* Download travado sem mais fontes para tentar: mostra "tentar de novo" por cima da moldura. */
  const [stalled, setStalled] = useState(false);
  /* Toques em "tentar de novo": viram um parâmetro na URL para o pedido ser NOVO — com a mesma
     URL o navegador junta o <img> novo ao pedido pendurado do antigo (revisão 25/11/2026). */
  const [manualRetry, setManualRetry] = useState(0);
  const imgRef = useRef(null);
  const retryTimerRef = useRef(null);
  const reprocessAutoTriedRef = useRef(false);
  const reprocessInFlightRef = useRef(false);

  useEffect(() => {
    setIdx(0);
    setExhausted(false);
    setRetryRound(0);
    setManualRetry(0);
    // Lista de fontes mudou (ex.: URL recuperada pelo reprocesso entrou na store):
    // libera uma nova tentativa automática para o novo conjunto.
    reprocessAutoTriedRef.current = false;
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    // Quando a lista de fontes muda mas a fonte exibida (candidates[0]) continua a mesma
    // — caso da reconciliação otimista, em que o servidor apenas ANEXA a URL definitiva
    // depois do blob local —, o <img> NÃO redispara `onLoad` (o src não mudou). Sem herdar
    // o estado real do elemento, `loaded` ficaria falso para sempre e a imagem manteria a
    // classe `is-loading` (min-height gigante, caixa cinza vazia). Derivamos `loaded` de
    // `img.complete`; para uma fonte de fato nova, `complete` é falso e o onLoad assume.
    const el = imgRef.current;
    const nextSrc = candidates[0] || "";
    const complete = !!(el && el.complete && el.naturalWidth > 0 && el.getAttribute("src") === nextSrc);
    setLoaded(complete);
    if (complete && el.naturalWidth > 0 && el.naturalHeight > 0) {
      el.style.setProperty("--wa-img-ar", `${el.naturalWidth} / ${el.naturalHeight}`);
      const ratio = clampAspectRatio(el.naturalWidth, el.naturalHeight);
      applyAspectRatioVar(frameOf(el), ratio);
      onAspectRatio?.(ratio);
    }
  }, [candidates.join("\u0001")]);

  useEffect(
    () => () => {
      if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
    },
    []
  );

  /*
   * Vigia de download travado (25/11/2026). O <img> só saía do "carregando" por onLoad/onError;
   * um pedido que nunca responde (proxy/CDN do provedor parado) não dispara nenhum dos dois e a
   * bolha ficava para sempre como uma caixa clara vazia só com a hora. Passado STALL_MS sem
   * carregar: se houver outra fonte (proxy → URL direta), passa para ela; senão mantém o pedido
   * vivo (foto grande em 3G pode mesmo demorar) e oferece "tentar de novo". A moldura não muda
   * de tamanho em nenhum dos casos.
   */
  const currentSrc = candidates[idx] || "";
  useEffect(() => {
    setStalled(false);
    if (loaded || exhausted || !currentSrc) return undefined;
    const timer = window.setTimeout(() => {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth > 0) return;
      if (idx + 1 < candidates.length) {
        setIdx((i) => (i === idx ? i + 1 : i));
        return;
      }
      setStalled(true);
    }, IMAGE_STALL_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSrc, retryRound, manualRetry, loaded, exhausted]);

  const dispararReprocesso = () => {
    if (reprocessInFlightRef.current) return;
    if (!canReprocessInboundMedia(msg, ehOut)) return;
    reprocessInFlightRef.current = true;
    setReprocessando(true);
    requestInboundMediaReprocess(msg)
      .then((r) => {
        if (r?.ok) {
          // URL recuperada já foi aplicada na store (candidates mudam e o efeito acima
          // rearma tudo). Se a URL for a mesma (arquivo restaurado no disco), força uma
          // nova rodada local — o <img> volta a tentar as mesmas fontes.
          setIdx(0);
          setExhausted(false);
          setRetryRound(0);
        } else if (r?.definitivo) {
          setReprocessDefinitivo(true);
        }
      })
      .finally(() => {
        reprocessInFlightRef.current = false;
        setReprocessando(false);
      });
  };

  // Esgotou as fontes mesmo após a rodada local de retry: pede ao backend uma nova cópia
  // da mídia UMA vez, sozinho (link do provedor pode estar vivo; só a cópia local falhou).
  useEffect(() => {
    if (!exhausted || retryRound < 1) return;
    if (reprocessAutoTriedRef.current) return;
    if (!canReprocessInboundMedia(msg, ehOut)) return;
    reprocessAutoTriedRef.current = true;
    dispararReprocesso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhausted, retryRound]);

  const src = candidates[idx] || "";
  if (!src || exhausted) {
    // Dentro de <button class="wa-bubble-imgLink"> — usar <span role="button"> (botão
    // aninhado é HTML inválido) e segurar o clique para não abrir o viewer quebrado.
    if (canReprocessInboundMedia(msg, ehOut) && !reprocessDefinitivo) {
      return (
        <span
          role="button"
          tabIndex={0}
          className="wa-bubble-text wa-muted wa-bubble-imgRetry"
          aria-busy={reprocessando ? "true" : undefined}
          onPointerDown={(e) => {
            // Sem isto, no mobile o onPointerUp do botão pai (wa-bubble-imgLink) abriria o
            // viewer quebrado ANTES do onClick do chip — o tap deve só tentar recuperar.
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!reprocessando) dispararReprocesso();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            if (!reprocessando) dispararReprocesso();
          }}
          title={reprocessando ? "Recuperando a imagem…" : "Não foi possível carregar. Clique para tentar de novo."}
        >
          {reprocessando ? "Recuperando imagem…" : "Imagem indisponível — tentar de novo"}
        </span>
      );
    }
    return (
      <span className="wa-bubble-text wa-muted">
        {reprocessDefinitivo ? "Imagem expirou no WhatsApp" : "(imagem)"}
      </span>
    );
  }

  const tentarDeNovo = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setStalled(false);
    setExhausted(false);
    /* Com mais de uma fonte, passa para a seguinte em vez de voltar à que travou. */
    setIdx((i) => (candidates.length > 1 ? (i + 1) % candidates.length : 0));
    setManualRetry((n) => n + 1);
  };

  const displaySrc = withManualRetryParam(src, manualRetry);

  return (
    <>
    <img
      key={`${displaySrc}:${retryRound}`}
      ref={imgRef}
      src={displaySrc}
      alt={alt}
      className={`${className || ""} ${loaded ? "is-loaded" : "is-loading"}`.trim()}
      loading="eager"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        setLoaded(true);
        setStalled(false);
        const el = e.currentTarget;
        if (el?.naturalWidth > 0 && el?.naturalHeight > 0) {
          /* Fixa a proporção real para reloads/cache da mesma bolha (menos CLS). */
          el.style.setProperty("--wa-img-ar", `${el.naturalWidth} / ${el.naturalHeight}`);
          /* A moldura assume a forma da foto já neste paint (sem esperar o re-render). */
          const ratio = clampAspectRatio(el.naturalWidth, el.naturalHeight);
          applyAspectRatioVar(frameOf(el), ratio);
          onAspectRatio?.(ratio);
        }
      }}
      onError={() => {
        setLoaded(false);
        if (idx + 1 < candidates.length) {
          setIdx(idx + 1);
          return;
        }
        setExhausted(true);
        if (retryRound < 1 && retryTimerRef.current == null) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            setRetryRound((round) => round + 1);
            setIdx(0);
            setExhausted(false);
          }, 700);
        }
      }}
    />
    {stalled && !loaded ? (
      /* Absoluto dentro da moldura (contain: layout) — não muda a altura da bolha. <span
         role="button">: está dentro do <button> da moldura (botão aninhado é HTML inválido). */
      <span
        role="button"
        tabIndex={0}
        className="wa-bubble-imgStalled"
        title="A imagem está demorando. Clique para tentar de novo."
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={tentarDeNovo}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          tentarDeNovo(e);
        }}
      >
        Demorando — tentar de novo
      </span>
    ) : null}
    </>
  );
}

export default function ImageMessage({
  msg,
  mediaUrl,
  texto,
  showCaption,
  out,
  onPointerDown,
  onPointerUp,
  onClick,
}) {
  const ratioKey = useMemo(() => mediaRatioKey(msg, mediaUrl), [
    msg?.whatsapp_id,
    msg?.id,
    msg?.tempId,
    msg?.client_temp_id,
    mediaUrl,
  ]);
  // Lembrada de uma montagem anterior: ao rolar de volta, a bolha já nasce na forma da foto
  // em vez de abrir quadrada e "pular" quando o arquivo decodifica.
  const [ratio, setRatio] = useState(() => recallAspectRatio(ratioKey));

  /* `|| prev` (como no vídeo, 16/11): a chave pode mudar sem remontar a bolha (client_temp_id
     chegando com a lista do servidor). Sem cache na chave nova o ratio ia a 0, o React tirava
     `--wa-media-ar` da moldura e a foto voltava a quadrada — sem onLoad novo para corrigir. */
  useEffect(() => {
    setRatio((prev) => recallAspectRatio(ratioKey) || prev);
  }, [ratioKey]);

  return (
    <div className="wa-bubble-mediaStack">
      <button
        type="button"
        className="wa-bubble-imgLink"
        style={ratio > 0 ? { "--wa-media-ar": ratio } : undefined}
        onPointerDown={onPointerDown}
        onPointerUp={(e) => onPointerUp?.(e, pickLoadedMediaSrcFromEvent(e) || mediaUrl, "imagem")}
        onClick={(e) => onClick?.(e, pickLoadedMediaSrcFromEvent(e) || mediaUrl, "imagem")}
      >
        <BubbleImage
          msg={msg}
          alt="imagem"
          className="wa-bubble-img"
          out={out}
          onAspectRatio={(r) => {
            if (!(r > 0)) return;
            rememberAspectRatio(ratioKey, r);
            setRatio((atual) => (atual === r ? atual : r));
          }}
        />
      </button>
      <MessageCaption texto={texto} show={showCaption} />
    </div>
  );
}
