'use strict';

const DEFAULT_MONTHS = 4;
const DEFAULT_NOTIFY_HOUR = 8;

// 保存済みの値をロード
chrome.storage.sync.get(
  { monthsToFetch: DEFAULT_MONTHS, notifyEnabled: true, notifyHour: DEFAULT_NOTIFY_HOUR },
  result => {
    document.getElementById('months').value = result.monthsToFetch;
    document.getElementById('notify-enabled').checked = result.notifyEnabled;
    document.getElementById('notify-hour').value = result.notifyHour;
    updateNotifySubVisibility(result.notifyEnabled);
  }
);

// チェックボックス変更で通知時刻選択の表示切り替え
document.getElementById('notify-enabled').addEventListener('change', e => {
  updateNotifySubVisibility(e.target.checked);
});

function updateNotifySubVisibility(enabled) {
  document.getElementById('notify-sub').style.opacity = enabled ? '1' : '0.4';
  document.getElementById('notify-hour').disabled = !enabled;
}

// 保存ボタン
document.getElementById('save').addEventListener('click', () => {
  const months = parseInt(document.getElementById('months').value, 10);
  const notifyEnabled = document.getElementById('notify-enabled').checked;
  const notifyHour = parseInt(document.getElementById('notify-hour').value, 10);

  chrome.storage.sync.set({ monthsToFetch: months, notifyEnabled, notifyHour }, () => {
    const status = document.getElementById('status');
    status.textContent = '✅ 保存しました！';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});
