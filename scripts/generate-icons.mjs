import sharp from 'sharp';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#g)"/>
  <text x="64" y="78" text-anchor="middle" font-family="system-ui,sans-serif" font-size="52" font-weight="700" fill="white">P</text>
</svg>`;

for (const size of [16, 32, 48, 128]) {
  const out = join(publicDir, `icon-${size}.png`);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
}

console.log('Generated PNG icons in public/');
