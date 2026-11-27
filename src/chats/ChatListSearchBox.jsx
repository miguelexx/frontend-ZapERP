import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return [debounced, setDebounced];
}

/**
 * A mudança imediata filtra as linhas visíveis; o valor debounced dispara a API.
 *
 * Limpar (26/11/2026, C7): botão × com texto e Esc no campo. O Esc daqui NUNCA fecha a
 * conversa aberta — `useGlobalHotkeys` trata o Escape no `window` e desiste com
 * `defaultPrevented`; o React delega no root, por isso o `preventDefault` deste
 * `onKeyDown` chega antes. Com texto: limpa. Vazio: só tira o foco do campo (o Esc
 * seguinte, já fora do campo, volta a fechar a conversa como sempre).
 * Limpar avisa o pai na hora também pelo canal debounced: a lista volta às regras da
 * aba sem esperar os 350ms (o debounce chega depois com o mesmo "" — no-op no setState).
 * Limpar também zera o valor debounced DESTE campo (27/11/2026, R5-01): sem isso ele ficava
 * com o termo antigo e, redigitado o MESMO termo em menos de 350ms, o setState não mudava
 * nada — o pai seguia com "" e a busca no servidor nunca era refeita.
 */
export const ChatListSearchBox = memo(
  forwardRef(function ChatListSearchBox({ onChangeValue, onDebounced, clearNonce, className, placeholder }, ref) {
    const [value, setValue] = useState("");
    const [debounced, setDebounced] = useDebounce(value, 350);
    const inputRef = useRef(null);
    const onChangeValueRef = useRef(onChangeValue);
    const onDebouncedRef = useRef(onDebounced);
    onChangeValueRef.current = onChangeValue;
    onDebouncedRef.current = onDebounced;
    useEffect(() => {
      onDebouncedRef.current(debounced);
    }, [debounced]);

    useLayoutEffect(() => {
      setValue("");
      setDebounced("");
    }, [clearNonce, setDebounced]);

    const setRefs = useCallback(
      (node) => {
        inputRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    const clearValue = useCallback(() => {
      setValue("");
      setDebounced("");
      onChangeValueRef.current?.("");
      onDebouncedRef.current?.("");
    }, [setDebounced]);

    const handleKeyDown = useCallback(
      (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.value) clearValue();
        else e.currentTarget.blur();
      },
      [clearValue]
    );

    return (
      <>
        <input
          ref={setRefs}
          value={value}
          onChange={(e) => {
            const nextValue = e.target.value;
            setValue(nextValue);
            onChangeValueRef.current?.(nextValue);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Buscar conversas por nome ou telefone"
          className={className}
          autoComplete="off"
          enterKeyHint="search"
        />
        {value ? (
          <button
            type="button"
            className="chat-list-search-clear"
            aria-label="Limpar busca"
            title="Limpar busca (Esc)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clearValue();
              inputRef.current?.focus?.();
            }}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </>
    );
  })
);
