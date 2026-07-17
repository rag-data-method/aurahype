// Gera og-image.png (1200x630) a partir do og-source.svg.
// Rodar quando quiser atualizar o preview no WhatsApp/Insta/Twitter.
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "..", "public");
const source = await readFile(resolve(publicDir, "og-source.svg"));
const out = resolve(publicDir, "og-image.png");
await sharp(source, { density: 192 }).resize(1200, 630).png({ quality: 95 }).toFile(out);
console.log(`OK ${out}`);
