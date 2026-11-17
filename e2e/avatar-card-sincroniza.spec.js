/**
 * Card e cabeçalho mostram a MESMA foto.
 *
 * Regressão de 2026-11-16: ao abrir a conversa, o cabeçalho mostrava a foto do cliente e
 * o card da lista continuava nas iniciais. O cabeçalho lê o detalhe (`GET /chats/:id`);
 * o card lê a row da lista (`GET /chats`), que pode ter sido carregada ANTES de o contato
 * ser sincronizado — e nada devolvia nome/foto do detalhe para a row.
 *
 * Só no desktop: no mobile a lista sai da tela quando a conversa abre. O bug não depende
 * de layout.
 */
import { test, expect } from "@playwright/test";

const API = process.env.VITE_API_URL || "http://localhost:5000";

// A row chega SEM foto e sem nome resolvido — como uma lista carregada antes do sync.
const rowSemFoto = {
  id: 1,
  contato_nome: null,
  nome_contato_cache: null,
  telefone: "5511999990001",
  cliente_id: 77,
  foto_perfil: null,
  foto_perfil_contato_cache: null,
  status_atendimento: "em_atendimento",
  status_atendimento_real: "em_atendimento",
  atendente_id: 1,
  departamento_id: 1,
  unread_count: 0,
  ultima_atividade: "2026-11-16T23:17:00.000Z",
};

// O detalhe já traz nome e foto (o GET de abertura dispara o enriquecimento no backend).
const detalhe = {
  ...rowSemFoto,
  contato_nome: "Miguel",
  nome_contato_cache: "Miguel",
  foto_perfil: "/uploads/foto-miguel.svg",
  foto_perfil_contato_cache: "/uploads/foto-miguel.svg",
  mensagens_bloqueadas: false,
};

async function setup(page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "zap_erp_auth",
      JSON.stringify({
        token: "jwt-de-teste",
        user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] },
      })
    )
  );

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p.startsWith("/socket.io")) return route.abort();

    if (p === "/uploads/foto-miguel.svg") {
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="100%" height="100%" fill="#1d4ed8"/></svg>`,
      });
    }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    // A lista NUNCA devolve a foto — nem num refresh. Só o detalhe tem.
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: [rowSemFoto] });
    if (p === "/chats/1" && req.method() === "GET") {
      return route.fulfill({ json: { conversa: detalhe, mensagens: [], next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
}

test("ao abrir a conversa, a foto do detalhe também entra no card da lista", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "a lista some da tela no mobile");

  await setup(page);
  await page.goto("/atendimento");

  const card = page.locator(".chat-list-row").first();
  await card.waitFor({ timeout: 30_000 });
  // Antes de abrir, o card não tem foto — é o estado de partida, não o bug.
  await expect(card.locator(".chat-list-avatar-img")).toHaveCount(0);

  await card.click();

  // O cabeçalho pega a foto do detalhe...
  await expect(page.locator(".wa-avatar-img")).toBeVisible({ timeout: 20_000 });

  // ...e o card tem de acompanhar, em vez de ficar nas iniciais.
  const fotoDoCard = card.locator(".chat-list-avatar-img");
  await expect(fotoDoCard).toHaveCount(1, { timeout: 10_000 });
  await expect(fotoDoCard).toHaveClass(/is-loaded/, { timeout: 10_000 });

  // E o nome resolvido pelo detalhe também.
  await expect(card.locator(".chat-list-title")).toHaveText("Miguel");

  // Durabilidade: a lista SEGUE devolvendo a row sem foto. Os refreshes que o app faz
  // depois da carga inicial não podem apagar o que o detalhe preencheu.
  await page.waitForTimeout(4000);
  await expect(fotoDoCard).toHaveCount(1);
  await expect(card.locator(".chat-list-title")).toHaveText("Miguel");
});
