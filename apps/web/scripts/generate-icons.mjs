// Gera os ícones PNG a partir do SVG. Rodado só quando você quer atualizar o visual.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "..", "public");

const source = await readFile(resolve(publicDir, "icon.svg"));
for (const size of [192, 512]) {
  const out = resolve(publicDir, `icon-${size}.png`);
  await sharp(source, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(`OK ${out}`);
}

const apple = resolve(publicDir, "apple-touch-icon.png");
await sharp(source, { density: 384 }).resize(180, 180).png().toFile(apple);
console.log(`OK ${apple}`);
