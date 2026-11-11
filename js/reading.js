/* ============================================================
 * reading.js  —  KÖNIGIN 统一阅读页逻辑
 * - 顶部进度条
 * - 滚动位置自动保存 / 自动续读（localStorage，按 URL 独立）
 * - 浮动工具栏：主题切换 / 字号 / 回首页
 * - 正文图片在 reading.css 里以 CSS 隐藏，这里不做 DOM 改动
 * - 不依赖任何章节 metadata；没有 prev/next 数据时就不显示
 * ============================================================ */
(function () {
  if (window.__kgReadingReady) return;
  window.__kgReadingReady = true;

  const root = document.documentElement;
  root.classList.add('rd-ready');

  const STORAGE_KEY_PREFIX = 'kg_read_';
  const THEME_KEY  = 'kg_reading_theme';
  const FONT_KEY   = 'kg_reading_font';
  const SAVE_DEBOUNCE_MS = 400;

  const articleKey = () => STORAGE_KEY_PREFIX + location.pathname;

  // ---------- 主题 + 字号偏好 ----------
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark' || savedTheme === 'warm') {
    root.setAttribute('data-reading-theme', savedTheme);
  }
  const savedFont = parseFloat(localStorage.getItem(FONT_KEY));
  if (!Number.isNaN(savedFont) && savedFont >= 14 && savedFont <= 26) {
    root.style.setProperty('--rd-font-size', savedFont + 'px');
  }

  // ---------- DOM ready ----------
  function onReady(cb){
    if (document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', cb, { once: true });
    } else cb();
  }

  onReady(() => {
    // 识别页面类型
    const isCatalog = !!document.querySelector('.chapter-list .chapter-btn');
    if (isCatalog) root.classList.add('rd-catalog');

    // 1) 进度条（目录页不需要）
    const bar = document.createElement('div');
    bar.className = 'rd-progress';
    bar.innerHTML = '<i></i>';
    document.body.appendChild(bar);
    const barInner = bar.firstElementChild;

    // 2) 工具栏（最小化：主题 / 字号− / 字号+ / 首页）
    const tb = document.createElement('div');
    tb.className = 'rd-toolbar';
    tb.setAttribute('aria-label', 'Reading toolbar');
    tb.innerHTML = `
      <button type="button" class="rd-theme"       title="切换主题"  aria-label="切换主题"></button>
      <span class="rd-sep"></span>
      <button type="button" class="rd-font-minus"  title="字号减小"  aria-label="字号减小">A</button>
      <button type="button" class="rd-font-plus"   title="字号增大"  aria-label="字号增大">A</button>
      <span class="rd-sep"></span>
      <button type="button" class="rd-home"        title="返回首页"  aria-label="返回首页">⌂</button>
    `;
    document.body.appendChild(tb);

    tb.querySelector('.rd-theme').addEventListener('click', () => {
      const cur = root.getAttribute('data-reading-theme') === 'dark' ? 'warm' : 'dark';
      root.setAttribute('data-reading-theme', cur);
      localStorage.setItem(THEME_KEY, cur);
    });

    function bumpFont(delta){
      const cs = parseFloat(getComputedStyle(root).getPropertyValue('--rd-font-size')) || 18;
      const next = Math.min(26, Math.max(14, cs + delta));
      root.style.setProperty('--rd-font-size', next + 'px');
      localStorage.setItem(FONT_KEY, String(next));
    }
    tb.querySelector('.rd-font-plus').addEventListener('click',  () => bumpFont( 1));
    tb.querySelector('.rd-font-minus').addEventListener('click', () => bumpFont(-1));

    tb.querySelector('.rd-home').addEventListener('click', () => {
      // 相对路径兜底，兼容各个层级的文章
      const path = location.pathname;
      const depth = (path.split('/').length - 2); // 粗略估算：/x/y/z.html -> 2
      location.href = '../'.repeat(Math.max(depth, 1)) + 'page/home.html';
    });

    // 3) 把老的 .article-container 内的滚动吞回 body
    //    （老模板自身是 overflow:auto 的内盒，JS 不要和它打架）
    const scrollEl = document.scrollingElement || document.documentElement;

    function docHeight(){
      return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    }
    function viewH(){
      return window.innerHeight || document.documentElement.clientHeight;
    }
    function currentPct(){
      const total = docHeight() - viewH();
      if (total <= 0) return 0;
      return Math.min(1, Math.max(0, scrollEl.scrollTop / total));
    }

    // 4) 保存 / 读取进度
    function readProgress(){
      try {
        const raw = localStorage.getItem(articleKey());
        return raw ? JSON.parse(raw) : null;
      } catch (_){ return null; }
    }
    function saveProgress(){
      const data = {
        y:  scrollEl.scrollTop,
        p:  currentPct(),
        t:  Date.now(),
        h:  docHeight()
      };
      try { localStorage.setItem(articleKey(), JSON.stringify(data)); } catch (_){}
    }

    // 5) 自动续读提示（目录页跳过）
    const resumed = isCatalog ? null : readProgress();
    if (resumed && resumed.p > 0.03 && resumed.p < 0.97) {
      // 轻量级横幅：短暂显示，用户按继续阅读 → 滚过去
      const banner = document.createElement('div');
      banner.className = 'rd-resume';
      const pct = Math.round(resumed.p * 100);
      banner.innerHTML = `
        <span class="resume-text">继续上次阅读 · 已阅读 <b>${pct}%</b></span>
        <button type="button">CONTINUE</button>
      `;
      // 插入到 body 顶部（会被 rd-shell 包裹的 meta 可能还不存在）
      document.body.insertBefore(banner, document.body.firstChild);
      requestAnimationFrame(() => banner.classList.add('show'));

      banner.querySelector('button').addEventListener('click', () => {
        scrollEl.scrollTo({ top: resumed.y, behavior: 'smooth' });
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 400);
      });
      // 8 秒后自动淡出（不会强制滚）
      setTimeout(() => {
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 400);
      }, 8000);
    }

    // 6) 滚动监听：进度条 + 防抖保存
    let saveTimer = null;
    let rafId = null;
    function onScroll(){
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        barInner.style.width = (currentPct() * 100).toFixed(2) + '%';
      });
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(saveProgress, SAVE_DEBOUNCE_MS);
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // 7) 离开 / 隐藏时立即保存
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveProgress();
    });
    window.addEventListener('pagehide', saveProgress);
    window.addEventListener('beforeunload', saveProgress);

    // 8) 初始绘制
    requestAnimationFrame(() => {
      barInner.style.width = (currentPct() * 100).toFixed(2) + '%';
    });

    // 9) 目录页：读取每章在 localStorage 里的进度，标出已读 / 最近在看
    if (isCatalog) {
      decorateCatalog();
    }
  });

  // ---------- 目录页装饰：显示已读百分比 + 当前章节 ----------
  function decorateCatalog(){
    const btns = Array.from(document.querySelectorAll('.chapter-list .chapter-btn'));
    if (!btns.length) return;

    const base = location.pathname.replace(/[^/]*$/, ''); // 同目录
    let mostRecent = { btn: null, t: 0 };

    btns.forEach((btn) => {
      const n = btn.getAttribute('data-chapter');
      if (!n) return;
      // 猜测章节 URL：和 catalog 现有跳转一致 → chapterN.html
      const chapterPath = base + 'chapter' + n + '.html';
      const key = STORAGE_KEY_PREFIX + chapterPath;
      let data = null;
      try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch(_){}

      const chip = document.createElement('span');
      chip.className = 'rd-chip';

      if (data && data.p != null) {
        const pct = Math.round(data.p * 100);
        if (pct >= 97) {
          btn.classList.add('is-read');
          chip.textContent = 'READ';
        } else if (pct >= 3) {
          chip.textContent = pct + '%';
        } else {
          chip.textContent = 'NEW';
          chip.style.opacity = '.45';
        }
        if (data.t > mostRecent.t) {
          mostRecent = { btn, t: data.t };
        }
      } else {
        chip.textContent = 'NEW';
        chip.style.opacity = '.45';
      }
      btn.appendChild(chip);
    });

    if (mostRecent.btn) {
      mostRecent.btn.classList.add('is-current');
      // 轻微滚到可见位置
      setTimeout(() => {
        try {
          mostRecent.btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch(_){}
      }, 200);
    }
  }
})();
