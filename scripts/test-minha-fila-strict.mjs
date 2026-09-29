import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Regra ESTRITA da "Minha fila" (espelha o backend rowVisibleInPostFilteredList):
 *  - status "aberta": aparece se livre (sem atendente) OU do próprio usuário;
 *  - status em_atendimento / aguardando_cliente / pagamento_pendente / em_atraso:
 *    aparece SOMENTE se atendente_id === usuário logado OU co-atendente ativo;
 *  - conversa de OUTRO atendente nunca aparece;
 *  - finalizada/encerrada/mensagem_disparada nunca aparece;
 *  - grupos e campanhas não entram por esta regra.
 */
const vite = await createServer({
  appType: 'custom',
  configFile: false,
  logLevel: 'silent',
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const { conversaPertenceAMinhaFila } = await vite.ssrLoadModule('/src/chats/chatListQueryHelpers.js');
  const ME = 7;
  const OUTRO = 99;
  const base = { id: 1, exibir_badge_aberta: true };
  const belongs = (patch) => conversaPertenceAMinhaFila({ ...base, ...patch }, ME);

  // status "aberta"
  assert.equal(belongs({ status_atendimento: 'aberta', atendente_id: null }), true, 'aberta livre → minha fila');
  assert.equal(belongs({ status_atendimento: 'aberta', atendente_id: ME }), true, 'aberta minha → minha fila');
  assert.equal(belongs({ status_atendimento: 'aberta', atendente_id: OUTRO }), false, 'aberta de outro atendente → NUNCA');
  assert.equal(
    belongs({ status_atendimento: 'aberta', atendente_id: null, exibir_badge_aberta: false }),
    false,
    'aberta ociosa (sem movimentação) → fora'
  );

  // status ativos (só do usuário ou co-atendente)
  for (const status of ['em_atendimento', 'aguardando_cliente', 'pagamento_pendente', 'em_atraso']) {
    assert.equal(belongs({ status_atendimento: status, atendente_id: ME }), true, `${status} meu → minha fila`);
    assert.equal(belongs({ status_atendimento: status, atendente_id: OUTRO }), false, `${status} de outro → NUNCA`);
    assert.equal(belongs({ status_atendimento: status, atendente_id: null }), false, `${status} sem atendente → fora`);
    assert.equal(
      belongs({ status_atendimento: status, atendente_id: OUTRO, participante_ativo: true }),
      true,
      `${status} de outro mas sou co-atendente ativo → minha fila`
    );
  }

  // finalizadas / disparadas nunca entram
  for (const status of ['fechada', 'encerrada', 'mensagem_disparada']) {
    assert.equal(belongs({ status_atendimento: status, atendente_id: ME }), false, `${status} (mesmo minha) → NUNCA`);
  }

  // grupos e campanhas fora desta regra
  assert.equal(
    conversaPertenceAMinhaFila({ ...base, is_group: true, status_atendimento: 'aberta' }, ME),
    false,
    'grupo não entra por conversaPertenceAMinhaFila'
  );
  assert.equal(
    belongs({ status_atendimento: 'em_atendimento', atendente_id: ME, aguardando_resposta_campanha: true }),
    false,
    'aguardando resposta de campanha → fora da minha fila'
  );

  // usuário desconhecido: uma conversa atribuída a alguém nunca é "minha"
  assert.equal(
    conversaPertenceAMinhaFila({ ...base, status_atendimento: 'em_atendimento', atendente_id: OUTRO }, null),
    false,
    'sem usuário logado, conversa atribuída não é minha'
  );

  console.log('OK — Minha fila estrita: aberta(livre/minha) + ativos só meus/co-atendente; outro atendente e finalizadas nunca entram.');
} finally {
  await vite.close();
}
