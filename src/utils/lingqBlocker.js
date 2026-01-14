(function() {
  'use strict';

  const LINGQ_DOMAINS = ['lingq.com', 'www.lingq.com', 'app.lingq.com'];

  function isLingqSite() {
    const hostname = window.location.hostname;
    return LINGQ_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  }

  function hideLingqHighlights() {
    const style = document.createElement('style');
    style.id = 'lingq-highlight-blocker-styles';
    style.textContent = `
      .blue-word,
      .lingq-word {
        background-color: transparent !important;
        color: inherit !important;
        text-decoration: none !important;
        box-shadow: none !important;
        border: none !important;
      }
      
      .lingq-word.lingq-status-0,
      .lingq-word.lingq-status-1,
      .lingq-word.lingq-status-2,
      .lingq-word.lingq-status-3,
      .lingq-word.lingq-status-4 {
        background-color: transparent !important;
        color: inherit !important;
      }
      
      body.theme-luminosity-light .light-highlight-style-0 .reader-container .sentence .blue-word,
      body.theme-luminosity-light .light-highlight-style-0 .reader-container .sentence .lingq-word {
        background-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
  }

  function removeModalContainer() {
    const modalContainer = document.querySelector('.modal-container');
    if (modalContainer) {
      modalContainer.remove();
      console.log('[LingqBlocker] 已删除模态框');
    }
  }

  function startModalObserver() {
    setInterval(removeModalContainer, 1000);
    removeModalContainer();
  }

  function hideLingqHighlights() {
    const style = document.createElement('style');
    style.id = 'lingq-highlight-blocker-styles';
    style.textContent = `
      .blue-word,
      .lingq-word {
        background-color: transparent !important;
        color: inherit !important;
        text-decoration: none !important;
        box-shadow: none !important;
        border: none !important;
      }
      
      .lingq-word.lingq-status-0,
      .lingq-word.lingq-status-1,
      .lingq-word.lingq-status-2,
      .lingq-word.lingq-status-3,
      .lingq-word.lingq-status-4 {
        background-color: transparent !important;
        color: inherit !important;
      }
      
      body.theme-luminosity-light .light-highlight-style-0 .reader-container .sentence .blue-word,
      body.theme-luminosity-light .light-highlight-style-0 .reader-container .sentence .lingq-word {
        background-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
  }

  function initLingqBlocker() {
    if (!isLingqSite()) {
      console.log('[LingqBlocker] 当前不是 LingQ 网站，跳过初始化');
      return;
    }

    console.log('[LingqBlocker] 检测到 LingQ 网站，初始化模态框删除功能');

    hideLingqHighlights();
    startModalObserver();

    console.log('[LingqBlocker] 模态框自动删除功能已启用');
  }

  window.LingqBlocker = {
    init: initLingqBlocker,
    isLingqSite: isLingqSite
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLingqBlocker);
  } else {
    initLingqBlocker();
  }

})();
