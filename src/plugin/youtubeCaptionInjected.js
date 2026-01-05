// 在页面上下文中执行的代码
(function() {
  // 存储捕获到的字幕URL
  window.__capturedSubtitleUrls = window.__capturedSubtitleUrls || new Set();

  // 跟踪当前视频ID
  let currentVideoId = null;

  // 获取当前视频ID的函数
  function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // 检查视频是否切换
  function checkVideoChange() {
    const newVideoId = getCurrentVideoId();
    if (newVideoId && newVideoId !== currentVideoId) {
      console.log(`页面上下文：视频切换检测: ${currentVideoId} -> ${newVideoId}`);
      currentVideoId = newVideoId;
      // 清空字幕URL缓存
      window.__capturedSubtitleUrls.clear();
      console.log('页面上下文：已清空字幕URL缓存');
    }
  }

  // 拦截XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    const url = arguments[1];
    this._url = url;

    // 检查是否是字幕请求
    if (typeof url === 'string' && url.includes('/api/timedtext')) {
      console.log(`页面上下文：捕获到字幕请求 原始 xhr URL:`, url);

      // 检查视频是否切换
      checkVideoChange();

      window.__capturedSubtitleUrls.add(url);
      // 触发自定义事件，让content script知道
      document.dispatchEvent(new CustomEvent('subtitle_url_captured', { detail: { url } }));
    }

    return originalXhrOpen.apply(this, arguments);
  };

  // 拦截fetch
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);

    // 检查是否是字幕请求
    if (typeof url === 'string' && url.includes('/api/timedtext')) {
      console.log(`页面上下文：捕获到字幕请求 原始 fetch URL:`, url);

      // 检查视频是否切换
      checkVideoChange();

      window.__capturedSubtitleUrls.add(url);
      // 触发自定义事件，让content script知道
      document.dispatchEvent(new CustomEvent('subtitle_url_captured', { detail: { url } }));
    }

    return originalFetch.apply(this, arguments);
  };

  console.log('页面上下文：YouTube字幕URL拦截器已注入');
})();
