import { render } from "@busy-app/busy-lib";

export const VOLUME_IDS = ["volume", "volume-fill", "volume-icon", "volume-value", "volume-left", "volume-right"];

/** @param {number} value @param {number} previous @returns {(import("@busy-app/busy-lib").RectangleElement | import("@busy-app/busy-lib").TextElement | import("@busy-app/busy-lib").ImageElement)[]} */
export function sliderElements(value, previous) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("Invalid volume level");
  /** @type {(import("@busy-app/busy-lib").RectangleElement | import("@busy-app/busy-lib").TextElement | import("@busy-app/busy-lib").ImageElement)[]} */
  const elements = [];
  const first = previous < 0;
  if (first) elements.push({ type: "rectangle", id: "volume", x: 0, y: 0, width: 72, height: 16,
    fill: "solid", fill_colors: ["#000000FF"], border_width: 0, z_index: 100 });
  if (first || Math.round(value * 72 / 100) !== Math.round(previous * 72 / 100)) {
    elements.push({ type: "rectangle", id: "volume-fill", x: 0, y: 0,
      width: Math.max(1, Math.round(value * 72 / 100)), height: 16, border_width: 0,
      fill: "gradient_h", fill_colors: value ? ["#104224FF", "#16A34AFF"] : ["#000000FF", "#000000FF"], z_index: 101 });
  }
  const icon = value === 0 ? "mute" : value === 100 ? "100" : "50";
  const oldIcon = previous === 0 ? "mute" : previous === 100 ? "100" : "50";
  if (first || icon !== oldIcon) elements.push({ type: "image", id: "volume-icon", x: 1, y: 4,
    path: `images/speaker_front_${icon}_8x8.png`, z_index: 102 });
  if (first || value !== previous) elements.push({ type: "text", id: "volume-value", x: 34, y: 4,
    text: `${value}%`, font: "normal", color: "#FFFFFFFF", z_index: 102 });
  if (first || (value === 0) !== (previous === 0)) elements.push({ type: "text", id: "volume-left", x: 22, y: 4,
    text: "<", font: "normal", color: value === 0 ? "#808080FF" : "#FFFFFFFF", z_index: 102 });
  if (first || (value === 100) !== (previous === 100)) elements.push({ type: "text", id: "volume-right", x: 66, y: 4,
    text: ">", font: "normal", color: value === 100 ? "#808080FF" : "#FFFFFFFF", z_index: 102 });
  return elements;
}

/** @param {number} value @returns {import("@busy-app/busy-lib").ImageElement[]} */
export function localVolumeElements(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("Invalid volume level");
  // Fixed full-screen image: no layout or PNG decompression during wheel input.
  return [{ type: "image", id: "volume", path: `images/volume_${value}.image`, x: 0, y: 0, z_index: 100 }];
}

/** @param {number} value @param {unknown} data */
export function volumeElements(value, data) {
  if (!Number.isInteger(value) || value < 0 || value > 100 || typeof data !== "string" || data.length > 1700 ||
      !data.startsWith("! XPM2\n72 16 19 1\n")) throw new Error("Invalid volume bitmap");
  const lines = data.split("\n");
  if (lines.length !== 37 || lines.slice(-16).some(line => !/^[.A-PWZ]{72}$/.test(line))) throw new Error("Invalid volume bitmap");
  return render({ type: "xpmbitmap", id: "volume", data, width: 72, height: 16, z_index: 100 });
}
