import { useEffect } from "react";
import { getSocket } from "../socket/socket";
import { useCrmStore } from "./crmStore";

/**
 * Escuta eventos Socket.IO do CRM e invalida cache lógico (bump no store).
 * Evite refetch em loop: as páginas devem reagir ao `refreshTick` com debounce leve se necessário.
 */
export function useCrmSocketEvents(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const s = getSocket();
    if (!s) return;

    const bump = () => {
      useCrmStore.getState().bumpRefresh();
    };

    s.on("crm:lead_updated", bump);
    s.on("crm:kanban_refresh", bump);

    return () => {
      s.off("crm:lead_updated", bump);
      s.off("crm:kanban_refresh", bump);
    };
  }, [enabled]);
}
