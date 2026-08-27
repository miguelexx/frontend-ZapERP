import { spawnSync } from "node:child_process";

const phase = process.argv[2] || "after";
const baseURL = process.argv[3] || "http://localhost:4173";
const result = spawnSync(
  process.execPath,
  [
    "./node_modules/@playwright/test/cli.js",
    "test",
    "e2e/ia-local-mock.spec.js",
    "--project=chromium-desktop",
    "--workers=1",
    "--grep",
    "evidencias visuais",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      IA_VISUAL_CAPTURE: "1",
      IA_VISUAL_PHASE: phase,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_SKIP_WEBSERVER: "1",
    },
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
