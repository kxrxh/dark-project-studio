# Dark Project Studio

Desktop editor for **Dark Project KD3B rev.2**, built with Tauri 2, React, TypeScript, and Rust. Licensed under GPL-2.0-or-later.

## Features

- 76 built-in lighting profiles, editable copies, and custom profiles.
- Per-key RGB, gradients, brightness, and native lighting effects.
- Up to 20 animation frames, plus animation and palette builders.
- Base and Fn-layer key remapping and onboard macros.
- Four onboard slots with backup and readback verification before confirming a write.
- Firmware keypress reactions that run directly on the keyboard.
- Local profile library, JSON export, undo/redo.

The interface is currently in Russian. The browser preview has no USB access and keeps edits only in the current tab.

## Downloads

Download installers from [GitHub Releases](https://github.com/kxrxh/dark-project-studio/releases): Windows x64, macOS Apple Silicon and Intel, and Linux x64. Development builds are available under the **Actions → Build desktop apps** workflow as artifacts.

Builds are unsigned for distribution; macOS builds use ad-hoc signing and are not notarized. Windows SmartScreen and macOS Gatekeeper may show warnings.

## Keyboard setup

Only USB device **195d:2061**, revision **0x3131**, is supported. Connect one keyboard and close other RGB controllers before writing. Older revisions and multiple connected keyboards are rejected.

On macOS, enable **System Settings → Privacy & Security → Input Monitoring → Dark Project Studio**, then restart the app. This is needed to read vendor replies. Studio discards unrelated input reports and does not record typed text.

Windows USB access requires a compatible driver for the lighting interface. Linux requires USB/hidraw permissions and may need handling of the kernel driver on interface 2. Studio does not install, replace, or detach drivers. Windows/Linux keyboard access still requires physical hardware testing; a successful build does not verify USB access.

## Use

Open **Подсветка**, select a built-in profile, and choose **Создать копию** to edit it. Custom profiles appear under **Мои**. The sidebar opens lighting, macros, remapping, and applications.

Use **Записать…** to select one of four hardware slots. Before writing, Studio backs up the affected data, flushes the backup to disk, and verifies stored data after each change. USB or power loss can leave a partial update; retain the backup for recovery. Restoring also creates a safety backup.

The editor previews lighting on screen. Lighting, remaps, and macros run from keyboard memory after writing; Studio can then be closed. No background lighting engine or application launcher is included.

With the default keymap, **Fn+F1–F4** switch hardware slots. Remapping those combinations changes their behavior. Fn itself is protected. Macros support balanced press/release sequences of up to 80 events and 1–32 repeats. The app does not flash firmware.

Older libraries with Studio-driven reactions are backed up to `library.before-onboard-only.json` before migration. Their base colors, frames, assignments, and macros are retained as ordinary onboard profiles; the host reaction is removed. Old application-shortcut settings are left untouched.

Profiles and backups are stored in the operating system's application-data directory. On macOS, this is `~/Library/Application Support/dev.darkproject.studio/`.

## Build from source

Install Node.js 24, a current stable Rust toolchain, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system. Windows needs the MSVC C++ build tools and WebView2; macOS needs Xcode command-line tools.

On Ubuntu 22.04/24.04, also install the native build dependencies:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libudev-dev libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils
```

```sh
npm ci
npm run desktop
```

Build an installer on its target operating system:

```sh
# Windows
npm run tauri -- build --bundles nsis -- --locked
# macOS
npm run tauri -- build --bundles dmg -- --locked
# Linux
npm run tauri -- build --bundles deb,appimage -- --locked
```

Installers are written to `src-tauri/target/release/bundle/`. CI builds also include the Rust target triple in that path. GitHub Actions tests and builds all platforms on pushes and pull requests; pushing a `v*` tag publishes a release after every build succeeds.

## Checks

```sh
npm test
npm run build
cargo test --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo fmt --check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

Tests do not access USB. To include the optional browser recovery test, set `PLAYWRIGHT_MODULE` to an available Playwright module and, if necessary, `CHROME_BIN` to a Chrome executable. Otherwise that browser test is skipped.

The shared device/protocol library lives in `src/`, the desktop bridge in `src-tauri/`, and the React editor in `ui/`. Build inputs, tests, assets, and license notices are included; local research, captures, design drafts, dependencies, and build output are excluded.

## License and attribution

The direct RGB key offsets and encoding are adapted from the GPL-2.0-or-later [OpenRGB Dark Project driver](https://github.com/CalcProgrammer1/OpenRGB/blob/master/Controllers/DarkProject/DarkProjectKeyboardController.cpp) by Chris M (DrNo), dated 08 Apr 2022. Attribution remains in `src/protocol.rs`; the license text is in `LICENSE`.

Onboard protocol behavior was recovered from the original KD3 rev.2 software and checked against a connected keyboard where supported. Vendor binaries, extracted source, firmware images, and research captures are not distributed. Asset origins are documented in `resources/PROVENANCE.md`.
