// 检测 extension context 是否有效
function isContextValid() {
    try {
        // 尝试访问 chrome.runtime.id
        return !!chrome.runtime?.id;
    } catch (error) {
        console.error("Extension context 已失效:", error);
        return false;
    }
}

// 在页面加载时检查 context
if (!isContextValid()) {
    console.error("Extension context 已失效,popup 需要重新加载");
    document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">Extension context invalidated. Please reload the extension.</div>';
    throw new Error("Extension context invalidated");
}

// 全局错误处理器 - 捕获 Extension context invalidated 错误
window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
        console.error("捕获到 Extension context invalidated 错误");
        document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">Extension context invalidated. Please reload the extension.</div>';
        event.preventDefault();
        return true;
    }
});

// 全局 Promise 错误处理器
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('Extension context invalidated')) {
        console.error("捕获到未处理的 Promise 错误: Extension context invalidated");
        document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">Extension context invalidated. Please reload the extension.</div>';
        event.preventDefault();
        return true;
    }
});

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
    const cacheExpiry = 10 * 60 * 1000; // 10分钟缓存过期时间

    if (cachedBackgroundSettings && (now - lastBackgroundSettingsUpdate < cacheExpiry)) {
      console.log("使用缓存的背景设置");
      applyBackgroundSettings(cachedBackgroundSettings);
      resolve();
      return;
    }

    // 如果没有缓存或缓存已过期，从storage获取
    chrome.storage.local.get(['tooltipBackground'], function(result) {
      const bgSettings = result.tooltipBackground || { enabled: true, defaultType: 'video' };
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

// 应用背景设置的函数
function applyBackgroundSettings(bgSettings) {
  // 检查是否启用背景
  if (bgSettings.enabled !== true) {
    // 如果禁用背景，将URL设为空
    backgroundImageUrl = '';
    isBackgroundVideo = false;
    console.log("背景已禁用");
    document.body.style.backgroundImage = '';

    // 移除视频背景（如果存在）
    const oldVideo = document.getElementById('background-video');
    if (oldVideo) {
      oldVideo.remove();
    }

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
      // 视频文件 - 创建视频背景
      isBackgroundVideo = true;
      backgroundVideoUrl = fileUrl;
      document.body.style.backgroundImage = ''; // 清除背景图片

      // 移除旧的视频元素（如果存在）
      const oldVideo = document.getElementById('background-video');
      if (oldVideo) {
        oldVideo.remove();
      }

      // 创建新的视频元素
      const video = document.createElement('video');
      video.id = 'background-video';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true; // 对iOS设备很重要

      // 设置视频源
      const source = document.createElement('source');
      source.src = fileUrl;
      source.type = fileUrl.startsWith('data:') ? fileUrl.split(',')[0].split(':')[1].split(';')[0] : `video/${fileUrl.split('.').pop()}`;

      video.appendChild(source);

      // 设置视频样式
      video.style.position = 'fixed';
      video.style.top = '0';
      video.style.left = '0';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover'; // 覆盖整个区域
      video.style.objectPosition = 'center top'; // 确保视频顶部与网页顶部对齐
      video.style.zIndex = '-2'; // 确保在遮罩层之下

      // 将视频添加到body
      document.body.prepend(video);

      console.log("Popup页面设置视频背景");
    } else {
      // 图片文件
      isBackgroundVideo = false;
      backgroundImageUrl = fileUrl;
      document.body.style.backgroundImage = `url(${backgroundImageUrl})`;

      // 判断是否为SVG，SVG保持auto，其他图片格式使用360px宽度适配
      const isSvg = fileUrl.includes('image/svg') || fileUrl.endsWith('.svg');
      if (isSvg) {
        document.body.style.backgroundSize = 'auto';
      } else {
        // 图片（jpg, png, gif等）以360px宽度为基准
        document.body.style.backgroundSize = '360px auto';
      }
      document.body.style.backgroundRepeat = 'repeat';
      console.log("设置图片背景URL长度:", backgroundImageUrl.length, "isSvg:", isSvg);
    }
  } else {
    // 使用默认背景，但检查用户是否指定了默认背景类型
    console.log("[DEBUG popup.js] Using default background. bgSettings.defaultType:", bgSettings.defaultType);

    // 先移除旧的视频元素（如果存在）
    const oldVideo = document.getElementById('background-video');
    if (oldVideo) {
      oldVideo.remove();
    }

    if (bgSettings.defaultType === 'video') {
      console.log("[DEBUG popup.js] Default type is VIDEO.");
      // 用户选择了默认视频背景
      isBackgroundVideo = true;
      backgroundVideoUrl = chrome.runtime.getURL("src/service/videos/kawai.mp4");
      backgroundImageUrl = ''; // 清空图片URL

      // 创建新的视频元素
      const video = document.createElement('video');
      video.id = 'background-video';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true; // 对iOS设备很重要

      // 设置视频源
      const source = document.createElement('source');
      source.src = backgroundVideoUrl;
      source.type = 'video/mp4';

      video.appendChild(source);

      // 设置视频样式
      video.style.position = 'fixed';
      video.style.top = '0';
      video.style.left = '0';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover'; // 覆盖整个区域
      video.style.objectPosition = 'center top'; // 确保视频顶部与网页顶部对齐
      video.style.zIndex = '-2'; // 确保在遮罩层之下

      // 将视频添加到body
      document.body.prepend(video);

      console.log("使用默认视频背景: kawai.mp4", "完整URL:", backgroundVideoUrl);
    } else if (bgSettings.defaultType === 'svg') {
      console.log("[DEBUG popup.js] Default type is SVG.");
      // 用户选择了随机SVG图案背景
      const svgUrls = Array.from({ length: 33 }, (_, i) => `src/service/image/tg/pattern-${i + 1}.svg`);
      const randomIndex = Math.floor(Math.random() * svgUrls.length);
      const randomSvgPath = svgUrls[randomIndex];

      backgroundImageUrl = chrome.runtime.getURL(randomSvgPath);
      isBackgroundVideo = false;
      document.body.style.backgroundImage = `url(${backgroundImageUrl})`;
      document.body.style.backgroundSize = 'auto';
      document.body.style.backgroundRepeat = 'repeat';
      console.log("使用随机SVG背景:", randomSvgPath, "完整URL:", backgroundImageUrl);
    } else if (bgSettings.defaultType === 'specific' && bgSettings.specificBgPath) {
      console.log("[DEBUG popup.js] Default type is SPECIFIC.");
      // 用户选择了指定的内置背景
      const specificPath = bgSettings.specificBgPath;

      // 判断是视频还是图片
      if (specificPath.endsWith('.mp4') || specificPath.endsWith('.webm') || specificPath.endsWith('.ogg')) {
        // 视频背景
        isBackgroundVideo = true;
        backgroundVideoUrl = chrome.runtime.getURL(specificPath);
        backgroundImageUrl = '';

        const video = document.createElement('video');
        video.id = 'background-video';
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        const source = document.createElement('source');
        source.src = backgroundVideoUrl;
        source.type = `video/${specificPath.split('.').pop()}`;

        video.appendChild(source);

        video.style.position = 'fixed';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.objectPosition = 'center top';
        video.style.zIndex = '-2';

        document.body.prepend(video);

        console.log("Popup页面设置指定视频背景:", specificPath);
      } else {
        // 图片/SVG背景
        isBackgroundVideo = false;
        backgroundImageUrl = chrome.runtime.getURL(specificPath);
        document.body.style.backgroundImage = `url(${backgroundImageUrl})`;

        // 判断是否为SVG，SVG保持auto，其他图片格式使用360px宽度适配
        const isSvg = specificPath.endsWith('.svg');
        if (isSvg) {
          document.body.style.backgroundSize = 'auto';
        } else {
          // 图片（jpg, png, gif等）以360px宽度为基准
          document.body.style.backgroundSize = '360px auto';
        }
        document.body.style.backgroundRepeat = 'repeat';
        console.log("使用指定图片/SVG背景:", specificPath, "完整URL:", backgroundImageUrl, "isSvg:", isSvg);
      }
    } else if (bgSettings.defaultType === 'image') {
      console.log("[DEBUG popup.js] Default type is IMAGE.");
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
      document.body.style.backgroundImage = `url(${backgroundImageUrl})`;
      // 图片（jpg, png等）以360px宽度为基准
      document.body.style.backgroundSize = '360px auto';
      document.body.style.backgroundRepeat = 'repeat';
      console.log("使用随机默认图片背景:", randomImagePath, "完整URL:", backgroundImageUrl);
    } else {
      // 默认使用随机SVG背景（兼容旧设置）
      console.log("[DEBUG popup.js] No type specified, using default SVG.");
      const svgUrls = Array.from({ length: 33 }, (_, i) => `src/service/image/tg/pattern-${i + 1}.svg`);
      const randomIndex = Math.floor(Math.random() * svgUrls.length);
      const randomSvgPath = svgUrls[randomIndex];

      backgroundImageUrl = chrome.runtime.getURL(randomSvgPath);
      isBackgroundVideo = false;
      document.body.style.backgroundImage = `url(${backgroundImageUrl})`;
      document.body.style.backgroundSize = 'auto';
      document.body.style.backgroundRepeat = 'repeat';
      console.log("使用默认随机SVG背景:", randomSvgPath);
    }
  }
}

// 添加：插件初始化函数
function initializeSettings() {
  // 获取所有设置项
  chrome.storage.local.get(null, function(result) {
    // 设置默认值（如果不存在）
    const defaults = {
      isDarkTheme: true,
      enablePlugin: true,
      enableWaifu: false,
      bionicEnabled: false,
      clipSubtitles: false,
      readingRuler: false,
      rulerSettings: {
        height: 24,
        color: '#6f6f6f',
        opacity: 0.3,
        isInverted: false,
        position: { x: 20, y: '50%' },
        widthMode: 'auto',       // 默认为自动宽度模式
        customWidth: 200         // 默认自定义宽度值
      },


      autoRequestAITranslations: true,
      autoAddAITranslations: false,
      autoAddAITranslationsFromUnknown: true,
      autoRequestAITranslations2: true,
      autoAddExampleSentences: false,
      autoAddSentencesLimit: 1, // 默认自动添加例句上限为1条

      clickOnlyTooltip: true, // 默认仅点击触发小窗
      autoExpandTooltip: false, // 默认不自动展开未高亮单词的小窗
      autoCloseTooltip: false, // 默认不自动关闭小窗
      autoRefreshTooltip: false,
      defaultExpandTooltip: false,
      defaultExpandSententsTooltip: true,
      defaultExpandCapsule: true, // 默认展开胶囊
      preferPopupAbove: false,
      selectionPopupPreferDown: false, // 划词弹窗优先默认向下弹出
      explosionPriorityMode: true, // 默认不启用爆炸优先模式
      tooltipGap: 0, // 单词与提示窗间距默认值
      selectionPopupGap: 10, // 划词弹窗间隙默认值
      devicePixelRatio: window.devicePixelRatio || 1.0, // 设备像素比默认值，使用当前设备的DPR

      // 默认胶囊配置
      customCapsules: [
        {
          buttons: [
            {
              name: 'Google',
              url: 'https://www.google.com/search?q={word}',
              openMethod: 'sidebar',
              icon: ''
            },
            {
              name: 'Google Image',
              url: 'https://www.google.com/search?q={word}&tbm=isch',
              openMethod: 'sidebar',
              icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M15 5.5A9.49 9.49 0 0 0 5.5 15v4.15a4 4 0 0 1 .5 0h4v-4.1A5.08 5.08 0 0 1 15.05 10h4.08V6a4 4 0 0 1 0-.5Zm13.81 0a4 4 0 0 1 0 .5v4H33a5.07 5.07 0 0 1 5 5.05v4.08h4a4 4 0 0 1 .5 0V15A9.49 9.49 0 0 0 33 5.5ZM24 16.3a7.68 7.68 0 1 0 5.45 2.25A7.7 7.7 0 0 0 24 16.3M5.5 28.83V33a9.49 9.49 0 0 0 9.5 9.5h4.15a4 4 0 0 1 0-.5v-4h-4.1A5.07 5.07 0 0 1 10 33v-4.13H6a4 4 0 0 1-.5 0Zm30.94 3.5a4.11 4.11 0 1 0 4.11 4.11a4.11 4.11 0 0 0-4.11-4.11m0 0"/></svg>'
            }
          ]
        }
      ],

      wordQueryKey: 'q',
      copySentenceKey: 'w',
      analysisWindowKey: 'e',
      sidePanelKey: 'r',
      // addAITranslationKey: 'tab',

      // 新增：单词状态快捷键默认值
      wordStatusKeys: {
        0: '`', // 添加状态 0 的默认快捷键
        1: '1',
        2: '2',
        3: '3',
        4: '4',
        5: '5',
        toggle: ' ', // 使用 ' ' 代表空格键
        addAITranslation: 'tab', // 添加AI释义的快捷键
        closeTooltip: 'capslock' // 关闭小窗的快捷键
      },

      enableWordTTS: true,
      enableSentenceTTS: true,
      enableAutoWordTTS: false, // 添加：自动播放鼠标下单词的默认值
      useOrionTTS: false, // 添加：Orion TTS默认关闭

      // 高亮语言类型默认值
      highlightChineseEnabled: false, // 中文默认不高亮
      highlightJapaneseEnabled: true, // 日语默认高亮
      autoDetectJapaneseKanji: true, // 智能识别日语汉字默认开启
      autoLoadKuromojiForJapanese: true, // 智能加载kuromoji默认关闭
      useKuromojiTokenizer: false, // 使用kuromoji分词默认关闭
      highlightKoreanEnabled: true, // 韩语默认高亮
      highlightAlphabeticEnabled: true, // 字母语言默认高亮

      youtubeCaptionFix: false, // 添加：YouTube 字幕插件的默认值
      youtubeCommaSentencing: false, // 添加：YouTube 逗号分句的默认值（默认关闭，使用句号分句）
      youtubeBionicReading: true, // 添加：YouTube 仿生阅读的默认值（默认开启）
      youtubeFontSize: 24, // 添加：YouTube 字幕字体大小的默认值
      youtubeFontFamily: 'Fanwood', // 添加：YouTube 字幕字体样式的默认值
      lingqBlocker: false, // 添加：LingqBlocker 的默认值（默认关闭）

      // 弹窗背景设置默认为开启，默认使用随机SVG背景
      tooltipBackground: { enabled: true, useCustom: false, defaultType: 'svg' },

      // 液体玻璃效果默认关闭
      liquidGlassEnabled: false,
      glassEffectType: 'rough', // 默认为Rough
      // 解析句子玻璃效果默认开启
      analysisGlassEnabled: true,

      // Thanox Reading 设置默认值
      thanoxReadingEnabled: false,
      thanoxProcessingOpacity: 50,  // 处理中的透明值 (0-100)
      thanoxCompletedOpacity: 10,   // 处理完成后的透明值 (0-100)
      thanoxWordSpeed: 1000,        // 单词消失速度 (毫秒)

      // 碎片特效设置默认值
      thanoxFragmentEffect: true,   // 是否启用碎片特效
      thanoxFragmentCount: 8,       // 碎片数量
      thanoxFragmentDuration: 2000, // 碎片动画持续时间 (毫秒)

      // 已知句子展示动效图开关默认值
      showKnownSentenceAnimation: true, // 默认开启

    };

    // 检查每个设置项，如果不存在则设置默认值
    let updatedSettings = {};
    let needUpdate = false;

    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (result[key] === undefined) {
        // 特殊处理嵌套对象，确保它们也被正确初始化
        if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
          updatedSettings[key] = { ...(result[key] || {}), ...defaultValue };
        } else {
          updatedSettings[key] = defaultValue;
        }
        needUpdate = true;
      } else if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
        // 如果已存在但缺少某些键，也进行合并更新
        let subNeedUpdate = false;
        const currentObject = result[key];
        const mergedObject = { ...defaultValue }; // 从默认值开始
        for (const subKey in defaultValue) {
          if (currentObject[subKey] === undefined) {
            mergedObject[subKey] = defaultValue[subKey];
            subNeedUpdate = true;
          } else {
             mergedObject[subKey] = currentObject[subKey]; // 保留用户已有的值
          }
        }
         if(subNeedUpdate){
            updatedSettings[key] = mergedObject;
            needUpdate = true;
         }
      }
    }

    // 只有在需要更新时才保存
    if (needUpdate) {
      chrome.storage.local.set(updatedSettings, function() {
        console.log("已初始化或更新默认设置:", updatedSettings);
        // 刷新UI以显示正确的设置
        location.reload();
      });
    }
  });
}

// 移动端适配函数
function initMobileAdaptation() {
  // 更严格的移动设备检测
  const userAgent = navigator.userAgent;
  const isMobileUserAgent = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
  const isSmallScreen = window.innerWidth <= 500;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // 检测是否为Orion浏览器
  const isOrion = /Orion/i.test(userAgent);
  const isMobileSafari = /Safari/i.test(userAgent) && /Mobile/i.test(userAgent) && !/Chrome/i.test(userAgent);

  // 只有同时满足多个条件才认为是移动设备
  const isMobile = isMobileUserAgent && (isSmallScreen || isTouchDevice);

  console.log('移动端检测:', {
    isMobile,
    isMobileUserAgent,
    isSmallScreen,
    isTouchDevice,
    isOrion,
    isMobileSafari,
    width: window.innerWidth,
    userAgent: userAgent
  });

  // 先清除之前的移动端样式
  document.body.classList.remove('mobile-device', 'orion-browser');
  const body = document.body;
  body.style.removeProperty('min-width');
  body.style.removeProperty('max-width');
  body.style.removeProperty('width');
  body.style.removeProperty('padding');
  body.style.removeProperty('box-sizing');

  if (isMobile) {
    // 添加移动端标识类
    document.body.classList.add('mobile-device');

    if (isOrion || isMobileSafari) {
      document.body.classList.add('orion-browser');
    }

    // 强制设置viewport缩放
    let viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }

    // 动态调整body样式
    body.style.minWidth = '100vw';
    body.style.maxWidth = '100vw';
    body.style.width = '100vw';
    body.style.padding = '8px';
    body.style.boxSizing = 'border-box';

    // 强制缩放为1
    document.documentElement.style.zoom = '1';
    document.documentElement.style.transform = 'scale(1)';
    document.documentElement.style.transformOrigin = '0 0';

    console.log('已应用移动端适配');
  } else {
    console.log('桌面端，不应用移动端适配');
  }
}

// 在页面加载时初始化设置
document.addEventListener('DOMContentLoaded', function() {
  // 首先进行移动端适配
  initMobileAdaptation();

  // 初始化设置
  initializeSettings();

  // 加载背景设置
  loadBackgroundSettings().then(() => {
    console.log("背景设置已加载");
  });
});

// 监听窗口大小变化，重新应用移动端适配
let resizeTimeout;
window.addEventListener('resize', function() {
  // 延迟执行，避免频繁触发
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(function() {
    console.log('窗口大小变化，重新检测移动端适配');
    initMobileAdaptation();
  }, 100);
});

// 监听方向变化（移动设备）
window.addEventListener('orientationchange', function() {
  setTimeout(function() {
    console.log('设备方向变化，重新检测移动端适配');
    initMobileAdaptation();
  }, 200);
});

const enablePlugin = document.getElementById('enablePlugin');

// 默认启用插件（如果没有设置，则默认 true）
chrome.storage.local.get('enablePlugin', function(result) {
  enablePlugin.checked = result.enablePlugin === undefined ? true : result.enablePlugin;
});

// 监听变化
enablePlugin.addEventListener('change', function(e) {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ enablePlugin: isEnabled });

    // 向所有标签页发送开关状态更新消息
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: "toggleHighlight",
                enabled: isEnabled
            });
        });
    });
});

// 新增：高亮语言类型开关
const highlightChinese = document.getElementById('highlightChinese');
const highlightJapanese = document.getElementById('highlightJapanese');
const autoDetectJapaneseKanji = document.getElementById('autoDetectJapaneseKanji');
const autoLoadKuromojiForJapanese = document.getElementById('autoLoadKuromojiForJapanese');
const useKuromojiTokenizer = document.getElementById('useKuromojiTokenizer');
const highlightKorean = document.getElementById('highlightKorean');
const highlightAlphabetic = document.getElementById('highlightAlphabetic');

// 加载状态 (中文默认不高亮，其他语言默认高亮)
chrome.storage.local.get([
    'highlightChineseEnabled',
    'highlightJapaneseEnabled',
    'autoDetectJapaneseKanji',
    'autoLoadKuromojiForJapanese',
    'useKuromojiTokenizer',
    'highlightKoreanEnabled',
    'highlightAlphabeticEnabled'
], function(result) {
    highlightChinese.checked = result.highlightChineseEnabled === undefined ? false : result.highlightChineseEnabled;
    highlightJapanese.checked = result.highlightJapaneseEnabled === undefined ? true : result.highlightJapaneseEnabled;
    autoDetectJapaneseKanji.checked = result.autoDetectJapaneseKanji === undefined ? true : result.autoDetectJapaneseKanji;
    autoLoadKuromojiForJapanese.checked = result.autoLoadKuromojiForJapanese === undefined ? true : result.autoLoadKuromojiForJapanese;
    useKuromojiTokenizer.checked = result.useKuromojiTokenizer === undefined ? false : result.useKuromojiTokenizer;
    highlightKorean.checked = result.highlightKoreanEnabled === undefined ? true : result.highlightKoreanEnabled;
    highlightAlphabetic.checked = result.highlightAlphabeticEnabled === undefined ? true : result.highlightAlphabeticEnabled;
});

// 监听变化并保存
highlightChinese.addEventListener('change', function(e) {
    chrome.storage.local.set({ highlightChineseEnabled: e.target.checked });
    // 可选：通知 content script 更新高亮行为
});

highlightJapanese.addEventListener('change', function(e) {
    chrome.storage.local.set({ highlightJapaneseEnabled: e.target.checked });
    // 可选：通知 content script 更新高亮行为
});

autoDetectJapaneseKanji.addEventListener('change', function(e) {
    chrome.storage.local.set({ autoDetectJapaneseKanji: e.target.checked });
    // 通知 content script 重新检测页面语言
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'redetectPageLanguage'
            });
        }
    });
});

autoLoadKuromojiForJapanese.addEventListener('change', function(e) {
    if (e.target.checked) {
        // 如果启用智能加载，则禁用全局加载
        useKuromojiTokenizer.checked = false;
        chrome.storage.local.set({
            autoLoadKuromojiForJapanese: true,
            useKuromojiTokenizer: false
        });
    } else {
        chrome.storage.local.set({ autoLoadKuromojiForJapanese: false });
    }

    // 通知 content script 重新初始化日语分词器
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'reinitializeJapaneseTokenizer',
                useKuromoji: e.target.checked ? 'auto' : false,
                autoLoad: e.target.checked
            });
        }
    });
});

useKuromojiTokenizer.addEventListener('change', function(e) {
    if (e.target.checked) {
        // 如果启用全局加载，则禁用智能加载
        autoLoadKuromojiForJapanese.checked = false;
        chrome.storage.local.set({
            useKuromojiTokenizer: true,
            autoLoadKuromojiForJapanese: false
        });
    } else {
        chrome.storage.local.set({ useKuromojiTokenizer: false });
    }

    // 通知 content script 重新初始化日语分词器
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'reinitializeJapaneseTokenizer',
                useKuromoji: e.target.checked,
                autoLoad: false
            });
        }
    });
});

highlightKorean.addEventListener('change', function(e) {
    chrome.storage.local.set({ highlightKoreanEnabled: e.target.checked });
    // 可选：通知 content script 更新高亮行为
});

highlightAlphabetic.addEventListener('change', function(e) {
    chrome.storage.local.set({ highlightAlphabeticEnabled: e.target.checked });
    // 可选：通知 content script 更新高亮行为
});

























////////////////////////插件开关//////////////////////////////

// 新增：Bionic Reading 开关
const bionicEnabled = document.getElementById('bionicEnabled');

    // 在哪里声明的？
    chrome.storage.local.get('bionicEnabled', function(result) {
        bionicEnabled.checked = result.bionicEnabled  || false;
    });

    // 监听变化
    bionicEnabled.addEventListener('change', function(e) {
        const isEnabled = e.target.checked;
        chrome.storage.local.set({ bionicEnabled: isEnabled });

        // 向所有标签页发送切换消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "toggleBionic",
                    isEnabled: isEnabled
                });
            });
        });
    });

// 剪切板监听字幕 clipSubtitles
const clipSubtitles = document.getElementById('clipSubtitles');

// 加载状态
chrome.storage.local.get('clipSubtitles', function(result) {
    clipSubtitles.checked = result.clipSubtitles || false;
});

// 监听变化
clipSubtitles.addEventListener('change', function(e) {
    console.log("pop clipSubtitles 变化:", e.target.checked);
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ clipSubtitles: isEnabled });

    // 向所有标签页发送切换消息
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: "toggleClipSubtitles",
                isEnabled: isEnabled
            }).catch(error => {
                // 忽略此错误，这是正常情况
                // 某些标签页可能没有加载内容脚本
            });
        });
    });
});

// /////////////////////////////.readingRuler
const readingRuler = document.getElementById('readingRuler');

// 加载状态
chrome.storage.local.get('readingRuler', function(result) {
    readingRuler.checked = result.readingRuler || false;
});

// 监听变化
readingRuler.addEventListener('change', function(e) {
    const isEnabled = e.target.checked;
    // 保存设置
    chrome.storage.local.set({ readingRuler: isEnabled });

    // 向当前标签页发送消息以实时切换 Reading Ruler
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "toggleReadingRuler",
                isEnabled: isEnabled
            });
        }
    });
});

//////////////////youtube captionsfix////////////////////////////

const youtubeCaptionFix = document.getElementById('youtubeCaptionFix');

// 加载状态 (默认关闭)
chrome.storage.local.get('youtubeCaptionFix', function(result) {
    youtubeCaptionFix.checked = result.youtubeCaptionFix || false;
});

// 监听变化并保存
youtubeCaptionFix.addEventListener('change', function(e) {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ youtubeCaptionFix: isEnabled });

    // 可选：通知 content script 更新行为 (如果需要实时生效)
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            // 确保只向可能包含 YouTube 页面的标签页发送消息，或者让 content script 自行判断
            if (tab.url && tab.url.includes("youtube.com")) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "toggleYoutubeCaptionFix", // 定义一个新的 action
                    enabled: isEnabled
                }).catch(error => {
                    // 忽略错误，可能 content script 未注入
                });
            }
        });
    });
});

// YouTube 逗号分句设置
const youtubeCommaSentencing = document.getElementById('youtubeCommaSentencing');

// 加载状态 (默认关闭，使用句号分句)
chrome.storage.local.get('youtubeCommaSentencing', function(result) {
    youtubeCommaSentencing.checked = result.youtubeCommaSentencing || false;
});

// 监听变化并保存
youtubeCommaSentencing.addEventListener('change', function(e) {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ youtubeCommaSentencing: isEnabled });

    // 通知 YouTube 页面更新分句设置
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes("youtube.com")) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateYoutubeCommaSentencing",
                    enabled: isEnabled
                }).catch(error => {
                    // 忽略错误，可能 content script 未注入
                });
            }
        });
    });
});

// YouTube 仿生阅读设置
const youtubeBionicReading = document.getElementById('youtubeBionicReading');

// 加载状态 (默认开启)
chrome.storage.local.get('youtubeBionicReading', function(result) {
    youtubeBionicReading.checked = result.youtubeBionicReading !== undefined ? result.youtubeBionicReading : true;
});

// 监听变化并保存
youtubeBionicReading.addEventListener('change', function(e) {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ youtubeBionicReading: isEnabled });

    // 通知 content script 更新行为
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes("youtube.com")) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateYoutubeBionicReading",
                    enabled: isEnabled
                }).catch(error => {
                    // 忽略错误，可能 content script 未注入
                });
            }
        });
    });
});

// YouTube 字体大小设置
const youtubeFontSize = document.getElementById('youtubeFontSize');
const youtubeFontSizeValue = document.getElementById('youtubeFontSizeValue');

// 加载字体大小设置
chrome.storage.local.get('youtubeFontSize', function(result) {
    const fontSize = result.youtubeFontSize !== undefined ? result.youtubeFontSize : 24;
    youtubeFontSize.value = fontSize;
    youtubeFontSizeValue.textContent = fontSize + 'px';
});

// 监听字体大小变化
youtubeFontSize.addEventListener('input', function(e) {
    const fontSize = parseInt(e.target.value);
    youtubeFontSizeValue.textContent = fontSize + 'px';
    chrome.storage.local.set({ youtubeFontSize: fontSize });

    // 通知 content script 更新字体大小
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes("youtube.com")) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateYoutubeFontSize",
                    fontSize: fontSize
                }).catch(error => {
                    // 忽略错误，可能 content script 未注入
                });
            }
        });
    });
});

// YouTube 字体样式设置
const youtubeFontFamily = document.getElementById('youtubeFontFamily');

// 加载字体样式设置
chrome.storage.local.get('youtubeFontFamily', function(result) {
    const fontFamily = result.youtubeFontFamily !== undefined ? result.youtubeFontFamily : 'Fanwood';
    youtubeFontFamily.value = fontFamily;
});

// 监听字体样式变化
youtubeFontFamily.addEventListener('change', function(e) {
    const fontFamily = e.target.value;
    chrome.storage.local.set({ youtubeFontFamily: fontFamily });

    // 通知 content script 更新字体样式
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            if (tab.url && tab.url.includes("youtube.com")) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateYoutubeFontFamily",
                    fontFamily: fontFamily
                }).catch(error => {
                    // 忽略错误，可能 content script 未注入
                });
            }
        });
    });
});


// LingqBlocker 设置
const lingqBlocker = document.getElementById('lingqBlocker');

// 加载状态 (默认关闭)
chrome.storage.local.get('lingqBlocker', function(result) {
    lingqBlocker.checked = result.lingqBlocker || false;
});

// 监听变化并保存
lingqBlocker.addEventListener('change', function(e) {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ lingqBlocker: isEnabled });

    // 通知所有标签页更新 LingqBlocker 状态
    chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: "toggleLingqBlocker",
                enabled: isEnabled
            }).catch(error => {
                // 忽略错误，可能 content script 未注入
            });
        });
    });
});

// YouTube 设置展开/收起
document.addEventListener('DOMContentLoaded', function() {
    const youtubeSettingsToggle = document.getElementById('youtubeSettingsToggle');
    const youtubeSettings = document.getElementById('youtubeSettings');

    if (youtubeSettingsToggle && youtubeSettings) {
        youtubeSettingsToggle.addEventListener('click', function() {
            youtubeSettings.classList.toggle('visible');
        });
    }
});

// 自动添加例句设置展开/收起
document.addEventListener('DOMContentLoaded', function() {
    const sentencesSettingsToggle = document.getElementById('sentencesSettingsToggle');
    const sentencesSettings = document.getElementById('sentencesSettings');

    if (sentencesSettingsToggle && sentencesSettings) {
        sentencesSettingsToggle.addEventListener('click', function() {
            sentencesSettings.classList.toggle('visible');
        });
    }
});

/////////////////////////////AI请求开关和数据库操作///////////////////////////////


// 自动请求AI释义
const autoRequestAITranslations = document.getElementById('autoRequestAITranslations');

// 加载状态
chrome.storage.local.get('autoRequestAITranslations', function(result) {
    const isAutoRequestEnabled = result.autoRequestAITranslations === undefined ? true : result.autoRequestAITranslations;
    autoRequestAITranslations.checked = isAutoRequestEnabled;

    // 根据自动请求AI释义的状态来设置自动添加AI释义的可用性
    autoAddAITranslations.disabled = !isAutoRequestEnabled;
});

// 监听变化
autoRequestAITranslations.addEventListener('change', function(e) {
    const isChecked = e.target.checked;
    chrome.storage.local.set({ autoRequestAITranslations: isChecked });

    // 当自动请求AI释义关闭时，禁用自动添加AI释义选项
    autoAddAITranslations.disabled = !isChecked;
});





// 新增自动添加AI释义
const autoAddAITranslations = document.getElementById('autoAddAITranslations');

// 加载状态
chrome.storage.local.get('autoAddAITranslations', function(result) {
    // autoAddAITranslations.checked = result.autoAddAITranslations === undefined ? true : result.autoAddAITranslations;
    autoAddAITranslations.checked = result.autoAddAITranslations || false;
    // 确保初始状态也正确设置禁用属性
    chrome.storage.local.get('autoRequestAITranslations', function(requestResult) {
        const isAutoRequestEnabled = requestResult.autoRequestAITranslations === undefined ? true : requestResult.autoRequestAITranslations;
        autoAddAITranslations.disabled = !isAutoRequestEnabled;
    });
});

// 监听变化
autoAddAITranslations.addEventListener('change', function(e) {
    chrome.storage.local.set({ autoAddAITranslations: e.target.checked });
});


  // 自动请求AI释义和自动添加AI释义的依赖关系
  document.addEventListener("DOMContentLoaded", function() {
      const autoRequestAITranslations = document.getElementById("autoRequestAITranslations");
      const autoAddAITranslations = document.getElementById("autoAddAITranslations");

      function updateDependentCheckbox() {
          if (!autoRequestAITranslations.checked) {
              autoAddAITranslations.disabled = true;
              autoAddAITranslations.style.opacity = "0.5";
              autoAddAITranslations.style.cursor = "not-allowed";
          } else {
              autoAddAITranslations.disabled = false;
              autoAddAITranslations.style.opacity = "1";
              autoAddAITranslations.style.cursor = "pointer";
          }
      }

      // 先加载 autoRequest 状态
      chrome.storage.local.get('autoRequestAITranslations', function(result) {
          const isAutoRequestEnabled = result.autoRequestAITranslations === undefined ? true : result.autoRequestAITranslations;
          autoRequestAITranslations.checked = isAutoRequestEnabled;
          // 同时更新依赖复选框样式
          updateDependentCheckbox();
      });

      // 监听"自动请求AI释义"的状态变化
      autoRequestAITranslations.addEventListener("change", function(e) {
          chrome.storage.local.set({ autoRequestAITranslations: e.target.checked });
          updateDependentCheckbox();
      });
  });


// 未知单词自动添加AI释义
const autoAddAITranslationsFromUnknown = document.getElementById('autoAddAITranslationsFromUnknown');
    // 加载状态
    chrome.storage.local.get(['autoAddAITranslationsFromUnknown', 'autoAddAITranslations', 'autoRequestAITranslations'], function(result) {
        // 设置复选框状态
        autoAddAITranslationsFromUnknown.checked = result.autoAddAITranslationsFromUnknown === undefined ? true : result.autoAddAITranslationsFromUnknown;

        // 检查双重条件
        const isAutoAddEnabled = result.autoAddAITranslations === undefined ? true : result.autoAddAITranslations;
        const isAutoRequestEnabled = result.autoRequestAITranslations === undefined ? true : result.autoRequestAITranslations;

        // 只有当 autoAddAITranslations 为 false 且 autoRequestAITranslations 为 true 时才能启用
        const shouldEnable = !isAutoAddEnabled && isAutoRequestEnabled;

        autoAddAITranslationsFromUnknown.disabled = !shouldEnable;
        autoAddAITranslationsFromUnknown.style.opacity = shouldEnable ? "1" : "0.5";
        autoAddAITranslationsFromUnknown.style.cursor = shouldEnable ? "pointer" : "not-allowed";
    });

    // 监听设置变化
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (changes.autoAddAITranslations || changes.autoRequestAITranslations) {
            chrome.storage.local.get(['autoAddAITranslations', 'autoRequestAITranslations'], function(result) {
                const isAutoAddEnabled = result.autoAddAITranslations === undefined ? true : result.autoAddAITranslations;
                const isAutoRequestEnabled = result.autoRequestAITranslations === undefined ? true : result.autoRequestAITranslations;

                // 只有当 autoAddAITranslations 为 false 且 autoRequestAITranslations 为 true 时才能启用
                const shouldEnable = !isAutoAddEnabled && isAutoRequestEnabled;

                autoAddAITranslationsFromUnknown.disabled = !shouldEnable;
                autoAddAITranslationsFromUnknown.style.opacity = shouldEnable ? "1" : "0.5";
                autoAddAITranslationsFromUnknown.style.cursor = shouldEnable ? "pointer" : "not-allowed";
            });
        }
    });

    // 监听变化
    autoAddAITranslationsFromUnknown.addEventListener('change', function(e) {
        chrome.storage.local.set({ autoAddAITranslationsFromUnknown: e.target.checked });
    });


// 第二个AI翻译开关
const autoRequestAITranslations2 = document.getElementById('autoRequestAITranslations2');

// 加载状态
chrome.storage.local.get('autoRequestAITranslations2', function(result) {
    const isAutoRequest2Enabled = result.autoRequestAITranslations2 === undefined ? true : result.autoRequestAITranslations2;
    autoRequestAITranslations2.checked = isAutoRequest2Enabled;
});

// 监听变化
autoRequestAITranslations2.addEventListener('change', function(e) {
    const isChecked = e.target.checked;
    chrome.storage.local.set({ autoRequestAITranslations2: isChecked });
});


// 新增自动添加例句
const autoAddExampleSentences = document.getElementById('autoAddExampleSentences');

// 加载状态
chrome.storage.local.get('autoAddExampleSentences', function(result) {
    autoAddExampleSentences.checked = result.autoAddExampleSentences || false;
});

// 监听变化
autoAddExampleSentences.addEventListener('change', function(e) {
    chrome.storage.local.set({ autoAddExampleSentences: e.target.checked });
});

// 新增：自动添加例句上限条数设置
const autoAddSentencesLimitSlider = document.getElementById('autoAddSentencesLimit');
const autoAddSentencesLimitInput = document.getElementById('autoAddSentencesLimitInput');

// 加载状态
chrome.storage.local.get('autoAddSentencesLimit', function(result) {
    const limit = result.autoAddSentencesLimit === undefined ? 1 : result.autoAddSentencesLimit;
    autoAddSentencesLimitSlider.value = limit <= 20 ? limit : 20;
    autoAddSentencesLimitInput.value = limit;
});

// 滑块变化时同步输入框
autoAddSentencesLimitSlider.addEventListener('input', function(e) {
    const value = parseInt(e.target.value);
    autoAddSentencesLimitInput.value = value;
    chrome.storage.local.set({ autoAddSentencesLimit: value });
});

// 输入框变化时同步滑块
autoAddSentencesLimitInput.addEventListener('input', function(e) {
    let value = parseInt(e.target.value);
    // 确保值在合法范围内
    if (isNaN(value)) value = 1;
    if (value < 1) value = 1;
    if (value > 999) value = 999;

    // 同步更新滑块值(滑块最大值为20)
    autoAddSentencesLimitSlider.value = value <= 20 ? value : 20;
    e.target.value = value;

    chrome.storage.local.set({ autoAddSentencesLimit: value });
});

//////////////////////////窗口设置///////////////////////////////

// 新增：仅点击触发小窗
const clickOnlyTooltip = document.getElementById('clickOnlyTooltip');

// 加载状态
chrome.storage.local.get('clickOnlyTooltip', function(result) {
  console.log("加载时获取到的仅点击触发小窗值:", result.clickOnlyTooltip);
  clickOnlyTooltip.checked = result.clickOnlyTooltip !== undefined ? result.clickOnlyTooltip : false;
});

// 监听变化
clickOnlyTooltip.addEventListener('change', function(e) {
  const checkedValue = e.target.checked;
  chrome.storage.local.set({ clickOnlyTooltip: checkedValue }, function() {
    console.log("保存的仅点击触发小窗值:", checkedValue);
  });
});

// 新增：自动展开未高亮单词的小窗
const checkbox = document.getElementById('autoExpandTooltip');

// 加载状态
chrome.storage.local.get('autoExpandTooltip', function(result) {
  console.log("加载时获取到的值:", result.autoExpandTooltip);
  checkbox.checked = result.autoExpandTooltip !== undefined ? result.autoExpandTooltip : true;
});

// 监听变化
checkbox.addEventListener('change', function(e) {
  const checkedValue = e.target.checked;
  chrome.storage.local.set({ autoExpandTooltip: checkedValue }, function() {
    console.log("保存的值:", checkedValue);
  });
});

// 鼠标离开小窗自动关闭
const autoCloseTooltip = document.getElementById('autoCloseTooltip');
const autoRefreshTooltip = document.getElementById('autoRefreshTooltip');

// 加载状态
chrome.storage.local.get('autoCloseTooltip', function(result) {
    autoCloseTooltip.checked = result.autoCloseTooltip || false;

    if(result.autoCloseTooltip === undefined){
        chrome.storage.local.set({ autoCloseTooltip: false });
    }

    // 根据autoCloseTooltip的状态设置autoRefreshTooltip的可用性
    updateAutoRefreshTooltipState(!result.autoCloseTooltip);
});

// 加载autoRefreshTooltip状态
chrome.storage.local.get('autoRefreshTooltip', function(result) {
    autoRefreshTooltip.checked = result.autoRefreshTooltip  || false;
});

// 监听autoCloseTooltip变化
autoCloseTooltip.addEventListener('change', function(e) {
    const isChecked = e.target.checked;
    chrome.storage.local.set({ autoCloseTooltip: isChecked });

    // 当autoCloseTooltip为true时，禁用autoRefreshTooltip
    updateAutoRefreshTooltipState(!isChecked);
});

// 监听autoRefreshTooltip变化
autoRefreshTooltip.addEventListener('change', function(e) {
    chrome.storage.local.set({ autoRefreshTooltip: e.target.checked });
});

// 更新autoRefreshTooltip状态的函数
function updateAutoRefreshTooltipState(enabled) {
    autoRefreshTooltip.disabled = !enabled;
    autoRefreshTooltip.style.opacity = enabled ? "1" : "0.5";
    autoRefreshTooltip.style.cursor = enabled ? "pointer" : "not-allowed";
}


//弹窗默认展开
const defaultExpandTooltip = document.getElementById('defaultExpandTooltip');

// 加载状态
chrome.storage.local.get('defaultExpandTooltip', function(result) {
    defaultExpandTooltip.checked = result.defaultExpandTooltip || false;
});

// 监听变化
defaultExpandTooltip.addEventListener('change', function(e) {
    chrome.storage.local.set({ defaultExpandTooltip: e.target.checked });
});

//句子默认展开
const defaultExpandSententsTooltip = document.getElementById('defaultExpandSententsTooltip');

// 加载状态
chrome.storage.local.get('defaultExpandSententsTooltip', function(result) {
    defaultExpandSententsTooltip.checked = result.defaultExpandSententsTooltip === undefined ? true : result.defaultExpandSententsTooltip;
});

// 监听变化
defaultExpandSententsTooltip.addEventListener('change', function(e) {
    chrome.storage.local.set({ defaultExpandSententsTooltip: e.target.checked });
});

//胶囊默认展开
const defaultExpandCapsule = document.getElementById('defaultExpandCapsule');

// 加载状态
chrome.storage.local.get('defaultExpandCapsule', function(result) {
    defaultExpandCapsule.checked = result.defaultExpandCapsule || false;
});

// 监听变化
defaultExpandCapsule.addEventListener('change', function(e) {
    chrome.storage.local.set({ defaultExpandCapsule: e.target.checked });
});

//优先向上弹出
const preferPopupAbove = document.getElementById('preferPopupAbove');

// 加载状态
chrome.storage.local.get('preferPopupAbove', function(result) {
    preferPopupAbove.checked = result.preferPopupAbove || false;
});

// 监听变化
preferPopupAbove.addEventListener('change', function(e) {
    chrome.storage.local.set({ preferPopupAbove: e.target.checked });
});

// 划词弹窗优先默认向下弹出
const selectionPopupPreferDown = document.getElementById('selectionPopupPreferDown');

// 加载状态
chrome.storage.local.get('selectionPopupPreferDown', function(result) {
    selectionPopupPreferDown.checked = result.selectionPopupPreferDown || false;
});

// 监听变化
selectionPopupPreferDown.addEventListener('change', function(e) {
    chrome.storage.local.set({ selectionPopupPreferDown: e.target.checked });
});

//爆炸优先模式
const explosionPriorityMode = document.getElementById('explosionPriorityMode');

// 加载状态
chrome.storage.local.get('explosionPriorityMode', function(result) {
    explosionPriorityMode.checked = result.explosionPriorityMode || true;
});

// 监听变化
explosionPriorityMode.addEventListener('change', function(e) {
    chrome.storage.local.set({ explosionPriorityMode: e.target.checked });
});

// 单词与提示窗间距
const tooltipGap = document.getElementById('tooltipGap');
const tooltipGapValue = document.getElementById('tooltipGapValue');

// 加载状态
chrome.storage.local.get('tooltipGap', function(result) {
    // 修复：使用 result.tooltipGap !== undefined 来检查值是否存在，而不是使用 || 运算符
    // 这样可以正确处理 tooltipGap 为 0 的情况
    const gapValue = result.tooltipGap !== undefined ? result.tooltipGap : 0;
    tooltipGap.value = gapValue;
    tooltipGapValue.textContent = gapValue;
});

// 监听变化
tooltipGap.addEventListener('input', function(e) {
    const value = parseInt(e.target.value);
    tooltipGapValue.textContent = value;
    chrome.storage.local.set({ tooltipGap: value });
});

// 划词弹窗间隙
const selectionPopupGap = document.getElementById('selectionPopupGap');
const selectionPopupGapValue = document.getElementById('selectionPopupGapValue');

// 加载状态
chrome.storage.local.get('selectionPopupGap', function(result) {
    const gapValue = result.selectionPopupGap !== undefined ? result.selectionPopupGap : 10;
    selectionPopupGap.value = gapValue;
    selectionPopupGapValue.textContent = gapValue;
});

// 监听变化
selectionPopupGap.addEventListener('input', function(e) {
    const value = parseInt(e.target.value);
    selectionPopupGapValue.textContent = value;
    chrome.storage.local.set({ selectionPopupGap: value });
});

// 设备像素比 (DPR) 设置
const devicePixelRatio = document.getElementById('devicePixelRatio');
const devicePixelRatioValue = document.getElementById('devicePixelRatioValue');

// 加载状态
chrome.storage.local.get('devicePixelRatio', function(result) {
    // 如果没有保存的值，使用当前设备的DPR作为默认值
    const dprValue = result.devicePixelRatio !== undefined ? result.devicePixelRatio : (window.devicePixelRatio || 1.0);
    devicePixelRatio.value = dprValue;
    devicePixelRatioValue.textContent = dprValue.toFixed(1);
});

// 监听变化
devicePixelRatio.addEventListener('input', function(e) {
    const value = parseFloat(e.target.value);
    devicePixelRatioValue.textContent = value.toFixed(1);
    chrome.storage.local.set({ devicePixelRatio: value });
});



// Reading Ruler 设置相关代码

    document.addEventListener('DOMContentLoaded', function() {
      // 获取所有相关元素
      const rulerHeight = document.getElementById('rulerHeight');
      const rulerHeightValue = document.getElementById('rulerHeightValue');
      const rulerOpacity = document.getElementById('rulerOpacity');
      const rulerOpacityValue = document.getElementById('rulerOpacityValue');
      const rulerColor = document.getElementById('rulerColor');
      const rulerInvertedMode = document.getElementById('rulerInvertedMode');

      // 从存储中加载设置
      chrome.storage.local.get('rulerSettings', function(data) {
        const settings = data.rulerSettings || {
          height: 24,
          color: '#6f6f6f',
          opacity: 0.3,
          isInverted: false
        };

        // 设置初始值
        rulerHeight.value = settings.height;
        rulerHeightValue.textContent = settings.height;
        rulerOpacity.value = Math.round(settings.opacity * 100);
        rulerOpacityValue.textContent = Math.round(settings.opacity * 100);
        rulerColor.value = settings.color;
        rulerInvertedMode.checked = settings.isInverted;

        // 使用 input 事件而不是 change 事件，以实现实时更新
        rulerHeight.addEventListener('input', function() {
          const value = parseInt(this.value);
          rulerHeightValue.textContent = value;
          updateRulerSettings('height', value);
        });

        rulerOpacity.addEventListener('input', function() {
          const value = parseInt(this.value);
          rulerOpacityValue.textContent = value;
          updateRulerSettings('opacity', value / 100);
        });

        rulerColor.addEventListener('input', function() {
          updateRulerSettings('color', this.value);
        });

        rulerInvertedMode.addEventListener('change', function() {
          updateRulerSettings('isInverted', this.checked);
        });
      });
    });

    // 更新 Reading Ruler 设置的辅助函数
    function updateRulerSettings(key, value) {
      chrome.storage.local.get('rulerSettings', function(data) {
        const settings = data.rulerSettings || {};
        settings[key] = value;

        // 立即发送消息到内容脚本
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "updateRulerSettings",
              settings: settings
            });
          }
        });

        // 异步保存到存储
        chrome.storage.local.set({ rulerSettings: settings });
      });
    }
    // 点击按钮展开/收起 Reading Ruler 设置区域
    document.addEventListener('DOMContentLoaded', function() {
      // 获取设置按钮和设置区域
      const rulerSettingsToggle = document.getElementById('rulerSettingsToggle');
      const rulerSettings = document.getElementById('rulerSettings');

      // 添加点击事件监听器
      rulerSettingsToggle.addEventListener('click', function() {
        // 切换设置区域的可见性
        rulerSettings.classList.toggle('visible');
      });

      // 其他现有代码...
    });

    // 首字母大写的辅助函数
    function capitalizeFirstLetter(string) {
      return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // 添加宽度模式选择事件监听
    document.querySelectorAll('input[name="widthMode"]').forEach(radio => {
      radio.addEventListener('change', function() {
        const widthMode = this.value;
        // 更新设置
        chrome.storage.local.get('rulerSettings', function(data) {
          const settings = data.rulerSettings || {};
          settings.widthMode = widthMode;
          chrome.storage.local.set({ rulerSettings: settings });

          // 添加：向当前标签页发送消息以实时更新
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "updateRulerSettings",
              settings: settings
            });
          });
        });

        // 显示/隐藏自定义宽度设置
        document.getElementById('customWidthSetting').classList.toggle('visible', widthMode === 'custom');
      });
    });

    // 添加自定义宽度滑块事件监听
    document.getElementById('rulerCustomWidth').addEventListener('input', function() {
      const value = this.value;
      document.getElementById('rulerCustomWidthInput').value = value;

      // 更新设置
      chrome.storage.local.get('rulerSettings', function(data) {
        const settings = data.rulerSettings || {};
        settings.customWidth = parseInt(value);
        chrome.storage.local.set({ rulerSettings: settings });

        // 向当前标签页发送消息以实时更新
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "updateRulerSettings",
            settings: settings
          });
        });
      });
    });

    // 添加自定义宽度输入框事件监听
    document.getElementById('rulerCustomWidthInput').addEventListener('input', function() {
      const value = this.value;
      // 确保值在合法范围内
      let validValue = parseInt(value);
      if (isNaN(validValue)) validValue = 200;
      if (validValue < 50) validValue = 50;
      if (validValue > 2400) validValue = 2400;

      // 同步更新滑块值
      document.getElementById('rulerCustomWidth').value = validValue;

      // 更新设置
      chrome.storage.local.get('rulerSettings', function(data) {
        const settings = data.rulerSettings || {};
        settings.customWidth = validValue;
        chrome.storage.local.set({ rulerSettings: settings });

        // 向当前标签页发送消息以实时更新
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "updateRulerSettings",
            settings: settings
          });
        });
      });
    });

    // 添加：页面加载时初始化设置
    document.addEventListener('DOMContentLoaded', function() {
      // 初始化各种设置...

      // 初始化宽度模式和自定义宽度设置项
      chrome.storage.local.get('rulerSettings', function(data) {
        const settings = data.rulerSettings || {};

        // 设置宽度模式单选按钮
        if (settings.widthMode) {
          document.getElementById('widthMode' + settings.widthMode.charAt(0).toUpperCase() + settings.widthMode.slice(1)).checked = true;

          // 如果是自定义宽度模式，显示自定义宽度设置项
          if (settings.widthMode === 'custom') {
            document.getElementById('customWidthSetting').classList.add('visible');
          }
        }

        // 设置自定义宽度值
        if (settings.customWidth) {
          const customWidth = settings.customWidth;
          document.getElementById('rulerCustomWidth').value = customWidth;
          document.getElementById('rulerCustomWidthInput').value = customWidth;
        }
      });
    });










// 主题切换按钮
const lightThemeBtn = document.getElementById('lightTheme');
const darkThemeBtn = document.getElementById('darkTheme');

// 添加主题切换相关的代码
document.addEventListener('DOMContentLoaded', function() {
  // 获取根元素以便修改CSS变量
  const root = document.documentElement;

  // 定义亮色和暗色主题的颜色
  const themes = {
    light: {
      '--ios-bg': '#f2f2f7',
      '--ios-card': '#ffffffbf',
      '--ios-border': '#e5e5ea',
      '--ios-text': '#000000',
      '--ios-secondary': '#8e8e93',
      '--ios-blue': '#007aff'
    },
    dark: {
      '--ios-bg': 'rgb(43,43,43)',
      '--ios-card': '#1c1c1ea8',
      '--ios-border': '#38383a',
      '--ios-text': '#ffffff',
      '--ios-secondary': '#98989d',
      '--ios-blue': '#0a84ff'
    }
  };

  // 应用主题函数 - 改进的渐变版本
  function applyTheme(isDark, withAnimation = true) {
    const theme = isDark ? themes.dark : themes.light;

    if (withAnimation) {
      // 添加过渡类以确保动画生效
      document.body.classList.add('theme-transitioning');

      // 短暂延迟以确保过渡类生效
      requestAnimationFrame(() => {
        // 应用新的主题颜色
        Object.entries(theme).forEach(([key, value]) => {
          root.style.setProperty(key, value);
        });
      });

      // 300ms后移除过渡类（与CSS过渡时间一致）
      setTimeout(() => {
        document.body.classList.remove('theme-transitioning');
      }, 300);
    } else {
      // 直接应用主题，不使用动画（用于初始加载）
      Object.entries(theme).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
    }
  }

  // 从存储中获取当前主题状态并应用
  chrome.storage.local.get('isDarkTheme', function(result) {
    const isDark = result.isDarkTheme || false;
    applyTheme(isDark, false); // 初始加载时不使用动画
    updateThemeButtons(isDark);
  });

  // 主题按钮点击事件
  lightThemeBtn.addEventListener('click', function() {
    chrome.storage.local.set({ isDarkTheme: false }, function() {
      applyTheme(false, true); // 用户点击时使用动画
      updateThemeButtons(false);
    });
  });

  darkThemeBtn.addEventListener('click', function() {
    chrome.storage.local.set({ isDarkTheme: true }, function() {
      applyTheme(true, true); // 用户点击时使用动画
      updateThemeButtons(true);
    });
  });
});

// 更新按钮状态
function updateThemeButtons(isDark) {
    if (isDark) {
        darkThemeBtn.classList.add('active');
        lightThemeBtn.classList.remove('active');
    } else {
        lightThemeBtn.classList.add('active');
        darkThemeBtn.classList.remove('active');
    }
}
document.addEventListener('DOMContentLoaded', function() {
    // 获取 Bionic 设置相关的元素
    const bionicSettingsToggle = document.getElementById('bionicSettingsToggle');
    const bionicSettings = document.getElementById('bionicSettings');
    const blacklistInput = document.getElementById('bionicBlacklistWebsites');
    const dayInput = document.getElementById('bionicDefaultDayWebsites');
    const nightInput = document.getElementById('bionicDefaultNightWebsites');
    const fontSelect = document.getElementById('bionicFontFamily');
    const fontSizeSlider = document.getElementById('bionicFontSize');
    const fontSizeInput = document.getElementById('bionicFontSizeInput');

    // 点击按钮展开/收起 Bionic 设置区域
    bionicSettingsToggle.addEventListener('click', function() {
        bionicSettings.classList.toggle('visible');
    });

    // 从存储中加载已保存的设置；如果没有则使用默认值
    chrome.storage.local.get({
        bionicBlacklistWebsites: '',
        bionicDefaultDayWebsites: '',
        bionicDefaultNightWebsites: '*://github.com/*;*://*.github.com/*;https://en.wikipedia.org/wiki/English_language',
        bionicFontFamily: 'auto',
        bionicFontSize: 16
    }, function(result) {
        blacklistInput.value = result.bionicBlacklistWebsites;
        dayInput.value = result.bionicDefaultDayWebsites;
        nightInput.value = result.bionicDefaultNightWebsites;
        fontSelect.value = result.bionicFontFamily;
        fontSizeSlider.value = result.bionicFontSize;
        fontSizeInput.value = result.bionicFontSize;
    });

    // 输入框实时保存设置，无需额外的保存按钮
    blacklistInput.addEventListener('input', function(e) {
       chrome.storage.local.set({ bionicBlacklistWebsites: e.target.value });
    });
    dayInput.addEventListener('input', function(e) {
       chrome.storage.local.set({ bionicDefaultDayWebsites: e.target.value });
    });
    nightInput.addEventListener('input', function(e) {
       chrome.storage.local.set({ bionicDefaultNightWebsites: e.target.value });
    });

    // 新增：字体选择变化时保存设置
    fontSelect.addEventListener('change', function(e) {
       chrome.storage.local.set({ bionicFontFamily: e.target.value });

       // 向所有标签页发送字体更新消息
       chrome.tabs.query({}, function(tabs) {
           tabs.forEach(tab => {
               chrome.tabs.sendMessage(tab.id, {
                   action: "setFont",
                   fontFamily: e.target.value
               });
           });
       });
    });

    // 新增：字号滑块变化时保存设置并同步输入框
    fontSizeSlider.addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        fontSizeInput.value = value;
        chrome.storage.local.set({ bionicFontSize: value });

        // 向所有标签页发送字号更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "setFontSize",
                    fontSize: value
                });
            });
        });
    });

    // 新增：字号输入框变化时保存设置并同步滑块
    fontSizeInput.addEventListener('input', function(e) {
        let value = parseInt(e.target.value);
        // 确保值在合法范围内
        if (isNaN(value)) value = 16;
        if (value < 8) value = 8;
        if (value > 64) value = 64;

        // 同步更新滑块值
        fontSizeSlider.value = value;
        e.target.value = value;

        chrome.storage.local.set({ bionicFontSize: value });

        // 向所有标签页发送字号更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "setFontSize",
                    fontSize: value
                });
            });
        });
    });
});

// Thanox Reading 设置
document.addEventListener('DOMContentLoaded', function() {
    // 获取 Thanox Reading 相关的元素
    const thanoxReadingEnabled = document.getElementById('thanoxReadingEnabled');
    const thanoxProcessingOpacity = document.getElementById('thanoxProcessingOpacity');
    const thanoxProcessingOpacityValue = document.getElementById('thanoxProcessingOpacityValue');
    const thanoxCompletedOpacity = document.getElementById('thanoxCompletedOpacity');
    const thanoxCompletedOpacityValue = document.getElementById('thanoxCompletedOpacityValue');
    const thanoxWordSpeed = document.getElementById('thanoxWordSpeed');
    const thanoxWordSpeedValue = document.getElementById('thanoxWordSpeedValue');

    // 获取碎片特效相关的元素
    const thanoxFragmentEffect = document.getElementById('thanoxFragmentEffect');
    const thanoxFragmentCount = document.getElementById('thanoxFragmentCount');
    const thanoxFragmentCountValue = document.getElementById('thanoxFragmentCountValue');
    const thanoxFragmentDuration = document.getElementById('thanoxFragmentDuration');
    const thanoxFragmentDurationValue = document.getElementById('thanoxFragmentDurationValue');

    // 从存储中加载已保存的设置
    chrome.storage.local.get({
        thanoxReadingEnabled: false,
        thanoxProcessingOpacity: 50,
        thanoxCompletedOpacity: 10,
        thanoxWordSpeed: 1000,
        thanoxFragmentEffect: true,
        thanoxFragmentCount: 8,
        thanoxFragmentDuration: 2000
    }, function(result) {
        thanoxReadingEnabled.checked = result.thanoxReadingEnabled;
        thanoxProcessingOpacity.value = result.thanoxProcessingOpacity;
        thanoxProcessingOpacityValue.textContent = result.thanoxProcessingOpacity;
        thanoxCompletedOpacity.value = result.thanoxCompletedOpacity;
        thanoxCompletedOpacityValue.textContent = result.thanoxCompletedOpacity;
        thanoxWordSpeed.value = result.thanoxWordSpeed;
        thanoxWordSpeedValue.textContent = result.thanoxWordSpeed;

        // 加载碎片特效设置
        thanoxFragmentEffect.checked = result.thanoxFragmentEffect;
        thanoxFragmentCount.value = result.thanoxFragmentCount;
        thanoxFragmentCountValue.textContent = result.thanoxFragmentCount;
        thanoxFragmentDuration.value = result.thanoxFragmentDuration;
        thanoxFragmentDurationValue.textContent = result.thanoxFragmentDuration;
    });

    // 监听 Thanox Reading 开关变化
    thanoxReadingEnabled.addEventListener('change', function(e) {
        const isEnabled = e.target.checked;
        chrome.storage.local.set({ thanoxReadingEnabled: isEnabled });

        // 向所有标签页发送切换消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "toggleThanoxReading",
                    isEnabled: isEnabled
                }).catch(error => {
                    // 忽略错误，某些标签页可能没有加载内容脚本
                });
            });
        });
    });

    // 监听处理中透明值变化
    thanoxProcessingOpacity.addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        thanoxProcessingOpacityValue.textContent = value;
        chrome.storage.local.set({ thanoxProcessingOpacity: value });

        // 向所有标签页发送设置更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateThanoxSettings",
                    settings: {
                        processingOpacity: value / 100 // 转换为 0-1 范围
                    }
                }).catch(error => {
                    // 忽略错误
                });
            });
        });
    });

    // 监听处理完成后透明值变化
    thanoxCompletedOpacity.addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        thanoxCompletedOpacityValue.textContent = value;
        chrome.storage.local.set({ thanoxCompletedOpacity: value });

        // 向所有标签页发送设置更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateThanoxSettings",
                    settings: {
                        completedOpacity: value / 100 // 转换为 0-1 范围
                    }
                }).catch(error => {
                    // 忽略错误
                });
            });
        });
    });

    // 监听单词消失速度变化
    thanoxWordSpeed.addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        thanoxWordSpeedValue.textContent = value;
        chrome.storage.local.set({ thanoxWordSpeed: value });

        // 向所有标签页发送设置更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateThanoxSettings",
                    settings: {
                        wordSpeed: value
                    }
                }).catch(error => {
                    // 忽略错误
                });
            });
        });
    });

    // 监听碎片特效开关变化
    thanoxFragmentEffect.addEventListener('change', function(e) {
        const isEnabled = e.target.checked;
        chrome.storage.local.set({ thanoxFragmentEffect: isEnabled });

        // 向所有标签页发送设置更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateThanoxSettings",
                    settings: {
                        fragmentEffect: isEnabled
                    }
                }).catch(error => {
                    // 忽略错误
                });
            });
        });
    });

    // 监听碎片数量变化
    thanoxFragmentCount.addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        thanoxFragmentCountValue.textContent = value;
        chrome.storage.local.set({ thanoxFragmentCount: value });

        // 向所有标签页发送设置更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateThanoxSettings",
                    settings: {
                        fragmentCount: value
                    }
                }).catch(error => {
                    // 忽略错误
                });
            });
        });
    });

    // 监听碎片动画时长变化
    thanoxFragmentDuration.addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        thanoxFragmentDurationValue.textContent = value;
        chrome.storage.local.set({ thanoxFragmentDuration: value });

        // 向所有标签页发送设置更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateThanoxSettings",
                    settings: {
                        fragmentDuration: value
                    }
                }).catch(error => {
                    // 忽略错误
                });
            });
        });
    });
});

document.addEventListener('DOMContentLoaded', function() {
    // 获取 Reading Ruler 黑名单设置相关的元素（确保在 popup.html 中添加了对应的 textarea）
    const readingRulerBlacklistInput = document.getElementById('readingRulerBlacklistWebsites');

    // 从存储中加载已保存的设置；如果没有则使用默认值
    chrome.storage.local.get({
        readingRulerBlacklistWebsites: '*://github.com/*;https://en.wikipedia.org/wiki/English_language'
    }, function(result) {
        readingRulerBlacklistInput.value = result.readingRulerBlacklistWebsites;
    });

    // 输入框实时保存设置，无需额外的保存按钮
    readingRulerBlacklistInput.addEventListener('input', function(e) {
        chrome.storage.local.set({ readingRulerBlacklistWebsites: e.target.value });
    });
});


// 鼠标悬浮时显示tooltip 位置fix
window.addEventListener('DOMContentLoaded', () => {
  // 获取所有 tooltip 容器
  const tooltipContainers = document.querySelectorAll('.tooltip-container');

  tooltipContainers.forEach((container) => {
    container.addEventListener('mouseenter', () => {
      const tooltip = container.querySelector('.tooltip-text');
      if (!tooltip) return;

      // 为了测量 tooltip 宽度，暂时显示 tooltip，但保持透明
      tooltip.style.visibility = 'hidden';
      tooltip.style.opacity = '0';
      tooltip.style.display = 'block';

      // 先按默认居中方式显示
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%)';

      // 获取 tooltip 的尺寸和位置
      const rect = tooltip.getBoundingClientRect();

      // 判断是否超出左边界
      if (rect.left < 10) {
        const shift = 10 - rect.left;
        tooltip.style.left = `calc(50% + ${shift}px)`;
        tooltip.style.transform = 'translateX(-50%)';
      }
      // 判断是否超出右边界
      else if (rect.right > window.innerWidth - 10) {
        const shift = rect.right - (window.innerWidth - 10);
        tooltip.style.left = `calc(50% - ${shift}px)`;
        tooltip.style.transform = 'translateX(-50%)';
      }

      // 最后显示 tooltip
      tooltip.style.visibility = 'visible';
      tooltip.style.opacity = '1';
    });

    container.addEventListener('mouseleave', () => {
      const tooltip = container.querySelector('.tooltip-text');
      // 隐藏 tooltip（同时重置样式，保证下次测量准确）
      tooltip.style.visibility = 'hidden';
      tooltip.style.opacity = '0';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%)';
    });
  });
});






// 快捷键设置 - 单词查询
const wordQueryBtn = document.getElementById('wordQueryBtn');

// 加载状态
chrome.storage.local.get('wordQueryKey', function(result) {
    const key = result.wordQueryKey || 'q';
    wordQueryBtn.dataset.key = key;
    // wordQueryBtn.placeholder = key.toUpperCase(); // 旧代码：转了大写
    wordQueryBtn.placeholder = (key === ' ') ? 'Space' : key; // 修改：不转大写，处理空格显示
});

// 复制句子到剪切板
const copySentenceBtn = document.getElementById('copySentenceBtn');

// 加载状态
chrome.storage.local.get('copySentenceKey', function(result) {
    const key = result.copySentenceKey || 'w';
    copySentenceBtn.dataset.key = key;
    // copySentenceBtn.placeholder = key.toUpperCase(); // 旧代码：转了大写
    copySentenceBtn.placeholder = (key === ' ') ? 'Space' : key; // 修改：不转大写，处理空格显示
});

// 弹窗句子解析
const analysisWindowBtn = document.getElementById('analysisWindowBtn');

// 加载状态
chrome.storage.local.get('analysisWindowKey', function(result) {
    const key = result.analysisWindowKey || 'e';
    analysisWindowBtn.dataset.key = key;
    // analysisWindowBtn.placeholder = key.toUpperCase(); // 旧代码：转了大写
    analysisWindowBtn.placeholder = (key === ' ') ? 'Space' : key; // 修改：不转大写，处理空格显示
});

// 侧边栏句子解析
const sidePanelBtn = document.getElementById('sidePanelBtn');

// 加载状态
chrome.storage.local.get('sidePanelKey', function(result) {
    const key = result.sidePanelKey || 'r';
    sidePanelBtn.dataset.key = key;
    // sidePanelBtn.placeholder = key.toUpperCase(); // 旧代码：转了大写
    sidePanelBtn.placeholder = (key === ' ') ? 'Space' : key; // 修改：不转大写，处理空格显示
});

document.addEventListener('DOMContentLoaded', function() {
    // 获取插件设置相关的元素
    const pluginSettingsToggle = document.getElementById('pluginSettingsToggle');
    const pluginSettings = document.getElementById('pluginSettings');
    const blacklistInput = document.getElementById('pluginBlacklistWebsites');

    // 点击按钮展开/收起插件设置区域
    pluginSettingsToggle.addEventListener('click', function() {
        pluginSettings.classList.toggle('visible');
    });

    // 从存储中加载已保存的设置；如果没有则使用默认值
    chrome.storage.local.get({
        pluginBlacklistWebsites: '*://music.youtube.com/*;*ohmygpt*'//这里仅仅是ui，没用
    }, function(result) {
        blacklistInput.value = result.pluginBlacklistWebsites;
    });

    // 输入框实时保存设置
    blacklistInput.addEventListener('input', function(e) {
        chrome.storage.local.set({ pluginBlacklistWebsites: e.target.value });
    });

    // ===== 单词爆炸设置 =====
    const wordExplosionSettingsToggle = document.getElementById('wordExplosionSettingsToggle');
    const wordExplosionSettings = document.getElementById('wordExplosionSettings');
    const wordExplosionEnabled = document.getElementById('wordExplosionEnabled');
    const wordExplosionTriggerMode = document.getElementById('wordExplosionTriggerMode');
    const wordExplosionPositionMode = document.getElementById('wordExplosionPositionMode');
    const wordExplosionFontSize = document.getElementById('wordExplosionFontSize');
    const wordExplosionPreferUp = document.getElementById('wordExplosionPreferUp');
    const wordExplosionLayout = document.getElementById('wordExplosionLayout');
    const wordExplosionTranslationCount = document.getElementById('wordExplosionTranslationCount');
    const explosionSentenceTranslationCount = document.getElementById('explosionSentenceTranslationCount');
    const wordExplosionHighlightSentence = document.getElementById('wordExplosionHighlightSentence');
    const wordExplosionHighlightColor = document.getElementById('wordExplosionHighlightColor');
    const wordExplosionHighlightColorPicker = document.getElementById('wordExplosionHighlightColorPicker');
    const wordExplosionHighlightOpacity = document.getElementById('wordExplosionHighlightOpacity');
    const wordExplosionHighlightOpacityValue = document.getElementById('wordExplosionHighlightOpacityValue');
    const wordExplosionUnderlineEnabled = document.getElementById('wordExplosionUnderlineEnabled');
    const wordExplosionUnderlineStyle = document.getElementById('wordExplosionUnderlineStyle');
    const wordExplosionUnderlinePosition = document.getElementById('wordExplosionUnderlinePosition');
    const wordExplosionUnderlineColor = document.getElementById('wordExplosionUnderlineColor');
    const wordExplosionUnderlineColorPicker = document.getElementById('wordExplosionUnderlineColorPicker');
    const wordExplosionUnderlineOpacity = document.getElementById('wordExplosionUnderlineOpacity');
    const wordExplosionUnderlineOpacityValue = document.getElementById('wordExplosionUnderlineOpacityValue');
    const wordExplosionUnderlineThickness = document.getElementById('wordExplosionUnderlineThickness');

    // 点击按钮展开/收起设置区域
    wordExplosionSettingsToggle.addEventListener('click', function() {
        wordExplosionSettings.classList.toggle('visible');
    });

    // 加载设置
    chrome.storage.local.get({
        wordExplosionEnabled: true,
        wordExplosionTriggerMode: 'click',
        wordExplosionPositionMode: 'auto',
        wordExplosionFontSize: 14,
        wordExplosionPreferUp: true,
        wordExplosionLayout: 'vertical',
        wordExplosionTranslationCount: 'all',
        explosionSentenceTranslationCount: 1,
        wordExplosionHighlightSentence: true,
        wordExplosionHighlightColor: '#955FBD40',
        wordExplosionUnderlineEnabled: false,
        wordExplosionUnderlineStyle: 'solid',
        wordExplosionUnderlinePosition: 'bottom',
        wordExplosionUnderlineColor: '#955FBD80',
        wordExplosionUnderlineThickness: 3
    }, function(result) {
        wordExplosionEnabled.checked = result.wordExplosionEnabled;
        wordExplosionTriggerMode.value = result.wordExplosionTriggerMode;
        wordExplosionPositionMode.value = result.wordExplosionPositionMode;
        wordExplosionFontSize.value = result.wordExplosionFontSize;
        wordExplosionPreferUp.checked = result.wordExplosionPreferUp;
        wordExplosionLayout.value = result.wordExplosionLayout;
        wordExplosionTranslationCount.value = result.wordExplosionTranslationCount;
        explosionSentenceTranslationCount.value = result.explosionSentenceTranslationCount;
        wordExplosionHighlightSentence.checked = result.wordExplosionHighlightSentence;
        wordExplosionHighlightColor.value = result.wordExplosionHighlightColor;
        wordExplosionUnderlineEnabled.checked = result.wordExplosionUnderlineEnabled;
        wordExplosionUnderlineStyle.value = result.wordExplosionUnderlineStyle;
        wordExplosionUnderlinePosition.value = result.wordExplosionUnderlinePosition;
        wordExplosionUnderlineColor.value = result.wordExplosionUnderlineColor;
        wordExplosionUnderlineThickness.value = result.wordExplosionUnderlineThickness;

        // 更新颜色预览和颜色选择器
        const highlightColorPreview = document.getElementById('wordExplosionHighlightColorPreview');
        const underlineColorPreview = document.getElementById('wordExplosionUnderlineColorPreview');

        if (highlightColorPreview) {
            highlightColorPreview.style.backgroundColor = result.wordExplosionHighlightColor;
        }
        if (underlineColorPreview) {
            underlineColorPreview.style.backgroundColor = result.wordExplosionUnderlineColor;
        }

        // 初始化高亮颜色选择器和透明度滑块
        const highlightParsed = parseColorWithAlpha(result.wordExplosionHighlightColor);
        if (wordExplosionHighlightColorPicker) {
            wordExplosionHighlightColorPicker.value = highlightParsed.rgb;
        }
        if (wordExplosionHighlightOpacity) {
            const highlightOpacityPercent = Math.round(highlightParsed.alpha * 100);
            wordExplosionHighlightOpacity.value = highlightOpacityPercent;
            if (wordExplosionHighlightOpacityValue) {
                wordExplosionHighlightOpacityValue.textContent = highlightOpacityPercent;
            }
        }

        // 初始化下划线颜色选择器和透明度滑块
        const underlineParsed = parseColorWithAlpha(result.wordExplosionUnderlineColor);
        if (wordExplosionUnderlineColorPicker) {
            wordExplosionUnderlineColorPicker.value = underlineParsed.rgb;
        }
        if (wordExplosionUnderlineOpacity) {
            const underlineOpacityPercent = Math.round(underlineParsed.alpha * 100);
            wordExplosionUnderlineOpacity.value = underlineOpacityPercent;
            if (wordExplosionUnderlineOpacityValue) {
                wordExplosionUnderlineOpacityValue.textContent = underlineOpacityPercent;
            }
        }

        // 初始化下划线设置显示状态
        const wordExplosionUnderlineSettings = document.getElementById('wordExplosionUnderlineSettings');
        if (wordExplosionUnderlineSettings) {
            wordExplosionUnderlineSettings.style.display = result.wordExplosionUnderlineEnabled ? 'block' : 'none';
        }
    });

    // 监听变化并自动保存
    wordExplosionEnabled.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionEnabled: e.target.checked });
    });

    wordExplosionTriggerMode.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionTriggerMode: e.target.value });
    });

    wordExplosionPositionMode.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionPositionMode: e.target.value });
    });

    wordExplosionFontSize.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionFontSize: parseInt(e.target.value) });
    });

    wordExplosionPreferUp.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionPreferUp: e.target.checked });
    });

    wordExplosionLayout.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionLayout: e.target.value });
    });

    wordExplosionTranslationCount.addEventListener('change', function(e) {
        const value = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
        chrome.storage.local.set({ wordExplosionTranslationCount: value });
    });

    explosionSentenceTranslationCount.addEventListener('change', function(e) {
        const value = parseInt(e.target.value);
        chrome.storage.local.set({ explosionSentenceTranslationCount: value });
    });

    wordExplosionHighlightSentence.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionHighlightSentence: e.target.checked });
    });

    // 辅助函数：将十六进制颜色转换为RGB和透明度
    function parseColorWithAlpha(hexColor) {
        if (!hexColor || hexColor.length < 7) {
            return { rgb: '#955FBD', alpha: 0.25 };
        }
        const rgb = hexColor.substring(0, 7); // #RRGGBB
        let alpha = 1;
        if (hexColor.length === 9) {
            // #RRGGBBAA
            const alphaHex = hexColor.substring(7, 9);
            alpha = parseInt(alphaHex, 16) / 255;
        }
        return { rgb, alpha };
    }

    // 辅助函数：将RGB和透明度合并为十六进制颜色
    function combineColorWithAlpha(rgb, alpha) {
        const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
        return rgb + alphaHex;
    }

    // 高亮颜色输入框和预览
    const wordExplosionHighlightColorPreview = document.getElementById('wordExplosionHighlightColorPreview');

    // 文本输入框变化
    wordExplosionHighlightColor.addEventListener('input', function(e) {
        const color = e.target.value;
        chrome.storage.local.set({ wordExplosionHighlightColor: color });

        // 更新预览
        if (wordExplosionHighlightColorPreview) {
            wordExplosionHighlightColorPreview.style.backgroundColor = color;
        }

        // 同步到颜色选择器和透明度滑块
        const parsed = parseColorWithAlpha(color);
        if (wordExplosionHighlightColorPicker) {
            wordExplosionHighlightColorPicker.value = parsed.rgb;
        }
        if (wordExplosionHighlightOpacity) {
            const opacityPercent = Math.round(parsed.alpha * 100);
            wordExplosionHighlightOpacity.value = opacityPercent;
            if (wordExplosionHighlightOpacityValue) {
                wordExplosionHighlightOpacityValue.textContent = opacityPercent;
            }
        }
    });

    // 颜色选择器变化
    if (wordExplosionHighlightColorPicker) {
        wordExplosionHighlightColorPicker.addEventListener('input', function(e) {
            const rgb = e.target.value;
            const alpha = wordExplosionHighlightOpacity ? parseInt(wordExplosionHighlightOpacity.value) / 100 : 0.25;
            const fullColor = combineColorWithAlpha(rgb, alpha);

            wordExplosionHighlightColor.value = fullColor;
            chrome.storage.local.set({ wordExplosionHighlightColor: fullColor });

            if (wordExplosionHighlightColorPreview) {
                wordExplosionHighlightColorPreview.style.backgroundColor = fullColor;
            }
        });
    }

    // 透明度滑块变化
    if (wordExplosionHighlightOpacity) {
        wordExplosionHighlightOpacity.addEventListener('input', function(e) {
            const opacityPercent = parseInt(e.target.value);
            const alpha = opacityPercent / 100;

            if (wordExplosionHighlightOpacityValue) {
                wordExplosionHighlightOpacityValue.textContent = opacityPercent;
            }

            const rgb = wordExplosionHighlightColorPicker ? wordExplosionHighlightColorPicker.value : '#955FBD';
            const fullColor = combineColorWithAlpha(rgb, alpha);

            wordExplosionHighlightColor.value = fullColor;
            chrome.storage.local.set({ wordExplosionHighlightColor: fullColor });

            if (wordExplosionHighlightColorPreview) {
                wordExplosionHighlightColorPreview.style.backgroundColor = fullColor;
            }
        });
    }

    // 点击预览框时聚焦到输入框
    if (wordExplosionHighlightColorPreview) {
        wordExplosionHighlightColorPreview.addEventListener('click', function() {
            wordExplosionHighlightColor.focus();
            wordExplosionHighlightColor.select();
        });
    }

    // 下划线设置容器
    const wordExplosionUnderlineSettings = document.getElementById('wordExplosionUnderlineSettings');

    // 切换下划线设置显示/隐藏
    function toggleUnderlineSettings(enabled) {
        if (wordExplosionUnderlineSettings) {
            wordExplosionUnderlineSettings.style.display = enabled ? 'block' : 'none';
        }
    }

    wordExplosionUnderlineEnabled.addEventListener('change', function(e) {
        const enabled = e.target.checked;
        chrome.storage.local.set({ wordExplosionUnderlineEnabled: enabled });
        toggleUnderlineSettings(enabled);
    });

    wordExplosionUnderlineStyle.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionUnderlineStyle: e.target.value });
    });

    wordExplosionUnderlinePosition.addEventListener('change', function(e) {
        chrome.storage.local.set({ wordExplosionUnderlinePosition: e.target.value });
    });

    // 下划线颜色输入框和预览
    const wordExplosionUnderlineColorPreview = document.getElementById('wordExplosionUnderlineColorPreview');

    // 文本输入框变化
    wordExplosionUnderlineColor.addEventListener('input', function(e) {
        const color = e.target.value;
        chrome.storage.local.set({ wordExplosionUnderlineColor: color });

        // 更新预览
        if (wordExplosionUnderlineColorPreview) {
            wordExplosionUnderlineColorPreview.style.backgroundColor = color;
        }

        // 同步到颜色选择器和透明度滑块
        const parsed = parseColorWithAlpha(color);
        if (wordExplosionUnderlineColorPicker) {
            wordExplosionUnderlineColorPicker.value = parsed.rgb;
        }
        if (wordExplosionUnderlineOpacity) {
            const opacityPercent = Math.round(parsed.alpha * 100);
            wordExplosionUnderlineOpacity.value = opacityPercent;
            if (wordExplosionUnderlineOpacityValue) {
                wordExplosionUnderlineOpacityValue.textContent = opacityPercent;
            }
        }
    });

    // 颜色选择器变化
    if (wordExplosionUnderlineColorPicker) {
        wordExplosionUnderlineColorPicker.addEventListener('input', function(e) {
            const rgb = e.target.value;
            const alpha = wordExplosionUnderlineOpacity ? parseInt(wordExplosionUnderlineOpacity.value) / 100 : 0.5;
            const fullColor = combineColorWithAlpha(rgb, alpha);

            wordExplosionUnderlineColor.value = fullColor;
            chrome.storage.local.set({ wordExplosionUnderlineColor: fullColor });

            if (wordExplosionUnderlineColorPreview) {
                wordExplosionUnderlineColorPreview.style.backgroundColor = fullColor;
            }
        });
    }

    // 透明度滑块变化
    if (wordExplosionUnderlineOpacity) {
        wordExplosionUnderlineOpacity.addEventListener('input', function(e) {
            const opacityPercent = parseInt(e.target.value);
            const alpha = opacityPercent / 100;

            if (wordExplosionUnderlineOpacityValue) {
                wordExplosionUnderlineOpacityValue.textContent = opacityPercent;
            }

            const rgb = wordExplosionUnderlineColorPicker ? wordExplosionUnderlineColorPicker.value : '#955FBD';
            const fullColor = combineColorWithAlpha(rgb, alpha);

            wordExplosionUnderlineColor.value = fullColor;
            chrome.storage.local.set({ wordExplosionUnderlineColor: fullColor });

            if (wordExplosionUnderlineColorPreview) {
                wordExplosionUnderlineColorPreview.style.backgroundColor = fullColor;
            }
        });
    }

    // 点击预览框时聚焦到输入框
    if (wordExplosionUnderlineColorPreview) {
        wordExplosionUnderlineColorPreview.addEventListener('click', function() {
            wordExplosionUnderlineColor.focus();
            wordExplosionUnderlineColor.select();
        });
    }

    wordExplosionUnderlineThickness.addEventListener('input', function(e) {
        chrome.storage.local.set({ wordExplosionUnderlineThickness: parseInt(e.target.value) });
    });

    // 显示爆炸原句开关
    const showExplosionSentence = document.getElementById('showExplosionSentence');
    if (showExplosionSentence) {
        // 加载设置
        chrome.storage.local.get('showExplosionSentence', function(result) {
            showExplosionSentence.checked = result.showExplosionSentence !== undefined ? result.showExplosionSentence : true;
        });

        // 监听变化
        showExplosionSentence.addEventListener('change', function(e) {
            chrome.storage.local.set({ showExplosionSentence: e.target.checked });
        });
    }

    // 触发逐词高亮（TTS）开关
    const explosionHighlightWithTTS = document.getElementById('explosionHighlightWithTTS');
    if (explosionHighlightWithTTS) {
        // 加载设置
        chrome.storage.local.get('explosionHighlightWithTTS', function(result) {
            explosionHighlightWithTTS.checked = result.explosionHighlightWithTTS !== undefined ? result.explosionHighlightWithTTS : false;
        });

        // 监听变化（与无TTS开关互斥）
        explosionHighlightWithTTS.addEventListener('change', function(e) {
            if (e.target.checked) {
                // 如果启用TTS高亮，关闭无TTS高亮
                chrome.storage.local.set({
                    explosionHighlightWithTTS: true,
                    explosionHighlightNoTTS: false
                });
                if (explosionHighlightNoTTS) {
                    explosionHighlightNoTTS.checked = false;
                }
            } else {
                chrome.storage.local.set({ explosionHighlightWithTTS: false });
            }
        });
    }

    // 触发逐词高亮（无TTS）开关
    const explosionHighlightNoTTS = document.getElementById('explosionHighlightNoTTS');
    if (explosionHighlightNoTTS) {
        // 加载设置
        chrome.storage.local.get('explosionHighlightNoTTS', function(result) {
            explosionHighlightNoTTS.checked = result.explosionHighlightNoTTS !== undefined ? result.explosionHighlightNoTTS : false;
        });

        // 监听变化（与TTS开关互斥）
        explosionHighlightNoTTS.addEventListener('change', function(e) {
            if (e.target.checked) {
                // 如果启用无TTS高亮，关闭TTS高亮
                chrome.storage.local.set({
                    explosionHighlightNoTTS: true,
                    explosionHighlightWithTTS: false
                });
                if (explosionHighlightWithTTS) {
                    explosionHighlightWithTTS.checked = false;
                }
            } else {
                chrome.storage.local.set({ explosionHighlightNoTTS: false });
            }
        });
    }

    // 爆炸窗口逐词高亮速度设置
    const explosionHighlightSpeed = document.getElementById('explosionHighlightSpeed');
    if (explosionHighlightSpeed) {
        // 加载设置
        chrome.storage.local.get('explosionHighlightSpeed', function(result) {
            // 默认值100ms/字符
            const speed = result.explosionHighlightSpeed !== undefined ? result.explosionHighlightSpeed : 100;
            explosionHighlightSpeed.value = speed;
        });

        // 监听变化
        explosionHighlightSpeed.addEventListener('change', function(e) {
            const speed = parseInt(e.target.value);
            if (!isNaN(speed) && speed >= 10 && speed <= 500) {
                chrome.storage.local.set({ explosionHighlightSpeed: speed });
            }
        });

        // 实时更新（输入时）
        explosionHighlightSpeed.addEventListener('input', function(e) {
            const speed = parseInt(e.target.value);
            if (!isNaN(speed) && speed >= 10 && speed <= 500) {
                chrome.storage.local.set({ explosionHighlightSpeed: speed });
            }
        });
    }

    // 已知句子展示动效图开关
    const showKnownSentenceAnimation = document.getElementById('showKnownSentenceAnimation');
    if (showKnownSentenceAnimation) {
        // 加载设置
        chrome.storage.local.get('showKnownSentenceAnimation', function(result) {
            showKnownSentenceAnimation.checked = result.showKnownSentenceAnimation !== undefined ? result.showKnownSentenceAnimation : true;
        });

        // 监听变化
        showKnownSentenceAnimation.addEventListener('change', function(e) {
            chrome.storage.local.set({ showKnownSentenceAnimation: e.target.checked });
        });
    }
});

// TTS设置
const enableWordTTS = document.getElementById('enableWordTTS');
const enableSentenceTTS = document.getElementById('enableSentenceTTS');
const enableAutoWordTTS = document.getElementById('enableAutoWordTTS'); // 添加：获取新开关元素
const useOrionTTS = document.getElementById('useOrionTTS'); // 添加：获取Orion TTS开关元素

// 加载状态
chrome.storage.local.get(['enableWordTTS', 'enableSentenceTTS', 'enableAutoWordTTS', 'useOrionTTS'], function(result) { // 添加：加载新开关状态
    // 默认都启用
    enableWordTTS.checked = result.enableWordTTS === undefined ? true : result.enableWordTTS;
    enableSentenceTTS.checked = result.enableSentenceTTS === undefined ? true : result.enableSentenceTTS;
    enableAutoWordTTS.checked = result.enableAutoWordTTS || false;
    useOrionTTS.checked = result.useOrionTTS === true; // Orion TTS默认关闭
});

// 监听变化
enableWordTTS.addEventListener('change', function(e) {
    chrome.storage.local.set({ enableWordTTS: e.target.checked });
});

enableSentenceTTS.addEventListener('change', function(e) {
    chrome.storage.local.set({ enableSentenceTTS: e.target.checked });
});

enableAutoWordTTS.addEventListener('change', function(e) { // 添加：监听新开关变化
    chrome.storage.local.set({ enableAutoWordTTS: e.target.checked });
});

useOrionTTS.addEventListener('change', function(e) { // 添加：监听Orion TTS开关变化
    chrome.storage.local.set({ useOrionTTS: e.target.checked });
});




// Bionic主题切换按钮
const bionicLightThemeBtn = document.getElementById('bionicLightTheme');
const bionicDarkThemeBtn = document.getElementById('bionicDarkTheme');

// 加载当前主题状态
chrome.storage.local.get('isDarkTheme', function(result) {
    const isDark = result.isDarkTheme || false;
    bionicUpdateThemeButtons(isDark);
});

// 更新按钮状态
function bionicUpdateThemeButtons(isDark) {
    if (isDark) {
        bionicDarkThemeBtn.classList.add('active');
        bionicLightThemeBtn.classList.remove('active');
    } else {
        bionicLightThemeBtn.classList.add('active');
        bionicDarkThemeBtn.classList.remove('active');
    }
}

// 点击事件处理
bionicLightThemeBtn.addEventListener('click', function() {
    chrome.storage.local.set({ isDarkTheme: false }, function() {
        bionicUpdateThemeButtons(false);
        // 向所有标签页发送主题更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "setTheme",
                    isDark: false
                });
            });
        });
    });
});

bionicDarkThemeBtn.addEventListener('click', function() {
    chrome.storage.local.set({ isDarkTheme: true }, function() {
        bionicUpdateThemeButtons(true);
        // 向所有标签页发送主题更新消息
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "setTheme",
                    isDark: true
                });
            });
        });
    });
});

// 添加高亮模式的黑白主题按钮逻辑
const highlightLightThemeBtn = document.getElementById('highlightLightTheme');
const highlightDarkThemeBtn = document.getElementById('highlightDarkTheme');

// 加载当前高亮主题状态
// chrome.storage.local.get('isDarkMode', function(result) {
//     const isDark = result.isDarkMode || false;
//     updateHighlightThemeButtons(isDark);
// });

// 更新高亮主题按钮状态
function updateHighlightThemeButtons(isDark) {
    if (isDark) {
        highlightDarkThemeBtn.classList.add('active');
        highlightLightThemeBtn.classList.remove('active');
    } else {
        highlightLightThemeBtn.classList.add('active');
        highlightDarkThemeBtn.classList.remove('active');
    }
}

// 点击日间模式按钮
highlightLightThemeBtn.addEventListener('click', function() {
    chrome.storage.local.set({ isDarkMode: false }, function() {
        updateHighlightThemeButtons(false);
        // 通知所有标签页更新高亮主题
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateHighlightTheme",
                    isDark: false
                });
            });
        });
    });
});

// 点击夜间模式按钮
highlightDarkThemeBtn.addEventListener('click', function() {
    chrome.storage.local.set({ isDarkMode: true }, function() {
        updateHighlightThemeButtons(true);
        // 通知所有标签页更新高亮主题
        chrome.tabs.query({}, function(tabs) {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "updateHighlightTheme",
                    isDark: true
                });
            });
        });
    });
});

// 添加高亮黑白名单设置逻辑
document.addEventListener('DOMContentLoaded', function() {
    // 获取高亮相关的黑白名单元素
    const dayWebsitesInput = document.getElementById('highlightDefaultDayWebsites');
    const nightWebsitesInput = document.getElementById('highlightDefaultNightWebsites');

    // 从存储中加载已保存的设置
    chrome.storage.local.get({
        highlightDefaultDayWebsites: '',
        highlightDefaultNightWebsites: '*lingkuma*;'
    }, function(result) {
        dayWebsitesInput.value = result.highlightDefaultDayWebsites;
        nightWebsitesInput.value = result.highlightDefaultNightWebsites;
    });

    // 实时保存设置
    dayWebsitesInput.addEventListener('input', function(e) {
        chrome.storage.local.set({ highlightDefaultDayWebsites: e.target.value });
    });

    nightWebsitesInput.addEventListener('input', function(e) {
        chrome.storage.local.set({ highlightDefaultNightWebsites: e.target.value });
    });
});

// 添加打开侧栏按钮的事件监听
document.addEventListener('DOMContentLoaded', function() {
  const openSidebarBtn = document.getElementById('openSidebar');

  if (openSidebarBtn) {
    openSidebarBtn.addEventListener('click', function() {
      // 获取当前活动标签页并打开侧栏
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.sidePanel.open({tabId: tabs[0].id}, function() {
            if (chrome.runtime.lastError) {
              console.error("打开侧边栏失败:", chrome.runtime.lastError);
            }
          });
          // 关闭popup
          window.close();
        }
      });
    });
  }
});

// Waifu窗口相关设置
document.addEventListener('DOMContentLoaded', function() {
  const enableWaifu = document.getElementById('enableWaifu');
  const waifuSettingsToggle = document.getElementById('waifuSettingsToggle');
  const waifuSettings = document.getElementById('waifuSettings');
  const waifuUrl = document.getElementById('waifuUrl');

  // 点击按钮展开/收起Waifu设置区域
  waifuSettingsToggle.addEventListener('click', function() {
    waifuSettings.classList.toggle('visible');
  });

  // 从存储中加载已保存的设置
  chrome.storage.local.get({
    enableWaifu: false,
    waifuUrl: ''
  }, function(result) {
    enableWaifu.checked = result.enableWaifu;
    waifuUrl.value = result.waifuUrl;
  });

  // 监听开关变化
  enableWaifu.addEventListener('change', function(e) {
    chrome.storage.local.set({ enableWaifu: e.target.checked });

    // 向当前标签页发送消息以实时更新
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "toggleWaifu",
          enabled: e.target.checked,
          url: waifuUrl.value
        });
      }
    });
  });

  // 输入框实时保存设置
  waifuUrl.addEventListener('input', function(e) {
    const url = e.target.value;
    chrome.storage.local.set({ waifuUrl: url });

    // 如果功能已启用，向当前标签页发送消息以实时更新
    if (enableWaifu.checked) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "updateWaifuUrl",
            url: url
          });
        }
      });
    }
  });
});

// 在文件开头添加国际化支持
// 添加一个简易的i18n实现
const i18n = {
  zh: {
    // 标题
    "popupTitle": "设置",
    // 基础设置
      "basic_settings": "基础设置",
      "word_highlight": "单词高亮",
       "word_highlight_tooltip": "启用或禁用插件功能<br>可设置黑名单网站",

      "plugin_blacklist": "插件黑名单网站",
      "default_day_websites": "默认日间模式网站",
      "default_night_websites": "默认夜间模式网址",

      "day_mode": "日间模式",
    "night_mode": "夜间模式",

    // 快捷键
    "close_tooltip": "关闭小窗",


   // 其他设置和提示
   "embed_other_websites": "嵌入其他网页",
   "embed_other_websites_tooltip": "在网页上显示一个可拖动的窗口",
   "waifu_url": "请输入要显示的网站URL",

// bionic reading
  "bionic_tooltip": "提高阅读效率<br>设置黑白名单",
  "bionic_reading_tooltip": " 亮词首四分，减眸析之劳。<br>瞥目只一瞬，识形于瞬息。<br>极占性能，长文慎用。.",
  "font_selection": "字体选择",
  "bionic_thanox": "Bionic & Thanox",
  "thanox_reading": "Thanox Reading",
  "thanox_processing_opacity": "处理中的透明值",
  "thanox_completed_opacity": "处理完成后的透明值",
  "thanox_word_speed": "单词消失速度",
  "thanox_fragment_effect": "🎆 碎片特效",
  "thanox_fragment_count": "碎片数量",
  "thanox_fragment_duration": "碎片动画时长",
  "bionic_blacklist": "Bionic Blacklist Websites",
  "font_selection_auto": "auto (default)",
  "font_size_setting": "字号设置",
  "font_size_unit": "px",

  //clipboard
  "clip_subtitles": "剪切板监听字幕",

  //reading ruler
   "reading_ruler_tooltip": "琅嬛玉尺，助阅明眸。<br>极占性能，长文慎用。",
   "reading_ruler_blacklist": "阅读尺黑名单网站",
   "ruler_inverted_mode": "反色模式",
  "width_mode": "宽度模式",
  "auto_width": "自动宽度",
  "screen_width": "屏幕宽度",
  "custom_width": "自定义宽度",
  "ruler_height": "高度",
  "ruler_opacity": "透明度",
  "ruler_color": "颜色",

    // AI 翻译设置
    "ai_translation_settings": "AI 翻译设置",
    "auto_request_ai_translations": "自动请求AI释义",
    "auto_add_ai_translations": "自动添加AI释义",
    "auto_add_ai_translations_from_unknown": "自动添加AI释义（未知/无释义）",
    "auto_request_ai_translations_2": "自动请求第二个AI释义",
    "auto_add_example_sentences": "自动添加例句",

    // 提示窗设置
    "tooltip_settings": "提示窗设置",
    "click_only_tooltip": "仅点击触发小窗",
    "auto_expand_tooltip": "自动展开未高亮单词的小窗",
    "auto_close_tooltip": "鼠标离开小窗自动关闭",
    "auto_refresh_tooltip": "新单词刷新小窗",
    "default_expand_tooltip": "小窗默认展开",
    "default_expand_sentents_tooltip": "例句默认展开",
    "default_expand_capsule": "胶囊默认展开",
    "prefer_popup_above": "优先向上弹出",
    "selection_popup_prefer_down": "划词弹窗优先默认向下弹出",
    "explosion_priority_mode": "爆炸优先模式",
    "tooltip_gap": "单词弹窗间隙",
    "device_pixel_ratio": "单词弹窗缩放",


    // 快捷键设置
    "shortcut_settings": "快捷键设置",
    "word_query": "单词查询",
    "copy_sentence": "👾复制句子|TTS高亮",
    "analysis_window": "弹窗句子解析",
    "side_panel": "侧边栏句子解析",

    // 文本语音设置
    "text_speech_settings": "文本语音设置",
    "word_tts": "单词朗读",
    "sentence_tts": "句子朗读",
    "auto_word_tts": "自动播放鼠标下单词", // 添加中文翻译

    // 添加：YouTube 字幕插件翻译
    "youtube_caption_fix": "YouTube 字幕插件",
    "youtube_caption_fix_tooltip": "尝试修复 YouTube 字幕的显示或定位问题",
    "youtube_comma_sentencing": "逗号分句",
    "youtube_bionic_reading": "仿生阅读",
    "youtube_font_size": "字体大小",
    "youtube_font_family": "字体样式",
    "lingq_blocker": "LingqBlocker",
    "lingq_blocker_tooltip": "自动删除LingQ网站的模态框和隐藏高亮",

    // 添加新快捷键翻译
    "word_status_0": "单词状态 0 (未知)",
    "word_status_1": "单词状态 1 (新)",
    "word_status_2": "单词状态 2 (已知)",
    "word_status_3": "单词状态 3 (学习中)",
    "word_status_4": "单词状态 4 (忽略)",
    "word_status_5": "单词状态 5 (标记)",
    "word_status_toggle": "切换已知/未知",

    // 高亮语言设置
    "highlight_chinese": "中文",
    "highlight_japanese": "日语",
    "auto_detect_japanese_kanji": "智能识别日文独立汉字",
    "auto_load_kuromoji_for_japanese": "智能判断网页是否为日语并自动启动koromoji",
    "use_kuromoji_tokenizer": "⚠️全局使用kuromoji进行分词，包括非日语页面。所有页面增加4s的加载时间，但会有稍微好一点的分词效果",
    "highlight_korean": "韩文",
    "highlight_alphabetic": "拉丁语系(英法德等)",

    // 单词爆炸设置
    "word_explosion": "单词爆炸💥",
    "word_explosion_tooltip": "显示句子中所有未知单词及其翻译",
    "word_explosion_trigger_mode": "触发模式",
    "word_explosion_trigger_click": "点击触发",
    "word_explosion_trigger_hover": "鼠标悬停",
    "word_explosion_position_mode": "弹窗位置模式",
    "word_explosion_position_auto": "自动上下",
    "word_explosion_position_manual": "手动移动",
    "word_explosion_font_size": "爆炸弹窗字体大小",
    "word_explosion_prefer_up": "优先向上显示",
    "word_explosion_layout": "单词布局",
    "word_explosion_layout_vertical": "垂直排列",
    "word_explosion_layout_horizontal": "水平排列",
    "word_explosion_translation_count": "单词翻译显示数量",
    "explosion_sentence_translation_request_count": "句子翻译请求数量",
    "explosion_sentence_translation_request_hint": "独立请求AI翻译，不依赖单词例句",
    "word_explosion_sentence_translation_count": "句子翻译显示数量",
    "word_explosion_count_all": "全部",
    "explosion_highlight_with_tts": "触发逐词高亮（TTS）",
    "explosion_highlight_no_tts": "触发逐词高亮（无TTS）",
    "explosion_highlight_speed": "爆炸窗口逐词高亮速度 (ms/字符)",
    "show_explosion_sentence": "显示爆炸原句",
    "show_known_sentence_animation": "已知句子展示动效图",
    "word_explosion_highlight_sentence": "高亮当前爆炸的句子",
    "word_explosion_highlight_color": "高亮背景颜色",
    "word_explosion_highlight_color_hint": "点击色板选择颜色，拖动滑块调整透明度",
    "word_explosion_highlight_opacity_label": "透明度",
    "word_explosion_underline_enabled": "启用下划线",
    "word_explosion_underline_style": "下划线样式",
    "word_explosion_underline_position": "下划线位置",
    "word_explosion_underline_color": "下划线颜色",
    "word_explosion_underline_color_hint": "点击色板选择颜色，拖动滑块调整透明度",
    "word_explosion_underline_opacity_label": "透明度",
    "word_explosion_underline_thickness": "下划线粗度 (px)",
    "underline_style_solid": "直线",
    "underline_style_wavy": "波浪线",
    "underline_style_dotted": "点线",
    "underline_position_bottom": "下",
    "underline_position_top": "上",
    "underline_position_both": "上+下",
  },
  en: {
    // 标题
    "popupTitle": "Settings",
    // 基础设置
      "basic_settings": "Basic Settings",
      "word_highlight": "Word Highlight",
        "word_highlight_tooltip": "Enable or disable plugin features<br>Blacklist websites can be set",

      "plugin_blacklist": "Plugin Blacklist Websites",
      "default_day_websites": "Default Day Mode Websites",
      "default_night_websites": "Default Night Mode Websites",



    "day_mode": "Day Mode",
    "night_mode": "Night Mode",

    // 快捷键
    "close_tooltip": "Close Tooltip",


    //embed
      "embed_other_websites": "Embed in Other Pages",
      "embed_other_websites_tooltip": "Display a draggable window on the webpage",
      "waifu_url": "Please enter the URL of the website to display",

    //bionic reading
    "bionic_reading_tooltip": "Highlight the first four words of each sentence.<br>Reduce eye strain and improve reading efficiency.<br>Use with caution for long texts.",
    "bionic_blacklist": "Bionic Blacklist Websites",
    "font_selection": "Font Selection",
    "bionic_thanox": "Bionic & Thanox",
    "thanox_reading": "Thanox Reading",
    "thanox_processing_opacity": "Processing Opacity",
    "thanox_completed_opacity": "Completed Opacity",
    "thanox_word_speed": "Word Disappearing Speed",
    "thanox_fragment_effect": "🎆 Fragment Effect",
    "thanox_fragment_count": "Fragment Count",
    "thanox_fragment_duration": "Fragment Animation Duration",
    "font_selection_auto": "auto (default)",
    "font_size_setting": "Font Size Setting",
    "font_size_unit": "px",

    //clipboare
    "clip_subtitles": "Monitor Clipboard for Subtitles",

    //readingruler
    "reading_ruler_tooltip": "Reading guide to help focus.<br>Resource intensive for long texts.",
    "reading_ruler_blacklist": "Reading Ruler Blacklist Websites",
    "ruler_inverted_mode": "Inverted Mode",
    "width_mode": "Width Mode",
    "auto_width": "Auto Width",
    "screen_width": "Screen Width",
    "custom_width": "Custom Width",
    "ruler_height": "Height",
    "ruler_opacity": "Opacity",
    "ruler_color": "ruler_color",

    // AI Translation Settings
    "ai_translation_settings": "AI Translation Settings",
    "auto_request_ai_translations": "Auto Request AI Definitions",
    "auto_add_ai_translations": "Auto Add AI Definitions",
    "auto_add_ai_translations_from_unknown": "Auto Add AI Definitions (Unknown/No Definition)",
    "auto_request_ai_translations_2": "Auto Request Second AI Definition",
    "auto_add_example_sentences": "Auto Add Example Sentences",

    // Tooltip Settings
    "tooltip_settings": "Tooltip Settings",
    "click_only_tooltip": "Click Only Tooltip",
    "auto_expand_tooltip": "Auto Expand Non-highlighted Words",
    "auto_close_tooltip": "Auto Close When Mouse Leaves",
    "auto_refresh_tooltip": "Refresh Tooltip For New Words",
    "default_expand_tooltip": "Expand Tooltip By Default",
    "default_expand_sentents_tooltip": "Expand Sentences By Default",
    "default_expand_capsule": "Expand Capsule By Default",
    "prefer_popup_above": "Prefer Popup Above",
    "selection_popup_prefer_down": "Selection Popup Prefer Down",
    "explosion_priority_mode": "Explosion Priority Mode",
    "tooltip_gap": "Gap Between Word and Tooltip",
    "selection_popup_gap": "Gap for Selection Popup",
    "device_pixel_ratio": "Tooltip Scale",
    "add_ai_translation": "Add AI Definition",

    // Hotkey Settings
    "shortcut_settings": "Hotkey Settings",
    "word_query": "Word Query",
    "copy_sentence": "Copy Sentence|👾TTS HIGHLIGHT",
    "analysis_window": "Popup Sentence Analysis",
    "side_panel": "Sidebar Sentence Analysis",

    // TTS Settings
    "text_speech_settings": "Text-to-Speech Settings",
    "word_tts": "Word Reading",
    "sentence_tts": "Sentence Reading",
    "auto_word_tts": "Auto-play word under mouse", // 添加英文翻译

    // 添加：YouTube 字幕插件翻译
    "youtube_caption_fix": "YouTube Caption Fix",
    "youtube_caption_fix_tooltip": "Attempt to fix YouTube caption display or positioning issues",
    "youtube_comma_sentencing": "Comma Sentencing",
    "youtube_bionic_reading": "Bionic Reading",
    "youtube_font_size": "Font Size",
    "youtube_font_family": "Font Family",
    "lingq_blocker": "LingqBlocker",
    "lingq_blocker_tooltip": "Automatically remove LingQ website modals and hide highlights",

    // 添加新快捷键翻译
    "word_status_0": "Word Status 0 (Unknown)",
    "word_status_1": "Word Status 1 (New)",
    "word_status_2": "Word Status 2 (Known)",
    "word_status_3": "Word Status 3 (Learning)",
    "word_status_4": "Word Status 4 (Ignore)",
    "word_status_5": "Word Status 5 (Marked)",
    "word_status_toggle": "Toggle Known/Unknown",

    // Highlight Language Settings
    "highlight_chinese": "Chinese",
    "highlight_japanese": "Japanese",
    "auto_detect_japanese_kanji": "Smart Detect Japanese Kanji",
    "auto_load_kuromoji_for_japanese": "Smart Detect Japanese Page and Auto Load Kuromoji",
    "use_kuromoji_tokenizer": "⚠️Use Kuromoji Globally (All Pages, +4s Load Time)",
    "highlight_korean": "Korean",
    "highlight_alphabetic": "Alphabetic",

    // Word Explosion Settings
    "word_explosion": "💥 Word Explosion",
    "word_explosion_tooltip": "Show all unknown words and their translations in a sentence",
    "word_explosion_trigger_mode": "Trigger Mode",
    "word_explosion_trigger_click": "Click to Trigger",
    "word_explosion_trigger_hover": "Hover to Trigger",
    "word_explosion_position_mode": "Popup Position Mode",
    "word_explosion_position_auto": "Auto Up/Down",
    "word_explosion_position_manual": "Manual Move",
    "word_explosion_font_size": "Explosion Popup Font Size",
    "word_explosion_prefer_up": "Prefer Popup Above",
    "word_explosion_layout": "Word Layout",
    "word_explosion_layout_vertical": "Vertical",
    "word_explosion_layout_horizontal": "Horizontal",
    "word_explosion_translation_count": "Word Translation Count",
    "explosion_sentence_translation_request_count": "Sentence Translation Request Count",
    "explosion_sentence_translation_request_hint": "Request AI translation independently, not dependent on word example sentences",
    "explosion_highlight_with_tts": "Trigger Word-by-Word Highlight (TTS)",
    "explosion_highlight_no_tts": "Trigger Word-by-Word Highlight (No TTS)",
    "explosion_highlight_speed": "Explosion Highlight Speed (ms/char)",
    "word_explosion_sentence_translation_count": "Sentence Translation Count",
    "word_explosion_count_all": "All",
    "show_explosion_sentence": "Show Explosion Original Sentence",
    "show_known_sentence_animation": "Show Known Sentence Animation",
    "word_explosion_highlight_sentence": "Highlight Current Explosion Sentence",
    "word_explosion_highlight_color": "Highlight Background Color",
    "word_explosion_highlight_color_hint": "Click color palette to select color, drag slider to adjust opacity",
    "word_explosion_highlight_opacity_label": "Opacity",
    "word_explosion_underline_enabled": "Enable Underline",
    "word_explosion_underline_style": "Underline Style",
    "word_explosion_underline_position": "Underline Position",
    "word_explosion_underline_color": "Underline Color",
    "word_explosion_underline_color_hint": "Click color palette to select color, drag slider to adjust opacity",
    "word_explosion_underline_opacity_label": "Opacity",
    "word_explosion_underline_thickness": "Underline Thickness (px)",
    "underline_style_solid": "Solid",
    "underline_style_wavy": "Wavy",
    "underline_style_dotted": "Dotted",
    "underline_position_bottom": "Bottom",
    "underline_position_top": "Top",
    "underline_position_both": "Both",
  },
  zh_TW: {
    "popupTitle": "設定",
    "basic_settings": "基礎設定",
    "word_highlight": "單字高亮",
    "word_highlight_tooltip": "啟用或停用外掛功能<br>可設定黑名單網站",
    "plugin_blacklist": "外掛黑名單網站",
    "default_day_websites": "預設日間模式網站",
    "default_night_websites": "預設夜間模式網址",
    "day_mode": "日間模式",
    "night_mode": "夜間模式",
    "close_tooltip": "關閉小視窗",
    "embed_other_websites": "嵌入其他網頁",
    "embed_other_websites_tooltip": "在網頁上顯示一個可拖動的視窗",
    "waifu_url": "請輸入要顯示的網站URL",
    "bionic_reading_tooltip": "提高閱讀效率<br>設定黑白名單",
    "bionic_reading_tooltip": " 亮詞首四分，減眸析之勞。<br>瞥目只一瞬，識形於瞬息。<br>極佔效能，長文慎用。",
    "font_selection": "字型選擇",
    "bionic_thanox": "Bionic & Thanox",
    "thanox_reading": "Thanox Reading",
    "thanox_processing_opacity": "處理中的透明值",
    "thanox_completed_opacity": "處理完成後的透明值",
    "thanox_word_speed": "單字消失速度",
    "thanox_fragment_effect": "🎆 碎片特效",
    "thanox_fragment_count": "碎片數量",
    "thanox_fragment_duration": "碎片動畫時長",
    "bionic_blacklist": "Bionic Blacklist Websites",
    "font_selection_auto": "auto (default)",
    "font_size_setting": "字型大小設定",
    "font_size_unit": "px",
    "clip_subtitles": "剪貼簿監聽字幕",
    "reading_ruler_tooltip": "琅嬛玉尺，助閱明眸。<br>極佔效能，長文慎用。",
    "reading_ruler_blacklist": "閱讀尺黑名單網站",
    "ruler_inverted_mode": "反色模式",
    "width_mode": "寬度模式",
    "auto_width": "自動寬度",
    "screen_width": "螢幕寬度",
    "custom_width": "自訂寬度",
    "ruler_height": "高度",
    "ruler_opacity": "透明度",
    "ruler_color": "顏色",
    "ai_translation_settings": "AI 翻譯設定",
    "auto_request_ai_translations": "自動請求AI釋義",
    "auto_add_ai_translations": "自動新增AI釋義",
    "auto_add_ai_translations_from_unknown": "自動新增AI釋義（未知/無釋義）",
    "auto_request_ai_translations_2": "自動請求第二個AI釋義",
    "auto_add_example_sentences": "自動新增例句",
    "tooltip_settings": "提示視窗設定",
    "click_only_tooltip": "僅點擊觸發小視窗",
    "auto_expand_tooltip": "自動展開未高亮單字的小視窗",
    "auto_close_tooltip": "滑鼠離開小視窗自動關閉",
    "auto_refresh_tooltip": "新單字重新整理小視窗",
    "default_expand_tooltip": "小視窗預設展開",
    "default_expand_sentents_tooltip": "例句預設展開",
    "default_expand_capsule": "膠囊預設展開",
    "prefer_popup_above": "優先向上彈出",
    "selection_popup_prefer_down": "選取文字彈窗優先預設向下彈出",
    "explosion_priority_mode": "爆炸優先模式",
    "tooltip_gap": "單字彈窗間隙",
    "device_pixel_ratio": "單字彈窗縮放",
    "shortcut_settings": "快速鍵設定",
    "word_query": "單字查詢",
    "copy_sentence": "👾複製句子|TTS高亮",
    "analysis_window": "彈視窗句子解析",
    "side_panel": "側邊欄句子解析",
    "text_speech_settings": "文字語音設定",
    "word_tts": "單字朗讀",
    "sentence_tts": "句子朗讀",
    "auto_word_tts": "自動播放滑鼠下單字",
    "youtube_caption_fix": "YouTube 字幕外掛",
    "youtube_caption_fix_tooltip": "嘗試修復 YouTube 字幕的顯示或定位問題",
    "youtube_comma_sentencing": "逗號分句",
    "youtube_bionic_reading": "仿生閱讀",
    "youtube_font_size": "字型大小",
    "youtube_font_family": "字型樣式",
    "lingq_blocker": "LingqBlocker",
    "lingq_blocker_tooltip": "自動刪除LingQ網站的彈窗和隱藏高亮",
    "word_status_0": "單字狀態 0 (未知)",
    "word_status_1": "單字狀態 1 (新)",
    "word_status_2": "單字狀態 2 (已知)",
    "word_status_3": "單字狀態 3 (學習中)",
    "word_status_4": "單字狀態 4 (忽略)",
    "word_status_5": "單字狀態 5 (標記)",
    "word_status_toggle": "切換已知/未知",
    "highlight_chinese": "中文",
    "highlight_japanese": "日語",
    "auto_detect_japanese_kanji": "智慧識別日文獨立漢字",
    "auto_load_kuromoji_for_japanese": "智慧判斷網頁是否為日語並自動啟動koromoji",
    "use_kuromoji_tokenizer": "⚠️全域使用kuromoji進行分詞，包括非日語頁面。所有頁面增加4s的載入時間，但會有稍微好一點的分詞效果",
    "highlight_korean": "韓文",
    "highlight_alphabetic": "拉丁語系(英法德等)",
    "word_explosion": "單字爆炸💥",
    "word_explosion_tooltip": "顯示句子中所有未知單字及其翻譯",
    "word_explosion_trigger_mode": "觸發模式",
    "word_explosion_trigger_click": "點擊觸發",
    "word_explosion_trigger_hover": "滑鼠懸停",
    "word_explosion_position_mode": "彈視窗位置模式",
    "word_explosion_position_auto": "自動上下",
    "word_explosion_position_manual": "手動移動",
    "word_explosion_font_size": "爆炸彈視窗字型大小",
    "word_explosion_prefer_up": "優先向上顯示",
    "word_explosion_layout": "單字佈局",
    "word_explosion_layout_vertical": "垂直排列",
    "word_explosion_layout_horizontal": "水平排列",
    "word_explosion_translation_count": "單字翻譯顯示數量",
    "explosion_sentence_translation_request_count": "句子翻譯請求數量",
    "explosion_sentence_translation_request_hint": "獨立請求AI翻譯，不依賴單字例句",
    "word_explosion_sentence_translation_count": "句子翻譯顯示數量",
    "word_explosion_count_all": "全部",
    "explosion_highlight_with_tts": "觸發逐詞高亮（TTS）",
    "explosion_highlight_no_tts": "觸發逐詞高亮（無TTS）",
    "explosion_highlight_speed": "爆炸視窗逐詞高亮速度 (ms/字元)",
    "show_explosion_sentence": "顯示爆炸原句",
    "show_known_sentence_animation": "已知句子展示動效圖",
    "word_explosion_highlight_sentence": "高亮目前爆炸的句子",
    "word_explosion_highlight_color": "高亮背景顏色",
    "word_explosion_highlight_color_hint": "點擊色盤選擇顏色，拖動滑桿調整透明度",
    "word_explosion_highlight_opacity_label": "透明度",
    "word_explosion_underline_enabled": "啟用底線",
    "word_explosion_underline_style": "底線樣式",
    "word_explosion_underline_position": "底線位置",
    "word_explosion_underline_color": "底線顏色",
    "word_explosion_underline_color_hint": "點擊色盤選擇顏色，拖動滑桿調整透明度",
    "word_explosion_underline_opacity_label": "透明度",
    "word_explosion_underline_thickness": "底線粗度 (px)",
    "underline_style_solid": "直線",
    "underline_style_wavy": "波浪線",
    "underline_style_dotted": "點線",
    "underline_position_bottom": "下",
    "underline_position_top": "上",
    "underline_position_both": "上+下",
  },
  de: {
        "popupTitle": "Einstellungen",
        "basic_settings": "Grundeinstellungen",
        "word_highlight": "Worthervorhebung",
        "word_highlight_tooltip": "Plugin-Funktionen aktivieren oder deaktivieren<br>Blacklist-Websites können festgelegt werden",
        "plugin_blacklist": "Plugin-Blacklist-Websites",
        "default_day_websites": "Standard-Websites für den Tagmodus",
        "default_night_websites": "Standard-Websites für den Nachtmodus",
        "day_mode": "Tagmodus",
        "night_mode": "Nachtmodus",
        "embed_other_websites": "In andere Seiten einbetten",
        "embed_other_websites_tooltip": "Ein ziehbares Fenster auf der Webseite anzeigen",
        "waifu_url": "Bitte geben Sie die URL der anzuzeigenden Website ein",
        "bionic_reading_tooltip": "Markieren Sie die ersten vier Wörter jedes Satzes.<br>Reduzieren Sie die Augenbelastung und verbessern Sie die Leseeffizienz.<br>Bei langen Texten mit Vorsicht verwenden.",
        "bionic_blacklist": "Bionic Blacklist-Websites",
        "bionic_thanox": "Bionic & Thanox",
        "thanox_reading": "Thanox Reading",
        "thanox_processing_opacity": "Verarbeitende Transparenz",
        "thanox_completed_opacity": "Abgeschlossene Transparenz",
        "thanox_word_speed": "Wortverblassungsgeschwindigkeit",
        "thanox_fragment_effect": "🎆 Fragmenteffekt",
        "thanox_fragment_count": "Fragmentanzahl",
        "thanox_fragment_duration": "Fragmentanimationsdauer",
        "font_selection": "Schriftauswahl",
        "font_selection_auto": "auto (Standard)",
        "font_size_setting": "Schriftgrößen Einstellung",
        "font_size_unit": "px",
        "clip_subtitles": "Zwischenablage auf Untertitel überwachen",
        "reading_ruler_tooltip": "Lesehilfe zur Fokussierung.<br>Ressourcenintensiv bei langen Texten.",
        "reading_ruler_blacklist": "Reading Ruler Blacklist-Websites",
        "ruler_inverted_mode": "Invertierter Modus",
        "width_mode": "Breitenmodus",
        "auto_width": "Automatische Breite",
        "screen_width": "Bildschirmbreite",
        "custom_width": "Benutzerdefinierte Breite",
        "ruler_height": "Höhe",
        "ruler_opacity": "Transparenz",
        "ruler_color": "Farbe",
        "ai_translation_settings": "AI-Übersetzungseinstellungen",
        "auto_request_ai_translations": "Automatische AI-Definitionen anfordern",
        "auto_add_ai_translations": "Automatische AI-Definitionen hinzufügen",
        "auto_add_ai_translations_from_unknown": "Automatische AI-Definitionen hinzufügen (Unbekannt/Nicht definiert)",
        "auto_request_ai_translations_2": "Zweite AI-Definition automatisch anfordern",
        "auto_add_example_sentences": "Automatische Beispielsätze hinzufügen",
        "tooltip_settings": "Tooltip-Einstellungen",
        "click_only_tooltip": "Nur bei Klick Tooltip",
        "auto_expand_tooltip": "Nicht hervorgehobene Wörter automatisch erweitern",
        "auto_close_tooltip": "Automatisch schließen, wenn die Maus den Bereich verlässt",
        "auto_refresh_tooltip": "Tooltip für neue Wörter aktualisieren",
        "default_expand_tooltip": "Tooltip standardmäßig erweitern",
        "default_expand_sentents_tooltip": "Sätze standardmäßig erweitern",
        "default_expand_capsule": "Kapsel standardmäßig erweitern",
        "prefer_popup_above": "Popup bevorzugt oben",
        "explosion_priority_mode": "Explosions-Prioritätsmodus",
        "tooltip_gap": "Abstand zwischen Wort und Tooltip",
        "device_pixel_ratio": "Tooltip-Skalierung",
        "shortcut_settings": "Hotkey-Einstellungen",
        "word_query": "Wortabfrage",
        "copy_sentence": "Satz in Zwischenablage kopieren|👾TTS HIGHLIGHT",
        "analysis_window": "Popup-Satzanalyse",
        "side_panel": "Seitenleiste-Satzanalyse",
        "text_speech_settings": "Text-zu-Sprache-Einstellungen",
        "word_tts": "Wort vorlesen",
        "sentence_tts": "Satz vorlesen",
        "auto_word_tts": "Wort unter Maus automatisch abspielen", // 添加德文翻译
        // 添加：YouTube 字幕插件翻译
        "youtube_caption_fix": "YouTube-Untertitelkorrektur",
        "youtube_caption_fix_tooltip": "Versucht, Anzeige- oder Positionierungsprobleme von YouTube-Untertiteln zu beheben", // 添加新快捷键翻译
        "youtube_comma_sentencing": "Komma-Satzbildung",
        "youtube_bionic_reading": "Bionisches Lesen",
        "youtube_font_size": "Schriftgröße",
        "youtube_font_family": "Schriftfamilie",
        "lingq_blocker": "LingqBlocker",
        "lingq_blocker_tooltip": "LingQ-Website-Modals automatisch entfernen und Hervorhebungen ausblenden",
        "word_status_0": "Wortstatus 0 (Unbekannt)",
        "word_status_1": "Wortstatus 1 (Neu)",
        "word_status_2": "Wortstatus 2 (Bekannt)",
        "word_status_3": "Wortstatus 3 (Lernen)",
        "word_status_4": "Wortstatus 4 (Ignorieren)",
        "word_status_5": "Wortstatus 5 (Markiert)",
        "word_status_toggle": "Bekannt/Unbekannt umschalten",

        // Hervorhebung Spracheinstellungen
        "highlight_chinese": "Chinesisch",
        "highlight_japanese": "Japanisch ",
        "auto_detect_japanese_kanji": "Intelligente Erkennung japanischer Kanji",
        "auto_load_kuromoji_for_japanese": "Intelligente Erkennung japanischer Seiten und automatisches Laden von Kuromoji",
        "use_kuromoji_tokenizer": "⚠️Kuromoji global verwenden (Alle Seiten, +4s Ladezeit)",
        "highlight_korean": "Koreanisch",
        "highlight_alphabetic": "Alphabetisch",

        // Wort-Explosionseinstellungen
        "word_explosion": "Wort-Explosion💥",
        "word_explosion_tooltip": "Zeige alle unbekannten Wörter und ihre Übersetzungen in einem Satz",
        "word_explosion_trigger_mode": "Auslösemodus",
        "word_explosion_trigger_click": "Klick zum Auslösen",
        "word_explosion_trigger_hover": "Hover zum Auslösen",
        "word_explosion_position_mode": "Popup-Position-Modus",
        "word_explosion_position_auto": "Auto Oben/Unten",
        "word_explosion_position_manual": "Manuell verschieben",
        "word_explosion_font_size": "Explosions-Popup-Schriftgröße",
        "word_explosion_prefer_up": "Popup bevorzugt oben",
        "word_explosion_layout": "Wort-Layout",
        "word_explosion_layout_vertical": "Vertikal",
        "word_explosion_layout_horizontal": "Horizontal",
        "word_explosion_translation_count": "Wort-Übersetzungsanzahl",
        "explosion_sentence_translation_request_count": "Satz-Übersetzungsanfrage-Anzahl",
        "explosion_sentence_translation_request_hint": "AI-Übersetzung unabhängig anfordern, nicht abhängig von Wortbeispielsätzen",
        "explosion_highlight_with_tts": "Wort-für-Wort-Hervorhebung auslösen (TTS)",
        "word_explosion_highlight_sentence": "Aktuellen Explosionssatz hervorheben",
        "word_explosion_highlight_color": "Hervorhebungshintergrundfarbe",
        "word_explosion_highlight_color_hint": "Klicken Sie auf die Farbpalette, um eine Farbe auszuwählen, ziehen Sie den Schieberegler, um die Transparenz anzupassen",
        "word_explosion_highlight_opacity_label": "Transparenz",
        "word_explosion_underline_enabled": "Unterstreichen aktivieren",
        "word_explosion_underline_style": "Unterstrichstil",
        "word_explosion_underline_position": "Unterstrichposition",
        "word_explosion_underline_color": "Unterstrichfarbe",
        "word_explosion_underline_color_hint": "Klicken Sie auf die Farbpalette, um eine Farbe auszuwählen, ziehen Sie den Schieberegler, um die Transparenz anzupassen",
        "word_explosion_underline_opacity_label": "Transparenz",
        "word_explosion_underline_thickness": "Unterstrichstärke (px)",
        "underline_style_solid": "Durchgezogen",
        "underline_style_wavy": "Wellenförmig",
        "underline_style_dotted": "Gepunktet",
        "underline_position_bottom": "Unten",
        "underline_position_top": "Oben",
        "underline_position_both": "Oben+Unten",
      },
    fr: {
        "popupTitle": "Paramètres",
        "basic_settings": "Paramètres de base",
        "word_highlight": "Surlignage des mots",
        "word_highlight_tooltip": "Activer ou désactiver les fonctionnalités du plugin<br>Les sites Web de la liste noire peuvent être définis",
        "plugin_blacklist": "Sites Web de la liste noire des plugins",
        "default_day_websites": "Sites Web en mode jour par défaut",
        "default_night_websites": "Sites Web en mode nuit par défaut",
        "day_mode": "Mode jour",
        "night_mode": "Mode nuit",
        "embed_other_websites": "Intégrer dans d'autres pages",
        "embed_other_websites_tooltip": "Afficher une fenêtre déplaçable sur la page Web",
        "waifu_url": "Veuillez saisir l'URL du site web à afficher",
        "bionic_reading_tooltip": "Mettez en surbrillance les quatre premiers mots de chaque phrase.<br>Réduisez la fatigue oculaire et améliorez l'efficacité de la lecture.<br>Utiliser avec prudence pour les textes longs.",
        "bionic_blacklist": "Sites Web de la liste noire Bionic",
        "bionic_thanox": "Bionic & Thanox",
        "thanox_reading": "Thanox Reading",
        "thanox_processing_opacity": "Opacité en traitement",
        "thanox_completed_opacity": "Opacité terminée",
        "thanox_word_speed": "Vitesse de disparition des mots",
        "thanox_fragment_effect": "🎆 Effet de fragments",
        "thanox_fragment_count": "Nombre de fragments",
        "thanox_fragment_duration": "Durée de l'animation des fragments",
        "font_selection": "Sélection de la police",
        "font_selection_auto": "auto (par défaut)",
        "font_size_setting": "Paramètre de taille de police",
        "font_size_unit": "px",
        "clip_subtitles": "Surveiller le presse-papiers pour les sous-titres",
        "reading_ruler_tooltip": "Aide à la lecture pour aider à la concentration.<br>Gourmand en ressources pour les textes longs.",
        "reading_ruler_blacklist": "Sites Web de la liste noire de Reading Ruler",
        "ruler_inverted_mode": "Mode inversé",
        "width_mode": "Mode de largeur",
        "auto_width": "Largeur automatique",
        "screen_width": "Largeur de l'écran",
        "custom_width": "Largeur personnalisée",
        "ruler_height": "Hauteur",
        "ruler_opacity": "Opacité",
        "ruler_color": "Couleur",
        "ai_translation_settings": "Paramètres de traduction AI",
        "auto_request_ai_translations": "Demander automatiquement les définitions AI",
        "auto_add_ai_translations": "Ajouter automatiquement les définitions AI",
        "auto_add_ai_translations_from_unknown": "Ajouter automatiquement les définitions AI (Inconnu/Aucune définition)",
        "auto_request_ai_translations_2": "Demander automatiquement la deuxième définition AI",
        "auto_add_example_sentences": "Ajouter automatiquement des exemples de phrases",
        "tooltip_settings": "Paramètres de l'infobulle",
        "click_only_tooltip": "Infobulle uniquement au clic",
        "auto_expand_tooltip": "Développer automatiquement les mots non surlignés",
        "auto_close_tooltip": "Fermer automatiquement lorsque la souris espace de la zone",
        "auto_refresh_tooltip": "Actualiser l'infobulle pour les nouveaux mots",
        "default_expand_tooltip": "Développer l'infobulle par défaut",
        "default_expand_sentents_tooltip": "Développer les phrases par défaut",
        "default_expand_capsule": "Développer la capsule par défaut",
        "prefer_popup_above": "Préférer le popup en haut",
        "explosion_priority_mode": "Mode priorité d'explosion",
        "tooltip_gap": "Espace entre le mot et l'infobulle",
        "device_pixel_ratio": "Échelle de l'infobulle",
        "shortcut_settings": "Paramètres des raccourcis clavier",
        "word_query": "Requête de mot",
        "copy_sentence": "Copier la phrase dans le presse-papiers|👾TTS HIGHLIGHT",
        "analysis_window": "Analyse phrase popup",
        "side_panel": "Analyse phrase barre latérale",
        "text_speech_settings": "Paramètres de synthèse vocale",
        "word_tts": "Lecture de mots",
        "sentence_tts": "Lecture de phrases",
        "auto_word_tts": "Lecture automatique du mot sous la souris", // 添加法文翻译
        // 添加：YouTube 字幕插件翻译
        "youtube_caption_fix": "Correction des sous-titres YouTube",
        "youtube_caption_fix_tooltip": "Tente de corriger les problèmes d'affichage ou de positionnement des sous-titres YouTube", // 添加新快捷键翻译
        "youtube_comma_sentencing": "Segmentation par virgule",
        "youtube_bionic_reading": "Lecture bionique",
        "youtube_font_size": "Taille de police",
        "youtube_font_family": "Famille de police",
        "lingq_blocker": "LingqBlocker",
        "lingq_blocker_tooltip": "Supprimer automatiquement les modals du site LingQ et masquer les surbrillances",
        "word_status_0": "Statut mot 0 (Inconnu)",
        "word_status_1": "Statut mot 1 (Nouveau)",
        "word_status_2": "Statut mot 2 (Connu)",
        "word_status_3": "Statut mot 3 (Apprentissage)",
        "word_status_4": "Statut mot 4 (Ignorer)",
        "word_status_5": "Statut mot 5 (Marqué)",
        "word_status_toggle": "Basculer Connu/Inconnu",

        // Paramètres de surbrillance de langue
        "highlight_chinese": "Chinois ",
        "highlight_japanese": "Japonais ",
        "auto_detect_japanese_kanji": "Détection intelligente des kanji japonais",
        "highlight_korean": "Coréen",
        "highlight_alphabetic": "Alphabétique",

        // Paramètres d'explosion de mots
        "word_explosion": "Explosion de mots💥",
        "word_explosion_tooltip": "Afficher tous les mots inconnus et leurs traductions dans une phrase",
        "word_explosion_trigger_mode": "Mode de déclenchement",
        "word_explosion_trigger_click": "Clic pour déclencher",
        "word_explosion_trigger_hover": "Survol pour déclencher",
        "word_explosion_position_mode": "Mode de position du popup",
        "word_explosion_position_auto": "Auto Haut/Bas",
        "word_explosion_position_manual": "Déplacement manuel",
        "word_explosion_font_size": "Taille de police du popup d'explosion",
        "word_explosion_prefer_up": "Préférer le popup en haut",
        "word_explosion_layout": "Disposition des mots",
        "word_explosion_layout_vertical": "Vertical",
        "word_explosion_layout_horizontal": "Horizontal",
        "word_explosion_translation_count": "Nombre de traductions de mots",
        "explosion_sentence_translation_request_count": "Nombre de demandes de traduction de phrases",
        "explosion_sentence_translation_request_hint": "Demander la traduction AI indépendamment, sans dépendre des exemples de mots",
        "explosion_highlight_with_tts": "Déclencher la mise en évidence mot par mot (TTS)",
        "explosion_highlight_no_tts": "Déclencher la mise en évidence mot par mot (sans TTS)",
        "explosion_highlight_speed": "Vitesse de mise en évidence de l'explosion (ms/caractère)",
        "show_explosion_sentence": "Afficher la phrase d'explosion originale",
        "show_known_sentence_animation": "Afficher l'animation de phrase connue",
        "word_explosion_highlight_sentence": "Mettre en surbrillance la phrase d'explosion actuelle",
        "word_explosion_highlight_color": "Couleur de fond de surbrillance",
        "word_explosion_highlight_color_hint": "Cliquez sur la palette de couleurs pour sélectionner une couleur, faites glisser le curseur pour ajuster l'opacité",
        "word_explosion_highlight_opacity_label": "Opacité",
        "word_explosion_underline_enabled": "Activer le soulignement",
        "word_explosion_underline_style": "Style de soulignement",
        "word_explosion_underline_position": "Position du soulignement",
        "word_explosion_underline_color": "Couleur du soulignement",
        "word_explosion_underline_color_hint": "Cliquez sur la palette de couleurs pour sélectionner une couleur, faites glisser le curseur pour ajuster l'opacité",
        "word_explosion_underline_opacity_label": "Opacité",
        "word_explosion_underline_thickness": "Épaisseur du soulignement (px)",
        "underline_style_solid": "Solide",
        "underline_style_wavy": "Ondulé",
        "underline_style_dotted": "Pointillé",
        "underline_position_bottom": "Bas",
        "underline_position_top": "Haut",
        "underline_position_both": "Haut+Bas",
      },
    es: {
        "popupTitle": "Configuración",
        "basic_settings": "Ajustes básicos",
        "word_highlight": "Resaltado de palabras",
        "word_highlight_tooltip": "Habilitar o deshabilitar las funciones del plugin<br>Se pueden configurar sitios web en la lista negra",
        "plugin_blacklist": "Sitios web en la lista negra del plugin",
        "default_day_websites": "Sitios web predeterminados en modo día",
        "default_night_websites": "Sitios web predeterminados en modo noche",
        "day_mode": "Modo día",
        "night_mode": "Modo noche",
        "embed_other_websites": "Incrustar en otras páginas",
        "embed_other_websites_tooltip": "Mostrar una ventana arrastrable en la página web",
        "waifu_url": "Por favor, introduzca la URL del sitio web a mostrar",
        "bionic_reading_tooltip": "Resalte las primeras cuatro palabras de cada oración.<br>Reduzca la fatiga visual y mejore la eficiencia de la lectura.<br>Usar con precaución para textos largos.",
        "bionic_blacklist": "Sitios web en lista negra de Bionic",
        "bionic_thanox": "Bionic & Thanox",
        "thanox_reading": "Thanox Reading",
        "thanox_processing_opacity": "Opacidad en procesamiento",
        "thanox_completed_opacity": "Opacidad completada",
        "thanox_word_speed": "Velocidad de desaparición de palabras",
        "thanox_fragment_effect": "🎆 Efecto de fragmentos",
        "thanox_fragment_count": "Cantidad de fragmentos",
        "thanox_fragment_duration": "Duración de animación de fragmentos",
        "font_selection": "Selección de fuente",
        "font_selection_auto": "auto (predeterminado)",
        "font_size_setting": "Configuración de tamaño de fuente",
        "font_size_unit": "px",
        "clip_subtitles": "Monitorear el portapapeles para subtítulos",
        "reading_ruler_tooltip": "Guía de lectura para ayudar a enfocar.<br>Consume muchos recursos para textos largos.",
        "reading_ruler_blacklist": "Sitios web en lista negra de Reading Ruler",
        "ruler_inverted_mode": "Modo invertido",
        "width_mode": "Modo de ancho",
        "auto_width": "Ancho automático",
        "screen_width": "Ancho de pantalla",
        "custom_width": "Ancho personalizado",
        "ruler_height": "Altura",
        "ruler_opacity": "Opacidad",
        "ruler_color": "Color",
        "ai_translation_settings": "Configuración de traducción de IA",
        "auto_request_ai_translations": "Solicitar definiciones de IA automáticamente",
        "auto_add_ai_translations": "Agregar definiciones de IA automáticamente",
        "auto_add_ai_translations_from_unknown": "Agregar definiciones de IA automáticamente (Desconocido/Ninguna definición)",
        "auto_request_ai_translations_2": "Solicitar automáticamente la segunda definición de IA",
        "auto_add_example_sentences": "Agregar oraciones de ejemplo automáticamente",
        "tooltip_settings": "Configuración de la información sobre herramientas",
        "click_only_tooltip": "Información sobre herramientas solo con clic",
        "auto_expand_tooltip": "Expandir automáticamente palabras no resaltadas",
        "auto_close_tooltip": "Cerrar automáticamente cuando el ratón sale del área",
        "auto_refresh_tooltip": "Actualizar información sobre herramientas para palabras nuevas",
        "default_expand_tooltip": "Expandir información sobre herramientas por defecto",
        "default_expand_sentents_tooltip": "Expandir oraciones por defecto",
        "prefer_popup_above": "Preferir popup arriba",
        "explosion_priority_mode": "Modo de prioridad de explosión",
        "tooltip_gap": "Espacio entre palabra y tooltip",
        "device_pixel_ratio": "Escala del tooltip",
        "shortcut_settings": "Configuración de teclas de acceso rápido",
        "word_query": "Consulta de palabras",
        "copy_sentence": "Copiar oración al portapapeles|👾TTS HIGHLIGHT",
        "analysis_window": "Análisis frase popup",
        "side_panel": "Análisis frase barra lateral",
        "text_speech_settings": "Configuración de texto a voz",
        "word_tts": "Lectura de palabras",
        "sentence_tts": "Lectura de oraciones",
        "auto_word_tts": "Reproducción automática de palabra bajo el ratón", // 添加西班牙文翻译
        // 添加：YouTube 字幕插件翻译
        "youtube_caption_fix": "Corrección de subtítulos de YouTube",
        "youtube_caption_fix_tooltip": "Intenta corregir problemas de visualización o posicionamiento de los subtítulos de YouTube", // 添加新快捷键翻译
        "youtube_comma_sentencing": "Segmentación por coma",
        "youtube_bionic_reading": "Lectura biónica",
        "youtube_font_size": "Tamaño de fuente",
        "youtube_font_family": "Familia de fuente",
        "lingq_blocker": "LingqBlocker",
        "lingq_blocker_tooltip": "Eliminar automáticamente los modales del sitio LingQ y ocultar resaltados",
        "word_status_0": "Estado palabra 0 (Desconocido)",
        "word_status_1": "Estado palabra 1 (Nuevo)",
        "word_status_2": "Estado palabra 2 (Conocido)",
        "word_status_3": "Estado palabra 3 (Aprendiendo)",
        "word_status_4": "Estado palabra 4 (Ignorar)",
        "word_status_5": "Estado palabra 5 (Marcado)",
        "word_status_toggle": "Alternar Conocido/Desconocido",

        // Configuración de resaltado de idioma
        "highlight_chinese": "Chino",
        "highlight_japanese": "Japonés",
        "auto_detect_japanese_kanji": "Detección inteligente de kanji japoneses",
        "auto_load_kuromoji_for_japanese": "Detección inteligente de páginas japonesas y carga automática de Kuromoji",
        "use_kuromoji_tokenizer": "⚠️Usar Kuromoji globalmente (Todas las páginas, +4s tiempo de carga)",
        "highlight_korean": "Coreano",
        "highlight_alphabetic": "Alfabético",

        // Configuración de explosión de palabras
        "word_explosion": "Explosión de palabras💥",
        "word_explosion_tooltip": "Mostrar todas las palabras desconocidas y sus traducciones en una oración",
        "word_explosion_trigger_mode": "Modo de activación",
        "word_explosion_trigger_click": "Clic para activar",
        "word_explosion_trigger_hover": "Al pasar el cursor",
        "word_explosion_position_mode": "Modo de posición del popup",
        "word_explosion_position_auto": "Auto Arriba/Abajo",
        "word_explosion_position_manual": "Movimiento manual",
        "word_explosion_font_size": "Tamaño de fuente del popup de explosión",
        "word_explosion_prefer_up": "Preferir popup arriba",
        "word_explosion_layout": "Disposición de palabras",
        "word_explosion_layout_vertical": "Vertical",
        "word_explosion_layout_horizontal": "Horizontal",
        "word_explosion_translation_count": "Cantidad de traducciones de palabras",
        "explosion_sentence_translation_request_count": "Cantidad de solicitudes de traducción de oraciones",
        "explosion_sentence_translation_request_hint": "Solicitar traducción AI independientemente, sin depender de ejemplos de palabras",
        "explosion_highlight_with_tts": "Activar resaltado palabra por palabra (TTS)",
        "explosion_highlight_no_tts": "Activar resaltado palabra por palabra (sin TTS)",
        "explosion_highlight_speed": "Velocidad de resaltado de explosión (ms/caracter)",
        "show_explosion_sentence": "Mostrar frase de explosión original",
        "show_known_sentence_animation": "Mostrar animación de frase conocida",
        "word_explosion_highlight_sentence": "Resaltar frase de explosión actual",
        "word_explosion_highlight_color": "Color de fondo de resaltado",
        "word_explosion_highlight_color_hint": "Haga clic en la paleta de colores para seleccionar un color, arrastre el control deslizante para ajustar la opacidad",
        "word_explosion_highlight_opacity_label": "Opacidad",
        "word_explosion_underline_enabled": "Activar subrayado",
        "word_explosion_underline_style": "Estilo de subrayado",
        "word_explosion_underline_position": "Posición del subrayado",
        "word_explosion_underline_color": "Color del subrayado",
        "word_explosion_underline_color_hint": "Haga clic en la paleta de colores para seleccionar un color, arrastre el control deslizante para ajustar la opacidad",
        "word_explosion_underline_opacity_label": "Opacidad",
        "word_explosion_underline_thickness": "Grosor del subrayado (px)",
        "underline_style_solid": "Sólido",
        "underline_style_wavy": "Ondulado",
        "underline_style_dotted": "Punteado",
        "underline_position_bottom": "Abajo",
        "underline_position_top": "Arriba",
        "underline_position_both": "Arriba+Abajo",
      },
    ja: {
          "popupTitle": "設定",
          "basic_settings": "基本設定",
          "word_highlight": "単語のハイライト",
          "word_highlight_tooltip": "プラグインの機能を有効または無効にする<br>ブラックリストのウェブサイトを設定できます",
          "plugin_blacklist": "プラグインのブラックリストのウェブサイト",
          "default_day_websites": "デフォルトのデイモードのウェブサイト",
          "default_night_websites": "デフォルトのナイトモードのウェブサイト",
          "day_mode": "デイモード",
          "night_mode": "ナイトモード",
          "embed_other_websites": "他のページに埋め込む",
          "embed_other_websites_tooltip": "ウェブページにドラッグ可能なウィンドウを表示する",
          "waifu_url": "表示するウェブサイトのURLを入力してください",
          "bionic_reading_tooltip": "各文の最初の4つの単語をハイライトします。<br>目の疲れを軽減し、読書効率を向上させます。<br>長いテキストには注意して使用してください。",
          "bionic_blacklist": "Bionicブラックリストのウェブサイト",
          "bionic_thanox": "Bionic & Thanox",
          "thanox_reading": "Thanox Reading",
          "thanox_processing_opacity": "処理中の透明度",
          "thanox_completed_opacity": "処理完了後の透明度",
          "thanox_word_speed": "単語消失速度",
          "thanox_fragment_effect": "🎆 フラグメント効果",
          "thanox_fragment_count": "フラグメント数",
          "thanox_fragment_duration": "フラグメントアニメーション時間",
          "font_selection": "フォントの選択",
          "font_selection_auto": "auto (デフォルト)",
          "font_size_setting": "フォントサイズ設定",
          "font_size_unit": "px",
          "clip_subtitles": "クリップボードを監視して字幕を取得",
          "reading_ruler_tooltip": "焦点を合わせるための読書ガイド。<br>長いテキストではリソースを大量に消費します。",
          "reading_ruler_blacklist": "Reading Rulerブラックリストのウェブサイト",
          "ruler_inverted_mode": "反転モード",
          "width_mode": "幅モード",
          "auto_width": "自動幅",
          "screen_width": "画面幅",
          "custom_width": "カスタム幅",
          "ruler_height": "高さ",
          "ruler_opacity": "透明度",
          "ruler_color": "色",
          "ai_translation_settings": "AI 翻訳設定",
          "auto_request_ai_translations": "AI 定義を自動的にリクエストする",
          "auto_add_ai_translations": "AI 定義を自動的に追加する",
          "auto_add_ai_translations_from_unknown": "AI 定義を自動的に追加する（不明/定義なし）",
          "auto_request_ai_translations_2": "2番目のAI定義を自動的にリクエストする",
          "auto_add_example_sentences": "例文を自動的に追加する",
          "tooltip_settings": "ツールチップ設定",
          "click_only_tooltip": "クリックのみのツールチップ",
          "auto_expand_tooltip": "ハイライトされていない単語を自動的に展開する",
          "auto_close_tooltip": "マウスが領域を離れると自動的に閉じる",
          "auto_refresh_tooltip": "新しい単語のツールチップを更新する",
          "default_expand_tooltip": "デフォルトでツールチップを展開する",
          "default_expand_sentents_tooltip": "デフォルトで文を展開する",
          "prefer_popup_above": "ポップアップを優先的に上に表示",
          "explosion_priority_mode": "爆発優先モード",
          "tooltip_gap": "単語とツールチップの間隔",
          "device_pixel_ratio": "ツールチップのスケール",
          "shortcut_settings": "ホットキー設定",
          "word_query": "単語のクエリ",
          "copy_sentence": "文をクリップボードにコピー|👾TTS HIGHLIGHT",
          "analysis_window": "ポップアップ文解析",
          "side_panel": "サイドバー文解析",
          "text_speech_settings": "テキスト読み上げ設定",
          "word_tts": "単語の読み上げ",
          "sentence_tts": "文の読み上げ",
          "auto_word_tts": "マウス下の単語を自動再生", // 添加日文翻译
          // 添加：YouTube 字幕插件翻译
          "youtube_caption_fix": "YouTube 字幕修正",
          "youtube_caption_fix_tooltip": "YouTube 字幕の表示または位置の問題を修正しようとします", // 添加新快捷键翻译
          "youtube_comma_sentencing": "コンマによる文分割",
          "youtube_bionic_reading": "バイオニックリーディング",
          "youtube_font_size": "フォントサイズ",
          "youtube_font_family": "フォントファミリー",
          "lingq_blocker": "LingqBlocker",
          "lingq_blocker_tooltip": "LingQサイトのモーダルを自動的に削除し、ハイライトを非表示にする",
          "word_status_0": "単語ステータス 0 (未知)",
          "word_status_1": "単語ステータス 1 (新規)",
          "word_status_2": "単語ステータス 2 (既知)",
          "word_status_3": "単語ステータス 3 (学習中)",
          "word_status_4": "単語ステータス 4 (無視)",
          "word_status_5": "単語ステータス 5 (マーク)",
          "word_status_toggle": "既知/未知を切り替え",

          // ハイライト言語設定
          "highlight_chinese": "中国語",
          "highlight_japanese": "日本語",
          "auto_detect_japanese_kanji": "日本語の漢字を自動検出",
          "auto_load_kuromoji_for_japanese": "日本語ページを自動検出してKuromojiを読み込む",
          "use_kuromoji_tokenizer": "⚠️Kuromojiをグローバルに使用（全ページ、+4秒読み込み時間）",
          "highlight_korean": "韓国語",
          "highlight_alphabetic": "アルファベット",

          // 単語爆発設定
          "word_explosion": "単語爆発💥",
          "word_explosion_tooltip": "文内のすべての未知の単語とその翻訳を表示する",
          "word_explosion_trigger_mode": "トリガーモード",
          "word_explosion_trigger_click": "クリックでトリガー",
          "word_explosion_trigger_hover": "ホバーでトリガー",
          "word_explosion_position_mode": "ポップアップ位置モード",
          "word_explosion_position_auto": "自動上/下",
          "word_explosion_position_manual": "手動移動",
          "word_explosion_font_size": "爆発ポップアップのフォントサイズ",
          "word_explosion_prefer_up": "ポップアップを上に優先",
          "word_explosion_layout": "単語レイアウト",
          "word_explosion_layout_vertical": "垂直",
          "word_explosion_layout_horizontal": "水平",
          "word_explosion_translation_count": "単語翻訳数",
          "explosion_sentence_translation_request_count": "文翻訳リクエスト数",
          "explosion_sentence_translation_request_hint": "AI翻訳を独立してリクエストし、単語例文に依存しない",
          "explosion_highlight_with_tts": "単語ごとのハイライトをトリガー（TTS）",
          "explosion_highlight_no_tts": "単語ごとのハイライトをトリガー（TTSなし）",
          "explosion_highlight_speed": "爆発ハイライト速度 (ms/文字)",
          "show_explosion_sentence": "爆発元の文を表示",
          "show_known_sentence_animation": "既知の文のアニメーションを表示",
          "word_explosion_highlight_sentence": "現在の爆発文をハイライト",
          "word_explosion_highlight_color": "ハイライト背景色",
          "word_explosion_highlight_color_hint": "カラーパレットをクリックして色を選択し、スライダーをドラッグして不透明度を調整します",
          "word_explosion_highlight_opacity_label": "不透明度",
          "word_explosion_underline_enabled": "下線を有効にする",
          "word_explosion_underline_style": "下線スタイル",
          "word_explosion_underline_position": "下線の位置",
          "word_explosion_underline_color": "下線の色",
          "word_explosion_underline_color_hint": "カラーパレットをクリックして色を選択し、スライダーをドラッグして不透明度を調整します",
          "word_explosion_underline_opacity_label": "不透明度",
          "word_explosion_underline_thickness": "下線の太さ (px)",
          "underline_style_solid": "直線",
          "underline_style_wavy": "波線",
          "underline_style_dotted": "点線",
          "underline_position_bottom": "下",
          "underline_position_top": "上",
          "underline_position_both": "上+下",
      },
    ko: {
          "popupTitle": "설정",
          "basic_settings": "기본 설정",
          "word_highlight": "단어 강조",
          "word_highlight_tooltip": "플러그인 기능 활성화 또는 비활성화<br>블랙리스트 웹사이트 설정 가능",
          "plugin_blacklist": "플러그인 블랙리스트 웹사이트",
          "default_day_websites": "기본 주간 모드 웹사이트",
          "default_night_websites": "기본 야간 모드 웹사이트",
          "day_mode": "주간 모드",
          "night_mode": "야간 모드",
          "embed_other_websites": "다른 페이지에 삽입",
          "embed_other_websites_tooltip": "웹페이지에 드래그 가능한 창 표시",
          "waifu_url": "표시할 웹사이트 URL을 입력하세요",
          "bionic_reading_tooltip": "각 문장의 처음 네 단어를 강조 표시합니다.<br>눈의 피로를 줄이고 읽기 효율성을 향상시킵니다.<br>긴 텍스트에는 주의해서 사용하십시오.",
          "bionic_blacklist": "Bionic 블랙리스트 웹사이트",
          "bionic_thanox": "Bionic & Thanox",
          "thanox_reading": "Thanox Reading",
          "thanox_processing_opacity": "처리 중 투명도",
          "thanox_completed_opacity": "처리 완료 후 투명도",
          "thanox_word_speed": "단어 사라짐 속도",
          "thanox_fragment_effect": "🎆 조각 효과",
          "thanox_fragment_count": "조각 수",
          "thanox_fragment_duration": "조각 애니메이션 지속 시간",
          "font_selection": "글꼴 선택",
          "font_selection_auto": "auto (기본값)",
          "font_size_setting": "글꼴 크기 설정",
          "font_size_unit": "px",
          "clip_subtitles": "자막을 위해 클립보드 모니터링",
          "reading_ruler_tooltip": "집중을 돕는 읽기 가이드.<br>긴 텍스트에는 리소스 소모가 많습니다.",
          "reading_ruler_blacklist": "Reading Ruler 블랙리스트 웹사이트",
          "ruler_inverted_mode": "반전 모드",
          "width_mode": "너비 모드",
          "auto_width": "자동 너비",
          "screen_width": "화면 너비",
          "custom_width": "사용자 정의 너비",
          "ruler_height": "높이",
          "ruler_opacity": "투명도",
          "ruler_color": "색상",
          "ai_translation_settings": "AI 번역 설정",
          "auto_request_ai_translations": "AI 정의 자동 요청",
          "auto_add_ai_translations": "AI 정의 자동 추가",
          "auto_add_ai_translations_from_unknown": "AI 정의 자동 추가 (알 수 없음/정의 없음)",
          "auto_request_ai_translations_2": "두 번째 AI 정의 자동 요청",
          "auto_add_example_sentences": "예제 문장 자동 추가",
          "tooltip_settings": "툴팁 설정",
          "click_only_tooltip": "클릭 전용 툴팁",
          "auto_expand_tooltip": "강조 표시되지 않은 단어 자동 확장",
          "auto_close_tooltip": "마우스가 영역을 벗어나면 자동 닫기",
          "auto_refresh_tooltip": "새 단어에 대한 툴팁 새로 고침",
          "default_expand_tooltip": "기본적으로 툴팁 확장",
          "default_expand_sentents_tooltip": "기본적으로 문장 확장",
          "prefer_popup_above": "팝업을 위쪽으로 우선 표시",
          "explosion_priority_mode": "폭발 우선 모드",
          "tooltip_gap": "단어와 툴팁 사이 간격",
          "device_pixel_ratio": "툴팁 스케일",
          "shortcut_settings": "단축키 설정",
          "word_query": "단어 쿼리",
          "copy_sentence": "클립보드에 문장 복사|👾TTS HIGHLIGHT",
          "analysis_window": "팝업 문장 분석",
          "side_panel": "사이드바 문장 분석",
          "text_speech_settings": "텍스트 음성 변환 설정",
          "word_tts": "단어 읽기",
          "sentence_tts": "문장 읽기",
          "auto_word_tts": "마우스 아래 단어 자동 재생", // 添加韩文翻译
          // 添加：YouTube 字幕插件翻译
          "youtube_caption_fix": "YouTube 자막 수정",
          "youtube_caption_fix_tooltip": "YouTube 자막 표시 또는 위치 지정 문제를 수정하려고 시도합니다", // 添加新快捷键翻译
          "youtube_comma_sentencing": "쉼표로 문장 분할",
          "youtube_bionic_reading": "바이오닉 리딩",
          "youtube_font_size": "글꼴 크기",
          "youtube_font_family": "글꼴 패밀리",
          "lingq_blocker": "LingqBlocker",
          "lingq_blocker_tooltip": "LingQ 웹사이트의 모달을 자동으로 제거하고 하이라이트를 숨깁니다",
          "word_status_0": "단어 상태 0 (모르는 단어)",
          "word_status_1": "단어 상태 1 (새 단어)",
          "word_status_2": "단어 상태 2 (아는 단어)",
          "word_status_3": "단어 상태 3 (학습 중)",
          "word_status_4": "단어 상태 4 (무시)",
          "word_status_5": "단어 상태 5 (표시)",
          "word_status_toggle": "아는/모르는 단어 전환",

          // 강조 표시 언어 설정
          "highlight_chinese": "중국어 ",
          "highlight_japanese": "일본어 ",
          "auto_detect_japanese_kanji": "일본어 한자 자동 감지",
          "highlight_korean": "한국어",
          "highlight_alphabetic": "알파벳",

          // 단어 폭발 설정
          "word_explosion": "단어 폭발💥",
          "word_explosion_tooltip": "문장 내 모르는 단어와 그 번역을 표시합니다",
          "word_explosion_trigger_mode": "트리거 모드",
          "word_explosion_trigger_click": "클릭하여 트리거",
          "word_explosion_trigger_hover": "호버하여 트리거",
          "word_explosion_position_mode": "팝업 위치 모드",
          "word_explosion_position_auto": "자동 위/아래",
          "word_explosion_position_manual": "수동 이동",
          "word_explosion_font_size": "폭발 팝업 글꼴 크기",
          "word_explosion_prefer_up": "팝업 위쪽 우선",
          "word_explosion_layout": "단어 레이아웃",
          "word_explosion_layout_vertical": "수직",
          "word_explosion_layout_horizontal": "수평",
          "word_explosion_translation_count": "단어 번역 수",
          "explosion_sentence_translation_request_count": "문장 번역 요청 수",
          "explosion_sentence_translation_request_hint": "단어 예문에 의존하지 않고 AI 번역을 독립적으로 요청합니다",
          "explosion_highlight_with_tts": "단어별 강조 트리거 (TTS)",
          "explosion_highlight_no_tts": "단어별 강조 트리거 (TTS 없음)",
          "explosion_highlight_speed": "폭발 강조 속도 (ms/문자)",
          "show_explosion_sentence": "폭발 원문 표시",
          "show_known_sentence_animation": "알려진 문장 애니메이션 표시",
          "word_explosion_highlight_sentence": "현재 폭발 문장 강조",
          "word_explosion_highlight_color": "강조 배경색",
          "word_explosion_highlight_color_hint": "색상 팔레트를 클릭하여 색상을 선택하고 슬라이더를 드래그하여 불투명도를 조정합니다",
          "word_explosion_highlight_opacity_label": "불투명도",
          "word_explosion_underline_enabled": "밑줄 활성화",
          "word_explosion_underline_style": "밑줄 스타일",
          "word_explosion_underline_position": "밑줄 위치",
          "word_explosion_underline_color": "밑줄 색상",
          "word_explosion_underline_color_hint": "색상 팔레트를 클릭하여 색상을 선택하고 슬라이더를 드래그하여 불투명도를 조정합니다",
          "word_explosion_underline_opacity_label": "불투명도",
          "word_explosion_underline_thickness": "밑줄 두께 (px)",
          "underline_style_solid": "직선",
          "underline_style_wavy": "물결선",
          "underline_style_dotted": "점선",
          "underline_position_bottom": "아래",
          "underline_position_top": "위",
          "underline_position_both": "위+아래",
      },
    ru: {
          "popupTitle": "Настройки",
          "basic_settings": "Основные настройки",
          "word_highlight": "Подсветка слов",
          "word_highlight_tooltip": "Включить или отключить функции плагина<br>Можно установить черные списки веб-сайтов",
          "plugin_blacklist": "Черные списки веб-сайтов плагина",
          "default_day_websites": "Веб-сайты дневного режима по умолчанию",
          "default_night_websites": "Веб-сайты ночного режима по умолчанию",
          "day_mode": "Дневной режим",
          "night_mode": "Ночной режим",
          "embed_other_websites": "Встроить в другие страницы",
          "embed_other_websites_tooltip": "Отображать перетаскиваемое окно на веб-странице",
          "waifu_url": "Пожалуйста, введите URL-адрес веб-сайта для отображения",
          "bionic_reading_tooltip": "Выделите первые четыре слова каждого предложения.<br>Уменьшите нагрузку на глаза и повысьте эффективность чтения.<br>Используйте с осторожностью для длинных текстов.",
          "bionic_blacklist": "Черные списки веб-сайтов Bionic",
          "font_selection": "Выбор шрифта",
          "clip_subtitles": "Мониторинг буфера обмена для субтитров",
          "reading_ruler_tooltip": "Направляющая для чтения, помогающая сфокусироваться.<br>Ресурсоемко для длинных текстов.",
          "reading_ruler_blacklist": "Черные списки веб-сайтов Reading Ruler",
          "ruler_inverted_mode": "Инвертированный режим",
          "width_mode": "Режим ширины",
          "auto_width": "Автоматическая ширина",
          "screen_width": "Ширина экрана",
          "custom_width": "Пользовательская ширина",
          "ruler_height": "Высота",
          "ruler_opacity": "Прозрачность",
          "ruler_color": "Цвет",
          "ai_translation_settings": "Настройки перевода AI",
          "auto_request_ai_translations": "Автоматический запрос определений AI",
          "auto_add_ai_translations": "Автоматическое добавление определений AI",
          "auto_add_ai_translations_from_unknown": "Автоматическое добавление определений AI (Неизвестно/Нет определения)",
          "auto_request_ai_translations_2": "Автоматический запрос второго определения AI",
          "auto_add_example_sentences": "Автоматическое добавление примеров предложений",
          "tooltip_settings": "Настройки всплывающих подсказок",
          "click_only_tooltip": "Всплывающая подсказка только по клику",
          "auto_expand_tooltip": "Автоматическое развертывание невыделенных слов",
          "auto_close_tooltip": "Автоматическое закрытие при выходе мыши из области",
          "auto_refresh_tooltip": "Обновление всплывающей подсказки для новых слов",
          "default_expand_tooltip": "Развернуть всплывающую подсказку по умолчанию",
          "default_expand_sentents_tooltip": "Развернуть предложения по умолчанию",
          "prefer_popup_above": "Предпочитать всплывающее окно сверху",
          "explosion_priority_mode": "Режим приоритета взрыва",
          "tooltip_gap": "Расстояние между словом и всплывающей подсказкой",
          "device_pixel_ratio": "Масштаб всплывающей подсказки",
          "shortcut_settings": "Настройки горячих клавиш",
          "word_query": "Запрос слова",
          "copy_sentence": "Копировать предложение в буфер обмена|👾TTS HIGHLIGHT",
          "analysis_window": "Всплывающий анализ предложений",
          "side_panel": "Анализ предложений в боковой панели",
          "text_speech_settings": "Настройки преобразования текста в речь",
          "word_tts": "Чтение слов",
          "sentence_tts": "Чтение предложений",
          "auto_word_tts": "Автовоспроизведение слова под мышью", // 添加俄文翻译
          // 添加：YouTube 字幕插件翻译
          "youtube_caption_fix": "Исправление субтитров YouTube",
          "youtube_caption_fix_tooltip": "Попытка исправить проблемы с отображением или позиционированием субтитров YouTube", // 添加新快捷键翻译
          "youtube_comma_sentencing": "Разбивка по запятой",
          "youtube_bionic_reading": "Бионическое чтение",
          "youtube_font_size": "Размер шрифта",
          "youtube_font_family": "Семейство шрифтов",
          "lingq_blocker": "LingqBlocker",
          "lingq_blocker_tooltip": "Автоматически удалять модальные окна сайта LingQ и скрывать подсветку",
          "word_status_0": "Статус слова 0 (Неизвестное)",
          "word_status_1": "Статус слова 1 (Новое)",
          "word_status_2": "Статус слова 2 (Известное)",
          "word_status_3": "Статус слова 3 (Изучается)",
          "word_status_4": "Статус слова 4 (Игнорировать)",
          "word_status_5": "Статус слова 5 (Отмечено)",
          "word_status_toggle": "Переключить Известное/Неизвестное",

          // Настройки подсветки языка
          "highlight_chinese": "Китайский",
          "highlight_japanese": "Японский",
          "auto_detect_japanese_kanji": "Умное определение японских кандзи",
          "auto_load_kuromoji_for_japanese": "Умное определение японских страниц и автоматическая загрузка Kuromoji",
          "use_kuromoji_tokenizer": "⚠️Использовать Kuromoji глобально (Все страницы, +4s время загрузки)",
          "highlight_korean": "Корейский",
          "highlight_alphabetic": "Алфавитный",

          // Настройки взрыва слов
          "word_explosion": "Взрыв слов💥",
          "word_explosion_tooltip": "Показать все неизвестные слова и их переводы в предложении",
          "word_explosion_trigger_mode": "Режим триггера",
          "word_explosion_trigger_click": "Клик для триггера",
          "word_explosion_trigger_hover": "Наведение для триггера",
          "word_explosion_position_mode": "Режим позиции всплывающего окна",
          "word_explosion_position_auto": "Авто Сверху/Снизу",
          "word_explosion_position_manual": "Ручное перемещение",
          "word_explosion_font_size": "Размер шрифта всплывающего окна взрыва",
          "word_explosion_prefer_up": "Предпочитать всплывающее окно сверху",
          "word_explosion_layout": "Макет слов",
          "word_explosion_layout_vertical": "Вертикальный",
          "word_explosion_layout_horizontal": "Горизонтальный",
          "word_explosion_translation_count": "Количество переводов слов",
          "explosion_sentence_translation_request_count": "Количество запросов перевода предложений",
          "explosion_sentence_translation_request_hint": "Запрашивать перевод AI независимо, не завися от примеров слов",
          "explosion_highlight_with_tts": "Триггер подсветки слово за словом (TTS)",
          "explosion_highlight_no_tts": "Триггер подсветки слово за словом (без TTS)",
          "explosion_highlight_speed": "Скорость подсветки взрыва (ms/символ)",
          "show_explosion_sentence": "Показать исходное предложение взрыва",
          "show_known_sentence_animation": "Показать анимацию известного предложения",
          "word_explosion_highlight_sentence": "Подсветить текущее предложение взрыва",
          "word_explosion_highlight_color": "Цвет фона подсветки",
          "word_explosion_highlight_color_hint": "Нажмите на палитру цветов, чтобы выбрать цвет, перетащите ползунок, чтобы настроить прозрачность",
          "word_explosion_highlight_opacity_label": "Прозрачность",
          "word_explosion_underline_enabled": "Включить подчеркивание",
          "word_explosion_underline_style": "Стиль подчеркивания",
          "word_explosion_underline_position": "Положение подчеркивания",
          "word_explosion_underline_color": "Цвет подчеркивания",
          "word_explosion_underline_color_hint": "Нажмите на палитру цветов, чтобы выбрать цвет, перетащите ползунок, чтобы настроить прозрачность",
          "word_explosion_underline_opacity_label": "Прозрачность",
          "word_explosion_underline_thickness": "Толщина подчеркивания (px)",
          "underline_style_solid": "Сплошной",
          "underline_style_wavy": "Волнистый",
          "underline_style_dotted": "Пунктирный",
          "underline_position_bottom": "Снизу",
          "underline_position_top": "Сверху",
          "underline_position_both": "Сверху+Снизу",
    },
    it: {
          "popupTitle": "Impostazioni",
          "basic_settings": "Impostazioni di base",
          "word_highlight": "Evidenziazione parole",
          "word_highlight_tooltip": "Abilita o disabilita le funzionalità del plugin<br>È possibile impostare siti web in blacklist",
          "plugin_blacklist": "Siti web in blacklist del plugin",
          "default_day_websites": "Siti web in modalità giorno predefinita",
          "default_night_websites": "Siti web in modalità notte predefinita",
          "day_mode": "Modalità giorno",
          "night_mode": "Modalità notte",
          "embed_other_websites": "Incorpora in altre pagine",
          "embed_other_websites_tooltip": "Mostra una finestra trascinabile sulla pagina web",
          "waifu_url": "Inserisci l'URL del sito web da visualizzare",
          "bionic_reading_tooltip": "Evidenzia le prime quattro parole di ogni frase.<br>Riduci l'affaticamento degli occhi e migliora l'efficienza di lettura.<br>Utilizzare con cautela per testi lunghi.",
          "bionic_blacklist": "Siti web in blacklist di Bionic",
          "font_selection": "Selezione del carattere",
          "clip_subtitles": "Monitora gli appunti per i sottotitoli",
          "reading_ruler_tooltip": "Guida alla lettura per aiutare la concentrazione.<br>Richiede molte risorse per testi lunghi.",
          "reading_ruler_blacklist": "Siti web in blacklist di Reading Ruler",
          "ruler_inverted_mode": "Modalità invertita",
          "width_mode": "Modalità larghezza",
          "auto_width": "Larghezza automatica",
          "screen_width": "Larghezza dello schermo",
          "custom_width": "Larghezza personalizzata",
          "ruler_height": "Altezza",
          "ruler_opacity": "Opacità",
          "ruler_color": "Colore",
          "ai_translation_settings": "Impostazioni di traduzione AI",
          "auto_request_ai_translations": "Richiedi automaticamente definizioni AI",
          "auto_add_ai_translations": "Aggiungi automaticamente definizioni AI",
          "auto_add_ai_translations_from_unknown": "Aggiungi automaticamente definizioni AI (Sconosciuto/Nessuna definizione)",
          "auto_request_ai_translations_2": "Richiedi automaticamente la seconda definizione AI",
          "auto_add_example_sentences": "Aggiungi automaticamente frasi di esempio",
          "tooltip_settings": "Impostazioni tooltip",
          "click_only_tooltip": "Tooltip solo al clic",
          "auto_expand_tooltip": "Espandi automaticamente parole non evidenziate",
          "auto_close_tooltip": "Chiudi automaticamente quando il mouse esce dall'area",
          "auto_refresh_tooltip": "Aggiorna tooltip per nuove parole",
          "default_expand_tooltip": "Espandi tooltip per impostazione predefinita",
          "default_expand_sentents_tooltip": "Espandi frasi per impostazione predefinita",
          "prefer_popup_above": "Preferire popup sopra",
          "shortcut_settings": "Impostazioni tasti di scelta rapida",
          "word_query": "Richiesta parola",
          "copy_sentence": "Copia frase negli appunti|👾TTS HIGHLIGHT",
          "analysis_window": "Analisi frase popup",
          "side_panel": "Analisi frase barra laterale",
          "text_speech_settings": "Impostazioni di sintesi vocale",
          "word_tts": "Lettura parole",
          "sentence_tts": "Lettura frasi",
          "auto_word_tts": "Riproduzione automatica parola sotto il mouse", // 添加意大利文翻译
          // 添加：YouTube 字幕插件翻译
          "youtube_caption_fix": "Correzione sottotitoli YouTube",
          "youtube_caption_fix_tooltip": "Tenta di correggere problemi di visualizzazione o posizionamento dei sottotitoli di YouTube", // 添加新快捷键翻译
          "youtube_comma_sentencing": "Segmentazione per virgola",
          "youtube_bionic_reading": "Lettura bionica",
          "youtube_font_size": "Dimensione carattere",
          "youtube_font_family": "Famiglia di caratteri",
          "lingq_blocker": "LingqBlocker",
          "lingq_blocker_tooltip": "Rimuovi automaticamente le modali del sito LingQ e nascondi l'evidenziazione",
          "word_status_0": "Stato parola 0 (Sconosciuto)",
          "word_status_1": "Stato parola 1 (Nuovo)",
          "word_status_2": "Stato parola 2 (Conosciuto)",
          "word_status_3": "Stato parola 3 (In apprendimento)",
          "word_status_4": "Stato parola 4 (Ignora)",
          "word_status_5": "Stato parola 5 (Marcato)",
          "word_status_toggle": "Alterna Conosciuto/Sconosciuto",

          // Impostazioni lingua evidenziazione
          "highlight_chinese": "Cinese",
          "highlight_japanese": "Giapponese",
          "auto_detect_japanese_kanji": "Rilevamento intelligente dei Kanji giapponesi",
          "auto_load_kuromoji_for_japanese": "Rileva automaticamente le pagine giapponesi e carica Kuromoji",
          "use_kuromoji_tokenizer": "⚠️Usa Kuromoji globalmente (Tutte le pagine, +4s tempo di caricamento)",
          "highlight_korean": "Coreano",
          "highlight_alphabetic": "Alfabetico",

          // Impostazioni esplosione parole
          "word_explosion": "Esplosione parole💥",
          "word_explosion_tooltip": "Mostra tutte le parole sconosciute e le loro traduzioni in una frase",
          "word_explosion_trigger_mode": "Modalità attivazione",
          "word_explosion_trigger_click": "Clic per attivare",
          "word_explosion_trigger_hover": "Hover per attivare",
          "word_explosion_position_mode": "Modalità posizione popup",
          "word_explosion_position_auto": "Auto Sopra/Sotto",
          "word_explosion_position_manual": "Spostamento manuale",
          "word_explosion_font_size": "Dimensione carattere popup esplosione",
          "word_explosion_prefer_up": "Preferisci popup sopra",
          "word_explosion_layout": "Layout parole",
          "word_explosion_layout_vertical": "Verticale",
          "word_explosion_layout_horizontal": "Orizzontale",
          "word_explosion_translation_count": "Numero traduzioni parole",
          "explosion_sentence_translation_request_count": "Numero richieste traduzione frasi",
          "explosion_sentence_translation_request_hint": "Richiedi traduzione AI indipendentemente, senza dipendere da esempi di parole",
          "explosion_highlight_with_tts": "Attiva evidenziazione parola per parola (TTS)",
          "explosion_highlight_no_tts": "Attiva evidenziazione parola per parola (senza TTS)",
          "explosion_highlight_speed": "Velocità evidenziazione esplosione (ms/carattere)",
          "show_explosion_sentence": "Mostra frase di esplosione originale",
          "show_known_sentence_animation": "Mostra animazione frase conosciuta",
          "word_explosion_highlight_sentence": "Evidenzia frase di esplosione corrente",
          "word_explosion_highlight_color": "Colore sfondo evidenziazione",
          "word_explosion_highlight_color_hint": "Fai clic sulla tavolozza dei colori per selezionare un colore, trascina il cursore per regolare l'opacità",
          "word_explosion_highlight_opacity_label": "Opacità",
          "word_explosion_underline_enabled": "Abilita sottolineatura",
          "word_explosion_underline_style": "Stile sottolineatura",
          "word_explosion_underline_position": "Posizione sottolineatura",
          "word_explosion_underline_color": "Colore sottolineatura",
          "word_explosion_underline_color_hint": "Fai clic sulla tavolozza dei colori per selezionare un colore, trascina il cursore per regolare l'opacità",
          "word_explosion_underline_opacity_label": "Opacità",
          "word_explosion_underline_thickness": "Spessore sottolineatura (px)",
          "underline_style_solid": "Solido",
          "underline_style_wavy": "Ondulato",
          "underline_style_dotted": "Puntinato",
          "underline_position_bottom": "Sotto",
          "underline_position_top": "Sopra",
          "underline_position_both": "Sopra+Sotto",
    }
};

// 语言切换函数
function applyLanguage(lang) {
  // 确保语言存在，默认为中文
  // 确保语言存在，默认为中文
  const currentLang = i18n[lang] ? lang : 'zh';

  // 获取所有需要翻译的元素
  const elements = document.querySelectorAll('[data-i18n]');

  // 应用翻译
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    // 检查是否有附加后缀
    const suffix = el.getAttribute('data-i18n-suffix') || '';

    if (i18n[currentLang] && i18n[currentLang][key]) {
      // 根据元素类型设置内容
      if (el.tagName === 'LABEL' || el.tagName === 'DIV' || el.tagName === 'BUTTON' || el.tagName === 'SPAN'
          || el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3' || el.tagName === 'H4' || el.tagName === 'H5' || el.tagName === 'H6' || el.tagName === 'SMALL') {
        el.innerHTML = i18n[currentLang][key] + suffix;
      } else if (el.tagName === 'INPUT' && (el.getAttribute('type') === 'text' || el.getAttribute('type') === 'search')) {
        el.placeholder = i18n[currentLang][key] + suffix;
      } else if (el.tagName === 'OPTION') {
        el.textContent = i18n[currentLang][key] + suffix;
      }
    }
  });
}

// 在DOMContentLoaded中添加语言切换按钮和初始化语言
document.addEventListener('DOMContentLoaded', function() {
  // 获取语言选择器
  const languageSelector = document.getElementById('ui-language');

  // 监听语言选择变化
  languageSelector.addEventListener('change', function(e) {
    const selectedLang = e.target.value;
    // 保存用户选择的语言
    chrome.storage.local.set({ userLanguage: selectedLang }, function() {
      // 应用语言
      applyLanguage(selectedLang);

      // 向其他页面广播语言变化（确保options页面也能同步）
      chrome.runtime.sendMessage({
        action: 'languageChanged',
        language: selectedLang
      });
    });
  });

  // 初始化语言设置
  chrome.storage.local.get('userLanguage', function(result) {
    const userLang = result.userLanguage || (navigator.language.startsWith('zh') ? 'zh' : 'en');
    // 设置选择器的当前值
    languageSelector.value = userLang;

    //set
    chrome.storage.local.set({ userLanguage: userLang });

    // 应用语言
    applyLanguage(userLang);
  });

  // 需要扩展 i18n 对象以包含所有支持的语言
  // 这里只展示了增加的部分，实际实现需要添加所有语言
});

// 添加消息监听器，接收来自options页面的语言变化通知
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'languageChanged') {
    // 更新语言选择器
    const languageSelector = document.getElementById('ui-language');
    if (languageSelector) {
      languageSelector.value = request.language;
    }
    // 应用新语言
    applyLanguage(request.language);
  }
});

// 添加：处理插件设置按钮点击事件
const openOptionsPageBtn = document.getElementById('openOptionsPageBtn');
if (openOptionsPageBtn) {
  openOptionsPageBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      console.error("chrome.runtime.openOptionsPage API not available.");
      // 可以提供一个备选方案，比如打开一个新标签页
      // window.open(chrome.runtime.getURL('options.html'));
    }
  });
}

// // 保存设置
// function saveSettings() {
//   // 实现保存所有设置的逻辑...
// }

// // 在需要的时候调用保存函数，例如在popup关闭时
// window.addEventListener('beforeunload', saveSettings);

// // 确保国际化在 DOM 加载后应用
// document.addEventListener('DOMContentLoaded', function() {
//   // 获取保存的语言设置
//   chrome.storage.local.get('uiLanguage', function(result) {
//     const savedLang = result.uiLanguage || 'zh'; // 默认中文
//     applyLanguage(savedLang);
//     // 更新下拉菜单的选中项
//     const langSelector = document.getElementById('ui-language');
//     if (langSelector) {
//       langSelector.value = savedLang;
//     }
//   });
// });

// --- 新增：单词状态快捷键处理 ---

// 获取默认设置（确保在需要时可用）
let wordStatusKeyDefaults = {};
chrome.storage.local.get('wordStatusKeys', function(result) {
  wordStatusKeyDefaults = result.wordStatusKeys || { 0: '`', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', toggle: ' ', addAITranslation: 'tab', closeTooltip: 'capslock' };
  // 加载状态
  loadWordStatusKeys();
});


// 保存单词状态快捷键函数
function saveWordStatusKeys() {
  chrome.storage.local.get('wordStatusKeys', function(result) {
    const keys = result.wordStatusKeys || { ...wordStatusKeyDefaults }; // 使用当前默认值或存储值

    // 从 dataset 获取 0-5 的键值
    for (let i = 0; i <= 5; i++) {
      const inputElement = document.getElementById(`wordStatus${i}Key`);
      if (inputElement) {
        keys[i.toString()] = inputElement.dataset.key || wordStatusKeyDefaults[i.toString()];
      }
    }
    // 从 dataset 获取切换键的值
    const toggleInputElement = document.getElementById('wordStatusToggleKey');
    if (toggleInputElement) {
         keys.toggle = toggleInputElement.dataset.key || wordStatusKeyDefaults.toggle;
    }

    // 从 dataset 获取添加AI释义键的值
    const addAITranslationElement = document.getElementById('addAITranslationBtn');
    if (addAITranslationElement) {
         keys.addAITranslation = addAITranslationElement.dataset.key || wordStatusKeyDefaults.addAITranslation;
         console.log("保存添加AI释义键:", keys.addAITranslation); // 添加日志以便调试
    }

    // 从 dataset 获取关闭小窗键的值
    const closeTooltipElement = document.getElementById('closeTooltipBtn');
    if (closeTooltipElement) {
         keys.closeTooltip = closeTooltipElement.dataset.key || wordStatusKeyDefaults.closeTooltip;
         console.log("保存关闭小窗键:", keys.closeTooltip); // 添加日志以便调试
    }

    chrome.storage.local.set({ wordStatusKeys: keys }, function() {
      if (chrome.runtime.lastError) {
        console.error("保存wordStatusKeys时出错:", chrome.runtime.lastError);
      } else {
        console.log("wordStatusKeys保存成功:", keys);
      }
    });
  });
}

// 加载单词状态快捷键函数
function loadWordStatusKeys() {
    chrome.storage.local.get('wordStatusKeys', function(result) {
      const keys = result.wordStatusKeys || { ...wordStatusKeyDefaults };
      console.log("加载的wordStatusKeys:", keys); // 添加日志以便调试

      // 设置 0-5 的 placeholder 和 dataset.key
      for (let i = 0; i <= 5; i++) {
          const inputElement = document.getElementById(`wordStatus${i}Key`);
          if (inputElement) {
              const key = keys[i.toString()] || wordStatusKeyDefaults[i.toString()];
              inputElement.dataset.key = key; // 存储实际键值
              if (key === ' ') {
                  inputElement.placeholder = 'Space';
              } else if (key && key.length === 1) {
                  inputElement.placeholder = key.toUpperCase(); // 显示大写或符号
              } else {
                 inputElement.placeholder = wordStatusKeyDefaults[i.toString()].toUpperCase(); // fallback to default display
                 inputElement.dataset.key = wordStatusKeyDefaults[i.toString()];
              }
          }
      }

      // 特殊处理切换键 (Space)
      const toggleKeyInput = document.getElementById('wordStatusToggleKey');
      if (toggleKeyInput) {
          const toggleKey = keys.toggle || wordStatusKeyDefaults.toggle;
          toggleKeyInput.dataset.key = toggleKey; // 存储实际键值
          if (toggleKey === ' ') {
              toggleKeyInput.placeholder = 'Space';
          } else if (toggleKey && toggleKey.length === 1) {
              toggleKeyInput.placeholder = toggleKey.toUpperCase();
          } else {
             toggleKeyInput.placeholder = 'Space'; // fallback
             toggleKeyInput.dataset.key = ' ';
          }
      }

      // 特殊处理添加AI释义键 (Tab)
      const addAITranslationInput = document.getElementById('addAITranslationBtn');
      if (addAITranslationInput) {
          const addAITranslationKey = keys.addAITranslation || wordStatusKeyDefaults.addAITranslation;
          console.log("加载的AI释义键:", addAITranslationKey); // 添加日志以便调试

          // 确保键值有效
          let validKey = addAITranslationKey;
          let displayKey = '';

          if (addAITranslationKey === 'tab') {
              displayKey = 'Tab';
          } else if (addAITranslationKey === ' ') {
              displayKey = 'Space';
          } else if (addAITranslationKey && addAITranslationKey.length === 1) {
              displayKey = addAITranslationKey.toUpperCase();
          } else {
              // 无效键值，使用默认值
              validKey = 'tab';
              displayKey = 'Tab';
          }

          // 更新UI和数据
          addAITranslationInput.dataset.key = validKey;
          addAITranslationInput.placeholder = displayKey;

          // 如果键值被修正，保存回存储
          if (validKey !== addAITranslationKey) {
              keys.addAITranslation = validKey;
              chrome.storage.local.set({ wordStatusKeys: keys }, function() {
                  console.log("已修正并保存AI释义键:", validKey);
              });
          }
      }

      // 特殊处理关闭小窗键 (CapsLock)
      const closeTooltipInput = document.getElementById('closeTooltipBtn');
      if (closeTooltipInput) {
          const closeTooltipKey = keys.closeTooltip || wordStatusKeyDefaults.closeTooltip;
          console.log("加载的关闭小窗键:", closeTooltipKey); // 添加日志以便调试

          // 确保键值有效
          let validKey = closeTooltipKey;
          let displayKey = '';

          if (closeTooltipKey === 'capslock') {
              displayKey = 'CapsLock';
          } else if (closeTooltipKey === ' ') {
              displayKey = 'Space';
          } else if (closeTooltipKey === 'tab') {
              displayKey = 'Tab';
          } else if (closeTooltipKey && closeTooltipKey.length === 1) {
              displayKey = closeTooltipKey.toUpperCase();
          } else {
              // 无效键值，使用默认值
              validKey = 'capslock';
              displayKey = 'CapsLock';
          }

          // 更新UI和数据
          closeTooltipInput.dataset.key = validKey;
          closeTooltipInput.placeholder = displayKey;

          // 如果键值被修正，保存回存储
          if (validKey !== closeTooltipKey) {
              keys.closeTooltip = validKey;
              chrome.storage.local.set({ wordStatusKeys: keys }, function() {
                  console.log("已修正并保存关闭小窗键:", validKey);
              });
          }
      }
  });
}

// DOMContentLoaded 后执行加载和添加监听器
document.addEventListener('DOMContentLoaded', function() {
    // 确保默认值已加载后再加载状态和添加监听器
    chrome.storage.local.get('wordStatusKeys', function(result) {
      wordStatusKeyDefaults = result.wordStatusKeys || { 0: '`', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', toggle: ' ', addAITranslation: 'tab', closeTooltip: 'capslock' };
      loadWordStatusKeys(); // 再次加载以确保UI正确

      // 为 0-5 和 toggle 添加 keydown 监听器 (它们有自己的保存逻辑)
      for (let i = 0; i <= 5; i++) {
          setupKeydownListener(`wordStatus${i}Key`); // 不传 storageKey，内部会通过 startsWith 判断
      }
      setupKeydownListener('wordStatusToggleKey'); // 不传 storageKey

      // 新增：为其他快捷键按钮添加 keydown 监听器，并明确传入 storageKey
      setupKeydownListener('wordQueryBtn', 'wordQueryKey');
      setupKeydownListener('copySentenceBtn', 'copySentenceKey');
      setupKeydownListener('analysisWindowBtn', 'analysisWindowKey');
      setupKeydownListener('sidePanelBtn', 'sidePanelKey');
      // 添加AI释义快捷键
      setupKeydownListener('addAITranslationBtn', 'addAITranslationKey');
      // 添加关闭小窗快捷键
      setupKeydownListener('closeTooltipBtn');

    });
});

// 辅助函数：为指定的输入框ID设置 keydown 监听器
// 修改：增加 storageKey 参数，用于非 wordStatus 的快捷键
function setupKeydownListener(elementId, storageKey = null) {
    const inputElement = document.getElementById(elementId);
    if (inputElement) {
        inputElement.addEventListener('keydown', function(e) {
            e.preventDefault(); // 阻止默认输入行为
            let key = '';
            let displayKey = '';

            if (e.code === 'Space') {
                key = ' ';
                displayKey = 'Space';
            } else if (e.code === 'Tab') {
                key = 'tab';
                displayKey = 'Tab';
            } else if (e.code === 'CapsLock') {
                key = 'capslock';
                displayKey = 'CapsLock';
            } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) { // 只允许单个非修饰键字符
                key = e.key.toLowerCase();
                displayKey = key; // 直接显示按下的键，不大写
            } else {
                // 忽略其他键 (如 Shift, Ctrl 等)
                return;
            }

            this.placeholder = displayKey;
            this.dataset.key = key; // 更新存储的实际键值

            console.log(`按键设置: ${elementId} => ${key} (显示为: ${displayKey})`);

            // 根据 elementId 或 storageKey 决定保存哪个 key
            if (elementId === 'addAITranslationBtn') {
                // 特殊处理添加AI释义按钮
                chrome.storage.local.get('wordStatusKeys', function(result) {
                    const keys = result.wordStatusKeys || { ...wordStatusKeyDefaults };
                    keys.addAITranslation = key;
                    chrome.storage.local.set({ wordStatusKeys: keys }, function() {
                        console.log("已更新AI释义快捷键:", key);
                    });
                });
            } else if (elementId === 'closeTooltipBtn') {
                // 特殊处理关闭小窗按钮
                chrome.storage.local.get('wordStatusKeys', function(result) {
                    const keys = result.wordStatusKeys || { ...wordStatusKeyDefaults };
                    keys.closeTooltip = key;
                    chrome.storage.local.set({ wordStatusKeys: keys }, function() {
                        console.log("已更新关闭小窗快捷键:", key);
                    });
                });
            } else if (elementId.startsWith('wordStatus')) {
                saveWordStatusKeys(); // 保存所有单词状态快捷键
            } else if (storageKey) { // 如果传入了 storageKey
                // 保存单个快捷键
                const setting = {};
                setting[storageKey] = key;
                chrome.storage.local.set(setting, function() {
                    if (chrome.runtime.lastError) {
                        console.error(`Error saving ${storageKey}:`, chrome.runtime.lastError);
                    } else {
                        console.log(`已保存快捷键 ${storageKey}:`, key);
                    }
                });
            } else {
                console.error("Could not determine storage key for elementId:", elementId);
            }
        });

        // 添加失去焦点时的处理：如果 dataset.key 无效，则恢复默认
        inputElement.addEventListener('blur', function() {
            let currentKey = this.dataset.key;
            // 检查当前 key 是否有效（单个字符或空格或tab）
            const isValidKey = currentKey && (currentKey === ' ' || currentKey === 'tab' || currentKey.length === 1);

            if (!isValidKey) {
                let defaultKey = '';
                let shouldSave = false; // 标记是否需要保存恢复的值

                if (elementId === 'addAITranslationBtn') {
                    defaultKey = 'tab';
                } else if (elementId === 'closeTooltipBtn') {
                    defaultKey = 'capslock';
                } else if (elementId.startsWith('wordStatus')) {
                    const statusIndex = elementId.match(/\d+|Toggle/)[0];
                    defaultKey = wordStatusKeyDefaults[statusIndex === 'Toggle' ? 'toggle' : statusIndex];
                } else if (storageKey) { // 使用传入的 storageKey 来确定默认值
                    // 获取这些键的默认值
                    switch (storageKey) {
                        case 'wordQueryKey': defaultKey = 'q'; break;
                        case 'copySentenceKey': defaultKey = 'w'; break;
                        case 'analysisWindowKey': defaultKey = 'e'; break;
                        case 'sidePanelKey': defaultKey = 'r'; break;
                        case 'addAITranslationKey': defaultKey = 'tab'; break;
                        default: defaultKey = ' '; // 未知 storageKey 的回退
                    }
                } else {
                    defaultKey = ' '; // 无法确定 storageKey 时的回退
                }

                // 如果当前 key 和 默认 key 不一致，才进行恢复和保存
                if (this.dataset.key !== defaultKey) {
                    this.dataset.key = defaultKey;
                    shouldSave = true;
                }

                // 更新 placeholder
                if (defaultKey === ' ') {
                    this.placeholder = 'Space';
                } else if (defaultKey === 'tab') {
                    this.placeholder = 'Tab';
                } else if (defaultKey === 'capslock') {
                    this.placeholder = 'CapsLock';
                } else {
                    this.placeholder = defaultKey;
                }

                // 保存恢复后的值 (如果需要)
                if (shouldSave) {
                    if (elementId === 'addAITranslationBtn') {
                        chrome.storage.local.get('wordStatusKeys', function(result) {
                            const keys = result.wordStatusKeys || { ...wordStatusKeyDefaults };
                            keys.addAITranslation = defaultKey;
                            chrome.storage.local.set({ wordStatusKeys: keys });
                        });
                    } else if (elementId === 'closeTooltipBtn') {
                        chrome.storage.local.get('wordStatusKeys', function(result) {
                            const keys = result.wordStatusKeys || { ...wordStatusKeyDefaults };
                            keys.closeTooltip = defaultKey;
                            chrome.storage.local.set({ wordStatusKeys: keys });
                        });
                    } else if (elementId.startsWith('wordStatus')) {
                        saveWordStatusKeys();
                    } else if (storageKey) {
                        const setting = {};
                        setting[storageKey] = defaultKey;
                        chrome.storage.local.set(setting);
                    }
                }
            }
        });
    }
}

// --- 结束：单词状态快捷键处理 ---

// --- 开始：下拉菜单处理 ---
document.addEventListener('DOMContentLoaded', function() {
  const dropdownTrigger = document.getElementById('dropdownTrigger');
  const dropdownMenu = document.getElementById('dropdownMenu');

  if (dropdownTrigger && dropdownMenu) {
    // 点击触发按钮显示/隐藏下拉菜单
    dropdownTrigger.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });

    // 点击页面其他地方关闭下拉菜单
    document.addEventListener('click', function(e) {
      if (!dropdownTrigger.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.remove('show');
      }
    });

    // 处理下拉菜单项点击事件
    dropdownMenu.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      const target = e.target.closest('.dropdown-item');
      if (target) {
        const action = target.getAttribute('data-action');

        // 关闭下拉菜单
        dropdownMenu.classList.remove('show');

        // 根据action执行相应操作
        switch (action) {
          case 'openOptions':
            if (chrome.runtime.openOptionsPage) {
              chrome.runtime.openOptionsPage();
            }
            break;
          case 'openReadest':
            chrome.tabs.create({
              url: "https://web.readest.com/library"
            });
            break;
          case 'openSyncLingua':
            chrome.tabs.create({
              url: "https://chat.lingkuma.org/"
            });
            break;
          case 'openPDFViewer':
            chrome.tabs.create({
              url: "https://mozilla.github.io/pdf.js/web/viewer.html"
            });
            break;
          case 'openEpubTtsu':
            chrome.tabs.create({
              url: "https://reader.ttsu.app/"
            });
            break;
          case 'openCaptions':
            chrome.tabs.create({
              url: "https://captions.lingkuma.org/"
            });
            break;
          case 'openTing':
            chrome.tabs.create({
              url: "https://ting.lingkuma.org/"
            });
            break;
          case 'openLingkuma':
            chrome.tabs.create({
              url: "https://lingkuma.org/"
            });
            break;
          case 'openLingkumaBlog':
            chrome.tabs.create({
              url: "https://blog.lingkuma.org/"
            });
            break;
          case 'openKoodoReader':
            chrome.tabs.create({
              url: "https://web.koodoreader.com/#/manager/home"
            });
            break;
          default:
            console.log('未知的操作:', action);
        }
      }
    });
  }
});
// --- 结束：下拉菜单处理 ---