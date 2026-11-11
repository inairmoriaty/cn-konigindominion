/* ============================================================
 *  wordcount.js  —  KÖNIGIN 全站统一字数统计
 *
 *  数据源：每个章节 HTML 里的 .content-area
 *  统计规则：
 *   - 中文汉字 1 个 1 字
 *   - 连续英文字母视为 1 个英文词
 *   - 连续数字视为 1 个数字单位
 *   - 标点、空白、HTML/CSS/JS 一律不计
 *
 *  自动装饰：
 *   - .chapter-list .chapter-btn     → 替换 / 创建 .rd-chip 显示字数
 *   - .work-card .work-meta-info     → 追加「· 共 X,XXX 字」
 *
 *  公开接口：window.KGWordCount = { count, forUrl, forLink }
 * ============================================================ */
(function () {
  if (window.KGWordCount) return;

  // ---------- 1. 纯字数计算 ----------
  function count(text) {
    if (!text) return 0;
    const cn  = (text.match(/[一-鿿]/g) || []).length;
    const en  = (text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || []).length;
    const num = (text.match(/\d+/g) || []).length;
    return cn + en + num;
  }

  // ---------- 2. 带缓存的章节 fetch ----------
  const urlCache = new Map();            // url -> number | null | Promise
  const docCache = new Map();            // url -> Document promise

  async function fetchDoc(url) {
    if (docCache.has(url)) return docCache.get(url);
    const p = fetch(url, { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(html => new DOMParser().parseFromString(html, 'text/html'));
    docCache.set(url, p);
    return p;
  }

  async function forUrl(url) {
    if (urlCache.has(url)) return urlCache.get(url);
    const p = (async () => {
      try {
        const doc = await fetchDoc(url);
        const nodes = doc.querySelectorAll('.content-area');
        if (!nodes.length) return null;
        // 多个 .content-area 合并计数（一般只有 1 个）
        let total = 0;
        nodes.forEach(n => { total += count(n.textContent || ''); });
        return total;
      } catch (e) {
        console.warn('[wordcount] failed:', url, e);
        return null;
      }
    })();
    urlCache.set(url, p);
    const n = await p;
    urlCache.set(url, n);
    return n;
  }

  // ---------- 3. 识别 catalog vs 单篇 ----------
  function isCatalogUrl(url) {
    return /catalog\.html(?:[?#].*)?$/i.test(url);
  }

  /** 给定一个作品的 link（可能是 catalog 或单篇），返回总字数 */
  async function forLink(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.href).href;
      if (!isCatalogUrl(url)) return forUrl(url);

      // catalog：读取所有 .chapter-btn[data-chapter] 对应的 chapterN.html
      const doc = await fetchDoc(url);
      const btns = Array.from(doc.querySelectorAll('.chapter-list .chapter-btn[data-chapter]'));
      if (!btns.length) return null;
      const base = url.replace(/[^/]*$/, '');
      const urls = btns.map(b => base + 'chapter' + b.getAttribute('data-chapter') + '.html');
      const counts = await Promise.all(urls.map(forUrl));
      const valid = counts.filter(n => typeof n === 'number');
      if (!valid.length) return null;
      return valid.reduce((a, b) => a + b, 0);
    } catch (e) {
      console.warn('[wordcount] forLink failed:', href, e);
      return null;
    }
  }

  // ---------- 4. 格式化 ----------
  function fmt(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '暂无数据';
    return n.toLocaleString('en-US') + ' 字';
  }

  // ---------- 5. 自动装饰：catalog 页逐章字数 ----------
  function decorateCatalogChapters() {
    const btns = Array.from(document.querySelectorAll('.chapter-list .chapter-btn[data-chapter]'));
    if (!btns.length) return;
    const base = location.pathname.replace(/[^/]*$/, '');

    btns.forEach(btn => {
      const n = btn.getAttribute('data-chapter');
      if (!n) return;
      const url = base + 'chapter' + n + '.html';

      // 复用或创建右侧 chip
      let chip = btn.querySelector('.rd-chip');
      if (!chip) {
        chip = document.createElement('span');
        chip.className = 'rd-chip';
        btn.appendChild(chip);
      }
      chip.textContent = '…';
      chip.style.opacity = '.55';

      forUrl(url).then(c => {
        chip.textContent = fmt(c);
        chip.style.opacity = '';
      });
    });
  }

  // ---------- 6. 自动装饰：角色页作品卡字数 ----------
  function decorateWorkCards() {
    const cards = Array.from(document.querySelectorAll('.work-card'));
    if (!cards.length) return;

    cards.forEach(card => {
      // 避免二次处理
      if (card.dataset.kgWcDone) return;
      card.dataset.kgWcDone = '1';

      // 作品链接：优先 .read-button[href]，否则 onclick 里的字符串
      let href = card.querySelector('a.read-button, a[href]')?.getAttribute('href') || '';
      if (!href) {
        const m = (card.getAttribute('onclick') || '').match(/['"]([^'"]+?)['"]/);
        if (m) href = m[1];
      }
      if (!href) return;

      const info = card.querySelector('.work-meta-info');
      if (!info) return;

      // 占位：·  共 … 字
      const placeholder = document.createElement('span');
      placeholder.className = 'kg-wc';
      placeholder.textContent = ' · 共 … 字';
      placeholder.style.opacity = '.55';
      info.appendChild(placeholder);

      forLink(href).then(total => {
        placeholder.style.opacity = '';
        placeholder.textContent = typeof total === 'number'
          ? ' · 共 ' + total.toLocaleString('en-US') + ' 字'
          : ' · 暂无数据';
      });
    });
  }

  // ---------- 7. 启动 ----------
  function run() {
    try { decorateCatalogChapters(); } catch (e) { console.warn('[wordcount] catalog decorate:', e); }
    try { decorateWorkCards();       } catch (e) { console.warn('[wordcount] card decorate:',   e); }

    // 角色页的作品卡是 JS 渲染出来的，监听 DOM 变化再装饰一次
    const target = document.getElementById('works-container') || document.body;
    const mo = new MutationObserver(() => decorateWorkCards());
    try { mo.observe(target, { childList: true, subtree: true }); } catch (_) {}
    // 60 秒后停观察避免长期开销
    setTimeout(() => mo.disconnect(), 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  window.KGWordCount = { count, forUrl, forLink, fmt };
})();
