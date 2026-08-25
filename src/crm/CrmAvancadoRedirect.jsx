import { useEffect, useState } from "react";
import api from "../api/http";

/**
 * Ponto de entrada do CRM no ZapERP → CRM Avançado (externo, via SSO).
 *
 * O ZapERP não tem mais CRM interno (foi removido). Este componente só decide
 * entre: abrir o CRM Avançado (quando a integração está configurada) ou mostrar
 * um estado limpo de "indisponível". NUNCA cai no antigo CRM interno — os
 * endpoints dele não existem mais no backend (davam 404 em cascata).
 *
 * Respostas de GET /api/crm/abrir-avancado:
 *   - 200 { url }  → redireciona o navegador para o CRM Avançado
 *   - 503          → integração não configurada neste ambiente (faltam
 *                    CRM_AVANCADO_URL / ZAP_SSO_SECRET no backend)
 *   - outro erro   → falha transitória; oferece tentar de novo
 */
export default function CrmAvancadoRedirect() {
  const [estado, setEstado] = useState("carregando"); // carregando | indisponivel | erro

  useEffect(() => {
    let ativo = true;

    api
      .get("/api/crm/abrir-avancado")
      .then(({ data }) => {
        if (!ativo) return;
        if (data && data.url) {
          window.location.replace(data.url);
        } else {
          setEstado("indisponivel");
        }
      })
      .catch((e) => {
        if (!ativo) return;
        // 503 = integração desativada neste ambiente.
        if (e && e.response && e.response.status === 503) {
          setEstado("indisponivel");
        } else {
          setEstado("erro");
        }
      });

    return () => {
      ativo = false;
    };
  }, []);

  const wrap = {
    minHeight: "60vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  };
  const card = {
    maxWidth: 460,
    textAlign: "center",
    background: "var(--surface, #ffffff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 16,
    padding: "32px 28px",
    color: "var(--text, #1e293b)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  if (estado === "carregando") {
    return (
      <div style={wrap} aria-busy="true">
        <div style={{ color: "var(--text-muted, #475569)" }}>Abrindo o CRM Avançado…</div>
      </div>
    );
  }

  if (estado === "erro") {
    return (
      <div style={wrap}>
        <div style={card} role="alert">
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Não foi possível abrir o CRM Avançado</h2>
          <p style={{ margin: "0 0 20px", color: "var(--text-muted, #64748b)", fontSize: 14 }}>
            Ocorreu uma falha temporária ao contatar o CRM. Tente novamente.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: "var(--primary, #16a34a)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  // indisponivel
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>CRM Avançado não disponível</h2>
        <p style={{ margin: 0, color: "var(--text-muted, #64748b)", fontSize: 14, lineHeight: 1.5 }}>
          A integração com o CRM Avançado não está ativa para este ambiente.
          Fale com o administrador para habilitá-la.
        </p>
      </div>
    </div>
  );
}
