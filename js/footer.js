// 根据当前页面位置确定footer组件的路径
const currentPath = window.location.pathname;
let footerPath = '../components/footer.html';

if (currentPath.includes('/page/public/') || currentPath.includes('/page/private/')) {
  footerPath = '../../components/footer.html';
} else if (currentPath.includes('/article/private/') || currentPath.includes('/article/public/')) {
  footerPath = '../../../components/footer.html';
}

fetch(footerPath)
  .then(res => res.text())
  .then(html => {
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (!footerPlaceholder) {
      console.warn('Footer placeholder not found, footer not loaded');
      return;
    }

    let adjustedHtml = html;

    if (currentPath.includes('/page/public/') || currentPath.includes('/page/private/')) {
      // ✅ 注意：第二次 replace 要基于 adjustedHtml，而不是 html
      adjustedHtml = adjustedHtml.replace(/\.\.\/page\//g, '../../page/');
      adjustedHtml = adjustedHtml.replace(/\.\.\/img\//g, '../../img/');
    } else if (currentPath.includes('/article/private/') || currentPath.includes('/article/public/')) {
      adjustedHtml = adjustedHtml.replace(/\.\.\/page\//g, '../../../page/');
      adjustedHtml = adjustedHtml.replace(/\.\.\/img\//g, '../../../img/');
    }

    footerPlaceholder.innerHTML = adjustedHtml;
    console.log('Footer loaded successfully');

    loadSidebar();
  })
  .catch(err => console.error('Failed to load footer:', err));

/* —— 以下保持不变 —— */
window.handleSidebarClick = function(event) {
  if (window.showSidebar) {
    event.preventDefault();
    window.showSidebar();
    return false;
  }
  return true;
};

function loadSidebar() {
  if (!document.querySelector('link[href*="sidebar.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/style/sidebar.css';
    document.head.appendChild(link);
  }
  if (!window.sidebarLoaded) {
    const script = document.createElement('script');
    script.src = '/js/sidebar.js';
    script.onload = function() {
      window.sidebarLoaded = true;
      bindSidebarBtn();
    };
    script.onerror = function() {
      console.error('Failed to load sidebar.js');
    };
    document.head.appendChild(script);
  } else {
    bindSidebarBtn();
  }
}

function bindSidebarBtn() {
  const sidebarBtn = document.getElementById('sidebarBtn');
  if (!sidebarBtn) return;
  sidebarBtn.removeEventListener('click', sidebarBtn.sidebarClickHandler);
  sidebarBtn.sidebarClickHandler = function(e) {
    e.preventDefault();
    if (typeof window.showSidebar === 'function') window.showSidebar();
  };
  sidebarBtn.addEventListener('click', sidebarBtn.sidebarClickHandler);
}

setTimeout(() => {
  const homeBtn = document.getElementById('homeBtn');
  if (homeBtn) {
    homeBtn.removeEventListener('click', homeBtn.homeClickHandler);
    homeBtn.homeClickHandler = function(e) {
      e.preventDefault();
      let homePath = '../page/home.html';
      if (currentPath.includes('/page/public/') || currentPath.includes('/page/private/')) homePath = '../../page/home.html';
      window.location.href = homePath;
    };
    homeBtn.addEventListener('click', homeBtn.homeClickHandler);
  }

  const notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) {
    notificationBtn.removeEventListener('click', notificationBtn.notificationClickHandler);
    notificationBtn.notificationClickHandler = function(e) {
      e.preventDefault();
      let p = '../page/notification.html';
      if (currentPath.includes('/page/public/') || currentPath.includes('/page/private/')) p = '../../page/notification.html';
      window.location.href = p;
    };
    notificationBtn.addEventListener('click', notificationBtn.notificationClickHandler);
  }

  const favouriteBtn = document.getElementById('favouriteBtn');
  if (favouriteBtn) {
    favouriteBtn.removeEventListener('click', favouriteBtn.favouriteClickHandler);
    favouriteBtn.favouriteClickHandler = function(e) {
      e.preventDefault();
      let p = '../page/favourite.html';
      if (currentPath.includes('/page/public/') || currentPath.includes('/page/private/')) p = '../../page/favourite.html';
      window.location.href = p;
    };
    favouriteBtn.addEventListener('click', favouriteBtn.favouriteClickHandler);
  }
}, 100);