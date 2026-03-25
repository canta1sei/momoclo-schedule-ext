'use strict';

importScripts('shared.js');

const ALARM_NAME = 'mcz-daily-reminder';
const DEFAULT_NOTIFY_HOUR = 8; // 毎朝8時

// ─── アラームのスケジュール登録 ─────────────────────────────
function scheduleAlarm(hour) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // 今日の指定時刻を過ぎていたら翌日

  chrome.alarms.create(ALARM_NAME, {
    when: next.getTime(),
    periodInMinutes: 24 * 60,
  });
}

// ─── インストール時・設定変更時にアラームを再登録 ───────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(
    { notifyEnabled: true, notifyHour: DEFAULT_NOTIFY_HOUR },
    ({ notifyEnabled, notifyHour }) => {
      if (notifyEnabled) scheduleAlarm(notifyHour);
    }
  );
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (!('notifyEnabled' in changes) && !('notifyHour' in changes)) return;

  chrome.storage.sync.get(
    { notifyEnabled: true, notifyHour: DEFAULT_NOTIFY_HOUR },
    ({ notifyEnabled, notifyHour }) => {
      chrome.alarms.clear(ALARM_NAME, () => {
        if (notifyEnabled) scheduleAlarm(notifyHour);
      });
    }
  );
});

// ─── fetch & parse ─────────────────────────────────────────
async function fetchEventsForDate(year, month, targetDay) {
  const events = await mczFetchMonth(year, month);
  return events.filter(e => e.day === targetDay);
}

// ─── 通知送信 ───────────────────────────────────────────────
function sendNotification(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 1,
  });
}

// ─── アラーム発火時の処理 ───────────────────────────────────
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const [todayEvents, tomorrowEvents] = await Promise.all([
    fetchEventsForDate(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    fetchEventsForDate(tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate()),
  ]);

  if (todayEvents.length > 0) {
    const titles = todayEvents.map(e => `[${e.category}] ${e.title}`).join('\n');
    sendNotification('mcz-today', `🌸 今日のももクロ (${todayEvents.length}件)`, titles);
  }

  if (tomorrowEvents.length > 0) {
    const titles = tomorrowEvents.map(e => `[${e.category}] ${e.title}`).join('\n');
    sendNotification('mcz-tomorrow', `🌸 明日のももクロ (${tomorrowEvents.length}件)`, titles);
  }
});
