/** Formatação defensiva para payloads CRM (backend pode variar chaves). */

export function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatBRL(v: unknown): string {
  return safeNum(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatInt(v: unknown): string {
  return String(Math.round(safeNum(v)));
}

export function formatPct(v: unknown): string {
  const n = safeNum(v);
  if (n <= 1 && n >= 0) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

/** Extrai array de ranking de vários formatos de resposta. */
export function extractRanking(raw: unknown): Record<string, unknown>[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    const r = o.ranking ?? o.items ?? o.data;
    if (Array.isArray(r)) return r as Record<string, unknown>[];
  }
  return [];
}

export function rankingLabel(row: Record<string, unknown>): string {
  const origem = row.origem;
  const origemNome =
    origem && typeof origem === "object" && origem !== null && "nome" in origem
      ? String((origem as { nome?: string }).nome ?? "")
      : "";
  const nome =
    row.nome ??
    row.usuario_nome ??
    (row.usuario && typeof row.usuario === "object" && row.usuario !== null
      ? (row.usuario as { nome?: string }).nome
      : null) ??
    row.origem_nome ??
    (origemNome || null) ??
    row.email;
  return nome != null && String(nome) !== "" ? String(nome) : "—";
}

export function rankingValorPotencial(row: Record<string, unknown>): number {
  return safeNum(row.valor_potencial ?? row.valor ?? row.total_valor);
}

export function rankingTotalLeads(row: Record<string, unknown>): number {
  return safeNum(row.total_leads ?? row.qtd ?? row.count);
}

export type FunnelStageRow = { label: string; value: number };

/** Normaliza `novos_no_periodo_por_estagio` ou arrays semelhantes. */
export function normalizeFunnelStages(funnel: Record<string, unknown> | null): FunnelStageRow[] {
  if (!funnel) return [];
  const raw = funnel.novos_no_periodo_por_estagio ?? funnel.por_estagio ?? funnel.estagios;
  if (!Array.isArray(raw)) return [];
  const rows: FunnelStageRow[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const est = o.estagio ?? o.stage;
    let label = "—";
    if (typeof est === "object" && est !== null && "nome" in est) {
      label = String((est as { nome?: string }).nome ?? "—");
    } else if (typeof o.nome === "string") {
      label = o.nome;
    } else if (typeof o.estagio_nome === "string") {
      label = o.estagio_nome;
    }
    const value = safeNum(
      o.novos ?? o.total ?? o.quantidade ?? o.qtd ?? o.count ?? o.leads ?? o.valor
    );
    rows.push({ label, value });
  }
  return rows;
}
