/**
 * Rótulos e formatação da página de Integrações.
 * Valores monetários da WM chegam como string decimal invariant ("33.038"); os indicadores do
 * histórico chegam como number (já somados no backend).
 */

const LOCALE = "pt-BR";

/** Estado da operação → rótulo + tom visual. Vocabulário fechado do backend. */
export const ESTADOS_ORCAMENTO = Object.freeze({
  CRIADO: { rotulo: "Criado no ERP", curto: "Criado", tom: "ok" },
  ENVIANDO: { rotulo: "Enviando ao ERP", curto: "Enviando", tom: "info" },
  INCERTO: { rotulo: "Confirmação pendente", curto: "Verificar", tom: "warn" },
  FALHA_SEGURA: { rotulo: "Não foi criado", curto: "Não criado", tom: "erro" },
  PREPARADO: { rotulo: "Rascunho calculado", curto: "Rascunho", tom: "neutro" },
  EXPIRADO: { rotulo: "Rascunho expirado", curto: "Expirado", tom: "neutro" },
});

export function infoEstado(estado) {
  return ESTADOS_ORCAMENTO[estado] || { rotulo: String(estado || "—"), curto: String(estado || "—"), tom: "neutro" };
}

/** Filtros de estado oferecidos na tela (chave = grupo do backend). */
export const FILTROS_ESTADO = [
  { id: "registrados", rotulo: "Todos" },
  { id: "criados", rotulo: "Criados" },
  { id: "atencao", rotulo: "Precisam de atenção" },
  { id: "rascunhos", rotulo: "Rascunhos" },
];

export const PERIODOS = [
  { id: "7", rotulo: "7 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "90", rotulo: "90 dias" },
  { id: "365", rotulo: "12 meses" },
];

function numeroOuNull(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  return Number.isFinite(n) ? n : null;
}

export function formatMoeda(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return "—";
  return n.toLocaleString(LOCALE, { style: "currency", currency: "BRL" });
}

/** "R$ 12,4 mil" para KPIs grandes; abaixo de 10 mil mostra o valor cheio. */
export function formatMoedaCompacta(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return "—";
  if (Math.abs(n) < 10000) return formatMoeda(n);
  return n.toLocaleString(LOCALE, {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatInteiro(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return "—";
  return Math.round(n).toLocaleString(LOCALE);
}

/** Quantidade da WM ("2.000") sem casas inúteis: "2"; "1.500" → "1,5". */
export function formatQuantidade(valor) {
  const n = numeroOuNull(valor);
  if (n === null) return "—";
  return n.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
}

export function formatDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(LOCALE, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatDataCurta(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short" });
}

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias", senão a data. */
export function tempoRelativo(iso, agora = Date.now()) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((agora - t) / 1000));
  if (s < 45) return "agora";
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return formatDataCurta(iso);
}

export function iniciais(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const a = partes[0][0] || "";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

/** Cor estável por nome (hue), para avatares. */
export function corDoNome(nome) {
  let h = 0;
  const s = String(nome || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 48%)`;
}

export function formatTelefone(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return tel || "";
}

/** Status do ERP (`GET /erp/status`) → texto e tom. */
export function infoStatusErp(status) {
  if (!status) return { tom: "neutro", rotulo: "Verificando…", detalhe: "Consultando a loja" };
  if (status.erp_alcancavel) return { tom: "ok", rotulo: "Online", detalhe: "Loja respondendo em tempo real" };
  switch (status.motivo) {
    case "sincronizador_offline":
      return { tom: "warn", rotulo: "Loja offline", detalhe: "O sincronizador da loja está desligado" };
    case "lento":
      return { tom: "warn", rotulo: "Lento", detalhe: "A loja está demorando para responder" };
    case "nao_configurado":
      return { tom: "neutro", rotulo: "Não configurado", detalhe: "Vínculo com a WM ainda não feito" };
    default:
      return { tom: "erro", rotulo: "Indisponível", detalhe: "Não foi possível falar com o ERP agora" };
  }
}
