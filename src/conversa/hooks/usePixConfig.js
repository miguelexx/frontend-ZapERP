import { useCallback, useRef, useState } from "react";
import { useLazyHookImpl } from "./lazyHookImpl";

const loadImpl = () => import("./usePixConfig.impl");

/**
 * Configuração e envio de mensagem Pix (modal + composer).
 * UI em PixConfigModal; lógica concentrada em `usePixConfig.impl.js`.
 *
 * Casca: o botão Pix do composer é uma AÇÃO (envia a chave), não um "abrir modal".
 * Na primeira vez o chunk desce no clique; `pixActionBusy` sobe aqui, síncrono, para o
 * composer mostrar o spinner e barrar o duplo clique enquanto o corpo carrega.
 */
export function usePixConfig({
  conversaId,
  sending,
  podeEnviar,
  showToast,
  handleEnviar,
  composerRef,
}) {
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixConfigLoading, setPixConfigLoading] = useState(false);
  const [pixConfigLoaded, setPixConfigLoaded] = useState(false);
  const [pixConfigSaving, setPixConfigSaving] = useState(false);
  const [pixActionBusy, setPixActionBusy] = useState(false);
  const [pixTipoChave, setPixTipoChave] = useState("cpf");
  const [pixChave, setPixChave] = useState("");
  const [pixNomeRecebedor, setPixNomeRecebedor] = useState("");
  const [pixMensagemPadrao, setPixMensagemPadrao] = useState("");
  const { withImpl } = useLazyHookImpl(loadImpl, { showToast, label: "Pix" });

  const ctxRef = useRef(null);
  ctxRef.current = {
    conversaId,
    sending,
    podeEnviar,
    showToast,
    handleEnviar,
    composerRef,
    pixConfigLoading,
    pixConfigLoaded,
    pixConfigSaving,
    pixActionBusy,
    pixTipoChave,
    pixChave,
    pixNomeRecebedor,
    pixMensagemPadrao,
    setPixModalOpen,
    setPixConfigLoading,
    setPixConfigLoaded,
    setPixConfigSaving,
    setPixActionBusy,
    setPixTipoChave,
    setPixChave,
    setPixNomeRecebedor,
    setPixMensagemPadrao,
  };

  const fetchPixConfigIfNeeded = useCallback(() => {
    const ctx = ctxRef.current;
    return withImpl((impl) => impl.fetchPixConfigIfNeeded(ctx));
  }, [withImpl]);

  const handleSalvarPixConfig = useCallback(
    (opts = {}) => {
      const ctx = ctxRef.current;
      return withImpl((impl) => impl.handleSalvarPixConfig(ctx, opts));
    },
    [withImpl]
  );

  const handlePixMenuClick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx.conversaId || ctx.sending || ctx.pixActionBusy || !ctx.podeEnviar) return undefined;
    // Fechar os painéis do composer é visual e precisa acontecer DENTRO do clique — não
    // depois do chunk chegar.
    composerRef.current?.closePanels?.();
    // Spinner + anti-duplo-clique já no clique; o corpo repete o guard com o snapshot
    // (busy=false) e devolve o flag no finally.
    setPixActionBusy(true);
    const resultado = withImpl(
      (impl) => impl.handlePixMenuClick(ctx),
      () => setPixActionBusy(false)
    );
    // `withImpl` devolve `undefined` SÍNCRONO quando outra ação do mesmo hook já está esperando o
    // chunk (gate) — e nesse caso não chama `onError`. Sem isto o botão Pix ficava "Enviando…"
    // desabilitado até remontar a conversa (ex.: abrir "Configurar Pix" e tocar "Pix" no 3G).
    if (resultado === undefined) setPixActionBusy(false);
    return resultado;
  }, [composerRef, withImpl]);

  return {
    pixModalOpen,
    setPixModalOpen,
    pixConfigLoading,
    pixConfigLoaded,
    pixConfigSaving,
    pixActionBusy,
    pixTipoChave,
    setPixTipoChave,
    pixChave,
    setPixChave,
    pixNomeRecebedor,
    setPixNomeRecebedor,
    pixMensagemPadrao,
    setPixMensagemPadrao,
    fetchPixConfigIfNeeded,
    handleSalvarPixConfig,
    handlePixMenuClick,
  };
}
