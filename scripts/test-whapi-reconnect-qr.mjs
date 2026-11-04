/**
 * QR de reconexão no overlay de canal Whapi caído.
 *
 * Antes, canal caído = tela vermelha com um botão que levava para Configurações: o
 * supervisor saía do atendimento, trocava de tela e só lá pedia o QR. Agora o QR
 * nasce na própria tela — e isso traz invariantes que não podem se perder:
 *
 *   1. QUEM: só supervisor/admin vê o QR (as rotas /instances/* exigem esse perfil;
 *      atendente levaria 403 e ficaria com uma moldura quebrada).
 *   2. QUAL canal: o CAÍDO (o motivo do overlay), não o primeiro da lista.
 *   3. O QUE a moldura mostra: um só lugar decide, e um QR válido na tela nunca é
 *      apagado por uma renovação silenciosa.
 *   4. Depois de escanear: o overlay precisa apagar na hora (revalidate), não no
 *      próximo poll de 60s.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  QR_POLL_MS,
  clampRetrySeconds,
  formatPairCode,
  instanceLooksConnected,
  isValidQrDataUri,
  normalizePairPhone,
  pickReconnectInstance,
  qrFrameState,
  reconnectInstanceLabel,
} from "../src/components/whapiReconnectLogic.js";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => readFileSync(join(raiz, rel), "utf8");

let falhas = 0;
const checar = (ok, msg) => {
  if (!ok) {
    falhas++;
    console.error(`FALHOU: ${msg}`);
  }
};

const whapi = (over = {}) => ({ id: 1, provider: "whapi", ativo: true, ...over });

// ------------------------------------------------------- 2. qual canal reconectar
checar(pickReconnectInstance([]) === null, "lista vazia não pode devolver canal");
checar(pickReconnectInstance(null) === null, "lista inválida não pode quebrar");

checar(
  pickReconnectInstance([
    whapi({ id: 1, is_default: true, connected: true, live_status: "AUTH" }),
    whapi({ id: 2, connected: false, live_status: "UNAUTHORIZED" }),
  ])?.id === 2,
  "com um canal caído e outro AUTH, o alvo é o CAÍDO"
);

checar(
  pickReconnectInstance([
    whapi({ id: 7, connected: false, live_status: "UNAUTHORIZED" }),
    whapi({ id: 8, is_default: true, connected: false, live_status: "UNAUTHORIZED" }),
  ])?.id === 8,
  "entre dois caídos, o default vem primeiro"
);

checar(
  pickReconnectInstance([
    whapi({ id: 3, ativo: false, connected: false }),
    whapi({ id: 4, connected: false }),
  ])?.id === 4,
  "canal desativado nunca é alvo de reconexão"
);

checar(
  pickReconnectInstance([
    { id: 5, provider: "ultramsg", ativo: true, connected: false },
    whapi({ id: 6, connected: false }),
  ])?.id === 6,
  "instância de outro provider não entra (o overlay é só do Whapi)"
);

checar(
  pickReconnectInstance([whapi({ id: 9, connected: true, live_status: "AUTH" })])?.id === 9,
  "sem nenhum caído (lista ainda não hidratada), cai no ativo — a tela nunca fica sem alvo"
);

checar(instanceLooksConnected({ live_status: "AUTH" }) === true, "AUTH é sessão viva");
checar(instanceLooksConnected({ status: "connected" }) === true, "status conectado é sessão viva");
checar(
  instanceLooksConnected({ live_status: "UNAUTHORIZED" }) === false,
  "UNAUTHORIZED não é sessão viva"
);

// ------------------------------------------------- 3. o que a moldura do QR mostra
const QR_OK = `data:image/png;base64,${"A".repeat(120)}`;

checar(
  qrFrameState({ connected: true, qrDataUri: QR_OK, retryIn: 30, loading: true }) === "connected",
  "conectado vence tudo"
);
checar(
  qrFrameState({ qrDataUri: QR_OK, loading: true }) === "qr",
  "renovação silenciosa não pode apagar o QR que o usuário está escaneando"
);
checar(qrFrameState({ retryIn: 42 }) === "throttled", "429 vira contagem regressiva");
checar(qrFrameState({ loading: true }) === "loading", "sem QR e carregando → esqueleto");
checar(qrFrameState({ qrError: "falhou" }) === "error", "erro sem QR → estado de erro");
checar(qrFrameState({}) === "loading", "estado inicial é carregando, nunca erro em branco");

checar(isValidQrDataUri(QR_OK) === true, "data URI de PNG é válido");
checar(isValidQrDataUri("data:image/png;base64,AA") === false, "base64 minúsculo não vira <img>");
checar(isValidQrDataUri("javascript:alert(1)") === false, "só data:image entra no src");
checar(isValidQrDataUri(null) === false, "null não vira <img>");

// -------------------------------------------------------------- espera do 429
checar(clampRetrySeconds(45) === 45, "retryAfterSeconds do backend é respeitado");
checar(clampRetrySeconds(0) === 60, "0 cai no fallback de 60s");
checar(clampRetrySeconds(undefined) === 60, "ausente cai no fallback");
checar(clampRetrySeconds(99999) === 600, "espera absurda é limitada");
checar(clampRetrySeconds(1) === 5, "espera mínima evita martelar o provedor");

// ------------------------------------------------------- pareamento por telefone
checar(normalizePairPhone("+55 (34) 99999-8888") === "5534999998888", "telefone vira só dígitos");
checar(normalizePairPhone("123") === null, "telefone curto é recusado antes do POST");
checar(normalizePairPhone("") === null, "vazio é recusado");
checar(formatPairCode("abcd1234") === "ABCD-1234", "código de 8 vira ABCD-1234");
checar(formatPairCode("AB-CD") === "ABCD", "código curto não inventa separador");
checar(formatPairCode(null) === "", "código ausente não imprime 'null'");

checar(reconnectInstanceLabel(null) === "", "canal ausente não vira rótulo");
checar(reconnectInstanceLabel({ id: 4 }) === "Canal #4", "sem nome/telefone, usa o id");
checar(
  reconnectInstanceLabel({ id: 4, display_phone: "5534999998888" }) === "5534999998888",
  "sem nome, mostra o número"
);

checar(QR_POLL_MS >= 15_000, "renovar o QR mais rápido que 15s martela o provedor");

// ------------------------------------------------- 1 e 4: fiação do overlay/hook
const overlay = ler("src/components/WhapiDisconnectedOverlay.jsx");
checar(
  /isSupervisorOrAdmin\s*\(\s*user\s*\)/.test(overlay),
  "o QR só pode ser montado para supervisor/admin (atendente levaria 403 nas rotas de instância)"
);
checar(
  overlay.indexOf("WhapiReconnectCard") > 0 && /IconAlertTriangleFilled/.test(overlay),
  "o aviso vermelho do atendente continua existindo ao lado do cartão de QR"
);
checar(
  /isConfiguracoesPath\(pathname\)\)\s*return null/.test(overlay),
  "em /configuracoes o overlay continua oculto (o painel de conexão precisa ficar acessível)"
);
checar(
  /onConnected=\{handleConnected\}/.test(overlay) && /revalidate\(\)/.test(overlay),
  "ao autenticar, o overlay revalida o status em vez de esperar o poll de 60s"
);

const hookStatus = ler("src/chats/hooks/useWhapiChannelStatus.js");
checar(
  /return \{ whapiDisconnected: disconnected, revalidate \}/.test(hookStatus),
  "useWhapiChannelStatus precisa expor revalidate"
);
checar(
  /WHAPI_DISCONNECT_CONFIRMATIONS = 2/.test(hookStatus),
  "a regra de 2 leituras para acender o overlay não pode se perder"
);

const hookQr = ler("src/components/useWhapiReconnect.js");
checar(
  /instanceIdRef\.current !== instId/.test(hookQr),
  "resposta de um canal antigo não pode pintar a tela de outro"
);
checar(
  /clearQrTimer\(\);\s*\n\s*clearStatusTimer\(\);/.test(hookQr),
  "ao conectar, todo o polling precisa parar"
);
checar(
  /if \(!enabled\)/.test(hookQr),
  "com o overlay fechado o hook não pode continuar consultando o provedor"
);

if (falhas) {
  console.error(`FALHA — ${falhas} verificação(ões) do QR de reconexão.`);
  process.exitCode = 1;
} else {
  console.log("OK — QR de reconexão no overlay (alvo, estados, throttle, fiação).");
}
