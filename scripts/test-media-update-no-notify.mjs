/**
 * Regressão: a cura da bolha de mídia não pode virar um segundo aviso.
 *
 * O backend reemite `nova_mensagem` para a MESMA mensagem quando a URL da mídia finalmente chega
 * (cópia para /uploads, merge de corrida do webhook, backfill). A bolha precisa do evento para
 * virar player sem F5 — mas o atendente não pode levar beep e notificação de desktop de novo.
 * O dedupe comum não resolve: ele dura 6s (DEDUPE_TTL_MS) e a cura costuma demorar mais que isso
 * em vídeo grande, CDN lenta, retry com backoff ou reparo pelo backfill (trailing de 8s).
 * Auditoria de 16/10/2026.
 *
 * Executar: node scripts/test-media-update-no-notify.mjs
 */
import { shouldNotifyIncomingMessage } from "../src/notifications/chatNotificationService.js";

let falhas = 0;
function check(obtido, esperado, msg) {
  if (obtido !== esperado) {
    falhas++;
    console.error(`FALHOU: ${msg}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`);
  }
}

const agora = () => new Date().toISOString();
const base = (over = {}) => ({
  conversa_id: 42,
  id: 777,
  direcao: "in",
  fromMe: false,
  criado_em: agora(),
  ...over,
});
// Conversa fechada e fora da rota da conversa: o caminho que normalmente NOTIFICA.
const ctx = { selectedConversationId: null, currentPathname: "/chats" };

// 1) Mensagem nova de verdade continua avisando (não quebrar o produto ao silenciar a cura).
const nova = shouldNotifyIncomingMessage({ msg: base(), ...ctx });
check(nova.notify, true, "mensagem recebida nova continua notificando");

// 2) O MESMO evento marcado como cura de mídia não avisa.
const cura = shouldNotifyIncomingMessage({ msg: base({ id: 778, midia_atualizada: true }), ...ctx });
check(cura.notify, false, "cura de mídia não dispara aviso");
check(cura.reason, "media_update", "motivo explícito para diagnóstico");

// 3) A marca não vale como string nem como número — só o booleano true, para não silenciar por acidente.
check(
  shouldNotifyIncomingMessage({ msg: base({ id: 779, midia_atualizada: "true" }), ...ctx }).notify,
  true,
  "string 'true' não silencia (só o booleano)"
);
check(
  shouldNotifyIncomingMessage({ msg: base({ id: 780, midia_atualizada: 1 }), ...ctx }).notify,
  true,
  "número 1 não silencia"
);

// 4) Payload antigo (sem o campo) se comporta como antes — o frontend pode subir antes do backend.
check(
  shouldNotifyIncomingMessage({ msg: base({ id: 781, midia_atualizada: undefined }), ...ctx }).notify,
  true,
  "payload sem a marca mantém o comportamento atual"
);

// 5) As guardas que já existiam continuam valendo e vêm ANTES da marca.
check(
  shouldNotifyIncomingMessage({ msg: base({ id: 782, fromMe: true, midia_atualizada: true }), ...ctx }).reason,
  "from_me",
  "mídia nossa continua barrada por from_me"
);
check(
  shouldNotifyIncomingMessage({ msg: base({ id: 783, direcao: "out", midia_atualizada: true }), ...ctx }).reason,
  "non_inbound",
  "saída continua barrada por non_inbound"
);

if (falhas > 0) {
  console.error(`\n${falhas} falha(s) na cura de mídia sem aviso repetido.`);
  process.exit(1);
}
console.log("OK — cura de mídia atualiza a bolha sem repetir beep/notificação.");
