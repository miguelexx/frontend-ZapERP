import { useState } from "react";
import * as iaApi from "../../api/iaService";
import { useNotificationStore } from "../../notifications/notificationStore";
import Switch from "../../components/ui/Switch";
import { formatAdminAlertContactOption, formatTimeForInput, normalizeHorarioAdminAlerta } from "../shared/dateTime";
import { useClienteOptions } from "./useClienteOptions";

export default function AdminAtendimentoAlertCard({ adminAl, setAdminAl, onSaveAdminAlert, saving }) {
  const showToast = useNotificationStore((state) => state.showToast);
  const [adminTesteEnviando, setAdminTesteEnviando] = useState(false);
  const adminContatos = useClienteOptions(adminAl?.ativo);
  const selectedAdminContatoId = adminAl.cliente_id ? String(adminAl.cliente_id) : "";
  const selectedAdminContatoFallback =
    selectedAdminContatoId && !adminContatos.options.some((contact) => String(contact.id) === selectedAdminContatoId)
      ? [{ id: Number(adminAl.cliente_id), nome: adminAl.cliente_nome || "Contato selecionado", telefone: adminAl.telefone_admin || "" }]
      : [];
  const adminContatoSelectOptions = [...selectedAdminContatoFallback, ...adminContatos.options];

  return (
          <div className="chatbot-card chatbot-card--admin-alerta">
            <h3 className="chatbot-card-title">8. Alerta do administrador</h3>
            <p className="chatbot-card-subtitle chatbot-card-subtitle--muted">
              Resumo automático por WhatsApp no horário definido (fuso da seção 4 ou campo abaixo). Desativado por
              padrão. O backend verifica o horário periodicamente enquanto estiver em execução. Opcionalmente use também{" "}
              <code className="chatbot-inline-code">POST /jobs/admin-atendimento-alerta</code> com header{" "}
              <code className="chatbot-inline-code">X-Cron-Secret</code>.
            </p>
            <div className="ds-switch-row" style={{ marginBottom: 12 }}>
              <Switch
                checked={adminAl.ativo === true}
                onChange={(x) =>
                  setAdminAl((c) => {
                    const next = { ...c, ativo: x };
                    if (x && !c.incluir_nota_media && c.incluir_conversas_sem_resposta === false) {
                      next.incluir_conversas_sem_resposta = true;
                    }
                    return next;
                  })
                }
              />
              <span>Ativar alerta</span>
            </div>
            <div
              className="chatbot-fora-horario-fields"
              style={{
                opacity: adminAl.ativo ? 1 : 0.55,
                pointerEvents: adminAl.ativo ? "auto" : "none",
              }}
            >
              <div className="ia-field">
                <label>Contato que receberá o alerta</label>
                <div className="chatbot-time-row" style={{ alignItems: "flex-end", gap: 12 }}>
                  <input
                    type="search"
                    className="ia-input"
                    value={adminContatos.search}
                    onChange={(e) => adminContatos.setSearch(e.target.value)}
                    placeholder="Buscar por nome ou telefone"
                    autoComplete="off"
                    style={{ minWidth: 220 }}
                  />
                  <select
                    className="ia-select"
                    value={selectedAdminContatoId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const contato = adminContatoSelectOptions.find((c) => String(c.id) === id);
                      setAdminAl((c) => ({
                        ...c,
                        cliente_id: id ? Number(id) : null,
                        cliente_nome: contato ? String(contato.nome || contato.pushname || "").trim().slice(0, 120) : "",
                        telefone_admin: contato ? String(contato.telefone || contato.wa_id || "").trim().slice(0, 40) : "",
                      }));
                    }}
                    style={{ minWidth: 280 }}
                  >
                    <option value="">{adminContatos.loading ? "Carregando contatos..." : "Selecione um contato"}</option>
                    {adminContatoSelectOptions.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {formatAdminAlertContactOption(cliente)}
                      </option>
                    ))}
                  </select>
                </div>
                {adminAl.telefone_admin ? (
                  <p className="chatbot-hint" style={{ marginTop: 6 }}>
                    Envio para {adminAl.cliente_nome || "contato selecionado"} ({adminAl.telefone_admin}).
                  </p>
                ) : (
                  <p className="chatbot-hint" style={{ marginTop: 6 }}>
                    O contato precisa ter telefone ou WhatsApp cadastrado.
                  </p>
                )}
              </div>
              <div className="chatbot-time-row">
                <div className="ia-field">
                  <label>Horário de envio (fuso abaixo)</label>
                  <input
                    type="time"
                    className="ia-input"
                    value={formatTimeForInput(adminAl.horario_envio)}
                    onChange={(e) => setAdminAl((c) => ({ ...c, horario_envio: e.target.value }))}
                  />
                </div>
                <div className="ia-field">
                  <label>Fuso IANA (opcional)</label>
                  <input
                    type="text"
                    className="ia-input"
                    value={adminAl.timezone || ""}
                    onChange={(e) => setAdminAl((c) => ({ ...c, timezone: e.target.value }))}
                    placeholder="Vazio = mesmo da seção 4"
                  />
                </div>
              </div>
              <div className="ia-checkbox-row">
                <input
                  type="checkbox"
                  id="admin_alerta_nota"
                  checked={adminAl.incluir_nota_media === true}
                  onChange={(e) => setAdminAl((c) => ({ ...c, incluir_nota_media: e.target.checked }))}
                />
                <label htmlFor="admin_alerta_nota">Incluir nota média (avaliações dos últimos 30 dias)</label>
              </div>
              <div className="ia-checkbox-row">
                <input
                  type="checkbox"
                  id="admin_alerta_fila"
                  checked={adminAl.incluir_conversas_sem_resposta === true}
                  onChange={(e) => setAdminAl((c) => ({ ...c, incluir_conversas_sem_resposta: e.target.checked }))}
                />
                <label htmlFor="admin_alerta_fila">
                  Incluir quantidade de conversas aguardando resposta (etiqueta &quot;Aguardando funcionário&quot;; não
                  conta finalizadas, aguardando cliente nem triagem ativa do chatbot)
                </label>
              </div>
              <p className="chatbot-hint" style={{ marginTop: 8 }}>
                Marque ao menos uma métrica (recomendado). O envio automático ocorre no horário configurado, com tolerância
                de até 30 minutos (fuso da seção 4 ou campo acima). Um envio por dia por empresa.
              </p>
              <div className="ia-btn-row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="ia-btn ia-btn--outline"
                  onClick={() => {
                    const clienteId = Number(adminAl.cliente_id);
                    const telefoneAdmin = String(adminAl.telefone_admin || "").trim().slice(0, 40);
                    if (adminAl.ativo && !clienteId && !telefoneAdmin) {
                      showToast({ type: "error", title: "Alerta do administrador", message: "Selecione o contato que receberá o alerta." });
                      return;
                    }
                    if (
                      adminAl.ativo &&
                      !adminAl.incluir_nota_media &&
                      adminAl.incluir_conversas_sem_resposta === false
                    ) {
                      showToast({
                        type: "error",
                        title: "Alerta do administrador",
                        message: "Marque ao menos uma métrica para incluir no resumo.",
                      });
                      return;
                    }
                    onSaveAdminAlert({
                      ...adminAl,
                      cliente_id: Number.isInteger(clienteId) && clienteId > 0 ? clienteId : null,
                      cliente_nome: String(adminAl.cliente_nome || "").trim().slice(0, 120),
                      horario_envio: normalizeHorarioAdminAlerta(adminAl.horario_envio),
                      telefone_admin: telefoneAdmin,
                      timezone: String(adminAl.timezone || "").trim().slice(0, 80),
                      incluir_conversas_sem_resposta: adminAl.incluir_conversas_sem_resposta !== false,
                    });
                  }}
                  disabled={saving}
                >
                  {saving ? "Salvando…" : "Salvar alerta do administrador"}
                </button>
                <button
                  type="button"
                  className="ia-btn ia-btn--primary"
                  disabled={saving || adminTesteEnviando || !adminAl.ativo}
                  onClick={async () => {
                    const clienteId = Number(adminAl.cliente_id);
                    const telefoneAdmin = String(adminAl.telefone_admin || "").trim();
                    if (!clienteId && telefoneAdmin.replace(/\D/g, "").length < 10) {
                      showToast({
                        type: "error",
                        title: "Teste do alerta",
                        message: "Salve o alerta com um contato válido antes de testar.",
                      });
                      return;
                    }
                    setAdminTesteEnviando(true);
                    try {
                      await iaApi.testarAdminAtendimentoAlerta();
                      showToast({
                        type: "success",
                        title: "Teste enviado",
                        message: "Verifique o WhatsApp do contato selecionado.",
                      });
                    } catch (e) {
                      const msg =
                        e?.response?.data?.error ||
                        e?.response?.data?.message ||
                        "Não foi possível enviar o teste.";
                      showToast({ type: "error", title: "Teste do alerta", message: msg });
                    } finally {
                      setAdminTesteEnviando(false);
                    }
                  }}
                >
                  {adminTesteEnviando ? "Enviando teste…" : "Enviar teste agora"}
                </button>
              </div>
            </div>
          </div>
  );
}
