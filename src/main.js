import { device } from "@shared/device";
import { loadValues } from "@shared/settings";
import { selectedBridgeUrl, playbackLines, playbackCover } from "@shared/now-playing";
import { row, column, render } from "@busy-app/busy-lib";
import { sliderElements, VOLUME_IDS } from "./volume-display";
import manifest from "./appmeta/manifest.json";

const APP = manifest.id;
// Minimum spacing between PC volume commands; visual wheel feedback is immediate.
const VOLUME_UPDATE_MS = 100;

function main() {
  let stopped = false;
  let url = "";
  let bridgeReady = false;
  const client = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let watchTimer = 0;
  let controlTimer = 0;
  let lastVolumeAt = -VOLUME_UPDATE_MS;
  let volumeTimer = 0;
  let displayRetry = 0;
  let watching = false;
  let controlling = false;
  let displayBusy = false;
  let retryDelay = 10000;
  let pendingCommand = "";
  let pendingVolume = 0;
  let volumeStep = 5;
  let lastEtag = "";
  let lastTitle = "";
  let lastArtist = "";
  let lastCover = "";
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
      while (!stopped && (pendingIndicator || hideVolume || (pendingTrack && shownVolume < 0))) {
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
        }
      }
    } catch (error) {
      report(error);
      if (!stopped && (pendingTrack || hideVolume)) displayRetry = setTimeout(() => {
        displayRetry = 0;
        kickDisplay();
      }, 10000);
    } finally {
      displayBusy = false;
      scheduleVolume();
    }
  }
  async function clearVolume() {
    clearTimeout(volumeTimer);
    if (shownVolume >= 0 && !stopped) await device.DisplayClear({ application_name: APP, element_ids: VOLUME_IDS });
    shownVolume = -1;
    hideVolume = false;
  }
  /** @param {number} value */
  async function showVolume(value) {
    if (stopped) return;
    clearTimeout(volumeTimer);
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
    const text = column({ width: 54, align: "start" }, [
      { type: "text", id: "title", text: title, font: "bold", color: "#FFFFFFFF", width: 54, scroll_rate: 1200, scroll_start_delay: 1500, scroll_repeat_delay: 2500 },
      { type: "text", id: "status", text: artist, font: "small", color: "#FFFFFF80", width: 54, scroll_rate: 1200, scroll_start_delay: 1500, scroll_repeat_delay: 2500 },
    ]);
    const elements = render(row({ gap: 2, align: "start" }, cover ? [
      { type: "xpmbitmap", id: "cover", data: cover, width: 16, height: 16 }, text,
    ] : [text]));
    // Fixed baselines keep an unchanged row in place when the other row changes.
    for (const element of elements) {
      element.x = element.id === "cover" ? 0 : 18;
      element.y = element.id === "title" ? 0 : 9;
      if (element.id === "cover") element.y = 0;
    }
    const changed = elements.filter((element) => element.id === "cover" ? cover !== lastCover : element.id === "title" ? title !== lastTitle : artist !== lastArtist);
    if (changed.length) await device.DisplayDraw({ application_name: APP, priority: 50, elements: changed });
    lastTitle = title;
    lastArtist = artist;
    lastCover = cover;
  }


  async function watch() {
    if (stopped || watching) return;
    watching = true;
    let nextDelay = 100;
    try {
      if (!await online()) {
        lastEtag = "";
        nextDelay = 30000;
        queueTrack("Spotify", "No Wi-Fi");
        return;
      }
      if (stopped) return;
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
        lastEtag = response.headers?.get("ETag") || "";
      }
      bridgeReady = true;
      retryDelay = 10000;
    } catch (error) {
      if (stopped) return;
      report(error);
      wifiConnected = false;
      bridgeReady = false;
      pendingCommand = "";
      pendingVolume = 0;
      visualVolume = -1;
      wheelRevision++;
      pendingIndicator = null;
      hideVolume = true;
      kickDisplay();
      lastEtag = "";
      queueTrack("Spotify", "PC offline");
      nextDelay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, 60000);
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
    if (pendingCommand) pendingCommand = ""; else { pendingVolume = 0; lastVolumeAt = Date.now(); }
    controlling = true;
    try {
      const response = await fetch(controlUrl.replace(/\/now-playing$/, `/playback/${command}`), {
        method: "POST", headers: { "X-Busybar-Control": "1" },
      });
      if (stopped) return;
      if (url !== controlUrl || !bridgeReady) return;
      if (!response.ok) throw new Error("Spotify control failed");
      if (command.indexOf("volume?steps=") === 0) {
        const result = await response.json();
        if (stopped) return;
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
      if (!stopped) {
        report(error); pendingVolume = 0; visualVolume = -1;
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
    clearTimeout(watchTimer); clearTimeout(controlTimer); clearTimeout(volumeTimer); clearTimeout(displayRetry);
    if (watching && url) void fetch(url.replace(/\/now-playing$/, "/playback/cancel-wait"), {
      method: "POST", headers: { "X-Busybar-Control": "1", "X-Busybar-Client": client },
    }).catch(report);
    // Pending requests settle; the last input handle is released after this callback.
    setTimeout(unbind, 0);
  });
  async function start() {
    const values = await loadValues();
    if (stopped) return;
    url = selectedBridgeUrl(values);
    const step = values?.volume_step;
    if (typeof step === "number" && Number.isInteger(step) && step >= 1 && step <= 100) volumeStep = step;
    if (!url) { queueTrack("Spotify", "Set PC URL"); return; }
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
