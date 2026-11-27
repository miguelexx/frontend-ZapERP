import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  CircleCheck,
  Clock,
  Megaphone,
  RotateCcw,
  UserCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { IconClose } from "../conversaViewIcons";
import { formatHoraCurta } from "../utils/conversaViewHelpers";
import { parseToDate } from "../../utils/parseToDate.js";
import { companyDayKey, formatDiaEmpresa } from "../../utils/companyTimezone";
import { useCompanyTimezoneVersion } from "../../utils/useCompanyTimezone";
import { useMobileOverlayBack } from "../../atendimento/useMobileOverlayBack";

/*
 * Painel "Histórico" do atendimento (refeito em 26/11/2026).
 *
 * Antes: só a HORA (eventos de dias diferentes pareciam fora de ordem: 12:13 de anteontem
 * antes de 08:13 de ontem), toda `observacao` vinha com o prefixo "Nota interna:" — que é
 * SEMPRE falso (nenhuma ação do backend é nota interna) — e 8 ações que o backend grava
 * (aguardando_cliente, removeu_atendente, encerramentos automáticos…) caíam em "Sistema".
 *
 * Agora: separador por dia no fuso da empresa (doc 14: companyDayKey/formatDiaEmpresa, nunca
 * fuso cravado), rótulo em português para cada ação conhecida, `observacao` como detalhe
 * discreto só quando acrescenta algo, trilho com ícone por tipo, rola até o mais recente.
 *
 * Os dados (`atendimentos`) continuam vindo do conversaStore; isto é só apresentação.
 */

const KIND = {
  assign: { Icon: UserCheck, tone: "accent" },
  add: { Icon: UserPlus, tone: "accent" },
  remove: { Icon: UserMinus, tone: "neutral" },
  transfer: { Icon: ArrowRightLeft, tone: "live" },
  wait: { Icon: Clock, tone: "wait" },
  close: { Icon: CircleCheck, tone: "done" },
  reopen: { Icon: RotateCcw, tone: "staff" },
  bot: { Icon: Bot, tone: "done" },
  fail: { Icon: AlertTriangle, tone: "due" },
  campaign: { Icon: Megaphone, tone: "wait" },
  other: { Icon: null, tone: "neutral" },
};

function safe(v) {
  return v == null ? "" : String(v).trim();
}

function normaliza(s) {
  return safe(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\s]+$/g, "");
}

/**
 * Observação crua do backend → texto legível. O encerramento por ausência anexa um JSON de
 * reconstrução (`|ausencia_snap:{…}`) que é dado interno e nunca vai para a tela.
 */
function limpaObservacao(obs) {
  let s = safe(obs);
  const i = s.indexOf("|ausencia_snap:");
  if (i >= 0) s = s.slice(0, i).trim();
  return s;
}

/** Detalhe que só repete o rótulo (todas as palavras já estão nele) não acrescenta nada. */
function detalheRedundante(label, detail) {
  const palavras = (t) => normaliza(t).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const noRotulo = new Set(palavras(label));
  const doDetalhe = palavras(detail);
  return doDetalhe.length > 0 && doDetalhe.every((w) => noRotulo.has(w));
}

/** "algo_assim" → "Algo assim" (ação que o painel ainda não conhece). */
function humaniza(acao) {
  const t = safe(acao).replace(/_/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Evento";
}

/**
 * Rótulo, detalhe e tipo de um evento do histórico.
 * `detail` só sai quando acrescenta informação (prazo, de → para, motivo da falha).
 * @returns {{ label: string, detail: string, kind: keyof KIND }}
 */
export function timelineEventInfo(a, conversaCtx) {
  const info = timelineEventInfoBruto(a, conversaCtx);
  if (info.detail && detalheRedundante(info.label, info.detail)) return { ...info, detail: "" };
  return info;
}

function timelineEventInfoBruto(a, conversaCtx) {
  const acao = safe(a?.acao).toLowerCase();
  const quem = safe(a?.usuario_nome);
  const paraQuem = safe(a?.para_usuario_nome);
  const obs = limpaObservacao(a?.observacao);
  const comDetalhe = (label, kind) => ({ label, detail: obs, kind });
  const semDetalhe = (label, kind) => ({ label, detail: "", kind });

  switch (acao) {
    case "assumiu":
      return semDetalhe(quem ? `${quem} assumiu o atendimento` : "Atendimento assumido", "assign");
    case "transferiu":
      // A observação aqui é a nota de quem transferiu (ou "Chatbot: direcionado para X").
      if (quem && paraQuem) return comDetalhe(`${quem} transferiu para ${paraQuem}`, "transfer");
      if (paraQuem) return comDetalhe(`Transferida para ${paraQuem}`, "transfer");
      return comDetalhe(quem ? `${quem} transferiu o atendimento` : "Atendimento transferido", "transfer");
    case "adicionou_atendente":
      return semDetalhe(
        paraQuem
          ? `${quem || "Alguém"} adicionou ${paraQuem} ao atendimento`
          : `${quem || "Alguém"} adicionou um atendente ao atendimento`,
        "add"
      );
    case "removeu_atendente":
      // A observação do backend repete a frase ("X removeu Y do atendimento.").
      return semDetalhe(
        paraQuem
          ? `${quem || "Alguém"} removeu ${paraQuem} do atendimento`
          : `${quem || "Alguém"} removeu um atendente do atendimento`,
        "remove"
      );
    case "transferiu_setor":
      // A observação é o "de → para": vai como detalhe, não repetida no rótulo.
      return comDetalhe(quem ? `${quem} mudou o setor` : "Setor alterado", "transfer");
    case "aguardando_cliente":
      return semDetalhe("Marcada como aguardando cliente", "wait");
    case "encerrou": {
      const motivoLinha = safe(a?.finalizacao_motivo).toLowerCase();
      const motivoConv = safe(conversaCtx?.finalizacao_motivo).toLowerCase();
      if (motivoLinha === "ausencia_cliente" || a?.finalizada_automaticamente === true) {
        return semDetalhe("Encerrada automaticamente por ausência do cliente", "close");
      }
      if (!quem && motivoConv === "ausencia_cliente") {
        return semDetalhe("Encerrada automaticamente por ausência do cliente", "close");
      }
      return semDetalhe(quem ? `${quem} encerrou o atendimento` : "Atendimento encerrado", "close");
    }
    case "encerramento_automatico_ausencia": {
      // "Conversa encerrada automaticamente por ausência do cliente (prazo 30 minutos)": só o
      // prazo acrescenta algo ao rótulo.
      const prazo = obs.match(/\(prazo\s+([^)]+)\)/i)?.[1]?.trim();
      return {
        label: "Encerrada automaticamente por ausência do cliente",
        detail: prazo ? `Prazo de ${prazo} sem resposta` : obs,
        kind: "close",
      };
    }
    case "encerramento_ausencia_envio_pendente":
      return semDetalhe("Encerrada por ausência — aviso ao cliente pendente de confirmação", "close");
    case "encerramento_ausencia_falha_envio":
      return semDetalhe("Encerramento por ausência falhou — voltou para em atendimento", "fail");
    case "encerramento_inatividade_chatbot":
      return comDetalhe("Encerrada pelo chatbot por inatividade do cliente", "bot");
    case "reabriu":
      return semDetalhe(quem ? `${quem} reabriu a conversa` : "Conversa reaberta", "reopen");
    case "reabertura_automatica_inbound":
      return comDetalhe("Reaberta automaticamente: o cliente mandou mensagem", "reopen");
    case "reabertura_automatica_ausencia":
      return comDetalhe("Reaberta automaticamente após ausência", "reopen");
    case "alerta_sem_resposta_reabertura":
      return semDetalhe("Reaberta automaticamente por falta de resposta do atendente", "reopen");
    case "timeout_inatividade":
      return comDetalhe("Reaberta: sem resposta do atendente", "reopen");
    case "retomada_em_atendimento_resposta_cliente":
      return semDetalhe("Cliente respondeu — voltou para em atendimento", "reopen");
    case "campanha_respondida":
      // `observacao` aqui é o próprio código da ação: nunca mostrar.
      return semDetalhe(
        paraQuem ? `Cliente respondeu à campanha · com ${paraQuem}` : "Cliente respondeu à campanha",
        "campaign"
      );
    default: {
      const label = quem ? `${humaniza(acao)} · ${quem}` : humaniza(acao);
      return { label, detail: normaliza(obs) === normaliza(acao) ? "" : obs, kind: "other" };
    }
  }
}

function dataDo(ts) {
  if (!ts) return null;
  const d = parseToDate(ts) || new Date(ts);
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

function rotuloDia(d, hojeKey, ontemKey) {
  const key = companyDayKey(d);
  if (key && key === hojeKey) return "Hoje";
  if (key && key === ontemKey) return "Ontem";
  return formatDiaEmpresa(d) || "";
}

function SkeletonTimeline() {
  return (
    <ol className="wa-tl-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="wa-tl-item wa-tl-item--skeleton">
          <span className="wa-tl-dot wa-tl-skel" />
          <span className="wa-tl-content">
            <span className="wa-tl-skel wa-tl-skel--line" style={{ width: `${78 - i * 14}%` }} />
            <span className="wa-tl-skel wa-tl-skel--time" />
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ConversaTimelinePanel({
  open,
  atendimentos,
  atendimentosLoading,
  conversa,
  onClose,
}) {
  const tzVersion = useCompanyTimezoneVersion();
  const bodyRef = useRef(null);

  const grupos = useMemo(() => {
    void tzVersion;
    const list = Array.isArray(atendimentos) ? atendimentos : [];
    // Ordem cronológica estável (o mais recente embaixo, como a thread).
    const comData = list.map((a, i) => ({ a, i, d: dataDo(a?.criado_em) }));
    comData.sort((x, y) => {
      const tx = x.d ? x.d.getTime() : 0;
      const ty = y.d ? y.d.getTime() : 0;
      return tx - ty || x.i - y.i;
    });
    const agora = new Date();
    const hojeKey = companyDayKey(agora);
    const ontemKey = companyDayKey(new Date(agora.getTime() - 86_400_000));
    const out = [];
    for (const item of comData) {
      const key = item.d ? companyDayKey(item.d) : "";
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: item.d ? rotuloDia(item.d, hojeKey, ontemKey) : "", items: [] };
        out.push(g);
      }
      g.items.push({ ...item, info: timelineEventInfo(item.a, conversa) });
    }
    return out;
  }, [atendimentos, conversa, tzVersion]);

  const total = grupos.reduce((n, g) => n + g.items.length, 0);

  // Abre já no evento mais recente (embaixo), como a própria conversa.
  useLayoutEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, total]);

  // Celular: o "voltar" fecha só o histórico, não a conversa (R4-05/A2-04).
  useMobileOverlayBack(open, onClose, "timeline");

  if (!open) return null;

  let corpo;
  if (atendimentosLoading && total === 0) {
    corpo = <SkeletonTimeline />;
  } else if (total === 0) {
    corpo = (
      <div className="wa-tl-empty">
        <p className="wa-tl-emptyTitle">Sem movimentações ainda</p>
        <p className="wa-tl-emptyHint">Quem assumiu, transferências, esperas e encerramentos aparecem aqui.</p>
      </div>
    );
  } else {
    corpo = (
      <div className="wa-tl-groups">
        {grupos.map((g) => (
          <section key={g.key || "sem-data"} className="wa-tl-group" aria-label={g.label || "Sem data"}>
            {g.label ? (
              <div className="wa-tl-day">
                <span>{g.label}</span>
              </div>
            ) : null}
            <ol className="wa-tl-list">
              {g.items.map(({ a, i, info }) => {
                const { Icon, tone } = KIND[info.kind] || KIND.other;
                return (
                  <li key={a?.id ?? `${a?.acao}-${a?.criado_em}-${i}`} className={`wa-tl-item wa-tl-item--${tone}`}>
                    <span className={`wa-tl-dot${Icon ? "" : " wa-tl-dot--empty"}`} aria-hidden="true">
                      {Icon ? <Icon size={13} strokeWidth={2.1} /> : null}
                    </span>
                    <span className="wa-tl-content">
                      <span className="wa-tl-label">{info.label}</span>
                      {info.detail ? <span className="wa-tl-detail">{info.detail}</span> : null}
                      <time className="wa-tl-time" dateTime={a?.criado_em || undefined}>
                        {formatHoraCurta(a?.criado_em)}
                      </time>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="wa-timeline wa-timeline--premium" role="region" aria-label="Histórico do atendimento">
      <div className="wa-timeline-head">
        <div className="wa-timeline-headLeft">
          <span className="wa-timeline-title">Histórico</span>
          <span className="wa-timeline-sub">Atendentes, transferências, esperas e encerramentos</span>
        </div>

        <button onClick={onClose} className="wa-iconBtn" title="Fechar histórico (Esc)" aria-label="Fechar histórico (Esc)" type="button">
          <IconClose />
        </button>
      </div>

      <div className="wa-timeline-body" ref={bodyRef} aria-busy={atendimentosLoading ? "true" : undefined}>
        {corpo}
      </div>
    </div>
  );
}
