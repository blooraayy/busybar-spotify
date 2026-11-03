import { device } from "@shared/device";
import manifest from "../src/appmeta/manifest.json";

/** @returns {Promise<Record<string, unknown> | null>} */
export async function loadValues() {
  try {
    const result = await device.AppsSettingsGet({ app_id: manifest.id });
    return result.values ?? null;
  } catch {
    console.error(`${manifest.id}: could not load settings`);
    return null;
  }
}
