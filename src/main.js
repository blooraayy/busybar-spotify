import { device } from "@shared/device";
import { loadValues } from "@shared/settings";
import { selectedBridgeUrl, hasBridgeNetworks, playbackLines, playbackCover } from "@shared/now-playing";
import { row, column, render } from "@busy-app/busy-lib";
import { sliderElements, VOLUME_IDS } from "./volume-display";
import { playbackProgress, progressPixels, PROGRESS_WIDTH } from "@shared/progress";
import { progressElements, PROGRESS_IDS } from "./progress-display";
import { scrollSync, SCROLL_RATE, SCROLL_START } from "./scroll-sync";
import manifest from "./appmeta/manifest.json";

const APP = manifest.id;
// Minimum spacing between PC volume commands; visual wheel feedback is immediate.
const VOLUME_UPDATE_MS = 100;

function main() {
  let stopped = false;
  let url = "";
  /** @type {Record<string, unknown> | null} */
  let settings = null;
  let routeGeneration = 0;
  let bridgeReady = false;
  const client = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let watchTimer = 0;
  let controlTimer = 0;
  let lastVolumeAt = -VOLUME_UPDATE_MS;
  let volumeTimer = 0;
  let displayRetry = 0;
  let progressTimer = 0, progressAt = 0, shownProgress = -1;
  let progressPending = false;
  /** @type {{position: number, duration: number, playing: boolean} | null} */
  let progress = null;
  let watching = false;
  let controlling = false;
  let displayBusy = false;
  let retryDelay = 2000;
  let lastWatchAt = -1;
  let pendingCommand = "";
  let pendingVolume = 0;
  let volumeStep = 5;
  let lastEtag = "";
  let lastTitle = "";
  let lastArtist = "";
  let lastCover = "";
  let lastTitleDelay = -1, lastArtistDelay = -1;
  let shownVolume = -1;
  let visualVolume = -1;
  let wheelRevision = 0;
  let hideVolume = false;
  let wifiConnected = false;
  let wifiCheckedAt = 0;
  /** @type {Promise<boolean> | null} */
  let wifiRequest = null;
  /** @type {{ title: string, artist: string, cover: string } | null} */
  let pendingTrack = null;
  /** @type {{ value: number } | null} */
  let pendingIndicator = null;
  /** @param {unknown} error */
  const report = (error) => console.error(`${APP}: ${error instanceof Error ? error.message : String(error)}`);

  async function online() {
    if (wifiConnected && Date.now() - wifiCheckedAt < 15000) return true;
    if (!wifiRequest) wifiRequest = device.WifiStatusGet().then(value => {
      wifiConnected = value.state === "connected";
      wifiCheckedAt = Date.now();
      if (hasBridgeNetworks(settings)) {
        const target = selectedBridgeUrl(settings);
        if (target !== url) {
          url = target; routeGeneration++;
          bridgeReady = false; lastEtag = ""; lastWatchAt = -1; retryDelay = 2000;
          pendingCommand = ""; pendingVolume = 0; visualVolume = -1; wheelRevision++;
          pendingIndicator = null; hideVolume = true;
          clearTimeout(controlTimer); controlTimer = 0; clearTimeout(volumeTimer);
          setProgress(null);
          queueTrack("Spotify", wifiConnected ? (url ? "Connecting" : "Set bridge") : "No Wi-Fi");
        }
      }
      return wifiConnected;
    }).finally(() => { wifiRequest = null; });
    return wifiRequest;
  }

  /** @param {string} title @param {string} artist @param {string} cover */
  function queueTrack(title, artist, cover = "") {
    if (stopped) return;
    pendingTrack = { title, artist, cover };
    kickDisplay();
  }
  function kickDisplay() {
    if (!stopped && !displayBusy && !displayRetry) void flushDisplay().catch(report);
  }
  async function flushDisplay() {
    if (stopped || displayBusy) return;
    displayBusy = true;
    try {
      // Coalesce to the latest metadata/volume; never queue complete frames.
      // Track changes are invisible behind the full-screen indicator; defer them.
      while (!stopped && (pendingIndicator || hideVolume || ((pendingTrack || progressPending) && shownVolume < 0))) {
        if (pendingIndicator) {
          const indicator = pendingIndicator;
          pendingIndicator = null;
          await showVolume(indicator.value);
        } else if (hideVolume) {
          await clearVolume();
        } else if (pendingTrack) {
          const track = pendingTrack;
          pendingTrack = null;
          try { await draw(track.title, track.artist, track.cover); }
          catch (error) { if (!pendingTrack) pendingTrack = track; throw error; }
        } else if (progressPending) {
          await drawProgress();
        }
      }
    } catch (error) {
      report(`display: ${error instanceof Error ? error.message : String(error)}`);
      if (!stopped && (pendingTrack || hideVolume || progressPending)) displayRetry = setTimeout(() => {
        displayRetry = 0;
        kickDisplay();
      }, 10000);
    } finally {
      displayBusy = false;
      scheduleVolume();
      scheduleProgress();
    }
  }
  /** @param {unknown} data */
  function setProgress(data) {
    clearTimeout(progressTimer); progressTimer = 0;
    progress = playbackProgress(data); progressAt = Date.now();
    progressPending = true;
    kickDisplay();
  }
  async function drawProgress() {
    progressPending = false;
    const pixels = progress ? progressPixels(progress, Date.now() - progressAt) : -1;
    if (pixels === shownProgress) return;
    try {
      if (pixels < 0) {
        if (shownProgress >= 0) await device.DisplayClear({application_name: APP, element_ids: PROGRESS_IDS});
      } else await device.DisplayDraw({application_name: APP, priority: 50, elements: progressElements(pixels, shownProgress < 0)});
      shownProgress = pixels;
    } catch (error) { progressPending = true; throw error; }
  }
  function scheduleProgress() {
    clearTimeout(progressTimer); progressTimer = 0;
    if (stopped || !progress || !progress.playing || shownVolume >= 0 || pendingIndicator || displayRetry) return;
    const elapsed = Math.max(0, Date.now() - progressAt);
    const pixels = progressPixels(progress, elapsed);
    if (pixels >= PROGRESS_WIDTH) return;
    const delay = Math.max(1000, Math.ceil((pixels + 1) * progress.duration / PROGRESS_WIDTH - progress.position - elapsed));
    progressTimer = setTimeout(() => { progressTimer = 0; progressPending = true; kickDisplay(); }, delay);
  }
  async function clearVolume() {
    clearTimeout(volumeTimer);
    clearTimeout(progressTimer); progressTimer = 0;
    if (shownVolume >= 0 && !stopped) await device.DisplayClear({ application_name: APP, element_ids: VOLUME_IDS });
    shownVolume = -1;
    hideVolume = false;
    if (progress) progressPending = true;
  }
  /** @param {number} value */
  async function showVolume(value) {
    if (stopped) return;
    clearTimeout(volumeTimer);
    clearTimeout(progressTimer); progressTimer = 0;
    hideVolume = false;
    if (value !== shownVolume) {
      await device.DisplayDraw({ application_name: APP, priority: 50, elements: sliderElements(value, shownVolume) });
      shownVolume = value;
    }
    if (!stopped) volumeTimer = setTimeout(() => { hideVolume = true; kickDisplay(); }, 1500);
  }

  /** @param {string} title @param {string} artist @param {string} cover */
  async function draw(title, artist, cover = "") {
    if (stopped || (title === lastTitle && artist === lastArtist && cover === lastCover)) return;
    if (!cover && lastCover) {
      await device.DisplayClear({ application_name: APP, element_ids: ["cover"] });
      lastCover = "";
      if (stopped) return;
    }
    const sync = scrollSync(title, artist);
    // LVGL keeps an existing label's animation phase when its text is updated.
    // Recreate just this pair on metadata changes to give both the same start.
    if (sync.both && (title !== lastTitle || artist !== lastArtist) && (lastTitle || lastArtist)) {
      await device.DisplayClear({ application_name: APP, element_ids: ["title", "status"] });
      lastTitle = ""; lastArtist = "";
      if (stopped) return;
    }
    const text = column({ width: 54, align: "start" }, [
      { type: "text", id: "title", text: title, font: "small", color: "#FFFFFFFF", width: 54, scroll_rate: SCROLL_RATE, scroll_start_delay: SCROLL_START, scroll_repeat_delay: sync.titleDelay },
      { type: "text", id: "status", text: artist, font: "tiny", color: "#FFFFFFB0", width: 54, scroll_rate: SCROLL_RATE, scroll_start_delay: SCROLL_START, scroll_repeat_delay: sync.artistDelay },
    ]);
    const elements = render(row({ gap: 2, align: "start" }, cover ? [
      { type: "xpmbitmap", id: "cover", data: cover, width: 16, height: 16 }, text,
    ] : [text]));
    // Measured native ink, including g/j/p/q/y: small = rows 2..8, tiny = 1..5.
    // Place title ink at 1..7 and artist ink at 9..13; rows 8 and 14 stay blank.
    // The cover stays fixed; the one-pixel progress indicator occupies row 15.
    for (const element of elements) {
      element.x = element.id === "cover" ? 0 : 18;
      element.y = element.id === "title" ? -1 : 8;
      if (element.id === "cover") element.y = 0;
    }
    const changed = elements.filter((element) => element.id === "cover" ? cover !== lastCover : element.id === "title"
      ? title !== lastTitle || sync.titleDelay !== lastTitleDelay : artist !== lastArtist || sync.artistDelay !== lastArtistDelay);
    if (changed.length) await device.DisplayDraw({ application_name: APP, priority: 50, elements: changed });
    lastTitle = title;
    lastArtist = artist;
    lastCover = cover;
    lastTitleDelay = sync.titleDelay; lastArtistDelay = sync.artistDelay;
  }


  async function watch() {
    if (stopped || watching) return;
    watching = true;
    let nextDelay = 100;
    try {
      if (!await online()) {
        setProgress(null);
        lastEtag = "";
        nextDelay = 30000;
        queueTrack("Spotify", "No Wi-Fi");
        return;
      }
      if (stopped) return;
      if (!url) {
        bridgeReady = false; setProgress(null); lastEtag = "";
        nextDelay = 15000;
        queueTrack("Spotify", "Set bridge");
        return;
      }
      const headers = { "X-Busybar-Client": client, "X-Busybar-Wait": "1", "If-None-Match": lastEtag };
      const response = await fetch(url, { headers });
      if (stopped) return;
      // Older bridges fall back to a slow poll rather than spinning on 304.
      if (response.headers?.get("X-Busybar-Events") !== "1") nextDelay = 2000;
      if (response.status === 204) return;
      if (response.status !== 304) {
        if (!response.ok) throw new Error("PC bridge unavailable");
        const data = await response.json();
        if (stopped) return;
        const [title, artist] = playbackLines(data);
        queueTrack(title, artist, playbackCover(data));
        setProgress(data);
        lastEtag = response.headers?.get("ETag") || "";
      }
      bridgeReady = true;
      lastWatchAt = Date.now();
      retryDelay = 2000;
    } catch (error) {
      if (stopped) return;
      report(`watch: ${error instanceof Error ? error.message : String(error)}`);
      // Recheck Wi-Fi without treating a bridge timeout as a disconnected radio.
      wifiCheckedAt = Date.now() - 15000;
      // Retain upstream's safety gate: do not send or replay controls until the
      // manually selected bridge answers again, even while its track stays visible.
      bridgeReady = false;
      pendingCommand = "";
      pendingVolume = 0;
      visualVolume = -1;
      wheelRevision++;
      pendingIndicator = null;
      hideVolume = true;
      kickDisplay();

      lastEtag = "";
      if (lastWatchAt < 0 || Date.now() - lastWatchAt >= 15000) {
        setProgress(null);
        queueTrack("Spotify", "PC offline");
      } else if (progress) {
        progress.position = Math.min(progress.duration, progress.position + (progress.playing ? Math.max(0, Date.now() - progressAt) : 0));
        progress.playing = false;
        clearTimeout(progressTimer); progressTimer = 0;
      }
      nextDelay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, 30000);
    } finally {
      watching = false;
      if (!stopped) watchTimer = setTimeout(() => { void watch().catch(report); }, nextDelay);
    }
  }

  function scheduleVolume() {
    if (stopped || controlling || controlTimer || !pendingVolume) return;
    const delay = Math.max(0, Math.min(VOLUME_UPDATE_MS, VOLUME_UPDATE_MS - (Date.now() - lastVolumeAt)));
    controlTimer = setTimeout(() => { controlTimer = 0; void controls().catch(report); }, delay);
  }

  async function controls() {
    if (stopped || controlling || !url) return;
    if (!wifiConnected || !bridgeReady) { pendingCommand = ""; pendingVolume = 0; return; }
    const command = pendingCommand || (pendingVolume ? `volume?steps=${pendingVolume}&step_percent=${volumeStep}` : "");
    if (!command) return;
    const sentRevision = wheelRevision;
    const controlUrl = url;
    const controlGeneration = routeGeneration;
    if (pendingCommand) pendingCommand = ""; else { pendingVolume = 0; lastVolumeAt = Date.now(); }
    controlling = true;
    try {
      const response = await fetch(controlUrl.replace(/\/now-playing$/, `/playback/${command}`), {
        method: "POST", headers: { "X-Busybar-Control": "1" },
      });
      if (stopped) return;
      if (url !== controlUrl || controlGeneration !== routeGeneration || !bridgeReady) return;
      if (!response.ok) throw new Error("Spotify control failed");
      if (command.indexOf("volume?steps=") === 0) {
        const result = await response.json();
        if (stopped || controlGeneration !== routeGeneration || !bridgeReady) return;
        if (!Number.isInteger(result.volume) || result.volume < 0 || result.volume > 100) throw new Error("Invalid volume response");
        // A reply for an older turn must never rewind immediate wheel feedback.
        if (sentRevision === wheelRevision) {
          visualVolume = result.volume;
          if (command.indexOf("steps=0&") < 0) {
            pendingIndicator = { value: result.volume };
            kickDisplay();
          }
        } else if (visualVolume < 0) {
          visualVolume = Math.max(0, Math.min(100, result.volume + pendingVolume * volumeStep));
          pendingIndicator = { value: visualVolume };
          kickDisplay();
        }
      }
    } catch (error) {
      if (!stopped && controlGeneration === routeGeneration) {
        report(`control: ${error instanceof Error ? error.message : String(error)}`); pendingVolume = 0; visualVolume = -1;
        pendingIndicator = null; hideVolume = true; kickDisplay();
      }
    } finally {
      controlling = false;
      scheduleVolume();
    }
  }

  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "encoder") {
      if (!url || !bridgeReady || (event.delta !== 1 && event.delta !== -1)) return;
      const direction = event.action === "clockwise" ? 1 : event.action === "counterclockwise" ? -1 : event.delta;
      const nextVolume = Math.max(-10, Math.min(10, pendingVolume + direction));
      const accepted = nextVolume - pendingVolume;
      pendingVolume = nextVolume;
      wheelRevision++;
      if (visualVolume >= 0) {
        visualVolume = Math.max(0, Math.min(100, visualVolume + accepted * volumeStep));
        pendingIndicator = { value: visualVolume };
        kickDisplay();
      }
      scheduleVolume();
      return;
    }
    if (event.action !== "short") return;
    if (event.key === "start" || event.key === "ok") {
      if (!url || !bridgeReady || pendingCommand || controlling) return;
      pendingCommand = event.key === "ok" ? "next" : "toggle";
      clearTimeout(controlTimer); controlTimer = 0;
      void controls().catch(report);
      return;
    }
    if (event.key !== "back") return;
    stopped = true;
    pendingCommand = ""; pendingVolume = 0; pendingTrack = null; pendingIndicator = null;
    clearTimeout(watchTimer); clearTimeout(controlTimer); clearTimeout(volumeTimer); clearTimeout(displayRetry); clearTimeout(progressTimer);
    if (watching && url) void fetch(url.replace(/\/now-playing$/, "/playback/cancel-wait"), {
      method: "POST", headers: { "X-Busybar-Control": "1", "X-Busybar-Client": client },
    }).catch(report);
    // Pending requests settle; the last input handle is released after this callback.
    setTimeout(unbind, 0);
  });
  async function start() {
    const values = await loadValues();
    if (stopped) return;
    settings = values;
    url = selectedBridgeUrl(values);
    const step = values?.volume_step;
    if (typeof step === "number" && Number.isInteger(step) && step >= 1 && step <= 100) volumeStep = step;
    if (!url && !hasBridgeNetworks(values)) { queueTrack("Spotify", "Set PC URL"); return; }
    await watch();
    if (!stopped && wifiConnected && !controlling && !pendingVolume && visualVolume < 0) {
      // Read the initial Spotify level without changing it or showing the popup.
      pendingCommand = `volume?steps=0&step_percent=${volumeStep}`;
      await controls();
    }
  }
  void start().catch(report);
}
main();
