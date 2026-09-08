import { useCallback, useEffect, useState } from "react";
import {
  addGrupoParticipante,
  approveGrupoSolicitacao,
  demoteGrupoAdmin,
  getGrupoInvite,
  getGrupoWhatsapp,
  leaveGrupoWhatsapp,
  listGrupoSolicitacoes,
  promoteGrupoAdmin,
  rejectGrupoSolicitacao,
  removeGrupoParticipante,
  revokeGrupoInvite,
  sendGrupoInvite,
  updateGrupoSetting,
  removeGrupoFoto,
  setGrupoFoto,
  updateGrupoWhatsapp,
} from "../groupWhatsappService";

export function useGroupWhatsapp({ open, conversaId, showToast }) {
  const [grupo, setGrupo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [invite, setInvite] = useState(null);
  const [apps, setApps] = useState([]);

  const load = useCallback(async (resync = false) => {
    if (!conversaId) return;
    setLoading(true);
    try {
      const data = await getGrupoWhatsapp(conversaId, { resync });
      setGrupo(data || null);
    } catch (e) {
      setGrupo(null);
      const msg = e?.response?.data?.error || e?.message;
      showToast?.({ type: "error", title: "Grupo", message: msg || "Não foi possível carregar os dados do grupo." });
    } finally {
      setLoading(false);
    }
  }, [conversaId, showToast]);

  useEffect(() => {
    if (!open || !conversaId) {
      setGrupo(null);
      setInvite(null);
      setApps([]);
      return;
    }
    load(true);
  }, [open, conversaId, load]);

  const run = useCallback(async (key, fn, successMsg) => {
    if (busy) return null;
    setBusy(key);
    try {
      const data = await fn();
      if (successMsg) showToast?.({ type: "success", title: "Grupo", message: successMsg });
      await load(true);
      return data;
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message;
      showToast?.({ type: "error", title: "Grupo", message: msg || "Não foi possível concluir a ação." });
      return null;
    } finally {
      setBusy("");
    }
  }, [busy, load, showToast]);

  return {
    grupo,
    loading,
    busy,
    invite,
    apps,
    reload: load,
    updateInfo: (body) => run("info", () => updateGrupoWhatsapp(conversaId, body), "Dados do grupo atualizados."),
    updateSetting: (setting, policy) => run("set", () => updateGrupoSetting(conversaId, setting, policy), "Configuração atualizada."),
    leave: () => run("leave", () => leaveGrupoWhatsapp(conversaId), "Você saiu do grupo."),
    addParticipant: (telefone) => run("add", () => addGrupoParticipante(conversaId, telefone), "Participante adicionado."),
    removeParticipant: (telefone) => run("rm", () => removeGrupoParticipante(conversaId, telefone), "Participante removido."),
    promote: (telefone) => run("pro", () => promoteGrupoAdmin(conversaId, telefone), "Agora é admin."),
    demote: (telefone) => run("dem", () => demoteGrupoAdmin(conversaId, telefone), "Admin removido."),
    loadInvite: async () => {
      try {
        const data = await getGrupoInvite(conversaId);
        setInvite(data);
        return data;
      } catch (e) {
        showToast?.({ type: "error", title: "Convite", message: e?.response?.data?.error || e?.message });
        return null;
      }
    },
    revokeInvite: () => run("inv", async () => {
      const data = await revokeGrupoInvite(conversaId);
      setInvite(null);
      return data;
    }, "Link de convite redefinido."),
    sendInvite: (telefone) => run("sendInv", () => sendGrupoInvite(conversaId, telefone), "Convite enviado."),
    loadApps: async () => {
      try {
        const data = await listGrupoSolicitacoes(conversaId);
        setApps(Array.isArray(data?.applications) ? data.applications : []);
        return data;
      } catch {
        setApps([]);
        return null;
      }
    },
    approveApp: (application) => run("app", () => approveGrupoSolicitacao(conversaId, application), "Solicitação aprovada."),
    rejectApp: (application) => run("app", () => rejectGrupoSolicitacao(conversaId, application), "Solicitação recusada."),
    setPhoto: (media, mimeType) => run("pic", () => setGrupoFoto(conversaId, media, mimeType), "Foto do grupo atualizada."),
    removePhoto: () => run("pic", () => removeGrupoFoto(conversaId), "Foto do grupo removida."),
  };
}
