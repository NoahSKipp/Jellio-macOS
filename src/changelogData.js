// Complete changelog definitions for Jellio macOS.
// Formatted with highlights for the native What's New window.

function isBigRelease(version) {
  if (!version || typeof version !== 'string') return false;
  const clean = version.trim().replace(/^v/i, '');
  const parts = clean.split('.');
  if (parts.length >= 3) {
    const patch = parseInt(parts[2], 10);
    const build = parts.length > 3 ? parseInt(parts[3], 10) : 0;
    return !isNaN(patch) && patch === 0 && (!build || build === 0);
  }
  if (parts.length === 2) return true;
  return false;
}

const MACOS_CHANGELOG_RELEASES = [
  {
    version: '0.6.2',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.6.2',
    summary: 'Native macOS playback menu, menu bar status item, deep linking, Dock progress bar, and atomic configuration.',
    highlights: [
      {
        title: 'Native Playback Menu',
        description: 'Standard macOS Playback menu with shortcuts for play/pause, next/previous tracks, 10-second seek, volume adjustments, and Picture-in-Picture.',
      },
      {
        title: 'Menu Bar Status Item',
        description: 'System tray icon with live playback controls, current media title, active downloads count, and quick window toggle.',
      },
      {
        title: 'Deep Linking Support',
        description: 'Launch and navigate directly via jellio:// and jellyfin:// protocol links.',
      },
      {
        title: 'Dock & Window Progress Bar',
        description: 'Live progress indication on the macOS Dock tile and window during downloads and in-app updates.',
      },
      {
        title: 'Atomic Settings & Safe Updates',
        description: 'Crash-resilient configuration writes with corrupted file backup recovery, and automatic temporary directory cleanup during updates.',
      },
      {
        title: 'Correct Version in Jellyfin',
        description: "Jellyfin's Devices and Dashboard now list this Mac as Jellio for macOS with the app's real version, instead of Jellio 0.1.0. Needs Jellio 1.86.2 on your server.",
      },
    ],
  },
  {
    version: '0.6.1',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.6.1',
    summary: 'Jellio opens faster.',
    highlights: [
      {
        title: 'Faster Start',
        description: 'The Jellio window now appears as soon as you open the app instead of waiting for your server, and the connection to your server is set up while the window opens.',
      },
      {
        title: 'Lighter First Load',
        description: 'The Dock download count no longer checks your downloads while Jellio is still loading.',
      },
    ],
  },
  {
    version: '0.6.0',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.6.0',
    summary: "Native What's New window with complete version history and menu integration.",
    highlights: [
      {
        title: 'Native Expandable Version History',
        description: 'Inspect the complete release history across all past versions in an interactive, cleanly collapsible modal.',
      },
      {
        title: "Menu Bar What's New Shortcut",
        description: "Easily review the latest feature additions and changes anytime from the Jellio application menu and Help menu.",
      },
      {
        title: 'Notification & State Cleanup',
        description: 'Stale update notifications and changelog dismiss flags are automatically cleared when major releases arrive.',
      },
    ],
  },
  {
    version: '0.5.0',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.5.0',
    summary: 'Global media keys, display sleep prevention, and Apple Silicon hardware decoding.',
    highlights: [
      {
        title: 'Global Media Keys',
        description: 'Control playback from anywhere using keyboard media keys (Play/Pause, Next Track, Previous Track).',
      },
      {
        title: 'Display Sleep Prevention',
        description: 'Prevents display sleep automatically while a video is playing, without keeping your Mac awake when idle.',
      },
      {
        title: 'Hardware Video Acceleration',
        description: 'Enhanced Apple Silicon hardware decoding flags for zero-copy 4K and HEVC playback with minimal battery draw.',
      },
    ],
  },
  {
    version: '0.4.1',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.4.1',
    summary: 'Direct network routing fix.',
    highlights: [
      {
        title: 'Direct Network Routing',
        description: 'Streams and API calls connect directly to your server without proxying through the main Electron process.',
      },
    ],
  },
  {
    version: '0.4.0',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.4.0',
    summary: 'Native dock menu, download badges, and quit protection.',
    highlights: [
      {
        title: 'Native Dock Menu & Alerts',
        description: 'Quick navigation dock menu, running download badge counts, and graceful exit confirmations.',
      },
      {
        title: 'Apple Silicon Zero-Copy Decoding',
        description: 'Optimized GPU rasterization and zero-copy video buffer transfers for M-series chips.',
      },
    ],
  },
  {
    version: '0.3.0',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.3.0',
    summary: 'HEVC offline downloads support.',
    highlights: [
      {
        title: 'HEVC Offline Downloads',
        description: 'Download movies and episodes in HEVC format when supported by the server, saving disk space and bandwidth.',
      },
    ],
  },
  {
    version: '0.2.0',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.2.0',
    summary: 'In-app updater.',
    highlights: [
      {
        title: 'In-App Automatic Updates',
        description: 'Seamless background update checks and one-click installation directly from Settings > About.',
      },
    ],
  },
  {
    version: '0.1.0',
    title: "What's New in Jellio for macOS",
    subtitle: 'Version 0.1.0',
    summary: 'Initial macOS desktop release.',
    highlights: [
      {
        title: 'Native macOS App',
        description: 'Runs Jellio in a dedicated native window with seamless server setup, offline support, and Dock download integration.',
      },
    ],
  },
];

module.exports = {
  isBigRelease,
  MACOS_CHANGELOG_RELEASES,
};
