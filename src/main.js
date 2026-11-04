import { device } from "@shared/device";
import { loadValues } from "@shared/settings";
import { bridgeUrl, playbackLines, playbackCover } from "@shared/now-playing";
import { row, column, render } from "@busy-app/busy-lib";
import manifest from "./appmeta/manifest.json";

const APP = manifest.id;
const POLL_MS = 10000;

function main() {
  let stopped = false;
  let timer = 0;
  let delay = POLL_MS;
  let url = "";
  let lastTitle = "";
  let lastArtist = "";
  let lastCover = "";
  let busy = false;
  let pendingCommand = "";
  let controlling = false;
  let pendingVolume = 0;
  /** @param {unknown} error */
  const report = (error) => console.error(`${APP}: ${error instanceof Error ? error.message : String(error)}`);

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

  async function poll() {
    if (stopped || busy) return;
    busy = true;
    try {
      const wifi = await device.WifiStatusGet();
      if (stopped) return;
      if (wifi.state !== "connected") {
        pendingCommand = "";
        pendingVolume = 0;
        delay = 30000;
        await draw("Spotify", "No Wi-Fi");
      } else {
        if (pendingCommand || pendingVolume) {
          const command = pendingCommand || `volume?steps=${pendingVolume}`;
          if (pendingCommand) pendingCommand = "";
          else pendingVolume = 0;
          controlling = true;
          try {
            const control = await fetch(url.replace(/\/now-playing$/, `/playback/${command}`), {
              method: "POST", headers: { "X-Busybar-Control": "1" },
            });
            if (stopped) return;
            if (!control.ok) throw new Error("Spotify playback control failed");
          } finally { controlling = false; }
        }
        if (stopped) return;
        const response = await fetch(url);
        if (stopped) return;
        if (!response.ok) throw new Error("PC bridge unavailable");
        const data = await response.json();
        if (stopped) return;
        const [title, artist] = playbackLines(data);
        await draw(title, artist, playbackCover(data));
        delay = POLL_MS;
      }
    } catch (error) {
      if (stopped) return;
      report(error);
      pendingVolume = 0;
      delay = Math.min(delay * 2, 60000);
      try { await draw("Spotify", "PC offline"); } catch (drawError) { report(drawError); }
    } finally {
      busy = false;
      // A single chain prevents overlapping network and display requests.
      if (!stopped) timer = setTimeout(() => { void poll().catch(report); }, pendingCommand ? 0 : pendingVolume ? 200 : delay);
    }
  }

  const unbind = listen("input", (event) => {
    if (stopped) return;
    if (event.key === "encoder") {
      if (!url || (event.delta !== 1 && event.delta !== -1)) return;
      pendingVolume = Math.max(-10, Math.min(10, pendingVolume + event.delta));
      if (!busy) {
        clearTimeout(timer);
        timer = setTimeout(() => { void poll().catch(report); }, 200);
      }
      return;
    }
    if (event.action !== "short") return;
    if (event.key === "start" || event.key === "ok") {
      if (!url || pendingCommand || controlling) return;
      pendingCommand = event.key === "ok" ? "next" : "toggle";
      clearTimeout(timer);
      if (!busy) void poll().catch(report);
      return;
    }
    if (event.key !== "back") return;
    stopped = true;
    pendingCommand = "";
    pendingVolume = 0;
    clearTimeout(timer);
    setTimeout(unbind, 0);
  });
  async function start() {
    const values = await loadValues();
    if (stopped) return;
    url = bridgeUrl(values?.bridge_url);
    if (!url) { await draw("Spotify", "Set PC URL"); return; }
    await poll();
  }
  void start().catch(report);
}
main();
