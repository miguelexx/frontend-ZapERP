/**
 * Canal Whapi caído → QR Code na própria tela (overlay de desconexão).
 *
 * O que este arquivo trava, no navegador de verdade:
 *  - supervisor/admin vê o QR sem sair do atendimento;
 *  - atendente continua com o aviso vermelho e NÃO chama as rotas de instância
 *    (elas são supervisor/admin: ele levaria 403 e ficaria com a moldura quebrada);
 *  - quando o canal autentica, o overlay apaga sozinho.
 *
 * O overlay exige DUAS leituras consecutivas de "desconectado" (regra anti-falso-
 * positivo do useWhapiChannelStatus). Aqui o relógio é controlado pelo Playwright:
 * roda a 1ª checagem, espera a resposta chegar e dispara o revalidate de foco.
 */
import { expect, test } from "@playwright/test";

const API = process.env.VITE_API_URL || "http://localhost:5000";

const INSTANCE_ID = 7;
// PNG 21x21 em preto e branco — a mesma forma de um QR de verdade na moldura.
const QR_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABUAAAAVCAIAAAAmdTLBAAAAdklEQVR4nJ2RUQ7AIAhDvf+lt8SPDUstUD6MIbaU51qsnl1woS95RbGp/5TR0ZwPXoP5pp4idPS1xS0k7ZNm/B66szh/C1FF3rzk6IKtDEw8ONLR2LddMD94C2ACTeuDWxYzhFQvgNXhBTCg25qv6c6YqdgGwhdmfV6+5lky7AAAAABJRU5ErkJggg==";

const admin = {
  id: 1,
  nome: "Admin ZapERP",
  email: "admin@zaperp.local",
  perfil: "admin",
  role: "admin",
  company_id: 12,
};

async function installMock(page, sessionUser = admin) {
  const calls = { whapiStatus: 0, instances: 0, instanceStatus: 0, qrcode: 0 };
  // down: "QR" = aparelho desvinculado (code 3). "LAUNCH" = canal reconectando
  // sozinho depois de uma oscilação de rede (code 2) — não pode virar QR na tela.
  const state = { channelUp: false, down: { status: "QR", code: 3 } };

  await page.addInitScript((user) => {
    localStorage.setItem(
      "zap_erp_auth",
      JSON.stringify({ token: "whapi-reconnect-local", user })
    );
  }, sessionUser);

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body) => route.fulfill({ json: body });

    if (path.startsWith("/socket.io")) return route.abort();

    if (path === "/chats/whapi-status") {
      calls.whapiStatus += 1;
      return json({
        ok: true,
        isWhapi: true,
        provider: "whapi",
        connected: state.channelUp,
        status: state.channelUp ? "AUTH" : state.down.status,
        statusCode: state.channelUp ? 4 : state.down.code,
        unlinked: !state.channelUp && state.down.code === 3,
      });
    }

    if (path === "/api/integrations/whatsapp/instances") {
      calls.instances += 1;
      return json({
        instances: [
          {
            id: INSTANCE_ID,
            nome: "Comercial · Uberlândia",
            provider: "whapi",
            ativo: true,
            is_default: true,
            connected: state.channelUp,
            live_status: state.channelUp ? "AUTH" : state.down.status,
            display_phone: "+55 34 99999-8888",
          },
        ],
        whapi: { partnerEnabled: true },
      });
    }

    if (path === `/api/integrations/whatsapp/instances/${INSTANCE_ID}/status`) {
      calls.instanceStatus += 1;
      return json({
        provider: "whapi",
        connected: state.channelUp,
        status: state.channelUp ? "AUTH" : state.down.status,
        statusCode: state.channelUp ? 4 : state.down.code,
        phone: state.channelUp ? "5534999998888" : null,
      });
    }

    if (path === `/api/integrations/whatsapp/instances/${INSTANCE_ID}/qrcode`) {
      calls.qrcode += 1;
      return json({ provider: "whapi", connected: false, qrBase64: QR_PNG });
    }

    if (path === "/usuarios/me") return json({ ...sessionUser });
    if (path === "/usuarios/me/permissoes") return json({ permissoes: [] });
    if (path === "/config/empresa") return json({ id: 12, nome: "ZapERP E2E" });
    if (path === "/chats/whatsapp-instances") return json({ instances: [], active_count: 0 });
    if (path === "/tags" || path === "/dashboard/departamentos") return json([]);
    if (path === "/chats/counts") return json({ todas: 0, minha_fila: 0 });
    if (path === "/chats" && request.method() === "GET") return json([]);
    return json({});
  });

  return { calls, state };
}

/** Leva o app até a SEGUNDA leitura de "desconectado" (quando o overlay acende). */
async function derrubarCanal(page, calls) {
  await page.clock.runFor(3_000); // 1ª checagem (WHAPI_STATUS_FIRST_DELAY_MS)
  await expect.poll(() => calls.whapiStatus, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.clock.runFor(21_000); // passa da trava de 20s do revalidate por foco
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => calls.whapiStatus, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
}

test("admin vê o QR Code na tela de canal desconectado", async ({ page }) => {
  const { calls } = await installMock(page);
  await page.clock.install();
  await page.goto("/atendimento");
  await derrubarCanal(page, calls);

  await expect(page.getByRole("heading", { name: "Escaneie para reconectar" })).toBeVisible();
  await expect(page.getByText(/Nenhuma mensagem é enviada ou recebida/)).toBeVisible();
  await expect(page.getByRole("img", { name: /QR Code para reconectar/ })).toBeVisible();
  await expect(page.getByText("Dispositivos conectados")).toBeVisible();
  await expect(page.getByText(/Canal: Comercial/)).toBeVisible();

  // O QR veio do canal CAÍDO, não de uma instância qualquer.
  expect(calls.qrcode).toBeGreaterThanOrEqual(1);
  expect(calls.instances).toBeGreaterThanOrEqual(1);
});

test("atendente continua no aviso vermelho e não chama as rotas de instância", async ({ page }) => {
  const { calls } = await installMock(page, {
    ...admin,
    nome: "Atendente",
    perfil: "atendente",
    role: "atendente",
  });
  await page.clock.install();
  await page.goto("/atendimento");
  await derrubarCanal(page, calls);

  await expect(page.getByRole("heading", { name: "WhatsApp DESCONECTADO" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Escaneie para reconectar" })).toHaveCount(0);
  expect(calls.instances).toBe(0);
  expect(calls.qrcode).toBe(0);
});

test("ao autenticar o canal, o overlay apaga sozinho", async ({ page }) => {
  const { calls, state } = await installMock(page);
  await page.clock.install();
  await page.goto("/atendimento");
  await derrubarCanal(page, calls);
  await expect(page.getByRole("img", { name: /QR Code para reconectar/ })).toBeVisible();

  state.channelUp = true;
  await page.clock.runFor(7_000); // STATUS_POLL_MS do cartão (6s)

  await expect(page.getByRole("heading", { name: "Escaneie para reconectar" })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "WhatsApp DESCONECTADO" })).toHaveCount(0);
});

test("canal reconectando sozinho (LAUNCH) não mostra QR Code", async ({ page }) => {
  const { calls, state } = await installMock(page);
  state.down = { status: "LAUNCH", code: 2 }; // 1 INIT → 2 LAUNCH → 4 AUTH: reconexão normal
  await page.clock.install();
  await page.goto("/atendimento");
  await derrubarCanal(page, calls);

  await expect(page.getByRole("heading", { name: "Escaneie para reconectar" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "WhatsApp DESCONECTADO" })).toHaveCount(0);
  expect(calls.qrcode).toBe(0);
});

test("internet do navegador caiu: a tela some e volta quando a rede volta", async ({ page, context }) => {
  const { calls } = await installMock(page);
  await page.clock.install();
  await page.goto("/atendimento");
  await derrubarCanal(page, calls);
  await expect(page.getByRole("heading", { name: "Escaneie para reconectar" })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole("heading", { name: "Escaneie para reconectar" })).toHaveCount(0, {
    timeout: 10_000,
  });

  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Escaneie para reconectar" })).toBeVisible({
    timeout: 15_000,
  });
});
