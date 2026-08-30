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

  const mobileSubtitleButtonSelectors = [
    '#player-control-overlay yt-closed-captions-toggle-button ytm-closed-captioning-button button',
    '#player-control-overlay ytm-closed-captioning-button button',
    'yt-closed-captions-toggle-button ytm-closed-captioning-button button'
  ];

  function getMobileSubtitleButton() {
    for (const selector of mobileSubtitleButtonSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        return button;
      }
    }
    return null;
  }

  function getAnySubtitleButton() {
    return document.querySelector('.ytp-subtitles-button') || getMobileSubtitleButton();
  }

  function isSubtitleButtonPressed(button) {
    return button?.getAttribute('aria-pressed') === 'true' ||
      button?.getAttribute('aria-checked') === 'true' ||
      button?.closest('[aria-pressed="true"], [aria-checked="true"]') !== null;
  }

  function waitForMobileSubtitleButton(timeoutMs = 5000) {
    const existingButton = getMobileSubtitleButton();
    if (existingButton) {
      return Promise.resolve(existingButton);
    }

    document.querySelector('video')?.click();

    return new Promise(resolve => {
      const startedAt = Date.now();
      const check = () => {
        const button = getMobileSubtitleButton();
        if (button || Date.now() - startedAt >= timeoutMs) {
          resolve(button);
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  function waitForSubtitleButtonState(pressed, timeoutMs = 2000) {
    return new Promise(resolve => {
      const startedAt = Date.now();
      const check = () => {
        const button = getMobileSubtitleButton();
        if (button && isSubtitleButtonPressed(button) === pressed) {
          resolve(button);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(button || null);
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  function getPlayerResponse() {
    const player = document.querySelector('#movie_player');
    const playerResponse = typeof player?.getPlayerResponse === 'function'
      ? player.getPlayerResponse()
      : null;
    return playerResponse || window.ytInitialPlayerResponse || null;
  }

  function getCaptionTracks() {
    const playerResponse = getPlayerResponse();
    const renderer = playerResponse?.captions?.playerCaptionsTracklistRenderer;
    const tracks = Array.isArray(renderer?.captionTracks) ? renderer.captionTracks : [];
    return tracks.map((track, index) => ({
      index,
      baseUrl: track.baseUrl,
      languageCode: track.languageCode || '',
      kind: track.kind || '',
      vssId: track.vssId || '',
      isTranslatable: Boolean(track.isTranslatable),
      name: track.name?.simpleText || track.name?.runs?.map(run => run.text).join('') ||
        track.languageName?.simpleText || track.languageCode || '未知',
      translationLanguageCode: (() => {
        try {
          return new URL(track.baseUrl).searchParams.get('tlang') || '';
        } catch (error) {
          return '';
        }
      })()
    }));
  }

  async function dispatchSubtitleTracks(requestId) {
    const startedAt = Date.now();
    let tracks = getCaptionTracks();
    while (tracks.length === 0 && Date.now() - startedAt < 4000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      tracks = getCaptionTracks();
    }
    document.dispatchEvent(new CustomEvent('lingkuma_subtitle_tracks_result', {
      detail: { requestId, tracks }
    }));
  }

  document.addEventListener('lingkuma_youtube_caption_control', async event => {
    const requestId = event.detail?.requestId;
    const action = event.detail?.action;
    if (!requestId || !['show', 'ensure-on', 'refresh', 'ensure-off'].includes(action)) {
      return;
    }

    let button = await waitForMobileSubtitleButton();
    const wasPressed = isSubtitleButtonPressed(button);

    if (button && action === 'refresh' && wasPressed) {
      button.click();
      button = await waitForSubtitleButtonState(false) || button;
      if (!isSubtitleButtonPressed(button)) {
        await new Promise(resolve => setTimeout(resolve, 300));
        button.click();
        await waitForSubtitleButtonState(true);
      }
    } else if (button && (action === 'ensure-on' || action === 'refresh') && !wasPressed) {
      button.click();
      await waitForSubtitleButtonState(true);
    } else if (button && action === 'ensure-off' && wasPressed) {
      button.click();
    }

    document.dispatchEvent(new CustomEvent('lingkuma_youtube_caption_control_result', {
      detail: {
        requestId,
        action,
        found: Boolean(button),
        wasPressed,
        pressed: isSubtitleButtonPressed(getMobileSubtitleButton() || button)
      }
    }));
  });

  document.addEventListener('lingkuma_subtitle_tracks_request', event => {
    const requestId = event.detail?.requestId;
    if (requestId) {
      dispatchSubtitleTracks(requestId).catch(error => {
        console.warn('页面上下文：读取字幕轨道失败:', error);
      });
    }
  });

  document.addEventListener('lingkuma_subtitle_track_fetch', async event => {
    const requestId = event.detail?.requestId;
    const url = event.detail?.url;
    if (!requestId || !url || !url.includes('/api/timedtext')) {
      return;
    }

    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error('字幕响应不是 JSON');
      }
      if (!Array.isArray(data?.events)) {
        throw new Error('字幕响应不含 events');
      }

      dispatchSubtitleData(url, text);
      document.dispatchEvent(new CustomEvent('lingkuma_subtitle_track_fetch_result', {
        detail: { requestId, url, ok: true }
      }));
    } catch (error) {
      console.warn('页面上下文：直接获取指定字幕失败:', error);
      document.dispatchEvent(new CustomEvent('lingkuma_subtitle_track_fetch_result', {
        detail: { requestId, url, ok: false, error: String(error?.message || error) }
      }));
    }
  });

  document.addEventListener('lingkuma_subtitle_track_select', async event => {
    const requestId = event.detail?.requestId;
    const url = event.detail?.url;
    const metadata = event.detail?.metadata || {};
    let switched = false;
    let errorMessage = '';

    try {
      const player = document.querySelector('#movie_player');
      const parsedUrl = url ? new URL(url) : null;
      const languageCode = metadata.languageCode || parsedUrl?.searchParams.get('lang') || '';
      const translationLanguageCode = metadata.translationLanguageCode || parsedUrl?.searchParams.get('tlang') || '';
      const track = {
        languageCode,
        kind: metadata.kind || parsedUrl?.searchParams.get('kind') || undefined,
        vssId: metadata.vssId || parsedUrl?.searchParams.get('vssId') || undefined
      };
      if (translationLanguageCode) {
        track.tlang = translationLanguageCode;
        track.translationLanguageCode = translationLanguageCode;
      }
      Object.keys(track).forEach(key => track[key] === undefined || track[key] === '' ? delete track[key] : null);

      if (player && typeof player.setOption === 'function' && track.languageCode) {
        console.log('页面上下文：切换 YouTube 字幕轨道:', track);
        player.setOption('captions', 'track', track);
        // setOption 只改变轨道，不保证字幕显示层处于开启状态。
        await new Promise(resolve => setTimeout(resolve, 120));
        const subtitleButton = getAnySubtitleButton();
        if (subtitleButton && !isSubtitleButtonPressed(subtitleButton)) {
          subtitleButton.click();
          console.log('页面上下文：字幕轨道已切换，重新打开原生字幕显示');
        }
        switched = true;
      } else {
        errorMessage = 'YouTube 播放器没有公开字幕切换 API';
      }
    } catch (error) {
      errorMessage = String(error?.message || error);
    }

    document.dispatchEvent(new CustomEvent('lingkuma_subtitle_track_select_result', {
      detail: { requestId, url, switched, error: errorMessage }
    }));
  });

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
