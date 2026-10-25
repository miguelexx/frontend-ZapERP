/**
 * O campo CLIENTE do orçamento, com a busca do ERP dentro dele.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (D11 — quem resolve o cliente
 * é `preparar`; Sessão 5 — UX do drawer).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ESTE COMPONENTE RESOLVE
 * ────────────────────────────────────────────────────────────────────────────
 * A busca de cliente do ERP é por PREFIXO (`dbo.Clientes`, `Latin1_General_CI_AI` —
 * `docs/wm/04-contratos-api.md`). Medido no ERP real da empresa 20: `DINIZ` devolve nada,
 * `SILVA` devolve nada, `MARIA APARECIDA AMADEI` devolve 3. Quem digita o sobrenome não acha o
 * cliente e conclui que ele não está cadastrado.
 *
 * Até aqui o campo era texto livre resolvido só no Calcular — às cegas, com o cliente
 * esperando do outro lado. Agora a pessoa digita, VÊ os clientes do ERP e escolhe um.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESCOLHER AQUI NÃO É CONFIRMAR (D11) — E A TELA NÃO PODE PROMETER QUE É
 * ────────────────────────────────────────────────────────────────────────────
 * `/clientes/consultar` **não** aplica os filtros Inativo/Bloqueado e `preparar` **aplica**:
 * um cliente desta lista ainda pode ser recusado no Calcular com `CLIENTE_INVALIDO`. É por isso
 * que a resposta vem com `resolucao_definitiva: false`, que a escolha NÃO ganha cara de "✓
 * cliente confirmado" e que a linha de aviso fica à vista antes do cálculo, não depois dele.
 *
 * O caminho antigo continua inteiro: quem digita o nome e aperta Calcular sem olhar a lista cai
 * no laço de ambiguidade do `AmbiguidadePicker` exatamente como antes. A busca é atalho, não
 * pedágio.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CONSULTA É REALTIME, E NENHUMA CHAMADA SAI SEM GESTO HUMANO
 * ────────────────────────────────────────────────────────────────────────────
 * Cada busca aqui é uma consulta em tempo real no SQL Server da própria loja (seção 11 do doc
 * 36 — chamada à WM pode custar dinheiro). Então:
 *
 *   · piso de 3 letras e debounce de 800 ms, como no `ProdutoPicker`;
 *   · o campo nasce PRÉ-PREENCHIDO com o nome da conversa, e isso **não** dispara busca: a
 *     primeira consulta espera a pessoa tocar o campo (foco) ou digitar. Abrir o drawer não
 *     pode custar uma consulta na loja;
 *   · nada é escolhido automaticamente, nem quando volta um cliente só — o contrato é
 *     explícito, e auto-selecionar poria no orçamento um cliente que ninguém viu;
 *   · voltar da escolha ("Trocar") não recompra a lista: ela é do mesmo termo e ainda está na
 *     mão.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A LOJA FORA DO AR NÃO É "NENHUM CLIENTE"
 * ────────────────────────────────────────────────────────────────────────────
 * Esta porta fala com o sincronizador instalado na máquina da loja e devolve
 * `WM_SINCRONIZADOR_OFFLINE` quando ele está fora do ar, enquanto a busca de produto —
 * servida do acervo já sincronizado dentro da WM — continua respondendo 200 (medido em
 * produção em 25/10/2026). A tela fica meio viva e meio morta, e exibir esse 503 como lista
 * vazia faria o atendente concluir que o cliente saiu do cadastro. Quem separa os dois é
 * `traduzirErroBuscaCliente`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { consultarClientesOrcamento, extrairErroOrcamento } from "../../api/wmOrcamentosService";
import { textoOuSemValor } from "./orcamentoFormat";
import {
  AVISO_CLIENTE_NAO_DEFINITIVO,
  RECUPERACAO_CLIENTE_INDISPONIVEL,
  SEM_CLIENTE,
  agruparCandidatosCliente,
  documentoDoCliente,
  mensagemBuscaClienteSemResultado,
  patchClienteDigitado,
  patchClienteEscolhido,
  tituloClientesEncontrados,
  traduzirErroBuscaCliente,
} from "./orcamentoViewModel";

/** Mesmo piso do `ProdutoPicker`: dois caracteres de prefixo varreriam a base inteira. */
const MIN_CARACTERES = 3;
/** Mesma espera do `ProdutoPicker`. Cada tecla a menos aqui é uma consulta na loja a menos. */
const DEBOUNCE_MS = 800;
/** Quantos esqueletos pintar enquanto a primeira busca não volta. */
const ESQUELETOS = [0, 1];

/**
 * UMA consulta de clientes, já traduzida para a tela.
 *
 * Busca que não acha nada NÃO é erro: é resultado vazio, e quem exibe é o estado vazio da tela
 * (que explica o prefixo). Indisponibilidade da loja volta separada, porque é outra conversa.
 */
async function pedirPagina(busca, paginaAlvo, signal) {
  try {
    const data = await consultarClientesOrcamento({
      busca,
      pagina: paginaAlvo > 1 ? paginaAlvo : undefined,
      signal,
    });
    return { grupo: agruparCandidatosCliente(data), erro: "", indisponivel: "", cancelado: false };
  } catch (err) {
    const bruto = extrairErroOrcamento(err);
    if (bruto.cancelado) {
      return { grupo: SEM_CLIENTE, erro: "", indisponivel: "", cancelado: true };
    }
    const { tipo, mensagem } = traduzirErroBuscaCliente(bruto);
    return {
      grupo: SEM_CLIENTE,
      erro: tipo === "erro" ? mensagem : "",
      indisponivel: tipo === "indisponivel" ? mensagem : "",
      cancelado: false,
    };
  }
}

/**
 * Um candidato de cliente — e um candidato é um BOTÃO que o põe no orçamento.
 *
 * Mesma casca dos candidatos do laço de ambiguidade (`.wa-orc-candidato` + seta à direita):
 * escolher cliente é a mesma pergunta nas duas telas e precisa ter a mesma resposta visual.
 *
 * O DOCUMENTO VEM JUNTO DO NOME porque é ele que distingue duas "MARIA SILVA" — sem ele, a
 * escolha entre homônimos é sorteio. Fica na linha secundária, discreto: numa lista de 30 nomes
 * o documento é o desempate, não o assunto.
 *
 * `comDocumento` é falso no ramo do cliente único, onde o contrato não traz os documentos.
 * Escrever "sem documento informado" ali afirmaria sobre o cadastro algo que a resposta não
 * disse — ausência de campo não é ausência de documento.
 */
function CandidatoCliente({ candidato, comDocumento, onEscolher, disabled }) {
  const nome = textoOuSemValor(candidato.nome);
  const documento = comDocumento ? documentoDoCliente(candidato) || "Sem documento informado" : "";

  return (
    <button
      type="button"
      className="wa-orc-candidato"
      disabled={disabled}
      aria-label={`Usar o cliente ${nome}`}
      onClick={() => onEscolher(candidato)}
    >
      <span className="wa-orc-candidato-corpo">
        <span className="wa-orc-candidato-titulo">{nome}</span>
        <span className="wa-orc-candidato-meta">
          {documento ? (
            <>
              <span className="wa-orc-candidato-doc">{documento}</span>
              {" · "}
            </>
          ) : null}
          {`Cód. ${candidato.codigo_cliente_erp}`}
        </span>
      </span>
      <span className="wa-orc-candidato-acao" aria-hidden="true">
        <ChevronRight size={18} strokeWidth={2.25} />
      </span>
    </button>
  );
}

/**
 * Devolve DOIS elementos irmãos, não um: a célula do campo e a região de resultados.
 *
 * Eles são irmãos porque a seção "Cliente e vendedor" é uma grade de duas colunas a partir de
 * 460px de largura do drawer, e a lista de clientes precisa da linha INTEIRA — meia largura
 * (~260px) quebra "MARIA APARECIDA AMADEI · CPF 123.456.789-01" em cinco linhas. A grade põe a
 * região abaixo das duas colunas (`order`), e no celular, onde a seção é uma coluna só, ela
 * fica logo embaixo do campo, que é onde a pessoa está olhando.
 *
 * @param {object} props
 * @param {string} props.busca texto digitado (`rascunho.clienteBusca`)
 * @param {string} props.codigoErp `rascunho.clienteCodigoErp` — preenchido = já escolhido
 * @param {string} props.nome `rascunho.clienteNome`
 * @param {(mudanca: object) => void} props.onPatch grava no rascunho
 * @param {boolean} props.disabled o orçamento está calculando
 */
export default function ClientePicker({
  busca = "",
  codigoErp = "",
  nome = "",
  onPatch,
  disabled = false,
}) {
  const [pagina, setPagina] = useState(1);
  const [grupo, setGrupo] = useState(SEM_CLIENTE);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [indisponivel, setIndisponivel] = useState("");
  const [buscou, setBuscou] = useState(false);
  /**
   * A pessoa já pediu esta busca?
   *
   * O campo nasce pré-preenchido com o nome da conversa (`sugestaoDeBuscaCliente`), e buscar
   * por conta disso faria toda abertura do drawer custar uma consulta em tempo real na loja.
   * Tocar o campo ou digitar é o gesto; antes dele, nada sai daqui.
   */
  const [pedida, setPedida] = useState(false);

  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const geracaoRef = useRef(0);
  /** Último `termo|pagina` efetivamente consultado — evita repetir a mesma chamada. */
  const termoConsultadoRef = useRef("");
  /** "Trocar" devolve o foco ao campo: a próxima coisa a fazer é digitar outro nome. */
  const focarAoVoltarRef = useRef(false);

  const cancelarEmVoo = useCallback(() => {
    try {
      abortRef.current?.abort();
    } catch {
      /* ignore */
    }
    abortRef.current = null;
  }, []);

  useEffect(() => cancelarEmVoo, [cancelarEmVoo]);

  const buscar = useCallback(
    async (termoLimpo, paginaAlvo) => {
      cancelarEmVoo();
      const geracao = (geracaoRef.current += 1);
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      abortRef.current = controller;
      setBuscando(true);
      setErro("");
      setIndisponivel("");
      try {
        const resposta = await pedirPagina(termoLimpo, paginaAlvo, controller?.signal);
        // Resposta de uma geração anterior: descarta sem tocar na tela.
        if (geracao !== geracaoRef.current || resposta.cancelado) return;
        termoConsultadoRef.current = `${termoLimpo}|${paginaAlvo}`;
        setGrupo(resposta.grupo);
        setErro(resposta.erro);
        setIndisponivel(resposta.indisponivel);
        setBuscou(true);
      } finally {
        if (geracao === geracaoRef.current) setBuscando(false);
      }
    },
    [cancelarEmVoo]
  );

  // Debounce: o termo muda → cancela o que estava em voo e agenda uma busca só.
  const limpo = String(busca || "").trim();
  useEffect(() => {
    // Com cliente escolhido a lista está fora da tela: insistir nela gastaria consulta para
    // pintar o que ninguém vê. O resultado fica guardado para o caso de "Trocar".
    if (codigoErp || !pedida) return undefined;
    if (limpo.length < MIN_CARACTERES) {
      cancelarEmVoo();
      geracaoRef.current += 1; // invalida resposta em trânsito
      setGrupo(SEM_CLIENTE);
      setBuscando(false);
      setBuscou(false);
      setErro("");
      setIndisponivel("");
      termoConsultadoRef.current = "";
      return undefined;
    }
    if (termoConsultadoRef.current === `${limpo}|${pagina}`) return undefined;
    const t = setTimeout(() => {
      void buscar(limpo, pagina);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [limpo, pagina, codigoErp, pedida, buscar, cancelarEmVoo]);

  // Foco devolvido depois do "Trocar" — só depois de o campo existir de novo no DOM.
  useEffect(() => {
    if (codigoErp || !focarAoVoltarRef.current) return;
    focarAoVoltarRef.current = false;
    inputRef.current?.focus();
  }, [codigoErp]);

  const digitar = useCallback(
    (valor) => {
      setPedida(true);
      setPagina(1);
      // A troca código → busca vive no view model: mexer no texto apaga a escolha anterior, e
      // é isso que impede o orçamento de sair para o cliente de antes com outro nome na tela.
      onPatch?.(patchClienteDigitado(valor));
    },
    [onPatch]
  );

  const escolher = useCallback(
    (candidato) => {
      if (disabled) return;
      const mudanca = patchClienteEscolhido(candidato);
      if (mudanca) onPatch?.(mudanca);
    },
    [disabled, onPatch]
  );

  const trocar = useCallback(() => {
    focarAoVoltarRef.current = true;
    // O texto digitado FICA: é por ele que a lista de onde a escolha saiu volta à tela sem
    // custar outra consulta na loja.
    onPatch?.({ clienteCodigoErp: "", clienteNome: "" });
  }, [onPatch]);

  const tentarDeNovo = useCallback(() => {
    termoConsultadoRef.current = "";
    void buscar(limpo, pagina);
  }, [buscar, limpo, pagina]);

  const curto = limpo.length > 0 && limpo.length < MIN_CARACTERES;
  const vazio = !buscando && buscou && !erro && !indisponivel && grupo.lista.length === 0;
  // Esqueleto só quando não há nada na tela: trocar nomes visíveis por caixas cinzentas tiraria
  // da atendente justamente o card que ela já estava mirando.
  const esqueleto = buscando && grupo.lista.length === 0;
  const titulo = tituloClientesEncontrados(grupo);
  const mostrarResultados =
    !codigoErp && (buscando || buscou || Boolean(erro) || Boolean(indisponivel));

  return (
    <>
      <div className="wa-orc-campo">
        <label className="wa-orc-label" htmlFor="wa-orc-cliente">
          Cliente
        </label>
        {codigoErp ? (
          <>
            <div className="wa-orc-escolhido">
              <div>
                <strong>{textoOuSemValor(nome)}</strong>
                <span className="wa-orc-item-codigo">Cód. ERP {codigoErp}</span>
              </div>
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm"
                disabled={disabled}
                onClick={trocar}
              >
                Trocar
              </button>
            </div>
            {/*
              O que a escolha vale, dito ANTES do Calcular. A lista mostra o cadastro inteiro e
              o orçamento só aceita cliente ativo e desbloqueado: sem esta linha, a recusa no
              cálculo chega como defeito do sistema (D11).
            */}
            <p className="wa-orc-hint">{AVISO_CLIENTE_NAO_DEFINITIVO}</p>
          </>
        ) : (
          <>
            <input
              id="wa-orc-cliente"
              ref={inputRef}
              className="wa-input wa-orc-input"
              type="text"
              autoComplete="off"
              placeholder="Nome do cliente no ERP"
              value={busca || ""}
              maxLength={100}
              disabled={disabled}
              onFocus={() => setPedida(true)}
              onChange={(e) => digitar(e.target.value)}
            />
            {/*
              Produto casa por TRECHO; cliente casa por PREFIXO — regras diferentes no mesmo
              formulário, e a de cliente é a que surpreende. Medido no ERP real: "DINIZ"
              (sobrenome) não acha nada. Dizer isso aqui evita o atendente concluir que o
              cliente não existe; quando a busca volta vazia, o estado vazio repete a regra com
              o nome que ele digitou.
            */}
            <p className="wa-orc-hint">
              {curto
                ? `Digite ao menos ${MIN_CARACTERES} letras para pesquisar.`
                : "Pelo começo do nome, ou pelo CPF/CNPJ."}
            </p>
          </>
        )}
      </div>

      {mostrarResultados ? (
        <div
          className="wa-orc-clienteResultados"
          aria-label="Clientes encontrados no ERP"
          aria-busy={buscando}
        >
          {/*
            Faixa de estado com altura reservada no CSS (igual à da busca de produto): entrar em
            "Pesquisando…" não pode empurrar a lista para baixo quando já há nomes na tela.
          */}
          <div className="wa-orc-buscaStatus">
            <span role="status">{buscando ? "Pesquisando…" : titulo}</span>
          </div>

          {esqueleto
            ? ESQUELETOS.map((i) => (
                <div className="wa-orc-skelCard" key={`skel-${i}`} aria-hidden="true">
                  <span className="wa-orc-skelLinha wa-orc-skelLinha--titulo" />
                  <span className="wa-orc-skelLinha wa-orc-skelLinha--meta" />
                </div>
              ))
            : null}

          {/*
            A loja fora do ar é INDISPONIBILIDADE, não ausência de cliente — âmbar de aviso, e
            não o vermelho de erro, porque nada está quebrado e nada foi perdido. A frase de
            recuperação vem abaixo e diz também que o Calcular depende do mesmo sistema: é o que
            impede montar a cesta inteira para descobrir no fim.
          */}
          {indisponivel ? (
            <>
              <div className="wa-orc-alert wa-orc-alert--aviso" role="alert">
                <span>{indisponivel}</span>
                <button
                  type="button"
                  className="wa-btn wa-btn-ghost wa-orc-btnSm"
                  disabled={buscando || limpo.length < MIN_CARACTERES}
                  onClick={tentarDeNovo}
                >
                  Tentar de novo
                </button>
              </div>
              <p className="wa-orc-hint">{RECUPERACAO_CLIENTE_INDISPONIVEL}</p>
            </>
          ) : null}

          {erro ? (
            <div className="wa-orc-alert wa-orc-alert--erro" role="alert">
              <span>{erro}</span>
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm"
                disabled={buscando || limpo.length < MIN_CARACTERES}
                onClick={tentarDeNovo}
              >
                Tentar de novo
              </button>
            </div>
          ) : null}

          {vazio ? <p className="wa-orc-hint">{mensagemBuscaClienteSemResultado(busca)}</p> : null}

          <div className="wa-orc-resultados">
            {grupo.lista.map((c) => (
              <CandidatoCliente
                key={c.codigo_cliente_erp}
                candidato={c}
                comDocumento={!grupo.unico}
                onEscolher={escolher}
                disabled={disabled}
              />
            ))}
          </div>

          {/* Sem número de página e sem clamp: só o que `tem_mais`/`tem_anterior` autorizam. */}
          {grupo.paginacao && (grupo.paginacao.tem_anterior || grupo.paginacao.tem_mais) ? (
            <div className="wa-orc-paginacao">
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm"
                disabled={!grupo.paginacao.tem_anterior || buscando || disabled}
                onClick={() => setPagina((v) => Math.max(1, v - 1))}
              >
                Voltar
              </button>
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm"
                disabled={!grupo.paginacao.tem_mais || buscando || disabled}
                onClick={() => setPagina((v) => v + 1)}
              >
                Mostrar mais resultados
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
