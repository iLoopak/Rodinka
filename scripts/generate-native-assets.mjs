// Regenerates the source PNGs Capacitor's icon/splash tooling needs
// (`resources/*.png`), derived from the same path/color data as
// `public/icon.svg` (itself generated from `src/utils/familyMark.ts`) — not
// new artwork, just re-rendered at larger, raster sizes. Re-run this after
// `src/utils/familyMark.ts`'s geometry or colors change, then re-run
// `npx capacitor-assets generate` to refresh the actual platform assets.
//
// Usage: node scripts/generate-native-assets.mjs
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const BG = '#FFF8F2'

const MARK_PATHS = `
  <path d="M -7.452 0 A 7.452 12.195 0 0 1 7.452 0 L 7.452 1.22 A 6.707 10.976 0 0 1 0.745 12.195 L -0.745 12.195 A 6.707 10.976 0 0 1 -7.452 1.22 Z" transform="translate(13.7075 32) rotate(-14)" fill="#e9785e"/>
  <path d="M -8.13 0 A 8.13 18.293 0 0 1 8.13 0 L 8.13 1.829 A 7.317 16.463 0 0 1 0.813 18.293 L -0.813 18.293 A 7.317 16.463 0 0 1 -8.13 1.829 Z" transform="translate(32 32) rotate(0)" fill="#f2c85b"/>
  <path d="M -7.452 0 A 7.452 14.227 0 0 1 7.452 0 L 7.452 1.423 A 6.707 12.805 0 0 1 0.745 14.227 L -0.745 14.227 A 6.707 12.805 0 0 1 -7.452 1.423 Z" transform="translate(50.2925 32) rotate(12)" fill="#8bc6ad"/>
`.trim()

function markSvg({ size, scale, background, rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    ${background ? `<rect width="64" height="64" ${rounded ? 'rx="12"' : ''} fill="${background}"/>` : ''}
    ${scale > 0 ? `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${MARK_PATHS}</g>` : ''}
  </svg>`
}

async function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const resourcesDir = path.join(projectRoot, 'resources')
  await mkdir(resourcesDir, { recursive: true })

  const jobs = [
    // Combined legacy icon: background + mark at the same .78 scale
    // public/icon.svg already uses (safe margins for a plain square icon).
    { name: 'icon.png', size: 1024, svg: markSvg({ size: 1024, scale: 0.78, background: BG, rounded: true }) },
    // Adaptive Android icon: opaque background layer...
    { name: 'icon-background.png', size: 1024, svg: markSvg({ size: 1024, scale: 0, background: BG, rounded: false }) },
    // ...and transparent foreground, shrunk further so it survives the OS's
    // circular/squircle adaptive-icon mask crop (roughly the center 66%).
    { name: 'icon-foreground.png', size: 1024, svg: markSvg({ size: 1024, scale: 0.46, background: null, rounded: false }) },
    // Splash: brand canvas with the mark at a modest, centered size.
    { name: 'splash.png', size: 2732, svg: markSvg({ size: 2732, scale: 0.32, background: BG, rounded: false }) },
  ]

  for (const job of jobs) {
    const outPath = path.join(resourcesDir, job.name)
    await sharp(Buffer.from(job.svg)).resize(job.size, job.size).png().toFile(outPath)
    console.log('wrote', path.relative(projectRoot, outPath))
  }
}

main().catch((error) => {
  console.error('Asset generation failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
