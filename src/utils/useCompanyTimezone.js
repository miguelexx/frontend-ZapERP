// Hook de leitura do fuso da empresa (ver utils/companyTimezone).
//
// Existe para que componentes memoizados (lista de conversas, thread) repintem na hora em
// que o admin troca o estado da empresa em Configurações → Geral. Sem isso o horário já
// desenhado continuaria no fuso antigo até a tela ser remontada.

import { useSyncExternalStore } from "react";
import {
  getCompanyTimezone,
  getCompanyTimezoneVersion,
  subscribeCompanyTimezone,
} from "./companyTimezone";

/** Número que muda a cada troca de fuso. Use como prop/dependência de memo. */
export function useCompanyTimezoneVersion() {
  return useSyncExternalStore(
    subscribeCompanyTimezone,
    getCompanyTimezoneVersion,
    getCompanyTimezoneVersion
  );
}

/** Fuso IANA em vigor (ex.: "America/Cuiaba"). */
export function useCompanyTimezone() {
  return useSyncExternalStore(
    subscribeCompanyTimezone,
    getCompanyTimezone,
    getCompanyTimezone
  );
}
