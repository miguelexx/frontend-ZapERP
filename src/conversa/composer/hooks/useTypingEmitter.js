import { useCallback, useEffect, useRef } from "react";
import { getSocket } from "../../../socket/socket";
import { createTypingSession } from "../utils/typingSession";

const TYPING_DEBOUNCE_MS = 400;

export function useTypingEmitter({ conversaId, texto, disabled, clearTyping }) {
  const timeoutRef = useRef(null);
  const sessionRef = useRef(null);
  if (!sessionRef.current) sessionRef.current = createTypingSession();

  const emitTypingStop = useCallback((targetId = conversaId) => {
    if (!targetId) return;
    const socket = getSocket();
    sessionRef.current.stop(targetId, socket?.connected ? socket.emit.bind(socket) : null);
  }, [conversaId]);

  const emitTypingStart = useCallback(() => {
    if (!conversaId || disabled) return;
    const socket = getSocket();
    if (!socket?.connected) return;
    sessionRef.current.start(conversaId, socket.emit.bind(socket));
  }, [conversaId, disabled]);

  useEffect(() => {
    if (!conversaId || disabled || !String(texto || "")) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      emitTypingStop();
      return undefined;
    }
    if (sessionRef.current.getActiveConversationId() != null) return undefined;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      emitTypingStart();
    }, TYPING_DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [conversaId, disabled, emitTypingStart, emitTypingStop, texto]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      emitTypingStop(conversaId);
      if (conversaId) clearTyping?.(conversaId);
    };
  }, [conversaId, clearTyping, emitTypingStop]);

  return { emitTypingStop };
}
