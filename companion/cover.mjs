// Quantize the Windows thumbnail on the PC; the device receives < 1 KiB of XPM2.
export function coverXpm(rgb) {
  if (typeof rgb !== 'string' || !/^[0-9a-f]{1536}$/i.test(rgb)) return '';
  const pixels = [];
  const histogram = new Map();
  for (let i = 0; i < rgb.length; i += 6) {
    const color = [0, 2, 4].map(offset => Math.round(parseInt(rgb.slice(i + offset, i + offset + 2), 16) / 17) * 17);
    const key = color.join(',');
    histogram.set(key, { color, count: (histogram.get(key)?.count || 0) + 1 });
    pixels.push(color);
  }
  // Reserve black for a subtle two-pixel corner radius against the screen.
  const palette = [[0, 0, 0], ...[...histogram.values()]
    .filter(entry => entry.color.some(channel => channel !== 0))
    .sort((a, b) => b.count - a.count).slice(0, 31).map(entry => entry.color)];
  const symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
  const rows = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const edgeX = Math.min(x, 15 - x);
      const edgeY = Math.min(y, 15 - y);
      if (edgeX + edgeY < 2) { row += symbols[0]; continue; }
      const pixel = pixels[y * 16 + x];
      let nearest = 0; let distance = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const d = palette[i].reduce((sum, value, channel) => sum + (value - pixel[channel]) ** 2, 0);
        if (d < distance) { nearest = i; distance = d; }
      }
      row += symbols[nearest];
    }
    rows.push(row);
  }
  return ['! XPM2', `16 16 ${palette.length} 1`, ...palette.map((color, i) => `${symbols[i]} c #${color.map(value => value.toString(16).padStart(2, '0')).join('')}`), ...rows].join('\n');
}
