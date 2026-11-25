import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconArrowLeft,
  IconUsersGroup,
  IconCheck,
  IconAlertTriangle,
  IconClockHour4,
  IconSend,
  IconBrandWhatsapp,
  IconShieldCheck,
  IconUserX,
} from "@tabler/icons-react";
import { criarGrupo } from "../chats/chatService";
import { enfileirarParticipantesGrupo, convidarParticipantesGrupo } from "../conversa/groupWhatsappService";
import { useNotificationStore } from "../notifications/notificationStore";
import { useWhatsappInstancesStore } from "../chats/whatsappInstancesStore";
import { whatsappInstanceLabel } from "../chats/whatsappInstancesService";
import ContatosPicker from "../components/ContatosPicker";
import "./novoGrupo.css";

// Até este total, o grupo é criado com todos de uma vez (comportamento normal do WhatsApp).
// Acima disso, cria com 1 "semente" e o restante entra na FILA protegida (ritmo conservador).
const IMMEDIATE_MAX = 20;
// Limite do WhatsApp para o nome do grupo (o backend valida o mesmo número).
const NOME_MAX = 100;
// Se a semente não tiver WhatsApp, tenta a próxima — até este tanto.
const SEMENTE_TENTATIVAS = 3;
// POST /participantes/convidar aceita no máximo 50 por vez.
const CONVITE_LOTE_MAX = 50;

const soDigitos = (s) => String(s || "").replace(/\D/g, "");

function maskPhone(tel) {
  const d = soDigitos(tel);
  if (d.length === 13) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return tel;
}

function iniciaisGrupo(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "";
  return ((p[0][0] || "") + (p.length > 1 ? p[p.length - 1][0] : p[0][1] || "")).toUpperCase();
}

function podeCriarGrupo(inst) {
  // Só a Whapi cria grupo pelo sistema; UltraMSG não tem o endpoint.
  const prov = String(inst?.provider || "").toLowerCase();
  return !prov || prov === "whapi";
}

function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

function erroDaApi(err, padrao) {
  const data = err?.response?.data;
  return {
    codigo: data?.codigo || data?.code || null,
    msg: data?.error || err?.message || padrao,
    data,
  };
}

export default function NovoGrupo() {
  const navigate = useNavigate();
  const showToast = useNotificationStore((s) => s.showToast);

  const instances = useWhatsappInstancesStore((s) => s.instances);
  const instancesLoading = useWhatsappInstancesStore((s) => s.loading);
  const loadInstances = useWhatsappInstancesStore((s) => s.load);

  const [nome, setNome] = useState("");
  const [phones, setPhones] = useState([]);
  const [nomesPorTelefone, setNomesPorTelefone] = useState(() => new Map());
  const [instanceId, setInstanceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [etapa, setEtapa] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [pickerKey, setPickerKey] = useState(0);
  const nomeRef = useRef(null);

  useEffect(() => { loadInstances(); }, [loadInstances]);
  // Foco automático só com mouse: no celular abriria o teclado por cima da tela inteira.
  useEffect(() => {
    if (resultado) return;
    try {
      if (window.matchMedia?.("(pointer: fine)").matches) nomeRef.current?.focus();
    } catch { /* sem matchMedia */ }
  }, [resultado]);

  // Lista do servidor quando ele pediu a escolha (a local pode ter falhado ao carregar).
  const [instanciasServidor, setInstanciasServidor] = useState([]);
  const lista = instances.length ? instances : instanciasServidor;
  // 2+ números ativos na empresa: o backend exige saber em qual criar.
  // (ou o servidor já pediu a escolha: aí o id vai sempre, mesmo com 1 número na lista dele)
  const multiplosNumeros = lista.length > 1 || instanciasServidor.length > 0;
  // Trava "visibilidade por número": só os números que esta pessoa pode usar.
  const disponiveis = useMemo(() => lista.filter((i) => i?.usuario_pode_usar !== false), [lista]);
  const instanciasCriadoras = useMemo(() => disponiveis.filter(podeCriarGrupo), [disponiveis]);
  const semNumeroPermitido = multiplosNumeros && disponiveis.length === 0;

  // Um único número capaz de criar grupo: já vem escolhido (e o seletor nem aparece).
  useEffect(() => {
    if (!multiplosNumeros || instanceId) return;
    if (instanciasCriadoras.length === 1) setInstanceId(String(instanciasCriadoras[0].id));
  }, [multiplosNumeros, instanciasCriadoras, instanceId]);

  // Escolha que deixou de valer (número saiu da lista ou da trava): limpa.
  useEffect(() => {
    if (!instanceId) return;
    if (lista.length && !instanciasCriadoras.some((i) => String(i.id) === instanceId)) setInstanceId("");
  }, [instanceId, lista.length, instanciasCriadoras]);

  const precisaEscolherNumero = multiplosNumeros && !semNumeroPermitido && instanciasCriadoras.length !== 1;

  const onPhonesChange = useCallback((list, meta) => {
    setPhones(list);
    const mapa = new Map();
    for (const c of meta?.contatos || []) {
      const d = soDigitos(c.telefone);
      if (d && c.nome) mapa.set(d, c.nome);
    }
    setNomesPorTelefone(mapa);
    setError("");
  }, []);

  const nomeTrim = nome.trim();
  const grande = phones.length > IMMEDIATE_MAX;
  const faltaNumero = multiplosNumeros && !instanceId;
  // Empresa com um número só, e ele não cria grupo (UltraMSG): avisa ANTES de preencher tudo.
  const numeroUnicoSemGrupo = !multiplosNumeros && lista.length === 1 && !podeCriarGrupo(lista[0]);
  const podeEnviar = !busy && nomeTrim.length > 0 && phones.length > 0 && !faltaNumero && !numeroUnicoSemGrupo;

  const rotulo = useCallback(
    (tel) => nomesPorTelefone.get(soDigitos(tel)) || maskPhone(tel),
    [nomesPorTelefone]
  );

  async function salvar(e) {
    e.preventDefault();
    if (busy) return;
    if (!nomeTrim) { setError("Dê um nome ao grupo."); nomeRef.current?.focus(); return; }
    if (!phones.length) { setError("Escolha ao menos um participante."); return; }
    if (faltaNumero) {
      setError(semNumeroPermitido
        ? "Você não tem acesso a nenhum número WhatsApp para criar grupos."
        : "Escolha por qual número o grupo será criado.");
      return;
    }

    setBusy(true); setError(""); setEtapa("Criando o grupo no WhatsApp…");
    const inst = multiplosNumeros ? instanceId : null;
    let created = null;
    let semWhatsapp = [];
    let iniciais = [];
    try {
      if (!grande) {
        iniciais = phones;
        created = await criarGrupo(nomeTrim, iniciais, inst);
      } else {
        // Semente: o WhatsApp exige ao menos 1 participante. Se ela não tiver WhatsApp,
        // tenta a próxima em vez de travar o grupo inteiro por causa de um número.
        let ultimoErro = null;
        for (let i = 0; i < Math.min(SEMENTE_TENTATIVAS, phones.length) && !created; i += 1) {
          try {
            iniciais = [phones[i]];
            created = await criarGrupo(nomeTrim, iniciais, inst);
          } catch (err) {
            const info = erroDaApi(err);
            if (info.codigo !== "SEM_WHATSAPP") throw err;
            semWhatsapp.push(phones[i]);
            ultimoErro = err;
          }
        }
        if (!created) throw ultimoErro || new Error("Nenhum dos primeiros números tem WhatsApp.");
      }

      const id = created?.id;
      if (!id) throw new Error("Grupo criado, mas sem identificador para continuar.");
      const pr = created?.participantes_resultado || {};
      semWhatsapp = [...new Set([...semWhatsapp, ...(pr.sem_whatsapp || [])])];
      const naoAdicionados = Array.isArray(pr.nao_adicionados) ? pr.nao_adicionados : [];

      // A partir daqui o grupo JÁ EXISTE. Falha na fila não pode virar "não foi possível criar".
      const usados = new Set([...iniciais, ...semWhatsapp].map(soDigitos));
      const resto = grande ? phones.filter((p) => !usados.has(soDigitos(p))) : [];
      let fila = null;
      let filaErro = "";
      if (resto.length) {
        setEtapa("Agendando os demais participantes…");
        try {
          fila = await enfileirarParticipantesGrupo(id, resto);
        } catch (err) {
          filaErro = erroDaApi(err, "Não foi possível agendar os demais participantes.").msg;
        }
      }

      const adicionados = typeof pr.adicionados === "number"
        ? pr.adicionados
        : Math.max(0, iniciais.length - naoAdicionados.length);
      showToast?.({ type: "success", title: "Grupo criado", message: `“${created?.nome_grupo || nomeTrim}” já está no WhatsApp.` });
      setResultado({
        conversaId: id,
        nome: created?.nome_grupo || nomeTrim,
        adicionados,
        naoAdicionados,
        semWhatsapp,
        fila,
        filaErro,
        restoTotal: resto.length,
      });
    } catch (err) {
      const info = erroDaApi(err, "Não foi possível criar o grupo.");
      if (info.codigo === "SELECIONE_WHATSAPP_INSTANCE") {
        // A lista de números local estava velha (número novo conectado/desligado): usa a do
        // servidor já, recarrega a local e pede a escolha.
        if (Array.isArray(info.data?.instances)) setInstanciasServidor(info.data.instances);
        setInstanceId("");
        loadInstances(true);
        setError(info.msg || "Escolha por qual número o grupo será criado.");
      } else if (info.codigo === "NUMERO_SEM_ACESSO") {
        setInstanceId("");
        loadInstances(true);
        setError(info.msg);
      } else {
        setError(info.msg);
      }
    } finally {
      setBusy(false);
      setEtapa("");
    }
  }

  function criarOutro() {
    setResultado(null);
    setNome("");
    setPhones([]);
    setNomesPorTelefone(new Map());
    setError("");
    setPickerKey((k) => k + 1);
  }

  if (resultado) {
    return (
      <div className="ng-page">
        <ResultadoGrupo
          r={resultado}
          rotulo={rotulo}
          onAbrir={() => navigate(`/atendimento?conversa=${resultado.conversaId}`)}
          onOutro={criarOutro}
        />
      </div>
    );
  }

  const ini = iniciaisGrupo(nomeTrim);
  const restante = NOME_MAX - nome.length;

  return (
    <div className="ng-page">
      <header className="ng-top">
        <button type="button" className="ng-back" onClick={() => navigate("/atendimento")} aria-label="Voltar para o atendimento">
          <IconArrowLeft size={20} stroke={1.8} />
        </button>
        <div className="ng-topText">
          <h1>Novo grupo</h1>
          <p>Criado direto no WhatsApp, com contatos da sua base.</p>
        </div>
      </header>

      <form className="ng-card" onSubmit={salvar} noValidate>
        <section className="ng-identity">
          <div className={`ng-avatar${ini ? " has-text" : ""}`} aria-hidden="true">
            {ini || <IconUsersGroup size={28} stroke={1.6} />}
          </div>
          <div className="ng-nameField">
            <label htmlFor="ng-nome" className="ng-label">Nome do grupo</label>
            <div className="ng-inputWrap">
              <input
                id="ng-nome"
                ref={nomeRef}
                className="ng-input"
                value={nome}
                onChange={(e) => { setNome(e.target.value.slice(0, NOME_MAX)); setError(""); }}
                placeholder="Ex.: Clientes VIP — Novembro"
                autoComplete="off"
                maxLength={NOME_MAX}
                disabled={busy}
                aria-describedby="ng-nome-count"
              />
              <span id="ng-nome-count" className={`ng-counter${restante <= 10 ? " is-low" : ""}`}>
                {restante}
              </span>
            </div>
          </div>
        </section>

        {precisaEscolherNumero || semNumeroPermitido ? (
          <section className="ng-section">
            <div className="ng-sectionHead">
              <h2>Criar pelo número</h2>
            </div>
            <div className="ng-instances" role="radiogroup" aria-label="Número WhatsApp do grupo">
              {semNumeroPermitido ? (
                <span className="ng-muted">Você não tem acesso a nenhum número WhatsApp. Peça ao administrador para liberar um.</span>
              ) : instancesLoading && !lista.length ? (
                <span className="ng-muted">Carregando números…</span>
              ) : (
                disponiveis.map((inst) => {
                  const pode = podeCriarGrupo(inst);
                  const ativo = String(inst.id) === instanceId;
                  const fone = inst.display_phone || inst.telefone_conectado;
                  return (
                    <button
                      key={inst.id}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      disabled={!pode || busy}
                      className={`ng-instance${ativo ? " is-active" : ""}`}
                      onClick={() => { setInstanceId(String(inst.id)); setError(""); }}
                      title={pode ? undefined : "Este número não permite criar grupos pelo sistema"}
                    >
                      <span className="ng-instanceIcon"><IconBrandWhatsapp size={18} stroke={1.7} /></span>
                      <span className="ng-instanceText">
                        <b>{whatsappInstanceLabel(inst) || `WhatsApp #${inst.id}`}</b>
                        <small>{pode ? (fone ? maskPhone(fone) : "Conectado") : "Não cria grupos"}</small>
                      </span>
                      {ativo ? <IconCheck size={16} stroke={2.4} className="ng-instanceCheck" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        <section className="ng-section">
          <div className="ng-sectionHead">
            <h2>Participantes</h2>
            {phones.length ? <span className="ng-badge">{phones.length}</span> : null}
          </div>
          <ContatosPicker key={pickerKey} onPhonesChange={onPhonesChange} maxHeight={340} showSelectedChips />
          {grande ? (
            <div className="ng-note">
              <IconShieldCheck size={18} stroke={1.7} aria-hidden="true" />
              <span>
                Com mais de {IMMEDIATE_MAX} pessoas o grupo nasce com 1 participante e os demais entram
                <b> aos poucos</b>, numa fila protegida — assim o número não corre risco de bloqueio.
              </span>
            </div>
          ) : null}
        </section>

        {numeroUnicoSemGrupo ? (
          <div className="ng-note ng-note--warn">
            <IconAlertTriangle size={18} stroke={1.7} aria-hidden="true" />
            <span>
              O número conectado não permite criar grupos pelo sistema. Crie o grupo no celular —
              ele aparece aqui automaticamente.
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="ng-error" role="alert">
            <IconAlertTriangle size={18} stroke={1.8} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <footer className="ng-foot">
          <span className="ng-footInfo" aria-live="polite">
            {busy
              ? etapa
              : phones.length
                ? plural(phones.length, "participante", "participantes")
                : "Nenhum participante ainda"}
          </span>
          <div className="ng-footActions">
            <button type="button" className="ng-btn ng-btn--ghost" onClick={() => navigate("/atendimento")} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="ng-btn ng-btn--primary" disabled={!podeEnviar} aria-busy={busy || undefined}>
              {busy ? <span className="ng-spinner" aria-hidden="true" /> : <IconCheck size={18} stroke={2.2} aria-hidden="true" />}
              {busy ? "Criando…" : "Criar grupo"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function ResultadoGrupo({ r, rotulo, onAbrir, onOutro }) {
  const [convite, setConvite] = useState({ estado: "idle", enviados: 0, total: 0, erro: "" });
  const fila = r.fila;
  const naFila = Number(fila?.total) || 0;
  const recusados = r.naoAdicionados;

  async function enviarConvites() {
    const lote = recusados.slice(0, CONVITE_LOTE_MAX);
    setConvite({ estado: "enviando", enviados: 0, total: lote.length, erro: "" });
    try {
      const resp = await convidarParticipantesGrupo(r.conversaId, lote);
      const enviados = Number(resp?.enviados) || 0;
      setConvite({
        estado: enviados > 0 ? "ok" : "erro",
        enviados,
        total: lote.length,
        erro: enviados > 0 ? "" : "Nenhum convite foi enviado.",
      });
    } catch (err) {
      setConvite({ estado: "erro", enviados: 0, total: lote.length, erro: erroDaApi(err, "Não foi possível enviar os convites.").msg });
    }
  }

  return (
    <div className="ng-card ng-done">
      <div className="ng-doneHero">
        <div className="ng-doneIcon" aria-hidden="true"><IconCheck size={30} stroke={2.6} /></div>
        <h1>Grupo criado</h1>
        <p className="ng-doneName">“{r.nome}”</p>
      </div>

      <div className="ng-stats">
        <div className="ng-stat ng-stat--ok">
          <b>{r.adicionados}</b>
          <span>{r.adicionados === 1 ? "entrou agora" : "entraram agora"}</span>
        </div>
        {naFila > 0 ? (
          <div className="ng-stat ng-stat--info">
            <b>{naFila}</b>
            <span>na fila protegida</span>
          </div>
        ) : null}
        {recusados.length > 0 ? (
          <div className="ng-stat ng-stat--warn">
            <b>{recusados.length}</b>
            <span>precisam de convite</span>
          </div>
        ) : null}
      </div>

      {recusados.length > 0 ? (
        <div className="ng-panel ng-panel--warn">
          <div className="ng-panelHead">
            <IconUserX size={18} stroke={1.8} aria-hidden="true" />
            <b>{plural(recusados.length, "pessoa não pôde ser adicionada", "pessoas não puderam ser adicionadas")} direto</b>
          </div>
          <p>
            {recusados.length === 1
              ? "A privacidade dessa pessoa no WhatsApp só permite entrar por convite. Mandamos o link do grupo e ela entra com um toque."
              : "A privacidade dessas pessoas no WhatsApp só permite entrar por convite. Mandamos o link do grupo e elas entram com um toque."}
          </p>
          <ul className="ng-people">
            {recusados.slice(0, 5).map((t) => <li key={t}>{rotulo(t)}</li>)}
            {recusados.length > 5 ? <li className="ng-muted">e mais {recusados.length - 5}</li> : null}
          </ul>
          {convite.estado === "ok" ? (
            <p className="ng-okLine"><IconCheck size={16} stroke={2.4} /> {plural(convite.enviados, "convite enviado", "convites enviados")}.</p>
          ) : (
            <button
              type="button"
              className="ng-btn ng-btn--soft"
              onClick={enviarConvites}
              disabled={convite.estado === "enviando"}
            >
              {convite.estado === "enviando" ? <span className="ng-spinner" aria-hidden="true" /> : <IconSend size={16} stroke={1.9} aria-hidden="true" />}
              {convite.estado === "enviando" ? "Enviando convites…" : "Enviar convite do grupo"}
            </button>
          )}
          {convite.estado === "erro" ? <p className="ng-errLine">{convite.erro}</p> : null}
          {recusados.length > CONVITE_LOTE_MAX ? (
            <p className="ng-muted">Os primeiros {CONVITE_LOTE_MAX} recebem agora; o restante pelo painel do grupo.</p>
          ) : null}
        </div>
      ) : null}

      {naFila > 0 ? (
        <div className="ng-panel ng-panel--info">
          <div className="ng-panelHead">
            <IconClockHour4 size={18} stroke={1.8} aria-hidden="true" />
            <b>Entrando aos poucos</b>
          </div>
          <p>
            Para proteger o número, a fila adiciona com calma e pausa sozinha em qualquer sinal de limite.
            {fila?.eta?.diasEstimados ? <> Previsão: ~<b>{plural(fila.eta.diasEstimados, "dia", "dias")}</b> (~{fila.eta.porDia}/dia).</> : null}
          </p>
          {fila?.ignorados ? <p className="ng-muted">{plural(fila.ignorados, "já estava", "já estavam")} no grupo.</p> : null}
          <p className="ng-muted">Acompanhe pelo painel do grupo, em Participantes.</p>
        </div>
      ) : null}

      {r.filaErro ? (
        <div className="ng-panel ng-panel--warn">
          <div className="ng-panelHead">
            <IconAlertTriangle size={18} stroke={1.8} aria-hidden="true" />
            <b>{plural(r.restoTotal, "participante ficou", "participantes ficaram")} de fora</b>
          </div>
          <p>O grupo foi criado, mas não deu para agendar o restante ({r.filaErro}). Abra o grupo e use “Adicionar participantes”.</p>
        </div>
      ) : null}

      {r.semWhatsapp.length > 0 ? (
        <p className="ng-muted ng-center">
          {plural(r.semWhatsapp.length, "número não tem", "números não têm")} WhatsApp e {r.semWhatsapp.length === 1 ? "ficou" : "ficaram"} de fora.
        </p>
      ) : null}

      <div className="ng-doneActions">
        <button type="button" className="ng-btn ng-btn--primary" onClick={onAbrir}>
          Abrir grupo
        </button>
        <button type="button" className="ng-btn ng-btn--ghost" onClick={onOutro}>
          Criar outro grupo
        </button>
      </div>
    </div>
  );
}
