import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file); else files.push(file);
  }
}
for (const dir of ['src', 'public']) walk(dir);
for (const name of ['package.json', 'package-lock.json', 'vite.config.js', 'tsconfig.json', 'index.html']) files.push(name);
const hashes = Object.fromEntries(files.sort().map((file) => [path.relative(root, path.resolve(file)).replaceAll('\\', '/'),
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const name = 'docs/audits/producao-2026-09-02-snapshot.json';
if (process.argv.includes('--check')) {
  const before = JSON.parse(fs.readFileSync(name, 'utf8'));
  const changed = [...new Set([...Object.keys(before.hashes), ...Object.keys(hashes)])].filter((key) => before.hashes[key] !== hashes[key]);
  console.log(JSON.stringify({ sourceFiles: files.length, changed }, null, 2));
} else {
  fs.writeFileSync(name, JSON.stringify({ at: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hashes }, null, 2));
  console.log(`Snapshot: ${files.length} arquivos de código/build, sem arquivos .env.`);
}
