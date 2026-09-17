/**
 * Detecção e extração de arquivos em drag-and-drop.
 * Puro: sem React, DOM de overlay ou envio HTTP.
 */

export function dataTransferHasFiles(dataTransfer) {
  if (!dataTransfer) return false;
  const types = dataTransfer.types;
  if (!types) return false;
  if (typeof types.includes === "function") return types.includes("Files");
  if (typeof types.contains === "function") return types.contains("Files");
  try {
    return Array.from(types).includes("Files");
  } catch {
    return false;
  }
}

function fileIdentityKey(file) {
  return `${file.name}:${file.size}:${file.lastModified || 0}:${file.type || ""}`;
}

function isDirectoryEntry(item) {
  if (!item || typeof item.webkitGetAsEntry !== "function") return false;
  try {
    const entry = item.webkitGetAsEntry();
    return Boolean(entry && entry.isDirectory);
  } catch {
    return false;
  }
}

/**
 * Lista arquivos reais no drop. Ignora pastas e itens que não são file
 * (texto selecionado, URLs, HTML interno da thread).
 */
export function listFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return [];
  const seen = new Set();
  const out = [];

  const addFile = (file) => {
    if (!file || typeof file.name !== "string" || !file.name) return;
    const key = fileIdentityKey(file);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(file);
  };

  const items = dataTransfer.items;
  if (items && items.length) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || item.kind !== "file") continue;
      if (isDirectoryEntry(item)) continue;
      try {
        addFile(item.getAsFile());
      } catch {
        /* ignore */
      }
    }
    if (out.length) return out;
  }

  const files = dataTransfer.files;
  if (!files || !files.length) return [];
  for (let i = 0; i < files.length; i += 1) addFile(files[i]);
  return out;
}

/**
 * Alvos ainda “dentro” do host após um dragleave.
 * Evita fechar o overlay ao cruzar header, bolhas e composer.
 */
export function nextDragTargets(current, leftTarget, root) {
  const list = Array.isArray(current) ? current : [];
  if (!root || typeof root.contains !== "function") return [];
  return list.filter((node) => node !== leftTarget && root.contains(node));
}
