(() => {
  'use strict';

  const searchForm = document.querySelector('form');
  const searchInput = document.querySelector('#search-text');
  const mobileSearch = document.querySelector('#search-prompt-icon');
  const navToggle = document.querySelector('.navbar-toggler');
  const nav = document.querySelector('.navbar-collapse');
  const categoryToggle = document.querySelector('.dropdown-toggle');
  const searchButton = document.querySelector('#search-submit-icon');

  // Lazy-load the thumbnails included as remote assets in the original snapshot.
  const lazyImages = [...document.querySelectorAll('img.lazy[data-src]')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const image = entry.target;
        image.src = image.dataset.src;
        image.classList.add('lazyloaded');
        currentObserver.unobserve(image);
      }
    }, { rootMargin: '120px' });
    lazyImages.forEach(image => observer.observe(image));
  } else {
    lazyImages.forEach(image => { image.src = image.dataset.src; });
  }

  const cards = [...document.querySelectorAll('#content .post')]
    .map(post => post.closest('.col-md-6') || post.parentElement);
  let emptyState;
  const runSearch = rawQuery => {
    const query = rawQuery.trim().toLocaleLowerCase('ko');
    let visible = 0;
    for (const card of cards) {
      const matches = !query || card.textContent.toLocaleLowerCase('ko').includes(query);
      card.hidden = !matches;
      if (matches) visible++;
    }
    if (!emptyState && cards.length) {
      emptyState = document.createElement('p');
      emptyState.className = 'local-search-empty';
      emptyState.setAttribute('role', 'status');
      emptyState.textContent = '검색 결과가 없습니다. 다른 검색어를 입력해 보세요.';
      document.querySelector('#content .row')?.append(emptyState);
    }
    if (emptyState) emptyState.hidden = visible !== 0 || !query;
    return visible;
  };

  searchForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (searchInput) {
      runSearch(searchInput.value);
      searchInput.focus();
    }
  });
  searchButton?.addEventListener('click', event => {
    event.preventDefault();
    if (searchInput) runSearch(searchInput.value);
  });
  searchInput?.addEventListener('input', () => runSearch(searchInput.value));

  mobileSearch?.addEventListener('click', () => {
    const query = window.prompt('검색 키워드를 입력하세요 :');
    if (query === null) return;
    if (searchInput) searchInput.value = query;
    runSearch(query);
    document.querySelector('#content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  navToggle?.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') !== 'true';
    nav?.classList.toggle('show', expanded);
    navToggle.setAttribute('aria-expanded', String(expanded));
  });

  categoryToggle?.addEventListener('click', event => {
    event.preventDefault();
    const menu = categoryToggle.nextElementSibling;
    const expanded = categoryToggle.getAttribute('aria-expanded') !== 'true';
    menu?.classList.toggle('show', expanded);
    categoryToggle.setAttribute('aria-expanded', String(expanded));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown-menu.show').forEach(menu => menu.classList.remove('show'));
      categoryToggle?.setAttribute('aria-expanded', 'false');
    }
  });

  const siteNavbar = document.querySelector('nav.navbar');
  if (siteNavbar) {
    siteNavbar.classList.add('local-reference-nav');
    const isCoinPage = location.pathname.startsWith('/random/coin/');
    if (isCoinPage) document.documentElement.classList.add('coin-local');
    const brand = siteNavbar.querySelector('.navbar-brand');
    if (brand && brand.textContent.trim() === 'PiliApp' && isCoinPage) brand.textContent = '홈';
    if (brand && brand.textContent.trim() === '홈' && !location.pathname.startsWith('/random/coin/')) {
      brand.textContent = 'PiliApp';
      brand.href = '/';
    }

    const header = document.createElement('header');
    header.className = 'local-reference-header';
    header.setAttribute('aria-label', '도구 메뉴');
    document.body.prepend(header);
    header.append(siteNavbar);

    if (!document.querySelector('#local-reference-nav-style')) {
      const style = document.createElement('style');
      style.id = 'local-reference-nav-style';
      style.textContent = `
        .local-reference-header { width: 100%; display: flex; justify-content: center; }
        nav.local-reference-nav { flex: 0 0 auto; height: 56px !important; min-height: 56px !important; margin: 0 auto; box-sizing: border-box; padding-top: 0 !important; padding-bottom: 0 !important; }
        html.dice-local nav.local-reference-nav { width: min(810px, calc(100vw - 32px)); background-color: #343a40 !important; }
        html.dice-local nav.local-reference-nav .navbar-brand { font-size: 20px; }
        html.dice-local nav.local-reference-nav .nav-link { font-size: 16px; }
        html.coin-local nav.local-reference-nav { width: min(1076px, calc(100vw - 32px)); background-color: #212529 !important; }
        html:not(.dice-local):not(.coin-local) nav.local-reference-nav { width: min(810px, calc(100vw - 32px)); background-color: #212529 !important; }
        @media (min-width: 768px) and (max-width: 991.98px) {
          html.dice-local nav.local-reference-nav { transform: translateX(-6px); }
        }
        @media (min-width: 992px) {
          html.coin-local nav.local-reference-nav { transform: translateX(5px); }
        }
      `;
      document.head.append(style);
    }
  }
})();
