// YouTube 字幕 URL 拦截器
(function() {
  console.log('YouTube 字幕 URL 拦截器已启动...');

  // 存储捕获到的字幕 URL
  const capturedSubtitleUrls = new Set();
  const capturedSubtitleData = new Map();
  const subtitleDataWaiters = new Set();
  const subtitleMatchingDataWaiters = new Set();
  const subtitleUrlValidationPromises = new Map();
  let availableSubtitleTracks = [];

  function cacheSubtitleData(url, data) {
    if (!url || !Array.isArray(data?.events)) {
      return false;
    }

    capturedSubtitleData.set(url, data);
    console.log(`Content Script: 已缓存字幕响应数据，共 ${data.events.length} 个事件`);
    for (const waiter of subtitleDataWaiters) {
      waiter({ url, data });
    }
    subtitleDataWaiters.clear();
    for (const waiter of subtitleMatchingDataWaiters) {
      waiter({ url, data });
    }
    return true;
  }

  // 跟踪当前视频ID
  let currentVideoId = null;

  // 检查是否在YouTube页面上
  if (!window.location.hostname.includes('youtube.com')) {
    console.log('不在YouTube页面上，字幕拦截器不会启动');
    return;
  }

  // 在内容脚本中直接注入脚本到页面
  try {
    // 创建script元素
    const script = document.createElement('script');
    // 设置脚本源为扩展中的文件
    script.src = chrome.runtime.getURL('src/plugin/youtubeCaptionInjected.js');
    // 设置加载完成后移除脚本元素
    script.onload = function() {
      this.remove();
      console.log('YouTube字幕URL拦截器脚本注入成功');
    };
    // 添加到页面
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error('注入脚本时出错:', error);
  }

  // 获取当前视频ID的函数
  function getCurrentVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // 检查视频是否切换，如果切换则清空缓存
  function checkVideoChange() {
    const newVideoId = getCurrentVideoId();
    if (newVideoId && newVideoId !== currentVideoId) {
      console.log(`视频切换检测: ${currentVideoId} -> ${newVideoId}`);
      currentVideoId = newVideoId;
      // 清空字幕URL缓存
      capturedSubtitleUrls.clear();
      capturedSubtitleData.clear();
      subtitleUrlValidationPromises.clear();
      // 同时清空页面上下文的缓存
      if (window.__capturedSubtitleUrls) {
        window.__capturedSubtitleUrls.clear();
      }
      console.log('已清空字幕URL缓存');
    }
  }

  // 监听自定义事件，从页面上下文获取字幕URL
  document.addEventListener('subtitle_url_captured', function(event) {
    const url = event.detail.url;
    console.log(`Content Script: 从页面上下文捕获到字幕URL:`, url);

    // 检查视频是否切换
    checkVideoChange();

    capturedSubtitleUrls.add(url);
  });

  document.addEventListener('subtitle_data_captured', function(event) {
    const url = event.detail?.url;
    const text = event.detail?.text;
    if (!url || !text) {
      return;
    }

    try {
      const data = JSON.parse(text);
      cacheSubtitleData(url, data);
    } catch (error) {
      console.warn('Content Script: 无法解析捕获的字幕响应:', error);
    }
  });

  document.addEventListener('lingkuma_subtitle_tracks_result', function(event) {
    availableSubtitleTracks = Array.isArray(event.detail?.tracks) ? event.detail.tracks : [];
    const waiter = subtitleTrackWaiters.get(event.detail?.requestId);
    if (waiter) {
      subtitleTrackWaiters.delete(event.detail.requestId);
      waiter(availableSubtitleTracks);
    }
  });

  document.addEventListener('lingkuma_subtitle_track_fetch_result', function(event) {
    const waiter = subtitleFetchWaiters.get(event.detail?.requestId);
    if (waiter) {
      subtitleFetchWaiters.delete(event.detail.requestId);
      waiter(event.detail);
    }
  });

  document.addEventListener('lingkuma_subtitle_track_select_result', function(event) {
    const waiter = subtitleSelectWaiters.get(event.detail?.requestId);
    if (waiter) {
      subtitleSelectWaiters.delete(event.detail.requestId);
      waiter(event.detail);
    }
  });

  // 定期检查视频切换（作为备用机制）
  setInterval(checkVideoChange, 1000);

  // 提供获取字幕的函数
  window.getSubtitleUrls = function() {
    if (capturedSubtitleUrls.size === 0) {
      console.log('尚未捕获到任何字幕 URL，请尝试播放视频或切换字幕');
      return [];
    }

    console.log('已捕获的字幕 URL:');
    const urls = Array.from(capturedSubtitleUrls);

    urls.forEach((url, index) => {
      console.log(`[${index}] ${url}`);

      // 为不同格式创建链接
      const formats = ['json3', 'vtt', 'srt', 'ttml'];
      formats.forEach(format => {
        const formatUrl = url.includes('fmt=')
          ? url.replace(/fmt=[^&]+/, `fmt=${format}`)
          : `${url}&fmt=${format}`;
        console.log(`    ${format.toUpperCase()}: ${formatUrl}`);
      });
    });

    return urls;
  };

  window.getCapturedSubtitleData = function(url) {
    if (!url) {
      for (const data of capturedSubtitleData.values()) {
        return data;
      }
      return null;
    }

    if (capturedSubtitleData.has(url)) {
      return capturedSubtitleData.get(url);
    }

    // A captured response may differ only in fmt or signed URL parameters.
    // Match the requested language/translation track, never an unrelated
    // cached response (for example de->en when de was requested).
    let target;
    try {
      target = new URL(url, location.origin);
    } catch (error) {
      return null;
    }
    for (const [candidateUrl, data] of capturedSubtitleData.entries()) {
      try {
        const candidate = new URL(candidateUrl, location.origin);
        if (candidate.pathname === target.pathname &&
          candidate.searchParams.get('lang') === target.searchParams.get('lang') &&
          (candidate.searchParams.get('tlang') || '') === (target.searchParams.get('tlang') || '') &&
          (candidate.searchParams.get('kind') || '') === (target.searchParams.get('kind') || '') &&
          (candidate.searchParams.get('vss_id') || candidate.searchParams.get('vssId') || '') ===
            (target.searchParams.get('vss_id') || target.searchParams.get('vssId') || '')) {
          return data;
        }
      } catch (error) {
        // Ignore malformed captured URLs and continue searching.
      }
    }
    return null;
  };

  window.cacheCapturedSubtitleData = cacheSubtitleData;

  window.waitForCapturedSubtitleData = function(timeoutMs = 10000) {
    for (const [url, data] of capturedSubtitleData.entries()) {
      return Promise.resolve({ url, data });
    }

    return new Promise(resolve => {
      const waiter = result => {
        clearTimeout(timeoutId);
        resolve(result);
      };
      const timeoutId = setTimeout(() => {
        subtitleDataWaiters.delete(waiter);
        resolve(null);
      }, timeoutMs);
      subtitleDataWaiters.add(waiter);
    });
  };

  window.waitForCapturedSubtitleDataMatching = function(url, timeoutMs = 5000) {
    const target = new URL(url, location.origin);
    const matches = candidateUrl => {
      try {
        const candidate = new URL(candidateUrl, location.origin);
        return candidate.searchParams.get('lang') === target.searchParams.get('lang') &&
          (candidate.searchParams.get('tlang') || '') === (target.searchParams.get('tlang') || '');
      } catch (error) {
        return candidateUrl === url;
      }
    };

    for (const [candidateUrl, data] of capturedSubtitleData.entries()) {
      if (matches(candidateUrl)) {
        return Promise.resolve({ url: candidateUrl, data });
      }
    }

    return new Promise(resolve => {
      const waiter = result => {
        if (!matches(result?.url)) {
          return;
        }
        clearTimeout(timeoutId);
        subtitleMatchingDataWaiters.delete(waiter);
        resolve(result);
      };
      const timeoutId = setTimeout(() => {
        subtitleMatchingDataWaiters.delete(waiter);
        resolve(null);
      }, timeoutMs);
      subtitleMatchingDataWaiters.add(waiter);
    });
  };

  window.getBestCapturedSubtitleUrl = function() {
    const urls = Array.from(capturedSubtitleUrls).reverse();
    return urls.sort((a, b) => {
      const score = url => (url.includes('pot=') ? 2 : 0) +
        (url.includes('fmt=json3') ? 1 : 0) -
        (url.includes('tlang=') ? 4 : 0);
      return score(b) - score(a);
    })[0] || null;
  };

  window.getSubtitleUrlValidationPromise = function(url) {
    return subtitleUrlValidationPromises.get(url);
  };

  window.setSubtitleUrlValidationPromise = function(url, promise) {
    subtitleUrlValidationPromises.set(url, promise);
  };

  window.getAvailableSubtitleTracks = function() {
    return availableSubtitleTracks.slice();
  };

  // 提供下载函数
  window.downloadSubtitle = async function(url, filename) {
    if (!url) {
      const urls = window.getSubtitleUrls();
      if (urls.length === 0) {
        console.log('没有可用的字幕URL');
        return;
      }

      // 验证所有URL，找到第一个有效的
      console.log('正在验证所有捕获的URL...');
      for (const u of urls) {
        if (await window.isValidJsonUrl(u)) {
          url = u;
          console.log('找到有效的字幕URL:', url);
          break;
        }
      }

      if (!url) {
        console.log('没有找到能返回有效JSON的字幕URL，无法下载');
        return;
      }
    } else {
      // 验证提供的URL
      const isValid = await window.isValidJsonUrl(url);
      if (!isValid) {
        console.log('提供的URL无法返回有效的JSON数据:', url);
        console.log('尝试查找其他有效URL...');

        const urls = window.getSubtitleUrls();
        for (const u of urls) {
          if (await window.isValidJsonUrl(u)) {
            url = u;
            console.log('找到替代的有效字幕URL:', url);
            break;
          }
        }

        if (url && !(await window.isValidJsonUrl(url))) {
          console.log('没有找到能返回有效JSON的字幕URL，无法下载');
          return;
        }
      }
    }

    try {
      // 确保 URL 包含 fmt 参数
      if (!url.includes('fmt=')) {
        url = `${url}&fmt=json3`;
      }

      console.log(`正在下载字幕: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename || 'subtitle.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      console.log('字幕下载成功!');
    } catch (error) {
      console.error('下载字幕时出错:', error);
    }
  };

})();

const subtitleTrackWaiters = new Map();
const subtitleFetchWaiters = new Map();
const subtitleSelectWaiters = new Map();
let subtitleRequestId = 0;

function requestPageSubtitleTracks(timeoutMs = 5000) {
  const requestId = `lingkuma-tracks-${Date.now()}-${++subtitleRequestId}`;
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      subtitleTrackWaiters.delete(requestId);
      resolve(window.getAvailableSubtitleTracks?.() || []);
    }, timeoutMs);
    subtitleTrackWaiters.set(requestId, tracks => {
      clearTimeout(timeoutId);
      resolve(tracks);
    });
    document.dispatchEvent(new CustomEvent('lingkuma_subtitle_tracks_request', {
      detail: { requestId }
    }));
  });
}

function requestPageSubtitleTrack(url, timeoutMs = 12000) {
  const requestId = `lingkuma-track-fetch-${Date.now()}-${++subtitleRequestId}`;
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      subtitleFetchWaiters.delete(requestId);
      resolve({ requestId, url, ok: false, error: '请求超时' });
    }, timeoutMs);
    subtitleFetchWaiters.set(requestId, result => {
      clearTimeout(timeoutId);
      resolve(result);
    });
    document.dispatchEvent(new CustomEvent('lingkuma_subtitle_track_fetch', {
      detail: { requestId, url }
    }));
  });
}

function requestPageSubtitleTrackSelection(url, metadata = {}, timeoutMs = 5000) {
  const requestId = `lingkuma-track-select-${Date.now()}-${++subtitleRequestId}`;
  return new Promise(resolve => {
    const timeoutId = setTimeout(() => {
      subtitleSelectWaiters.delete(requestId);
      resolve({ requestId, url, switched: false, error: '切换请求超时' });
    }, timeoutMs);
    subtitleSelectWaiters.set(requestId, result => {
      clearTimeout(timeoutId);
      resolve(result);
    });
    document.dispatchEvent(new CustomEvent('lingkuma_subtitle_track_select', {
      detail: { requestId, url, metadata }
    }));
  });
}

function normalizeSubtitleJsonUrl(url) {
  if (!url) {
    return null;
  }
  const normalized = new URL(url, location.origin);
  normalized.searchParams.set('fmt', 'json3');
  return normalized.toString();
}

function getCapturedSubtitleLabel(url) {
  try {
    const parsed = new URL(url);
    const language = parsed.searchParams.get('lang') || '未知语言';
    const translation = parsed.searchParams.get('tlang');
    return translation ? `监听结果: ${language} -> ${translation}` : `监听结果: ${language}`;
  } catch (error) {
    return '监听到的字幕';
  }
}

window.getYoutubeSubtitleOptions = async function() {
  const tracks = await requestPageSubtitleTracks(4500);
  const options = [];
  const seen = new Set();
  const addOption = (option) => {
    const url = normalizeSubtitleJsonUrl(option.url);
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    options.push({ ...option, url });
  };

  tracks.forEach(track => {
    if (!track.baseUrl) {
      return;
    }
    const baseOption = {
      url: track.baseUrl,
      label: `${track.name || track.languageCode || '未知'}${track.kind === 'asr' ? ' (自动)' : ''}${track.translationLanguageCode ? ' (翻译)' : ''}`,
      source: 'player',
      languageCode: track.languageCode || '',
      kind: track.kind || '',
      vssId: track.vssId || '',
      translationLanguageCode: track.translationLanguageCode || ''
    };
    addOption(baseOption);

  });

  (window.getSubtitleUrls?.() || []).forEach(url => {
    addOption({
      url,
      label: getCapturedSubtitleLabel(url),
      source: 'captured'
    });
  });

  return options;
};

window.selectYoutubeSubtitle = async function(url, option = null) {
  const normalizedUrl = normalizeSubtitleJsonUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  window.lingkumaSelectedSubtitleUrl = normalizedUrl;
  const selectedOption = option || (await window.getYoutubeSubtitleOptions?.() || [])
    .find(candidate => candidate.url === normalizedUrl);
  let nativeTrackSwitched = false;
  if (selectedOption?.source === 'player') {
    console.log('请求切换 YouTube 原生字幕轨道:', {
      label: selectedOption.label,
      languageCode: selectedOption.languageCode,
      kind: selectedOption.kind,
      vssId: selectedOption.vssId,
      translationLanguageCode: selectedOption.translationLanguageCode
    });
    const switchResult = await requestPageSubtitleTrackSelection(normalizedUrl, selectedOption);
    if (switchResult?.switched) {
      console.log('YouTube 原生字幕切换请求已提交，等待新的字幕响应');
      const capturedResult = await window.waitForCapturedSubtitleDataMatching(normalizedUrl, 5000);
      nativeTrackSwitched = Boolean(capturedResult?.url);
      if (!nativeTrackSwitched) {
        console.warn('YouTube 未返回目标轨道字幕响应，仅更新悬浮层');
      }
    } else {
      console.warn('YouTube 原生字幕未切换，仅更新悬浮层:', switchResult?.error || '未知错误');
    }
  }
  if (!window.getCapturedSubtitleData?.(normalizedUrl)) {
    const result = await requestPageSubtitleTrack(normalizedUrl);
    if (!result?.ok) {
      if (nativeTrackSwitched) {
        const capturedResult = await window.waitForCapturedSubtitleData?.(5000);
        if (capturedResult?.url) {
          window.lingkumaSelectedSubtitleUrl = normalizeSubtitleJsonUrl(capturedResult.url);
          return window.lingkumaSelectedSubtitleUrl;
        }
      }
      console.warn('无法加载所选字幕:', result?.error || normalizedUrl);
      return null;
    }
  }
  window.lingkumaNativeSubtitleSwitched = nativeTrackSwitched;
  document.dispatchEvent(new CustomEvent('lingkuma_subtitle_selection_changed', {
    detail: { url: normalizedUrl }
  }));
  return normalizedUrl;
};

// 验证URL是否能返回有效的JSON数据
window.isValidJsonUrl = async function(url) {
  try {
    const capturedData = window.getCapturedSubtitleData?.(url);
    if (capturedData && Array.isArray(capturedData.events)) {
      console.log('已使用原始请求捕获的有效JSON字幕数据');
      return true;
    }

    // 确保URL包含json3格式
    const jsonUrl = url.includes('fmt=')
      ? url.replace(/fmt=[^&]+/, 'fmt=json3')
      : `${url}&fmt=json3`;

    const existingValidation = window.getSubtitleUrlValidationPromise?.(jsonUrl);
    if (existingValidation) {
      console.log('该字幕URL已验证过，复用验证结果');
      return await existingValidation;
    }

    console.log(`正在验证URL: ${jsonUrl}`);
    const validationPromise = (async () => {
      const response = await fetch(jsonUrl);
      if (!response.ok) {
        console.log(`URL返回非200状态码: ${response.status}`);
        return false;
      }

      const text = await response.text();
      try {
        const data = JSON.parse(text);
        const isSubtitleData = Array.isArray(data.events);
        if (isSubtitleData) {
          window.cacheCapturedSubtitleData?.(jsonUrl, data);
        }
        console.log(isSubtitleData ? 'URL返回有效的JSON字幕数据' : 'URL返回的JSON不含字幕事件');
        return isSubtitleData;
      } catch (e) {
        console.log('URL返回的数据不是有效的JSON');
        return false;
      }
    })();
    window.setSubtitleUrlValidationPromise?.(jsonUrl, validationPromise);
    return await validationPromise;
  } catch (error) {
    console.error('验证URL时出错:', error);
    return false;
  }
};

function getYouTubeSubtitleButton() {
  const selectors = [
    '.ytp-subtitles-button',
    '#player-control-overlay yt-closed-captions-toggle-button ytm-closed-captioning-button button',
    '#player-control-overlay ytm-closed-captioning-button button',
    'yt-closed-captions-toggle-button ytm-closed-captioning-button button'
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button) {
      return button;
    }
  }

  return null;
}

function isYouTubeSubtitleButtonPressed(button) {
  if (!button) {
    return false;
  }

  return button.getAttribute('aria-pressed') === 'true' ||
    button.getAttribute('aria-checked') === 'true' ||
    button.closest('[aria-pressed="true"], [aria-checked="true"]') !== null;
}

let youtubeCaptionControlRequestId = 0;

function requestPageYouTubeCaptionControl(action, timeoutMs = 6500) {
  const requestId = `lingkuma-caption-${Date.now()}-${++youtubeCaptionControlRequestId}`;

  return new Promise(resolve => {
    const handleResult = event => {
      if (event.detail?.requestId !== requestId) {
        return;
      }
      clearTimeout(timeoutId);
      document.removeEventListener('lingkuma_youtube_caption_control_result', handleResult);
      resolve(event.detail);
    };
    const timeoutId = setTimeout(() => {
      document.removeEventListener('lingkuma_youtube_caption_control_result', handleResult);
      resolve(null);
    }, timeoutMs);

    document.addEventListener('lingkuma_youtube_caption_control_result', handleResult);
    document.dispatchEvent(new CustomEvent('lingkuma_youtube_caption_control', {
      detail: { requestId, action }
    }));
  });
}

function showYouTubePlayerControls() {
  if (getYouTubeSubtitleButton()) {
    return;
  }

  const video = document.querySelector('video');
  if (video) {
    console.log('移动播放器控件未显示，尝试唤醒控件层');
    video.click();
  }

  requestPageYouTubeCaptionControl('show').catch(() => {});
}

function waitForYouTubeSubtitleButton(timeoutMs = 5000) {
  const existingButton = getYouTubeSubtitleButton();
  if (existingButton) {
    return Promise.resolve(existingButton);
  }

  showYouTubePlayerControls();

  return new Promise(resolve => {
    const startedAt = Date.now();
    const check = () => {
      const button = getYouTubeSubtitleButton();
      if (button || Date.now() - startedAt >= timeoutMs) {
        resolve(button);
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

function clickYouTubeSubtitleButton(button) {
  if (!button) {
    return false;
  }

  button.click();
  return true;
}

function waitForYouTubeSubtitleButtonState(pressed, timeoutMs = 2000) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const check = () => {
      const button = getYouTubeSubtitleButton();
      if (button && isYouTubeSubtitleButtonPressed(button) === pressed) {
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

// YouTube 字幕触发器
async function triggerYouTubeSubtitles(force = false, closeAfter = false) {
  console.log('尝试触发 YouTube 字幕...');

  await new Promise(resolve => setTimeout(resolve, 250));
  const subtitleButton = await waitForYouTubeSubtitleButton();

  if (subtitleButton) {
    const isMobileButton = subtitleButton.matches(
      '#player-control-overlay yt-closed-captions-toggle-button ytm-closed-captioning-button button,' +
      '#player-control-overlay ytm-closed-captioning-button button'
    );
    console.log(`找到字幕按钮${isMobileButton ? '（移动播放器）' : ''}`);

    const isPressed = isYouTubeSubtitleButtonPressed(subtitleButton);
    console.log(`字幕当前状态: ${isPressed ? '开启' : '关闭'}`);

    if (isPressed && force) {
      console.log('强制刷新字幕: 关闭再开启');
      clickYouTubeSubtitleButton(subtitleButton);
      const disabledButton = await waitForYouTubeSubtitleButtonState(false);
      if (disabledButton && !isYouTubeSubtitleButtonPressed(disabledButton)) {
        await new Promise(resolve => setTimeout(resolve, 300));
        clickYouTubeSubtitleButton(disabledButton);
        await waitForYouTubeSubtitleButtonState(true);
      } else {
        console.warn('字幕按钮没有确认进入关闭状态，保持当前开启状态并等待响应');
      }
      console.log('字幕已重新开启');
    } else if (!isPressed) {
      console.log('开启字幕');
      clickYouTubeSubtitleButton(subtitleButton);
      await waitForYouTubeSubtitleButtonState(true);
    } else if (closeAfter) {
      console.log('关闭字幕');
      clickYouTubeSubtitleButton(subtitleButton);
    } else {
      console.log('字幕已经开启，无需操作');
    }
    return true;
  }

  console.log('隔离世界未找到字幕按钮，尝试通过页面上下文控制移动字幕');
  const pageControlResult = await requestPageYouTubeCaptionControl(force ? 'refresh' : 'ensure-on');
  if (pageControlResult?.found) {
    console.log('页面上下文已操作移动字幕按钮:', pageControlResult);
    return true;
  }

  console.log('页面上下文也未找到字幕按钮，尝试使用播放器 API');
  const player = document.querySelector('#movie_player');

  if (player && typeof player.toggleSubtitles === 'function') {
    console.log('使用播放器 API 切换字幕');
    player.toggleSubtitles();
    if (force) {
      await new Promise(resolve => setTimeout(resolve, 150));
      player.toggleSubtitles();
      console.log('字幕已重新切换');
    }
    return true;
  }

  console.log('无法找到字幕控制元素或方法');
  return false;
}

// 提供一个函数来获取当前可用的字幕轨道。
// YouTube 将翻译字幕作为 timedtext 请求的 tlang 参数处理，播放器返回的
// captionTracks 则是视频实际提供的源字幕列表。优先使用后者可以避免
// 读取到播放器当前 UI 选择的翻译语言。
function getAvailableSubtitleTracks() {
  return window.getAvailableSubtitleTracks?.() || [];
}

function getSubtitleTrackName(track) {
  return track?.name?.simpleText || track?.name?.runs?.map(run => run.text).join('') ||
    track?.languageName?.simpleText || track?.languageCode || '未知';
}

function chooseSourceSubtitleTrack(tracks, preferredLanguageCode, defaultTrackIndex) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return null;
  }

  const sourceTracks = tracks.filter(track => {
    try {
      return !new URL(track.baseUrl).searchParams.has('tlang');
    } catch (error) {
      return true;
    }
  });
  const candidates = sourceTracks.length > 0 ? sourceTracks : tracks;
  if (Number.isInteger(defaultTrackIndex)) {
    const defaultTrack = tracks[defaultTrackIndex];
    if (defaultTrack && candidates.includes(defaultTrack)) {
      return defaultTrack;
    }
  }
  const preferred = preferredLanguageCode && candidates.find(track =>
    track.languageCode === preferredLanguageCode ||
    track.languageCode?.startsWith(`${preferredLanguageCode}-`)
  );
  if (preferred) {
    return preferred;
  }

  // Manual captions carry no `kind: asr`; use them before auto-generated text.
  return candidates.find(track => track.kind !== 'asr') || candidates[0];
}

async function getPlayerSourceSubtitleUrl(preferredLanguageCode) {
  const tracks = await requestPageSubtitleTracks();
  const defaultTrackIndex = tracks.findIndex(track => !track.translationLanguageCode);
  const track = chooseSourceSubtitleTrack(tracks, preferredLanguageCode, defaultTrackIndex);
  if (track?.baseUrl) {
    const url = new URL(track.baseUrl, location.origin);
    url.searchParams.set('fmt', 'json3');
    url.searchParams.delete('tlang');
    console.log(`选用源字幕轨道: ${track.name || getSubtitleTrackName(track)} (${track.languageCode || 'unknown'})`);
    return {
      url: url.toString(),
      track
    };
  }
  return null;
}

async function fetchPlayerSourceSubtitle(preferredLanguageCode) {
  const selected = await getPlayerSourceSubtitleUrl(preferredLanguageCode);
  if (!selected) {
    return null;
  }

  try {
    const result = await requestPageSubtitleTrack(selected.url);
    if (!result?.ok) {
      throw new Error(result?.error || '页面上下文获取字幕失败');
    }
    return selected.url;
  } catch (error) {
    console.warn('直接获取播放器源字幕失败，将回退到网络监听:', error);
    return null;
  }
}

async function forceSubtitleAndGetJsonUrl(closeAfterGet = true, options = {}) {
  // 支持 forceSubtitleAndGetJsonUrl({ closeAfterGet, languageCode })，同时保持
  // 旧调用 forceSubtitleAndGetJsonUrl(true/false) 的兼容性。
  if (typeof closeAfterGet === 'object') {
    options = closeAfterGet;
    closeAfterGet = options.closeAfterGet !== false;
  }

  const selectedUrl = options.trackUrl || window.lingkumaSelectedSubtitleUrl;
  let directUrl = null;
  if (selectedUrl) {
    const normalizedUrl = normalizeSubtitleJsonUrl(selectedUrl);
    if (window.getCapturedSubtitleData?.(normalizedUrl)) {
      directUrl = normalizedUrl;
    } else {
      const result = await requestPageSubtitleTrack(normalizedUrl);
      if (result?.ok) {
        directUrl = normalizedUrl;
      }
    }
  }
  if (!directUrl) {
    directUrl = await fetchPlayerSourceSubtitle(options.languageCode);
  }
  if (directUrl) {
    console.log('已从播放器响应直接获取源字幕，不触发 YouTube CC');
    return directUrl;
  }

  console.log('触发字幕并等待原始字幕响应...');
  const maxAttempts = 3;
  let capturedResult = null;
  let url = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`第 ${attempt}/${maxAttempts} 次触发 YouTube 字幕`);
    await triggerYouTubeSubtitles(true, false);
    capturedResult = await window.waitForCapturedSubtitleData(5000);
    url = capturedResult?.url || window.getBestCapturedSubtitleUrl();

    if (capturedResult) {
      break;
    }

    if (url) {
      console.log('已捕获字幕URL，交给页面上下文重放并读取响应');
      const replayResult = await requestPageSubtitleTrack(url);
      if (replayResult?.ok) {
        capturedResult = await window.waitForCapturedSubtitleData(1000);
        if (capturedResult?.url || window.getCapturedSubtitleData?.(url)) {
          break;
        }
      }
      console.log('页面上下文重放失败，验证本次字幕URL');
      if (await window.isValidJsonUrl(url)) {
        break;
      }
      console.warn('本次字幕URL无有效JSON数据，继续重新触发');
      url = null;
    }

    if (attempt < maxAttempts) {
      console.warn('字幕按钮已操作，但未产生字幕请求，准备重新触发');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (!url) {
    console.log(`连续 ${maxAttempts} 次触发后仍未捕获到字幕URL`);
    return null;
  }

  const jsonUrl = url.includes('fmt=')
    ? url.replace(/fmt=[^&]+/, 'fmt=json3')
    : `${url}&fmt=json3`;

  if (closeAfterGet) {
    const subtitleButton = await waitForYouTubeSubtitleButton(2000);
    if (isYouTubeSubtitleButtonPressed(subtitleButton)) {
      clickYouTubeSubtitleButton(subtitleButton);
    } else if (!subtitleButton) {
      await requestPageYouTubeCaptionControl('ensure-off', 3000);
    }
  }

  console.log('成功获取到JSON字幕:', capturedResult ? '原始响应数据' : jsonUrl);
  return jsonUrl;
}


// console.log('拦截器已设置完成。请触发字幕');
// console.log('使用 getSubtitleUrls() 查看捕获的 URL');
// console.log('使用 downloadSubtitle(url, filename) 下载字幕');
// // 执行触发字幕的函数
// console.log('YouTube 字幕触发器已加载');
// console.log('使用 triggerYouTubeSubtitles() 触发字幕');
// console.log('使用 triggerYouTubeSubtitles(true) 强制刷新字幕');
// console.log('使用 triggerYouTubeSubtitles(false, true) 切换字幕状态（如果开启则关闭，如果关闭则开启）');
// console.log('使用 getAvailableSubtitleTracks() 获取可用字幕轨道');

// console.log('使用 forceSubtitleAndGetJsonUrl() 强制触发字幕并获取JSON URL后自动关闭字幕');
// console.log('使用 forceSubtitleAndGetJsonUrl(false) 强制触发字幕并获取JSON URL但不关闭字幕');
