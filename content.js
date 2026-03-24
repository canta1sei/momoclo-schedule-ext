(async function () {
  'use strict';

  // 二重起動防止
  if (document.getElementById('mcz-schedule-app')) return;

  // ─── 定数 ───────────────────────────────────────────────────
  const CATEGORIES = ['ALL', 'LIVE', 'EVENT', 'STREAMING', 'TV', 'RADIO',
    'MAGAZINE', 'BOOK', 'WEB', 'MUSIC', 'MOVIE', 'TICKET'];
  const WEEKDAYS_JP = ['日', '月', '火', '水', '木', '金', '土'];
  const MONTHS_TO_FETCH = 4; // 今月 + 3ヶ月先
  const CACHE_KEY = 'mcz-schedule-cache';
  const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3時間
  const DEFAULT_SETTINGS = { enabled: true, monthsToFetch: MONTHS_TO_FETCH };

  // ─── 状態 ───────────────────────────────────────────────────
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let allEvents = [];
  let activeFilter = 'ALL';
  let activeView = 'list';
  let calendarYear = todayDate.getFullYear();
  let calendarMonth = todayDate.getMonth();

  const settings = await loadSettings();
  const detectedTheme = detectThemeColor();
  if (detectedTheme) applyThemePalette(detectedTheme);

  if (!settings.enabled) {
    injectDisabledBadge();
    return;
  }

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
      if (Date.now() - payload.timestamp > CACHE_TTL_MS) return null;
      return payload.events.map(e => ({ ...e, date: new Date(e.date) }));
    } catch (_) {
      return null;
    }
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

  function getMonthsToFetch() {
    return Promise.resolve(settings.monthsToFetch);
  }

  async function fetchAndStore() {
    const monthsToFetch = await getMonthsToFetch();
    const fetches = [];
    for (let i = 0; i < monthsToFetch; i++) {
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth() + i, 1);
      fetches.push(fetchMonth(d.getFullYear(), d.getMonth() + 1));
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
      document.getElementById('mcz-loading').style.display = 'none';
      renderEvents();
      fetchAndStore().then(events => {
        allEvents = events;
        renderEvents();
      }).catch(() => { /* バックグラウンド更新失敗は無視 */ });
    } else {
      // キャッシュミス: fetch完了後に描画
      allEvents = await fetchAndStore();
      document.getElementById('mcz-loading').style.display = 'none';
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

  function renderCalendar() {
    const content = document.getElementById('mcz-content');

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
        const dateStr = `${calendarYear}年${calendarMonth + 1}月${day}日`;
        const evHtml = evs.map(ev => `
          <div class="mcz-event-item">
            <span class="mcz-cat mcz-cat-${ev.category.toLowerCase()}">${escapeHtml(ev.category)}</span>
            <div class="mcz-event-body">
              <div class="mcz-event-title">${escapeHtml(ev.title)}</div>
              ${ev.bodyHtml ? `<div class="mcz-event-text">${sanitizeBodyHtml(ev.bodyHtml)}</div>` : ''}
            </div>
          </div>`).join('');
        wrap.innerHTML = `
          <div class="mcz-cal-popover">
            <div class="mcz-cal-popover-header">
              <span>${escapeHtml(dateStr)}</span>
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
  function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.sync.get(DEFAULT_SETTINGS, result => resolve(result));
    });
  }

  function detectThemeColor() {
    const cssVarColor = detectThemeColorFromCssVars();
    if (cssVarColor) return cssVarColor;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && normalizeColor(meta.content)) return normalizeColor(meta.content);

    const selectors = [
      'header', '.header', '#header', '.site-header', '.global-header',
      '.l-header', '.g-header', '.gHeader', '.main-header',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const styles = getComputedStyle(el);
      const bg = styles.backgroundColor;
      const color = normalizeColor(bg);
      if (color && !isNearWhite(color) && !isTransparent(bg)) return color;
      const fromGradient = extractGradientColor(styles.backgroundImage);
      if (fromGradient) return fromGradient;
    }

    const bodyColor = normalizeColor(getComputedStyle(document.body).backgroundColor);
    if (bodyColor && !isNearWhite(bodyColor)) return bodyColor;

    const link = document.querySelector('a');
    if (link) {
      const linkColor = normalizeColor(getComputedStyle(link).color);
      if (linkColor && !isNearWhite(linkColor)) return linkColor;
    }
    return null;
  }

  function detectThemeColorFromCssVars() {
    const styles = getComputedStyle(document.documentElement);
    const candidates = [
      '--theme-color',
      '--primary',
      '--primary-color',
      '--color-primary',
      '--main',
      '--main-color',
      '--accent',
      '--accent-color',
      '--brand',
      '--brand-color',
    ];
    for (const name of candidates) {
      const value = styles.getPropertyValue(name).trim();
      const normalized = normalizeColor(value);
      if (normalized && !isNearWhite(normalized)) return normalized;
    }
    return null;
  }

  function extractGradientColor(value) {
    if (!value || value === 'none') return null;
    const rgbMatch = value.match(/rgba?\([^)]+\)/i);
    if (rgbMatch) return normalizeColor(rgbMatch[0]);
    const hexMatch = value.match(/#(?:[0-9a-fA-F]{3}){1,2}/);
    if (hexMatch) return normalizeHex(hexMatch[0]);
    return null;
  }

  function applyThemePalette(baseHex) {
    const palette = buildPalette(baseHex);
    const root = document.documentElement.style;
    Object.entries(palette).forEach(([key, value]) => {
      root.setProperty(`--mcz-${key}`, value);
    });
  }

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
    btn.addEventListener('click', () => {
      chrome.storage.sync.set({ enabled: true }, () => {
        location.reload();
      });
    });
  }

  function buildPalette(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return {};
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const primary = rgbToHex(rgb.r, rgb.g, rgb.b);
    const primaryDark = hslToHex(hsl.h, hsl.s, clamp(hsl.l - 10, 15, 60));
    const primaryDarker = hslToHex(hsl.h, hsl.s, clamp(hsl.l - 20, 10, 55));
    const primaryLight = hslToHex(hsl.h, clamp(hsl.s + 4, 40, 90), clamp(hsl.l + 12, 40, 85));
    const primarySoft = hslToHex(hsl.h, clamp(hsl.s - 20, 15, 55), clamp(hsl.l + 35, 75, 97));
    const primaryPale = hslToHex(hsl.h, clamp(hsl.s - 35, 8, 35), clamp(hsl.l + 44, 88, 99));
    const primaryBorder = hslToHex(hsl.h, clamp(hsl.s - 25, 10, 45), clamp(hsl.l + 28, 70, 90));
    const primaryMuted = hslToHex(hsl.h, clamp(hsl.s - 10, 20, 60), clamp(hsl.l - 5, 30, 70));
    return {
      primary,
      'primary-dark': primaryDark,
      'primary-darker': primaryDarker,
      'primary-light': primaryLight,
      'primary-soft': primarySoft,
      'primary-pale': primaryPale,
      'primary-border': primaryBorder,
      'primary-muted': primaryMuted,
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeColor(value) {
    if (!value || typeof value !== 'string') return null;
    const v = value.trim();
    if (v.startsWith('#')) return normalizeHex(v);
    const rgbMatch = v.match(/^rgba?\(([^)]+)\)$/i);
    if (!rgbMatch) return null;
    const parts = rgbMatch[1].split(',').map(p => p.trim());
    if (parts.length < 3) return null;
    const r = parseInt(parts[0], 10);
    const g = parseInt(parts[1], 10);
    const b = parseInt(parts[2], 10);
    if ([r, g, b].some(n => Number.isNaN(n))) return null;
    return rgbToHex(r, g, b);
  }

  function normalizeHex(hex) {
    const h = hex.replace('#', '').trim();
    if (h.length === 3) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
    }
    if (h.length === 6) return `#${h.toLowerCase()}`;
    return null;
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return null;
    const value = normalized.replace('#', '');
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
        case gn: h = (bn - rn) / d + 2; break;
        case bn: h = (rn - gn) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function hslToRgb(h, s, l) {
    const sn = s / 100;
    const ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = ln - c / 2;
    let rn = 0;
    let gn = 0;
    let bn = 0;

    if (h < 60) { rn = c; gn = x; bn = 0; }
    else if (h < 120) { rn = x; gn = c; bn = 0; }
    else if (h < 180) { rn = 0; gn = c; bn = x; }
    else if (h < 240) { rn = 0; gn = x; bn = c; }
    else if (h < 300) { rn = x; gn = 0; bn = c; }
    else { rn = c; gn = 0; bn = x; }

    return {
      r: Math.round((rn + m) * 255),
      g: Math.round((gn + m) * 255),
      b: Math.round((bn + m) * 255),
    };
  }

  function isNearWhite(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    return rgb.r > 235 && rgb.g > 235 && rgb.b > 235;
  }

  function isTransparent(value) {
    if (!value) return false;
    if (value === 'transparent') return true;
    const match = value.match(/^rgba?\(([^)]+)\)$/i);
    if (!match) return false;
    const parts = match[1].split(',').map(p => p.trim());
    if (parts.length < 4) return false;
    const alpha = parseFloat(parts[3]);
    return !Number.isNaN(alpha) && alpha === 0;
  }

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
    const toggle = document.getElementById('mcz-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        chrome.storage.sync.set({ enabled: false }, () => {
          location.reload();
        });
      });
    }

    document.getElementById('mcz-filters').addEventListener('click', e => {
      const btn = e.target.closest('.mcz-filter-btn');
      if (!btn) return;
      activeFilter = btn.dataset.cat;
      document.querySelectorAll('.mcz-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEvents();
    });

    document.getElementById('mcz-view-toggle').addEventListener('click', e => {
      const btn = e.target.closest('.mcz-view-btn');
      if (!btn) return;
      activeView = btn.dataset.view;
      document.querySelectorAll('.mcz-view-btn').forEach(b => b.classList.remove('active'));
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
