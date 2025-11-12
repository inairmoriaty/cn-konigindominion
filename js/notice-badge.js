(function () {
    const SITE_KEY = location.hostname.includes('vip.cn.') ? 'vipcn' : 'cn';
    const STORAGE_KEY = `notification_last_seen_version_${SITE_KEY}`;
    const JSON_URL = '/page/public/notification.json'; // 按你的真实路径
  
    const dot = document.getElementById('notification-dot');
    const link = document.getElementById('notification-link');
  
    fetch(`${JSON_URL}?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('notification.json not found'))))
      .then(data => {
        // 兼容两种结构：有 version；或没有 version 但 items[0].id/ date 可用
        let latest = (data && data.version) ? String(data.version).trim() : '';
        if (!latest && Array.isArray(data?.items) && data.items.length) {
          latest = String(data.items[0].id || data.items[0].date || '').trim();
        }
        if (!latest) return;
  
        const seen = localStorage.getItem(STORAGE_KEY) || '';
        if (seen !== latest && dot) dot.style.display = 'inline-block';
  
        if (link) {
          link.addEventListener('click', () => {
            try { localStorage.setItem(STORAGE_KEY, latest); } catch { /* ignore */ }
          });
        }
  
        // 如果当前就是通知页，直接标记已读并隐藏红点
        if (
          location.pathname.endsWith('/page/public/notification.html') ||
          location.pathname.endsWith('/notification.html')
        ) {
          try { localStorage.setItem(STORAGE_KEY, latest); } catch { /* ignore */ }
          if (dot) dot.style.display = 'none';
        }
      })
      .catch(() => { /* 静默失败即可 */ });
  })();
  