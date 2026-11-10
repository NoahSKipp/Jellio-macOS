const { app, Menu, shell } = require('electron');
const updates = require('../updates');
const { sendPlayback } = require('./media');
const { go, loadSetup } = require('./server');
const { liveWin, state } = require('./state');
const { showWhatsNewWindow } = require('./window');

const NAV_ITEMS = [
  { label: 'Home', accelerator: 'Cmd+Shift+H', route: 'home' },
  { label: 'Search', accelerator: 'Cmd+F', route: 'search' },
  { label: 'Downloads', accelerator: 'Cmd+Shift+D', route: 'downloads' },
];

function navItems(withAccelerators) {
  return NAV_ITEMS.map(({ label, accelerator, route }) => ({
    label,
    ...(withAccelerators ? { accelerator } : {}),
    click: () => go(route),
  }));
}

function checkForUpdatesItem() {
  return { label: 'Check for Updates…', click: () => updates.checkForUpdates(state.win, 'menu') };
}

function buildMenu() {
  const history = () => liveWin() && liveWin().webContents.navigationHistory;
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: "What's New in Jellio…", click: () => showWhatsNewWindow() },
        checkForUpdatesItem(),
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => go('settings') },
        { label: 'Change Server…', click: () => liveWin() && (liveWin().show(), loadSetup()) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Playback',
      submenu: [
        {
          label: 'Play / Pause',
          accelerator: 'Cmd+Alt+Down',
          click: () => sendPlayback('play-pause'),
        },
        {
          label: 'Next',
          accelerator: 'Alt+Cmd+Right',
          click: () => sendPlayback('next'),
        },
        {
          label: 'Previous',
          accelerator: 'Alt+Cmd+Left',
          click: () => sendPlayback('previous'),
        },
        { type: 'separator' },
        {
          label: 'Skip 10 Seconds Forward',
          accelerator: 'Ctrl+Cmd+Right',
          click: () => sendPlayback('skip-forward'),
        },
        {
          label: 'Skip 10 Seconds Back',
          accelerator: 'Ctrl+Cmd+Left',
          click: () => sendPlayback('skip-backward'),
        },
        { type: 'separator' },
        {
          label: 'Volume Up',
          accelerator: 'Alt+Cmd+Up',
          click: () => sendPlayback('volume-up'),
        },
        {
          label: 'Volume Down',
          accelerator: 'Alt+Cmd+Down',
          click: () => sendPlayback('volume-down'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Picture-in-Picture',
          accelerator: 'Cmd+Shift+P',
          click: () => sendPlayback('toggle-pip'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Go',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Cmd+[',
          click: () => history() && history().canGoBack() && history().goBack(),
        },
        {
          label: 'Forward',
          accelerator: 'Cmd+]',
          click: () => history() && history().canGoForward() && history().goForward(),
        },
        { type: 'separator' },
        ...navItems(true),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Jellio on GitHub', click: () => shell.openExternal('https://github.com/NoahSKipp/Jellio-macOS') },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/NoahSKipp/Jellio-macOS/issues'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildDockMenu() {
  if (!app.dock) return;
  const template = [
    ...navItems(false),
    { type: 'separator' },
    { label: 'Settings…', click: () => go('settings') },
  ];
  app.dock.setMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildDockMenu, buildMenu, checkForUpdatesItem };
