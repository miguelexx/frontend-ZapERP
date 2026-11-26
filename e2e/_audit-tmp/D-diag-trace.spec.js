// Lente D: rastreia escritas de scrollTop no .wa-messages, troca de classe/atributo e
// (re)montagem do scroller durante a reabertura pelo cache com GET rápido (celular).
import { test } from "@playwright/test";
const API = process.env.VITE_API_URL || "http://localhost:5000";
const N = Number(process.env.N || 10);
const mkChat = (id, nome) => ({ id, contato_nome: nome, nome_contato_cache: nome, telefone: "5511999990" + String(id).padStart(3, "0"), status_atendimento: "em_atendimento", status_atendimento_real: "em_atendimento", atendente_id: 1, departamento_id: 1, unread_count: 0, ultima_atividade: "2026-07-24T20:00:00.000Z" });
const chats = [mkChat(1, "Contato Um"), mkChat(2, "Contato Dois")];
const msgs = (cid, n) => Array.from({ length: n }, (_, i) => ({ id: cid * 100000 + i, conversa_id: cid, direcao: i % 2 ? "out" : "in", status: "lido", tipo: "texto", texto: `Msg ${i} ${"conteudo longo ".repeat((i % 4) + 1)}`, criado_em: new Date(Date.UTC(2026, 6, 25, 12) + i * 60000).toISOString() }));
test("trace reabertura", async ({ page }, testInfo) => {
  let apid = 40;
  await page.addInitScript(() => {
    localStorage.setItem("zap_erp_auth", JSON.stringify({ token: "t", user: { id: 1, nome: "A", perfil: "admin", role: "admin", departamento_ids: [1] } }));
    window.__log = []; window.__t0 = 0;
    const L = (s) => { if (window.__t0) window.__log.push(`${Math.round(performance.now() - window.__t0)} ${s}`); };
    window.__L = L;
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true, get() { return desc.get.call(this); },
      set(v) {
        if (this.classList && this.classList.contains("wa-messages")) {
          const before = desc.get.call(this);
          desc.set.call(this, v);
          const after = desc.get.call(this);
          const st = (new Error().stack || "").split("\n").slice(2, 5).map((x) => x.trim().replace(/https?:\/\/[^/]+\/assets\//, "")).join(" < ");
          L(`scrollTop ${Math.round(before)} -> req ${Math.round(v)} => ${Math.round(after)} sh${this.scrollHeight} [${st}]`);
          return;
        }
        desc.set.call(this, v);
      },
    });
    const origScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (...args) {
      if (this.classList && this.classList.contains('wa-messages')) {
        const before = this.scrollTop; origScrollTo.apply(this, args);
        const st = (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 6).map((x) => x.trim().replace(/https?:\/\/[^/]+\/assets\//, '')).join(' < ');
        L('SCROLLTO ' + JSON.stringify(args[0]) + ' ' + Math.round(before) + ' => ' + Math.round(this.scrollTop) + ' mask=' + this.className.includes('opening') + ' [' + st + ']');
        return;
      }
      return origScrollTo.apply(this, args);
    };
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === "attributes" && r.target.classList?.contains("wa-messages")) {
          L(`attr ${r.attributeName}=${r.target.getAttribute(r.attributeName)} st${Math.round(r.target.scrollTop)} sh${r.target.scrollHeight}`);
        }
        if (r.type === "childList") {
          for (const n of r.addedNodes) if (n.nodeType === 1 && (n.classList?.contains("wa-messages") || n.querySelector?.(".wa-messages"))) L("MOUNT .wa-messages");
          for (const n of r.addedNodes) if (n.nodeType === 1 && (n.classList?.contains("wa-messages-virtual-root") || n.classList?.contains("wa-messages-static-root"))) L(`MOUNT list root ${n.className}`);
          for (const n of r.removedNodes) if (n.nodeType === 1 && (n.classList?.contains("wa-messages-virtual-root") || n.classList?.contains("wa-messages-static-root"))) L(`UNMOUNT list root ${n.className}`);
        }
      }
    });
    document.addEventListener("DOMContentLoaded", () => mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-media-glide"] }));
  });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  await page.route(`${API}/**`, async (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p.startsWith("/socket.io")) return route.abort();
    if (p === "/usuarios/me") return route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
    if (p === "/usuarios/me/permissoes") return route.fulfill({ json: { permissoes: [] } });
    if (p === "/chats/whatsapp-instances") return route.fulfill({ json: { instances: [], active_count: 0 } });
    if (p === "/tags" || p === "/dashboard/departamentos") return route.fulfill({ json: [] });
    if (p === "/chats" && req.method() === "GET") return route.fulfill({ json: chats });
    const m = p.match(/^\/chats\/(\d+)$/);
    if (m && req.method() === "GET") {
      await new Promise((r) => setTimeout(r, apid));
      await page.evaluate(() => window.__L && window.__L("GET /chats/:id fulfilled")).catch(() => {});
      return route.fulfill({ json: { conversa: { ...chats[Number(m[1]) - 1], mensagens_bloqueadas: false }, mensagens: msgs(Number(m[1]), 40), next_cursor: null, tags: [] } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/atendimento");
  const mob = testInfo.project.name.includes("mobile");
  const tap = async (n) => { const row = page.locator(".chat-list-row").filter({ hasText: n }); if (mob) await row.tap(); else await row.click(); };
  const back = async () => { if (mob) { await page.goBack(); await page.waitForTimeout(500); } else if (process.env.ESC === "1") { await page.keyboard.press("Escape"); await page.waitForTimeout(500); } };
  await tap("Contato Um"); await page.waitForTimeout(1200); await back();
  let fails = 0;
  for (let k = 0; k < N; k++) {
    apid = 20 + (k % 3) * 20;
    await tap("Contato Dois"); await page.waitForTimeout(1200); await back();
    await page.evaluate(() => {
      window.__log = []; window.__t0 = performance.now(); window.__vis = [];
      const s = window.__t0; const mc = new MessageChannel(); const tick = () => requestAnimationFrame(() => mc.port2.postMessage(0));
      mc.port1.onmessage = () => {
        const el = document.querySelector(".wa-messages");
        if (el) {
          const root = el.querySelector(".wa-messages-virtual-root, .wa-messages-static-root");
          const op = root ? Number(getComputedStyle(root).opacity) : 0;
          window.__vis.push({ t: Math.round(performance.now() - s), op, st: Math.round(el.scrollTop), gap: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight) });
          window.__L(`FRAME op${op.toFixed(2)} st${Math.round(el.scrollTop)} gap${Math.round(el.scrollHeight - el.scrollTop - el.clientHeight)} cls=${el.className}`);
        }
        if (performance.now() - s < 700) tick();
      };
      tick();
    });
    await tap("Contato Um"); await page.waitForTimeout(900);
    const vis = await page.evaluate(() => window.__vis);
    const bad = vis.some((s) => s.op > 0.02 && s.gap > 60);
    const lg = await page.evaluate(() => window.__log); console.log(`iter ${k} bad=${bad} :: ` + lg.filter((x) => x.includes("SCROLLTO") || x.includes("attr class")).join(" || "));
    if (bad) { fails += 1; if (fails <= 1) console.log(`---- FAIL iter ${k} apid ${apid}\n` + (await page.evaluate(() => window.__log)).slice(0, 80).join("\n")); }
    await back();
  }
  console.log(`[${testInfo.project.name}] fails=${fails}/${N}`);
});
