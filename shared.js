'use strict';

// ─── 共通定数 ────────────────────────────────────────────────
// content.js / popup.js / background.js で共有する定数・関数

const MCZ_DEFAULT_SETTINGS = { enabled: true, monthsToFetch: 4 };
const MCZ_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3時間

// ─── スケジュール取得・パース ─────────────────────────────────
async function mczFetchMonth(year, month) {
  const mm = String(month).padStart(2, '0');
  const url = `https://www.momoclo.net/schedule?target_year=${year}&target_month=${mm}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const events = [];
    doc.querySelectorAll('.schedule_list_container').forEach(el => {
      const dayText = el.querySelector('.schedule_list_day')?.textContent.trim();
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
      events.push({ date, day, category, title, bodyHtml, link });
    });
    return events;
  } catch (_) {
    return [];
  }
}

// ─── 設定読み込み ─────────────────────────────────────────────
function mczLoadSettings() {
  return new Promise(resolve => {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
        chrome.storage.sync.get(MCZ_DEFAULT_SETTINGS, resolve);
      } else {
        resolve(MCZ_DEFAULT_SETTINGS);
      }
    } catch (_) {
      resolve(MCZ_DEFAULT_SETTINGS);
    }
  });
}

// ─── ユーティリティ ──────────────────────────────────────────
function mczEscapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
