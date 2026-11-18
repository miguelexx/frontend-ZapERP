import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Publica a altura REAL do cabeçalho da conversa em `--wa-header-h` no `.wa-shell` (18/11/2026).
 *
 * Os painéis flutuantes (busca, tags, setor, histórico de atendimentos) ficavam com `top`
 * cravado em 60–66px, mas o cabeçalho tem duas linhas (título + linha de setor): 114px no
 * desktop, 88px no celular. O painel abria POR CIMA da linha "Setor · Definir setor" — 48px de
 * sobreposição medidos. O CSS agora usa `calc(var(--wa-header-h, <antigo>) + …)`; o fallback
 * mantém o comportamento anterior se a variável ainda não existir.
 *
 * Observa o elemento (ResizeObserver): o cabeçalho muda de altura com a linha de setor, os
 * selos e o modo compacto. Sem deps no layout effect de propósito: o shell só monta depois do
 * carregamento (retornos antecipados do ConversaView) e o elemento observado pode trocar.
 */
export function useHeaderHeightVar(shellRef, headerRef) {
  const observedRef = useRef({ header: null, shell: null, ro: null });

  useLayoutEffect(() => {
    const header = headerRef?.current ?? null;
    const shell = shellRef?.current ?? null;
    const cur = observedRef.current;
    if (cur.header === header && cur.shell === shell) return;
    cur.ro?.disconnect();
    cur.header = header;
    cur.shell = shell;
    cur.ro = null;
    if (!header || !shell) return;
    let last = -1;
    const publish = () => {
      const h = Math.round(header.offsetHeight || 0);
      if (h <= 0 || h === last) return;
      last = h;
      shell.style.setProperty("--wa-header-h", `${h}px`);
    };
    publish();
    if (typeof ResizeObserver !== "undefined") {
      cur.ro = new ResizeObserver(publish);
      cur.ro.observe(header);
    }
  });

  useEffect(
    () => () => {
      observedRef.current.ro?.disconnect();
      observedRef.current = { header: null, shell: null, ro: null };
    },
    []
  );
}
