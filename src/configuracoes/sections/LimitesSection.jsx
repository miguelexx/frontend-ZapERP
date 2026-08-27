import { useCallback } from "react";
import * as cfg from "../../api/configService";
import LimitesAtendimento from "../../pages/LimitesAtendimento";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

export default function LimitesSection() {
  const load = useCallback(() => cfg.getUsuarios(), []);
  const resource = useSectionResource(load, [], "Erro ao carregar usuários para os limites.");
  const refresh = () => resource.reload().catch(() => {});

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <LimitesAtendimento usuarios={resource.data} />
    </SectionState>
  );
}
