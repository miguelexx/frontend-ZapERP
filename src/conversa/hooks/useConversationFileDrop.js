import { useCallback, useEffect, useRef, useState } from "react";
import {
  dataTransferHasFiles,
  listFilesFromDataTransfer,
  nextDragTargets,
} from "../utils/fileDrop";

function setCopyDropEffect(dataTransfer) {
  if (!dataTransfer) return;
  try {
    dataTransfer.dropEffect = "copy";
  } catch {
    /* ignore */
  }
}

/**
 * Drag-and-drop de arquivos na conversa.
 * Overlay é só visual (pointer-events: none); os eventos ficam no host (.wa-shell).
 * Não altera envio, FIFO, virtualização nem scroll.
 */
export function useConversationFileDrop({ enabled = true, onFiles } = {}) {
  const [dropActive, setDropActive] = useState(false);
  const targetsRef = useRef([]);
  const enabledRef = useRef(Boolean(enabled));
  const onFilesRef = useRef(onFiles);
  const dropActiveRef = useRef(false);
  enabledRef.current = Boolean(enabled);
  onFilesRef.current = onFiles;

  const setDropActiveSafe = useCallback((next) => {
    if (dropActiveRef.current === next) return;
    dropActiveRef.current = next;
    setDropActive(next);
  }, []);

  const resetSession = useCallback(() => {
    targetsRef.current = [];
    setDropActiveSafe(false);
  }, [setDropActiveSafe]);

  const onDragEnter = useCallback(
    (e) => {
      if (!enabledRef.current) return;
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      targetsRef.current = [...targetsRef.current, e.target];
      setDropActiveSafe(true);
      setCopyDropEffect(e.dataTransfer);
    },
    [setDropActiveSafe]
  );

  const onDragOver = useCallback(
    (e) => {
      if (!enabledRef.current) return;
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      setCopyDropEffect(e.dataTransfer);
      if (!dropActiveRef.current) setDropActiveSafe(true);
    },
    [setDropActiveSafe]
  );

  const onDragLeave = useCallback(
    (e) => {
      if (!dropActiveRef.current && targetsRef.current.length === 0) return;
      e.preventDefault();
      targetsRef.current = nextDragTargets(targetsRef.current, e.target, e.currentTarget);
      if (targetsRef.current.length === 0) setDropActiveSafe(false);
    },
    [setDropActiveSafe]
  );

  const onDrop = useCallback(
    (e) => {
      const hadFiles = dataTransferHasFiles(e.dataTransfer);
      e.preventDefault();
      e.stopPropagation();
      targetsRef.current = [];
      setDropActiveSafe(false);
      if (!enabledRef.current || !hadFiles) return;
      const files = listFilesFromDataTransfer(e.dataTransfer);
      if (!files.length) return;
      onFilesRef.current?.(files);
    },
    [setDropActiveSafe]
  );

  useEffect(() => {
    if (!enabled) resetSession();
  }, [enabled, resetSession]);

  useEffect(() => {
    const onWindowDragEnd = () => {
      resetSession();
    };
    const onWindowDragOver = (e) => {
      if (!dropActiveRef.current) return;
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      e.preventDefault();
    };
    const onWindowDrop = (e) => {
      if (!dropActiveRef.current) return;
      e.preventDefault();
      resetSession();
    };
    window.addEventListener("dragend", onWindowDragEnd);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragend", onWindowDragEnd);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
      resetSession();
    };
  }, [resetSession]);

  return {
    dropActive,
    fileDropHandlers: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
  };
}
