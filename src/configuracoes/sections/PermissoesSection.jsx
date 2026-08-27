import { useCallback } from "react";
import * as cfg from "../../api/configService";
import SecaoPermissoes from "../../pages/SecaoPermissoes";
import SectionState from "../components/SectionState";
import { useSectionResource } from "../hooks/useSectionResource";

export default function PermissoesSection({ usuarioIdInicial = "", onUsuarioIdChange }) {
  const load = useCallback(() => cfg.getUsuarios(), []);
  const resource = useSectionResource(load, [], "Erro ao carregar usuários para permissões.");
  const refresh = () => resource.reload().catch(() => {});

  return (
    <SectionState loading={resource.loading} error={resource.error} onRetry={refresh}>
      <SecaoPermissoes
        usuarios={resource.data}
        usuarioIdInicial={usuarioIdInicial}
        onUsuarioIdChange={onUsuarioIdChange}
        onRefresh={refresh}
      />
    </SectionState>
  );
}
