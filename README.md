<p align="center">
  <img src="src/pages/mark.svg" width="140" alt="Jellio for macOS">
</p>

<h1 align="center">Jellio for macOS</h1>

<p align="center">
  Jellio in its own native Apple Silicon Mac app. Opens your Jellyfin server's<br>
  Jellio client in a native window, keeps downloads running in the Dock,<br>
  and drops straight into your offline library when the server can't be reached.
</p>

Requires macOS 12 or later on Apple Silicon (M1 and newer). Tested on
macOS Sequoia.

## Install

1. Download `Jellio-<version>-arm64.dmg` from the
   [latest release](https://github.com/NoahSKipp/Jellio-macOS/releases/latest).
2. Open it and drag Jellio into Applications.
3. Open Jellio. The app isn't notarized by Apple, so macOS stops it the
   first time. Open **System Settings > Privacy & Security**, scroll to
   Security and click **Open Anyway** next to Jellio, then confirm.

   Or, in Terminal:

   ```sh
   xattr -dr com.apple.quarantine /Applications/Jellio.app
   ```

4. Enter your server's address, the same one you open Jellyfin with in a
   browser.

## Features

- **Full Jellio client & offline downloads**: runs your server's Jellio web
  client with its Service Worker cache and download manager for movies,
  episodes, books, manga, and audiobooks (including HEVC video downloads),
  and opens straight into your downloads when the server is unreachable.
- **Dock & menu bar integration**: closing the window keeps Jellio running in
  the Dock so active downloads finish, with a Dock badge, live Dock and window
  progress bars, quit confirmation while downloads are active, and a menu bar
  status item with quick playback controls.
- **Native macOS playback & navigation**: Playback and Go menus (`⌘[` Back,
  `⌘]` Forward, `⇧⌘H` Home, `⌘F` Search, `⇧⌘D` Downloads, `⌘,` Settings),
  hardware media keys and macOS Now Playing integration, Picture-in-Picture,
  native fullscreen, automatic display sleep prevention during video playback,
  two-finger trackpad swipe navigation, and `jellio://` / `jellyfin://` deep
  links.
- **SSO login & hardened security**: external HTTPS Single Sign-On flows
  (Authelia, Authentik, and reverse-proxy auth) alongside strict origin
  isolation and permission sandboxing.
- **Verified in-app updates**: checks GitHub for new releases on launch and
  every 6 hours in the background (configurable in **Settings > About**),
  verifies SHA-256 checksums and code signatures before installing, and shows
  release notes in a native What's New window, and much more.

## Build

```sh
npm ci
npm start          # run from source
npm run dist       # dist/Jellio-<version>-arm64.dmg and .zip
```

Building the app needs a Mac. It is signed ad hoc (`scripts/adhoc-sign.js`)
since there is no Developer ID.

## License

GPL-3.0, same as Jellio.
