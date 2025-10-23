const logoBtn = document.getElementById('logoBtn');
const spiderAnim = document.getElementById('spiderAnim');
const coverBg = document.querySelector('.cover-bg');
const coverTitle = document.querySelector('.cover-title');
const pageAnimContainer = document.querySelector('.page-anim-container');

// Logo按钮点击处理函数
const handleLogoClick = () => {
  spiderAnim.classList.add('drop');
  logoBtn.disabled = true;

  setTimeout(() => {
    // ⭐⭐⭐ 只加在外壳
    pageAnimContainer.classList.add('page-fadeout');
    // 删掉其它 coverBg/coverTitle/logoBtn/spiderAnim 的 page-fadeout！
    setTimeout(() => {
      window.location.href = "page/home.html";
    }, 1200);
  }, 1200);
};

// 同时支持点击和触摸事件
logoBtn.addEventListener('click', handleLogoClick);
logoBtn.addEventListener('touchend', handleLogoClick);
