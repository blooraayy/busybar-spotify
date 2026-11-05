// Only the current timeline is retained. Normal clock ticks never notify clients.
export function createTimeline(now = Date.now) {
  let position = 0, duration = 0, at = now(), playing = false;
  function snapshot() {
    return {position_ms: Math.round(Math.min(duration, Math.max(0, position + (playing ? Math.max(0, now() - at) : 0)))), duration_ms: duration};
  }
  function update(data, state) {
    const before = snapshot();
    const active = state === 'playing' || state === 'paused';
    const valid = active && Number.isFinite(data?.position_ms) && Number.isFinite(data?.duration_ms) &&
      data.duration_ms > 0 && data.duration_ms <= 604800000;
    const nextDuration = valid ? Math.round(data.duration_ms) : 0;
    const stamp = Number.isFinite(data?.timeline_at) && data.timeline_at > 0 && data.timeline_at <= now() ? data.timeline_at : now();
    const nextPosition = valid ? Math.min(nextDuration, Math.max(0, data.position_ms + (state === 'playing' ? now() - stamp : 0))) : 0;
    const changed = nextDuration !== duration || Math.abs(nextPosition - before.position_ms) >= 1500;
    position = nextPosition; duration = nextDuration; at = now(); playing = state === 'playing' && valid;
    return changed;
  }
  function setState(state) {
    position = snapshot().position_ms; at = now(); playing = state === 'playing' && duration > 0;
    if (state !== 'playing' && state !== 'paused') { duration = 0; position = 0; }
  }
  return {snapshot, update, setState};
}
