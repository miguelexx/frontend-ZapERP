/**
 * Tique do card da lista == tique da bolha da thread.
 *
 * Em 03/11/2026 a mesma mensagem aparecia com ✓✓ na conversa e ✓ no card: cada tela tinha
 * a sua regra. Agora a decisão é uma só (`src/utils/messageTicks.js`) e este teste tranca
 * isso — incluindo os quatro casos que divergiam.
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  logLevel: 'silent',
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const { resolveTickState, tickSignature } = await vite.ssrLoadModule('/src/utils/messageTicks.js');
  const { resolveOutgoingTick } = await vite.ssrLoadModule('/src/conversa/bubble/utils/bubbleStatus.js');

  /** O que o card desenha, a partir do estado partilhado (mesma ordem do ChatTicks). */
  const marcaDoCard = (msg, isGroup = false) => {
    const st = resolveTickState(msg, { isGroup, out: true });
    if (!st) return null;
    if (st.isErr) return '⚠';
    if (st.isRead) return '✓✓azul';
    if (st.isDelivered) return '✓✓';
    if (st.isPending || st.isRetry) return '✓fraco';
    return '✓';
  };

  /** O que a bolha desenha, pelo `kind` que o TickSvg recebe. */
  const marcaDaBolha = (msg, isGroup = false) => {
    const t = resolveOutgoingTick({ direcao: 'out', ...msg }, isGroup);
    if (!t) return null;
    return { err: '⚠', read: '✓✓azul', delivered: '✓✓', pending: '✓fraco', sent: '✓' }[t.kind];
  };

  const casos = [
    // --- os quatro que divergiam -------------------------------------------
    ['ACK cru do provedor: device é entrega', { status_mensagem: 'device' }, '✓✓'],
    ['ACK cru do provedor: server é envio', { status_mensagem: 'server' }, '✓'],
    [
      'campos divergentes: vale o mais avançado',
      { status_mensagem: 'pending', status: 'read' },
      '✓✓azul',
    ],
    [
      'lida_em prova leitura mesmo com status preso',
      { status_mensagem: 'pending', lida_em: '2026-11-03T12:00:00Z', whatsapp_id: 'wa1' },
      '✓✓azul',
    ],
    [
      'entregue_em prova entrega mesmo com status preso',
      { status_mensagem: 'pending', entregue_em: '2026-11-03T12:00:00Z', whatsapp_id: 'wa1' },
      '✓✓',
    ],
    [
      'whatsapp_id: o provedor aceitou, não negar o envio',
      { status_mensagem: 'pending', whatsapp_id: 'wa1' },
      '✓',
    ],
    // --- o resto da tabela, para ninguém partir ao mexer -------------------
    ['sem status nenhum', {}, '✓'],
    ['pending sem id', { status_mensagem: 'pending' }, '✓fraco'],
    ['sent', { status_mensagem: 'sent' }, '✓'],
    ['entregue em português', { status_mensagem: 'entregue' }, '✓✓'],
    ['lida em português', { status_mensagem: 'lida' }, '✓✓azul'],
    ['played conta como lida', { status_mensagem: 'played' }, '✓✓azul'],
    ['erro', { status_mensagem: 'erro' }, '⚠'],
    ['blocked é erro', { status_mensagem: 'blocked' }, '⚠'],
    ['ACK numérico 0', { status_mensagem: 0 }, '✓fraco'],
    ['ACK numérico 1', { status_mensagem: 1 }, '✓'],
    ['ACK numérico 2', { status_mensagem: 2 }, '✓✓'],
    ['ACK numérico 3', { status_mensagem: 3 }, '✓✓azul'],
    ['em_retry', { status_mensagem: 'pending', em_retry: true }, '✓fraco'],
    ['aguardando_conexao', { status_mensagem: 'aguardando_conexao' }, '✓fraco'],
  ];

  for (const [nome, msg, esperado] of casos) {
    const card = marcaDoCard(msg);
    const bolha = marcaDaBolha(msg);
    assert.equal(card, esperado, `card — ${nome}`);
    assert.equal(bolha, esperado, `bolha — ${nome}`);
    assert.equal(card, bolha, `card e bolha discordam — ${nome}`);
  }
  console.log(`PASS: ${casos.length} estados com a mesma marca no card e na bolha`);

  // Grupo nunca pinta azul — e as duas telas continuam a concordar no que põem no lugar.
  for (const msg of [
    { status_mensagem: 'lida' },
    { status_mensagem: 'played' },
    { status_mensagem: 3 },
    { lida_em: '2026-11-03T12:00:00Z' },
  ]) {
    const card = marcaDoCard(msg, true);
    assert.notEqual(card, '✓✓azul', `grupo não pinta azul: ${JSON.stringify(msg)}`);
    assert.equal(card, marcaDaBolha(msg, true), `grupo — card e bolha discordam: ${JSON.stringify(msg)}`);
  }
  // ACK numérico ≥3 em grupo é o único com entrega explícita na tabela; os rótulos de
  // leitura caem para tique único porque `isRead` morre e nenhum deles diz "entregue".
  // É o comportamento que a bolha já tinha — aqui só se garante que o card o copia.
  assert.equal(marcaDoCard({ status_mensagem: 3 }, true), '✓✓');
  assert.equal(marcaDoCard({ status_mensagem: 'entregue' }, true), '✓✓');
  console.log('PASS: grupo nunca pinta azul e as duas telas concordam');

  // Mensagem de entrada não tem tique.
  assert.equal(resolveTickState({ status_mensagem: 'lida' }, { out: false }), null);
  assert.equal(resolveOutgoingTick({ direcao: 'in', status_mensagem: 'lida' }, false), null);
  console.log('PASS: mensagem de entrada não desenha tique');

  // A assinatura tem de mudar em TUDO o que o tique lê — é o que manda repintar a linha.
  const base = { status_mensagem: 'sent', status: 'sent' };
  const mudancas = [
    ['status', { status: 'read' }],
    ['status_mensagem', { status_mensagem: 'delivered' }],
    ['lida_em', { lida_em: '2026-11-03T12:00:00Z' }],
    ['entregue_em', { entregue_em: '2026-11-03T12:00:00Z' }],
    ['whatsapp_id', { whatsapp_id: 'wa1' }],
    ['em_retry', { em_retry: true }],
    ['envio_incerto', { envio_incerto: true }],
    ['envio_demorado', { envio_demorado: true }],
    ['aguardando_conexao', { aguardando_conexao: true }],
  ];
  for (const [campo, patch] of mudancas) {
    assert.notEqual(
      tickSignature(base),
      tickSignature({ ...base, ...patch }),
      `assinatura ignorou mudança em ${campo} — a linha não repintaria`
    );
  }
  assert.equal(tickSignature(base), tickSignature({ ...base, texto: 'outro' }), 'texto não é do tique');
  console.log(`PASS: assinatura cobre os ${mudancas.length} campos do tique`);

  console.log('OK — tique do card e da bolha.');
} finally {
  await vite.close();
}
