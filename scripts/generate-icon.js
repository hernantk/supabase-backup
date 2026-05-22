/**
 * Generates resources/icon.png — a simple 256×256 PNG icon for electron-builder.
 * Uses only Node.js built-ins (zlib, fs). No external dependencies.
 */
const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

const W = 256, H = 256

// ── CRC-32 table ──────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

// ── Draw pixels (RGBA) ────────────────────────────────────────────────────────
const pixels = Buffer.alloc(W * H * 4)

const cx = W / 2, cy = H / 2
const outerR = W * 0.46
const ringW  = W * 0.10

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i    = (y * W + x) * 4
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)

    if (dist <= outerR && dist >= outerR - ringW) {
      // Outer ring — brand green #22c55e
      pixels[i] = 0x22; pixels[i+1] = 0xc5; pixels[i+2] = 0x5e; pixels[i+3] = 0xFF
    } else if (dist < outerR - ringW) {
      // Inner circle — dark green #16a34a
      pixels[i] = 0x16; pixels[i+1] = 0xa3; pixels[i+2] = 0x4a; pixels[i+3] = 0xFF
    } else {
      // Background — dark slate #1e293b
      pixels[i] = 0x1e; pixels[i+1] = 0x29; pixels[i+2] = 0x3b; pixels[i+3] = 0xFF
    }
  }
}

// ── Encode PNG (RGB, no alpha) ────────────────────────────────────────────────
const rowLen = 1 + W * 3  // filter byte + RGB per pixel
const raw    = Buffer.alloc(H * rowLen)
for (let y = 0; y < H; y++) {
  raw[y * rowLen] = 0  // filter: None
  for (let x = 0; x < W; x++) {
    const pi = (y * W + x) * 4
    const ri = y * rowLen + 1 + x * 3
    raw[ri]   = pixels[pi]
    raw[ri+1] = pixels[pi+1]
    raw[ri+2] = pixels[pi+2]
  }
}

const compressed = zlib.deflateSync(raw)

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8   // bit depth
ihdr[9] = 2   // colour type: RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG signature
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0)),
])

const outPath = path.join(__dirname, '..', 'resources', 'icon.png')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, png)
console.log(`icon.png written — ${png.length} bytes`)
