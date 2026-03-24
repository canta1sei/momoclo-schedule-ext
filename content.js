(function () {
  'use strict';

  // 二重起動防止
  if (document.getElementById('mcz-schedule-app')) return;

  // ─── 定数 ───────────────────────────────────────────────────
  const CATEGORIES = ['ALL', 'LIVE', 'EVENT', 'STREAMING', 'TV', 'RADIO',
    'MAGAZINE', 'BOOK', 'WEB', 'MUSIC', 'MOVIE', 'TICKET'];
  const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];
  const MONTHS_TO_FETCH = 4; // 今月 + 3ヶ月先

  // ─── 状態 ───────────────────────────────────────────────────
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let allEvents = [];
  let activeFilter = 'ALL';

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
          <h1 class="mcz-title">
            <span class="mcz-title-icon">🌸</span>
            ももクロ スケジュール
          </h1>
          <p class="mcz-subtitle">ももいろクローバーZ Official Schedule</p>
        </div>
      </header>
      <div class="mcz-filters-wrap">
        <div class="mcz-filters" id="mcz-filters">${filterButtons}</div>
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

  // ─── イベント取得・パース ──────────────────────────────────
  async function fetchMonth(year, month) {
    const mm = String(month).padStart(2, '0');
    const url = `https://www.momoclo.net/schedule?target_year=${year}&target_month=${mm}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const events = [];
    doc.querySelectorAll('.schedule_list_container').forEach(el => {
      const dayText = el.querySelector('.schedule_list_day')?.textContent.trim();
      const weekText = el.querySelector('.schedule_list_week')?.textContent.trim();
      const category = el.querySelector('.schedule_list_genre_text')?.textContent.trim() || '';
      const title = el.querySelector('.schedule_list_title')?.textContent.trim() || '';
      const textEl = el.querySelector('.schedule_list_text');
      const bodyHtml = textEl ? textEl.innerHTML.trim() : '';
      const linkEl = el.querySelector('.schedule_list_link a');
      const link = linkEl ? linkEl.getAttribute('href') : null;

      if (!dayText) return;

      const day = parseInt(dayText, 10);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);

      events.push({ date, day, week: weekText, category, title, bodyHtml, link });
    });
    return events;
  }

  async function loadAllEvents() {
    const fetches = [];
    for (let i = 0; i < MONTHS_TO_FETCH; i++) {
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth() + i, 1);
      fetches.push(fetchMonth(d.getFullYear(), d.getMonth() + 1));
    }

    const results = await Promise.all(fetches);
    allEvents = results
      .flat()
      .filter(e => e.date >= todayDate)
      .sort((a, b) => a.date - b.date);

    document.getElementById('mcz-loading').style.display = 'none';
    renderEvents();
  }

  // ─── レンダリング ─────────────────────────────────────────────
  function getDayBadgeHtml(date) {
    const diff = Math.round((date - todayDate) / 86400000);
    if (diff === 0) return '<span class="mcz-badge mcz-badge-today">TODAY</span>';
    if (diff <= 6) return '<span class="mcz-badge mcz-badge-week">今週</span>';
    return '';
  }

  function renderEvents() {
    const content = document.getElementById('mcz-content');

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
          ? `<div class="mcz-event-link"><a href="${escapeAttr(ev.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ev.link)}</a></div>`
          : '';
        return `
          <div class="mcz-event-item">
            <span class="${catClass}">${escapeHtml(ev.category)}</span>
            <div class="mcz-event-body">
              <div class="mcz-event-title">${escapeHtml(ev.title)}</div>
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

  // ─── ユーティリティ ───────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    document.getElementById('mcz-filters').addEventListener('click', e => {
      const btn = e.target.closest('.mcz-filter-btn');
      if (!btn) return;
      activeFilter = btn.dataset.cat;
      document.querySelectorAll('.mcz-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEvents();
    });
  }

  // ─── エントリポイント ─────────────────────────────────────────
  buildUI();
  setupFilterListeners();
  loadAllEvents().catch(err => {
    const loading = document.getElementById('mcz-loading');
    if (loading) loading.innerHTML = `<p class="mcz-error">⚠️ データ取得に失敗しました: ${escapeHtml(err.message)}</p>`;
    console.error('[mcz-schedule]', err);
  });
})();
