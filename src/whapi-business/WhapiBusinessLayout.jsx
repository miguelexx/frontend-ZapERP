import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  IconBrandWhatsapp,
  IconBuildingStore,
  IconRefresh,
  IconRobot,
  IconShoppingBag,
  IconTags,
} from "@tabler/icons-react";
import { listarInstanciasWhapi } from "../api/whapiInstancesService";
import { isWhapiInstance } from "../api/whapiInstancesService";
import { useAuthStore } from "../auth/authStore";
import { isSupervisorOrAdmin } from "../auth/permissions";
import { fetchWhatsappInstancesAtendimento, whatsappInstanceLabel } from "../chats/whatsappInstancesService";
import "./whapiBusiness.css";

const STORAGE_KEY = "zaperp_whapi_business_instance";

function preferredInstance(instances) {
  let stored = "";
  try {
    stored = localStorage.getItem(STORAGE_KEY) || "";
  } catch {}
  return (
    instances.find((item) => String(item.id) === stored)
    || instances.find((item) => item.is_default)
    || instances[0]
    || null
  );
}

export function whapiInstanceName(instance) {
  return whatsappInstanceLabel(instance) || instance?.instance_id || `Canal #${instance?.id ?? "—"}`;
}

export default function WhapiBusinessLayout() {
  const user = useAuthStore((state) => state.user);
  const canManageProfile = isSupervisorOrAdmin(user);
  const [instances, setInstances] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [instancesError, setInstancesError] = useState("");

  const loadInstances = useCallback(async ({ refresh = false } = {}) => {
    setLoadingInstances(true);
    setInstancesError("");
    try {
      const response = canManageProfile
        ? await listarInstanciasWhapi({ refresh })
        : await fetchWhatsappInstancesAtendimento({ silent: true });
      const list = (response.instances || []).filter(isWhapiInstance);
      setInstances(list);
      setSelectedId((current) => {
        if (list.some((item) => String(item.id) === String(current))) return current;
        return preferredInstance(list)?.id ?? null;
      });
    } catch (error) {
      setInstances([]);
      setSelectedId(null);
      setInstancesError(
        error?.response?.data?.error
        || error?.message
        || "Não foi possível carregar os canais Whapi."
      );
    } finally {
      setLoadingInstances(false);
    }
  }, [canManageProfile]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  const selectedInstance = useMemo(
    () => instances.find((item) => String(item.id) === String(selectedId)) || null,
    [instances, selectedId]
  );

  function selectInstance(value) {
    const next = instances.find((item) => String(item.id) === String(value)) || null;
    setSelectedId(next?.id ?? null);
    try {
      if (next?.id != null) localStorage.setItem(STORAGE_KEY, String(next.id));
    } catch {}
  }

  const context = useMemo(
    () => ({
      instances,
      selectedId,
      selectedInstance,
      loadingInstances,
      instancesError,
      canManageProfile,
      reloadInstances: () => loadInstances({ refresh: true }),
    }),
    [instances, selectedId, selectedInstance, loadingInstances, instancesError, canManageProfile, loadInstances]
  );

  return (
    <section className="wb-page">
      <div className="wb-ambient wb-ambient--one" aria-hidden="true" />
      <div className="wb-ambient wb-ambient--two" aria-hidden="true" />

      <header className="wb-header">
        <div className="wb-header__identity">
          <span className="wb-brand-mark" aria-hidden="true">
            <IconBrandWhatsapp size={23} stroke={1.8} />
          </span>
          <div>
            <span className="wb-eyebrow">WhatsApp Business</span>
            <h1>Presença da sua marca</h1>
            <p>Gerencie o perfil público e os labels oficiais dos seus canais Whapi.</p>
          </div>
        </div>

        <div className="wb-channel-control">
          <label htmlFor="wb-channel">Canal Whapi</label>
          <div className="wb-channel-control__row">
            <select
              id="wb-channel"
              value={selectedId ?? ""}
              onChange={(event) => selectInstance(event.target.value)}
              disabled={loadingInstances || instances.length === 0}
            >
              {instances.length === 0 ? (
                <option value="">Nenhum canal disponível</option>
              ) : (
                instances.map((instance) => (
                  <option key={instance.id} value={instance.id}>
                    {whapiInstanceName(instance)}{instance.is_default ? " · padrão" : ""}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              className="wb-icon-button"
              onClick={() => loadInstances({ refresh: true })}
              disabled={loadingInstances}
              aria-label="Atualizar canais Whapi"
              title="Atualizar canais"
            >
              <IconRefresh className={loadingInstances ? "wb-spin" : ""} size={18} />
            </button>
          </div>
          {selectedInstance ? (
            <span className={`wb-channel-status${selectedInstance.connected ? " is-online" : ""}`}>
              <i aria-hidden="true" />
              {selectedInstance.connected ? "Conectado" : "Canal cadastrado"}
            </span>
          ) : null}
        </div>
      </header>

      <nav className="wb-tabs" aria-label="WhatsApp Business">
        {canManageProfile ? (
          <NavLink to="/whatsapp-business/perfil" className={({ isActive }) => `wb-tab${isActive ? " is-active" : ""}`}>
            <IconBuildingStore size={18} stroke={1.8} />
            <span>Perfil Business</span>
          </NavLink>
        ) : null}
        <NavLink to="/whatsapp-business/labels" className={({ isActive }) => `wb-tab${isActive ? " is-active" : ""}`}>
          <IconTags size={18} stroke={1.8} />
          <span>Labels</span>
        </NavLink>
        <NavLink to="/whatsapp-business/catalogo" className={({ isActive }) => `wb-tab${isActive ? " is-active" : ""}`}>
          <IconShoppingBag size={18} stroke={1.8} />
          <span>Catálogo</span>
        </NavLink>
        {canManageProfile ? (
          <NavLink to="/whatsapp-business/triagem-interativa" className={({ isActive }) => `wb-tab${isActive ? " is-active" : ""}`}>
            <IconRobot size={18} stroke={1.8} />
            <span>Triagem Interativa</span>
          </NavLink>
        ) : null}
      </nav>

      {instancesError ? (
        <div className="wb-inline-alert wb-inline-alert--error" role="alert">
          <span>{instancesError}</span>
          <button type="button" onClick={() => loadInstances({ refresh: true })}>Tentar novamente</button>
        </div>
      ) : null}

      <div className="wb-content">
        <Outlet context={context} />
      </div>
    </section>
  );
}
