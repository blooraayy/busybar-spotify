# Spotify

Control Spotify playback and display currently playing music on your BUSY Bar.

A JavaScript app for the BUSY Bar, generated from the BUSY JS app template.

## Getting started

```sh
npm install
npm run build         # build the app into dist/app.blooraayy.busybar-spotify.tgz
npm run app:install   # install it on the BUSY Bar connected over USB
npm run app:run       # launch the installed app
```

The app's id is `app.blooraayy.busybar-spotify`, set in `src/appmeta/manifest.json`. An id is `<namespace>.<app>`, at most 32 characters, made of Latin letters, digits, underscores, dashes, and dots, and not starting with a dot. If yours still says `app.example`, change it to your own namespace before publishing.

## Layout

`src/` is the app — everything in it is yours to edit.

The entry point is `src/main.js`. The name is fixed: the build turns it into `scripts/main.js`, the file the BUSY Bar starts. Any imported modules are emitted as separate files alongside it in `scripts/`, unless `npm run build -- --bundle` inlines them.

`src/main.js` is run from top to bottom, not imported: it starts the app by calling `main()` at the end and must not export anything. Imported modules can use standard exports.

```
my-app/
├── src/                          the app
│   ├── main.js                   the entry point: function main(), called at the end
│   ├── appmeta/
│   │   ├── manifest.json         id, name, version, api_version
│   │   ├── settings.json         the settings screen — optional
│   │   ├── icon_front_8x8.png    front icon, 8×8 color — optional
│   │   └── icon_back_11x11.png   back icon, 11×11 grayscale — optional
│   ├── images/
│   ├── animations/
│   └── sounds/
├── shared/                       app-level helpers, imported as @shared/*
```

Both icons are optional; without them a default is used.

## Resources

Anything in `src/` that isn't a source file is copied into the package, sorted by what the BUSY Bar can read:

| Extension | Destination |
| --- | --- |
| `.png` `.image` | `images/` |
| `.anim` | `animations/` |
| `.snd` | `sounds/` |
| anything else | `resources/` |

A file in `src/images`, `src/animations` or `src/sounds` keeps its folder as long as the BUSY Bar reads its format.

`images/`, `animations/` and `sounds/` hold only those formats. An image, animation or sound in another format — `.jpg`, `.gif`, `.svg`, `.wav`, `.mp3` and the like — goes to `resources/`, and the build warns that the device cannot read it.

Everything the app draws goes through the layout helpers in `@busy-app/busy-lib`: build a tree out of `row` / `column` / `stack`, hand it to `render()`, and send the result with `device.DisplayDraw()`. The screen is 72×16 pixels.

## Input

`listen("input", handler)` delivers the device keys: `ok`, `start` and `back` with a `press` / `release` / `short` / `long` / `repeat` action, and `encoder` with a `delta` of `1` or `-1`. It returns an unbind function.

Use `short` as the default action for a button press: it fires once, after a normal press and release. `press` fires immediately on key down and is followed by `short`, so handling `press` as a tap can react twice. Use `long` and `repeat` for hold gestures.

## Commands

| Command | Description |
| --- | --- |
| `npm run build` | empties `dist/` and builds the package into `dist/app.blooraayy.busybar-spotify.tgz` |
| `npm run build -- --emit dir` | leaves the `app.blooraayy.busybar-spotify/` folder instead of the `.tgz` |
| `npm run build -- --emit both` | leaves the folder and the `.tgz` |
| `npm run build -- --out <path>` | builds into `<path>` instead, replacing only this app's package there |
| `npm run build -- --tgz-name <name>` | names the `.tgz`, e.g. `"{id}-{version}.tgz"` |
| `npm run build -- --no-minify` | readable output, for debugging |
| `npm run build -- --bundle` | inlines every module into one `main.js` |
| `npm run build -- --addr <host>` | sets the BUSY Bar address the app connects to, `localhost` by default |
| `npm run typecheck` | checks JavaScript using JSDoc (no TypeScript app sources) |
| `npm run app:install` | installs `dist/app.blooraayy.busybar-spotify.tgz` on the BUSY Bar; build it first with `npm run build` |
| `npm run app:uninstall` | removes the app from the BUSY Bar, keeping its settings |
| `npm run app:run` | launches the installed app |
| `npm run app:stop` | quits the running app |

The four `app:` commands talk to the BUSY Bar connected over USB. For a device connected over Wi-Fi, pass `--addr <host>` with its network IP address or hostname, and `--password <password>` if password protection is enabled:

```sh
npm run app:install -- --addr <host>
npm run app:install -- --addr <host> --password <password>
```

## Build output

The package folder is named after the app id:

```
dist/
└── app.blooraayy.busybar-spotify/
    ├── appmeta/manifest.json
    ├── scripts/main.js
    └── images/ animations/ sounds/ resources/
```

By default the build packs that folder into `dist/app.blooraayy.busybar-spotify.tgz`, with the folder itself at the root of the archive, and removes the folder; `--emit dir` keeps only the folder, `--emit both` keeps both. `--tgz-name` gives the archive another name; `{id}` and `{version}` in it are replaced with the manifest values.

## Releasing

Pushing a git tag matching the manifest `version` (e.g. `0.1.0`) builds the app and attaches `app.blooraayy.busybar-spotify-<version>.tgz` to a GitHub release. The release notes open with the app's name, id, version and API version. The release fails when the tag differs from the manifest `version`.

## Manifest

`src/appmeta/manifest.json` carries the app's identity and a couple of knobs (see the [apps documentation](https://github.com/busy-app/busybar-firmware/blob/dev/documentation/JavaScript%20Applications.dox.md)):

| Field | Description |
| --- | --- |
| `format_version` | manifest format, `1` — required |
| `id` | up to 32 characters — required |
| `name` | display name — required |
| `version` | semver, e.g. `1.0.0` — required |
| `api_version` | minimum BUSY Bar HTTP API version the app needs, e.g. `27.12.0` — required |
| `description`, `author` | free form, default `""` |
| `heap_size_kib` | memory for the app heap, 1–512, default 128 |
| `debug` | when true, shown only in developer mode, default false |

Raise `heap_size_kib` if the app runs out of memory.

## Node version

The app builds on Node 24 — the version in `.nvmrc` and the range `engines` allows. Node 26 breaks the build and is excluded. With `fnm` or `nvm` installed, `fnm use` / `nvm use` picks the right one up from `.nvmrc`.

## Settings

To give the app a settings screen, add `src/appmeta/settings.json` describing the fields, then read the stored values:

```js
import { loadValues } from "@shared/settings";

const values = await loadValues();
```

`loadValues()` returns `null` when nothing is stored yet — use the defaults.

## JavaScript development on Windows

Use `npm.cmd` in PowerShell if the execution policy blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
```

App and shared helper sources are plain `.js`. `jsconfig.json` enables JavaScript
checking and the `@shared/*` alias. `tsconfig.json` extends it because the build
tool reads aliases from that filename. TypeScript is a development checker only;
`types/env.d.ts` describes firmware globals and is not executable app code.

The app displays Spotify track metadata from the Windows companion. A short Back
press stops all polling and exits. Playback controls are not implemented.

CLI 0.6.0 generates Windows font-map imports with backslashes. The version is pinned
and `tools/patch-busy-cli.mjs` applies an idempotent fix after install and before
build. This changes only the local build tool, not firmware. Review/remove the
workaround when upgrading the CLI. Commit `package-lock.json`; do not commit
`node_modules/` or `dist/`.

## Spotify on Windows (no Premium required)

Use the Spotify desktop application on Windows 10/11. The companion reads its
Windows media session; it does not call the Spotify API or require credentials.
Browser playback is not supported because Windows identifies that session by
browser, which cannot reliably distinguish Spotify from other sites.

1. Run `npm.cmd run companion` on the PC and keep that terminal open.
2. Connect the BUSY Bar and PC to the same local network. USB alone does not give
   the on-device JavaScript app access to a server on the PC.
3. Build and install with `npm.cmd run build` and `npm.cmd run app:install`.
4. In the device's app settings, set **Bridge URL** to the LAN URL printed by the
   companion, for example `http://192.168.1.10:8765/now-playing`.
5. Run `npm.cmd run app:run` and play music in Spotify. Restart the device app
   after changing its settings. Updates arrive within approximately 15 seconds.

If Windows asks, allow Node.js through the firewall on your private network.
The bridge serves song title, artist, thumbnail and playback state without authentication
on port 8765 to reachable network clients. Use it only on a trusted local network;
do not forward that port to the Internet. Stop it with Ctrl+C. No metadata is
saved to disk. `BUSYBAR_SPOTIFY_PORT` can override the listening port.

The JavaScript companion uses a small PowerShell adapter for the Windows-only
WinRT media API. It runs with a hidden window and a process-local execution-policy
override; it does not change the machine execution policy or install packages.

The device polls every 10 seconds without overlapping requests, checks Wi-Fi
first, and backs off to at most 60 seconds after connection errors. It sends only
changed display elements. Long titles scroll using firmware rendering, without
per-frame HTTP calls. Accents are transliterated for the ASCII bitmap fonts;
other unsupported characters become spaces. Paused playback shows `Paused`;
no desktop Spotify session shows `No music`.

Run `npm.cmd test` for polling, error handling, metadata and cleanup checks.

If Spotify is open but the bridge returns `idle`, enable **Show desktop overlay
when using media keys** in Spotify Settings > Display, then pause/resume playback.
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File companion/read-media.ps1 -ListSessions`
shows which media applications Windows exposes, for diagnostics.

## Start the bridge automatically with Windows

Run `npm.cmd run companion:autostart` once to register the **BUSY Bar Spotify
Bridge** task for your Windows user. It starts when you sign in, uses your
interactive media session, and runs without a console window. It runs with normal
user permissions, allows only one scheduled instance, and retries up to three
times on failure. Keep this checkout and the Node installation in their current
locations; rerun the installer after moving either one.

To start it immediately, use `Start-ScheduledTask -TaskName "BUSY Bar Spotify Bridge"`
in PowerShell. Stop any manually started companion first to free port 8765.
After installing autostart you do not need to run `npm.cmd run companion`.

Use `Get-ScheduledTask -TaskName "BUSY Bar Spotify Bridge"` to inspect it and
`npm.cmd run companion:autostart:remove` to stop and remove automatic startup.
The task stores no Spotify credentials. Signing out stops the user session;
the next sign-in starts the bridge again.

## Album cover

The left 16x16 pixels show the Windows media thumbnail; title and artist scroll
in the remaining 54 pixels, separated by a 2-pixel gap. Windows crops and resizes
the image on the PC, and the JavaScript companion converts it to at most 32 colors.
The device receives less than 1 KiB of XPM2, never the original image. Only the
current thumbnail is cached, in memory; unchanged covers are not redrawn. Missing
artwork and offline states clear the cover while keeping the metadata usable.

`companion/thumbnail.cs` is a small Windows COM/image-decoding adapter loaded by
PowerShell. The device app and the bridge server remain JavaScript. No additional
packages, Spotify API credentials, or Premium subscription are needed.

To restart the hidden bridge after updating companion files:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File companion/stop.ps1
Start-ScheduledTask -TaskName "BUSY Bar Spotify Bridge"
```

The stop command terminates only this checkout's bridge and its media-reader
child process, avoiding orphaned listeners on port 8765.
