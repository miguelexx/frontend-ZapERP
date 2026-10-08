/**
 * Snapshots OFFLINE de leitura (IndexedDB): conversa aberta + lista de conversas.
 *
 * Objetivo: com a internet caída (ou após F5 offline), o atendente continua LENDO o que já
 * tinha carregado. O snapshot é salvo nos pontos de sucesso já existentes (carregarConversa /
 * fetch da lista) e só é LIDO quando o GET falha SEM resposta (rede) — o fluxo online não muda.
 *
 * Segurança:
 *  - chaves com namespace por empresa+usuário; entradas de outra identidade são purgadas;
 *  - mensagens passam por WHITELIST de campos (nada de funções/flags internas) e URLs têm
 *    query string removida (nunca persistir access_token); blob:/data: não são persistidos;
 *  - logout limpa tudo. IndexedDB indisponível → no-op.
 *
 * Limites: últimas 60 mensagens por conversa · 25 conversas (LRU) · lista top 30.
 */

import { useAuthStore } from "../auth/authStore";
import { idbDisponivel, idbGet, idbPut, idbDelete, idbGetAll, idbClear } from "../utils/idbSimples";

const DB = "zap_offline_snapshots_v1";
const STORES = ["snapshots"];
const STORE = "snapshots";

const MAX_MSGS_POR_CONVERSA = 60;
const MAX_CONVERSAS = 25;
const MAX_CHATS_LISTA = 30;
const DEBOUNCE_MS = 1500;

const CAMPOS_MENSAGEM = [
  "id", "whatsapp_id", "client_temp_id", "conversa_id", "texto", "conteudo", "tipo", "direcao",
  "criado_em", "status", "status_mensagem", "nome_arquivo", "reply_meta", "remetente_nome",
  "remetente_telefone", "contact_meta", "location_meta", "audio_duracao_sec", "autor_usuario_id",
  "usuario_nome", "usuario_id", "editada", "editada_em", "apagada_para_todos", "apagada_em",
  "apagada_pelo_cliente", "apagada_pelo_cliente_em", "encaminhado",
];
const CAMPOS_URL = ["url", "url_absoluta", "media_url", "thumbnail_url"];
const CAMPOS_CONVERSA = [
  "id", "telefone", "contato_nome", "cliente_nome", "nome_grupo", "foto_perfil", "tipo",
  "status_atendimento", "status_atendimento_real", "atendente_id", "atendente_nome",
  "whatsapp_instance_id", "ultima_atividade", "cliente_id",
];

function identidadeAtual() {
  try {
    const u = useAuthStore.getState()?.user;
    const companyId = Number(u?.company_id);
    const userId = Number(u?.id);
    if (!Number.isFinite(companyId) || !Number.isFinite(userId)) return null;
    return { prefixo: `c${companyId}:u${userId}:` };
  } catch {
    return null;
  }
}

/** URL persistível: nunca blob:/data:, nunca query string (token poderia estar lá). */
function sanitizarUrl(v) {
  const s = String(v ?? "").trim();
  if (!s || s.startsWith("blob:") || s.startsWith("data:")) return undefined;
  const semQuery = s.split("?")[0];
  return semQuery || undefined;
}

function sanitizarMensagem(m) {
  if (!m || typeof m !== "object") return null;
  if (m.id == null && !m.whatsapp_id) return null; // só mensagens persistidas
  const out = {};
  for (const k of CAMPOS_MENSAGEM) {
    const v = m[k];
    if (v === undefined || typeof v === "function") continue;
    out[k] = v;
  }
  for (const k of CAMPOS_URL) {
    const v = sanitizarUrl(m[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function sanitizarConversa(c) {
  if (!c || typeof c !== "object") return null;
  const out = {};
  for (const k of CAMPOS_CONVERSA) {
    const v = c[k];
    if (v === undefined || typeof v === "function") continue;
    out[k] = k === "foto_perfil" ? sanitizarUrl(v) ?? null : v;
  }
  return out;
}

function sanitizarChatLista(c) {
  const base = sanitizarConversa(c);
  if (!base) return null;
  const prev = c?.ultima_mensagem_preview;
  if (prev && typeof prev === "object") {
    base.ultima_mensagem_preview = {
      texto: prev.texto ?? null,
      tipo: prev.tipo ?? null,
      direcao: prev.direcao ?? null,
      criado_em: prev.criado_em ?? null,
    };
  }
  if (c?.unread_count != null) base.unread_count = c.unread_count;
  return base;
}

let purgaFeita = false;
async function purgarOutrasIdentidades() {
  if (purgaFeita || !idbDisponivel()) return;
  purgaFeita = true;
  const id = identidadeAtual();
  const todos = await idbGetAll(DB, STORES, STORE);
  for (const item of todos) {
    const chave = String(item?.chave || "");
    if (!chave) continue;
    if (!id || !chave.startsWith(id.prefixo)) void idbDelete(DB, STORES, STORE, chave);
  }
}

const _debounces = new Map();

/** Salva o snapshot da conversa (debounced; fire-and-forget; nunca afeta o fluxo online). */
export function salvarSnapshotConversa(conversaId, { conversa, mensagens } = {}) {
  const id = identidadeAtual();
  if (!id || !idbDisponivel() || conversaId == null) return;
  const key = String(conversaId);
  if (_debounces.has(key)) clearTimeout(_debounces.get(key));
  _debounces.set(
    key,
    setTimeout(() => {
      _debounces.delete(key);
      void (async () => {
        try {
          await purgarOutrasIdentidades();
          const msgs = (Array.isArray(mensagens) ? mensagens : [])
            .map(sanitizarMensagem)
            .filter(Boolean)
            .slice(-MAX_MSGS_POR_CONVERSA);
          if (!msgs.length) return;
          await idbPut(DB, STORES, STORE, {
            chave: `${id.prefixo}conversa:${key}`,
            kind: "conversa",
            conversaId: key,
            conversa: sanitizarConversa(conversa),
            mensagens: msgs,
            salvoEm: Date.now(),
          });
          await aplicarLruConversas(id.prefixo);
        } catch {
          /* best-effort */
        }
      })();
    }, DEBOUNCE_MS)
  );
}

async function aplicarLruConversas(prefixo) {
  const todos = await idbGetAll(DB, STORES, STORE);
  const conversas = todos
    .filter((i) => i?.kind === "conversa" && String(i.chave || "").startsWith(prefixo))
    .sort((a, b) => (b.salvoEm || 0) - (a.salvoEm || 0));
  for (const velho of conversas.slice(MAX_CONVERSAS)) {
    await idbDelete(DB, STORES, STORE, velho.chave);
  }
}

export async function carregarSnapshotConversa(conversaId) {
  const id = identidadeAtual();
  if (!id || conversaId == null) return null;
  const item = await idbGet(DB, STORES, STORE, `${id.prefixo}conversa:${String(conversaId)}`);
  if (!item || !Array.isArray(item.mensagens) || !item.mensagens.length) return null;
  return { conversa: item.conversa || null, mensagens: item.mensagens, salvoEm: item.salvoEm };
}

function sanitizarTabLista(tab) {
  return String(tab || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

let _debounceLista = null;
export function salvarSnapshotLista(chats, tab) {
  const id = identidadeAtual();
  if (!id || !idbDisponivel() || !Array.isArray(chats) || !chats.length) return;
  const tabSan = sanitizarTabLista(tab);
  if (_debounceLista) clearTimeout(_debounceLista);
  _debounceLista = setTimeout(() => {
    _debounceLista = null;
    void (async () => {
      try {
        await purgarOutrasIdentidades();
        const lista = chats.slice(0, MAX_CHATS_LISTA).map(sanitizarChatLista).filter(Boolean);
        if (!lista.length) return;
        const registro = { kind: "lista", chats: lista, salvoEm: Date.now() };
        // Chave genérica = última lista vista (hidratação no boot offline, comportamento original).
        await idbPut(DB, STORES, STORE, { ...registro, chave: `${id.prefixo}lista` });
        // Chave POR ABA: permite trocar de filtro offline para abas já visitadas online.
        if (tabSan) {
          await idbPut(DB, STORES, STORE, { ...registro, chave: `${id.prefixo}lista:${tabSan}`, tab: tabSan });
        }
      } catch {
        /* best-effort */
      }
    })();
  }, DEBOUNCE_MS);
}

export async function carregarSnapshotLista(tab) {
  const id = identidadeAtual();
  if (!id) return null;
  const tabSan = sanitizarTabLista(tab);
  // Com aba: SÓ o snapshot daquela aba (cair na genérica mostraria linhas de outro filtro
  // com o rótulo errado — pior que avisar que a aba não está disponível offline).
  const chave = tabSan ? `${id.prefixo}lista:${tabSan}` : `${id.prefixo}lista`;
  const item = await idbGet(DB, STORES, STORE, chave);
  if (!item || !Array.isArray(item.chats) || !item.chats.length) return null;
  return { chats: item.chats, salvoEm: item.salvoEm };
}

/** Limpa TODOS os snapshots (logout / troca de usuário). */
export async function limparSnapshotsOffline() {
  if (_debounceLista) clearTimeout(_debounceLista);
  _debounceLista = null;
  for (const t of _debounces.values()) clearTimeout(t);
  _debounces.clear();
  purgaFeita = false;
  await idbClear(DB, STORES, STORE);
}
