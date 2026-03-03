import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchChats, abrirConversaCliente, getZapiStatus, sincronizarFotosPerfil } from "./chatService";
import { useChatStore } from "./chatsStore";
import { useConversaStore } from "../conversa/conversaStore";
import { listarTags } from "../api/tagService";
import { useAuthStore } from "../auth/authStore";
import { isGroupConversation } from "../utils/conversaUtils";
import api from "../api/http";
import { getApiBaseUrl } from "../api/baseUrl";
import { useNavigate } from "react-router-dom";
import ZapERPLogo from "../brand/ZapERPLogo";
import "./chatList.css";

/* =====================================================
   COMPONENTES (mantidos + refinados visualmente)
===================================================== */

const audioDurationCache = new Map(); // url -> seconds
const audioDurationPromiseCache = new Map(); // url -> Promise<number|null>
let audioDurationInFlight = 0;
const AUDIO_DURATION_CONCURRENCY = 4;
const audioDurationQueue = [];

function UnreadBadge({ n }) {
  const v = Number(n || 0);
  if (!v) return null;
  return <span className="chat-list-unread">{v > 99 ? "99+" : v}</span>;
}

function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function parseToDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "number") return new Date(ts);
  const s = String(ts).trim();
  if (!s) return null;
  // Se vier sem timezone (ex.: "2026-02-10T20:36:00"), assuma UTC (Supabase timestamp sem TZ)
  const noTzIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(s);
  const normalized = !hasTz && noTzIso.test(s) ? `${s}Z` : s;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatHora(ts) {
  const d = parseToDate(ts);
  if (!d) return "";
  try {
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    // fallback sem timezone option (ambientes antigos)
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
}

function initials(nome = "") {
  const parts = String(nome).trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

function isToday(dateLike) {
  if (!dateLike) return false;
  const d = new Date(dateLike);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function getLastMessage(chat) {
  const msgs = chat?.mensagens || chat?.messages || [];
  if (!Array.isArray(msgs) || msgs.length === 0) return null;
  return msgs[msgs.length - 1];
}

function getMediaUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getApiBaseUrl();
  return base.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url);
}

function formatDuracaoSegundos(totalSeconds) {
  const s = Number(totalSeconds);
  if (!Number.isFinite(s) || s <= 0) return "";
  const sec = Math.round(s);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function isPlaceholderAudioText(txt) {
  const t = String(txt || "").trim().toLowerCase();
  return t === "(áudio)" || t === "(audio)";
}
function isPlaceholderImageText(txt) {
  const t = String(txt || "").trim().toLowerCase();
  return t === "(imagem)" || t === "(foto)";
}
function isPlaceholderVideoText(txt) {
  const t = String(txt || "").trim().toLowerCase();
  return t === "(vídeo)" || t === "(video)";
}
function isPlaceholderStickerText(txt) {
  const t = String(txt || "").trim().toLowerCase();
  return t === "(figurinha)" || t === "(sticker)";
}
function isPlaceholderFileText(txt) {
  const t = String(txt || "").trim().toLowerCase();
  return t === "(arquivo)" || t === "(documento)";
}

function PreviewIcon({ type, className = "" }) {
  const t = String(type || "").toLowerCase();
  if (t === "audio") {
    return (
      <svg className={`chat-preview-ico ${className}`} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm7-3a1 1 0 1 0-2 0a5 5 0 0 1-10 0a1 1 0 1 0-2 0a7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11Z"
        />
      </svg>
    );
  }
  if (t === "imagem") {
    return (
      <svg className={`chat-preview-ico ${className}`} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21 5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5Zm-2 0v9.2l-2.7-2.7a2 2 0 0 0-2.8 0l-6.3 6.3l-1.7-1.7a2 2 0 0 0-2.8 0L5 18.7V5h14ZM8.5 10A1.5 1.5 0 1 0 7 8.5A1.5 1.5 0 0 0 8.5 10Z"
        />
      </svg>
    );
  }
  if (t === "video") {
    return (
      <svg className={`chat-preview-ico ${className}`} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4ZM10 9.5v5l4-2.5l-4-2.5Z"
        />
      </svg>
    );
  }
  if (t === "sticker") {
    return (
      <svg className={`chat-preview-ico ${className}`} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 10 10c0-.7-.07-1.38-.2-2.03A7 7 0 0 1 14 17h-4a3 3 0 0 1-3-3v-4A7 7 0 0 1 14.03 2.2C13.38 2.07 12.7 2 12 2Zm-3 9a1 1 0 1 0 0-2a1 1 0 0 0 0 2Zm6 0a1 1 0 1 0 0-2a1 1 0 0 0 0 2Zm-6.2 3.3a1 1 0 0 0 1.4 1.4a2.54 2.54 0 0 1 3.6 0a1 1 0 1 0 1.4-1.4a4.54 4.54 0 0 0-6.4 0ZM14 19.5a5.5 5.5 0 0 0 5.5-5.5H17a3 3 0 0 1-3 3v2.5Z"
        />
      </svg>
    );
  }
  if (t === "arquivo") {
    return (
      <svg className={`chat-preview-ico ${className}`} width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Zm1 7V3.5L18.5 9H15Z"
        />
      </svg>
    );
  }
  return null;
}

function enqueueAudioDuration(url) {
  const u = String(url || "").trim();
  if (!u) return Promise.resolve(null);
  if (audioDurationCache.has(u)) return Promise.resolve(audioDurationCache.get(u));
  if (audioDurationPromiseCache.has(u)) return audioDurationPromiseCache.get(u);

  const p = new Promise((resolve) => {
    audioDurationQueue.push({ url: u, resolve });
    pumpAudioDurationQueue();
  });
  audioDurationPromiseCache.set(u, p);
  return p;
}

function pumpAudioDurationQueue() {
  while (audioDurationInFlight < AUDIO_DURATION_CONCURRENCY && audioDurationQueue.length > 0) {
    const job = audioDurationQueue.shift();
    audioDurationInFlight++;
    loadAudioDuration(job.url)
      .then((sec) => {
        if (sec != null && Number.isFinite(sec) && sec > 0) {
          audioDurationCache.set(job.url, sec);
        }
        job.resolve(audioDurationCache.get(job.url) ?? null);
      })
      .catch(() => job.resolve(null))
      .finally(() => {
        audioDurationInFlight--;
        // limpa promise cache para permitir retry eventual se der null por rede
        if (!audioDurationCache.has(job.url)) audioDurationPromiseCache.delete(job.url);
        pumpAudioDurationQueue();
      });
  }
}

function loadAudioDuration(url) {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      audio.preload = "metadata";
      let done = false;
      const finish = (sec) => {
        if (done) return;
        done = true;
        try {
          audio.src = "";
        } catch {}
        resolve(sec ?? null);
      };

      const t = setTimeout(() => finish(null), 7000);

      audio.onloadedmetadata = () => {
        clearTimeout(t);
        const d = Number(audio.duration);
        // alguns browsers retornam Infinity até baixar mais; ignore
        if (!Number.isFinite(d) || d <= 0 || d === Infinity) return finish(null);
        finish(d);
      };
      audio.onerror = () => {
        clearTimeout(t);
        finish(null);
      };

      audio.src = url;
    } catch {
      resolve(null);
    }
  });
}

function getPreview(chat, { audioDurationSec } = {}) {
  const ultima = chat?.ultima_mensagem;
  if (ultima && (ultima.texto ?? ultima.conteudo ?? ultima.body)) {
    const t = ultima.texto ?? ultima.conteudo ?? ultima.body ?? "";
    if (t) return String(t);
  }
  const last = getLastMessage(chat);
  if (!last) return "Sem mensagens";

  const outPrefix = String(last?.direcao || "").toLowerCase() === "out" ? "Você: " : "";
  const tipoRaw = String(last?.tipo || "").toLowerCase();
  const txtRaw = last?.conteudo || last?.body || last?.texto || "";
  const txt = String(txtRaw || "").trim();
  const tipo =
    tipoRaw ||
    (isPlaceholderAudioText(txt) ? "audio" : "") ||
    (isPlaceholderImageText(txt) ? "imagem" : "") ||
    (isPlaceholderVideoText(txt) ? "video" : "") ||
    (isPlaceholderStickerText(txt) ? "sticker" : "") ||
    (isPlaceholderFileText(txt) ? "arquivo" : "");
  const isPlaceholder =
    !txt ||
    txt === "(mídia)" ||
    txt === "(mensagem vazia)" ||
    txt === "(imagem)" ||
    txt === "(áudio)" ||
    txt === "(vídeo)" ||
    txt === "(figurinha)" ||
    txt === "(arquivo)";
  const cap = !isPlaceholder ? txt.slice(0, 60) : "";

  // Preferir preview por tipo (estilo WhatsApp)
  if (tipo === "audio") {
    const dur = formatDuracaoSegundos(audioDurationSec);
    return `${outPrefix}Áudio${dur ? ` • ${dur}` : ""}`;
  }
  if (tipo === "imagem") return `${outPrefix}Foto${cap ? `: ${cap}` : ""}`;
  if (tipo === "video") return `${outPrefix}Vídeo${cap ? `: ${cap}` : ""}`;
  if (tipo === "sticker") return `${outPrefix}Figurinha${cap ? `: ${cap}` : ""}`;
  if (tipo === "arquivo") {
    const n = String(last?.nome_arquivo || "").trim();
    return `${outPrefix}${n || "Documento"}`;
  }

  if (txt) return `${outPrefix}${txt}`;
  return `${outPrefix}(sem texto)`;
}

function ChatTicks({ status }) {
  const raw = status;
  const s = String(raw ?? "").trim();
  const lower = s.toLowerCase();

  // Alguns providers retornam ack numérico (0..4)
  const maybeNum = typeof raw === "number" ? raw : /^\d+$/.test(lower) ? Number(lower) : null;
  if (maybeNum != null && Number.isFinite(maybeNum)) {
    if (maybeNum <= 0) return <span className="chat-ticks chat-ticks--pending" title="Enviando">✓</span>; // sem relógio
    if (maybeNum === 1) return <span className="chat-ticks" title="Enviada">✓</span>;
    if (maybeNum === 2) return <span className="chat-ticks" title="Entregue">✓✓</span>;
    if (maybeNum >= 3) return <span className="chat-ticks chat-ticks--read" title="Visualizada">✓✓</span>;
  }

  const isErr = lower === "erro" || lower === "error" || lower === "failed" || lower === "falhou";
  const isPending = lower === "pending" || lower === "enviando";
  // Regras WhatsApp:
  // 1 ✓ = enviada (mas ainda não entregue)
  // 2 ✓✓ = entregue
  // 2 ✓✓ azul = visualizada (e/ou áudio "played")
  const isSent =
    !lower || lower === "sent" || lower === "enviado" || lower === "enviada" || lower === "send" || lower === "sending";
  const isDelivered =
    lower === "received" ||
    lower === "delivered" ||
    lower === "entregue" ||
    lower === "entregada" ||
    lower === "receivedcallback";
  const isRead =
    lower === "read" ||
    lower === "seen" ||
    lower === "lida" ||
    lower === "visualizada" ||
    lower === "played";

  if (isErr) return <span className="chat-ticks chat-ticks--err" title="Erro ao enviar">⚠</span>;
  if (isRead) return <span className="chat-ticks chat-ticks--read" title="Visualizada">✓✓</span>;
  if (isDelivered) return <span className="chat-ticks" title="Entregue">✓✓</span>;
  // Sem símbolo de relógio (pedido do usuário): use um ✓ suave enquanto "pending"
  if (isPending) return <span className="chat-ticks chat-ticks--pending" title="Enviando">✓</span>;
  if (isSent) return <span className="chat-ticks" title="Enviada">✓</span>;
  return <span className="chat-ticks" title={s}>✓</span>;
}

function PreviewLine({ chat, audioDurationSec }) {
  const last = chat?.ultima_mensagem || getLastMessage(chat);
  if (!last) return <span className="chat-list-previewText">Sem mensagens</span>;

  const out = String(last?.direcao || "").toLowerCase() === "out";
  const status = last?.status ?? last?.status_mensagem ?? chat?.status ?? "";

  const txtRaw = last?.conteudo || last?.body || last?.texto || "";
  const txt = String(txtRaw || "").trim();

  const tipoRaw = String(last?.tipo || "").toLowerCase();
  const tipo =
    tipoRaw ||
    (isPlaceholderAudioText(txt) ? "audio" : "") ||
    (isPlaceholderImageText(txt) ? "imagem" : "") ||
    (isPlaceholderVideoText(txt) ? "video" : "") ||
    (isPlaceholderStickerText(txt) ? "sticker" : "") ||
    (isPlaceholderFileText(txt) ? "arquivo" : "");

  const isPlaceholder =
    !txt ||
    txt === "(mídia)" ||
    txt === "(mensagem vazia)" ||
    isPlaceholderImageText(txt) ||
    isPlaceholderAudioText(txt) ||
    isPlaceholderVideoText(txt) ||
    isPlaceholderStickerText(txt) ||
    isPlaceholderFileText(txt);

  const cap = !isPlaceholder ? txt.slice(0, 60) : "";

  if (tipo === "audio") {
    const dur = formatDuracaoSegundos(audioDurationSec);
    const durLabel = dur || "0:00";
    return (
      <span className={`chat-list-previewLine ${out ? "is-out" : ""}`}>
        {out ? <ChatTicks status={status} /> : null}
        <PreviewIcon type="audio" className={out ? "is-accent" : ""} />
        <span className={`chat-list-previewDur ${out ? "is-accent" : ""}`}>{durLabel}</span>
      </span>
    );
  }

  if (tipo === "imagem") {
    return (
      <span className="chat-list-previewLine">
        {out ? <ChatTicks status={status} /> : null}
        <PreviewIcon type="imagem" />
        <span className="chat-list-previewText">{cap ? `Foto · ${cap}` : "Foto"}</span>
      </span>
    );
  }
  if (tipo === "video") {
    return (
      <span className="chat-list-previewLine">
        {out ? <ChatTicks status={status} /> : null}
        <PreviewIcon type="video" />
        <span className="chat-list-previewText">{cap ? `Vídeo · ${cap}` : "Vídeo"}</span>
      </span>
    );
  }
  if (tipo === "sticker") {
    return (
      <span className="chat-list-previewLine">
        {out ? <ChatTicks status={status} /> : null}
        <PreviewIcon type="sticker" />
        <span className="chat-list-previewText">{cap ? `Figurinha · ${cap}` : "Figurinha"}</span>
      </span>
    );
  }
  if (tipo === "arquivo") {
    const n = String(last?.nome_arquivo || "").trim();
    return (
      <span className="chat-list-previewLine">
        {out ? <ChatTicks status={status} /> : null}
        <PreviewIcon type="arquivo" />
        <span className="chat-list-previewText">{n || "Documento"}</span>
      </span>
    );
  }

  return (
    <span className="chat-list-previewLine">
      {out ? <ChatTicks status={status} /> : null}
      <span className="chat-list-previewText">{txt || "Sem mensagens"}</span>
    </span>
  );
}

/* =====================================================
   NORMALIZAÇÃO DE CONTATO (PRO) - mantido
===================================================== */

/** Uma só fonte: telefone no topo. Nunca exibir LID (lid:xxx) — backend envia telefone_exibivel null nesses casos. */
function getPhone(chat) {
  const tel = chat?.telefone_exibivel ?? chat?.cliente_telefone ?? chat?.telefone ?? chat?.numero ?? chat?.phone ?? chat?.wa_id ?? "";
  const s = String(tel || "").trim();
  if (s.toLowerCase().startsWith("lid:")) return "";
  return s;
}

function formatPhoneForDisplay(phone) {
  const p = String(phone || "").replace(/\D/g, "");
  if (p.length >= 10) return `+${p}`;
  return p || "";
}

/** Usa nome vindo da API (contato_nome/nome) com fallbacks. Nunca exibir LID (lid:xxx) como nome. */
function getDisplayName(chat) {
  if (isGroupConversation(chat)) {
    const nome = chat?.nome_grupo ?? chat?.contato_nome ?? chat?.nome ?? "";
    const n = String(nome || "").trim();
    if (n && !n.toLowerCase().startsWith("lid:")) return n;
    return getPhone(chat) || "Grupo";
  }
  const raw =
    chat?.contato_nome ??
    chat?.cliente_nome ??
    chat?.cliente?.nome ??
    chat?.nome ??
    "";
  const nome = String(raw || "").trim();
  if (nome && !nome.toLowerCase().startsWith("lid:")) return nome;
  // fallback: número exibível
  return getPhone(chat) || "Contato";
}

/**
 * Par único nome + foto do mesmo contato (evita desalinhamento).
 * Usa foto_perfil (backend) ou senderPhoto/photo (webhook). Sempre use displayName e avatarUrl juntos.
 */
function getContactDisplay(chat) {
  const isGroup = isGroupConversation(chat);
  const displayName = getDisplayName(chat);
  const phone = chat?.telefone_exibivel || "";
  const rawFoto = isGroup
    ? (chat?.foto_grupo ?? null)
    : (
        chat?.foto_perfil ??
        chat?.cliente?.foto_perfil ??
        chat?.clientes?.foto_perfil ??
        chat?.senderPhoto ??
        chat?.photo ??
        null
      );
  const avatarUrl = rawFoto && String(rawFoto).trim().startsWith("http") ? String(rawFoto).trim() : null;
  return { displayName, avatarUrl, phone, isGroup };
}

function TagMini({ tag }) {
  if (!tag) return null;
  return (
    <span
      className="chat-list-tag-mini"
      title={tag?.nome}
      style={{ background: tag?.cor || "#64748b" }}
    >
      {tag?.nome}
    </span>
  );
}

function getAvatarColor(seed = "") {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 62%, 42%)`;
}

/* =====================================================
   UI HELPERS (somente visual)
===================================================== */

function Icon({ children, size = 16 }) {
  return (
    <span
      className="chat-list-icon"
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      aria-hidden
    >
      {children}
    </span>
  );
}

function HeaderButton({ title, onClick, children, innerRef }) {
  return (
    <button
      ref={innerRef}
      onClick={onClick}
      className="chat-list-header-btn"
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      className={`chat-list-chip ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }) {
  const s = String(status || "");
  if (!s) return null;
  const map = {
    aberta: { label: "Aberta", cls: "chat-list-status open" },
    em_atendimento: { label: "Em atendimento", cls: "chat-list-status in" },
    fechada: { label: "Finalizada", cls: "chat-list-status closed" },
  };
  const it = map[s];
  if (!it) return null;
  return (
    <span className={it.cls} title={it.label}>
      {it.label}
    </span>
  );
}

function SkeletonList() {
  return (
    <div className="chat-list-pad">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="chat-list-skel-row">
          <div className="chat-list-skel-avatar" />
          <div className="chat-list-skel-body">
            <div className="chat-list-skel-top" />
            <div className="chat-list-skel-bottom" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatRow({
  chat,
  active,
  onSelect,
  onOpenClienteSemConversa,
  selectedId,
  setSelectedId,
  carregarConversa,
  setUnread,
}) {
  const id = chat?.id;
  const clienteId = chat?.cliente_id;
  const semConversa = Boolean(chat?.sem_conversa && chat?.cliente_id);
  const contact = getContactDisplay(chat);
  const { displayName, avatarUrl, phone, isGroup } = contact;
  const empresa = String(chat?.cliente?.empresa ?? chat?.cliente_empresa ?? chat?.empresa ?? "").trim();
  const hasName = displayName !== phone;
  const last = getLastMessage(chat);
  const lastTxt = String(last?.conteudo || last?.body || last?.texto || "").trim();
  const lastTipoRaw = !semConversa ? String(last?.tipo || "").toLowerCase() : "";
  const lastTipoResolved =
    lastTipoRaw ||
    (isPlaceholderAudioText(lastTxt) ? "audio" : "") ||
    (isPlaceholderImageText(lastTxt) ? "imagem" : "") ||
    (isPlaceholderVideoText(lastTxt) ? "video" : "") ||
    (isPlaceholderStickerText(lastTxt) ? "sticker" : "") ||
    (isPlaceholderFileText(lastTxt) ? "arquivo" : "");
  const ts = last?.criado_em || chat?.criado_em;
  const hora = formatHora(ts);
  const audioUrl =
    !semConversa && lastTipoResolved === "audio" && last?.url
      ? getMediaUrl(String(last.url))
      : "";
  const [audioSec, setAudioSec] = useState(() => (audioUrl && audioDurationCache.has(audioUrl) ? audioDurationCache.get(audioUrl) : null));

  const lastTipo = lastTipoResolved;
  // thumb removido no chatlist para ficar igual WhatsApp (sem cortes / mais alinhado)

  useEffect(() => {
    let cancelled = false;
    if (!audioUrl) {
      setAudioSec(null);
      return;
    }
    const cached = audioDurationCache.get(audioUrl);
    if (cached != null) {
      setAudioSec(cached);
      return;
    }
    enqueueAudioDuration(audioUrl).then((sec) => {
      if (cancelled) return;
      if (sec != null) setAudioSec(sec);
    });
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  const previewTitle = semConversa ? "Sem mensagens" : getPreview(chat, { audioDurationSec: audioSec });
  const previewNode = semConversa ? <span className="chat-list-previewText">Sem mensagens</span> : <PreviewLine chat={chat} audioDurationSec={audioSec} />;
  const unread = Number(chat?.unread_count ?? chat?.unread ?? 0);
  const avatarSeed = displayName || phone || id || clienteId;
  const color = getAvatarColor(avatarSeed);
  const [imgError, setImgError] = useState(false);
  const [opening, setOpening] = useState(false);
  const showAvatarImg = Boolean(avatarUrl && !imgError);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  function handleClick() {
    if (semConversa && chat?.cliente_id) {
      setOpening(true);
      onOpenClienteSemConversa?.(chat.cliente_id)
        .finally(() => setOpening(false));
      return;
    }
    if (id == null || id === undefined || id === "") return;
    const normalizedId = Number(id) || String(id);
    setSelectedId(normalizedId);
    carregarConversa(normalizedId);
    setUnread(normalizedId, 0);
    onSelect?.(normalizedId);
  }

  return (
    <button
      type="button"
      className={`chat-list-row ${active ? "is-active" : ""} ${semConversa ? "chat-list-row-sem-conversa" : ""} ${unread > 0 ? "has-unread" : ""}`}
      onClick={handleClick}
      disabled={opening}
      data-chat-id={id ?? undefined}
      data-cliente-id={clienteId ?? undefined}
      aria-label={`Conversa com ${displayName}`}
    >
      <div className="chat-list-avatar" style={{ background: showAvatarImg ? "transparent" : color }} aria-hidden="true">
        {showAvatarImg ? (
          <img
            src={avatarUrl}
            alt=""
            className="chat-list-avatar-img"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="chat-list-avatar-text">
            {isGroup ? "👥" : hasName ? initials(displayName) : "#"}
          </span>
        )}
      </div>

      <div className="chat-list-row-main">
        <div className="chat-list-row-top">
          <div className="chat-list-row-title-wrap">
            <div className="chat-list-title-line">
              <div className="chat-list-title" title={displayName}>
                {displayName}
              </div>
              {isGroup ? (
                <span className="chat-list-badge-grupo" title="Conversa de grupo">Grupo</span>
              ) : chat?.tags?.[0] ? (
                <TagMini tag={chat.tags[0]} />
              ) : null}
            </div>
            {!isGroup && chat?.setor ? (
              <div className="chat-list-setor" title={`Setor: ${chat.setor}`}>
                {chat.setor}
              </div>
            ) : null}
            {!isGroup && empresa ? (
              <div className="chat-list-empresa" title={`Empresa: ${empresa}`}>
                {empresa}
              </div>
            ) : null}
          </div>
          <div className="chat-list-row-meta">
            <div className="chat-list-time">{opening ? "Abrindo…" : hora || (semConversa ? "" : "")}</div>
            {semConversa ? (
              <span className="chat-list-badge-sem-conversa" title="Clique para iniciar conversa">Sem conversa</span>
            ) : (
              <StatusPill status={chat?.status_atendimento} />
            )}
          </div>
        </div>
        <div className="chat-list-row-mid">
          <div className="chat-list-midLeft">
            <div className="chat-list-preview" title={previewTitle}>
              {previewNode}
            </div>
          </div>
          <UnreadBadge n={unread} />
        </div>
      </div>
    </button>
  );
}

/* =====================================================
   COMPONENTE PRINCIPAL (lógica mantida)
===================================================== */

export default function ChatList() {
  const chats = useChatStore((s) => s.chats || []);
  const setChats = useChatStore((s) => s.setChats);
  const setLoading = useChatStore((s) => s.setLoading);
  const setUnread = useChatStore((s) => s.setUnread);
  const addChat = useChatStore((s) => s.addChat);
  const loading = useChatStore((s) => s.loading);

  const navigate = useNavigate();

  const carregarConversa = useConversaStore((s) => s.carregarConversa);
  const setSelectedId = useConversaStore((s) => s.setSelectedId);
  const selectedId = useConversaStore((s) => s.selectedId);

  const user = useAuthStore((s) => s.user);

  const searchRef = useRef(null);

  // busca / filtros avançados (mantidos)
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 220);

  const [statusFilter, setStatusFilter] = useState("todos");
  const [allTags, setAllTags] = useState([]);
  const [tagFilter, setTagFilter] = useState("todas");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [atendentes, setAtendentes] = useState([]);
  const [atendenteFilter, setAtendenteFilter] = useState("todos");
  const [departamentos, setDepartamentos] = useState([]);
  const [departamentoFilter, setDepartamentoFilter] = useState("todos");
  const [mineOnly, setMineOnly] = useState(false);
  const [order, setOrder] = useState("recentes");
  const [showFilters, setShowFilters] = useState(false);

  // menu "Novo" (botão +)
  const [showNovoMenu, setShowNovoMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const novoBtnRef = useRef(null);
  const novoMenuRef = useRef(null);

  // tabs estilo WhatsApp (chip row)
  // todas | nao_lidas | hoje | abertas | em_atendimento | finalizadas
  const [tab, setTab] = useState("todas");

  // Status de conexão Z-API: null=não verificado, true=conectado, false=desconectado
  const [zapiConnected, setZapiConnected] = useState(null);
  const [zapiStatusLoaded, setZapiStatusLoaded] = useState(false);

  // Na montagem: verificar conexão Z-API + sincronizar fotos em background
  useEffect(() => {
    let cancelled = false;

    // Verificar status de conexão
    getZapiStatus()
      .then((s) => {
        if (cancelled) return;
        setZapiConnected(s?.connected === true);
        setZapiStatusLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setZapiStatusLoaded(true);
      });

    // Sincronizar fotos em background (não bloqueia a UI; ignora erros)
    sincronizarFotosPerfil().catch(() => {});

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const params = {
        tag_id: tagFilter !== "todas" ? tagFilter : undefined,
        departamento_id: departamentoFilter !== "todos" ? departamentoFilter : undefined,
        status_atendimento: statusFilter !== "todos" ? statusFilter : undefined,
        atendente_id: atendenteFilter !== "todos" ? atendenteFilter : undefined,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
        incluir_todos_clientes: "1",
      };
      const data = await fetchChats(params);
      let list = Array.isArray(data) ? data : [];
      if (mineOnly && user?.id) list = list.filter((c) => String(c.atendente_id) === String(user.id));
      // Desduplicar por id (conversas) ou por cliente_id (clientes sem conversa) — NÃO descartar itens com id null
      const byKey = new Map();
      list.forEach((c) => {
        const key = c?.id != null ? `conv-${c.id}` : (c?.cliente_id != null ? `cliente-${c.cliente_id}` : `tel-${c?.telefone ?? Math.random()}`);
        if (!byKey.has(key)) byKey.set(key, c);
      });
      list = Array.from(byKey.values());
      const getTs = (c) =>
        c?.ultima_mensagem?.criado_em ||
        getLastMessage(c)?.criado_em ||
        c?.ultima_atividade ||
        c?.criado_em ||
        0;
      list.sort((a, b) =>
        order === "antigas"
          ? new Date(getTs(a)) - new Date(getTs(b))
          : new Date(getTs(b)) - new Date(getTs(a))
      );
      // Preserva nome/foto já conhecidos para evitar "piscadas" de Contato/# quando o backend ainda não mandou tudo.
      setChats((prev) => {
        const arr = Array.isArray(prev) ? prev : [];
        const byId = new Map(arr.map((c) => [String(c.id), c]));
        return list.map((c) => {
          const existing = c?.id != null ? byId.get(String(c.id)) : null;
          if (!existing) return c;
          return {
            ...c,
            contato_nome: c?.contato_nome || c?.nome || existing.contato_nome || existing.nome,
            foto_perfil: c?.foto_perfil || existing.foto_perfil,
            nome_grupo: c?.nome_grupo || existing.nome_grupo,
            cliente: c?.cliente || existing.cliente,
          };
        });
      });
    } catch (e) {
      console.error("Erro ao carregar conversas:", e);
      setChats([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tagFilter, departamentoFilter, statusFilter, atendenteFilter, dataInicio, dataFim, debouncedSearch, mineOnly, order]);

  useEffect(() => {
    listarTags().then(setAllTags).catch(() => setAllTags([]));
  }, []);

  useEffect(() => {
    api.get("/usuarios").then((r) => setAtendentes(r.data || [])).catch(() => setAtendentes([]));
  }, []);
  useEffect(() => {
    api.get("/dashboard/departamentos").then((r) => setDepartamentos(r.data || [])).catch(() => setDepartamentos([]));
  }, []);

  // atalhos
  useEffect(() => {
    function onKeyDown(e) {
      const k = e.key.toLowerCase();

      if (e.ctrlKey && k === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }

      if (e.ctrlKey && k === "f") {
        e.preventDefault();
        setShowFilters((v) => !v);
      }

      if (k === "escape") {
        // ESC: fecha filtros e limpa busca
        setShowFilters(false);
        setSearch("");
        setStatusFilter("todos");
        setTagFilter("todas");
        setDepartamentoFilter("todos");
        setMineOnly(false);
        setOrder("recentes");
        setTab("todas");
        setShowNovoMenu(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // posiciona menu abaixo do botão Novo
  useEffect(() => {
    if (!showNovoMenu || !novoBtnRef.current) return;
    const btn = novoBtnRef.current;
    const rect = btn.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 4,
      left: rect.right - 200,
    });
  }, [showNovoMenu]);

  // fecha menu "Novo" ao clicar fora
  useEffect(() => {
    if (!showNovoMenu) return;

    function onMouseDown(e) {
      const btn = novoBtnRef.current;
      const menu = novoMenuRef.current;
      const target = e.target;
      if (!target) return;

      if (btn && btn.contains(target)) return;
      if (menu && menu.contains(target)) return;

      setShowNovoMenu(false);
    }

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [showNovoMenu]);

  function emitNovoAction(type) {
    setShowNovoMenu(false);

    const routes = {
      novo_contato: "/atendimento/novo-contato",
      novo_grupo: "/atendimento/novo-grupo",
      nova_comunidade: "/atendimento/nova-comunidade",
    };

    const path = routes[type];
    if (path) navigate(path);
  }

  function handleSelecionarConversa(chatId) {
    if (chatId == null || chatId === undefined || chatId === "") return;
    const id = Number(chatId) || String(chatId);
    setSelectedId(id);
    carregarConversa(id);
    setUnread(id, 0);
  }

  async function handleOpenClienteSemConversa(cliente_id) {
    if (!cliente_id) return;
    try {
      const { conversa } = await abrirConversaCliente(cliente_id);
      if (conversa?.id) {
        addChat(conversa);
        setSelectedId(conversa.id);
        carregarConversa(conversa.id);
        setUnread(conversa.id, 0);
      }
    } catch (e) {
      console.error("Erro ao abrir conversa do cliente:", e);
    }
  }

  const chatsFiltrados = useMemo(() => {
    let list = Array.isArray(chats) ? [...chats] : [];

    // tabs rápidas
    if (tab === "nao_lidas") {
      list = list.filter((c) => Number(c?.unread_count ?? c?.unread ?? 0) > 0);
    } else if (tab === "hoje") {
      list = list.filter((c) => {
        const last = getLastMessage(c);
        const ts = last?.criado_em || c?.criado_em;
        return isToday(ts);
      });
    } else if (tab === "abertas") {
      list = list.filter((c) => String(c.status_atendimento) === "aberta");
    } else if (tab === "em_atendimento") {
      list = list.filter((c) => String(c.status_atendimento) === "em_atendimento");
    } else if (tab === "finalizadas") {
      list = list.filter((c) => String(c.status_atendimento) === "fechada");
    }

    // filtros avançados
    if (statusFilter !== "todos") {
      list = list.filter((c) => String(c.status_atendimento) === statusFilter);
    }

    if (tagFilter !== "todas") {
      list = list.filter((c) =>
        (c?.tags || []).some((t) => String(t.id) === String(tagFilter))
      );
    }

    if (mineOnly && user?.id) {
      list = list.filter((c) => String(c.atendente_id) === String(user.id));
    }

    // busca
    const termRaw = String(debouncedSearch || "").trim();
    const term = termRaw.toLowerCase();
    const termDigits = digitsOnly(termRaw);
    if (term) {
      list = list.filter((c) => {
        const title = getDisplayName(c).toLowerCase();
        const phone = String(getPhone(c) || "").toLowerCase();
        const telRaw =
          c?.telefone_exibivel ||
          c?.cliente_telefone ||
          c?.telefone ||
          "";
        const telDigits = digitsOnly(telRaw);

        const matchName = title.includes(term);
        const matchPhone =
          termDigits &&
          (digitsOnly(phone).includes(termDigits) || telDigits.includes(termDigits));

        return matchName || matchPhone;
      });
    }

    // ordenação (conversas primeiro por data; clientes sem conversa depois, por nome)
    list.sort((a, b) => {
      if (a?.sem_conversa && !b?.sem_conversa) return 1;
      if (!a?.sem_conversa && b?.sem_conversa) return -1;
      if (a?.sem_conversa && b?.sem_conversa) {
        const na = (a.contato_nome || "").toString().toLowerCase();
        const nb = (b.contato_nome || "").toString().toLowerCase();
        return na.localeCompare(nb);
      }
      const aTs = new Date(
        a?.ultima_mensagem?.criado_em || getLastMessage(a)?.criado_em || a?.ultima_atividade || a?.criado_em || 0
      ).getTime();
      const bTs = new Date(
        b?.ultima_mensagem?.criado_em || getLastMessage(b)?.criado_em || b?.ultima_atividade || b?.criado_em || 0
      ).getTime();
      return order === "antigas" ? aTs - bTs : bTs - aTs;
    });

    return list;
  }, [chats, debouncedSearch, statusFilter, tagFilter, mineOnly, order, tab, user?.id]);

  // KPIs
  const total = chats.length;
  const countNaoLidas = chats.filter((c) => Number(c?.unread_count ?? c?.unread ?? 0) > 0).length;
  const countHoje = chats.filter((c) => {
    const last = getLastMessage(c);
    const ts = last?.criado_em || c?.criado_em;
    return isToday(ts);
  }).length;
  const countAbertas = chats.filter((c) => String(c.status_atendimento) === "aberta").length;
  const countEmAtendimento = chats.filter((c) => String(c.status_atendimento) === "em_atendimento").length;
  const countFinalizadas = chats.filter((c) => String(c.status_atendimento) === "fechada").length;

  return (
    <div className="chat-list-root">
      {zapiStatusLoaded && zapiConnected === false && (
        <div
          style={{
            background: "#fff3cd",
            borderBottom: "1px solid #ffc107",
            color: "#856404",
            fontSize: "0.78rem",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: "1rem" }}>⚠️</span>
          <span>
            WhatsApp desconectado — mensagens não serão entregues.{" "}
            <a
              href="/configuracoes"
              style={{ color: "#856404", fontWeight: 600, textDecoration: "underline" }}
            >
              Reconectar
            </a>
          </span>
        </div>
      )}
      <header className="chat-list-header">
        <div className="chat-list-header-left">
          <ZapERPLogo
            variant="horizontal"
            size="md"
            tagline="Atendimento inteligente"
            title="ZapERP — Atendimento inteligente"
          />
        </div>

        <div className="chat-list-header-actions">
          <HeaderButton
            innerRef={novoBtnRef}
            title="Novo contato, grupo ou comunidade"
            onClick={(e) => {
              e.stopPropagation();
              setShowNovoMenu((v) => !v);
            }}
          >
            <Icon size={14}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Icon>
          </HeaderButton>

          <HeaderButton title="Filtros" onClick={() => setShowFilters((v) => !v)}>
            <Icon size={14}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6h16M7 12h10M10 18h4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Icon>
          </HeaderButton>

          <HeaderButton title="Atualizar" onClick={load}>
            <Icon size={14}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Icon>
          </HeaderButton>
        </div>

        {showNovoMenu &&
          createPortal(
            <div
              ref={novoMenuRef}
              className="chat-list-novo-menu chat-list-novo-menu-portal"
              role="menu"
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                minWidth: 200,
              }}
            >
              <button
                type="button"
                className="chat-list-novo-item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  emitNovoAction("novo_contato");
                }}
                role="menuitem"
              >
                <span className="chat-list-novo-icon" aria-hidden>👤</span>
                <span>Novo contato</span>
              </button>
              <button
                type="button"
                className="chat-list-novo-item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  emitNovoAction("novo_grupo");
                }}
                role="menuitem"
              >
                <span className="chat-list-novo-icon" aria-hidden>👥</span>
                <span>Novo grupo</span>
              </button>
              <button
                type="button"
                className="chat-list-novo-item"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  emitNovoAction("nova_comunidade");
                }}
                role="menuitem"
              >
                <span className="chat-list-novo-icon" aria-hidden>🌐</span>
                <span>Nova comunidade</span>
              </button>
            </div>,
            document.body
          )}
      </header>

      <div className="chat-list-search-wrap">
        <div className="chat-list-search-box">
          <Icon size={14}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M10.5 18a7.5 7.5 0 1 1 7.5-7.5A7.5 7.5 0 0 1 10.5 18Zm9 3-5.2-5.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </Icon>

          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="chat-list-search-input"
          />
        </div>
        <div className="chat-list-search-hint">
          <span>{loading ? "Carregando…" : `${chatsFiltrados.length} de ${total}`}</span>
        </div>
      </div>

      <div className="chat-list-chips">
        <Chip active={tab === "todas"} onClick={() => setTab("todas")}>
          <span>Todas</span>
          <span className="chat-list-chip-count">{total}</span>
        </Chip>
        <Chip active={tab === "nao_lidas"} onClick={() => setTab("nao_lidas")}>
          <span>Não lidas</span>
          <span className="chat-list-chip-count">{countNaoLidas}</span>
        </Chip>
        <Chip active={tab === "hoje"} onClick={() => setTab("hoje")}>
          <span>Hoje</span>
          <span className="chat-list-chip-count">{countHoje}</span>
        </Chip>
        <Chip active={tab === "abertas"} onClick={() => setTab("abertas")}>
          <span>Abertas</span>
          <span className="chat-list-chip-count">{countAbertas}</span>
        </Chip>
        <Chip active={tab === "em_atendimento"} onClick={() => setTab("em_atendimento")}>
          <span>Em atendimento</span>
          <span className="chat-list-chip-count">{countEmAtendimento}</span>
        </Chip>
        <Chip active={tab === "finalizadas"} onClick={() => setTab("finalizadas")}>
          <span>Finalizadas</span>
          <span className="chat-list-chip-count">{countFinalizadas}</span>
        </Chip>
      </div>

      {showFilters && (
        <div className="chat-list-filters">
          <div className="chat-list-filters-row">
            <label className="chat-list-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="chat-list-select"
              >
                <option value="todos">Todos</option>
                <option value="aberta">Aberta</option>
                <option value="em_atendimento">Em atendimento</option>
                <option value="fechada">Fechada</option>
              </select>
            </label>
            <label className="chat-list-field">
              <span>Tag</span>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="chat-list-select"
              >
                <option value="todas">Todas</option>
                {allTags.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </label>
            {String(user?.role || "").toLowerCase() === "admin" && (
              <label className="chat-list-field">
                <span>Setor</span>
                <select
                  value={departamentoFilter}
                  onChange={(e) => setDepartamentoFilter(e.target.value)}
                  className="chat-list-select"
                >
                  <option value="todos">Todos</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="chat-list-field">
              <span>Atendente</span>
              <select
                value={atendenteFilter}
                onChange={(e) => setAtendenteFilter(e.target.value)}
                className="chat-list-select"
              >
                <option value="todos">Todos</option>
                {atendentes.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome || u.email}</option>
                ))}
              </select>
            </label>
            <label className="chat-list-field">
              <span>Data início</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="chat-list-select"
              />
            </label>
            <label className="chat-list-field">
              <span>Data fim</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="chat-list-select"
              />
            </label>
            <label className="chat-list-check">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)}
              />
              <span>Minhas conversas</span>
            </label>
            <label className="chat-list-field">
              <span>Ordem</span>
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className="chat-list-select"
              >
                <option value="recentes">Mais recentes</option>
                <option value="antigas">Mais antigas</option>
              </select>
            </label>
          </div>
        </div>
      )}

      <div className="chat-list-list chat-list-scroll">
        {loading ? (
          <SkeletonList />
        ) : chatsFiltrados.length === 0 ? (
          <div className="chat-list-empty">Nenhuma conversa encontrada</div>
        ) : (
          chatsFiltrados.map((c) => {
            const id = c?.id;
            const rowKey = id != null ? String(id) : `cliente-${c?.cliente_id ?? c?.telefone ?? Math.random()}`;
            const active = id != null && String(selectedId) === String(id);

            return (
              <ChatRow
                key={rowKey}
                chat={c}
                active={active}
                onSelect={handleSelecionarConversa}
                onOpenClienteSemConversa={handleOpenClienteSemConversa}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                carregarConversa={carregarConversa}
                setUnread={setUnread}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
