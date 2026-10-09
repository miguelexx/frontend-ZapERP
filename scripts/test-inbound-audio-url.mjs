/**
 * Regressão: URL usada pelo player de áudio recebido e decisão de "play a frio".
 * Executar: node --import ./scripts/vite-env-shim.mjs scripts/test-inbound-audio-url.mjs
 */
import assert from "node:assert/strict";
import { getMediaUrl } from "../src/conversa/utils/conversaViewHelpers.js";
import { canPlayDirectlyFromStart, needsReloadBeforeResume } from "../src/conversa/utils/audioPlaybackRecovery.js";

// `url` (campo que o servidor atualiza) vence uma `url_absoluta` antiga.
assert.ok(getMediaUrl("/media/r2/media/1/a.ogg", "/uploads/a.ogg").endsWith("/media/r2/media/1/a.ogg"));
// Blob local do envio otimista continua na frente.
assert.equal(getMediaUrl("/uploads/a.ogg", "blob:http://x/1"), "blob:http://x/1");
// Sem `url`, usa `url_absoluta`; só `url`, usa `url`.
assert.ok(getMediaUrl("", "/uploads/a.ogg").endsWith("/uploads/a.ogg"));
assert.ok(getMediaUrl("/uploads/a.ogg").endsWith("/uploads/a.ogg"));
assert.equal(getMediaUrl("", ""), "");

// Play a frio: sem erro, sem metadados, no início → play() direto no gesto.
assert.equal(canPlayDirectlyFromStart({ hasError: false, readyState: 0, currentTime: 0 }), true);
assert.equal(canPlayDirectlyFromStart({ hasError: true, readyState: 0, currentTime: 0 }), false);
assert.equal(canPlayDirectlyFromStart({ hasError: false, readyState: 1, currentTime: 0 }), false);
assert.equal(canPlayDirectlyFromStart({ hasError: false, readyState: 0, currentTime: 12 }), false);
assert.equal(canPlayDirectlyFromStart({ hasError: false, readyState: 0, currentTime: 1e101 }), false);
// Os casos de recarga antes de retomar seguem iguais.
assert.equal(needsReloadBeforeResume({ hasError: true, readyState: 4, positionCovered: true, currentTime: 0 }), true);
assert.equal(needsReloadBeforeResume({ hasError: false, readyState: 1, positionCovered: false, currentTime: 9 }), true);
assert.equal(needsReloadBeforeResume({ hasError: false, readyState: 4, positionCovered: true, currentTime: 9 }), false);

console.log("OK — URL do áudio recebido e play a frio passaram.");
