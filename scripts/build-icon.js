/**
 * Builds the app icon: a squircle (continuous-corner tile) in Supabase green with a
 * "backup ring" around a database cylinder.
 *
 * Writes resources/icon.svg, resources/icon.png (1024), src/assets/app-icon.svg.
 * Run with Electron, which renders the SVG to PNG: `npm run icon`.
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

app.commandLine.appendSwitch('force-device-scale-factor', '1')

const SIZE = 1024
const C = SIZE / 2

/** Superellipse |x/a|^n + |y/a|^n = 1 — n≈5.5 matches Apple's continuous-corner tile closely. */
function squircle(a, n = 5.5, steps = 360) {
  const pts = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const x = C + a * Math.sign(cos) * Math.abs(cos) ** (2 / n)
    const y = C + a * Math.sign(sin) * Math.abs(sin) ** (2 / n)
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}

/** Point on the ring at an angle in degrees (0 = right, 90 = down). */
function onRing(r, deg) {
  const t = (deg * Math.PI) / 180
  return [C + r * Math.cos(t), C + r * Math.sin(t)]
}

function buildSvg() {
  const R = 282 // ring radius
  const W = 52 // ring stroke width
  const start = 150 // lower-left
  const end = -150 // upper-left; the arc runs counter-clockwise through the bottom, right and top

  const [sx, sy] = onRing(R, start)
  const [ex, ey] = onRing(R, end)

  // Arrowhead at the end of the arc, pointing along the (counter-clockwise) tangent.
  const t = (end * Math.PI) / 180
  const dir = [Math.sin(t), -Math.cos(t)]
  const normal = [Math.cos(t), Math.sin(t)]
  const tip = [ex + dir[0] * 100, ey + dir[1] * 100]
  const b1 = [ex + normal[0] * 80, ey + normal[1] * 80]
  const b2 = [ex - normal[0] * 80, ey - normal[1] * 80]

  const cx = C
  const rx = 128
  const ry = 44
  const top = 372
  const bottom = 646
  const tier1 = top + (bottom - top) / 3
  const tier2 = top + ((bottom - top) * 2) / 3

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#58e0a0"/>
      <stop offset="1" stop-color="#17925d"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e4fbef"/>
      <stop offset="0.45" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#d3f5e4"/>
    </linearGradient>
    <filter id="lift" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0b4d31" flood-opacity="0.32"/>
    </filter>
    <clipPath id="cyl"><path d="M${cx - rx},${top} V${bottom} A${rx},${ry} 0 0 0 ${cx + rx},${bottom} V${top} Z"/></clipPath>
    <clipPath id="clip"><path d="${squircle(486)}"/></clipPath>
  </defs>

  <path d="${squircle(486)}" fill="url(#tile)"/>
  <g clip-path="url(#clip)">
    <rect width="${SIZE}" height="${SIZE * 0.62}" fill="url(#gloss)"/>
    <path d="${squircle(484)}" fill="none" stroke="#ffffff" stroke-opacity="0.34" stroke-width="4"/>
  </g>

  <g filter="url(#lift)">
    <path d="M${sx.toFixed(1)},${sy.toFixed(1)} A${R},${R} 0 1 0 ${ex.toFixed(1)},${ey.toFixed(1)}"
          fill="none" stroke="#ffffff" stroke-width="${W}" stroke-linecap="round"/>
    <polygon points="${tip.map((v) => v.toFixed(1)).join(',')} ${b1.map((v) => v.toFixed(1)).join(',')} ${b2.map((v) => v.toFixed(1)).join(',')}"
             fill="#ffffff" stroke="#ffffff" stroke-width="14" stroke-linejoin="round"/>

    <path d="M${cx - rx},${top} V${bottom} A${rx},${ry} 0 0 0 ${cx + rx},${bottom} V${top} Z" fill="url(#body)"/>
    <ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="#ffffff"/>
    <ellipse cx="${cx}" cy="${top}" rx="${rx - 26}" ry="${ry - 12}" fill="#2cb673" fill-opacity="0.16"/>
    <path clip-path="url(#cyl)" d="M${cx - rx},${tier1} A${rx},${ry} 0 0 0 ${cx + rx},${tier1}" fill="none" stroke="#2cb673" stroke-opacity="0.5" stroke-width="12"/>
    <path clip-path="url(#cyl)" d="M${cx - rx},${tier2} A${rx},${ry} 0 0 0 ${cx + rx},${tier2}" fill="none" stroke="#2cb673" stroke-opacity="0.5" stroke-width="12"/>
  </g>
</svg>
`
}

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..')
  const svg = buildSvg()
  fs.mkdirSync(path.join(root, 'src', 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'resources', 'icon.svg'), svg)
  fs.writeFileSync(path.join(root, 'src', 'assets', 'app-icon.svg'), svg)

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  })
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 600))

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const png = image.toPNG()
  fs.writeFileSync(path.join(root, 'resources', 'icon.png'), png)

  const { width, height } = nativeImage.createFromBuffer(png).getSize()
  console.log(`icon.png written (${width}x${height}, ${png.length} bytes)`)
  app.quit()
})
