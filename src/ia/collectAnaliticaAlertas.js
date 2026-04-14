import { isPlainObject } from "./aiAskTypes.js";

/** @param {unknown} a @returns {import("./aiAskTypes.js").AlertaAnaliticaUi} */
function normalizeAlert(a) {
  if (!isPlainObject(a)) {
    return {
      codigo: "AVISO_GENERICO",
      severidade: "info",
      titulo: "Aviso",
      mensagem: "",
    };
  }
  const sev = a.severidade === "erro" || a.severidade === "aviso" || a.severidade === "info" ? a.severidade : "info";
  return {
    codigo: String(a.codigo || "AVISO_GENERICO"),
    severidade: sev,
    titulo: String(a.titulo || "").trim() || "Aviso",
    mensagem: String(a.mensagem || "").trim(),
    origem: a.origem != null ? String(a.origem) : undefined,
    candidatos: Array.isArray(a.candidatos) ? a.candidatos : undefined,
  };
}

function mapCandidatosUsuario(arr) {
  return arr
    .map((x) => {
      if (!isPlainObject(x)) return null;
      const usuario_id = x.usuario_id ?? x.id ?? x.user_id;
      if (usuario_id == null) return null;
      return { usuario_id, nome: x.nome != null ? String(x.nome) : "" };
    })
    .filter(Boolean);
}

function mapCandidatosCliente(arr) {
  return arr
    .map((x) => {
      if (!isPlainObject(x)) return null;
      const cliente_id = x.cliente_id ?? x.id;
      if (cliente_id == null) return null;
      return {
        cliente_id,
        nome: x.nome != null ? String(x.nome) : "",
        telefone: x.telefone != null ? String(x.telefone) : undefined,
      };
    })
    .filter(Boolean);
}

/**
 * Alertas legados quando `analitica_ui.alertas` vem vazio ou ausente.
 * @param {unknown} data
 * @returns {import("./aiAskTypes.js").AlertaAnaliticaUi[]}
 */
function collectLegacyAlerts(data) {
  if (!isPlainObject(data)) return [];
  const out = /** @type {import("./aiAskTypes.js").AlertaAnaliticaUi[]} */ ([]);

  if (data.error != null && String(data.error).trim()) {
    out.push({
      codigo: "SEM_RESULTADO_OU_ERRO",
      severidade: "erro",
      titulo: "Erro",
      mensagem: String(data.error).trim(),
      origem: "raiz",
    });
  }

  const ambU = data.ambiguidade_usuario;
  if (Array.isArray(ambU) && ambU.length) {
    const candidatos = mapCandidatosUsuario(ambU);
    if (candidatos.length) {
      out.push({
        codigo: "AMBIGUIDADE_USUARIO",
        severidade: "aviso",
        titulo: "Qual utilizador?",
        mensagem: "Encontrámos várias correspondências. Escolha abaixo ou especifique o nome completo na pergunta.",
        origem: "historico_conversas",
        candidatos,
      });
    } else {
      out.push({
        codigo: "AMBIGUIDADE_USUARIO",
        severidade: "aviso",
        titulo: "Ambiguidade de utilizador",
        mensagem: "A pergunta pode referir-se a mais do que um utilizador.",
        origem: "historico_conversas",
      });
    }
  }

  const ambC = data.ambiguidade_cliente;
  if (Array.isArray(ambC) && ambC.length) {
    const candidatos = mapCandidatosCliente(ambC);
    if (candidatos.length) {
      out.push({
        codigo: "AMBIGUIDADE_CLIENTE",
        severidade: "aviso",
        titulo: "Qual cliente?",
        mensagem: "Encontrámos várias correspondências. Escolha abaixo ou indique telefone ou nome completo.",
        origem: "busca_filtro",
        candidatos,
      });
    } else {
      out.push({
        codigo: "AMBIGUIDADE_CLIENTE",
        severidade: "aviso",
        titulo: "Ambiguidade de cliente",
        mensagem: "A pergunta pode referir-se a mais do que um cliente.",
        origem: "busca_filtro",
      });
    }
  }

  const avisos = data.avisos;
  if (Array.isArray(avisos)) {
    for (const av of avisos) {
      const msg = typeof av === "string" ? av : isPlainObject(av) ? String(av.mensagem || av.text || av.message || "") : String(av);
      const t = typeof av === "object" && av && isPlainObject(av) ? String(av.titulo || av.title || "").trim() : "";
      if (!String(msg).trim()) continue;
      out.push({
        codigo: "AVISO_GENERICO",
        severidade: "info",
        titulo: t || "Aviso",
        mensagem: String(msg).trim(),
        origem: "raiz",
      });
    }
  }

  return out;
}

/**
 * Prioridade: `analitica_ui.alertas` quando não vazio; senão campos legados.
 * @param {unknown} data campo `data` da resposta
 */
export function resolveAlertasParaUi(data) {
  if (!isPlainObject(data)) return [];
  const ui = data.analitica_ui;
  if (isPlainObject(ui) && Array.isArray(ui.alertas) && ui.alertas.length > 0) {
    return ui.alertas.map(normalizeAlert);
  }
  return collectLegacyAlerts(data);
}
