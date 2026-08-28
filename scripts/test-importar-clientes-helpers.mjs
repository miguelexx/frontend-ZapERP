import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const {
    mapeamentoIncompleto,
    confirmacaoDesabilitada,
    nomesPrincipaisIniciais,
    resumoImportacao,
  } = await vite.ssrLoadModule("/src/configuracoes/importarClientesHelpers.js");

  assert.equal(mapeamentoIncompleto({ nome: null, telefone: 1 }), true);
  assert.equal(mapeamentoIncompleto({ nome: 0, telefone: 1 }), false);

  assert.equal(
    confirmacaoDesabilitada({ mapping: { nome: 0, telefone: 1 }, loading: false, confirmando: false, telefonesUnicos: 10 }),
    false
  );
  assert.equal(
    confirmacaoDesabilitada({ mapping: { nome: 0, telefone: 1 }, loading: false, confirmando: true, telefonesUnicos: 10 }),
    true
  );
  assert.equal(
    confirmacaoDesabilitada({ mapping: { nome: null, telefone: 1 }, loading: false, confirmando: false, telefonesUnicos: 10 }),
    true
  );
  assert.equal(
    confirmacaoDesabilitada({ mapping: { nome: 0, telefone: 1 }, loading: false, confirmando: false, telefonesUnicos: 0 }),
    true
  );

  const iniciais = nomesPrincipaisIniciais([
    { phoneKey: "5534999514579", telefone: "5534999514579", nome: "ALEXIA CRISTINA MARCHEZAN DOS SANTOS" },
  ]);
  assert.equal(iniciais["5534999514579"], "ALEXIA CRISTINA MARCHEZAN DOS SANTOS");

  const r = resumoImportacao({
    totalLinhas: 727,
    clientesCriados: 500,
    clientesAtualizados: 20,
    clientesJaExistentes: 180,
    nomesAlterados: 20,
    nomesProtegidos: 680,
    nomesManuaisPreservados: 2,
    linhasIgnoradas: 0,
    conflitos: 40,
    falhas: 0,
    telefonesUnicos: 680,
  });
  assert.equal(r.criados, 500);
  assert.equal(r.telefonesUnicos, 680);
  assert.notEqual(r.criados, 727);

  console.log("OK — importarClientesHelpers");
} finally {
  await vite.close();
}
