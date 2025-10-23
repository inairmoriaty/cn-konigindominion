// /js/sidebar.js
console.log('Sidebar.js loaded');

let __sidebarInited = false;

function initSidebar() {
  if (__sidebarInited) {
    console.log('Sidebar already initialized, skip');
    return;
  }
  __sidebarInited = true;

  // 统一使用根相对路径
  const iconPath       = '/svg/sidebar/';
  const publicPath     = '/page/public/public.html';
  const renderPath     = '/page/public/render.html';
  const commissionPath = '/page/public/commission.html'; // ★ 新增

  // 侧边栏结构
  const sidebarHTML = `
  <div class="sidebar-overlay" id="sidebarOverlay">
    <div class="sidebar-container" id="sidebarContainer">
      <div class="sidebar-content" id="sidebarContent">
        <div class="sidebar-logo"></div>
        <div class="sidebar-buttons">
          <a href="${publicPath}" class="sidebar-btn" id="sidebarPublicLink">
            <img src="${iconPath}public_btn.svg" alt="Public" />
            <span>公开篇目</span>
          </a>
          <a href="${renderPath}" class="sidebar-btn">
            <img src="${iconPath}render_btn.svg" alt="Render" />
            <span>图集存放</span>
          </a>
          <!-- ★ 新增：合作联系 -->
          <a href="${commissionPath}" class="sidebar-btn" id="sidebarCommissionLink">
            <!-- 你也可以换成 /svg/sidebar/commission_btn.svg -->
            <img src="/img/commission.png" alt="Commission" />
            <span>合作联系</span>
          </a>
        </div>
      </div>

      <!-- 二级面板：覆盖同尺寸容器，默认隐藏 -->
      <section class="characters-panel" id="charactersPanel" aria-hidden="true">
        <div class="characters-inner">
          <h2 class="characters-title">公开篇目</h2>
          <nav class="characters-buttons">
            <a href="/page/public/ghost.html"   class="character-btn">Ghost</a>
            <a href="/page/public/konig.html"   class="character-btn">König</a>
            <a href="/page/public/nikto.html"   class="character-btn">Nikto</a>
            <a href="/page/public/keegan.html"  class="character-btn">Keegan</a>
            <a href="/page/public/krueger.html" class="character-btn">Krueger</a>
          </nav>
        </div>
      </section>
    </div>
  </div>

  <style>
    .sidebar-container{ position: relative; overflow: hidden; }

    /* 只覆盖侧边栏容器本身（不是全屏） */
    .characters-panel{
      position: absolute;
      inset: 0;
      z-index: 10;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding-top: 15vh;
      padding-left: 24px;
      padding-right: 24px;
      box-sizing: border-box;
      transform: translateX(100%);
      transition: transform .3s ease;
      pointer-events: none;
      cursor: default;
    }
    .characters-panel.show-characters{
      transform: translateX(0);
      pointer-events: auto;
    }
    .characters-inner{
      position: relative;
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
    }
    .characters-title{
      margin: 0;
      width: 100%;
      text-align: center;
      font-size: 22px;
      font-weight: 700;
      color: #333;
      padding-top: 10px;
      padding-bottom: 40px;
    }
    .characters-buttons{ display:flex; flex-direction:column; gap:12px; }
    .character-btn{
      display:flex; align-items:center; justify-content:center;
      width:100%; padding:15px 20px; box-sizing:border-box;
      background:#f5f5f5; border-radius:12px; text-decoration:none;
      color:#000; font-size:16px; font-weight:500;
      transition: background-color .2s ease;
    }
    .character-btn:hover{ background:#e8e8e8; }
    .character-btn:active{ background:#d8d8d8; }
  </style>
  `;

  document.body.insertAdjacentHTML('beforeend', sidebarHTML);
  console.log('Sidebar HTML added to page');

  // 元素
  const sidebarBtn       = document.getElementById('sidebarBtn');
  const sidebarOverlay   = document.getElementById('sidebarOverlay');
  const sidebarContainer = document.getElementById('sidebarContainer');
  const publicLink       = document.getElementById('sidebarPublicLink');
  const charactersPanel  = document.getElementById('charactersPanel');

  // API
  function showSidebar() {
    sidebarOverlay.classList.add('active');
    sidebarContainer.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function hideSidebar() {
    sidebarOverlay.classList.remove('active');
    sidebarContainer.classList.remove('active');
    hideCharactersPanel();
    document.body.style.overflow = '';
  }
  function showCharactersPanel(){
    if (!charactersPanel) return;
    charactersPanel.classList.add('show-characters');
    charactersPanel.setAttribute('aria-hidden','false');
  }
  function hideCharactersPanel(){
    if (!charactersPanel) return;
    charactersPanel.classList.remove('show-characters');
    charactersPanel.setAttribute('aria-hidden','true');
  }

  // 暴露给 footer.js
  window.showSidebar = showSidebar;
  window.sidebarLoaded = true;

  // 事件
  if (sidebarBtn) {
    sidebarBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showSidebar();
    });
  }
  if (publicLink) {
    ['click','touchend'].forEach(evt => {
      publicLink.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCharactersPanel();
      }, { passive:false });
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', (e) => {
      if (e.target === sidebarOverlay) hideSidebar();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (charactersPanel && charactersPanel.classList.contains('show-characters')) {
      hideCharactersPanel();
    } else if (sidebarOverlay && sidebarOverlay.classList.contains('active')) {
      hideSidebar();
    }
  });
  if (charactersPanel) {
    const inner = charactersPanel.querySelector('.characters-inner');
    charactersPanel.addEventListener('click', (e) => {
      if (inner && !inner.contains(e.target)) hideCharactersPanel();
    });
  }
}

// ✅ DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebar);
} else {
  initSidebar();
}
