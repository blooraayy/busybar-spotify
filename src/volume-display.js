import { render } from "@busy-app/busy-lib";

export const VOLUME_IDS = ["volume"];

/** @param {number} value @param {unknown} data */
export function volumeElements(value, data) {
  if (!Number.isInteger(value) || value < 0 || value > 100 || typeof data !== "string" || data.length > 1700 ||
      !data.startsWith("! XPM2\n72 16 19 1\n")) throw new Error("Invalid volume bitmap");
  const lines = data.split("\n");
  if (lines.length !== 37 || lines.slice(-16).some(line => !/^[.A-PWZ]{72}$/.test(line))) throw new Error("Invalid volume bitmap");
  return render({ type: "xpmbitmap", id: "volume", data, width: 72, height: 16, z_index: 100 });
}
