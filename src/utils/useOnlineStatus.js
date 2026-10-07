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

function ligarListeners() {
  if (listenersLigados || typeof window === "undefined") return;
  listenersLigados = true;
  window.addEventListener("online", () => emitir(true));
  window.addEventListener("offline", () => emitir(false));
}

function subscribe(fn) {
  ligarListeners();
  assinantes.add(fn);
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
