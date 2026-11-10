const { EventEmitter } = require('events');

// Shared by the main-process modules. 'changed' means the tray (and
// anything else showing window, playback or download state) is stale.
const state = {
  win: null,
  whatsNewWin: null,
  quitting: false,
  quitConfirmed: false,
  pendingRoute: null,
  events: new EventEmitter(),
};

function liveWin() {
  return state.win && !state.win.isDestroyed() ? state.win : null;
}

function changed() {
  state.events.emit('changed');
}

module.exports = { state, liveWin, changed };
