(function () {
  'use strict';

  const CACHE_KEY = 'mcz-popup-cache';
  const DAYS_AHEAD = 14; // 2週間先まで表示
  const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];

  const enabledToggle = document.getElementById('ext-enabled');
  if (enabledToggle) {
    chrome.storage.sync.get(MCZ_DEFAULT_SETTINGS, result => {
      enabledToggle.checked = result.enabled;
    });
    enabledToggle.addEventListener('change', () => {
      chrome.storage.sync.set({ enabled: enabledToggle.checked }, () => {
        reloadScheduleTabs();
      });
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today.getTime() + DAYS_AHEAD * 86400000);

  // ─── キャッシュ (chrome.storage.local) ────────────────────
  function saveCache(events) {
    const payload = {
      timestamp: Date.now(),
      events: events.map(e => ({ ...e, date: e.date.getTime() })),
    };
    chrome.storage.local.set({ [CACHE_KEY]: payload });
  }

  function loadCache() {
    return new Promise(resolve => {
      chrome.storage.local.get(CACHE_KEY, result => {
        const payload = result[CACHE_KEY];
        if (!payload || Date.now() - payload.timestamp > MCZ_CACHE_TTL_MS) {
          resolve(null);
          return;
        }
        resolve(payload.events.map(e => ({ ...e, date: new Date(e.date) })));
      });
    });
  }

  // ─── fetch ────────────────────────────────────────────────
  async function fetchUpcoming() {
    const { monthsToFetch } = await mczLoadSettings();
    const months = [];
    for (let i = 0; i < monthsToFetch; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push(mczFetchMonth(d.getFullYear(), d.getMonth() + 1));
    }
    const results = await Promise.all(months);
    const events = results.flat()
      .filter(e => e.date >= today && e.date <= limit)
      .sort((a, b) => a.date - b.date);
    saveCache(events);
    return events;
  }

  // ─── レンダリング ─────────────────────────────────────────
  function render(events) {
    const content = document.getElementById('content');

    if (events.length === 0) {
      content.innerHTML = '<div class="empty">😢 直近のスケジュールがないよ～</div>';
      return;
    }

    const grouped = new Map();
    events.forEach(e => {
      const key = e.date.getTime();
      if (!grouped.has(key)) grouped.set(key, { date: e.date, events: [] });
      grouped.get(key).events.push(e);
    });

    let html = '<div class="section-label">直近2週間のスケジュール</div>';
    grouped.forEach(({ date, events: evs }) => {
      const diff = Math.round((date - today) / 86400000);
      const badge = diff === 0
        ? '<span class="badge badge-today">TODAY</span>'
        : diff <= 6 ? '<span class="badge badge-week">今週</span>' : '';
      const wd = WEEKDAYS_JP[date.getDay()];
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}（${wd}）`;

      const evHtml = evs.map(ev => {
        const catClass = `cat cat-${ev.category.toLowerCase()}`;
        return `<div class="event-item">
          <span class="${catClass}">${mczEscapeHtml(ev.category)}</span>
          <span class="event-title">${mczEscapeHtml(ev.title)}</span>
        </div>`;
      }).join('');

      html += `<div class="day-block">
        <div class="day-header">
          <span class="date-str">${dateStr}</span>${badge}
        </div>
        ${evHtml}
      </div>`;
    });

    content.innerHTML = html;
  }

  // ─── エントリポイント ─────────────────────────────────────
  async function main() {
    const cached = await loadCache();
    if (cached) {
      render(cached);
      // バックグラウンドで更新
      fetchUpcoming().then(render).catch(() => {});
    } else {
      fetchUpcoming()
        .then(render)
        .catch(err => {
          document.getElementById('content').innerHTML =
            `<div class="error">⚠️ 取得に失敗しました: ${mczEscapeHtml(err.message)}</div>`;
        });
    }
  }

  function reloadScheduleTabs() {
    chrome.tabs.query({ url: '*://www.momoclo.net/schedule*' }, tabs => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.reload(tab.id);
      });
    });
  }

  main();
})();
