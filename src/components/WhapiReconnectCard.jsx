import { useState } from "react";
import {
  IconBrandWhatsapp,
  IconCircleCheckFilled,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";
import { useWhapiReconnect } from "./useWhapiReconnect";
import {
  formatPairCode,
  isTransientChannelStatus,
  qrFrameState,
  reconnectInstanceLabel,
} from "./whapiReconnectLogic";
import "./whapi-reconnect-card.css";

const PASSOS = [
  <>Abra o <strong>WhatsApp</strong> no celular deste número.</>,
  <>Toque em <strong>Mais opções</strong> ou <strong>Configurações</strong> e escolha <strong>Dispositivos conectados</strong>.</>,
  <>Toque em <strong>Conectar dispositivo</strong> e aponte a câmera para esta tela.</>,
];

function QrFrame({ estado, qrDataUri, qrError, retryIn, onRefresh, canal }) {
  if (estado === "connected") {
    return (
      <div className="wa-rc__qr wa-rc__qr--ok">
        <IconCircleCheckFilled size={64} aria-hidden />
        <p className="wa-rc__qrMsg">WhatsApp reconectado</p>
      </div>
    );
  }

  if (estado === "qr") {
    return (
      <div className="wa-rc__qr">
        <img
          src={qrDataUri}
          alt={`QR Code para reconectar o WhatsApp${canal ? ` do canal ${canal}` : ""}`}
          className="wa-rc__qrImg"
        />
      </div>
    );
  }

  if (estado === "transient") {
    return (
      <div className="wa-rc__qr wa-rc__qr--muted" aria-busy="true">
        <span className="wa-rc__skeleton" aria-hidden />
        <p className="wa-rc__qrMsg">Reconectando o canal…</p>
        <p className="wa-rc__qrCount">Se voltar sozinho, não precisa escanear.</p>
      </div>
    );
  }

  if (estado === "throttled") {
    return (
      <div className="wa-rc__qr wa-rc__qr--muted">
        <p className="wa-rc__qrMsg">Aguarde para gerar um novo QR Code.</p>
        <p className="wa-rc__qrCount" aria-live="polite">
          Novo código em <strong>{retryIn}s</strong>
        </p>
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div className="wa-rc__qr wa-rc__qr--muted">
        <p className="wa-rc__qrMsg">{qrError || "Não foi possível gerar o QR Code."}</p>
        {onRefresh ? (
          <button type="button" className="wa-rc__retry" onClick={onRefresh}>
            <IconRefresh size={18} aria-hidden /> Tentar de novo
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wa-rc__qr wa-rc__qr--loading" aria-busy="true">
      <span className="wa-rc__skeleton" aria-hidden />
      <p className="wa-rc__qrMsg">Gerando QR Code…</p>
    </div>
  );
}

function PhonePanel({ pairCode, pairError, pairLoading, onGerar, onVoltar }) {
  const [telefone, setTelefone] = useState("");

  if (pairCode) {
    return (
      <div className="wa-rc__phone">
        <p className="wa-rc__phoneLead">Digite este código no celular:</p>
        <p className="wa-rc__code">{formatPairCode(pairCode)}</p>
        <p className="wa-rc__phoneHint">
          WhatsApp → Dispositivos conectados → Conectar um dispositivo → Conectar com número
          de telefone.
        </p>
        <button type="button" className="wa-rc__link" onClick={onVoltar}>
          Voltar para o QR Code
        </button>
      </div>
    );
  }

  return (
    <form
      className="wa-rc__phone"
      onSubmit={(e) => {
        e.preventDefault();
        onGerar(telefone);
      }}
    >
      <label className="wa-rc__phoneLead" htmlFor="wa-rc-phone">
        Número do WhatsApp com DDI e DDD
      </label>
      <input
        id="wa-rc-phone"
        className="wa-rc__input"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="5534999998888"
        value={telefone}
        onChange={(e) => setTelefone(e.target.value)}
        disabled={pairLoading}
      />
      {pairError ? (
        <p className="wa-rc__phoneErr" role="alert">
          {pairError}
        </p>
      ) : null}
      <button type="submit" className="wa-rc__primary" disabled={pairLoading}>
        {pairLoading ? "Gerando…" : "Gerar código"}
      </button>
      <button type="button" className="wa-rc__link" onClick={onVoltar}>
        Voltar para o QR Code
      </button>
    </form>
  );
}

/**
 * Cartão de reconexão estilo WhatsApp Web, mostrado DENTRO do overlay de canal caído.
 *
 * O QR aparece sozinho: quem pode reconectar não precisa mais sair da tela, ir em
 * Configurações e pedir o código. Ao autenticar, `onConnected` revalida o status e o
 * overlay se apaga.
 */
export default function WhapiReconnectCard({ onConnected, onOpenSettings }) {
  const [modo, setModo] = useState("qr"); // 'qr' | 'telefone'
  const {
    instance,
    loadingInstances,
    listError,
    forbidden,
    connected,
    channelStatus,
    channelStatusCode,
    qrDataUri,
    qrError,
    qrLoading,
    retryIn,
    refreshQr,
    recarregarCanal,
    pairCode,
    pairError,
    pairLoading,
    gerarCodigoPorTelefone,
    limparCodigo,
  } = useWhapiReconnect({ enabled: true, onConnected });

  const canal = reconnectInstanceLabel(instance);
  // Sem canal não há QR: o erro da listagem (ou o 403 de quem não pode reconectar)
  // precisa aparecer NA MOLDURA, senão ela gira "Gerando QR Code…" para sempre.
  const erroCanal = forbidden
    ? "Seu usuário não pode reconectar este canal. Avise o supervisor."
    : listError;
  // Canal subindo/reconectando (INIT/LAUNCH): a Whapi recusa o QR nessa janela e
  // o canal costuma voltar sozinho — a tela espera em vez de acusar erro.
  const reconectando = !connected && isTransientChannelStatus(channelStatus, channelStatusCode);
  const estado = qrFrameState({
    connected,
    qrDataUri,
    qrError: qrError || erroCanal,
    loading: qrLoading || loadingInstances,
    retryIn,
    transient: reconectando && !erroCanal,
  });
  const mostrandoTelefone = modo === "telefone" && !connected && !erroCanal;

  return (
    <div className="wa-rc" role="document">
      <div className="wa-rc__alert">
        <span className="wa-rc__dot" aria-hidden />
        <span>
          <strong>WhatsApp desconectado.</strong> Nenhuma mensagem é enviada ou recebida até
          reconectar.
        </span>
      </div>

      <div className="wa-rc__body">
        <div className="wa-rc__side">
          <div className="wa-rc__brand">
            <IconBrandWhatsapp size={26} aria-hidden />
            <span>ZapERP · WhatsApp</span>
          </div>

          <h2 className="wa-rc__title">
            {connected ? "Tudo certo" : "Escaneie para reconectar"}
          </h2>

          {connected ? (
            <p className="wa-rc__lead">
              O canal {canal ? <strong>{canal}</strong> : "do WhatsApp"} autenticou. Voltando
              ao atendimento…
            </p>
          ) : erroCanal ? (
            <>
              <p className="wa-rc__lead">{erroCanal}</p>
              {forbidden ? null : (
                <button type="button" className="wa-rc__primary" onClick={recarregarCanal}>
                  Tentar de novo
                </button>
              )}
            </>
          ) : (
            <ol className="wa-rc__steps">
              {/* Lista fixa de 3 passos: o índice É a identidade do item. */}
              {PASSOS.map((passo, i) => (
                <li key={i}>
                  <span className="wa-rc__num" aria-hidden>
                    {i + 1}
                  </span>
                  <span>{passo}</span>
                </li>
              ))}
            </ol>
          )}

          {!connected && !erroCanal ? (
            <button
              type="button"
              className="wa-rc__link wa-rc__link--arrow"
              onClick={() => {
                limparCodigo();
                setModo(mostrandoTelefone ? "qr" : "telefone");
              }}
            >
              {mostrandoTelefone
                ? "Reconectar com QR Code"
                : "Entrar com número de telefone"}
            </button>
          ) : null}
        </div>

        <div className="wa-rc__main">
          {mostrandoTelefone ? (
            <PhonePanel
              pairCode={pairCode}
              pairError={pairError}
              pairLoading={pairLoading}
              onGerar={gerarCodigoPorTelefone}
              onVoltar={() => {
                limparCodigo();
                setModo("qr");
              }}
            />
          ) : (
            <>
              <QrFrame
                estado={estado}
                qrDataUri={qrDataUri}
                qrError={qrError || erroCanal}
                retryIn={retryIn}
                canal={canal}
                onRefresh={
                  forbidden ? null : erroCanal ? recarregarCanal : () => refreshQr()
                }
              />
              {!connected && estado === "qr" ? (
                <p className="wa-rc__renew">
                  O código se renova sozinho a cada 20 segundos.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="wa-rc__foot">
        <span className="wa-rc__channel">
          {canal ? `Canal: ${canal}` : "Canal WhatsApp da empresa"}
        </span>
        <div className="wa-rc__footActions">
          {!connected && !mostrandoTelefone && !erroCanal ? (
            <button
              type="button"
              className="wa-rc__ghost"
              onClick={() => refreshQr()}
              disabled={qrLoading || retryIn > 0}
            >
              <IconRefresh size={16} aria-hidden /> Novo QR
            </button>
          ) : null}
          <button type="button" className="wa-rc__ghost" onClick={onOpenSettings}>
            <IconSettings size={16} aria-hidden /> Configurações
          </button>
        </div>
      </div>
    </div>
  );
}
