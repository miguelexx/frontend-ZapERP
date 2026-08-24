import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: fileURLToPath(new URL("../", import.meta.url)),
  server: { middlewareMode: true },
});

try {
  const { nameMatchesWordPrefix, chatRowMatchesSearch } = await vite.ssrLoadModule(
    "/src/chats/chatListFilters.js"
  );

  assert.equal(nameMatchesWordPrefix("Humberto", "hu"), true);
  assert.equal(nameMatchesWordPrefix("Carlos Humberto", "hu"), true);
  assert.equal(nameMatchesWordPrefix("José Humberto", "jose hum"), true);
  assert.equal(nameMatchesWordPrefix("Shuarts/Marcela", "mar"), true);
  assert.equal(nameMatchesWordPrefix("Shuart's", "hu"), false);
  assert.equal(nameMatchesWordPrefix("Jaó Churrascaria Sirley", "hu"), false);
  assert.equal(nameMatchesWordPrefix("LUCIO BICHUETTI", "hu"), false);

  const rows = [
    { contato_nome: "Shuart's" },
    { contato_nome: "Shuarts/Marcela" },
    { contato_nome: "Jaó Churrascaria Sirley" },
    { contato_nome: "Humberto" },
  ];
  assert.deepEqual(
    rows.filter((row) => chatRowMatchesSearch(row, "hu", "")).map((row) => row.contato_nome),
    ["Humberto"]
  );

  console.log("chat search prefix: ok");
} finally {
  await vite.close();
}
