import { useCallback, useEffect, useRef, useState } from "react";
import { capitalizeMessageStart, getAutocorrectEdit } from "../../../utils/autocorrectText";
import {
  AUTO_CORRECT_CONTEXT_MATCH,
  AUTO_CORRECT_CONTEXT_WINDOW,
  buildAutoCorrectStorageKey,
} from "../utils/composerUtils";

export function useComposerAutocorrect({
  texto,
  setTexto,
  user,
  onUpdatePreference,
  syncTextareaHeight,
  savedRepliesOpen,
  closeSavedReplies,
  syncSlashContext,
}) {
  const [enabled, setEnabled] = useState(true);
  const [flash, setFlash] = useState(false);
  const flashTimeoutRef = useRef(null);
  const trackedRef = useRef([]);
  const ignoredRef = useRef([]);

  const normalizeWord = useCallback((value) => String(value || "").toLowerCase(), []);

  const getContext = useCallback((text, start, end) => {
    const value = String(text || "");
    const safeStart = Math.max(0, Number(start) || 0);
    const safeEnd = Math.max(safeStart, Number(end) || safeStart);
    return {
      before: value.slice(Math.max(0, safeStart - AUTO_CORRECT_CONTEXT_WINDOW), safeStart),
      after: value.slice(safeEnd, Math.min(value.length, safeEnd + AUTO_CORRECT_CONTEXT_WINDOW)),
    };
  }, []);

  const contextMatches = useCallback((candidate, tracked) => {
    const beforeSize = Math.min(AUTO_CORRECT_CONTEXT_MATCH, candidate.before.length, tracked.before.length);
    const afterSize = Math.min(AUTO_CORRECT_CONTEXT_MATCH, candidate.after.length, tracked.after.length);
    const beforeMatches =
      beforeSize === 0 || candidate.before.slice(-beforeSize) === tracked.before.slice(-beforeSize);
    const afterMatches =
      afterSize === 0 || candidate.after.slice(0, afterSize) === tracked.after.slice(0, afterSize);
    return beforeMatches && afterMatches;
  }, []);

  const resetTracking = useCallback(() => {
    trackedRef.current = [];
    ignoredRef.current = [];
  }, []);

  const hasWordWithContext = useCallback((text, wordLower, context) => {
    const value = String(text || "");
    if (!value || !wordLower) return false;
    const expression = /[A-Za-zÀ-ÖØ-öø-ÿ]+/g;
    let match;
    while ((match = expression.exec(value)) != null) {
      if (normalizeWord(match[0]) !== wordLower) continue;
      const foundContext = getContext(value, match.index, match.index + match[0].length);
      if (contextMatches(foundContext, context)) return true;
    }
    return false;
  }, [contextMatches, getContext, normalizeWord]);

  const runFlash = useCallback(() => {
    setFlash(true);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => {
      setFlash(false);
      flashTimeoutRef.current = null;
    }, 220);
  }, []);

  const updatePreference = useCallback((next) => {
    setEnabled(next);
    onUpdatePreference?.(next);
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(buildAutoCorrectStorageKey(user), next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [onUpdatePreference, user]);

  const applyFromEvent = useCallback((event, triggerChar) => {
    if (!enabled || event.nativeEvent?.isComposing || event.isComposing) return null;
    const input = event.currentTarget;
    if (!input || typeof input.selectionStart !== "number" || typeof input.selectionEnd !== "number") {
      return null;
    }
    const edit = getAutocorrectEdit({
      text: input.value,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      triggerChar,
    });
    if (!edit) return null;

    const originalWord = String(input.value || "").slice(edit.replaceStart, edit.replaceEnd);
    const originalLower = normalizeWord(originalWord);
    const candidateContext = getContext(input.value, edit.replaceStart, edit.replaceEnd);
    const shouldIgnore = ignoredRef.current.some(
      (item) => item?.originalLower === originalLower && contextMatches(candidateContext, item.context)
    );
    if (shouldIgnore) return null;

    event.preventDefault();
    let nextValue = "";
    if (typeof input.setRangeText === "function") {
      input.setRangeText(edit.replacement, edit.replaceStart, edit.replaceEnd, "end");
      nextValue = String(input.value || "");
      setTexto(nextValue);
      syncTextareaHeight();
    } else {
      const current = String(input.value || "");
      nextValue = `${current.slice(0, edit.replaceStart)}${edit.replacement}${current.slice(edit.replaceEnd)}`;
      const nextPosition = edit.replaceStart + edit.replacement.length;
      setTexto(nextValue);
      requestAnimationFrame(() => {
        try {
          input.setSelectionRange?.(nextPosition, nextPosition);
        } catch {
          /* ignore */
        }
      });
    }

    const correctedLower = normalizeWord(edit.correctedWord);
    const correctionContext = getContext(
      nextValue,
      edit.replaceStart,
      edit.replaceStart + String(edit.correctedWord || "").length
    );
    trackedRef.current.push({ originalLower, correctedLower, context: correctionContext });
    runFlash();
    return edit;
  }, [contextMatches, enabled, getContext, normalizeWord, runFlash, setTexto, syncTextareaHeight]);

  const handleInputChange = useCallback((event) => {
    const nextValue = capitalizeMessageStart(texto, event.target.value);
    if (trackedRef.current.length > 0) {
      const remaining = [];
      for (const item of trackedRef.current) {
        if (hasWordWithContext(nextValue, item.correctedLower, item.context)) {
          remaining.push(item);
          continue;
        }
        if (hasWordWithContext(nextValue, item.originalLower, item.context)) {
          ignoredRef.current.push({ originalLower: item.originalLower, context: item.context });
        }
      }
      trackedRef.current = remaining;
    }
    if (!nextValue) resetTracking();
    setTexto(nextValue);

    const cursor = typeof event.target.selectionStart === "number"
      ? event.target.selectionStart
      : nextValue.length;
    if (!syncSlashContext(nextValue, cursor) && savedRepliesOpen) closeSavedReplies();
  }, [
    closeSavedReplies,
    hasWordWithContext,
    resetTracking,
    savedRepliesOpen,
    setTexto,
    syncSlashContext,
    texto,
  ]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(buildAutoCorrectStorageKey(user));
      setEnabled(raw == null ? true : raw === "1");
    } catch {
      setEnabled(true);
    }
  }, [user?.id, user?.company_id, user?.empresa_id]);

  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);

  return {
    enabled,
    flash,
    resetTracking,
    updatePreference,
    applyFromEvent,
    handleInputChange,
  };
}
