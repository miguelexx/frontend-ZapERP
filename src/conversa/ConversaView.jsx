import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConversaStore } from "./conversaStore";
import { enviarMensagem, excluirMensagem, enviarReacao, removerReacao, enviarContato, registrarLigacao } from "./conversaService";
import { isGroupConversation } from "../utils/conversaUtils";
import "./conversa.css";
import api from "../api/http";
import { useAuthStore } from "../auth/authStore";
import { canGerenciarSetores, canTag } from "../auth/permissions";
import AtendimentoActions from "../atendimento/AtendimentoActions";
import { useChatStore } from "../chats/chatsStore";
import { fetchChats, abrirConversaCliente } from "../chats/chatService";
import { getApiBaseUrl } from "../api/baseUrl";
import { getSocket } from "../socket/socket";
import { saveReplyMeta } from "./replyMeta";
import {
  listarTags,
  adicionarTagConversa,
  removerTagConversa,
} from "../api/tagService";
import * as cfg from "../api/configService";
import SidebarCliente from "./SidebarCliente";

/* =========================================================
   Utils
========================================================= */

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
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
}

function formatDia(ts) {
  if (!ts) return "";
  try {
    const d = parseToDate(ts) || new Date(ts);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
}

function sameDay(a, b) {
  try {
    const da = parseToDate(a) || new Date(a);
    const db = parseToDate(b) || new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  } catch {
    return false;
  }
}

function safeString(v) {
  return String(v ?? "").trim();
}

function formatHoraCurta(ts) {
  if (!ts) return "";
  try {
    const d = parseToDate(ts) || new Date(ts);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
}

function timelineEventLabel(a) {
  const acao = safeString(a?.acao).toLowerCase();
  const quem = a?.usuario_nome || "Sistema";
  const paraQuem = a?.para_usuario_nome;
  if (acao === "assumiu") return `${quem} assumiu`;
  if (acao === "transferiu") return paraQuem ? `${quem} transferiu para ${paraQuem}` : `${quem} transferiu`;
  if (acao === "transferiu_setor") return a?.observacao ? `${quem} transferiu setor: ${a.observacao}` : `${quem} transferiu setor`;
  if (acao === "encerrou") return "Atendimento finalizado";
  if (acao === "reabriu") return "Conversa reaberta";
  return quem;
}

function initials(nome = "") {
  const parts = safeString(nome).split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0]?.[0] || "?";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}

function normalizeTelefone(v) {
  const raw = safeString(v);
  const digits = raw.replace(/\D+/g, "");
  return digits;
}

function statusBadge(status) {
  const s = safeString(status).toLowerCase();

  if (s === "em_atendimento") {
    return {
      text: "Em atendimento",
      bg: "rgba(59,130,246,0.12)",
      color: "var(--wa-status-blue)",
      border: "rgba(59,130,246,0.18)",
      dot: "var(--wa-status-blue)",
    };
  }
  if (s === "fechada") {
    return {
      text: "Finalizada",
      bg: "rgba(245,158,11,0.12)",
      color: "var(--wa-status-orange)",
      border: "rgba(245,158,11,0.18)",
      dot: "var(--wa-status-orange)",
    };
  }
  return {
    text: "Aberta",
    bg: "rgba(34,197,94,0.12)",
    color: "var(--wa-status-green)",
    border: "rgba(34,197,94,0.18)",
    dot: "var(--wa-status-green)",
  };
}

function isImageFile(file) {
  if (!file) return false;
  const t = String(file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const name = String(file.name || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);
}

function isAudioFile(file) {
  if (!file) return false;
  const t = String(file.type || "").toLowerCase();
  if (t.startsWith("audio/")) return true;
  const name = String(file.name || "").toLowerCase();
  return /\.(mp3|ogg|wav|m4a|webm|aac|opus)$/i.test(name);
}

function getMediaUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = getApiBaseUrl();
  return base.replace(/\/$/, "") + (url.startsWith("/") ? url : "/" + url);
}

function fileToPreviewURL(file) {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

/* =========================================================
   Icons — finos (stroke ~1.5px), minimalistas
========================================================= */

function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconMore(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <circle cx="12" cy="6" r="1.25" fill="currentColor" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" />
      <circle cx="12" cy="18" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconAttach(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IconSend(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m22 2-7 20-4-9-9-4L22 2z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function IconMic(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

function IconEmoji(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
    </svg>
  );
}

function IconCamera(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconPlay(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M8 5v14l12-7-12-7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPause(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" strokeWidth="1.8" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M7 5h3v14H7z" fill="currentColor" stroke="none" />
      <path d="M14 5h3v14h-3z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconClose(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function IconTag(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function IconClipboard(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function IconContact(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19a7 7 0 0 1 14 0" />
      <rect x="3" y="3" width="5" height="5" rx="1" />
    </svg>
  );
}

/* =========================================================
   UI helpers
========================================================= */

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`wa-toast ${toast.type || "info"}`} role="status" aria-live="polite">
      <div className="wa-toast-title">{toast.title || "Aviso"}</div>
      {toast.message ? <div className="wa-toast-message">{toast.message}</div> : null}
      <button className="wa-toast-close" type="button" onClick={onClose} title="Fechar">
        <IconClose />
      </button>
    </div>
  );
}

function SkeletonLine({ w = "100%" }) {
  return <div className="wa-skeleton-line" style={{ width: w }} />;
}

function DaySeparator({ label }) {
  return (
    <div className="wa-daySep" role="separator" aria-label={`Mensagens do dia ${label}`}>
      <span className="wa-daySep-pill">{label}</span>
    </div>
  );
}

/**
 * Status ✓ / ✓✓ / ✓✓ azul
 * - tenta inferir por campos comuns (status, lida_em, lidaEm, read_at, etc.)
 */
function MessageTicks({ msg }) {
  const out = msg?.direcao === "out";
  if (!out) return null;

  const rawStatus = safeString(msg?.status_mensagem || msg?.status || msg?.situacao).toLowerCase();
  const hasReadAt = !!(msg?.lida_em || msg?.lidaEm || msg?.read_at || msg?.readAt);
  const hasDeliveredAt = !!(msg?.entregue_em || msg?.entregueEm || msg?.delivered_at || msg?.deliveredAt);

  const s = rawStatus;
  const isErr = s === "erro" || s === "error" || s === "failed" || s === "falhou";
  const isPending = s === "pending" || s === "enviando" || s === "sending";
  const isRead =
    s === "lida" || s === "read" || s === "seen" ||
    s === "visualizada" || s === "played" ||
    hasReadAt;
  const isDelivered =
    isRead ||
    s === "entregue" || s === "delivered" || s === "received" ||
    hasDeliveredAt;
  // sent: mensagem confirmada pelo servidor WA mas ainda não entregue ao dispositivo
  const isSent = !isErr && !isPending && !isDelivered && !isRead &&
    (!s || s === "sent" || s === "enviada" || s === "enviado");

  // Ticks finos e minimalistas (estilo WhatsApp Web)
  const TickSvg = ({ kind }) => (
    <svg
      className="wa-ticksSvg"
      viewBox="0 0 18 12"
      width="18"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      {/* primeiro tick */}
      {kind === "sent" || kind === "delivered" || kind === "read" ? (
        <path
          d="M2.2 6.2 5.2 9.1 10.4 3.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {/* segundo tick (bem colado) */}
      {kind === "delivered" || kind === "read" ? (
        <path
          d="M7.0 6.2 10.0 9.1 15.2 3.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {/* relógio (pending) */}
      {kind === "pending" ? (
        <>
          <circle cx="9" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.35" opacity="0.9" />
          <path d="M9 3.8v2.5l1.6 1.0" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {/* erro */}
      {kind === "err" ? (
        <>
          <circle cx="9" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.35" opacity="0.9" />
          <path d="M9 3.6v3.2" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <circle cx="9" cy="10" r="0.8" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );

  return (
    <span className={`wa-ticks ${isDelivered ? "isDelivered" : ""} ${isRead ? "isRead" : ""} ${isErr ? "isErr" : ""} ${isPending ? "isPending" : ""}`}>
      <TickSvg kind={isErr ? "err" : isPending ? "pending" : isRead ? "read" : isDelivered ? "delivered" : isSent ? "sent" : "sent"} />
    </span>
  );
}

async function copyTextToClipboard(text) {
  const t = safeString(text);
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }
}

function snippetFromMsg(msg) {
  const t = safeString(msg?.texto);
  if (t) return t.length > 80 ? `${t.slice(0, 80)}…` : t;
  const tipo = safeString(msg?.tipo);
  if (tipo === "audio") {
    const rawDur =
      msg?.audio_duracao_sec ??
      msg?.audioDuracaoSec ??
      msg?.duracao_sec ??
      msg?.duracao ??
      msg?.duration ??
      msg?.media_duration ??
      msg?.mediaDuration ??
      null;
    const d = Number(rawDur);
    return Number.isFinite(d) && d > 0 ? `(áudio · ${formatMmSs(d)})` : "(áudio)";
  }
  if (tipo === "imagem") return "(foto)";
  if (tipo === "video") return "(vídeo)";
  if (tipo === "sticker") return "(figurinha)";
  if (tipo === "arquivo") return msg?.nome_arquivo ? String(msg.nome_arquivo) : "(arquivo)";
  return "(mídia)";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatMmSs(totalSeconds) {
  const s = Number(totalSeconds);
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const sec = Math.floor(s);
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function seedFromAny(v) {
  const s = String(v ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeWaveBars(count, seed) {
  let x = seed || 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const r = (x >>> 0) / 4294967295;
    // barras com variação "bonita"
    const v = 0.25 + 0.75 * Math.pow(r, 0.55);
    out.push(v);
  }
  return out;
}

const __WA_EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😅","😎","🙂","🤝","🙏","👏","🔥","✅","❌","⚠️","⭐","🎉","💡","📎","📌","📞","🎧",
  "👍","👎","👌","🤌","✌️","🤞","🫶","💪","🧠","🕒","📍","📅","💬","📷","🎥","🎙️","🎵","🗂️","🧾",
  "❤️","💛","💚","💙","🤍","🖤","💔",
];

let __waCurrentAudio = null;

function AudioWavePlayer({ src, msgKey, avatarUrl, avatarLabel, onDuration }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const rafRef = useRef(null);
  const rafLastRef = useRef(0);
  const bars = useMemo(() => makeWaveBars(34, seedFromAny(msgKey)), [msgKey]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onLoaded = () => {
      const d = Number(el.duration);
      if (Number.isFinite(d) && d > 0) {
        setDur(d);
        try { onDuration?.(d); } catch {}
      }
    };
    const onTime = () => setCur(Number(el.currentTime || 0));
    const onEnded = () => {
      setPlaying(false);
      setCur(0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [src]);

  // Progresso mais fluido (rAF com throttle leve) enquanto toca
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !playing) return;

    const tick = (t) => {
      if (!audioRef.current) return;
      const last = rafLastRef.current || 0;
      if (!last || t - last >= 66) {
        rafLastRef.current = t;
        setCur(Number(audioRef.current.currentTime || 0));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rafLastRef.current = 0;
    };
  }, [playing]);

  const toggle = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    try {
      if (__waCurrentAudio && __waCurrentAudio !== el) {
        try { __waCurrentAudio.pause(); } catch {}
      }
      __waCurrentAudio = el;
      if (el.paused) {
        await el.play();
      } else {
        el.pause();
      }
    } catch {
      // ignore
    }
  }, []);

  const seek = useCallback((e) => {
    const el = audioRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frac = rect.width > 0 ? clamp(x / rect.width, 0, 1) : 0;
    const target = (dur || el.duration || 0) * frac;
    if (Number.isFinite(target)) el.currentTime = target;
  }, [dur]);

  const frac = dur > 0 ? clamp(cur / dur, 0, 1) : 0;
  const playedBars = Math.round(frac * bars.length);
  const remaining = dur > 0 ? Math.max(0, dur - cur) : 0;
  const pLabel = `${Math.round(frac * 100)}%`;

  return (
    <div className={`wa-audioPlayer ${playing ? "isPlaying" : ""}`}>
      <button
        type="button"
        className={`wa-audioPlayBtn ${playing ? "isPlaying" : ""}`}
        onClick={toggle}
        aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
      >
        <span className="wa-audioPlayIcon wa-audioPlayIcon--play" aria-hidden="true">
          <IconPlay />
        </span>
        <span className="wa-audioPlayIcon wa-audioPlayIcon--pause" aria-hidden="true">
          <IconPause />
        </span>
      </button>
      <div className="wa-audioMid">
        <div
          className="wa-audioWave"
          role="slider"
          aria-label="Progresso do áudio"
          onClick={seek}
          style={{ "--p": pLabel }}
        >
          {bars.map((v, i) => (
            <div
              key={i}
              className={`wa-audioBar ${i < playedBars ? "isPlayed" : ""}`}
              style={{ height: `${Math.round(6 + v * 14)}px`, "--i": i }}
            />
          ))}
          <div className="wa-audioDot" style={{ left: `${Math.round(frac * 100)}%` }} aria-hidden="true" />
        </div>
        <div className="wa-audioSub">
          <span className="wa-audioTime wa-audioTime--cur" title={formatMmSs(cur)}>{formatMmSs(cur)}</span>
          <span className="wa-audioTime wa-audioTime--dur" title={formatMmSs(dur || 0)}>{formatMmSs(dur || 0)}</span>
          {playing ? <span className="wa-audioRemain" title={`Restante ${formatMmSs(remaining)}`}>-{formatMmSs(remaining)}</span> : null}
        </div>
      </div>
      {avatarUrl ? (
        <span className="wa-audioAvatarWrap" aria-hidden="true">
          <img
            className="wa-audioAvatar"
            src={avatarUrl}
            alt={avatarLabel ? `Foto de ${avatarLabel}` : "Foto do contato"}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </span>
      ) : null}
      <audio ref={audioRef} src={src} preload="metadata" className="wa-audioElHidden" />
    </div>
  );
}

function getReplySenderLabel(replyMsg, peerName) {
  if (!replyMsg) return "Contato";
  const out = String(replyMsg?.direcao || "").toLowerCase() === "out";
  if (out) return "Você";
  const groupSender = safeString(replyMsg?.remetente_nome || replyMsg?.remetente_telefone);
  if (groupSender) return groupSender;
  return safeString(peerName) || "Contato";
}

function nameColor(seed) {
  const s = String(seed || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 42%)`;
}

function Bubble({
  msg,
  showRemetente,
  peerAvatarUrl,
  peerName,
  selectMode,
  selected,
  onToggleSelected,
  onInfo,
  onReply,
  onCopy,
  onForward,
  onTogglePin,
  onToggleStar,
  onStartSelect,
  onDeleteForMe,
  onDeleteForEveryone,
  isPinned,
  isStarred,
  currentUserId,
  onJumpToReply,
  onOpenMedia,
  localReaction,
  onReact,
  onRemoveReaction,
  reactionBusy,
}) {
  const out = msg?.direcao === "out";
  const canDeleteForEveryone = useMemo(() => {
    if (!out) return false;
    if (currentUserId == null) return false;
    if (msg?.autor_usuario_id == null) return false;
    return String(msg.autor_usuario_id) === String(currentUserId);
  }, [out, currentUserId, msg?.autor_usuario_id]);
  const isImg = msg?.tipo === "imagem";
  const isSticker = msg?.tipo === "sticker";
  const isFile = msg?.tipo === "arquivo";
  const isAudio = msg?.tipo === "audio";
  const [audioDur, setAudioDur] = useState(0);
  const audioDurLabel = useMemo(() => (audioDur > 0 ? formatMmSs(audioDur) : null), [audioDur]);
  const isVideo = msg?.tipo === "video";
  const texto = safeString(msg?.texto);
  const hasText = !!texto;
  const mediaUrl = getMediaUrl(msg?.url);
  const remetente = showRemetente && !out && (msg?.remetente_nome || msg?.remetente_telefone);
  const isPlaceholderCaption =
    !texto ||
    texto === "(mídia)" ||
    texto === "(mensagem vazia)" ||
    texto === "(imagem)" ||
    texto === "(áudio)" ||
    texto === "(vídeo)" ||
    texto === "(figurinha)" ||
    texto === "(arquivo)";
  const showCaption = (isImg || isVideo || isSticker) && hasText && !isPlaceholderCaption;
  const showAudioText = isAudio && hasText && !isPlaceholderCaption;
  const inlineMeta = hasText && !isImg && !isVideo && !isSticker && !isAudio && !isFile;
  const replyMeta = msg?.reply_meta || null;
  const hasReply = !!(replyMeta && (replyMeta.name || replyMeta.snippet));

  // pedido do usuário: setinha no hover para mensagens do cliente
  const showMenuButton = !selectMode;
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef(null);
  const menuElRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const isCall = msg?.tipo === "call";

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      const a = anchorRef.current;
      const m = menuElRef.current;
      if (a && a.contains(e.target)) return;
      if (m && m.contains(e.target)) return;
      setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const computeMenuPosition = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    const rect = a.getBoundingClientRect();
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;

    const desiredW = 220;
    const w = Math.max(180, Math.min(desiredW, vw - 16));

    let left = rect.right - w;
    left = clamp(left, 8, Math.max(8, vw - w - 8));

    // posição preferida: abaixo do botão
    let top = rect.bottom + 6;
    const approxH = menuElRef.current?.offsetHeight || 320;
    let placed = "down";

    if (top + approxH > vh - 8) {
      // tenta acima do botão
      top = rect.top - approxH - 6;
      placed = "up";
    }
    top = clamp(top, 8, Math.max(8, vh - 120));

    const maxHeight = placed === "down" ? Math.max(160, vh - top - 8) : Math.max(160, rect.top - 8);

    setMenuStyle({
      position: "fixed",
      top,
      left,
      width: w,
      maxHeight,
      overflowY: "auto",
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const tick = () => computeMenuPosition();
    tick();
    // recalcula após render/medida real
    const raf = requestAnimationFrame(tick);

    const onReflow = () => computeMenuPosition();
    window.addEventListener("resize", onReflow);
    // captura scroll dentro do container de mensagens também
    document.addEventListener("scroll", onReflow, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReflow);
      document.removeEventListener("scroll", onReflow, true);
    };
  }, [menuOpen, computeMenuPosition]);

  const handleToggleSelect = useCallback(
    (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      onToggleSelected?.(msg);
    },
    [onToggleSelected, msg]
  );

  const doCopy = useCallback(async () => {
    const text =
      safeString(msg?.texto) ||
      (mediaUrl ? `${msg?.nome_arquivo ? `${msg.nome_arquivo}\n` : ""}${mediaUrl}` : "");
    const ok = await copyTextToClipboard(text);
    onCopy?.(ok);
  }, [msg, mediaUrl, onCopy]);

  const runAction = useCallback(
    async (action) => {
      setMenuOpen(false);
      if (action === "info") onInfo?.(msg);
      if (action === "reply") onReply?.(msg);
      if (action === "copy") await doCopy();
      if (action === "forward") onForward?.(msg);
      if (action === "pin") onTogglePin?.(msg);
      if (action === "star") onToggleStar?.(msg);
      if (action === "select") onStartSelect?.(msg);
      if (action === "deleteForMe") onDeleteForMe?.(msg);
      if (action === "deleteForEveryone") onDeleteForEveryone?.(msg);
    },
    [msg, onInfo, onReply, doCopy, onForward, onTogglePin, onToggleStar, onStartSelect, onDeleteForMe, onDeleteForEveryone]
  );

  return (
    <div className={`wa-row ${out ? "wa-row-out" : "wa-row-in"}`} data-msg-id={msg?.id}>
      {selectMode ? (
        <button
          type="button"
          className={`wa-selectChk ${selected ? "isOn" : ""}`}
          onClick={handleToggleSelect}
          title={selected ? "Desmarcar" : "Selecionar"}
          aria-label={selected ? "Desmarcar mensagem" : "Selecionar mensagem"}
        >
          {selected ? "✓" : ""}
        </button>
      ) : null}

      <div
        className={[
          "wa-bubble",
          out ? "wa-bubble-out" : "wa-bubble-in",
          inlineMeta ? "hasInlineMeta" : "",
          (isImg || isSticker) ? "wa-bubble-media" : "",
          isSticker ? "wa-bubble-sticker sticker-message" : "",
          isImg && !isSticker ? "image-message" : "",
          isFile ? "wa-bubble-fileWrap" : "",
          isAudio ? "wa-bubble-audio audio-message" : "",
          isVideo ? "wa-bubble-video" : "",
          selected ? "isSelected" : "",
        ].join(" ")}
        onClick={selectMode ? handleToggleSelect : undefined}
        role="group"
        aria-label="Mensagem"
      >
        <div className="wa-bubble-body">
          {/* Citação (reply) — sempre no topo, antes de qualquer conteúdo */}
          {hasReply && (
            <div
              className={`wa-replyCtx ${out ? "isOut" : "isIn"}`}
              aria-label="Mensagem citada"
              role="button"
              tabIndex={0}
              title="Ver mensagem respondida"
              onClick={(e) => {
                e?.stopPropagation?.();
                const rid = replyMeta?.replyToId;
                if (rid && onJumpToReply) onJumpToReply(rid);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  const rid = replyMeta?.replyToId;
                  if (rid && onJumpToReply) onJumpToReply(rid);
                }
              }}
            >
              <div className="wa-replyCtx-bar" aria-hidden="true" />
              <div className="wa-replyCtx-content">
                <div className="wa-replyCtx-name">{replyMeta.name}</div>
                <div className="wa-replyCtx-snippet">{replyMeta.snippet}</div>
              </div>
            </div>
          )}
          {remetente ? (
            <div className="wa-bubble-remetente">
              <span
                className="wa-bubble-remetente-nome"
                style={{ color: nameColor(msg?.remetente_telefone || remetente) }}
              >
                {remetente}:
              </span>
              {isImg || isSticker ? (
                <div className="wa-bubble-mediaStack">
                  <button
                    type="button"
                    className="wa-bubble-imgLink"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMedia?.(mediaUrl, isSticker ? "figurinha" : "imagem");
                    }}
                  >
                    <img src={mediaUrl} alt={isSticker ? "figurinha" : "imagem"} className="wa-bubble-img" />
                  </button>
                  {showCaption ? <div className="wa-bubble-caption">{texto}</div> : null}
                </div>
              ) : isVideo ? (
                <div className="wa-bubble-mediaStack">
                  <a href={mediaUrl} target="_blank" rel="noreferrer" className="wa-bubble-videoLink">
                    <video src={mediaUrl} controls className="wa-bubble-videoEl" />
                  </a>
                  {showCaption ? <div className="wa-bubble-caption">{texto}</div> : null}
                </div>
              ) : isFile ? (
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="wa-bubble-file">
                  <span className="wa-bubble-fileIcon">📎</span>
                  <span className="wa-bubble-fileName">{msg?.nome_arquivo || "Arquivo"}</span>
                </a>
              ) : hasText ? (
                inlineMeta ? (
                  <span className="wa-bubble-text wa-bubble-textInline">
                    {texto}
                    <span className="wa-inlineMeta" aria-label="Horário e status">
                      <span className="wa-inlineTime">{formatHora(msg?.criado_em)}</span>
                      <MessageTicks msg={msg} />
                    </span>
                  </span>
                ) : (
                  <span className="wa-bubble-text">{texto}</span>
                )
              ) : (
                <span className="wa-bubble-text wa-muted">(mídia)</span>
              )}
            </div>
          ) : isImg || isSticker ? (
            <div className="wa-bubble-mediaStack">
              <button
                type="button"
                className="wa-bubble-imgLink"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenMedia?.(mediaUrl, isSticker ? "figurinha" : "imagem");
                }}
              >
                <img src={mediaUrl} alt={isSticker ? "figurinha" : "imagem"} className="wa-bubble-img" />
              </button>
              {showCaption ? <div className="wa-bubble-caption">{texto}</div> : null}
            </div>
          ) : isVideo && mediaUrl ? (
            <div className="wa-bubble-mediaStack">
              <a href={mediaUrl} target="_blank" rel="noreferrer" className="wa-bubble-videoLink">
                <video src={mediaUrl} controls className="wa-bubble-videoEl" />
              </a>
              {showCaption ? <div className="wa-bubble-caption">{texto}</div> : null}
            </div>
          ) : isAudio && mediaUrl ? (
            <div className="wa-bubble-audioStack">
              <div className="wa-bubble-audioWrap">
                <AudioWavePlayer
                  src={mediaUrl}
                  msgKey={msg?.whatsapp_id || msg?.id || mediaUrl}
                  avatarUrl={!out ? peerAvatarUrl : null}
                  avatarLabel={!out ? peerName : null}
                  onDuration={(d) => {
                    setAudioDur(d);
                    if (msg?.id) {
                      try {
                        useConversaStore.getState().patchMensagem(msg.id, { audio_duracao_sec: d });
                      } catch {}
                    }
                  }}
                />
              </div>
              {showAudioText ? <div className="wa-bubble-audioCaption">{texto}</div> : null}
            </div>
          ) : isFile ? (
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="wa-bubble-file">
              <span className="wa-bubble-fileIcon">📎</span>
              <span className="wa-bubble-fileName">{msg?.nome_arquivo || "Arquivo"}</span>
              <span className="wa-bubble-fileHint">Abrir</span>
            </a>
          ) : isCall ? (
            <div className="wa-callBubble">
              <div className="wa-callIcon" aria-hidden="true">📞</div>
              <div className="wa-callText">
                {texto || "Ligação via WhatsApp"}
              </div>
            </div>
          ) : hasText ? (
            inlineMeta ? (
              <span className="wa-bubble-text wa-bubble-textInline">
                {texto}
                <span className="wa-inlineMeta" aria-label="Horário e status">
                  <span className="wa-inlineTime">{formatHora(msg?.criado_em)}</span>
                  <MessageTicks msg={msg} />
                </span>
              </span>
            ) : (
              <span className="wa-bubble-text">{texto}</span>
            )
          ) : (
            <span className="wa-bubble-text wa-muted">(mensagem vazia)</span>
          )}
        </div>
        <div className="wa-bubble-meta">
          <div className="wa-bubble-metaLeft">
            {!inlineMeta && !isAudio ? (
              <>
                <span className="wa-bubble-time">{formatHora(msg?.criado_em)}</span>
                <MessageTicks msg={msg} />
              </>
            ) : null}
            {isPinned ? <span className="wa-bubble-badge" title="Fixada">📌</span> : null}
            {isStarred ? <span className="wa-bubble-badge" title="Favorita">★</span> : null}
          </div>
          <div className="wa-bubble-metaRight">
            {!isCall ? (
              <button
                type="button"
                className={`wa-reactionBtn ${reactionOpen ? "isOpen" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setReactionOpen((v) => !v);
                }}
                title="Reagir"
                aria-label="Reagir à mensagem"
                disabled={reactionBusy}
              >
                🙂
              </button>
            ) : null}
            {showMenuButton ? (
              <button
                ref={anchorRef}
                type="button"
                className={`wa-msgMenuBtn ${menuOpen ? "isOpen" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                title="Mais opções"
                aria-label="Abrir opções da mensagem"
              >
                ▾
              </button>
            ) : null}
          </div>
        </div>

        {reactionOpen && !isCall ? (
          <div
            className="wa-reactionPicker"
            onClick={(e) => e.stopPropagation()}
          >
            {["❤️", "👍", "😂", "😮", "😢", "👎"].map((emo) => (
              <button
                key={emo}
                type="button"
                className="wa-reactionPicker-btn"
                disabled={reactionBusy}
                onClick={() => {
                  onReact?.(msg, emo);
                  setReactionOpen(false);
                }}
              >
                {emo}
              </button>
            ))}
            {localReaction ? (
              <button
                type="button"
                className="wa-reactionPicker-remove"
                disabled={reactionBusy}
                onClick={() => {
                  onRemoveReaction?.(msg);
                  setReactionOpen(false);
                }}
              >
                Remover reação
              </button>
            ) : null}
          </div>
        ) : null}

        {localReaction ? (
          <div className="wa-bubble-reaction" aria-label={`Sua reação: ${localReaction}`}>
            {localReaction}
          </div>
        ) : null}
      </div>

      {menuOpen
        ? createPortal(
            <div
              ref={menuElRef}
              className="wa-msgMenu"
              style={menuStyle || { position: "fixed", top: -9999, left: -9999 }}
              role="menu"
              aria-label="Opções da mensagem"
            >
              {out ? (
                <>
                  <button type="button" className="wa-msgMenuItem" onClick={() => runAction("info")} role="menuitem">
                    Dados da mensagem
                  </button>
                  <div className="wa-msgMenuSep" aria-hidden="true" />
                </>
              ) : null}
              <button type="button" className="wa-msgMenuItem" onClick={() => runAction("reply")} role="menuitem">
                Responder
              </button>
              <button type="button" className="wa-msgMenuItem" onClick={() => runAction("copy")} role="menuitem">
                Copiar
              </button>
              <button type="button" className="wa-msgMenuItem" onClick={() => runAction("forward")} role="menuitem">
                Encaminhar
              </button>
              <button type="button" className="wa-msgMenuItem" onClick={() => runAction("pin")} role="menuitem">
                {isPinned ? "Desafixar" : "Fixar"}
              </button>
              <button type="button" className="wa-msgMenuItem" onClick={() => runAction("star")} role="menuitem">
                {isStarred ? "Desfavoritar" : "Favoritar"}
              </button>
              <button type="button" className="wa-msgMenuItem" onClick={() => runAction("select")} role="menuitem">
                Selecionar
              </button>
              <div className="wa-msgMenuSep" aria-hidden="true" />
              <button
                type="button"
                className="wa-msgMenuItem"
                onClick={() => runAction("deleteForMe")}
                role="menuitem"
              >
                Apagar para mim
              </button>
              {canDeleteForEveryone ? (
                <button
                  type="button"
                  className="wa-msgMenuItem wa-msgMenuItemDanger"
                  onClick={() => runAction("deleteForEveryone")}
                  role="menuitem"
                >
                  Apagar para todos
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/* =========================================================
   Hooks
========================================================= */

function useStableTimeout() {
  const ref = useRef(null);
  const clear = useCallback(() => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);
  const set = useCallback(
    (fn, ms) => {
      clear();
      ref.current = setTimeout(fn, ms);
    },
    [clear]
  );

  useEffect(() => clear, [clear]);
  return { set, clear };
}

function useAutoScroll({ conversaId, lastMsgId, bottomRef }) {
  const prevConversaIdRef = useRef(null);
  const prevLastIdRef = useRef(null);

  useEffect(() => {
    const conversaIdAtual = conversaId ? String(conversaId) : null;

    // primeira conversa carregada
    if (!prevConversaIdRef.current && conversaIdAtual) {
      prevConversaIdRef.current = conversaIdAtual;
      prevLastIdRef.current = lastMsgId;
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }));
      return;
    }

    // troca de conversa
    if (conversaIdAtual && prevConversaIdRef.current !== conversaIdAtual) {
      prevConversaIdRef.current = conversaIdAtual;
      prevLastIdRef.current = lastMsgId;
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }));
      return;
    }

    // novas mensagens
    if (lastMsgId && lastMsgId !== prevLastIdRef.current) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }

    prevLastIdRef.current = lastMsgId;
  }, [conversaId, lastMsgId, bottomRef]);
}

function useGlobalHotkeys({ onToggleTimeline, onFocusInput, onEscape, disabled }) {
  useEffect(() => {
    if (disabled) return;

    function onKeyDown(e) {
      const k = String(e.key || "").toLowerCase();

      if ((e.ctrlKey || e.metaKey) && k === "k") {
        e.preventDefault();
        onFocusInput?.();
      }

      if ((e.ctrlKey || e.metaKey) && k === "h") {
        e.preventDefault();
        onToggleTimeline?.();
      }

      if (k === "escape") {
        e.preventDefault();
        onEscape?.();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggleTimeline, onFocusInput, onEscape, disabled]);
}

/* =========================================================
   Main
========================================================= */

export default function ConversaView() {
  const {
    conversa,
    mensagens,
    loading,
    loadError,
    refresh,
    carregarConversa,
    anexarMensagem,
    removerMensagem,
    tags,
    atendimentos,
    atendimentosLoading,
    carregarAtendimentos,
    setSelectedId,
    selectedId,
    typing,
    clearTyping,
  } = useConversaStore();

  const user = useAuthStore((s) => s.user);
  const myUserId = user?.id != null ? Number(user.id) : null;
  const podeGerenciarSetores = canGerenciarSetores(user);
  const podeGerenciarTags = canTag(user);

  const [texto, setTexto] = useState("");
  const [showTimeline, setShowTimeline] = useState(false);
  const [sending, setSending] = useState(false);

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
  const emojiPanelRef = useRef(null);
  const emojiSearchRef = useRef(null);

  const [toast, setToast] = useState(null);
  const toastT = useStableTimeout();

  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreview, setPendingPreview] = useState(null);
  const [mediaViewer, setMediaViewer] = useState(null); // { url, alt }
  const [localReactions, setLocalReactions] = useState({});
  const [reactionLoading, setReactionLoading] = useState({});

  const [shareContactOpen, setShareContactOpen] = useState(false);
  const [shareContactQuery, setShareContactQuery] = useState("");
  const [shareContactList, setShareContactList] = useState([]);
  const [shareContactLoading, setShareContactLoading] = useState(false);
  const [shareContactSending, setShareContactSending] = useState(false);

  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callDuration, setCallDuration] = useState(5);
  const [callSending, setCallSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingCanceledRef = useRef(false);
  const recordingTimerRef = useRef(null);

  const [allTags, setAllTags] = useState([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagMutatingId, setTagMutatingId] = useState(null);
  const [showClienteSide, setShowClienteSide] = useState(false);
  const [showTransferirSetor, setShowTransferirSetor] = useState(false);
  const [departamentos, setDepartamentos] = useState([]);
  const [transferirSetorLoading, setTransferirSetorLoading] = useState(false);
  const [showRespostasSalvas, setShowRespostasSalvas] = useState(false);
  const [respostasSalvas, setRespostasSalvas] = useState([]);
  const [respostasSalvasLoading, setRespostasSalvasLoading] = useState(false);

  const chats = useChatStore((s) => s.chats);

  // ações estilo WhatsApp: responder, encaminhar, fixar, favoritar, selecionar, apagar
  const [replyTo, setReplyTo] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState({});
  const [pinnedIds, setPinnedIds] = useState([]);
  const [starredIds, setStarredIds] = useState([]);

  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardSending, setForwardSending] = useState(false);
  const [forwardClientes, setForwardClientes] = useState([]);
  const [forwardClientesLoading, setForwardClientesLoading] = useState(false);

  const [msgInfoOpen, setMsgInfoOpen] = useState(false);
  const [msgInfo, setMsgInfo] = useState(null);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const conversaId = conversa?.id || null;
  const typingInfo = conversaId ? typing[String(conversaId)] : null;
  const isSomeoneTyping = Boolean(
    typingInfo &&
    typingInfo.usuario_id !== myUserId &&
    (typingInfo.expiresAt == null || typingInfo.expiresAt > Date.now())
  );

  const isGroup = useMemo(() => isGroupConversation(conversa), [conversa]);

  // Nunca exibir LID (lid:xxx) como nome ou número — identificador interno do WhatsApp
  const isLidValue = (v) => v != null && String(v).trim().toLowerCase().startsWith("lid:");

  const nome = useMemo(() => {
    if (isGroup) {
      const g = conversa?.nome_grupo || conversa?.contato_nome || "Grupo";
      return isLidValue(g) ? "Grupo" : g;
    }
    const n =
      conversa?.contato_nome ?? conversa?.cliente_nome ?? conversa?.cliente?.nome
      ?? (conversa?.chatName && String(conversa.chatName).trim() !== "name" ? conversa.chatName : null)
      ?? (conversa?.senderName && String(conversa.senderName).trim() !== "name" ? conversa.senderName : null)
      ?? "";
    if (n && String(n).trim() && !isLidValue(n)) return String(n).trim();
    const tel = conversa?.cliente_telefone ?? conversa?.telefone ?? "";
    if (tel && !isLidValue(tel) && String(tel).replace(/\D/g, "").length >= 10) return `+${String(tel).replace(/\D/g, "")}`;
    return "Contato";
  }, [conversa, isGroup]);

  const telefone = useMemo(() => {
    if (isGroup) return conversa?.telefone || "";
    const t = conversa?.cliente_telefone ?? conversa?.cliente?.telefone ?? conversa?.telefone ?? "";
    return isLidValue(t) ? "" : (t || "");
  }, [conversa, isGroup]);

  const rawAvatarUrl = isGroup
    ? (conversa?.foto_grupo ?? null)
    : (conversa?.foto_perfil ?? conversa?.senderPhoto ?? conversa?.photo ?? null);
  const avatarUrl = rawAvatarUrl && String(rawAvatarUrl).trim().startsWith("http") ? String(rawAvatarUrl).trim() : null;
  const avatar = useMemo(() => (isGroup ? "👥" : initials(nome)), [isGroup, nome]);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const showAvatarImg = Boolean(avatarUrl && !avatarImgError);

  const badge = useMemo(
    () => statusBadge(conversa?.status_atendimento),
    [conversa?.status_atendimento]
  );

  useEffect(() => {
    setAvatarImgError(false);
  }, [avatarUrl]);

  const selectedTagIds = useMemo(
    () => (Array.isArray(tags) ? tags.map((t) => t.id) : []),
    [tags]
  );

  const lastMsgId = useMemo(
    () => (mensagens?.length ? mensagens[mensagens.length - 1]?.id : null),
    [mensagens]
  );

  const pinnedSet = useMemo(() => new Set((pinnedIds || []).map(String)), [pinnedIds]);
  const starredSet = useMemo(() => new Set((starredIds || []).map(String)), [starredIds]);
  const selectedSet = useMemo(() => new Set(Object.keys(selectedMsgIds || {}).filter((k) => selectedMsgIds[k])), [selectedMsgIds]);

  const pinnedTop = useMemo(() => {
    if (!mensagens?.length || !(pinnedIds || []).length) return null;
    const lastPinnedId = String((pinnedIds || [])[pinnedIds.length - 1]);
    return (mensagens || []).find((m) => String(m.id) === lastPinnedId) || null;
  }, [mensagens, pinnedIds]);

  const forwardCandidates = useMemo(() => {
    const list = Array.isArray(chats) ? chats : [];
    const q = safeString(forwardQuery).toLowerCase();
    const byName = (c) => {
      const n = safeString(c?.contato_nome || c?.nome || c?.cliente?.nome || c?.telefone);
      if (!q) return true;
      return n.toLowerCase().includes(q) || safeString(c?.telefone).includes(q);
    };
    return list
      .filter((c) => c?.id != null && String(c.id) !== String(conversaId))
      .filter(byName)
      .slice(0, 80);
  }, [chats, forwardQuery, conversaId]);

  // Encaminhar: garante lista de conversas + busca de clientes (contatos)
  useEffect(() => {
    if (!forwardOpen) {
      setForwardClientes([]);
      setForwardClientesLoading(false);
      return;
    }

    // 1) garante conversas carregadas para listar "Contatos"
    if (!Array.isArray(chats) || chats.length === 0) {
      (async () => {
        try {
          const list = await fetchChats({ incluir_todos_clientes: true });
          useChatStore.getState().setChats(Array.isArray(list) ? list : []);
        } catch (_) {
          // ignora (segue só com busca de clientes)
        }
      })();
    }

    // 2) busca clientes no banco por palavra (opcional)
    const q = safeString(forwardQuery).trim();
    if (q.length < 2) {
      setForwardClientes([]);
      setForwardClientesLoading(false);
      return;
    }

    setForwardClientesLoading(true);
    const t = setTimeout(async () => {
      try {
        const list = await cfg.getClientes({ palavra: q, limit: 60 });
        const arr = Array.isArray(list) ? list : [];
        // evita sugerir o cliente desta conversa atual
        const curClienteId = conversa?.cliente_id != null ? String(conversa.cliente_id) : null;
        setForwardClientes(curClienteId ? arr.filter((c) => String(c.id) !== curClienteId) : arr);
      } catch (_) {
        setForwardClientes([]);
      } finally {
        setForwardClientesLoading(false);
      }
    }, 260);

    return () => clearTimeout(t);
  }, [forwardOpen, forwardQuery, chats, conversaId, conversa?.cliente_id]);

  useEffect(() => {
    // reset por conversa
    setReplyTo(null);
    setSelectMode(false);
    setSelectedMsgIds({});
    setForwardOpen(false);
    setForwardMsg(null);
    setForwardQuery("");

    if (!conversaId) {
      setPinnedIds([]);
      setStarredIds([]);
      return;
    }

    try {
      const pins = JSON.parse(localStorage.getItem(`zap:pins:${conversaId}`) || "[]");
      const stars = JSON.parse(localStorage.getItem(`zap:stars:${conversaId}`) || "[]");
      setPinnedIds(Array.isArray(pins) ? pins : []);
      setStarredIds(Array.isArray(stars) ? stars : []);
    } catch {
      setPinnedIds([]);
      setStarredIds([]);
    }
  }, [conversaId]);

  const tempoSemResponder = useMemo(() => {
    const list = Array.isArray(mensagens) ? mensagens : [];
    const ultimaIn = [...list].reverse().find((m) => m?.direcao === "in");
    if (!ultimaIn?.criado_em) return null;
    const diffMs = Date.now() - new Date(ultimaIn.criado_em).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 1) return "Agora";
    if (diffMin < 60) return `${diffMin} min`;
    if (diffH < 24) return `${diffH}h`;
    return `${diffD} dia(s)`;
  }, [mensagens]);

  useAutoScroll({ conversaId, lastMsgId, bottomRef });

  const showToast = useCallback(
    (next) => {
      setToast(next);
      toastT.set(() => setToast(null), 3500);
    },
    [toastT]
  );

  const clearPending = useCallback(() => {
    if (pendingPreview) {
      try {
        URL.revokeObjectURL(pendingPreview);
      } catch {}
    }
    setPendingFile(null);
    setPendingPreview(null);
  }, [pendingPreview]);

  const openMediaViewer = useCallback((url, alt) => {
    if (!url) return;
    setMediaViewer({ url, alt: alt || "Mídia" });
  }, []);

  const closeMediaViewer = useCallback(() => {
    setMediaViewer(null);
  }, []);

  useEffect(() => {
    if (!mediaViewer) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMediaViewer();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mediaViewer, closeMediaViewer]);

  useEffect(() => {
    if (!shareContactOpen) {
      setShareContactList([]);
      setShareContactQuery("");
      setShareContactLoading(false);
      return;
    }
    const q = safeString(shareContactQuery).trim().toLowerCase();
    setShareContactLoading(true);
    const t = setTimeout(async () => {
      try {
        const list = await cfg.getClientes({ palavra: q || undefined, limit: 60 });
        const arr = Array.isArray(list) ? list : [];
        setShareContactList(arr);
      } catch (e) {
        console.error("Erro ao buscar contatos:", e);
        setShareContactList([]);
      } finally {
        setShareContactLoading(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [shareContactOpen, shareContactQuery]);

  const openFilePicker = useCallback(() => {
    if (!conversaId) return;
    fileInputRef.current?.click();
  }, [conversaId]);

  const openCameraPicker = useCallback(() => {
    if (!conversaId) return;
    cameraInputRef.current?.click();
  }, [conversaId]);

  const insertEmoji = useCallback((emoji) => {
    const em = String(emoji || "");
    if (!em) return;
    const el = inputRef.current;
    if (!el) {
      setTexto((prev) => (prev ? prev + em : em));
      return;
    }

    const cur = String(texto || "");
    const start = typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : cur.length;
    const next = cur.slice(0, start) + em + cur.slice(end);
    setTexto(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + em.length;
        el.setSelectionRange?.(pos, pos);
      } catch {}
    });
  }, [texto]);

  // Fecha o painel de emoji ao clicar fora e foca busca ao abrir
  useEffect(() => {
    if (!emojiOpen) return;
    const onDoc = (e) => {
      const panel = emojiPanelRef.current;
      if (panel && panel.contains(e.target)) return;
      setEmojiOpen(false);
      setEmojiQuery("");
    };
    document.addEventListener("mousedown", onDoc);
    requestAnimationFrame(() => emojiSearchRef.current?.focus?.());
    return () => document.removeEventListener("mousedown", onDoc);
  }, [emojiOpen]);

  const handleDropFile = useCallback((file) => {
    if (!file) return;
    setPendingFile(file);

    if (isImageFile(file)) {
      const url = fileToPreviewURL(file);
      setPendingPreview(url);
    } else if (isAudioFile(file)) {
      setPendingPreview(null); // áudio: sem preview visual
    } else {
      setPendingPreview(null);
    }
  }, []);

  const handleSendReaction = useCallback(
    async (msg, reaction) => {
      if (!conversaId || !msg?.id || !reaction) return;
      const mid = String(msg.id);
      if (reactionLoading[mid]) return;
      setReactionLoading((prev) => ({ ...prev, [mid]: true }));
      setLocalReactions((prev) => ({ ...prev, [mid]: reaction }));
      try {
        await enviarReacao(conversaId, msg.id, reaction);
      } catch (err) {
        console.error("Erro ao enviar reação:", err);
        setLocalReactions((prev) => {
          const next = { ...prev };
          delete next[mid];
          return next;
        });
        showToast({
          type: "error",
          title: "Falha ao reagir",
          message: err?.response?.data?.error || "Não foi possível registrar a reação.",
        });
      } finally {
        setReactionLoading((prev) => {
          const next = { ...prev };
          delete next[mid];
          return next;
        });
      }
    },
    [conversaId, reactionLoading, showToast]
  );

  const handleRemoveReaction = useCallback(
    async (msg) => {
      if (!conversaId || !msg?.id) return;
      const mid = String(msg.id);
      if (reactionLoading[mid]) return;
      if (!localReactions[mid]) return;
      setReactionLoading((prev) => ({ ...prev, [mid]: true }));
      const prevReaction = localReactions[mid];
      setLocalReactions((prev) => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });
      try {
        await removerReacao(conversaId, msg.id);
      } catch (err) {
        console.error("Erro ao remover reação:", err);
        setLocalReactions((prev) => ({ ...prev, [mid]: prevReaction }));
        showToast({
          type: "error",
          title: "Falha ao remover reação",
          message: err?.response?.data?.error || "Não foi possível remover a reação.",
        });
      } finally {
        setReactionLoading((prev) => {
          const next = { ...prev };
          delete next[mid];
          return next;
        });
      }
    },
    [conversaId, localReactions, reactionLoading, showToast]
  );

  const handlePaste = useCallback(
    (e) => {
      if (!conversaId) return;
      const dt = e.clipboardData;
      if (!dt) return;

      const files = dt.files && dt.files.length > 0 ? Array.from(dt.files) : [];
      const items = dt.items && dt.items.length > 0 ? Array.from(dt.items) : [];

      let pickedFile = null;

      if (files.length > 0) {
        pickedFile = files.find((f) => f && isImageFile(f)) || files[0];
      } else if (items.length > 0) {
        const fileItem = items.find((it) => it.kind === "file" && it.type && it.type.startsWith("image/"));
        if (fileItem) pickedFile = fileItem.getAsFile();
      }

      if (pickedFile && isImageFile(pickedFile)) {
        e.preventDefault();
        handleDropFile(pickedFile);
      }
    },
    [conversaId, handleDropFile]
  );

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragOver) setDragOver(true);
    },
    [dragOver]
  );

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer?.files?.[0];
      if (file) handleDropFile(file);
    },
    [handleDropFile]
  );

  const handleEnviarArquivo = useCallback(
    async (file) => {
      if (!file || !conversaId) return;

      const formData = new FormData();
      formData.append("file", file);

      setSending(true);
      try {
        const { data } = await api.post(`/chats/${conversaId}/arquivo`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        clearPending();
        if (data?.id && Number(data?.conversa_id) === Number(conversaId)) {
          anexarMensagem(data);
        } else {
          await refresh({ silent: true });
        }
      } catch (err) {
        console.error("Erro ao enviar arquivo:", err);
        showToast({
          type: "error",
          title: "Falha ao enviar",
          message: "Não foi possível enviar o arquivo. Tente novamente.",
        });
      } finally {
        setSending(false);
      }
    },
    [conversaId, refresh, showToast, clearPending, anexarMensagem]
  );

  const handleFileInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        e.target.value = "";
        return;
      }
      handleDropFile(file);
      e.target.value = "";
    },
    [handleDropFile]
  );

  const handleCameraInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) {
        e.target.value = "";
        return;
      }
      handleDropFile(file);
      e.target.value = "";
    },
    [handleDropFile]
  );

  const handleConfirmSendFile = useCallback(async () => {
    if (!pendingFile) return;
    await handleEnviarArquivo(pendingFile);
  }, [pendingFile, handleEnviarArquivo]);

  const handleStartRecording = useCallback(async () => {
    if (!conversaId || sending || isRecording) return;
    recordingCanceledRef.current = false;
    setRecordingSeconds(0);
    try {
      if (!window.isSecureContext) {
        showToast({
          type: "error",
          title: "Microfone",
          message: "Para gravar áudio, acesse via HTTPS (ou localhost). Em HTTP o navegador bloqueia o microfone.",
        });
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast({
          type: "error",
          title: "Microfone",
          message: "Seu navegador não suporta gravação de áudio (getUserMedia indisponível).",
        });
        return;
      }

      // Se o navegador suportar, checa estado de permissão antes de pedir
      try {
        const perm = await navigator.permissions?.query?.({ name: "microphone" });
        if (perm?.state === "denied") {
          showToast({
            type: "error",
            title: "Microfone bloqueado",
            message: "O microfone está bloqueado para este site. Clique no cadeado do navegador e permita o microfone.",
          });
          return;
        }
      } catch {
        // ignore
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Escolhe o melhor mimeType disponível (melhora compatibilidade)
      const preferred = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const mimeType =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported
          ? preferred.find((t) => MediaRecorder.isTypeSupported(t))
          : null;

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordingCanceledRef.current || audioChunksRef.current.length === 0) return;
        const finalType = recorder.mimeType || mimeType || "audio/webm";
        const ext = finalType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: finalType });
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: finalType });
        await handleEnviarArquivo(file);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Erro ao iniciar gravação:", err);
      const name = String(err?.name || "");
      const msg =
        name === "NotAllowedError"
          ? "Permissão negada. Clique no cadeado do navegador e permita o microfone."
          : name === "NotFoundError"
            ? "Nenhum microfone foi encontrado no dispositivo."
            : "Não foi possível acessar o microfone. Verifique as permissões.";
      showToast({
        type: "error",
        title: "Microfone",
        message: msg,
      });
    }
  }, [conversaId, sending, isRecording, handleEnviarArquivo, showToast]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }, [isRecording]);

  const handleCancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      recordingCanceledRef.current = true;
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
      setIsRecording(false);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) return;
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  const toggleTimeline = useCallback(() => {
    setShowTimeline((v) => !v);
  }, []);

  const handleCloseTimeline = useCallback(() => setShowTimeline(false), []);

  const emitTypingStop = useCallback(() => {
    if (!conversaId) return;
    const socket = getSocket();
    if (socket?.connected) socket.emit("typing_stop", { conversa_id: conversaId });
  }, [conversaId]);

  const emitTypingStart = useCallback(() => {
    if (!conversaId) return;
    const socket = getSocket();
    if (socket?.connected) socket.emit("typing_start", { conversa_id: conversaId });
  }, [conversaId]);

  useEffect(() => {
    if (!conversaId) return;
    if (!safeString(texto)) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      emitTypingStop();
      return;
    }
    const t = typingTimeoutRef.current;
    if (t) clearTimeout(t);
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
      emitTypingStart();
    }, 400);
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [conversaId, texto, emitTypingStart, emitTypingStop]);

  useEffect(() => {
    return () => {
      if (conversaId) {
        const socket = getSocket();
        if (socket?.connected) socket.emit("typing_stop", { conversa_id: conversaId });
        clearTyping(conversaId);
      }
    };
  }, [conversaId, clearTyping]);

  const handleEnviar = useCallback(async () => {
    if (!conversaId) return;

    const t = safeString(texto);
    if (!t) return;
    emitTypingStop();
    const replyMeta =
      replyTo
        ? {
            name: getReplySenderLabel(replyTo, nome),
            snippet: snippetFromMsg(replyTo),
            ts: Date.now(),
            // Prioriza whatsapp_id para o backend enviar reply nativo ao WhatsApp via Z-API
            replyToId: replyTo?.whatsapp_id || replyTo?.id,
          }
        : null;

    setSending(true);
    try {
      const res = await enviarMensagem(conversaId, t, replyMeta || undefined);
      setTexto("");
      setReplyTo(null);
      if (res?.mensagem) {
        const msg = res.mensagem;
        const mesmaConversa = Number(msg.conversa_id) === Number(conversaId);
        if (mesmaConversa || !msg.conversa_id) {
          const patched = replyMeta ? { ...msg, conversa_id: Number(conversaId), reply_meta: replyMeta } : { ...msg, conversa_id: Number(conversaId) };
          anexarMensagem(patched);
          if (replyMeta && msg?.id) {
            saveReplyMeta(conversaId, msg.id, replyMeta);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      showToast({
        type: "error",
        title: "Falha ao enviar",
        message: "Não foi possível enviar a mensagem. Verifique sua conexão.",
      });
    } finally {
      setSending(false);
    }
  }, [conversaId, texto, replyTo, showToast, anexarMensagem, nome, emitTypingStop]);

  const onEscape = useCallback(() => {
    if (isRecording) handleCancelRecording();
    if (showTimeline) setShowTimeline(false);
    if (tagsOpen) setTagsOpen(false);
    if (emojiOpen) {
      setEmojiOpen(false);
      setEmojiQuery("");
    }
    if (pendingFile) clearPending();
    if (showClienteSide) setShowClienteSide(false);
    if (showRespostasSalvas) setShowRespostasSalvas(false);
    if (showTransferirSetor) setShowTransferirSetor(false);
    if (forwardOpen) {
      setForwardOpen(false);
      setForwardMsg(null);
      setForwardQuery("");
    }
    if (msgInfoOpen) {
      setMsgInfoOpen(false);
      setMsgInfo(null);
    }
    if (selectMode) {
      setSelectMode(false);
      setSelectedMsgIds({});
    }
    if (replyTo) setReplyTo(null);
  }, [
    isRecording,
    handleCancelRecording,
    showTimeline,
    tagsOpen,
    emojiOpen,
    pendingFile,
    clearPending,
    showClienteSide,
    showRespostasSalvas,
    showTransferirSetor,
    forwardOpen,
    msgInfoOpen,
    selectMode,
    replyTo,
  ]);

  useGlobalHotkeys({
    onToggleTimeline: () => setShowTimeline((v) => !v),
    onFocusInput: () => inputRef.current?.focus(),
    onEscape,
    disabled: loading,
  });

  const handleKeyDownInput = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleEnviar();
      }
    },
    [handleEnviar]
  );

  const persistPins = useCallback((next) => {
    if (!conversaId) return;
    try {
      localStorage.setItem(`zap:pins:${conversaId}`, JSON.stringify(next || []));
    } catch {}
  }, [conversaId]);

  const persistStars = useCallback((next) => {
    if (!conversaId) return;
    try {
      localStorage.setItem(`zap:stars:${conversaId}`, JSON.stringify(next || []));
    } catch {}
  }, [conversaId]);

  const togglePin = useCallback((msg) => {
    if (!msg?.id || !conversaId) return;
    setPinnedIds((cur) => {
      const id = String(msg.id);
      const has = (cur || []).map(String).includes(id);
      const next = has ? (cur || []).filter((x) => String(x) !== id) : [...(cur || []), id];
      persistPins(next);
      showToast({ type: "info", title: has ? "Desafixada" : "Fixada", message: snippetFromMsg(msg) });
      return next;
    });
  }, [conversaId, persistPins, showToast]);

  const toggleStar = useCallback((msg) => {
    if (!msg?.id || !conversaId) return;
    setStarredIds((cur) => {
      const id = String(msg.id);
      const has = (cur || []).map(String).includes(id);
      const next = has ? (cur || []).filter((x) => String(x) !== id) : [...(cur || []), id];
      persistStars(next);
      showToast({ type: "info", title: has ? "Removida dos favoritos" : "Favoritada", message: snippetFromMsg(msg) });
      return next;
    });
  }, [conversaId, persistStars, showToast]);

  const startSelect = useCallback((msg) => {
    if (!msg?.id) return;
    setSelectMode(true);
    setSelectedMsgIds((cur) => ({ ...(cur || {}), [String(msg.id)]: true }));
  }, []);

  const toggleSelected = useCallback((msg) => {
    if (!msg?.id) return;
    setSelectedMsgIds((cur) => {
      const key = String(msg.id);
      const next = { ...(cur || {}) };
      next[key] = !next[key];
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedMsgIds({});
  }, []);

  const handleReplyAction = useCallback((msg) => {
    setReplyTo(msg || null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleInfoAction = useCallback((msg) => {
    if (!msg) return;
    setMsgInfo(msg);
    setMsgInfoOpen(true);
  }, []);

  const handleCopyResult = useCallback((ok) => {
    showToast({
      type: ok ? "success" : "error",
      title: ok ? "Copiado" : "Falha ao copiar",
      message: ok ? "Mensagem copiada para a área de transferência." : "Não foi possível copiar. Tente novamente.",
    });
  }, [showToast]);

  function buildForwardText(m) {
    if (!m) return "";
    const t = safeString(m?.texto);
    if (t) return `[Encaminhado]\n${t}`;
    const url = getMediaUrl(m?.url);
    const nome = safeString(m?.nome_arquivo);
    if (url) return `[Encaminhado]\n${nome ? `${nome}\n` : ""}${url}`;
    return "[Encaminhado]\n(mídia)";
  }

  const handleForwardAction = useCallback((msg) => {
    setForwardMsg(msg || null);
    setForwardQuery("");
    setForwardOpen(true);
  }, []);

  const handleDeleteForMe = useCallback(
    async (msg) => {
      if (!conversaId || !msg?.id) return;
      try {
        await excluirMensagem(conversaId, msg.id, { scope: "me" });
        removerMensagem(msg.id);
        showToast({ type: "success", title: "Apagada para mim", message: "A mensagem foi removida da sua visualização." });
      } catch (e) {
        console.error("Erro ao apagar pra mim:", e);
        showToast({ type: "error", title: "Falha ao apagar", message: e.response?.data?.error || "Não foi possível apagar a mensagem." });
      }
    },
    [conversaId, showToast, removerMensagem]
  );

  const handleDeleteForEveryone = useCallback(
    async (msg) => {
      if (!conversaId || !msg?.id) return;
      // regra: "para todos" somente para mensagens enviadas por mim
      if (!myUserId || msg?.autor_usuario_id == null || String(msg.autor_usuario_id) !== String(myUserId)) {
        showToast({
          type: "info",
          title: "Somente suas mensagens",
          message: "Você só pode apagar para todos mensagens enviadas por você.",
        });
        return;
      }
      const ok = window.confirm("Apagar esta mensagem para todos? Ela será removida para você e para o contato.");
      if (!ok) return;
      try {
        await excluirMensagem(conversaId, msg.id);
        removerMensagem(msg.id);
        showToast({ type: "success", title: "Apagada para todos", message: "Mensagem removida da conversa." });
      } catch (e) {
        console.error("Erro ao excluir mensagem:", e);
        showToast({ type: "error", title: "Falha ao apagar", message: "Não foi possível apagar a mensagem." });
      }
    },
    [conversaId, myUserId, showToast, removerMensagem]
  );

  const handleDeleteSelected = useCallback(async () => {
    if (!conversaId) return;
    const ids = Array.from(selectedSet);
    if (ids.length === 0) return;
    const ok = window.confirm(`Apagar ${ids.length} mensagem(ns) selecionada(s) do sistema?`);
    if (!ok) return;
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await excluirMensagem(conversaId, id);
      }
      showToast({ type: "success", title: "Apagadas", message: `${ids.length} mensagem(ns) removida(s).` });
      exitSelectMode();
    } catch (e) {
      console.error("Erro ao excluir selecionadas:", e);
      showToast({ type: "error", title: "Falha ao apagar", message: "Algumas mensagens podem não ter sido apagadas." });
    }
  }, [conversaId, selectedSet, exitSelectMode, showToast]);

  const scrollToMsg = useCallback((msgId) => {
    if (!msgId) return;
    const el = document.querySelector(`[data-msg-id="${String(msgId)}"]`);
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, []);

  const jumpToReply = useCallback((replyToId) => {
    const rid = safeString(replyToId);
    if (!rid) return;

    const list = Array.isArray(mensagens) ? mensagens : [];
    const byWaId = list.find((m) => safeString(m?.whatsapp_id) && String(m.whatsapp_id) === rid);
    if (byWaId?.id) return scrollToMsg(byWaId.id);

    // fallback: se veio id numérico do banco
    if (/^\d{1,15}$/.test(rid)) return scrollToMsg(rid);

    showToast({
      type: "info",
      title: "Mensagem não encontrada",
      message: "A mensagem respondida não está carregada neste histórico.",
    });
  }, [mensagens, scrollToMsg, showToast]);

  const closeForward = useCallback(() => {
    setForwardOpen(false);
    setForwardMsg(null);
    setForwardQuery("");
    setForwardSending(false);
  }, []);

  const confirmForwardTo = useCallback(
    async (destConversaId) => {
      if (!destConversaId || !forwardMsg || forwardSending) return;
      setForwardSending(true);
      try {
        await enviarMensagem(destConversaId, buildForwardText(forwardMsg));
        showToast({ type: "success", title: "Encaminhada", message: "Mensagem encaminhada com sucesso." });
        closeForward();
      } catch (e) {
        console.error("Erro ao encaminhar:", e);
        showToast({ type: "error", title: "Falha ao encaminhar", message: "Não foi possível encaminhar a mensagem." });
      } finally {
        setForwardSending(false);
      }
    },
    [forwardMsg, forwardSending, showToast, closeForward]
  );

  const confirmForwardToCliente = useCallback(
    async (cliente) => {
      if (!cliente?.id || !forwardMsg || forwardSending) return;
      setForwardSending(true);
      try {
        const data = await abrirConversaCliente(cliente.id);
        const conv = data?.conversa || data || null;
        const destId = conv?.id || null;
        if (!destId) throw new Error("Não foi possível abrir a conversa do cliente.");
        // garante na lista (opcional)
        try { useChatStore.getState().addChat(conv); } catch {}
        await enviarMensagem(destId, buildForwardText(forwardMsg));
        showToast({ type: "success", title: "Encaminhada", message: "Mensagem encaminhada com sucesso." });
        closeForward();
      } catch (e) {
        console.error("Erro ao encaminhar (cliente):", e);
        showToast({ type: "error", title: "Falha ao encaminhar", message: e.response?.data?.error || e.message || "Não foi possível encaminhar." });
      } finally {
        setForwardSending(false);
      }
    },
    [forwardMsg, forwardSending, showToast, closeForward]
  );

  useEffect(() => {
    if (showTimeline && conversaId) {
      carregarAtendimentos(conversaId);
    }
  }, [showTimeline, conversaId, carregarAtendimentos]);

  useEffect(() => {
    clearPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId]);

  const mensagensComSeparadores = useMemo(() => {
    const raw = Array.isArray(mensagens) ? mensagens : [];
    const list = [];
    const reactionsByMsgId = {};

    // Primeiro, varre a lista original para detectar mensagens de reação (tipo='reaction')
    // e anexar o emoji na mensagem imediatamente anterior (aproximação estilo WhatsApp).
    for (let i = 0; i < raw.length; i++) {
      const msg = raw[i];
      if (!msg) continue;
      const tipo = safeString(msg.tipo).toLowerCase();
      if (tipo === "reaction") {
        const text = safeString(msg.texto || msg.message || msg.body);
        let emoji = "";
        const m = text.match(/rea[cç][aã]o:\s*(.+)$/i);
        if (m && m[1]) {
          emoji = m[1].trim();
        } else if (text) {
          // fallback: último caractere visível
          emoji = text.slice(-2).trim() || text.slice(-1);
        }
        const prevMsg = list[list.length - 1];
        if (prevMsg && prevMsg.id != null && emoji) {
          reactionsByMsgId[String(prevMsg.id)] = emoji;
        }
        // não adiciona a mensagem de reação na timeline
        continue;
      }
      list.push(msg);
    }

    const out = [];

    // Chave única por remetente: telefone quando existir, senão nome (evita "nome:" vs "tel:" darem chaves diferentes).
    const senderKey = (m) => {
      if (!m) return "";
      const tel = safeString(m?.remetente_telefone);
      const n = safeString(m?.remetente_nome);
      return tel || n || "";
    };

    for (let i = 0; i < list.length; i++) {
      const msg = list[i];
      if (!msg) continue;
      const prev = list[i - 1];

      const isNewDay = i === 0 || !sameDay(prev?.criado_em, msg?.criado_em);
      if (isNewDay) {
        const label = formatDia(msg?.criado_em) || "Data";
        out.push({ __type: "day", id: `day-${label}-${i}`, label });
      }

      const dir = String(msg?.direcao || "").toLowerCase();
      const prevDir = String(prev?.direcao || "").toLowerCase();
      const curSender = senderKey(msg);
      const prevSender = senderKey(prev);

      // WhatsApp-like (grupos): nome só na primeira msg do bloco; depois só as mensagens.
      const showRemetente =
        isGroup &&
        dir !== "out" &&
        Boolean(curSender) &&
        (isNewDay || !prev || prevDir === "out" || curSender !== prevSender);

      const reaction = reactionsByMsgId[String(msg.id)];

      out.push({ ...msg, __type: "msg", __showRemetente: showRemetente, __reaction: reaction });
    }

    return out;
  }, [mensagens, isGroup]);

  const headerSubtitle = useMemo(() => {
    const tel = normalizeTelefone(telefone);
    if (tel.length >= 10) return `+${tel}`;
    if (safeString(telefone)) return safeString(telefone);
    return "Online";
  }, [telefone]);

  const setorAtual = conversa?.setor ?? conversa?.departamentos?.nome ?? null;

  const carregarDepartamentos = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/departamentos");
      setDepartamentos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Erro ao carregar departamentos:", e);
      setDepartamentos([]);
    }
  }, []);

  const handleOpenTransferirSetor = useCallback(() => {
    setShowTransferirSetor(true);
    carregarDepartamentos();
  }, [carregarDepartamentos]);

  const carregarRespostasSalvas = useCallback(async () => {
    try {
      setRespostasSalvasLoading(true);
      const depId = conversa?.departamento_id || null;
      const list = await cfg.getRespostasSalvas(depId);
      setRespostasSalvas(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("Erro ao carregar respostas salvas:", e);
      setRespostasSalvas([]);
    } finally {
      setRespostasSalvasLoading(false);
    }
  }, [conversa?.departamento_id]);

  const handleOpenRespostasSalvas = useCallback(() => {
    setShowRespostasSalvas(true);
    carregarRespostasSalvas();
  }, [carregarRespostasSalvas]);

  const handleInserirResposta = useCallback(
    (texto) => {
      if (!texto) return;
      setTexto((prev) => (prev ? prev + "\n" + texto : texto));
      setShowRespostasSalvas(false);
      inputRef.current?.focus();
    },
    []
  );

  const handleTransferirSetor = useCallback(
    async (departamentoId) => {
      if (!conversaId || !departamentoId || transferirSetorLoading) return;
      setTransferirSetorLoading(true);
      try {
        await api.put(`/chats/${conversaId}/departamento`, {
          departamento_id: Number(departamentoId),
        });
        await refresh({ silent: true });
        setShowTransferirSetor(false);
      } catch (e) {
        console.error("Erro ao transferir setor:", e);
        showToast({
          type: "error",
          title: "Falha ao transferir setor",
          message: e?.response?.data?.error || "Tente novamente.",
        });
      } finally {
        setTransferirSetorLoading(false);
      }
    },
    [conversaId, refresh, showToast, transferirSetorLoading]
  );

  const carregarTags = useCallback(
    async (opts = {}) => {
      const showError = opts.showErrorToUser !== false;
      try {
        setTagsLoading(true);
        const data = await listarTags();
        setAllTags(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao listar tags:", err);
        if (showError) {
          showToast({
            type: "error",
            title: "Falha ao carregar tags",
            message: "Não foi possível carregar as tags disponíveis.",
          });
        }
      } finally {
        setTagsLoading(false);
      }
    },
    [showToast]
  );

  const handleToggleTagPanel = useCallback(() => {
    setTagsOpen((prev) => {
      const next = !prev;
      if (next) {
        // ao abrir o painel, carrega tags e mostra toast só se falhar (usuário está vendo o painel)
        carregarTags({ showErrorToUser: true });
      }
      return next;
    });
  }, [carregarTags]);

  const handleToggleTag = useCallback(
    async (tag) => {
      if (!conversaId || !tag?.id) return;
      const alreadySelected = selectedTagIds.includes(tag.id);
      try {
        setTagMutatingId(tag.id);
        if (alreadySelected) {
          await removerTagConversa(conversaId, tag.id);
        } else {
          await adicionarTagConversa(conversaId, tag.id);
        }
        await refresh({ silent: true });
      } catch (err) {
        console.error("Erro ao atualizar tag da conversa:", err);
        showToast({
          type: "error",
          title: "Falha ao atualizar tag",
          message: "Não foi possível atualizar as tags desta conversa.",
        });
      } finally {
        setTagMutatingId(null);
      }
    },
    [conversaId, selectedTagIds, refresh, showToast]
  );

  // Tags: só carregamos ao abrir o painel (evita toast "falha ao carregar" em background)
  // handleToggleTagPanel já chama carregarTags() ao abrir quando allTags está vazio

  if (loading) {
    return (
      <div className="wa-empty">
        <div className="wa-empty-card wa-empty-card-loading">
          <div className="wa-empty-title">Carregando conversa…</div>
          <div className="wa-empty-skel">
            <SkeletonLine w="70%" />
            <SkeletonLine w="92%" />
            <SkeletonLine w="84%" />
            <SkeletonLine w="60%" />
          </div>
        </div>
      </div>
    );
  }

  // Selecionou uma conversa mas ainda carregando
  if (selectedId && !conversa && loading) {
    return (
      <div className="wa-empty">
        <div className="wa-empty-card wa-empty-card-loading">
          <div className="wa-empty-title">Carregando conversa…</div>
        </div>
      </div>
    );
  }

  // Erro ao carregar ou conversa não encontrada — permite tentar de novo
  if (selectedId && !conversa && !loading) {
    return (
      <div className="wa-empty">
        <div className="wa-empty-card">
          <div className="wa-empty-title">Não foi possível abrir a conversa</div>
          <div className="wa-empty-sub">
            {loadError || "Selecione outra na lista ou tente novamente."}
          </div>
          <button type="button" className="wa-btn wa-btn-primary" style={{ marginTop: 12 }} onClick={() => carregarConversa(selectedId)}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Nenhuma conversa selecionada
  if (!conversa) {
    return (
      <div className="wa-empty">
        <div className="wa-empty-card">
          <div className="wa-empty-title">Selecione uma conversa</div>
          <div className="wa-empty-sub">Abra uma conversa na lista para visualizar as mensagens.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-shell" onDragEnter={onDragEnter}>
        <Toast toast={toast} onClose={() => setToast(null)} />

        {dragOver ? (
          <div
            className="wa-dropOverlay"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            role="presentation"
          >
            <div className="wa-dropCard">
              <div className="wa-dropTitle">Solte para anexar</div>
              <div className="wa-dropSub">Envie imagens e arquivos diretamente na conversa.</div>
            </div>
          </div>
        ) : null}

        {/* HEADER — nome do contato + status discreto + ações */}
        <div className="wa-header">
          <button
            type="button"
            className="wa-header-back"
            onClick={() => setSelectedId(null)}
            aria-label="Voltar para lista de conversas"
            title="Voltar"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <div className="wa-header-left">
            <div className="wa-avatarWrap">
              <div className="wa-avatar" aria-hidden="true">
                {showAvatarImg ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="wa-avatar-img"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarImgError(true)}
                  />
                ) : (
                  avatar
                )}
              </div>
            </div>
            <div className="wa-header-info">
              <div className="wa-header-nameRow">
                <span className="wa-header-name" title={nome}>
                  {nome}
                </span>
                <span
                  className="wa-status-pill"
                  style={{
                    background: badge.bg,
                    borderColor: badge.border,
                    color: badge.color,
                  }}
                  title={badge.text}
                >
                  {badge.text}
                </span>
              </div>
              {!isGroup && (setorAtual ? (
                <div className="wa-header-setorRow">
                  <span className="wa-header-setor">Setor: {setorAtual}</span>
                  {podeGerenciarSetores && (
                    <button
                      type="button"
                      className="wa-header-setorBtn"
                      onClick={handleOpenTransferirSetor}
                      title="Transferir para outro setor"
                    >
                      Transferir setor
                    </button>
                  )}
                </div>
              ) : (
                <div className="wa-header-setorRow">
                  <span className="wa-header-setor wa-muted">Sem setor</span>
                  {podeGerenciarSetores && (
                    <button
                      type="button"
                      className="wa-header-setorBtn"
                      onClick={handleOpenTransferirSetor}
                      title="Definir setor"
                    >
                      Definir setor
                    </button>
                  )}
                </div>
              ))}
              {isGroup && (
                <div className="wa-header-setorRow">
                  <span className="wa-header-setor wa-muted">Grupo</span>
                </div>
              )}
              {isSomeoneTyping && (
                <div className="wa-header-typingRow">
                  <span className="wa-typing-dots">
                    digitando
                    <span className="wa-typing-dots-inner">
                      <span className="wa-typing-dot">.</span>
                      <span className="wa-typing-dot">.</span>
                      <span className="wa-typing-dot">.</span>
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="wa-header-right">
            {!isGroup && podeGerenciarTags && (
              <button
                type="button"
                className={`wa-header-btn wa-tagsBtn ${tagsOpen ? "isActive" : ""}`}
                onClick={handleToggleTagPanel}
                disabled={!conversaId}
                title="Tags do cliente"
                aria-label="Tags do cliente"
              >
                <IconTag />
              </button>
            )}

            <button
              onClick={toggleTimeline}
              title="Histórico de atendimentos (Ctrl/Cmd + H)"
              className={`wa-header-btn ${showTimeline ? "isActive" : ""}`}
              type="button"
              aria-label="Histórico"
            >
              <IconClock />
            </button>

            <div className="wa-actions">
              <AtendimentoActions />
            </div>

            <button
              title="Mais opções"
              className="wa-header-btn"
              type="button"
              onClick={() => setShowClienteSide(true)}
              aria-label="Mais opções"
            >
              <IconMore />
            </button>
          </div>
        </div>

        {!isGroup && podeGerenciarSetores && showTransferirSetor && (
          <div
            className="wa-tagsPanel"
            role="dialog"
            aria-label="Transferir setor"
            style={{ minWidth: 260 }}
          >
            <div className="wa-tagsPanel-head">
              <span className="wa-tagsPanel-title">Transferir setor</span>
              <button
                type="button"
                className="wa-iconBtn"
                onClick={() => setShowTransferirSetor(false)}
                title="Fechar"
              >
                <IconClose />
              </button>
            </div>
            <div className="wa-tagsPanel-body">
              {departamentos.length === 0 ? (
                <div className="wa-muted">Carregando setores...</div>
              ) : (
                <div className="wa-tagsList">
                  {departamentos.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="wa-tagItem"
                      onClick={() => handleTransferirSetor(d.id)}
                      disabled={transferirSetorLoading || Number(d.id) === Number(conversa?.departamento_id)}
                    >
                      {d.nome}
                      {Number(d.id) === Number(conversa?.departamento_id) ? " (atual)" : ""}
                    </button>
                  ))}
                </div>
              )}
              {transferirSetorLoading && (
                <div className="wa-muted" style={{ marginTop: 8 }}>Salvando...</div>
              )}
            </div>
          </div>
        )}

        {!isGroup && podeGerenciarTags && tagsOpen && (
          <div className="wa-tagsPanel" role="dialog" aria-label="Tags da conversa">
            <div className="wa-tagsPanel-head">
              <span className="wa-tagsPanel-title">Tags do cliente</span>
              <button
                type="button"
                className="wa-iconBtn"
                onClick={handleToggleTagPanel}
                title="Fechar"
              >
                <IconClose />
              </button>
            </div>
            <div className="wa-tagsPanel-body">
              {tagsLoading && allTags.length === 0 ? (
                <div className="wa-muted">Carregando tags...</div>
              ) : allTags.length === 0 ? (
                <div className="wa-muted">Nenhuma tag cadastrada.</div>
              ) : (
                <div className="wa-tagsList">
                  {allTags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    const busy = tagMutatingId === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className={`wa-tagChip ${selected ? "isSelected" : ""}`}
                        onClick={() => handleToggleTag(tag)}
                        disabled={busy}
                      >
                        <span className="wa-tagChip-label">{tag.nome}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <SidebarCliente
          open={!!showClienteSide}
          onClose={() => setShowClienteSide(false)}
          conversa={conversa}
          isGroup={isGroup}
          tags={tags}
          tempoSemResponder={tempoSemResponder}
          onObservacaoSaved={refresh}
        />

        {/* TIMELINE */}
        {showTimeline ? (
          <div className="wa-timeline" role="region" aria-label="Historico do atendimento">
            <div className="wa-timeline-head">
              <div className="wa-timeline-headLeft">
                <span className="wa-timeline-title">Histórico</span>
                <span className="wa-timeline-sub">Eventos, transferências e notas desta conversa (Esc para fechar)</span>
              </div>

              <button onClick={handleCloseTimeline} className="wa-iconBtn" title="Fechar (Esc)" type="button">
                <IconClose />
              </button>
            </div>

            <div className="wa-timeline-body">
              {atendimentosLoading ? (
                <div className="wa-muted">Carregando...</div>
              ) : (atendimentos || []).length === 0 ? (
                <div className="wa-muted">Sem histórico ainda.</div>
              ) : (
                <div className="wa-timeline-list">
                  {(atendimentos || []).map((a) => (
                    <div key={a.id || `${a.acao}-${a.criado_em}`} className="wa-timeline-card">
                      <div className="wa-timeline-row">
                        <span className="wa-timeline-time">{formatHoraCurta(a.criado_em)}</span>
                        <span className="wa-timeline-label">{timelineEventLabel(a)}</span>
                      </div>
                      {a.observacao ? (
                        <div className="wa-timeline-nota">Nota interna: {a.observacao}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* MENSAGENS */}
        <div
          className="wa-messages"
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragLeave={onDragLeave}
          role="log"
          aria-label="Mensagens"
        >
          {selectMode ? (
            <div className="wa-selectBar" role="region" aria-label="Modo seleção">
              <div className="wa-selectBar-left">
                <button type="button" className="wa-btn wa-btn-ghost" onClick={exitSelectMode}>
                  Cancelar
                </button>
                <span className="wa-selectBar-count">{selectedSet.size} selecionada(s)</span>
              </div>
              <button
                type="button"
                className="wa-btn wa-btn-danger"
                onClick={handleDeleteSelected}
                disabled={selectedSet.size === 0}
              >
                Apagar
              </button>
            </div>
          ) : pinnedTop ? (
            <div className="wa-pinBar" role="button" tabIndex={0} onClick={() => scrollToMsg(pinnedTop.id)}>
              <span className="wa-pinBar-ic" aria-hidden="true">📌</span>
              <span className="wa-pinBar-text">Fixada: {snippetFromMsg(pinnedTop)}</span>
              <span className="wa-pinBar-hint">Ver</span>
            </div>
          ) : null}

          {mensagensComSeparadores.length === 0 ? (
            <div className="wa-messages-empty">
              <div className="wa-messages-emptyCard">Sem mensagens ainda.</div>
            </div>
          ) : (
            mensagensComSeparadores.map((item) => {
              if (item.__type === "day") return <DaySeparator key={item.id} label={item.label} />;
              return (
                <Bubble
                  key={item.id}
                  msg={item}
                  showRemetente={Boolean(item.__showRemetente)}
                  peerAvatarUrl={avatarUrl}
                  peerName={nome}
                  selectMode={selectMode}
                  selected={selectedSet.has(String(item.id))}
                  onToggleSelected={toggleSelected}
                  onInfo={handleInfoAction}
                  onReply={handleReplyAction}
                  onCopy={handleCopyResult}
                  onForward={handleForwardAction}
                  onTogglePin={togglePin}
                  onToggleStar={toggleStar}
                  onStartSelect={startSelect}
                  onDeleteForMe={handleDeleteForMe}
                  onDeleteForEveryone={handleDeleteForEveryone}
                  isPinned={pinnedSet.has(String(item.id))}
                  isStarred={starredSet.has(String(item.id))}
                  currentUserId={myUserId}
                  onJumpToReply={jumpToReply}
                  onOpenMedia={openMediaViewer}
                  localReaction={localReactions[String(item.id)] || item.__reaction}
                  onReact={handleSendReaction}
                  onRemoveReaction={handleRemoveReaction}
                  reactionBusy={Boolean(reactionLoading[String(item.id)])}
                />
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        {/* PREVIEW / PENDENCIA DE ARQUIVO */}
        {pendingFile ? (
          <div className="wa-pending">
            <div className="wa-pending-card">
              <div className="wa-pending-left">
                {pendingPreview ? (
                  <img src={pendingPreview} alt="preview" className="wa-pending-img" />
                ) : (
                  <div className="wa-pending-fileIcon" aria-hidden="true">
                    📎
                  </div>
                )}

                <div className="wa-pending-meta">
                  <div className="wa-pending-name">{pendingFile.name}</div>
                  <div className="wa-pending-sub">
                    {isImageFile(pendingFile) ? "Imagem pronta para envio" : isAudioFile(pendingFile) ? "Áudio pronto para envio" : "Arquivo pronto para envio"}
                    <span className="wa-dotSep">•</span>
                    {(pendingFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>

              <div className="wa-pending-right">
                <button type="button" className="wa-btn wa-btn-ghost" onClick={clearPending} disabled={sending}>
                  Cancelar
                </button>

                <button type="button" className="wa-btn wa-btn-primary" onClick={handleConfirmSendFile} disabled={sending}>
                  {sending ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showRespostasSalvas && (
          <div
            className="wa-tagsPanel"
            role="dialog"
            aria-label="Respostas salvas"
            style={{ bottom: "100%", left: 0, right: 0, maxHeight: 220 }}
          >
            <div className="wa-tagsPanel-head">
              <span className="wa-tagsPanel-title">Respostas rápidas</span>
              <button
                type="button"
                className="wa-iconBtn"
                onClick={() => setShowRespostasSalvas(false)}
                title="Fechar"
              >
                <IconClose />
              </button>
            </div>
            <div className="wa-tagsPanel-body" style={{ maxHeight: 160, overflowY: "auto" }}>
              {respostasSalvasLoading ? (
                <div className="wa-muted">Carregando...</div>
              ) : respostasSalvas.length === 0 ? (
                <div className="wa-muted">Nenhuma resposta salva. Configure em Configurações &gt; Respostas salvas.</div>
              ) : (
                <div className="wa-tagsList">
                  {respostasSalvas.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="wa-tagItem"
                      onClick={() => handleInserirResposta(r.texto)}
                      title={r.titulo}
                    >
                      <strong>{r.titulo}</strong>
                      <span className="wa-muted" style={{ fontSize: 12, marginTop: 2, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(r.texto || "").slice(0, 60)}
                        {(r.texto || "").length > 60 ? "…" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {forwardOpen && forwardMsg ? createPortal(
          <div className="wa-modalOverlay" role="dialog" aria-label="Encaminhar mensagem" onMouseDown={closeForward}>
            <div className="wa-modal wa-forwardModal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="wa-modal-head">
                <div className="wa-modal-title">Encaminhar</div>
                <button type="button" className="wa-iconBtn" onClick={closeForward} title="Fechar">
                  <IconClose />
                </button>
              </div>
              <div className="wa-modal-body wa-forwardBody">
                <div className="wa-forwardHint">
                  <div className="wa-forwardPreview">{snippetFromMsg(forwardMsg)}</div>
                  <div className="wa-forwardSub">Selecione um contato ou conversa para encaminhar.</div>
                </div>

                <input
                  className="wa-input wa-forwardSearch"
                  value={forwardQuery}
                  onChange={(e) => setForwardQuery(e.target.value)}
                  placeholder="Buscar por nome/telefone..."
                  aria-label="Buscar contato"
                  autoFocus
                />

                <div className="wa-forwardSection">
                  <div className="wa-forwardSectionTitle">Conversas</div>
                  {forwardCandidates.length === 0 ? (
                    <div className="wa-muted" style={{ padding: "10px 4px" }}>
                      {forwardQuery.trim() ? "Nenhuma conversa encontrada." : "Carregando conversas…"}
                    </div>
                  ) : (
                    <div className="wa-forwardList">
                      {forwardCandidates.map((c) => {
                        const n = safeString(c?.contato_nome || c?.nome || c?.cliente?.nome || c?.telefone) || "Conversa";
                        return (
                          <button
                            key={`conv-${c.id}`}
                            type="button"
                            className="wa-forwardItem"
                            onClick={() => confirmForwardTo(c.id)}
                            title={`Encaminhar para ${n}`}
                            disabled={forwardSending}
                          >
                            <div className="wa-forwardItem-name">{n}</div>
                            {c?.telefone ? <div className="wa-forwardItem-sub">{String(c.telefone)}</div> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="wa-forwardSection" style={{ marginTop: 14 }}>
                  <div className="wa-forwardSectionTitle">Clientes</div>
                  {forwardClientesLoading ? (
                    <div className="wa-muted" style={{ padding: "10px 4px" }}>Buscando…</div>
                  ) : forwardClientes.length === 0 ? (
                    <div className="wa-muted" style={{ padding: "10px 4px" }}>
                      {safeString(forwardQuery).trim().length >= 2 ? "Nenhum cliente encontrado." : "Digite pelo menos 2 caracteres para buscar."}
                    </div>
                  ) : (
                    <div className="wa-forwardList">
                      {forwardClientes.slice(0, 60).map((c) => {
                        const n = safeString(c?.nome || c?.telefone) || "Cliente";
                        return (
                          <button
                            key={`cli-${c.id}`}
                            type="button"
                            className="wa-forwardItem"
                            onClick={() => confirmForwardToCliente(c)}
                            title={`Encaminhar para ${n}`}
                            disabled={forwardSending}
                          >
                            <div className="wa-forwardItem-name">{n}</div>
                            {c?.telefone ? <div className="wa-forwardItem-sub">{String(c.telefone)}</div> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

        {replyTo && !isRecording ? (
          <div className="wa-replyBar" role="region" aria-label="Respondendo">
            <div className="wa-replyBar-bar" aria-hidden="true" />
            <div className="wa-replyBar-left">
              <div className="wa-replyBar-title">{getReplySenderLabel(replyTo, nome)}</div>
              <div className="wa-replyBar-text">{snippetFromMsg(replyTo)}</div>
            </div>
            <button
              type="button"
              className="wa-iconBtn"
              onClick={() => setReplyTo(null)}
              title="Cancelar resposta"
              aria-label="Cancelar resposta"
              disabled={sending}
            >
              <IconClose />
            </button>
          </div>
        ) : null}

        {msgInfoOpen && msgInfo ? createPortal(
          <div className="wa-modalOverlay" role="dialog" aria-label="Dados da mensagem" onMouseDown={() => { setMsgInfoOpen(false); setMsgInfo(null); }}>
            <div className="wa-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="wa-modal-head">
                <div className="wa-modal-title">Dados da mensagem</div>
                <button type="button" className="wa-iconBtn" onClick={() => { setMsgInfoOpen(false); setMsgInfo(null); }} title="Fechar">
                  <IconClose />
                </button>
              </div>

              <div className="wa-modal-body">
                <div className="wa-modal-row">
                  <span className="wa-modal-label">Conteúdo</span>
                  <span className="wa-modal-value">{snippetFromMsg(msgInfo)}</span>
                </div>
                <div className="wa-modal-row">
                  <span className="wa-modal-label">Horário</span>
                  <span className="wa-modal-value">{formatDia(msgInfo?.criado_em)} {formatHora(msgInfo?.criado_em)}</span>
                </div>
                <div className="wa-modal-row">
                  <span className="wa-modal-label">Status</span>
                  <span className="wa-modal-value">{safeString(msgInfo?.status_mensagem || msgInfo?.status) || "enviada"}</span>
                </div>
                {safeString(msgInfo?.whatsapp_id) ? (
                  <div className="wa-modal-row">
                    <span className="wa-modal-label">ID WhatsApp</span>
                    <span className="wa-modal-value wa-mono">{String(msgInfo.whatsapp_id)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        ) : null}

        {mediaViewer ? createPortal(
          <div
            className="wa-modalOverlay wa-imageViewerOverlay"
            role="dialog"
            aria-label="Visualizar mídia"
            onMouseDown={closeMediaViewer}
          >
            <div className="wa-imageViewer" onMouseDown={(e) => e.stopPropagation()}>
              <img
                src={mediaViewer.url}
                alt={mediaViewer.alt || "Mídia"}
                className="wa-imageViewer-img"
              />
            </div>
          </div>,
          document.body
        ) : null}

        {mediaViewer ? createPortal(
          <div
            className="wa-modalOverlay wa-imageViewerOverlay"
            role="dialog"
            aria-label="Visualizar mídia"
            onMouseDown={closeMediaViewer}
          >
            <div className="wa-imageViewer" onMouseDown={(e) => e.stopPropagation()}>
              <img
                src={mediaViewer.url}
                alt={mediaViewer.alt || "Mídia"}
                className="wa-imageViewer-img"
              />
            </div>
          </div>,
          document.body
        ) : null}

        {shareContactOpen ? createPortal(
          <div
            className="wa-modalOverlay"
            role="dialog"
            aria-label="Enviar contato"
            onMouseDown={() => {
              if (shareContactSending) return;
              setShareContactOpen(false);
              setShareContactQuery("");
              setShareContactList([]);
            }}
          >
            <div className="wa-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="wa-modal-head">
                <div className="wa-modal-title">Enviar contato</div>
                <button
                  type="button"
                  className="wa-iconBtn"
                  onClick={() => {
                    if (shareContactSending) return;
                    setShareContactOpen(false);
                    setShareContactQuery("");
                    setShareContactList([]);
                  }}
                  title="Fechar"
                >
                  <IconClose />
                </button>
              </div>
              <div className="wa-modal-body">
                <div className="wa-modal-row">
                  <input
                    className="wa-input"
                    placeholder="Buscar cliente por nome ou telefone..."
                    value={shareContactQuery}
                    onChange={(e) => setShareContactQuery(e.target.value)}
                  />
                </div>
                <div className="wa-modal-row" style={{ maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
                  {shareContactLoading ? (
                    <div className="wa-muted">Carregando contatos...</div>
                  ) : shareContactList.length === 0 ? (
                    <div className="wa-muted">Nenhum contato encontrado.</div>
                  ) : (
                    <div className="wa-forwardList">
                      {shareContactList.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="wa-forwardItem"
                          disabled={shareContactSending}
                          onClick={async () => {
                            if (!conversaId) return;
                            setShareContactSending(true);
                            try {
                              await enviarContato(conversaId, c.id);
                              setShareContactOpen(false);
                              setShareContactQuery("");
                              setShareContactList([]);
                              showToast({
                                type: "success",
                                title: "Contato enviado",
                                message: "O contato foi compartilhado na conversa.",
                              });
                            } catch (err) {
                              console.error("Erro ao enviar contato:", err);
                              showToast({
                                type: "error",
                                title: "Falha ao enviar contato",
                                message: err?.response?.data?.error || "Não foi possível enviar o contato.",
                              });
                            } finally {
                              setShareContactSending(false);
                            }
                          }}
                        >
                          <div className="wa-forwardItem-name">{safeString(c.nome || c.telefone) || "Cliente"}</div>
                          {c.telefone ? (
                            <div className="wa-forwardItem-sub">{String(c.telefone)}</div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

        {callModalOpen ? createPortal(
          <div
            className="wa-modalOverlay"
            role="dialog"
            aria-label="Registrar ligação"
            onMouseDown={() => {
              if (callSending) return;
              setCallModalOpen(false);
            }}
          >
            <div className="wa-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="wa-modal-head">
                <div className="wa-modal-title">Ligar pelo WhatsApp</div>
                <button
                  type="button"
                  className="wa-iconBtn"
                  onClick={() => !callSending && setCallModalOpen(false)}
                  title="Fechar"
                >
                  <IconClose />
                </button>
              </div>
              <div className="wa-modal-body">
                <div className="wa-modal-row">
                  <span className="wa-modal-label">Duração (segundos)</span>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    className="wa-input"
                    value={callDuration}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v < 1) setCallDuration(1);
                      else if (v > 15) setCallDuration(15);
                      else setCallDuration(v);
                    }}
                  />
                </div>
                <div className="wa-modal-row">
                  <p className="wa-modal-value">
                    Registraremos uma ligação via WhatsApp nesta conversa. Isso não inicia a chamada no seu dispositivo,
                    apenas registra no histórico.
                  </p>
                </div>
              </div>
              <div className="wa-modal-body" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="wa-btn wa-btn-ghost"
                  disabled={callSending}
                  onClick={() => !callSending && setCallModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="wa-btn wa-btn-primary"
                  disabled={callSending || !conversaId}
                  onClick={async () => {
                    if (!conversaId) return;
                    const dur = Math.min(15, Math.max(1, Number(callDuration) || 5));
                    setCallSending(true);
                    try {
                      await registrarLigacao(conversaId, dur);
                      setCallModalOpen(false);
                      showToast({
                        type: "success",
                        title: "Ligação registrada",
                        message: "A ligação via WhatsApp foi registrada na conversa.",
                      });
                    } catch (err) {
                      console.error("Erro ao registrar ligação:", err);
                      showToast({
                        type: "error",
                        title: "Falha ao registrar ligação",
                        message: err?.response?.data?.error || "Não foi possível registrar a ligação.",
                      });
                    } finally {
                      setCallSending(false);
                    }
                  }}
                >
                  {callSending ? "Registrando..." : "Iniciar ligação"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

        <div className="wa-footer">
          {isRecording ? (
            <div className="wa-recording-bar">
              <button
                type="button"
                className="wa-recording-cancel"
                onClick={handleCancelRecording}
                title="Cancelar"
                aria-label="Cancelar gravação"
              >
                <IconClose />
              </button>
              <div className="wa-recording-timer">
                <span className="wa-recording-dot" aria-hidden="true" />
                <span className="wa-recording-time">
                  {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, "0")}
                </span>
              </div>
              <span className="wa-recording-hint">Toque para enviar</span>
              <button
                type="button"
                className="wa-recording-send"
                onClick={handleStopRecording}
                title="Enviar áudio"
                aria-label="Enviar áudio"
              >
                <IconSend />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`wa-iconBtn ${emojiOpen ? "isActive" : ""}`}
                onClick={() => setEmojiOpen((v) => !v)}
                title="Emojis"
                aria-label="Emojis"
                disabled={sending || !conversaId}
              >
                <IconEmoji />
              </button>
              <button
                onClick={openCameraPicker}
                className="wa-iconBtn"
                title="Câmera / Foto / Vídeo"
                type="button"
                disabled={sending || !conversaId}
                aria-label="Câmera"
              >
                <IconCamera />
              </button>
              <button
                onClick={handleOpenRespostasSalvas}
                className="wa-iconBtn"
                title="Respostas rápidas"
                type="button"
                disabled={sending || !conversaId}
                aria-label="Respostas rápidas"
              >
                <IconClipboard />
              </button>
              <button
                onClick={openFilePicker}
                className="wa-iconBtn"
                title="Anexar arquivo"
                type="button"
                disabled={sending || !conversaId}
                aria-label="Anexar"
              >
                <IconAttach />
              </button>
              <button
                onClick={() => setShareContactOpen(true)}
                className="wa-iconBtn"
                title="Enviar contato"
                type="button"
                disabled={sending || !conversaId}
                aria-label="Enviar contato"
              >
                <IconContact />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
                onChange={handleFileInputChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                style={{ display: "none" }}
                accept="image/*,video/*"
                capture="environment"
                onChange={handleCameraInputChange}
              />

              <input
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onBlur={emitTypingStop}
                onPaste={handlePaste}
                placeholder="Digite uma mensagem"
                className="wa-input"
                onKeyDown={handleKeyDownInput}
                disabled={sending || !conversaId}
                aria-label="Digite sua resposta. Enter para enviar, Esc para fechar painéis."
              />

              <div className="wa-footer-right">
                <button
                  onClick={handleStartRecording}
                  disabled={sending || !conversaId}
                  className="wa-micBtn"
                  title="Gravar áudio"
                  type="button"
                  aria-label="Gravar áudio"
                >
                  <IconMic />
                </button>
                {!isGroup && (
                  <button
                    onClick={() => setCallModalOpen(true)}
                    disabled={sending || !conversaId}
                    className="wa-micBtn"
                    title="Ligar pelo WhatsApp"
                    type="button"
                    aria-label="Ligar pelo WhatsApp"
                  >
                    📞
                  </button>
                )}
                <button
                  onClick={handleEnviar}
                  disabled={sending || !safeString(texto) || !conversaId}
                  className="wa-sendBtn"
                  title="Enviar"
                  type="button"
                  aria-label="Enviar mensagem"
                >
                  {sending ? <span className="wa-spinner" aria-hidden="true" /> : <IconSend />}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Emoji picker — simples e leve (sem libs) */}
        {!isRecording && emojiOpen ? createPortal(
          <div
            ref={emojiPanelRef}
            className="wa-emojiPanel"
            role="dialog"
            aria-label="Selecionar emoji"
          >
            <div className="wa-emojiHead">
              <input
                ref={emojiSearchRef}
                className="wa-emojiSearch"
                value={emojiQuery}
                onChange={(e) => setEmojiQuery(e.target.value)}
                placeholder="Buscar emoji..."
                aria-label="Buscar emoji"
              />
              <button
                type="button"
                className="wa-iconBtn"
                onClick={() => { setEmojiOpen(false); setEmojiQuery(""); }}
                title="Fechar"
                aria-label="Fechar"
              >
                <IconClose />
              </button>
            </div>
            <div className="wa-emojiGrid" role="list">
              {__WA_EMOJIS
                .filter((e) => !safeString(emojiQuery) || e.includes(safeString(emojiQuery)))
                .map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="wa-emojiBtn"
                    onClick={() => insertEmoji(e)}
                    role="listitem"
                    aria-label={`Emoji ${e}`}
                    title={e}
                  >
                    {e}
                  </button>
                ))}
            </div>
            <div className="wa-emojiFoot">
              <span className="wa-muted">Dica: clique para inserir no cursor.</span>
            </div>
          </div>,
          document.body
        ) : null}

        {/* ESC handler central */}
        <button
          type="button"
          className="wa-escCatcher"
          aria-hidden="true"
          tabIndex={-1}
          onClick={onEscape}
          style={{ display: "none" }}
        />
    </div>
  );
}
