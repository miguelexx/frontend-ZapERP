import type { ClienteBasico, ConversaResumo, CriarClienteResponse } from "./clientes.types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Extrai o objeto cliente da resposta (formatos aninhados ou raiz).
 */
export function clienteFromCriarClienteResponse(raw: unknown): ClienteBasico | null {
  if (!isRecord(raw)) return null;
  const fromData =
    isRecord(raw.data) && raw.data != null
      ? ((raw.data as Record<string, unknown>).cliente ?? raw.data)
      : undefined;
  const nested = (raw.cliente as unknown) ?? fromData ?? (raw.id != null ? raw : undefined);
  if (!isRecord(nested)) return null;
  return nested as ClienteBasico;
}

/**
 * Extrai a conversa quando o backend a envia em POST /clientes.
 */
export function conversaFromCriarClienteResponse(raw: unknown): ConversaResumo | null {
  if (!isRecord(raw)) return null;
  const c = (raw.conversa ?? raw.chat) as unknown;
  if (!isRecord(c)) return null;
  return c as ConversaResumo;
}

/**
 * Normaliza a resposta 201 de POST /clientes para consumo na UI.
 */
export function parsePostClientesResponse(raw: unknown): {
  cliente: ClienteBasico | null;
  conversa: ConversaResumo | null;
  conversa_criada: boolean | undefined;
  conversa_aviso: string | null;
  assumir_erro: string | null;
  assumir_status: number | string | null | undefined;
} {
  const r = raw as CriarClienteResponse | null | undefined;
  const cliente = clienteFromCriarClienteResponse(raw);
  const conversa = conversaFromCriarClienteResponse(raw);
  const conversa_aviso =
    typeof r?.conversa_aviso === "string" && r.conversa_aviso.trim() ? r.conversa_aviso.trim() : null;
  const assumir_erro =
    typeof r?.assumir_erro === "string" && r.assumir_erro.trim() ? r.assumir_erro.trim() : null;
  return {
    cliente,
    conversa: conversa?.id != null ? conversa : null,
    conversa_criada: r?.conversa_criada,
    conversa_aviso,
    assumir_erro,
    assumir_status: r?.assumir_status,
  };
}
