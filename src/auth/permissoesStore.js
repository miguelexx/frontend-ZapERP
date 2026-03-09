import { create } from "zustand";
import { getMinhasPermissoes } from "../api/permissoesService";

/**
 * Store das permissões do usuário logado (GET /usuarios/me/permissoes).
 * Usado para mostrar/ocultar menus e proteger rotas.
 * Formato: { [codigo]: true|false } onde true = grant, false = deny
 */
export const usePermissoesStore = create((set) => ({
  permissoes: null, // null = ainda não carregou; {} = carregou vazio; { cod: true, ... }
  loading: false,

  fetchPermissoes: async () => {
    set({ loading: true });
    try {
      const data = await getMinhasPermissoes();
      const list = data?.permissoes ?? (Array.isArray(data) ? data : []);
      const map = {};
      for (const p of list) {
        const cod = p?.codigo ?? p?.cod;
        if (cod) {
          const v = p?.valor ?? p?.valor_efetivo ?? p?.granted;
          map[cod] = v === true || v === "grant" || v === "granted";
        }
      }
      set({ permissoes: map, loading: false });
      return map;
    } catch (err) {
      set({ permissoes: {}, loading: false });
      return {};
    }
  },

  clearPermissoes: () => set({ permissoes: null }),
}));
