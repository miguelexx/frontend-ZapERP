import { useEffect, useState } from "react";
import { useNotificationStore } from "../../notifications/notificationStore";
import Switch from "../../components/ui/Switch";
import TriagemPreview from "../preview/TriagemPreview";
import AdminAtendimentoAlertCard from "../gestores/AdminAtendimentoAlertCard";
import { buildTriagemPayload } from "./triagemPayload";

const DIAS_SEMANA = [
  { num: 0, label: "Dom" },
  { num: 1, label: "Seg" },
  { num: 2, label: "Ter" },
  { num: 3, label: "Qua" },
  { num: 4, label: "Qui" },
  { num: 5, label: "Sex" },
  { num: 6, label: "Sáb" },
];

function formatTimeForInput(t) {
  if (!t || typeof t !== "string") return "09:00";
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "09:00";
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const min = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export default function TriagemView({
  config,
  adminAtendimentoAlerta,
  departamentos,
  logs,
  onSave,
  onSaveAdminAlert,
  onRefreshLogs,
  saving,
}) {
  const [v, setV] = useState(config);
  const [adminAl, setAdminAl] = useState(adminAtendimentoAlerta);
  const [novaDataFechada, setNovaDataFechada] = useState("");
  useEffect(() => setV(config), [config]);
  useEffect(() => setAdminAl(adminAtendimentoAlerta), [adminAtendimentoAlerta]);

  const showToast = useNotificationStore((s) => s.showToast);

  const addOption = () => {
    const opts = v.options || [];
    const nextKey = String((opts.length > 0 ? Math.max(...opts.map((o) => parseInt(o.key, 10) || 0)) : 0) + 1);
    setV((c) => ({
      ...c,
      options: [...opts, { key: nextKey, label: "", departamento_id: "", active: true }],
    }));
  };

  const updateOption = (idx, field, value) => {
    const opts = [...(v.options || [])];
    opts[idx] = { ...opts[idx], [field]: value };
    setV((c) => ({ ...c, options: opts }));
  };

  const removeOption = (idx) => {
    const opts = [...(v.options || [])];
    opts.splice(idx, 1);
    setV((c) => ({ ...c, options: opts }));
  };

  const validate = () => {
    const vals = v;
    if (!vals || typeof vals !== "object") return "Dados inválidos.";
    const opts = vals.options || [];
    if (vals.enabled) {
      const welcome = (vals.welcomeMessage || "").trim();
      if (!welcome) return "Mensagem de boas-vindas é obrigatória quando o chatbot está ativo.";
      const activeOpts = opts.filter((o) => o.active !== false);
      const validOpts = activeOpts.filter((o) => (o.label || "").trim() && o.departamento_id);
      if (validOpts.length === 0) return "Adicione pelo menos uma opção válida (label e departamento) quando o chatbot está ativo.";
    }
    if (vals.foraHorarioEnabled) {
      const msgFora = (vals.mensagemForaHorario || "").trim();
      if (!msgFora) return "Mensagem fora do horário é obrigatória quando está ativo o envio fora do horário comercial.";
    }
    const keys = opts.map((o) => String(o.key || "").trim()).filter(Boolean);
    const uniqueKeys = [...new Set(keys)];
    if (keys.length !== uniqueKeys.length) return "Cada opção deve ter uma key única.";
    for (let i = 0; i < opts.length; i++) {
      const o = opts[i];
      if (o.active !== false) {
        if (!(o.label || "").trim()) return `Opção ${i + 1}: label é obrigatório.`;
        if (!o.departamento_id) return `Opção ${i + 1}: departamento é obrigatório.`;
      }
    }
    if (vals.redirecionar_sem_resposta_ativo && !vals.redirecionar_sem_resposta_departamento_id) {
      return "Selecione um setor padrão para o redirecionamento por falta de resposta.";
    }
    if (vals.redirecionar_sem_resposta_ativo) {
      const min = Number(vals.redirecionar_sem_resposta_minutos);
      if (!Number.isFinite(min) || min < 1) return "O tempo de espera para redirecionamento deve ser de no mínimo 1 minuto.";
    }
    return null;
  };

  const handleSave = () => {
    const err = validate();
    if (err) {
      showToast({ type: "error", title: "Validação", message: err });
      return;
    }
    onSave(buildTriagemPayload(v));
  };

  const opts = v.options || [];
  return (
    <div className="chatbot-section">
      <div className="chatbot-header">
        <div className="chatbot-header-left">
          <Switch checked={v.enabled} onChange={(x) => setV((c) => ({ ...c, enabled: x }))} />
          <div>
            <h2 className="chatbot-title">Chatbot de Triagem</h2>
            <p className="chatbot-subtitle">Configure o roteador automático de atendimento (menu de setores)</p>
          </div>
        </div>
        <span className={`chatbot-badge ${v.enabled ? "chatbot-badge--on" : "chatbot-badge--off"}`} title={v.enabled ? "Clique no interruptor para desativar" : "Clique no interruptor para ativar"}>
          {v.enabled ? "Ativado" : "Desativado"}
        </span>
      </div>

      <div className="chatbot-grid">
        <div className="chatbot-form">
          {/* SEÇÃO 1 — Ativar + Mensagem de boas-vindas */}
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">1. Mensagem de boas-vindas</h3>
            <div className="ia-field">
              <label title="Enviada quando o cliente manda a primeira mensagem. Inclua as opções do menu (ex: 1 - Atendimento, 2 - Vendas).">
                Mensagem de boas-vindas
              </label>
              <textarea
                className="ia-textarea chatbot-textarea"
                rows={6}
                value={v.welcomeMessage || ""}
                onChange={(e) => setV((c) => ({ ...c, welcomeMessage: e.target.value }))}
                placeholder="Olá! Seja bem-vindo(a) à sua empresa.&#10;Para direcionarmos seu atendimento, escolha o setor:&#10;&#10;1 - Atendimento&#10;2 - Vendas&#10;3 - Financeiro&#10;&#10;Responda com o número da opção desejada."
              />
            </div>
            <div className="ia-field">
              <label title="Enviada quando o cliente digita um número que não está no menu.">
                Mensagem quando o cliente digita opção errada
              </label>
              <textarea
                className="ia-textarea"
                rows={2}
                value={v.invalidOptionMessage || ""}
                onChange={(e) => setV((c) => ({ ...c, invalidOptionMessage: e.target.value }))}
                placeholder="Opção inválida. Por favor, responda apenas com o número do setor desejado."
              />
            </div>
            <div className="ia-field">
              <label title="Após o cliente escolher uma opção válida. Use {{departamento}} para substituir pelo nome do setor.">
                Mensagem de confirmação (use {"{{departamento}}"})
              </label>
              <textarea
                className="ia-textarea"
                rows={2}
                value={v.confirmSelectionMessage || ""}
                onChange={(e) => setV((c) => ({ ...c, confirmSelectionMessage: e.target.value }))}
                placeholder="Perfeito! Seu atendimento foi direcionado para o setor {{departamento}}. Em instantes nossa equipe dará continuidade."
              />
            </div>
            <div className="ia-field">
              <label title="O cliente pode digitar este comando (ex: 0) para ver o menu novamente.">
                Comando para ver o menu de novo
              </label>
              <input
                type="text"
                className="ia-input chatbot-input-cmd"
                value={v.reopenMenuCommand ?? "0"}
                onChange={(e) => setV((c) => ({ ...c, reopenMenuCommand: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="ia-checkbox-row">
              <input
                type="checkbox"
                id="sendOnlyFirstTime"
                checked={v.sendOnlyFirstTime !== false}
                onChange={(e) => setV((c) => ({ ...c, sendOnlyFirstTime: e.target.checked }))}
              />
              <label htmlFor="sendOnlyFirstTime" title="Se marcado, o menu só é enviado na primeira mensagem.">
                Enviar menu apenas na primeira mensagem
              </label>
            </div>
          </div>

          {/* SEÇÃO 2 — Escolhas do menu */}
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">2. Escolhas que o cliente verá no WhatsApp</h3>
            <p className="chatbot-card-subtitle">O que aparece quando alguém manda a primeira mensagem</p>
            <div className="chatbot-table-wrap">
              <table className="ia-table chatbot-table">
                <thead>
                  <tr>
                    <th title="O número que o cliente digita para escolher (1, 2, 3...)">Nº</th>
                    <th title="O texto que aparece no menu (ex: Atendimento, Vendas)">O que o cliente vê</th>
                    <th title="Para qual equipe a conversa vai quando o cliente escolher esta opção">Setor que recebe</th>
                    <th title="Se desmarcado, esta opção não aparece no menu">Opção ativa</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {opts.map((o, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="text"
                          className="ia-input chatbot-input-key"
                          value={o.key ?? ""}
                          onChange={(e) => updateOption(idx, "key", e.target.value)}
                          placeholder="1"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="ia-input"
                          value={o.label ?? ""}
                          onChange={(e) => updateOption(idx, "label", e.target.value)}
                          placeholder="Atendimento"
                        />
                      </td>
                      <td>
                        <select
                          className="ia-select"
                          value={o.departamento_id ?? ""}
                          onChange={(e) => updateOption(idx, "departamento_id", e.target.value)}
                        >
                          <option value="">Selecione</option>
                          {departamentos.map((d) => (
                            <option key={d.id} value={d.id}>{d.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={o.active !== false}
                          onChange={(e) => updateOption(idx, "active", e.target.checked)}
                          aria-label="Opção ativa"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="chatbot-btn-remove"
                          onClick={() => removeOption(idx)}
                          aria-label="Remover"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {departamentos.length === 0 && (
              <p className="chatbot-hint">Cadastre departamentos em Configurações para vincular às opções.</p>
            )}
            <button type="button" className="chatbot-btn-add" onClick={addOption}>
              + Adicionar nova escolha
            </button>
          </div>

          {/* SEÇÃO 3 — Mensagem ao finalizar atendimento */}
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">3. Mensagem ao finalizar atendimento</h3>
            <p className="chatbot-card-subtitle">
              Enviada automaticamente quando o atendente clicar em &quot;Finalizar conversa&quot;. O cliente pode responder 0–10 para avaliar.
            </p>
            <div className="ds-switch-row" style={{ marginBottom: 16 }}>
              <Switch checked={v.enviarMensagemFinalizacao === true} onChange={(x) => setV((c) => ({ ...c, enviarMensagemFinalizacao: x }))} />
              <span>Enviar mensagem automaticamente quando finalizar conversa</span>
            </div>
            <div className="ia-field">
              <label title="Use {{protocolo}} para o número do atendimento e {{nome_atendente}} para o nome.">
                Mensagem (use {"{{protocolo}}"} e {"{{nome_atendente}}"})
              </label>
              <textarea
                className="ia-textarea"
                rows={5}
                value={v.mensagemFinalizacao || ""}
                onChange={(e) => setV((c) => ({ ...c, mensagemFinalizacao: e.target.value }))}
                placeholder="Atendimento finalizado com sucesso. (Segue seu protocolo: {{protocolo}}.\nPor favor, informe uma nota entre 0 e 10 para avaliar o atendimento prestado.)"
                disabled={!v.enviarMensagemFinalizacao}
              />
              <p className="chatbot-hint" style={{ marginTop: 6 }}>
                Placeholders: <code>{"{{protocolo}}"}</code> = número do protocolo (ID do atendimento); <code>{"{{nome_atendente}}"}</code> = nome do atendente que finalizou.
              </p>
            </div>
          </div>

          {/* SEÇÃO 4 — Mensagem fora do horário comercial */}
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">4. Mensagem fora do horário comercial</h3>
            <div className="ds-switch-row" style={{ marginBottom: 16 }}>
              <Switch checked={v.foraHorarioEnabled === true} onChange={(x) => setV((c) => ({ ...c, foraHorarioEnabled: x }))} />
              <span>Enviar mensagem automática quando o cliente escrever fora do horário</span>
            </div>

            <div className="chatbot-fora-horario-fields" style={{ opacity: v.foraHorarioEnabled ? 1 : 0.6, pointerEvents: v.foraHorarioEnabled ? "auto" : "none" }}>
                  <div className="chatbot-subsection">
                    <h4 className="chatbot-subsection-title">Horário de atendimento</h4>
                    <div className="chatbot-time-row">
                      <div className="ia-field">
                        <label>Início</label>
                        <input
                          type="time"
                          className="ia-input"
                          value={formatTimeForInput(v.horarioInicio) || "09:00"}
                          onChange={(e) => setV((c) => ({ ...c, horarioInicio: e.target.value }))}
                        />
                      </div>
                      <div className="ia-field">
                        <label>Término</label>
                        <input
                          type="time"
                          className="ia-input"
                          value={formatTimeForInput(v.horarioFim) || "18:00"}
                          onChange={(e) => setV((c) => ({ ...c, horarioFim: e.target.value }))}
                        />
                      </div>
                    </div>
                    <p className="chatbot-hint">
                      Horários que atravessam meia-noite são suportados (ex: 22:00–06:00).
                    </p>
                  </div>

                  <div className="chatbot-subsection">
                    <h4 className="chatbot-subsection-title">Dias da semana em que não trabalha</h4>
                    <div className="chatbot-dias-row">
                      {DIAS_SEMANA.map((d) => {
                        const dias = v.diasSemanaDesativados || [0, 6];
                        const checked = dias.includes(d.num);
                        return (
                          <label key={d.num} className="chatbot-dia-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const prev = v.diasSemanaDesativados || [0, 6];
                                const next = checked ? prev.filter((n) => n !== d.num) : [...prev.filter((n) => n !== d.num), d.num].sort((a, b) => a - b);
                                setV((c) => ({ ...c, diasSemanaDesativados: next.length > 0 ? next : [0, 6] }));
                              }}
                            />
                            <span>{d.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="chatbot-hint">Marcado = não trabalha. Padrão: Dom e Sáb marcados.</p>
                  </div>

                  <div className="chatbot-subsection">
                    <h4 className="chatbot-subsection-title">Datas específicas fechadas (feriados, recesso)</h4>
                    <div className="chatbot-datas-row">
                      <input
                        type="date"
                        className="ia-input chatbot-input-date"
                        value={novaDataFechada}
                        onChange={(e) => setNovaDataFechada(e.target.value)}
                      />
                      <button
                        type="button"
                        className="ia-btn ia-btn--outline"
                        onClick={() => {
                          if (novaDataFechada) {
                            const datas = v.datasEspecificasFechadas || [];
                            if (!datas.includes(novaDataFechada)) {
                              setV((c) => ({ ...c, datasEspecificasFechadas: [...datas, novaDataFechada].sort() }));
                              setNovaDataFechada("");
                            }
                          }
                        }}
                      >
                        + Adicionar data
                      </button>
                      <button
                        type="button"
                        className="ia-btn ia-btn--outline"
                        title="Adiciona Natal e Ano Novo do ano atual"
                        onClick={() => {
                          const y = new Date().getFullYear();
                          const natal = `${y}-12-25`;
                          const anoNovo = `${y + 1}-01-01`;
                          const datas = v.datasEspecificasFechadas || [];
                          const toAdd = [natal, anoNovo].filter((d) => !datas.includes(d));
                          if (toAdd.length > 0) {
                            setV((c) => ({ ...c, datasEspecificasFechadas: [...(c.datasEspecificasFechadas || []), ...toAdd].sort() }));
                          }
                        }}
                      >
                        + Feriados comuns
                      </button>
                    </div>
                    {(v.datasEspecificasFechadas || []).length > 0 && (
                      <ul className="chatbot-datas-list">
                        {(v.datasEspecificasFechadas || []).map((d) => (
                          <li key={d} className="chatbot-datas-item">
                            <span>{new Date(d + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                            <button
                              type="button"
                              className="chatbot-btn-remove"
                              onClick={() => setV((c) => ({ ...c, datasEspecificasFechadas: (c.datasEspecificasFechadas || []).filter((x) => x !== d) }))}
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="ia-field">
                    <label>Mensagem enviada fora do horário</label>
                    <textarea
                      className="ia-textarea"
                      rows={5}
                      maxLength={1024}
                      value={v.mensagemForaHorario || ""}
                      onChange={(e) => setV((c) => ({ ...c, mensagemForaHorario: e.target.value }))}
                      placeholder="Olá! Nosso horário de atendimento é de segunda a sexta, das 09h às 18h. Sua mensagem foi recebida e retornaremos no próximo dia útil. Obrigado!"
                    />
                    <p className="chatbot-hint">Máximo 1024 caracteres. Enviada quando o cliente escreve fora do horário ou em dia de folga.</p>
                  </div>
            </div>
          </div>

          {/* Finalização automática por ausência do cliente (config em chatbot_triage) */}
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">5. Finalização por ausência do cliente</h3>
            <p className="chatbot-card-subtitle">
              Encerra automaticamente conversas em atendimento humano quando o cliente não responde após a última mensagem da equipe, dentro do prazo configurado. Desligado por padrão.
            </p>
            <div className="ds-switch-row" style={{ marginBottom: 16 }}>
              <Switch
                checked={v.finalizar_por_ausencia_ativo === true}
                onChange={(x) => setV((c) => ({ ...c, finalizar_por_ausencia_ativo: x }))}
              />
              <span>Ativar finalização automática por ausência</span>
            </div>
            <div
              className="chatbot-fora-horario-fields"
              style={{
                opacity: v.finalizar_por_ausencia_ativo ? 1 : 0.55,
                pointerEvents: v.finalizar_por_ausencia_ativo ? "auto" : "none",
              }}
            >
              <div className="chatbot-time-row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
                <div className="ia-field" style={{ minWidth: 120 }}>
                  <label>Prazo (horas)</label>
                  <input
                    type="number"
                    className="ia-input chatbot-input-cmd"
                    min={1}
                    max={720}
                    value={v.finalizar_por_ausencia_prazo ?? 24}
                    onChange={(e) =>
                      setV((c) => ({
                        ...c,
                        finalizar_por_ausencia_prazo: Math.max(1, Math.min(720, Number(e.target.value) || 24)),
                      }))
                    }
                  />
                  <p className="chatbot-hint" style={{ marginTop: 4 }}>Entre 1 e 720 horas (o servidor valida o limite).</p>
                </div>
                <div className="ia-field" style={{ minWidth: 200 }}>
                  <label>Contagem do prazo</label>
                  <select
                    className="ia-select"
                    value={v.finalizar_por_ausencia_unidade === "horas_uteis" ? "horas_uteis" : "horas_corridas"}
                    onChange={(e) =>
                      setV((c) => ({ ...c, finalizar_por_ausencia_unidade: e.target.value }))
                    }
                  >
                    <option value="horas_corridas">Horas corridas</option>
                    <option value="horas_uteis">Horas úteis</option>
                  </select>
                </div>
              </div>
              {v.finalizar_por_ausencia_unidade === "horas_uteis" ? (
                <p className="chatbot-hint" style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "rgba(251, 191, 36, 0.12)", border: "1px solid rgba(251, 191, 36, 0.35)" }}>
                  <strong>Atenção:</strong> no backend atual, &quot;horas úteis&quot; ainda são tratadas como horas corridas até haver suporte completo a calendário comercial. Ajuste o prazo considerando essa limitação.
                </p>
              ) : null}
              <div className="ds-switch-row" style={{ marginTop: 16 }}>
                <Switch
                  checked={v.finalizar_por_ausencia_enviar_mensagem === true}
                  onChange={(x) => setV((c) => ({ ...c, finalizar_por_ausencia_enviar_mensagem: x }))}
                />
                <span>Enviar mensagem de finalização ao cliente</span>
              </div>
              <p className="chatbot-hint" style={{ marginTop: 4, marginBottom: 12 }}>
                Quando desligado, a conversa será encerrada apenas dentro do sistema, sem enviar nada ao cliente.
              </p>
              <div
                className="ia-field"
                style={{
                  opacity: v.finalizar_por_ausencia_enviar_mensagem === true ? 1 : 0.55,
                }}
              >
                <label>Mensagem enviada ao cliente antes de encerrar</label>
                <textarea
                  className="ia-textarea"
                  rows={4}
                  disabled={v.finalizar_por_ausencia_enviar_mensagem !== true}
                  value={v.finalizar_por_ausencia_mensagem ?? ""}
                  onChange={(e) => setV((c) => ({ ...c, finalizar_por_ausencia_mensagem: e.target.value }))}
                  placeholder="Digite a mensagem de finalização enviada ao cliente."
                />
                <p className="chatbot-hint" style={{ marginTop: 6 }}>
                  O texto fica salvo ao desligar a opção e poderá ser reutilizado se o envio for ativado novamente.
                </p>
              </div>
              <div className="ds-switch-row" style={{ marginTop: 16 }}>
                <Switch
                  checked={v.finalizar_por_ausencia_reabrir_automaticamente !== false}
                  onChange={(x) => setV((c) => ({ ...c, finalizar_por_ausencia_reabrir_automaticamente: x }))}
                />
                <span>Reabrir automaticamente se o cliente voltar a falar</span>
              </div>
              <p className="chatbot-hint" style={{ marginTop: 4, marginBottom: 12 }}>
                Quando desligado, a conversa permanece fechada até um atendente reabrir manualmente (salvo outras regras da empresa).
              </p>
              <div className="ds-switch-row">
                <Switch
                  checked={v.finalizar_por_ausencia_reabrir_sem_chatbot !== false}
                  onChange={(x) => setV((c) => ({ ...c, finalizar_por_ausencia_reabrir_sem_chatbot: x }))}
                />
                <span>Na reabertura automática, ir direto ao atendente (sem passar pelo menu do chatbot)</span>
              </div>
              <p className="chatbot-hint" style={{ marginTop: 4 }}>
                Útil para o cliente continuar o diálogo com a equipe sem receber de novo o menu de triagem.
              </p>
            </div>
          </div>

          {/* SEÇÃO 6 — Redirecionamento automático por falta de resposta ao menu */}
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">6. Redirecionamento por falta de resposta</h3>
            <p className="chatbot-card-subtitle">
              Após o envio do menu de boas-vindas, se o cliente não responder dentro do prazo configurado, a conversa é encaminhada automaticamente para um setor padrão. O redirecionamento é cancelado caso o cliente responda ou selecione um setor antes do prazo. Desligado por padrão.
            </p>
            <div className="ds-switch-row" style={{ marginBottom: 16 }}>
              <Switch
                checked={v.redirecionar_sem_resposta_ativo === true}
                onChange={(x) => setV((c) => ({ ...c, redirecionar_sem_resposta_ativo: x }))}
              />
              <span>Ativar redirecionamento automático por falta de resposta</span>
            </div>
            <div
              className="chatbot-fora-horario-fields"
              style={{
                opacity: v.redirecionar_sem_resposta_ativo ? 1 : 0.55,
                pointerEvents: v.redirecionar_sem_resposta_ativo ? "auto" : "none",
              }}
            >
              <div className="chatbot-time-row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
                <div className="ia-field" style={{ minWidth: 140 }}>
                  <label>Tempo de espera (minutos)</label>
                  <input
                    type="number"
                    className="ia-input chatbot-input-cmd"
                    min={1}
                    max={1440}
                    value={v.redirecionar_sem_resposta_minutos ?? 5}
                    onChange={(e) =>
                      setV((c) => ({
                        ...c,
                        redirecionar_sem_resposta_minutos: Math.max(1, Math.min(1440, Number(e.target.value) || 5)),
                      }))
                    }
                  />
                  <p className="chatbot-hint" style={{ marginTop: 4 }}>Entre 1 e 1440 minutos (24 horas). O servidor verifica em ciclos de 1 minuto.</p>
                </div>
                <div className="ia-field" style={{ flex: 1, minWidth: 220 }}>
                  <label>Setor padrão de destino</label>
                  <select
                    className="ia-select"
                    value={v.redirecionar_sem_resposta_departamento_id ?? ""}
                    onChange={(e) =>
                      setV((c) => ({
                        ...c,
                        redirecionar_sem_resposta_departamento_id: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">— Selecione um setor —</option>
                    {departamentos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nome}</option>
                    ))}
                  </select>
                  <p className="chatbot-hint" style={{ marginTop: 4 }}>A conversa será transferida para este setor quando o prazo expirar sem resposta do cliente.</p>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 8 — Alerta do administrador (independente do chatbot; salva em admin_atendimento_alerta) */}
          <AdminAtendimentoAlertCard
            adminAl={adminAl}
            setAdminAl={setAdminAl}
            onSaveAdminAlert={onSaveAdminAlert}
            saving={saving}
          />

          {/* SEÇÃO 6 — Configurações avançadas */}
          <div className="chatbot-card">
            <h3 className="chatbot-card-title">6. Configurações avançadas</h3>
            <div className="ia-field">
              <label title="Define o que acontece quando o cliente responde com o número do setor (ex: 1 para Vendas).">
                Como a conversa chega ao setor
              </label>
              <select
                className="ia-select"
                value={v.tipo_distribuicao ?? "fila"}
                onChange={(e) => setV((c) => ({ ...c, tipo_distribuicao: e.target.value }))}
                title="Define o que acontece quando o cliente responde com o número do setor (ex: 1 para Vendas)."
              >
                <option value="fila">Todos do setor veem — quem assumir primeiro atende (recomendado)</option>
                <option value="round_robin">Rotação automática entre atendentes</option>
                <option value="menor_carga">Atribuir ao atendente com menos conversas</option>
              </select>
            </div>
            <div className="ia-field">
              <label title="Intervalo mínimo entre envios de mensagens automáticas. Evita bloqueio WhatsApp/UltraMSG. 0 = sem delay.">
                Intervalo entre envios (segundos)
              </label>
              <input
                type="number"
                className="ia-input chatbot-input-cmd"
                min={0}
                max={60}
                value={v.intervaloEnvioSegundos ?? 3}
                onChange={(e) => setV((c) => ({ ...c, intervaloEnvioSegundos: Number(e.target.value) || 0 }))}
                placeholder="3"
              />
            </div>
          </div>

          {/* SEÇÃO 6 — Salvar + Logs */}
          <div className="chatbot-actions">
            <button className="ia-btn ia-btn--primary chatbot-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </div>

        <TriagemPreview config={v} departamentos={departamentos} />
      </div>

      <div className="chatbot-logs">
        <div className="chatbot-logs-header">
          <h3 className="chatbot-card-title">Logs recentes</h3>
          <button type="button" className="ia-btn ia-btn--outline chatbot-btn-refresh" onClick={onRefreshLogs}>
            Atualizar
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="chatbot-empty">Nenhum log registrado.</p>
        ) : (
          <div className="chatbot-logs-list">
            {logs.map((l) => {
              const dataStr = l.criado_em ? new Date(l.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
              const detalhesStr = l.detalhes?.departamento || l.detalhes?.label || l.detalhes?.texto || "";
              const part3 = detalhesStr
                ? (l.conversa_id ? `${detalhesStr} (conv #${l.conversa_id})` : detalhesStr)
                : (l.conversa_id ? `conv #${l.conversa_id}` : "");
              const fullStr = [dataStr, l.tipo === "fora_horario" ? "fora do horário" : l.tipo, part3].filter(Boolean).join(" — ");
              const isForaHorario = l.tipo === "fora_horario";
              return (
                <div key={l.id} className={`chatbot-log-item ${l.tipo === "erro" ? "chatbot-log-item--error" : ""} ${isForaHorario ? "chatbot-log-item--fora-horario" : ""}`} title={isForaHorario ? "Cliente escreveu fora do horário comercial" : undefined}>
                  {fullStr}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

