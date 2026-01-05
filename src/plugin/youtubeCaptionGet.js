// YouTube 字幕 URL 拦截器
(function() {
  console.log('YouTube 字幕 URL 拦截器已启动...');

  // 存储捕获到的字幕 URL
  const capturedSubtitleUrls = new Set();

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

// 验证URL是否能返回有效的JSON数据
window.isValidJsonUrl = async function(url) {
  try {
    // 确保URL包含json3格式
    const jsonUrl = url.includes('fmt=')
      ? url.replace(/fmt=[^&]+/, 'fmt=json3')
      : `${url}&fmt=json3`;

    console.log(`正在验证URL: ${jsonUrl}`);
    const response = await fetch(jsonUrl);
    if (!response.ok) {
      console.log(`URL返回非200状态码: ${response.status}`);
      return false;
    }

    // 尝试解析为JSON
    const text = await response.text();
    try {
      JSON.parse(text);
      console.log('URL返回有效的JSON数据');
      return true;
    } catch (e) {
      console.log('URL返回的数据不是有效的JSON');
      return false;
    }
  } catch (error) {
    console.error('验证URL时出错:', error);
    return false;
  }
};

// YouTube 字幕触发器
function triggerYouTubeSubtitles(force = false, closeAfter = false) {
  console.log('尝试触发 YouTube 字幕...');

  // 延迟执行，确保页面已完全加载
  setTimeout(() => {
    // YouTube 字幕按钮选择器
    const subtitleButtonSelector = '.ytp-subtitles-button';
    const subtitleButton = document.querySelector(subtitleButtonSelector);

    if (subtitleButton) {
      console.log('找到字幕按钮');

      // 检查字幕按钮状态
      const isPressed = subtitleButton.getAttribute('aria-pressed') === 'true';
      console.log(`字幕当前状态: ${isPressed ? '开启' : '关闭'}`);

      if (isPressed && force) {
        // 如果字幕已开启且强制刷新，先关闭再开启
        console.log('强制刷新字幕: 关闭再开启');
        subtitleButton.click();
        setTimeout(() => {
          subtitleButton.click();
          console.log('字幕已重新开启');

          // 如果需要在获取URL后关闭字幕
          if (closeAfter) {
            setTimeout(() => {
              console.log('获取URL后关闭字幕');
              subtitleButton.click();
            }, 1000); // 等待1秒后关闭字幕，确保URL已被捕获
          }
        }, 100);
      } else if (!isPressed) {
        // 如果字幕关闭，直接开启
        console.log('开启字幕');
        subtitleButton.click();

        // 如果需要在获取URL后关闭字幕
        if (closeAfter) {
          setTimeout(() => {
            console.log('获取URL后关闭字幕');
            subtitleButton.click();
          }, 1000); // 等待1秒后关闭字幕，确保URL已被捕获
        }
      } else if (isPressed && closeAfter) {
        // 如果字幕已开启且需要关闭
        console.log('关闭字幕');
        subtitleButton.click();
      } else {
        console.log('字幕已经开启，无需操作');
      }
      return;
    }

    // 如果找不到字幕按钮，尝试使用播放器 API
    console.log('未找到字幕按钮，尝试使用播放器 API');
    const player = document.querySelector('#movie_player');

    if (player && typeof player.toggleSubtitles === 'function') {
      console.log('使用播放器 API 切换字幕');
      player.toggleSubtitles();

      if (force) {
        setTimeout(() => {
          player.toggleSubtitles();
          console.log('字幕已重新切换');

          // 如果需要在获取URL后关闭字幕
          if (closeAfter) {
            setTimeout(() => {
              console.log('获取URL后关闭字幕');
              player.toggleSubtitles();
            }, 1000); // 等待1秒后关闭字幕，确保URL已被捕获
          }
        }, 100);
      } else if (closeAfter) {
        // 如果需要在获取URL后关闭字幕
        setTimeout(() => {
          console.log('获取URL后关闭字幕');
          player.toggleSubtitles();
        }, 1000); // 等待1秒后关闭字幕，确保URL已被捕获
      }
    } else {
      console.log('无法找到字幕控制元素或方法');
    }
  }, 1000);
}

// 提供一个函数来获取当前可用的字幕轨道
function getAvailableSubtitleTracks() {
  try {
    const player = document.querySelector('#movie_player');
    if (!player) {
      console.log('未找到视频播放器');
      return null;
    }

    // 尝试获取播放器响应数据
    const playerResponse = player.getPlayerResponse();
    if (!playerResponse) {
      console.log('无法获取播放器响应数据');
      return null;
    }

    // 提取字幕轨道信息
    const captionTracks = playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      console.log('该视频没有可用的字幕');
      return null;
    }

    console.log(`找到 ${captionTracks.length} 个字幕轨道:`);
    captionTracks.forEach((track, index) => {
      console.log(`[${index}] ${track.name?.simpleText || '未知'} (${track.languageCode})`);
    });

    return captionTracks;
  } catch (error) {
    console.error('获取字幕轨道时出错:', error);
    return null;
  }
}

function forceSubtitleAndGetJsonUrl(closeAfterGet = true){
  // 返回一个Promise，以便可以等待结果
  return new Promise((resolve) => {
    console.log('等待6秒后触发字幕...');
    // 等待6秒后再触发字幕
    setTimeout(() => {
      // 触发字幕，并设置是否在获取URL后关闭字幕
      triggerYouTubeSubtitles(true, closeAfterGet);

      // 最大等待时间（毫秒）
      const maxWaitTime = 10000;
      // 检查间隔（毫秒）
      const checkInterval = 300;
      // 开始时间
      const startTime = Date.now();

      // 创建一个函数来检查是否捕获到URL
      async function checkForUrls() {
        // 获取捕获的URL
        const capturedUrls = window.getSubtitleUrls();
        console.log('检查捕获的字幕URL:', capturedUrls);

        if (capturedUrls && capturedUrls.length > 0) {
          // 验证所有URL，找到第一个有效的
          for (const url of capturedUrls) {
            if (await window.isValidJsonUrl(url)) {
              // 确保URL包含json3格式
              const jsonUrl = url.includes('fmt=')
                ? url.replace(/fmt=[^&]+/, 'fmt=json3')
                : `${url}&fmt=json3`;

              console.log('成功获取到有效的JSON字幕URL:', jsonUrl);
              resolve(jsonUrl);
              return;
            }
          }

          console.log('捕获的URL中没有能返回有效JSON的URL');

          // 如果还没有超时，继续等待可能出现的有效URL
          if (Date.now() - startTime <= maxWaitTime) {
            setTimeout(checkForUrls, checkInterval);
            return;
          }
        }

        // 检查是否超时
        if (Date.now() - startTime > maxWaitTime) {
          console.log('等待字幕URL超时，尝试从字幕轨道获取');
          // 如果超时，尝试从字幕轨道获取
          const tracks = getAvailableSubtitleTracks();
          console.log('获取到的字幕轨道:', tracks);

          if (tracks && tracks.length > 0) {
            // 获取第一个字幕轨道的baseUrl
            const firstTrack = tracks[0];
            const baseUrl = firstTrack.baseUrl;

            // 验证baseUrl是否有效
            if (await window.isValidJsonUrl(baseUrl)) {
              // 确保URL包含json3格式
              const jsonUrl = baseUrl.includes('fmt=')
                ? baseUrl.replace(/fmt=[^&]+/, 'fmt=json3')
                : `${baseUrl}&fmt=json3`;

              console.log('从字幕轨道获取有效的JSON字幕URL:', jsonUrl);
              resolve(jsonUrl);
            } else {
              console.log('字幕轨道URL无法返回有效的JSON数据');
              resolve(null);
            }
          } else {
            console.log('无法获取字幕URL');
            resolve(null);
          }
          return;
        }

        // 如果还没有捕获到URL且未超时，继续等待
        setTimeout(checkForUrls, checkInterval);
      }

      // 开始检查
      setTimeout(checkForUrls, 1000); // 先等待1秒，让字幕触发生效
    }, 500); // 等待6秒后再触发字幕
  });
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
