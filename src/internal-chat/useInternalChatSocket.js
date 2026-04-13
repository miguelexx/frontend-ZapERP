import { useEffect, useRef } from "react";
import { getSocket } from "../socket/socket";

/**
 * Assina apenas eventos do chat interno; cleanup remove listeners deste módulo.
 * Não altera listeners do atendimento WhatsApp.
 */
export function useInternalChatSocket(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const onConversationCreated = (payload) => {
      try {
        ref.current.onConversationCreated?.(payload);
      } catch (_) {}
    };
    const onMessageCreated = (payload) => {
      try {
        ref.current.onMessageCreated?.(payload);
      } catch (_) {}
    };
    const onConversationRead = (payload) => {
      try {
        ref.current.onConversationRead?.(payload);
      } catch (_) {}
    };

    socket.on("internal_chat:conversation_created", onConversationCreated);
    socket.on("internal_chat:message_created", onMessageCreated);
    socket.on("internal_chat:conversation_read", onConversationRead);

    return () => {
      socket.off("internal_chat:conversation_created", onConversationCreated);
      socket.off("internal_chat:message_created", onMessageCreated);
      socket.off("internal_chat:conversation_read", onConversationRead);
    };
  }, []);
}
