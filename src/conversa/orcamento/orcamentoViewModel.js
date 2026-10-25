/**
 * Modelo de exibição da prévia e do resultado do orçamento WM.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (seção 6.5 — as quatro
 * perguntas que a prévia responde; Sessão 5B).
 * Contrato: `backend/docs/wm/Integracao-ZapERP-API-WM-Atualizacao-2026-10-20` — §8 e §8.1
 * (prévia e preço), §10 e §11.1 (resultado da criação).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA LÓGICA NÃO VIVE DENTRO DO JSX
 * ────────────────────────────────────────────────────────────────────────────
 * As regras daqui são justamente as que quebram em silêncio: um total somado no cliente, um
 * preço derivado de `valor_total / quantidade`, um `cache_cloud` rotulado como "atual". Dentro
 * do JSX elas só se provariam renderizando componente; aqui são funções puras com teste em
 * Node, que é o que a suíte do frontend sabe rodar. O componente fica burro de propósito: ele
 * imprime o que este módulo decidiu.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A ARITMÉTICA PROIBIDA
 * ────────────────────────────────────────────────────────────────────────────
 * Não existe uma única operação `+`, `*` ou `/` sobre valor monetário neste arquivo, e isso é
 * invariante, não estilo. §8.1 do guia proíbe recalcular preço; os totais (`valor_produtos`,
 * `valor_total`, `itens[].valor_total`) são o que a WM calculou, e é por eles que o ERP vai
 * gravar. Somar os itens aqui produziria, na melhor hipótese, o mesmo número — e na pior, um
 * total diferente do que será criado, com a tela parecendo mais confiável que a verdade.
 *
 * Campo ausente ou fora do padrão decimal chega como `null` do backend e sai daqui como "—"
 * (`formatMoedaOrcamento`), nunca "R$ 0,00": um zero plausível seria aprovado sem pestanejar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ORIGEM DO DADO: NUNCA CHAMAR CÓPIA DE "ATUAL"
 * ────────────────────────────────────────────────────────────────────────────
 * `meta.fonte` é opcional no contrato (o `openapi.yaml` modela `meta` apenas como `object`):
 *   · `tempo_real` comprovado ⇒ pode dizer "agora";
 *   · qualquer outra fonte conhecida (`cache_cloud`) ⇒ fala em CÓPIA, sem "atual"/"agora";
 *   · fonte ausente ⇒ **não se escreve nada**. Inventar "atual" num dado sem procedência é o
 *     erro que faz o atendente defender um preço que o ERP não vai honrar.
 */

import {
  formatMoedaOrcamento,
  formatQuantidadeExibicao,
  formatQuantidadeOrcamento,
  textoOuSemValor,
  normalizarQuantidadeParaEnvio,
  SEM_VALOR,
} from "./orcamentoFormat.js";

/* ------------------------------------------------------------------ *
 * Origem do dado
 * ------------------------------------------------------------------ */

/** Fonte conhecida que NÃO é tempo real. Explícita para não virar "atual" por descuido. */
export const FONTE_CACHE = "cache_cloud";

/**
 * Frase de procedência dos valores, ou `null` quando não há procedência a afirmar.
 *
 * @param {{fonte?: string|null, tempo_real?: boolean}|null|undefined} meta `previa.meta`
 * @returns {{ texto: string, tempoReal: boolean }|null}
 */
export function rotuloFonte(meta) {
  if (!meta || typeof meta !== "object") return null;
  if (meta.tempo_real === true) {
    return { texto: "Valores consultados agora no sistema da empresa.", tempoReal: true };
  }
  const fonte = typeof meta.fonte === "string" ? meta.fonte.trim() : "";
  if (!fonte) return null;
  // Qualquer fonte que não seja tempo real comprovado é tratada como cópia. "Atual", "agora" e
  // "em tempo real" são palavras proibidas neste ramo.
  return {
    texto: "Valores vindos de uma cópia do sistema da empresa — podem ter mudado desde então.",
    tempoReal: false,
  };
}

/* ------------------------------------------------------------------ *
 * Política de bloqueio, em linguagem de negócio
 * ------------------------------------------------------------------ */

/**
 * Traduz `bloquear_apos_criar` sem usar o nome técnico.
 * Não booleano ⇒ `null`: o backend sempre resolve a política, e se um dia não resolver é melhor
 * calar do que afirmar que o orçamento fica (ou não fica) protegido.
 */
export function textoBloqueio(bloquear) {
  if (bloquear === true) {
    return "Depois de criado, o orçamento fica protegido contra alteração no sistema da empresa.";
  }
  if (bloquear === false) {
    return "Depois de criado, o orçamento continua podendo ser alterado no sistema da empresa.";
  }
  return null;
}

/** Estado de proteção JÁ APLICADO — vem do resultado da criação, não da política da prévia. */
export function textoBloqueado(bloqueado) {
  if (bloqueado === true) return "Está protegido contra alteração no sistema da empresa.";
  if (bloqueado === false) return "Pode ser alterado no sistema da empresa.";
  return null;
}

/* ------------------------------------------------------------------ *
 * Preço com mais de duas casas
 * ------------------------------------------------------------------ */

/**
 * A WM serializa preço como `0.00##` invariant e manda três casas quando precisa (`"33.038"`).
 * `formatMoedaOrcamento` exibe moeda em duas casas — então `33.038` aparece como `R$ 33,04`,
 * que é a forma correta de mostrar dinheiro, mas esconde a terceira casa.
 *
 * Esta função devolve o valor EXATO como a WM mandou (só a vírgula decimal trocada) quando há
 * casa além da segunda, para a área de detalhes mostrar o número sem corte. `null` quando duas
 * casas bastam — nada de repetir o mesmo número na tela.
 */
export function precoExatoTexto(valor) {
  if (typeof valor !== "string") return null;
  const decimais = valor.trim().split(".")[1];
  if (!decimais || decimais.length <= 2) return null;
  const exato = formatQuantidadeOrcamento(valor);
  return exato === SEM_VALOR ? null : exato;
}

/* ------------------------------------------------------------------ *
 * O termo dentro do texto: início de palavra × meio de palavra
 * ------------------------------------------------------------------ *
 * A busca da WM casa QUALQUER TRECHO da descrição, inclusive no meio de outra palavra.
 * Medido ao vivo no ERP da empresa 20 em 25/10:
 *
 *   `cimento` → 6 produtos, e 5 deles são "ARREFECIMENTO"/"ARREFICIMENTO" (radiador, líquido)
 *   `cimen`   → 7 produtos, 5 do mesmo ruído
 *   `tinta`   → 17, nenhum ruído   ·   `oleo` → 181, nenhum ruído   ·   `cabo` → 144, idem
 *
 * Ou seja: num termo central do vocabulário de quem atende, 83% do resultado era lixo — e ela
 * não tinha como saber por que aquilo estava ali. A loja é revenda de peças agrícolas e
 * automotivas; "só um cimento" é o dado certo, o problema é o que vinha em volta.
 *
 * A WM é quem decide o que entra na página; nós decidimos a ORDEM em que a página é lida.
 * Um candidato é RELEVANTE quando o termo INICIA uma palavra da descrição ou da marca, e é
 * RUÍDO quando só aparece grudado no meio de outra. Ruído não some — às vezes é exatamente o
 * que a pessoa quer —, ele vai para baixo de um título que diz o que ele é.
 *
 * "Palavra" aqui é separada por qualquer caractere que não seja letra ou dígito, porque é
 * assim que o catálogo escreve: `R-1892`, `EXT/INT`, `AL221117 - RADIADOR`, `CP 2 E 32 50KG`.
 * Acento e caixa não contam (`ÓLEO` casa `oleo`), e `AL221117` NÃO casa `221117` — ali o
 * número é miolo de um código, não uma palavra.
 */

/**
 * Texto comparável (sem acento, sem caixa) com o índice ORIGINAL de cada caractere.
 *
 * O índice é o que permite destacar o trecho casado no texto como ele é: `"ÓLEO".normalize()`
 * muda o comprimento da string, e fatiar o original por posições medidas na forma normalizada
 * cortaria a descrição no lugar errado.
 */
function normalizarComIndices(texto) {
  const origem = String(texto ?? "");
  let normalizado = "";
  const inicios = [];
  const fins = [];
  for (let i = 0; i < origem.length; i += 1) {
    const base = origem[i]
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    for (const c of base) {
      normalizado += c;
      inicios.push(i);
      fins.push(i + 1);
    }
  }
  return { origem, normalizado, inicios, fins };
}

/** Forma comparável de um termo digitado: sem acento, sem caixa, sem espaço sobrando. */
function normalizarTermo(termo) {
  return normalizarComIndices(String(termo ?? "").trim().replace(/\s+/g, " ")).normalizado;
}

/** Letra ou dígito — o resto (espaço, `-`, `/`, `.`, parêntese…) separa palavras. */
function ehLetraOuDigito(caractere) {
  return Boolean(caractere) && /[a-z0-9]/.test(caractere);
}

/**
 * Onde o termo aparece no texto, em posições do texto ORIGINAL.
 *
 * @returns {{ ini: number, fim: number, inicioDePalavra: boolean }[]}
 */
function ocorrenciasDoTermo(texto, termo) {
  const alvo = normalizarComIndices(texto);
  const agulha = normalizarTermo(termo);
  if (!agulha || !alvo.normalizado) return [];
  const achados = [];
  let de = 0;
  for (;;) {
    const pos = alvo.normalizado.indexOf(agulha, de);
    if (pos < 0) break;
    const anterior = pos > 0 ? alvo.normalizado[pos - 1] : "";
    achados.push({
      ini: alvo.inicios[pos],
      fim: alvo.fins[pos + agulha.length - 1],
      inicioDePalavra: pos === 0 || !ehLetraOuDigito(anterior),
    });
    de = pos + agulha.length;
  }
  return achados;
}

/**
 * O termo inicia alguma palavra da descrição ou da marca deste candidato?
 *
 * Sem termo utilizável nada é classificado como ruído: a lista continua exatamente como a WM a
 * mandou. Rebaixar item por uma regra que não se aplica seria pior que não ordenar.
 */
export function candidatoRelevante(produto, termo) {
  if (!normalizarTermo(termo)) return true;
  const campos = [produto?.descricao, produto?.marca];
  return campos.some((campo) =>
    ocorrenciasDoTermo(campo, termo).some((o) => o.inicioDePalavra)
  );
}

/**
 * Parte a lista em relevantes e ruído, **preservando a ordem da WM dentro de cada grupo**.
 *
 * Isto reordena só a página que já está na mão. Não há filtro, não há contagem nova e a
 * paginação continua sendo a da WM: um produto que esteja na página 4 continua na página 4.
 */
export function separarCandidatosPorRelevancia(produtos, termo) {
  const lista = Array.isArray(produtos) ? produtos : [];
  if (!normalizarTermo(termo)) return { relevantes: lista.slice(), ruido: [] };
  const relevantes = [];
  const ruido = [];
  for (const p of lista) (candidatoRelevante(p, termo) ? relevantes : ruido).push(p);
  return { relevantes, ruido };
}

/**
 * O texto em pedaços, marcando o trecho que casou — é o "por que este item apareceu".
 *
 * Com `ARREFECIMENTO` destacado em `cimento`, a lista se explica sozinha em vez de parecer
 * quebrada. Só os primeiros `maximo` trechos são marcados: um termo curto que se repete muitas
 * vezes transformaria a descrição numa sequência de listras ilegíveis.
 *
 * @returns {{ texto: string, destaque: boolean }[]} sempre com ao menos um pedaço quando há texto
 */
export function fatiarDestaque(texto, termo, { maximo = 3 } = {}) {
  const origem = String(texto ?? "");
  if (!origem) return [];
  const achados = ocorrenciasDoTermo(origem, termo).slice(0, Math.max(0, maximo));
  if (!achados.length) return [{ texto: origem, destaque: false }];
  const pedacos = [];
  let cursor = 0;
  for (const { ini, fim } of achados) {
    if (ini > cursor) pedacos.push({ texto: origem.slice(cursor, ini), destaque: false });
    pedacos.push({ texto: origem.slice(ini, fim), destaque: true });
    cursor = fim;
  }
  if (cursor < origem.length) pedacos.push({ texto: origem.slice(cursor), destaque: false });
  return pedacos;
}

/** Título do bloco de ruído. Diz o que aquilo é, em vez de deixar a pessoa adivinhar. */
export function tituloCandidatosRuido(termo) {
  const limpo = String(termo ?? "").trim().replace(/\s+/g, " ");
  return limpo ? `Também contêm "${limpo}"` : "Também contêm o termo pesquisado";
}

/* ------------------------------------------------------------------ *
 * Candidatos de produto — correspondência exata × "outros com essa palavra"
 * ------------------------------------------------------------------ *
 * A WM resolve a busca direto num único produto quando o termo digitado é IGUAL à descrição
 * normalizada de algum item do catálogo — e nesse caso ela NÃO lista os outros que contêm a
 * palavra. Medido ao vivo na empresa 20: `filtro` devolvia 1 (existe um produto chamado
 * literalmente "FILTRO") enquanto `filtr` devolvia 468. Para a atendente, parecia que o
 * sistema não puxava todos os produtos.
 *
 * O backend passou a revelar os escondidos (doc 36, seção 10, pendência 15) e marca na
 * resposta o que é a correspondência exata e o que são os demais. Esta função é a tradução
 * disso para a tela — e é pura de propósito: o agrupamento é regra, não JSX.
 *
 * Quando não há dois grupos (produto resolvido sozinho, ou lista comum), `exato` é `null` e a
 * tela imprime uma lista só, exatamente como antes. Rotular um item como "exato" sem haver
 * outros com que contrastar seria ruído.
 */

/**
 * @param {object|null|undefined} data corpo de `POST /api/orcamentos/produtos/consultar`
 * @param {string} [termo] o que foi efetivamente consultado — usado para separar relevante de
 *   ruído e para destacar o trecho casado. Ausente, a lista sai na ordem exata da WM.
 * @returns {{ exato: object|null, outros: object[], lista: object[], relevantes: object[],
 *            ruido: object[], paginacao: object|null, metaDoPrecificado: object|null,
 *            termo: string }}
 */
export function agruparCandidatosProduto(data, termo = "") {
  const buscado = String(termo ?? "").trim().replace(/\s+/g, " ");
  const vazio = {
    exato: null,
    outros: [],
    lista: [],
    relevantes: [],
    ruido: [],
    paginacao: null,
    metaDoPrecificado: null,
    termo: buscado,
  };
  if (!data || typeof data !== "object") return vazio;

  const paginacao = data.paginacao && typeof data.paginacao === "object" ? data.paginacao : null;

  // Procedência dos valores do produto que TEM preço. Nos dois ramos ela vem de lugares
  // diferentes, e trocá-las rotularia o preço com a fonte errada.
  const metaDoPrecificado =
    data.status === "produto" ? data.meta ?? null : data.correspondencia_exata_meta ?? null;

  // Produto resolvido sem irmãos revelados: uma linha só, sem rótulo e sem paginação (a WM não
  // manda paginação no ramo resolvido). Ele traz preço e estoque, e o card os mostra.
  if (data.status === "produto" && data.produto) {
    return {
      exato: null,
      outros: [],
      lista: [data.produto],
      relevantes: [data.produto],
      ruido: [],
      paginacao: null,
      metaDoPrecificado,
      termo: buscado,
    };
  }

  const comCodigo = (p) => Boolean(p && typeof p === "object" && p.codigo_produto_erp);
  const produtos = Array.isArray(data.produtos) ? data.produtos.filter(comCodigo) : [];

  const exato = comCodigo(data.correspondencia_exata) ? data.correspondencia_exata : null;
  if (!exato) {
    const { relevantes, ruido } = separarCandidatosPorRelevancia(produtos, buscado);
    return {
      exato: null,
      outros: [],
      // A lista única já sai NA ORDEM EM QUE A TELA A IMPRIME: é ela que o Enter usa para
      // adicionar "o primeiro", e o primeiro precisa ser o primeiro que a pessoa vê.
      lista: [...relevantes, ...ruido],
      relevantes,
      ruido,
      paginacao,
      metaDoPrecificado: null,
      termo: buscado,
    };
  }

  const brutos = Array.isArray(data.outros_com_a_palavra) ? data.outros_com_a_palavra : produtos;
  const outros = brutos.filter(
    (p) => comCodigo(p) && p.codigo_produto_erp !== exato.codigo_produto_erp
  );

  // Marcado como exato mas sem ninguém para contrastar: volta a ser uma lista simples.
  if (!outros.length) {
    return {
      exato: null,
      outros: [],
      lista: [exato],
      relevantes: [exato],
      ruido: [],
      paginacao,
      metaDoPrecificado,
      termo: buscado,
    };
  }

  // A correspondência exata não passa pela régua: ela é o produto cujo nome É o termo, e o
  // backend já a marcou. Quem se reordena são os outros.
  //
  // E a régua tem de usar o termo com que os OUTROS foram de fato buscados. Para revelar os
  // irmãos escondidos, o backend reconsulta com o termo encurtado (pendência 15) e diz qual foi
  // em `termo_dos_outros`: `filtro` → `filtr`. Classificar "FILTRANTE" contra `filtro` o mandaria
  // para um bloco dizendo que ele contém uma palavra que ele não contém.
  const termoDosOutros =
    typeof data.termo_dos_outros === "string" && data.termo_dos_outros.trim()
      ? data.termo_dos_outros.trim()
      : buscado;
  const { relevantes, ruido } = separarCandidatosPorRelevancia(outros, termoDosOutros);
  return {
    exato,
    outros,
    lista: [exato, ...relevantes, ...ruido],
    relevantes,
    ruido,
    paginacao,
    metaDoPrecificado,
    termo: termoDosOutros,
  };
}

/**
 * Texto do estado vazio da busca de produto.
 *
 * A busca da WM casa descrição/marca **por ocorrência do trecho** (`docs/wm/04-contratos-api.md`),
 * então a ORDEM das palavras importa: medido na empresa 20, `filtro oleo` acha e `oleo filtro`
 * devolve `PRODUTO_NAO_ENCONTRADO`. Quem digitou duas palavras e não achou nada precisa saber
 * disso — senão conclui que o produto não existe no sistema.
 *
 * Isto é só texto: nenhuma busca alternativa é disparada por conta própria (cada chamada à WM
 * pode custar dinheiro — seção 11 do doc 36).
 *
 * @param {string} termo o que a pessoa digitou
 * @returns {string}
 */
export function mensagemBuscaSemResultado(termo) {
  const limpo = String(termo ?? "").trim().replace(/\s+/g, " ");
  const palavras = limpo.length ? limpo.split(" ") : [];
  if (palavras.length < 2) return "Nenhum produto encontrado com esse nome.";
  return (
    `Nenhum produto encontrado com "${limpo}". A pesquisa procura as palavras juntas, ` +
    `na ordem digitada. Tente só uma palavra — por exemplo, "${palavras[0]}".`
  );
}

/* ------------------------------------------------------------------ *
 * O resgate da busca de duas palavras
 * ------------------------------------------------------------------ *
 * A WM procura o trecho LITERAL, então a ordem das palavras decide: medido na empresa 20,
 * `filtro oleo` acha e `oleo filtro` devolve zero. Para quem atende, o produto simplesmente
 * "não existe" — e ela desiste de um item que está lá.
 *
 * Quando o resultado vem VAZIO e havia duas ou mais palavras, vale uma segunda tentativa com a
 * palavra mais longa do que foi digitado. Uma só, nunca em cascata, e **jamais** para melhorar
 * um resultado que veio: cada chamada à WM pode custar dinheiro (seção 11 do doc 36), e trocar
 * o termo de quem já achou algo seria mexer na busca dela pelas costas.
 *
 * A palavra mais longa porque é a mais específica: em `oleo filtro motor`, `filtro` recorta
 * mais que `oleo`. Empate fica com a primeira — na dúvida, a ordem em que ela pensou.
 */

/** Mínimo da palavra de resgate: o mesmo piso de 3 caracteres que a busca inteira respeita. */
const MIN_PALAVRA_RESGATE = 3;

/**
 * A palavra com que vale tentar de novo, ou `null` quando não vale tentativa nenhuma.
 *
 * @param {string} termo o que a pessoa digitou
 * @returns {string|null}
 */
export function termoDeResgate(termo) {
  const limpo = String(termo ?? "").trim().replace(/\s+/g, " ");
  const palavras = limpo ? limpo.split(" ") : [];
  if (palavras.length < 2) return null;
  let melhor = null;
  for (const palavra of palavras) {
    if (palavra.length < MIN_PALAVRA_RESGATE) continue;
    if (!melhor || palavra.length > melhor.length) melhor = palavra;
  }
  // Uma palavra igual ao termo inteiro não existe aqui (há duas ou mais), mas um termo que só
  // difere por espaço repetido já foi normalizado acima — e repetir a mesma consulta seria
  // gastar uma chamada para receber o mesmo vazio.
  if (!melhor || melhor === limpo) return null;
  return melhor;
}

/**
 * O aviso do resgate. Diz, sem rodeio, que o que está na tela NÃO é o que foi digitado.
 *
 * @param {string} digitado termo original
 * @param {string} usado termo que trouxe os resultados
 */
export function mensagemResgateBusca(digitado, usado) {
  const a = String(digitado ?? "").trim().replace(/\s+/g, " ");
  const b = String(usado ?? "").trim();
  if (!a || !b) return "";
  return `Nada com "${a}". Mostrando resultados para "${b}".`;
}

/* ------------------------------------------------------------------ *
 * Cliente: a busca é por PREFIXO, e produto é por trecho
 * ------------------------------------------------------------------ *
 * `docs/wm/04-contratos-api.md`: *"O Worker consulta dbo.Clientes, nome por prefixo com
 * `Latin1_General_CI_AI`, CPF/CNPJ/código por igualdade"*. Produto casa por OCORRÊNCIA, cliente
 * casa pelo COMEÇO do nome — regras diferentes no mesmo formulário.
 *
 * Medido no ERP real da empresa 20 (22/10): `DINIZ` e `SILVA` (sobrenomes) não acham nada,
 * `MARIA APARECIDA AMADEI` acha 3. Quem digita o sobrenome conclui que o cliente não existe.
 *
 * A saída existe e é boa: documento e código batem por IGUALDADE, então colar o CPF/CNPJ
 * funciona sempre. É isso que a mensagem oferece — sem disparar consulta nenhuma.
 */

/** Códigos de "não achei" que, no campo de cliente, merecem a explicação do prefixo. */
const CODIGOS_CLIENTE_NAO_ACHADO = Object.freeze([
  "WM_NAO_ENCONTRADO",
  "WM_CLIENTE_NAO_ENCONTRADO",
]);

/**
 * Explicação para quando a preparação não acha o cliente digitado.
 *
 * @param {string|null|undefined} codigo código do envelope de erro
 * @param {string|null|undefined} clienteBusca o que a pessoa digitou no campo de cliente
 * @returns {string} vazio quando não se aplica (e aí a mensagem do envelope fica sozinha)
 */
export function dicaClienteNaoEncontrado(codigo, clienteBusca) {
  if (!CODIGOS_CLIENTE_NAO_ACHADO.includes(String(codigo || ""))) return "";
  return mensagemBuscaClienteSemResultado(clienteBusca);
}

/**
 * A MESMA frase, dita no estado vazio da busca de cliente.
 *
 * Uma frase só para os dois momentos de propósito: o atendente que digita o sobrenome na busca
 * e o que digita o sobrenome e aperta Calcular estão diante do mesmo fato do ERP, e duas
 * explicações diferentes para ele ensinariam duas coisas.
 *
 * @param {string|null|undefined} termo o que a pessoa digitou
 * @returns {string} vazio quando não há o que explicar (nada digitado)
 */
export function mensagemBuscaClienteSemResultado(termo) {
  const digitado = String(termo ?? "").trim().replace(/\s+/g, " ");
  if (!digitado) return "";
  return (
    `Nenhum cliente começando com "${digitado}". A busca de cliente é pelo começo do nome — ` +
    "tente o primeiro nome, ou cole o CPF/CNPJ."
  );
}

/* ------------------------------------------------------------------ *
 * A busca de cliente: lista, estados e o que ela NÃO promete
 * ------------------------------------------------------------------ *
 * `POST /api/orcamentos/clientes/consultar` é AUXÍLIO DE BUSCA, não autoridade: ela não aplica
 * os filtros Inativo/Bloqueado e `preparar` aplica (D11), e é por isso que a resposta carrega
 * `resolucao_definitiva: false`. Escolher aqui encurta o caminho; quem decide continua sendo o
 * Calcular, que pode recusar com `CLIENTE_INVALIDO` um cliente que esta lista mostrou.
 *
 * Tudo abaixo é regra, não JSX: o componente imprime o que estas funções decidirem.
 */

/** Documentos do ERP, em ordem de preferência — ver `dbo.Clientes` em `docs/wm/04-contratos-api.md`. */
const DOCUMENTOS_CLIENTE = Object.freeze([
  ["cnpj", "CNPJ"],
  ["cpf", "CPF"],
  ["inscricao_estadual", "IE"],
]);

/**
 * O documento que distingue dois homônimos, rotulado — o primeiro que existir.
 *
 * Nunca os três juntos: numa lista de 30 nomes, três documentos por linha afogam o nome, que é
 * o que está sendo lido. CNPJ primeiro porque cliente pessoa jurídica é quem mais repete nome
 * (filial, matriz) na base da loja.
 *
 * A mesma regra existe hoje dentro do `AmbiguidadePicker` (função local `documentoCliente`).
 * Não a unifiquei nesta passagem para não encostar no laço de ambiguidade, que está estável e
 * em produção — unificar é follow-up, e a duplicação está anotada aqui para ser achada.
 *
 * @param {object|null|undefined} cliente candidato da WM
 * @returns {string} vazio quando o candidato não traz documento nenhum
 */
export function documentoDoCliente(cliente) {
  if (!cliente || typeof cliente !== "object") return "";
  for (const [campo, rotulo] of DOCUMENTOS_CLIENTE) {
    const valor = typeof cliente[campo] === "string" ? cliente[campo].trim() : "";
    if (valor) return `${rotulo} ${valor}`;
  }
  return "";
}

/** Forma vazia da busca de cliente. Congelada: nunca mutada, só substituída. */
export const SEM_CLIENTE = Object.freeze({
  status: "",
  unico: false,
  lista: [],
  paginacao: null,
});

/**
 * Traduz a resposta da consulta de clientes na forma que a tela consome.
 *
 * Dois ramos no contrato (`ConsultarClientesResposta`), e a diferença entre eles é de SENTIDO,
 * não de formato:
 *
 *   · `multiplos_clientes` → `candidatos[]` + `paginacao`: uma lista para escolher, e o
 *     documento é o que separa duas "MARIA SILVA";
 *   · `cliente`            → UM cliente que o ERP resolveu sozinho. É um ACHADO, não uma lista
 *     de um — e por isso vem sem paginação e, pelo contrato, sem documentos (o ramo único traz
 *     só código e nome). Dizer "sem documento" ali seria afirmar algo sobre o cadastro que a
 *     resposta não disse.
 *
 * Candidato sem código não entra: não há como escolhê-lo. (O backend já recusa a resposta
 * inteira nesse caso; isto é a rede de segurança da tela.)
 *
 * @param {object|null|undefined} data corpo de `POST /api/orcamentos/clientes/consultar`
 * @returns {{ status: string, unico: boolean, lista: object[], paginacao: object|null }}
 */
export function agruparCandidatosCliente(data) {
  if (!data || typeof data !== "object") return SEM_CLIENTE;
  const selecionavel = (c) =>
    Boolean(c && typeof c === "object" && typeof c.codigo_cliente_erp === "string" && c.codigo_cliente_erp);

  if (data.status === "cliente") {
    if (!selecionavel(data.cliente)) return SEM_CLIENTE;
    return { status: "cliente", unico: true, lista: [data.cliente], paginacao: null };
  }

  if (data.status === "multiplos_clientes") {
    const lista = Array.isArray(data.candidatos) ? data.candidatos.filter(selecionavel) : [];
    const paginacao = data.paginacao && typeof data.paginacao === "object" ? data.paginacao : null;
    return { status: "multiplos_clientes", unico: false, lista, paginacao };
  }

  return SEM_CLIENTE;
}

/**
 * A frase que acompanha a lista — e o trabalho que ela nomeia.
 *
 * Com vários, o trabalho é DESEMPATAR, e o que desempata é o documento: duas "MARIA SILVA" só
 * se separam por ele. Com um, o trabalho é confirmar — e nem aí a tela escolhe sozinha: o
 * contrato é explícito ("a última página com um único registro não resolve automaticamente"),
 * e escolher por conta própria colocaria no orçamento um cliente que ninguém viu.
 *
 * @param {{unico: boolean, lista: object[]}} grupo saída de `agruparCandidatosCliente`
 * @returns {string} vazio quando não há nada na mão
 */
export function tituloClientesEncontrados(grupo) {
  const lista = Array.isArray(grupo?.lista) ? grupo.lista : [];
  if (!lista.length) return "";
  if (grupo?.unico || lista.length === 1) return "Um cliente encontrado. Toque para usar.";
  return "Mais de um cliente com esse nome. Confira o documento para escolher.";
}

/** Códigos do envelope que, na busca de cliente, significam indisponibilidade da loja. */
const CODIGOS_CLIENTE_INDISPONIVEL = Object.freeze(["WM_SINCRONIZADOR_OFFLINE"]);
/** Envelope de "o cliente escolhido não serve para orçamento" (Inativo/Bloqueado no ERP). */
const CODIGO_CLIENTE_INVALIDO = "WM_CLIENTE_INVALIDO";

/**
 * Indisponibilidade NÃO é lista vazia, e a diferença é a conclusão do atendente.
 *
 * A porta de cliente é realtime: ela fala com o sincronizador instalado na máquina da loja, e
 * devolve `503 SINCRONIZADOR_OFFLINE` quando ele está fora do ar — enquanto a busca de produto,
 * servida do acervo já sincronizado dentro da WM, continua respondendo 200 (medido em produção
 * em 25/10/2026). Pintar esse 503 como "nenhum cliente encontrado" faz o atendente concluir que
 * o cliente saiu do cadastro.
 *
 * A mensagem do envelope também não serve aqui: ela foi escrita para o Calcular ("o orçamento
 * não pôde ser calculado. Nada foi gravado"), e no campo de busca fala de um cálculo que
 * ninguém pediu. Mesma razão pela qual o `ProdutoPicker` não exibe a mensagem do 404.
 *
 * "Não encontrado" vira VAZIO, não erro: houve resposta, e ela foi "não tem".
 *
 * @param {{codigo?: string, mensagem?: string}} erro saída de `extrairErroOrcamento`
 * @returns {{ tipo: "vazio"|"indisponivel"|"erro", mensagem: string }}
 */
export function traduzirErroBuscaCliente(erro) {
  const codigo = String(erro?.codigo || "");
  if (CODIGOS_CLIENTE_NAO_ACHADO.includes(codigo)) return { tipo: "vazio", mensagem: "" };
  if (CODIGOS_CLIENTE_INDISPONIVEL.includes(codigo)) {
    return {
      tipo: "indisponivel",
      mensagem:
        "Não foi possível procurar clientes agora: o sistema da sua loja não respondeu. " +
        "Isso não quer dizer que o cliente não está cadastrado.",
    };
  }
  return { tipo: "erro", mensagem: String(erro?.mensagem || "") };
}

/** O que fazer quando a loja não responde — e o que ainda funciona enquanto isso. */
export const RECUPERACAO_CLIENTE_INDISPONIVEL =
  "Confira se o computador do ERP está ligado e com internet. O Calcular depende do mesmo " +
  "sistema; a busca de produto continua funcionando.";

/**
 * O que a escolha na busca vale — dito ANTES do Calcular, não depois dele.
 *
 * Esta lista mostra o cadastro inteiro e o orçamento só aceita cliente ativo e desbloqueado:
 * transformar a escolha num "cliente confirmado" prometeria o que a consulta não entrega.
 */
export const AVISO_CLIENTE_NAO_DEFINITIVO =
  "O cliente é confirmado no Calcular: se estiver inativo ou bloqueado no ERP, o cálculo recusa.";

/**
 * A explicação para o `CLIENTE_INVALIDO` de quem acabou de escolher na lista.
 *
 * Sem ela, a mensagem do envelope ("O cliente escolhido não está liberado para orçamento no
 * ERP. Escolha outro.") parece defeito: a pessoa escolheu de uma lista que o próprio sistema
 * mostrou, e agora o sistema diz que o cliente não serve. O que falta é o porquê — a busca não
 * filtra Inativo/Bloqueado e o cálculo filtra.
 *
 * Só vale quando o código FOI enviado, isto é, quando a escolha veio de uma lista. Quem digitou
 * o nome não escolheu nada, e aí a dica do prefixo é a que se aplica.
 *
 * @param {string|null|undefined} codigo código do envelope de erro
 * @param {string|null|undefined} codigoClienteEnviado `cliente_codigo_erp` do corpo enviado
 * @returns {string} vazio quando não se aplica
 */
export function dicaClienteEscolhidoRecusado(codigo, codigoClienteEnviado) {
  if (String(codigo || "") !== CODIGO_CLIENTE_INVALIDO) return "";
  if (!String(codigoClienteEnviado || "").trim()) return "";
  return (
    "Esse cliente aparece na busca porque a busca mostra o cadastro inteiro, mas o orçamento " +
    "só aceita cliente ativo e desbloqueado no ERP. Escolha outro na busca, ou peça para " +
    "liberarem esse no sistema da loja."
  );
}

/* ------------------------------------------------------------------ *
 * Código × busca: a troca que não pode deixar código órfão
 * ------------------------------------------------------------------ *
 * `preparar` recebe `cliente_codigo_erp` XOR `cliente_busca`, e o código GANHA quando os dois
 * existem no rascunho (ver `montarBodyPreparar`). Daí o defeito clássico deste desenho: a
 * pessoa escolhe "MARIA APARECIDA" na lista, depois mexe no texto do campo para procurar outro
 * cliente, e o código da Maria continua lá — o orçamento sai para ela, com o nome de outra
 * pessoa na tela. Em silêncio, e em produção, para um cliente real.
 *
 * As duas funções abaixo são o único caminho pelo qual a tela escreve a identidade do cliente
 * no rascunho, e elas são opostas por construção: escolher grava código e nome; digitar apaga
 * os dois. Nenhuma das duas lê o estado anterior, então não há ordem de chamada que as burle.
 */

/** Mexer no texto invalida a escolha anterior: volta-se a `cliente_busca`, sem código órfão. */
export function patchClienteDigitado(valor) {
  return { clienteBusca: String(valor ?? ""), clienteCodigoErp: "", clienteNome: "" };
}

/**
 * Escolher na lista grava o código canônico — é ele que elimina a ambiguidade no `preparar` e
 * dispensa o laço do `AmbiguidadePicker`.
 *
 * O texto digitado fica INTACTO: é por ele que a pessoa voltará à mesma lista se tocar em
 * "Trocar", sem gastar outra consulta na loja.
 *
 * @returns {object|null} `null` para candidato sem código (nada a gravar)
 */
export function patchClienteEscolhido(candidato) {
  const codigo = typeof candidato?.codigo_cliente_erp === "string" ? candidato.codigo_cliente_erp.trim() : "";
  if (!codigo) return null;
  return { clienteCodigoErp: codigo, clienteNome: String(candidato?.nome || "").trim() };
}

/* ------------------------------------------------------------------ *
 * Cliente/vendedor canônicos
 * ------------------------------------------------------------------ */

/** `{ nome, codigo }` para exibição: nome em primeiro plano, código ERP só em detalhes. */
function canonicoView(objeto, chaveCodigo) {
  const fonte = objeto && typeof objeto === "object" ? objeto : null;
  return {
    nome: textoOuSemValor(fonte?.nome),
    codigo: textoOuSemValor(fonte?.[chaveCodigo]),
  };
}

/* ------------------------------------------------------------------ *
 * Prévia
 * ------------------------------------------------------------------ */

/**
 * Converte `previa_sanitizada` no que a tela imprime.
 *
 * Nada é somado, dividido ou multiplicado: `valor_produtos`, `valor_total` e o
 * `itens[].valor_total` saem do que a WM mandou. `unidade` ainda não vem no shape do backend
 * (`extrairPayloadCriacaoDaPrevia` não a projeta) — então é lida se existir e simplesmente
 * omitida se não, em vez de virar um "—" permanente em toda linha.
 *
 * @param {object|null|undefined} previa `preparacao.previa`
 */
export function montarPreviaView(previa) {
  if (!previa || typeof previa !== "object") return null;
  const brutos = Array.isArray(previa.itens) ? previa.itens : [];

  const itens = brutos.map((bruto, indice) => {
    const item = bruto && typeof bruto === "object" ? bruto : {};
    const codigoBruto = typeof item.codigo_produto_erp === "string" ? item.codigo_produto_erp : "item";
    const unidade =
      typeof item.unidade === "string" && item.unidade.trim() ? item.unidade.trim() : null;
    return {
      chave: `${codigoBruto}-${indice}`,
      codigo: textoOuSemValor(item.codigo_produto_erp),
      descricao: textoOuSemValor(item.descricao),
      // A unidade crua, para quem precisar dela sozinha; a tela não a imprime separada, porque
      // `quantidade` e `estoque` abaixo já a trazem coladas no número.
      unidade,
      // Quantidade e estoque saem como se LEEM: sem as casas vazias das três decimais da WM e
      // com a unidade colada (`"2.000"` + `UN` → `2 UN`). "2,000 × " seria lido como dois mil.
      quantidade: formatQuantidadeExibicao(item.quantidade, unidade),
      precoUnitario: formatMoedaOrcamento(item.preco_unitario),
      precoExato: precoExatoTexto(item.preco_unitario),
      valorTotal: formatMoedaOrcamento(item.valor_total),
      // Estoque previsto PODE SER NEGATIVO no contrato; é texto de exibição e não entra em conta.
      estoque: formatQuantidadeExibicao(item.estoque_previsto, unidade),
    };
  });

  return {
    cliente: canonicoView(previa.cliente, "codigo_cliente_erp"),
    vendedor: canonicoView(previa.vendedor, "codigo_vendedor_erp"),
    itens,
    quantidadeItens: itens.length,
    valorProdutos: formatMoedaOrcamento(previa.valor_produtos),
    valorTotal: formatMoedaOrcamento(previa.valor_total),
    bloqueio: textoBloqueio(previa.bloquear_apos_criar),
    fonte: rotuloFonte(previa.meta),
  };
}

/* ------------------------------------------------------------------ *
 * Resultado da criação
 * ------------------------------------------------------------------ */

/**
 * Converte `resultado_sanitizado` na tela de sucesso.
 *
 * **O número do orçamento é `codigo_pedido_erp`** (§10 e §13) — é por ele que o orçamento é
 * procurado no Icthus, e sem ele não há resultado para mostrar (`null`).
 *
 * ⚠️ `jaEstavaCriado` vem do NOSSO estado local da operação (ela já estava `CRIADO` antes desta
 * chamada?) e de lugar nenhum mais. §11.1 é explícito: o `200` da WM não distingue "criei
 * agora" de "resultado idempotente", e inferir a diferença por `meta.criado_em` é PROIBIDO.
 * Por isso o parâmetro é externo, e `resultado.meta.criado_em` não é lido em nenhum ponto.
 *
 * @param {object|null|undefined} resultado `operacao.resultado`
 * @param {{jaEstavaCriado?: boolean}} [opcoes] estado LOCAL da operação, nunca da resposta
 */
export function montarResultadoView(resultado, { jaEstavaCriado = false } = {}) {
  if (!resultado || typeof resultado !== "object") return null;
  const numero =
    typeof resultado.codigo_pedido_erp === "string" ? resultado.codigo_pedido_erp.trim() : "";
  if (!numero) return null;

  const idempotente = jaEstavaCriado === true;
  return {
    numero,
    // "Já estava criado" é afirmação sobre a NOSSA operação, nunca leitura da resposta da WM.
    jaEstavaCriado: idempotente,
    titulo: idempotente
      ? "Este orçamento já estava criado"
      : "Orçamento criado no sistema da empresa",
    documento:
      typeof resultado.documento_venda === "string" && resultado.documento_venda.trim()
        ? resultado.documento_venda.trim()
        : null,
    cliente: canonicoView(resultado.cliente, "codigo_cliente_erp"),
    vendedor: canonicoView(resultado.vendedor, "codigo_vendedor_erp"),
    valorTotal: formatMoedaOrcamento(resultado.valor_total),
    protecao: textoBloqueado(resultado.bloqueado),
    fonte: rotuloFonte(resultado.meta),
  };
}

/**
 * Linhas de item do resumo, a partir da PRÉVIA que foi confirmada.
 *
 * Os itens não vêm no `200` da criação (§10 só devolve número, documento, cliente, vendedor,
 * total e proteção) — eles vêm da prévia, que é exatamente o conjunto que virou `payload_hash`
 * e foi despachado byte a byte. Ou seja: continuam sendo dado oficial da WM, não reconstrução.
 *
 * Preço por unidade, como no template da Sessão 6 do doc 36 ("1 × Notebook — R$ 3.500,00"):
 * nada aqui multiplica, soma ou deriva valor.
 */
function linhasDeItem(previa) {
  const itens = previa && typeof previa === "object" && Array.isArray(previa.itens) ? previa.itens : [];
  const linhas = [];
  for (const bruto of itens) {
    const item = bruto && typeof bruto === "object" ? bruto : {};
    const descricao = textoOuSemValor(item.descricao);
    // Mesma leitura da prévia: sem as casas vazias e com a unidade. "2,000 × Mouse" na mensagem
    // do cliente seria lido como dois mil mouses — e o cliente não tem a prévia para conferir.
    const quantidade = formatQuantidadeExibicao(item.quantidade, item.unidade);
    const preco = formatMoedaOrcamento(item.preco_unitario);
    // Linha sem descrição ou sem preço não vira "— × — — —" na mensagem do cliente: some.
    if (descricao === SEM_VALOR || quantidade === SEM_VALOR || preco === SEM_VALOR) continue;
    linhas.push(`${quantidade} × ${descricao} — ${preco}`);
  }
  return linhas;
}

/**
 * Texto do resumo que o atendente revisa e envia ao cliente.
 *
 * Template FIXO com os dados oficiais da WM — **ele formata, não calcula**. Não inclui código
 * ERP de cliente/vendedor (jargão interno) e não inclui carimbo de tempo (`meta.criado_em` não
 * tem fuso no contrato, e uma hora errada no bolso do cliente é pior que nenhuma).
 *
 * Com a prévia em mãos sai o template da Sessão 6 do doc 36:
 *
 *   Olá, Maria Souza! Segue seu orçamento:
 *
 *   1 × Notebook Lenovo IdeaPad — R$ 3.500,00
 *   2 × Mouse sem fio — R$ 120,00
 *
 *   Total: R$ 3.740,00
 *   Orçamento: 12345
 *
 * O nome do cliente vai INTEIRO, como a WM o devolveu. Abreviar para o primeiro nome ficaria
 * simpático com "João da Silva" e esquisito com razão social ("Olá, COMERCIAL!") — e o nome
 * de um cliente não é lugar para adivinhação.
 *
 * Sem prévia (por exemplo depois de um F5, quando só há a operação lida do servidor) o resumo
 * cai para a forma curta, com número, cliente e total. Melhor um resumo curto e verdadeiro do
 * que uma lista de itens reconstruída de algum lugar.
 *
 * @param {object|null|undefined} resultado `operacao.resultado` (resultado sanitizado)
 * @param {{previa?: object|null}} [opcoes] prévia confirmada, para a lista de itens
 * @returns {string} vazio quando não há resultado utilizável
 */
export function montarResumoOrcamento(resultado, { previa = null } = {}) {
  const view = montarResultadoView(resultado);
  if (!view) return "";

  const itens = linhasDeItem(previa);
  if (!itens.length) {
    const linhas = [`Orçamento: ${view.numero}`];
    if (view.cliente.nome !== SEM_VALOR) linhas.push(`Cliente: ${view.cliente.nome}`);
    if (view.valorTotal !== SEM_VALOR) linhas.push(`Total: ${view.valorTotal}`);
    if (view.vendedor.nome !== SEM_VALOR) linhas.push(`Vendedor: ${view.vendedor.nome}`);
    return linhas.join("\n");
  }

  const abertura =
    view.cliente.nome === SEM_VALOR
      ? "Segue seu orçamento:"
      : `Olá, ${view.cliente.nome}! Segue seu orçamento:`;

  const linhas = [abertura, "", ...itens, ""];
  if (view.valorTotal !== SEM_VALOR) linhas.push(`Total: ${view.valorTotal}`);
  linhas.push(`Orçamento: ${view.numero}`);
  return linhas.join("\n");
}

/* ------------------------------------------------------------------ *
 * Assinatura: a prévia vale para UM conjunto de dados
 * ------------------------------------------------------------------ */

/**
 * Identidade do que foi orçado — cliente, vendedor, produtos e quantidades.
 *
 * Serve a uma regra só: **a prévia é de um conjunto de dados, não da tela**. Se cliente,
 * vendedor, produto ou quantidade mudar depois do cálculo, o preço e o total exibidos passam a
 * ser de outro orçamento. Comparar a assinatura de quando a prévia chegou com a do rascunho
 * atual é o que permite desabilitar o "Confirmar" em vez de gravar no ERP algo que o atendente
 * não viu.
 *
 * Página de ambiguidade (`cliente_pagina`, `produto_pagina`…) NÃO entra: é navegação, não
 * conteúdo do orçamento.
 */
function assinaturaDe({ cliente, vendedor, itens }) {
  return JSON.stringify([cliente, vendedor, itens]);
}

/** Referência de item: o código ERP quando já resolvido, senão o texto da busca. */
function refItem(codigo, busca) {
  const cod = typeof codigo === "string" ? codigo.trim() : "";
  if (cod) return `c:${cod}`;
  return `b:${typeof busca === "string" ? busca.trim() : ""}`;
}

/** Quantidade normalizada como SAI para o backend, para o rascunho e o corpo coincidirem. */
function refQuantidade(bruta) {
  const q = normalizarQuantidadeParaEnvio(bruta);
  return q.ok ? q.value : "!";
}

/** Assinatura do rascunho da tela (`useOrcamentoDraft`). */
export function assinaturaDoRascunho(rascunho) {
  if (!rascunho || typeof rascunho !== "object") return "";
  const itens = (Array.isArray(rascunho.itens) ? rascunho.itens : []).map((item) => [
    refItem(item?.codigo_produto_erp, item?.busca),
    refQuantidade(item?.quantidade),
  ]);
  return assinaturaDe({
    cliente: refItem(rascunho.clienteCodigoErp, rascunho.clienteBusca),
    vendedor: refItem(rascunho.vendedorCodigoErp, rascunho.vendedorBusca),
    itens,
  });
}

/** Assinatura do corpo que foi enviado a `POST /api/orcamentos/preparar`. */
export function assinaturaDoBody(body) {
  if (!body || typeof body !== "object") return "";
  const itens = (Array.isArray(body.itens) ? body.itens : []).map((item) => [
    refItem(item?.codigo_produto_erp, item?.busca),
    refQuantidade(item?.quantidade),
  ]);
  return assinaturaDe({
    cliente: refItem(body.cliente_codigo_erp, body.cliente_busca),
    vendedor: refItem(body.vendedor_codigo_erp, body.vendedor_busca),
    itens,
  });
}

export default {
  FONTE_CACHE,
  agruparCandidatosProduto,
  candidatoRelevante,
  separarCandidatosPorRelevancia,
  fatiarDestaque,
  tituloCandidatosRuido,
  termoDeResgate,
  mensagemResgateBusca,
  mensagemBuscaSemResultado,
  dicaClienteNaoEncontrado,
  rotuloFonte,
  textoBloqueio,
  textoBloqueado,
  precoExatoTexto,
  montarPreviaView,
  montarResultadoView,
  montarResumoOrcamento,
  assinaturaDoRascunho,
  assinaturaDoBody,
};
