import { useCallback, useEffect, useRef, useState } from "react";
import { listarAtendentesConversa } from "../conversa/conversaService";
import { getSocket } from "../socket/socket";

const VAZIO = Object.freeze([]);

/**
 * Carrega e mantém a lista de participantes de uma conversa.
 * Re-busca quando: conversaId muda, atendenteId muda (cobre o caso "Assumir"),
 * ou chega evento de socket de participação.
 *
 * A lista fica "carimbada" com o conversaId a que pertence:
 *  - ao trocar de conversa, nunca mostra (nem conta para `podeEnviar`) os
 *    atendentes da conversa anterior enquanto a nova carrega;
 *  - uma falha de rede NÃO zera a lista já carregada — antes o co-atendente
 *    perdia o composer e o contador do header caía para 0 num soluço da API.
 */
export function useConversaParticipantes(conversaId, atendenteId = null) {
  const [estado, setEstado] = useState({ cid: null, rows: VAZIO, erro: false });
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    if (!conversaId) {
      abortRef.current?.abort();
      setEstado({ cid: null, rows: VAZIO, erro: false });
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    try {
      // signal: sem ele o abort só descartava a resposta — a request seguia na rede.
      const rows = await listarAtendentesConversa(conversaId, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) {
        setEstado({ cid: conversaId, rows: Array.isArray(rows) ? rows : VAZIO, erro: false });
      }
    } catch (_) {
      if (!ctrl.signal.aborted) {
        setEstado((prev) =>
          prev.cid === conversaId
            ? { ...prev, erro: true }
            : { cid: conversaId, rows: VAZIO, erro: true }
        );
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [conversaId]);

  // Re-carrega quando conversaId ou atendenteId mudam
  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load, atendenteId]);

  // Socket: re-carrega em eventos de participação
  useEffect(() => {
    if (!conversaId) return;
    const socket = getSocket();
    if (!socket) return;

    const handlers = {
      conversa_atendente_adicionado: (p) => {
        if (Number(p?.conversa_id) === Number(conversaId)) load();
      },
      conversa_atendente_removido: (p) => {
        if (Number(p?.conversa_id) === Number(conversaId)) load();
      },
      conversa_participantes_atualizados: (p) => {
        if (Number(p?.conversa_id) === Number(conversaId)) load();
      },
    };

    for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);
    return () => {
      for (const [ev, fn] of Object.entries(handlers)) socket.off(ev, fn);
    };
  }, [conversaId, load]);

  const daConversaAtual = estado.cid != null && String(estado.cid) === String(conversaId);
  const participantes = daConversaAtual ? estado.rows : VAZIO;
  const carregado = daConversaAtual;
  const erro = daConversaAtual && estado.erro;

  const principal = participantes.find((p) => p.tipo === "principal") ?? null;
  const coAtendentes = participantes.filter((p) => p.tipo === "participante");
  const total = participantes.length;

  return { participantes, principal, coAtendentes, total, loading, carregado, erro, reload: load };
}
