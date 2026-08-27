export const DIAS_SEMANA = [
  { num: 0, label: "Dom" },
  { num: 1, label: "Seg" },
  { num: 2, label: "Ter" },
  { num: 3, label: "Qua" },
  { num: 4, label: "Qui" },
  { num: 5, label: "Sex" },
  { num: 6, label: "Sáb" },
];

export function formatTimeForInput(t) {
  if (!t || typeof t !== "string") return "09:00";
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const min = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export const normalizeHorarioAdminAlerta = formatTimeForInput;

export function formatAdminAlertContactOption(cliente) {
  const nome = String(cliente?.nome || cliente?.pushname || "").trim() || `Cliente ${cliente?.id || ""}`.trim();
  const telefone = String(cliente?.telefone || cliente?.wa_id || "").trim();
  return telefone ? `${nome} - ${telefone}` : nome;
}
