// 在页面上下文中执行的代码
(function() {
  if (window.__lingkumaCaptionInterceptorInstalled) {
    console.log('页面上下文：YouTube字幕URL拦截器已存在');
    return;
  }
  window.__lingkumaCaptionInterceptorInstalled = true;

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

  function dispatchSubtitleData(url, text) {
    if (!text) {
      return;
    }

    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.events)) {
        return;
      }

      document.dispatchEvent(new CustomEvent('subtitle_data_captured', {
        detail: { url, text }
      }));
      console.log(`页面上下文：已捕获字幕响应数据，共 ${data.events.length} 个事件`);
    } catch (error) {
      // timedtext 也可能返回空响应或非 JSON 格式，交给后续请求继续尝试。
    }
  }

  async function captureXhrSubtitleData(xhr, url) {
    if (xhr.status < 200 || xhr.status >= 300) {
      console.warn(`页面上下文：字幕 XHR 返回状态码 ${xhr.status}`);
      return;
    }

    let text = '';
    if (xhr.responseType === '' || xhr.responseType === 'text') {
      text = xhr.responseText;
    } else if (xhr.responseType === 'json' && xhr.response) {
      text = JSON.stringify(xhr.response);
    } else if (xhr.response instanceof ArrayBuffer) {
      text = new TextDecoder().decode(xhr.response);
    } else if (ArrayBuffer.isView(xhr.response)) {
      text = new TextDecoder().decode(xhr.response);
    } else if (xhr.response instanceof Blob) {
      text = await xhr.response.text();
    } else if (xhr.response && typeof xhr.response === 'object') {
      text = JSON.stringify(xhr.response);
    }

    dispatchSubtitleData(url, text);
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

      this.addEventListener('load', function() {
        captureXhrSubtitleData(this, url).catch(error => {
          console.warn('页面上下文：读取字幕 XHR 响应失败:', error);
        });
      }, { once: true });
    }

    return originalXhrOpen.apply(this, arguments);
  };

  // 拦截fetch
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);

    // 检查是否是字幕请求
    const isSubtitleRequest = typeof url === 'string' && url.includes('/api/timedtext');
    if (isSubtitleRequest) {
      console.log(`页面上下文：捕获到字幕请求 原始 fetch URL:`, url);

      // 检查视频是否切换
      checkVideoChange();

      window.__capturedSubtitleUrls.add(url);
      // 触发自定义事件，让content script知道
      document.dispatchEvent(new CustomEvent('subtitle_url_captured', { detail: { url } }));
    }

    const responsePromise = originalFetch.apply(this, arguments);
    if (isSubtitleRequest) {
      responsePromise.then(response => {
        if (!response.ok) {
          console.warn(`页面上下文：字幕 fetch 返回状态码 ${response.status}`);
          return;
        }
        return response.clone().text().then(text => dispatchSubtitleData(url, text));
      }).catch(error => {
        console.warn('页面上下文：读取字幕 fetch 响应失败:', error);
      });
    }

    return responsePromise;
  };

  console.log('页面上下文：YouTube字幕URL拦截器已注入');
})();
