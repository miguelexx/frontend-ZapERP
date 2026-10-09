import { useSyncExternalStore } from "react";

/**
 * Estado reativo de conexão do navegador — ASSINATURA COMPARTILHADA.
 * O hook é usado por bolha na thread (shell): com listeners por instância seriam
 * 2×N listeners de window com churn a cada scroll da lista virtual. Aqui os dois
 * listeners globais existem uma única vez por aba (useSyncExternalStore).
 */

let onlineAtual = typeof navigator === "undefined" ? true : navigator.onLine !== false;
const assinantes = new Set();
let listenersLigados = false;

function emitir(valor) {
  if (onlineAtual === valor) return;
  onlineAtual = valor;
  for (const fn of assinantes) {
    try {
      fn();
    } catch {
      /* assinante não pode derrubar os demais */
    }
  }
}

function lerNavegador() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function ligarListeners() {
  if (listenersLigados || typeof window === "undefined") return;
  listenersLigados = true;
  window.addEventListener("online", () => emitir(true));
  window.addEventListener("offline", () => emitir(false));
  // Evento `online` perdido (aba congelada em segundo plano no celular) deixava o app "offline"
  // até o F5 — e o play dos áudios bloqueado. Reconfere ao voltar à aba.
  const reconferir = () => emitir(lerNavegador());
  window.addEventListener("pageshow", reconferir);
  window.addEventListener("focus", reconferir);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", reconferir);
}

ligarListeners();

function subscribe(fn) {
  ligarListeners();
  assinantes.add(fn);
  emitir(lerNavegador());
  return () => assinantes.delete(fn);
}

function getSnapshot() {
  return onlineAtual;
}

function getServerSnapshot() {
  return true;
}

export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
