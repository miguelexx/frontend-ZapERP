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
      const map = {};
      const truthy = (v) => v === true || v === "grant" || v === "granted";

      // Formato canônico do backend: { permissoes: { [codigo]: boolean }, detalhado: [...] }
      const raw = data?.permissoes;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        // Objeto-mapa codigo -> boolean
        for (const [cod, v] of Object.entries(raw)) {
          if (cod) map[cod] = v === true || truthy(v);
        }
      } else {
        // Fallback: lista de permissões (raw array, data array ou data.detalhado)
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(data?.detalhado)
          ? data.detalhado
          : Array.isArray(data)
          ? data
          : [];
        for (const p of list) {
          const cod = p?.codigo ?? p?.cod;
          if (cod) {
            const v = p?.concedido ?? p?.valor ?? p?.valor_efetivo ?? p?.granted;
            map[cod] = v === true || truthy(v);
          }
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
