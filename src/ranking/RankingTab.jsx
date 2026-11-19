import { useAuthStore } from "../auth/authStore";
import RankingPainel from "./RankingPainel";
import RankingConfigPanel from "./RankingConfigPanel";

/**
 * Aba "Ranking" de IA / Bot / Automação: a competição ao vivo em cima e, para o
 * administrador, a configuração e o histórico de vencedores logo abaixo
 * (as rotas /api/ranking/config e /historico são adminOnly no backend).
 */
export default function RankingTab() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = ["admin", "administrador"].includes(String(user?.perfil || "").toLowerCase());
  return (
    <div className="rk-aba">
      <RankingPainel />
      {isAdmin ? <RankingConfigPanel /> : null}
    </div>
  );
}
