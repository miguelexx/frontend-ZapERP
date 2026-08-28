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
    alunosVinculadosPreview,
    deveExibirSwitchVincularAlunos,
    labelAlunoVinculado,
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

  const vinculados = alunosVinculadosPreview(
    [
      { nome: "Arthur Miguel de Oliveira", serie: "6º Ano" },
      { nome: "Isabela Maria de Oliveira", serie: "1ª Série do Ensino Médio" },
    ],
    "Arthur Miguel de Oliveira"
  );
  assert.equal(vinculados.length, 1);
  assert.equal(vinculados[0].nome, "Isabela Maria de Oliveira");
  assert.equal(labelAlunoVinculado(vinculados[0]), "Isabela Maria de Oliveira — 1ª Série do Ensino Médio");
  assert.equal(deveExibirSwitchVincularAlunos({ stats: { telefonesCompartilhados: 0, conflitos: 0 }, conflicts: [] }), false);
  assert.equal(deveExibirSwitchVincularAlunos({ stats: { telefonesCompartilhados: 12 }, conflicts: [{}] }), true);

  console.log("OK — importarClientesHelpers");
} finally {
  await vite.close();
}
