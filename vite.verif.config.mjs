// Config TEMPORÁRIA: constrói só a página de verificação visual da busca de cliente, com
// caminhos relativos para abrir por `file://`. Removida antes do fim da sessão.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: { input: { verif: "verif-cliente.html" } },
  },
});
