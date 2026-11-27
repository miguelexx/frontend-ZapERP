import { useCallback, useEffect, useRef, useState } from "react";
import { Reply } from "lucide-react";

/** Arraste máximo visual (px) — bolha volta com mola ao soltar. */
const MAX_SHIFT = 76;
/** Distância horizontal mínima para disparar “modo responder”. */
const ACTIVATE_THRESHOLD = 52;
/** Se o gesto vertical passar disso primeiro, assume rolagem — cancela swipe. */
const VERT_ABORT_PX = 26;
/** Movimento horizontal mínimo para travar eixo em “horizontal”. */
const HORIZ_LOCK_PX = 12;
const HORIZ_RATIO = 1.18;

const COMMIT_DEBOUNCE_MS = 400;

function shouldIgnoreSwipeTarget(target) {
  if (!target || typeof target.closest !== "function") return true;
  return !!target.closest(
    [
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "label",
      "audio",
      "video",
      ".wa-msgMenuBtn",
      ".wa-reactionBtn",
      ".wa-reactionPicker",
      ".wa-reactionPicker-btn",
      ".wa-bubble-imgLink",
      ".wa-bubble-videoLink",
      ".wa-replyCtx",
      ".wa-bubble-fileAction",
      ".wa-audioPlayBtn",
      '[role="slider"]',
    ].join(",")
  );
}

/**
 * Envolve a bolha em mobile: arrastar na direção da conversa (entrada → direita, saída → esquerda)
 * ativa responder. Usa pointer events + touch-action: pan-y para não roubar rolagem vertical.
 */
export function SwipeReplyTrack({ enabled, outgoing, onCommit, gestureBlocked, children }) {
  const shiftRef = useRef(0);
  const [shift, setShift] = useState(0);
  const [spring, setSpring] = useState(true);
  const dragRef = useRef(null);
  const lastCommitRef = useRef(0);
  /* Vibração curta UMA vez ao cruzar o ponto de "responder" (como no WhatsApp; no iOS é no-op). */
  const crossedRef = useRef(false);

  const resetVisual = useCallback((animate) => {
    setSpring(animate !== false);
    shiftRef.current = 0;
    crossedRef.current = false;
    setShift(0);
  }, []);

  useEffect(() => {
    if (!enabled) resetVisual(false);
  }, [enabled, resetVisual]);

  const handlePointerDown = useCallback(
    (e) => {
      if (!enabled || gestureBlocked) return;
      if (e.button !== 0) return;
      if (shouldIgnoreSwipeTarget(e.target)) return;

      /*
         Sem setState aqui: um toque na bolha é quase sempre início de rolagem vertical, e
         desligar a mola já no pointerdown re-renderizava a linha a cada dedo pousado (e
         outra vez no pointerup, ao repor a mola) — trabalho de React no meio do gesto de
         scroll. A mola só estorva quando o eixo trava em horizontal; é lá que a desligamos.
      */
      dragRef.current = {
        pointerId: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        axis: null,
      };
    },
    [enabled, gestureBlocked]
  );

  const handlePointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;

      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;

      if (!d.axis) {
        if (Math.abs(dy) > VERT_ABORT_PX && Math.abs(dy) >= Math.abs(dx) * 1.08) {
          dragRef.current = null;
          resetVisual(true);
          return;
        }
        if (Math.abs(dx) > HORIZ_LOCK_PX && Math.abs(dx) >= Math.abs(dy) * HORIZ_RATIO) {
          d.axis = "h";
          setSpring(false);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch (_) {}
        } else {
          return;
        }
      }

      if (d.axis !== "h") return;

      let next = 0;
      if (outgoing) {
        next = dx < 0 ? Math.max(dx, -MAX_SHIFT) : 0;
      } else {
        next = dx > 0 ? Math.min(dx, MAX_SHIFT) : 0;
      }
      shiftRef.current = next;
      const crossed = Math.abs(next) >= ACTIVATE_THRESHOLD;
      if (crossed && !crossedRef.current) {
        try {
          navigator.vibrate?.(10);
        } catch (_) {}
      }
      crossedRef.current = crossed;
      setShift(next);
    },
    [outgoing, resetVisual]
  );

  const handlePointerUp = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}

      const horizontal = d.axis === "h";
      const mag = Math.abs(shiftRef.current);

      dragRef.current = null;

      if (horizontal && mag >= ACTIVATE_THRESHOLD) {
        const now = Date.now();
        if (now - lastCommitRef.current > COMMIT_DEBOUNCE_MS) {
          lastCommitRef.current = now;
          try {
            onCommit?.();
          } catch (_) {}
        }
      }

      resetVisual(true);
    },
    [onCommit, resetVisual]
  );

  const handlePointerCancel = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
      dragRef.current = null;
      resetVisual(true);
    },
    [resetVisual]
  );

  if (!enabled) {
    return children;
  }

  return (
    <div
      className="wa-swipeReplyTrack"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{ touchAction: "pan-y" }}
    >
      {/*
       * Seta de responder que cresce atrás da bolha durante o gesto (26/11/2026): antes ficava um
       * vão vazio e o atendente não sabia se o gesto "pegou" antes de soltar. Absoluta (sem
       * layout); só existe enquanto a bolha está deslocada.
       */}
      {shift !== 0 ? (
        <span
          className={`wa-swipeReplyHint${outgoing ? " wa-swipeReplyHint--out" : ""}${
            Math.abs(shift) >= ACTIVATE_THRESHOLD ? " isArmed" : ""
          }`}
          aria-hidden="true"
          style={{
            opacity: Math.min(1, Math.abs(shift) / ACTIVATE_THRESHOLD),
            transform: `translateY(-50%) scale(${0.6 + 0.4 * Math.min(1, Math.abs(shift) / ACTIVATE_THRESHOLD)})`,
          }}
        >
          <Reply size={16} strokeWidth={2.2} />
        </span>
      ) : null}
      <div
        className={`wa-swipeReplyShift ${spring ? "wa-swipeReplyShift--spring" : "wa-swipeReplyShift--dragging"}`}
        style={{
          transform: `translateX(${shift}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
