import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  KeyRound,
  Lock,
  MessagesSquare,
  PanelsTopLeft,
  RotateCw,
  ShieldCheck,
  SquareKanban,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import api from "../api/http";
import "./crmAvancadoPortal.css";

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
  // carregando | pronto | abrindo | aberto | indisponivel | erro
  const [estado, setEstado] = useState("carregando");
  const [jaAbriu, setJaAbriu] = useState(false);
  const voltarRef = useRef(null);
  useEffect(() => () => clearTimeout(voltarRef.current), []);

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
        // Confirmação visível por alguns segundos, depois volta a oferecer o botão.
        setJaAbriu(true);
        setEstado("aberto");
        clearTimeout(voltarRef.current);
        voltarRef.current = setTimeout(() => setEstado("pronto"), 3200);
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

  // Holofote do card segue o ponteiro (só CSS vars — sem re-render).
  const cardRef = useRef(null);
  const onPointerMove = useCallback((e) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);

  const ativo = estado === "pronto" || estado === "abrindo" || estado === "aberto";
  const falhou = estado === "erro" || estado === "indisponivel";

  return (
    <div className="crmx" data-estado={estado}>
      <div className="crmx-bg" aria-hidden="true">
        <span className="crmx-aurora crmx-aurora--a" />
        <span className="crmx-aurora crmx-aurora--b" />
      </div>

      <section
        ref={cardRef}
        className="crmx-card"
        onPointerMove={onPointerMove}
        aria-busy={estado === "carregando" || estado === "abrindo" ? "true" : undefined}
        role={estado === "erro" ? "alert" : undefined}
      >
        <div className="crmx-stagger">
          <Ponte ligada={!falhou} />

          {estado === "carregando" && (
            <div>
              <div className="crmx-skel crmx-skel--chip" />
              <div className="crmx-skel crmx-skel--title" />
              <div className="crmx-skel crmx-skel--line" />
              <div className="crmx-skel crmx-skel--btn" />
              <p className="crmx-help">Conectando ao CRM Avançado…</p>
            </div>
          )}

          {ativo && (
            <>
              <span className="crmx-chip">
                <span className="crmx-dot" aria-hidden="true" />
                Integração ativa
              </span>
              <h2 className="crmx-title">
                Seu <span className="crmx-title-grad">CRM Avançado</span> está pronto
              </h2>
              <p className="crmx-sub">
                Funil, negócios e clientes num só lugar. Ele abre em uma nova aba e o
                ZapERP continua aberto aqui.
              </p>
              <ul className="crmx-perks">
                <li className="crmx-perk">
                  <span className="crmx-perk-ico"><KeyRound aria-hidden="true" /></span>
                  Entra sem senha
                </li>
                <li className="crmx-perk">
                  <span className="crmx-perk-ico"><SquareKanban aria-hidden="true" /></span>
                  Funil de vendas
                </li>
                <li className="crmx-perk">
                  <span className="crmx-perk-ico"><PanelsTopLeft aria-hidden="true" /></span>
                  Abre em nova aba
                </li>
              </ul>
              <button
                type="button"
                className="crmx-cta"
                onClick={abrirEmNovaAba}
                disabled={estado === "abrindo"}
                autoFocus
              >
                {estado === "abrindo" && (
                  <>
                    <span className="crmx-spin" aria-hidden="true" />
                    Abrindo com segurança…
                  </>
                )}
                {estado === "aberto" && (
                  <span className="crmx-done">
                    <svg className="crmx-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Aberto em uma nova aba
                  </span>
                )}
                {estado === "pronto" && (
                  <>
                    {jaAbriu ? "Abrir de novo" : "Abrir CRM Avançado"}
                    <ArrowUpRight className="crmx-cta-ico" aria-hidden="true" />
                  </>
                )}
              </button>
              <div className="crmx-foot">
                <span className="crmx-foot-item">
                  <ShieldCheck aria-hidden="true" />
                  Acesso seguro, gerado no clique
                </span>
                <span className="crmx-foot-item crmx-foot-kbd">
                  ou tecle <kbd className="crmx-kbd">Enter</kbd>
                </span>
              </div>
            </>
          )}

          {estado === "indisponivel" && (
            <>
              <span className="crmx-chip crmx-chip--warn">
                <Unplug size={12} aria-hidden="true" />
                Integração desligada
              </span>
              <h2 className="crmx-title">CRM Avançado não disponível</h2>
              <p className="crmx-sub" style={{ marginBottom: 6 }}>
                A integração com o CRM Avançado não está ativa nesta empresa. Fale com o
                administrador para habilitá-la.
              </p>
            </>
          )}

          {estado === "erro" && (
            <>
              <span className="crmx-chip crmx-chip--danger">
                <TriangleAlert size={12} aria-hidden="true" />
                Falha temporária
              </span>
              <h2 className="crmx-title">Não foi possível abrir o CRM</h2>
              <p className="crmx-sub">
                O CRM Avançado não respondeu agora. Isso costuma se resolver em alguns
                segundos.
              </p>
              <button
                type="button"
                className="crmx-cta crmx-cta--ghost"
                onClick={() => window.location.reload()}
                autoFocus
              >
                <RotateCw size={17} aria-hidden="true" />
                Tentar de novo
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/** ZapERP ⇄ CRM: dois nós com pacotes de dados atravessando a ponte. */
function Ponte({ ligada }) {
  return (
    <div className="crmx-bridge" aria-hidden="true">
      <div className="crmx-node crmx-node--zap">
        <MessagesSquare />
        <span className="crmx-node-label">ZapERP</span>
      </div>
      <div className={`crmx-track${ligada ? "" : " crmx-track--off"}`}>
        <span className="crmx-packet" />
        <span className="crmx-packet" />
        <span className="crmx-packet" />
        {!ligada && (
          <span className="crmx-break">
            <Lock />
          </span>
        )}
      </div>
      <div className={`crmx-node crmx-node--crm${ligada ? "" : " crmx-node--dim"}`}>
        <SquareKanban />
        <span className="crmx-node-label">CRM</span>
      </div>
    </div>
  );
}
