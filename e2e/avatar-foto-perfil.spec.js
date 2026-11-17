/**
 * Foto de perfil do cliente no card da lista.
 *
 * Regressão de 2026-11-16: no celular nenhuma foto aparecia (só as iniciais) enquanto no
 * desktop apareciam. A foto era o único <img> do app que ia direto a um host de terceiros
 * (`pps.whatsapp.net`) — o resto da mídia já passa pelo `/media/proxy`. Bloqueio de
 * rastreamento / DNS filtrado / economia de dados do aparelho cortam exatamente esse
 * pedido. Agora a foto vai pelo proxy da API (utils/avatarProxyUrl.js).
 *
 * O teste simula o aparelho: o host de terceiros é ABORTADO e a foto só pode chegar
 * pelo proxy. Roda nos dois projects (chromium-desktop e chromium-mobile).
 */
import { test, expect } from "@playwright/test";

const API = process.env.VITE_API_URL || "http://localhost:5000";
const CDN = "https://pps.whatsapp.net";
const TOTAL = 30; // acima de CHAT_LIST_VIRTUAL_THRESHOLD (24) → lista virtualizada

const chats = Array.from({ length: TOTAL }, (_, i) => {
  const id = i + 1;
  return {
    id,
    contato_nome: `Contato ${id}`,
    nome_contato_cache: `Contato ${id}`,
    telefone: `5511999990${String(id).padStart(3, "0")}`,
    foto_perfil: `${CDN}/v/t61.24694-24/foto-${id}.jpg`,
    status_atendimento: "em_atendimento",
    status_atendimento_real: "em_atendimento",
    atendente_id: 1,
    departamento_id: 1,
    unread_count: 0,
    ultima_atividade: "2026-11-16T20:00:00.000Z",
  };
});

function fotoSvg(seed) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="100%" height="100%" fill="hsl(${(seed * 37) % 360} 70% 50%)"/></svg>`;
}

async function setup(page, { bloquearCdn }) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "zap_erp_auth",
      JSON.stringify({
        token: "jwt-de-teste",
        user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] },
      })
    )
  );

  const pedidosAoCdn = [];
  await page.route(`${CDN}/**`, (route) => {
    pedidosAoCdn.push(route.request().url());
    // É isto que o aparelho faz quando corta o host de terceiros.
    if (bloquearCdn) return route.abort("blockedbyclient");
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: fotoSvg(1) });
  });

  const pedidosAoProxy = [];
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    if (p.startsWith("/socket.io")) return route.abort();

    if (p === "/media/proxy") {
      const alvo = u.searchParams.get("url") || "";
      pedidosAoProxy.push({ alvo, token: u.searchParams.get("access_token") });
      const n = Number(alvo.match(/foto-(\d+)\.jpg/)?.[1] || 1);
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        headers: { "Cache-Control": "private, max-age=86400, immutable" },
        body: fotoSvg(n),
      });
    }
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    return route.fulfill({ json: {} });
  });

  return { pedidosAoCdn, pedidosAoProxy };
}

/** Avatares montados x realmente visíveis (.is-loaded é o que tira o opacity: 0). */
async function avatarStats(page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll(".chat-list-avatar-img")];
    return {
      montados: imgs.length,
      visiveis: imgs.filter((i) => i.classList.contains("is-loaded")).length,
      viaProxy: imgs.filter((i) => new URL(i.src, location.href).pathname === "/media/proxy").length,
    };
  });
}

test("foto de perfil aparece mesmo com o host de terceiros bloqueado", async ({ page }) => {
  const { pedidosAoCdn, pedidosAoProxy } = await setup(page, { bloquearCdn: true });

  await page.goto("/atendimento");
  await page.waitForSelector(".chat-list-avatar-img", { timeout: 30_000 });
  await expect
    .poll(async () => (await avatarStats(page)).visiveis, { timeout: 15_000 })
    .toBeGreaterThan(0);

  const stats = await avatarStats(page);

  expect(stats.visiveis, "todas as fotos montadas devem ficar visíveis").toBe(stats.montados);
  expect(stats.viaProxy, "todas as fotos devem ser servidas pelo /media/proxy").toBe(stats.montados);
  expect(pedidosAoCdn, "nenhum pedido deve ir direto ao host de terceiros").toEqual([]);

  // O proxy precisa receber a URL real e o JWT (um <img> não manda header Authorization).
  expect(pedidosAoProxy.length).toBeGreaterThan(0);
  for (const p of pedidosAoProxy) {
    expect(p.alvo.startsWith(`${CDN}/`)).toBe(true);
    expect(p.token).toBe("jwt-de-teste");
  }
});
