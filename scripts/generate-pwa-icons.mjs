/**
 * Gera ícones PWA a partir de public/brand/logo-base.png
 * Uso: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const brandDir = join(__dirname, "../public/brand")
const basePath = join(brandDir, "logo-base.png")

const outputs = [
  { file: "pwa-192.png", size: 192 },
  { file: "pwa-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
]

const white = { r: 255, g: 255, b: 255, alpha: 1 }

for (const { file, size } of outputs) {
  await sharp(basePath)
    .resize(size, size, { fit: "contain", background: white })
    .png()
    .toFile(join(brandDir, file))
  console.log("OK", file)
}
