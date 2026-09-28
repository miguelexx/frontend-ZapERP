import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/http";

/**
 * Ponto de entrada do CRM no ZapERP → CRM Avançado (externo, via SSO).
 *
 * O ZapERP não tem mais CRM interno (foi removido). Este componente só decide
 * entre: abrir o CRM Avançado (quando a integração está configurada) ou mostrar
 * um estado limpo de "indisponível". NUNCA cai no antigo CRM interno — os
 * endpoints dele não existem mais no backend (davam 404 em cascata).
 *
 * O CRM abre em NOVA ABA (o ZapERP continua aberto atrás). O token SSO é curto
 * (~2min) e é gerado NO CLIQUE do botão "Abrir", então não expira antes do uso.
 * A abertura fica presa a um gesto do usuário de propósito: `window.open` só é
 * liberado durante o clique — chamá-lo depois de um `await`/em `useEffect` é
 * barrado pelo bloqueador de pop-up. Por isso esta rota é um landing com botão,
 * e não um redirect automático.
 *
 * Respostas de GET /api/crm/abrir-avancado:
 *   - 200 { url }  → abre o CRM Avançado em nova aba
 *   - 503          → integração não configurada neste ambiente (faltam
 *                    CRM_AVANCADO_URL / ZAP_SSO_SECRET no backend)
 *   - outro erro   → falha transitória; oferece tentar de novo
 */
export default function CrmAvancadoRedirect() {
  // carregando | pronto | abrindo | indisponivel | erro
  const [estado, setEstado] = useState("carregando");

  // Confere disponibilidade da integração ao entrar (sem gerar token ainda —
  // o token é gerado só quando o usuário clica em "Abrir", para nascer fresco).
  useEffect(() => {
    let ativo = true;
    api
      .get("/api/crm/abrir-avancado")
      .then(({ data }) => {
        if (!ativo) return;
        setEstado(data && data.url ? "pronto" : "indisponivel");
      })
      .catch((e) => {
        if (!ativo) return;
        if (e && e.response && e.response.status === 503) setEstado("indisponivel");
        else setEstado("erro");
      });
    return () => {
      ativo = false;
    };
  }, []);

  const abrindoRef = useRef(false);
  const abrirEmNovaAba = useCallback(async () => {
    if (abrindoRef.current) return;
    abrindoRef.current = true;
    setEstado("abrindo");
    // Abre a aba JÁ no gesto do clique (evita o bloqueador de pop-up) e recebe a
    // URL do SSO assim que o token — gerado neste clique — chega. Anular
    // `opener` dá a mesma proteção do rel="noopener": o CRM não vê a janela do
    // ZapERP.
    const novaAba = window.open("about:blank", "_blank");
    if (novaAba) {
      try {
        novaAba.opener = null;
      } catch {
        /* alguns navegadores não deixam reatribuir */
      }
    }
    try {
      const { data } = await api.get("/api/crm/abrir-avancado");
      if (data && data.url) {
        if (novaAba) {
          novaAba.location = data.url;
        } else {
          const reserva = window.open(data.url, "_blank", "noopener");
          if (!reserva) window.location.href = data.url; // pop-up bloqueado
        }
        setEstado("pronto");
      } else {
        if (novaAba) novaAba.close();
        setEstado("indisponivel");
      }
    } catch (e) {
      if (novaAba) novaAba.close();
      setEstado(e && e.response && e.response.status === 503 ? "indisponivel" : "erro");
    } finally {
      abrindoRef.current = false;
    }
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
  const botao = {
    background: "var(--primary, #16a34a)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };

  if (estado === "carregando") {
    return (
      <div style={wrap} aria-busy="true">
        <div style={{ color: "var(--text-muted, #475569)" }}>Preparando o CRM Avançado…</div>
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
          <button type="button" onClick={() => window.location.reload()} style={botao}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  if (estado === "pronto" || estado === "abrindo") {
    return (
      <div style={wrap}>
        <div style={card}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>CRM Avançado</h2>
          <p style={{ margin: "0 0 20px", color: "var(--text-muted, #64748b)", fontSize: 14, lineHeight: 1.5 }}>
            O CRM abre em uma nova aba — o ZapERP continua aberto aqui.
          </p>
          <button type="button" onClick={abrirEmNovaAba} style={botao} autoFocus>
            {estado === "abrindo" ? "Abrindo…" : "Abrir CRM Avançado"}
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
