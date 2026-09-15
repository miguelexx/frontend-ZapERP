# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audit-local-mock.spec.js >> composer mantém teclado, carregamento lazy, pickers e cancelamento de anexos
- Location: e2e\audit-local-mock.spec.js:152:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: page.goto: Test timeout of 90000ms exceeded.
Call log:
  - navigating to "http://localhost:5186/atendimento", waiting until "load"

```

# Test source

```ts
  108 | 
  109 |       constructor(_stream, options = {}) {
  110 |         this.mimeType = options.mimeType || "audio/webm";
  111 |         this.state = "inactive";
  112 |         this.emitted = false;
  113 |       }
  114 | 
  115 |       start() {
  116 |         this.state = "recording";
  117 |       }
  118 | 
  119 |       requestData() {
  120 |         if (this.emitted) return;
  121 |         this.emitted = true;
  122 |         const data = new Blob([new Uint8Array(2048)], { type: this.mimeType });
  123 |         this.ondataavailable?.({ data });
  124 |       }
  125 | 
  126 |       stop() {
  127 |         this.requestData();
  128 |         this.state = "inactive";
  129 |         queueMicrotask(() => this.onstop?.());
  130 |       }
  131 |     }
  132 | 
  133 |     class FakeAudio {
  134 |       removeAttribute() {}
  135 |       load() {}
  136 |       set src(_value) {
  137 |         queueMicrotask(() => this.onerror?.());
  138 |       }
  139 |     }
  140 | 
  141 |     Object.defineProperty(window, "MediaRecorder", {
  142 |       configurable: true,
  143 |       value: FakeMediaRecorder,
  144 |     });
  145 |     Object.defineProperty(window, "Audio", {
  146 |       configurable: true,
  147 |       value: FakeAudio,
  148 |     });
  149 |   });
  150 | }
  151 | 
  152 | test("composer mantém teclado, carregamento lazy, pickers e cancelamento de anexos", async ({ page }, testInfo) => {
  153 |   let savedRepliesRequests = 0;
  154 |   await installAuditSession(page);
  155 | 
  156 |   await page.route(`${API}/**`, async (route) => {
  157 |     const request = route.request();
  158 |     const url = new URL(request.url());
  159 |     const path = url.pathname;
  160 | 
  161 |     if (path.startsWith("/socket.io")) {
  162 |       await route.abort();
  163 |       return;
  164 |     }
  165 |     if (path === "/usuarios/me") {
  166 |       await route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
  167 |       return;
  168 |     }
  169 |     if (path === "/usuarios/me/permissoes") {
  170 |       await route.fulfill({ json: { permissoes: [] } });
  171 |       return;
  172 |     }
  173 |     if (path === "/config/empresa") {
  174 |       await route.fulfill({ json: { id: 1, nome: "ZapERP Auditoria" } });
  175 |       return;
  176 |     }
  177 |     if (path === "/chats/whatsapp-instances") {
  178 |       await route.fulfill({ json: { instances: [], active_count: 0 } });
  179 |       return;
  180 |     }
  181 |     if (path === "/tags" || path === "/dashboard/departamentos") {
  182 |       await route.fulfill({ json: [] });
  183 |       return;
  184 |     }
  185 |     if (path === "/chats/counts") {
  186 |       await route.fulfill({ json: { todas: 2, minha_fila: 2, em_atendimento: 2 } });
  187 |       return;
  188 |     }
  189 |     if (path === "/chats" && request.method() === "GET") {
  190 |       await route.fulfill({ json: chats });
  191 |       return;
  192 |     }
  193 |     const detailMatch = path.match(/^\/chats\/(\d+)$/);
  194 |     if (detailMatch && request.method() === "GET") {
  195 |       await route.fulfill({ json: conversationPayload(detailMatch[1]) });
  196 |       return;
  197 |     }
  198 |     if (path === "/dashboard/respostas-salvas") {
  199 |       savedRepliesRequests += 1;
  200 |       await route.fulfill({
  201 |         json: [{ id: 501, titulo: "Boas-vindas", texto: "Olá, como posso ajudar?" }],
  202 |       });
  203 |       return;
  204 |     }
  205 |     await route.fulfill({ json: {} });
  206 |   });
  207 | 
> 208 |   await page.goto("/atendimento");
      |              ^ Error: page.goto: Test timeout of 90000ms exceeded.
  209 |   const firstRow = page.locator(".chat-list-row").filter({ hasText: "Contato Auditoria" });
  210 |   await expect(firstRow).toBeVisible({ timeout: 30_000 });
  211 |   if (testInfo.project.name.includes("mobile")) await firstRow.tap();
  212 |   else await firstRow.click();
  213 | 
  214 |   const composer = page.locator(".wa-input");
  215 |   await expect(composer).toBeVisible();
  216 |   expect(savedRepliesRequests).toBe(0);
  217 | 
  218 |   if (!testInfo.project.name.includes("mobile")) {
  219 |     await page.locator(".wa-bubble").first().hover();
  220 |     await page.locator(".wa-msgMenuBtn").first().click();
  221 |     const messageMenu = page.getByRole("menu", { name: "Opções da mensagem" });
  222 |     await expect(messageMenu).toBeVisible();
  223 |     await expect(page.locator(".wa-msgMenuBackdrop")).toHaveCSS("backdrop-filter", "none");
  224 |     await expect(messageMenu.locator(".wa-msgMenuItem > svg").first()).toBeVisible();
  225 |     await page.screenshot({ path: testInfo.outputPath("premium-message-menu.png") });
  226 |     await page.keyboard.press("Escape");
  227 |     await expect(page.locator(".wa-msgMenu")).toHaveCount(0);
  228 |   }
  229 | 
  230 |   await composer.fill("linha um");
  231 |   await composer.press("Shift+Enter");
  232 |   await composer.type("linha dois");
  233 |   await expect(composer).toHaveValue("Linha um\nlinha dois");
  234 | 
  235 |   await page.getByRole("button", { name: "Anexos e mais" }).click();
  236 |   const attachmentMenu = page.getByRole("menu", { name: "Anexos", exact: true });
  237 |   await expect(attachmentMenu).toBeVisible();
  238 |   await expect(attachmentMenu).toHaveCSS("backdrop-filter", "none");
  239 |   const menuBounds = await attachmentMenu.boundingBox();
  240 |   expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  241 |   expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  242 |   await page.screenshot({ path: testInfo.outputPath("premium-attachments.png") });
  243 |   await page.getByRole("menuitem", { name: "Respostas salvas" }).click();
  244 |   await expect.poll(() => savedRepliesRequests).toBe(1);
  245 |   await page.getByRole("option", { name: /Boas-vindas/ }).click();
  246 |   await expect(composer).toHaveValue("Linha um\nlinha doisOlá, como posso ajudar?");
  247 | 
  248 |   if (!testInfo.project.name.includes("mobile")) {
  249 |     await page.getByRole("button", { name: "Emojis" }).click();
  250 |     await expect(page.getByRole("dialog", { name: "Selecionar emoji" })).toBeVisible();
  251 |     await page.getByRole("listitem", { name: "Emoji 😀" }).click();
  252 |     await expect(composer).toHaveValue(/😀/);
  253 |   }
  254 | 
  255 |   await page.getByRole("button", { name: "Figurinhas" }).click();
  256 |   await expect(page.getByRole("dialog", { name: "Figurinhas" })).toBeVisible();
  257 |   await expect(page.getByRole("button", { name: "Criar figurinha" })).toBeVisible();
  258 |   await page.getByRole("button", { name: "Figurinhas" }).click();
  259 | 
  260 |   const previewInput = page.locator('input[accept^=".pdf,.doc,.docx,image"]');
  261 |   await previewInput.setInputFiles({
  262 |     name: "auditoria.png",
  263 |     mimeType: "image/png",
  264 |     buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nkwAAAAASUVORK5CYII=", "base64"),
  265 |   });
  266 |   await expect(page.locator(".wa-mediaPreview")).toBeVisible();
  267 |   await page.getByRole("button", { name: "Cancelar envio" }).click();
  268 |   await expect(page.locator(".wa-mediaPreview")).toBeHidden();
  269 | 
  270 |   await previewInput.setInputFiles({
  271 |     name: "auditoria.mp4",
  272 |     mimeType: "video/mp4",
  273 |     buffer: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]),
  274 |   });
  275 |   await expect(page.getByRole("dialog", { name: "Pré-visualizar vídeo antes de enviar" })).toBeVisible();
  276 |   await page.getByRole("button", { name: "Cancelar envio" }).click();
  277 | 
  278 |   await previewInput.setInputFiles({
  279 |     name: "auditoria.pdf",
  280 |     mimeType: "application/pdf",
  281 |     buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  282 |   });
  283 |   await expect(page.getByRole("dialog", { name: "Revisar arquivo antes de enviar" })).toBeVisible();
  284 |   await page.getByRole("button", { name: "Cancelar envio" }).click();
  285 |   await expect(page.getByRole("dialog", { name: "Revisar arquivo antes de enviar" })).toBeHidden();
  286 | });
  287 | 
  288 | test("mensagens consecutivas entram na fila sem duplo envio", async ({ page }, testInfo) => {
  289 |   const postedTexts = [];
  290 |   let nextMessageId = 1000;
  291 | 
  292 |   await installAuditSession(page);
  293 | 
  294 |   await page.route(`${API}/**`, async (route) => {
  295 |     const request = route.request();
  296 |     const url = new URL(request.url());
  297 |     const path = url.pathname;
  298 | 
  299 |     if (path.startsWith("/socket.io")) {
  300 |       await route.abort();
  301 |       return;
  302 |     }
  303 |     if (path === "/usuarios/me") {
  304 |       await route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
  305 |       return;
  306 |     }
  307 |     if (path === "/usuarios/me/permissoes") {
  308 |       await route.fulfill({ json: { permissoes: [] } });
```