import { spawnSync } from "node:child_process";

const WITH_VITE_ENV_SHIM = new Set([
  "test-audio-playback-candidates.mjs",
  "test-audio-playback-recovery.mjs",
  "test-audio-recording-lifecycle.mjs",
  "test-chat-media-display.mjs",
  "test-contact-conversation-routing.mjs",
  "test-lock-card-avatar.mjs",
  "test-mic-stream-service.mjs",
]);

const tests = [
  "test-atendimento-actions-scroll.mjs",
  "test-audio-merge.mjs",
  "test-audio-playback-candidates.mjs",
  "test-audio-playback-recovery.mjs",
  "test-audio-recording-lifecycle.mjs",
  "test-audio-stress.mjs",
  "test-chat-media-display.mjs",
  "test-chat-search-prefix.mjs",
  "test-contact-conversation-routing.mjs",
  "test-conversation-boundary.mjs",
  "test-conversa-composer.mjs",
  "test-deploy-recovery-and-finalization.mjs",
  "test-inbound-media-sequence.mjs",
  "test-lock-card-avatar.mjs",
  "test-manual-retry-ui.mjs",
  "test-media-merge.mjs",
  "test-media-refresh-dedupe.mjs",
  "test-mic-stream-service.mjs",
  "test-offline-outbox.mjs",
  "test-pending-timeout-watchdog.mjs",
  "test-realtime-message-order.mjs",
  "test-sequential-messages.mjs",
  "test-specialty-outbound-accept.mjs",
  "test-status-mensagem-batch.mjs",
];

const failures = [];

for (const testFile of tests) {
  const args = WITH_VITE_ENV_SHIM.has(testFile)
    ? ["--import", "./scripts/vite-env-shim.mjs", `./scripts/${testFile}`]
    : [`./scripts/${testFile}`];
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) failures.push(testFile);
}

if (failures.length) {
  console.error(`FALHA — ${failures.length}/${tests.length} scripts: ${failures.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`OK — ${tests.length}/${tests.length} scripts Node passaram.`);
}
