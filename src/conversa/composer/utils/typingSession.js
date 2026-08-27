export function createTypingSession() {
  let activeConversationId = null;

  return {
    start(conversaId, emit) {
      if (!conversaId) return false;
      if (String(activeConversationId ?? "") === String(conversaId)) return false;
      if (activeConversationId != null) return false;
      emit?.("typing_start", { conversa_id: conversaId });
      activeConversationId = conversaId;
      return true;
    },
    stop(conversaId, emit) {
      if (!conversaId) return false;
      if (String(activeConversationId ?? "") !== String(conversaId)) return false;
      activeConversationId = null;
      emit?.("typing_stop", { conversa_id: conversaId });
      return true;
    },
    getActiveConversationId() {
      return activeConversationId;
    },
  };
}
