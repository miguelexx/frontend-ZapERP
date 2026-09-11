/**
 * Testa prefetchThreadImages: aquecimento do cache das imagens da conversa ao abrir.
 * Roda em Node com stubs mínimos de DOM (Image/window/location/navigator/localStorage).
 * Registrado em test-node-suite.mjs com o vite-env-shim (helper importa getApiBaseUrl).
 */

const requested = [];

globalThis.window = globalThis;
globalThis.location = { hostname: "app.local", origin: "https://app.local", href: "https://app.local/" };
Object.defineProperty(globalThis, "navigator", {
  value: { connection: { saveData: false } },
  configurable: true,
  writable: true,
});
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
};
class FakeImage {
  set src(v) { requested.push(v); this._src = v; }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
}
globalThis.Image = FakeImage;

const { prefetchThreadImages, _resetPrefetchThreadMediaForTests } = await import(
  "../src/conversa/utils/prefetchThreadMedia.js"
);

let failures = 0;
function run(label, fn) {
  try {
    fn();
    console.log("PASS:", label);
  } catch (e) {
    failures += 1;
    console.error("FAIL:", label, "-", e.message);
  }
}
function reset() {
  _resetPrefetchThreadMediaForTests();
  requested.length = 0;
}

run("imagem /uploads é aquecida", () => {
  reset();
  prefetchThreadImages([{ tipo: "imagem", url: "/uploads/inbound-c1-m2-abc.jpg" }]);
  if (requested.length !== 1) throw new Error("esperava 1 request, veio " + requested.length);
  if (!requested[0].includes("/uploads/inbound-c1-m2-abc.jpg")) throw new Error("url inesperada: " + requested[0]);
});

run("tipos nao-imagem (texto/audio/video/arquivo) são ignorados", () => {
  reset();
  prefetchThreadImages([
    { tipo: "texto", texto: "oi" },
    { tipo: "audio", url: "/uploads/a.ogg" },
    { tipo: "video", url: "/uploads/v.mp4" },
    { tipo: "arquivo", url: "/uploads/x.pdf" },
  ]);
  if (requested.length !== 0) throw new Error("esperava 0, veio " + requested.length + " -> " + requested.join(","));
});

run("blob local (otimista) não é aquecido", () => {
  reset();
  prefetchThreadImages([{ tipo: "imagem", _optimisticBlobUrl: "blob:abc", url: "" }]);
  if (requested.some((u) => u.startsWith("blob:"))) throw new Error("não deveria aquecer blob");
});

run("dedup entre reaberturas da mesma conversa", () => {
  reset();
  const msgs = [{ tipo: "imagem", url: "/uploads/dedup.jpg" }];
  prefetchThreadImages(msgs);
  prefetchThreadImages(msgs);
  if (requested.length !== 1) throw new Error("esperava 1 (dedup), veio " + requested.length);
});

run("teto de 14 e prioriza as mais recentes", () => {
  reset();
  const msgs = Array.from({ length: 30 }, (_, i) => ({ tipo: "imagem", url: `/uploads/f${i}.jpg` }));
  prefetchThreadImages(msgs);
  if (requested.length !== 14) throw new Error("esperava 14, veio " + requested.length);
  if (!requested[0].includes("f29")) throw new Error("deveria começar pelas mais novas, veio " + requested[0]);
});

run("Save-Data desliga o prefetch", () => {
  reset();
  globalThis.navigator.connection.saveData = true;
  prefetchThreadImages([{ tipo: "imagem", url: "/uploads/nope.jpg" }]);
  globalThis.navigator.connection.saveData = false;
  if (requested.length !== 0) throw new Error("esperava 0 com Save-Data, veio " + requested.length);
});

run("figurinha (sticker) é aquecida", () => {
  reset();
  prefetchThreadImages([{ tipo: "sticker", url: "/uploads/s.webp" }]);
  if (requested.length !== 1) throw new Error("esperava 1, veio " + requested.length);
});

run("lista vazia / entrada inválida não quebra", () => {
  reset();
  prefetchThreadImages([]);
  prefetchThreadImages(null);
  prefetchThreadImages(undefined);
  if (requested.length !== 0) throw new Error("esperava 0, veio " + requested.length);
});

if (failures) {
  console.error(`FALHA — ${failures} caso(s) de prefetch de mídia.`);
  process.exitCode = 1;
} else {
  console.log("OK — prefetch de mídia da thread.");
}
