/**
 * Contrato de POST /clientes (cadastro + flags opcionais de conversa/atendimento).
 */

/** Valor aceito pelo backend para flags booleanas opcionais */
export type FlagClientePost = boolean | "true" | "false";

export type CriarClientePayload = {
  telefone?: string | null;
  wa_id?: string | null;
  nome?: string | null;
  email?: string | null;
  empresa?: string | null;
  observacoes?: string | null;
  /** Cria ou encontra a conversa WhatsApp do cliente */
  abrir_conversa?: FlagClientePost;
  /** Abre conversa se precisar e assume para o usuário logado (implica abrir conversa) */
  assumir?: FlagClientePost;
};

/** Objeto de conversa retornado pelo backend (formato alinhado à lista / GET chats) */
export type ConversaResumo = {
  id?: number | string;
  [key: string]: unknown;
};

/** Cliente retornado no POST (campos principais; o backend pode enviar mais) */
export type ClienteBasico = {
  id?: number | string;
  [key: string]: unknown;
};

/**
 * Resposta de sucesso (201) de POST /clientes — cliente como hoje + metadados opcionais.
 */
export type CriarClienteResponse = ClienteBasico & {
  cliente?: ClienteBasico;
  data?: { cliente?: ClienteBasico };
  conversa?: ConversaResumo | null;
  conversa_criada?: boolean;
  /** Aviso quando o cliente foi criado mas não foi possível abrir conversa */
  conversa_aviso?: string | null;
  /** Quando pediu assumir mas falhou (ex.: setor, limite) */
  assumir_erro?: string | null;
  assumir_status?: number | string | null;
};
