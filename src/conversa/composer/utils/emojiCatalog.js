/**
 * Catálogo do seletor de emojis no estilo WhatsApp: categorias na mesma ordem
 * do app (Smileys e pessoas → Bandeiras) + palavras-chave em português para a
 * busca por nome ("coração", "joinha", "rindo"...).
 *
 * Mantido separado de COMPOSER_EMOJIS (lista plana usada pelo EmojiPicker legado).
 */

export const EMOJI_CATEGORIES = [
  {
    id: "smileys",
    label: "Smileys e pessoas",
    emojis: [
      "😀","😃","😄","😁","😆","😅","😂","🤣","🥲","🥹","☺️","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
      "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","🙄","😬","🤥","😔","😪","🤤","😴",
      "😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🤡","🤗","🤔","🫡","🤭","🫢","🫣","🤫","🫠",
      "🥱","😮","😯","😲","😳","🥺","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","😤","😡","😠","🤬",
      "😈","👿","💀","💩",
      "👍","👎","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤝",
      "🙏","✍️","💪","🦾","🫶","🤲","🙌","👏","🫵","🖕",
      "🙋","🙆","🙅","💁","🤷","🤦","👀","👁️","👂","👃","👄","🧠","🦷",
    ],
  },
  {
    id: "nature",
    label: "Animais e natureza",
    emojis: [
      "🐶","🐱","🐰","🦊","🐻","🐼","🐨","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦄","🐝","🦋",
      "🌸","🌺","🌻","🌹","🌷","🌱","🌳","🍀","🍁",
      "☀️","🌤️","⛅","☁️","🌧️","⛈️","🌈","❄️","☃️","🌊","💧",
    ],
  },
  {
    id: "food",
    label: "Comidas e bebidas",
    emojis: [
      "🍎","🍊","🍋","🍓","🍉","🍇","🍌","🥑","🍕","🍔","🍟","🍿","🎂","🍰","🧁","🍪","🍫","🍬","🍭","🍩",
      "☕","🍵","🥤","🍺","🍻","🥂","🍷",
    ],
  },
  {
    id: "activities",
    label: "Atividades",
    emojis: [
      "⚽","🏀","🏈","🎾","🎮","🎲","🎸","🎤","🎬","🎧","🎵",
      "🎉","🎊","🎁","🏆","🥇","🥈","🥉","🎯","👑",
    ],
  },
  {
    id: "travel",
    label: "Viagens e lugares",
    emojis: ["🚗","🚕","🚌","🚚","✈️","🚀","🚢","⛵","🏠","🏢","🏥","🏦","🌍","🗺️","🧭"],
  },
  {
    id: "objects",
    label: "Objetos",
    emojis: [
      "📞","☎️","📱","💻","🖥️","⌨️","🖨️","📺","📷","🎥","🎙️","📧","📨","📩","📤","📥","📦","📝","✏️","🖊️",
      "📄","📃","📑","📋","📊","📈","📉","📁","📂","🗂️","🗃️","🔖","🏷️","📎","🖇️","📌","📍","📅","📆","🗓️",
      "⏰","⏱️","⌛","⏳","🕒","🔒","🔓","🔑","🔔","🔕","📢","📣","🔊","🔗","⚙️","🛠️","🔧","🔨","🧰","✂️",
      "🗑️","🔍","🔎","💡","🧾","💰","💵","💳","🪙","🧮","💸",
    ],
  },
  {
    id: "symbols",
    label: "Símbolos",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","❤️‍🔥","💌",
      "💯","💢","💥","💫","✨","⭐","🌟","⚡","🔥","💦","💨","💬","🗨️","💭",
      "✅","❌","⚠️","❗","❓","‼️","➡️","⬅️","⬆️","⬇️","🔄","🔁","▶️","⏸️","⏹️","🆗","🆕","🔝",
    ],
  },
  {
    id: "flags",
    label: "Bandeiras",
    emojis: ["🏁","🚩","🏳️","🏴","🏳️‍🌈","🇧🇷","🇵🇹","🇺🇸","🇦🇷","🇺🇾","🇵🇾","🇨🇱","🇲🇽","🇪🇸","🇮🇹","🇫🇷","🇩🇪","🇬🇧","🇯🇵","🇨🇦"],
  },
];

/** Palavras-chave (pt-BR) por emoji — alimentam a busca por nome. */
const EMOJI_KEYWORDS = {
  "😀": "sorriso feliz rosto alegre", "😃": "sorriso feliz alegre", "😄": "sorriso feliz rindo alegre",
  "😁": "sorriso dentes feliz", "😆": "rindo risada feliz", "😅": "rindo suor nervoso alivio",
  "😂": "chorando de rir risada kkk lagrimas", "🤣": "rolando de rir risada kkk gargalhada",
  "🥲": "sorriso lagrima emocionado", "🥹": "emocionado fofo olhos", "☺️": "sorriso timido corado",
  "😊": "sorriso timido corado feliz", "😇": "anjo inocente aureola", "🙂": "sorriso leve",
  "🙃": "de cabeca para baixo ironia", "😉": "piscando piscadinha", "😌": "aliviado calmo",
  "😍": "apaixonado coracao olhos amor", "🥰": "apaixonado coracoes amor carinho", "😘": "beijo coracao amor",
  "😗": "beijo", "😙": "beijo sorriso", "😚": "beijo olhos fechados", "😋": "delicia gostoso lingua",
  "😛": "lingua", "😝": "lingua olhos fechados", "😜": "lingua piscando brincadeira", "🤪": "maluco doido louco",
  "🤨": "desconfiado sobrancelha", "🧐": "monoculo analisando", "🤓": "nerd oculos", "😎": "oculos escuros legal top",
  "🥸": "disfarce", "🤩": "estrelas maravilhado", "🥳": "festa comemoracao aniversario", "😏": "sorriso malicioso",
  "😒": "entediado sem graca", "🙄": "revirando olhos", "😬": "careta constrangido", "🤥": "mentiroso pinoquio",
  "😔": "triste pensativo", "😪": "sono cansado", "🤤": "babando", "😴": "dormindo sono zzz",
  "😷": "mascara doente", "🤒": "termometro febre doente", "🤕": "machucado", "🤢": "enjoado nausea",
  "🤮": "vomitando", "🤧": "espirro gripe", "🥵": "calor quente", "🥶": "frio congelando", "🥴": "tonto bebado",
  "😵": "tonto zonzo", "🤯": "cabeca explodindo chocado", "🤠": "cowboy chapeu", "🤡": "palhaco",
  "🤗": "abraco", "🤔": "pensando duvida hmm", "🫡": "continencia saudacao", "🤭": "mao na boca risinho",
  "🫢": "surpreso mao na boca", "🫣": "espiando vergonha", "🤫": "silencio segredo", "🫠": "derretendo",
  "🥱": "bocejo sono tedio", "😮": "surpreso boca aberta", "😯": "surpreso", "😲": "espantado chocado",
  "😳": "envergonhado corado", "🥺": "pidao implorando por favor", "😨": "assustado medo", "😰": "ansioso suor",
  "😥": "triste aliviado", "😢": "chorando triste lagrima", "😭": "chorando muito triste", "😱": "gritando medo",
  "😖": "confuso frustrado", "😣": "perseverante", "😞": "desapontado triste", "😓": "suor frio",
  "😩": "exausto cansado", "😫": "cansado", "😤": "bufando bravo", "😡": "bravo raiva irritado",
  "😠": "bravo raiva", "🤬": "palavrao xingando raiva", "😈": "diabinho malicia", "👿": "diabo bravo",
  "💀": "caveira morto morri", "💩": "coco",
  "👍": "joinha positivo legal ok curti like", "👎": "negativo nao gostei deslike", "👌": "ok perfeito beleza",
  "🤌": "italiano dedos juntos", "🤏": "pouquinho pequeno", "✌️": "paz vitoria", "🤞": "dedos cruzados sorte",
  "🫰": "coracao dedos", "🤟": "te amo", "🤘": "rock", "🤙": "me liga hang loose", "👈": "esquerda apontando",
  "👉": "direita apontando", "👆": "cima apontando", "👇": "baixo apontando", "☝️": "um apontando atencao",
  "✋": "mao pare", "🤚": "mao", "🖐️": "mao aberta cinco", "🖖": "vulcano", "👋": "tchau ola oi acenando",
  "🤝": "aperto de mao acordo negocio fechado parceria", "🙏": "por favor obrigado reza amem gratidao",
  "✍️": "escrevendo", "💪": "forca musculo forte", "🦾": "braco mecanico forca", "🫶": "coracao maos amor",
  "🤲": "maos", "🙌": "comemorando aleluia maos", "👏": "palmas aplausos parabens", "🫵": "voce apontando",
  "🙋": "levantando a mao", "🙆": "ok gesto", "🙅": "nao gesto", "💁": "informacao", "🤷": "sei la tanto faz",
  "🤦": "facepalm vergonha", "👀": "olhos olhando de olho", "👁️": "olho", "👂": "orelha ouvido", "👃": "nariz",
  "👄": "boca", "🧠": "cerebro inteligente", "🦷": "dente",
  "🐶": "cachorro cao", "🐱": "gato", "🐰": "coelho", "🦊": "raposa", "🐻": "urso", "🐼": "panda",
  "🐨": "coala", "🦁": "leao", "🐮": "vaca", "🐷": "porco", "🐸": "sapo", "🐵": "macaco", "🐔": "galinha",
  "🐧": "pinguim", "🐦": "passaro", "🦄": "unicornio", "🐝": "abelha", "🦋": "borboleta", "🌸": "flor cerejeira",
  "🌺": "flor hibisco", "🌻": "girassol", "🌹": "rosa flor", "🌷": "tulipa flor", "🌱": "planta broto",
  "🌳": "arvore", "🍀": "trevo sorte", "🍁": "folha outono", "☀️": "sol", "🌤️": "sol nuvem", "⛅": "nublado",
  "☁️": "nuvem", "🌧️": "chuva", "⛈️": "tempestade", "🌈": "arco iris", "❄️": "neve frio", "☃️": "boneco de neve",
  "🌊": "onda mar praia", "💧": "gota agua",
  "🍎": "maca", "🍊": "laranja", "🍋": "limao", "🍓": "morango", "🍉": "melancia", "🍇": "uva", "🍌": "banana",
  "🥑": "abacate", "🍕": "pizza", "🍔": "hamburguer lanche", "🍟": "batata frita", "🍿": "pipoca",
  "🎂": "bolo aniversario", "🍰": "bolo fatia doce", "🧁": "cupcake", "🍪": "biscoito cookie",
  "🍫": "chocolate", "🍬": "bala doce", "🍭": "pirulito", "🍩": "rosquinha donut", "☕": "cafe",
  "🍵": "cha", "🥤": "refrigerante copo", "🍺": "cerveja", "🍻": "brinde cerveja", "🥂": "brinde champanhe",
  "🍷": "vinho",
  "⚽": "futebol bola", "🏀": "basquete", "🏈": "futebol americano", "🎾": "tenis", "🎮": "videogame jogo",
  "🎲": "dado jogo", "🎸": "guitarra", "🎤": "microfone cantar", "🎬": "filme cinema", "🎧": "fone musica",
  "🎵": "musica nota", "🎉": "festa parabens comemoracao", "🎊": "confete festa", "🎁": "presente",
  "🏆": "trofeu campeao", "🥇": "medalha ouro primeiro", "🥈": "medalha prata segundo", "🥉": "medalha bronze terceiro",
  "🎯": "alvo meta objetivo", "👑": "coroa rei rainha",
  "🚗": "carro", "🚕": "taxi", "🚌": "onibus", "🚚": "caminhao entrega frete", "✈️": "aviao viagem",
  "🚀": "foguete lancamento", "🚢": "navio", "⛵": "barco", "🏠": "casa", "🏢": "predio empresa escritorio",
  "🏥": "hospital", "🏦": "banco", "🌍": "mundo planeta terra", "🗺️": "mapa", "🧭": "bussola",
  "📞": "telefone ligar", "☎️": "telefone", "📱": "celular", "💻": "notebook computador", "🖥️": "computador",
  "⌨️": "teclado", "🖨️": "impressora", "📺": "televisao tv", "📷": "camera foto", "🎥": "camera video",
  "🎙️": "microfone audio", "📧": "email", "📨": "email recebido", "📩": "envelope email", "📤": "enviado saida",
  "📥": "recebido entrada", "📦": "caixa pacote pedido entrega", "📝": "anotacao nota", "✏️": "lapis",
  "🖊️": "caneta", "📄": "documento pagina", "📃": "documento", "📑": "abas", "📋": "prancheta lista",
  "📊": "grafico barras", "📈": "grafico subindo crescimento", "📉": "grafico caindo queda", "📁": "pasta",
  "📂": "pasta aberta", "🗂️": "divisorias", "🗃️": "arquivo", "🔖": "marcador", "🏷️": "etiqueta preco",
  "📎": "clipe anexo", "🖇️": "clipes", "📌": "alfinete fixar", "📍": "localizacao pino", "📅": "calendario data",
  "📆": "calendario", "🗓️": "agenda calendario", "⏰": "despertador alarme", "⏱️": "cronometro",
  "⌛": "ampulheta tempo", "⏳": "ampulheta aguardando", "🕒": "relogio hora", "🔒": "cadeado fechado",
  "🔓": "cadeado aberto", "🔑": "chave", "🔔": "sino notificacao", "🔕": "silencio sem notificacao",
  "📢": "alto falante aviso", "📣": "megafone anuncio", "🔊": "som volume", "🔗": "link corrente",
  "⚙️": "engrenagem configuracao", "🛠️": "ferramentas", "🔧": "chave inglesa", "🔨": "martelo",
  "🧰": "caixa de ferramentas", "✂️": "tesoura", "🗑️": "lixeira lixo", "🔍": "lupa busca", "🔎": "lupa busca",
  "💡": "ideia lampada", "🧾": "recibo nota fiscal", "💰": "dinheiro saco", "💵": "dinheiro nota dolar",
  "💳": "cartao credito", "🪙": "moeda", "🧮": "calculadora abaco", "💸": "dinheiro voando gasto",
  "❤️": "coracao vermelho amor", "🧡": "coracao laranja", "💛": "coracao amarelo", "💚": "coracao verde",
  "💙": "coracao azul", "💜": "coracao roxo", "🤎": "coracao marrom", "🖤": "coracao preto", "🤍": "coracao branco",
  "💔": "coracao partido", "❣️": "coracao exclamacao", "💕": "coracoes amor", "💞": "coracoes girando",
  "💓": "coracao batendo", "💗": "coracao crescendo", "💖": "coracao brilhando", "💘": "coracao flecha",
  "💝": "coracao presente", "💟": "coracao", "❤️‍🔥": "coracao pegando fogo", "💌": "carta de amor",
  "💯": "cem 100 perfeito", "💢": "raiva", "💥": "explosao", "💫": "tonto estrela", "✨": "brilho",
  "⭐": "estrela", "🌟": "estrela brilhando", "⚡": "raio energia", "🔥": "fogo top", "💦": "gotas suor",
  "💨": "vento rapido", "💬": "balao conversa mensagem", "🗨️": "balao fala", "💭": "pensamento",
  "✅": "certo ok feito check concluido", "❌": "errado x cancelar", "⚠️": "atencao alerta aviso",
  "❗": "exclamacao importante", "❓": "pergunta interrogacao duvida", "‼️": "exclamacao dupla",
  "➡️": "seta direita", "⬅️": "seta esquerda", "⬆️": "seta cima", "⬇️": "seta baixo", "🔄": "atualizar repetir",
  "🔁": "repetir", "▶️": "play", "⏸️": "pausa", "⏹️": "parar", "🆗": "ok", "🆕": "novo", "🔝": "top",
  "🏁": "bandeira quadriculada chegada", "🚩": "bandeira vermelha", "🏳️": "bandeira branca",
  "🏴": "bandeira preta", "🏳️‍🌈": "bandeira arco iris lgbt", "🇧🇷": "brasil bandeira", "🇵🇹": "portugal",
  "🇺🇸": "estados unidos eua", "🇦🇷": "argentina", "🇺🇾": "uruguai", "🇵🇾": "paraguai", "🇨🇱": "chile",
  "🇲🇽": "mexico", "🇪🇸": "espanha", "🇮🇹": "italia", "🇫🇷": "franca", "🇩🇪": "alemanha",
  "🇬🇧": "reino unido inglaterra", "🇯🇵": "japao", "🇨🇦": "canada",
};

export function normalizeSearchText(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const SEARCH_INDEX = EMOJI_CATEGORIES.flatMap((category) =>
  category.emojis.map((emoji) => ({
    emoji,
    text: normalizeSearchText(`${EMOJI_KEYWORDS[emoji] || ""} ${category.label}`),
  }))
);

/** Busca por nome em português (sem acento) ou pelo próprio emoji colado. */
export function searchEmojis(query) {
  const raw = String(query || "").trim();
  const q = normalizeSearchText(raw);
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const item of SEARCH_INDEX) {
    if (seen.has(item.emoji)) continue;
    const hit = item.emoji === raw || terms.every((term) => item.text.includes(term));
    if (hit) {
      seen.add(item.emoji);
      out.push(item.emoji);
    }
  }
  return out;
}

const RECENTS_KEY = "zaperp.emojiRecents.v1";
export const EMOJI_RECENTS_LIMIT = 24;

export function readRecentEmojis() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string" && e).slice(0, EMOJI_RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji, current) {
  const next = [emoji, ...(current || []).filter((e) => e !== emoji)].slice(0, EMOJI_RECENTS_LIMIT);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* modo privado / storage bloqueado: recentes ficam só na sessão */
  }
  return next;
}
