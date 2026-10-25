/*
  PÁGINA TEMPORÁRIA DE VERIFICAÇÃO VISUAL — e nada além disso.

  Monta o drawer de orçamento de verdade com o adaptador do axios trocado por um que responde
  localmente, para olhar a busca de cliente a 390/768/1280 px nos dois temas sem precisar de
  login nem de ERP no ar. O cenário é escolhido pelo TERMO digitado, então um adaptador só cobre
  todos os estados.

  Este arquivo e `verif-cliente.html` são removidos antes do fim da sessão.
*/

import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import api from "./api/http";
import OrcamentoDrawer from "./conversa/orcamento/OrcamentoDrawer";
import "./styles/theme.css";
import "./styles/app.css";
import "./styles/studio.css";
import "./styles/conversations-studio.css";
import "./styles/zap-animations.css";
import "./styles/premium-interactions.css";
// Os tokens `--wa-*` vivem aqui; sem isto o drawer renderiza sem cor nenhuma.
import "./conversa/conversa.css";

const CANDIDATOS = [
  { codigo_cliente_erp: "0000108", nome: "MARIA APARECIDA AMADEI", cpf: "123.456.789-01", cnpj: null, inscricao_estadual: null },
  { codigo_cliente_erp: "0000210", nome: "MARIA APARECIDA AMADEI DOS SANTOS", cpf: "987.654.321-00", cnpj: null, inscricao_estadual: null },
  { codigo_cliente_erp: "0001877", nome: "MARIA APARECIDA AMADEI SILVA E CIA LTDA", cpf: null, cnpj: "12.345.678/0001-99", inscricao_estadual: "ISENTO" },
  { codigo_cliente_erp: "0002044", nome: "MARIA APARECIDA AMADEI NETA", cpf: null, cnpj: null, inscricao_estadual: null },
];

function responder(data, status = 200, config) {
  return Promise.resolve({ data, status, statusText: "OK", headers: {}, config, request: {} });
}

function recusar(status, data, config) {
  const err = new Error("stub");
  err.isAxiosError = true;
  err.config = config;
  err.response = { status, data, headers: {}, config };
  return Promise.reject(err);
}

api.defaults.adapter = (config) => {
  const url = String(config?.url || "");
  const body = config?.data ? JSON.parse(config.data) : {};

  if (url.includes("/clientes/consultar")) {
    const termo = String(body.busca || "").toUpperCase();
    if (termo.startsWith("OFFLINE")) {
      return recusar(503, {
        ok: false,
        codigo: "WM_SINCRONIZADOR_OFFLINE",
        mensagem:
          "O sistema da sua loja está fora do ar, então o orçamento não pôde ser calculado. Nada foi gravado. Confira se o computador do ERP está ligado e com internet, e tente de novo.",
        estado: "FALHA_SEGURA",
        requestId: "stub",
      }, config);
    }
    if (termo.startsWith("DINIZ")) {
      return recusar(404, {
        ok: false,
        codigo: "WM_NAO_ENCONTRADO",
        mensagem: "Nenhum resultado encontrado no ERP para essa busca.",
        requestId: "stub",
      }, config);
    }
    if (termo.startsWith("JOAO")) {
      return responder({
        ok: true,
        status: "cliente",
        cliente: { codigo_cliente_erp: "0000931", nome: "JOAO DA SILVA SAURO" },
        paginacao: null,
        resolucao_definitiva: false,
      }, 200, config);
    }
    if (termo.startsWith("ERRO")) {
      return recusar(503, {
        ok: false,
        codigo: "WM_INDISPONIVEL",
        mensagem: "Não foi possível falar com o ERP agora. Tente de novo em instantes.",
        requestId: "stub",
      }, config);
    }
    return responder({
      ok: true,
      status: "multiplos_clientes",
      candidatos: CANDIDATOS,
      paginacao: { pagina: 1, tamanho_pagina: 30, total: 94, tem_mais: true, tem_anterior: false },
      resolucao_definitiva: false,
    }, 200, config);
  }

  if (url.includes("/produtos/consultar")) {
    return responder({
      ok: true,
      status: "multiplos_produtos",
      produtos: [
        { codigo_produto_erp: "4325", descricao: "CIMENTO CAMPEAO AZUL CP 2 E 32 50KG", marca: "CAMPEAO", unidade: "UN" },
      ],
      paginacao: { pagina: 1, tamanho_pagina: 30, total: 6, tem_mais: false, tem_anterior: false },
      candidatos_origem: "cache_cloud",
    }, 200, config);
  }

  if (url.includes("/preparar")) {
    return recusar(422, {
      ok: false,
      codigo: "WM_CLIENTE_INVALIDO",
      mensagem: "O cliente escolhido não está liberado para orçamento no ERP. Escolha outro.",
      requestId: "stub",
    }, config);
  }

  return responder({ ok: true }, 200, config);
};

const CENARIOS = [
  ["Homônimas (lista)", "MARIA APARECIDA"],
  ["Um só (achado)", "JOAO DA SILVA"],
  ["Nada (prefixo)", "DINIZ"],
  ["Loja fora do ar", "OFFLINE TESTE"],
  ["Erro do ERP", "ERRO TESTE"],
];

function Verif() {
  // Recarrega a página inteira: o rascunho vive em sessionStorage e o componente antigo o
  // regrava ao desmontar, então remontar não bastava para começar do zero.
  const [cenario] = useState(
    () => new URLSearchParams(location.search).get("c") || CENARIOS[0][1]
  );
  const chave = 0;

  const trocar = (termo) => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    location.search = `?c=${encodeURIComponent(termo)}`;
  };

  return (
    <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
      {CENARIOS.map(([rotulo, termo]) => (
        <button key={termo} type="button" className="wa-btn wa-btn-ghost" onClick={() => trocar(termo)}>
          {rotulo}
        </button>
      ))}
      <button
        type="button"
        className="wa-btn wa-btn-ghost"
        onClick={() => {
          const el = document.documentElement;
          el.setAttribute("data-theme", el.getAttribute("data-theme") === "dark" ? "light" : "dark");
        }}
      >
        Tema
      </button>
      <OrcamentoDrawer
        key={`${cenario}|${chave}`}
        open
        conversaId={1}
        companyId={20}
        userId={7}
        clienteNomeSugerido={cenario}
        onClose={() => {}}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Verif />);
