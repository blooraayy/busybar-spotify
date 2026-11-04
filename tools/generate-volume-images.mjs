import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { volumeFrame } from '../shared/volume-frame.js';

function chunk(type, data) {
  const name = Buffer.from(type), body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4), trailer = Buffer.alloc(4);
  header.writeUInt32BE(data.length); trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, trailer]);
}
const folder = new URL('../src/images/volume/', import.meta.url);
mkdirSync(folder, { recursive: true });
for (let value = 0; value <= 100; value++) {
  const lines = volumeFrame(value).split('\n');
  const palette = new Map(lines.slice(2, 21).map(line => [line[0], Buffer.from(line.slice(5), 'hex')]));
  const pixels = Buffer.alloc(16 * (1 + 72 * 3));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 72; x++)
    palette.get(lines[y + 21][x]).copy(pixels, y * 217 + 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(72); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 2;
  writeFileSync(new URL(`volume_${value}.png`, folder), Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
  // LVGL v9 RGB888: 12-byte little-endian header followed by BGR pixels.
  // Matches the converter used by BUSY Bar firmware 1.3.1 (scripts/image.py).
  const nativeHeader = Buffer.alloc(12);
  nativeHeader[0] = 0x19; nativeHeader[1] = 0x0f;
  nativeHeader.writeUInt16LE(72, 4); nativeHeader.writeUInt16LE(16, 6);
  nativeHeader.writeUInt16LE(72 * 3, 8);
  const nativePixels = Buffer.alloc(72 * 16 * 3);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 72; x++) {
    const rgb = palette.get(lines[y + 21][x]), offset = (y * 72 + x) * 3;
    nativePixels[offset] = rgb[2]; nativePixels[offset + 1] = rgb[1]; nativePixels[offset + 2] = rgb[0];
  }
  writeFileSync(new URL(`volume_${value}.image`, folder), Buffer.concat([nativeHeader, nativePixels]));
}
