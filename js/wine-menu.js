// 酒单功能（点击 label/底部优先 + 修复首卡不跳转）
// 1) subtitle 仅展示；2) image 只滑动；3) label/底部点击跳转；
// 4) 点击遮罩空白关闭；5) 先滑后点短暂冷却。

class WineMenu {
  constructor() {
    this.drinksData = [];
    this.currentIndex = 0;
    this.isAnimating = false;

    this.justSwiped = false;
    this.swipeCooldownMs = 300;

    // label/底部按下期间抑制滑动
    this.suppressSwipe = false;

    this.init();
  }

  async init() {
    await this.loadDrinksData();
    this.bindEvents();
  }

  async loadDrinksData() {
    try {
      const res = await fetch('../../json/drinks.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('drinks.json not found');
      this.drinksData = await res.json();
    } catch (e) {
      console.error('Load drinks failed, fallback:', e);
      this.drinksData = [
        { id: 'konig',   label: 'König',   subtitle: '男主人珍藏', image: '../../img/public/konig.png',   link: '/reads/konig-public.html' },
        { id: 'konigin', label: 'Königin', subtitle: '女主人精选', image: '../../img/public/konig.png',   link: '/reads/konigin-public.html' },
        { id: 'guest',   label: 'Guest',   subtitle: '客人专享',   image: '../../img/public/konig.png',   link: '/reads/guest-public.html' },
      ];
    }
  }

  bindEvents() {
    const overlay = document.getElementById('wineMenuOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeWineMenu();
      });
    }
    this.bindSwipeEvents();
  }

  bindSwipeEvents() {
    const overlay = document.getElementById('wineMenuOverlay');
    if (!overlay) return;

    let startX = 0, currentX = 0, isDragging = false;
    let startTime = 0, velocity = 0;
    let currentItem = null;

    const allowSwipeFrom = (target) => {
      if (this.suppressSwipe) return false;
      if (target.closest && (target.closest('.wine-label') || target.closest('.wine-bottom'))) {
        return false;
      }
      return true;
    };

    // Touch
    overlay.addEventListener('touchstart', (e) => {
      const item = e.target.closest('.wine-item');
      if (!item || !allowSwipeFrom(e.target)) return;
      currentItem = item;
      startX = e.touches[0].clientX;
      startTime = Date.now();
      isDragging = true;
      velocity = 0;
    }, { passive: true });

    overlay.addEventListener('touchmove', (e) => {
      if (!isDragging || !currentItem) return;
      currentX = e.touches[0].clientX;
      const dt = Date.now() - startTime;
      if (dt > 0) velocity = (startX - currentX) / dt;
      const diffX = startX - currentX;
      currentItem.style.transform = `translateX(${diffX * 0.3}px) scale(0.95)`;
    }, { passive: true });

    overlay.addEventListener('touchend', () => {
      if (!isDragging || !currentItem) return;
      isDragging = false;
      currentItem.style.transform = '';
      const diffX = startX - currentX;

      if (Math.abs(diffX) >= 50 || Math.abs(velocity) >= 0.6) {
        if (diffX > 0 || velocity > 0) this.nextDrink();
        else this.prevDrink();
        this.justSwiped = true;
        setTimeout(() => (this.justSwiped = false), this.swipeCooldownMs);
      }
      currentItem = null;
    }, { passive: true });

    // Mouse
    overlay.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.wine-item');
      if (!item || !allowSwipeFrom(e.target)) return;
      currentItem = item;
      startX = e.clientX;
      startTime = Date.now();
      isDragging = true;
      velocity = 0;
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!isDragging || !currentItem) return;
      currentX = e.clientX;
      const dt = Date.now() - startTime;
      if (dt > 0) velocity = (startX - currentX) / dt;
      const diffX = startX - currentX;
      currentItem.style.transform = `translateX(${diffX * 0.3}px) scale(0.95)`;
    });

    const endMouseDrag = () => {
      if (!isDragging || !currentItem) return;
      isDragging = false;
      currentItem.style.transform = '';
      const diffX = startX - currentX;

      if (Math.abs(diffX) >= 50 || Math.abs(velocity) >= 0.6) {
        if (diffX > 0 || velocity > 0) this.nextDrink();
        else this.prevDrink();
        this.justSwiped = true;
        setTimeout(() => (this.justSwiped = false), this.swipeCooldownMs);
      }
      currentItem = null;
    };

    overlay.addEventListener('mouseup', endMouseDrag);
    overlay.addEventListener('mouseleave', endMouseDrag);
    overlay.addEventListener('selectstart', (e) => e.preventDefault());
  }

  openWineMenu() {
    const overlay = document.getElementById('wineMenuOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    document.body.classList.add('wine-menu-open');
    setTimeout(() => this.renderWineList(), 100);
  }

  closeWineMenu() {
    const overlay = document.getElementById('wineMenuOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.classList.remove('wine-menu-open');
  }

  renderWineList() {
    const viewport = document.getElementById('wineListViewport');
    if (!viewport) return;
    viewport.innerHTML = '';

    this.drinksData.forEach((drink, i) => {
      viewport.appendChild(this.createWineItem(drink, i));
    });

    this.currentIndex = 0;
    this.updateScrollPosition();
  }

  createWineItem(drink, index) {
    const item = document.createElement('div');
    item.className = 'wine-item';
    item.dataset.index = index;

    item.innerHTML = `
      <div class="wine-top">${drink.subtitle || ''}</div>
      <div class="wine-image">
        <img src="${drink.image}" alt="${drink.label}" draggable="false" />
      </div>
      <div class="wine-bottom">
        <div class="wine-label" role="button" aria-label="进入 ${drink.label}" style="touch-action:manipulation;">
          ${drink.label}
        </div>
      </div>
    `;

    const bottomEl = item.querySelector('.wine-bottom');
    const labelEl  = item.querySelector('.wine-label');

    // —— 桌面：label 或整块底部都可点
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.justSwiped) return;
      this.selectDrink(index);
    };
    bottomEl.addEventListener('click', handleClick);
    labelEl.addEventListener('click', handleClick);

    // —— 移动端：按下期间抑制滑动；短按视作点击
    let tStart = 0, tStartY = 0;
    const touchStart = (e) => {
      this.suppressSwipe = true;
      tStart = Date.now();
      tStartY = e.touches[0].clientY;
      labelEl.classList.add('touch-active');
    };
    const touchEnd = (e) => {
      const dur = Date.now() - tStart;
      const dy = Math.abs(e.changedTouches[0].clientY - tStartY);
      labelEl.classList.remove('touch-active');
      requestAnimationFrame(() => (this.suppressSwipe = false));
      if (dur < 300 && dy < 10) {
        if (this.justSwiped) return;
        e.preventDefault();
        e.stopPropagation();
        this.selectDrink(index);
      }
    };
    const touchCancel = () => {
      labelEl.classList.remove('touch-active');
      this.suppressSwipe = false;
    };

    bottomEl.addEventListener('touchstart', touchStart, { passive: true });
    bottomEl.addEventListener('touchend', touchEnd, { passive: false });
    bottomEl.addEventListener('touchcancel', touchCancel);

    return item;
  }

  // ★ 修复点：不再因 isAnimating 拦截点击（仅阻止滑动后的 justSwiped）
  selectDrink(index) {
    if (this.justSwiped) return;

    const drink = this.drinksData[index];
    if (drink && drink.link) {
      const item = document.querySelector(`.wine-item[data-index="${index}"]`);
      if (item) {
        item.style.transition = 'transform 0.12s ease';
        item.style.transform = 'scale(0.96)';
      }
      setTimeout(() => {
        window.location.href = drink.link;
      }, 120);
    }
  }

  nextDrink() {
    if (this.isAnimating) return;
    this.currentIndex = (this.currentIndex + 1) % this.drinksData.length;
    this.updateScrollPosition();
  }

  prevDrink() {
    if (this.isAnimating) return;
    this.currentIndex = this.currentIndex === 0 ? this.drinksData.length - 1 : this.currentIndex - 1;
    this.updateScrollPosition();
  }

  updateScrollPosition() {
    const viewport = document.getElementById('wineListViewport');
    if (!viewport) return;

    this.isAnimating = true;

    const items = viewport.querySelectorAll('.wine-item');
    const itemWidth = 340;
    const viewportWidth = viewport.offsetWidth;
    const centerOffset = viewportWidth / 2 - itemWidth / 2;

    let left = this.currentIndex * itemWidth - centerOffset;
    left = Math.max(0, left);

    viewport.scrollTo({ left, behavior: 'smooth' });

    items.forEach((el, i) => {
      el.classList.toggle('active', i === this.currentIndex);
      if (i === this.currentIndex) {
        el.style.transform = 'scale(1.05)';
        setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
      }
    });

    setTimeout(() => { this.isAnimating = false; }, 500);
  }
}

// 全局函数
function openWineMenu() {
  if (window.wineMenu) window.wineMenu.openWineMenu();
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  window.wineMenu = new WineMenu();
});
