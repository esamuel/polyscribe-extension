import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
// Brand master — the source of truth for every generated icon size.
// Replace assets/icon-master.png to rebrand; sizes regenerate on build.
const master = join(__dirname, '..', 'assets', 'icon-master.png');

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}
if (!existsSync(master)) {
  throw new Error(`Icon master not found at ${master}`);
}

for (const size of [16, 32, 48, 128]) {
  const out = join(publicDir, `icon-${size}.png`);
  await sharp(master)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(out);
}

console.log('Generated PNG icons in public/ from assets/icon-master.png');
