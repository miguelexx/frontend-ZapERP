import { Suspense, useEffect, useRef } from "react";
import { lazyWithRetry as lazy } from "../runtime/lazyWithRetry";
import { useAuthStore } from "../auth/authStore";
import { usePermissoesStore } from "../auth/permissoesStore";
import { can, canAcessarConfiguracoes } from "../auth/permissions";
import { getSocket } from "../socket/socket";
import { getRankingAtual } from "../api/rankingService";
import { useRankingStore } from "./rankingStore";
import { deveCelebrar, lerCelebracaoVista, marcarCelebracaoVista } from "./rankingUtils";

// O card de celebração só baixa quando há um campeão para mostrar.
const CampeaoCelebracao = lazy(() => import("./CampeaoCelebracao"));

const EVENTO_VENCEDOR = "ranking:vencedor";
const EVENTO_CONFIG = "ranking:config_atualizada";
// Evento já existente do atendimento: sinaliza que a contagem pode ter mudado.
const EVENTO_CONVERSA_ENCERRADA = "conversa_encerrada";
// Boot: o resumo do ranking não disputa rede com a lista de conversas.
const ATRASO_BOOT_MS = 4000;

/**
 * Ponte global do ranking (montada no MainLayout, como as do chat interno/HelpDesk):
 * - carrega o resumo (ativo? último campeão?) com atraso, fora do caminho do boot;
 * - escuta `ranking:vencedor` / `ranking:config_atualizada` e o `conversa_encerrada`
 *   já emitido pelo atendimento (só para avisar a página que recarregue);
 * - mostra a celebração do campeão uma única vez por pessoa, mesmo se ela estava offline.
 * Listeners de socket ficam aqui por convenção do projeto (nunca em componentes de lista).
 */
export default function RankingGlobalBridge() {
  const user = useAuthStore((s) => s.user);
  const celebracao = useRankingStore((s) => s.celebracao);
  // Reavalia quando GET /usuarios/me/permissoes resolve (can() lê o store via getState()).
  usePermissoesStore((s) => s.permissoes);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!user?.id || !user?.company_id) return undefined;
    let cancelado = false;

    const carregarResumo = async () => {
      try {
        const resumo = await getRankingAtual({ resumo: true });
        if (cancelado) return;
        useRankingStore.getState().setResumo(resumo);
        const ultimo = resumo?.ultimo_resultado;
        if (resumo?.ativo && deveCelebrar(ultimo, lerCelebracaoVista(userRef.current))) {
          useRankingStore.getState().celebrar(ultimo);
        }
      } catch {
        /* ranking é acessório: falha aqui nunca afeta o atendimento */
      }
    };

    const onVencedor = (payload = {}) => {
      const ciclo = payload?.ciclo;
      if (ciclo && deveCelebrar(ciclo, lerCelebracaoVista(userRef.current))) {
        useRankingStore.getState().celebrar(ciclo);
      }
      useRankingStore.getState().bump();
      void carregarResumo();
    };
    const onConfig = () => {
      useRankingStore.getState().bump();
      void carregarResumo();
    };
    const onConversaEncerrada = () => {
      if (useRankingStore.getState().resumo?.ativo) useRankingStore.getState().bump();
    };
    // Reconectou: pode ter perdido o anúncio — o resumo traz o último campeão.
    const onReconnect = () => void carregarResumo();

    const bootTimer = setTimeout(carregarResumo, ATRASO_BOOT_MS);

    let socket = null;
    let tentativas = 0;
    const ligar = () => {
      socket = getSocket();
      if (!socket) return false;
      socket.on(EVENTO_VENCEDOR, onVencedor);
      socket.on(EVENTO_CONFIG, onConfig);
      socket.on(EVENTO_CONVERSA_ENCERRADA, onConversaEncerrada);
      socket.on("connect", onReconnect);
      return true;
    };
    // O socket pode nascer depois do layout; tenta por ~30s sem custo relevante.
    let retryTimer = null;
    if (!ligar()) {
      retryTimer = setInterval(() => {
        tentativas += 1;
        if (ligar() || tentativas > 30) clearInterval(retryTimer);
      }, 1000);
    }

    return () => {
      cancelado = true;
      clearTimeout(bootTimer);
      if (retryTimer) clearInterval(retryTimer);
      socket?.off(EVENTO_VENCEDOR, onVencedor);
      socket?.off(EVENTO_CONFIG, onConfig);
      socket?.off(EVENTO_CONVERSA_ENCERRADA, onConversaEncerrada);
      socket?.off("connect", onReconnect);
    };
  }, [user?.id, user?.company_id]);

  if (!celebracao) return null;

  const fechar = () => {
    marcarCelebracaoVista(userRef.current, celebracao.id);
    useRankingStore.getState().fecharCelebracao();
  };

  return (
    <Suspense fallback={null}>
      <CampeaoCelebracao
        ciclo={celebracao}
        usuarioId={user?.id}
        // Mesmos gates da rota /ia (chatbot_acessar) e do IaShell (config_acessar).
        podeVerRanking={can("chatbot_acessar", user) && canAcessarConfiguracoes(user)}
        onClose={fechar}
      />
    </Suspense>
  );
}
