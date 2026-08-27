import { useCallback, useEffect, useState } from "react";
import Switch from "../../components/ui/Switch";

const IA_FEATURE_ITEMS = [
  {
    key: "sugerir_respostas",
    title: "Sugerir respostas para atendente",
    description: "Exibe sugestões de texto enquanto o atendente digita. Nunca envia mensagem sozinha.",
    badge: "em breve",
  },
  {
    key: "corrigir_texto",
    title: "Corrigir texto automaticamente",
    description: "Correção ortográfica assistida no composer. Hoje o atendente controla isso no ícone de correção da conversa.",
    badge: "em breve",
  },
  {
    key: "auto_completar",
    title: "Auto completar mensagens",
    description: "Completa frases com base no contexto da conversa.",
    badge: "em breve",
  },
  {
    key: "resumo_conversa",
    title: "Resumo de conversa",
    description: "Gera resumo rápido do histórico para o atendente assumir com contexto.",
    badge: "em breve",
  },
  {
    key: "classificar_intencao",
    title: "Classificar intenção",
    description: "Identifica intenção do cliente (dúvida, reclamação, compra, etc.).",
    badge: "em breve",
  },
  {
    key: "sugerir_tags",
    title: "Sugerir tags",
    description: "Recomenda tags para classificar a conversa com um clique.",
    badge: "em breve",
  },
];

export default function IaSettingsView({ config, onSave, saving }) {
  const [v, setV] = useState(config);
  useEffect(() => setV(config), [config]);

  const iaEnabled = !!v.usar_ia;

  const setFeature = useCallback((key, checked) => {
    setV((c) => ({ ...c, [key]: checked }));
  }, []);

  const handleMasterToggle = useCallback((checked) => {
    setV((c) => ({ ...c, usar_ia: checked }));
  }, []);

  return (
    <div className="ia-section ia-suggest-section">
      <header className="ia-suggest-header">
        <span className="ia-auto-reply-eyebrow">Assistência inteligente</span>
        <h4 className="ia-suggest-title">IA (sugestões inteligentes)</h4>
        <p className="ia-suggest-lead">
          Recursos assistivos para o atendente — <strong>nunca respondem sozinhos</strong> ao cliente.
          Ative a IA principal para liberar as preferências abaixo.
        </p>
      </header>

      <div className={`ia-suggest-master ${iaEnabled ? "ia-suggest-master--on" : ""}`}>
        <div className="ia-suggest-master-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a7 7 0 0 1 7 7c0 2.5-1.2 4.7-3 6.1V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2.9A7 7 0 0 1 5 10a7 7 0 0 1 7-7z" />
            <path d="M9.5 17h5" />
          </svg>
        </div>
        <div className="ia-suggest-master-body">
          <div className="ia-suggest-master-row">
            <div>
              <h5 className="ia-suggest-master-title">Usar IA</h5>
              <p className="ia-suggest-master-desc">
                Habilita a <strong>IA Analítica</strong> no Dashboard (consultas em linguagem natural).
              </p>
            </div>
            <Switch
              checked={iaEnabled}
              onChange={handleMasterToggle}
              aria-label="Usar IA"
            />
          </div>
          <span className={`ia-suggest-status-pill ${iaEnabled ? "is-on" : ""}`}>
            {iaEnabled ? "IA Analítica ativa" : "IA desligada — preferências abaixo ficam bloqueadas"}
          </span>
        </div>
      </div>

      <div className={`ia-suggest-features ${!iaEnabled ? "ia-suggest-features--disabled" : ""}`}>
        <h5 className="ia-suggest-features-title">Funcionalidades assistivas</h5>
        <p className="ia-muted ia-suggest-features-hint">
          Preferências salvas por empresa. Itens marcados como &quot;em breve&quot; ainda não alteram o atendimento em tempo real.
        </p>
        <ul className="ia-suggest-list">
          {IA_FEATURE_ITEMS.map((item) => {
            const checked = !!v[item.key];
            return (
              <li key={item.key} className={`ia-suggest-item ${checked && iaEnabled ? "is-on" : ""}`}>
                <label className="ia-suggest-item-label">
                  <input
                    type="checkbox"
                    className="ia-suggest-item-check"
                    checked={checked}
                    disabled={!iaEnabled || saving}
                    onChange={(e) => setFeature(item.key, e.target.checked)}
                  />
                  <span className="ia-suggest-item-check-ui" aria-hidden="true" />
                  <span className="ia-suggest-item-text">
                    <span className="ia-suggest-item-title-row">
                      <strong>{item.title}</strong>
                      <span className="ia-suggest-item-badge">{item.badge}</span>
                    </span>
                    <span className="ia-suggest-item-desc">{item.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ia-suggest-footer">
        <button
          type="button"
          className="ia-btn ia-btn--primary"
          onClick={() => onSave(v)}
          disabled={saving}
        >
          {saving ? "Salvando..." : "Salvar configurações de IA"}
        </button>
      </div>
    </div>
  );
}

