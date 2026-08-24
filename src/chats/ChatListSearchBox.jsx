import { forwardRef, memo, useEffect, useLayoutEffect, useRef, useState } from "react";

function useDebounce(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * A mudança imediata filtra as linhas visíveis; o valor debounced dispara a API.
 */
export const ChatListSearchBox = memo(
  forwardRef(function ChatListSearchBox({ onChangeValue, onDebounced, clearNonce, className, placeholder }, ref) {
    const [value, setValue] = useState("");
    const debounced = useDebounce(value, 350);
    const onChangeValueRef = useRef(onChangeValue);
    const onDebouncedRef = useRef(onDebounced);
    onChangeValueRef.current = onChangeValue;
    onDebouncedRef.current = onDebounced;
    useEffect(() => {
      onDebouncedRef.current(debounced);
    }, [debounced]);

    useLayoutEffect(() => {
      setValue("");
    }, [clearNonce]);

    return (
      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          const nextValue = e.target.value;
          setValue(nextValue);
          onChangeValueRef.current?.(nextValue);
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
    );
  })
);
