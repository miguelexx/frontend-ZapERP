/**
 * Cor do avatar por contacto (26/11/2026).
 *
 * MESMO algoritmo e MESMA semente da lista (`getAvatarColor` em chats/ChatListRow.jsx):
 * `displayName || phone || id`. Assim o "MS" verde-oliva da lista continua verde-oliva no
 * cabeçalho, no painel do contato e no modal de transferência, em vez de virar cinza.
 *
 * OKLCH, nunca HSL (doc 14, "Selos e cor por contacto"): `52% 0.12` dá ≥ 4.95:1 para o
 * branco das iniciais em toda a volta do matiz. Em HSL o contraste ia de 2.36:1 a 10.38:1.
 *
 * TODO(lista): o ChatListRow ainda tem a sua cópia privada; ao mexer lá, importar daqui.
 */
export function getAvatarColor(seed = "") {
  const s = String(seed ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `oklch(52% 0.12 ${hue})`;
}

/**
 * Iniciais do avatar SÓ com letras (`\p{L}`) — 27/11/2026, um único helper para a thread.
 *
 * MESMA regra da lista (`initials` em chats/ChatListRow.jsx) e do painel do contato: a 1.ª letra
 * da primeira e da última palavra que tenham alguma letra. Sem letra nenhuma (telefone
 * formatado, emoji, pontuação) devolve "" — quem chama desenha o boneco/ícone de grupo.
 *
 * Antes cada lugar tinha a sua cópia ingênua (`palavra[0]`): "(11) 98765-4321" virava "(9",
 * "Esposa — Joana" virava "E—" e "+55 11…" virava "+1" no visualizador de mídia, no cartão de
 * contato e nos participantes do grupo.
 */
export function avatarInitials(nome = "") {
  const letraDe = (palavra) => {
    try {
      return palavra.match(/\p{L}/u)?.[0] || "";
    } catch {
      return palavra.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/)?.[0] || "";
    }
  };
  const letras = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .map(letraDe)
    .filter(Boolean);
  if (!letras.length) return "";
  const a = letras[0];
  const b = letras.length > 1 ? letras[letras.length - 1] : "";
  return (a + b).toUpperCase();
}
