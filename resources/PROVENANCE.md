# Asset sources

`app-icon.svg` is the project's original vector icon. Desktop raster and platform icon files in `src-tauri/icons/` are rendered from it with the Tauri icon command; no vendor logo or third-party image is included.

`presets.json` contains the shared desktop and browser preset catalog. `scripts/build-presets.ts` compiles the curated settings in `ui/src/features/profiles/catalog.ts` with the existing lighting builder. Rust embeds the same JSON and validates every profile.

Project license: GPL-2.0-or-later. Existing OpenRGB protocol attribution remains in `src/device/protocol.rs` and README.md.
