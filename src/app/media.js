const { powerSaveBlocker } = require('electron');
const { liveWin, changed } = require('./state');

let playing = false;
let title = null;
let playbackBlockerId = null;

function sendPlayback(command) {
  const win = liveWin();
  if (win) win.webContents.send('jellio:playback-command', command);
}

function setPlaybackActiveState(active, mediaTitle) {
  playing = !!active;
  title = active ? (mediaTitle || null) : null;
  if (active && playbackBlockerId === null) {
    playbackBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!active && playbackBlockerId !== null) {
    if (powerSaveBlocker.isStarted(playbackBlockerId)) powerSaveBlocker.stop(playbackBlockerId);
    playbackBlockerId = null;
  }
  changed();
}

function playback() {
  return { playing, title };
}

module.exports = { playback, sendPlayback, setPlaybackActiveState };
