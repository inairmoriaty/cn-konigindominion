/* ============================================================
 * swipe-back.js
 * 全站统一「向右滑动回到上一级」的轻量手势脚本。
 * - 仅在触屏设备上生效（鼠标不触发）。
 * - 起点必须靠近左侧边缘（<=40px），避免与页面横向滑动组件冲突。
 * - 水平滑动距离 > 80px 且明显大于竖直位移时触发 history.back()。
 * - 若当前页面无上级历史，则回到 /page/home.html。
 * ============================================================ */
(function () {
  if (typeof window === 'undefined' || !('ontouchstart' in window)) return;

  var startX = null, startY = null, startT = 0;
  var EDGE   = 40;   // 起点必须在屏幕左侧 40px 之内
  var MIN_DX = 80;   // 水平触发阈值
  var MAX_DY = 60;   // 竖直容差
  var MAX_T  = 800;  // 最大时长（毫秒）

  function onStart(e) {
    if (e.touches.length !== 1) { startX = null; return; }
    var t = e.touches[0];
    if (t.clientX > EDGE) { startX = null; return; }
    startX = t.clientX;
    startY = t.clientY;
    startT = Date.now();
  }

  function onEnd(e) {
    if (startX == null) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - startX;
    var dy = Math.abs(t.clientY - startY);
    var dt = Date.now() - startT;
    startX = null;

    if (dt > MAX_T) return;
    if (dy > MAX_DY) return;
    if (dx < MIN_DX) return;
    if (Math.abs(dx) < dy * 1.5) return;

    goBack();
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // Home 页面路径容错：当前在 /page/ 下回根首页，其他目录统一回 home.html
      var path = window.location.pathname;
      var backTo = '/page/home.html';
      if (path.indexOf('/page/') === -1 && path.indexOf('/article/') === -1) {
        backTo = 'page/home.html';
      } else if (/\/article\//.test(path) || /\/page\/(public|private)\//.test(path)) {
        backTo = '../home.html';
      } else if (/\/page\//.test(path)) {
        backTo = 'home.html';
      }
      window.location.href = backTo;
    }
  }

  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchend',   onEnd,   { passive: true });
})();
