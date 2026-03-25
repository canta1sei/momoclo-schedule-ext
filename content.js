(function () {
  'use strict';

  // 二重起動防止
  if (document.getElementById('mcz-schedule-app')) return;

  // ─── 定数 ───────────────────────────────────────────────────
  const CATEGORIES = ['ALL', 'LIVE', 'EVENT', 'STREAMING', 'TV', 'RADIO',
    'MAGAZINE', 'BOOK', 'WEB', 'MUSIC', 'MOVIE', 'TICKET'];
  const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];
  const CACHE_KEY = 'mcz-schedule-cache';

  // ─── 状態 ───────────────────────────────────────────────────
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let allEvents = [];
  let activeFilter = 'ALL';
  let activeView = 'list';
  let calendarYear = todayDate.getFullYear();
  let calendarMonth = todayDate.getMonth();
  let settings = MCZ_DEFAULT_SETTINGS;

  mczLoadSettings().then(s => {
    settings = s;
    if (!settings.enabled) {
      injectDisabledBadge();
      return;
    }

    // ─── エントリポイント ─────────────────────────────────────────
    buildUI();
    setupFilterListeners();
    loadAllEvents().catch(err => {
      const loading = document.getElementById('mcz-loading');
      if (loading) loading.innerHTML = `<p class="mcz-error">⚠️ データ取得に失敗しました: ${mczEscapeHtml(err.message)}</p>`;
      console.error('[mcz-schedule]', err);
    });
  });

  // ─── UI 構築 ─────────────────────────────────────────────────
  function buildUI() {
    const filterButtons = CATEGORIES.map(cat =>
      `<button class="mcz-filter-btn${cat === 'ALL' ? ' active' : ''}" data-cat="${cat}">${cat}</button>`
    ).join('');

    const app = document.createElement('div');
    app.id = 'mcz-schedule-app';
    app.innerHTML = `
      <header class="mcz-header">
        <div class="mcz-header-inner">
          <div class="mcz-header-row">
            <div>
              <h1 class="mcz-title">
                <span class="mcz-title-icon">🌸</span>
                ももクロ スケジュール
              </h1>
              <p class="mcz-subtitle">ももいろクローバーZ Official Schedule</p>
            </div>
            <div class="mcz-status">
              <span class="mcz-status-label">拡張機能</span>
              <button id="mcz-toggle" class="mcz-toggle" type="button" aria-pressed="true">
                <span class="mcz-toggle-text">ON</span>
                <span class="mcz-toggle-knob"></span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <div class="mcz-filters-wrap">
        <div class="mcz-filters-row">
          <div class="mcz-filters" id="mcz-filters">${filterButtons}</div>
          <div class="mcz-view-toggle" id="mcz-view-toggle">
            <button class="mcz-view-btn active" data-view="list">リスト</button>
            <button class="mcz-view-btn" data-view="calendar">カレンダー</button>
          </div>
        </div>
      </div>
      <div id="mcz-loading" class="mcz-loading">
        <div class="mcz-loading-spinner"></div>
        <p>スケジュール取得中... 🌸</p>
      </div>
      <main id="mcz-content" class="mcz-content"></main>
    `;

    // body を丸ごと置き換え
    document.body.innerHTML = '';
    document.body.className = 'mcz-body';
    document.body.appendChild(app);
    document.title = 'ももクロ スケジュール';
  }

  // ─── キャッシュ ────────────────────────────────────────────
  function saveCache(events) {
    try {
      const payload = {
        timestamp: Date.now(),
        events: events.map(e => ({ ...e, date: e.date.getTime() })),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch (_) { /* quota超過などは無視 */ }
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (Date.now() - payload.timestamp > MCZ_CACHE_TTL_MS) return null;
      return payload.events.map(e => ({ ...e, date: new Date(e.date) }));
    } catch (_) {
      return null;
    }
  }

  function getMonthsToFetch() {
    return Promise.resolve(settings.monthsToFetch);
  }

  async function fetchAndStore() {
    const monthsToFetch = await getMonthsToFetch();
    const fetches = [];
    for (let i = 0; i < monthsToFetch; i++) {
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth() + i, 1);
      fetches.push(mczFetchMonth(d.getFullYear(), d.getMonth() + 1));
    }
    const results = await Promise.all(fetches);
    const events = results
      .flat()
      .filter(e => e.date >= todayDate)
      .sort((a, b) => a.date - b.date);
    saveCache(events);
    return events;
  }

  async function loadAllEvents() {
    const cached = loadCache();

    if (cached) {
      // キャッシュヒット: 即時描画してバックグラウンドで再fetch
      allEvents = cached;
      const loading = document.getElementById('mcz-loading');
      if (loading) loading.style.display = 'none';
      renderEvents();
      fetchAndStore().then(events => {
        allEvents = events;
        renderEvents();
      }).catch(() => { /* バックグラウンド更新失敗は無視 */ });
    } else {
      // キャッシュミス: fetch完了後に描画
      allEvents = await fetchAndStore();
      const loading = document.getElementById('mcz-loading');
      if (loading) loading.style.display = 'none';
      renderEvents();
    }
  }

  // ─── レンダリング ─────────────────────────────────────────────
  function getDayBadgeHtml(date) {
    const diff = Math.round((date - todayDate) / 86400000);
    if (diff === 0) return '<span class="mcz-badge mcz-badge-today">TODAY</span>';
    if (diff <= 6) return '<span class="mcz-badge mcz-badge-week">今週</span>';
    return '';
  }

  function renderEvents() {
    if (activeView === 'calendar') { renderCalendar(); return; }
    renderListView();
  }

  function renderListView() {
    const content = document.getElementById('mcz-content');
    if (!content) return;

    const filtered = activeFilter === 'ALL'
      ? allEvents
      : allEvents.filter(e => e.category === activeFilter);

    if (filtered.length === 0) {
      content.innerHTML = '<div class="mcz-empty">😢 該当のスケジュールがないよ～</div>';
      return;
    }

    // 日付でグルーピング
    const grouped = new Map();
    filtered.forEach(event => {
      const key = `${event.date.getFullYear()}-${event.date.getMonth()}-${event.date.getDate()}`;
      if (!grouped.has(key)) grouped.set(key, { date: event.date, events: [] });
      grouped.get(key).events.push(event);
    });

    const fragments = [];
    grouped.forEach(({ date, events }) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const wd = WEEKDAYS_JP[date.getDay()];
      const dateStr = `${date.getFullYear()}年${month}月${day}日（${wd}）`;
      const badge = getDayBadgeHtml(date);

      const diff = Math.round((date - todayDate) / 86400000);
      const dayBlockClass = diff === 0 ? 'mcz-day-block mcz-day-today'
        : diff <= 6 ? 'mcz-day-block mcz-day-this-week'
        : 'mcz-day-block';

      const eventsHtml = events.map(ev => {
        const catClass = `mcz-cat mcz-cat-${ev.category.toLowerCase()}`;
        const linkHtml = ev.link
          ? `<div class="mcz-event-link"><a href="${escapeAttr(ev.link)}" target="_blank" rel="noopener noreferrer">${mczEscapeHtml(ev.link)}</a></div>`
          : '';
        return `
          <div class="mcz-event-item">
            <span class="${catClass}">${mczEscapeHtml(ev.category)}</span>
            <div class="mcz-event-body">
              <div class="mcz-event-title">${mczEscapeHtml(ev.title)}</div>
              ${ev.bodyHtml ? `<div class="mcz-event-text">${sanitizeBodyHtml(ev.bodyHtml)}</div>` : ''}
              ${linkHtml}
            </div>
          </div>
        `;
      }).join('');

      fragments.push(`
        <div class="${dayBlockClass}">
          <div class="mcz-day-header">
            <span class="mcz-date">${dateStr}</span>
            ${badge}
          </div>
          <div class="mcz-events">${eventsHtml}</div>
        </div>
      `);
    });

    content.innerHTML = fragments.join('');
  }

  function renderCalendar() {
    const content = document.getElementById('mcz-content');
    if (!content) return;

    const filtered = activeFilter === 'ALL'
      ? allEvents
      : allEvents.filter(e => e.category === activeFilter);

    // カレンダー月のイベントを日ごとにまとめる
    const dayMap = new Map();
    filtered.forEach(e => {
      if (e.date.getFullYear() === calendarYear && e.date.getMonth() === calendarMonth) {
        const d = e.date.getDate();
        if (!dayMap.has(d)) dayMap.set(d, []);
        dayMap.get(d).push(e);
      }
    });

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const startDow = firstDay.getDay();

    const wdHeaders = WEEKDAYS_JP.map((w, i) =>
      `<div class="mcz-cal-wd${i === 0 ? ' mcz-cal-wd-sun' : i === 6 ? ' mcz-cal-wd-sat' : ''}">${w}</div>`
    ).join('');

    let cells = '';
    for (let i = 0; i < startDow; i++) cells += '<div class="mcz-cal-cell mcz-cal-blank"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(calendarYear, calendarMonth, d).getDay();
      const isToday = calendarYear === todayDate.getFullYear()
        && calendarMonth === todayDate.getMonth()
        && d === todayDate.getDate();
      const isPast = new Date(calendarYear, calendarMonth, d) < todayDate;
      const evs = dayMap.get(d);
      let cls = 'mcz-cal-cell';
      if (isToday) cls += ' mcz-cal-today';
      if (isPast) cls += ' mcz-cal-past';
      if (dow === 0) cls += ' mcz-cal-sun';
      if (dow === 6) cls += ' mcz-cal-sat';
      if (evs) cls += ' mcz-cal-has-events';
      const badge = evs ? `<span class="mcz-cal-badge">${evs.length}</span>` : '';
      cells += `<div class="${cls}" data-day="${d}"><span class="mcz-cal-day">${d}</span>${badge}</div>`;
    }

    content.innerHTML = `
      <div class="mcz-calendar">
        <div class="mcz-cal-nav">
          <button class="mcz-cal-nav-btn" id="mcz-cal-prev">◀</button>
          <span class="mcz-cal-month">${calendarYear}年${calendarMonth + 1}月</span>
          <button class="mcz-cal-nav-btn" id="mcz-cal-next">▶</button>
        </div>
        <div class="mcz-cal-grid">${wdHeaders}${cells}</div>
      </div>
      <div id="mcz-cal-popover-wrap"></div>
    `;

    // 日付クリック → ポップオーバー
    content.querySelectorAll('.mcz-cal-cell.mcz-cal-has-events').forEach(cell => {
      cell.addEventListener('click', e => {
        e.stopPropagation();
        const day = parseInt(cell.dataset.day, 10);
        const evs = dayMap.get(day) || [];
    const wrap = document.getElementById('mcz-cal-popover-wrap');
    if (!wrap) return;
        const dateStr = `${calendarYear}年${calendarMonth + 1}月${day}日`;
        const evHtml = evs.map(ev => `
          <div class="mcz-event-item">
            <span class="mcz-cat mcz-cat-${ev.category.toLowerCase()}">${mczEscapeHtml(ev.category)}</span>
            <div class="mcz-event-body">
              <div class="mcz-event-title">${mczEscapeHtml(ev.title)}</div>
              ${ev.bodyHtml ? `<div class="mcz-event-text">${sanitizeBodyHtml(ev.bodyHtml)}</div>` : ''}
            </div>
          </div>`).join('');
        wrap.innerHTML = `
          <div class="mcz-cal-popover">
            <div class="mcz-cal-popover-header">
              <span>${mczEscapeHtml(dateStr)}</span>
              <button class="mcz-cal-popover-close">✕</button>
            </div>
            <div class="mcz-cal-popover-body">${evHtml}</div>
          </div>`;
        wrap.querySelector('.mcz-cal-popover-close').addEventListener('click', () => {
          wrap.innerHTML = '';
        });
      });
    });

    // 外クリックでポップオーバーを閉じる
    content.addEventListener('click', () => {
      document.getElementById('mcz-cal-popover-wrap').innerHTML = '';
    });

    document.getElementById('mcz-cal-prev').addEventListener('click', e => {
      e.stopPropagation();
      calendarMonth--;
      if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
      renderCalendar();
    });
    document.getElementById('mcz-cal-next').addEventListener('click', e => {
      e.stopPropagation();
      calendarMonth++;
      if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
      renderCalendar();
    });
  }

  // ─── ユーティリティ ───────────────────────────────────────────
  function injectDisabledBadge() {
    if (document.getElementById('mcz-disabled-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'mcz-disabled-badge';
    badge.className = 'mcz-disabled-badge';
    badge.innerHTML = `
      <span class="mcz-disabled-label">拡張機能 OFF</span>
      <button class="mcz-disabled-btn" type="button">ONにする</button>
    `;
    document.body.appendChild(badge);
    const btn = badge.querySelector('.mcz-disabled-btn');
    btn.addEventListener('click', withSafeContext(() => {
      if (!isExtensionLive()) return;
      try {
        chrome.storage.sync.set({ enabled: true }, () => {
          location.reload();
        });
      } catch (_) {
        location.reload();
      }
    }));
  }

  function withSafeContext(handler) {
    return (...args) => {
      try {
        handler(...args);
      } catch (err) {
        if (isExtensionContextInvalidated(err)) return;
        throw err;
      }
    };
  }

  function isExtensionContextInvalidated(err) {
    const message = err && typeof err.message === 'string' ? err.message : '';
    return message.includes('Extension context invalidated');
  }

  function isExtensionLive() {
    try {
      return !!chrome?.runtime?.id;
    } catch (_) {
      return false;
    }
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // bodyHtml は公式サイト由来の信頼できるHTMLだが、<br> と テキストのみを許可
  function sanitizeBodyHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    // script・style タグ除去
    div.querySelectorAll('script, style, iframe').forEach(el => el.remove());
    // リンク以外の属性を除去（href のみ保持）
    div.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      Array.from(a.attributes).forEach(attr => a.removeAttribute(attr.name));
      if (href) {
        a.setAttribute('href', href);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return div.innerHTML;
  }

  // ─── フィルターイベント ──────────────────────────────────────
  function setupFilterListeners() {
    const toggle = document.getElementById('mcz-toggle');
    if (toggle) {
      toggle.addEventListener('click', withSafeContext(() => {
        if (!isExtensionLive()) return;
        try {
          chrome.storage.sync.set({ enabled: false }, () => {
            location.reload();
          });
        } catch (_) {
          location.reload();
        }
      }));
    }

    const filters = document.getElementById('mcz-filters');
    if (filters) {
      filters.addEventListener('click', withSafeContext(e => {
        if (!isExtensionLive()) return;
        const btn = e.target.closest('.mcz-filter-btn');
        if (!btn) return;
        activeFilter = btn.dataset.cat;
        document.querySelectorAll('.mcz-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEvents();
      }));
    }

    const viewToggle = document.getElementById('mcz-view-toggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', withSafeContext(e => {
        if (!isExtensionLive()) return;
        const btn = e.target.closest('.mcz-view-btn');
        if (!btn) return;
        activeView = btn.dataset.view;
        document.querySelectorAll('.mcz-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEvents();
      }));
    }
  }

})();
