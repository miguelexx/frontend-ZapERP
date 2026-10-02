// Fuso horário por estado (UF) do Brasil — mapeamento IANA (espelho do backend
// helpers/brazilTimezones.js). Mantido em sincronia. Usado pelo seletor de estado da
// empresa na tela de atendimento. Nunca usa offset fixo — só zonas IANA.

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

// UF → { nome, zones: [{ tz, label }] } (primeira zona = padrão do estado)
export const BR_UF_TIMEZONES = {
  AC: { nome: "Acre", zones: [{ tz: "America/Rio_Branco", label: "Horário do Acre (Rio Branco)" }] },
  AL: { nome: "Alagoas", zones: [{ tz: "America/Maceio", label: "Horário de Brasília (Maceió)" }] },
  AP: { nome: "Amapá", zones: [{ tz: "America/Belem", label: "Horário de Brasília (Belém)" }] },
  AM: {
    nome: "Amazonas",
    zones: [
      { tz: "America/Manaus", label: "Horário do Amazonas (Manaus)" },
      { tz: "America/Eirunepe", label: "Oeste do Amazonas (Eirunepé)" },
    ],
  },
  BA: { nome: "Bahia", zones: [{ tz: "America/Bahia", label: "Horário de Brasília (Salvador)" }] },
  CE: { nome: "Ceará", zones: [{ tz: "America/Fortaleza", label: "Horário de Brasília (Fortaleza)" }] },
  DF: { nome: "Distrito Federal", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  ES: { nome: "Espírito Santo", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  GO: { nome: "Goiás", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  MA: { nome: "Maranhão", zones: [{ tz: "America/Fortaleza", label: "Horário de Brasília (Fortaleza)" }] },
  MT: { nome: "Mato Grosso", zones: [{ tz: "America/Cuiaba", label: "Horário de Cuiabá" }] },
  MS: { nome: "Mato Grosso do Sul", zones: [{ tz: "America/Campo_Grande", label: "Horário de Campo Grande" }] },
  MG: { nome: "Minas Gerais", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  PA: {
    nome: "Pará",
    zones: [
      { tz: "America/Belem", label: "Leste do Pará (Belém)" },
      { tz: "America/Santarem", label: "Oeste do Pará (Santarém)" },
    ],
  },
  PB: { nome: "Paraíba", zones: [{ tz: "America/Fortaleza", label: "Horário de Brasília (Fortaleza)" }] },
  PR: { nome: "Paraná", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  PE: {
    nome: "Pernambuco",
    zones: [
      { tz: "America/Recife", label: "Horário de Brasília (Recife)" },
      { tz: "America/Noronha", label: "Fernando de Noronha" },
    ],
  },
  PI: { nome: "Piauí", zones: [{ tz: "America/Fortaleza", label: "Horário de Brasília (Fortaleza)" }] },
  RJ: { nome: "Rio de Janeiro", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  RN: { nome: "Rio Grande do Norte", zones: [{ tz: "America/Fortaleza", label: "Horário de Brasília (Fortaleza)" }] },
  RS: { nome: "Rio Grande do Sul", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  RO: { nome: "Rondônia", zones: [{ tz: "America/Porto_Velho", label: "Horário de Porto Velho" }] },
  RR: { nome: "Roraima", zones: [{ tz: "America/Boa_Vista", label: "Horário de Boa Vista" }] },
  SC: { nome: "Santa Catarina", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  SP: { nome: "São Paulo", zones: [{ tz: "America/Sao_Paulo", label: "Horário de Brasília" }] },
  SE: { nome: "Sergipe", zones: [{ tz: "America/Maceio", label: "Horário de Brasília (Maceió)" }] },
  TO: { nome: "Tocantins", zones: [{ tz: "America/Araguaina", label: "Horário de Brasília (Araguaína)" }] },
};

// Lista ordenada por nome, para o <select> de estado.
export const UF_OPTIONS = Object.keys(BR_UF_TIMEZONES)
  .map((uf) => ({ uf, nome: BR_UF_TIMEZONES[uf].nome, multiFuso: BR_UF_TIMEZONES[uf].zones.length > 1 }))
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

export function normalizeUf(uf) {
  const v = String(uf || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(BR_UF_TIMEZONES, v) ? v : "";
}

export function zonesForUf(uf) {
  const v = normalizeUf(uf);
  return v ? BR_UF_TIMEZONES[v].zones : [];
}

export function defaultTimezoneForUf(uf) {
  const zones = zonesForUf(uf);
  return zones.length ? zones[0].tz : "";
}

export function timezoneBelongsToUf(uf, tz) {
  return zonesForUf(uf).some((z) => z.tz === String(tz || "").trim());
}

export function ufNome(uf) {
  const v = normalizeUf(uf);
  return v ? BR_UF_TIMEZONES[v].nome : "";
}

export function timezoneLabel(tz) {
  const v = String(tz || "").trim();
  for (const uf of Object.keys(BR_UF_TIMEZONES)) {
    const found = BR_UF_TIMEZONES[uf].zones.find((z) => z.tz === v);
    if (found) return found.label;
  }
  return v;
}

// UF cujas zonas incluem tz (lookup reverso, para pré-selecionar o estado salvo).
export function ufForTimezone(tz) {
  const v = String(tz || "").trim();
  if (!v) return "";
  for (const uf of Object.keys(BR_UF_TIMEZONES)) {
    if (BR_UF_TIMEZONES[uf].zones.some((z) => z.tz === v)) return uf;
  }
  return "";
}

// UF só quando o timezone pertence a EXATAMENTE uma UF (ex.: America/Cuiaba → MT).
// Zonas compartilhadas (America/Sao_Paulo, Fortaleza, etc.) retornam "" para não
// pré-selecionar um estado errado quando a empresa ainda não escolheu a UF.
export function ufForUniqueTimezone(tz) {
  const v = String(tz || "").trim();
  if (!v) return "";
  const matches = Object.keys(BR_UF_TIMEZONES).filter((uf) =>
    BR_UF_TIMEZONES[uf].zones.some((z) => z.tz === v)
  );
  return matches.length === 1 ? matches[0] : "";
}
