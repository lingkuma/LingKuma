// 在页面上下文中执行的代码
(function() {
  if (window.__lingkumaCaptionInterceptorInstalled) {
    console.log('页面上下文：YouTube字幕URL拦截器已存在');
    return;
  }
  window.__lingkumaCaptionInterceptorInstalled = true;

  // 存储捕获到的字幕URL
  window.__capturedSubtitleUrls = window.__capturedSubtitleUrls || new Set();
  // 存储播放器真实 timedtext 请求使用的请求头
  window.__capturedSubtitleRequestHeaders = window.__capturedSubtitleRequestHeaders || {};

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
      window.__capturedSubtitleRequestHeaders = {};
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

    // ---------------------------------------------------------------------------
  // timedtext 请求所需的客户端/设备参数与身份请求头
  //
  // YouTube 目前对 /api/timedtext 强制校验 Proof-of-Origin Token（pot /
  // potc=1）。仅凭 URL 重放时，服务器会返回「HTTP 200 + 空响应体」或者挂起，
  // 因为 poc 校验失败。实测必须同时满足：
  //   1. baseUrl 自带 signature/expire/ei/caps/opi/exp/xoaf
  //   2. 带上 pot 与 potc=1（pot 由播放器在请求过字幕后生成）
  //   3. 带上与 pot 匹配的客户端参数（c / cver / cbr / cbrver / cplatform ...）
  //   4. 带上播放器使用的客户端身份请求头（X-YouTube-Client-Name 等）
  // 缺少 3、4 任一项都会得到空响应，且桌面端同样如此。
  // ---------------------------------------------------------------------------

  const DEVICE_PARAM_KEYS = [
    'xorb', 'xobt', 'xovt', 'cbrand', 'cbr', 'cbrver', 'ceng', 'cengver',
    'c', 'cver', 'cplayer', 'cmodel', 'cos', 'cosver', 'cplatform'
  ];

  const BLOCKED_REQUEST_HEADERS = /^(referer|user-agent|origin|cookie|content-length|accept-encoding|host|connection|accept-charset)/i;

  function getLastObservedTimedtextUrl() {
    const captured = window.__capturedSubtitleUrls;
    if (!captured || captured.size === 0) {
      return null;
    }
    const urls = Array.from(captured);
    return urls[urls.length - 1];
  }

  function getDeviceParams() {
    const params = {};

    // 优先复用播放器真实请求里的客户端参数，它们与 pot 的签发客户端一致。
    try {
      const observedUrl = getLastObservedTimedtextUrl();
      if (observedUrl) {
        const observed = new URL(observedUrl, location.origin).searchParams;
        DEVICE_PARAM_KEYS.forEach(key => {
          const value = observed.get(key);
          if (value) {
            params[key] = value;
          }
        });
      }
    } catch (error) {
      // 忽略无法解析的历史 URL。
    }

    try {
      const device = window.ytcfg && typeof window.ytcfg.get === 'function'
        ? window.ytcfg.get('DEVICE')
        : null;
      if (device) {
        new URLSearchParams(device).forEach((value, key) => {
          if (value && !params[key]) {
            params[key] = value;
          }
        });
      }
    } catch (error) {
      // ytcfg 不可用时仅使用历史请求参数。
    }

    try {
      const cfg = window.ytcfg;
      const get = key => (cfg && typeof cfg.get === 'function') ? cfg.get(key) : undefined;
      const clientVersion = get('INNERTUBE_CONTEXT_CLIENT_VERSION');
      if (clientVersion && !params.cver) {
        params.cver = String(clientVersion);
      }
      if (!params.c) {
        const contextClient = get('INNERTUBE_CONTEXT')?.client || {};
        params.c = contextClient.clientName ||
          (get('INNERTUBE_CONTEXT_CLIENT_NAME') === 2 ? 'MWEB' : 'WEB');
      }
    } catch (error) {
      // 客户端版本缺失时由历史请求参数兜底。
    }

    params.xorb = params.xorb || '2';
    params.xobt = params.xobt || '3';
    params.xovt = params.xovt || '3';
    params.cplayer = params.cplayer || 'UNIPLAYER';
    return params;
  }

  function getTimedtextHeaders() {
    const headers = {};

    // 复用播放器真实 timedtext 请求的请求头（去掉浏览器不允许脚本设置的字段）。
    const observed = window.__capturedSubtitleRequestHeaders || {};
    Object.keys(observed).forEach(name => {
      if (BLOCKED_REQUEST_HEADERS.test(name) || /^sec-/i.test(name) || name.startsWith(':')) {
        return;
      }
      headers[name] = observed[name];
    });

    // 用当前页面的实时身份覆盖，避免使用过期值。
    try {
      const cfg = window.ytcfg;
      const get = key => (cfg && typeof cfg.get === 'function') ? cfg.get(key) : undefined;
      const liveHeaders = {
        'X-YouTube-Client-Name': get('INNERTUBE_CONTEXT_CLIENT_NAME'),
        'X-YouTube-Client-Version': get('INNERTUBE_CONTEXT_CLIENT_VERSION'),
        'X-Goog-Visitor-Id': get('VISITOR_DATA'),
        'X-YouTube-Device': get('DEVICE')
      };
      Object.entries(liveHeaders).forEach(([name, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          headers[name] = String(value);
        }
      });
    } catch (error) {
      // 实时身份不可用时保留历史请求头。
    }

    return headers;
  }

  function getFreshPot(track) {
    try {
      const player = document.querySelector('#movie_player');
      if (!player || typeof player.getAudioTrack !== 'function') {
        return null;
      }
      const audioTracks = player.getAudioTrack()?.captionTracks || [];
      if (audioTracks.length === 0) {
        return null;
      }
      const match = audioTracks.find(item => item.vssId && track.vssId && item.vssId === track.vssId) ||
        audioTracks.find(item => (item.kind || '') === (track.kind || '') &&
          item.languageCode === track.languageCode) ||
        audioTracks.find(item => item.languageCode === track.languageCode) ||
        audioTracks[0];
      if (!match?.url) {
        return null;
      }
      const params = new URL(match.url, location.origin).searchParams;
      const pot = params.get('pot');
      if (!pot) {
        return null;
      }
      return { pot, potc: params.get('potc') || '1' };
    } catch (error) {
      return null;
    }
  }

  // 用播放器返回的 captionTracks 重建一条「真实可用」的 timedtext URL。
  function buildTimedtextUrl(requestedUrl, metadata = {}) {
    const playerResponse = getPlayerResponse();
    const renderer = playerResponse?.captions?.playerCaptionsTracklistRenderer;
    const tracks = Array.isArray(renderer?.captionTracks) ? renderer.captionTracks : [];

    let requested = null;
    try {
      requested = new URL(requestedUrl, location.origin);
    } catch (error) {
      requested = null;
    }

    const languageCode = metadata.languageCode || requested?.searchParams.get('lang') || '';
    const kind = metadata.kind || requested?.searchParams.get('kind') || '';
    const translationLanguageCode = metadata.translationLanguageCode ||
      metadata.tlang || requested?.searchParams.get('tlang') || '';

    const track = tracks.find(item => item.languageCode === languageCode &&
      (item.kind || '') === kind) ||
      (translationLanguageCode ? null : tracks.find(item => item.languageCode === languageCode)) ||
      tracks.find(item => item.languageCode === languageCode) ||
      null;

    const baseUrl = track?.baseUrl || requestedUrl;
    if (!baseUrl) {
      return null;
    }

    const url = new URL(baseUrl, location.origin);
    const params = url.searchParams;

    if (translationLanguageCode) {
      params.set('tlang', translationLanguageCode);
    } else {
      params.delete('tlang');
    }

    Object.entries(getDeviceParams()).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    params.set('fmt', 'json3');

    const pot = getFreshPot({
      vssId: track?.vssId || metadata.vssId || '',
      kind,
      languageCode
    });
    if (pot?.pot) {
      params.set('potc', pot.potc || '1');
      params.set('pot', pot.pot);
    } else if (requested) {
      const observedPot = requested.searchParams.get('pot');
      if (observedPot) {
        params.set('potc', requested.searchParams.get('potc') || '1');
        params.set('pot', observedPot);
      }
    }

    return {
      url: url.toString(),
      hasPot: params.has('pot'),
      languageCode,
      kind,
      translationLanguageCode,
      vssId: track?.vssId || metadata.vssId || ''
    };
  }

  function parseSubtitleText(text) {
    if (!text) {
      return null;
    }
    try {
      const data = JSON.parse(text);
      return Array.isArray(data?.events) ? data : null;
    } catch (error) {
      return null;
    }
  }

  async function fetchTimedtextText(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: getTimedtextHeaders(),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function isPlayerCaptionsOn() {
    const player = document.querySelector('#movie_player');
    if (!player || typeof player.getOption !== 'function') {
      return null;
    }
    try {
      const track = player.getOption('captions', 'track');
      return Boolean(track && Object.keys(track).length > 0);
    } catch (error) {
      return null;
    }
  }

  function togglePlayerSubtitles() {
    const player = document.querySelector('#movie_player');
    if (!player || typeof player.toggleSubtitles !== 'function') {
      return false;
    }
    try {
      player.toggleSubtitles();
      return true;
    } catch (error) {
      return false;
    }
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

    // 移动播放器的 CC 按钮常常无法用合成事件触发（Polymer 组件只响应真实
    // 触摸），因此把玩家 API 作为主路径，按钮点击仅作为兜底。
    const player = document.querySelector('#movie_player');
    const canUsePlayerApi = Boolean(player && typeof player.toggleSubtitles === 'function');
    let button = canUsePlayerApi ? getMobileSubtitleButton() : await waitForMobileSubtitleButton();
    const wasPressed = isSubtitleButtonPressed(button);
    const playerCaptionsOn = isPlayerCaptionsOn();

    if (action === 'ensure-off') {
      if (playerCaptionsOn === true || wasPressed) {
        if (!togglePlayerSubtitles() && button) {
          button.click();
        }
      }
    } else if (action === 'refresh') {
      if (togglePlayerSubtitles()) {
        await new Promise(resolve => setTimeout(resolve, 400));
        if (isPlayerCaptionsOn() !== true) {
          togglePlayerSubtitles();
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      } else if (button && wasPressed) {
        button.click();
        button = await waitForSubtitleButtonState(false) || button;
        if (!isSubtitleButtonPressed(button)) {
          await new Promise(resolve => setTimeout(resolve, 300));
          button.click();
          await waitForSubtitleButtonState(true);
        }
      }
    } else if (playerCaptionsOn !== true && !wasPressed) {
      if (togglePlayerSubtitles()) {
        await new Promise(resolve => setTimeout(resolve, 400));
        if (isPlayerCaptionsOn() !== true) {
          togglePlayerSubtitles();
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      } else if (button) {
        button.click();
        await waitForSubtitleButtonState(true);
      }
    }

    const finalButton = getMobileSubtitleButton() || button;
    document.dispatchEvent(new CustomEvent('lingkuma_youtube_caption_control_result', {
      detail: {
        requestId,
        action,
        found: Boolean(button) || isPlayerCaptionsOn() !== null,
        wasPressed,
        playerCaptionsOn: isPlayerCaptionsOn(),
        pressed: isSubtitleButtonPressed(finalButton)
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
    const requestedUrl = event.detail?.url;
    const metadata = event.detail?.metadata || {};
    if (!requestId || !requestedUrl) {
      return;
    }

    const built = buildTimedtextUrl(requestedUrl, metadata);
    const candidates = [];
    if (built?.url) {
      candidates.push({ label: 'player-track', url: built.url });
    }
    if (requestedUrl.includes('/api/timedtext')) {
      candidates.push({ label: 'observed-url', url: requestedUrl });
    }

    const attempts = [];
    let succeededUrl = null;
    let succeededText = null;

    for (let round = 0; round < 3 && !succeededText; round += 1) {
      for (const candidate of candidates) {
        try {
          const text = await fetchTimedtextText(candidate.url);
          const data = parseSubtitleText(text);
          if (!data) {
            attempts.push({
              label: candidate.label,
              round: round + 1,
              reason: text ? '响应不是有效的字幕 JSON' : '响应为空（pot 校验失败）'
            });
            continue;
          }
          succeededUrl = candidate.url;
          succeededText = text;
          break;
        } catch (error) {
          attempts.push({
            label: candidate.label,
            round: round + 1,
            reason: String(error?.message || error)
          });
        }
      }
      if (!succeededText && round < 2) {
        await new Promise(resolve => setTimeout(resolve, 700));
      }
    }

    if (succeededText) {
      dispatchSubtitleData(succeededUrl, succeededText);
      document.dispatchEvent(new CustomEvent('lingkuma_subtitle_track_fetch_result', {
        detail: { requestId, url: succeededUrl, requestedUrl, ok: true, attempts }
      }));
      return;
    }

    console.warn('页面上下文：直接获取指定字幕失败:', attempts);
    document.dispatchEvent(new CustomEvent('lingkuma_subtitle_track_fetch_result', {
      detail: {
        requestId,
        url: requestedUrl,
        builtUrl: built?.url || null,
        hasPot: Boolean(built?.hasPot),
        ok: false,
        error: attempts[attempts.length - 1]?.reason || '未知错误',
        attempts
      }
    }));
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
    const data = parseSubtitleText(text);
    if (!data) {
      // timedtext 也可能返回空响应或非 JSON 格式，交给后续请求继续尝试。
      return false;
    }

    document.dispatchEvent(new CustomEvent('subtitle_data_captured', {
      detail: { url, text }
    }));
    console.log(`页面上下文：已捕获字幕响应数据，共 ${data.events.length} 个事件`);
    return true;
  }

  // 记录播放器真实 timedtext 请求使用的请求头，重放时复用它们。
  function rememberSubtitleRequestHeaders(headers) {
    if (!headers) {
      return;
    }
    const entries = typeof Headers !== 'undefined' && headers instanceof Headers
      ? Array.from(headers.entries())
      : Object.entries(headers);
    const normalized = {};
    entries.forEach(([name, value]) => {
      if (typeof name === 'string' && typeof value === 'string' && value) {
        normalized[name] = value;
      }
    });
    if (Object.keys(normalized).length > 0) {
      window.__capturedSubtitleRequestHeaders = normalized;
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
        rememberSubtitleRequestHeaders(this._lingkumaRequestHeaders);
        captureXhrSubtitleData(this, url).catch(error => {
          console.warn('页面上下文：读取字幕 XHR 响应失败:', error);
        });
      }, { once: true });
    }

    return originalXhrOpen.apply(this, arguments);
  };

  const originalXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    try {
      if (typeof this._url === 'string' && this._url.includes('/api/timedtext')) {
        this._lingkumaRequestHeaders = this._lingkumaRequestHeaders || {};
        this._lingkumaRequestHeaders[name] = value;
      }
    } catch (error) {
      // 头部记录失败不影响原始请求。
    }
    return originalXhrSetRequestHeader.apply(this, arguments);
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
      rememberSubtitleRequestHeaders(init?.headers);
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
