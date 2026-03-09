import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../auth/authStore";
import { canAcessarUsuarios } from "../auth/permissions";
import * as cfg from "../api/configService";
import SecaoPermissoes from "./SecaoPermissoes";
import Breadcrumb from "../components/layout/Breadcrumb";
import { SkeletonGrid } from "../components/feedback/Skeleton";
import "../components/layout/breadcrumb.css";
import "../components/feedback/skeleton.css";
import "./IA.css";
import "./Configuracoes.css";

export default function Permissoes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canAccessUsers = canAcessarUsuarios(user);

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const usuarioIdFromUrl = searchParams.get("usuario") || "";
  const [usuarioId, setUsuarioId] = useState(usuarioIdFromUrl);

  useEffect(() => {
    if (!canAccessUsers) {
      navigate("/atendimento", { replace: true });
      return;
    }
  }, [canAccessUsers, navigate]);

  useEffect(() => {
    if (searchParams.get("usuario")) {
      setUsuarioId(searchParams.get("usuario"));
    }
  }, [searchParams]);

  const loadAll = useCallback(async () => {
    if (!canAccessUsers) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const usr = await cfg.getUsuarios();
      setUsuarios(usr || []);
    } catch (e) {
      setErrorMsg(e?.response?.data?.error || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }, [canAccessUsers]);

  useEffect(() => {
    if (canAccessUsers) loadAll();
  }, [canAccessUsers, loadAll]);

  if (!canAccessUsers) return null;

  return (
    <div className="ia-wrap config-wrap">
      <header className="ia-header">
        <Breadcrumb items={[{ label: "Configurações", to: "/configuracoes" }, { label: "Permissões" }]} />
        <h1 className="ia-title">Permissões</h1>
        <p className="ia-subtitle ia-muted">
          Edite as permissões de acesso por usuário. Selecione o usuário e defina Permitir, Negar ou Padrão (usa o padrão do perfil).
        </p>
      </header>

      {errorMsg && (
        <div className="ia-error-banner" role="alert" style={{ marginBottom: 16 }}>
          {errorMsg}
          <button type="button" onClick={() => setErrorMsg(null)}>
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div className="ia-content config-loading-skeleton">
          <SkeletonGrid count={3} />
        </div>
      ) : (
        <div className="ia-content">
          <SecaoPermissoes
            usuarios={usuarios}
            usuarioIdInicial={usuarioId}
            onUsuarioIdChange={(id) => {
              setUsuarioId(id);
              if (id) {
                const sp = new URLSearchParams(searchParams);
                sp.set("usuario", id);
                navigate({ search: `?${sp.toString()}` }, { replace: true });
              }
            }}
            onRefresh={loadAll}
          />
        </div>
      )}
    </div>
  );
}
