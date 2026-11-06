import { textWidth } from "@busy-app/busy-lib";

export const SCROLL_RATE = 1200;
export const SCROLL_START = 1500;
const REPEAT_PAUSE = 2500;
const VIEWPORT = 54;

/** Match firmware 1.3.1's circular path: text plus three space advances.
 * @param {string} title @param {string} artist */
export function scrollSync(title, artist) {
  const titleWidth = textWidth(title, "small");
  const artistWidth = textWidth(artist, "tiny");
  const both = titleWidth > VIEWPORT && artistWidth > VIEWPORT;
  const titleDuration = Math.floor((titleWidth + 3 * textWidth(" ", "small")) * 60000 / SCROLL_RATE);
  const artistDuration = Math.floor((artistWidth + 3 * textWidth(" ", "tiny")) * 60000 / SCROLL_RATE);
  const longest = Math.max(titleDuration, artistDuration);
  return {
    both,
    titleDelay: REPEAT_PAUSE + (both ? longest - titleDuration : 0),
    artistDelay: REPEAT_PAUSE + (both ? longest - artistDuration : 0),
  };
}
