/**
 * Helpers de drag-and-drop de arquivos na conversa.
 * Executar: node scripts/test-file-drop.mjs
 */
import assert from "node:assert/strict";
import {
  dataTransferHasFiles,
  listFilesFromDataTransfer,
  nextDragTargets,
} from "../src/conversa/utils/fileDrop.js";

function makeFile(name, extras = {}) {
  return { name, size: extras.size ?? 10, lastModified: extras.lastModified ?? 1, type: extras.type ?? "" };
}

assert.equal(dataTransferHasFiles(null), false);
assert.equal(dataTransferHasFiles({}), false);
assert.equal(dataTransferHasFiles({ types: ["text/plain"] }), false);
assert.equal(dataTransferHasFiles({ types: ["Files"] }), true);
assert.equal(dataTransferHasFiles({ types: ["text/html", "Files"] }), true);
assert.equal(
  dataTransferHasFiles({
    types: { contains: (t) => t === "Files" },
  }),
  true
);

const png = makeFile("foto.png", { type: "image/png", size: 1200 });
const pdf = makeFile("doc.pdf", { type: "application/pdf", size: 400 });
assert.deepEqual(
  listFilesFromDataTransfer({ files: [png, pdf] }).map((f) => f.name),
  ["foto.png", "doc.pdf"]
);
assert.deepEqual(listFilesFromDataTransfer({ items: [] }), []);
assert.deepEqual(
  listFilesFromDataTransfer({
    items: [
      { kind: "string", getAsFile: () => png },
      {
        kind: "file",
        getAsFile: () => png,
        webkitGetAsEntry: () => ({ isDirectory: false }),
      },
      {
        kind: "file",
        getAsFile: () => makeFile("pasta"),
        webkitGetAsEntry: () => ({ isDirectory: true }),
      },
    ],
  }).map((f) => f.name),
  ["foto.png"]
);
assert.deepEqual(
  listFilesFromDataTransfer({
    items: [
      {
        kind: "file",
        getAsFile: () => null,
        webkitGetAsEntry: () => ({ isDirectory: false }),
      },
    ],
    files: [png],
  }).map((f) => f.name),
  ["foto.png"]
);

const root = { id: "shell" };
const header = { id: "header" };
const bubble = { id: "bubble" };
const detached = { id: "outside" };
root.contains = (node) => node === root || node === header || node === bubble;

assert.deepEqual(nextDragTargets([root, header], root, root), [header]);
assert.deepEqual(nextDragTargets([header], header, root), []);
assert.deepEqual(nextDragTargets([header, detached], header, root), []);
assert.deepEqual(nextDragTargets([header, bubble], detached, root), [header, bubble]);
assert.deepEqual(nextDragTargets(null, header, root), []);

console.log("ok file-drop helpers");
