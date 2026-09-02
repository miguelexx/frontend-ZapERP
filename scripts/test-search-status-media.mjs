import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { shouldShowLocalMediaNotice } from '../src/conversa/localMediaNotice.js';
import { classifyOutboundAxiosError } from '../src/conversa/outboundSendError.js';

const vite = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent',
  root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true } });
try {
  const { useConversaStore: store } = await vite.ssrLoadModule('/src/conversa/conversaStore.js');
  const row = (id, conversa_id, seconds = 0) => ({ id, conversa_id, whatsapp_id: `wa-${id}`, direcao: 'out',
    criado_em: new Date(Date.now() - seconds * 1000).toISOString(), status: 'sent', status_mensagem: 'sent' });
  // Inclui uma row alheia propositalmente: o fallback antigo ignorava seu conversa_id.
  const messages = [row(10, 1, 86400), row(20, 1), row(30, 2)];
  store.setState({ selectedId: 1, conversa: { id: 1 }, mensagens: messages });
  store.getState().patchMensagem(30, { status: 'read' }, { conversa_id: 1 });
  assert.strictEqual(store.getState().mensagens, messages, 'fallback não atravessa a fronteira da conversa');
  store.getState().patchMensagem(null, { status: 'read' }, { conversa_id: 1 });
  store.getState().patchMensagem(999, { status: 'read' }, { conversa_id: 1 });
  assert.strictEqual(store.getState().mensagens, messages, 'ausência de identidade não marca a mensagem recente');
  store.getState().patchMensagem(10, { status: 'read' }, { conversa_id: 1 });
  assert.equal(store.getState().mensagens.find((m) => m.id === 10).status, 'read', 'ID exato funciona além de 60 segundos');
  store.getState().patchMensagensBatch([
    { mensagemId: null, partial: { status: 'delivered', whatsapp_id: 'wa-20' }, opts: { conversa_id: 1 } },
    { mensagemId: 30, partial: { status: 'read' }, opts: { conversa_id: 1 } },
    { mensagemId: 10, partial: { status: 'sent' }, opts: { conversa_id: 1 } },
  ]);
  assert.deepEqual(store.getState().mensagens.map((m) => m.status), ['read', 'delivered', 'sent']);
  store.setState({ mensagens: [{ ...row('temp-1', 1), tempId: 'temp-1' }] });
  store.getState().patchMensagem(null, { status: 'delivered', tempId: 'temp-1' }, { conversa_id: 1 });
  assert.equal(store.getState().mensagens[0].status, 'delivered');

  const { default: api } = await vite.ssrLoadModule('/src/api/http.js');
  const service = await vite.ssrLoadModule('/src/chats/chatService.js');
  const requests = [];
  api.get = async (url) => {
    requests.push(new URL(url, 'http://local.test'));
    return { data: { conversas: [{ id: requests.length }], has_more: requests.length === 1,
      next_cursor: requests.length === 1 ? '2026-09-01T00:00:00Z' : null, total_count: 2 } };
  };
  const search = await service.fetchMinhaFilaChatsCompleto({ palavra: 'Teste', minha_fila: '1', atendente_id: 7 });
  assert.equal(requests.length, 1, 'busca carrega uma página normal');
  assert.equal(requests[0].searchParams.get('minha_fila'), null);
  assert.equal(requests[0].searchParams.get('palavra'), 'Teste');
  assert.equal(requests[0].searchParams.get('atendente_id'), '7', 'refinamento do funcionário preservado');
  assert.equal(service.getChatsPageMeta(search).hasMore, true, 'não esconde a continuação da busca');
  requests.length = 0;
  await service.fetchMinhaFilaChatsCompleto({ palavra: '  ' });
  assert.equal(requests.length, 2, 'Minha fila normal continua carregando todas as páginas');
  assert.ok(requests.every((r) => r.searchParams.get('minha_fila') === '1'));

  const local = { direcao: 'out', tipo: 'audio', tempId: 'temp-1', _optimisticBlobUrl: 'blob:audio', status: 'status_indefinido' };
  assert.equal(shouldShowLocalMediaNotice(local), true);
  for (const change of [{ status: 'pending' }, { status: 'sent' }, { id: 123 }, { url: '/uploads/audio.ogg' },
    { direcao: 'in' }, { apagada_para_todos: true }]) {
    assert.equal(shouldShowLocalMediaNotice({ ...local, ...change }), false, JSON.stringify(change));
  }
  assert.equal(shouldShowLocalMediaNotice({ direcao: 'out', tipo: 'texto', status: 'status_indefinido' }), false);
  assert.match(classifyOutboundAxiosError({ code: 'ERR_NETWORK' }).message, /automaticamente/);
  const mediaError = classifyOutboundAxiosError({ code: 'ERR_NETWORK' }, { media: true });
  assert.equal(mediaError.uncertain, true);
  assert.match(mediaError.message, /F5/);
  assert.doesNotMatch(mediaError.message, /automaticamente/);
  console.log('OK — busca global/paginação, status por identidade e aviso de mídia local.');
} finally { await vite.close(); }
