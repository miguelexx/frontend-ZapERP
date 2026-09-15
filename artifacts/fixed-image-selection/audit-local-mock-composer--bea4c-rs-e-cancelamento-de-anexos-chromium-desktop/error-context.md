# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audit-local-mock.spec.js >> composer mantém teclado, carregamento lazy, pickers e cancelamento de anexos
- Location: e2e\audit-local-mock.spec.js:154:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('.wa-row[data-msg-id="109"] img').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - link "Pular para o conteúdo principal" [ref=e4] [cursor=pointer]:
      - /url: "#main-content"
    - complementary "Menu" [ref=e5]:
      - link "ZapERP — início" [ref=e6] [cursor=pointer]:
        - /url: /atendimento
        - img "ZapERP" [ref=e7]:
          - img [ref=e9]
      - navigation [ref=e12]:
        - link "Analytics" [ref=e13] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e15]
        - link "Bot" [ref=e19] [cursor=pointer]:
          - /url: /ia
          - img [ref=e21]
        - link "Atendimento" [ref=e25] [cursor=pointer]:
          - /url: /atendimento
          - img [ref=e27]
        - link "Chat" [ref=e32] [cursor=pointer]:
          - /url: /chat-interno
          - img [ref=e34]
        - link "Supervisão" [ref=e36] [cursor=pointer]:
          - /url: /supervisao
          - img [ref=e38]
        - link "Equipe" [ref=e41] [cursor=pointer]:
          - /url: /permissoes
          - img [ref=e43]
        - link "CRM" [ref=e48] [cursor=pointer]:
          - /url: /crm
          - img [ref=e50]
        - link "Configurações" [ref=e52] [cursor=pointer]:
          - /url: /configuracoes
          - img [ref=e54]
        - link "Business" [ref=e57] [cursor=pointer]:
          - /url: /whatsapp-business
          - img [ref=e59]
        - link "IA" [ref=e62] [cursor=pointer]:
          - /url: /dashboard/ia
          - img [ref=e64]
        - link "Manual" [ref=e66] [cursor=pointer]:
          - /url: /manual
          - img [ref=e68]
      - generic [ref=e71]:
        - separator [ref=e72]
        - button "Alternar para modo escuro" [ref=e73] [cursor=pointer]:
          - img [ref=e74]
        - generic "Usuário logado" [ref=e76]: A
        - button "Sair da conta" [ref=e77] [cursor=pointer]:
          - img [ref=e78]
    - main [ref=e82]:
      - generic [ref=e83]:
        - complementary [ref=e84]:
          - generic [ref=e85]:
            - alert [ref=e86]:
              - generic [ref=e87]: ⚠️
              - generic [ref=e88]:
                - text: WhatsApp desconectado — mensagens não serão entregues.
                - button "Reconectar" [ref=e89] [cursor=pointer]
            - generic [ref=e90]:
              - img "ZapERP" [ref=e92]:
                - img [ref=e94]
                - generic "ZapERP" [ref=e98]:
                  - generic [ref=e99]: Zap
                  - generic [ref=e100]: ERP
              - generic [ref=e101]:
                - button "Novo contato, grupo ou comunidade" [ref=e102] [cursor=pointer]:
                  - img [ref=e104]
                - button "Filtros e tags" [ref=e106] [cursor=pointer]:
                  - img [ref=e108]
                - button "Consultar produtos" [ref=e110] [cursor=pointer]:
                  - img [ref=e111]
            - generic [ref=e116]:
              - generic [ref=e117]:
                - generic [ref=e118]:
                  - generic [ref=e119]: SEU ESPAÇO DE TRABALHO
                  - heading "Conversas" [level=1] [ref=e120]:
                    - text: Conversas
                    - generic [ref=e121]: .
                  - paragraph [ref=e122]: Organize, responda e acompanhe todos os seus atendimentos em um só lugar.
                - generic:
                  - generic:
                    - img
                    - img
                  - generic:
                    - text: Atendimento
                    - text: mais eficiente
              - generic [ref=e124]:
                - generic [ref=e125]:
                  - img [ref=e127]
                  - textbox "Buscar por nome ou telefone" [ref=e129]
                - button "Filtrar conversas por atendente" [ref=e131] [cursor=pointer]:
                  - img [ref=e133]
                  - generic [ref=e135]: Por atendente
                  - img [ref=e136]
              - group "Filtros de conversa" [ref=e139]:
                - button "Minha fila 2" [pressed] [ref=e140] [cursor=pointer]:
                  - text: Minha fila
                  - generic [ref=e141]: "2"
                - button "Todas 0" [ref=e142] [cursor=pointer]:
                  - text: Todas
                  - generic [ref=e143]: "0"
                - button "Hoje 0" [ref=e144] [cursor=pointer]:
                  - text: Hoje
                  - generic [ref=e145]: "0"
                - button "Em atendimento 2" [ref=e146] [cursor=pointer]:
                  - text: Em atendimento
                  - generic [ref=e147]: "2"
                - button "Finalizadas 0" [ref=e148] [cursor=pointer]:
                  - text: Finalizadas
                  - generic [ref=e149]: "0"
                - button "Aguardando atendente 0" [ref=e150] [cursor=pointer]:
                  - text: Aguardando atendente
                  - generic [ref=e151]: "0"
              - generic [ref=e154]: 2 de 2
            - generic [ref=e156]:
              - generic "Conversa com Contato Auditoria" [ref=e157] [cursor=pointer]:
                - generic [ref=e159]: CA
                - generic [ref=e160]:
                  - generic [ref=e161]:
                    - generic "Contato Auditoria" [ref=e164]
                    - generic [ref=e165]:
                      - generic [ref=e166]: 17:00
                      - generic "Última mensagem do cliente — equipe deve responder" [ref=e168]:
                        - generic [ref=e170]: Aguardando atendente
                        - generic "1251 h — desde 24/07/2026, 17:00:00" [ref=e171]: • 1251h
                  - generic "Mensagem inicial" [ref=e175]:
                    - generic [ref=e177]: Mensagem inicial
                - button "Abrir ações da conversa":
                  - generic:
                    - img
              - generic "Conversa com Segunda Conversa" [ref=e178] [cursor=pointer]:
                - generic [ref=e180]: SC
                - generic [ref=e181]:
                  - generic [ref=e182]:
                    - generic "Segunda Conversa" [ref=e185]
                    - generic "Última mensagem do cliente — equipe deve responder" [ref=e188]:
                      - generic [ref=e190]: Aguardando atendente
                      - generic "1251 h — desde 24/07/2026, 16:59:00" [ref=e191]: • 1251h
                  - generic "Sem mensagens" [ref=e195]
                - button "Abrir ações da conversa":
                  - generic:
                    - img
        - main [ref=e196]:
          - generic [ref=e197]:
            - generic [ref=e198]:
              - button "Dados do contato" [ref=e199] [cursor=pointer]:
                - generic:
                  - generic:
                    - generic: CA
                - generic [ref=e201]:
                  - generic "Contato Auditoria" [ref=e203]
                  - generic "Status da conversa" [ref=e205]:
                    - generic "Em atendimento" [ref=e207]
              - generic [ref=e209]:
                - generic [ref=e210]:
                  - button "Pesquisar mensagens nesta conversa" [ref=e211] [cursor=pointer]:
                    - img [ref=e212]
                  - button "Enviar conversa ao CRM" [ref=e215] [cursor=pointer]:
                    - img [ref=e217]
                    - generic [ref=e219]: CRM
                - generic [ref=e222]:
                  - button "Transferir atendimento" [ref=e223] [cursor=pointer]:
                    - img [ref=e225]
                    - generic [ref=e227]: Transferir
                  - button "Marcar como aguardando cliente" [ref=e228] [cursor=pointer]:
                    - img [ref=e230]
                    - generic [ref=e233]: Aguardar cliente
                  - button "Encerrar conversa" [ref=e234] [cursor=pointer]:
                    - img [ref=e236]
                    - generic [ref=e239]: Encerrar
                - button "Mais opções" [ref=e241] [cursor=pointer]:
                  - img [ref=e242]
              - generic "Setor da conversa" [ref=e246]:
                - generic [ref=e247]: Setor
                - generic [ref=e248]: Sem setor
                - button "Definir setor" [ref=e249] [cursor=pointer]
            - log "Mensagens" [ref=e250]:
              - region "Modo seleção" [ref=e251]:
                - generic [ref=e252]:
                  - button "Fechar seleção" [ref=e253] [cursor=pointer]:
                    - img [ref=e254]
                  - button "Cancelar" [ref=e257] [cursor=pointer]
                  - generic [ref=e258]: 1 selecionada
                - button "Apagar" [ref=e260] [cursor=pointer]:
                  - img [ref=e261]
                  - text: Apagar
              - generic [ref=e264]:
                - button "Buscar histórico no WhatsApp" [ref=e265] [cursor=pointer]
                - status [ref=e266]: Todas as mensagens salvas foram carregadas. “Buscar histórico no WhatsApp” importa o que a UltraMSG tem armazenado desde a conexão — conversas mais antigas ficam apenas no celular.
              - generic [ref=e267]:
                - separator "Mensagens do dia 24/07/2026" [ref=e269]:
                  - generic [ref=e270]: 24/07/2026
                - generic [ref=e272]:
                  - button "Desmarcar mensagem" [pressed] [ref=e273] [cursor=pointer]:
                    - img [ref=e274]
                  - group "Mensagem" [ref=e276]:
                    - generic [ref=e278]:
                      - generic [ref=e279]: Histórico 1
                      - generic "Horário e status" [ref=e280]:
                        - generic [ref=e281]: 16:58
                    - button "Reagir à mensagem":
                      - img
                - generic [ref=e283]:
                  - button "Selecionar mensagem" [ref=e284] [cursor=pointer]:
                    - img [ref=e285]
                  - group "Mensagem" [ref=e287]:
                    - button "(imagem)" [ref=e290] [cursor=pointer]
                    - button "Reagir à mensagem":
                      - img
                    - generic:
                      - generic:
                        - generic: 16:59
            - generic [ref=e292]:
              - button "Anexos e mais" [ref=e294] [cursor=pointer]:
                - img [ref=e295]
              - button "Figurinhas" [ref=e297] [cursor=pointer]:
                - img [ref=e298]
              - generic "Ativar ou desativar correção ortográfica automática" [ref=e302] [cursor=pointer]:
                - checkbox "Correção automática" [checked]
                - generic [ref=e305]: Correção automática
              - textbox "Digite sua resposta. Enter para enviar, Shift+Enter para nova linha, Esc para fechar painéis." [ref=e306]:
                - /placeholder: Digite uma mensagem
              - button "Emojis" [ref=e307] [cursor=pointer]:
                - img [ref=e308]
              - generic [ref=e311]:
                - button "Gravar áudio" [ref=e312] [cursor=pointer]:
                  - img [ref=e313]
                - generic [ref=e316]:
                  - button "Enviar mensagem" [disabled] [ref=e317]:
                    - img [ref=e318]
                  - button "Selecionar modo de envio" [ref=e322] [cursor=pointer]:
                    - img [ref=e323]
  - generic:
    - listbox:
      - generic: Ver conversas por responsável
      - generic:
        - generic:
          - generic: Nenhum utilizador encontrado
```

# Test source

```ts
  154 | test("composer mantém teclado, carregamento lazy, pickers e cancelamento de anexos", async ({ page }, testInfo) => {
  155 |   let savedRepliesRequests = 0;
  156 |   await installAuditSession(page);
  157 |   await page.route("**/uploads/selection-fixture.svg", (route) => route.fulfill({
  158 |     contentType: "image/svg+xml",
  159 |     body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#dbeafe"/></svg>',
  160 |   }));
  161 | 
  162 |   await page.route(`${API}/**`, async (route) => {
  163 |     const request = route.request();
  164 |     const url = new URL(request.url());
  165 |     const path = url.pathname;
  166 | 
  167 |     if (path === "/uploads/selection-fixture.svg") {
  168 |       await route.fallback();
  169 |       return;
  170 |     }
  171 |     if (path.startsWith("/socket.io")) {
  172 |       await route.abort();
  173 |       return;
  174 |     }
  175 |     if (path === "/usuarios/me") {
  176 |       await route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
  177 |       return;
  178 |     }
  179 |     if (path === "/usuarios/me/permissoes") {
  180 |       await route.fulfill({ json: { permissoes: [] } });
  181 |       return;
  182 |     }
  183 |     if (path === "/config/empresa") {
  184 |       await route.fulfill({ json: { id: 1, nome: "ZapERP Auditoria" } });
  185 |       return;
  186 |     }
  187 |     if (path === "/chats/whatsapp-instances") {
  188 |       await route.fulfill({ json: { instances: [], active_count: 0 } });
  189 |       return;
  190 |     }
  191 |     if (path === "/tags" || path === "/dashboard/departamentos") {
  192 |       await route.fulfill({ json: [] });
  193 |       return;
  194 |     }
  195 |     if (path === "/chats/counts") {
  196 |       await route.fulfill({ json: { todas: 2, minha_fila: 2, em_atendimento: 2 } });
  197 |       return;
  198 |     }
  199 |     if (path === "/chats" && request.method() === "GET") {
  200 |       await route.fulfill({ json: chats });
  201 |       return;
  202 |     }
  203 |     const detailMatch = path.match(/^\/chats\/(\d+)$/);
  204 |     if (detailMatch && request.method() === "GET") {
  205 |       const payload = conversationPayload(detailMatch[1]);
  206 |       payload.mensagens.push({ id: 109, conversa_id: Number(detailMatch[1]), tipo: "imagem", url: "/uploads/selection-fixture.svg", direcao: "in", criado_em: "2026-07-24T19:59:00.000Z" });
  207 |       await route.fulfill({ json: payload });
  208 |       return;
  209 |     }
  210 |     if (path === "/dashboard/respostas-salvas") {
  211 |       savedRepliesRequests += 1;
  212 |       await route.fulfill({
  213 |         json: [{ id: 501, titulo: "Boas-vindas", texto: "Olá, como posso ajudar?" }],
  214 |       });
  215 |       return;
  216 |     }
  217 |     await route.fulfill({ json: {} });
  218 |   });
  219 | 
  220 |   await page.goto("/atendimento");
  221 |   const firstRow = page.locator(".chat-list-row").filter({ hasText: "Contato Auditoria" });
  222 |   await expect(firstRow).toBeVisible({ timeout: 30_000 });
  223 |   if (!testInfo.project.name.includes("mobile")) {
  224 |     await firstRow.hover();
  225 |     const trigger = firstRow.getByRole("button", { name: "Abrir ações da conversa" });
  226 |     for (let i = 0; i < 3; i += 1) {
  227 |       await trigger.click();
  228 |       await expect(page.getByRole("menu", { name: "Ações da conversa" })).toBeVisible();
  229 |       await trigger.click();
  230 |       await expect(page.locator(".conversation-action-menu")).toHaveCount(0);
  231 |     }
  232 |     await page.emulateMedia({ reducedMotion: "reduce" });
  233 |     await trigger.click();
  234 |     await expect(page.getByRole("menu", { name: "Ações da conversa" })).toHaveCSS("animation-name", "none");
  235 |     await page.keyboard.press("Escape");
  236 |     await expect(page.locator(".conversation-action-menu")).toHaveCount(0);
  237 |     await page.emulateMedia({ reducedMotion: "no-preference" });
  238 |   }
  239 |   if (testInfo.project.name.includes("mobile")) await firstRow.tap();
  240 |   else await firstRow.click();
  241 | 
  242 |   const composer = page.locator(".wa-input");
  243 |   await expect(composer).toBeVisible();
  244 |   expect(savedRepliesRequests).toBe(0);
  245 | 
  246 |   if (!testInfo.project.name.includes("mobile")) {
  247 |     await page.locator(".wa-bubble").first().hover();
  248 |     await page.locator(".wa-msgMenuBtn").first().click();
  249 |     const messageMenu = page.getByRole("menu", { name: "Opções da mensagem" });
  250 |     await expect(messageMenu).toBeVisible();
  251 |     await expect(page.locator(".wa-msgMenuBackdrop")).toHaveCSS("backdrop-filter", "none");
  252 |     await expect(messageMenu.locator(".wa-msgMenuItem > svg").first()).toBeVisible();
  253 |     await messageMenu.getByRole("menuitem", { name: "Selecionar", exact: true }).click();
> 254 |     await expect(page.getByRole("region", { name: "Modo seleção" })).toBeVisible();
      |                         ^ Error: locator.click: Test timeout of 90000ms exceeded.
  255 |     await expect(page.locator(".wa-messages-selectDim")).toHaveCount(0);
  256 |     await expect(page.locator(".wa-selectChk[aria-pressed='true']")).toHaveCount(1);
  257 |     const receivedImage = page.locator('.wa-row[data-msg-id="109"] img').first();
  258 |     await receivedImage.click();
  259 |     await expect(page.locator(".wa-selectChk[aria-pressed='true']")).toHaveCount(2);
  260 |     await receivedImage.click();
  261 |     await expect(page.locator(".wa-selectChk[aria-pressed='true']")).toHaveCount(1);
  262 |     await page.getByRole("button", { name: "Fechar seleção" }).click();
  263 |     await page.locator(".wa-bubble").first().hover();
  264 |     await page.locator(".wa-msgMenuBtn").first().click();
  265 |     await page.screenshot({ path: testInfo.outputPath("premium-message-menu.png") });
  266 |     await page.keyboard.press("Escape");
  267 |     await expect(page.locator(".wa-msgMenu")).toHaveCount(0);
  268 |   }
  269 | 
  270 |   await composer.fill("linha um");
  271 |   await composer.press("Shift+Enter");
  272 |   await composer.type("linha dois");
  273 |   await expect(composer).toHaveValue("Linha um\nlinha dois");
  274 | 
  275 |   await page.getByRole("button", { name: "Anexos e mais" }).click();
  276 |   const attachmentMenu = page.getByRole("menu", { name: "Anexos", exact: true });
  277 |   await expect(attachmentMenu).toBeVisible();
  278 |   await expect(attachmentMenu).toHaveCSS("backdrop-filter", "none");
  279 |   const menuBounds = await attachmentMenu.boundingBox();
  280 |   expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  281 |   expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  282 |   await page.screenshot({ path: testInfo.outputPath("premium-attachments.png") });
  283 |   await page.getByRole("menuitem", { name: "Respostas salvas" }).click();
  284 |   await expect.poll(() => savedRepliesRequests).toBe(1);
  285 |   await page.getByRole("option", { name: /Boas-vindas/ }).click();
  286 |   await expect(composer).toHaveValue("Linha um\nlinha doisOlá, como posso ajudar?");
  287 | 
  288 |   if (!testInfo.project.name.includes("mobile")) {
  289 |     await page.getByRole("button", { name: "Emojis" }).click();
  290 |     await expect(page.getByRole("dialog", { name: "Selecionar emoji" })).toBeVisible();
  291 |     await page.getByRole("listitem", { name: "Emoji 😀" }).click();
  292 |     await expect(composer).toHaveValue(/😀/);
  293 |   }
  294 | 
  295 |   await page.getByRole("button", { name: "Figurinhas" }).click();
  296 |   await expect(page.getByRole("dialog", { name: "Figurinhas" })).toBeVisible();
  297 |   await expect(page.getByRole("button", { name: "Criar figurinha" })).toBeVisible();
  298 |   await page.getByRole("button", { name: "Figurinhas" }).click();
  299 | 
  300 |   const previewInput = page.locator('input[accept^=".pdf,.doc,.docx,image"]');
  301 |   await previewInput.setInputFiles({
  302 |     name: "auditoria.png",
  303 |     mimeType: "image/png",
  304 |     buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nkwAAAAASUVORK5CYII=", "base64"),
  305 |   });
  306 |   await expect(page.locator(".wa-mediaPreview")).toBeVisible();
  307 |   await page.getByRole("button", { name: "Cancelar envio" }).click();
  308 |   await expect(page.locator(".wa-mediaPreview")).toBeHidden();
  309 | 
  310 |   await previewInput.setInputFiles({
  311 |     name: "auditoria.mp4",
  312 |     mimeType: "video/mp4",
  313 |     buffer: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]),
  314 |   });
  315 |   await expect(page.getByRole("dialog", { name: "Pré-visualizar vídeo antes de enviar" })).toBeVisible();
  316 |   await page.getByRole("button", { name: "Cancelar envio" }).click();
  317 | 
  318 |   await previewInput.setInputFiles({
  319 |     name: "auditoria.pdf",
  320 |     mimeType: "application/pdf",
  321 |     buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  322 |   });
  323 |   await expect(page.getByRole("dialog", { name: "Revisar arquivo antes de enviar" })).toBeVisible();
  324 |   await page.getByRole("button", { name: "Cancelar envio" }).click();
  325 |   await expect(page.getByRole("dialog", { name: "Revisar arquivo antes de enviar" })).toBeHidden();
  326 | });
  327 | 
  328 | test("mensagens consecutivas entram na fila sem duplo envio", async ({ page }, testInfo) => {
  329 |   const postedTexts = [];
  330 |   let nextMessageId = 1000;
  331 | 
  332 |   await installAuditSession(page);
  333 | 
  334 |   await page.route(`${API}/**`, async (route) => {
  335 |     const request = route.request();
  336 |     const url = new URL(request.url());
  337 |     const path = url.pathname;
  338 | 
  339 |     if (path.startsWith("/socket.io")) {
  340 |       await route.abort();
  341 |       return;
  342 |     }
  343 |     if (path === "/usuarios/me") {
  344 |       await route.fulfill({ json: { id: 1, perfil: "admin", role: "admin" } });
  345 |       return;
  346 |     }
  347 |     if (path === "/usuarios/me/permissoes") {
  348 |       await route.fulfill({ json: { permissoes: [] } });
  349 |       return;
  350 |     }
  351 |     if (path === "/config/empresa") {
  352 |       await route.fulfill({ json: { id: 1, nome: "ZapERP Auditoria" } });
  353 |       return;
  354 |     }
```