import { create } from "zustand"

/**
 * Estado da ligação em tempo real, só para a UI poder avisar o atendente.
 *
 * Porque existe: até 2026-11-13 o `connect`/`disconnect` do Socket.IO só fazia
 * `console.debug` dentro de `import.meta.env.DEV`. Em produção, socket caído não aparecia
 * em nenhum lugar — a lista congelava e o atendente ficava à espera de mensagem que nunca
 * chegava, achando que o cliente não tinha respondido.
 *
 * Este módulo é DELIBERADAMENTE leve e não importa `socket.js`: quem o lê é o
 * `ConnectionStatusBanner`, montado no `MainLayout` (chunk de entrada). Importar o socket
 * daqui arrastaria o motor de conversas para esse chunk — a mesma razão pela qual
 * `api/http.js` fala com o socket por `runtime/sessionRuntime.js`.
 *
 * A escrita vem só dos handlers que já existiam em `socket.js`. Nenhum listener de domínio
 * novo (invariante de `14-CONVENCOES-E-INVARIANTES.md`).
 */

function navegadorOnline() {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

export const useConnectionStore = create((set, get) => ({
  /** Socket.IO com ligação viva agora. */
  conectado: false,
  /** Já houve uma ligação nesta sessão — antes disso não se avisa nada (é o boot normal). */
  jaConectou: false,
  /** `navigator.onLine`. Distingue "o teu wi-fi caiu" de "o servidor não responde". */
  online: navegadorOnline(),
  /** `Date.now()` da última mudança de `conectado`, para o banner medir há quanto tempo está em baixo. */
  desde: 0,

  marcarConectado: () => {
    const s = get()
    if (s.conectado && s.jaConectou) return
    set({ conectado: true, jaConectou: true, desde: Date.now() })
  },

  marcarDesconectado: () => {
    const s = get()
    if (!s.conectado) return
    set({ conectado: false, desde: Date.now() })
  },

  setOnline: (valor) => {
    const next = valor !== false
    if (get().online === next) return
    set({ online: next })
  },

  /** Logout / troca de token: volta ao estado de boot para não piscar aviso no login. */
  reiniciar: () => set({ conectado: false, jaConectou: false, desde: 0, online: navegadorOnline() }),
}))

/**
 * Estado para a UI:
 *  - `boot`      → ainda não ligou nenhuma vez; não mostrar nada
 *  - `ligado`    → tempo real a funcionar
 *  - `offline`   → o dispositivo está sem rede
 *  - `religando` → há rede, o socket é que caiu (o cliente Socket.IO está a tentar)
 */
export function statusConexao(state) {
  if (state.conectado) return "ligado"
  if (!state.jaConectou) return "boot"
  return state.online ? "religando" : "offline"
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("online", () => useConnectionStore.getState().setOnline(true))
  window.addEventListener("offline", () => useConnectionStore.getState().setOnline(false))
}
