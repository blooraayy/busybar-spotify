/** @param {number} pixels @param {boolean} first @returns {import("@busy-app/busy-lib").RectangleElement[]} */
export function progressElements(pixels, first) {
  /** @type {import("@busy-app/busy-lib").RectangleElement[]} */
  const elements = [];
  if (first) elements.push({type: "rectangle", id: "progress-bg", x: 18, y: 15, width: 54, height: 1,
    fill: "solid", fill_colors: ["#203028FF"], border_width: 0, z_index: 30});
  elements.push({type: "rectangle", id: "progress-fill", x: 18, y: 15, width: Math.max(1, pixels), height: 1,
    fill: "solid", fill_colors: [pixels ? "#1DB954FF" : "#203028FF"], border_width: 0, z_index: 31});
  return elements;
}
