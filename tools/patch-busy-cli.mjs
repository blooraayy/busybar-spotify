// Build-host workaround for @busy-app/cli 0.6.0 on Windows.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../node_modules/@busy-app/cli/dist/lib/fontMapsPlugin.js", import.meta.url);
const original = "resolve(maps, `${f}.json`)";
const replacement = original + '.replaceAll(String.fromCharCode(92), "/")';
const source = readFileSync(file, "utf8");
if (!source.includes(replacement)) {
  if (!source.includes(original)) {
    throw new Error("busy-cli font map implementation changed; review the Windows workaround.");
  }
  writeFileSync(file, source.replace(original, replacement));
  console.log("Applied busy-cli Windows font map workaround.");
}
