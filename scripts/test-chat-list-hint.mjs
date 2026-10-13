/**
 * Regressão: o rodapé da lista nunca pode declarar menos itens do que exibe.
 * Auditoria 10/10/2026 observou "4 de 3" buscando "Miguel" (3 contatos com conversa
 * + 1 "Sem conversa"): a lista mescla clientes sem conversa, o total do header só conta
 * conversas. Executar: node scripts/test-chat-list-hint.mjs
 */
import { buildChatListHintText } from "../src/chats/chatListHint.js";

let falhas = 0;
function check(obtido, esperado, msg) {
  if (obtido !== esperado) {
    falhas++;
    console.error(`FALHOU: ${msg}\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido)}`);
  }
}

// 1) O caso exato da auditoria: busca "Miguel", 4 linhas, header diz 3 conversas.
check(
  buildChatListHintText({ searchInput: "Miguel", filteredCount: 4, activeFilterTotalCount: 3 }),
  "4 resultados",
  'busca não pode produzir "4 de 3"'
);

// 2) Singular.
check(
  buildChatListHintText({ searchInput: "553499911246", filteredCount: 1, activeFilterTotalCount: 1 }),
  "1 resultado",
  "um único resultado usa singular"
);

// 3) Busca sem nenhum resultado.
check(
  buildChatListHintText({ searchInput: "zzzz", filteredCount: 0, activeFilterTotalCount: 0 }),
  "0 resultados",
  "busca vazia"
);

// 4) Espaço em branco não conta como busca ativa.
check(
  buildChatListHintText({ searchInput: "   ", filteredCount: 80, activeFilterTotalCount: 1357 }),
  "80 de 1357",
  "espaços não ativam o modo busca"
);

// 5) Fora da busca o "X de Y" é preservado (comportamento correto, não mexer).
check(
  buildChatListHintText({ filteredCount: 80, activeFilterTotalCount: 1357 }),
  "80 de 1357",
  "paginação normal mantém X de Y"
);
check(
  buildChatListHintText({ filteredCount: 2, activeFilterTotalCount: 2 }),
  "2 de 2",
  "Minha fila completa"
);

// 5b) Fora da busca, total menor que as linhas (recount atrasado) não vira "X de Y".
check(
  buildChatListHintText({ filteredCount: 4, activeFilterTotalCount: 3 }),
  "4 conversas",
  "total desatualizado não pode produzir hint impossível fora da busca"
);

// 6) Sem total conhecido cai para a forma neutra.
check(
  buildChatListHintText({ filteredCount: 7, activeFilterTotalCount: null }),
  "7 conversas",
  "sem header de total"
);

// 7) Filtro por atendente (admin) ignora o total global.
check(
  buildChatListHintText({ adminPorFuncionarioAtivo: true, filteredCount: 5, activeFilterTotalCount: 1357 }),
  "5 conversas",
  "escopo por atendente não compara com o total global"
);

// 8) Estados de carregamento têm precedência.
check(
  buildChatListHintText({ loading: true, hasStoreChats: false, filteredCount: 0 }),
  "Carregando…",
  "primeiro carregamento"
);
check(
  buildChatListHintText({ loading: true, hasStoreChats: true, filteredCount: 9, activeFilterTotalCount: 9 }),
  "9 de 9",
  "recarregar com cache não deve mostrar Carregando"
);
check(
  buildChatListHintText({ listRefreshing: true, filteredCount: 9, activeFilterTotalCount: 9 }),
  "Atualizando…",
  "resync em andamento"
);
check(
  buildChatListHintText({ listRefreshing: true, searchPending: true, searchInput: "mi", filteredCount: 3 }),
  "3 resultados",
  "busca em digitação não deve ser mascarada por Atualizando"
);

// 9) Invariante geral: o número exibido jamais pode ser menor que as linhas renderizadas.
for (const [linhas, total] of [[4, 3], [10, 2], [1, 0], [80, 1357], [0, 0]]) {
  for (const busca of ["Miguel", ""]) {
    const texto = buildChatListHintText({
      searchInput: busca,
      filteredCount: linhas,
      activeFilterTotalCount: total,
    });
    const m = texto.match(/^(\d+) de (\d+)$/);
    if (m && Number(m[2]) < Number(m[1])) {
      falhas++;
      console.error(`FALHOU: hint impossível "${texto}" (linhas=${linhas}, total=${total}, busca=${JSON.stringify(busca)})`);
    }
  }
}

if (falhas) {
  console.error(`chat-list-hint: ${falhas} falha(s)`);
  process.exit(1);
}
console.log("OK — rodapé da lista: busca, paginação, escopo admin e estados de carga.");
