# Jellio for macOS

Jellio in its own Mac app. It opens your Jellyfin server's Jellio web
client in a native window, keeps running (and downloading) in the Dock,
and opens your downloads when the server can't be reached.

Requires macOS 12 or later on Apple Silicon (M1 and newer). Tested for
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

- Your server's Jellio client, with its service worker and offline
  downloads (books, manga, audiobooks, films and episodes).
- Opens straight into your downloads when the server is down.
- Closing the window keeps Jellio in the Dock so downloads keep going. The
  Dock icon shows how many are running, and quitting asks first.
- Media keys and Now Playing, native full screen, trackpad swipe back and
  forward.
- Go menu: Back `⌘[`, Forward `⌘]`, Home `⇧⌘H`, Search `⌘F`,
  Downloads `⇧⌘D`. Settings `⌘,`.
- Checks GitHub for a new version once a day.

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
