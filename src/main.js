import { device } from "@shared/device";
import { loadValues } from "@shared/settings";
import { bridgeUrl, playbackLines, playbackCover } from "@shared/now-playing";
import { row, column, render } from "@busy-app/busy-lib";
import { volumeElements, VOLUME_IDS } from "./volume-display";
import manifest from "./appmeta/manifest.json";

const APP = manifest.id;

function main() {
  let stopped = false;
  let url = "";
  const client = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let watchTimer = 0;
  let controlTimer = 0;
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
  let hideVolume = false;
  let wifiConnected = false;
  let wifiCheckedAt = 0;
  /** @type {Promise<boolean> | null} */
  let wifiRequest = null;
  /** @type {{ title: string, artist: string, cover: string } | null} */
  let pendingTrack = null;
  /** @type {{ value: number, frame: unknown } | null} */
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
      while (!stopped && (pendingIndicator || hideVolume || pendingTrack)) {
        if (pendingIndicator) {
          const indicator = pendingIndicator;
          pendingIndicator = null;
          await showVolume(indicator.value, indicator.frame);
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
    } finally { displayBusy = false; }
  }
  async function clearVolume() {
    clearTimeout(volumeTimer);
    if (shownVolume >= 0 && !stopped) await device.DisplayClear({ application_name: APP, element_ids: VOLUME_IDS });
    shownVolume = -1;
    hideVolume = false;
  }
  /** @param {number} value @param {unknown} frame */
  async function showVolume(value, frame) {
    if (stopped) return;
    clearTimeout(volumeTimer);
    hideVolume = false;
    if (value !== shownVolume) {
      await device.DisplayDraw({ application_name: APP, priority: 50, elements: volumeElements(value, frame) });
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
      retryDelay = 10000;
    } catch (error) {
      if (stopped) return;
      report(error);
      wifiConnected = false;
      lastEtag = "";
      queueTrack("Spotify", "PC offline");
      nextDelay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, 60000);
    } finally {
      watching = false;
      if (!stopped) watchTimer = setTimeout(() => { void watch().catch(report); }, nextDelay);
    }
  }

  async function controls() {
    if (stopped || controlling || !url) return;
    if (!wifiConnected) { pendingCommand = ""; pendingVolume = 0; return; }
    const command = pendingCommand || (pendingVolume ? `volume?steps=${pendingVolume}&step_percent=${volumeStep}` : "");
    if (!command) return;
    if (pendingCommand) pendingCommand = ""; else pendingVolume = 0;
    controlling = true;
    try {
      const response = await fetch(url.replace(/\/now-playing$/, `/playback/${command}`), {
        method: "POST", headers: { "X-Busybar-Control": "1" },
      });
      if (stopped) return;
      if (!response.ok) throw new Error("Spotify control failed");
      if (command.indexOf("volume?steps=") === 0) {
        const result = await response.json();
        if (stopped) return;
        if (!Number.isInteger(result.volume) || result.volume < 0 || result.volume > 100) throw new Error("Invalid volume response");
        pendingIndicator = { value: result.volume, frame: result.frame };
        kickDisplay();
      }
    } catch (error) {
      if (!stopped) { report(error); pendingVolume = 0; }
    } finally {
      controlling = false;
      if (!stopped && (pendingCommand || pendingVolume)) controlTimer = setTimeout(() => { void controls().catch(report); }, 200);
    }
  }

  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "encoder") {
      if (!url || (event.delta !== 1 && event.delta !== -1)) return;
      pendingVolume = Math.max(-10, Math.min(10, pendingVolume + event.delta));
      if (!controlling) {
        clearTimeout(controlTimer);
        controlTimer = setTimeout(() => { void controls().catch(report); }, 200);
      }
      return;
    }
    if (event.action !== "short") return;
    if (event.key === "start" || event.key === "ok") {
      if (!url || pendingCommand || controlling) return;
      pendingCommand = event.key === "ok" ? "next" : "toggle";
      clearTimeout(controlTimer);
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
    url = bridgeUrl(values?.bridge_url);
    const step = values?.volume_step;
    if (typeof step === "number" && Number.isInteger(step) && step >= 1 && step <= 100) volumeStep = step;
    if (!url) { queueTrack("Spotify", "Set PC URL"); return; }
    await watch();
  }
  void start().catch(report);
}
main();
