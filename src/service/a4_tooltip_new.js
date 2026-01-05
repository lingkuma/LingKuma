let tooltipResizeObserver = null; // <--- 添加：用于监听 tooltip 大小的 ResizeObserver
let currentTooltipKeydownHandler = null; // <--- 添加：用于存储当前键盘监听器

let ShouldAutoUpdateStatus = true;
let lastPlayedTTSWord = null; // <--- 添加这一行
let ttsDebounceTimer = null; // <--- 添加: TTS防抖定时器ID
let wordForDebouncedTTS = null; // <--- 添加: 等待播放TTS的单词信息 {word: string, sentence: string}
let currentWordRect = null; // <--- 添加：保存当前单词的位置信息，用于mini窗口重新定位

// 液体玻璃效果相关变量
let liquidGlassEnabled = false; // 液体玻璃效果开关，默认关闭
let liquidGlassUpdater = null; // 液体玻璃更新函数
let liquidGlassEnabledCache = null; // 缓存的液体玻璃状态 
let liquidGlassEnabledCacheTime = 0; // 缓存时间戳

// 防止重复执行的变量
let aiTranslationInProgress = new Set(); // 正在进行AI翻译的单词集合
let tooltipCreationInProgress = false; // 防止重复创建tooltip
let tooltipBeingDestroyed = false; // 标记tooltip是否正在被销毁
let lastTooltipWord = null; // 上一次显示的tooltip单词
let tooltipDebounceTimer = null; // tooltip防抖定时器

// AI翻译完成状态追踪
let aiTranslationStatus = {
  ai1: { completed: false, result: null, shouldRefresh: false }, // shouldRefresh表示是否需要刷新（即是否添加到数据库）
  ai2: { completed: false, result: null }
};

// 日志去重机制
let loggedMessages = new Set();
function logOnce(message, ...args) {
  const key = message + JSON.stringify(args);
  if (!loggedMessages.has(key)) {
    console.log(message, ...args);
    loggedMessages.add(key);
    // 定期清理日志缓存，避免内存泄漏
    setTimeout(() => loggedMessages.delete(key), 30000); // 30秒后清理
  }
}

/**
 * 确保单词拥有完整的详情数据
 * 如果缓存中只有轻量级数据（status + isCustom），则从数据库加载完整数据
 * @param {string} word - 单词（小写）
 * @returns {Promise<Object>} 完整的单词详情
 */
async function ensureFullWordDetails(word) {
  const lower = word.toLowerCase();
  const cached = highlightManager?.wordDetailsFromDB?.[lower];

  // 如果缓存中没有数据，从数据库查询
  if (!cached) {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "getWordDetails",
        word: lower
      }, resolve);
    });

    const fullDetails = response?.details || {};

    // 更新缓存
    if (highlightManager && highlightManager.wordDetailsFromDB) {
      highlightManager.wordDetailsFromDB[lower] = fullDetails;
    }

    return fullDetails;
  }

  // 如果缓存中只有轻量级数据（没有translations字段），说明需要加载完整数据
  if (cached && !cached.hasOwnProperty('translations')) {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "getWordDetails",
        word: lower
      }, resolve);
    });

    const fullDetails = response?.details || {};

    // 更新缓存为完整数据
    if (highlightManager && highlightManager.wordDetailsFromDB) {
      highlightManager.wordDetailsFromDB[lower] = fullDetails;
    }

    return fullDetails;
  }

  // 缓存中已有完整数据，直接返回
  return cached;
}

/**
 * 快速获取液体玻璃状态（带缓存）
 */
function getLiquidGlassEnabledFast() {
  return new Promise((resolve) => {
    const now = Date.now();
    // 缓存5秒有效
    if (liquidGlassEnabledCache !== null && (now - liquidGlassEnabledCacheTime < 5000)) {
      resolve(liquidGlassEnabledCache);
      return;
    }

    chrome.storage.local.get(['liquidGlassEnabled'], (result) => {
      const isEnabled = result.liquidGlassEnabled !== undefined ? result.liquidGlassEnabled : liquidGlassEnabled;
      liquidGlassEnabledCache = isEnabled;
      liquidGlassEnabledCacheTime = now;
      resolve(isEnabled);
    });
  });
}

/**
 * 检测是否为Firefox浏览器
 */
async function isFirefox() {
  // return true
  const userAgent = navigator.userAgent.toLowerCase();
  // 检测Firefox
  const isFirefoxBrowser = userAgent.includes('firefox');
  // 检测Orion浏览器
  const isOrionBrowser = await isOrion();
  // 检测iOS设备（iPhone、iPad、Mac）
  const isIOSDevice = userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('mac');

  return isFirefoxBrowser || isOrionBrowser || isIOSDevice;
}

/**
 * 检测是否为Orion浏览器
 */
async function isOrion() {
  return await getStorageValue('useOrionTTS');
}

/**
 * 为弹窗应用液体玻璃效果
 */
function applyLiquidGlassToTooltip() {
  return new Promise(async (resolve) => {
    // 使用快速缓存获取状态
    const isEnabled = await getLiquidGlassEnabledFast();

    // 检查是否启用液体玻璃效果
    if (!isEnabled || !tooltipEl) {
      console.log('液体玻璃效果已禁用或弹窗不存在');
      resolve();
      return;
    }

    // Firefox不支持SVG玻璃效果，使用CSS实现
    if (await isFirefox()) {
      console.log('检测到Firefox浏览器，使用CSS玻璃效果');
      applyFirefoxGlassEffect();
      resolve();
      return;
    }

    // 立即执行液体玻璃效果应用，减少延迟
    requestAnimationFrame(() => {
      applyLiquidGlassEffect();
      // 减少延迟到最小
      setTimeout(() => {
        resolve();
      }, 16); // 一个动画帧的时间
    });
  });
}

/**
 * 为Firefox应用CSS玻璃效果
 */
function applyFirefoxGlassEffect() {
  if (!tooltipEl) {
    console.log('弹窗元素不存在，无法应用Firefox玻璃效果');
    return;
  }

  try {
    // 添加Firefox玻璃效果标记类
    tooltipEl.classList.add('firefox-glass-effect');

    // 检测当前主题模式
    chrome.storage.local.get(['isDarkMode'], (result) => {
      const isDark = result.isDarkMode;
      if (isDark) {
        tooltipEl.classList.add('dark-mode');
      } else {
        tooltipEl.classList.add('light-mode');
      }
    });

    // 同时为所有胶囊应用Firefox玻璃效果
    applyGlassEffectToCapsules(true, false);

    console.log('Firefox CSS玻璃效果已应用到弹窗');
    // 注意：胶囊的玻璃效果会在胶囊创建时自动应用，不需要在这里调用
  } catch (error) {
    console.error('应用Firefox玻璃效果失败:', error);
  }
}

/**
 * 实际应用液体玻璃效果的函数
 */
function applyLiquidGlassEffect() {
  try {
    // 快速检查弹窗是否存在
    if (!tooltipEl) {
      console.log('弹窗不存在，跳过液体玻璃效果应用');
      return;
    }

    // 在应用新效果前，快速清理旧容器（如果有的话）
    const existingContainers = document.querySelectorAll('#tooltip-liquid-glass-container');
    if (existingContainers.length > 0) {
      console.log(`快速清理 ${existingContainers.length} 个残留的液体玻璃容器...`);
      existingContainers.forEach(container => {
        try {
          container.remove();
        } catch (error) {
          console.error('清理残留容器时出错:', error);
        }
      });
    }

    // 检查是否已经加载了液体玻璃库
    if (typeof LiquidGlass === 'undefined') {
      console.error('LiquidGlass 库未加载，无法应用液体玻璃效果');
      return;
    }

    // 获取弹窗的位置和尺寸
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;

    // 让弹窗背景透明，这样液体玻璃效果可以透过弹窗看到后面的内容
    tooltipEl.style.setProperty('background-color', 'rgba(255, 255, 255, 0.05)', 'important');
    tooltipEl.style.setProperty('backdrop-filter', 'none', 'important'); // 移除弹窗自身的模糊效果

    // 添加一个标记类，表示当前使用液体玻璃效果
    tooltipEl.classList.add('liquid-glass-active');

    // 从存储中获取玻璃材质类型
    chrome.storage.local.get(['glassEffectType'], function(result) {
      const effectType = result.glassEffectType || 'rough'; // 默认为Rough
      console.log('使用玻璃材质类型:', effectType);

      // 配置液体玻璃效果参数 - 优化性能和速度
      const glassConfig = {
        width: Math.max(tooltipWidth * 2.5, 400), // 适度减小渲染尺寸以提高性能
        height: Math.max(tooltipHeight * 2.5, 400),
        radius: 12, // 圆角半径
        centerDistortion: 0, // 中心畸变效果
        centerSize: 13, // 中心大小
        preBlur: 10, // 减少预模糊以提高渲染速度
        rainbow: 10, // 彩虹畸变效果
        effectType: effectType, // 从存储中读取的玻璃效果类型
        autoResize: true, // 启用自动调整
        resizeDebounce: 50 // 减少防抖延迟以提高响应速度
      };

      // 直接在弹窗元素上应用液体玻璃效果 - 在Shadow DOM环境中启用shadowDomSupport
      liquidGlassUpdater = LiquidGlass.applyToElement(tooltipEl, glassConfig, {
        preserveContent: true,
        autoSize: true,
        mode: 'overlay', // 使用overlay模式
        shadowDomSupport: true, // 在Shadow DOM环境中启用支持
        monitorParent: false // 禁用父容器监控，专注于元素自身
      });

      if (liquidGlassUpdater) {
        console.log('液体玻璃效果已成功直接应用到弹窗元素');
      }
      // 注意：胶囊的玻璃效果会在胶囊创建时自动应用，不需要在这里调用
    });

  } catch (error) {
    console.error('应用液体玻璃效果时发生错误:', error);
  }
}

/**
 * 清理液体玻璃效果
 */
function cleanupLiquidGlass() {
  console.log('开始清理液体玻璃效果...');

  // 清理液体玻璃更新器
  if (liquidGlassUpdater && typeof liquidGlassUpdater.destroy === 'function') {
    try {
      liquidGlassUpdater.destroy();
      console.log('液体玻璃更新器已销毁');
    } catch (error) {
      console.error('销毁液体玻璃更新器时出错:', error);
    }
    liquidGlassUpdater = null;
  }

  // 清理可能残留的独立液体玻璃容器（兼容性清理）
  const existingContainers = document.querySelectorAll('#tooltip-liquid-glass-container');
  if (existingContainers.length > 0) {
    console.log(`清理 ${existingContainers.length} 个残留的独立液体玻璃容器...`);
    existingContainers.forEach(container => {
      try {
        container.remove();
        console.log('残留容器已移除');
      } catch (error) {
        console.error('移除残留容器时出错:', error);
      }
    });
  }

  // 清理重复的SVG滤镜
  if (typeof LiquidGlass !== 'undefined' && typeof LiquidGlass.cleanupDuplicateSVGs === 'function') {
    try {
      LiquidGlass.cleanupDuplicateSVGs();
      console.log('重复SVG滤镜已清理');
    } catch (error) {
      console.error('清理重复SVG滤镜时出错:', error);
    }
  }

  // 恢复弹窗的原始背景样式（只有在弹窗元素存在且仍在DOM中时才操作）
  if (tooltipEl && tooltipEl.parentNode) {
    try {
      // 恢复弹窗的背景样式
      tooltipEl.style.removeProperty('background-color');
      tooltipEl.style.removeProperty('backdrop-filter');
      tooltipEl.classList.remove('liquid-glass-active');
      tooltipEl.classList.remove('firefox-glass-effect'); // 清理Firefox玻璃效果类

      // 使用setTimeout确保CSS类移除生效后再恢复背景
      setTimeout(() => {
        if (!tooltipEl || !tooltipEl.parentNode) {
          console.log('弹窗已被移除，跳过背景恢复');
          return;
        }

        // 恢复视频背景元素的显示（如果存在）
        const videoBackground = tooltipEl.querySelector('.tooltip-video-background');
        if (videoBackground) {
          videoBackground.style.display = '';
          videoBackground.style.zIndex = '0'; // 确保视频在背景层
          videoBackground.style.position = 'absolute'; // 确保定位正确
          console.log('视频背景已恢复显示');
        }

        // 恢复图片背景的显示（通过CSS伪元素）
        const existingBgStyle = tooltipEl.querySelector('style[data-bg-style]');
        if (existingBgStyle) {
          // 如果有图片背景样式，确保伪元素可见
          const currentContent = existingBgStyle.textContent;
          if (currentContent.includes('display: none')) {
            existingBgStyle.textContent = currentContent.replace(/display:\s*none\s*!important;?/g, '');
            console.log('图片背景已恢复显示');
          }
        }

        console.log('延迟背景恢复完成');
      }, 50); // 50ms延迟确保CSS类移除生效

      console.log('弹窗背景样式已恢复');
    } catch (error) {
      console.error('恢复弹窗背景样式时出错:', error);
    }
  } else if (tooltipEl) {
    console.log('弹窗元素已从DOM中移除，跳过背景样式恢复');
  }

  // 同时清理所有胶囊的玻璃效果
  cleanupGlassEffectFromCapsules();

  console.log('液体玻璃效果清理完成');
}

/**
 * 恢复原始背景
 */
function restoreOriginalBackground() {
  if (!tooltipEl) {
    console.log('弹窗元素不存在，无法恢复背景');
    return;
  }

  console.log('开始恢复原始背景...', {
    isBackgroundVideo,
    backgroundVideoUrl: backgroundVideoUrl ? '有视频URL' : '无视频URL',
    backgroundImageUrl: backgroundImageUrl ? '有图片URL' : '无图片URL'
  });

  // 添加延迟确保CSS类移除生效
  setTimeout(() => {
    if (!tooltipEl || !tooltipEl.parentNode) {
      console.log('弹窗已被移除，跳过背景恢复');
      return;
    }

    // 检查当前背景设置
    if (isBackgroundVideo && backgroundVideoUrl) {
      // 恢复视频背景
      console.log('恢复视频背景，URL:', backgroundVideoUrl.substring(0, 50) + '...');
      let videoEl = tooltipEl.querySelector('.tooltip-video-background');

      if (!videoEl) {
        // 如果视频元素不存在，重新创建
        videoEl = document.createElement('video');
        videoEl.className = 'tooltip-video-background';
        videoEl.src = backgroundVideoUrl;
        videoEl.autoplay = true;
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.style.objectPosition = 'center top';
        videoEl.style.position = 'absolute';
        videoEl.style.zIndex = '0';

        // 将视频元素插入到tooltip的最前面
        tooltipEl.insertBefore(videoEl, tooltipEl.firstChild);
        console.log('重新创建视频背景元素');
      } else {
        // 如果视频元素存在，确保其可见且在正确位置
        videoEl.style.display = '';
        videoEl.style.zIndex = '0';
        videoEl.style.position = 'absolute';
        console.log('恢复现有视频背景元素');
      }
    } else if (backgroundImageUrl) {
      // 恢复图片背景
      console.log('恢复图片背景，URL:', backgroundImageUrl.substring(0, 50) + '...');
      let bgStyle = tooltipEl.querySelector('style[data-bg-style]');

      if (!bgStyle) {
        // 如果样式元素不存在，重新创建
        bgStyle = document.createElement('style');
        bgStyle.setAttribute('data-bg-style', 'true');
        bgStyle.textContent = `
          .vocab-tooltip::before {
            background-image: url(${backgroundImageUrl});
            ${backgroundImageUrl.toLowerCase().endsWith('.svg') || backgroundImageUrl.includes('data:image/svg+xml') ? 'opacity: 0.05;' : ''}
          }
        `;
        tooltipEl.appendChild(bgStyle);
        console.log('重新创建图片背景样式');
      } else {
        // 如果样式元素存在，确保其内容正确
        bgStyle.textContent = `
          .vocab-tooltip::before {
            background-image: url(${backgroundImageUrl});
            ${backgroundImageUrl.toLowerCase().endsWith('.svg') || backgroundImageUrl.includes('data:image/svg+xml') ? 'opacity: 0.05;' : ''}
          }
        `;
        console.log('恢复现有图片背景样式');
      }
    } else {
      console.log('没有背景需要恢复');
    }

    console.log('原始背景恢复完成');
  }, 100); // 100ms延迟确保CSS类移除生效
}

/**
 * 更新液体玻璃开关按钮的外观
 */
function updateLiquidGlassToggleButton(button, enabled) {
  if (!button) return;

  // 如果没有传入状态，从存储中读取
  if (enabled === undefined) {
    chrome.storage.local.get(['liquidGlassEnabled'], (result) => {
      const isEnabled = result.liquidGlassEnabled !== undefined ? result.liquidGlassEnabled : true;
      updateLiquidGlassToggleButton(button, isEnabled);
    });
    return;
  }

  // 更新按钮图标和样式
  const svg = button.querySelector('svg path');
  if (svg) {
    // if (enabled) {
    //   // 启用状态 - 显示勾选图标
    //   svg.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z');
    //   button.style.opacity = '1';
    //   button.title = '液体玻璃效果: 已启用 (点击禁用)';
    // } else {
    //   // 禁用状态 - 显示禁用图标
    //   svg.setAttribute('d', 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z');
    //   button.style.opacity = '0.5';
    //   button.title = '液体玻璃效果: 已禁用 (点击启用)';
    // }
  }
}

/**
 * 全局更新液体玻璃位置的函数
 */
function updateLiquidGlassPosition() {
  console.log('updateLiquidGlassPosition 被调用');

  if (!tooltipEl) {
    console.log('弹窗元素不存在');
    return;
  }

  // 由于现在直接在弹窗元素上应用液体玻璃效果，不需要更新独立容器的位置
  // 液体玻璃效果会自动跟随弹窗元素的变化
  console.log('液体玻璃效果直接应用在弹窗元素上，无需手动更新位置');

  // 如果需要更新液体玻璃效果的尺寸，可以调用更新器
  if (liquidGlassUpdater && typeof liquidGlassUpdater === 'function') {
    try {
      const tooltipRect = tooltipEl.getBoundingClientRect();
      liquidGlassUpdater({
        width: Math.max(tooltipRect.width * 2.5, 400),
        height: Math.max(tooltipRect.height * 2.5, 400)
      });
      console.log('更新了液体玻璃渲染尺寸');
    } catch (error) {
      console.error('更新液体玻璃尺寸时出错:', error);
    }
  }

  console.log('液体玻璃位置更新完成');
}

// 添加全局错误处理，防止未处理的Promise错误导致消息通道关闭
window.addEventListener('unhandledrejection', function(event) {
  console.error('未处理的Promise错误:', event.reason);
  // 阻止错误传播到控制台，避免影响扩展运行
  event.preventDefault();
});

// 添加全局错误处理
window.addEventListener('error', function(event) {
  console.error('全局错误:', event.error);

  // 清空所有弹窗和窗口
  try {
    clearAllPopupsAndWindows();
  } catch (clearError) {
    console.error('清理弹窗时发生错误:', clearError);
  }

  // 不阻止错误，但记录下来
});

// 清空所有弹窗和窗口的函数
function clearAllPopupsAndWindows() {
  console.log('开始清理所有弹窗和窗口...');

  // 1. 清理主弹窗 (tooltip)
  if (tooltipEl) {
    console.log('清理主弹窗...');
    try {
      // 立即移除弹窗元素
      tooltipEl.remove();

      // 清理相关的全局变量和监听器
      tooltipEl = null;
      currentTooltipWord = null;
      isClosingTooltip = false;
      tooltipCreationInProgress = false; // 重置tooltip创建标志
      tooltipBeingDestroyed = false; // 重置销毁标志

      // 清理监听器
      if (currentTooltipKeydownHandler) {
        document.removeEventListener("keydown", currentTooltipKeydownHandler, false);
        currentTooltipKeydownHandler = null;
      }

      // 清理ResizeObserver
      if (tooltipResizeObserver) {
        tooltipResizeObserver.disconnect();
        tooltipResizeObserver = null;
      }

      // 清理液体玻璃效果
      cleanupLiquidGlass();

      // 清理top layer状态
      cleanupTopLayerState();

      console.log('主弹窗清理完成');
    } catch (error) {
      console.error('清理主弹窗时发生错误:', error);
    }
  }

  // 2. 清理分析窗口 (analysisWindow)
  if (typeof analysisWindow !== 'undefined' && analysisWindow) {
    console.log('清理分析窗口...');
    try {
      // 立即移除分析窗口
      analysisWindow.remove();

      // 清理相关变量
      analysisWindow = null;
      isClosingAnalysisWindow = false;

      // 断开MutationObserver连接
      if (typeof activeContentObserver !== 'undefined' && activeContentObserver) {
        activeContentObserver.disconnect();
        activeContentObserver = null;
      }

      // 清除句子高亮
      if (typeof currentHighlight !== 'undefined' && currentHighlight) {
        CSS.highlights.delete('sentence-highlight');
        currentHighlight = null;
      }

      console.log('分析窗口清理完成');
    } catch (error) {
      console.error('清理分析窗口时发生错误:', error);
    }
  }



  // 4. 清理Shadow DOM中的弹窗元素
  try {
    // 清理tooltip的shadow host
    const tooltipShadowHost = document.getElementById('lingkuma-tooltip-host');
    if (tooltipShadowHost) {
      tooltipShadowHost.remove();
      console.log('tooltip shadow host已清理');
    }

  } catch (error) {
    console.error('清理Shadow DOM元素时发生错误:', error);
  }

  // 5. 清理任何残留的液体玻璃容器
  try {
    const glassContainers = document.querySelectorAll('#tooltip-liquid-glass-container, .liquid-glass-container');
    glassContainers.forEach(container => {
      container.remove();
    });
    if (glassContainers.length > 0) {
      console.log(`清理了 ${glassContainers.length} 个液体玻璃容器`);
    }
  } catch (error) {
    console.error('清理液体玻璃容器时发生错误:', error);
  }



  console.log('所有弹窗和窗口清理完成');
}

// 背景设置相关变量
let backgroundImageUrl = chrome.runtime.getURL("src/service/image/pattern.png"); // 默认背景图片
let isBackgroundVideo = false; // 是否使用视频背景
let backgroundVideoUrl = null; // 视频背景URL

// 添加缓存变量，用于存储背景设置
let cachedBackgroundSettings = null; // 缓存的背景设置
let lastBackgroundSettingsUpdate = 0; // 上次更新缓存的时间戳

// 获取背景设置并应用
function loadBackgroundSettings() {
  return new Promise((resolve) => {
    // 检查是否有缓存且缓存时间不超过5分钟
    const now = Date.now();
    const cacheExpiry = 10 * 60 * 1000; // 5分钟缓存过期时间

    if (cachedBackgroundSettings && (now - lastBackgroundSettingsUpdate < cacheExpiry)) {
      console.log("使用缓存的背景设置");
      applyBackgroundSettings(cachedBackgroundSettings);
      resolve();
      return;
    }

    // 如果没有缓存或缓存已过期，从storage获取
    chrome.storage.local.get(['tooltipBackground'], function(result) {
      const bgSettings = result.tooltipBackground || { enabled: true, defaultType: 'svg' };
      console.log("从storage加载背景设置:", bgSettings);

      // 更新缓存
      cachedBackgroundSettings = bgSettings;
      lastBackgroundSettingsUpdate = now;

      // 应用设置
      applyBackgroundSettings(bgSettings);
      resolve();
    });
  });
}

// 应用背景设置的函数，从loadBackgroundSettings中提取出来以便复用
function applyBackgroundSettings(bgSettings) {
  console.log("[DEBUG a4_tooltip_new.js] applyBackgroundSettings called with settings:", JSON.parse(JSON.stringify(bgSettings)));
  // 检查是否启用背景
  if (bgSettings.enabled !== true) {
    // 如果禁用背景，将URL设为空
    backgroundImageUrl = '';
    isBackgroundVideo = false;
    console.log("背景已禁用");
    return;
  }

  // 检查是否使用自定义背景
  if (bgSettings.useCustom && bgSettings.customFile) {
    const fileUrl = bgSettings.customFile;
    console.log("自定义背景文件URL长度:", fileUrl.length);

    // 从URL中提取文件类型
    let fileType = '';
    if (fileUrl.startsWith('data:')) {
      // 处理 data URL
      const mimeType = fileUrl.split(',')[0].split(':')[1].split(';')[0];
      console.log("检测到data URL，MIME类型:", mimeType);

      if (mimeType.startsWith('video/')) {
        fileType = 'video';
      } else if (mimeType.startsWith('image/')) {
        fileType = 'image';
      } else {
        fileType = 'image'; // 默认为图片
      }
    } else {
      // 处理普通 URL
      const fileExt = fileUrl.split('.').pop().toLowerCase();
      console.log("检测到普通URL，文件扩展名:", fileExt);

      if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
        fileType = 'video';
      } else {
        fileType = 'image';
      }
    }

    console.log("使用自定义背景，文件类型:", fileType);

    // 根据文件类型设置背景
    if (fileType === 'video') {
      // 视频文件
      isBackgroundVideo = true;
      backgroundVideoUrl = fileUrl;
      backgroundImageUrl = ''; // 清空图片URL
      console.log("设置视频背景URL长度:", backgroundVideoUrl.length);
    } else {
      // 图片文件
      isBackgroundVideo = false;
      backgroundImageUrl = fileUrl;
      console.log("设置图片背景URL长度:", backgroundImageUrl.length);
    }
  } else {
    // 使用默认背景，但保留自定义背景文件信息以便将来可能的恢复
    console.log("[DEBUG a4_tooltip_new.js] Using default background. bgSettings.defaultType:", bgSettings.defaultType);

    // 检查用户是否指定了默认背景类型
    if (bgSettings.defaultType === 'video') {
      console.log("[DEBUG a4_tooltip_new.js] Default type is VIDEO.");
      // 用户选择了默认视频背景
      isBackgroundVideo = true;
      backgroundVideoUrl = chrome.runtime.getURL("src/service/videos/kawai.mp4");
      backgroundImageUrl = ''; // 清空图片URL
      console.log("使用默认视频背景: kawai.mp4", "完整URL:", backgroundVideoUrl);
    } else if (bgSettings.defaultType === 'svg') {
      console.log("[DEBUG a4_tooltip_new.js] Default type is SVG.");
      // 用户选择了随机SVG图案背景
      const svgUrls = Array.from({ length: 33 }, (_, i) => `src/service/image/tg/pattern-${i + 1}.svg`);
      const randomIndex = Math.floor(Math.random() * svgUrls.length);
      const randomSvgPath = svgUrls[randomIndex];
      backgroundImageUrl = chrome.runtime.getURL(randomSvgPath);
      isBackgroundVideo = false;
      backgroundVideoUrl = null;
      console.log("使用随机SVG背景:", randomSvgPath, "完整URL:", backgroundImageUrl);
    } else if (bgSettings.defaultType === 'specific' && bgSettings.specificBgPath) {
      console.log("[DEBUG a4_tooltip_new.js] Default type is SPECIFIC.");
      // 用户选择了指定的内置背景
      const specificPath = bgSettings.specificBgPath;

      // 判断是视频还是图片
      if (specificPath.endsWith('.mp4') || specificPath.endsWith('.webm') || specificPath.endsWith('.ogg')) {
        isBackgroundVideo = true;
        backgroundVideoUrl = chrome.runtime.getURL(specificPath);
        backgroundImageUrl = '';
        console.log("使用指定视频背景:", specificPath);
      } else {
        isBackgroundVideo = false;
        backgroundImageUrl = chrome.runtime.getURL(specificPath);
        backgroundVideoUrl = null;
        console.log("使用指定图片/SVG背景:", specificPath);
      }
    } else if (bgSettings.defaultType === 'image') {
      console.log("[DEBUG a4_tooltip_new.js] Default type is IMAGE.");
      // 用户选择了随机图片背景
      const tgPngFiles = [
        '02.jpg', '104.jpg', '105.jpg', '13.jpg', '21.jpg',
        'BG_1-scaled.jpg', 'BG_2-scaled.jpg', 'BG_3-scaled.jpg', 'BG_4-scaled.jpg',
        'BG_5-scaled.jpg', 'BG_6-scaled.jpg', 'BG_7-scaled.jpg',
        'BG_8-scaled.jpg', 'BG_9-scaled.jpg', 'BG_10-scaled.jpg', 'BG_11-scaled.jpg',
        'BG_12-scaled.jpg', 'BG_13-scaled.jpg', 'BG_14-scaled.jpg', 'BG_15-scaled.jpg',
        'BG_16-scaled.jpg', 'BG_17-scaled.jpg', 'BG_18-scaled.jpg', 'BG_19-scaled.jpg',
        'BG_20-scaled.jpg', 'BG_21-scaled.jpg', 'BG_22-scaled.jpg', 'BG_23-scaled.jpg',
        'BG_24-scaled.jpg', 'BG_25-scaled.jpg', 'BG_26-scaled.jpg', 'BG_27-scaled.jpg',
        'BG_28-scaled.jpg', 'BG_29-scaled.jpg', 'BG_30-scaled.jpg', 'BG_33-scaled.jpg',
        'BG_N2-scaled.jpg', 'BG_N4-scaled.jpg', 'BG_N9-scaled.jpg'
      ];

      const imageUrls = [
        "src/service/image/pattern.png",
        "src/service/image/pattern2.png",
        "src/service/image/pattern3.png",
        ...tgPngFiles.map(filename => `src/service/image/tg_png/${filename}`)
      ];
      const randomIndex = Math.floor(Math.random() * imageUrls.length);
      const randomImagePath = imageUrls[randomIndex];
      backgroundImageUrl = chrome.runtime.getURL(randomImagePath);
      isBackgroundVideo = false;
      backgroundVideoUrl = null;
      console.log("使用随机默认图片背景:", randomImagePath, "完整URL:", backgroundImageUrl);
    } else {
      // 默认使用随机SVG背景（兼容旧设置）
      console.log("[DEBUG a4_tooltip_new.js] No type specified, using default SVG.");
      const svgUrls = Array.from({ length: 33 }, (_, i) => `src/service/image/tg/pattern-${i + 1}.svg`);
      const randomIndex = Math.floor(Math.random() * svgUrls.length);
      const randomSvgPath = svgUrls[randomIndex];
      backgroundImageUrl = chrome.runtime.getURL(randomSvgPath);
      isBackgroundVideo = false;
      backgroundVideoUrl = null;
      console.log("使用默认随机SVG背景:", randomSvgPath);
    }
  }
}

// 添加一个函数用于清除缓存，当设置变更时调用
function clearBackgroundSettingsCache() {
  cachedBackgroundSettings = null;
  lastBackgroundSettingsUpdate = 0;
  console.log("背景设置缓存已清除");
}

// 检测页面是否为竖排文本模式
function detectVerticalWritingMode() {
  try {
    // 检查body和html的writing-mode
    const bodyStyle = window.getComputedStyle(document.body);
    const htmlStyle = window.getComputedStyle(document.documentElement);
    
    const bodyWritingMode = bodyStyle.writingMode || bodyStyle.webkitWritingMode;
    const htmlWritingMode = htmlStyle.writingMode || htmlStyle.webkitWritingMode;
    
    // 检查是否为竖排模式
    const isVertical = bodyWritingMode === 'vertical-rl' || 
                      bodyWritingMode === 'vertical-lr' ||
                      htmlWritingMode === 'vertical-rl' || 
                      htmlWritingMode === 'vertical-lr';
    
    // 额外检查text-orientation
    const bodyTextOrientation = bodyStyle.textOrientation;
    const htmlTextOrientation = htmlStyle.textOrientation;
    const hasVerticalOrientation = bodyTextOrientation === 'upright' || 
                                  htmlTextOrientation === 'upright';
    
    console.log('检测竖排文本模式:', {
      bodyWritingMode,
      htmlWritingMode,
      bodyTextOrientation,
      htmlTextOrientation,
      isVertical: isVertical || hasVerticalOrientation
    });
    
    return isVertical || hasVerticalOrientation;
  } catch (error) {
    console.warn('检测竖排文本模式时出错:', error);
    return false;
  }
}

// 添加消息监听器，用于接收清除缓存和更新主题模式的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  try {
    if (message.action === "clearBackgroundSettingsCache") {
      clearBackgroundSettingsCache();
      sendResponse({ success: true });
      return true;
    } else if (message.action === "updateGlassEffect") {
      // 更新玻璃效果类型
      if (liquidGlassUpdater && message.effectType) {
        console.log('收到玻璃效果更新消息:', message.effectType);
        liquidGlassUpdater({
          effectType: message.effectType
        });
        sendResponse({ success: true });
      } else {
        console.warn('无法更新玻璃效果: liquidGlassUpdater不存在或effectType未提供');
        sendResponse({ success: false });
      }
      return true;
    } else if (message.action === "updateTooltipThemeMode") {
      // 如果当前有弹窗显示，则更新其主题
      if (tooltipEl) {
        const themeMode = message.mode || 'auto';

        // 更新弹窗主题
        if (themeMode === 'dark') {
          // 固定暗色主题
          tooltipEl.classList.add("dark-mode");
        } else if (themeMode === 'light') {
          // 固定亮色主题
          tooltipEl.classList.remove("dark-mode");
        } else {
          // 自动检测模式（跟随当前页面的高亮模式）
          if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.isDarkMode !== undefined) {
            if (highlightManager.isDarkMode) {
              tooltipEl.classList.add("dark-mode");
            } else {
              tooltipEl.classList.remove("dark-mode");
            }
          } else {
            tooltipEl.classList.remove("dark-mode");
          }
        }

        // 同时更新所有胶囊容器的主题
        const shadowHost = document.getElementById('lingkuma-tooltip-host');
        if (shadowHost && shadowHost.shadowRoot) {
          const capsules = shadowHost.shadowRoot.querySelectorAll('.header-buttons-capsule');
          capsules.forEach(capsule => {
            if (themeMode === 'dark') {
              capsule.classList.add("dark-mode");
            } else if (themeMode === 'light') {
              capsule.classList.remove("dark-mode");
            } else {
              // 自动模式：使用当前页面的高亮模式
              if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.isDarkMode !== undefined) {
                if (highlightManager.isDarkMode) {
                  capsule.classList.add("dark-mode");
                } else {
                  capsule.classList.remove("dark-mode");
                }
              } else {
                capsule.classList.remove("dark-mode");
              }
            }
          });
        }

        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, message: "No tooltip currently displayed" });
      }
      return true;
    } else if (message.action === "toggleLiquidGlass") {
      // 切换液体玻璃效果
      liquidGlassEnabled = message.enabled !== undefined ? message.enabled : !liquidGlassEnabled;
      console.log('液体玻璃效果已', liquidGlassEnabled ? '启用' : '禁用');

      // 清理缓存，确保下次获取最新状态
      liquidGlassEnabledCache = null;
      liquidGlassEnabledCacheTime = 0;

      if (!liquidGlassEnabled && tooltipEl) {
        // 如果禁用了效果且当前有弹窗，立即清理效果
        cleanupLiquidGlass();
      }

      sendResponse({ success: true, enabled: liquidGlassEnabled });
      return true;
    }
  } catch (error) {
    console.error('消息处理错误:', error);
    try {
      sendResponse({ success: false, error: error.message });
    } catch (responseError) {
      console.error('发送错误响应失败:', responseError);
    }
    return true;
  }

  // 如果不是我们处理的消息，返回false
  return false;
});





async function showEnhancedTooltipForWord(word, sentence, wordRect, parent, originalWord, isCustom = false) {
  // 标记tooltip创建开始
  tooltipCreationInProgress = true;
  tooltipBeingDestroyed = false; // 重置销毁标志

  // 保存当前单词的位置信息，用于mini窗口重新定位
  currentWordRect = wordRect;

  try {
    // 在函数开始时立即停止相关的TTS播放，避免冲突
    try {
      if (typeof stopSpecificAudioType === 'function') {
        stopSpecificAudioType('word');
      }
    } catch (error) {
      console.error('停止TTS播放时发生错误:', error);
    }

    // 确保加载完整的单词详情数据（如果缓存中只有轻量级数据，会自动从数据库加载）
    await ensureFullWordDetails(word);

    // 加载背景设置
    await loadBackgroundSettings();
    // console.log("背景设置已加载: 图片URL=", backgroundImageUrl, "是否视频=", isBackgroundVideo, "视频URL=", backgroundVideoUrl);


  word = word.toLowerCase();
  // 如果已有 tooltip，先移除，并取消之前的空格监听器和 ResizeObserver
  if (tooltipEl) {
    closeTooltipWithAnimation(); // <-- 调用新函数关闭旧 tooltip
  }

  ShouldAutoUpdateStatus = shouldAutoUpdateStatus(word);
  console.log("当前单词:", word, "是否需要更新状态:", ShouldAutoUpdateStatus);

  // // 确保在创建新的tooltip前移除旧的空格监听器
  // if (tooltipSpaceKeyListener) {
  //   console.log(" 之前 移除空格键监听器");
  //   document.removeEventListener("keydown", tooltipSpaceKeyListener);
  //   tooltipSpaceKeyListener = null;
  // }

  console.log("显示 tooltip", isCustom ? "(自定义词组)" : "(普通单词)");
  tooltipEl = document.createElement("div");
  tooltipEl.className = "vocab-tooltip";

  // 保存当前tooltipEl的引用，用于异步操作后的验证（触摸屏模式下快速点击保护）
  const currentTooltipElRef = tooltipEl;

  // 重置销毁标志，确保新弹窗的异步操作不会被阻止
  // 注意：必须在创建新tooltipEl后立即重置，因为closeTooltipWithAnimation()会设置为true
  tooltipBeingDestroyed = false;

  // 重置AI翻译状态追踪
  aiTranslationStatus = {
    ai1: { completed: false, result: null, shouldRefresh: false },
    ai2: { completed: false, result: null }
  };
  console.log("已重置AI翻译状态");

  // 检测页面是否为竖排文本模式，如果是则添加保护样式
  if (detectVerticalWritingMode()) {
    tooltipEl.classList.add("vertical-text-protection");
    console.log("检测到竖排文本页面，已为弹窗添加横向保护样式");
  }

  // 如果是自定义词组，添加特殊标记
  if (isCustom) {
    tooltipEl.classList.add("custom-word-tooltip");
    tooltipEl.setAttribute("data-custom-word", "true");
  }

  tooltipEl.style.visibility = 'hidden'; // <--- 添加：初始隐藏
  tooltipEl.style.position = "absolute";
  tooltipEl.style.opacity = '0'; // 确保完全不可见
  tooltipEl.style.top = "0"; // <--- 保留：初始位置设为(0,0)，防止页面布局跳动
  tooltipEl.style.left = "0"; // <--- 保留：初始位置设为(0,0)，防止页面布局跳动
  // 设置z-index确保tooltip在其他元素之上
  tooltipEl.style.zIndex = "2147483647";
  tooltipEl.style.setProperty('z-index', '2147483647', 'important');

  // 预先检查是否启用液体玻璃效果，如果启用则提前设置透明背景
  getLiquidGlassEnabledFast().then(async (isGlassEnabled) => {
    if (isGlassEnabled && tooltipEl) {
      // Firefox使用CSS玻璃效果，其他浏览器使用SVG液体玻璃效果
      if (await isFirefox()) {
        tooltipEl.classList.add('firefox-glass-effect');
        // 检测当前主题模式
        chrome.storage.local.get(['isDarkMode'], (result) => {
          const isDark = result.isDarkMode;
          if (isDark) {
            tooltipEl.classList.add('dark-mode');
          } else {
            tooltipEl.classList.add('light-mode');
          }
        });
      } else {
        // 提前设置透明背景，避免显示原始背景
        tooltipEl.style.setProperty('background-color', 'rgba(255, 255, 255, 0.05)', 'important');
        tooltipEl.style.setProperty('backdrop-filter', 'none', 'important');
        tooltipEl.classList.add('liquid-glass-active');
      }
    }
  });
  // tooltipEl.style.transformOrigin = "left top"; // 默认变换原点为左上角
  // tooltipEl.style.width = "392px"; // 设置固定宽度，与estimatedTooltipWidth一致

  // 检查是否需要禁用动画（Bionic模式或液体玻璃特效）
  // 保存当前tooltipEl的引用，避免异步操作中访问已清理的全局变量
  const animationTooltipEl = tooltipEl;
  chrome.storage.local.get(['liquidGlassEnabled'], (result) => {
    // 检查tooltipEl是否仍然存在且未被移除，以及tooltip是否正在被销毁
    if (!animationTooltipEl || !animationTooltipEl.parentNode || tooltipBeingDestroyed) {
      console.log('tooltipEl 已被移除或tooltip正在被销毁，跳过动画禁用设置');
      return;
    }

    const isGlassEnabled = result.liquidGlassEnabled !== undefined ? result.liquidGlassEnabled : liquidGlassEnabled;
    const shouldDisableAnimation = isBionicActive || isGlassEnabled;

    if (shouldDisableAnimation) {
      if (isBionicActive) {
        console.log("[a4_tooltip_new.js] 在Bionic模式下创建弹窗，禁用动画");
      }
      if (isGlassEnabled) {
        console.log("[a4_tooltip_new.js] 液体玻璃特效启用，禁用opacity动画");
      }

      animationTooltipEl.style.transition = 'none'; // 禁用过渡动画
      animationTooltipEl.style.willChange = 'transform'; // 只保留transform的硬件加速

      // 添加相应的类，用于在CSS中禁用其他元素的动画
      if (isBionicActive) {
        animationTooltipEl.classList.add('bionic-active');
      }
      if (isGlassEnabled) {
        animationTooltipEl.classList.add('liquid-glass-active');
      }

      // 在创建完弹窗后，为Notes元素设置样式
      // 保存当前tooltipEl的引用，避免异步操作中访问已清理的全局变量
      const currentTooltipEl = tooltipEl;
      setTimeout(() => {
        // 使用保存的引用而不是全局变量
        if (!currentTooltipEl || !currentTooltipEl.parentNode) {
          console.error('tooltipEl 已被移除，无法设置Notes元素样式');
          return;
        }
        const notesElements = currentTooltipEl.querySelectorAll('.Notes');
        notesElements.forEach(el => {
          el.style.transition = 'none';
          el.style.color = 'var(--secondary-text-color)'; // 确保颜色立即设置正确
        });
      }, 0);
    } else {
      //弹出动画 - 减少动画时间以提高响应速度
      tooltipEl.style.transition = 'opacity 0.05s ease-in-out';
      tooltipEl.style.willChange = 'opacity, transform';

      // 在非特殊模式下，为Notes元素恢复过渡效果
      // 保存当前tooltipEl的引用，避免异步操作中访问已清理的全局变量
      const currentTooltipEl2 = tooltipEl;
      setTimeout(() => {
        if (currentTooltipEl2 && currentTooltipEl2.parentNode) {
          const notesElements = currentTooltipEl2.querySelectorAll('.Notes');
          notesElements.forEach(el => {
            el.style.transition = 'background-color 0.1s, color 0.1s, transform 0.1s ease-in-out';
          });
        }
      }, 0);
    }
  });

  // 设置 tooltip 的样式（例如：宽度、高度、滚动等）
  // tooltipEl.style.width = "500px";
  // tooltipEl.style.maxHeight = "800px";
  // tooltipEl.style.height = "auto";
  // tooltipEl.style.overflow = "auto";

  // 检测并处理Trancy插件冲突和top layer问题
  function handleTrancyConflictAndTopLayer() {
    const trancyApp = document.querySelector('trancy-app');
    if (trancyApp) {
      console.log('检测到Trancy插件，检查是否在top layer');

      // 检查是否在全屏模式 - 这是关键检测
      const isFullscreen = document.fullscreenElement !== null;

      // 检查Trancy是否是全屏元素
      const isTrancyFullscreen = document.fullscreenElement === trancyApp ||
                                trancyApp.contains(document.fullscreenElement);

      // 检查Trancy是否在top layer - 使用CSS伪类检测
      let isInTopLayer = false;
      try {
        // 检查是否有:fullscreen伪类（最可靠的方法）
        isInTopLayer = trancyApp.matches(':fullscreen') ||
                      trancyApp.querySelector(':fullscreen') !== null;

        // 备用检测：modal或popover状态
        if (!isInTopLayer) {
          isInTopLayer = trancyApp.matches(':modal') || trancyApp.matches(':popover-open');
        }

        console.log('全屏状态:', isFullscreen, 'Trancy全屏:', isTrancyFullscreen, 'Top layer状态:', isInTopLayer);
      } catch (e) {
        console.warn('检测top layer状态时出错:', e);
        // 如果CSS检测失败，回退到基本的全屏检测
        isInTopLayer = isFullscreen && isTrancyFullscreen;
      }

      if (isFullscreen && (isTrancyFullscreen || isInTopLayer)) {
        console.log('Trancy在top layer，需要将弹窗也提升到top layer');
        // 延迟执行，确保弹窗已完全创建
        setTimeout(() => {
          promoteTooltipToTopLayer();
        }, 50);
      } else {
        console.log('Trancy不在top layer，使用CSS覆盖策略');
        // 创建CSS样式来覆盖Trancy的z-index
        let trancyOverrideStyle = document.getElementById('trancy-override-style');
        if (!trancyOverrideStyle) {
          trancyOverrideStyle = document.createElement('style');
          trancyOverrideStyle.id = 'trancy-override-style';
          trancyOverrideStyle.textContent = `
            trancy-app {
              z-index: 114514 !important;
            }
          `;
          document.head.appendChild(trancyOverrideStyle);
          console.log('已插入Trancy z-index覆盖样式');
        }
      }
    }
  }

  // 将弹窗提升到top layer的函数 - 直接将shadowHost映射到top layer
  function promoteTooltipToTopLayer() {
    if (!tooltipEl) {
      console.warn('tooltipEl不存在，无法提升到top layer');
      return;
    }

    // 获取shadowHost元素
    const shadowHost = document.getElementById('lingkuma-tooltip-host');
    if (!shadowHost) {
      console.warn('shadowHost不存在，无法提升到top layer');
      return;
    }

    // 检查是否已经在top layer中
    if (shadowHost.matches(':modal') || shadowHost.matches(':fullscreen')) {
      console.log('shadowHost已经在top layer中');
      return;
    }

    console.log('开始将shadowHost提升到top layer');

    try {
      // 直接将shadowHost请求全屏，这样它就会进入top layer
      shadowHost.requestFullscreen().then(() => {
        console.log('shadowHost已成功提升到top layer（全屏模式）');

        // 添加一个标记类，表示当前在top layer模式
        shadowHost.classList.add('in-top-layer');

        // 设置shadowHost在全屏模式下的样式
        shadowHost.style.cssText = `
          background: transparent !important;
          width: 100vw !important;
          height: 100vh !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          z-index: auto !important;
          pointer-events: none !important;
        `;

        // 确保弹窗内容可以交互，但其他区域完全透明
        if (tooltipEl) {
          tooltipEl.style.pointerEvents = 'auto';
        }

        // 确保Shadow DOM根节点也不阻挡交互
        const shadowRoot = shadowHost.shadowRoot;
        if (shadowRoot) {
          // 为shadowRoot添加样式，确保只有弹窗区域可交互
          let shadowStyle = shadowRoot.querySelector('#top-layer-style');
          if (!shadowStyle) {
            shadowStyle = document.createElement('style');
            shadowStyle.id = 'top-layer-style';
            shadowStyle.textContent = `
              :host {
                pointer-events: none !important;
              }
              .vocab-tooltip {
                pointer-events: auto !important;
              }
            `;
            shadowRoot.appendChild(shadowStyle);
          }
        }

      }).catch(error => {
        console.error('requestFullscreen失败:', error);
        // 如果requestFullscreen失败，保持原有显示方式
      });

    } catch (error) {
      console.error('requestFullscreen不支持:', error);
      // 如果requestFullscreen不支持，保持原有显示方式
    }
  }



  // 立即检测
  handleTrancyConflictAndTopLayer();

  // 监听全屏状态变化
  document.addEventListener('fullscreenchange', () => {
    console.log('全屏状态发生变化，重新检测Trancy冲突');

    // 检查我们的shadowHost是否退出了全屏
    const shadowHost = document.getElementById('lingkuma-tooltip-host');
    if (shadowHost && shadowHost.classList.contains('in-top-layer') &&
        !shadowHost.matches(':fullscreen')) {
      console.log('shadowHost退出全屏，恢复正常模式');

      // 移除top layer标记
      shadowHost.classList.remove('in-top-layer');

      // 恢复shadowHost的正常样式
      shadowHost.style.cssText = '';

      // 恢复弹窗的正常样式
      if (tooltipEl) {
        tooltipEl.style.pointerEvents = '';
      }
    }

    setTimeout(() => {
      handleTrancyConflictAndTopLayer();
    }, 100);
  });

  // 监听DOM变化，检测Trancy元素的添加或状态变化
  const trancyObserver = new MutationObserver((mutations) => {
    let shouldRecheck = false;

    mutations.forEach((mutation) => {
      // 检查是否有新的Trancy相关元素被添加
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'TRANCY-APP' ||
                node.classList?.contains('trancy') ||
                node.querySelector?.('trancy-app')) {
              shouldRecheck = true;
            }
          }
        });
      }

      // 检查属性变化（如class或data属性）- 重点关注Trancy元素
      if (mutation.type === 'attributes' &&
          mutation.target.tagName === 'TRANCY-APP') {
        shouldRecheck = true;
      }
    });

    if (shouldRecheck) {
      console.log('检测到Trancy相关DOM变化，重新检测冲突');
      setTimeout(() => {
        handleTrancyConflictAndTopLayer();
      }, 50);
    }
  });

  // 开始观察DOM变化
  trancyObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-fullscreen', 'style']
  });

  // 延迟检测，防止Trancy后加载
  handleTrancyConflictAndTopLayer();

  // setTimeout(() => {
  //   handleTrancyConflictAndTopLayer();
  // }, 200);

  // setTimeout(() => {
  //   handleTrancyConflictAndTopLayer();
  // }, 1000);

  // // 延迟检测，防止Trancy后加载
  // setTimeout(handleTrancyConflict, 100);
  // setTimeout(handleTrancyConflict, 500); // 再延迟一点，确保覆盖

  // 将 tooltip 添加到 Shadow DOM 中
  shadowRoot.appendChild(tooltipEl);

  // 检测页面模式并应用相应的样式类
  // if (isDarkMode()) {
  //   tooltipEl.classList.add("dark-mode");
  // }

  // 获取弹窗主题模式设置
  // 保存当前tooltipEl的引用，避免异步操作中访问已清理的全局变量
  const currentTooltipEl = tooltipEl;
  chrome.storage.local.get(['tooltipThemeMode'], (result) => {
    // 使用保存的引用而不是全局变量，并检查tooltip是否正在被销毁
    if (!currentTooltipEl || !currentTooltipEl.parentNode || tooltipBeingDestroyed) {
      console.error('tooltipEl 已被移除或tooltip正在被销毁，无法设置主题模式');
      return;
    }

    const themeMode = result.tooltipThemeMode || 'auto';

    if (themeMode === 'dark') {
      // 固定暗色主题
      currentTooltipEl.classList.add("dark-mode");
    } else if (themeMode === 'light') {
      // 固定亮色主题
      currentTooltipEl.classList.remove("dark-mode");
    } else {
      // 自动检测模式（跟随当前页面的高亮模式）
      if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.isDarkMode !== undefined) {
        if (highlightManager.isDarkMode) {
          currentTooltipEl.classList.add("dark-mode");
        } else {
          currentTooltipEl.classList.remove("dark-mode");
        }
      } else {
        currentTooltipEl.classList.remove("dark-mode");
      }
    }
  });


//   <div class="section">
//   <div class="section-header">
//       <span>词典</span>
//       <span>管理 ></span>
//   </div>
//   <div class="dict-links">
//       <a href="#" class="dict-link">Godic</a>
//       <a href="#" class="dict-link">Dictionary</a>
//       <a href="#" class="dict-link">Duden(popup)</a>
//       <a href="#" class="dict-link">Google</a>
//       <a href="#" class="dict-link">Im</a>
//   </div>
// </div>

// <div class="section">
//   <div class="section-header">
//       <span>相关短语</span>
//       <span>▼</span>
//   </div>
//   <div class="section-content">
//       <div class="translation-list">

//       </div>
//   </div>
// </div>

  // 创建基本HTML结构
  let tooltipHTML = `
        <div class="fixed-header">
            <div class="header">
                <div class="title-container">  <!-- 新增 title-container div -->
                    <div class="word-title">

                        <button class="sound-icon orion-sound-icon-container">
                            <!-- 普通模式下显示SVG图标  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 48 48"> -->
                            <svg class="normal-sound-icon" data-slot="icon" fill="none" " stroke="currentColor" viewBox="10 10 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m21.902 28.869l-4.246-3.784l-2.03-2.769v-4.615h-2.862l2.216-.83v-1.016l5.261-3.784l.553 2.954L32.7 23.331l3.877 3.323l-2.677-1.015l2.4 2.031l-4.337-1.385l9.506 6.922l2.031 2.215l-2.401-.646l-8.675-6.553h-2.861z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m25.511 28.565l-1.625 2.15l2.954-2.263m-5.405 0l-1.471 1.709l.735-2.364"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m4.5 27.023l27.047 4.661l5.169 4.245M14.98 15.855h4.015l-3.369 1.846m16.337 8.584l-5.123-2.538l-.877-1.985l-4.938-.374l-.646-3.687l-2.723 2.261l-2.03 2.354"/></svg>
                            <!-- Orion模式下显示的音频元素将在JS中动态添加 -->
                        </button>


                        <span class="Notes">${originalWord}</span>


                     <div style="display: flex; align-items: center; margin-top: 5px;">

                     <div class="language-square" id="languageSquare" ><!--  style="margin-right: 10px;"-->
                            <!-- 语言代码将显示在这里 -->
                        </div>

                        <div id="audio-container" style="display: inline-block; vertical-align: middle;">
                            <!-- 音频元素将在需要时添加到这里 -->
                            <span style="display: none;">音频播放区域</span>
                        </div>

                        <!-- 添加弹窗句子解析按钮 -->
                        <button class="analysis-btn tooltip-action-btn" title="Ask" cursor: pointer;">
                          <!--
                          最终幻想
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.5 42.92s3.417-5.723 9.59-1.804m3.57 1.227s3.562-2.86 7.04 0m6.19-2.753s-2.727-12.701-6.9-.272m-7.705 1.13s7.958-7.705-2.894-5.913"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m20.194 35.501l4.75-1.074l1.265-3.34m-7.384 3.123l2.362-2.288m4.99 4.017l-1.232-1.512m3.405-.588s2.485-3.864 1.401-7.578l.336-1.85s2.39-1.102 2.326-3.1m.001-.001s1.94-2.03 3.708.746"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M36.122 22.057S31.91 11.084 42.5 11.223M21.186 31.922a4.1 4.1 0 0 1-1.097-3.249s-4.568-1.901-1.713 1.685c0 0-4.584.79-5.098 1.882a7.05 7.05 0 0 1 2.935-4.239c-1.08-.022-2.888.596-1.184-1.874l-2.015 1.047l-2.105-.122s.262-7.325 2.524-9.677"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M13.757 19.336s1.897-2.318 3.743.968l1.085-1.81l3.096.061s1.469-2.236-.973-2.302l-.04-.555a2.5 2.5 0 0 0-1.236.315s-.116-1.413-1.207-1.123c.348-.081-.326-2.066.495-2.656m-1.215.91c.376-.904.369-.487.838-.755c1.603-.915 3.215-.976 3.24.838"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M21.583 13.227c.13 1.405 1.154 1.05 2.539-.358c3.134-2.242-.639 3.095 5.874-1.355c0 0-2.817-4.94-11.424-6.434"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M30.881 7.906c-.69-.002-.77.63-1.044 1.36s-1.249.374-1.249.374c-.954.384-1.303.688-1.307 1.541m11.775-4.649s-6.65 1.018-5.632 6.106m-1.01 8.672s-.594-3.27-2.077-4.18s.597.014 1.243-1.033m-5.814 11.148l-4.754-6.376m6.911 5.964l-1.054 2.765l2.894.003m-8.608-17.554c1.384.648 2.4-.663.56-1.318c-2.427-.864.076-2.608 1.148-.77c.904 1.55 2.274-.562.766-1.075c-.338-.115-.201-.456.117-.678m2.809 5.127c-2.71 2.878.327 4.234 5.307-1m-4.704 8.602s-.05-1.573.658-1.878s-.342-1.396.264-1.95"/><ellipse cx="22.963" cy="29.004" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" rx="1.226" ry="1.733"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M24.99 39.319s2.536-.219 2.626 1.655M14.39 34.536c1.47 3.202 2.733 2.19-.382 3.598m.347-13.457l.713-1.412l-1.452.52l.88-1.861m4.737.162l.562 2.227l-2.259 1.815m10.815 16.214c4.267-6.131 5.258 0 5.258 0Z"/></svg>

                          -->

                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
                          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M32.676 38.106c.878.325 1.79.466 2.7.397c2.551-.195 3.428.879 3.405 1.704c-.06 2.096-3.317 2.692-7.443 1.815a8.8 8.8 0 0 1-3.264-1.436m-2.337-2.146q-.514-.588-1.003-1.23m2.998-3.803c.67 1.324 1.552 2.44 2.56 3.288m-3.896-8.861c.02 1.226.2 2.384.508 3.454"/>
                          <path d="M25.198 32.797c.673.923 1.929.484 2.825.64"/>
                          <path d="M25.112 31.335c1.888-.137 3.818-.255 4.185 1.97c.12.731-.123 1.424-.504 1.805m-3.174 3.33c2.838.053 4.292-2.19 6.351-2.218c2.19-.03 2.405 1.09 2.619 2.289"/><path d="M33.159 37.886c-1.997.868-3.712 2.086-4.955 2.645c-1.779.8-3.705-.671-4.025-2.21m13.177.342c.554-.733.634-1.39.903-2.829c.282-1.507 1.899-1.118 2.043-.173c.281 1.844-.685 3.168-1.549 4.267m1.152-6.8c-3.112.375-2.436-3.085-1.006-4.074c.319.86 1.82 1.329 1.59-1.578c2.366.54 3.189 6.615-.584 5.652M25.363 27.2c-.688.484-2.137.566-5.216-1.079c-1.986-1.06-3.298-2.664-3.461-5.44c-.124-2.098.347-4.36-.366-6.426c2.36 1.966 2.331 3.107 3.27 4.3c1.521 1.94 3.383 2.286 4.526 3.8c1.46 1.937 2.197 4.174 1.247 4.844"/><path d="M25.717 26.698c2.341-.321 4.116-2.32 5.205-4.951c.928-2.241.017-5.302-1.287-8.109c-.417 2.573-1.53 4.07-2.327 5.064c-1.347 1.685-2.12 3.224-2.24 5.148m.27 3.397c1.559.605 2.765 2.217 4.074 3.433c2.197 2.04 4.005 2.478 5.698 2.977l.643.574c-.254-4.43-3.06-4.702-5.81-6.701m-4.618-.305c-.697 5.203.517 6.829-.456 9.63c-.83 2.39-2.636 3.923-4.401 4.36l.3-.508c-.837-2.661-1.77-5.334-.836-7.65l1.343-3.334"/><path d="M20.317 19.35c-.938-1.904-.42-3.496.113-5.085c-.44 1.59 2.458 3.003 1.005-1.676c-.363-1.17-.82-2.542-.228-3.651c.5 1.317.95 2.913 2.448 2.792c.407-.033.781-.617-.115-1.677c-1.234-1.46-2.033-2.921-1.009-3.844c-.038 2.096 2.122 3.041 3.362 5.09c.731 1.206.127 3.313 1.318 3.233c.9-.06.355-2.32-.062-2.865c.737 1.05 1.163 1.578.879 3.215c-.287 1.65-.346 2.116-.19 3.12"/>
                          <path d="M31.089 17.657c1.11-3.201 2.314-7.092-1.09-11.897L28.272 7.9c-.195-1.122-.462-1.77-1.06-2.313c-1.199.557-2.463 2.485-2.851 3.847m-7.551 12.3c-2.969-2.875-4.226-5.14-6.008-10.48l-.584-1.75c.986.31 1.95.549 3.043 1.186c.392-.634-.054-1.534.73-2.945c3.132 1.697 6.092 3.483 7.677 5.977"/><path d="M31.884 15.037c1.686-2.031 3.503-3.528 5.738-3.329c-1.975 2.92-3.503 5.587-4.331 7.862"/><path d="M36.01 14.205c.061 5.057-2.225 8.968-5.865 11.393"/><path d="M33.43 22.584c2.366-1.805 7.395-2.29 6.604-1.329c-.796.967-1.747 1.592-2.619 2.671c-1.053 1.837-3.472 2.37-7.108 2.46m-9.927 2.189c-4.823 1.846-7.814-1.109-10.593-4.452c-.993-1.195-1.658-2.605-3.863-4.326c-1.481-1.156 1.204-1.236 3.685-.542c2.64.74 5.007 2.792 7.238 2.798"/><path d="M20.704 29.239c-2.995 2.503-7.135 6.071-12.425 4.38c-.796-.255-1.06-1.19.82-1.743c1.671-1.408 3.31-2.931 5.187-3.602"/><path d="M24.453 27.532c-.074 1.443-1.006 2.178-2.056 2.347c-1.162.187-1.99-.598-2.088-1.709a5 5 0 0 1 .193-1.866m8.841-1.719c1.07.85 1.155 1.974.72 2.708c-.402.676-1.481 1.868-2.785.969c-.602-.415-.844-.791-.833-1.65m1.964.526v-1.274m-6.08 2.615v-1.057"/>
                          </g>
                          </svg>
                       
                          </button>


                        <!-- 添加侧栏句子解析按钮 -->
                        <button class="sidebar-btn tooltip-action-btn" title="sidebar" cursor: pointer;">
                          <!--

                          -->
                          <svg xmlns="http://www.w3.org/2000/svg" width="124" height="124" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M33.471 17.755c-1.38.414-2.809 1.777-3.996 2.568c-.203.135-1.815 1.176-2.785 1.844m1.48.895c-1.593.742-4.915 3.845-5.093 4.753m2.937-.342l-1.96 1.89c-1.186 1.144-2.269 2.152-3.361 4.156c-.148.272-1.522.986-1.727 1.182c-.701.673-1.443.762-2.357 1.106c-.543.205-1.176.778-1.818.852c-1.201.139-3.507-.266-1.914-.893c1.302-.512-2.002.849-3.069-.577m-.192-.54c-1.538.614-3.185-.335-3.99-1.934c-.66-1.242-1.126-3.162-1.126-4.667a8.886 8.886 0 0 1 8.886-8.886c1.043 0 1.465.153 2.174.198c2.952-.73 7.314-3.658 8.828-4.3M22.6 17.604l2.379-1.112c1.163-.534 2.418-.921 3.61-1.396c.516-.205.968-.453 1.515-.567m-2.75 2.961c1.287-.835 2.789-1.525 4.15-2.216c1.74-.883 3.545-1.617 5.351-2.343c.586-.236 1.2-.428 1.773-.681m4.871-.94l-9.522 4.97m-20.762 4.698c.247.403-1.791 1.932-3.557 3.119M7.733 31.23c1.498 1.745 5.105.058 2.703.013c2.463-.203 4.576-1.491 5.28-2.649c.548-.903 1.675-2.186 1.524-3.036c-.101-.567-.617-.473-1.077-.423c-2.09.23-2.377 2.082-4.785 1.915c2.992-2.972 5.477-4.466-1.561-.849"/></svg>
                       </button>

                    </div>



                        </div>



                </div>  <!-- title-container 结束 -->

                <!-- 右上角菜单按钮 - 对焦框图标 -->
                <button class="header-menu-toggle-btn" title="菜单">
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <!-- 弧度向内压 -->
  <path d="M 20 18 L 20 12 Q 18 6 12 4 L 5 4" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"></path>
</svg>
                </button>

                <!-- 按钮组容器（初始隐藏） -->
                <div class="header-buttons-container" style="display: none;">
                   <button class="liquid-glass-toggle-btn" title="切换液体玻璃效果">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M42.199 23.504c-.203-.609-.576-1.705-1.621-2.436c-1.265-.877-2.942-.82-3.242-.812c-.616.024-.957.13-1.621 0c-.47-.098-1.24-.244-1.621-.812c-.324-.48-.122-.877 0-2.437c.097-1.226.138-1.843 0-2.436c-.3-1.283-1.208-2.079-1.621-2.436c-.851-.747-1.929-1.267-4.052-1.624c-1.475-.252-3.85-.487-7.295 0c-1.742.244-4.425.706-6.483 1.397a17.7 17.7 0 0 0-4.863 2.436c-.016.008-.033.016-.04.024c-2.789 1.82-4.37 5.035-4.231 8.373c.737 17.922 33.091 20.18 36.69 4.823c.073-.487.64-2.152 0-4.06m-16.85-4.775a2.24 2.24 0 0 1-2.237-2.241c0-1.243.997-2.242 2.237-2.242h2.196a2.238 2.238 0 0 1 1.58 3.825a2.23 2.23 0 0 1-1.58.658z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M8.159 21.068a2.434 2.434 0 0 0 2.43 2.437a2.434 2.434 0 0 0 2.432-2.434v-.003a2.434 2.434 0 0 0-2.43-2.438a2.434 2.434 0 0 0-2.432 2.435zm4.051 7.308a2.434 2.434 0 0 0 2.432 2.437a2.434 2.434 0 0 0 2.432-2.436v0a2.434 2.434 0 0 0-2.43-2.438a2.434 2.434 0 0 0-2.433 2.434zm8.106 2.437a2.434 2.434 0 0 0 2.429 2.438a2.434 2.434 0 0 0 2.434-2.434v-.005a2.434 2.434 0 0 0-2.432-2.436a2.434 2.434 0 0 0-2.431 2.436zM28.42 30a2.434 2.434 0 0 0 2.43 2.439a2.434 2.434 0 0 0 2.433-2.434V30a2.434 2.434 0 0 0-2.43-2.436A2.434 2.434 0 0 0 28.42 30"/></svg>
                   </button>

                  <button class="minimize-btn-words" title="最小化">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48">
                      <!-- 空心横线 - 外边框 -->
                      <rect x="12" y="21" width="30" height="6" rx="4" ry="4" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>

                  <button class="close-btn-words">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m28.51 24l13.056-13.055a3.188 3.188 0 1 0-4.51-4.51L24 19.49L10.945 6.435a3.188 3.188 0 1 0-4.51 4.51L19.49 24L6.434 37.055a3.188 3.188 0 1 0 4.51 4.51L24 28.512l13.055 13.055c.623.623 1.44.934 2.255.934s1.633-.311 2.256-.934a3.19 3.19 0 0 0 0-4.51z"/></svg>
                  </button>
                </div>
               </div>

            <div class="tags">

            </div>
        </div>


        <!-- 添加状态切换按钮 -->
        <button class="status-toggle-btn" style="display: none;" title="(un)know">
         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M14.287 19.255c.346 2.47.83 3.6 3.678 4.017c-2.766.363-3.428 1.805-3.678 3.866c-.458-2.084-.773-3.381-3.66-3.866c2.797-.583 3.1-1.525 3.66-4.017M10.214 9.08c.341 2.664.712 4.868 4.85 5.56c-3.737.316-4.188 2.474-4.85 5.344c-.655-2.91-.99-4.976-4.714-5.344c2.349-.849 4.221-1.568 4.714-5.56m8.887 4.828c.28 2 .673 2.917 2.98 3.255c-2.24.293-2.778 1.463-2.98 3.132c-.371-1.688-.626-2.74-2.967-3.132c2.268-.472 2.513-1.236 2.967-3.255m15.932-.58l4.443 4.35L26.281 31.43c-2.649 2.76-5.688 4.77-8.352 6l-1.761-1.627c1.12-2.893 3.288-6.388 5.697-8.876z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M17.93 37.43c-.558.678-1.919 1.202-2.972 1.49c.203-.84.448-2.137 1.21-3.117m23.198-25.019l2.644 2.544c1.39 1.338-.47 3.539-1.954 2.117l-2.817-2.697c-1.351-1.294.528-3.502 2.127-1.964"/></svg>
        </button>


        <!-- 还原按钮 (最小化状态下显示) -->
        <button class="restore-btn-words" title="Maxmize" style="display: none;">
          <!-- 
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.098" cy="26.902" r="17.365" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18.533" cy="29.467" r="13.879" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16.259" cy="31.741" r="10.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>
         -->

         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M38.78 39.5H9.22a4.57 4.57 0 0 1-4.595-4.532V13.032A4.57 4.57 0 0 1 9.22 8.5h29.56a4.57 4.57 0 0 1 4.595 4.532v21.936A4.57 4.57 0 0 1 38.78 39.5m-28.342-5.812h27.124V14.311H10.439Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M43.375 17.219a2.906 2.906 0 0 0-2.906-2.906h-3.291M34.656 39.5a2.906 2.906 0 0 0 2.906-2.906v-3.291M4.625 30.781a2.906 2.906 0 0 0 2.906 2.906h3.291M13.344 8.5a2.906 2.906 0 0 0-2.906 2.906v3.291"/></svg>

           </button>

        <!-- 显示当前句子翻译按钮 (最小化状态下显示) -->
        <button class="show-sentence-translation-btn" title="Sentense" style="display: none;">

        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M41.188 16.517c-.063.63-.087.561.008 1.333c.1.805.647 2.38 1.197 2.913c.573.555.062 1.185-.438 1.807c.294.415-.07.94-.484 1.323c-.011.65-.606.713-.77 1.242c-.266.858-.083 1.906-1.146 2.197c-2.69.735-5.58-1.181-7.116-2.455"/><path d="M39.54 19.231c-1.517.806-2.947-.383-2.947-.383m3.314-3.392c-2.297-.647-2.916-.187-2.916-.187m4.197 1.248c-1.676.253-4.62.143-4.62.143"/><path d="M36.57 16.66c-1.259 3.274-6.814 4.632-5.932 4.103c3.846-2.307 3.498-5.48 3.498-5.48m.025 4.144c-.182 1.045-.401 3.53-.865 4.333a5.3 5.3 0 0 1-.85 1.123c-1.597 1.58-3.434.97-3.434.97s1.415-.024 2.322-2.003c1.802-3.928-.491-10.579 1.47-13.644c1.626-2.54 5.046-2.102 5.046-2.102s5.323.17 5.008 8.02c-.013.338-1.67.393-1.67.393M32.37 9.152c-1.013 1.153-1.166 2.486-1.166 2.486m.332-2.879c-1.013 1.152-1.166 2.485-1.166 2.485"/><path d="M31.127 8.366c-1.32-1.099-3.371-.884-4.667 0c-2.412 1.647-2.022 5.892-3.376 8.23c-.568.473 2.19-.736 3.105-3.022c.577-1.44.796-2.036 1.457-2.593l-.127 1.969c1.824-.64 1.268-2.11 2.867-1.812"/><path d="M37.85 8.104c-9.371-6.511-19.712-1.047-20.666 13.14c-.37 5.496-4.428 5.143-6.374 7.921c-2.327 3.322-1.883 9.125-6.31 10.416c1.995.773 2.938.19 4.427-1.291c0 0 .383 1.989-1.745 4.84c3.38-1.121 4.4-4.21 5.334-7.572c.203 5.13-.927 6.204-.965 6.441c3.286-.942 4.502-5.07 4.502-5.07s.624 1.991 2.588 4.327c-1.663-12.09 5.456-13.846 5.456-13.846m-5.264 6.729s7.283-1.9 9.816-4.482c1.245-1.27 1.945-2.23 2.155-4.913m4.219 2.028c-2.007.295-3.101 3.124-2.946 4.137c.48 3.137 2.393 5.996 2.393 5.996M39.476 8.14c.958-.972 2.623-.846 3.385 0c1.677 1.861-.53 4.053-.07 5.81"/><path d="M33.112 28.013c-1.859.174-2.883-.538-2.883-.538m-4.986 4.965c2.308 2.573 2.336 5.906 2.336 5.906m-3.817-5.599c1.064 1.28-.524 2.002-.09 2.84c.311.602 1.202.36 1.692 1.101c.559.844-.171 1.495-.171 1.495m7.042-8.467c1.303 2.32 2.089.98 3.816 2.136c1.728 1.156 2.093 2.908 2.093 2.908"/><path d="M36.366 35.946c.06-1.488-1.082-.473-1.28-.97c-.18-.454.459-1.01.242-1.445c-.232-.466-1.098-.263-1.377-.701c-.29-.456-.065-1.628-.065-1.628"/></g><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M11.438 27.953a19 19 0 0 1-1.83-8.172C9.62 13.672 12.541 7.96 17.42 4.508C9.995 7.554 5.11 14.986 5.09 23.266c0 4.09 1.502 8.216 3.516 11.399m5.532 5.645c3.071 2.092 6.513 3.183 10.462 3.182c8.845-.014 16.573-6.196 18.831-15.063c-3.1 6.08-9.198 9.895-15.852 9.915c-3.396 0-6.4-.637-9.11-2.328"/></svg>


        </button>

        <!-- 句子解析按钮 (最小化状态下显示) -->
        <button class="minimized-analysis-btn" title="AI" style="display: none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48">
            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M32.676 38.106c.878.325 1.79.466 2.7.397c2.551-.195 3.428.879 3.405 1.704c-.06 2.096-3.317 2.692-7.443 1.815a8.8 8.8 0 0 1-3.264-1.436m-2.337-2.146q-.514-.588-1.003-1.23m2.998-3.803c.67 1.324 1.552 2.44 2.56 3.288m-3.896-8.861c.02 1.226.2 2.384.508 3.454"/>
            <path d="M25.198 32.797c.673.923 1.929.484 2.825.64"/>
            <path d="M25.112 31.335c1.888-.137 3.818-.255 4.185 1.97c.12.731-.123 1.424-.504 1.805m-3.174 3.33c2.838.053 4.292-2.19 6.351-2.218c2.19-.03 2.405 1.09 2.619 2.289"/><path d="M33.159 37.886c-1.997.868-3.712 2.086-4.955 2.645c-1.779.8-3.705-.671-4.025-2.21m13.177.342c.554-.733.634-1.39.903-2.829c.282-1.507 1.899-1.118 2.043-.173c.281 1.844-.685 3.168-1.549 4.267m1.152-6.8c-3.112.375-2.436-3.085-1.006-4.074c.319.86 1.82 1.329 1.59-1.578c2.366.54 3.189 6.615-.584 5.652M25.363 27.2c-.688.484-2.137.566-5.216-1.079c-1.986-1.06-3.298-2.664-3.461-5.44c-.124-2.098.347-4.36-.366-6.426c2.36 1.966 2.331 3.107 3.27 4.3c1.521 1.94 3.383 2.286 4.526 3.8c1.46 1.937 2.197 4.174 1.247 4.844"/><path d="M25.717 26.698c2.341-.321 4.116-2.32 5.205-4.951c.928-2.241.017-5.302-1.287-8.109c-.417 2.573-1.53 4.07-2.327 5.064c-1.347 1.685-2.12 3.224-2.24 5.148m.27 3.397c1.559.605 2.765 2.217 4.074 3.433c2.197 2.04 4.005 2.478 5.698 2.977l.643.574c-.254-4.43-3.06-4.702-5.81-6.701m-4.618-.305c-.697 5.203.517 6.829-.456 9.63c-.83 2.39-2.636 3.923-4.401 4.36l.3-.508c-.837-2.661-1.77-5.334-.836-7.65l1.343-3.334"/><path d="M20.317 19.35c-.938-1.904-.42-3.496.113-5.085c-.44 1.59 2.458 3.003 1.005-1.676c-.363-1.17-.82-2.542-.228-3.651c.5 1.317.95 2.913 2.448 2.792c.407-.033.781-.617-.115-1.677c-1.234-1.46-2.033-2.921-1.009-3.844c-.038 2.096 2.122 3.041 3.362 5.09c.731 1.206.127 3.313 1.318 3.233c.9-.06.355-2.32-.062-2.865c.737 1.05 1.163 1.578.879 3.215c-.287 1.65-.346 2.116-.19 3.12"/>
            <path d="M31.089 17.657c1.11-3.201 2.314-7.092-1.09-11.897L28.272 7.9c-.195-1.122-.462-1.77-1.06-2.313c-1.199.557-2.463 2.485-2.851 3.847m-7.551 12.3c-2.969-2.875-4.226-5.14-6.008-10.48l-.584-1.75c.986.31 1.95.549 3.043 1.186c.392-.634-.054-1.534.73-2.945c3.132 1.697 6.092 3.483 7.677 5.977"/><path d="M31.884 15.037c1.686-2.031 3.503-3.528 5.738-3.329c-1.975 2.92-3.503 5.587-4.331 7.862"/><path d="M36.01 14.205c.061 5.057-2.225 8.968-5.865 11.393"/><path d="M33.43 22.584c2.366-1.805 7.395-2.29 6.604-1.329c-.796.967-1.747 1.592-2.619 2.671c-1.053 1.837-3.472 2.37-7.108 2.46m-9.927 2.189c-4.823 1.846-7.814-1.109-10.593-4.452c-.993-1.195-1.658-2.605-3.863-4.326c-1.481-1.156 1.204-1.236 3.685-.542c2.64.74 5.007 2.792 7.238 2.798"/><path d="M20.704 29.239c-2.995 2.503-7.135 6.071-12.425 4.38c-.796-.255-1.06-1.19.82-1.743c1.671-1.408 3.31-2.931 5.187-3.602"/><path d="M24.453 27.532c-.074 1.443-1.006 2.178-2.056 2.347c-1.162.187-1.99-.598-2.088-1.709a5 5 0 0 1 .193-1.866m8.841-1.719c1.07.85 1.155 1.974.72 2.708c-.402.676-1.481 1.868-2.785.969c-.602-.415-.844-.791-.833-1.65m1.964.526v-1.274m-6.08 2.615v-1.057"/>
            </g>
          </svg>
        </button>

        <div class="scrollable-content">
            <div class="section">
<!-- 
                <div class="section-header translation-section-header" >
                    <span class="Notes">Notes</span>
                    <span>
                      
                      <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M39.857 16.072v-2.643h-2.643v-2.643H31.93V8.143H16.07v2.643h-5.285v2.643H8.143v2.643H5.5v15.857h2.643v2.643h2.643v2.642h5.285v2.643H31.93v-2.643h5.285v-2.642h2.643v-2.643H42.5V16.072z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M8.144 24v2.643h2.642v2.643h5.286v2.643h15.857v-2.643h5.285v-2.643h2.643V24m-10.32-8.075v2.391h-2.643v2.392h-2.643v2.391h5.286v-2.391h2.643v-2.392h2.643v-2.391z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M21.861 25.993v-5.286h2.391v5.286z"/></svg>
                    

                    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M8.346 36.808v-2.846h2.846v-2.847h2.847v-2.846h2.846v-2.846h2.846v-2.846h2.846v-2.846h2.846v-2.846h2.846v-2.846H16.885v-2.847h-2.846V8.346h2.846V5.5h14.23v2.846h8.539v8.539H42.5v14.23h-2.846v2.847h-2.846v-2.847h-2.846V19.731h-2.847v2.846h-2.846v2.846h-2.846v2.846h-2.846v2.846h-2.846v2.847h-2.846v2.846h-2.846v2.846h-2.847V42.5H5.5v-5.692z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M33.962 8.346v5.693h5.692m-5.692 5.692v-2.846h-2.847v-2.846h-2.846"/></svg>                      </span>
                              
                </div>
 -->

                <div class="section-content">
                    <div class="translation-list">
                        <div class="translation-item">

                        </div>

                        <!-- 添加AI推荐条目 -->
                        <div class="translation-item ai-recommendation">

                            <span class="ai-badge">
                                <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"></path>
                                </svg>
                            </span>
                            <span>Hmm...</span>
                            <div class="translation-actions">
                                <button class="translation-action-btn add-ai-translation">+</button>
                            </div>

                        </div>

                        <!-- 添加第二个AI推荐条目 -->
                        <div class="translation-item ai-recommendation-2">

                            <span class="ai-badge">
                                <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"></path>
                                </svg>
                            </span>
                            <span>Hmm...</span>
                            <div class="translation-actions">
                                <button class="translation-action-btn add-ai-translation-2">+</button>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            <div class="section examples-section" >
<!-- 
                <div class="section-header examples-section-header">
                    <span class="Notes">z.B.</span>
                    <span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M39.857 16.072v-2.643h-2.643v-2.643H31.93V8.143H16.07v2.643h-5.285v2.643H8.143v2.643H5.5v15.857h2.643v2.643h2.643v2.642h5.285v2.643H31.93v-2.643h5.285v-2.642h2.643v-2.643H42.5V16.072z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M8.144 24v2.643h2.642v2.643h5.286v2.643h15.857v-2.643h5.285v-2.643h2.643V24m-10.32-8.075v2.391h-2.643v2.392h-2.643v2.391h5.286v-2.391h2.643v-2.392h2.643v-2.391z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M21.861 25.993v-5.286h2.391v5.286z"/></svg>
                    </span>
                </div>
-->
                <div class="section-content">
                    <div class="tooltip-sentences">

                    </div>
                </div>

            </div>
        </div>

        <div class="fixed-footer">
            <div class="bottom-nav">
                <div class="nav-buttons">
                    <div class="nav-buttons">
                        <button class="nav-btn confirm-btn " data-status="0">

                          <!--
                       
                         
                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M24 45L5.756 34.467V13.533L24 24.066z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M24 24.066L5.756 13.533L24 3l18.243 10.533z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M42.243 34.467L24 45V24.066l18.243-10.533zM24 29.994L5.757 19.461m0 9.078L24 39.072M8.651 23.507l2.913 1.682m-1.457 3.456v-4.297m7.824 4.517l2.912 1.681m-1.456 3.456v-4.296m-6.096.777v-4.297l2.912 5.994v-4.297m26.04-8.422L24 29.994m0 9.078l18.243-10.533m-15.348 2.159l2.912-1.682m-1.456 5.138v-4.297m7.823-4.517l2.913-1.681m-1.456 5.137v-4.297"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M31.535 32.316v-4.297l2.912 2.631v-4.297M20.768 15.399l6.464-3.732m-6.484-.012l6.504 3.756"/></svg>
                        -->✗
                          </button>

                        <button class="nav-btn " data-status="1">
                          <!--
                        
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M26.643 21.357H24V24h-2.643v2.643h-2.643v2.643h-2.643v2.643h-2.642v2.642h-2.643v2.643H8.143V42.5h5.286v-2.643h2.642v-2.643h2.643v-2.643h2.643v-2.642H24v-2.643h2.643v-2.643h2.643v-5.286zm7.928-7.928h2.643v2.643h-2.643z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M37.214 18.714v-2.643h-2.643V8.143h-2.642V5.5h-5.286v2.643H24v2.643h-2.643v2.643h-2.643v5.285h2.643v2.643h7.929V24h2.643v2.643h5.285V24h2.643v-5.286z"/></svg>
                        -->
                       1
                       
                        </button>

                        <button class="nav-btn" data-status="2">

                          <!--
                         

                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M8.346 36.808v-2.846h2.846v-2.847h2.847v-2.846h2.846v-2.846h2.846v-2.846h2.846v-2.846h2.846v-2.846H16.885v-2.847h-2.846V8.346h2.846V5.5h14.23v2.846h8.539v8.539H42.5v14.23h-2.846v2.847h-2.846v-2.847h-2.846V19.731h-2.847v2.846h-2.846v2.846h-2.846v2.846h-2.846v2.846h-2.846v2.847h-2.846v2.846h-2.846v2.846h-2.847V42.5H5.5v-5.692z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M33.962 8.346v5.693h5.692m-5.692 5.692v-2.846h-2.847v-2.846h-2.846"/></svg>
 -->
 2
                        </button>

                        <button class="nav-btn" data-status="3">
                          <!--
                         
                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M14.75 28.625v2.312h2.312v2.313h2.313v2.312H24v2.313h4.625V33.25h-2.313v-2.313H24v-2.312h-2.313v-2.313h-2.312v-2.273h-2.313v-2.313H14.75v-2.273h-4.625v4.586h2.312v4.586z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M40.187 5.5h-4.625v2.312H33.25v2.313h-2.313v2.312h-2.312v2.313h-2.313v2.312H24v2.313h-2.313v2.313h-2.312v4.624h2.312v2.313h4.625v-2.313h2.313V24h2.312v-2.312h2.313v-2.313h2.312v-2.313h2.313V14.75h2.312v-2.313H42.5V5.5zM14.75 30.937h-2.313v2.313h-2.312h0v2.312H5.5V42.5h6.937v-4.625h2.313v-2.313h2.312v-4.625z"/></svg>
 -->
 3
                        </button>
                        <button class="nav-btn" data-status="4">

                          <!--
                         
                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.5 24v-3.083h3.083V14.75h3.084v-3.083h3.083V8.583h6.167V5.5H24v3.083h3.083v3.084h2.706v3.083h-2.706v3.083H24v3.084h3.083V24h3.084v3.083h3.083v3.084h3.083v3.083h3.195v3.083H42.5V42.5h-6.167v-3.083H33.25v-3.084h-3.083V33.25h-3.084v-3.083H24v-3.084h-3.083V24h-3.084v3.083H14.75v3.084h-3.083v-3.084H8.583V24z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M17.833 8.583v3.083H14.75v3.084h-3.083v3.083H8.583M24 20.917h-3.083V24"/></svg>
 -->
 4
                        </button>

                        <button class="nav-btn confirm-btn" data-status="5">
                          <!--
                         
                           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M24 24v21.5m4.965-27.95l2.482-1.433v-5.734L28.965 8.95h-9.93l-2.483 1.433v5.734l2.482 1.433z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m24 2.5l18.62 10.75v21.5L24 45.5L5.38 34.75v-21.5z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M5.38 13.25L24 24l18.62-10.75M8.483 31.525v-7.167l6.207-3.583l6.206 10.75v7.167l-1.24.716l-9.931-5.733zm31.033 0v-7.167l-6.207-3.583l-6.206 10.75v7.167l1.241.716l9.93-5.733z"/><circle cx="21.517" cy="11.817" r=".75" fill="currentColor"/><circle cx="24" cy="13.25" r=".75" fill="currentColor"/><circle cx="26.483" cy="11.817" r=".75" fill="currentColor"/><circle cx="26.483" cy="14.683" r=".75" fill="currentColor"/><circle cx="21.517" cy="14.683" r=".75" fill="currentColor"/><circle cx="14.69" cy="26.508" r=".75" fill="currentColor"/><circle cx="12.208" cy="27.942" r=".75" fill="currentColor"/><circle cx="14.69" cy="29.375" r=".75" fill="currentColor"/><circle cx="17.173" cy="30.808" r=".75" fill="currentColor"/><circle cx="17.173" cy="33.675" r=".75" fill="currentColor"/><circle cx="14.69" cy="32.242" r=".75" fill="currentColor"/><circle cx="12.208" cy="30.808" r=".75" fill="currentColor"/><circle cx="30.827" cy="30.808" r=".75" fill="currentColor"/><circle cx="33.31" cy="29.375" r=".75" fill="currentColor"/><circle cx="33.31" cy="26.508" r=".75" fill="currentColor"/><circle cx="35.792" cy="27.942" r=".75" fill="currentColor"/><circle cx="35.792" cy="30.808" r=".75" fill="currentColor"/><circle cx="33.31" cy="32.242" r=".75" fill="currentColor"/><circle cx="30.827" cy="33.675" r=".75" fill="currentColor"/></svg>
 -->
 ✓

                        </button>
                    </div>
                </div>
            </div>
            <button class="expand-collapse-btn">
                <svg width="16" height="16" class="svg-icon svg-icon--chevronUp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" xmlns:xlink="http://www.w3.org/1999/xlink">
                    <path fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" class="is-stroke" d="M27.5,21L16.7,10.8c-0.4-0.4-1-0.4-1.4,0L4.5,21"></path>
                </svg>
            </button>
        </div>
  `;

  // 设置基本HTML
  tooltipEl.innerHTML = tooltipHTML;

  // 应用背景设置
  if (isBackgroundVideo && backgroundVideoUrl) {
    // 如果使用视频背景，添加视频元素
    const videoEl = document.createElement('video');
    videoEl.className = 'tooltip-video-background';
    videoEl.src = backgroundVideoUrl;
    videoEl.autoplay = true;
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;

    // 确保视频从顶部开始显示
    videoEl.style.objectPosition = 'center top';

    // 将视频元素插入到tooltip的最前面
    tooltipEl.insertBefore(videoEl, tooltipEl.firstChild);
  } else if (backgroundImageUrl) {
    // 如果使用图片背景，直接设置背景图片样式
    const bgStyle = document.createElement('style');
    bgStyle.setAttribute('data-bg-style', 'true'); // 添加标识属性
    bgStyle.textContent = `
      .vocab-tooltip::before {
        background-image: url(${backgroundImageUrl});
        ${backgroundImageUrl.toLowerCase().endsWith('.svg') || backgroundImageUrl.includes('data:image/svg+xml') ? 'opacity: 0.05;' : ''}
      }
    `;
    tooltipEl.appendChild(bgStyle);
  }

  // 检查是否是Orion浏览器，并添加音频元素
  try {

    // if (typeof window.orion_isIOS !== 'undefined' && window.orion_isIOS) {
    if(true){
      console.log('检测到Orion浏览器');

      (async function() { // Keep the async IIFE structure
        try {
          // 保存当前tooltipEl的引用，避免异步操作中访问已清理的全局变量
          const currentTooltipEl = tooltipEl;
          if (!currentTooltipEl) {
            console.error('tooltipEl 为 null，无法设置Orion TTS');
            return;
          }

          const orionTTSEnabled = await getStorageValue('useOrionTTS');
          console.log('Orion TTS开关状态:', orionTTSEnabled);

          // 在异步操作后再次检查元素是否仍然存在以及tooltip销毁状态
          if (!currentTooltipEl || !currentTooltipEl.parentNode || tooltipBeingDestroyed) {
            console.error('tooltipEl 已被移除或tooltip正在被销毁，无法设置Orion TTS');
            return;
          }

          const soundIconContainerBtn = currentTooltipEl.querySelector('.orion-sound-icon-container');
          if (!soundIconContainerBtn) {
            console.warn('.orion-sound-icon-container not found in tooltipEl.');
            return;
          }
          const normalSvgIcon = soundIconContainerBtn.querySelector('.normal-sound-icon');

          // Clear any previously added custom player elements from soundIconContainerBtn
          let existingCustomPlayer = soundIconContainerBtn.querySelector('.custom-play-button');
          if (existingCustomPlayer) existingCustomPlayer.remove();
          let existingAudioEl = soundIconContainerBtn.querySelector('#orion-audio-player');
          if (existingAudioEl) existingAudioEl.remove();

          if (orionTTSEnabled === true) {
            console.log('Orion TTS enabled, replacing SVG with custom audio player in .orion-sound-icon-container.');
            if (normalSvgIcon) {
              normalSvgIcon.style.display = 'none'; // Hide the original SVG
            }

            // Create音频元素（不显示控件）
            const audioElement = document.createElement('audio');
            audioElement.id = 'orion-audio-player';
            audioElement.controls = false; // 不显示原生控件
            audioElement.controlsList = "nodownload nofullscreen noremoteplayback";
            audioElement.disableRemotePlayback = true;
            audioElement.style.display = 'none'; // 隐藏音频元素

            // Create自定义播放按钮
            const customPlayButton = document.createElement('button');
            customPlayButton.className = 'custom-play-button';
            const pauseSvg = `
<svg  data-slot="icon" fill="none" " stroke="currentColor" viewBox="10 10 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m21.902 28.869l-4.246-3.784l-2.03-2.769v-4.615h-2.862l2.216-.83v-1.016l5.261-3.784l.553 2.954L32.7 23.331l3.877 3.323l-2.677-1.015l2.4 2.031l-4.337-1.385l9.506 6.922l2.031 2.215l-2.401-.646l-8.675-6.553h-2.861z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m25.511 28.565l-1.625 2.15l2.954-2.263m-5.405 0l-1.471 1.709l.735-2.364"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m4.5 27.023l27.047 4.661l5.169 4.245M14.98 15.855h4.015l-3.369 1.846m16.337 8.584l-5.123-2.538l-.877-1.985l-4.938-.374l-.646-3.687l-2.723 2.261l-2.03 2.354"/></svg>

            `;
            const playSvg = `
<svg data-slot="icon" fill="none" " stroke="currentColor" viewBox="10 10 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m4.5 25.445l27.908 5.49l5.318 4.372"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m40.085 33.746l-2.36 1.561l-3.299 2.183M20.588 10.51l-5.669 3.232l.032.85l-1.894 1.462l2.81.46v4.648l2.433 2.989l3.85 3.617l8.03-.778l1.261.025L43.5 33.869l-10.136-8.186l3.892.396l-2.83-2.459l4.303-.268l-17.499-9.563Zm.547 16.43l-.83 1.49m5.435-.896l-1.246 1.664l.735-2.364"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m29.068 20.312l-7.715-.26l-.501-3.858Z"/></svg>
            `;
            customPlayButton.innerHTML = playSvg;
            //${isDarkMode ? '#ffffff' : '#f0f0f0'};
            const isDarkMode = currentTooltipEl.classList.contains('dark-mode');
            customPlayButton.style.cssText = `
              width: 42px;
              height: 30px;
              border-radius: 50%;
              background-color: rgb(240 240 240 / 0%);
              border: none;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              /* margin-left: 5px; */ /* Removed as it's content of the main sound button */
              transition: transform 0.2s ease;
            `;

            customPlayButton.addEventListener('mouseenter', function() {
              this.style.transform = 'scale(1.1)';
            });
            customPlayButton.addEventListener('mouseleave', function() {
              this.style.transform = 'scale(1)';
            });
            customPlayButton.addEventListener('click', function() {
              if (audioElement.paused) {
                // 如果当前有缓存的音频URL，直接播放，不重新请求网络
                if (audioElement.src && audioElement.src !== 'about:blank' && audioElement.src !== window.location.href) {
                  console.log('使用缓存的音频URL播放:', audioElement.src);
                  audioElement.play().catch(err => console.error('播放失败:', err));
                  this.innerHTML = pauseSvg;
                } else {
                  // 如果没有缓存的音频URL，通过orion_playText函数请求新的音频
                  console.log('没有缓存的音频URL，请求新音频');
                  try {
                    if (typeof window.orion_playText === 'function') {
                      window.orion_playText({
                        sentence: sentence,
                        text: word,
                        count: 1
                      });
                      // 设置暂停图标，因为orion_playText会自动播放
                      this.innerHTML = pauseSvg;
                    } else {
                      console.error('orion_playText函数不可用');
                    }
                  } catch (error) {
                    console.error('请求新音频失败:', error);
                  }
                }
              } else {
                audioElement.pause();
                this.innerHTML = playSvg;
              }
            });

            audioElement.addEventListener('ended', function() {
              console.log('音频播放完成，重置播放按钮状态');
              customPlayButton.innerHTML = playSvg;
            });

            soundIconContainerBtn.appendChild(audioElement);
            soundIconContainerBtn.appendChild(customPlayButton);

            if (typeof window.orion_setAudioElement === 'function') {
              window.orion_setAudioElement(audioElement);
              console.log('设置全局音频元素成功');
            }

            audioElement.addEventListener('loadedmetadata', function() {
              setTimeout(() => {
                try {
                  const mediaControls = audioElement.shadowRoot ||
                                       (audioElement.querySelector('*') && audioElement.querySelector('*').shadowRoot);
                  if (mediaControls) {
                    const overflowButton = mediaControls.querySelector('input[aria-haspopup="menu"], input[title="weitere Optionen"]');
                    if (overflowButton) {
                      overflowButton.style.display = 'none';
                      console.log('通过DOM操作隐藏了溢出按钮');
                    }
                  }
                } catch (error) {
                  console.error('尝试隐藏溢出按钮时出错:', error);
                }
              }, 100);
            });

          } else { // Orion TTS is disabled
            console.log('Orion TTS disabled, ensuring SVG icon is visible in .orion-sound-icon-container.');
            if (normalSvgIcon) {
              normalSvgIcon.style.display = ''; // Ensure SVG is visible
            }
            // Any custom player elements were already removed at the beginning of this block.
          }
        } catch (err) {
          console.error('获取Orion TTS开关状态或设置播放器时出错:', err);
        }
      })(); // End of async IIFE
    } else { // Not Orion browser
      console.log('Not Orion browser, ensuring SVG icon is visible in .orion-sound-icon-container.');
      const soundIconContainerBtn = tooltipEl.querySelector('.orion-sound-icon-container');
      if (soundIconContainerBtn) {
        const normalSvgIcon = soundIconContainerBtn.querySelector('.normal-sound-icon');
        if (normalSvgIcon) {
          normalSvgIcon.style.display = ''; // Ensure SVG is visible
        }
        // Remove any custom player elements if they were somehow added
        let existingCustomPlayer = soundIconContainerBtn.querySelector('.custom-play-button');
        if (existingCustomPlayer) existingCustomPlayer.remove();
        let existingAudioEl = soundIconContainerBtn.querySelector('#orion-audio-player');
        if (existingAudioEl) existingAudioEl.remove();
      }
    }
  } catch (error) {
    console.error('添加Orion音频元素出错:', error);
  }


// 获取单词状 态
  let wordStatus;
  if (highlightManager.wordDetailsFromDB[word.toLowerCase()]) {
    wordStatus = highlightManager.wordDetailsFromDB[word.toLowerCase()].status;
  }

  // 更新按钮颜色
  updateButtonColors(tooltipEl, wordStatus);


        // 更新收缩功能的选择器
        const collapseBtn = tooltipEl.querySelector('.expand-collapse-btn');

        collapseBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 判断当前是否是收缩状态,如果是收缩状态则即将展开
            const isCurrentlyCollapsed = tooltipEl.classList.contains('collapsed');

            tooltipEl.classList.toggle('collapsed');

            // 如果从收缩状态展开,则触发手动添加例句
            if (isCurrentlyCollapsed) {
              console.log("展开按钮被点击,触发手动添加例句");

              // 检查例句是否已存在
              const existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()];
              const sentenceExists = existingDetails?.sentences?.some(item => item.sentence === sentence);

              if (sentenceExists) {
                console.log("例句已存在,不重复添加");
              } else {
                console.log("例句不存在,开始添加");

                let currentUrl = window.top.location.href;
                // 添加例句和翻译
                fetchSentenceTranslation(word, sentence).then(sentTranslation => {
                  chrome.runtime.sendMessage({
                    action: "addSentence",
                    word: originalWord,
                    sentence: sentence,
                    translation: sentTranslation,
                    url: currentUrl
                  }, (res) => {
                    if (res && res.error) {
                      console.error("保存例句失败:", res.error);
                    } else {
                      console.log("保存例句成功");

                      // 添加本地缓存
                      if (highlightManager && highlightManager.wordDetailsFromDB) {
                        const existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()] || {};
                        highlightManager.wordDetailsFromDB[word.toLowerCase()] = {
                          ...existingDetails,
                          sentences: [...(existingDetails.sentences || []), { sentence: sentence, translation: sentTranslation, url: currentUrl }]
                        };
                        console.log("本地缓存已更新:", highlightManager.wordDetailsFromDB[word.toLowerCase()]);
                      }

                      // 刷新tooltip中显示的例句
                      refreshTooltipSentences(word, sentence);
                    }
                  });
                });
              }
            }

            // // 强制重新应用液体玻璃效果
            // setTimeout(async () => {
            //   console.log('展开/收缩后重新应用液体玻璃效果');
            //   // 先清理现有效果
            //   cleanupLiquidGlass();
            //   // 重新应用效果
            //   setTimeout(async () => {
            //     await applyLiquidGlassToTooltip();
            //   }, 50);
            // }, 200); // 等待CSS动画完成
              // 让高度始终自动适应内容
              tooltipEl.style.height = 'auto';

              // 如果需要隐藏某些内容，通过 CSS 类来控制显示/隐藏
              if (tooltipEl.classList.contains('collapsed')) {                // tooltipEl.querySelector('.scrollable-content').style.display = 'none';

                  const sentencesSection = tooltipEl.querySelector('.section:first-child');
                  sentencesSection.style.border = 'none';
                  //除了第一个元素，其他.scrollable-content下的元素全都隐藏掉；
                  tooltipEl.querySelectorAll('.section').forEach(element => {
                    if (element !== sentencesSection) {
                      element.style.display = 'none';
                    }
                  });



            } else {                // tooltipEl.querySelector('.scrollable-content').style.display = 'block';


               //.scrollable-content 第一个元素     border复原：    border: 1px solid #8f9799;
               //除了第一个元素，其他.scrollable-content下的元素全都现实出来
               const sentencesSection = tooltipEl.querySelector('.section:first-child');

               sentencesSection.style.removeProperty('border');

               tooltipEl.querySelectorAll('.section').forEach(element => {
                 if (element !== sentencesSection) {
                   element.style.display = 'block';
                 }
               });

              }
        });
        // 添加各个模块的伸缩功能
        tooltipEl.querySelectorAll('.section-header').forEach(header => {
          header.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
              const section = header.closest('.section');
              if (section) {
                  section.classList.toggle('collapsed');
              }
          });
      });
      ///---tag

        // 提取标签点击编辑功能为单独函数，便于复用
        function addTagClickEvent(tag) {
            tag.addEventListener('mousedown', function(e){
    e.preventDefault();
    e.stopPropagation();

                const tagText = this.textContent.trim();

                const tagClass = this.className;
                const tagHeight = this.offsetHeight;

                // 创建输入框
                const input = document.createElement('input');
                input.type = 'text';
                input.value = tagText;
                input.className = tagClass + ' tag-input';
                input.style.minWidth = '80px';
                input.style.border = 'none';
                input.style.background = '#f0f0f0';
                input.style.outline = 'none';
                input.style.padding = '2px 8px';
                input.style.borderRadius = '12px';
                input.style.marginRight = '8px';
                input.style.height = tagHeight + 'px';
                input.style.boxSizing = 'border-box';
                input.style.fontSize = '12px';
                input.style.lineHeight = (tagHeight - 4) + 'px';

                // 替换标签为输入框
                this.parentNode.replaceChild(input, this);
                input.focus({ preventScroll: true });

                // 标记是否已经处理过
                let processed = false;

                // --- 新增：阻止键盘事件冒泡 ---
                input.addEventListener('keydown', function(e) {
                    e.stopPropagation();
                });
                // --- 阻止冒泡结束 ---

                // 按下回车键时处理
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault(); // 阻止默认行为
                        if (processed) return; // 如果已经处理过，则不再处理

                        const newTag = document.createElement('span');
                        newTag.textContent = this.value;
                        newTag.className = tagClass;
                        this.parentNode.replaceChild(newTag, this);

                        const tag_add = e.target.value.trim();


                        //如果新旧一样，旧不操作
                        if (tagText === tag_add) {
                          return;
                        }


                        //删除旧tag
                        if (tagText) {
                          // 去除标签文本中的首尾空格
                          const cleanTagText = tagText.trim();
                          console.log("删除旧标签:", cleanTagText);
                          chrome.runtime.sendMessage({ action: "removeTag", word: originalWord, tag: cleanTagText }, (response) => {
                            if (response && response.error) {
                              console.error("删除标签失败:", response.error);
                            } else {
                              console.log("删除标签成功");
                            }
                          });
                        }

                        if (tag_add) {
                          // 去除新标签中的首尾空格
                          const cleanNewTag = tag_add.trim();
                          console.log("新标签修改完成:", cleanNewTag);
                          chrome.runtime.sendMessage({ action: "addTag", word: originalWord, tag: cleanNewTag }, (response) => {
                            if (response && response.error) {
                              console.error("添加标签失败:", response.error);
                            } else {
                              console.log("添加标签成功");
                              refreshTooltipTags(word, sentence);
                            }
                          });
                          e.target.value = "";
                        }



                        // 为新标签添加点击事件
                        addTagClickEvent(newTag);

                        // 标记已处理
                        processed = true;
                    }
                });

                // 输入框失去焦点时恢复为标签
                input.addEventListener('blur', function() {
                    setTimeout(() => {  // 添加延时，确保在keydown事件之后处理
                        if (processed) return; // 如果已经处理过，则不再处理

                        const newTagValue = this.value.trim();
                        const oldTagValue = tagText.trim();

                        // 如果新旧值不同，则进行保存操作
                        if (newTagValue !== oldTagValue) {
                            console.log("Tag blur: values differ, saving changes.");
                            // 删除旧 tag (如果存在)
                            if (oldTagValue) {
                                console.log("Removing old tag:", oldTagValue);
                                chrome.runtime.sendMessage({ action: "removeTag", word: originalWord, tag: oldTagValue }, (response) => {
                                    if (response && response.error) {
                                        console.error("删除标签失败 (blur):", response.error);
                                    } else {
                                        console.log("删除旧标签成功 (blur)");
                                        // 只有在删除成功后才添加新标签 (如果新值不为空)
                                        if (newTagValue) {
                                            console.log("Adding new tag:", newTagValue);
                                            chrome.runtime.sendMessage({ action: "addTag", word: originalWord, tag: newTagValue }, (response) => {
                                                if (response && response.error) {
                                                    console.error("添加标签失败 (blur):", response.error);
                                                } else {
                                                    console.log("添加新标签成功 (blur)");
                                                }
                                                // 无论添加是否成功，都刷新标签显示
                                                refreshTooltipTags(word, sentence);
                                            });
                                        } else {
                                            // 如果新值为空，仅刷新
                                             refreshTooltipTags(word, sentence);
                                        }
                                    }
                                });
                            } else if (newTagValue) {
                                // 如果旧值不存在，直接添加新标签
                                console.log("Adding new tag (no old tag):", newTagValue);
                                chrome.runtime.sendMessage({ action: "addTag", word: originalWord, tag: newTagValue }, (response) => {
                                    if (response && response.error) {
                                        console.error("添加标签失败 (blur):", response.error);
                                    } else {
                                        console.log("添加新标签成功 (blur)");
                                    }
                                    refreshTooltipTags(word, sentence);
                                });
                            } else {
                                 // 如果新旧都为空，仅刷新 (理论上不太可能发生在此处)
                                 refreshTooltipTags(word, sentence);
                            }
                        } else {
                             // 值未改变，仍然刷新以恢复显示
                             console.log("Tag blur: values are the same, refreshing UI.");
                             refreshTooltipTags(word, sentence);
                        }

                        // refreshTooltipTags(word, sentence); // 现在由保存逻辑处理刷新
                        processed = true; // 标记已处理
                    }, 0); // 保持0ms延迟可能有助于避免某些竞争条件，但可以考虑移除
                });
            });
        }


        // 修改 refreshTooltipTags 函数中处理 AI 标签的部分
        function refreshTooltipTags(word, sentence) {
          chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, (response) => {
              // 添加null检查，确保tooltipEl存在且tooltip未被销毁
              if (!tooltipEl || tooltipBeingDestroyed) {
                console.error('tooltipEl 为 null 或tooltip正在被销毁，无法刷新标签');
                return;
              }

              if (response && response.details) {
              const tags = response.details.tags || [];
              const tagsListEl = tooltipEl.querySelector(".tags");

              // 过滤掉 null 值，并检查过滤后数组是否为空
              const validTags = tags.filter(tag => tag !== null);

              if (validTags.length === 0) {
                  // 如果过滤后没有有效标签，获取AI建议
                  fetchAITags(word, sentence).then(aiTags => {
                      const tagPromises = [];

                      console.log("处理AI标签响应:", aiTags);

                      // 检查是否是词组的多单词标签响应
                      const isMultiWordResponse = typeof aiTags === 'object' &&
                                                  !aiTags.hasOwnProperty('pos') &&
                                                  Object.keys(aiTags).some(key => typeof aiTags[key] === 'object');

                      if (isMultiWordResponse) {
                          // 处理词组的多单词标签
                          console.log("检测到词组的多单词标签响应");
                          Object.entries(aiTags).forEach(([wordKey, wordData]) => {
                              if (typeof wordData === 'object' && wordData !== null) {
                                  // 为词组添加每个子单词的标签信息
                                  Object.entries(wordData).forEach(([key, value]) => {
                                      if (value !== 'null' && value !== null && value !== '') {
                                          const tagText = `${wordKey}-${key}: ${value}`;
                                          tagPromises.push(
                                              new Promise((resolve) => {
                                                  chrome.runtime.sendMessage({
                                                      action: "addTag",
                                                      word: originalWord,
                                                      tag: tagText
                                                  }, resolve);
                                              })
                                          );
                                      }
                                  });
                              }
                          });
                      } else {
                          // 处理单个单词的标签（原有逻辑）
                          if (aiTags.pos !== "null") {
                              const posTags = Array.isArray(aiTags.pos) ? aiTags.pos : [aiTags.pos];
                              posTags.forEach(pos => {
                              tagPromises.push(
                                  new Promise((resolve) => {
                                  chrome.runtime.sendMessage({
                                      action: "addTag",
                                      word: originalWord,
                                      tag: pos
                                  }, resolve);
                                  })
                              );
                              });
                          }
                      }

                          // 处理单个单词的其他标签（德语性别、复数、动词变位等）
                          if (aiTags.gender !== "null") {
                              tagPromises.push(
                              new Promise((resolve) => {
                                  chrome.runtime.sendMessage({
                                  action: "addTag",
                                  word: originalWord,
                                  tag: aiTags.gender
                                  }, (response) => {
                                    if (chrome.runtime.lastError) {
                                      console.error('发送消息失败:', chrome.runtime.lastError);
                                      resolve({ error: chrome.runtime.lastError.message });
                                    } else {
                                      resolve(response);
                                    }
                                  });
                              })
                              );
                          }

                          // 处理复数形式
                          if (aiTags.plural !== "null") {
                              tagPromises.push(
                              new Promise((resolve) => {
                                  chrome.runtime.sendMessage({
                                  action: "addTag",
                                  word: originalWord,
                                  tag: `pl: ${aiTags.plural}`
                                  }, resolve);
                              })
                              );
                          }

                          // 处理动词变位
                          if (aiTags.conjugation !== "null" && aiTags.conjugation !== word) {
                              tagPromises.push(
                              new Promise((resolve) => {
                                  chrome.runtime.sendMessage({
                                  action: "addTag",
                                  word: originalWord,
                                  tag: `inf: ${aiTags.conjugation}`
                                  }, resolve);
                              })
                              );
                          }

                          // 处理其他附加标签
                          const excludedKeys = ['pos', 'gender', 'plural', 'conjugation'];
                          for (const [key, value] of Object.entries(aiTags)) {
                              if (!excludedKeys.includes(key) && value !== 'null' && value !== null && value !== '') {
                                  // 处理不同类型的值
                                  let formattedValue;
                                  if (Array.isArray(value)) {
                                      formattedValue = value.join(', ');
                                  } else if (typeof value === 'object' && value !== null) {
                                      formattedValue = JSON.stringify(value);
                                  } else {
                                      formattedValue = String(value);
                                  }

                                  tagPromises.push(
                                      new Promise((resolve) => {
                                          chrome.runtime.sendMessage({
                                              action: "addTag",
                                              word: originalWord,
                                              tag: `${key}: ${formattedValue}`
                                          }, resolve);
                                      })
                                  );
                              }
                          }





                  // 等待所有标签添加完成后再次刷新显示
                  Promise.all(tagPromises).then(() => {
                      chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, (updatedResponse) => {
                      // 添加null检查，确保tooltipEl存在且tooltip未被销毁
                      if (!tooltipEl || tooltipBeingDestroyed) {
                        console.error('tooltipEl 为 null 或tooltip正在被销毁，无法更新标签显示');
                        return;
                      }

                      if (updatedResponse && updatedResponse.details) {
                          // 过滤掉 null 值
                          const updatedTags = (updatedResponse.details.tags || []).filter(tag => tag !== null);
                          updateTagsDisplay(tagsListEl, updatedTags, word);
                          refreshLanguageDisplay(word);
                      }
                      });
                  });
                  });
              } else {
                  // 如果有有效标签，则显示它们
                  updateTagsDisplay(tagsListEl, validTags, word); // 传递过滤后的标签
                  refreshLanguageDisplay(word);
              }
              }
          });
          }
             // 新增函数：刷新语言显示
          function refreshLanguageDisplay(word) {
              const languageSquare = tooltipEl.querySelector('#languageSquare');
              if (languageSquare) {
                  let currentLanguage = highlightManager.wordDetailsFromDB[word.toLowerCase()]?.language;
                  languageSquare.textContent = currentLanguage || '?';
              }
          }


        // 确保 updateTagsDisplay 使用 shadowRoot 内的元素
        function updateTagsDisplay(tagsListEl, tags, word) {
          // console.log("获取的tagsListEl和tags是：",tagsListEl,tags);

          // 生成现有标签的HTML
          tagsListEl.innerHTML = tags.map(tag => {
            // 确保tag已经去除了首尾空格
            const cleanTag = tag.trim();
            return `<span class="tag"> ${cleanTag} <span class="remove-tag" data-tag="${cleanTag}">
              <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="12" height="12">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"></path>
              </svg>
            </span>
            </span>`;
          }).join(" ") || "";

          // 手动添加"tag+"按钮
          const addTagButton = document.createElement('span');
          addTagButton.className = 'tag';
          addTagButton.textContent = 'tag+';
          tagsListEl.appendChild(addTagButton);

          // 为"tag+"按钮绑定特殊的添加新标签点击事件
          addTagButton.addEventListener('mousedown', function(e){
              e.preventDefault();
              e.stopPropagation();
              // 获取标签的高度
              const tagHeight = this.offsetHeight;

              // 创建输入框
              const input = document.createElement('input');
              input.type = 'text';
              input.placeholder = '输入新标签';
              input.className = 'tag-input';
              input.style.minWidth = '80px';
              input.style.border = 'none';
              input.style.background = '#f0f0f0';
              input.style.outline = 'none';
              input.style.padding = '2px 8px';
              input.style.borderRadius = '12px';
              input.style.marginRight = '8px';
              input.style.height = tagHeight + 'px';
              input.style.boxSizing = 'border-box';
              input.style.fontSize = '12px';
              input.style.lineHeight = (tagHeight - 4) + 'px';

              // 在标签前插入输入框
              this.parentNode.insertBefore(input, this);

              // 隐藏"tag+"按钮
              this.style.display = 'none';

              input.focus({ preventScroll: true });

              // 标记是否已经处理过添加标签
              let tagAdded = false;

              // --- 新增：阻止键盘事件冒泡 ---
              input.addEventListener('keydown', function(e) {
                  e.stopPropagation();
              });
              // --- 阻止冒泡结束 ---

              // 按下回车键时添加标签
              input.addEventListener('keydown', function(e) {
                  if (e.key === 'Enter') {
                      e.preventDefault();
                      if (tagAdded) return;

                      if (this.value.trim() !== '') {
                          // 创建新标签
                          const newTag = document.createElement('span');
                          newTag.textContent = this.value.trim();
                          newTag.className = 'tag';
                          this.parentNode.insertBefore(newTag, this);

                          const tag_add = e.target.value.trim();
                          if (tag_add) {
                              // 去除新标签中的首尾空格
                              const cleanNewTag = tag_add.trim();
                              console.log("新标签修改完成:", cleanNewTag);
                              chrome.runtime.sendMessage({ action: "addTag", word: originalWord, tag: cleanNewTag }, (response) => {
                                  if (response && response.error) {
                                      console.error("添加标签失败:", response.error);
                                  } else {
                                      console.log("添加标签成功");
                                      refreshTooltipTags(word, sentence);
                                  }
                              });
                              e.target.value = "";
                          }

                          // 为新标签添加点击编辑功能
                          addTagClickEvent(newTag);
                      }
                      // 移除输入框
                      this.parentNode.removeChild(this);

                      // 显示"tag+"按钮
                      addTagButton.style.display = '';

                      // 标记已处理
                      tagAdded = true;
                  }
              });

              // 输入框失去焦点时处理
              input.addEventListener('blur', function() {
                  setTimeout(() => {
                      if (tagAdded) return;
                      const newTagValue = this.value.trim(); // 获取输入的新标签值

                      if (newTagValue !== '') {
                          console.log("New tag blur: adding tag:", newTagValue);
                          // --- 添加保存逻辑 ---
                          chrome.runtime.sendMessage({ action: "addTag", word: originalWord, tag: newTagValue }, (response) => {
                              if (response && response.error) {
                                  console.error("添加标签失败 (blur, new):", response.error);
                                  // 即使保存失败，也尝试更新UI，但可以考虑给出提示
                                  // 创建新标签span并添加到UI (这部分逻辑保持不变)
                                  const newTag = document.createElement('span');
                                  newTag.textContent = newTagValue;
                                  newTag.className = 'tag';
                                  if (this.parentNode) { // 检查父节点是否存在
                                      this.parentNode.insertBefore(newTag, this);
                                      addTagClickEvent(newTag); // 为新标签添加点击编辑功能
                                  }
                              } else {
                                  console.log("添加标签成功 (blur, new)");
                                  // 保存成功后刷新标签列表，以确保显示一致
                                  refreshTooltipTags(word, sentence); // 刷新以包含新标签
                              }
                              // 不论保存成功与否，移除输入框并显示按钮
                              if (this.parentNode) {
                                   this.parentNode.removeChild(this);
                              }
                              addTagButton.style.display = '';
                          });
                          // --- 保存逻辑结束 ---

                      } else {
                           // 如果输入为空，直接移除输入框并显示按钮
                           if (this.parentNode) {
                               this.parentNode.removeChild(this);
                           }
                           addTagButton.style.display = '';
                      }

                      // 标记已处理
                      tagAdded = true;
                  }, 0); // 保持0ms延迟
              });
          });

          // 为普通标签添加编辑功能
          tagsListEl.querySelectorAll('.tag').forEach(tag => {
            // 跳过"tag+"按钮，它已经有特殊处理
            if (!tag.textContent.includes('tag+')) {
                addTagClickEvent(tag);
            }
        });


          // 为每个删除图标绑定事件
          tagsListEl.querySelectorAll(".remove-tag").forEach(span => {
              span.addEventListener('mousedown', (e) => {
                e.preventDefault(); // 阻止默认行为，希望能阻止焦点转移和后续的 click 事件

                  e.stopPropagation(); // 阻止事件冒泡
                  // 无论点击的是span还是内部的svg元素，都从当前元素或其父元素获取data-tag属性
                  const target = e.currentTarget; // 使用currentTarget而不是target
                  const tagToRemove = target.getAttribute("data-tag");
                  console.log("删除标签:", tagToRemove);

                  chrome.runtime.sendMessage({
                    action: "removeTag",
                    word: originalWord,
                    tag: tagToRemove
                  }, (response) => {
                    if (response && response.error) {
                      console.error("删除标签失败:", response.error);
                    } else {
                      console.log("删除标签成功");
                      // 重新获取并显示标签列表
                      chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, (updatedResponse) => {
                        if (updatedResponse && updatedResponse.details) {
                          // 过滤掉 null 值
                          const updatedTags = (updatedResponse.details.tags || []).filter(tag => tag !== null);
                          updateTagsDisplay(tagsListEl, updatedTags, word);
                        }
                      });
                    }
                  });
              });
          });
        }



        ///---释义管理


        // 添加释义管理功能
        function initTranslationManagement() {

            checkAndAddDefaultInput();


        }



        function translate_Stauts_SententsToDb(translation, onComplete) {
          if (translation) {
            // 检查单词是否已知
            // 点击翻译后，如果单词是未知单词，则自动更新状态为已知单词
            if (ShouldAutoUpdateStatus) {
              console.log("蓝变黄2");
              updateWordStatus(word, "1", sentence, parent, originalWord, isCustom);
            }



            // 原有的保存翻译逻辑
            chrome.runtime.sendMessage({ action: "addTranslation", word: originalWord, translation: translation }, (response) => {
              if (chrome.runtime.lastError) {
                console.error("发送 addTranslation 消息时发生错误:", chrome.runtime.lastError.message);
                // 即使出错也调用回调
                if (onComplete) onComplete();
                return;
              }
              if (response && response.error) {
                console.error("添加翻译失败:", response.error);
                // 即使失败也调用回调
                if (onComplete) onComplete();
              } else {
                console.log("添加翻译成功（云端同步已完成）");

                 //添加本地缓存
                 addTranslationToLocalCache(word, translation);

                // 刷新 tooltip 内显示的翻译列表
                // refreshTooltipTranslations(word);

                // 当单词翻译添加成功后，再添加该单词的例句以及例句翻译到数据库缓存
                // 这里直接使用传入的 sentence 作为例句

                // 通知单词爆炸系统翻译已更新
                window.postMessage({
                  type: 'WORD_TRANSLATION_UPDATED',
                  word: originalWord
                }, '*');

                // 触发自定义事件，通知已添加翻译（类似 aiTranslationAdded）
                window.dispatchEvent(new CustomEvent('translationAdded', {
                  detail: { word: originalWord, translation: translation }
                }));

                // 云端同步完成后调用回调
                if (onComplete) onComplete();
              }
              // translationInput.value = "";
            });

            //点击的时候触发的自动添加例句 得判断一下是否开启了自动添加例句
            chrome.storage.local.get('autoAddExampleSentences', function(result) {
              if(result.autoAddExampleSentences){
                fetchSentenceTranslation(word, sentence).then(sentTranslation => {

                  let currentUrl =   window.top.location.href
                  console.log("当前url是：",currentUrl);
                  chrome.runtime.sendMessage(

                { action: "addSentence", word: originalWord, sentence: sentence, translation: sentTranslation, url:currentUrl },
                (res) => {
                  if (res && res.error) {
                    console.error("保存例句失败:", res.error);
                  } else {
                    console.log("保存例句成功");
                    // 更新 tooltip 中显示的例句和翻译
                    refreshTooltipSentences(word, sentence);
                  }
                    }
                  );
                });
              }
            });




          }
        }

        // 添加释义输入框
        function addTranslationInput(translationList, number, beforeElement = null,focusIn = true) {
            // 创建输入框容器
            const inputContainer = document.createElement('div');
            inputContainer.className = 'translation-item';

            // --- 修改：创建 textarea 而不是 input ---
            const textarea = document.createElement('textarea');
            textarea.className = 'translation-input'; // 使用相同的类名
            textarea.placeholder = 'Schreiben Sie hier';
            // --- 添加样式以支持换行和自适应高度 ---
            textarea.style.width = '100%';
            textarea.style.minHeight = '16px'; // 设置最小高度为 16px
            textarea.style.height = 'auto'; // 高度自适应
            textarea.style.border = 'none';
            textarea.style.background = '#f0f0f0';
            textarea.style.outline = 'none';
            textarea.style.padding = '2px 8px';
            textarea.style.borderRadius = '4px';
            textarea.style.boxSizing = 'border-box';
            textarea.style.fontSize = '14px'; // 与编辑状态一致
            textarea.style.resize = 'vertical'; // 允许垂直调整大小
            textarea.style.overflow = 'hidden'; // 隐藏初始滚动条
            textarea.style.fontFamily = 'inherit'; // 继承字体
            textarea.style.lineHeight = '1'; // 调整行高以获得更好的可读性
            textarea.style.display = 'block'; // 设置为块级元素以消除底部空白
            // --- 样式添加结束 ---

            // 添加到容器
            inputContainer.appendChild(textarea);

            // 插入到指定位置
            if (beforeElement) {
                translationList.insertBefore(inputContainer, beforeElement);
            } else {
                // 找到AI推荐项（如果有）- 优先找第一个AI推荐
                const aiItem = translationList.querySelector('.ai-recommendation');
                if (aiItem) {
                    // 在AI推荐项前插入
                    translationList.insertBefore(inputContainer, aiItem);
                } else {
                    // 直接添加到列表末尾
                    translationList.appendChild(inputContainer);
                }
            }

            // 聚焦输入框，并自动调整初始高度

            if(focusIn){
            textarea.focus({ preventScroll: true }); // <--- 保持取消自动聚焦
            }

            // 直接设置初始高度为 16px
            textarea.style.height = '16px';
            /*
            setTimeout(() => { // 延迟确保元素已渲染
              if (textarea && textarea.isConnected) {
                textarea.style.height = 'auto';
                textarea.style.height = (textarea.scrollHeight) + 'px';
              }
            }, 0);
            */

            // --- 新增：输入时自动调整高度 ---
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
            // --- 高度调整结束 ---

            // --- 移除: 处理输入框回车事件 (keydown) ---
            // input.addEventListener('keydown', function(e) {
            //     if (e.key === 'Enter') {
            //         e.preventDefault();

            //         if (this.value.trim() !== '') {
            //             // 创建新的释义项
            //             createTranslationItem(translationList, inputContainer, this.value.trim());
            //             translate_Stauts_SententsToDb(this.value.trim());
            //         } else {
            //             // 如果输入为空，检查是否还有其他释义
            //             const items = translationList.querySelectorAll('.translation-item:not(.ai-recommendation):not(.ai-recommendation-2)');
            //             if (items.length > 1 || (items.length === 1 && items[0] !== inputContainer)) {
            //                 // 如果有其他释义，移除输入框
            //                 translationList.removeChild(inputContainer);
            //             }
            //             // 如果只有这一个输入框，保留它
            //         }
            //     }
            // });
            // --- 回车事件移除结束 ---
            // --- 新增：阻止键盘事件冒泡 ---
            textarea.addEventListener('keydown', function(e) {
              e.stopPropagation();
          });
          // --
            // 处理输入框失焦事件 (保持不变)
            textarea.addEventListener('blur', function() {
                setTimeout(() => {
                    if (this.value.trim() === '') {
                        // 如果输入为空，检查是否还有其他释义
                        const items = translationList.querySelectorAll('.translation-item:not(.ai-recommendation):not(.ai-recommendation-2)');
                        if (items.length > 1 || (items.length === 1 && items[0] !== inputContainer)) {
                            // 如果有其他释义，移除输入框
                            if (inputContainer.parentNode) {
                                inputContainer.parentNode.removeChild(inputContainer);
                            }
                        }
                        // 如果只有这一个输入框，保留它
                    } else if (inputContainer.parentNode) {
                        // 如果有输入内容，转换为正式释义
                        createTranslationItem(translationList, inputContainer, this.value.trim());
                        translate_Stauts_SententsToDb(this.value.trim());
                    }
                }, 100);
            });
        }




        // 创建释义项 数据库导入到这里来把。
        //参数解释：
        //translationList: 释义列表容器
        //inputContainer: 输入框容器
        //text: 释义文本
        function createTranslationItem(translationList, inputContainer, text) {
            // 创建新的释义项
            const newTranslationItem = document.createElement('div');
            newTranslationItem.className = 'translation-item';

            // 创建释义文本
            const translationText = document.createElement('span');
            translationText.textContent = text;
            translationText.className = 'translation-text'; // 添加类名，便于选择

            // 添加强制换行样式
            translationText.style.wordBreak = 'break-all'; // 允许在任何字符处换行
            translationText.style.overflowWrap = 'break-word'; // 确保长单词会换行
            translationText.style.whiteSpace = 'pre-wrap'; // 保留空格和换行，但允许自动换行
            // translationText.style.paddingtop = '4px'; /* 微调顶部内边距 */
            // translationText.style.marginTop = '9px';





            // 创建操作按钮
            //解释：actions是div标签，className是translation-actions，是释义项的样式类名
            const actions = document.createElement('div');
            actions.className = 'translation-actions';

            const deleteBtn = document.createElement('button');
            //解释：deleteBtn是button标签，className是translation-action-btn delete-translation，是删除按钮的样式类名
            deleteBtn.className = 'translation-action-btn delete-translation';
            deleteBtn.innerHTML = `<svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"></path>
</svg>`;

            const addBtn = document.createElement('button');
            //解释：addBtn是button标签，className是translation-action-btn add-translation，是添加按钮的样式类名
            addBtn.className = 'translation-action-btn add-translation';
            addBtn.innerHTML = `<svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path>
</svg>`;

            actions.appendChild(deleteBtn);
            actions.appendChild(addBtn);

            // 组装新的释义项
            newTranslationItem.appendChild(translationText);
            newTranslationItem.appendChild(actions);

            // 替换输入框容器
            if (inputContainer.parentNode) {
                inputContainer.parentNode.replaceChild(newTranslationItem, inputContainer);
            }

            // 为整个翻译项添加点击编辑功能（不包括按钮区域）
            addTranslationItemClickEvent(newTranslationItem, translationText);

            // 为新添加的按钮绑定事件
            deleteBtn.addEventListener('mousedown', function(e) {
              e.preventDefault();
              e.stopPropagation();

                const item = this.closest('.translation-item');
                if (item && item.parentNode) {
                    // 仅获取释义文本元素的内容，而不是整个item的文本内容
                    const translationTextElement = item.querySelector('span:not(.number-badge)');
                    const translationText = translationTextElement ? translationTextElement.textContent.trim() : '';

                    item.parentNode.removeChild(item);

                    console.log("删除的释义是：", translationText);
                    // 删除数据库中的释义，只传递翻译文本部分
                    chrome.runtime.sendMessage({ action: "removeTranslation", word: originalWord, translation: translationText }, (response) => {
                      if (response && response.error) {
                        console.error("删除释义失败:", response.error);
                      } else {
                        console.log("删除释义成功");

                        // 通知单词爆炸系统翻译已更新
                        window.postMessage({
                          type: 'WORD_TRANSLATION_UPDATED',
                          word: originalWord
                        }, '*');
                      }
                    });

                    //有时候有些数据库里翻译可能没trim，所以需要需要重新删除一次
                    chrome.runtime.sendMessage({ action: "removeTranslation", word: originalWord, translation: translationTextElement.textContent }, (response) => {
                      if (response && response.error) {
                        console.error("删除释义失败:", response.error);
                      } else {
                        console.log("删除释义成功");
                      }
                    });

                    //删除本地缓存里的当前word的释义
                    //添加删除本地
                    if (highlightManager && highlightManager.wordDetailsFromDB) {
                      // console.log("本地缓存存在");
                      // 获取当前单词的本地缓存
                      let existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()];
                      // console.log("本地缓存里的当前wor详情", existingDetails);
                      if (existingDetails && existingDetails.translations) {
                        // 使用 findIndex 查找 sentence 属性匹配的对象的索引
                        const sentenceIndex = existingDetails.translations
                        // console.log("本地缓存里的当前word的释义", sentenceIndex);
                        // console.log("要删除的：", translationText);
                        for (translation of sentenceIndex) {
                          // console.log("for循环：本地缓存里的当前word的释义", translation);
                          // console.log("for循环：要删除的：", translationText);


                          if (translation === translationText) {

                            // console.log("删除本地缓存里的当前word的释义", translation);
                            // 删除当前释义
                            existingDetails.translations.splice(existingDetails.translations.indexOf(translation), 1);
                            existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()];
                            // console.log("删除之后", existingDetails);


                          }
                        }


                      }
                    }



                    // 检查是否还有其他非AI推荐的释义
                    const remainingItems = translationList.querySelectorAll('.translation-item:not(.ai-recommendation):not(.ai-recommendation-2)');
                    if (remainingItems.length === 0) {
                        // 如果没有释义了，添加一个输入框
                        addTranslationInput(translationList, 1);
                    } else {

                    }

                }
            });

            addBtn.addEventListener('mousedown', function(e) {

               e.preventDefault();
    e.stopPropagation();
                const item = this.closest('.translation-item');
                if (item && item.parentNode) {
                    const list = item.parentNode;
                    const items = list.querySelectorAll('.translation-item:not(.ai-recommendation):not(.ai-recommendation-2)');
                    const newNumber = items.length + 1;

                    // 在当前释义之后添加输入框
                    if (item.nextSibling) {
                        addTranslationInput(list, newNumber, item.nextSibling);
                    } else {
                        addTranslationInput(list, newNumber);
                    }
                }
            });

        }

        // 添加翻译点击编辑功能
        function addTranslationItemClickEvent(translationItem, translationText) {
          translationItem.addEventListener('mousedown', function(e) {

            // e.preventDefault();
            e.stopPropagation();


              // 如果点击的是按钮区域，不触发编辑
              if (e.target.closest('.translation-actions') ||
                  e.target.closest('.translation-action-btn')) {
                  return;
              }

              // 如果点击的是textarea，不再触发新的编辑
              if (e.target.tagName === 'TEXTAREA') {
                  return;
              }

              // 检查是否已经有一个激活的textarea
              if (this.querySelector('textarea.translation-input')) {
                  return; // 已经在编辑状态，不再创建新的textarea
              }

              const translationTextContent = translationText.textContent.trim();

              // 创建输入框（使用textarea代替input以支持换行）
              const textarea = document.createElement('textarea');
              textarea.value = translationTextContent;
              textarea.className = 'translation-input';
              textarea.style.width = '100%';
              textarea.style.minHeight = '24px'; // 设置最小高度
              textarea.style.height = 'auto'; // 高度自适应
              textarea.style.border = 'none';
              textarea.style.background = '#f0f0f0';
              textarea.style.outline = 'none';
              textarea.style.padding = '2px 8px';
              textarea.style.borderRadius = '4px';
              textarea.style.boxSizing = 'border-box';
              textarea.style.fontSize = '14px';
              textarea.style.resize = 'vertical'; // 允许垂直调整大小
              textarea.style.overflow = 'hidden'; // 隐藏滚动条
              textarea.style.fontFamily = 'inherit'; // 继承字体

              // 替换翻译文本为输入框
              translationText.style.display = 'none';
              translationItem.insertBefore(textarea, translationText.nextSibling);

              // 自动调整高度以适应内容
              textarea.style.height = 'auto';
              textarea.style.height = (textarea.scrollHeight) + 'px';

              // 标记是否已经处理过
              let processed = false;

              // --- 修改：延迟添加事件监听器并确保获得焦点 ---
              setTimeout(() => {
                  if (!textarea.isConnected) return; // 确保 textarea 还在 DOM 中

                  // 确保输入框获得焦点（在延迟后再次尝试聚焦）
                  textarea.focus({ preventScroll: true });
                  
                  // 设置翻译输入框活动状态
                  isTranslationInputActive = true;

                  // --- 新增：阻止键盘事件冒泡 - 增强版 ---
                  textarea.addEventListener('keydown', function(e) {
                      // 阻止事件冒泡到父元素，防止被全局键盘处理器拦截
                      e.stopPropagation();
                      e.stopImmediatePropagation(); // 也阻止同级监听器
                      
                      // 对于一些特殊按键，确保它们的默认行为能正常工作
                      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft' || 
                          e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                          e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown' ||
                          (e.key.length === 1) || // 普通字符输入
                          (e.shiftKey && e.key === 'Enter')) { // Shift+Enter换行
                          // 这些按键应该保持默认行为，不调用preventDefault
                          console.log("允许textarea内的按键默认行为:", e.key);
                      }
                  });
                  
                  // 也为其他键盘事件添加阻止冒泡
                  textarea.addEventListener('keyup', function(e) {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  });
                  
                  textarea.addEventListener('keypress', function(e) {
                      e.stopPropagation();
                      e.stopImmediatePropagation();
                  });
                  // --- 阻止冒泡结束 ---

                  // 按下回车键时处理
                  textarea.addEventListener('keydown', function(e) {
                      // 自动调整高度
                      this.style.height = 'auto';
                      this.style.height = (this.scrollHeight) + 'px';

                      if (e.key === 'Enter' && !e.shiftKey) { // 只有按下回车且没有按下Shift才提交
                          e.preventDefault();
                          if (processed) return;

                          const newTranslation = this.value.trim();

                                                        // 如果新旧翻译一样，不操作
                          if (translationTextContent === newTranslation) {
                              translationText.style.display = '';
                              this.remove();
                              isTranslationInputActive = false; // 重置输入框活动状态
                              processed = true;
                              return;
                          }

                          // 删除旧翻译
                          if (translationTextContent) {
                              console.log("删除旧翻译:", translationTextContent);
                              chrome.runtime.sendMessage({
                                  action: "removeTranslation",
                                  word: originalWord,
                                  translation: translationTextContent
                              }, (response) => {
                                  if (response && response.error) {
                                      console.error("删除翻译失败:", response.error);
                                  } else {
                                      console.log("删除翻译成功");

                                      // 添加新翻译
                                      if (newTranslation) {
                                          console.log("添加新翻译:", newTranslation);
                                          chrome.runtime.sendMessage({
                                              action: "addTranslation",
                                              word: originalWord,
                                              translation: newTranslation
                                          }, (response) => {
                                              if (response && response.error) {
                                                  console.error("添加翻译失败:", response.error);
                                              } else {
                                                  console.log("添加翻译成功，不用刷新啦，刷新会丢失ai建议");

                                                  // 直接更新文本内容，而不是刷新整个列表
                                                  translationText.textContent = newTranslation;
                                                  translationText.style.display = '';
                                                  textarea.remove();
                                                  isTranslationInputActive = false; // 重置输入框活动状态

                                                  // 通知单词爆炸系统翻译已更新
                                                  window.postMessage({
                                                    type: 'WORD_TRANSLATION_UPDATED',
                                                    word: originalWord
                                                  }, '*');
                                              }
                                          });
                                      } else {
                                          // 如果新翻译为空，也要恢复显示并移除textarea
                                          translationText.style.display = '';
                                          textarea.remove();
                                          isTranslationInputActive = false; // 重置输入框活动状态
                                      }
                                  }
                              });
                          } else if (newTranslation) {
                               // 如果旧翻译为空，直接添加新翻译
                               console.log("添加新翻译 (无旧翻译):", newTranslation);
                               chrome.runtime.sendMessage({
                                   action: "addTranslation",
                                   word: originalWord,
                                   translation: newTranslation
                               }, (response) => {
                                   if (response && response.error) {
                                       console.error("添加翻译失败:", response.error);
                                   } else {
                                       console.log("添加翻译成功，不用刷新啦，刷新会丢失ai建议");
                                       translationText.textContent = newTranslation;
                                       translationText.style.display = '';
                                       textarea.remove();
                                       isTranslationInputActive = false; // 重置输入框活动状态
                                   }
                               });
                          } else {
                              // 如果新旧都为空，恢复显示并移除
                              translationText.style.display = '';
                              textarea.remove();
                              isTranslationInputActive = false; // 重置输入框活动状态
                          }

                          processed = true;
                      }
                  });

                  // 输入框内容变化时自动调整高度
                  textarea.addEventListener('input', function() {
                      this.style.height = 'auto';
                      this.style.height = (this.scrollHeight) + 'px';
                  });

                  // 输入框失去焦点时处理
                  textarea.addEventListener('blur', function() {
                      // 当失去焦点时重置状态标志
                      isTranslationInputActive = false;
                      setTimeout(() => {
                          if (processed) return;

                          const newTranslation = this.value.trim();

                          // 如果新旧翻译一样，恢复原文本
                          if (translationTextContent === newTranslation) {
                              translationText.style.display = '';
                              if (this.parentNode) {
                                  this.remove();
                                  isTranslationInputActive = false; // 重置输入框活动状态
                              }
                              processed = true;
                              return;
                          }

                          // 删除旧翻译并添加新翻译 (仅当新旧都存在且不同时)
                          if (translationTextContent && newTranslation) {
                              chrome.runtime.sendMessage({
                                  action: "removeTranslation",
                                  word: originalWord,
                                  translation: translationTextContent
                              }, (response) => {
                                  if (response && response.error) {
                                      console.error("删除翻译失败:", response.error);
                                      // 即使删除失败也尝试恢复原状
                                      translationText.style.display = '';
                                      if (textarea.parentNode) {
                                          textarea.remove();
                                          isTranslationInputActive = false; // 重置输入框活动状态
                                      }
                                  } else {
                                      console.log("删除翻译成功");

                                      // 添加新翻译
                                      chrome.runtime.sendMessage({
                                          action: "addTranslation",
                                          word: originalWord,
                                          translation: newTranslation
                                      }, (response) => {
                                          if (response && response.error) {
                                              console.error("添加翻译失败:", response.error);
                                              // 添加失败，恢复旧文本
                                              translationText.style.display = '';
                                              if (textarea.parentNode) {
                                                  textarea.remove();
                                              }
                                          } else {
                                              console.log("添加翻译成功，不用刷新啦，刷新会丢失ai建议");

                                              // 直接更新文本内容，而不是刷新整个列表
                                              translationText.textContent = newTranslation;
                                              translationText.style.display = '';
                                              if (textarea.parentNode) {
                                                  textarea.remove();
                                                  isTranslationInputActive = false; // 重置输入框活动状态
                                              }

                                              // 通知单词爆炸系统翻译已更新
                                              window.postMessage({
                                                type: 'WORD_TRANSLATION_UPDATED',
                                                word: originalWord
                                              }, '*');
                                          }
                                      });
                                  }
                              });
                          } else if (newTranslation) {
                              // 如果旧翻译为空，直接添加新翻译
                              console.log("添加新翻译 (无旧翻译, blur):", newTranslation);
                               chrome.runtime.sendMessage({
                                   action: "addTranslation",
                                   word: originalWord,
                                   translation: newTranslation
                               }, (response) => {
                                   if (response && response.error) {
                                       console.error("添加翻译失败:", response.error);
                                       // 添加失败，恢复显示（内容为空）并移除
                                       translationText.style.display = '';
                                       if (textarea.parentNode) {
                                          textarea.remove();
                                          isTranslationInputActive = false; // 重置输入框活动状态
                                       }
                                   } else {
                                       console.log("添加翻译成功，不用刷新啦，刷新会丢失ai建议");
                                       translationText.textContent = newTranslation;
                                       translationText.style.display = '';
                                       if (textarea.parentNode) {
                                          textarea.remove();
                                          isTranslationInputActive = false; // 重置输入框活动状态
                                       }

                                       // 通知单词爆炸系统翻译已更新
                                       window.postMessage({
                                         type: 'WORD_TRANSLATION_UPDATED',
                                         word: originalWord
                                       }, '*');
                                   }
                               });
                          } else if (translationTextContent && !newTranslation) {
                               // 如果旧翻译存在，新翻译为空，则删除旧翻译
                               console.log("删除旧翻译 (新翻译为空, blur):", translationTextContent);
                               chrome.runtime.sendMessage({
                                   action: "removeTranslation",
                                   word: originalWord,
                                   translation: translationTextContent
                               }, (response) => {
                                   if (response && response.error) {
                                       console.error("删除翻译失败:", response.error);
                                       // 即使删除失败也恢复原状
                                       translationText.style.display = '';
                                       if (textarea.parentNode) {
                                          textarea.remove();
                                          isTranslationInputActive = false; // 重置输入框活动状态
                                       }
                                   } else {
                                      console.log("删除翻译成功");
                                      // 删除成功后，显示空文本并移除输入框
                                      translationText.textContent = ''; // 清空显示
                                      translationText.style.display = '';
                                      if (textarea.parentNode) {
                                          textarea.remove();
                                          isTranslationInputActive = false; // 重置输入框活动状态
                                      }
                                       // 检查是否需要添加新的输入框
                                      const list = translationItem.closest('.translation-list');
                                      if (list) {
                                          const remainingItems = list.querySelectorAll('.translation-item:not(.ai-recommendation):not(.ai-recommendation-2)');
                                          if (remainingItems.length === 0) {
                                              addTranslationInput(list, 1);
                                          }
                                      }

                                      // 通知单词爆炸系统翻译已更新
                                      window.postMessage({
                                        type: 'WORD_TRANSLATION_UPDATED',
                                        word: originalWord
                                      }, '*');
                                   }
                               });
                          } else {
                              // 新旧都为空，或者其他未处理情况，恢复原文本
                              translationText.style.display = '';
                              if (this.parentNode) {
                                  this.remove();
                                  isTranslationInputActive = false; // 重置输入框活动状态
                              }
                          }

                          processed = true;
                      }, 100); // 保持 blur 的 setTimeout
                  });

              }, 50); // 50ms 延迟添加监听器
              // --- 修改结束 ---


              // --- 移除原来立即添加监听器的代码 ---
              /*
              // --- 新增：阻止键盘事件冒泡 ---
              textarea.addEventListener('keydown', function(e) {
                  e.stopPropagation();
              });
              // --- 阻止冒泡结束 ---

              // 按下回车键时处理
              textarea.addEventListener('keydown', function(e) {
                  // ... (原来的 keydown 逻辑) ...
              });

              // 输入框内容变化时自动调整高度
              textarea.addEventListener('input', function() {
                  // ... (原来的 input 逻辑) ...
              });

              // 输入框失去焦点时处理
              textarea.addEventListener('blur', function() {
                  // ... (原来的 blur 逻辑) ...
              });
              */
              // --- 移除结束 ---
          });
        }

        // 防止重复刷新的变量
        if (!window.refreshInProgress) {
          window.refreshInProgress = new Set();
        }

        // 检查两个AI翻译是否都完成，如果是则触发刷新
        function checkAndRefreshWhenBothAIComplete() {
          console.log("检查AI翻译完成状态:", aiTranslationStatus);

          // 检查AI翻译1是否完成
          if (!aiTranslationStatus.ai1.completed) {
            console.log("AI翻译1尚未完成，等待中...");
            return;
          }

          // 检查AI翻译2是否完成
          if (!aiTranslationStatus.ai2.completed) {
            console.log("AI翻译2尚未完成，等待中...");
            return;
          }

          // 检查是否需要刷新（即AI翻译1是否被添加到数据库）
          if (!aiTranslationStatus.ai1.shouldRefresh) {
            console.log("AI翻译1未添加到数据库，无需刷新");
            return;
          }

          // 两个AI翻译都完成了，且AI翻译1已添加到数据库，等待数据库更新完成后再刷新
          console.log("两个AI翻译都已完成，等待数据库更新后刷新...");

          // 监听aiTranslationAdded事件，在数据库更新完成后刷新
          const handleTranslationAdded = (event) => {
            if (event.detail.word.toLowerCase() === word.toLowerCase()) {
              console.log("数据库更新完成，开始刷新");
              window.removeEventListener('aiTranslationAdded', handleTranslationAdded);
              // 使用保存的AI翻译结果进行刷新
              // 由于AI翻译1已经添加到数据库，所以排除它，只保留AI翻译2
              refreshTooltipTranslationsWithAIResults(word);
            }
          };
          window.addEventListener('aiTranslationAdded', handleTranslationAdded);

          // 设置超时，如果5秒内没有收到事件，也进行刷新
          setTimeout(() => {
            window.removeEventListener('aiTranslationAdded', handleTranslationAdded);
            console.log("超时，强制刷新");
            refreshTooltipTranslationsWithAIResults(word);
          }, 5000);
        }

        // 使用AI翻译结果刷新tooltip
        function refreshTooltipTranslationsWithAIResults(word) {
          // 验证当前弹窗是否是这个单词的弹窗
          if (currentTooltipWord && currentTooltipWord.toLowerCase() !== word.toLowerCase()) {
            console.log(`弹窗单词不匹配，跳过刷新。当前弹窗: ${currentTooltipWord}, 请求刷新: ${word}`);
            return;
          }

          // 防止重复刷新同一个单词
          const refreshKey = word.toLowerCase();
          if (window.refreshInProgress.has(refreshKey)) {
            console.log(`刷新翻译已在进行中，跳过重复请求: ${word}`);
            return;
          }

          window.refreshInProgress.add(refreshKey);

          chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, (response) => {
            // 添加null检查，确保tooltipEl存在且tooltip未被销毁
            if (!tooltipEl || tooltipBeingDestroyed) {
              console.error('tooltipEl 为 null 或tooltip正在被销毁，无法刷新翻译');
              window.refreshInProgress.delete(refreshKey);
              return;
            }

            if (response && response.details) {
              const translations = response.details.translations || [];

              // 获取展开状态下的翻译列表容器
              const expandedList = tooltipEl.querySelector('.scrollable-content .translation-list');

              if (!expandedList) {
                window.refreshInProgress.delete(refreshKey);
                return;
              }

              // 清空现有内容
              expandedList.innerHTML = '';

              // 如果有翻译，按序号添加到列表中
              if (translations.length > 0) {
                translations.forEach((translation) => {
                  // 为展开状态创建翻译项
                  const translationItem = document.createElement('div');
                  translationItem.className = 'translation-item';

                  // 将翻译项直接添加到展开列表中
                  expandedList.appendChild(translationItem);

                  // 使用createTranslationItem添加翻译内容
                  createTranslationItem(expandedList, translationItem, translation);
                });

                // 为两个列表中的按钮重新绑定事件
                initTranslationManagement();
              } else {
                // 如果没有翻译，添加默认输入框
                addTranslationInput(expandedList, 1, null, false);
              }

              // 添加AI推荐项，使用保存的结果
              // AI翻译2使用保存的结果
              if (aiTranslationStatus.ai2.result && aiTranslationStatus.ai2.result !== "(✿◠‿◠)") {
                createAIRecommendation2(expandedList, aiTranslationStatus.ai2.result);
              }

            } else {
              // 如果没有获取到详情，添加默认输入框
              const expandedList = tooltipEl.querySelector('.scrollable-content .translation-list');

              if (expandedList) addTranslationInput(expandedList, 1);
            }

            // 清理刷新进行中的标记
            setTimeout(() => {
              window.refreshInProgress.delete(refreshKey);
            }, 100); // 短暂延迟以避免快速连续调用
          });
        }

        // 刷新 tooltip 内的翻译列表，从单词详情中读出翻译数组
        // excludeAI: 'ai1' 表示排除第一个AI项, 'ai2' 表示排除第二个AI项, null 表示保留所有
        function refreshTooltipTranslations(word, freshAI=true, excludeAI=null) {
          // 验证当前弹窗是否是这个单词的弹窗
          if (currentTooltipWord && currentTooltipWord.toLowerCase() !== word.toLowerCase()) {
            console.log(`弹窗单词不匹配，跳过刷新。当前弹窗: ${currentTooltipWord}, 请求刷新: ${word}`);
            return;
          }

          // 防止重复刷新同一个单词
          const refreshKey = word.toLowerCase();
          if (window.refreshInProgress.has(refreshKey)) {
            console.log(`刷新翻译已在进行中，跳过重复请求: ${word}`);
            return;
          }

          window.refreshInProgress.add(refreshKey);

          if (ShouldAutoUpdateStatus && freshAI) {
            console.log("蓝变黄2");
            updateWordStatus(word, "1", sentence, parent, originalWord, isCustom);
          }

          // 在清空前保存当前AI翻译的内容
          let savedAIText1 = null;
          let savedAIText2 = null;
          if (!freshAI && tooltipEl) {
            const aiText1Element = tooltipEl.querySelector('.ai-translation-text');
            const aiText2Element = tooltipEl.querySelector('.ai-translation-text-2');
            // 只保存未被排除的AI项
            if (aiText1Element && excludeAI !== 'ai1') {
              savedAIText1 = aiText1Element.textContent;
            }
            if (aiText2Element && excludeAI !== 'ai2') {
              savedAIText2 = aiText2Element.textContent;
            }
          }

          chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, (response) => {
            // 添加null检查，确保tooltipEl存在且tooltip未被销毁
            // console.log("getWordDetails 响应:", response);  // ← 添加这一
           
            if (!tooltipEl || tooltipBeingDestroyed) {
              console.error('tooltipEl 为 null 或tooltip正在被销毁，无法刷新翻译');
              return;
            }

            if (response && response.details) {
              const translations = response.details.translations || [];

              // 获取展开和收缩状态下的翻译列表容器
              const expandedList = tooltipEl.querySelector('.scrollable-content .translation-list');

              if (!expandedList ) return;

              // 清空现有内容
              expandedList.innerHTML = '';


              // 如果有翻译，按序号添加到列表中
              if (translations.length > 0) {
                translations.forEach((translation, index) => {

                  // 为展开状态创建翻译项
                  const translationItem = document.createElement('div');
                  translationItem.className = 'translation-item';

                  // 将翻译项直接添加到展开列表中
                  expandedList.appendChild(translationItem);

                  //  把数据库，然后给创建释义项
                  // 使用createTranslationItem添加翻译内容
                  createTranslationItem(expandedList, translationItem, translation);
                });


                // 为两个列表中的按钮重新绑定事件
                initTranslationManagement();
              } else {
                // 如果没有翻译，添加默认输入框
                addTranslationInput(expandedList, 1,null,false);

              }


              // 再添加AI推荐项
              if(freshAI){
                createAIRecommendation(expandedList);
                createAIRecommendation2(expandedList); // 添加第二个AI推荐
               } else {
                // 如果不是全新刷新，使用保存的AI文本内容重新创建AI项
                if (savedAIText1 !== null) {
                  createAIRecommendation(expandedList, savedAIText1);
                }
                if (savedAIText2 !== null) {
                  createAIRecommendation2(expandedList, savedAIText2);
                }
               }


            } else {
              // 如果没有获取到详情，添加默认输入框
              const expandedList = tooltipEl.querySelector('.scrollable-content .translation-list');

              if (expandedList) addTranslationInput(expandedList, 1);

            }

            // 清理刷新进行中的标记
            setTimeout(() => {
              window.refreshInProgress.delete(refreshKey);
            }, 100); // 短暂延迟以避免快速连续调用
          });
        }



        // 检查并添加默认输入框
        function checkAndAddDefaultInput() {
            const translationLists = document.querySelectorAll('.translation-list');

            translationLists.forEach(list => {
                // 检查是否有非AI推荐的释义
                const items = list.querySelectorAll('.translation-item:not(.ai-recommendation):not(.ai-recommendation-2)');
                if (items.length === 0) {
                    // 如果没有释义，添加一个输入框
                    addTranslationInput(list, 1);
                }
            });
        }





        //---AI释义---
        // 创建新的AI推荐释义 ， 添加到列表
        function createAIRecommendation(translationList, savedText = null) {

            // 创建AI推荐释义容器
            const aiItem = document.createElement('div');
            aiItem.className = 'translation-item ai-recommendation';
            // 添加样式使整个条目可点击
            aiItem.style.cursor = 'pointer';

            // 创建AI徽章
            const aiBadge = document.createElement('span');
            aiBadge.className = 'ai-badge';
            aiBadge.innerHTML = `
                <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"></path>
                </svg>
            `;

            // 获取AI推荐释义元素
            const aiText = savedText !== null ? createAITextElement(savedText) : getNewAIRecommendation();


            // 创建操作按钮
            const actions = document.createElement('div');
            actions.className = 'translation-actions';

            const addBtn = document.createElement('button');
            addBtn.className = 'translation-action-btn add-ai-translation';
            addBtn.innerHTML = `
            <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path>
</svg>
            `;





            actions.appendChild(addBtn);

            // 组装AI推荐释义
            aiItem.appendChild(aiBadge);
            aiItem.appendChild(aiText);
            aiItem.appendChild(actions);

            // 添加到列表末尾
            translationList.appendChild(aiItem);

            // 为整个AI推荐条目添加点击事件
            aiItem.addEventListener('mousedown', function(e) {
              // 如果点击的是加号按钮或其子元素，不执行此处的点击事件，让加号按钮自己的事件处理
              if (e.target === addBtn || addBtn.contains(e.target)) {
                return;
              }

              e.preventDefault();
              e.stopPropagation();

              // 显示loading状态
              const originalText = aiText.textContent.trim();
              aiText.textContent = '同步中...';
              aiText.style.opacity = '0.6';

              // 监听翻译添加完成事件，等待数据库更新完成后再刷新
              const handleTranslationAdded = (event) => {
                if (event.detail.word.toLowerCase() === word.toLowerCase()) {
                  console.log("翻译添加完成（云端同步已完成），开始刷新");
                  window.removeEventListener('translationAdded', handleTranslationAdded);
                  refreshTooltipTranslations(word, false, 'ai1'); // 排除第一个AI项
                }
              };
              window.addEventListener('translationAdded', handleTranslationAdded);

              // 设置超时，如果5秒内没有收到事件，也进行刷新
              setTimeout(() => {
                window.removeEventListener('translationAdded', handleTranslationAdded);
                console.log("超时，强制刷新");
                refreshTooltipTranslations(word, false, 'ai1');
              }, 5000);

              // 保存翻译（会触发 translationAdded 事件）
              translate_Stauts_SententsToDb(originalText);
            });

            // 为添加按钮绑定事件（保持原有功能）
            addBtn.addEventListener('mousedown', function(e) {
              e.preventDefault();
              e.stopPropagation();

              // 显示loading状态
              const originalText = aiText.textContent.trim();
              aiText.textContent = '同步中...';
              aiText.style.opacity = '0.6';

              // 监听翻译添加完成事件，等待数据库更新完成后再刷新
              const handleTranslationAdded = (event) => {
                if (event.detail.word.toLowerCase() === word.toLowerCase()) {
                  console.log("翻译添加完成（云端同步已完成），开始刷新");
                  window.removeEventListener('translationAdded', handleTranslationAdded);
                  refreshTooltipTranslations(word, false, 'ai1'); // 排除第一个AI项
                }
              };
              window.addEventListener('translationAdded', handleTranslationAdded);

              // 设置超时，如果5秒内没有收到事件，也进行刷新
              setTimeout(() => {
                window.removeEventListener('translationAdded', handleTranslationAdded);
                console.log("超时，强制刷新");
                refreshTooltipTranslations(word, false, 'ai1');
              }, 5000);

              // 保存翻译（会触发 translationAdded 事件）
              translate_Stauts_SententsToDb(originalText);
            });
        }

        // 创建带有保存文本的AI文本元素（用于刷新时保留内容）
        function createAITextElement(savedText) {
            const aiTextElement = document.createElement('span');
            aiTextElement.textContent = savedText;
            aiTextElement.className = "ai-translation-text";
            return aiTextElement;
        }

        // 创建带有保存文本的第二个AI文本元素（用于刷新时保留内容）
        function createAITextElement2(savedText) {
            const aiTextElement = document.createElement('span');
            aiTextElement.textContent = savedText;
            aiTextElement.className = "ai-translation-text-2";
            return aiTextElement;
        }

        // 获取新的AI推荐释义（模拟实现）
        function getNewAIRecommendation() {
            // 先创建元素，无论如何都会返回这个元素
            const aiTextElement = document.createElement('span');
            aiTextElement.textContent = "Hmm...";
            aiTextElement.className = "ai-translation-text";

            // 异步获取设置并更新元素内容
            chrome.storage.local.get('autoRequestAITranslations', function(result) {
                if(result.autoRequestAITranslations) {
                    // 异步获取AI释义
                    fetchAIWordTranslation(word, sentence).then(translation => {
                        console.log("AI释义加载完成", translation);
                        // 更新文本内容
                        aiTextElement.textContent = translation;

                        // 标记AI翻译1完成
                        aiTranslationStatus.ai1.completed = true;
                        aiTranslationStatus.ai1.result = translation;

                        //自动添加ai在fetchAIWordTranslation中，这里仅仅刷新而已
                        chrome.storage.local.get(['autoAddAITranslations', 'autoAddAITranslationsFromUnknown', 'autoRequestAITranslations2'], function(settings) {
                          console.log("自动添加AI释义状态已更新:", settings.autoAddAITranslations);

                          let shouldRefresh = false;

                          if(settings.autoAddAITranslations){
                            shouldRefresh = true;
                          }else{
                            console.log("自动添加AI释义状态已更新:", ShouldAutoUpdateStatus);
                            if( getTranslationCount(word) === 0){
                              if(settings.autoAddAITranslationsFromUnknown){
                                shouldRefresh = true;
                              }
                            }
                          }

                          // 设置shouldRefresh标志
                          aiTranslationStatus.ai1.shouldRefresh = shouldRefresh;

                          // 如果需要刷新，检查是否需要等待AI翻译2
                          if(shouldRefresh) {
                            // 检查AI翻译2是否启用
                            if(settings.autoRequestAITranslations2) {
                              // AI翻译2已启用，等待它完成
                              console.log("AI翻译1完成，等待AI翻译2完成...");
                              checkAndRefreshWhenBothAIComplete();
                            } else {
                              // AI翻译2未启用，等待数据库更新完成后再刷新
                              console.log("AI翻译2未启用，等待数据库更新完成...");
                              // 监听aiTranslationAdded事件，在数据库更新完成后刷新
                              const handleTranslationAdded = (event) => {
                                if (event.detail.word.toLowerCase() === word.toLowerCase()) {
                                  console.log("数据库更新完成，开始刷新");
                                  window.removeEventListener('aiTranslationAdded', handleTranslationAdded);
                                  refreshTooltipTranslations(word, false, 'ai1');
                                }
                              };
                              window.addEventListener('aiTranslationAdded', handleTranslationAdded);

                              // 设置超时，如果5秒内没有收到事件，也进行刷新
                              setTimeout(() => {
                                window.removeEventListener('aiTranslationAdded', handleTranslationAdded);
                                console.log("超时，强制刷新");
                                refreshTooltipTranslations(word, false, 'ai1');
                              }, 5000);
                            }
                          }
                        });

                    }).catch(error => {
                        console.error("获取AI释义失败:", error);
                        aiTextElement.textContent = "AI 释义加载失败";
                        // 标记AI翻译1完成（即使失败）
                        aiTranslationStatus.ai1.completed = true;
                        aiTranslationStatus.ai1.result = "AI 释义加载失败";
                    });
                } else {
                    aiTextElement.textContent = "(✿◠‿◠)";
                    // 标记AI翻译1完成（未启用）
                    aiTranslationStatus.ai1.completed = true;
                    aiTranslationStatus.ai1.result = "(✿◠‿◠)";
                }





            });






            // 返回元素（已创建但内容可能稍后更新）
            return aiTextElement;
        }

        //---第二个AI释义---
        // 创建第二个AI推荐释义 ， 添加到列表
        function createAIRecommendation2(translationList, savedText = null) {
            // 先检查开关是否打开
            chrome.storage.local.get('autoRequestAITranslations2', function(result) {
                if(!result.autoRequestAITranslations2) {
                    // 如果开关关闭，不创建元素
                    return;
                }

                // 创建AI推荐释义容器
                const aiItem = document.createElement('div');
                aiItem.className = 'translation-item ai-recommendation-2';
                // 添加样式使整个条目可点击
                aiItem.style.cursor = 'pointer';

                // 创建AI徽章
                const aiBadge = document.createElement('span');
                aiBadge.className = 'ai-badge';
                aiBadge.innerHTML = `
                    <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"></path>
                    </svg>
                `;

                // 获取第二个AI推荐释义元素
                const aiText = savedText !== null ? createAITextElement2(savedText) : getNewAIRecommendation2();


            // 创建操作按钮
            const actions = document.createElement('div');
            actions.className = 'translation-actions';

            const addBtn = document.createElement('button');
            addBtn.className = 'translation-action-btn add-ai-translation-2';
            addBtn.innerHTML = `
            <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path>
</svg>
            `;





            actions.appendChild(addBtn);

            // 组装AI推荐释义
            aiItem.appendChild(aiBadge);
            aiItem.appendChild(aiText);
            aiItem.appendChild(actions);

            // 添加到列表末尾
            translationList.appendChild(aiItem);

            // 为整个AI推荐条目添加点击事件
            aiItem.addEventListener('mousedown', function(e) {
              // 如果点击的是加号按钮或其子元素，不执行此处的点击事件，让加号按钮自己的事件处理
              if (e.target === addBtn || addBtn.contains(e.target)) {
                return;
              }

              e.preventDefault();
              e.stopPropagation();

              // 显示loading状态
              const originalText = aiText.textContent.trim();
              aiText.textContent = '同步中...';
              aiText.style.opacity = '0.6';

              // 监听翻译添加完成事件，等待数据库更新完成后再刷新
              const handleTranslationAdded = (event) => {
                if (event.detail.word.toLowerCase() === word.toLowerCase()) {
                  console.log("翻译添加完成（云端同步已完成），开始刷新");
                  window.removeEventListener('translationAdded', handleTranslationAdded);
                  refreshTooltipTranslations(word, false, 'ai2'); // 排除第二个AI项
                }
              };
              window.addEventListener('translationAdded', handleTranslationAdded);

              // 设置超时，如果5秒内没有收到事件，也进行刷新
              setTimeout(() => {
                window.removeEventListener('translationAdded', handleTranslationAdded);
                console.log("超时，强制刷新");
                refreshTooltipTranslations(word, false, 'ai2');
              }, 5000);

              // 保存翻译（会触发 translationAdded 事件）
              translate_Stauts_SententsToDb(originalText);
            });

            // 为添加按钮绑定事件（保持原有功能）
            addBtn.addEventListener('mousedown', function(e) {
              e.preventDefault();
              e.stopPropagation();

              // 显示loading状态
              const originalText = aiText.textContent.trim();
              aiText.textContent = '同步中...';
              aiText.style.opacity = '0.6';

              // 监听翻译添加完成事件，等待数据库更新完成后再刷新
              const handleTranslationAdded = (event) => {
                if (event.detail.word.toLowerCase() === word.toLowerCase()) {
                  console.log("翻译添加完成（云端同步已完成），开始刷新");
                  window.removeEventListener('translationAdded', handleTranslationAdded);
                  refreshTooltipTranslations(word, false, 'ai2'); // 排除第二个AI项
                }
              };
              window.addEventListener('translationAdded', handleTranslationAdded);

              // 设置超时，如果5秒内没有收到事件，也进行刷新
              setTimeout(() => {
                window.removeEventListener('translationAdded', handleTranslationAdded);
                console.log("超时，强制刷新");
                refreshTooltipTranslations(word, false, 'ai2');
              }, 5000);

              // 保存翻译（会触发 translationAdded 事件）
              translate_Stauts_SententsToDb(originalText);
            });
            }); // 关闭chrome.storage.local.get的回调
        }

        // 获取第二个AI推荐释义
        function getNewAIRecommendation2() {
            // 先创建元素，无论如何都会返回这个元素
            const aiTextElement = document.createElement('span');
            aiTextElement.textContent = "Hmm...";
            aiTextElement.className = "ai-translation-text-2";

            // 异步获取设置并更新元素内容
            chrome.storage.local.get('autoRequestAITranslations2', function(result) {
                if(result.autoRequestAITranslations2) {
                    // 异步获取第二个AI释义
                    fetchAIWordTranslation2(word, sentence).then(translation => {
                        console.log("第二个AI释义加载完成", translation);
                        // 更新文本内容
                        aiTextElement.textContent = translation;

                        // 标记AI翻译2完成
                        aiTranslationStatus.ai2.completed = true;
                        aiTranslationStatus.ai2.result = translation;

                        // 注意：第二个AI翻译不会自动添加到数据库
                        // 用户需要手动点击添加按钮

                        // 检查是否需要刷新（当AI翻译1已完成且需要刷新时）
                        console.log("AI翻译2完成，检查是否需要刷新...");
                        checkAndRefreshWhenBothAIComplete();

                    }).catch(error => {
                        console.error("获取第二个AI释义失败:", error);
                        aiTextElement.textContent = "AI 释义加载失败";
                        // 标记AI翻译2完成（即使失败）
                        aiTranslationStatus.ai2.completed = true;
                        aiTranslationStatus.ai2.result = "AI 释义加载失败";
                        // 即使失败也检查是否需要刷新
                        checkAndRefreshWhenBothAIComplete();
                    });
                } else {
                    aiTextElement.textContent = "(✿◠‿◠)";
                    // 标记AI翻译2完成（未启用）
                    aiTranslationStatus.ai2.completed = true;
                    aiTranslationStatus.ai2.result = "(✿◠‿◠)";
                    // AI翻译2未启用时也需要检查是否需要刷新
                    checkAndRefreshWhenBothAIComplete();
                }
            });

            // 返回元素（已创建但内容可能稍后更新）
            return aiTextElement;
        }

        // 初始化释义管理功能
        initTranslationManagement();


      //自动添加例句到数据库
      chrome.storage.local.get(['autoAddExampleSentences', 'autoAddSentencesLimit'], function(result) {
        console.log("自动添加例句状态已更新:", result.autoAddExampleSentences);
        console.log("自动添加例句上限条数:", result.autoAddSentencesLimit);

        if(result.autoAddExampleSentences){
            const sentencesLimit = result.autoAddSentencesLimit === undefined ? 1 : result.autoAddSentencesLimit;

            //这个句子已经存在，就不操作了；
            const existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()];
            console.log("existingDetails 自动例句判断", existingDetails);

            if (existingDetails && existingDetails.sentences) {
                console.log("existingDetails.sentence  ", existingDetails.sentences);

                // 检查是否已存在相同句子
                const sentenceExists = existingDetails.sentences.some(item => item.sentence === sentence);
                if(sentenceExists){
                    console.log("existingDetails.sentence 包含 sentence， 不自动添加");
                    return;
                }

                // 检查是否已达到上限条数
                if (existingDetails.sentences.length >= sentencesLimit) {
                    console.log(`已达到自动添加例句上限(${sentencesLimit}条)，不再自动添加`);
                    return;
                }
            }

            console.log("sentents is :" +sentence)
            console.log("existingDetails.sentence 不包含 sentence， 自动添加");

            let currentUrl =  window.top.location.href
            // 添加例句和翻译
            fetchSentenceTranslation(word, sentence).then(sentTranslation => {
              chrome.runtime.sendMessage({
                action: "addSentence",
                word: originalWord,
                sentence: sentence,
                translation: sentTranslation,
                url:currentUrl
              }, (res) => {
                if (res && res.error) {
                  console.error("保存例句失败:", res.error);
                } else {
                  console.log("保存例句成功");
                  // 刷新 tooltip 内显示的翻译列表

                  // refreshTooltipTranslations(word);
                  //
                //添加本地缓存  防止多AI请求
                if (highlightManager && highlightManager.wordDetailsFromDB) {
                  // 获取已存在的详情，如果不存在则默认为空对象
                  const existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()] || {};

                  highlightManager.wordDetailsFromDB[word.toLowerCase()] = {
                    ...existingDetails,
                    // 正确地添加 sentence 对象到 sentences 数组
                    sentences: [...(existingDetails.sentences || []), { sentence: sentence, translation: sentTranslation }]
                    // 移除了错误添加句子翻译到translations数组的代码
                  };
                  console.log("本地缓存已更新:", highlightManager.wordDetailsFromDB[word.toLowerCase()]);
                }


                  refreshTooltipSentences(word, sentence);
                }
              });
            });






          }
        });




        function refreshTooltipSentences(word, sentenceFallback) {
          chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, (response) => {
            // 添加null检查，确保tooltipEl存在且tooltip未被销毁
            if (!tooltipEl || tooltipBeingDestroyed) {
              console.error('tooltipEl 为 null 或tooltip正在被销毁，无法刷新句子');
              return;
            }

            const sentencesContainer = tooltipEl.querySelector(".tooltip-sentences");
            if (!sentencesContainer) return;
            sentencesContainer.innerHTML = ""; // 清空旧内容

            if (response && response.details && response.details.sentences && response.details.sentences.length > 0) {
              response.details.sentences.forEach((item, index) => {
                // 检查sentence是否存在，避免null错误
                if (!item.sentence) return;

                const regex = new RegExp(`(${word})`, "gi");
                const highlightedSentence = item.sentence.replace(regex, '<strong>$1</strong>');
                const translatedText = item.translation || "加载中...";
                const formattedTranslation = translatedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                // 将翻译部分初始状态设置为隐藏（display:none）
                const sentencePairHTML = `
<div class="example-sentence-pair" data-index="${index}" style="position: relative;">
  <div class="example-sentence-line" style="display: flex; justify-content: space-between; align-items: center;">
    <span class="example-sentence" style="cursor:pointer">${highlightedSentence}</span>
  </div>
  <div class="example-translation-line" style="color:#666; margin-left:5px; display:none;">
    > <span class="example-translation">${formattedTranslation}</span>
  </div>
  <button class="delete-sentence-btn" title="删除" style="position: absolute; top: 5px; right: 5px; background: rgba(0, 0, 0, 0) !important; border: 0 solid transparent !important; cursor: pointer; padding: 0; display: none;">
    <svg data-slot="icon" fill="none" stroke-width="1.5" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="16" height="16">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"></path>
    </svg>
  </button>
</div>
`;
                // sentencesContainer.innerHTML += sentencePairHTML;
                sentencesContainer.innerHTML = sentencePairHTML + sentencesContainer.innerHTML; // Modified line - prepends to the beginning

              });

              // 为每个例句对添加事件监听器
              const sentencePairs = sentencesContainer.querySelectorAll(".example-sentence-pair");
              sentencePairs.forEach(pair => {
                const sentence = pair.querySelector(".example-sentence").textContent;

                // 当鼠标悬浮在句子对上时显示翻译，离开后隐藏翻译部分
                pair.addEventListener("mouseenter", () => {
                  const translationLine = pair.querySelector(".example-translation-line");
                  if (translationLine) {
                    translationLine.style.display = "block";
                  }
                });
                // pair.addEventListener("mouseleave", () => {
                //   const translationLine = pair.querySelector(".example-translation-line");
                //   if (translationLine) {
                //     translationLine.style.display = "none";
                //   }
                // });

                // 为例句文本添加点击事件
                pair.querySelector(".example-sentence").addEventListener('mousedown', (e) => {
                  e.preventDefault(); // 阻止默认行为，希望能阻止焦点转移和后续的 click 事件

                  playText({ text: sentence });
                });

                // 添加删除按钮的事件处理
                const deleteBtn = pair.querySelector(".delete-sentence-btn");
                if (deleteBtn) {
                  deleteBtn.addEventListener('mousedown', (e) => {
                    e.preventDefault(); // 阻止默认行为，希望能阻止焦点转移和后续的 click 事件

                    console.log("删除例句:", sentence); // 添加日志
                    chrome.runtime.sendMessage(
                      { action: "removeSentence", word: originalWord, sentence: sentence },
                      (response) => {
                        if (response && response.error) {
                          console.error("删除例句失败:", response.error);
                        } else {
                          console.log("删除例句成功");
                          // 重新刷新例句列表


                        //添加删除本地缓存
                        if (highlightManager && highlightManager.wordDetailsFromDB) {
                          // 获取当前单词的本地缓存
                          const existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()];
                          if (existingDetails && existingDetails.sentences) {
                            // 使用 findIndex 查找 sentence 属性匹配的对象的索引
                            const sentenceIndex = existingDetails.sentences.findIndex(item => item.sentence === sentence);
                            if (sentenceIndex > -1) {
                              // 使用 splice 直接修改 sentences 数组，删除指定索引的对象
                              existingDetails.sentences.splice(sentenceIndex, 1);
                              // 更新本地缓存
                              highlightManager.wordDetailsFromDB[word.toLowerCase()] = {
                                ...existingDetails,
                                sentences: existingDetails.sentences
                              };
                              console.log("本地缓存已更新，句子已删除:", highlightManager.wordDetailsFromDB[word.toLowerCase()]);
                            }
                          }
                        }



                          refreshTooltipSentences(word, sentenceFallback);
                        }
                      }
                    );
                  });
                }
              });
            } else {
              // 之前自动获取例句并翻译的，现在不需要了。
            }
          });
        }





  // 添加空格键监听器
  // tooltipSpaceKeyListener = function(e) {
  //   // --- 新增开始 ---
  //   // 检查事件是否来自输入框或文本区域
  //   const targetTagName = e.target?.tagName;
  //   console.log("targetTagName", targetTagName);

  //   if (targetTagName === 'INPUT' || targetTagName === 'TEXTAREA' || targetTagName === 'DIV') { // <--- 添加 DIV 判断
  //       // 如果是，则不处理此事件，允许输入空格
  //       return;
  //   }
  //   // --- 新增结束 ---

  //   if (e.code === "Space") {
  //     e.stopPropagation(); // 如果不是输入框，则阻止传播
  //     e.preventDefault();  // 如果不是输入框，则阻止默认行为
  //     // e.stopPropagation(); // <--- 原来的位置可以删除或注释掉

  //     //如果当前状态是5，就设置成1
  //     if(highlightManager.wordDetailsFromDB[word.toLowerCase()]?.status === "5" || highlightManager.wordDetailsFromDB[word.toLowerCase()]?.status === undefined || highlightManager.wordDetailsFromDB[word.toLowerCase()]?.status === '0'){
  //       console.log("检测到空格键，设置单词状态为 1");
  //       updateWordStatus(word, "1", sentence,parent,originalWord);
  //     }else{
  //       console.log("检测到空格键，设置单词状态为 5");
  //       updateWordStatus(word, "5", sentence,parent,originalWord);
  //     }



  //     // 按下空格后移除空格键监听器
  //     document.removeEventListener("keydown", tooltipSpaceKeyListener, true); // <--- 同样在这里也用 true
  //     tooltipSpaceKeyListener = null;
  //     // 移除 tooltip 小窗
  //     if (tooltipEl) {
  //       tooltipEl.remove();
  //       tooltipEl = null;
  //       currentTooltipWord = null;
  //       if (tooltipResizeObserver) { // <--- 添加：断开观察
  //           tooltipResizeObserver.disconnect();
  //           tooltipResizeObserver = null;
  //       }
  //     }
  //   }
  // };



// +++ 新增：定义新的动态键盘监听器 +++

// 改为非阻塞预加载：立即开始加载但不等待
let keyMapout = null;
let keyMapoutLoadPromise = getStorageValue('wordStatusKeys').then(value => {
  keyMapout = value;
  console.log("keyMapout 预加载完成", keyMapout);
  return value;
});

// 添加一个全局变量来追踪当前是否有翻译输入框处于活动状态
let isTranslationInputActive = false;

currentTooltipKeydownHandler = async function(e) {

  console.log("handleTooltipKeydown");
  console.log(e.key);

  // 如果keyMapout还未加载完成，等待加载（但这不会阻塞弹窗显示）
  if (!keyMapout) {
    await keyMapoutLoadPromise;
  }

  // chrome.storage.local.get('wordStatusKeys', (result) => {

    // 提供与 popup.js 一致的默认值
    const keyMap = keyMapout || { 0: '`', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', toggle: ' ', addAITranslation: 'tab', closeTooltip: 'capslock' };
    // 将空格键的 ' ' 映射为 'Space' code for consistency if needed, or handle based on e.key
    const toggleKey = keyMapout.toggle === ' ' ? ' ' : keyMapout.toggle; // Use e.key directly for space

    // 如果有翻译输入框正在活动，完全跳过所有全局快捷键处理
    if (isTranslationInputActive) {
      console.log("翻译输入框正在活动，跳过所有全局快捷键处理");
      return;
    }

    // 检查事件是否来自输入框或文本区域 - 增强版检查
    const targetTagName = e.target?.tagName;
    const isEditableElement = targetTagName === 'INPUT' ||
                             targetTagName === 'TEXTAREA' ||
                             (targetTagName === 'DIV' && e.target.contentEditable === 'true') ||
                             e.target.classList?.contains('translation-input') ||
                             e.target.classList?.contains('tag-input'); // 额外检查所有输入框的类名

    // 如果事件来自可编辑元素，直接返回，不做任何处理
    if (isEditableElement) {
      console.log("事件来自可编辑元素，跳过全局键盘处理:", targetTagName, e.target.className);
      return; // 不处理输入框/文本区域/可编辑DIV内的按键
    }

    // 额外检查：如果事件目标的任何父元素是textarea或输入框，也跳过处理
    let currentElement = e.target;
    while (currentElement && currentElement !== document) {
      if (currentElement.tagName === 'TEXTAREA' ||
          currentElement.tagName === 'INPUT' ||
          currentElement.classList?.contains('translation-input') ||
          currentElement.classList?.contains('tag-input')) {
        console.log("事件目标位于输入框内部，跳过全局键盘处理");
        return;
      }
      currentElement = currentElement.parentElement;
    }
    
    // 检查当前焦点元素是否是翻译输入框或其他输入框
    const activeElement = document.activeElement;
    if (activeElement && (
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'INPUT' ||
        activeElement.classList?.contains('translation-input') ||
        activeElement.classList?.contains('tag-input')
    )) {
      console.log("当前焦点在输入框，跳过全局键盘处理");
      return;
    }

    console.log("targetTagName targetTagNametargetTagName", targetTagName);





    let keyHandled = false;
    let newStatus = null;

    // 检查是否匹配 0-5 状态键
    for (const status in keyMap) {
      if (status >= 0 && status <= 5 && keyMap[status] === e.key) {
        console.log("keyMap", keyMap);
        console.log("keyMap[status]", keyMap[status]);
        console.log("e.key", e.key);
        console.log("status", status);

        newStatus = status;
        console.log(`检测到快捷键 ${e.key}，设置单词状态为 ${newStatus}`);

        // 只有匹配到快捷键时才阻止传播
        e.stopPropagation();
        e.preventDefault();

        updateWordStatus(word, newStatus, sentence, parent, originalWord);
        keyHandled = true;
        break;
      }
    }

    // 如果未处理，检查是否匹配切换键

    console.log("toggleKey 不是12345 ", toggleKey);
    console.log("e.key", e.key);
    if (!keyHandled && toggleKey === e.key) {
      console.log("切换认识状态 ", toggleKey);

      // 只有匹配到切换键时才阻止传播
      e.stopPropagation();
      e.preventDefault();

       const currentStatus = highlightManager.wordDetailsFromDB[word.toLowerCase()]?.status;
       if (currentStatus === "5" || currentStatus === undefined || currentStatus === '0') {
          console.log(`检测到切换快捷键 ${e.key}，设置单词状态为 1`);
          updateWordStatus(word, "1", sentence, parent, originalWord, isCustom);
       } else {
          console.log(`检测到切换快捷键 ${e.key}，设置单词状态为 5`);
          updateWordStatus(word, "5", sentence, parent, originalWord, isCustom);
       }
       keyHandled = true;
    }

    // 检查是否匹配添加AI释义键
    const addAITranslationKey = keyMapout.addAITranslation || 'tab';
    if (!keyHandled && (e.key.toLowerCase() === addAITranslationKey || (addAITranslationKey === 'tab' && e.code === 'Tab'))) {
      console.log(`检测到添加AI释义快捷键 ${e.key}`);

      // 只有匹配到AI释义键时才阻止传播
      e.stopPropagation();
      e.preventDefault();

      // 如果当前有tooltip并且有AI释义文本，则添加到释义中
      const aiText = tooltipEl.querySelector('.ai-translation-text');
      if (aiText) {
        console.log("找到AI释义文本，添加到释义中");

        // 显示loading状态
        const originalText = aiText.textContent.trim();
        aiText.textContent = '同步中...';
        aiText.style.opacity = '0.6';

        // 保存翻译并等待云端同步完成
        translate_Stauts_SententsToDb(originalText, () => {
          // 同步完成后刷新UI
          refreshTooltipTranslations(word, false, 'ai1'); // 排除第一个AI项
          console.log("已添加AI释义");
        });

        // 标记为已处理，但不设置 keyHandled 为 true，这样不会触发关闭小窗
        keyHandled = true;

        // return; // 直接返回，不执行后续的关闭小窗逻辑
      }
    }

    // 检查是否匹配关闭小窗键
    const closeTooltipKey = keyMapout.closeTooltip || 'capslock';
    if (!keyHandled && (e.key.toLowerCase() === closeTooltipKey || (closeTooltipKey === 'capslock' && e.code === 'CapsLock'))) {
      console.log(`检测到关闭小窗快捷键 ${e.key}`);

      // 只有匹配到关闭键时才阻止传播
      e.stopPropagation();
      e.preventDefault();

      // 直接关闭小窗，不需要其他操作
      keyHandled = true;
    }






    // --- 新增：处理完按键后，无论如何都带动画关闭 tooltip ---
    if (keyHandled) {
      closeTooltipWithAnimation();
    } else {
      // 如果按键没有被处理，说明不是插件的快捷键，让它正常传播给其他处理器
      console.log(`按键 ${e.key} 不是插件快捷键，允许正常传播`);
      // 不调用 preventDefault() 和 stopPropagation()，让按键正常传播
    }
    // --- 新增结束 ---


  // });
};
// +++ 新增结束 +++
document.addEventListener("keydown", currentTooltipKeydownHandler, false); // <-- 使用冒泡阶段而非捕获阶段


  // document.addEventListener("keydown", tooltipSpaceKeyListener, true); // <--- 添加 true 参数 // <-- 移除旧的监听器添加

  // 确保 tooltipEl 存在且tooltip未被销毁后再进行DOM查询
  if (!tooltipEl || tooltipBeingDestroyed) {
    console.error('tooltipEl 为 null 或tooltip正在被销毁，无法绑定事件');
    // 清理监听器
    cleanupTooltipListeners();
    return;
  }

  // 绑定液体玻璃开关按钮事件
  const liquidGlassToggleBtn = tooltipEl.querySelector(".liquid-glass-toggle-btn");
  if (liquidGlassToggleBtn) {
    // 初始化按钮状态
    updateLiquidGlassToggleButton(liquidGlassToggleBtn);

    liquidGlassToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 切换液体玻璃效果状态
      chrome.storage.local.get(['liquidGlassEnabled'], (result) => {
        const currentState = result.liquidGlassEnabled !== undefined ? result.liquidGlassEnabled : true;
        const newState = !currentState;

        // 保存新状态
        chrome.storage.local.set({ liquidGlassEnabled: newState }, async () => {
          console.log('液体玻璃效果状态已更新:', newState);

          // 更新按钮外观
          updateLiquidGlassToggleButton(liquidGlassToggleBtn, newState);

          if (newState) {
            // 启用效果
            if (await isFirefox()) {
              applyFirefoxGlassEffect();
            } else {
              applyLiquidGlassEffect();
            }
          } else {
            // 禁用效果
            cleanupLiquidGlass();
            // 恢复原始背景
            restoreOriginalBackground();
          }
        });
      });
    });
  }

  // 绑定关闭按钮事件，关闭 tooltip 时也取消空格键监听器 小窗点击关闭
  const closeBtnWords = tooltipEl.querySelector(".close-btn-words");
  if (closeBtnWords) {
    closeBtnWords.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      //这里判断一下当前鼠标下面的单词是不是小窗单词，如果是就不反应




      closeTooltipWithAnimation(); // <-- 调用新函数关闭 tooltip
    });
  } else {
    console.error('未找到关闭按钮元素 .close-btn-words');
  }

  // 绑定最小化按钮事件
  const minimizeBtnWords = tooltipEl.querySelector(".minimize-btn-words");
  if (minimizeBtnWords) {
    minimizeBtnWords.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 最小化功能：隐藏指定元素，只显示翻译结果
      minimizeTooltip();

      // // 强制重新应用液体玻璃效果 - 改进时序控制
      // setTimeout(async () => {
      //   console.log('最小化后开始重新应用液体玻璃效果');
      //   // 先彻底清理现有效果
      //   cleanupLiquidGlass();

      //   // 等待清理完成后再重新应用
      //   setTimeout(async () => {
      //     console.log('清理完成，重新应用液体玻璃效果');
      //     await applyLiquidGlassToTooltip();
      //   }, 100); // 增加清理等待时间
      // }, 350); // 增加最小化动画等待时间
    });
  } else {
    console.error('未找到最小化按钮元素 .minimize-btn-words');
  }

  // 绑定状态切换按钮事件
  const statusToggleBtn = tooltipEl.querySelector(".status-toggle-btn");
  if (statusToggleBtn) {
    statusToggleBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 获取当前单词状态
      const currentStatus = highlightManager.wordDetailsFromDB[word.toLowerCase()]?.status;

      // 切换状态：如果是5或未定义/0，则设为1；否则设为5
      let newStatus;
      if (currentStatus === "5" || currentStatus === undefined || currentStatus === '0') {
        newStatus = "1";
        console.log(`状态切换按钮：设置单词状态为 1`);
      } else {
        newStatus = "5";
        console.log(`状态切换按钮：设置单词状态为 5`);
      }

      // 更新单词状态
      updateWordStatus(word, newStatus, sentence, parent, originalWord, isCustom);
      updateButtonColors(tooltipEl, newStatus);

      // 更新状态切换按钮的图标
      updateStatusToggleButton(tooltipEl, newStatus);
    });
  } else {
    console.error('未找到状态切换按钮元素 .status-toggle-btn');
  }

  // 创建胶囊容器的包装器（用于容纳多个胶囊行）
  const capsulesWrapper = document.createElement('div');
  capsulesWrapper.className = 'capsules-wrapper';
  capsulesWrapper.style.cssText = `
    position: fixed;
    display: none;
    flex-direction: column-reverse;
    gap: 8px;
    z-index: 2147483646 !important;
  `;

  // 生成所有胶囊容器（包括默认容器和自定义容器）
  await generateAllCapsules(capsulesWrapper, word, shadowRoot);

  // 异步操作后检查当前弹窗引用是否仍然有效（触摸屏模式下快速点击保护）
  if (tooltipEl !== currentTooltipElRef || tooltipBeingDestroyed) {
    console.error('generateAllCapsules完成后，当前弹窗已被替换或正在被销毁，停止后续操作');
    return;
  }

  // 将胶囊包装器添加到Shadow DOM中
  shadowRoot.appendChild(capsulesWrapper);

  // 绑定右上角菜单按钮事件
  const headerMenuToggleBtn = currentTooltipElRef.querySelector(".header-menu-toggle-btn");

  if (headerMenuToggleBtn) {
    // 更新胶囊位置的函数
    const updateCapsulesPosition = async () => {
      const tooltipRect = currentTooltipElRef.getBoundingClientRect();

      // 获取缩放因子，与弹窗保持一致
      const baseDPR = await getStorageValue('devicePixelRatio') || window.devicePixelRatio || 1.0;
      const currentDPR = window.devicePixelRatio || 1;
      const capsuleZoomFactor = currentDPR / baseDPR;

      // 使用固定定位，直接使用页面坐标
      // 胶囊包装器在弹窗上方，右侧与弹窗右侧对齐
      // 使用 column-reverse 布局，所以从下往上叠加
      capsulesWrapper.style.bottom = `${window.innerHeight - tooltipRect.top + 8}px`;
      capsulesWrapper.style.right = `${window.innerWidth - tooltipRect.right - 17}px`;

      // 添加CSS变换以抵消浏览器缩放，与弹窗保持一致的尺寸
      // 使用组合transform，保留show动画效果
      const isShowing = capsulesWrapper.classList.contains('show');
      const translateY = isShowing ? '0' : '10px';
      capsulesWrapper.style.transform = `scale(${1/capsuleZoomFactor}) translateY(${translateY})`;
      // 设置变换原点为右下角，因为胶囊使用bottom和right定位
      capsulesWrapper.style.transformOrigin = "right bottom";
    };

    // 使用 Promise 来确保异步操作完成后再绑定事件
    const initializeCapsule = async () => {
      // 检查是否默认展开胶囊
      const result = await new Promise(resolve => {
        chrome.storage.local.get('defaultExpandCapsule', resolve);
      });

      if (result.defaultExpandCapsule === true) {
        // 默认展开胶囊 - 延迟一点确保弹窗已经完全渲染
        setTimeout(async () => {
          await updateCapsulesPosition();
          capsulesWrapper.style.display = 'flex';
          requestAnimationFrame(() => {
            requestAnimationFrame(async () => {
              capsulesWrapper.classList.add('show');
              // show类添加后更新transform（包含正确的translateY值）
              await updateCapsulesPosition();
            });
          });
        }, 100);
      }

      // 绑定点击事件
      headerMenuToggleBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 切换胶囊容器的显示状态
        const isVisible = capsulesWrapper.style.display !== 'none';

        if (isVisible) {
          // 隐藏胶囊
          capsulesWrapper.classList.remove('show');
          setTimeout(() => {
            capsulesWrapper.style.display = 'none';
          }, 200); // 等待动画完成
        } else {
          // 更新位置（包含缩放）
          await updateCapsulesPosition();

          // 显示胶囊
          capsulesWrapper.style.display = 'flex';
          // 使用 requestAnimationFrame 确保 display 变化后再添加 show 类
          requestAnimationFrame(() => {
            requestAnimationFrame(async () => {
              capsulesWrapper.classList.add('show');
              // show类添加后更新transform（包含正确的translateY值）
              await updateCapsulesPosition();
            });
          });
        }
      });
    };

    // 执行初始化
    initializeCapsule();

    // 点击弹窗外部时隐藏胶囊容器
    const hideCapsuleOnClickOutside = (e) => {
      // 检查点击是否在胶囊容器或菜单按钮外部
      if (capsulesWrapper.style.display !== 'none' &&
          !capsulesWrapper.contains(e.target) &&
          !headerMenuToggleBtn.contains(e.target)) {
        capsulesWrapper.classList.remove('show');
        setTimeout(() => {
          capsulesWrapper.style.display = 'none';
        }, 200);
      }
    };

    // 在 Shadow DOM 根节点上监听点击事件
    shadowRoot.addEventListener('click', hideCapsuleOnClickOutside);

    // 监听页面滚动，更新胶囊位置
    const updateCapsuleOnScroll = () => {
      if (capsulesWrapper.style.display !== 'none') {
        updateCapsulesPosition();
      }
    };

    window.addEventListener('scroll', updateCapsuleOnScroll, true);
    window.addEventListener('resize', updateCapsuleOnScroll);

    // 清理函数（当弹窗关闭时移除监听器和胶囊容器）
    tooltipEl._cleanupCapsuleListener = () => {
      shadowRoot.removeEventListener('click', hideCapsuleOnClickOutside);
      window.removeEventListener('scroll', updateCapsuleOnScroll, true);
      window.removeEventListener('resize', updateCapsuleOnScroll);
      if (capsulesWrapper && capsulesWrapper.parentNode) {
        capsulesWrapper.remove();
      }
    };
  }

  // 绑定还原按钮事件
  const restoreBtnWords = tooltipEl.querySelector(".restore-btn-words");
  if (restoreBtnWords) {
    restoreBtnWords.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 还原功能：显示所有隐藏的元素
      restoreTooltip();

      // // 强制重新应用液体玻璃效果 - 改进时序控制
      // setTimeout(async () => {
      //   console.log('还原后开始重新应用液体玻璃效果');
      //   // 先彻底清理现有效果
      //   cleanupLiquidGlass();

      //   // 等待清理完成后再重新应用
      //   setTimeout(async () => {
      //     console.log('清理完成，重新应用液体玻璃效果');
      //     await applyLiquidGlassToTooltip();
      //   }, 100); // 增加清理等待时间
      // }, 350); // 增加还原动画等待时间
    });
  } else {
    console.error('未找到还原按钮元素 .restore-btn-words');
  }

  // 检测页面模式并应用相应的样式类
  // if (isDarkMode()) {
  //   tooltipEl.classList.add("dark-mode");
  // }

  // 确保底部状态按钮区域始终可见
  tooltipEl.style.display = "flex";
  tooltipEl.style.flexDirection = "column";

  // 获取视口尺寸
  const viewportHeight = window.innerHeight;
  const viewportWidth = document.documentElement.clientWidth;


  

  // 获取用户设置的基准DPR值
  const baseDPR = await getStorageValue('devicePixelRatio') || window.devicePixelRatio || 1.0;
  // 获取当前浏览器的实际DPR
  const currentDPR = window.devicePixelRatio || 1;
  // 计算缩放比例：当前DPR / 基准DPR
  let zoomFactor = currentDPR / baseDPR;
  console.log(`DPR计算: 基准DPR=${baseDPR}, 当前DPR=${currentDPR}, 缩放比例=${zoomFactor}`);

  // 获取屏幕宽度
  const screenWidth = document.documentElement.clientWidth;

  // 计算基于实际屏幕宽度的弹窗宽度（95%的实际屏幕宽度）
  const actualScreenWidth = screen.width;
  const tooltipWidth = Math.min(392, actualScreenWidth * 0.95); // 最大392px，或实际屏幕宽度的95%

  // 确保 tooltipEl 存在且tooltip未被销毁后再设置样式
  if (tooltipEl && !tooltipBeingDestroyed) {
    tooltipEl.style.width = `${tooltipWidth}px`;
    console.log(`设置弹窗宽度: ${tooltipWidth}px (基于实际屏幕宽度: ${actualScreenWidth}px)`);
  } else {
    console.error('tooltipEl 为 null 或tooltip正在被销毁，无法设置宽度');
    return; // 如果 tooltipEl 不存在或正在被销毁，直接返回
  }

  // 根据设备类型和屏幕特性处理缩放比例
  // 检查是否为移动设备
  const isMobile = /iPhone|iPad|iPod|Android|Orion|Samsung/i.test(navigator.userAgent);

  if (isMobile || screenWidth < 500) {
    // zoomFactor = 1;

  }


  // 根据缩放比例调整tooltip的最大高度
  // 计算调整后的最大高度 = 原始高度 / 缩放比例
  const adjustedMaxHeight = Math.floor((window.innerHeight) * zoomFactor) -192;

  // 确保 tooltipEl 存在且tooltip未被销毁后再设置样式
  if (tooltipEl && !tooltipBeingDestroyed) {
    tooltipEl.style.maxHeight = `${adjustedMaxHeight}px`;
    console.log("调整后的tooltip最大高度:", adjustedMaxHeight);
  } else {
    console.error('tooltipEl 为 null 或tooltip正在被销毁，无法设置最大高度');
    return;
  }

  // 预先计算弹窗的估计尺寸
  // 注意：此时弹窗还未添加到DOM，无法获取实际尺寸
  // 我们使用一个合理的估计值，后续会通过ResizeObserver调整
  const estimatedTooltipHeight = 277; // 估计的弹窗高度
  const estimatedTooltipWidth = tooltipWidth;  // 使用动态计算的弹窗宽度

  // 检测shadowHost是否在top layer（全屏模式）
  // 如果在top layer，shadowHost是position:fixed，坐标系相对于视口，不需要加scrollX/Y
  // 如果不在top layer，tooltipEl是position:absolute，坐标系相对于页面，需要加scrollX/Y
  const shadowHost = document.getElementById('lingkuma-tooltip-host');
  const isInTopLayer = shadowHost && (shadowHost.matches(':fullscreen') || shadowHost.matches(':modal'));
  const scrollOffsetX = isInTopLayer ? 0 : window.scrollX;
  const scrollOffsetY = isInTopLayer ? 0 : window.scrollY;

  console.log('[Tooltip定位] shadowHost在top layer:', isInTopLayer, '滚动偏移:', scrollOffsetX, scrollOffsetY);

  // 计算位置参数 - 根据是否在top layer决定是否加滚动偏移
  const wordTopAbsolute = wordRect.top + scrollOffsetY;
  const wordBottomAbsolute = wordRect.bottom + scrollOffsetY;

  // 使用getStorageValue函数获取自定义gap值，并根据缩放比例调整
  // 修复：使用 !== undefined 检查，而不是 || 运算符，以正确处理 tooltipGap 为 0 的情况
  let gap = await getStorageValue('tooltipGap');
  gap = gap !== undefined ? gap : 50; // 默认值为50
  // 确保gap值随缩放比例变化
  gap = gap / zoomFactor;
  console.log("调整后的gap值:", gap);

  let desiredLeft = wordRect.left + scrollOffsetX;
  
  // 检测竖排文本模式，如果是竖排则添加额外的水平偏移
  if (detectVerticalWritingMode()) {
    desiredLeft += 30; // 在竖排模式下向右偏移300px
    console.log("检测到竖排文本模式，弹窗位置向右偏移300px");
  }

  // 检查上方空间是否足够
  const spaceAboveViewport = wordRect.top; // 单词上方视口内的可用空间
  const willExceedTop = (estimatedTooltipHeight + gap) > spaceAboveViewport;

  // 检查下方空间是否足够
  const spaceBelowViewport = viewportHeight - wordRect.bottom; // 单词下方视口内的可用空间
  const willExceedBottom = (estimatedTooltipHeight + gap) > spaceBelowViewport;

  // 获取用户设置：是否优先向上弹出和是否需要最小化
  chrome.storage.local.get(['preferPopupAbove', 'tooltipMinimized'], function(result) {
    const preferPopupAbove = result.preferPopupAbove || false;
    const shouldMinimize = result.tooltipMinimized === true;

    // 如果需要最小化，重新计算尺寸和位置
    let finalTooltipWidth = estimatedTooltipWidth;
    let finalTooltipHeight = estimatedTooltipHeight;
    let willExceedRight = (desiredLeft + estimatedTooltipWidth) > (viewportWidth + scrollOffsetX);
    let showAbove = false;

    if (shouldMinimize) {
      console.log('检测到需要最小化状态，使用mini窗口尺寸计算位置');
      // 估算mini窗口的尺寸（基于经验值）
      finalTooltipWidth = Math.min(250, estimatedTooltipWidth); // mini窗口通常更窄
      finalTooltipHeight = 80; // mini窗口通常很矮

      // 重新检查边界条件
      willExceedRight = (desiredLeft + finalTooltipWidth) > (viewportWidth + scrollOffsetX);
      const miniWillExceedTop = (finalTooltipHeight + gap) > spaceAboveViewport;
      const miniWillExceedBottom = (finalTooltipHeight + gap) > spaceBelowViewport;

      // 重新计算显示方向
      if (preferPopupAbove) {
        showAbove = !miniWillExceedTop;
      } else {
        showAbove = miniWillExceedBottom && !miniWillExceedTop;
      }
    } else {
      // 使用原始尺寸计算显示方向
      if (preferPopupAbove) {
        // 如果设置为优先向上弹出，则只有当上方空间不足时才向下弹出
        showAbove = !willExceedTop;
      } else {
        // 如果设置为优先向下弹出，则只有当下方空间不足且上方空间足够时才向上弹出
        showAbove = willExceedBottom && !willExceedTop;
      }
    }

    if (showAbove) {
      // 向上展示
      console.log("弹窗将向上展示");

      // 设置向上展示的位置 - 考虑缩放因素
      // 根据窗口左下角位置进行缩放
      const adjustedTop = (wordTopAbsolute - finalTooltipHeight - gap);
      tooltipEl.style.top = adjustedTop + "px";

      // 添加CSS变换以抵消浏览器缩放
      tooltipEl.style.transform = `scale(${1/zoomFactor})`;
      // 设置变换原点为左下角，确保向上展开时基于左下角缩放
      tooltipEl.style.transformOrigin = "left bottom";

      // 设置最大高度以防万一内容变化
      tooltipEl.style.maxHeight = (spaceAboveViewport - gap) + "px";
      // 移除直接设置overflow，避免与内部scrollable-content的滚动设置冲突
      // tooltipEl.style.overflow = "auto";

      // 设置水平位置
      if (willExceedRight) {
        // 如果会超出右侧，则向左调整
        let newLeft = Math.max(viewportWidth - finalTooltipWidth - 10, 10);
        // 在竖排模式下，向左调整时也要减去偏移量
        if (detectVerticalWritingMode()) {
          newLeft = Math.max(newLeft - 300, 10);
          console.log("竖排模式下向左调整弹窗位置，减去300px偏移");
        }
        tooltipEl.style.left = (newLeft + scrollOffsetX) + "px";
      } else {
        tooltipEl.style.left = desiredLeft + "px";
      }

      // 设置ResizeObserver以在弹窗高度变化时调整位置
      if (tooltipResizeObserver) {
        tooltipResizeObserver.disconnect();
      }
      tooltipResizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const newHeight = entry.contentRect.height;
          // 重新计算 top 以保持底部位置固定
          const newTop = wordTopAbsolute - newHeight - gap;
          tooltipEl.style.top = newTop + 'px';
          console.log(`Tooltip height changed to ${newHeight}, adjusted top to ${newTop}`);
        }
      });
      tooltipResizeObserver.observe(tooltipEl);
    } else {
      // 向下展示
      console.log("弹窗将向下展示");
      // 计算向下展示的位置
      let desiredTop = wordBottomAbsolute + gap;

      // 检查是否会超出视口底部
      const willExceedBottomAbsolute = (desiredTop + finalTooltipHeight) > (viewportHeight + scrollOffsetY);

      if (willExceedBottomAbsolute) {
        console.log("向下展示会超出底部，调整位置");
        // 如果向下也会超出，尽量减小超出的程度
        desiredTop = Math.max(scrollOffsetY + 10, viewportHeight + scrollOffsetY - finalTooltipHeight);
      }

      tooltipEl.style.top = desiredTop + "px";

      // 添加CSS变换以抵消浏览器缩放
      tooltipEl.style.transform = `scale(${1/zoomFactor})`;
      // 设置变换原点为左上角，确保向下展开时基于左上角缩放
      tooltipEl.style.transformOrigin = "left top";

      // 检查并处理右侧溢出
      if (willExceedRight) {
        let newLeft = Math.max(viewportWidth - finalTooltipWidth - 10, 10);
        // 在竖排模式下，向左调整时也要减去偏移量
        // if (detectVerticalWritingMode()) {
        //   newLeft = Math.max(newLeft - 30 -392, 10);
        //   console.log("竖排模式下向左调整弹窗位置，减去300px偏移");
        // }
        tooltipEl.style.left = (newLeft + scrollOffsetX) + "px";
      } else {
        tooltipEl.style.left = desiredLeft + "px";
      }

      // 如果向下展示，不需要ResizeObserver来调整位置
      if (tooltipResizeObserver) {
        tooltipResizeObserver.disconnect();
        tooltipResizeObserver = null;
      }
    }

    // 确保不会超出左侧边界
    if (desiredLeft < 10) {
      tooltipEl.style.left = (window.scrollX + 10) + "px";
    }

    // 如果需要最小化，立即应用最小化状态（在显示之前）
    if (shouldMinimize) {
      console.log('在显示前应用最小化状态，避免位移动画');
      // 立即应用最小化，不调用repositionMiniTooltip因为位置已经计算好了
      applyMinimizeStateWithoutRepositioning();
    }

    // 在显示动画之前，先处理收缩和最小化状态，避免闪动
    chrome.storage.local.get(['defaultExpandTooltip', 'defaultExpandSententsTooltip'], function(expandResult) {
      // 如果设置为不展开,则添加collapsed类
      if (!expandResult.defaultExpandTooltip) {
        tooltipEl.classList.add('collapsed');
        const sentencesSection = tooltipEl.querySelector('.section:first-child');
        if (sentencesSection) {
          sentencesSection.style.border = 'none';
        }
        //除了第一个元素，其他.scrollable-content下的元素全都隐藏掉；
        tooltipEl.querySelectorAll('.section').forEach(element => {
          if (element !== sentencesSection) {
            element.style.display = 'none';
          }
        });
      }

      // 如果设置为不展开例句,则为例句section添加collapsed类
      if (!expandResult.defaultExpandSententsTooltip) {
        const sentencesSection = tooltipEl.querySelector('.section:last-child');
        if (sentencesSection) {
          sentencesSection.classList.add('collapsed');
        }
      }

      // 最小化状态已经在位置计算时处理，这里不再重复处理

      // 位置计算完成后，设置tooltip可见性
      if (tooltipEl) { // 确保tooltipEl仍然存在
        tooltipEl.style.visibility = 'visible'; // 先设为可见

        // 使用统一的动画设置函数，等待完成后再显示
        //615行是啥卧槽
        updateTooltipAnimationSettings().then(() => {
          // 动画设置完成后，设置透明度
          if (tooltipEl) { // 再次检查tooltipEl是否存在
            tooltipEl.style.opacity = '1';
          }
        });
      }
    });
  });

  // 不在这里设置可见性，而是在位置计算完成后设置
  // 位置计算在chrome.storage.local.get回调中完成

  // 添加滚轮事件监听，防止iframe页面被滚动
  tooltipEl.addEventListener('wheel', (e) => {
    // 检查事件是否发生在小窗的可滚动区域内
    if (tooltipEl.contains(e.target)) {
      // 防止事件冒泡到iframe文档
      e.stopPropagation();
    }
  }, { capture: true });


  // 添加键盘事件监听，防止空格键和Tab键事件传播到iframe
  tooltipEl.addEventListener('keydown', (e) => {
    if (e.code === "Space" || e.code === "Tab") {
      // 阻止空格键和Tab键事件传播到iframe文档
      e.stopPropagation();
      // Tab键的处理已经移到 currentTooltipKeydownHandler 函数中
    }
  }, { capture: true });

  // 获取 AI 单词翻译并显示
  // const aiWordTranslationSpan = tooltipEl.querySelector(".ai-word-translation");








  // 状态按钮事件
  const statusButtons = tooltipEl.querySelectorAll(".nav-buttons button");
  statusButtons.forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
       // 找到最近的按钮元素
      let buttonElement = e.target;
      while (buttonElement && buttonElement.tagName !== 'BUTTON') {
        buttonElement = buttonElement.parentElement;
      }

      // 从按钮元素获取状态
      const status = buttonElement ? buttonElement.getAttribute("data-status") : null;

      if (status !== null) {
        if (status === "0") {
          // 按钮0：从数据库中完全删除单词
          deleteWordFromDatabase(word, originalWord, isCustom);
        } else {
          // 其他按钮：更新单词状态
          updateWordStatus(word, status, sentence, parent, originalWord, isCustom);
          updateButtonColors(tooltipEl, status);
        }
      } else {
        console.warn("无法获取按钮状态");
      }
    });
  });




// 从数据库中删除单词的函数
function deleteWordFromDatabase(word, originalWord, isCustom = false) {
  console.log(`删除单词 ${word} 从数据库，isCustom: ${isCustom}`);

  chrome.runtime.sendMessage({
    action: "deleteWord",
    word: originalWord
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("发送 deleteWord 消息时发生错误:", chrome.runtime.lastError.message);
      return;
    }
    if (response && response.error) {
      console.error("删除单词失败:", response.error);
    } else {
      console.log(`单词 ${word} 删除成功`);

      // 更新本地缓存 - 从highlightManager中移除该单词
      const lower = word.toLowerCase();
      if (highlightManager && highlightManager.wordDetailsFromDB) {
        delete highlightManager.wordDetailsFromDB[lower];
        console.log("本地缓存已更新，单词已删除:", lower);

        // 检查是否是自定义词组
        if (isCustom) {
          console.log("删除自定义词组，更新自定义高亮系统");

          // 从自定义词组详情中移除
          if (typeof customWordDetails !== 'undefined' && customWordDetails) {
            customWordDetails.delete(lower);
            console.log("已从customWordDetails中移除:", lower);
          }

          // 从自定义词组范围映射中移除
          if (typeof customWordRangesMap !== 'undefined' && customWordRangesMap) {
            customWordRangesMap.delete(lower);
            console.log("已从customWordRangesMap中移除:", lower);
          }

          // 清除该词组的查询按钮
          if (typeof hideAllCustomWordQueryButtons === 'function') {
            hideAllCustomWordQueryButtons();
            console.log("已清除自定义词组查询按钮");
          }

          // 通知自定义高亮系统词组已删除
          console.log('准备发送删除消息:', originalWord);

          // 直接调用自定义高亮系统的函数，而不是通过消息
          if (typeof window.handleCustomWordDeletion === 'function') {
            console.log('直接调用删除处理函数');
            window.handleCustomWordDeletion(originalWord);
          } else {
            console.log('删除处理函数不存在，尝试消息方式');
            chrome.runtime.sendMessage({
              action: 'customWordUpdated',
              word: originalWord,
              status: '0', // 删除相当于状态0
              isCustom: false,
              updateType: 'wordDeleted'
            });
          }
        } else {
          // 普通单词：更新高亮显示 - 让单词回到蓝色高亮状态
          if (highlightManager) {
            console.log("更新高亮管理器，让单词回到蓝色状态");
            highlightManager.updateWordHighlight(word, undefined, parent, true);
          }
        }
      }

      // 关闭当前tooltip
      if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
        currentTooltipWord = null;
        if (tooltipResizeObserver) {
          tooltipResizeObserver.disconnect();
          tooltipResizeObserver = null;
        }
      }
    }
  });
}

// 更新按钮颜色函数
function updateButtonColors(tooltipEl, wordStatus) {
  // 状态颜色映射
  const lightModeColors = {
    0: "rgb(255,226,226)",
    1: "rgb(255,232,149)",
    2: "rgb(255,242,197)",
    3: "rgb(255,247,219)",
    4: "rgb(213,216,220)",
    5: "rgb(201,234,212)"
  };
    // 状态颜色映射 - 暗色模式
  const darkModeColors = {
      0: "rgb(139, 69, 69)",   // Darker Red (New/Unknown)
      1: "rgb(138, 113, 58)",  // Dark Yellow/Ochre (Learning, from dark-state1 inspiration)
      2: "rgb(92, 84, 63)",    // Darker Brownish Yellow (Level 2, from dark-state2 inspiration)
      3: "rgb(60, 62, 63)",    // Dark Grey (Level 3, from dark-state3 inspiration)
      4: "rgba(85, 85, 85, 0.14)",    // Medium Dark Grey (Ignored)
      5: "rgba(60, 100, 60, 0.68)"    // Dark Green (Known/Mastered)
    };

  // 首先获取弹窗主题模式设置
  chrome.storage.local.get(['tooltipThemeMode'], (result) => {
    const themeMode = result.tooltipThemeMode || 'auto';

    if (themeMode === 'dark') {
      // 固定暗色主题
      applyButtonColors(darkModeColors);
    } else if (themeMode === 'light') {
      // 固定亮色主题
      applyButtonColors(lightModeColors);
    } else {
      // 自动检测模式（跟随当前页面的高亮模式）
      let isDark = false;
      if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.isDarkMode !== undefined) {
        isDark = highlightManager.isDarkMode;
      }
      console.log("当前模式是：", isDark);
      // 根据当前模式选择颜色
      const statusColors = isDark ? darkModeColors : lightModeColors;
      applyButtonColors(statusColors);
    }
  });

  // 应用按钮颜色的内部函数
  function applyButtonColors(statusColors) {
    console.log("状态颜色是：", statusColors);
    // 重置所有按钮样式
    const allButtons = tooltipEl.querySelectorAll(".nav-btn");
    allButtons.forEach(btn => {
      btn.style.backgroundColor = "";
      btn.classList.remove("active-status");
    });

    // 如果有状态，设置对应按钮的颜色
    if (wordStatus !== undefined) {
      const activeButton = tooltipEl.querySelector(`.nav-btn[data-status="${wordStatus}"]`);
      if (activeButton) {
        activeButton.style.backgroundColor = statusColors[wordStatus];
        activeButton.classList.add("active-status");
      }
    }
  }
}

// 更新状态切换按钮的图标和标题
function updateStatusToggleButton(tooltipEl, currentStatus) {
  return;
  const statusToggleBtn = tooltipEl.querySelector('.status-toggle-btn');
  if (!statusToggleBtn) return;

  const svg = statusToggleBtn.querySelector('svg path');

  // 根据当前状态设置不同的图标和标题
  if (currentStatus === "5") {
    // 状态5（已知）- 显示减号图标，点击后变为1
    svg.setAttribute('d', 'M4 24h40');
    statusToggleBtn.setAttribute('title', '设为学习中 (5→1)');
  } else {
    // 状态1或其他 - 显示加号图标，点击后变为5
    svg.setAttribute('d', 'M24 4v40M4 24h40');
    statusToggleBtn.setAttribute('title', '设为已知 (1→5)');
  }
}

  // 刷新标签、翻译及例句数据
  refreshTooltipTags(word, sentence);

  //获取翻译入口 ； 触发AI自动翻译
  refreshTooltipTranslations(word);

  refreshTooltipSentences(word, sentence);

  // 添加弹窗句子解析按钮的点击事件
  const analysisBtn = tooltipEl.querySelector(".analysis-btn");
  if (analysisBtn) {
    analysisBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // 直接使用当前弹窗中的单词和句子信息
        // 获取当前弹窗的位置信息，用于定位分析窗口
        const tooltipRect = tooltipEl.getBoundingClientRect();

        // 播放句子 TTS
        playText({ text: sentence });

        // 高亮句子 - 需要找到单词的详细信息
        const wordDetail = wordRangesMap.get(word.toLowerCase())?.[0];
        if (wordDetail) {
          highlightSentence(wordDetail, sentence);
        }

        // 显示分析窗口 - 创建一个类似于单词rect的对象
        // 这样可以避免传递tooltipRect导致的问题
        const wordRect = {
          left: tooltipRect.left,
          right: tooltipRect.left + 100, // 给一个合理的宽度
          top: tooltipRect.top,
          bottom: tooltipRect.top + 30,  // 给一个合理的高度
          width: 100,
          height: 30
        };

        // 关闭当前tooltip，避免两个窗口同时显示
        closeTooltipWithAnimation();

        // 延迟一下再显示分析窗口，确保tooltip已经关闭
        setTimeout(() => {
          showAnalysisWindow(originalWord, sentence, wordRect);
          console.log("触发弹窗句子解析");
        }, 200);
      } catch (error) {
        console.error('触发弹窗句子解析时发生错误:', error);
      }
    });
  } else {
    console.error('未找到分析按钮元素 .analysis-btn');
  }

  // 添加侧栏句子解析按钮的点击事件
  const sidebarBtn = tooltipEl.querySelector(".sidebar-btn");
  if (sidebarBtn) {
    sidebarBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // 直接使用当前弹窗中的单词和句子信息
        // 播放句子 TTS
        playText({ text: sentence });

        // 高亮句子 - 需要找到单词的详细信息
        const wordDetail = wordRangesMap.get(word.toLowerCase())?.[0];
        if (wordDetail) {
          highlightSentence(wordDetail, sentence);
        }

        // 关闭当前tooltip，避免干扰
        closeTooltipWithAnimation();

        // 延迟一下再打开侧边栏，确保tooltip已经关闭
        setTimeout(() => {
          // 打开侧边栏并发送数据
          openSidebarWithAnalysis(originalWord, sentence);
          console.log("触发侧栏句子解析");
        }, 200);
      } catch (error) {
        console.error('触发侧栏句子解析时发生错误:', error);
      }
    });
  } else {
    console.error('未找到侧栏按钮元素 .sidebar-btn');
  }

  // 添加显示当前句子翻译按钮的点击事件
  const showSentenceTranslationBtn = tooltipEl.querySelector(".show-sentence-translation-btn");
  if (showSentenceTranslationBtn) {
    showSentenceTranslationBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        console.log('点击显示当前句子翻译按钮');
        showCurrentSentenceTranslation(word, sentence);
      } catch (error) {
        console.error('显示当前句子翻译时发生错误:', error);
      }
    });
  } else {
    console.error('未找到显示句子翻译按钮元素 .show-sentence-translation-btn');
  }

  // 添加最小化状态下句子解析按钮的点击事件
  const minimizedAnalysisBtn = tooltipEl.querySelector(".minimized-analysis-btn");
  if (minimizedAnalysisBtn) {
    minimizedAnalysisBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        console.log('点击最小化状态下的句子解析按钮');

        // 复用弹窗句子解析的功能
        // 获取当前弹窗的位置信息，用于定位分析窗口
        const tooltipRect = tooltipEl.getBoundingClientRect();

        // 播放句子 TTS
        playText({ text: sentence });

        // 高亮句子 - 需要找到单词的详细信息
        const wordDetail = wordRangesMap.get(word.toLowerCase())?.[0];
        if (wordDetail) {
          highlightSentence(wordDetail, sentence);
        }

        // 显示分析窗口 - 创建一个类似于单词rect的对象
        // const wordRect = {
        //   left: tooltipRect.left,
        //   right: tooltipRect.left + 100, // 给一个合理的宽度
        //   top: tooltipRect.top,
        //   bottom: tooltipRect.top + 30,  // 给一个合理的高度
        //   width: 100,
        //   height: 30
        // };

        // 关闭当前tooltip，避免两个窗口同时显示
        closeTooltipWithAnimation();

        // 延迟一下再显示分析窗口，确保tooltip已经关闭
        setTimeout(() => {
          showAnalysisWindow(originalWord, sentence, wordRect);
          console.log("触发最小化状态下的句子解析");
        }, 200);
      } catch (error) {
        console.error('触发最小化状态下的句子解析时发生错误:', error);
      }
    });
  } else {
    console.error('未找到最小化状态下的句子解析按钮元素 .minimized-analysis-btn');
  }



  // 修改单词标题的点击事件处理
  const wordTitle = tooltipEl.querySelector(".word-title");
  if (wordTitle) {
    wordTitle.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 阻止默认行为，希望能阻止焦点转移和后续的 click 事件

      // 检查是否使用Orion TTS
      chrome.storage.local.get(['useOrionTTS'], function(result) {
        // 添加null检查，确保tooltipEl存在且tooltip未被销毁
        if (!tooltipEl || tooltipBeingDestroyed) {
          console.error('tooltipEl 为 null 或tooltip正在被销毁，无法处理单词标题点击');
          return;
        }

        const useOrionTTS = result.useOrionTTS === true;

        // 如果使用Orion TTS，且有自定义播放按钮，则不执行播放操作
        // 因为自定义播放按钮有自己的点击事件处理
        const customPlayButton = tooltipEl.querySelector('.custom-play-button');
        if (useOrionTTS && customPlayButton) {
          console.log('Orion TTS模式下，单词标题点击被拦截，请使用自定义播放按钮');
          customPlayButton.click();
          return;
        }

        // 非Orion TTS模式或没有自定义播放按钮时，执行原有的播放逻辑
        try {
          if (typeof playText === 'function') {
            playText({
              sentence: sentence,
              text: word,
              count: 1
            });
          } else {
            console.error('playText function is not available');
          }
        } catch (error) {
          console.error('Error playing text:', error);
        }
      });
    });
  } else {
    console.error('未找到单词标题元素 .word-title');
  }

  // 为声音图标按钮添加单独的点击事件
  const soundIcon = tooltipEl.querySelector(".sound-icon");
  if (soundIcon) {
    soundIcon.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 阻止默认行为
      e.stopPropagation(); // 阻止事件冒泡，防止触发word-title的点击事件

      // 检查是否使用Orion TTS
      chrome.storage.local.get(['useOrionTTS'], function(result) {
        const useOrionTTS = result.useOrionTTS === true;

        // 如果使用Orion TTS，且有自定义播放按钮，则不执行播放操作
        // 因为自定义播放按钮有自己的点击事件处理
        const customPlayButton = tooltipEl.querySelector('.custom-play-button');
        if (useOrionTTS && customPlayButton) {
          console.log('Orion TTS模式下，声音图标点击被拦截，请使用自定义播放按钮');
          return;
        }

        // 非Orion TTS模式或没有自定义播放按钮时，执行原有的播放逻辑
        try {
          if (typeof playText === 'function') {
            playText({
              sentence: sentence,
              text: word,
              count: 1
            });
          } else {
            console.error('playText function is not available');
          }
        } catch (error) {
          console.error('Error playing text:', error);
        }
      });
    });
  } else {
    console.error('未找到声音图标元素 .sound-icon');
  }

  // 在创建 tooltip 后，立即更新单词状态为 1（如果不是已知单词）

  // 这里没必要了， 如果没有添加翻译，就不能变成已知。
  // if (shouldAutoUpdateStatus(word)) {
  //   console.log("蓝变黄3");
  //   updateWordStatus(word, "1", sentence);
  // }



  // 获取语言显示方块元素
  const languageSquare = tooltipEl.querySelector('#languageSquare');
  let currentLanguage = highlightManager.wordDetailsFromDB[word.toLowerCase()]?.language;

  // 初始化显示语言代码，如果缓存中没有语言信息，可以显示 "?" 或者留空
  languageSquare.textContent = currentLanguage || '?';

  // 如果没有语言信息或语言为'auto'，触发AI语言检测
  if (!currentLanguage || currentLanguage === 'auto' || currentLanguage === '?') {
    console.log('触发AI语言检测，当前语言:', currentLanguage);
    if (typeof fetchLanguageDetection === 'function') {
      fetchLanguageDetection(originalWord, sentence).then(detectedLanguage => {
        if (detectedLanguage && detectedLanguage !== false) {
          console.log('AI语言检测完成:', detectedLanguage);
          // 更新显示
          if (languageSquare && !tooltipBeingDestroyed) {
            languageSquare.textContent = detectedLanguage;
          }
          // 更新本地缓存
          if (highlightManager && highlightManager.wordDetailsFromDB) {
            highlightManager.wordDetailsFromDB[originalWord.toLowerCase()] = {
              ...highlightManager.wordDetailsFromDB[originalWord.toLowerCase()],
              language: detectedLanguage
            };
          }
        }
      }).catch(error => {
        console.error('AI语言检测失败:', error);
      });
    } else {
      console.error('fetchLanguageDetection 函数不存在');
    }
  }


  // 添加点击事件以修改语言
  languageSquare.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentLanguage || ''; // 如果没有语言，则为空
      input.style.width = '30px'; // 调整输入框宽度
      input.style.fontSize = '12px';
      input.style.color = globalDarkMode ? '#f0f0f0 ' : '#000000 ';
      input.style.backgroundColor = globalDarkMode ? '#3f3b3b ' : '#f0f0f0 ';
      input.style.textAlign = 'center';
      input.style.position = 'absolute'; // 绝对定位
      input.style.top = languageSquare.offsetTop + 'px'; // 与方块顶部对齐
      input.style.left = languageSquare.offsetLeft + 'px'; // 与方块左侧对齐
      input.style.height = languageSquare.offsetHeight + 'px'; // 与方块高度相同
      input.style.padding = '0';
      input.style.border = '1px solid #888';
      input.style.borderRadius = '3px';
      input.style.outline = 'none';

      languageSquare.parentNode.replaceChild(input, languageSquare);


    input.addEventListener('keydown', function(event) {
      // 尝试阻止事件进一步传播
      event.stopPropagation();
       if (event.key === 'Enter') {
           input.blur(); // 回车时失去焦点，触发 blur 事件
       } else if (event.key === 'Escape') {
           input.value = currentLanguage || ''; // 按 Esc 恢复原值
           input.blur(); // 失去焦点，触发 blur 事件
       }
   });

   input.addEventListener('input', function(event) {
    // 尝试阻止事件进一步传播
    event.stopPropagation();
});

 input.addEventListener('keyup', function(event) {
    // 尝试阻止事件进一步传播
    event.stopPropagation();
});
// --- 新增结束 ---

      input.addEventListener('blur', (e) => {
    // 尝试阻止事件进一步传播
          e.preventDefault();
          e.stopPropagation();
          let newLanguage = input.value.trim().toLowerCase(); // 获取并处理新语言代码
          if (newLanguage === '') newLanguage = null; // 空字符串设为 null

          // 如果语言代码没有变化，则直接恢复显示
          if (newLanguage === (currentLanguage || null)) {
              input.parentNode.replaceChild(languageSquare, input); // 恢复语言方块
              return;
          }

          // 发送消息到 background.js 更新语言
          chrome.runtime.sendMessage({
              action: "ChangeWordLanguage",
              word: originalWord,
              details: { language: newLanguage } // 发送新的语言代码
          }, response => {
              if (response && response.success) {
                  console.log("语言已更新为:", newLanguage);
                  currentLanguage = newLanguage; // 更新当前语言变量
                  languageSquare.textContent = currentLanguage || '?'; // 更新显示

                  // 更新本地缓存
                  highlightManager.wordDetailsFromDB[word.toLowerCase()] = {
                    ...highlightManager.wordDetailsFromDB[word.toLowerCase()],
                    language: newLanguage
                  };
                  console.log("本地缓存已更新:", highlightManager.wordDetailsFromDB[word.toLowerCase()]);
              } else {
                  console.error("更新语言失败");
                  languageSquare.textContent = currentLanguage || '?'; // 恢复旧的显示或 '?'
              }
              input.parentNode.replaceChild(languageSquare, input); // 恢复语言方块
          });
      });



      // input.focus({ preventScroll: true });
      setTimeout(() => {
        // 在下一个事件循环中尝试聚焦，并阻止滚动
        if (input && input.isConnected) { // 确保 input 还在 DOM 中
           input.focus({ preventScroll: true });
        }
    }, 100); // 延迟 0 毫秒



  });

  // 初始化状态切换按钮的图标
  const currentStatus = highlightManager.wordDetailsFromDB[word.toLowerCase()]?.status;
  updateStatusToggleButton(tooltipEl, currentStatus);

  } finally {
    // 清理tooltip创建标记
    tooltipCreationInProgress = false;
  }
}

// =======================
// 修改 handleMouseMoveForTooltip：当鼠标悬停时计算句子并调用扩展的 tooltip
// =======================

// 修改为使用Promise包装chrome.storage.local.get
function getStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key]);
    });
  });
}

// 使用async/await重构handleMouseMoveForTooltip函数
// isOffscreen 是否清空当前tooltip
async function handleMouseMoveForTooltip(e,isOffscreen = false) {
  // 防止重复创建tooltip
  if (tooltipCreationInProgress) {
    console.log("Tooltip创建正在进行中，跳过重复请求");
    return;
  }

  // 清除之前的防抖定时器
  if (tooltipDebounceTimer) {
    clearTimeout(tooltipDebounceTimer);
    tooltipDebounceTimer = null;
  }

  // await 获取数据库总量

  // 获取用户设置的gap值，用于tooltip边界检测
  let userGap = await getStorageValue('tooltipGap');
  userGap = userGap !== undefined ? userGap : 50; // 默认值为50


  // 保存当前鼠标事件
  lastMouseEvent = e;
  // --- 新增：检查坐标的有效性 ---
  if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) {
    console.warn("handleMouseMoveForTooltip: 无效的鼠标坐标", e.clientX, e.clientY);
    return; // 坐标无效，提前返回
  }
  // --- 检查结束 ---
  let parent = getParentAtPoint(e.clientX, e.clientY);
  // 使用await等待获取设置值
  const autoCloseTooltip = await getStorageValue('autoCloseTooltip');
  const autoRefreshTooltip = await getStorageValue('autoRefreshTooltip');

  if (!autoCloseTooltip && tooltipEl) {
    // console.log("autoCloseTooltip 为 false，小窗存在,不做操作");
    // console.log("autoRefreshTooltip 为:", autoRefreshTooltip);

    if (!autoRefreshTooltip) {
      // 如果没有启用新单词刷新小窗功能，则保持原来的行为
      // 注意：这里不需要清理监听器，因为这是在handleMouseMoveForTooltip函数中，
      // 不是在showEnhancedTooltipForWord函数中，监听器还没有被添加
      return;
    }

  }

  // 如果当前 tooltip 已显示且鼠标仍在 tooltip 单词高亮上面，则不进行操作
  if (tooltipEl) {
    // console.log("tooltipEl 已显示，鼠标在上面");
    const tooltipRect = tooltipEl.getBoundingClientRect();
    // 为顶部和底部添加用户设置的gap值冗余区域，避免鼠标在边缘时弹窗消失
    if (e.clientX >= tooltipRect.left && e.clientX <= tooltipRect.right &&
        e.clientY >= (tooltipRect.top - userGap-2) && e.clientY <= (tooltipRect.bottom + userGap +2)) {
      return;
    }
  }

  // 在鼠标事件中使用
  let hoveredDetail = null;
  let hoveredRect = null;
// range肯定是是所有单词都有的
  const word = getWordAtPoint(e.clientX, e.clientY);
  if (word) {
    // console.log("鼠标所在单词为:", word);
    let wordRangesArrays   = wordRangesMap.get(word.toLowerCase());
    // console.log("wordRangesArrays:  ", wordRangesArrays);

    if (wordRangesArrays) {
    for (const detail of wordRangesArrays) {
      const rect = detail.range.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        // 确保单词有小写版本，便于后续比较
        if (detail.word) {
          detail.wordLower = detail.word.toLowerCase();
        }
        hoveredDetail = detail;
        hoveredRect = rect;
        // console.log("hoveredDetail:  ", hoveredDetail);
        // console.log("hoveredRect:  ", hoveredRect);
        break;
      }
    }
  }
  let isAutoWordTTSEnabled  =  false;

  }

  // 新增：检查 hoveredDetail 是否有效
  if (!hoveredDetail) {
    // console.warn("handleMouseMoveForTooltip: 未找到鼠标悬停的单词细节。");
    clearTimeout(ttsDebounceTimer); // 清除可能存在的TTS定时器
    // 如果没有找到hoveredDetail，后续逻辑无法进行，可以考虑直接返回或采取其他措施
    // 这里暂时不返回，允许后续可能的清理逻辑执行
    // return;
  } else {
    // 仅当 hoveredDetail 有效时才执行以下逻辑
    const sentence1 = getSentenceForWord(hoveredDetail);

    // 新增：检查 hoveredDetail.word 是否有效
    if (!hoveredDetail.word) {
      console.error("handleMouseMoveForTooltip: hoveredDetail 存在，但其 word 属性无效。");
      clearTimeout(ttsDebounceTimer);
    } else {
      const currentWordLower = hoveredDetail.word.toLowerCase(); // 获取小写单词用于比较

      // 清除上一个TTS防抖定时器
      clearTimeout(ttsDebounceTimer);

      // 检查当前单词是否与上次 *播放* 的不同
      if (currentWordLower !== lastPlayedTTSWord) {
        // 获取开关状态
        isAutoWordTTSEnabled = await getStorageValue('enableAutoWordTTS');

        // 只有在开关启用时才设置防抖和播放
        if (isAutoWordTTSEnabled) {
          // 先停止当前可能正在播放的TTS，避免冲突
          try {
            if (typeof stopSpecificAudioType === 'function') {
              stopSpecificAudioType('word');
            }
          } catch (error) {
            console.error('停止TTS播放时发生错误:', error);
          }

          // 设置新的防抖定时器
          ttsDebounceTimer = setTimeout(async () => {
            // 只有当鼠标停留足够长时间后才播放
            try {
              if (typeof playText === 'function') {
                // 再次检查，确保 hoveredDetail 和 hoveredDetail.word 仍然有效
                if (hoveredDetail && hoveredDetail.word && currentWordLower === hoveredDetail.word.toLowerCase() && currentWordLower !== lastPlayedTTSWord) {
                  // 再次停止可能的音频播放，确保没有冲突
                  if (typeof stopSpecificAudioType === 'function') {
                    stopSpecificAudioType('word');
                  }

                  // 短暂延迟后播放，确保停止操作完成
                  setTimeout(() => {
                    playText({
                      sentence: sentence1, // 使用 外层作用域的 sentence1
                      text: hoveredDetail.word,
                      count: 1
                    });
                    lastPlayedTTSWord = currentWordLower; // 更新上次播放的单词
                  }, 50); // 50毫秒延迟确保停止操作完成
                }
              }
            } catch (error) {
              console.error('播放 TTS 时发生错误:', error);
            }
          }, 300); // 300毫秒延迟
        }
      }
    }
  }



  // console.log("hoveredRect: 2222", hoveredRect);
  // console.log("hoveredDetail 2222:", hoveredDetail);
//
if (hoveredDetail) {
  // console.log("hoveredDetail: 3333", hoveredDetail);
  // 使用小写单词进行比较
  const wordLower = hoveredDetail.wordLower || hoveredDetail.word.toLowerCase();
  // console.log("鼠标悬停的单词是：",wordLower);



// 比较当前tooltipWord时也使用小写
  //currentTooltipWordLower 等于是 当前tooltipWord的小写版本
  const currentTooltipWordLower = currentTooltipWord ? currentTooltipWord.toLowerCase() : null;
  // console.log("当前窗口的单词是：",currentTooltipWordLower);




  //如果当前tooltipWord与鼠标悬停的单词不一致，则移除当前tooltip，并显示新的tooltip
  if (currentTooltipWordLower !== wordLower) {//如果当前tooltipWord与鼠标悬停的单词不一致，则移除当前tooltip，并判断单词是否已知
    // console.log("当前窗口的单词与鼠标悬停的单词不一致，移除当前tooltip，并判断单词是否已知");


  //如果autoRefreshTooltip为true，这里是非高亮单词，则不关闭当前小窗并继续执行显示新单词
  if (autoRefreshTooltip) {
    // console.log("autoRefreshTooltip 为 true，当前单词和弹窗不一致，但不关闭当前小窗");
  } else {
    //如果autoRefreshTooltip为false，
    closeTooltipWithAnimation(); // <-- 调用新函数关闭 tooltip
  }


  }else{
    // console.log("当前窗口的单词与鼠标悬停的单词一致,啥也不做");
    return
  }




  //当前单词是已知单词，那就啥也不干；不显示新窗口。
  //但是没必要关闭小窗，因为鼠标移动出去范围，会自动关闭小窗
  //如果当前单词是已知单词，那就啥也不干；不显示新窗口。
  //或者不一致，也会关闭。这里没必要判断了。


     // 等待获取autoExpandTooltip设置 自动展开未高亮单词的小窗
     const autoExpand = await getStorageValue('autoExpandTooltip') || false;
     // console.log("autoExpand 为:", autoExpand);


     //这里，如果是点击触发，就显示小窗了。
     //如果是自动触发，则不显示小窗。

     // 使用 await 获取 clickOnlyTooltip 设置
     const clickOnlyMode = await getStorageValue('clickOnlyTooltip') || false;

     if(clickOnlyMode){
        // console.log("clickOnlyMode 为:", clickOnlyMode);
        // 如果是仅点击模式，这里不需要阻止，因为 handleMouseMoveForTooltip 可能是由点击触发的
        // console.log("点击触发小窗");
     } else {
        console.log("自动触发小窗 (非仅点击模式)");

        // 检查单词是否已知（状态5）
        const isKnownWord = highlightManager && highlightManager.wordDetailsFromDB &&
                           highlightManager.wordDetailsFromDB[wordLower] &&
                           highlightManager.wordDetailsFromDB[wordLower].status === "5";

        if (isKnownWord) {
            console.log("鼠标悬停的单词是已知单词（状态5）");

            if (!autoExpand) {
              console.log("autoExpand 为:", autoExpand);
              console.log("单词已知且autoExpand为false，不显示新窗口");
              return; // 阻止后续代码执行，不显示小窗
            }
            // 如果 autoExpand 为 true，即使是已知单词也可能需要显示（取决于后续逻辑）
            console.log("鼠标悬停的单词是已知单词，但 autoExpand 为 true，继续执行");

        } else {
            console.log("鼠标悬停的单词是未知单词，显示新窗口");
            // 未知单词总是会尝试显示小窗，不受 autoExpand 影响
        }

        console.log("autoExpand (用于已知单词判断):", autoExpand);
     }


     // 只有当上面的条件不满足时，才会执行到这里
     // console.log("将显示新窗口");

  // 检查是否为已知单词时使用小写比较，大小写就不再弹窗。


  // console.log("鼠标悬停的单词不是已知单词，也没有小窗，将打开小窗");



  // console.log("播放 TTS");


  // 显示扩展 tooltip，小窗显示在单词下方

  // === 新增：爆炸优先模式检测 ===
  // 使用缓存的explosionPriorityMode变量，无需await读取storage
  // 只有当爆炸优先模式开启 AND 单词爆炸功能启用时才执行
  if (explosionPriorityMode && a4_wordExplosionEnabled && isOffscreen) {
    // 检查爆炸弹窗是否可用
    const isExplosionAvailable = typeof isWordExplosionVisible === 'function' &&
                                  typeof isWordInCurrentExplosionSentence === 'function';

    if (isExplosionAvailable) {
      const explosionVisible = isWordExplosionVisible();

      if (!explosionVisible) {
        // 爆炸弹窗未显示，阻止a4弹窗触发
        console.log('[A4] 爆炸优先模式：爆炸弹窗未显示，阻止单词查询弹窗');
        return;
      }

      // 爆炸弹窗已显示，检查点击的单词是否在当前爆炸句子中
      const wordInExplosion = isWordInCurrentExplosionSentence(hoveredDetail.word);

      if (!wordInExplosion) {
        // 单词不在当前爆炸句子中，阻止a4弹窗，让a7处理（切换爆炸弹窗）
        console.log('[A4] 爆炸优先模式：单词不在当前爆炸句子中，阻止单词查询弹窗');
        return;
      }

      // 单词在当前爆炸句子中，允许显示单词查询弹窗
      console.log('[A4] 爆炸优先模式：单词在当前爆炸句子中，允许显示单词查询弹窗');
    }
  }
  // === 爆炸优先模式检测结束 ===

  // 函数耗时检测：
  // console.time('showEnhancedTooltipForWord');
  //这才要获取句子，然后显示弹窗
  if (isOffscreen) {
  //更新当前窗口的单词
  currentTooltipWord = hoveredDetail.word;
  const sentence = getSentenceForWord(hoveredDetail);
    console.log("originalWord",hoveredDetail.word);
    // console.log("鼠标已停留500ms，尝试检测单词，isOffscreen为true");

    // 先显示弹窗，不等待TTS
    showEnhancedTooltipForWord(hoveredDetail.word, sentence, hoveredRect, parent, hoveredDetail.word);

    // 然后异步播放TTS，不阻塞弹窗显示
    //isAutoWordTTSEnabled 如果开启，这里就不用播放tts了
    if (!isAutoWordTTSEnabled) {
      // 使用 setTimeout 确保完全异步，不阻塞弹窗
      setTimeout(() => {
        try {
          if (typeof playText === 'function') {
            playText({
              sentence: sentence,
              text: hoveredDetail.word,
              count: 1
            });
          }
        } catch (error) {
          console.error('播放 TTS 时发生错误:', error);
        }
      }, 0);
    }
  } else {
    // console.log("不播放音频，不显示小窗");
    closeTooltipWithAnimation(); // <-- 调用新函数关闭 tooltip
  }


  // console.timeEnd('showEnhancedTooltipForWord');


//否则啥也不做；这个逻辑对Q快捷键也要适用


} else {
  // console.log("没有鼠标悬停的单词，删除空格监听");
  //如果当前没有小窗就  删除空格监听

  // 获取 autoCloseTooltip 设置
  // 如果 autoCloseTooltip 为 true，则删除空格监听




  // if (tooltipSpaceKeyListener) { // <-- 移除旧的判断和移除
  //   document.removeEventListener("keydown", tooltipSpaceKeyListener);
  //   tooltipSpaceKeyListener = null;
  // } // <-- 移除旧的判断和移除


  if (autoCloseTooltip) {
    // console.log("autoCloseTooltip 为 true，关闭当前小窗");
    closeTooltipWithAnimation(); // <-- 调用新函数关闭 tooltip
  }

  //如果autoRefreshTooltip为true，这里是非高亮单词，则不关闭当前小窗并继续执行显示新单词
  if (autoRefreshTooltip) {
    // console.log("autoRefreshTooltip 为 true，不关闭当前小窗并继续执行显示新单词");
  } else {

    //如果autoRefreshTooltip为false，
    //真的是false,
    //要么就是默认关闭自动关闭所有,鼠标离开就关闭

    //这里得判断一下，这个单词，是不是他妈的已知单词
    //如果是已知单词，则不关闭当前小窗
    //如果不是已知单词，则关闭当前小窗

    closeTooltipWithAnimation(); // <-- 调用新函数关闭 tooltip





    // console.log("autoRefreshTooltip 为 false，啥也不做");
  }








  //删除空格监听

}





  }



// 创建Shadow DOM容器 - 使用保护机制
const shadowHost = document.createElement('lingkuma-tooltip-root'); // 改用自定义标签
shadowHost.id = 'lingkuma-tooltip-host';

// 重写remove方法
Object.defineProperty(shadowHost, 'remove', {
  configurable: false,
  writable: false,
  value: () => {
    console.log('阻止移除tooltip');
    return false;
  }
});

// 使用closed模式
const shadowRoot = shadowHost.attachShadow({ mode: 'closed' }); // 改为closed

// 挂载到documentElement
document.documentElement.appendChild(shadowHost);

// 添加MutationObserver保护
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      const removedNodes = Array.from(mutation.removedNodes);
      if (removedNodes.includes(shadowHost)) {
        console.log('检测到tooltip被移除，正在恢复...');
        document.documentElement.appendChild(shadowHost);
      }
    }
  }
});

observer.observe(document.documentElement, {
  childList: true
});

// 这里不再需要重复声明背景变量，因为我们已经在文件开头声明了



// 输出字体URL到控制台，用于调试
const fontUrl = chrome.runtime.getURL("src/fonts/LXGWWenKaiGBLite-Regular.ttf");
const fanwoodFontUrl = chrome.runtime.getURL("src/fonts/Fanwood.otf");
// 使用encodeURIComponent处理文件名中的空格
const fanwoodBoldFontUrl = chrome.runtime.getURL("src/fonts/Fanwood_Bold.otf").replace(/ /g, "%20");
const fanwoodItalicFontUrl = chrome.runtime.getURL("src/fonts/Fanwood_Italic.otf").replace(/ /g, "%20");
// console.log("字体URL:", fontUrl);
// console.log("Fanwood字体URL:", fanwoodFontUrl);
// console.log("Fanwood_Bold字体URL:", fanwoodBoldFontUrl);
// console.log("Fanwood_Italic字体URL:", fanwoodItalicFontUrl);

// 检查字体文件是否存在
// fetch(fontUrl)
//   .then(response => {
//     if (response.ok) {
//       console.log("字体文件存在并可访问");
//     } else {
//       console.error("字体文件不存在或无法访问:", response.status, response.statusText);
//     }
//   })
//   .catch(error => {
//     console.error("获取字体文件时出错:", error);
//   });

// 在document中添加字体样式，确保全局可用
const globalFontStyle = document.createElement('style');
globalFontStyle.textContent = `
@font-face {
    font-family: 'LXGWWenKai';
    src: url('${fontUrl}') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: 'Fanwood';
    src: url('${fanwoodFontUrl}') format('opentype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: 'Fanwood';
    src: url('${fanwoodBoldFontUrl}') format('opentype');
    font-weight: bold;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: 'Fanwood';
    src: url('${fanwoodItalicFontUrl}') format('opentype');
    font-weight: normal;
    font-style: italic;
    font-display: swap;
}

`;
document.head.appendChild(globalFontStyle);

// 直接创建字体对象并加载
const font = new FontFace('LXGWWenKai', `url('${fontUrl}')`);
font.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  // console.log('LXGWWenKai字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('LXGWWenKai字体加载失败:', error);
});

// 加载Fanwood字体（常规）
const fanwoodFont = new FontFace('Fanwood', `url('${fanwoodFontUrl}')`, { weight: 'normal', style: 'normal' });
fanwoodFont.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  // console.log('Fanwood常规字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('Fanwood常规字体加载失败:', error);
});

// 加载Fanwood_Bold字体（粗体）
const fanwoodBoldFont = new FontFace('Fanwood', `url('${fanwoodBoldFontUrl}')`, { weight: 'bold', style: 'normal' });
fanwoodBoldFont.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  // console.log('Fanwood粗体字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('Fanwood粗体字体加载失败:', error);
});

// 加载Fanwood_Italic字体（斜体）
const fanwoodItalicFont = new FontFace('Fanwood', `url('${fanwoodItalicFontUrl}')`, { weight: 'normal', style: 'italic' });
fanwoodItalicFont.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  // console.log('Fanwood斜体字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('Fanwood斜体字体加载失败:', error);
});



// 在shadowRoot中也添加字体样式
const fontStyle = document.createElement('style');
fontStyle.textContent = `
@font-face {
    font-family: 'LXGWWenKai';
    src: url('${fontUrl}') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: 'Fanwood';
    src: url('${fanwoodFontUrl}') format('opentype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: 'Fanwood';
    src: url('${fanwoodBoldFontUrl}') format('opentype');
    font-weight: bold;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: 'Fanwood';
    src: url('${fanwoodItalicFontUrl}') format('opentype');
    font-weight: normal;
    font-style: italic;
    font-display: swap;
}

`;
shadowRoot.appendChild(fontStyle);



// 添加主样式
const style = document.createElement('style');
style.textContent = `

/* --- 新增 :host 规则 --- */
:host {
    /*position: absolute !important; */
    /*left: 0px !important; */
    /*top: 0px !important; */
    z-index: 2147483647 !important;
    display: block;
    padding: 0px !important;
    margin: 0px !important;
}
/* --- :host 规则结束 --- */

:root {
    border-radius: 20px;
    /* 亮色主题变量 */
    --background-color: #ffffff;
    --text-color: #000000;
    --secondary-text-color: #666666;
    --border-color: #dddddd;
    --tag-background: #f0f0f0;
    --translation-background: #f5f5f5;
    --number-badge-background: #FFE591;
    --confirm-button-background: #4CAF50;
    --confirm-button-color: white;
}

/* 暗色主题变量 - 后续可以通过 JS 切换 html 的 class 来启用 */
html[data-theme='dark'] {
    --background-color: #1a1a1a;
    --text-color: #ffffff;
    --secondary-text-color: #999999;
    --border-color: #333333;
    --tag-background: #333333;
    --translation-background: #2a2a2a;
    --number-badge-background: #FFE591;
    --confirm-button-background: #4CAF50;
    --confirm-button-color: white;
}

/* 解决Orion浏览器中SVG图标显示蓝色的问题 - 通用修复 */
svg path {
    stroke: currentColor; /* 使用当前文本颜色 */
}

/* 所有SVG图标在亮色模式下强制设置为黑色 */
.tooltip-action-btn svg path,
.translation-action-btn svg path,
.add-translation svg path,
.delete-translation svg path,
.add-ai-translation svg path,
.remove-tag svg path,
.nav-btn svg path {
    stroke: #000000 !important; /* 亮色模式下强制设置为黑色 */
}

/* 所有SVG图标在暗色模式下强制设置为白色 */
.dark-mode .tooltip-action-btn svg path,
.dark-mode .translation-action-btn svg path,
.dark-mode .add-translation svg path,
.dark-mode .delete-translation svg path,
.dark-mode .add-ai-translation svg path,
.dark-mode .remove-tag svg path,
.dark-mode .nav-btn svg path {
    stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */
}

body {

    border-radius: 20px;
    margin: 0;
    padding: 0;
    font-family: "Fanwood","LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
}

/* 词汇弹窗容器 max-height: 727px; */
.vocab-tooltip {
    font-family: "Fanwood","LXGWWenKai", "PingFang SC","Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol" !important; /* <--- 添加自定义字体 */
    max-width: 392px; /* 最大宽度 */
    height: auto;
    max-height: calc(100vh - 192px);
    background-color: #FBFAF5;
    color:rgb(0, 0, 0);
    box-shadow: 0 .5em 1em -0.125em rgba(9,26,47,.25),0 0px 0 1px rgba(9,26,47,.1);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* 防止整体出现滚动条 */
    position: absolute; /* 作为弹窗定位 */
    z-index: 2147483647; /* 确保在其他元素之上 */
    border-radius: 20px;
    opacity: 0; /* <--- 添加：初始透明度为 0 */
    transition: opacity 0.08s ease-in-out; /* <--- 添加：透明度过渡效果 弹出动画 */
    text-indent: 0em !important;
    /* 添加硬件加速和优化属性 */
    will-change: opacity, transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    -webkit-font-smoothing: subpixel-antialiased;
}

/* 在Bionic模式下禁用所有过渡效果 */
.vocab-tooltip.bionic-active,
.vocab-tooltip.bionic-active * {
    transition: none !important;
    animation: none !important;
}

/* 竖排文本保护样式 - 确保弹窗在竖排页面中保持横向显示 */
.vocab-tooltip.vertical-text-protection {
    writing-mode: horizontal-tb !important;
    -webkit-writing-mode: horizontal-tb !important;
    -moz-writing-mode: horizontal-tb !important;
    -ms-writing-mode: horizontal-tb !important;
    text-orientation: mixed !important;
    -webkit-text-orientation: mixed !important;
    direction: ltr !important;
    unicode-bidi: normal !important;
}

/* 确保弹窗内所有子元素也保持横向 */
.vocab-tooltip.vertical-text-protection * {
    writing-mode: horizontal-tb !important;
    -webkit-writing-mode: horizontal-tb !important;
    -moz-writing-mode: horizontal-tb !important;
    -ms-writing-mode: horizontal-tb !important;
    text-orientation: mixed !important;
    -webkit-text-orientation: mixed !important;
    direction: ltr !important;
    unicode-bidi: normal !important;
}

/* 背景装饰元素 - 支持图片和视频 */
.vocab-tooltip::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: none; /* 默认不显示背景图片，将通过JS动态设置 */
    background-repeat: repeat; /* 假设是可平铺的花纹 */
    background-size: 100% auto; /* 修改：使用百分比控制背景图片（单元）的大小 */
    /*  opacity: 0.5;设置花纹透明度，可调整 */
    filter: brightness(70%);
    z-index: 0; /* 位于背景色之上，内容之下 */
    pointer-events: none; /* 不阻挡鼠标事件 */
    border-radius: inherit; /* 继承父元素的圆角 */
}





/* 视频背景样式 */
.tooltip-video-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top; /* 确保视频从顶部开始显示，保持顶部对齐 */
   /* opacity: 0.05; */
    filter: brightness(70%);
    z-index: 0;
    pointer-events: none;
    border-radius: inherit;
}


/* 固定顶栏 */
.fixed-header {
    flex-shrink: 0;
    background: transparent; /* 改为透明，让父级背景色和花纹透出来 */
    padding: 2px 16px 2px;  /* 减少底部padding从16px到8px */
    border-bottom: 1px solid rgb(213,216,220);
    z-index: 1; /* 提升层级，位于伪元素之上 */
    position: relative; /* 创建新的堆叠上下文 */
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    height: auto; /* 允许高度自适应 */
}

/* 可滚动的中间内容区域 */
.scrollable-content {
    font-size: 16px !important;
    flex: 1;
    overflow-y: auto; /* 使用标准的auto值，确保滚动条行为一致 */
    padding: 5px 16px 0;  /* 顶部和左右添加padding，底部不加 */
    position: relative; /* 创建新的堆叠上下文 */
    z-index: 1; /* 提升层级 */
    background: transparent; /* 改为透明 */
    /* 移除重复的overflow-y设置，避免滚动条闪现问题 */
}

/* 固定底栏 */
.fixed-footer {
    flex-shrink: 0;
    background: transparent; /* 改为透明 */
    padding: 10px 16px;  /* 从16px减小到12px */
    padding-bottom: 1px;
    border-top: 1px solid rgb(213,216,220);
    z-index: 1; /* 提升层级 */
    position: relative; /* 创建新的堆叠上下文 */
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
}

/* 调整内容区域的padding */
.header,
.tags,
.section,
.bottom-nav {
    padding-left: 16px;
    padding-right: 16px;
}

/* 第一个元素顶部padding */
.header {
    padding-top: 0px;
}

/* 最后一个元素底部padding */
.bottom-nav {
  /*    padding: 8px 0; 从12px减小到8px */
    margin-bottom: 0;
}

.translation-list {
    /* 移除了边框 */
    margin: 0;
    border-radius: 0;
    /* 移除了 border-top */
    /* 移除了 box-shadow */
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
   /* margin-bottom: 0px;*/
}

.word-title {
    margin-left: -11px;
    font-family: 'LXGWWenKai' !important;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 3px;
    font-weight: 500 !important;
    text-shadow: var(--text-shadow, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff); /* 添加可变描边效果 */
}

.word-title span {
    font-size: 18px;
    font-weight: bold;

}

.sound-icon {
    cursor: pointer;
    color: var(--secondary-text-color);
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease-in-out;
}

/* --- 新增：sound-icon 悬停动画 --- */
.sound-icon:hover {
    transform: scale(1.1);
}
/* --- 动画结束 --- */

/* 添加句子解析按钮样式 */
.tooltip-action-btn {
    cursor: pointer;
    color: var(--secondary-text-color);
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.1s, color 0.1s, transform 0.1s ease-in-out;
}

.tooltip-action-btn:hover {
   /*  background-color: rgba(0, 0, 0, 0.05);*/
    color: #007bff;
    transform: scale(1.1);
}


.Notes {
    cursor: pointer;
    color: var(--secondary-text-color);
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    /* 在非Bionic模式下使用过渡效果 */
    transition: none; /* 默认不使用过渡，由JS根据Bionic模式动态设置 */
}


.Notes:hover {
    /* background-color: rgba(0, 0, 0, 0.05);*/
    color: #007bff;
    transform: scale(1.1);
}


.tooltip-action-btn svg {
    width: 34px;
    height: 34px;
}

.sound-icon svg {
    width: 42px;
    height: 22px;
}

.sound-icon svg path {
    stroke: var(--text-color); /* 使用主题颜色 */
    stroke: #000000; /* 强制设置为黑色，解决Orion浏览器显示蓝色的问题 */
}

/* 确保按钮在暗色模式下也能正常显示 */
html[data-theme='dark'] .sound-icon svg path {
    stroke: var(--text-color);
    stroke: #ffffff; /* 强制设置为白色，确保在暗色模式下可见 */
}

/* 右上角菜单按钮样式 - 对焦框图标 */
.header-menu-toggle-btn {
    cursor: pointer;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    transition: all 0.2s ease-in-out;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 0px;
    right: 0px;
    z-index: 100;
    width: 32px;
    height: 32px;
}

.header-menu-toggle-btn:hover {
    transform: scale(1.1);
}

.header-menu-toggle-btn svg {
    width: 32px;
    height: 32px;
    color: rgba(0, 0, 0, 0.4);
}

.header-menu-toggle-btn:hover svg {
    color: rgba(0, 0, 0, 0.65);
}

.dark-mode .header-menu-toggle-btn svg {
    color: rgba(255, 255, 255, 0.4);
}

.dark-mode .header-menu-toggle-btn:hover svg {
    color: rgba(255, 255, 255, 0.65);
}

/* 胶囊包装器样式 */
.capsules-wrapper {
    opacity: 0;
    /* transform由JS控制，包含scale和translateY */
    transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
    pointer-events: none;
}

.capsules-wrapper.show {
    opacity: 1;
    /* transform由JS控制，不在这里设置 */
    pointer-events: auto;
}

.capsules-wrapper.show .header-buttons-capsule {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

/* 胶囊按钮容器样式 */
.header-buttons-capsule {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background: #FBFAF5;
    backdrop-filter: blur(10px);
    border-radius: 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 2147483646;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
    pointer-events: none;
}

.header-buttons-capsule.show {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

/* 胶囊容器暗色模式 - 直接应用在胶囊元素上 */
.header-buttons-capsule.dark-mode {
    background: rgba(34, 34, 34, 1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* 胶囊内按钮样式 */
.header-buttons-capsule button {
    cursor: pointer;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    transition: all 0.2s ease-in-out;
    padding: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
}

.header-buttons-capsule button:hover {
    transform: scale(1.1);
    background: rgba(0, 0, 0, 0.1);
}

/* 胶囊按钮暗色模式 */
.header-buttons-capsule.dark-mode button {
    background: rgba(255, 255, 255, 0.05);
}

.header-buttons-capsule.dark-mode button:hover {
    background: rgba(255, 255, 255, 0.1);
}

.header-buttons-capsule button svg {
    width: 20px;
    height: 20px;
}

.header-buttons-capsule button svg path,
.header-buttons-capsule button svg rect,
.header-buttons-capsule button svg circle {
    stroke: #000000;
}

/* 胶囊按钮图标暗色模式 */
.header-buttons-capsule.dark-mode button svg path,
.header-buttons-capsule.dark-mode button svg rect,
.header-buttons-capsule.dark-mode button svg circle {
    stroke: #ffffff;
}

/* ========== 胶囊玻璃效果样式 ========== */

/* Firefox CSS玻璃效果 - 胶囊 */
.header-buttons-capsule.firefox-glass-effect {
    background: rgba(255, 255, 255, 0.15) !important;
    backdrop-filter: blur(20px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1) !important;
}

.header-buttons-capsule.firefox-glass-effect.dark-mode {
    background: rgba(0, 0, 0, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
}

/* 液体玻璃效果 - 胶囊 */
.header-buttons-capsule.liquid-glass-active {
    background: linear-gradient(135deg,
        rgba(255, 255, 255, 0.15) 0%,
        rgba(255, 255, 255, 0.08) 50%,
        rgba(255, 255, 255, 0.12) 100%) !important;
    backdrop-filter: blur(20px) saturate(180%) brightness(1.1) !important;
    -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.3) !important;
    box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.4),
        inset 0 -1px 0 rgba(255, 255, 255, 0.1) !important;
}

.header-buttons-capsule.liquid-glass-active.dark-mode {
    background: linear-gradient(135deg,
        rgba(0, 0, 0, 0.3) 0%,
        rgba(0, 0, 0, 0.2) 50%,
        rgba(0, 0, 0, 0.25) 100%) !important;
    backdrop-filter: blur(20px) saturate(180%) brightness(0.9) !important;
    -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(0.9) !important;
    border: 1px solid rgba(255, 255, 255, 0.15) !important;
    box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        inset 0 -1px 0 rgba(0, 0, 0, 0.2) !important;
}

/* 玻璃效果下的按钮样式优化 */
.header-buttons-capsule.firefox-glass-effect button,
.header-buttons-capsule.liquid-glass-active button {
    background: rgba(255, 255, 255, 0.1) !important;
}

.header-buttons-capsule.firefox-glass-effect button:hover,
.header-buttons-capsule.liquid-glass-active button:hover {
    background: rgba(255, 255, 255, 0.2) !important;
}

.header-buttons-capsule.firefox-glass-effect.dark-mode button,
.header-buttons-capsule.liquid-glass-active.dark-mode button {
    background: rgba(255, 255, 255, 0.08) !important;
}

.header-buttons-capsule.firefox-glass-effect.dark-mode button:hover,
.header-buttons-capsule.liquid-glass-active.dark-mode button:hover {
    background: rgba(255, 255, 255, 0.15) !important;
}

/* 按钮组容器样式（保留原有的，但现在默认隐藏） */
.header-buttons-container {
    display: flex;
    align-items: center;
    gap: 2px; /* 按钮间距设置为2px */
    margin-left: auto; /* 在父容器中靠右对齐 */
    margin-right: -20px;
}

/* 液体玻璃开关按钮样式 */
.liquid-glass-toggle-btn {
    cursor: pointer;
    border-radius: 50%;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    transition: all 0.2s ease-in-out;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.liquid-glass-toggle-btn:hover {
    transform: scale(1.1);
   /* background: rgba(0, 0, 0, 0.1);*/
}

.dark-mode .liquid-glass-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.1);
}

.liquid-glass-toggle-btn svg {
    transition: all 0.2s ease-in-out;
}

/* 液体玻璃激活状态样式 */
.vocab-tooltip.liquid-glass-active {
    background-color: rgba(255, 255, 255, 0.05) !important;
    backdrop-filter: none !important;
    box-shadow: unset !important;
    will-change: unset !important;
}

.vocab-tooltip.liquid-glass-active.dark-mode {
    background-color: rgba(0, 0, 0, 0.05) !important;
}

/* 液体玻璃激活时隐藏背景装饰 */
.vocab-tooltip.liquid-glass-active::before {
    display: none !important;
}

/* 液体玻璃激活时隐藏视频背景 */
.vocab-tooltip.liquid-glass-active .tooltip-video-background {
    display: none !important;
}

/* Firefox CSS玻璃效果样式 */
.vocab-tooltip.firefox-glass-effect {
    background: rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(20px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1) !important;
}

.vocab-tooltip.firefox-glass-effect.dark-mode {
    background: rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
}

/* Firefox玻璃效果下的内容区域 */
.vocab-tooltip.firefox-glass-effect .scrollable-content {
    background: rgba(255, 255, 255, 0.05) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    /*border-radius: 8px;*/
}

.vocab-tooltip.firefox-glass-effect.dark-mode .scrollable-content {
    background: rgba(0, 0, 0, 0.1) !important;
}

/* Firefox玻璃效果下的翻译项 */
.vocab-tooltip.firefox-glass-effect .translation-item {
    position: relative;
    padding-right: 60px;
    background: rgb(35 27 27 / 10%) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 10px;
    margin: 4px;
}

.vocab-tooltip.firefox-glass-effect .translation-item:hover {
    background: rgba(255, 255, 255, 0.2) !important;
}

.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item {
    background: rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item:hover {
    background: rgba(0, 0, 0, 0.3) !important;
}

/* Firefox玻璃效果下的AI推荐 */
.vocab-tooltip.firefox-glass-effect .ai-recommendation {
    margin-top: 8px;
    padding: 8px;
    background: rgba(0, 123, 255, 0.2) !important;
    backdrop-filter: blur(15px) !important;
    -webkit-backdrop-filter: blur(15px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-left: 3px solid #007bff !important; /* 保留蓝色左边框 */
    border-radius: 6px;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}

.vocab-tooltip.firefox-glass-effect.dark-mode .ai-recommendation {
    background: rgba(0, 123, 255, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-left: 3px solid #0099ff !important; /* 保留暗色模式的蓝色左边框 */
}

/* Firefox玻璃效果下的第二个AI推荐 */
.vocab-tooltip.firefox-glass-effect .ai-recommendation-2 {
    margin-top: 8px;
    padding: 8px;
    background: rgba(255, 123, 0, 0.2) !important;
    backdrop-filter: blur(15px) !important;
    -webkit-backdrop-filter: blur(15px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-left: 3px solid #ff7b00 !important; /* 橙色左边框 */
    border-radius: 6px;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}

.vocab-tooltip.firefox-glass-effect.dark-mode .ai-recommendation-2 {
    background: rgba(255, 123, 0, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-left: 3px solid #ff9933 !important; /* 保留暗色模式的橙色左边框 */
}

/* Firefox玻璃效果下隐藏背景装饰 */
.vocab-tooltip.firefox-glass-effect::before {
    display: none !important;
}

/* Firefox玻璃效果下隐藏视频背景 */
.vocab-tooltip.firefox-glass-effect .tooltip-video-background {
    display: none !important;
}

/* Firefox玻璃效果下的最小化状态样式 */
.vocab-tooltip.firefox-glass-effect.minimized .translation-item {
    position: relative;
    padding-right: 60px;
    background: rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 10px;
    margin: 4px;
    font-weight: bold;
}

.vocab-tooltip.firefox-glass-effect.minimized .translation-item:hover {
    background: rgba(255, 255, 255, 0.2) !important;
}

.vocab-tooltip.firefox-glass-effect.minimized.dark-mode .translation-item {
    background: rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    font-weight: bold;
}

.vocab-tooltip.firefox-glass-effect.minimized.dark-mode .translation-item:hover {
    background: rgba(0, 0, 0, 0.3) !important;
}

.vocab-tooltip.firefox-glass-effect.minimized .translation-input {
    background: rgba(255, 255, 255, 0.05) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
}

.vocab-tooltip.firefox-glass-effect.minimized.dark-mode .translation-input {
    background: rgba(0, 0, 0, 0.1) !important;
}

.vocab-tooltip.firefox-glass-effect.minimized .ai-recommendation {
    margin-top: 8px;
    padding: 8px;
    background: rgba(0, 123, 255, 0.2) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-left: 3px solid #007bff !important; /* 保留蓝色左边框 */
    border-radius: 6px;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
    font-weight: bold;
}

.vocab-tooltip.firefox-glass-effect.minimized.dark-mode .ai-recommendation {
    background: rgba(0, 123, 255, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-left: 3px solid #0099ff !important; /* 保留暗色模式的蓝色左边框 */
}

.vocab-tooltip.firefox-glass-effect.minimized .ai-recommendation-2 {
    margin-top: 8px;
    padding: 8px;
    background: rgba(255, 123, 0, 0.2) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-left: 3px solid #ff7b00 !important; /* 橙色左边框 */
    border-radius: 6px;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
    font-weight: bold;
}

.vocab-tooltip.firefox-glass-effect.minimized.dark-mode .ai-recommendation-2 {
    background: rgba(255, 123, 0, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-left: 3px solid #ff9933 !important; /* 保留暗色模式的橙色左边框 */
}

/* Firefox玻璃效果下的translation-item.ai-recommendation样式 */
.vocab-tooltip.firefox-glass-effect .translation-item.ai-recommendation {
    display: flex;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    padding: 2px;
    background: rgba(0, 123, 255, 0.2) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-left: 3px solid #007bff !important;
    border-radius: 10px;
    position: relative;
    padding-right: 60px;
}

.vocab-tooltip.firefox-glass-effect .translation-item.ai-recommendation:hover {
    background: rgba(0, 123, 255, 0.3) !important;
}

.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item.ai-recommendation {
    background: rgba(0, 123, 255, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-left: 3px solid #0099ff !important;
}

.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item.ai-recommendation:hover {
    background: rgba(0, 123, 255, 0.35) !important;
}

/* Firefox玻璃效果下的translation-item.ai-recommendation-2样式 */
.vocab-tooltip.firefox-glass-effect .translation-item.ai-recommendation-2 {
    display: flex;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    padding: 2px;
    background: rgba(255, 123, 0, 0.2) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-left: 3px solid #ff7b00 !important;
    border-radius: 10px;
    position: relative;
    padding-right: 60px;
}

.vocab-tooltip.firefox-glass-effect .translation-item.ai-recommendation-2:hover {
    background: rgba(255, 123, 0, 0.3) !important;
}

.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item.ai-recommendation-2 {
    background: rgba(255, 123, 0, 0.25) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-left: 3px solid #ff9933 !important;
}

.vocab-tooltip.firefox-glass-effect.dark-mode .translation-item.ai-recommendation-2:hover {
    background: rgba(255, 123, 0, 0.35) !important;
}


/* 最小化状态下的翻译项在液体玻璃激活时的样式 */
.vocab-tooltip.liquid-glass-active.minimized .translation-item {
    background: unset !important;
    backdrop-filter: blur(1px);
    font-weight: bold;
}

.vocab-tooltip.liquid-glass-active.minimized.dark-mode .translation-item {
    background: #2d2d2dc7 !important;
    backdrop-filter: blur(1px);
    font-weight: bold;
}
.vocab-tooltip.liquid-glass-active.minimized.dark-mode .ai-recommendation {
    background-color:#2d2d2dc7 !important

}
.vocab-tooltip.liquid-glass-active.minimized.dark-mode .ai-recommendation-2 {
    background-color:#2d2d2dc7 !important

}



.vocab-tooltip.liquid-glass-active.minimized .translation-input {
    background:unset !important;

}

.vocab-tooltip.liquid-glass-active.minimized.dark-mode .translation-input {
        background:unset !important;

}








.close-btn-words {
    cursor: pointer;
    /* padding: 4px; */
    /* 移除 margin-right: -7px; 和 margin-top: 5px; 让容器统一管理布局 */
    border-radius: 50%;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    transition: transform 0.2s ease-in-out;
}

/* --- 新增：close-btn-words 悬停动画 --- */
.close-btn-words:hover {
    transform: scale(1.1);
}
/* --- 动画结束 --- */

/* 状态切换按钮样式 */
.status-toggle-btn {
    cursor: pointer;
    margin-right: -40px;

    border-radius: 50%;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    transition: transform 0.2s ease-in-out;
    position: absolute;
    padding: 4px;
    top: 5px;
    left: 5px;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.status-toggle-btn:hover {
    opacity: 1;
    transform: scale(1.1);
}

/* 状态切换按钮SVG颜色修复 */
.status-toggle-btn svg path {
    stroke: #000000 !important; /* 强制设置为黑色，解决Orion浏览器显示蓝色的问题 */
}

.dark-mode .status-toggle-btn svg path {
    stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */
}

/* 最小化按钮样式 */
.minimize-btn-words {
    cursor: pointer;
    padding: 0px;
    /* 移除 margin-right: -17px; 和 margin-top: 5px; 让容器统一管理布局 */
    border-radius: 50%;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    transition: transform 0.2s ease-in-out;
}

.minimize-btn-words:hover {
    transform: scale(1.1);
}

/* 最小化按钮SVG颜色修复 */
.minimize-btn-words svg path,
.minimize-btn-words svg rect,
.minimize-btn-words svg line {
    stroke: #000000 !important; /* 强制设置为黑色，解决Orion浏览器显示蓝色的问题 */
}

.dark-mode .minimize-btn-words svg path,
.dark-mode .minimize-btn-words svg rect,
.dark-mode .minimize-btn-words svg line {
    stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */
}

/* 还原按钮样式  top: 5px; right: 5px; */
.restore-btn-words {
    cursor: pointer;
    border-radius: 4px;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0.1) !important;
    transition: opacity 0.3s ease, transform 0.2s ease-in-out;
    padding: 4px;
    position: absolute;

    z-index: 10;
    opacity: 0;
}

.restore-btn-words:hover {
    opacity: 1 !important;
    transform: scale(1.1);
    background-color: rgba(0, 0, 0, 0.2) !important;
    stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */

}

.dark-mode .restore-btn-words {
    stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */
}

/* 显示当前句子翻译按钮样式 */
.show-sentence-translation-btn {
    cursor: pointer;
    border-radius: 4px;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0.1) !important;
    transition: opacity 0.3s ease, transform 0.2s ease-in-out;
    padding: 4px;
}

.show-sentence-translation-btn:hover {
    opacity: 1 !important;
    transform: scale(1.1);
    background-color: rgba(0, 0, 0, 0.2) !important;
}

/* 最小化状态下句子解析按钮样式 */
.minimized-analysis-btn {
    cursor: pointer;
    border-radius: 4px;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0.1) !important;
    transition: opacity 0.3s ease, transform 0.2s ease-in-out;
    padding: 4px;
}

.minimized-analysis-btn:hover {
    opacity: 1 !important;
    transform: scale(1.1);
    background-color: rgba(0, 0, 0, 0.2) !important;
}

/* 最小化状态下的样式调整 */
.vocab-tooltip.minimized {
    /* 可以添加一些最小化状态下的特殊样式 */
    width: auto !important;
    border-radius: 12px;
}

/* 最小化状态下的 scrollable-content 样式覆盖 */
.vocab-tooltip.minimized .scrollable-content {
    font-size: 16px !important;
    flex: 1;
    overflow-y: auto;
    padding: unset;
    position: relative;
    z-index: 1;
    background: transparent;
}

/* 标签样式 */
.tags {
    font-family: 'LXGWWenKai' !important;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    row-gap: 0px;
    margin-bottom: 0px;
}

.tag {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    background-color: #dcdddd8a;
    backdrop-filter: blur(10px);
    color: var(--text-color);
    margin-bottom: 6px; /* 添加底部边距，确保换行后的行间距 */
    position: relative; /* 添加相对定位，使删除按钮可以绝对定位 */
}

.tag .remove-tag {
    position: absolute;
    top: -5px;
    right: -5px;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    width: 14px;
    height: 14px;
    display: none; /* 默认不显示，完全不占据空间 */
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.tag:hover .remove-tag {
    display: flex; /* 鼠标悬停时显示 */
}






/* 当鼠标悬停在整个句子对上时，显示删除按钮 */
 /* 当鼠标悬停在整个句子对上时，显示删除按钮 */
.example-sentence-pair:hover .delete-sentence-btn {
  display: flex !important;
  align-items: center;
}

/* 例句删除按钮SVG颜色修复 */
.delete-sentence-btn svg path {
  stroke: #000000 !important; /* 强制设置为黑色，解决Orion浏览器显示蓝色的问题 */
}

.dark-mode .delete-sentence-btn svg path {
  stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */
}


.example-sentence-pair {
    background: #eae5e3ab;
    border-radius: 10px;
    margin-bottom:5px;
}

.example-sentence {
    padding: 3.5px;
    font-size: 17px !important;
    line-height: 1.17;
}

.example-sentence:hover {
    padding: 3.5px;
    background: rgb(224, 224, 224);
    border-radius: 10px;
}


.example-translation {

}
.example-translation:hover {

}










.section {
    margin-bottom: 5px;
    background: var(--background-color);
    border: 1px solid #8f9799;
    border-radius: 8px;
    overflow: hidden;
}

.minimized .section {
    border: unset;
    margin-bottom: 0px;
    padding-left: 1px;
    padding-right: 1px;
}


.section-header {
    font-family: 'LXGWWenKai' !important;
    display: flex;
    justify-content: space-between;
    align-items: center;
   /*     padding: 3px 0; 默认展开 */
    background: var(--background-color);
    cursor: pointer;
    user-select: none;
}

.section-content {
    /* 默认展开 */
    display: block;
   /* margin-bottom: 0px;*/
}

/* 收起状态 */
.section.collapsed .section-content {
    display: none;
}

/* 收起状态箭头旋转 */
.section.collapsed .section-header span:last-child {
    transform: rotate(90deg);
}

.section-header span:last-child {
    transition: transform 0.3s ease;
}

.dict-links {
    padding: 12px 16px;
    border-top: 1px solid var(--border-color);
}

.example-item, .phrase-item {
    padding: 8px 16px;
}




.dict-links {
    display: flex;
    gap: 12px;
    margin: 12px 0;
}

.dict-link {
    color: var(--secondary-text-color);
    text-decoration: none;
}

.translation-item {
    position: relative;
    padding-right: 60px;
    background: #909b9b66;
    backdrop-filter: blur(10px);
    border-radius: 10px;
    margin: 4px;

}


.translation-item:hover {
    position: relative;
    padding-right: 60px;
    background: #C0C6C9;
        backdrop-filter: blur(10px);
    border-radius: 10px;
    margin: 4px;
}


.ai-translation-text{
  padding-left: 3px;

}

 /* LXGW */
.ai-translation-text::before {
    content: '';
    display: block;
    height: 5px;
}


.translation-text{
 /* padding-top :4px;  微调顶部内边距 */
 font-weight: bold;
}



 /* LXGW */
.translation-text::before {
    content: '';
    display: block;
    height: 5px;
}


.translation-item.ai-recommendation {
    display: flex;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    padding: 2px;
    background-color: rgb(61 122 185 / 44%);
    backdrop-filter: blur(10px);

    border-radius: 10px;
    border-left: 3px solid #007bff;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}
.translation-item.ai-recommendation:hover {
    display: flex;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    padding: 2px;
    background-color:  rgb(85 157 231 / 78%);
    border-radius: 10px;
    border-left: 3px solid #007bff;
        backdrop-filter: blur(10px);
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}

.translation-item.ai-recommendation-2 {
    display: flex;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    padding: 2px;
    background-color: rgb(185 122 61 / 44%);
    backdrop-filter: blur(10px);

    border-radius: 10px;
    border-left: 3px solid #ff7b00;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}
.translation-item.ai-recommendation-2:hover {
    display: flex;
    align-items: center;
    margin-top: 8px;
    padding: 8px;
    padding: 2px;
    background-color:  rgb(231 157 85 / 78%);
    border-radius: 10px;
    border-left: 3px solid #ff7b00;
        backdrop-filter: blur(10px);
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}


.number-badge {
    background: #FFE591;
    color: #000;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
}

.bottom-nav {
    display: flex;
    justify-content: space-between;
   /*  padding: 12px 0; */
}

/* 修改底部导航按钮容器样式 */
.nav-buttons {
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
}

.nav-btn {
    font-family: 'LXGWWenKai' !important;
    width: 43px;
    height: 43px;
    border-radius: 50%;
    border: 1px solid rgb(189,194,202) ;
    background: #d1d5c736;
    color: var(--text-color);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;  /* 增大字体 */
    font-weight: bold; /* 加粗 */
    transition: transform 0.2s ease-in-out; /* <--- 添加过渡效果 --- */
}

/* --- 新增：nav-btn 悬停动画 --- */
.nav-btn:hover {
    transform: scale(1.1);
}
/* --- 动画结束 --- */

/*
.confirm-btn {
    background:rgba(0, 0, 0, 0);
    color: var(--confirm-button-color);
    border: 1px solid rgba(189, 194, 202, 0);
    padding: 0;   确保SVG居中  width: 43px;
    height: 43px;

}
*/
.confirm-btn svg {
    width: 48px;
    height: 48px;
    margin: -3px;
}

.confirm-btn svg path {
 /*     stroke: var(--confirm-button-color);*/
}

.phrase-item {
    padding: 8px 0;
}

.example-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
}

.example-line {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding-left: 0; /* 移除左侧内边距 */
    width: 100%; /* 确保宽度占满 */
 /*   margin-bottom: 0px;  减小行间距 */
}

.example-translation {
    color: #321051;
    font-size: 14px;
    padding-left: 0; /* 确保没有左侧内边距 */
    text-align: left; /* 确保文本左对齐 */

    line-height: 0; /* 减小行高 */
}

mark {
    background-color: #FFE591;
    padding: 0 2px;
    border-radius: 2px;
}

/* 调整内部项目的间距和样式  */
.translation-item, .example-item, .phrase-item {
    /*padding: 8px 16px;  LXGW*/
    padding: 2.5px 16px;
    line-height: 1.5;
}

/* 确保音标图标和文本对齐 */
.example-item {
    display: flex;
    align-items: center;
    gap: 8px;
}

/* 调整音标图标大小 */
.example-item .sound-icon {
    font-size: 14px;
    flex-shrink: 0;
}

/* 例句中的音频图标样式 */
.example-line .sound-icon {
    transform: scale(0.7); /* 缩小到原来的70% */
}

.example-line .sound-icon svg {
    width: 20px; /* 减小SVG宽度 */
    height: 20px; /* 减小SVG高度 */
}

.example-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1; /* 添加这一行，让内容区域占满剩余空间 */
}

/* 自定义滚动条样式 - 优化版本 */
.scrollable-content::-webkit-scrollbar {
    width: 8px;  /* 滚动条宽度 */
    background-color: transparent;  /* 滚动条背景透明 */
}

.scrollable-content::-webkit-scrollbar-track {
    background: transparent;  /* 滚动条轨道背景透明 */
    margin: 4px 0;  /* 上下留出一点空间 */
}

.scrollable-content::-webkit-scrollbar-thumb {
    background-color: rgba(221, 221, 221, 0.6);  /* 半透明浅灰色 */
    border-radius: 4px;  /* 滚动条圆角 */
    border: 2px solid transparent;  /* 透明边框 */
    background-clip: padding-box;  /* 确保背景不会延伸到边框下 */
    transition: background-color 0.3s;  /* 添加过渡效果 */
}

/* 鼠标悬停时滚动条样式 */
.scrollable-content::-webkit-scrollbar-thumb:hover {
    background-color: rgba(200, 200, 200, 0.8);  /* 悬停时更深的颜色 */
}

/* 暗色模式下的滚动条 */
html[data-theme='dark'] .scrollable-content::-webkit-scrollbar-thumb {
    background-color: rgba(85, 85, 85, 0.6);  /* 半透明深灰色 */
    border: 2px solid transparent;  /* 透明边框 */
    background-clip: padding-box;  /* 确保背景不会延伸到边框下 */
}

/* 暗色模式下鼠标悬停时滚动条样式 */
html[data-theme='dark'] .scrollable-content::-webkit-scrollbar-thumb:hover {
    background-color: rgba(100, 100, 100, 0.8);  /* 悬停时更深的颜色 */
}

/* 或者可以给第一个section添加上边距 */
.scrollable-content .section:first-child {
    margin-top: 0px;  /* 给第一个section添加上边距 */
}

/* 圆形按钮样式 */
.circle-button {
    width: 43px;
    height: 43px;
    border-radius: 50%;
    background-color: var(--primary-color);
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    border: none;
    font-size: 24px;
    padding: 0;
}

/* 收缩状态的样式 */
.vocab-tooltip.collapsed {
    height: auto;
    min-height: auto;
}



.examples-section{
padding-top: 5px;

}


/* 展开/收缩按钮样式 */
.expand-collapse-btn {
    width: 100%;
    height: 10px;
    border: 0 solid transparent !important;
    background: rgba(0, 0, 0, 0) !important;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
 /*   margin-top: -12px;*/
   margin-bottom: 1px;
    transition: transform 0.2s ease-in-out;
}

/* --- 新增：expand-collapse-btn 悬停动画 --- */
.expand-collapse-btn:hover {
   /* --- transform: scale(1.1);--- */
}
/* --- 动画结束 --- */

.expand-collapse-btn svg {
    transition: transform 0.3s ease;
}

.expand-collapse-btn svg path {
    stroke: #000000 !important; /* 强制设置为黑色，解决Orion浏览器显示蓝色的问题 */
}

.dark-mode .expand-collapse-btn svg path {
    stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */
}

.vocab-tooltip.collapsed .expand-collapse-btn svg {
    transform: rotate(180deg);
}

/* AI推荐条目样式 */
.ai-recommendation {
    margin-top: 8px;
    padding: 8px;
    background-color: rgba(0, 123, 255, 0.1);
    border-radius: 6px;
    border-left: 3px solid #007bff;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}

/* 第二个AI推荐条目样式 */
.ai-recommendation-2 {
    margin-top: 8px;
    padding: 8px;
    background-color: rgba(255, 123, 0, 0.1);
    border-radius: 6px;
    border-left: 3px solid #ff7b00;
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}

.ai-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
}

.ai-badge svg {
    width: 20px;
    height: 20px;
    stroke: #007bff;
}

/* AI推荐释义的加号按钮 */
.ai-recommendation .translation-actions {
    opacity: 0;
}

.ai-recommendation:hover .translation-actions {
    opacity: 1;
}

/* 第二个AI推荐释义的加号按钮 */
.ai-recommendation-2 .translation-actions {
    opacity: 0;
}

.ai-recommendation-2:hover .translation-actions {
    opacity: 1;
}

/* 在小屏幕设备上默认显示AI推荐释义的加号按钮 */
@media (max-width: 500px) {
    .ai-recommendation .translation-actions {
        opacity: 1 !important; /* 小屏幕上默认显示，使用!important确保优先级 */
    }
    .ai-recommendation-2 .translation-actions {
        opacity: 1 !important; /* 小屏幕上默认显示，使用!important确保优先级 */
    }
}

/* 修改释义管理按钮样式，默认隐藏 */
.translation-item {
    position: relative;
    padding-right: 60px; /* 为按钮预留空间 */
}

.translation-actions {
    position: absolute;
    right: 8px; /* 调整右侧距离，确保在容器内 */
    top: 50%; /* 垂直居中 */
    transform: translateY(-50%); /* 垂直居中 */
    display: flex;
    gap: 4px;
    opacity: 0; /* 默认隐藏 */
    transition: opacity 0.2s ease; /* 添加过渡效果 */
}

/* 鼠标悬停时显示按钮 */
.translation-item:hover .translation-actions {
    opacity: 1;
}

/* 在小屏幕设备上默认显示按钮 */
@media (max-width: 500px) {
    .translation-item .translation-actions {
        opacity: 1 !important; /* 小屏幕上默认显示，使用!important确保优先级 */
    }
}

.translation-action-btn {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--border-color) !important;
    background: var(--background-color) !important;
    color: var(--text-color);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    padding: 0;
}
/*  padding: 8px; */
.translation-input {
    font-size: 16px !important;
    width: 100%;

    border: 1px solid var(--border-color);
    border-radius: 4px;
    background-color: var(--background-color);
    color: var(--text-color);
    margin: 4px 0;
}



  #audio-container audio {
                            width: 140px;
                            height: 40px;
                            border-radius: 50%;
                            outline: none;
                            background-color: transparent;
                        }
                        /* 隐藏除了播放按钮以外的所有控件 */
                        #audio-container audio::-webkit-media-controls-enclosure {
                            border-radius: 50%;
                            background-color: transparent;
                        }
                        #audio-container audio::-webkit-media-controls-panel {
                            background-color: transparent;
                        }
                        /* 暗色模式下控制面板样式 */
                        .dark-mode #audio-container audio::-webkit-media-controls-panel {

                            border-radius: 3px;
                        }
                        /* 隐藏各种控件 */
                        #audio-container audio::-webkit-media-controls-timeline {
                            display: none;
                        }


                        #audio-container audio::-webkit-media-controls-current-time-display {
                            display: none;
                        }
                        #audio-container audio::-webkit-media-controls-time-remaining-display {
                            display: none;
                        }
                        #audio-container audio::-webkit-media-controls-volume-slider {
                            display: none;
                        }
                        #audio-container audio::-webkit-media-controls-mute-button {
                            display: none;
                        }

                        #audio-container audio::-webkit-media-controls-volume-control-container {
                            display: none;
                        }
                        /* 暗色模式下的样式 */
                        .dark-mode #audio-container audio {
                            background-color: transparent;
                            color: #fff;
                        }


                        #audio-container audio::-internal-media-controls-overflow-button,
                        #audio-container audio::-webkit-media-controls-overflow-button,
                        #audio-container audio::-webkit-media-controls-panel input[aria-label="weitere Mediensteuerelemente anzeigen"],
                        #audio-container audio::-webkit-media-controls-panel input[aria-haspopup="menu"],
                        #audio-container audio::-webkit-media-controls-panel input[title="weitere Optionen"],
                        #audio-container audio::-webkit-media-controls-panel *[pseudo="-internal-media-controls-overflow-button"] {
                            display: none !important;
                            opacity: 0 !important;
                            width: 0 !important;
                            height: 0 !important;
                            pointer-events: none !important;
                            visibility: hidden !important;
                        }

                        /* 尝试通过CSS选择器隐藏最后一个元素 */
                        #audio-container audio::-webkit-media-controls-panel > input:last-child,
                        #audio-container audio::-webkit-media-controls-panel > *:last-child {
                            display: none !important;
                        }

                        /* 尝试通过修改整个控制面板来隐藏溢出按钮 */
                        #audio-container audio::-webkit-media-controls-panel {
                            display: flex !important;
                            flex-wrap: nowrap !important;
                            max-width: 40px !important;
                            overflow: hidden !important;
                            justify-content: center !important;
                        }

                        /* 亮色模式下播放按钮样式 */
                        #audio-container audio::-webkit-media-controls-play-button {

                            min-width: 20px !important;
                            height: 20px;
                            flex: 0 0 20px;
                            box-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
                        }

                        /* 暗色模式下播放按钮样式 */
                        .dark-mode #audio-container audio::-webkit-media-controls-play-button {
                            background-color: #fff;
                            border-radius: 50%;
                            min-width: 20px !important;
                            height: 20px;
                            flex: 0 0 20px;
                            box-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
                        }
                        /* 暗色模式下播放按钮悬停效果 */
                        .dark-mode #audio-container audio::-webkit-media-controls-play-button:hover {
                            background-color: #e0e0e0;
                            transform: scale(1.1);
                        }

                        /* --- 新增：normal-sound-icon 悬停动画 --- */
                        .normal-sound-icon {
                            transition: transform 0.2s ease-in-out;
                        }

                        .normal-sound-icon:hover {
                            transform: scale(1.1);
                        }
                        /* --- 动画结束 --- */

                        /* --- 新增：解决Orion浏览器中SVG图标显示蓝色的问题 --- */
                        .normal-sound-icon path {
                            stroke: #000000 !important; /* 强制设置为黑色 */
                        }

                        .dark-mode .normal-sound-icon path {
                            stroke: #ffffff !important; /* 暗色模式下强制设置为白色 */
                        }
                        /* --- 修复结束 --- */









</style>
`



shadowRoot.appendChild(style);



  // 暗色模式样式
  const darkModeStyle = document.createElement('style');
  darkModeStyle.textContent = `
    .vocab-tooltip.dark-mode {
      background-color: #1f1f1f;
      color: #e0e0e0;
      box-shadow: 0 .5em 1em -0.125em rgba(0,0,0,.4), 0 0px 0 1px rgba(0,0,0,.2);
      border-color: #333;

    }

    .dark-mode .word-title {
           --text-shadow: none; /* 暗色模式下移除描边 */
    }


    .dark-mode .fixed-header,
    .dark-mode .fixed-footer {
      background: transparent; /* <--- 修改：改为透明 */
      border-color: #333;
    }

    .dark-mode .section {
      background: transparent; /* <--- 修改：改为透明 */
      border-color: #444;
    }

    .dark-mode .section-header {
      background: transparent; /* <--- 修改：改为透明 */
      color: #e0e0e0;
    }
      /* --- 新增：暗色模式下背景纹理透明度 --- */
    .vocab-tooltip.dark-mode::before {
      opacity: 0.2 !important; /* 暗色模式下设置为 0.3，添加 !important 确保覆盖 */
    }
    /* --- 新增结束 --- */
    .dark-mode .tag {
      background-color: #3d3d3d;
      color: #e0e0e0;
    }

    .dark-mode .translation-item {
      background: #2d2d2dc7;
      color: #e0e0e0;
    }

    .dark-mode .translation-item:hover {
      background: #3a3a3a;
    }

    .dark-mode .translation-item.ai-recommendation {
      background-color: rgba(0, 123, 255, 0.15);
      border-left: 3px solid #0099ff;
    }

    .dark-mode .translation-item.ai-recommendation-2 {
      background-color: rgba(255, 123, 0, 0.15);
      border-left: 3px solid #ff9933;
    }





    /* 当鼠标悬停在整个句子对上时，显示删除按钮 */

    .dark-mode .example-sentence-pair:hover .delete-sentence-btn {
     display: flex !important;
     align-items: center;
   }


   .dark-mode .example-sentence-pair {
       background: #2d2d2d; /* <--- 保持原有背景色，只让 section 透明 */

   }

   .dark-mode .example-sentence {
       padding: 3.5px;
   }

   .dark-mode .example-sentence:hover {
       padding: 3.5px;
       background: #3a3a3a;
       border-radius: 10px;

   }

   .dark-mode .example-translation {
    color: #af919d;
    font-size: 15px;
    padding-left: 0;
    text-align: left;
    line-height: 15px;
}



    .dark-mode .vocab-tooltip::before {

    opacity: 0.05 !important; /* 设置花纹透明度，可调整 */

}



    .dark-mode .tag .remove-tag {
      color: rgb(77 66 66 / 80%);
    }


  /* 在你的 CSS 文件中添加或在 <style> 标签中添加 */
  .language-square {
    font-family: 'LXGWWenKai' !important;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 20px;
    height: 20px;
    margin-left: 10px;
    margin-right: 5px;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 12px;
    cursor: pointer;
    user-select: none;

    background-color: #dcdddd8a;
    backdrop-filter: blur(10px);

}

  .dark-mode .language-square {
    background-color: #333;
    border-color: #444;
  }


/* 在你的 CSS 文件中添加或在 <style> 标签中添加 */
.title-container {
    display: flex; /* 确保 title-container 也是 flex 容器，如果需要内部元素横向排列 */
    align-items: center; /* 垂直居中 title-container 内的元素 */
    /* 可以根据需要添加其他样式，例如 margin, padding 等 */
}




    .dark-mode .nav-btn {
      background: #2d2d2d14;
      border-color: #444;
      color: #e0e0e0;

    }

/* 放在这里是为了不让confirm的样式被覆盖。
.dark-mode .confirm-btn {

    border-color: rgba(0, 0, 0, 0);
    background: #25171700;
}
 */


    .dark-mode .close-btn-words svg path,
    .dark-mode .sound-icon svg path {
      stroke: #e0e0e0;
    }

    /* 液体玻璃开关按钮的颜色样式 */
    .liquid-glass-toggle-btn svg path {
      stroke: #000000 !important; 亮色模式下为黑色 */
    }

    .dark-mode .liquid-glass-toggle-btn svg path {
      stroke: #ffffff !important; /* 暗色模式下为白色 */
    }

    /* 添加特定的选择器来解决Orion浏览器中SVG图标显示蓝色的问题 */
    .close-btn-words svg path {
      stroke: #000000 !important; /* 强制设置为黑色，解决Orion浏览器显示蓝色的问题 */
    }

    .dark-mode .close-btn-words svg path {
      stroke: #ffffff !important; /* 强制设置为白色，确保在暗色模式下可见 */
    }

    .dark-mode .example-translation-line {
      color: #aaa;
      line-height: 1.17;
    }

    .dark-mode .example-sentence strong {
      color: #ffcc00;
    }
    /*    background: #3f3b3b !important;  */
    .dark-mode .translation-input {
      font-size: 16px !important;
      color: #c59999 !important;
      background: #3f3b3b !important;
      border-color: #444 !important;
    }

    .dark-mode .tag-input {
      background: #2d2d2d !important;
      color: #e0e0e0 !important;
    }

    .dark-mode .scrollable-content::-webkit-scrollbar-thumb {
      background-color: rgba(85, 85, 85, 0.6);
      border: 2px solid transparent;
      background-clip: padding-box;
    }

    .dark-mode .scrollable-content::-webkit-scrollbar-thumb:hover {
      background-color: rgba(100, 100, 100, 0.8);
    }

    .dark-mode .expand-collapse-btn svg path {
      stroke: #e0e0e0;
    }
  `;

  // 将样式添加到 Shadow DOM 中
  shadowRoot.appendChild(darkModeStyle);

  // 添加竖排文本保护样式到Shadow DOM
  const verticalProtectionStyle = document.createElement('style');
  verticalProtectionStyle.textContent = `
    /* 竖排文本保护样式 - Shadow DOM版本 */
    .vocab-tooltip.vertical-text-protection {
      writing-mode: horizontal-tb !important;
      -webkit-writing-mode: horizontal-tb !important;
      -moz-writing-mode: horizontal-tb !important;
      -ms-writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      -webkit-text-orientation: mixed !important;
      direction: ltr !important;
      unicode-bidi: normal !important;
    }

    .vocab-tooltip.vertical-text-protection * {
      writing-mode: horizontal-tb !important;
      -webkit-writing-mode: horizontal-tb !important;
      -moz-writing-mode: horizontal-tb !important;
      -ms-writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      -webkit-text-orientation: mixed !important;
      direction: ltr !important;
      unicode-bidi: normal !important;
    }
  `;
  shadowRoot.appendChild(verticalProtectionStyle);







function writeToClipboard() {

  let hoveredDetail = null;
  let hoveredRect = null;

  const word = getWordAtPoint(lastMouseEvent.clientX, lastMouseEvent.clientY);
  console.log("用户触发后；word:  ", word);
  if (word) {
    console.log("鼠标所在单词为:", word);
    let wordRangesArrays   = wordRangesMap.get(word.toLowerCase());
    // console.log("wordRangesArrays:  ", wordRangesArrays);
    for (const detail of wordRangesArrays) {
      const rect = detail.range.getBoundingClientRect();
      if (lastMouseEvent.clientX >= rect.left && lastMouseEvent.clientX <= rect.right &&
          lastMouseEvent.clientY >= rect.top && lastMouseEvent.clientY <= rect.bottom) {
        // 确保单词有小写版本，便于后续比较
        if (detail.word) {
          detail.wordLower = detail.word.toLowerCase();
        }
        hoveredDetail = detail;
        hoveredRect = rect;
        console.log("hoveredDetail:  ", hoveredDetail);
        console.log("hoveredRect:  ", hoveredRect);
        break;
      }
    }
  }




  if (hoveredDetail) {
    const sentence = getSentenceForWord(hoveredDetail);

    // 播放句子 TTS
    try {
      console.log("播放句子 TTS");
      playText({ text: sentence });
    } catch (error) {
      console.error('播放句子 TTS 时发生错误:', error);
    }
  }


  if (hoveredDetail) {
    const sentence = getSentenceForWord(hoveredDetail);
    highlightSpecificWords(getSentenceWordDetails(hoveredDetail), 66);
    navigator.clipboard.writeText(sentence);
  }

}




// // 初始化 Shadow DOM 的函数
// function initShadowHost() {
//   // 尽量挂载到 document.body，如果没有则 fallback 到 document.documentElement
//   const parentEl = document.body || document.documentElement;

//   // 检查是否已经存在我们的 shadowHost，防止重复添加
//   if (document.getElementById('my-shadow-host')) return;

//   const shadowHost = document.createElement('div');
//   shadowHost.id = 'my-shadow-host';
//   parentEl.appendChild(shadowHost);
//   const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

//   // 添加你需要的样式和内容到 shadowRoot
//   const style = document.createElement('style');
//   style.textContent = `
//     /* 你的样式代码 */
//   `;
//   shadowRoot.appendChild(style);

//   // 其它初始化代码...
//   console.log('ShadowHost 初始化完成');
// }

// // 如果是在iframe中，可以检测：
// if (window.self !== window.top) {
//   // 延迟注入，确保 body 加载完成
//   if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', initShadowHost);
//   } else {
//     initShadowHost();
//   }
// } else {
//   // 非iframe环境下直接注入
//   initShadowHost();
// }

// // 创建 MutationObserver 来监控我们的 shadowHost 是否被移除
// const observer = new MutationObserver(() => {
//   if (!document.getElementById('my-shadow-host')) {
//     console.log('检测到 shadowHost 被移除，重新注入');
//     initShadowHost();
//   }
// });

// // 观察整个文档的子节点变化，防止 body 被替换导致我们被删除
// observer.observe(document.documentElement, { childList: true, subtree: true });

function shouldAutoUpdateStatus(word) {
  console.log("shouldAutoUpdateStatus 函数被调用，参数 word:", word);
  const wordLower = word.toLowerCase();

  // 检查数据库缓存中的单词详情
  if (highlightManager && highlightManager.wordDetailsFromDB && highlightManager.wordDetailsFromDB[wordLower]) {
    const status = highlightManager.wordDetailsFromDB[wordLower].status;
    // 如果状态为5（已知），不自动更新
    if (status === "5") {
      console.log("单词已知（状态5），不自动更新:", wordLower);
      return false;
    }
    // 如果有状态但不是undefined，也不自动更新
    if (status !== undefined) {
      console.log("单词已有状态，不自动更新:", wordLower, "状态:", status);
      return false;
    }
  }

  console.log("单词无状态，可以自动更新:", wordLower);
  return true;
}

function getTranslationCount(word) {
  const lowerCaseWord = word.toLowerCase();
  const upperCaseWord = word.toUpperCase();
  const capitalizedWord = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();


  console.log("getTranslationCount:  ", highlightManager.wordDetailsFromDB[lowerCaseWord]);
   //如果没有这个条目，就返回0
  if (!highlightManager.wordDetailsFromDB[lowerCaseWord]) {
    return 0;
  }



  // 检查各种大小写形式的单词
  if (highlightManager.wordDetailsFromDB[lowerCaseWord] && highlightManager.wordDetailsFromDB[lowerCaseWord].translations) {
    return highlightManager.wordDetailsFromDB[lowerCaseWord].translations.length;
  }
  if (highlightManager.wordDetailsFromDB[upperCaseWord] && highlightManager.wordDetailsFromDB[upperCaseWord].translations) {
    return highlightManager.wordDetailsFromDB[upperCaseWord].translations.length;
  }
  if (highlightManager.wordDetailsFromDB[capitalizedWord] && highlightManager.wordDetailsFromDB[capitalizedWord].translations) {
    return highlightManager.wordDetailsFromDB[capitalizedWord].translations.length;
  }

  // 如果都不存在或没有translations属性,返回0
  return 0;



  }




   function WesternTextFix(text, index, length) {
    if(!text){
      return null;
    }

    const commonAbbreviations = new Set([
      // 拉丁缩写
      "etc.", "Etc.", "e.g.", "E.g.", "i.e.", "I.e.", "vs.", "Vs.", "cf.", "Cf.",
      "N.B.", "n.b.", "P.S.", "p.s.", "viz.", "Viz.", "et al.", "Et al.",

      // 头衔缩写
      "dr.", "Dr.", "mr.", "Mr.", "mrs.", "Mrs.", "ms.", "Ms.", "prof.", "Prof.",
      "Rev.", "rev.", "Hon.", "hon.", "Capt.", "capt.", "Col.", "col.", "Gen.", "gen.",
      "Gov.", "gov.", "Lt.", "lt.", "Sgt.", "sgt.", "Cmdr.", "cmdr.",

      // 学术缩写
      "ph.d.", "Ph.D.", "b.a.", "B.A.", "m.a.", "M.A.", "m.b.a.", "M.B.A.",
      "b.s.", "B.S.", "m.s.", "M.S.", "m.d.", "M.D.", "ll.b.", "LL.B.",

      // 商业缩写
      "co.", "Co.", "ltd.", "Ltd.", "inc.", "Inc.", "corp.", "Corp.",
      "LLC.", "llc.", "L.L.C.", "l.l.c.", "assn.", "Assn.", "bros.", "Bros.",

      // 时间缩写
      "a.m.", "A.M.", "p.m.", "P.M.",

      // 地理和政治缩写
      "u.s.a.", "U.S.A.", "u.k.", "U.K.", "e.u.", "E.U.",
      "u.n.", "U.N.", "u.s.", "U.S.", "U.S.S.R.", "u.s.s.r.",

      // 日常缩写
      "approx.", "Approx.", "dept.", "Dept.", "est.", "Est.",
      "no.", "No.", "vol.", "Vol.", "St.", "st.", "Ave.", "ave.",
      "Rd.", "rd.", "Blvd.", "blvd.", "Apt.", "apt.",

      // 德语缩写
      "z.b.", "Z.B.", "d.h.", "D.H.", "u.a.", "U.A.", "v.a.", "V.A.",

      // 职位和名字缩写
      "jr.", "Jr.", "sr.", "Sr.", "esq.", "Esq.",

      // 其他常见缩写
      "asap.", "ASAP.", "etc.", "Etc.", "diy.", "DIY.",
      "hr.", "Hr.", "HR.", "min.", "Min.", "sec.", "Sec."
    ])

    if(commonAbbreviations.has(text)){
      return  text
    }else{

      //获取第一个\w 字母和她的位置;
      //获取最后一个字母或者数字和位置
      //捕获中间的部分
      //更新index和length
      //返回处理后的text,index,length

// 获取第一个字母和它的位置
const firstLetterMatch = text.match(/[\p{L}]/u);
const lastLetterMatch = text.match(/[\p{L}\d][^\p{L}\d]*$/u);

if (!firstLetterMatch || !lastLetterMatch) {
  return text
}

const firstIndex = firstLetterMatch.index;
const lastIndex = text.lastIndexOf(lastLetterMatch[0]);
const lastLetterEndIndex = lastIndex + lastLetterMatch[0].replace(/[^\p{L}\d]/gu, '').length;

// 如果首尾没有非字母字符，直接返回原始值
if (firstIndex === 0 && lastLetterEndIndex === length) {
  return text
}

// 更新值
const newText = text.substring(firstIndex, lastLetterEndIndex);


return  newText

      }
    }

// 使用浏览器的 caretRangeFromPoint 来获取光标处的 Range
function getWordAtPoint(x, y) {
  let range;
  try {
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.setEnd(pos.offsetNode, pos.offset);
    }

    if (!range) {
      // 尝试使用 elementFromPoint 作为备选方案
      const element = document.elementFromPoint(x, y);
      if (element && element.textContent) {
        // 如果元素包含文本，尝试获取最接近的单词
        const text = element.textContent;
        // 更新正则表达式以匹配包含撇号、连字符、句点和数字的单词

        const match = text.match(/\S*\p{L}\S*/u);

        const word = WesternTextFix(match ? match[0] : null);

        return word;



      }
      return null;
    }

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    const text = node.textContent;
    const offset = range.startOffset;

    // 检测是否为日语文本
    if (isJapaneseText(text)) {
      // 在iOS设备上使用Intl.Segmenter进行日语分词
      if (orion_isIOS) {
        return getIntlSegmenterWordAtPointWithLocale(text, offset, "ja");
      } else {
      return getJapaneseWordAtPoint(text, offset);
      }
    }

    if (isChinseText(text)) {
      return getIntlSegmenterWordAtPoint(text, offset);
    }

    if (isKoreanText(text)) {
      return getIntlSegmenterWordAtPoint(text, offset);
    }

    // --- 修改：使用 Intl.Segmenter 处理西方文字 ---
    try {
      const segmenter = new Intl.Segmenter("en", { granularity: "word" }); // 或者使用其他合适的语言代码
      const segments = Array.from(segmenter.segment(text));

      for (const segment of segments) {
        const segmentStart = segment.index;
        const segmentEnd = segment.index + segment.segment.length;

        // 检查偏移量是否在当前分词内
        if (segmentStart <= offset && offset < segmentEnd) {
          // 检查是否是有效的单词 (segmenter 可能会将标点等单独分开)
          if (segment.isWordLike) {
            const word = WesternTextFix(segment.segment); // 保留 WesternTextFix 以处理潜在的边缘情况
            return word === "" ? null : word;
          } else {
            // 如果光标在非单词片段（如空格或标点）上，则返回 null
            return null;
          }
        }
      }
      // 如果循环结束还没找到包含偏移量的单词片段，返回 null
      return null;
    } catch (segmenterError) {
      console.error("使用 Intl.Segmenter 处理西方文字时出错:", segmenterError);
      // Intl.Segmenter 失败时，可以回退到旧方法或直接返回 null
      // 这里选择返回 null
      return null;
    }
    // --- 修改结束 ---

/*
    // --- 旧的西方文字处理逻辑 (注释掉) ---
    // 向左查找单词起始位置
    let start = offset;
    while (start > 0) {
      const prevChar = text[start - 1];
      // 只要不是空格，就认为是单词的一部分
      if (!/\s/.test(prevChar)) {
        start--;
        continue;
      }
      break;
    }

    // 向右查找单词结束位置
    let end = offset;
    while (end < text.length) {
      const currChar = text[end];
      // 只要不是空格，就认为是单词的一部分
      if (!/\s/.test(currChar)) {
        end++;
        continue;
      }
      break;
    }

    // const word = text.slice(start, end);

    const word = WesternTextFix(text.slice(start, end));

    // 如果提取结果为空，则返回 null
    return word === "" ? null : word;
    // --- 旧逻辑结束 ---
*/

  } catch (error) {
    console.error("获取光标处单词时出错:", error);
    return null;
  }
}

function getParentAtPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  return element;
}



// // 判断文本是否为日语
// function isJapaneseText(text) {
//   // 检查文本中是否包含日语字符（平假名、片假名、汉字）
//   const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
//   return japaneseRegex.test(text);
// }


    // 修改日语文本检测方法，避免误识别中文
    function isJapaneseText(text) {
      // return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
      // 只检测是否含有日语特有的平假名或片假名
      return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
  }



  // 检测文本是否为中文
  function isChinseText(text) {
    // 检测是否含有中文汉字（排除日语特有的假名）
    return /[\u4E00-\u9FFF]+/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

  // 检测文本是否为韩语
function  isKoreanText(text) {
      // 检测是否含有韩语特有字符
      return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(text);
  }



// 获取日语单词
function getJapaneseWordAtPoint(text, offset) {
  // 在iOS设备上使用Intl.Segmenter进行日语分词
  if (orion_isIOS) {
    // 使用Intl.Segmenter进行日语分词，传入"ja"作为语言参数
    return getIntlSegmenterWordAtPointWithLocale(text, offset, "ja");
  }

  // 检查是否启用kuromoji且已初始化
  const useKuromoji = highlightManager?.useKuromojiTokenizer || false;

  // 如果启用kuromoji且已初始化，使用kuromoji分词
  if (useKuromoji && JapaneseTokenizer) {
    try {
      const tokens = JapaneseTokenizer.tokenize(text);
      let currentPosition = 0;

      // 遍历所有分词结果，找出包含当前偏移量的单词
      for (const token of tokens) {
        const tokenEnd = currentPosition + token.surface_form.length;

        if (currentPosition <= offset && offset < tokenEnd) {
          // 忽略助词、助动词、记号等非实义词
          // if (['助詞', '助動詞', '記号'].includes(token.pos)) {
          //   return null;
          // }
          return token.surface_form;
        }

        currentPosition = tokenEnd;
      }

      return null;
    } catch (error) {
      console.error("kuromoji分析日语单词时出错，降级使用Intl.Segmenter:", error);
      // 降级使用Intl.Segmenter
      return getIntlSegmenterWordAtPointWithLocale(text, offset, "ja");
    }
  }

  // 默认使用Intl.Segmenter
  return getIntlSegmenterWordAtPointWithLocale(text, offset, "ja");
}

// 创建或显示侧边栏
function showSidebar(url, word) {
  // 检查是否已存在侧边栏
  let sidebar = document.getElementById('lingkuma-sidebar');

  if (!sidebar) {
    // 降低tooltip的z-index，让侧边栏显示在上层
    if (tooltipEl) {
      tooltipEl.style.zIndex = "2147483600";
    }

    // 从storage中获取保存的宽度，默认400px
    chrome.storage.local.get(['sidebarWidth'], (result) => {
      const savedWidth = result.sidebarWidth || 400;

      // 创建侧边栏容器
      sidebar = document.getElementById('lingkuma-sidebar');
      if (!sidebar) {
        sidebar = document.createElement('div');
        sidebar.id = 'lingkuma-sidebar';
      }

      sidebar.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: ${savedWidth}px;
        height: 100vh;
        background: white;
        box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
        z-index: 2147483647 !important;
        display: flex;
        flex-direction: column;
        transition: transform 0.3s ease;
        transform: translateX(0);
      `;

    // 创建标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 15px 20px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    `;

    const titleEl = document.createElement('div');
    titleEl.textContent = word || '侧边栏';
    titleEl.style.cssText = `
      font-weight: 600;
      font-size: 16px;
      color: #333;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: rgba(0, 0, 0, 0) !important;
      border: 0 solid transparent !important;
      font-size: 28px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    `;
    closeBtn.addEventListener('click', () => {
      // 关闭按钮真正移除侧边栏
      sidebar.style.transform = 'translateX(100%)';
      setTimeout(() => {
        // 恢复tooltip的z-index
        if (tooltipEl) {
          tooltipEl.style.zIndex = "2147483647";
        }
        sidebar.remove();
      }, 300);
    });
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = '#e0e0e0';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(0, 0, 0, 0)';
    });

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // 创建iframe
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = `
      flex: 1;
      border: none;
      width: 100%;
      height: 100%;
    `;

    sidebar.appendChild(header);
    sidebar.appendChild(iframe);
    document.body.appendChild(sidebar);

    // 添加收缩/展开按钮
    const dragHandle = document.createElement('div');
    dragHandle.style.cssText = `
      position: absolute;
      left: -20px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 60px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 4px 0 0 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      transition: left 0.3s ease;
    `;
    dragHandle.textContent = '▶';

    let isCollapsed = false;

    dragHandle.addEventListener('click', () => {
      if (!isCollapsed) {
        // 收缩侧边栏
        sidebar.style.transform = 'translateX(100%)';
        dragHandle.textContent = '◀';
        dragHandle.style.left = '-20px'; // 保持在原位
        isCollapsed = true;

        // 恢复tooltip的z-index
        if (tooltipEl) {
          tooltipEl.style.zIndex = "2147483647";
        }
      } else {
        // 展开侧边栏
        sidebar.style.transform = 'translateX(0)';
        dragHandle.textContent = '▶';
        isCollapsed = false;

        // 降低tooltip的z-index
        if (tooltipEl) {
          tooltipEl.style.zIndex = "2147483600";
        }
      }
    });
    sidebar.appendChild(dragHandle);

    // 添加左侧边缘拖拽调整宽度功能
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 5px;
      height: 100%;
      cursor: ew-resize;
      z-index: 10;
    `;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let resizeOverlay = null;

    const handleMouseMove = (e) => {
      if (!isResizing) return;
      e.preventDefault();
      e.stopPropagation();

      const deltaX = startX - e.clientX; // 向左拖动为正值
      const newWidth = Math.max(300, Math.min(800, startWidth + deltaX)); // 限制宽度在300-800px之间

      // 使用requestAnimationFrame优化性能
      requestAnimationFrame(() => {
        if (sidebar) {
          sidebar.style.width = `${newWidth}px`;
        }
      });
    };

    const handleMouseUp = () => {
      if (isResizing) {
        isResizing = false;

        // 移除遮罩层及其事件监听器
        if (resizeOverlay) {
          resizeOverlay.removeEventListener('mousemove', handleMouseMove, true);
          resizeOverlay.removeEventListener('mouseup', handleMouseUp, true);
          if (resizeOverlay.parentNode) {
            resizeOverlay.remove();
          }
          resizeOverlay = null;
        }

        // 恢复transition
        sidebar.style.transition = 'transform 0.3s ease';

        // 保存宽度到storage
        const currentWidth = parseInt(sidebar.style.width);
        chrome.storage.local.set({ sidebarWidth: currentWidth });

        // 移除document上的事件监听器
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('mouseup', handleMouseUp, true);
      }
    };

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = parseInt(sidebar.style.width);
      e.preventDefault();

      // 禁用transition以实现平滑拖拽
      sidebar.style.transition = 'none';

      // 创建全屏遮罩层防止鼠标事件被iframe捕获
      resizeOverlay = document.createElement('div');
      resizeOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        cursor: ew-resize;
        user-select: none;
        pointer-events: auto;
      `;
      document.body.appendChild(resizeOverlay);

      // 在遮罩层和document上都添加事件监听器,确保捕获所有事件
      resizeOverlay.addEventListener('mousemove', handleMouseMove, true);
      resizeOverlay.addEventListener('mouseup', handleMouseUp, true);
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseup', handleMouseUp, true);
    });

    sidebar.appendChild(resizeHandle);

    // 动画进入
    sidebar.style.transform = 'translateX(100%)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sidebar.style.transform = 'translateX(0)';
      });
    });
    }); // 闭合chrome.storage.local.get回调
  } else {
    // 如果已存在，更新iframe的src和标题
    const iframe = sidebar.querySelector('iframe');
    const titleEl = sidebar.querySelector('div > div');
    if (iframe) iframe.src = url;
    if (titleEl) titleEl.textContent = word || '侧边栏';

    // 如果侧边栏被隐藏，重新显示
    if (sidebar.style.transform === 'translateX(100%)') {
      sidebar.style.transform = 'translateX(0)';
    }
  }
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showSidebar') {
    showSidebar(message.url, message.word);
    sendResponse({ success: true });
    return true;
  }
});

// 带有语言参数的Intl.Segmenter分词函数
function getIntlSegmenterWordAtPointWithLocale(text, offset, locale) {
  try {
    // 使用指定的语言区域设置进行分词
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    const segments = Array.from(segmenter.segment(text));

    // 遍历所有分词结果，找出包含当前偏移量的词
    let currentPosition = 0;

    for (const segment of segments) {
      const segmentStart = currentPosition;
      const segmentEnd = currentPosition + segment.segment.length;

      if (segmentStart <= offset && offset < segmentEnd) {
        // 忽略空格和标点符号
        if (segment.segment.trim() === '' || /^[\p{P}\s]+$/u.test(segment.segment)) {
          return null;
        }
        return segment.segment;
      }

      currentPosition = segmentEnd;
    }

    return null;
  } catch (error) {
    console.error(`使用${locale}区域设置分析单词时出错:`, error);
    return null;
  }
}

// 原始的中文分词函数，现在调用通用函数并传入"zh"作为语言参数
function getIntlSegmenterWordAtPoint(text, offset) {
  return getIntlSegmenterWordAtPointWithLocale(text, offset, "zh");
}











// 添加一个定时检测函数，即使鼠标不移动也能检测单词
let lastMousePosition = { x: 0, y: 0 };
let mouseStationaryTimer = null;
let throttleTimeout = null; // 添加这一行，定义 throttleTimeout 变量
// let firstTime = true; // 将 firstTime 移到外部作用域

// 1. 初始化缓存变量
let clickOnlyMode = false;
let explosionPriorityMode = true; // 新增：爆炸优先模式缓存
let a4_wordExplosionEnabled = true; // 新增：单词爆炸功能启用状态缓存（a4专用，避免与a7冲突）
// 记录上次检测到的缩放比例
let lastZoomFactor = window.devicePixelRatio || 1;

// 2. 首次加载时获取当前值
chrome.storage.local.get(['clickOnlyTooltip', 'explosionPriorityMode', 'wordExplosionEnabled'], function(result) {
  clickOnlyMode = result.clickOnlyTooltip || true;
  explosionPriorityMode = result.explosionPriorityMode || true;
  a4_wordExplosionEnabled = result.wordExplosionEnabled !== undefined ? result.wordExplosionEnabled : true;
});

// 3. 添加存储变化监听器
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'local') {
    if (changes.clickOnlyTooltip) {
      // 当设置变化时更新缓存的值
      clickOnlyMode = changes.clickOnlyTooltip.newValue;
      console.log('[A4] clickOnlyMode设置已更新:', clickOnlyMode);
    }
    if (changes.explosionPriorityMode) {
      // 当爆炸优先模式设置变化时更新缓存的值
      explosionPriorityMode = changes.explosionPriorityMode.newValue;
      console.log('[A4] explosionPriorityMode设置已更新:', explosionPriorityMode);
    }
    if (changes.wordExplosionEnabled) {
      // 当单词爆炸功能开关变化时更新缓存的值
      a4_wordExplosionEnabled = changes.wordExplosionEnabled.newValue;
      console.log('[A4] wordExplosionEnabled设置已更新:', a4_wordExplosionEnabled);
    }
  }
});

// // 监听浏览器缩放变化
// window.addEventListener('resize', function() {
//   const currentZoomFactor = window.devicePixelRatio || 1;

//   // 如果缩放比例发生变化且当前有弹窗显示
//   if (currentZoomFactor !== lastZoomFactor && tooltipEl) {
//     console.log("检测到浏览器缩放变化，从", lastZoomFactor, "变为", currentZoomFactor);

//     // 更新缩放比例
//     lastZoomFactor = currentZoomFactor;

//     // 更新弹窗缩放
//     tooltipEl.style.transform = `scale(${1/currentZoomFactor})`;

//     // 如果有ResizeObserver，重新计算位置
//     if (tooltipResizeObserver) {
//       const tooltipRect = tooltipEl.getBoundingClientRect();
//       const newHeight = tooltipRect.height;

//       // 获取当前变换原点
//       const transformOrigin = tooltipEl.style.transformOrigin;

//       // 根据变换原点决定如何调整位置
//       if (transformOrigin === "left bottom") {
//         // 向上展开的情况
//         const wordTopAbsolute = parseFloat(tooltipEl.style.top) + newHeight + parseFloat(tooltipEl.style.gap || 50);
//         const newTop = wordTopAbsolute - (newHeight * currentZoomFactor) - (parseFloat(tooltipEl.style.gap || 50) / currentZoomFactor);
//         tooltipEl.style.top = newTop + 'px';
//       }
//       // 向下展开的情况不需要调整，因为是基于左上角
//     }
//   }
// });


// // 用于RAF优化
// let ticking = false;

// // 鼠标移动事件处理
// console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Attempting to add mousemove listener. Document readyState: ${document.readyState}`);

// document.addEventListener("mousemove", (e) => {
//    // --- 添加日志：确认监听器回调被触发 ---
//  console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Mousemove listener triggered.`);
//  // --- 日志结束 ---
//   // 更新鼠标位置
//   lastMousePosition.x = e.clientX;
//   lastMousePosition.y = e.clientY;

//   // 处理鼠标停留检测
//   if (mouseStationaryTimer) {
//     clearTimeout(mouseStationaryTimer);
//   }

//   // 如果不是仅点击模式，设置鼠标停留检测
//   if (!clickOnlyMode) {
//       mouseStationaryTimer = setTimeout(() => {
//         // if (firstTime) {
//         //   firstTime = false;
//         //   return;
//         // }
//
//         if (!tooltipEl) {  // 如果当前没有显示tooltip
//           // console.log("鼠标移动触发 true handleMouseMoveForTooltip");
//           const simulatedEvent = {
//             clientX: lastMousePosition.x,
//             clientY: lastMousePosition.y
//           };
//           handleMouseMoveForTooltip(simulatedEvent, true);
//           return;
//         }
//       }, 200);  // 300毫秒后检测
//
//             // 使用RAF优化实时鼠标移动处理
//
//   }


//   // if (!ticking) {
//   //   console.log("鼠标移动触发 true requestAnimationFrame");
//   //   window.requestAnimationFrame(() => {
//   //     handleMouseMoveForTooltip(e, false);
//   //     ticking = false;
//   //   });
//   //   ticking = true;
//   // }

//   if (!throttleTimeout) {
//     throttleTimeout = setTimeout(() => {
//       handleMouseMoveForTooltip(e, false);
//       throttleTimeout = null;
//     }, 150); // 200ms的节流比RAF友好得多
//   }




// });

// // 更新鼠标移动事件处理
// // 更新鼠标移动事件处理
// document.addEventListener("mousemove", (e) => {
//   // 保存最后的鼠标位置
//   lastMousePosition.x = e.clientX;
//   lastMousePosition.y = e.clientY;

//   // 清除之前的定时器
//   if (mouseStationaryTimer) {
//     clearTimeout(mouseStationaryTimer);
//   }

//   // 获取仅点击触发小窗设置
//   chrome.storage.local.get('clickOnlyTooltip', function(result) {
//     const clickOnlyMode = result.clickOnlyTooltip || false;
//
//     // 如果启用了仅点击模式，不执行后续鼠标停留检测
//     if (clickOnlyMode) return;
//
//     // 设置新的定时器，如果鼠标停止移动一段时间后，仍然检测单词
//     mouseStationaryTimer = setTimeout(() => {
//       if (firstTime) {
//         // console.log("首次鼠标停留，跳过检测");
//         firstTime = false;
//         return;
//       }
//
//       // console.log("鼠标已停留500ms，尝试检测单词");
//       if (!tooltipEl) {  // 如果当前没有显示tooltip，尝试检测单词
//         // console.log("tooltipEl不存在，执行检测单词");
//         const simulatedEvent = {
//           clientX: lastMousePosition.x,
//           clientY: lastMousePosition.y
//         };
//         // console.log("鼠标已停留500ms，尝试检测单词，isOffscreen为true");
//         handleMouseMoveForTooltip(simulatedEvent,true);
//         return;
//       }
//     }, 300);  // 300毫秒后检测
//   });

//   // 原有的节流处理 - 减少延迟时间以提高响应性
//   if (throttleTimeout) return;
//   throttleTimeout = setTimeout(() => {
//     // console.log("鼠标移动节流处理触发");
//     handleMouseMoveForTooltip(e,false);

//     throttleTimeout = null;
//   }, 500); // 从5000ms改为100ms，提高响应速度
// });

function setupMouseListeners() {
    // console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Setting up mouse listeners now. readyState: ${document.readyState}`);
    // // --- 使用 setTimeout 延迟添加 ---

    // console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Actually adding mousemove listener inside setTimeout.`);
    document.addEventListener("mousemove", (e) => {
        // console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Mousemove listener triggered.`);
        // --- 日志结束 ---

        // --- 新增：记录原始mousemove事件坐标 ---
        // console.log('[DEBUG] Mousemove raw event coords:', { clientX: e?.clientX, clientY: e?.clientY });
        // --- 记录结束 ---

        // 更新鼠标位置
        // --- 新增：检查更新 lastMousePosition 前的值 ---
        // if (e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
            lastMousePosition.x = e.clientX;
            lastMousePosition.y = e.clientY;
        // } else {
        //     console.warn('[DEBUG] Invalid coords in mousemove, NOT updating lastMousePosition:', { clientX: e?.clientX, clientY: e?.clientY });
        // }
        // --- 检查结束 ---

        // 处理鼠标停留检测
        if (mouseStationaryTimer) {
            clearTimeout(mouseStationaryTimer);
        }

        // 如果不是仅点击模式，设置鼠标停留检测
        if (!clickOnlyMode) {
            mouseStationaryTimer = setTimeout(() => {
                // --- 新增：记录 lastMousePosition ---
                // console.log('[DEBUG] Stationary check - lastMousePosition:', lastMousePosition);
                // --- 记录结束 ---

                // ... (停留检测内部逻辑) ...
                if (!tooltipEl) {






                    // --- 新增：创建前再次检查 lastMousePosition ---
                    // if (!Number.isFinite(lastMousePosition.x) || !Number.isFinite(lastMousePosition.y)) {
                    //     console.error('[DEBUG] Stationary check: lastMousePosition is non-finite! Aborting tooltip show.', lastMousePosition);
                    //     return;
                    // }
                    // --- 检查结束 ---
                    const simulatedEvent = { clientX: lastMousePosition.x, clientY: lastMousePosition.y };
                    // console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Calling handleMouseMoveForTooltip (stationary)`);
                    handleMouseMoveForTooltip(simulatedEvent, true);
                    return;
                }
            }, 10);
        }

        // 处理节流
        if (!throttleTimeout) {
            throttleTimeout = setTimeout(() => {
                // console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Calling handleMouseMoveForTooltip (throttled)`);
                handleMouseMoveForTooltip(e, false);
                throttleTimeout = null;
            }, 1);
        }
    },true);
    // 如果还有其他事件监听器，也在这里用 setTimeout 添加
    /*
    document.addEventListener('mousedown', (e) => {
        // ... click handler ...
    });
    */



////////////////////////// 键盘事件处理
document.addEventListener('keydown', function(e) {
  console.log("lastMouseEvent:  ", lastMouseEvent);

  // if (!lastMouseEvent) return;

  // 检查事件是否来自输入框或文本区域
  const targetTagName = e.target?.tagName;
  const isEditableElement = targetTagName === 'INPUT' ||
                           targetTagName === 'TEXTAREA' ||
                           (targetTagName === 'DIV' && e.target.contentEditable === 'true') ||
                           e.target.isContentEditable;

  // 如果事件来自可编辑元素，直接返回，不处理快捷键
  if (isEditableElement) {
    console.log("事件来自可编辑元素，跳过全局快捷键处理:", targetTagName, e.target.className);
    return;
  }

  // 检查当前焦点元素是否是输入框
  const activeElement = document.activeElement;
  if (activeElement && (
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'INPUT' ||
      activeElement.isContentEditable
  )) {
    console.log("当前焦点在输入框，跳过全局快捷键处理");
    return;
  }

  // 获取用户自定义快捷键
  chrome.storage.local.get(['wordQueryKey', 'copySentenceKey', 'analysisWindowKey', 'sidePanelKey'], function(result) {
    const wordQueryKey = (result.wordQueryKey || 'q').toLowerCase();
    const copySentenceKey = (result.copySentenceKey || 'w').toLowerCase();
    const analysisWindowKey = (result.analysisWindowKey || 'e').toLowerCase();
    const sidePanelKey = (result.sidePanelKey || 'r').toLowerCase();

    console.log("用户按下快捷键", e.key.toLowerCase());
    if (e.key.toLowerCase() === wordQueryKey) {
      console.log("查询单词快捷键被按下");
      let hoveredDetail = null;
      let hoveredRect = null;

      const word = getWordAtPoint(lastMouseEvent.clientX, lastMouseEvent.clientY);
      console.log("用户触发后；word:  ", word);
      if (word) {
        console.log("鼠标所在单词为:", word);
        let wordRangesArrays   = wordRangesMap.get(word.toLowerCase());
        // console.log("wordRangesArrays:  ", wordRangesArrays);
        for (const detail of wordRangesArrays) {
          const rect = detail.range.getBoundingClientRect();
          if (lastMouseEvent.clientX >= rect.left && lastMouseEvent.clientX <= rect.right &&
              lastMouseEvent.clientY >= rect.top && lastMouseEvent.clientY <= rect.bottom) {
            // 确保单词有小写版本，便于后续比较
            if (detail.word) {
              detail.wordLower = detail.word.toLowerCase();
            }
            hoveredDetail = detail;
            hoveredRect = rect;
            console.log("hoveredDetail:  ", hoveredDetail);
            console.log("hoveredRect:  ", hoveredRect);
            break;
          }
        }
      }

      if (hoveredDetail) {

        //获取句子
        const sentence = getSentenceForWord(hoveredDetail);

        // 播放 TTS
        try {
          if (typeof playText === 'function') {
            playText({
              sentence: sentence,
              text: hoveredDetail.word,
              count: 1
            });
          }
        } catch (error) {
          console.error('播放 TTS 时发生错误:', error);
        }

        // 显示 tooltip
        if (tooltipEl) {
          if (currentTooltipKeydownHandler) {
            document.removeEventListener("keydown", currentTooltipKeydownHandler, false);
            currentTooltipKeydownHandler = null;
          }
          tooltipEl.remove();
          tooltipEl = null;
        }
        //更新当前窗口的单词
        currentTooltipWord = hoveredDetail.word;

        //显示tooltip
        let parent = getParentAtPoint(lastMouseEvent.clientX, lastMouseEvent.clientY);
        showEnhancedTooltipForWord(hoveredDetail.word, sentence, hoveredRect, parent, hoveredDetail.word);

        // 添加阻止传播和默认行为
        e.preventDefault();
        e.stopPropagation();
      }
    } else if (e.key.toLowerCase() === copySentenceKey) {
      // 写入剪切板
      writeToClipboard();

      // 添加阻止传播和默认行为
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key.toLowerCase() === analysisWindowKey) {
      handleWordAnalysis();

      // 添加阻止传播和默认行为
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key.toLowerCase() === sidePanelKey) {
      // 打开侧栏，进行句子解析
      handleSidebarAnalysis();

      // 添加阻止传播和默认行为
      e.preventDefault();
      e.stopPropagation();
    }
  });
});



////////////////////// 添加点击事件监听器来处理tooltip的关闭
// 改成pointerdown，兼容触控
document.addEventListener('pointerdown',  (e) => {

  // 会覆盖原始网页的请求
  // e.preventDefault();

  // --- 新增：记录原始mousedown事件坐标 ---
  console.log('[DEBUG] Mousedown raw event coords:', { clientX: e?.clientX, clientY: e?.clientY });
  // --- 记录结束 ---


  //鼠标点击做一个鼠标移动的模拟，增加兼容性；
  //无论是否在仅点击模式下，点击都应当触发小窗检测


  // 获取当前点击的元素

  handleMouseMoveForTooltip(e,true);

  // 如果点击发生在Shadow DOM内部
  if (e.composedPath().includes(shadowHost)) {
    return; // 如果点击发生在Shadow DOM内，不关闭tooltip
  }

  // 检查是否点击在iframe弹窗或侧边栏内
  const iframePopup = document.getElementById('lingkuma-iframe-popup');
  const sidebar = document.getElementById('lingkuma-sidebar');
  const iframeOverlay = document.getElementById('lingkuma-iframe-overlay');

  if (iframePopup && (iframePopup.contains(e.target) || e.target === iframePopup)) {
    return; // 如果点击在iframe弹窗内，不关闭tooltip
  }

  if (sidebar && (sidebar.contains(e.target) || e.target === sidebar)) {
    return; // 如果点击在侧边栏内，不关闭tooltip
  }

  if (iframeOverlay && (iframeOverlay.contains(e.target) || e.target === iframeOverlay)) {
    return; // 如果点击在iframe遮罩层上，不关闭tooltip（让overlay自己处理关闭）
  }

  //就判断当前鼠标下面的单词是不是小窗单词不就行了嘛
  const dqwords = getWordAtPoint(e.clientX, e.clientY);
  console.log("当前鼠标下的单词是：", dqwords);

  // 修复：添加 dqwords 和 currentTooltipWord 的空值检查
  if(dqwords && currentTooltipWord && dqwords.includes(currentTooltipWord)){
    console.log("当前鼠标下的单词是小窗单词，不反应");
    return;
  }

    // 其他情况下关闭 tooltip
  closeTooltipWithAnimation();

  return

});

}

// --- 原来的添加监听器的代码现在被上面的函数取代 ---
// console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Attempting to add mousemove listener. Document readyState: ${document.readyState}`);
// document.addEventListener("mousemove", (e) => { ... }); // <--- 移除或注释掉直接调用

// --- 使用之前的逻辑来决定何时调用 setupMouseListeners ---
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Document already ready, queueing listener setup.`);

    //延迟5秒
    setTimeout(() => {
    setupMouseListeners();
    },0);

} else {
    console.log(`[a4_tooltip_new.js @ ${window.location.href.substring(0, 50)}] Document not ready, waiting for DOMContentLoaded.`);
    document.addEventListener('DOMContentLoaded', setupMouseListeners, { once: true });
}

// 检测bionic.js是否激活的变量
let isBionicActive = false;

// 监听bionic.js激活状态
function detectBionicMode() {
  // 检查页面上是否有bionic.js创建的元素
  const bionicElements = document.querySelectorAll('.highlight-wrapper, .highlight-container');
  const wasBionicActive = isBionicActive;
  isBionicActive = bionicElements.length > 0;

  // 如果状态发生变化，记录日志
  if (wasBionicActive !== isBionicActive) {
    console.log(`[a4_tooltip_new.js] Bionic模式状态变化: ${isBionicActive ? '激活' : '未激活'}`);

    // 如果当前有弹窗显示，更新其动画设置
    if (tooltipEl) {
      updateTooltipAnimationSettings();
    }
  }

  // 继续监测
  setTimeout(detectBionicMode, 2000); // 每2秒检查一次
}

// 启动检测
detectBionicMode();

// 更新弹窗动画设置
async function updateTooltipAnimationSettings() {
  if (!tooltipEl) {
    console.error('tooltipEl 为 null，无法更新动画设置');
    return;
  }

  // 使用快速缓存获取状态，避免异步延迟
  const isGlassEnabled = await getLiquidGlassEnabledFast();
  const shouldDisableAnimation = isBionicActive || isGlassEnabled;

  if (shouldDisableAnimation) {
    // 特殊模式激活时，禁用动画
    if (isBionicActive) {
      console.log('Bionic模式激活，禁用弹窗动画');
    }
    if (isGlassEnabled) {
      console.log('液体玻璃特效激活，禁用弹窗opacity动画');
    }
    tooltipEl.style.transition = 'none'; // 禁用过渡动画
    tooltipEl.style.willChange = 'transform'; // 只保留transform的硬件加速

    // 添加相应的类标记
    if (isBionicActive) {
      tooltipEl.classList.add('bionic-active');
    }
    if (isGlassEnabled) {
      // 等待液体玻璃效果应用完成
      await applyLiquidGlassToTooltip();

      // 玻璃效果应用完成后，添加标记类
      if (await isFirefox()) {
        tooltipEl.classList.add('firefox-glass-effect');
      } else {
        tooltipEl.classList.add('liquid-glass-active');
      }
    }
  } else {
    // 恢复正常动画
    tooltipEl.style.transition = 'opacity 0.05s ease-in-out';
    tooltipEl.style.willChange = 'opacity, transform';

    // 移除特殊模式的类标记
    tooltipEl.classList.remove('bionic-active', 'liquid-glass-active', 'firefox-glass-effect');
  }
}

// --- 新增：清理监听器的辅助函数 ---
function cleanupTooltipListeners() {
  // 清理按键监听器
  if (currentTooltipKeydownHandler) {
    document.removeEventListener("keydown", currentTooltipKeydownHandler, false);
    currentTooltipKeydownHandler = null;
  }

  // 清理ResizeObserver
  if (tooltipResizeObserver) {
    tooltipResizeObserver.disconnect();
    tooltipResizeObserver = null;
  }
  
  // 重置翻译输入框活动状态
  isTranslationInputActive = false;
}

// --- 新增：带动画关闭  关闭动画 Tooltip 的函数 ---
let isClosingTooltip = false; // 添加标志防止重复调用

function closeTooltipWithAnimation() {
  if (!tooltipEl || isClosingTooltip) return; // 如果 tooltip 不存在或正在关闭，则不执行任何操作

  isClosingTooltip = true; // 设置关闭标志
  tooltipBeingDestroyed = true; // 标记tooltip正在被销毁

  // 清理保存的状态，避免状态泄露到下一个弹窗
  originalExamplesSectionState = null;
  console.log('已清除保存的 examples-section 状态');

  // 清理top layer状态
  cleanupTopLayerState();

  // 清理胶囊容器的事件监听器
  if (tooltipEl && tooltipEl._cleanupCapsuleListener) {
    tooltipEl._cleanupCapsuleListener();
    delete tooltipEl._cleanupCapsuleListener;
  }

  // 解除爆炸弹窗的锁定状态
  if (typeof wordExplosionLocked !== 'undefined') {
    wordExplosionLocked = false;
    console.log('[Tooltip] 查词弹窗关闭，解除爆炸弹窗锁定');
  }

  // 立即保存需要清理的引用，避免异步操作影响新弹窗
  const tooltipToRemove = tooltipEl;
  const observerToDisconnect = tooltipResizeObserver;
  const listenerToRemove = currentTooltipKeydownHandler;

  // 立即清理全局变量，为新弹窗腾出空间
  // 这样即使异步操作还在进行，也不会影响新创建的tooltipEl
  tooltipEl = null;
  currentTooltipWord = null;
  tooltipResizeObserver = null;
  currentTooltipKeydownHandler = null;

  // 检查是否需要禁用动画（Bionic模式或液体玻璃特效）
  chrome.storage.local.get(['liquidGlassEnabled'], (result) => {
    const isGlassEnabled = result.liquidGlassEnabled !== undefined ? result.liquidGlassEnabled : liquidGlassEnabled;
    const shouldDisableAnimation = isBionicActive || isGlassEnabled;

    if (shouldDisableAnimation) {
      // 特殊模式下，立即关闭弹窗，不使用动画
      if (isBionicActive) {
        console.log("[a4_tooltip_new.js] Bionic模式下立即关闭弹窗，不使用动画");
      }
      if (isGlassEnabled) {
        console.log("[a4_tooltip_new.js] 液体玻璃特效启用，立即关闭弹窗，不使用opacity动画");
      }

      // 立即移除元素和监听器
      if (tooltipToRemove) {
        tooltipToRemove.remove();
      }
      if (observerToDisconnect) {
        observerToDisconnect.disconnect();
      }
      if (listenerToRemove) {
        document.removeEventListener("keydown", listenerToRemove, false);
      }

      // 在元素移除后清理液体玻璃效果
      cleanupLiquidGlass();

      // 重置销毁标志
      tooltipBeingDestroyed = false;

      // 重置关闭标志
      isClosingTooltip = false;
    } else {
      // 非特殊模式下，使用动画关闭
      // 1. 开始淡出动画 - 移除了立即隐藏的步骤，让动画可见
      if (tooltipToRemove) {
        tooltipToRemove.style.opacity = '0';
      }

      // 2. 等待动画完成 (0.08 秒，即 80 毫秒) 弹出动画
      setTimeout(() => {
        // 3. 动画完成后，移除元素和监听器
        if (tooltipToRemove) {
          tooltipToRemove.remove();
        }
        if (observerToDisconnect) {
          observerToDisconnect.disconnect();
        }
        if (listenerToRemove) {
          document.removeEventListener("keydown", listenerToRemove, false);
        }

        // 在元素移除后清理液体玻璃效果
        cleanupLiquidGlass();

        // 重置关闭标志
        isClosingTooltip = false;
        tooltipBeingDestroyed = false;
      }, 1); // 动画持续时间
    }
  });
}

// 清理top layer状态的函数
function cleanupTopLayerState() {
  console.log('开始清理top layer状态');

  // 检查shadowHost是否在top layer中
  const shadowHost = document.getElementById('lingkuma-tooltip-host');
  if (shadowHost && shadowHost.classList.contains('in-top-layer')) {
    console.log('检测到shadowHost在top layer中，开始退出全屏');

    // 如果shadowHost在全屏状态，退出全屏
    if (document.fullscreenElement === shadowHost) {
      document.exitFullscreen().then(() => {
        console.log('shadowHost已退出全屏');
        cleanupShadowHostStyles(shadowHost);
      }).catch(error => {
        console.error('退出全屏失败:', error);
        // 即使退出全屏失败，也要清理样式
        cleanupShadowHostStyles(shadowHost);
      });
    } else {
      // 如果不在全屏状态但有标记，直接清理样式
      cleanupShadowHostStyles(shadowHost);
    }
  }


}

// 清理shadowHost样式的函数
function cleanupShadowHostStyles(shadowHost) {
  console.log('清理shadowHost样式');

  // 移除top layer标记
  shadowHost.classList.remove('in-top-layer');

  // 恢复shadowHost的正常样式
  shadowHost.style.cssText = '';

  // 清理Shadow DOM中的top layer样式
  const shadowRoot = shadowHost.shadowRoot;
  if (shadowRoot) {
    const shadowStyle = shadowRoot.querySelector('#top-layer-style');
    if (shadowStyle) {
      shadowStyle.remove();
    }
  }

  console.log('shadowHost样式已恢复正常');
}

// --- 最小化和还原功能 ---
// 应用最小化状态但不重新定位（用于初始显示时）
function applyMinimizeStateWithoutRepositioning() {
  if (!tooltipEl) return;

  console.log('应用最小化状态（不重新定位）');

  // 在最小化之前保存原始状态（如果还没有保存的话）
  if (!originalExamplesSectionState) {
    saveExamplesSectionOriginalState();
  }

  // 隐藏指定的元素
  const elementsToHide = [
    '.fixed-header',
    '.fixed-footer',
    '.translation-section-header',
    '.examples-section'
  ];

  elementsToHide.forEach(selector => {
    const elements = tooltipEl.querySelectorAll(selector);
    elements.forEach(element => {
      element.style.display = 'none';
    });
  });

  // 显示还原按钮
  const restoreBtn = tooltipEl.querySelector('.restore-btn-words');
  if (restoreBtn) {
    restoreBtn.style.display = 'block';
    restoreBtn.style.position = 'absolute';
    restoreBtn.style.bottom = '5px';
    restoreBtn.style.left = '5px';
    restoreBtn.style.zIndex = '10';
    restoreBtn.style.opacity = '0';
    restoreBtn.style.transition = 'opacity 0.3s ease';
    restoreBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    restoreBtn.style.border = 'none';
    restoreBtn.style.borderRadius = '4px';
    restoreBtn.style.padding = '4px';
    restoreBtn.style.cursor = 'pointer';

    // 鼠标悬浮显示
    restoreBtn.addEventListener('mouseenter', () => {
      restoreBtn.style.opacity = '1';
    });

    restoreBtn.addEventListener('mouseleave', () => {
      restoreBtn.style.opacity = '0';
    });
  }

  // 显示状态切换按钮
  const statusToggleBtn = tooltipEl.querySelector('.status-toggle-btn');
  if (statusToggleBtn) {
    statusToggleBtn.style.display = 'block';
    statusToggleBtn.style.opacity = '0';
    statusToggleBtn.style.transition = 'opacity 0.3s ease';
    statusToggleBtn.style.position = 'absolute';
    statusToggleBtn.style.top = '5px';
    statusToggleBtn.style.left = '5px';
    statusToggleBtn.style.zIndex = '11';
    statusToggleBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    statusToggleBtn.style.border = 'none';
    statusToggleBtn.style.borderRadius = '4px';
    statusToggleBtn.style.padding = '4px';
    statusToggleBtn.style.cursor = 'pointer';

    statusToggleBtn.addEventListener('mouseenter', () => {
      statusToggleBtn.style.opacity = '1';
    });

    statusToggleBtn.addEventListener('mouseleave', () => {
      statusToggleBtn.style.opacity = '0';
    });
  }

  // 显示句子翻译按钮
  const showSentenceBtn = tooltipEl.querySelector('.show-sentence-translation-btn');
  if (showSentenceBtn) {
    showSentenceBtn.style.display = 'block';
    showSentenceBtn.style.position = 'absolute';
    showSentenceBtn.style.top = '5px';
    showSentenceBtn.style.left = '35px';
    showSentenceBtn.style.zIndex = '10';
    showSentenceBtn.style.opacity = '0';
    showSentenceBtn.style.transition = 'opacity 0.3s ease';
    showSentenceBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    showSentenceBtn.style.border = 'none';
    showSentenceBtn.style.borderRadius = '4px';
    showSentenceBtn.style.padding = '4px';
    showSentenceBtn.style.cursor = 'pointer';

    showSentenceBtn.addEventListener('mouseenter', () => {
      showSentenceBtn.style.opacity = '1';
    });

    showSentenceBtn.addEventListener('mouseleave', () => {
      showSentenceBtn.style.opacity = '0';
    });
  }

  // 显示句子解析按钮
  const minimizedAnalysisBtn = tooltipEl.querySelector('.minimized-analysis-btn');
  if (minimizedAnalysisBtn) {
    minimizedAnalysisBtn.style.display = 'block';
    minimizedAnalysisBtn.style.position = 'absolute';
    minimizedAnalysisBtn.style.top = '5px';
    minimizedAnalysisBtn.style.left = '65px';
    minimizedAnalysisBtn.style.zIndex = '10';
    minimizedAnalysisBtn.style.opacity = '0';
    minimizedAnalysisBtn.style.transition = 'opacity 0.3s ease';
    minimizedAnalysisBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    minimizedAnalysisBtn.style.border = 'none';
    minimizedAnalysisBtn.style.borderRadius = '4px';
    minimizedAnalysisBtn.style.padding = '4px';
    minimizedAnalysisBtn.style.cursor = 'pointer';

    minimizedAnalysisBtn.addEventListener('mouseenter', () => {
      minimizedAnalysisBtn.style.opacity = '1';
    });

    minimizedAnalysisBtn.addEventListener('mouseleave', () => {
      minimizedAnalysisBtn.style.opacity = '0';
    });
  }

  // 添加最小化标记类
  tooltipEl.classList.add('minimized');
}

// 最小化弹窗功能（用于用户手动点击最小化按钮）
function minimizeTooltip() {
  if (!tooltipEl) return;

  console.log('开始最小化弹窗（用户手动触发）');

  // 应用最小化状态
  applyMinimizeStateWithoutRepositioning();

  // 保存最小化状态到 chrome.storage.local
  chrome.storage.local.set({ 'tooltipMinimized': true }, () => {
    console.log('最小化状态已保存');
  });

  // === 重新计算mini窗口的位置 ===
  // 等待DOM更新完成后重新定位
  setTimeout(() => {
    repositionMiniTooltip();
  }, 50); // 短暂延迟确保DOM更新完成

  // 强制重新应用液体玻璃效果 - 改进版本
  setTimeout(() => {
    console.log('最小化函数中开始重新应用液体玻璃效果');
    // 先彻底清理现有效果
    // cleanupLiquidGlass();

    // // 等待清理完成后再重新应用
    // setTimeout(() => {
    //   console.log('最小化清理完成，重新应用液体玻璃效果');
    //   applyLiquidGlassToTooltip();
    // }, 150); // 增加清理等待时间

  }, 300); // 等待最小化动画完成
}

// 重新定位mini窗口
async function repositionMiniTooltip() {
  if (!tooltipEl || !currentWordRect) {
    console.log('无法重新定位mini窗口：缺少必要的元素或单词位置信息');
    return;
  }

  console.log('开始重新定位mini窗口');

  // 获取mini窗口的实际尺寸
  const miniRect = tooltipEl.getBoundingClientRect();
  const miniWidth = miniRect.width;
  const miniHeight = miniRect.height;

  console.log(`Mini窗口实际尺寸: ${miniWidth}x${miniHeight}`);

  // 获取视口信息
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 获取缩放因子和gap设置
  const baseDPR = await getStorageValue('devicePixelRatio') || window.devicePixelRatio || 1.0;
  const currentDPR = window.devicePixelRatio || 1;
  let zoomFactor = currentDPR / baseDPR;

  let gap = await getStorageValue('tooltipGap');
  gap = gap !== undefined ? gap : 50;
  gap = gap / zoomFactor;

  // 检测shadowHost是否在top layer（全屏模式）
  const shadowHost = document.getElementById('lingkuma-tooltip-host');
  const isInTopLayer = shadowHost && (shadowHost.matches(':fullscreen') || shadowHost.matches(':modal'));
  const scrollOffsetX = isInTopLayer ? 0 : window.scrollX;
  const scrollOffsetY = isInTopLayer ? 0 : window.scrollY;

  console.log('[Mini窗口定位] shadowHost在top layer:', isInTopLayer, '滚动偏移:', scrollOffsetX, scrollOffsetY);

  // 计算单词的绝对位置
  const wordTopAbsolute = currentWordRect.top + scrollOffsetY;
  const wordBottomAbsolute = currentWordRect.bottom + scrollOffsetY;

  // 初始期望的左侧位置（与单词左侧对齐）
  let desiredLeft = currentWordRect.left + scrollOffsetX;

  // 检测竖排文本模式，如果是竖排则添加额外的水平偏移
  if (detectVerticalWritingMode()) {
    desiredLeft += 300; // 在竖排模式下向右偏移300px
    console.log("Mini弹窗检测到竖排文本模式，位置向右偏移300px");
  }

  // 检查是否会超出视口右侧
  const willExceedRight = (desiredLeft + miniWidth) > (viewportWidth + scrollOffsetX);

  // 检查上方和下方空间
  const spaceAboveViewport = currentWordRect.top;
  const spaceBelowViewport = viewportHeight - currentWordRect.bottom;
  const willExceedTop = (miniHeight + gap) > spaceAboveViewport;
  const willExceedBottom = (miniHeight + gap) > spaceBelowViewport;

  // 获取用户设置：是否优先向上弹出
  chrome.storage.local.get('preferPopupAbove', function(result) {
    const preferPopupAbove = result.preferPopupAbove || false;

    // 根据设置和空间情况决定弹窗方向
    let showAbove = false;
    if (preferPopupAbove) {
      showAbove = !willExceedTop;
    } else {
      showAbove = willExceedBottom && !willExceedTop;
    }

    // 计算垂直位置
    let newTop;
    if (showAbove) {
      // 向上展示
      newTop = wordTopAbsolute - miniHeight - gap;
      console.log('Mini窗口将向上展示');
    } else {
      // 向下展示
      newTop = wordBottomAbsolute + gap;

      // 检查是否会超出视口底部
      const willExceedBottomAbsolute = (newTop + miniHeight) > (viewportHeight + scrollOffsetY);
      if (willExceedBottomAbsolute) {
        console.log("Mini窗口向下展示会超出底部，调整位置");
        newTop = Math.max(scrollOffsetY + 10, viewportHeight + scrollOffsetY - miniHeight);
      }
      console.log('Mini窗口将向下展示');
    }

    // 计算水平位置
    let newLeft = desiredLeft;
    if (willExceedRight) {
      // 如果会超出右侧，则向左调整
      newLeft = Math.max(viewportWidth - miniWidth - 10, 10);
      // 在竖排模式下，向左调整时也要减去偏移量
      if (detectVerticalWritingMode()) {
        newLeft = Math.max(newLeft - 300, 10);
        console.log("竖排模式下Mini窗口向左调整位置，减去300px偏移");
      }
      newLeft += scrollOffsetX;
      console.log('Mini窗口右侧会超出，向左调整位置');
    }

    // 确保不会超出左侧边界
    if (newLeft < scrollOffsetX + 10) {
      newLeft = scrollOffsetX + 10;
      console.log('Mini窗口左侧会超出，向右调整位置');
    }

    // 应用新位置
    tooltipEl.style.left = newLeft + 'px';
    tooltipEl.style.top = newTop + 'px';

    console.log(`Mini窗口重新定位完成: left=${newLeft}, top=${newTop}`);
  });
}

// 还原弹窗功能
function restoreTooltip() {
  if (!tooltipEl) return;

  console.log('开始还原弹窗');

  // 恢复之前隐藏的元素
  const elementsToShow = [
    '.fixed-header',
    '.fixed-footer',
    '.translation-section-header',
    '.examples-section'
  ];

  elementsToShow.forEach(selector => {
    const elements = tooltipEl.querySelectorAll(selector);
    console.log(`还原：找到 ${elements.length} 个 ${selector} 元素`);
    elements.forEach(element => {
      element.style.display = ''; // 移除行内display样式，恢复到其原始状态或CSS定义的样式
      console.log(`已恢复元素:`, element);
    });
  });

  // 恢复 examples-section 的原始状态
  restoreExamplesSectionOriginalState();

  // 隐藏还原按钮
  const restoreBtn = tooltipEl.querySelector('.restore-btn-words');
  if (restoreBtn) {
    restoreBtn.style.display = 'none';
  }

  // 隐藏状态切换按钮并移除小窗模式下的样式和事件监听
  const statusToggleBtn = tooltipEl.querySelector('.status-toggle-btn');
  if (statusToggleBtn) {
    statusToggleBtn.style.display = 'none'; // 在非小窗模式下隐藏
    statusToggleBtn.style.opacity = ''; // 移除透明度设置
    statusToggleBtn.style.position = ''; // 移除定位
    statusToggleBtn.style.top = '';
    statusToggleBtn.style.left = '';
    statusToggleBtn.style.zIndex = '';
    statusToggleBtn.style.backgroundColor = '';
    statusToggleBtn.style.border = '';
    statusToggleBtn.style.borderRadius = '';
    statusToggleBtn.style.padding = '';
    statusToggleBtn.style.cursor = '';
    // 移除事件监听器，需要保存函数引用或者使用其他方式，这里简单处理，如果事件监听器是通过匿名函数添加的，这种方式移除不了
    // 但由于我们是在 minimizeTooltip 中添加，restore 时是另一个作用域，直接设置 style.display = 'none' 即可达到隐藏效果
    // 如果需要彻底移除监听器，需要在添加时保存函数引用
  }

  // 隐藏句子翻译按钮
  const showSentenceBtn = tooltipEl.querySelector('.show-sentence-translation-btn');
  if (showSentenceBtn) {
    showSentenceBtn.style.display = 'none';
    showSentenceBtn.style.opacity = '';
    showSentenceBtn.style.position = '';
    showSentenceBtn.style.bottom = '';
    showSentenceBtn.style.right = '';
    showSentenceBtn.style.zIndex = '';
    showSentenceBtn.style.backgroundColor = '';
    showSentenceBtn.style.border = '';
    showSentenceBtn.style.borderRadius = '';
    showSentenceBtn.style.padding = '';
    showSentenceBtn.style.cursor = '';
  }

  // 隐藏句子解析按钮
  const minimizedAnalysisBtn = tooltipEl.querySelector('.minimized-analysis-btn');
  if (minimizedAnalysisBtn) {
    minimizedAnalysisBtn.style.display = 'none';
    minimizedAnalysisBtn.style.opacity = '';
    minimizedAnalysisBtn.style.position = '';
    minimizedAnalysisBtn.style.top = '';
    minimizedAnalysisBtn.style.left = '';
    minimizedAnalysisBtn.style.zIndex = '';
    minimizedAnalysisBtn.style.backgroundColor = '';
    minimizedAnalysisBtn.style.border = '';
    minimizedAnalysisBtn.style.borderRadius = '';
    minimizedAnalysisBtn.style.padding = '';
    minimizedAnalysisBtn.style.cursor = '';
  }

  // 移除最小化状态从 chrome.storage.local
  chrome.storage.local.set({ 'tooltipMinimized': false }, () => {
    console.log('还原状态已保存');
  });

  // 移除最小化标记类
  tooltipEl.classList.remove('minimized');

  // 强制重新应用液体玻璃效果 - 改进版本
  setTimeout(() => {
    console.log('还原函数中开始重新应用液体玻璃效果');
    // 先彻底清理现有效果
    // cleanupLiquidGlass();

    // 等待清理完成后再重新应用 
    // setTimeout(() => {
    //   console.log('还原清理完成，重新应用液体玻璃效果');
    //   applyLiquidGlassToTooltip();
    // }, 150); // 增加清理等待时间
  }, 300); // 等待还原动画完成
}

// 显示当前句子翻译的函数
function showCurrentSentenceTranslation(word, currentSentence) {
  if (!tooltipEl) {
    console.error('tooltipEl 不存在');
    return;
  }

  console.log('显示当前句子翻译:', word, currentSentence);

  // 在修改状态之前，先保存原始状态
  saveExamplesSectionOriginalState();

  // 1. 显示 examples-section
  const examplesSection = tooltipEl.querySelector('.examples-section');
  if (examplesSection) {
    examplesSection.style.display = 'block';
    console.log('显示 examples-section');
  } else {
    console.error('未找到 examples-section');
    return;
  }

  // 2. 隐藏 examples-section-header
  const examplesSectionHeader = tooltipEl.querySelector('.examples-section-header');
  if (examplesSectionHeader) {
    examplesSectionHeader.style.display = 'none';
    console.log('隐藏 examples-section-header');
  }

  // 3. 找到匹配当前句子的例句条目并隐藏其他无关的句子
  const sentencePairs = tooltipEl.querySelectorAll('.example-sentence-pair');
  let foundMatch = false;

  sentencePairs.forEach(pair => {
    const sentenceElement = pair.querySelector('.example-sentence');
    if (sentenceElement) {
      // 获取例句文本，移除HTML标签进行比较
      let exampleSentenceText = sentenceElement.textContent || sentenceElement.innerText;

      // 移除可能的强调标签内容，只保留纯文本
      exampleSentenceText = exampleSentenceText.trim();

      // 移除当前句子中可能的HTML标签进行比较
      const cleanCurrentSentence = currentSentence.replace(/<[^>]*>/g, '').trim();

      console.log('比较句子:', {
        example: exampleSentenceText,
        current: cleanCurrentSentence,
        match: exampleSentenceText === cleanCurrentSentence
      });

      if (exampleSentenceText === cleanCurrentSentence) {
        // 找到匹配的句子，显示它
        pair.style.display = 'block';
        // 自动显示翻译
        const translationLine = pair.querySelector('.example-translation-line');
        if (translationLine) {
          translationLine.style.display = 'block';
        }
        foundMatch = true;
        console.log('找到匹配的句子，显示翻译');
      } else {
        // 隐藏不匹配的句子
        pair.style.display = 'none';
      }
    }
  });

  if (!foundMatch) {
    console.log('未找到匹配的句子，可能需要先添加到数据库');
    // 可以选择显示一个提示或者自动添加句子
    // 这里暂时显示所有句子作为备选方案
    sentencePairs.forEach(pair => {
      pair.style.display = 'block';
    });
  }
}

// 用于保存原始窗口状态的变量
let originalExamplesSectionState = null;

// 保存 examples-section 原始状态的函数
function saveExamplesSectionOriginalState() {
  if (!tooltipEl) {
    console.error('tooltipEl 不存在，无法保存状态');
    return;
  }

  console.log('保存 examples-section 原始状态');

  const examplesSection = tooltipEl.querySelector('.examples-section');
  const examplesSectionHeader = tooltipEl.querySelector('.examples-section-header');
  const sentencePairs = tooltipEl.querySelectorAll('.example-sentence-pair');

  // 保存当前状态
  originalExamplesSectionState = {
    examplesSectionDisplay: examplesSection ? examplesSection.style.display : '',
    examplesSectionHeaderDisplay: examplesSectionHeader ? examplesSectionHeader.style.display : '',
    sentencePairs: []
  };

  // 保存每个句子对的状态
  sentencePairs.forEach((pair, index) => {
    const translationLine = pair.querySelector('.example-translation-line');
    originalExamplesSectionState.sentencePairs.push({
      index: index,
      pairDisplay: pair.style.display,
      translationLineDisplay: translationLine ? translationLine.style.display : ''
    });
  });

  console.log('已保存原始状态:', originalExamplesSectionState);
}

// 恢复 examples-section 原始状态的函数
function restoreExamplesSectionOriginalState() {

  if (!tooltipEl) {
    console.error('tooltipEl 不存在');
    return;
  }

  console.log('恢复 examples-section 原始状态');

  // 如果没有保存的状态，使用默认恢复逻辑
  if (!originalExamplesSectionState) {
    console.log('没有保存的状态，使用默认恢复逻辑');
    restoreExamplesSectionDefaultState();
    return;
  }

  // 1. 恢复 examples-section 的显示状态
  const examplesSection = tooltipEl.querySelector('.examples-section');
  if (examplesSection) {
    examplesSection.style.display = originalExamplesSectionState.examplesSectionDisplay;
    console.log('恢复 examples-section 显示状态:', originalExamplesSectionState.examplesSectionDisplay);
  }

  // 2. 恢复 examples-section-header 的显示状态
  const examplesSectionHeader = tooltipEl.querySelector('.examples-section-header');
  if (examplesSectionHeader) {
    examplesSectionHeader.style.display = originalExamplesSectionState.examplesSectionHeaderDisplay;
    console.log('恢复 examples-section-header 显示状态:', originalExamplesSectionState.examplesSectionHeaderDisplay);
  }

  // 3. 恢复所有例句条目的状态
  const sentencePairs = tooltipEl.querySelectorAll('.example-sentence-pair');
  sentencePairs.forEach((pair, index) => {
    const savedState = originalExamplesSectionState.sentencePairs[index];
    if (savedState) {
      pair.style.display = savedState.pairDisplay;

      // 恢复翻译行的状态
      const translationLine = pair.querySelector('.example-translation-line');
      if (translationLine) {
        translationLine.style.display = savedState.translationLineDisplay;
      }
    }
  });

  console.log('已恢复到保存的原始状态');

  // 清除保存的状态，避免下次误用
  originalExamplesSectionState = null;
}

// 默认恢复逻辑（原来的逻辑）
function restoreExamplesSectionDefaultState() {
  console.log('使用默认恢复逻辑');

  // 添加null检查，确保tooltipEl存在
  if (!tooltipEl) {
    console.error('tooltipEl 为 null，无法恢复默认状态');
    return;
  }

  // 1. 恢复 examples-section-header 的显示
  const examplesSectionHeader = tooltipEl.querySelector('.examples-section-header');
  if (examplesSectionHeader) {
    examplesSectionHeader.style.display = '';
    console.log('恢复 examples-section-header 显示');
  }

  // 2. 恢复所有例句条目的显示
  const sentencePairs = tooltipEl.querySelectorAll('.example-sentence-pair');
  sentencePairs.forEach(pair => {
    pair.style.display = '';

    // 3. 恢复翻译行的原始隐藏状态（默认隐藏，鼠标悬浮时显示）
    const translationLine = pair.querySelector('.example-translation-line');
    if (translationLine) {
      translationLine.style.display = 'none';
    }
  });

  console.log('已恢复所有例句条目的原始状态');
}

// --- 新增结束 ---

// ========== 自定义胶囊功能 ==========

// 生成所有胶囊容器（包括默认容器和自定义容器）
async function generateAllCapsules(wrapper, currentWord, shadowRoot) {
  // 获取自定义胶囊配置
  const result = await new Promise(resolve => {
    chrome.storage.local.get(['customCapsules', 'tooltipThemeMode'], resolve);
  });

  const customCapsules = result.customCapsules || [];
  const themeMode = result.tooltipThemeMode || 'auto';
  let isDark = false;

  if (themeMode === 'dark') {
    isDark = true;
  } else if (themeMode === 'light') {
    isDark = false;
  } else {
    // 自动模式：使用当前页面的高亮模式
    if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.isDarkMode !== undefined) {
      isDark = highlightManager.isDarkMode;
    } else {
      isDark = false;
    }
  }

  // 1. 创建默认胶囊容器（包含液体玻璃、最小化、关闭按钮）
  const defaultCapsule = createDefaultCapsule(isDark);
  wrapper.appendChild(defaultCapsule);

  // 绑定默认按钮事件
  bindDefaultCapsuleEvents(defaultCapsule, shadowRoot);

  // 2. 创建自定义胶囊容器
  customCapsules.forEach((capsuleContainer, containerIndex) => {
    const customCapsule = createCustomCapsule(capsuleContainer, containerIndex, currentWord, isDark);
    wrapper.appendChild(customCapsule);
  });

  // 3. 检查是否需要应用玻璃效果（使用CSS效果）
  const isGlassEnabled = await getLiquidGlassEnabledFast();
  console.log('胶囊创建时检查玻璃效果状态:', isGlassEnabled);

  if (isGlassEnabled) {
    // 检查是否为Firefox
    const isFirefoxBrowser = await isFirefox();
    console.log('是否为Firefox浏览器:', isFirefoxBrowser);

    // 为所有胶囊添加CSS玻璃效果类
    const allCapsules = wrapper.querySelectorAll('.header-buttons-capsule');
    console.log('找到胶囊数量:', allCapsules.length);

    allCapsules.forEach((capsule, index) => {
      if (isFirefoxBrowser) {
        capsule.classList.add('firefox-glass-effect');
        console.log(`胶囊 #${index + 1} 添加了 firefox-glass-effect 类`);
      } else {
        capsule.classList.add('liquid-glass-active');
        console.log(`胶囊 #${index + 1} 添加了 liquid-glass-active 类`);
      }
      console.log(`胶囊 #${index + 1} 当前类列表:`, capsule.className);
    });

    console.log(`已为 ${allCapsules.length} 个胶囊添加CSS玻璃效果`);
  }
}

// 创建默认胶囊容器
function createDefaultCapsule(isDark) {
  const capsule = document.createElement('div');
  capsule.className = 'header-buttons-capsule';
  if (isDark) {
    capsule.classList.add('dark-mode');
  }

  capsule.innerHTML = `
    <button class="capsule-highlight-theme-btn" title="切换高亮明暗模式">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    </button>
    <button class="capsule-liquid-glass-btn" title="切换液体玻璃效果">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M42.199 23.504c-.203-.609-.576-1.705-1.621-2.436c-1.265-.877-2.942-.82-3.242-.812c-.616.024-.957.13-1.621 0c-.47-.098-1.24-.244-1.621-.812c-.324-.48-.122-.877 0-2.437c.097-1.226.138-1.843 0-2.436c-.3-1.283-1.208-2.079-1.621-2.436c-.851-.747-1.929-1.267-4.052-1.624c-1.475-.252-3.85-.487-7.295 0c-1.742.244-4.425.706-6.483 1.397a17.7 17.7 0 0 0-4.863 2.436c-.016.008-.033.016-.04.024c-2.789 1.82-4.37 5.035-4.231 8.373c.737 17.922 33.091 20.18 36.69 4.823c.073-.487.64-2.152 0-4.06m-16.85-4.775a2.24 2.24 0 0 1-2.237-2.241c0-1.243.997-2.242 2.237-2.242h2.196a2.238 2.238 0 0 1 1.58 3.825a2.23 2.23 0 0 1-1.58.658z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M8.159 21.068a2.434 2.434 0 0 0 2.43 2.437a2.434 2.434 0 0 0 2.432-2.434v-.003a2.434 2.434 0 0 0-2.43-2.438a2.434 2.434 0 0 0-2.432 2.435zm4.051 7.308a2.434 2.434 0 0 0 2.432 2.437a2.434 2.434 0 0 0 2.432-2.436v0a2.434 2.434 0 0 0-2.43-2.438a2.434 2.434 0 0 0-2.433 2.434zm8.106 2.437a2.434 2.434 0 0 0 2.429 2.438a2.434 2.434 0 0 0 2.434-2.434v-.005a2.434 2.434 0 0 0-2.432-2.436a2.434 2.434 0 0 0-2.431 2.436zM28.42 30a2.434 2.434 0 0 0 2.43 2.439a2.434 2.434 0 0 0 2.433-2.434V30a2.434 2.434 0 0 0-2.43-2.436A2.434 2.434 0 0 0 28.42 30"/></svg>
    </button>
    <button class="capsule-minimize-btn" title="最小化">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
        <rect x="12" y="21" width="30" height="6" rx="4" ry="4" fill="none" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="capsule-close-btn" title="关闭">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m28.51 24l13.056-13.055a3.188 3.188 0 1 0-4.51-4.51L24 19.49L10.945 6.435a3.188 3.188 0 1 0-4.51 4.51L19.49 24L6.434 37.055a3.188 3.188 0 1 0 4.51 4.51L24 28.512l13.055 13.055c.623.623 1.44.934 2.255.934s1.633-.311 2.256-.934a3.19 3.19 0 0 0 0-4.51z"/></svg>
    </button>
  `;

  return capsule;
}

// 创建自定义胶囊容器
function createCustomCapsule(capsuleContainer, containerIndex, currentWord, isDark) {
  const capsule = document.createElement('div');
  capsule.className = 'header-buttons-capsule custom-capsule';
  if (isDark) {
    capsule.classList.add('dark-mode');
  }

  const buttons = capsuleContainer.buttons || [];

  // 从URL中提取域名并获取对应网站的favicon
  const getFaviconFromUrl = (url) => {
    try {
      // 替换{word}占位符为空字符串以便解析URL
      const cleanUrl = url.replace('{word}', '');
      const urlObj = new URL(cleanUrl);
      const origin = urlObj.origin;
      // 使用Google的favicon服务获取网站图标
      return `https://www.google.com/s2/favicons?domain=${origin}&sz=32`;
    } catch (e) {
      // 如果URL解析失败，返回空字符串
      return '';
    }
  };

  const buttonsHTML = buttons.map((button, btnIndex) => {
    let icon;
    if (button.icon) {
      // 如果用户自定义了图标，使用自定义图标
      icon = button.icon;
    } else {
      // 否则使用按钮URL对应网站的favicon
      const faviconUrl = getFaviconFromUrl(button.url);
      if (faviconUrl) {
        icon = `<img src="${faviconUrl}" width="20" height="20" style="object-fit: contain;" onerror="this.style.display='none'">`;
      } else {
        // 如果无法获取favicon，使用默认SVG图标
        icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
      }
    }

    return `
      <button class="capsule-custom-btn"
              data-container-index="${containerIndex}"
              data-btn-index="${btnIndex}"
              title="${button.name}">
        ${icon}
      </button>
    `;
  }).join('');

  capsule.innerHTML = buttonsHTML;

  // 绑定按钮事件
  const btns = capsule.querySelectorAll('.capsule-custom-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const btnIndex = parseInt(btn.getAttribute('data-btn-index'));
      const button = buttons[btnIndex];

      if (button) {
        handleCustomButtonClick(button, currentWord);
      }
    });
  });

  return capsule;
}

// 绑定默认胶囊按钮事件
function bindDefaultCapsuleEvents(capsule, shadowRoot) {
  // 绑定高亮明暗切换按钮事件
  const highlightThemeBtn = capsule.querySelector('.capsule-highlight-theme-btn');
  if (highlightThemeBtn) {
    highlightThemeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 切换当前页面的高亮明暗模式
      if (typeof highlightManager !== 'undefined' && highlightManager) {
        const currentMode = highlightManager.isDarkMode;
        const newMode = !currentMode;

        console.log(`胶囊按钮：切换高亮模式从 ${currentMode ? '暗色' : '亮色'} 到 ${newMode ? '暗色' : '亮色'}`);

        // 更新当前页面的高亮模式（不写入storage）
        highlightManager.setDarkMode(newMode);
        highlightManager.reapplyHighlights();

        // 更新按钮图标
        updateHighlightThemeButtonIcon(highlightThemeBtn, newMode);

        // 如果当前tooltip主题模式是auto，需要更新tooltip和爆炸窗口的主题
        chrome.storage.local.get(['tooltipThemeMode'], (result) => {
          const themeMode = result.tooltipThemeMode || 'auto';
          if (themeMode === 'auto') {
            // 更新当前tooltip的主题
            if (tooltipEl) {
              if (newMode) {
                tooltipEl.classList.add('dark-mode');
              } else {
                tooltipEl.classList.remove('dark-mode');
              }
            }

            // 更新爆炸窗口的主题
            if (typeof wordExplosionEl !== 'undefined' && wordExplosionEl) {
              if (newMode) {
                wordExplosionEl.classList.add('dark-mode');
              } else {
                wordExplosionEl.classList.remove('dark-mode');
              }
              console.log('[胶囊按钮] 已更新爆炸窗口主题:', newMode ? '暗色' : '亮色');
            }

            // 更新所有胶囊容器的主题
            const shadowHost = document.getElementById('lingkuma-tooltip-host');
            if (shadowHost && shadowHost.shadowRoot) {
              const capsules = shadowHost.shadowRoot.querySelectorAll('.header-buttons-capsule');
              capsules.forEach(capsule => {
                if (newMode) {
                  capsule.classList.add('dark-mode');
                } else {
                  capsule.classList.remove('dark-mode');
                }
              });
            }
          }
        });
      } else {
        console.warn('highlightManager 未定义，无法切换高亮模式');
      }
    });

    // 初始化按钮图标
    if (typeof highlightManager !== 'undefined' && highlightManager) {
      updateHighlightThemeButtonIcon(highlightThemeBtn, highlightManager.isDarkMode);
    }
  }

  // 绑定液体玻璃按钮事件
  const liquidGlassBtn = capsule.querySelector('.capsule-liquid-glass-btn');
  if (liquidGlassBtn) {
    liquidGlassBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const currentEnabled = await getLiquidGlassEnabledFast();
      const newEnabled = !currentEnabled;

      chrome.storage.local.set({ liquidGlassEnabled: newEnabled }, () => {
        console.log('液体玻璃效果已', newEnabled ? '启用' : '禁用');
        liquidGlassEnabledCache = null;
        liquidGlassEnabledCacheTime = 0;

        if (newEnabled) {
          applyLiquidGlassToTooltip();
        } else {
          cleanupLiquidGlass();
        }
      });
    });
  }

  // 绑定最小化按钮事件
  const minimizeBtn = capsule.querySelector('.capsule-minimize-btn');
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      minimizeTooltip();
    });
  }

  // 绑定关闭按钮事件
  const closeBtn = capsule.querySelector('.capsule-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeTooltipWithAnimation();
    });
  }
}

// 更新高亮主题按钮图标
function updateHighlightThemeButtonIcon(button, isDark) {
  if (!button) return;

  // 根据当前模式显示对应图标
  if (isDark) {
    // 暗色模式 - 显示月亮图标
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    `;
    button.title = "切换到亮色高亮";
  } else {
    // 亮色模式 - 显示太阳图标
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    `;
    button.title = "切换到暗色高亮";
  }
}

// 处理自定义按钮点击
function handleCustomButtonClick(button, currentWord) {
  // 替换URL中的{word}占位符
  const url = button.url.replace(/{word}/g, encodeURIComponent(currentWord));

  switch (button.openMethod) {
    case 'newTab':
      // 在新标签页中打开
      chrome.runtime.sendMessage({
        action: 'openCustomCapsuleTab',
        url: url
      });
      break;

    case 'iframe':
      // 在iframe弹窗中打开
      openIframePopup(url, button.name);
      break;

    case 'newWindow':
      // 在新窗口中打开
      chrome.runtime.sendMessage({
        action: 'openCustomCapsuleWindow',
        url: url
      });
      break;

    case 'sidebar':
      // 在侧边栏中打开
      chrome.runtime.sendMessage({
        action: 'openCustomCapsuleSidebar',
        url: url,
        word: currentWord
      });
      break;
  }
}

/**
 * 为所有胶囊应用玻璃效果
 * @param {boolean} isFirefoxGlass - 是否使用Firefox CSS玻璃效果
 * @param {boolean} isLiquidGlass - 是否使用液体玻璃效果
 */
function applyGlassEffectToCapsules(isFirefoxGlass, isLiquidGlass) {
  try {
    console.log('applyGlassEffectToCapsules 被调用, Firefox:', isFirefoxGlass, 'Liquid:', isLiquidGlass);

    // 获取Shadow DOM中的所有胶囊容器
    const shadowHost = document.getElementById('lingkuma-tooltip-host');
    if (!shadowHost || !shadowHost.shadowRoot) {
      console.log('Shadow Host不存在，无法应用胶囊玻璃效果');
      return;
    }

    const capsules = shadowHost.shadowRoot.querySelectorAll('.header-buttons-capsule');
    if (!capsules || capsules.length === 0) {
      console.log('未找到胶囊容器，跳过玻璃效果应用');
      return;
    }

    console.log(`为 ${capsules.length} 个胶囊应用玻璃效果...`);

    capsules.forEach((capsule, index) => {
      console.log(`胶囊 #${index + 1} 应用前的类:`, capsule.className);

      if (isFirefoxGlass) {
        // Firefox CSS玻璃效果
        capsule.classList.add('firefox-glass-effect');
        console.log(`胶囊 #${index + 1} 已应用Firefox玻璃效果`);
      } else if (isLiquidGlass) {
        // 液体玻璃效果 - 使用CSS效果（性能优化）
        capsule.classList.add('liquid-glass-active');
        console.log(`胶囊 #${index + 1} 已应用液体玻璃CSS效果`);
      }

      console.log(`胶囊 #${index + 1} 应用后的类:`, capsule.className);
    });

    console.log('所有胶囊玻璃效果应用完成');
  } catch (error) {
    console.error('应用胶囊玻璃效果时出错:', error);
  }
}

/**
 * 清理所有胶囊的玻璃效果
 */
function cleanupGlassEffectFromCapsules() {
  try {
    // 获取Shadow DOM中的所有胶囊容器
    const shadowHost = document.getElementById('lingkuma-tooltip-host');
    if (!shadowHost || !shadowHost.shadowRoot) {
      console.log('Shadow Host不存在，无法清理胶囊玻璃效果');
      return;
    }

    const capsules = shadowHost.shadowRoot.querySelectorAll('.header-buttons-capsule');
    if (!capsules || capsules.length === 0) {
      console.log('未找到胶囊容器，跳过玻璃效果清理');
      return;
    }

    console.log(`清理 ${capsules.length} 个胶囊的玻璃效果...`);

    capsules.forEach((capsule, index) => {
      // 移除CSS类
      capsule.classList.remove('firefox-glass-effect');
      capsule.classList.remove('liquid-glass-active');

      console.log(`胶囊 #${index + 1} 玻璃效果已清理`);
    });

    console.log('所有胶囊玻璃效果清理完成');
  } catch (error) {
    console.error('清理胶囊玻璃效果时出错:', error);
  }
}

// 打开iframe弹窗
function openIframePopup(url, title) {
  // 检查是否已存在iframe弹窗
  let iframePopup = document.getElementById('lingkuma-iframe-popup');

  if (!iframePopup) {
    // 降低tooltip的z-index，让iframe弹窗显示在上层
    if (tooltipEl) {
      tooltipEl.style.zIndex = "2147483600";
    }

    // 创建iframe弹窗容器
    iframePopup = document.createElement('div');
    iframePopup.id = 'lingkuma-iframe-popup';
    iframePopup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80vw;
      height: 80vh;
      max-width: 1200px;
      max-height: 800px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 2147483647 !important;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // 创建标题栏
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 15px 20px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = `
      font-weight: 600;
      font-size: 16px;
      color: #333;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: rgba(0, 0, 0, 0) !important;
      border: 0 solid transparent !important;
      font-size: 28px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    `;
    closeBtn.addEventListener('click', () => {
      // 恢复tooltip的z-index
      if (tooltipEl) {
        tooltipEl.style.zIndex = "2147483647";
      }
      iframePopup.remove();
    });
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = '#e0e0e0';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(0, 0, 0, 0)';
    });

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // 创建iframe
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = `
      flex: 1;
      border: none;
      width: 100%;
      height: 100%;
    `;

    iframePopup.appendChild(header);
    iframePopup.appendChild(iframe);
    document.body.appendChild(iframePopup);

    // 点击外部关闭
    const overlay = document.createElement('div');
    overlay.id = 'lingkuma-iframe-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483645;
    `;
    overlay.addEventListener('click', () => {
      // 恢复tooltip的z-index
      if (tooltipEl) {
        tooltipEl.style.zIndex = "2147483647";
      }
      iframePopup.remove();
      overlay.remove();
    });
    document.body.appendChild(overlay);

    // 当弹窗关闭时也移除overlay
    const originalRemove = iframePopup.remove.bind(iframePopup);
    iframePopup.remove = function() {
      // 恢复tooltip的z-index
      if (tooltipEl) {
        tooltipEl.style.zIndex = "2147483647";
      }
      overlay.remove();
      originalRemove();
    };
  } else {
    // 如果已存在，更新iframe的src和标题
    const iframe = iframePopup.querySelector('iframe');
    const titleEl = iframePopup.querySelector('div > div');
    if (iframe) iframe.src = url;
    if (titleEl) titleEl.textContent = title;
  }
}

