/** @param {Record<string, unknown> | null | undefined} values */
export function selectedBridgeUrl(values) {
  const selection = values?.bridge_selection ?? "1";
  const key = selection === "1" ? "bridge_url" : selection === "2" ? "bridge_url_2" : selection === "3" ? "bridge_url_3" : "";
  return key ? bridgeUrl(values?.[key]) : "";
}

/** @param {unknown} value */
export function bridgeUrl(value) {
  if (typeof value !== "string" || value.length > 200) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash) return "";
    if (url.pathname !== "/now-playing") return "";
    return url.href;
  } catch { return ""; }
}

/** @param {unknown} value @returns {[string, string]} */
export function playbackLines(value) {
  const data = /** @type {{ state?: unknown, title?: unknown, artist?: unknown }} */ (value || {});
  if (data.state === "error") return ["Spotify", "PC error"];
  if (data.state === "idle") return ["Spotify", "No music"];
  if (data.state !== "playing" && data.state !== "paused") throw new Error("Invalid bridge state");
  const clean = (/** @type {unknown} */ text) => typeof text === "string" ? displayText(text) : "";
  return [clean(data.title) || "Spotify", data.state === "paused" ? "Paused" : clean(data.artist) || "Playing"];
}

/** Accept only the bridge's small 16x16 XPM2 payload. @param {unknown} value */
export function playbackCover(value) {
  const data = /** @type {{ state?: unknown, cover?: unknown }} */ (value || {});
  if (data.state !== "playing" && data.state !== "paused") return "";
  if (typeof data.cover !== "string" || data.cover.length > 900) return "";
  const lines = data.cover.split("\n");
  if (lines[0] !== "! XPM2") return "";
  const header = /^16 16 ([1-9]|[12][0-9]|3[0-2]) 1$/.exec(lines[1] || "");
  if (!header) return "";
  const count = Number(header[1]);
  if (lines.length !== 2 + count + 16) return "";
  let symbols = "";
  for (let i = 0; i < count; i++) {
    const color = /^([A-Za-z]) c #[0-9a-f]{6}$/i.exec(lines[2 + i]);
    if (!color || symbols.indexOf(color[1]) !== -1) return "";
    symbols += color[1];
  }
  for (let i = 2 + count; i < lines.length; i++) {
    if (lines[i].length !== 16) return "";
    for (let x = 0; x < 16; x++) if (symbols.indexOf(lines[i].charAt(x)) === -1) return "";
  }
  return data.cover;
}

/** Bitmap fonts accept printable ASCII only. @param {string} text */
export function displayText(text) {
  const accents = "àáâãäåèéêëìíîïòóôõöùúûüñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÑÇ";
  const ascii =   "aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC";
  return text.slice(0, 120).replace(/[^ -~]/g, (char) => {
    const index = accents.indexOf(char);
    return index >= 0 ? ascii.charAt(index) : " ";
  }).trim();
}
