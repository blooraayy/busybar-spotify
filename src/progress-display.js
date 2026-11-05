export const PROGRESS_IDS = ["progress-bg", "progress-fill", "progress-head"];

/** @param {number} pixels @param {boolean} first @returns {import("@busy-app/busy-lib").RectangleElement[]} */
export function progressElements(pixels, first) {
  /** @type {import("@busy-app/busy-lib").RectangleElement[]} */
  const elements = [];
  // The unplayed portion blends into the screen; only elapsed progress appears.
  if (first) elements.push({type: "rectangle", id: "progress-bg", x: 18, y: 15, width: 54, height: 1,
    radius: 0, fill: "solid", fill_colors: ["#000000FF"], border_width: 0, z_index: 30});
  elements.push({type: "rectangle", id: "progress-fill", x: 19, y: 15, width: Math.max(1, pixels), height: 1,
    fill: "gradient_h", fill_colors: pixels ? ["#0B5A2BFF", "#1ED760FF"] : ["#000000FF", "#000000FF"], border_width: 0, z_index: 31});
  // The bright playhead moves with the fill; no additional animation timer.
  elements.push({type: "rectangle", id: "progress-head", x: 19 + Math.max(0, pixels - 1), y: 15, width: 1, height: 1,
    fill: "solid", fill_colors: [pixels ? "#DCFFE8FF" : "#000000FF"], border_width: 0, z_index: 32});
  return elements;
}
