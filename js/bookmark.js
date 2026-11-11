/* ============================================================
 *  bookmark.js —— KÖNIGIN 阅读页「文字选中书签」
 *  - 长按 / 鼠标选中 .content-area 文字 → 气泡「+ 书签」
 *  - 工具栏第 5 个按钮：打开书签面板（查看 / 跳转 / 删除）
 *  - 跳转：带 ?bm=<id> 回到原章节 → 按 offset / context 重新定位 → 高亮闪一下
 *  - 存储：localStorage['kg_bookmarks'] = BookmarkItem[]
 *  - 与 reading.js 的阅读进度（kg_read_）彼此独立
 * ============================================================ */
(function () {
  if (window.KGBookmark) return;

  const KEY = 'kg_bookmarks';

  // ---------- 存取 ----------
  const uid  = () => 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {} };

  // ---------- 作品 / 章节识别 ----------
  function workAndChapter() {
    const parts = location.pathname.replace(/\.html$/i, '').split('/').filter(Boolean);
    const i = parts.indexOf('article');
    let workId = parts[parts.length - 1] || 'unknown';
    let chapterId = null;
    if (i >= 0) {
      if (parts[i + 3]) { workId = parts[i + 2]; chapterId = parts[i + 3]; }
      else if (parts[i + 2]) { workId = parts[i + 2]; chapterId = null; }
    }
    return { workId, chapterId };
  }
  function workName()    { return (document.title || '').replace(/^KÖNIGIN\s*[-·]\s*/i, '').trim() || workAndChapter().workId; }
  function chapterName() { const el = document.querySelector('.chapter-title, h1'); return el ? el.textContent.trim() : ''; }
  function contentArea() { return document.querySelector('.content-area'); }

  // ---------- 字符偏移量 ----------
  function selectionOffset() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const ca = contentArea();
    if (!ca || !ca.contains(range.commonAncestorContainer)) return null;
    const text = sel.toString();
    if (!text || text.trim().length < 1) return null;
    const pre = document.createRange();
    pre.selectNodeContents(ca);
    pre.setEnd(range.startContainer, range.startOffset);
    return { start: pre.toString().length, length: text.length, text };
  }

  function addFromSelection() {
    const off = selectionOffset();
    if (!off) return null;
    const ca = contentArea();
    const full = ca ? ca.textContent : '';
    const prefix = full.slice(Math.max(0, off.start - 24), off.start);
    const suffix = full.slice(off.start + off.length, off.start + off.length + 24);
    const wc = workAndChapter();
    const item = {
      id: uid(),
      workId: wc.workId, workName: workName(),
      chapterId: wc.chapterId, chapterName: chapterName(),
      url: location.pathname + location.search,
      offset: off.start, length: off.length,
      textContent: off.text,
      snippet: off.text.length > 90 ? off.text.slice(0, 90) + '…' : off.text,
      prefix, suffix,
      createdAt: Date.now()
    };
    const list = load();
    list.push(item);
    save(list);
    return item;
  }

  // ---------- 气泡「+ 书签」 ----------
  let bubble = null;
  function ensureBubble() {
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.className = 'kg-bm-bubble';
    bubble.innerHTML = '<button type="button">+ 书签</button>';
    bubble.querySelector('button').addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const b = addFromSelection();
      hideBubble();
      if (b) toast('已添加至书签');
    });
    // 触屏上 mousedown 可能被系统选择菜单吞 → 加 touchend 兜底
    bubble.querySelector('button').addEventListener('touchend', (e) => {
      e.preventDefault(); e.stopPropagation();
      const b = addFromSelection();
      hideBubble();
      if (b) toast('已添加至书签');
    });
    document.body.appendChild(bubble);
    return bubble;
  }
  function showBubble() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return hideBubble();
    const ca = contentArea();
    if (!ca || !ca.contains(sel.anchorNode)) return hideBubble();
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return hideBubble();
    const bEl = ensureBubble();
    bEl.classList.add('show');
    const W = bEl.offsetWidth || 88;
    let left = rect.left + rect.width / 2 - W / 2 + window.scrollX;
    let top  = rect.top - 44 + window.scrollY;
    if (top < window.scrollY + 8) top = rect.bottom + 8 + window.scrollY;
    left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + window.innerWidth - W - 8));
    bEl.style.left = left + 'px';
    bEl.style.top  = top + 'px';
  }
  function hideBubble() { if (bubble) bubble.classList.remove('show'); }

  // ---------- Toast ----------
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'kg-bm-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  // ---------- 面板 ----------
  function esc(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtDate(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function showPanel() {
    document.querySelector('.kg-bm-panel')?.remove();
    const list = load().slice().sort((a, b) => b.createdAt - a.createdAt);
    const panel = document.createElement('div');
    panel.className = 'kg-bm-panel';
    panel.innerHTML = `
      <div class="kg-bm-mask"></div>
      <aside class="kg-bm-sheet" role="dialog" aria-modal="true" aria-labelledby="kgBmTitle">
        <header>
          <div>
            <h2 id="kgBmTitle">MY BOOKMARKS</h2>
            <span class="kg-bm-zh">我的书签</span>
          </div>
          <button class="kg-bm-close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="kg-bm-list">
          ${list.length
            ? list.map(b => `
              <article class="kg-bm-item" data-id="${esc(b.id)}">
                <h3>${esc(b.workName)}${b.chapterName ? ' · ' + esc(b.chapterName) : ''}</h3>
                <blockquote>「${esc(b.snippet)}」</blockquote>
                <footer>
                  <span class="date">${fmtDate(b.createdAt)}</span>
                  <a href="#" class="go" data-go="${esc(b.id)}">跳转至原文 →</a>
                  <button type="button" class="del" data-del="${esc(b.id)}">删除</button>
                </footer>
              </article>`).join('')
            : '<p class="kg-bm-empty">这里还没有留下任何书签。</p>'}
        </div>
      </aside>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('open'));

    const close = () => { panel.classList.remove('open'); setTimeout(() => panel.remove(), 300); };
    panel.querySelector('.kg-bm-mask').addEventListener('click', close);
    panel.querySelector('.kg-bm-close').addEventListener('click', close);

    panel.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', (e) => {
      e.preventDefault();
      const id = el.dataset.go;
      const item = load().find(x => x.id === id);
      if (!item) return;
      const sep = item.url.includes('?') ? '&' : '?';
      location.href = item.url + sep + 'bm=' + encodeURIComponent(id);
    }));
    panel.querySelectorAll('[data-del]').forEach(el => el.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!confirm('删除这条书签？')) return;
      save(load().filter(x => x.id !== el.dataset.del));
      el.closest('.kg-bm-item')?.remove();
      if (!panel.querySelector('.kg-bm-item')) {
        panel.querySelector('.kg-bm-list').innerHTML = '<p class="kg-bm-empty">这里还没有留下任何书签。</p>';
      }
    }));
  }

  // ---------- 跳转定位 + 高亮 ----------
  function resumeFromUrl() {
    const m = /[?&]bm=([^&]+)/.exec(location.search);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    const b = load().find(x => x.id === id);
    if (!b) return;
    tryLocate(b, 0);
  }
  function tryLocate(b, attempt) {
    const ca = contentArea();
    if (!ca || !ca.textContent) {
      if (attempt < 30) return setTimeout(() => tryLocate(b, attempt + 1), 120);
      return;
    }
    const full = ca.textContent;
    let start = -1;
    if (b.textContent && full.slice(b.offset, b.offset + b.length) === b.textContent) {
      start = b.offset;
    } else if (b.textContent) {
      const needle = (b.prefix || '') + b.textContent + (b.suffix || '');
      const idx = full.indexOf(needle);
      if (idx >= 0) start = idx + (b.prefix || '').length;
      else start = full.indexOf(b.textContent);
    }
    if (start < 0) { toast('原文位置可能已发生变化。'); return; }
    const range = rangeFromOffset(ca, start, b.textContent.length);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    window.scrollTo({ top: rect.top + window.scrollY - window.innerHeight / 3, behavior: 'smooth' });
    highlightRange(range);
  }
  function rangeFromOffset(container, start, length) {
    const end = start + length;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let pos = 0, startNode = null, startOff = 0, endNode = null, endOff = 0, node;
    while ((node = walker.nextNode())) {
      const next = pos + node.nodeValue.length;
      if (!startNode && start >= pos && start <= next) { startNode = node; startOff = start - pos; }
      if (endNode == null && end >= pos && end <= next) { endNode = node; endOff = end - pos; break; }
      pos = next;
    }
    if (!startNode || !endNode) return null;
    try { const r = document.createRange(); r.setStart(startNode, startOff); r.setEnd(endNode, endOff); return r; }
    catch (_) { return null; }
  }
  function highlightRange(range) {
    try {
      const span = document.createElement('span');
      span.className = 'kg-bm-flash';
      range.surroundContents(span);
      setTimeout(() => {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
      }, 3600);
    } catch (_) { /* 跨块选区 surroundContents 会失败，静默 */ }
  }

  // ---------- 工具栏第 5 按钮 ----------
  function installToolbarButton() {
    const tb = document.querySelector('.rd-toolbar');
    if (!tb || tb.querySelector('.rd-bookmark')) return true;
    const sep = document.createElement('span'); sep.className = 'rd-sep';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rd-bookmark';
    btn.title = '书签'; btn.setAttribute('aria-label', '书签');
    tb.appendChild(sep);
    tb.appendChild(btn);
    btn.addEventListener('click', showPanel);
    return true;
  }
  function pollForToolbar() {
    if (installToolbarButton()) return;
    const mo = new MutationObserver(() => { if (installToolbarButton()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 10000);
  }

  // ---------- 选择监听 ----------
  function initSelection() {
    const handler = () => setTimeout(showBubble, 10);
    document.addEventListener('mouseup', handler);
    document.addEventListener('touchend', handler);
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) hideBubble();
    });
    document.addEventListener('mousedown', (e) => {
      if (bubble && bubble.contains(e.target)) return;
      hideBubble();
    });
  }

  function run() {
    pollForToolbar();
    initSelection();
    resumeFromUrl();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  window.KGBookmark = { showPanel, add: addFromSelection, list: load };
})();
