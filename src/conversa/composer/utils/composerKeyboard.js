export function getComposerEnterIntent({
  key,
  shiftKey = false,
  composerEnterInsertsNewline = false,
}) {
  if (String(key || "") !== "Enter") return null;
  if (composerEnterInsertsNewline || shiftKey) return "newline";
  return "send";
}
