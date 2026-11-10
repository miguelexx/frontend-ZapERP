/**
 * O campo VENDEDOR do orçamento, com a lista do ERP dentro dele.
 *
 * Plano: `backend/docs/ai-handoff/36-ORCAMENTO-WM-INTEGRACAO.md` (D11 — quem resolve o vendedor
 * é `preparar`; §6.2 — vendedor mexe com comissão). Contrato do endpoint: Anexo A, item D,
 * pedido 2, **atendido em 09/11/2026**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ESTE COMPONENTE RESOLVE
 * ────────────────────────────────────────────────────────────────────────────
 * Vendedor era o único dos três campos sem lista própria. Cliente tinha `/clientes/consultar`,
 * produto tinha `/produtos/consultar`, e vendedor só se resolvia dentro de `preparar` — que
 * exige cliente E ao menos um item. Resultado: o campo era texto livre, e o atendente tinha de
 * adivinhar como o nome dele está cadastrado no ERP. "MARKONY" ou "Markony Silva"? Errou,
 * descobriu no Calcular, com o cliente esperando.
 *
 * Agora ele toca o campo e VÊ os vendedores da loja.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O GATILHO: TOCAR O CAMPO, E NADA ANTES DISSO
 * ────────────────────────────────────────────────────────────────────────────
 * `busca` é OPCIONAL neste endpoint (diferente de cliente e de produto): sem termo, a WM
 * devolve TODOS — 8 na empresa de teste. Então não existe piso de caracteres aqui: **focar o
 * campo já pede a lista inteira**, porque não há nada que o atendente precise digitar primeiro.
 *
 * Abrir o drawer, porém, não custa nada: o estado `pedida` só vira verdadeiro no `onFocus` ou
 * ao digitar. Render, remontagem por troca de etapa e pré-preenchimento vindo da memória não
 * disparam consulta nenhuma. É a mesma guarda do `ClientePicker`, pelo mesmo motivo (cada
 * consulta é realtime no SQL Server da loja e pode custar dinheiro — §11 do doc 36).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DIGITAR NÃO CUSTA CONSULTA QUANDO A LISTA INTEIRA JÁ ESTÁ NA MÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Se a resposta de "todos" couber numa página só (`tem_mais` e `tem_anterior` falsos), a tela
 * TEM o cadastro inteiro — e filtrar vira trabalho local, instantâneo, com zero chamadas.
 * `listaCompletaDeVendedores` é quem autoriza isso, e só ela: numa loja com mais vendedores do
 * que cabe numa página a lista local é parcial, e aí cada termo volta a ser uma pergunta à WM
 * (debounce de 800 ms, como nos irmãos). Filtrar uma lista parcial esconderia vendedores.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESCOLHER NÃO É CONFIRMAR — MAS ELIMINA A AMBIGUIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * D11 continua: quem resolve o vendedor do orçamento é `preparar`, que revalida o código e pode
 * recusar um vendedor inativado. A resposta vem com `resolucao_definitiva: false` e a tela diz
 * isso antes do cálculo.
 *
 * O que escolher aqui muda — e é mais do que no campo de cliente — é que o rascunho passa a
 * levar `vendedor_codigo_erp` em vez de `vendedor_busca`. Com o código, `preparar` não precisa
 * desempatar homônimos e o laço do `AmbiguidadePicker` nem aparece. Quem prefere digitar e
 * calcular continua caindo no laço, exatamente como antes: a lista é atalho, não pedágio.
 *
 * ⚠️ **MEXER NO TEXTO APAGA A ESCOLHA.** `preparar` prefere `vendedor_codigo_erp` quando os
 * dois existem, então um código órfão mandaria a comissão para o vendedor de antes com outro
 * nome na tela — sobre o dinheiro de uma pessoa real. `patchVendedorDigitado` e
 * `patchVendedorEscolhido` são o único caminho de escrita e são opostos por construção.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A LOJA FORA DO AR NÃO É "NENHUM VENDEDOR"
 * ────────────────────────────────────────────────────────────────────────────
 * Esta porta é realtime e cai com o sincronizador da loja (`WM_SINCRONIZADOR_OFFLINE`), enquanto
 * a busca de produto continua respondendo 200. Exibir esse 503 como lista vazia diria "sua loja
 * não tem vendedor nenhum" — absurdo que o atendente não tem como contestar. Quem separa os dois
 * é `traduzirErroBuscaVendedor`; aqui, lista vazia chega por `200` e nem passa por lá.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { consultarVendedoresOrcamento, extrairErroOrcamento } from "../../api/wmOrcamentosService";
import { textoOuSemValor } from "./orcamentoFormat";
import {
  AVISO_VENDEDOR_NAO_DEFINITIVO,
  RECUPERACAO_VENDEDOR_INDISPONIVEL,
  SEM_VENDEDOR,
  agruparCandidatosVendedor,
  filtrarVendedoresLocalmente,
  listaCompletaDeVendedores,
  mensagemBuscaVendedorSemResultado,
  patchVendedorDigitado,
  patchVendedorEscolhido,
  tituloVendedoresEncontrados,
  traduzirErroBuscaVendedor,
} from "./orcamentoViewModel";

/** Mesma espera dos irmãos — e aqui ela quase nunca é usada (ver o filtro local). */
const DEBOUNCE_MS = 800;
/** Quantos esqueletos pintar enquanto a primeira consulta não volta. */
const ESQUELETOS = [0, 1];

/**
 * UMA consulta de vendedores, já traduzida para a tela.
 *
 * Sem `termo`, pede TODOS: a chave `busca` nem entra no corpo (string vazia é 400 na WM).
 * Lista vazia volta por `200` e sai daqui como grupo vazio — nunca como erro.
 */
async function pedirPagina(termo, paginaAlvo, signal) {
  try {
    const data = await consultarVendedoresOrcamento({
      busca: termo || undefined,
      pagina: paginaAlvo > 1 ? paginaAlvo : undefined,
      signal,
    });
    return { grupo: agruparCandidatosVendedor(data), erro: "", indisponivel: "", cancelado: false };
  } catch (err) {
    const bruto = extrairErroOrcamento(err);
    if (bruto.cancelado) {
      return { grupo: SEM_VENDEDOR, erro: "", indisponivel: "", cancelado: true };
    }
    const { tipo, mensagem } = traduzirErroBuscaVendedor(bruto);
    return {
      grupo: SEM_VENDEDOR,
      erro: tipo === "erro" ? mensagem : "",
      indisponivel: tipo === "indisponivel" ? mensagem : "",
      cancelado: false,
    };
  }
}

/**
 * Um vendedor — e um vendedor é um BOTÃO que o põe no orçamento.
 *
 * Mesma casca dos candidatos do laço de ambiguidade e da busca de cliente (`.wa-orc-candidato`
 * + seta à direita): escolher é a mesma pergunta nas três telas e precisa da mesma resposta
 * visual.
 *
 * O código ERP vem na linha secundária porque é ele que separa dois "JOSE": discreto, mas à
 * vista. Não há documento a mostrar — o contrato desta porta traz só código e nome.
 */
function CandidatoVendedor({ candidato, onEscolher, disabled }) {
  const nome = textoOuSemValor(candidato.nome);

  return (
    <button
      type="button"
      className="wa-orc-candidato"
      disabled={disabled}
      aria-label={`Usar o vendedor ${nome}`}
      onClick={() => onEscolher(candidato)}
    >
      <span className="wa-orc-candidato-corpo">
        <span className="wa-orc-candidato-titulo">{nome}</span>
        <span className="wa-orc-candidato-meta">{`Cód. ${candidato.codigo_vendedor_erp}`}</span>
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
 * Mesmo arranjo do `ClientePicker`, e pela mesma razão: a seção "Cliente e vendedor" é uma grade
 * de duas colunas a partir de 460px, e a lista precisa da linha INTEIRA. O `order` do CSS manda
 * a região para depois das duas colunas; no celular, coluna única, ela fica logo abaixo do campo
 * que a produziu — que é onde a pessoa está olhando.
 *
 * @param {object} props
 * @param {string} props.busca texto digitado (`rascunho.vendedorBusca`)
 * @param {string} props.codigoErp `rascunho.vendedorCodigoErp` — preenchido = já escolhido
 * @param {string} props.nome `rascunho.vendedorNome`
 * @param {boolean} props.deMemoria o código veio da lembrança, não de uma confirmação da WM
 * @param {(mudanca: object) => void} props.onPatch grava no rascunho
 * @param {boolean} props.disabled o orçamento está calculando
 */
export default function VendedorPicker({
  busca = "",
  codigoErp = "",
  nome = "",
  deMemoria = false,
  onPatch,
  disabled = false,
}) {
  const [pagina, setPagina] = useState(1);
  const [grupo, setGrupo] = useState(SEM_VENDEDOR);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [indisponivel, setIndisponivel] = useState("");
  const [buscou, setBuscou] = useState(false);
  /**
   * A pessoa já pediu esta lista?
   *
   * Abrir o drawer, trocar de etapa e o pré-preenchimento vindo da memória NÃO podem custar uma
   * consulta em tempo real na loja. Tocar o campo (ou digitar) é o gesto; antes dele, nada sai.
   */
  const [pedida, setPedida] = useState(false);

  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const geracaoRef = useRef(0);
  /** Último `termo|pagina` efetivamente consultado — evita repetir a mesma chamada. */
  const termoConsultadoRef = useRef("");
  /** "Trocar" devolve o foco ao campo: a próxima coisa a fazer é escolher outro. */
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

  const limpo = String(busca || "").trim();
  /*
    A lista que temos é o cadastro INTEIRO? Só essa prova autoriza o filtro local — e é ela que
    faz digitar não custar consulta nenhuma na loja típica (8 vendedores numa página só).
  */
  const completa = listaCompletaDeVendedores(grupo);
  /*
    O termo que viaja à WM. Com a lista completa na mão, é SEMPRE vazio: pedimos todos uma vez e
    filtramos aqui. Sem ela, o termo vai, porque o vendedor procurado pode estar noutra página.
  */
  const termoParaWm = completa ? "" : limpo;

  useEffect(() => {
    // Com vendedor escolhido a lista está fora da tela: insistir nela gastaria consulta para
    // pintar o que ninguém vê. O resultado fica guardado para o caso de "Trocar".
    if (codigoErp || !pedida) return undefined;
    if (termoConsultadoRef.current === `${termoParaWm}|${pagina}`) return undefined;
    /*
      A primeira consulta (a lista inteira, logo ao tocar o campo) é IMEDIATA: não há o que
      esperar a pessoa terminar de digitar, porque ela não precisa digitar nada. O debounce vale
      só para o caso em que o termo de fato viaja — loja grande, lista incompleta.
    */
    const espera = termoParaWm ? DEBOUNCE_MS : 0;
    const t = setTimeout(() => {
      void buscar(termoParaWm, pagina);
    }, espera);
    return () => clearTimeout(t);
  }, [termoParaWm, pagina, codigoErp, pedida, buscar]);

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
      // Mexer no texto apaga a escolha anterior — é isto que impede o orçamento de sair
      // comissionado para o vendedor de antes com outro nome na tela.
      onPatch?.(patchVendedorDigitado(valor));
    },
    [onPatch]
  );

  const escolher = useCallback(
    (candidato) => {
      if (disabled) return;
      const mudanca = patchVendedorEscolhido(candidato);
      if (mudanca) onPatch?.(mudanca);
    },
    [disabled, onPatch]
  );

  const trocar = useCallback(() => {
    focarAoVoltarRef.current = true;
    // O texto digitado FICA: é por ele que a lista de onde a escolha saiu volta à tela.
    onPatch?.({ vendedorCodigoErp: "", vendedorNome: "", vendedorDeMemoria: false });
  }, [onPatch]);

  const tentarDeNovo = useCallback(() => {
    termoConsultadoRef.current = "";
    void buscar(termoParaWm, pagina);
  }, [buscar, termoParaWm, pagina]);

  // Com a lista completa o filtro é local; sem ela, a WM já devolveu a lista filtrada.
  const lista = completa ? filtrarVendedoresLocalmente(grupo.lista, limpo) : grupo.lista;
  const vazio = !buscando && buscou && !erro && !indisponivel && lista.length === 0;
  // Esqueleto só quando não há nada na tela: trocar nomes visíveis por caixas cinzentas tiraria
  // da atendente justamente o card que ela já estava mirando.
  const esqueleto = buscando && lista.length === 0;
  const titulo = tituloVendedoresEncontrados({ lista }, limpo);
  const mostrarResultados =
    !codigoErp && (buscando || buscou || Boolean(erro) || Boolean(indisponivel));

  return (
    <>
      <div className="wa-orc-campo">
        <label className="wa-orc-label" htmlFor="wa-orc-vendedor">
          Vendedor
        </label>
        {codigoErp ? (
          <>
            <div className="wa-orc-escolhido">
              <div>
                <strong>{textoOuSemValor(nome)}</strong>
                {/*
                  Vendedor vindo da MEMÓRIA não ganha a mesma cara de um confirmado pela WM: ele
                  ainda vai ser revalidado em `preparar` e pode ser recusado (inativo, trocado de
                  carteira). Dizer "usado da última vez" é o que há de verdadeiro aqui — e
                  vendedor mexe com comissão, então a diferença importa (§6.2).
                */}
                <span className="wa-orc-item-codigo">
                  {deMemoria
                    ? `Usado da última vez · cód. ERP ${codigoErp}`
                    : `Cód. ERP ${codigoErp}`}
                </span>
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
              O que a escolha vale, dito ANTES do Calcular — mesma régua do campo de cliente.
              Escolher aqui elimina a ambiguidade, mas não garante que o cálculo aceita.
            */}
            <p className="wa-orc-hint">{AVISO_VENDEDOR_NAO_DEFINITIVO}</p>
          </>
        ) : (
          <>
            <input
              id="wa-orc-vendedor"
              ref={inputRef}
              className="wa-input wa-orc-input"
              type="text"
              autoComplete="off"
              placeholder="Nome do vendedor no ERP"
              value={busca || ""}
              maxLength={100}
              disabled={disabled}
              onFocus={() => setPedida(true)}
              onChange={(e) => digitar(e.target.value)}
            />
            {/*
              O convite tem de dizer o que acontece ao tocar, porque é raro: nos outros dois
              campos é preciso digitar antes de ver qualquer coisa. Aqui não — e quem não sabe
              disso digita um nome errado e conclui que o vendedor não existe.
            */}
            <p className="wa-orc-hint">
              {pedida
                ? "Toque no vendedor da lista, ou digite para filtrar."
                : "Toque aqui para ver os vendedores cadastrados."}
            </p>
          </>
        )}
      </div>

      {mostrarResultados ? (
        <div
          className="wa-orc-vendedorResultados"
          aria-label="Vendedores do sistema da empresa"
          aria-busy={buscando}
        >
          {/*
            Faixa de estado com altura reservada no CSS (igual às outras duas buscas): entrar em
            "Carregando…" não pode empurrar a lista para baixo quando já há nomes na tela.
          */}
          <div className="wa-orc-buscaStatus">
            <span role="status">{buscando ? "Carregando vendedores…" : titulo}</span>
          </div>

          {esqueleto
            ? ESQUELETOS.map((i) => (
                <div className="wa-orc-skelCard" key={`skel-vend-${i}`} aria-hidden="true">
                  <span className="wa-orc-skelLinha wa-orc-skelLinha--titulo" />
                  <span className="wa-orc-skelLinha wa-orc-skelLinha--meta" />
                </div>
              ))
            : null}

          {/*
            A loja fora do ar é INDISPONIBILIDADE, não ausência de vendedor — âmbar de aviso, e
            não o vermelho de erro, porque nada está quebrado e nada foi perdido. A frase de
            recuperação diz o que ainda dá para fazer: digitar o nome e calcular continua
            valendo, porque `preparar` resolve o nome na hora.
          */}
          {indisponivel ? (
            <>
              <div className="wa-orc-alert wa-orc-alert--aviso" role="alert">
                <span>{indisponivel}</span>
                <button
                  type="button"
                  className="wa-btn wa-btn-ghost wa-orc-btnSm"
                  disabled={buscando}
                  onClick={tentarDeNovo}
                >
                  Tentar de novo
                </button>
              </div>
              <p className="wa-orc-hint">{RECUPERACAO_VENDEDOR_INDISPONIVEL}</p>
            </>
          ) : null}

          {erro ? (
            <div className="wa-orc-alert wa-orc-alert--erro" role="alert">
              <span>{erro}</span>
              <button
                type="button"
                className="wa-btn wa-btn-ghost wa-orc-btnSm"
                disabled={buscando}
                onClick={tentarDeNovo}
              >
                Tentar de novo
              </button>
            </div>
          ) : null}

          {vazio ? <p className="wa-orc-hint">{mensagemBuscaVendedorSemResultado(limpo)}</p> : null}

          <div className="wa-orc-resultados">
            {lista.map((v) => (
              <CandidatoVendedor
                key={v.codigo_vendedor_erp}
                candidato={v}
                onEscolher={escolher}
                disabled={disabled}
              />
            ))}
          </div>

          {/*
            Paginação só existe quando a lista NÃO cabe numa página — que é exatamente o caso em
            que o filtro local está desligado. Sem número de página e sem clamp: só o que
            `tem_mais`/`tem_anterior` autorizam.
          */}
          {!completa && grupo.paginacao && (grupo.paginacao.tem_anterior || grupo.paginacao.tem_mais) ? (
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
