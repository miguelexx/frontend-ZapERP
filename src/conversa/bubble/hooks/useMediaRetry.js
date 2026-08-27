import { useMemo } from "react";
import { getRetryUiState } from "../utils/bubbleRetry";

export function useMediaRetry(msg, classified, { onReenviarFalha, onReenviarAudio } = {}) {
  return useMemo(
    () => getRetryUiState(msg, classified, { onReenviarFalha, onReenviarAudio }),
    [
      msg,
      classified,
      onReenviarFalha,
      onReenviarAudio,
    ]
  );
}
