// Fuso horário da empresa: tudo que o atendimento exibe tem de seguir o relógio do
// estado configurado (Configurações → Geral), e não America/Sao_Paulo cravado.
//
// Caso de referência: Mato Grosso (America/Cuiaba) é uma hora atrás de Brasília.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// localStorage não existe no Node; o módulo precisa funcionar sem ele (modo privativo,
// storage bloqueado) e o teste não pode depender de um valor de sessão anterior.
if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
}

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const tz = await vite.ssrLoadModule("/src/utils/companyTimezone.js");
  const helpers = await vite.ssrLoadModule("/src/conversa/utils/conversaViewHelpers.js");
  const presenca = await vite.ssrLoadModule("/src/conversa/utils/contactPresenceFormat.js");

  // 18:30Z = 15:30 em Brasília = 14:30 em Cuiabá.
  const tarde = new Date("2026-11-03T18:30:00Z");

  // --- padrão: Brasília -------------------------------------------------------
  assert.equal(tz.getCompanyTimezone(), "America/Sao_Paulo");
  assert.equal(tz.formatHoraEmpresa(tarde), "15:30");
  assert.equal(helpers.formatHora("2026-11-03T18:30:00Z"), "15:30");

  // --- Mato Grosso: uma hora a menos em TODA superfície -----------------------
  assert.equal(tz.setCompanyTimezone("America/Cuiaba"), true);
  assert.equal(tz.getCompanyTimezone(), "America/Cuiaba");
  assert.equal(tz.formatHoraEmpresa(tarde), "14:30");
  assert.equal(helpers.formatHora("2026-11-03T18:30:00Z"), "14:30");
  assert.equal(helpers.formatHoraCurta("2026-11-03T18:30:00Z"), "14:30");
  assert.equal(helpers.formatDia("2026-11-03T18:30:00Z"), "03/11/2026");

  // --- a virada do dia também anda uma hora -----------------------------------
  // 02:30Z de 04/11 = 23:30 de 03/11 em Brasília e 22:30 de 03/11 em Cuiabá.
  const madrugada = "2026-11-04T02:30:00Z";
  assert.equal(helpers.formatDia(madrugada), "03/11/2026");
  assert.equal(helpers.formatHora(madrugada), "22:30");
  // 03:30Z de 04/11 = 00:30 de 04/11 em Brasília, mas ainda 23:30 de 03/11 em Cuiabá:
  // o separador de data tem de seguir o fuso da empresa, não o do aparelho.
  assert.equal(helpers.formatDia("2026-11-04T03:30:00Z"), "03/11/2026");
  assert.equal(helpers.sameDay(madrugada, "2026-11-04T03:30:00Z"), true);
  assert.equal(helpers.sameDay(madrugada, "2026-11-04T05:30:00Z"), false);
  assert.equal(tz.companyDayKey(new Date("2026-11-04T03:30:00Z")), "2026-11-03");

  // --- versão muda só quando o fuso muda de verdade ---------------------------
  const v0 = tz.getCompanyTimezoneVersion();
  assert.equal(tz.setCompanyTimezone("America/Cuiaba"), false, "mesmo fuso não repinta");
  assert.equal(tz.getCompanyTimezoneVersion(), v0);
  assert.equal(tz.setCompanyTimezone(""), false, "vazio é ignorado");
  assert.equal(tz.setCompanyTimezone("Marte/Olympus"), false, "zona inválida é ignorada");
  assert.equal(tz.getCompanyTimezone(), "America/Cuiaba", "zona inválida não derruba o fuso");

  // --- assinantes são avisados ------------------------------------------------
  let avisos = 0;
  const off = tz.subscribeCompanyTimezone(() => { avisos += 1; });
  tz.setCompanyTimezone("America/Manaus");
  assert.equal(avisos, 1);
  assert.equal(tz.getCompanyTimezoneVersion(), v0 + 1);
  off();
  tz.setCompanyTimezone("America/Rio_Branco");
  assert.equal(avisos, 1, "cancelou a assinatura e parou de receber");

  // --- "visto por último" segue o mesmo relógio --------------------------------
  tz.setCompanyTimezone("America/Cuiaba");
  const unix = Math.floor(new Date("2026-11-03T18:30:00Z").getTime() / 1000);
  const texto = presenca.formatContactPresenceLabel({ status: "offline", last_seen: unix })?.text || "";
  assert.ok(texto.includes("14:30"), `esperava 14:30 em "${texto}"`);

  // --- logout volta ao padrão --------------------------------------------------
  tz.clearCompanyTimezone();
  assert.equal(tz.getCompanyTimezone(), "America/Sao_Paulo");
  assert.equal(tz.formatHoraEmpresa(tarde), "15:30");

  console.log("company timezone: ok");
} finally {
  await vite.close();
}
