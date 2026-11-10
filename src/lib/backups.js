// Backups of a corrupted config.json are "<base>.corrupted.<ms>.bak";
// returns those beyond the newest `keep`.
function backupsToPrune(names, base, keep) {
  const prefix = base + '.corrupted.';
  return names
    .map((name) => {
      if (!name.startsWith(prefix) || !name.endsWith('.bak')) return null;
      const stamp = name.slice(prefix.length, -'.bak'.length);
      return /^\d+$/.test(stamp) ? { name, time: Number(stamp) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.time - a.time)
    .slice(keep)
    .map((entry) => entry.name);
}

module.exports = { backupsToPrune };
