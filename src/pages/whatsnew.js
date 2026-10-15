(function () {
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const latestHighlightsEl = document.getElementById('latest-highlights');
  const prevWrapEl = document.getElementById('prev-wrap');
  const prevToggleEl = document.getElementById('prev-toggle');
  const prevLabelEl = document.getElementById('prev-label');
  const prevArrowEl = document.getElementById('prev-arrow');
  const prevBodyEl = document.getElementById('prev-body');
  const dismissBtn = document.getElementById('dismiss');

  dismissBtn.addEventListener('click', function () {
    if (window.jellioNative && typeof window.jellioNative.dismissWhatsNew === 'function') {
      window.jellioNative.dismissWhatsNew();
    } else {
      window.close();
    }
  });

  if (window.jellioNative && typeof window.jellioNative.getChangelogs === 'function') {
    window.jellioNative.getChangelogs().then(renderChangelogs).catch(function (err) {
      console.warn('Could not load changelogs', err);
    });
  }

  function renderChangelogs(releases) {
    if (!Array.isArray(releases) || releases.length === 0) return;
    const latest = releases[0];
    const previous = releases.slice(1);

    titleEl.textContent = latest.title || "What's New in Jellio";
    subtitleEl.textContent = latest.subtitle || ('Version ' + latest.version);

    latestHighlightsEl.innerHTML = '';
    (latest.highlights || []).forEach(function (h) {
      const item = document.createElement('div');
      item.className = 'changelog-item';

      const t = document.createElement('div');
      t.className = 'changelog-item-title';
      t.textContent = h.title;
      item.appendChild(t);

      const d = document.createElement('div');
      d.className = 'changelog-item-desc';
      d.textContent = h.description;
      item.appendChild(d);

      latestHighlightsEl.appendChild(item);
    });

    if (previous.length > 0) {
      prevWrapEl.style.display = '';
      prevLabelEl.textContent = 'Previous Versions (' + previous.length + ')';

      let isPrevExpanded = false;
      prevToggleEl.addEventListener('click', function () {
        isPrevExpanded = !isPrevExpanded;
        prevBodyEl.style.display = isPrevExpanded ? '' : 'none';
        prevArrowEl.classList.toggle('expanded', isPrevExpanded);
      });

      prevBodyEl.innerHTML = '';
      previous.forEach(function (rel) {
        const card = document.createElement('div');
        card.className = 'version-card';

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'version-header';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = rel.subtitle || ('Version ' + rel.version);
        head.appendChild(nameSpan);

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'sub-arrow';
        arrowSpan.textContent = '▶';
        head.appendChild(arrowSpan);

        card.appendChild(head);

        const content = document.createElement('div');
        content.className = 'version-content';
        content.style.display = 'none';

        (rel.highlights || []).forEach(function (h) {
          const item = document.createElement('div');
          item.style.marginTop = '8px';

          const t = document.createElement('div');
          t.style.fontWeight = '600';
          t.style.fontSize = '12px';
          t.style.color = 'var(--text)';
          t.textContent = h.title;
          item.appendChild(t);

          const d = document.createElement('div');
          d.style.fontSize = '12px';
          d.style.color = 'var(--muted)';
          d.textContent = h.description;
          item.appendChild(d);

          content.appendChild(item);
        });

        card.appendChild(content);

        let isCardExpanded = false;
        head.addEventListener('click', function () {
          isCardExpanded = !isCardExpanded;
          content.style.display = isCardExpanded ? '' : 'none';
          arrowSpan.classList.toggle('expanded', isCardExpanded);
        });

        prevBodyEl.appendChild(card);
      });
    }
  }
})();
