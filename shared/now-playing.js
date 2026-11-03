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

/** Bitmap fonts accept printable ASCII only. @param {string} text */
export function displayText(text) {
  const accents = "àáâãäåèéêëìíîïòóôõöùúûüñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÑÇ";
  const ascii =   "aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC";
  return text.slice(0, 120).replace(/[^ -~]/g, (char) => {
    const index = accents.indexOf(char);
    return index >= 0 ? ascii.charAt(index) : " ";
  }).trim();
}
