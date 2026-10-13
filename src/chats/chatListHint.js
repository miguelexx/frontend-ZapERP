/**
 * Texto do rodapé da lista de conversas ("80 de 1357", "4 resultados", "Atualizando…").
 *
 * Extraído de ChatListToolbar para poder ser testado: durante a BUSCA a lista mescla
 * clientes SEM conversa, enquanto o total vem do header `X-Chat-List-Total-Count`, que
 * conta só conversas. Comparar os dois produzia hints impossíveis — a auditoria de
 * 10/10/2026 observou "4 de 3" (4 linhas renderizadas, total declarado 3) buscando
 * "Miguel": 3 contatos com conversa + 1 marcado "Sem conversa".
 */
export function buildChatListHintText({
  loading = false,
  hasStoreChats = false,
  listRefreshing = false,
  searchInput = "",
  searchPending = false,
  adminPorFuncionarioAtivo = false,
  filteredCount = 0,
  activeFilterTotalCount = null,
} = {}) {
  if (loading && !hasStoreChats) return "Carregando…";
  if (listRefreshing && !searchPending) return "Atualizando…";

  const n = Number(filteredCount) || 0;

  // Na busca os dois números medem coisas diferentes; mostrar só o que a lista realmente tem.
  if (String(searchInput || "").trim()) {
    return `${n} ${n === 1 ? "resultado" : "resultados"}`;
  }

  if (adminPorFuncionarioAtivo) return `${n} conversas`;

  const totalBruto =
    activeFilterTotalCount != null && Number.isFinite(Number(activeFilterTotalCount))
      ? Number(activeFilterTotalCount)
      : null;

  // O total vem do servidor e a lista pode estar à frente dele (linha nova entrando por
  // socket antes do recount, item otimista). "X de Y" com Y < X é sempre mentira; nesse
  // caso só o que está de fato na tela é confiável.
  const total = totalBruto != null && totalBruto >= n ? totalBruto : null;

  return total != null ? `${n} de ${total}` : `${n} conversas`;
}
