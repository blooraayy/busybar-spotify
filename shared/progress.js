/** @param {unknown} value */
export function playbackProgress(value) {
  const data = /** @type {{state?: unknown, position_ms?: unknown, duration_ms?: unknown}} */ (value || {});
  if ((data.state !== "playing" && data.state !== "paused") || typeof data.position_ms !== "number" ||
      typeof data.duration_ms !== "number" || !Number.isFinite(data.position_ms) || !Number.isFinite(data.duration_ms) ||
      data.duration_ms <= 0 || data.duration_ms > 604800000) return null;
  return {position: Math.max(0, Math.min(data.duration_ms, data.position_ms)), duration: data.duration_ms, playing: data.state === "playing"};
}

/** @param {{position: number, duration: number, playing: boolean}} progress @param {number} elapsed */
export function progressPixels(progress, elapsed) {
  return Math.min(54, Math.floor(54 * Math.min(progress.duration, progress.position + (progress.playing ? Math.max(0, elapsed) : 0)) / progress.duration));
}
