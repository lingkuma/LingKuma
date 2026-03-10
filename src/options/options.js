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
    // 检查是否有缓存且缓存时间不超过10分钟
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

      // 移除旧的视频容器（如果存在）
      const oldVideoContainer = document.getElementById('video-background-container');
      if (oldVideoContainer) {
        oldVideoContainer.remove();
      }

      // 创建视频容器
      const videoContainer = document.createElement('div');
      videoContainer.id = 'video-background-container';
      videoContainer.style.position = 'fixed';
      videoContainer.style.top = '0';
      videoContainer.style.left = '0';
      videoContainer.style.width = '100%';
      videoContainer.style.height = '100%';
      videoContainer.style.overflow = 'hidden';
      videoContainer.style.zIndex = '-2'; // 确保在遮罩层之下

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

      // 设置视频样式 - 使用原始尺寸并平铺
      video.style.width = 'auto';
      video.style.height = 'auto';
      video.style.objectFit = 'none'; // 使用原始尺寸

      // 将视频添加到容器
      videoContainer.appendChild(video);

      // 将容器添加到body
      document.body.prepend(videoContainer);

      // 视频加载完成后设置平铺
      video.addEventListener('loadedmetadata', function() {
        // 创建横竖方向复制排列的效果
        const createTiledBackground = () => {
          // 清除现有的视频元素（保留原始视频）
          const clones = videoContainer.querySelectorAll('.video-clone');
          clones.forEach(clone => clone.remove());

          // 获取容器和视频的尺寸
          const containerWidth = videoContainer.offsetWidth;
          const containerHeight = videoContainer.offsetHeight;
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          // 计算需要多少个视频副本来填充容器
          const cols = Math.ceil(containerWidth / videoWidth);
          const rows = Math.ceil(containerHeight / videoHeight);

          // 设置原始视频位置
          video.style.position = 'absolute';
          video.style.top = '0';
          video.style.left = '0';

          // 创建视频副本并排列
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              // 跳过左上角的原始视频位置
              if (row === 0 && col === 0) continue;

              const clone = video.cloneNode(true);
              clone.classList.add('video-clone');
              clone.style.position = 'absolute';
              clone.style.top = `${row * videoHeight}px`;
              clone.style.left = `${col * videoWidth}px`;
              videoContainer.appendChild(clone);
            }
          }
        };

        // 初始创建平铺背景
        createTiledBackground();

        // 窗口大小改变时重新计算
        window.addEventListener('resize', createTiledBackground);
      });

      console.log("Options页面设置视频背景 - 横竖方向复制排列");
    } else {
      // 图片文件
      isBackgroundVideo = false;
      backgroundImageUrl = fileUrl;
      document.body.style.backgroundImage = `url(${backgroundImageUrl})`;
      document.body.style.backgroundSize = 'auto';
      document.body.style.backgroundRepeat = 'repeat';
      console.log("设置图片背景URL长度:", backgroundImageUrl.length);
    }
  } else {
    // 使用默认背景，但检查用户是否指定了默认背景类型
    console.log("[DEBUG options.js] Using default background. bgSettings.defaultType:", bgSettings.defaultType);

    // 先移除旧的视频元素和容器
    const oldVideo = document.getElementById('background-video');
    if (oldVideo) {
      oldVideo.remove();
    }
    const oldVideoContainer = document.getElementById('video-background-container');
    if (oldVideoContainer) {
      oldVideoContainer.remove();
    }

    if (bgSettings.defaultType === 'video') {
      console.log("[DEBUG options.js] Default type is VIDEO.");
      // 用户选择了默认视频背景
      isBackgroundVideo = true;
      backgroundVideoUrl = chrome.runtime.getURL("src/service/videos/kawai.mp4");
      backgroundImageUrl = ''; // 清空图片URL

      // 创建视频容器
      const videoContainer = document.createElement('div');
      videoContainer.id = 'video-background-container';
      videoContainer.style.position = 'fixed';
      videoContainer.style.top = '0';
      videoContainer.style.left = '0';
      videoContainer.style.width = '100%';
      videoContainer.style.height = '100%';
      videoContainer.style.overflow = 'hidden';
      videoContainer.style.zIndex = '-2'; // 确保在遮罩层之下

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

      // 设置视频样式 - 使用原始尺寸并平铺
      video.style.width = 'auto';
      video.style.height = 'auto';
      video.style.objectFit = 'none'; // 使用原始尺寸

      // 将视频添加到容器
      videoContainer.appendChild(video);

      // 将容器添加到body
      document.body.prepend(videoContainer);

      // 视频加载完成后设置平铺
      video.addEventListener('loadedmetadata', function() {
        // 创建横竖方向复制排列的效果
        const createTiledBackground = () => {
          // 清除现有的视频元素（保留原始视频）
          const clones = videoContainer.querySelectorAll('.video-clone');
          clones.forEach(clone => clone.remove());

          // 获取容器和视频的尺寸
          const containerWidth = videoContainer.offsetWidth;
          const containerHeight = videoContainer.offsetHeight;
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          // 计算需要多少个视频副本来填充容器
          const cols = Math.ceil(containerWidth / videoWidth);
          const rows = Math.ceil(containerHeight / videoHeight);

          // 设置原始视频位置
          video.style.position = 'absolute';
          video.style.top = '0';
          video.style.left = '0';

          // 创建视频副本并排列
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              // 跳过左上角的原始视频位置
              if (row === 0 && col === 0) continue;

              const clone = video.cloneNode(true);
              clone.classList.add('video-clone');
              clone.style.position = 'absolute';
              clone.style.top = `${row * videoHeight}px`;
              clone.style.left = `${col * videoWidth}px`;
              videoContainer.appendChild(clone);
            }
          }
        };

        // 初始创建平铺背景
        createTiledBackground();

        // 窗口大小改变时重新计算
        window.addEventListener('resize', createTiledBackground);
      });

      console.log("Options页面设置视频背景 - 横竖方向复制排列");
    } else if (bgSettings.defaultType === 'svg') {
      console.log("[DEBUG options.js] Default type is SVG.");
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
      console.log("[DEBUG options.js] Default type is SPECIFIC.");
      // 用户选择了指定的内置背景
      const specificPath = bgSettings.specificBgPath;

      // 判断是视频还是图片
      if (specificPath.endsWith('.mp4') || specificPath.endsWith('.webm') || specificPath.endsWith('.ogg')) {
        // 视频背景 - 使用与上面相同的视频处理逻辑
        isBackgroundVideo = true;
        backgroundVideoUrl = chrome.runtime.getURL(specificPath);
        backgroundImageUrl = '';

        // 创建视频容器和元素（与上面的视频处理代码相同）
        const videoContainer = document.createElement('div');
        videoContainer.id = 'video-background-container';
        videoContainer.style.position = 'fixed';
        videoContainer.style.top = '0';
        videoContainer.style.left = '0';
        videoContainer.style.width = '100%';
        videoContainer.style.height = '100%';
        videoContainer.style.overflow = 'hidden';
        videoContainer.style.zIndex = '-2';

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
        video.style.width = 'auto';
        video.style.height = 'auto';
        video.style.objectFit = 'none';

        videoContainer.appendChild(video);
        document.body.prepend(videoContainer);

        video.addEventListener('loadedmetadata', function() {
          const createTiledBackground = () => {
            const clones = videoContainer.querySelectorAll('.video-clone');
            clones.forEach(clone => clone.remove());

            const containerWidth = videoContainer.offsetWidth;
            const containerHeight = videoContainer.offsetHeight;
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            const cols = Math.ceil(containerWidth / videoWidth);
            const rows = Math.ceil(containerHeight / videoHeight);

            video.style.position = 'absolute';
            video.style.top = '0';
            video.style.left = '0';

            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                if (row === 0 && col === 0) continue;

                const clone = video.cloneNode(true);
                clone.classList.add('video-clone');
                clone.style.position = 'absolute';
                clone.style.top = `${row * videoHeight}px`;
                clone.style.left = `${col * videoWidth}px`;
                videoContainer.appendChild(clone);
              }
            }
          };

          createTiledBackground();
          window.addEventListener('resize', createTiledBackground);
        });

        console.log("Options页面设置指定视频背景:", specificPath);
      } else {
        // 图片/SVG背景
        isBackgroundVideo = false;
        backgroundImageUrl = chrome.runtime.getURL(specificPath);
        document.body.style.backgroundImage = `url(${backgroundImageUrl})`;
        document.body.style.backgroundSize = 'auto';
        document.body.style.backgroundRepeat = 'repeat';
        console.log("使用指定图片/SVG背景:", specificPath, "完整URL:", backgroundImageUrl);
      }
    } else if (bgSettings.defaultType === 'image') {
      console.log("[DEBUG options.js] Default type is IMAGE.");
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
      document.body.style.backgroundSize = 'auto';
      document.body.style.backgroundRepeat = 'repeat';
      console.log("使用随机默认图片背景:", randomImagePath, "完整URL:", backgroundImageUrl);
    } else {
      // 默认使用随机SVG背景（兼容旧设置）
      console.log("[DEBUG options.js] No type specified, using default SVG.");
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

// 修改消息监听器，删除与 knownWords 相关的处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 删除了处理 "getAllKnownWords" 和 "addKnownWord" 的代码
});


// 多语言支持
const i18n = {
  'zh': {
    'databaseOperations': '数据库操作',
    'cloudDatabaseSettings': 'Cloud Database',
    'webdavSettings': 'WebDav',
    'wordList': '单词列表',
    'cloudWordList': '云数据库列表',
    'cloudWordListDesc': '访问您的云数据库单词列表',
    'officialServer': '官方服务器',
    'customServer': '自定义服务器',
    'customServerNotConfigured': '请先在Cloud Database设置中配置自定义服务器URL',
    'customServerNotEnabled': '请先在Cloud Database设置中启用自建服务器模式',
    'accessCustomServer': '访问自定义服务器',
    'importWords': '导入已知单词',
    'backup': '备份数据！',
    'apiConfig': 'API 配置',
    'ttsConfig': 'TTS 配置',
    'epubTextFix': 'EPUB 文本修复',
    'epubSplitter': 'EPUB 拆分工具',
    'epubToTelegraphName': 'EPUB 转 Telegra.ph', // 新增翻译
    'epubRomanCleanName': 'EPUB 罗马注音清理', // 新增翻译
    'openPopup': '打开弹窗',
    'knownWords': '本地 - 已知单词',
    'wordStats': '学习统计',
    'wordOperations': '单词库操作',
    'wordOperationsTitle': '单词库操作',
    'sentenceManagement': '例句管理',
    'currentDbSize': '当前数据库大小',
    'totalSentences': '总例句数量',
    'sentenceDeleteOptions': '例句删除选项',
    'deleteAllSentences': '删除所有例句',
    'keepNSentences': '每个单词保留前 N 个例句',
    'keepCount': '保留数量',
    'refreshDbSize': '刷新数据库信息',
    'executeSentenceOperation': '执行例句删除',
    'databaseManagement': '数据库管理',
    'clearLocalDb': '清空本地数据库',
    'resetPhrasesDb': '重置词组数据库',
    'resetPhrasesDbHint': '如果你清空了单词数据库，并重新导入，你可能需要从新的数据库中，创建新的词组缓存。',
    'resetPhrasesDbSuccess': '词组数据库重置成功！',
    'resetPhrasesDbError': '词组数据库重置失败',
    'confirmResetPhrasesDb': '确定要重置词组数据库吗？这将清空现有词组缓存并从主数据库重新创建。',
    'language': '语言',
    'status': '状态',
    'all': '全部',
    'zh': '中文',
    'en': '英语',
    'de': '德语',
    'fr': '法语',
    'es': '西班牙语',
    'ja': '日语',
    'ko': '韩语',
    'ru': '俄语',
    'known': '已知',
    'learning': '学习中(新词) (1) (黄色高亮)',
    'familiar': '熟悉 (2) (淡黄色高亮)',
    'recognized': '认识 (3) (灰色高亮)',
    'almostMastered': '几乎掌握 (4) (下划线)',
    'fullyMastered': '完全掌握 (5) (不高亮)',
    'itemsPerPage': '每页显示',
    'applyFilter': '应用筛选',
    'prevPage': '上一页',
    'nextPage': '第 {current} 页，共 {total} 页',
    'nextBtn': '下一页',
    'importTxt': '导入txt单词',
    'separator': '分隔方式',
    'newline': '换行',
    'comma': '逗号',
    'wordStatus': '单词状态',
    // 弹窗背景设置相关翻译
    'tooltipSettings': '弹窗设置',
    'tooltipThemeSettings': '弹窗主题设置',
    'tooltipThemeMode': '弹窗主题模式',
    'autoDetect': '自动检测（跟随网页）',
    'lightMode': '固定亮色主题',
    'darkMode': '固定暗色主题',
    'backgroundDisplayOptions': '背景显示选项',
    'enableTooltipBackground': '启用背景效果',
    'backgroundType': '背景类型',
    'defaultBackground': '使用插件内置背景',
    'customBackground': '使用自定义背景',
    'defaultBackgroundType': '内置背景类型',
    'imageBackground': '随机图片背景',
    'svgBackground': '随机SVG图案',
    'videoBackground': '默认视频背景',
    'specificBackground': '指定内置背景',
    'builtInBackgroundPreview': '内置背景预览',
    'customBackgroundFile': '上传背景文件 (支持图片和视频)',
    'supportedFormats': '支持的格式：PNG, JPEG, GIF, SVG, MP4, WebM, OGG',
    'preview': '预览',
    'autoSaveHint': '设置会自动保存',
    'tips': '提示',
    'backgroundNote': '• 弹窗主题模式：自动检测会根据网页的明暗自动调整，固定模式则始终使用选定的主题\n• 背景效果会显示在弹窗的底层，不会影响文字阅读\n• 视频背景会自动循环播放且静音\n• 图片和视频的透明度已调整为适合阅读\n• 如果上传的文件过大，可能会影响性能',
    // 玻璃材质设置相关翻译
    'glassEffectSettings': '玻璃材质设置',
    'glassEffectType': '玻璃效果类型',
    'glassEffectPreview': '效果预览',
    'glassEffectAutoSave': '设置会自动保存并应用到弹窗',
    'glassEffectLiquid': '液态玻璃 (Liquid) ⚠️卡顿，不建议使用',
    'glassEffectFractal': '分形噪声 (Fractal)',
    'glassEffectFlip': '翻转 (Flip)',
    'glassEffectRgbSplit': 'RGB分离 (RGB Split)',
    'glassEffectPixel': '像素化 (Pixel)',
    'glassEffectFluted': '凹槽 (Fluted)',
    'glassEffectTiled': '瓷砖 (Tiled)',
    'glassEffectMosaic': '马赛克 (Mosaic)',
    'glassEffectEllipses': '椭圆 (Ellipses)',
    'glassEffectRough': '粗糙 (Rough)',
    'glassEffectBulge': '凸起 (Bulge)',
    'delete': '删除',
    'parallelBatches': '并行导入批次',
    'wordsPerBatch': '每批词数',
    'import': '导入单词',
    'clearList': '清空单词列表',
    'dbBackup': '数据库备份与还原',
    'wordDbBackup': '词库数据备份',
    'backupDb': '备份词库数据',
    'downloadBackup': '点击下载备份文件',
    'importBackup': '导入词库备份',
    'configBackup': '配置数据备份',
    'backupConfig': '备份配置数据',
    'downloadConfigBackup': '点击下载配置备份文件',
    'importConfigBackup': '导入配置备份',
    'customLangCode': '自定义语言代码',
    'enterIsoCode': '请输入ISO 639-1语言代码',
    'isoCodeHint': '请输入ISO 639-1标准的双字母语言代码，例如：en, de, fr等',
    'ttsChannelSelect': 'TTS 渠道选择',
    'wordTtsChannel': '单词发音渠道',
    'sentenceTtsChannel': '句子发音渠道',
    'localTts': '本地TTS',
    'edgeTts': 'Edge TTS',
    'edgeTtsConfig': 'Edge TTS配置',
    'edgeTtsAutoVoice': '自动选择声音（根据语言）',
    'edgeTtsVoice': '选择声音',
    'edgeTtsRate': '语速 (-100% 到 +100%)',
    'edgeTtsVolume': '音量 (-100% 到 +100%)',
    'edgeTtsPitch': '音调 (-50% 到 +50%)',
    'testEdgeTts': '测试Edge TTS',
    'customUrl': '自定义URL',
    'localTtsConfig': '本地TTS配置',
    'defaultVoice': '默认语音',
    'autoSelect': '自动选择',
    'speechRate': '语速 (0.1-2.0)',
    'pitch': '音调 (0.1-2.0)',
    'testLocalTts': '测试本地TTS',
    'enableWordTts': '启用单词TTS',
    'enableSentenceTts': '启用句子TTS',
    'customAudioUrlConfig': '自定义音频URL配置',
    'urlTemplate': 'URL模板',
    'urlTemplateHint': '可用变量: {lang}, {word}<br>可用函数: {encodeURIComponent()}, {utf8ToBase64()}<br>示例: https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>可使用自己搭建的,或者别人搭建的，或者他人搭建的，返回mp3音频的API。',
    'apiSettings': 'API 配置',
    'apiBaseUrl': 'Custom API Base URL:  https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'API Key:',
    'model': 'Modell:',
    'activeProfileLabel': '激活配置:',
    'addProfileBtn': '+ 添加配置',
    'profileName': '配置名称:',
    'enableApiPollingLabel': '启用轮询',
    'profileEnablePollingLabel': '参与轮询',
    'languageDetectionPrompt': '语言检测AI提示词:',
    'tagAnalysisPrompt': '词性标签分析提示词:',
    'wordExplanationPrompt': '单词解释AI提示词:',
    'wordExplanation2Prompt': '第二个单词解释AI提示词:',
    'sentenceTranslationPrompt': '例句翻译AI提示词:',
    'sentenceAnalysisPrompt': '句子解析AI提示词:',
    'sidebarAnalysisPrompt': '侧边栏AI解析提示词:',
    'restoreDefault': '恢复默认',
    'autoSaved': 'Automatic save complete.',
    'minimaxiTtsConfig': 'Minimaxi TTS API 配置',
    'groupId': 'Group ID:',
    'enterGroupId': '请输入 Group ID',
    'enterApiKey': '请输入 API Key',
    'saved': '已保存',
    'apiUrlPlaceholder': 'https://api.example.com/v1/chat/completions',
    'apiKeyPlaceholder': 'sk-xxxxxxxx',
    'modelPlaceholder': '请输入模型名称',
    'apiBasic': '基本设置',
    'apiLanguageDetection': '语言检测',
    'apiTagAnalysis': '词性标签',
    'apiWordExplanation': '单词解释',
    'apiWordExplanation2': '第二个单词解释',
    'apiSentenceTranslation': '例句翻译',
    'apiAnalysis': '句子解析',
    'apiSidebar': '侧边栏解析',
    'apiBasicSettings': 'API 基本设置',
    'apiLanguageDetectionSettings': '语言检测设置',
    'apiTagAnalysisSettings': '词性标签设置',
    'apiWordExplanationSettings': '单词解释设置',
    'apiSentenceTranslationSettings': '例句翻译设置',
    'apiAnalysisSettings': '句子解析设置',
    'apiSidebarSettings': '侧边栏解析设置',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': '推荐',
    'ohmygptBaseUrlRecommendedDesc': '美国线路|企业线路',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | 全球线路',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN | 中国线路',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | 中国线路 加速',
    'ttsBasic': '基本设置',
    'ttsLocal': '本地TTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': '自定义URL',
    'ttsBasicSettings': 'TTS 基本设置',
    'testMinimaxi': '测试Minimaxi',
    'testCustomUrl': '测试自定义URL1',
    'testCustomUrl2': '测试自定义URL2',
    'about': '关于',
    'subscriptionManagement': '第三方登录',
    // 自定义胶囊相关翻译
    'customCapsules': '自定义胶囊',
    'customCapsulesSettings': '自定义胶囊设置',
    'customCapsulesDescription': '自定义胶囊容器和按钮',
    'customCapsulesHelp': '<strong>胶囊容器</strong>：每个胶囊容器是一行，可以包含多个按钮。多个胶囊容器会向上叠加显示。<br><strong>按钮</strong>：每个按钮是一个搜索触发器，点击后打开指定URL。URL中的 <code>{word}</code> 会被替换为当前单词。',
    'addCapsuleContainer': '+ 添加胶囊容器',
    'noCapsulesYet': '还没有添加任何胶囊容器，点击下方按钮添加',
    'capsuleContainer': '胶囊容器',
    'buttonName': '按钮名称',
    'buttonUrl': 'URL',
    'buttonIcon': '图标',
    'buttonIconPlaceholder': '可选，留空使用默认图标',
    'buttonOpenMethod': '打开方式',
    'openMethodNewTab': '新标签页',
    'openMethodIframe': 'iframe弹窗',
    'openMethodNewWindow': '新窗口',
    'openMethodSidebar': '侧边栏',
    'newButton': '新按钮',
    'addButton': '+ 添加按钮',
    'deleteContainer': '删除容器',
    'deleteButton': '删除按钮',
    'noButtonsYet': '此容器还没有按钮，点击"添加按钮"来添加',
    'autoSavedCapsule': '✓ 已自动保存',
    'capsuleAutoSaveHint': '✓ 设置会自动保存',
    'confirmDeleteContainer': '确定要删除这个胶囊容器吗？',
    'confirmDeleteButton': '确定要删除这个按钮吗？',
    // 已知句子动效相关翻译
    'knownSentenceAnimation': '已知句子动效',
    'knownSentenceAnimationSettings': '已知句子动效设置',
    'animationDescription': '句子爆炸已知句子效果动图配置',
    'animationHelp': '配置当句子中没有未知单词时显示的动效图。可以设置顶层和底层两个动图，支持选择预设动图或上传自定义TGS文件。',
    'animationSize': '动图尺寸',
    'animationWidth': '宽度',
    'animationHeight': '高度',
    'animationDefaultSize': '默认: 150x150px',
    'topLayerAnimation': '顶层动图',
    'bottomLayerAnimation': '底层动图',
    'enable': '启用',
    'selectAnimation': '选择动图',
    'uploadCustom': '上传自定义TGS文件',
    'selectFile': '选择文件',
    'tgsFormatOnly': '仅支持 .tgs 格式的动画文件',
    'animationSaved': '✓ 设置已自动保存',
    'customAnimationSaved': '{layer} 层自定义动图已保存',
    'capsuleTips': '提示',
    'capsuleTipsContent': '• <strong>胶囊容器</strong>：一个横向的按钮容器，多个容器会向上叠加<br>• <strong>按钮名称</strong>：按钮上显示的文字<br>• <strong>URL</strong>：要打开的网址，使用 {word} 作为当前单词的占位符<br>• <strong>打开方式</strong>：<br>&nbsp;&nbsp;- 新标签页：在浏览器新标签页中打开<br>&nbsp;&nbsp;- iframe弹窗：在当前页面的弹窗中以iframe形式打开<br>&nbsp;&nbsp;- 新窗口：在新的浏览器窗口中打开<br>&nbsp;&nbsp;- 侧边栏：在浏览器侧边栏中打开<br>• <strong>示例</strong>：<br>&nbsp;&nbsp;容器1：[Google图片] [维基百科] [词典]<br>&nbsp;&nbsp;容器2：[YouTube] [翻译]<br>• <strong>示例URL</strong>：https://www.google.com/search?q={word}&tbm=isch',
    'afdianAccount': '爱发电账号',
    'kumaAccount': 'Kuma账号(建设中)',
    'ohmygptAccount': 'Ohmygpt账号',
    'userId': '用户ID:',
    'accessToken': '访问令牌:',
    'verifyAccount': '验证账号',
    'featureUnderConstruction': '此功能正在建设中，敬请期待！',
    'minimaxiVoiceId': '音色ID',
    'minimaxiModel': 'Modell',
    'minimaxiSpeed': '语速',
    'aiChannelLabel': 'AI 渠道:',
    'aiChannelDiy': '自定义（Custom API ）',
    'aiChannelOhmygpt': 'OhMyGpt（需授权登录）',
    'apiSidebar': '侧边栏解析',
    'apiYoutubeCaption': 'YouTube字幕处理', // 新增
    'apiYoutubeCaptionSettings': 'YouTube字幕处理设置', // 新增
    'youtubeCaptionPrompt': 'YouTube字幕处理AI提示词:', // 新增
    'ttsBasicSettings': 'TTS 基本设置',
    'startDate': '开始日期',
    'endDate': '结束日期',
    'filterToday': '当日',
    'filterYesterday': '昨日',
    'filterThisWeek': '本周',
    'filterThisMonth': '本月',
    'filterNoDate': '无日期单词',
    'dateFilterWarning': '导入的单词可能没有时间数据，筛选结果可能不准。请忽略时间数据统计已知单词。',
    'filterByStatusOnly': '仅筛选单词状态',
    'pastDays': '往前天数',
    'applyPastDays': '应用',
    'wordStats': '学习统计',
    'wordStatsTitle': '单词学习统计',
    'dailyNewWords': '每日新词数量',
    'timeRange': '时间范围',
    'allTime': '全部时间',
    'thisYear': '本年',
    'customRange': '自定义范围',
    'applyRange': '应用范围',
    'statusFilter': '状态筛选',
    'chartType': '图表类型',
    'lineChart': '折线图',
    'barChart': '柱状图',
    'statusFilterMinOne': '请至少选择一种单词状态',
    'derivativeOrder': '导数阶数',
    'derivativeOrder0': '原始数据 (0阶)',
    'derivativeOrder1': '一阶导数 (变化率)',
    'derivativeOrder2': '二阶导数 (加速度)',
    // Cloud Database 相关翻译
    'cloudServerConfig': '服务器配置',
    'cloudServerUrlLabel': '服务器 URL:',
    'cloudDbEnabledLabel': '启用云端数据库(请勿开启，除非您已登录。关闭以使用本地数据库)',
    'cloudDualWriteLabel': '启用双写（同时写入本地和云端）',
    'cloudAccountManagement': '账号管理',
    'cloudSelfHostedLabel': '自建服务器（高级）',
    'cloudSelfHostedHint': '如果您运行自己的服务器，请启用此项。否则，请保持关闭以使用官方云服务。',
    'cloudUsernameLabel': '用户名:',
    'cloudPasswordLabel': '密码:',
    'cloudEmailLabel': '邮箱:',
    'cloudLoginBtn': '登录',
    'cloudRegisterBtn': '注册',
    'cloudRegisterSubmitBtn': '创建账号',
    'cloudCancelBtn': '取消',
    'cloudLogoutBtn': '退出登录',
    'cloudRefreshInfoBtn': '刷新信息',
    'cloudRefreshAfdianBtn': '刷新爱发电状态',
    'cloudDataMigration': '数据迁移',
    'cloudMigrateLocalToCloudBtn': '📤 上传本地数据库到云端（合并）',
    'cloudMigrateLocalToCloudReplaceBtn': '⚠️ 上传本地数据库到云端（替换）',
    'cloudMigrateCloudToLocalBtn': '📥 下载云端数据库到本地（合并）',
    'cloudMigrateCloudToLocalReplaceBtn': '⚠️ 下载云端数据库到本地（替换）',
    'cloudServerHealth': '服务器健康检查',
    'cloudHealthCheckBtn': '🏥 检查服务器状态',
    // WebDAV 相关翻译
    'webdavActions': 'WebDAV 同步与备份',
    'webdavWordsSync': 'Webdav 单词同步 | Words Sync',
    'webdavCredentials': 'WebDAV 凭据',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': '账号:',
    'webdavPasswordLabel': '密码:',
    'webdavUploadSyncBtn': '1️⃣ 设备A 上传同步数据库（覆盖云端）；比如电脑上传',
    'webdavDownloadMergeBtn': '2️⃣ 设备B 下载同步数据库（合并本地）；这边手机下载合并',
    'webdavDownloadReplaceBtn': '⚠️ 设备B 下载同步数据库（替换本地）；完全覆盖本地',
    'webdavUploadBackupBtn': '♻️ 仅上传备份文件，可多次',
    'multiDeviceSettings': '多设备配置文件同步 Multi-Device Settings Sync',
    // 数据库操作相关翻译
    'webdavClearDbBtn': '清空本地数据库',
    'confirmClearDatabase': '确定要清空本地所有单词数据吗？此操作不可恢复！',
    'webdavClearingDb': '正在清空本地数据库...',
    'webdavClearDbSuccess': '本地数据库已清空！',
    'webdavClearDbError': '清空本地数据库失败',
    'unknownError': '发生未知错误',
    // 账号管理相关翻译
    'cloudLoggedInAs': '已登录为:',
    'cloudSubscriptionStatus': '订阅状态:',
    'cloudExpiresAt': '到期时间:',
    'cloudDataServer': '数据服务器:',
    'cloudAfdianId': '爱发电 ID:',
    'cloudPlanName': '套餐:',
    'cloudStorage': '存储:',
    // 捐赠相关翻译
    'donateButton': '爱发电(afdian)',
    'donationNote1': `
Lingkuma完全开源免费，软件维护不易，如果您感觉该软件对你有帮助，欢迎通过<a href="https://afdian.com/a/lingkuma" target="_blank">爱发电</a>，或微信扫码赞助。
<br>单词默认存放在本地，捐赠后可使用官方公益单词实时云同步，多设备无缝使用。（插件配置因内涵API等敏感信息，目前仅支持用户自己通过Webdav进行多设备同步）
    `
    ,
    'donationNote2': 
`您仍可通过以下方式免费进行同步
<br>1. 通过【坚果云 Webdav】进行免费多设备同步，但非实时，多设备必须手动上传和下载。
<br>2. 访问<a href="https://shared-server.lingkuma.org" target="_blank">【公益服务器列表】</a>使用网友提供的服务器；
<br>3. 通过官方Docker在本地或服务器自建同步服务；
`,
    'donationNote3': '如果使用中遇到困难，可以查阅<a href="https://docs.lingkuma.org/">使用说明</a>、观看我的<a href="https://tp-videos.lingkuma.org/">视频</a>，也欢迎加入<a href="https://tp-contact.lingkuma.org/">社群</a>。',
    'donationNote4': '感谢使用Lingkuma，希望能够帮助您更顺畅的学习。'

  },
  'zh_TW': {
    'databaseOperations': '資料庫操作',
    'cloudDatabaseSettings': 'Cloud Database',
    'webdavSettings': 'WebDav',
    'wordList': '單字列表',
    'cloudWordList': '雲端資料庫列表',
    'cloudWordListDesc': '存取您的雲端資料庫單字列表',
    'officialServer': '官方伺服器',
    'customServer': '自訂伺服器',
    'customServerNotConfigured': '請先在Cloud Database設定中設定自訂伺服器URL',
    'customServerNotEnabled': '請先在Cloud Database設定中啟用自建伺服器模式',
    'accessCustomServer': '存取自訂伺服器',
    'importWords': '匯入已知單字',
    'backup': '備份資料！',
    'apiConfig': 'API 設定',
    'ttsConfig': 'TTS 設定',
    'epubTextFix': 'EPUB 文字修復',
    'epubSplitter': 'EPUB 拆分工具',
    'epubToTelegraphName': 'EPUB 轉 Telegra.ph',
    'epubRomanCleanName': 'EPUB 羅馬注音清理',
    'openPopup': '開啟彈窗',
    'knownWords': '本地 - 已知單字',
    'wordStats': '學習統計',
    'wordOperations': '單字庫操作',
    'wordOperationsTitle': '單字庫操作',
    'sentenceManagement': '例句管理',
    'currentDbSize': '目前資料庫大小',
    'totalSentences': '總例句數量',
    'sentenceDeleteOptions': '例句刪除選項',
    'deleteAllSentences': '刪除所有例句',
    'keepNSentences': '每個單字保留前 N 個例句',
    'keepCount': '保留數量',
    'refreshDbSize': '重新整理資料庫資訊',
    'executeSentenceOperation': '執行例句刪除',
    'databaseManagement': '資料庫管理',
    'clearLocalDb': '清空本地資料庫',
    'resetPhrasesDb': '重設詞組資料庫',
    'resetPhrasesDbHint': '如果您清空了單字資料庫，並重新匯入，您可能需要從新的資料庫中，建立新的詞組快取。',
    'resetPhrasesDbSuccess': '詞組資料庫重設成功！',
    'resetPhrasesDbError': '詞組資料庫重設失敗',
    'confirmResetPhrasesDb': '確定要重設詞組資料庫嗎？這將清空現有詞組快取並從主資料庫重新建立。',
    'language': '語言',
    'status': '狀態',
    'all': '全部',
    'zh': '中文',
    'en': '英語',
    'de': '德語',
    'fr': '法語',
    'es': '西班牙語',
    'ja': '日語',
    'ko': '韓語',
    'ru': '俄語',
    'known': '已知',
    'learning': '學習中(新詞) (1) (黃色高亮)',
    'familiar': '熟悉 (2) (淡黃色高亮)',
    'recognized': '認識 (3) (灰色高亮)',
    'almostMastered': '幾乎掌握 (4) (下劃線)',
    'fullyMastered': '完全掌握 (5) (不高亮)',
    'itemsPerPage': '每頁顯示',
    'applyFilter': '套用篩選',
    'prevPage': '上一頁',
    'nextPage': '第 {current} 頁，共 {total} 頁',
    'nextBtn': '下一頁',
    'importTxt': '匯入txt單字',
    'separator': '分隔方式',
    'newline': '換行',
    'comma': '逗號',
    'wordStatus': '單字狀態',
    'tooltipSettings': '彈窗設定',
    'tooltipThemeSettings': '彈窗主題設定',
    'tooltipThemeMode': '彈窗主題模式',
    'autoDetect': '自動偵測（跟隨網頁）',
    'lightMode': '固定亮色主題',
    'darkMode': '固定暗色主題',
    'backgroundDisplayOptions': '背景顯示選項',
    'enableTooltipBackground': '啟用背景效果',
    'backgroundType': '背景類型',
    'defaultBackground': '使用外掛內建背景',
    'customBackground': '使用自訂背景',
    'defaultBackgroundType': '內建背景類型',
    'imageBackground': '隨機圖片背景',
    'svgBackground': '隨機SVG圖案',
    'videoBackground': '預設影片背景',
    'specificBackground': '指定內建背景',
    'builtInBackgroundPreview': '內建背景預覽',
    'customBackgroundFile': '上傳背景檔案 (支援圖片和影片)',
    'supportedFormats': '支援的格式：PNG, JPEG, GIF, SVG, MP4, WebM, OGG',
    'preview': '預覽',
    'autoSaveHint': '設定會自動儲存',
    'tips': '提示',
    'backgroundNote': '• 彈窗主題模式：自動偵測會根據網頁的明暗自動調整，固定模式則始終使用選定的主題\n• 背景效果會顯示在彈窗的底層，不會影響文字閱讀\n• 影片背景會自動循環播放且靜音\n• 圖片和影片的透明度已調整為適合閱讀\n• 如果上傳的檔案過大，可能會影響效能',
    'glassEffectSettings': '玻璃材質設定',
    'glassEffectType': '玻璃效果類型',
    'glassEffectPreview': '效果預覽',
    'glassEffectAutoSave': '設定會自動儲存並套用到彈窗',
    'glassEffectLiquid': '液態玻璃 (Liquid) ⚠️卡頓，不建議使用',
    'glassEffectFractal': '分形雜訊 (Fractal)',
    'glassEffectFlip': '翻轉 (Flip)',
    'glassEffectRgbSplit': 'RGB分離 (RGB Split)',
    'glassEffectPixel': '像素化 (Pixel)',
    'glassEffectFluted': '凹槽 (Fluted)',
    'glassEffectTiled': '磁磚 (Tiled)',
    'glassEffectMosaic': '馬賽克 (Mosaic)',
    'glassEffectEllipses': '橢圓 (Ellipses)',
    'glassEffectRough': '粗糙 (Rough)',
    'glassEffectBulge': '凸起 (Bulge)',
    'delete': '刪除',
    'parallelBatches': '並行匯入批次',
    'wordsPerBatch': '每批詞數',
    'import': '匯入單字',
    'clearList': '清空單字列表',
    'dbBackup': '資料庫備份與還原',
    'wordDbBackup': '詞庫資料備份',
    'backupDb': '備份詞庫資料',
    'downloadBackup': '點擊下載備份檔案',
    'importBackup': '匯入詞庫備份',
    'configBackup': '設定資料備份',
    'backupConfig': '備份設定資料',
    'downloadConfigBackup': '點擊下載設定備份檔案',
    'importConfigBackup': '匯入設定備份',
    'customLangCode': '自訂語言代碼',
    'enterIsoCode': '請輸入ISO 639-1語言代碼',
    'isoCodeHint': '請輸入ISO 639-1標準的雙字母語言代碼，例如：en, de, fr等',
    'ttsChannelSelect': 'TTS 頻道選擇',
    'wordTtsChannel': '單字發音頻道',
    'sentenceTtsChannel': '句子發音頻道',
    'localTts': '本地TTS',
    'edgeTts': 'Edge TTS',
    'edgeTtsConfig': 'Edge TTS設定',
    'edgeTtsAutoVoice': '自動選擇聲音（根據語言）',
    'edgeTtsVoice': '選擇聲音',
    'edgeTtsRate': '語速 (-100% 到 +100%)',
    'edgeTtsVolume': '音量 (-100% 到 +100%)',
    'edgeTtsPitch': '音調 (-50% 到 +50%)',
    'testEdgeTts': '測試Edge TTS',
    'customUrl': '自訂URL',
    'localTtsConfig': '本地TTS設定',
    'defaultVoice': '預設語音',
    'autoSelect': '自動選擇',
    'speechRate': '語速 (0.1-2.0)',
    'pitch': '音調 (0.1-2.0)',
    'testLocalTts': '測試本地TTS',
    'enableWordTts': '啟用單字TTS',
    'enableSentenceTts': '啟用句子TTS',
    'customAudioUrlConfig': '自訂音訊URL設定',
    'urlTemplate': 'URL範本',
    'urlTemplateHint': '可用變數: {lang}, {word}<br>可用函數: {encodeURIComponent()}, {utf8ToBase64()}<br>範例: https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>可使用自己架設的,或者別人架設的，或者他人架設的，傳回mp3音訊的API。',
    'apiSettings': 'API 設定',
    'apiBaseUrl': 'Custom API Base URL:  https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'API Key:',
    'model': 'Modell:',
    'activeProfileLabel': '啟用設定:',
    'addProfileBtn': '+ 新增設定',
    'profileName': '設定名稱:',
    'profileEnablePollingLabel': '參與輪詢',
    'languageDetectionPrompt': '語言偵測AI提示詞:',
    'tagAnalysisPrompt': '詞性標籤分析提示詞:',
    'wordExplanationPrompt': '單字解釋AI提示詞:',
    'wordExplanation2Prompt': '第二個單字解釋AI提示詞:',
    'sentenceTranslationPrompt': '例句翻譯AI提示詞:',
    'sentenceAnalysisPrompt': '句子解析AI提示詞:',
    'sidebarAnalysisPrompt': '側邊欄AI解析提示詞:',
    'restoreDefault': '恢復預設',
    'autoSaved': 'Automatic save complete.',
    'minimaxiTtsConfig': 'Minimaxi TTS API 設定',
    'groupId': 'Group ID:',
    'enterGroupId': '請輸入 Group ID',
    'enterApiKey': '請輸入 API Key',
    'saved': '已儲存',
    'apiUrlPlaceholder': 'https://api.example.com/v1/chat/completions',
    'apiKeyPlaceholder': 'sk-xxxxxxxx',
    'modelPlaceholder': '請輸入模型名稱',
    'apiBasic': '基本設定',
    'apiLanguageDetection': '語言偵測',
    'apiTagAnalysis': '詞性標籤',
    'apiWordExplanation': '單字解釋',
    'apiWordExplanation2': '第二個單字解釋',
    'apiSentenceTranslation': '例句翻譯',
    'apiAnalysis': '句子解析',
    'apiSidebar': '側邊欄解析',
    'apiBasicSettings': 'API 基本設定',
    'apiLanguageDetectionSettings': '語言偵測設定',
    'apiTagAnalysisSettings': '詞性標籤設定',
    'apiWordExplanationSettings': '單字解釋設定',
    'apiSentenceTranslationSettings': '例句翻譯設定',
    'apiAnalysisSettings': '句子解析設定',
    'apiSidebarSettings': '側邊欄解析設定',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': '推薦',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'ttsBasic': '基本設定',
    'ttsLocal': '本地TTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': '自訂URL',
    'ttsBasicSettings': 'TTS 基本設定',
    'testMinimaxi': '測試Minimaxi',
    'testCustomUrl': '測試自訂URL1',
    'testCustomUrl2': '測試自訂URL2',
    'about': '關於',
    'subscriptionManagement': '第三方登入',
    'customCapsules': '自訂膠囊',
    'customCapsulesSettings': '自訂膠囊設定',
    'customCapsulesDescription': '自訂膠囊容器和按鈕',
    'customCapsulesHelp': '<strong>膠囊容器</strong>：每個膠囊容器是一行，可以包含多個按鈕。多個膠囊容器會向上疊加顯示。<br><strong>按鈕</strong>：每個按鈕是一個搜尋觸發器，點擊後開啟指定URL。URL中的 <code>{word}</code> 會被替換為目前單字。',
    'addCapsuleContainer': '+ 新增膠囊容器',
    'noCapsulesYet': '還沒有新增任何膠囊容器，點擊下方按鈕新增',
    'capsuleContainer': '膠囊容器',
    'buttonName': '按鈕名稱',
    'buttonUrl': 'URL',
    'buttonIcon': '圖示',
    'buttonIconPlaceholder': '可選，留空使用預設圖示',
    'buttonOpenMethod': '開啟方式',
    'openMethodNewTab': '新分頁',
    'openMethodIframe': 'iframe彈窗',
    'openMethodNewWindow': '新視窗',
    'openMethodSidebar': '側邊欄',
    'newButton': '新按鈕',
    'addButton': '+ 新增按鈕',
    'deleteContainer': '刪除容器',
    'deleteButton': '刪除按鈕',
    'noButtonsYet': '此容器還沒有按鈕，點擊"新增按鈕"來新增',
    'autoSavedCapsule': '✓ 已自動儲存',
    'capsuleAutoSaveHint': '✓ 設定會自動儲存',
    'confirmDeleteContainer': '確定要刪除這個膠囊容器嗎？',
    'confirmDeleteButton': '確定要刪除這個按鈕嗎？',
    'knownSentenceAnimation': '已知句子動效',
    'knownSentenceAnimationSettings': '已知句子動效設定',
    'animationDescription': '句子爆炸已知句子效果動圖設定',
    'animationHelp': '設定當句子中沒有未知單字時顯示的動圖。可以設定頂層和底層兩個動圖，支援選擇預設動圖或上傳自訂TGS檔案。',
    'animationSize': '動圖尺寸',
    'animationWidth': '寬度',
    'animationHeight': '高度',
    'animationDefaultSize': '預設: 150x150px',
    'topLayerAnimation': '頂層動圖',
    'bottomLayerAnimation': '底層動圖',
    'enable': '啟用',
    'selectAnimation': '選擇動圖',
    'uploadCustom': '上傳自訂TGS檔案',
    'selectFile': '選擇檔案',
    'tgsFormatOnly': '僅支援 .tgs 格式的動畫檔案',
    'animationSaved': '✓ 設定已自動儲存',
    'customAnimationSaved': '{layer} 層自訂動圖已儲存',
    'capsuleTips': '提示',
    'capsuleTipsContent': '• <strong>膠囊容器</strong>：一個橫向的按鈕容器，多個容器會向上疊加<br>• <strong>按鈕名稱</strong>：按鈕上顯示的文字<br>• <strong>URL</strong>：要開啟的網址，使用 {word} 作為目前單字的佔位符<br>• <strong>開啟方式</strong>：<br>&nbsp;&nbsp;- 新分頁：在瀏覽器新分頁中開啟<br>&nbsp;&nbsp;- iframe彈窗：在目前頁面的彈窗中以iframe形式開啟<br>&nbsp;&nbsp;- 新視窗：在新的瀏覽器視窗中開啟<br>&nbsp;&nbsp;- 側邊欄：在瀏覽器側邊欄中開啟<br>• <strong>範例</strong>：<br>&nbsp;&nbsp;容器1：[Google圖片] [維基百科] [詞典]<br>&nbsp;&nbsp;容器2：[YouTube] [翻譯]<br>• <strong>範例URL</strong>：https://www.google.com/search?q={word}&tbm=isch',
    'afdianAccount': '愛發電帳號',
    'kumaAccount': 'Kuma帳號(建設中)',
    'ohmygptAccount': 'Ohmygpt帳號',
    'userId': '使用者ID:',
    'accessToken': '存取權杖:',
    'verifyAccount': '驗證帳號',
    'featureUnderConstruction': '此功能正在建設中，敬請期待！',
    'minimaxiVoiceId': '音色ID',
    'minimaxiModel': 'Modell',
    'minimaxiSpeed': '語速',
    'aiChannelLabel': 'AI 頻道:',
    'aiChannelDiy': '自訂（Custom API ）',
    'aiChannelOhmygpt': 'OhMyGpt（需授權登入）',
    'apiSidebar': '側邊欄解析',
    'apiYoutubeCaption': 'YouTube字幕處理',
    'apiYoutubeCaptionSettings': 'YouTube字幕處理設定',
    'youtubeCaptionPrompt': 'YouTube字幕處理AI提示詞:',
    'ttsBasicSettings': 'TTS 基本設定',
    'startDate': '開始日期',
    'endDate': '結束日期',
    'filterToday': '當日',
    'filterYesterday': '昨日',
    'filterThisWeek': '本週',
    'filterThisMonth': '本月',
    'filterNoDate': '無日期單字',
    'dateFilterWarning': '匯入的單字可能沒有時間資料，篩選結果可能不準。請忽略時間資料統計已知單字。',
    'filterByStatusOnly': '僅篩選單字狀態',
    'pastDays': '往前天數',
    'applyPastDays': '套用',
    'wordStats': '學習統計',
    'wordStatsTitle': '單字學習統計',
    'dailyNewWords': '每日新詞數量',
    'timeRange': '時間範圍',
    'allTime': '全部時間',
    'thisYear': '本年',
    'customRange': '自訂範圍',
    'applyRange': '套用範圍',
    'statusFilter': '狀態篩選',
    'chartType': '圖表類型',
    'lineChart': '折線圖',
    'barChart': '長條圖',
    'statusFilterMinOne': '請至少選擇一種單字狀態',
    'derivativeOrder': '導數階數',
    'derivativeOrder0': '原始資料 (0階)',
    'derivativeOrder1': '一階導數 (變化率)',
    'derivativeOrder2': '二階導數 (加速度)',
    'cloudServerConfig': '伺服器設定',
    'cloudServerUrlLabel': '伺服器 URL:',
    'cloudDbEnabledLabel': '啟用雲端資料庫(請勿開啟，除非您已登入。關閉以使用本地資料庫)',
    'cloudDualWriteLabel': '啟用雙寫（同時寫入本地和雲端）',
    'cloudAccountManagement': '帳號管理',
    'cloudSelfHostedLabel': '自建伺服器（進階）',
    'cloudSelfHostedHint': '如果您執行自己的伺服器，請啟用此項。否則，請保持關閉以使用官方雲端服務。',
    'cloudUsernameLabel': '使用者名稱:',
    'cloudPasswordLabel': '密碼:',
    'cloudEmailLabel': '電子郵件:',
    'cloudLoginBtn': '登入',
    'cloudRegisterBtn': '註冊',
    'cloudRegisterSubmitBtn': '建立帳號',
    'cloudCancelBtn': '取消',
    'cloudLogoutBtn': '登出',
    'cloudRefreshInfoBtn': '重新整理資訊',
    'cloudRefreshAfdianBtn': '重新整理愛發電狀態',
    'cloudDataMigration': '資料遷移',
    'cloudMigrateLocalToCloudBtn': '📤 上傳本地資料庫到雲端（合併）',
    'cloudMigrateLocalToCloudReplaceBtn': '⚠️ 上傳本地資料庫到雲端（替換）',
    'cloudMigrateCloudToLocalBtn': '📥 下載雲端資料庫到本地（合併）',
    'cloudMigrateCloudToLocalReplaceBtn': '⚠️ 下載雲端資料庫到本地（替換）',
    'cloudServerHealth': '伺服器健康檢查',
    'cloudHealthCheckBtn': '🏥 檢查伺服器狀態',
    'webdavActions': 'WebDAV 同步與備份',
    'webdavWordsSync': 'Webdav 單字同步 | Words Sync',
    'webdavCredentials': 'WebDAV 憑證',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': '帳號:',
    'webdavPasswordLabel': '密碼:',
    'webdavUploadSyncBtn': '1️⃣ 裝置A 上傳同步資料庫（覆蓋雲端）；例如電腦上傳',
    'webdavDownloadMergeBtn': '2️⃣ 裝置B 下載同步資料庫（合併本地）；這邊手機下載合併',
    'webdavDownloadReplaceBtn': '⚠️ 裝置B 下載同步資料庫（替換本地）；完全覆蓋本地',
    'webdavUploadBackupBtn': '♻️ 僅上傳備份檔案，可多次',
    'multiDeviceSettings': '多裝置設定檔同步 Multi-Device Settings Sync',
    'webdavClearDbBtn': '清空本地資料庫',
    'confirmClearDatabase': '確定要清空本地所有單字資料嗎？此操作無法復原！',
    'webdavClearingDb': '正在清空本地資料庫...',
    'webdavClearDbSuccess': '本地資料庫已清空！',
    'webdavClearDbError': '清空本地資料庫失敗',
    'unknownError': '發生未知錯誤',
    'cloudLoggedInAs': '已登入為:',
    'cloudSubscriptionStatus': '訂閱狀態:',
    'cloudExpiresAt': '到期時間:',
    'cloudDataServer': '資料伺服器:',
    'cloudAfdianId': '愛發電 ID:',
    'cloudPlanName': '方案:',
    'cloudStorage': '儲存空間:',
    'donateButton': '愛發電(afdian)',
    'donationNote1': `
Lingkuma完全開源免費，軟體維護不易，如果您感覺該軟體對你有幫助，歡迎透過<a href="https://afdian.com/a/lingkuma" target="_blank">愛發電</a>，或微信掃碼贊助。
<br>單字預設存放在本地，捐贈後可使用官方公益單字即時雲端同步，多裝置無縫使用。（外掛設定因內涵API等敏感資訊，目前僅支援使用者自己透過Webdav進行多裝置同步）
    `,
    'donationNote2': 
`您仍可透過以下方式免費進行同步
<br>1. 透過【堅果雲 Webdav】進行免費多裝置同步，但非即時，多裝置必須手動上傳和下載。
<br>2. 存取<a href="https://shared-server.lingkuma.org" target="_blank">【公益伺服器列表】</a>使用網友提供的伺服器；
<br>3. 透過官方Docker在本地或伺服器自建同步服務；
`,
    'donationNote3': '如果使用中遇到困難，可以查閱<a href="https://docs.lingkuma.org/">使用說明</a>、觀看我的<a href="https://tp-videos.lingkuma.org/">影片</a>，也歡迎加入<a href="https://tp-contact.lingkuma.org/">社群</a>。',
    'donationNote4': '感謝使用Lingkuma，希望能夠幫助您更順暢的學習。'

  },
  'en': {
    'databaseOperations': 'Database Operations',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': 'Server Configuration',
    'cloudServerUrlLabel': 'Server URL:',
    'cloudDbEnabledLabel': 'Enable Cloud Database(DO NOT TURN ON, Unless your are logged in. Turn off to use local database)',
    'cloudDualWriteLabel': 'Enable Dual Write (Write to both local and cloud)',
    'cloudAccountManagement': 'Account Management',
    'cloudSelfHostedLabel': 'Self-hosted Server (Advanced)',
    'cloudSelfHostedHint': 'Enable this if you are running your own server. Otherwise, leave it off to use the official cloud service.',
    'webdavSettings': 'WebDav',
    'wordList': 'Word List',
    'cloudWordList': 'Cloud Database List',
    'cloudWordListDesc': 'Access your cloud database word list',
    'officialServer': 'Official Server',
    'customServer': 'Custom Server',
    'customServerNotConfigured': 'Please configure custom server URL in Cloud Database settings first',
    'customServerNotEnabled': 'Please enable self-hosted server mode in Cloud Database settings first',
    'accessCustomServer': 'Access Custom Server',
    'importWords': 'Import Words',
    'backup': 'Backup/Restore',
    'apiConfig': 'API Configuration',
    'ttsConfig': 'TTS Configuration',
    'epubTextFix': 'EPUB Text Fix',
    'epubSplitter': 'EPUB Splitter',
    'epubToTelegraphName': 'EPUB to Telegra.ph', // 新增翻译
    'epubRomanCleanName': 'EPUB Roman Clean', // 新增翻译
    'openPopup': 'Open Popup',
    'knownWords': 'Local - Known Words',
    'wordStats': 'Learning Statistics',
    'wordOperations': 'Word Database Operations',
    'wordOperationsTitle': 'Word Database Operations',
    'sentenceManagement': 'Sentence Management',
    'currentDbSize': 'Current Database Size',
    'totalSentences': 'Total Sentences',
    'sentenceDeleteOptions': 'Sentence Deletion Options',
    'deleteAllSentences': 'Delete All Sentences',
    'keepNSentences': 'Keep First N Sentences per Word',
    'keepCount': 'Keep Count',
    'databaseManagement': 'Database Management',
    'clearLocalDb': 'Clear Local Database',
    'resetPhrasesDb': 'Reset Phrase Database',
    'resetPhrasesDbHint': 'If you cleared the word database and re-imported, you may need to create a new phrase cache from the new database.',
    'resetPhrasesDbSuccess': 'Phrase database reset successfully!',
    'resetPhrasesDbError': 'Failed to reset phrase database',
    'confirmResetPhrasesDb': 'Are you sure you want to reset the phrase database? This will clear the existing phrase cache and recreate it from the main database.',
    'refreshDbSize': 'Refresh Database Info',
    'executeSentenceOperation': 'Execute Sentence Deletion',
    'language': 'Language',
    'status': 'Status',
    'all': 'All',
    'zh': 'Chinese',
    'en': 'English',
    'de': 'German',
    'fr': 'French',
    'es': 'Spanish',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ru': 'Russian',
    'custom': 'Custom',
    'known': 'Known (0)',
    'learning': 'Learning (1) (Yellow Highlight)',
    'familiar': 'Familiar (2) (Light Yellow Highlight)',
    'recognized': 'Recognized (3) (Gray Highlight)',
    'almostMastered': 'Almost Mastered (4) (Underline)',
    'fullyMastered': 'Fully Mastered (5) (No Highlight)',
    'itemsPerPage': 'Items per page',
    'applyFilter': 'Apply Filter',
    'prevPage': 'Previous',
    'nextPage': 'Page {current} of {total}',
    'nextBtn': 'Next',
    'importTxt': 'Import TXT Words',
    'separator': 'Separator',
    'newline': 'Newline',
    'comma': 'Comma',
    'wordStatus': 'Word Status',
    // Tooltip background settings translations
    'tooltipSettings': 'Tooltip Settings',
    'tooltipThemeSettings': 'Tooltip Theme Settings',
    'tooltipThemeMode': 'Tooltip Theme Mode',
    'autoDetect': 'Auto-detect (Follow Webpage)',
    'lightMode': 'Fixed Light Theme',
    'darkMode': 'Fixed Dark Theme',
    'backgroundDisplayOptions': 'Background Display Options',
    'enableTooltipBackground': 'Enable Background Effect',
    'backgroundType': 'Background Type',
    'defaultBackground': 'Use Built-in Background',
    'customBackground': 'Use Custom Background',
    'defaultBackgroundType': 'Built-in Background Type',
    'imageBackground': 'Random Image Background',
    'svgBackground': 'Random SVG Pattern',
    'videoBackground': 'Default Video Background',
    'specificBackground': 'Specific Built-in Background',
    'builtInBackgroundPreview': 'Built-in Background Preview',
    'customBackgroundFile': 'Upload Background File (Images and Videos Supported)',
    'supportedFormats': 'Supported formats: PNG, JPEG, GIF, SVG, MP4, WebM, OGG',
    'preview': 'Preview',
    'autoSaveHint': 'Settings are automatically saved',
    'tips': 'Tips',
    'backgroundNote': '• Tooltip Theme Mode: Auto-detect adjusts based on the webpage\'s theme, while fixed modes always use the selected theme\n• Background effects appear behind the tooltip content and won\'t affect text readability\n• Video backgrounds will automatically loop and are muted\n• Image and video opacity is adjusted for optimal reading experience\n• Large files may impact performance',
    // Glass effect settings translations
    'glassEffectSettings': 'Glass Material Settings',
    'glassEffectType': 'Glass Effect Type',
    'glassEffectPreview': 'Effect Preview',
    'glassEffectAutoSave': 'Settings are automatically saved and applied to tooltip',
    'glassEffectLiquid': 'Liquid Glass (Liquid) ⚠️Laggy, not recommended',
    'glassEffectFractal': 'Fractal Noise (Fractal)',
    'glassEffectFlip': 'Flip (Flip)',
    'glassEffectRgbSplit': 'RGB Split (RGB Split)',
    'glassEffectPixel': 'Pixelated (Pixel)',
    'glassEffectFluted': 'Fluted (Fluted)',
    'glassEffectTiled': 'Tiled (Tiled)',
    'glassEffectMosaic': 'Mosaic (Mosaic)',
    'glassEffectEllipses': 'Ellipses (Ellipses)',
    'glassEffectRough': 'Rough (Rough)',
    'glassEffectBulge': 'Bulge (Bulge)',
    'delete': 'Delete (0)',
    'parallelBatches': 'Parallel Batches',
    'wordsPerBatch': 'Words Per Batch',
    'import': 'Import Words',
    'clearList': 'Clear Word List',
    'dbBackup': 'Database Backup & Restore',
    'wordDbBackup': 'Word Database Backup',
    'backupDb': 'Download Backup Word Database',
    'downloadBackup': 'Click to download backup file',
    'importBackup': 'Import Database Backup',
    'configBackup': 'Configuration Backup',
    'backupConfig': 'Backup Configuration',
    'downloadConfigBackup': 'Click to download config backup file',
    'importConfigBackup': 'Import Configuration Backup',
    'customLangCode': 'Custom Language Code',
    'enterIsoCode': 'Enter ISO 639-1 language code',
    'isoCodeHint': 'Please enter ISO 639-1 standard two-letter language code, e.g.: en, de, fr, etc.',
    'ttsChannelSelect': 'TTS Channel Selection',
    'wordTtsChannel': 'Word Pronunciation Channel',
    'sentenceTtsChannel': 'Sentence Pronunciation Channel',
    'localTts': 'Local TTS',
    'edgeTts': 'Edge TTS',
    'edgeTtsConfig': 'Edge TTS Configuration',
    'edgeTtsAutoVoice': 'Auto-select voice (based on language)',
    'edgeTtsVoice': 'Select Voice',
    'edgeTtsRate': 'Speech Rate (-100% to +100%)',
    'edgeTtsVolume': 'Volume (-100% to +100%)',
    'edgeTtsPitch': 'Pitch (-50% to +50%)',
    'testEdgeTts': 'Test Edge TTS',
    'customUrl': 'Custom URL',
    // Custom Capsules translations
    'customCapsules': 'Custom Capsules',
    'customCapsulesSettings': 'Custom Capsules Settings',
    'customCapsulesDescription': 'Customize capsule containers and buttons',
    'customCapsulesHelp': '<strong>Capsule Container</strong>: Each capsule container is a row that can contain multiple buttons. Multiple capsule containers stack upward.<br><strong>Button</strong>: Each button is a search trigger that opens a specified URL when clicked. The <code>{word}</code> in the URL will be replaced with the current word.',
    'addCapsuleContainer': '+ Add Capsule Container',
    'noCapsulesYet': 'No capsule containers added yet, click the button below to add',
    'capsuleContainer': 'Capsule Container',
    'buttonName': 'Button Name',
    'buttonUrl': 'URL',
    'buttonIcon': 'Icon',
    'buttonIconPlaceholder': 'Optional, leave empty to use default icon',
    'buttonOpenMethod': 'Open Method',
    'openMethodNewTab': 'New Tab',
    'openMethodIframe': 'iframe Popup',
    'openMethodNewWindow': 'New Window',
    'openMethodSidebar': 'Sidebar',
    'newButton': 'New Button',
    'addButton': '+ Add Button',
    'deleteContainer': 'Delete Container',
    'deleteButton': 'Delete Button',
    'noButtonsYet': 'This container has no buttons yet, click "Add Button" to add',
    'autoSavedCapsule': '✓ Auto saved',
    'capsuleAutoSaveHint': '✓ Settings are automatically saved',
    'confirmDeleteContainer': 'Are you sure you want to delete this capsule container?',
    'confirmDeleteButton': 'Are you sure you want to delete this button?',
    // Known Sentence Animation translations
    'knownSentenceAnimation': 'Known Sentence Animation',
    'knownSentenceAnimationSettings': 'Known Sentence Animation Settings',
    'animationDescription': 'Sentence explosion known sentence effect animation configuration',
    'animationHelp': 'Configure the animation displayed when there are no unknown words in a sentence. You can set top and bottom layer animations, supporting preset animations or uploading custom TGS files.',
    'animationSize': 'Animation Size',
    'animationWidth': 'Width',
    'animationHeight': 'Height',
    'animationDefaultSize': 'Default: 150x150px',
    'topLayerAnimation': 'Top Layer Animation',
    'bottomLayerAnimation': 'Bottom Layer Animation',
    'enable': 'Enable',
    'selectAnimation': 'Select Animation',
    'uploadCustom': 'Upload Custom TGS File',
    'selectFile': 'Select File',
    'tgsFormatOnly': 'Only .tgs format animation files are supported',
    'animationSaved': '✓ Settings auto saved',
    'customAnimationSaved': '{layer} layer custom animation saved',
    'capsuleTips': 'Tips',
    'capsuleTipsContent': '• <strong>Capsule Container</strong>: A horizontal button container, multiple containers stack upward<br>• <strong>Button Name</strong>: Text displayed on the button<br>• <strong>URL</strong>: The URL to open, use {word} as placeholder for current word<br>• <strong>Open Method</strong>:<br>&nbsp;&nbsp;- New Tab: Open in a new browser tab<br>&nbsp;&nbsp;- iframe Popup: Open in an iframe popup on current page<br>&nbsp;&nbsp;- New Window: Open in a new browser window<br>&nbsp;&nbsp;- Sidebar: Open in browser sidebar<br>• <strong>Example</strong>:<br>&nbsp;&nbsp;Container 1: [Google Images] [Wikipedia] [Dictionary]<br>&nbsp;&nbsp;Container 2: [YouTube] [Translate]<br>• <strong>Example URL</strong>: https://www.google.com/search?q={word}&tbm=isch',
    'localTtsConfig': 'Local TTS Configuration',
    'defaultVoice': 'Default Voice',
    'autoSelect': 'Auto Select',
    'speechRate': 'Speech Rate (0.1-2.0)',
    'pitch': 'Pitch (0.1-2.0)',
    'testLocalTts': 'Test Local TTS',
    'enableWordTts': 'Enable Word TTS',
    'enableSentenceTts': 'Enable Sentence TTS',
    'customAudioUrlConfig': 'Custom Audio URL Configuration',
    'urlTemplate': 'URL Template',
    'urlTemplateHint': 'Available variables: {lang}, {word}<br>Available functions: {encodeURIComponent()}, {utf8ToBase64()}<br>Example: https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>You can use your own API, or APIs built by others that return mp3 audio.',
    'apiSettings': 'API Configuration',
    'apiBaseUrl': 'Custom API Base URL: example: https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'API Key:',
    'model': 'Model:',
    'activeProfileLabel': 'Active Config:',
    'addProfileBtn': '+ Add Config',
    'profileName': 'Config Name:',
    'enableApiPollingLabel': 'Enable Polling',
    'profileEnablePollingLabel': 'Participate in Polling',
    'languageDetectionPrompt': 'Language Detection AI Prompt:',
    'tagAnalysisPrompt': 'Part of Speech Analysis Prompt:',
    'wordExplanationPrompt': 'Word Explanation AI Prompt:',
    'wordExplanation2Prompt': 'Second Word Explanation AI Prompt:',
    'sentenceTranslationPrompt': 'Example Sentence Translation Prompt:',
    'sentenceAnalysisPrompt': 'Sentence Analysis AI Prompt:',
    'sidebarAnalysisPrompt': 'Sidebar AI Analysis Prompt:',
    'restoreDefault': 'Restore Default',
    'autoSaved': 'Auto Saved',
    'minimaxiTtsConfig': 'Minimaxi TTS API Configuration',
    'groupId': 'Group ID:',
    'enterGroupId': 'Please enter Group ID',
    'enterApiKey': 'Please enter API Key',
    'saved': 'Saved',
    'apiUrlPlaceholder': 'https://api.example.com/v1/chat/completions',
    'apiKeyPlaceholder': 'sk-xxxxxxxx',
    'modelPlaceholder': 'Please enter model name',
    'apiBasic': 'Basic Settings',
    'apiLanguageDetection': 'Language Detection',
    'apiTagAnalysis': 'Part of Speech',
    'apiWordExplanation': 'Word Explanation',
    'apiWordExplanation2': 'Second Word Explanation',
    'apiSentenceTranslation': 'Sentence Translation',
    'apiAnalysis': 'Sentence Analysis',
    'apiSidebar': 'Sidebar Analysis',
    'apiBasicSettings': 'API Basic Settings',
    'apiLanguageDetectionSettings': 'Language Detection Settings',
    'apiTagAnalysisSettings': 'Part of Speech Settings',
    'apiWordExplanationSettings': 'Word Explanation Settings',
    'apiSentenceTranslationSettings': 'Sentence Translation Settings',
    'apiAnalysisSettings': 'Sentence Analysis Settings',
    'apiSidebarSettings': 'Sidebar Analysis Settings',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': 'Recommended',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'noteImportant': 'Note Important',
    'ttsBasic': 'Basic Settings',
    'ttsLocal': 'Local TTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': 'Custom URL',
    'ttsBasicSettings': 'TTS Basic Settings',
    'testMinimaxi': 'Test Minimaxi',
    'testCustomUrl': 'Test Custom URL1',
    'testCustomUrl2': 'Test Custom URL2',
    'about': 'About',
    'subscriptionManagement': 'Subscription Management',
    'afdianAccount': 'Afdian Account',
    'kumaAccount': 'Kuma Account  ',
    'ohmygptAccount': 'Ohmygpt Account',
    'userId': 'User ID:',
    'accessToken': 'Access Token:',
    'verifyAccount': 'Verify Account',
    'featureUnderConstruction': 'This feature is under construction. Stay tuned!',
    'minimaxiVoiceId': 'Voice ID',
    'minimaxiModel': 'Model',
    'minimaxiSpeed': 'Speed',
    'aiChannelLabel': 'AI Channel:',
    'aiChannelDiy': 'Custom',
    'aiChannelOhmygpt': 'OhMyGpt',
    // ... existing en translations ...
    'apiSidebar': 'Sidebar Analysis',
    'apiYoutubeCaption': 'YouTube Caption Processing', // 新增
    'apiYoutubeCaptionSettings': 'YouTube Caption Processing Settings', // 新增
    'youtubeCaptionPrompt': 'YouTube Caption Processing AI Prompt:', // 新增
    'ttsBasicSettings': 'TTS Basic Settings',
    'startDate': 'Start Date',
    'endDate': 'End Date',
    'filterToday': 'Today',
    'filterYesterday': 'Yesterday',
    'filterThisWeek': 'This Week',
    'filterThisMonth': 'This Month',
    'filterNoDate': 'Words without Date',
    'dateFilterWarning': 'Imported words may not have time data, filtering results may be inaccurate. Please ignore time data when counting known words.',
    'filterByStatusOnly': 'Filter by Status Only',
    'pastDays': 'Past Days',
    'applyPastDays': 'Apply',
    'wordStats': 'Learning Statistics',
    'wordStatsTitle': 'Word Learning Statistics',
    'dailyNewWords': 'Daily New Words',
    'timeRange': 'Time Range',
    'allTime': 'All Time',
    'thisYear': 'This Year',
    'customRange': 'Custom Range',
    'applyRange': 'Apply Range',
    'statusFilter': 'Status Filter',
    'chartType': 'Chart Type',
    'lineChart': 'Line Chart',
    'barChart': 'Bar Chart',
    'statusFilterMinOne': 'Please select at least one word status',
    'derivativeOrder': 'Derivative Order',
    'derivativeOrder0': 'Original Data (0th)',
    'derivativeOrder1': 'First Derivative (Rate of Change)',
    'derivativeOrder2': 'Second Derivative (Acceleration)',
    // Account management related translations
    'cloudLoggedInAs': 'Logged in as:',
    'cloudSubscriptionStatus': 'Subscription:',
    'cloudExpiresAt': 'Expires:',
    'cloudDataServer': 'Data Server:',
    'cloudAfdianId': 'Afdian ID:',
    'cloudPlanName': 'Plan:',
    'cloudStorage': 'Storage:',
    // Donation related translations
    'donateButton': 'Sponsor',
    'donationNote1': 'Lingkuma is completely open-source and free. Software maintenance is not easy. If you find this software helpful, you are welcome to sponsor via <a href="https://afdian.com/a/lingkuma" target="_blank">Afdian</a> or WeChat QR code.<br>Words are stored locally by default. After donating, you can use the official public real-time cloud sync for words, enabling seamless multi-device usage. (Plugin configuration contains sensitive information like APIs, currently only supports user self-managed multi-device sync via Webdav)',
    'donationNote2': 'You can still sync for free through the following methods:<br>1. Use [Jianguoyun Webdav] for free multi-device sync, but it is not real-time, requiring manual upload and download on multiple devices.<br>2. Visit the <a href="https://shared-server.lingkuma.org" target="_blank">[Public Server List]</a> to use servers provided by the community;<br>3. Set up your own sync service locally or on a server using official Docker;',
    'donationNote3': 'If you encounter difficulties during use, you can check the <a href="https://docs.lingkuma.org/">User Guide</a>, watch my videos, and you are also welcome to join the community.',
    'donationNote4': 'Thank you for using Lingkuma. I hope it can help you learn more smoothly.',
    'cloudServerHealth': 'Server Health Check',
    'cloudHealthCheckBtn': '🏥 Check Server Status',
    'webdavActions': 'WebDAV Sync & Backup',
    'webdavWordsSync': 'Webdav Words Sync',
    'webdavCredentials': 'WebDAV Credentials',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': 'Username:',
    'webdavPasswordLabel': 'Password:',
    'webdavUploadSyncBtn': '1️⃣ Device A Upload Sync Database (Overwrite Cloud); e.g., PC Upload',
    'webdavDownloadMergeBtn': '2️⃣ Device B Download Sync Database (Merge Local); e.g., Phone Download Merge',
    'webdavDownloadReplaceBtn': '⚠️ Device B Download Sync Database (Replace Local); Completely Overwrite Local',
    'webdavUploadBackupBtn': '♻️ Upload Backup File Only, Multiple Times',
    'multiDeviceSettings': 'Multi-Device Settings Sync',
    'webdavClearDbBtn': 'Clear Local Database',
    'confirmClearDatabase': 'Are you sure you want to clear all local word data? This operation cannot be undone!',
    'webdavClearingDb': 'Clearing local database...',
    'webdavClearDbSuccess': 'Local database cleared!',
    'webdavClearDbError': 'Failed to clear local database',
    'unknownError': 'An unknown error occurred'
  },
  'de': {
    'databaseOperations': 'Datenbankoperationen',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': 'Serverkonfiguration',
    'cloudServerUrlLabel': 'Server-URL:',
    'cloudDbEnabledLabel': 'Cloud-Datenbank aktivieren(NICHT EINSCHALTEN, es sei denn, Sie sind eingeloggt. Ausschalten, um die lokale Datenbank zu verwenden)',
    'cloudDualWriteLabel': 'Dual-Write aktivieren (sowohl lokal als auch in die Cloud schreiben)',
    'cloudAccountManagement': 'Kontoverwaltung',
    'cloudSelfHostedLabel': 'Eigener Server (Erweitert)',
    'cloudSelfHostedHint': 'Aktivieren Sie dies, wenn Sie Ihren eigenen Server betreiben. Andernfalls lassen Sie es deaktiviert, um den offiziellen Cloud-Dienst zu nutzen.',
    'webdavSettings': 'WebDav',
    'wordList': 'Wortliste',
    'importWords': 'Wörter importieren',
    'backup': 'Sichern/Wiederherstellen',
    'apiConfig': 'API-Konfiguration',
    'ttsConfig': 'TTS-Konfiguration',
    'epubTextFix': 'EPUB-Textreparatur',
    'epubSplitter': 'EPUB-Splitter',
    'epubToTelegraphName': 'EPUB zu Telegra.ph', // 新增翻译
    'openPopup': 'Popup öffnen',
    'epubRomanCleanName': 'EPUB Roman Clean', // 新增翻译
    'knownWords': 'Bekannte Wörter',
    'language': 'Sprache',
    'status': 'Status',
    'all': 'Alle',
    'zh': 'Chinesisch',
    'en': 'Englisch',
    'de': 'Deutsch',
    'fr': 'Französisch',
    'es': 'Spanisch',
    'it': 'Italienisch',
    'ja': 'Japanisch',
    'ko': 'Koreanisch',
    'ru': 'Russisch',
    'custom': 'Benutzerdefiniert',
    'known': 'Bekannt (0)',
    'learning': 'Lernen (1) (Gelbe Hervorhebung)',
    'familiar': 'Vertraut (2) (Hellgelbe Hervorhebung)',
    'recognized': 'Erkannt (3) (Graue Hervorhebung)',
    'almostMastered': 'Fast gemeistert (4) (Unterstrichen)',
    'fullyMastered': 'Vollständig gemeistert (5) (Keine Hervorhebung)',
    'itemsPerPage': 'Einträge pro Seite',
    'applyFilter': 'Filter anwenden',
    'prevPage': 'Vorherige',
    'nextPage': 'Seite {current} von {total}',
    'nextBtn': 'Nächste',
    'importTxt': 'TXT-Wörter importieren',
    'separator': 'Trennzeichen',
    'newline': 'Zeilenumbruch',
    'comma': 'Komma',
    'wordStatus': 'Wortstatus',
    // Tooltip-Hintergrundeinstellungen Übersetzungen
    'tooltipSettings': 'Tooltip-Einstellungen',
    'tooltipThemeSettings': 'Tooltip-Theme-Einstellungen',
    'tooltipThemeMode': 'Tooltip-Theme-Modus',
    'autoDetect': 'Automatische Erkennung (Webseite folgen)',
    'lightMode': 'Festes helles Theme',
    'darkMode': 'Festes dunkles Theme',
    'backgroundDisplayOptions': 'Hintergrundanzeigeoptionen',
    'enableTooltipBackground': 'Hintergrundeffekt aktivieren',
    'backgroundType': 'Hintergrundtyp',
    'defaultBackground': 'Integrierten Hintergrund verwenden',
    'customBackground': 'Benutzerdefinierten Hintergrund verwenden',
    'defaultBackgroundType': 'Integrierter Hintergrundtyp',
    'imageBackground': 'Zufälliger Bildhintergrund',
    'svgBackground': 'Zufälliges SVG-Muster',
    'videoBackground': 'Standard-Videohintergrund',
    'specificBackground': 'Spezifischer integrierter Hintergrund',
    'builtInBackgroundPreview': 'Integrierte Hintergrundvorschau',
    'customBackgroundFile': 'Hintergrunddatei hochladen (Bilder und Videos unterstützt)',
    'supportedFormats': 'Unterstützte Formate: PNG, JPEG, GIF, SVG, MP4, WebM, OGG',
    'preview': 'Vorschau',
    'autoSaveHint': 'Einstellungen werden automatisch gespeichert',
    'tips': 'Tipps',
    'backgroundNote': '• Tooltip-Theme-Modus: Automatische Erkennung passt sich an das Theme der Webseite an, während feste Modi immer das ausgewählte Theme verwenden\n• Hintergrundeffekte erscheinen hinter dem Tooltip-Inhalt und beeinträchtigen nicht die Lesbarkeit des Textes\n• Videohintergründe werden automatisch in Schleife abgespielt und sind stummgeschaltet\n• Die Deckkraft von Bildern und Videos ist für optimale Lesbarkeit angepasst\n• Große Dateien können die Leistung beeinträchtigen',
    'delete': 'Löschen (0)',
    'parallelBatches': 'Parallele Batches',
    'wordsPerBatch': 'Wörter pro Batch',
    'import': 'Wörter importieren',
    'clearList': 'Wortliste löschen',
    'dbBackup': 'Datenbank sichern & wiederherstellen',
    'wordDbBackup': 'Wortdatenbank-Backup',
    'backupDb': 'Wortdatenbank sichern',
    'downloadBackup': 'Klicken, um die Sicherungsdatei herunterzuladen',
    'importBackup': 'Datenbank-Backup importieren',
    'configBackup': 'Konfigurationssicherung',
    'backupConfig': 'Konfiguration sichern',
    'downloadConfigBackup': 'Klicken, um die Konfigurationssicherungsdatei herunterzuladen',
    'importConfigBackup': 'Konfigurationssicherung importieren',
    'customLangCode': 'Benutzerdefinierter Sprachcode',
    'enterIsoCode': 'ISO 639-1 Sprachcode eingeben',
    'isoCodeHint': 'Bitte geben Sie den ISO 639-1 Standard Zwei-Buchstaben-Sprachcode ein, z.B.: en, de, fr, usw.',
    'ttsChannelSelect': 'TTS-Kanalauswahl',
    'wordTtsChannel': 'Wort Aussprache Kanal',
    'sentenceTtsChannel': 'Satz Aussprache Kanal',
    'localTts': 'Lokale TTS',
    'customUrl': 'Benutzerdefinierte URL',
    'localTtsConfig': 'Lokale TTS-Konfiguration',
    'defaultVoice': 'Standardstimme',
    'autoSelect': 'Automatische Auswahl',
    'speechRate': 'Sprachrate (0.1-2.0)',
    'pitch': 'Tonhöhe (0.1-2.0)',
    'testLocalTts': 'Lokale TTS testen',
    'enableWordTts': 'Wort-TTS aktivieren',
    'enableSentenceTts': 'Satz-TTS aktivieren',
    'customAudioUrlConfig': 'Benutzerdefinierte Audio-URL-Konfiguration',
    'urlTemplate': 'URL-Vorlage',
    'urlTemplateHint': 'Verfügbare Variablen: {lang}, {word}<br>Verfügbare Funktionen: {encodeURIComponent()}, {utf8ToBase64()}<br>Beispiel: https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>Sie können Ihre eigene API oder von anderen erstellte APIs verwenden, die MP3-Audio zurückgeben.',
    'apiSettings': 'API-Konfiguration',
    'apiBaseUrl': 'API-Basis-URL: Beispiel: https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'API-Schlüssel:',
    'model': 'Modell:',
    'activeProfileLabel': 'Aktive Konfiguration:',
    'addProfileBtn': '+ Konfiguration hinzufügen',
    'profileName': 'Konfigurationsname:',
    'profileEnablePollingLabel': 'An der Umfrage teilnehmen',
    'languageDetectionPrompt': 'KI-Eingabeaufforderung zur Spracherkennung:',
    'tagAnalysisPrompt': 'Stichwortanalyse-Eingabeaufforderung:',
    'wordExplanationPrompt': 'KI-Eingabeaufforderung zur Worterklärung:',
    'wordExplanation2Prompt': 'Zweite KI-Eingabeaufforderung zur Worterklärung:',
    'sentenceTranslationPrompt': 'Beispielsatz-Übersetzungsaufforderung:',
    'sentenceAnalysisPrompt': 'Satzanalyse-KI-Eingabeaufforderung:',
    'sidebarAnalysisPrompt': 'Seitenleisten-KI-Analyseaufforderung:',
    'restoreDefault': 'Standard wiederherstellen',
    'autoSaved': 'Automatisch gespeichert',
    'minimaxiTtsConfig': 'Minimaxi TTS API-Konfiguration',
    'groupId': 'Gruppen-ID:',
    'enterGroupId': 'Bitte Gruppen-ID eingeben',
    'enterApiKey': 'Bitte API-Schlüssel eingeben',
    'saved': 'Gespeichert',
    'apiUrlPlaceholder': 'https://api.example.com/v1/chat/completions',
    'apiKeyPlaceholder': 'sk-xxxxxxxx',
    'modelPlaceholder': 'Bitte Modellnamen eingeben',
    'apiBasic': 'Grundeinstellungen',
    'apiLanguageDetection': 'Spracherkennung',
    'apiTagAnalysis': 'Stichwortanalyse',
    'apiWordExplanation': 'Worterklärung',
    'apiWordExplanation2': 'Zweite Worterklärung',
    'apiSentenceTranslation': 'Satzübersetzung',
    'apiAnalysis': 'Satzanalyse',
    'apiSidebar': 'Seitenleistenanalyse',
    'apiBasicSettings': 'API-Grundeinstellungen',
    'apiLanguageDetectionSettings': 'Einstellungen zur Spracherkennung',
    'apiTagAnalysisSettings': 'Einstellungen zur Stichwortanalyse',
    'apiWordExplanationSettings': 'Einstellungen zur Worterklärung',
    'apiSentenceTranslationSettings': 'Einstellungen zur Satzübersetzung',
    'apiAnalysisSettings': 'Einstellungen zur Satzanalyse',
    'apiSidebarSettings': 'Einstellungen zur Seitenleistenanalyse',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': 'Empfohlen',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'noteImportant': 'Wichtiger Hinweis',
    'ttsBasic': 'Grundeinstellungen',
    'ttsLocal': 'Lokale TTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': 'Benutzerdefinierte URL',
    'ttsBasicSettings': 'TTS-Grundeinstellungen',
    'testMinimaxi': 'Test Minimaxi',
    'testCustomUrl': 'Benutzerdefinierte URL1 testen',
    'testCustomUrl2': 'Benutzerdefinierte URL2 testen',
    'about': 'Über',
    "popupTitle": "Einstellungen",
    'minimaxiVoiceId': 'Sprach-ID',
    'minimaxiModel': 'Modell',
    'minimaxiSpeed': 'Geschwindigkeit',
    'aiChannelLabel': 'AI Channel:',
    'aiChannelDiy': 'Custom',
    'aiChannelOhmygpt': 'OhMyGpt',
    'apiSidebar': 'Seitenleistenanalyse',
    'apiYoutubeCaption': 'YouTube-Untertitelverarbeitung', // 新增
    'apiYoutubeCaptionSettings': 'YouTube-Untertitelverarbeitungseinstellungen', // 新增
    'youtubeCaptionPrompt': 'YouTube-Untertitelverarbeitung AI-Eingabeaufforderung:', // 新增
    'ttsBasicSettings': 'TTS-Grundinstellungen',
    'startDate': 'Startdatum',
    'endDate': 'Enddatum',
    'filterToday': 'Heute',
    'filterYesterday': 'Gestern',
    'filterThisWeek': 'Diese Woche',
    'filterThisMonth': 'Dieser Monat',
    'filterNoDate': 'Wörter ohne Datum',
    'dateFilterWarning': 'Importierte Wörter haben möglicherweise keine Zeitdaten, Filterergebnisse können ungenau sein. Bitte ignorieren Sie Zeitdaten beim Zählen bekannter Wörter.',
    'filterByStatusOnly': 'Nur nach Status filtern',
    'pastDays': 'Vergangene Tage',
    'applyPastDays': 'Anwenden',
    'wordStats': 'Lernstatistik',
    'wordStatsTitle': 'Wortlernstatistik',
    'dailyNewWords': 'Tägliche neue Wörter',
    'timeRange': 'Zeitraum',
    'allTime': 'Gesamte Zeit',
    'thisYear': 'Dieses Jahr',
    'customRange': 'Benutzerdefinierter Bereich',
    'applyRange': 'Bereich anwenden',
    'statusFilter': 'Statusfilter',
    'chartType': 'Diagrammtyp',
    'lineChart': 'Liniendiagramm',
    'barChart': 'Balkendiagramm',
    'statusFilterMinOne': 'Bitte wählen Sie mindestens einen Wortstatus aus',
    'derivativeOrder': 'Ableitungsordnung',
    'derivativeOrder0': 'Originaldaten (0. Ordnung)',
    'derivativeOrder1': 'Erste Ableitung (Änderungsrate)',
    'derivativeOrder2': 'Zweite Ableitung (Beschleunigung)',
    // Account management related translations
    'cloudLoggedInAs': 'Angemeldet als:',
    'cloudSubscriptionStatus': 'Abonnement:',
    'cloudExpiresAt': 'Läuft ab:',
    'cloudDataServer': 'Datenserver:',
    'cloudAfdianId': 'Afdian ID:',
    'cloudPlanName': 'Plan:',
    'cloudStorage': 'Speicher:',
    // Spendenbezogene Übersetzungen
    'donateButton': 'Sponsor',
    'donationNote1': 'Lingkuma ist vollständig Open-Source und kostenlos. Die Softwarewartung ist nicht einfach. Wenn Sie diese Software hilfreich finden, sind Sie herzlich eingeladen, über <a href="https://afdian.com/a/lingkuma" target="_blank">Afdian</a> oder WeChat-QR-Code zu spenden.<br>Wörter werden standardmäßig lokal gespeichert. Nach der Spende können Sie den offiziellen öffentlichen Echtzeit-Cloud-Sync für Wörter nutzen, was nahtlose Multi-Geräte-Nutzung ermöglicht. (Plugin-Konfiguration enthält sensible Informationen wie APIs, derzeit unterstützt nur benutzergesteuerte Multi-Geräte-Sync über Webdav)',
    'donationNote2': 'Sie können weiterhin kostenlos über die folgenden Methoden synchronisieren:<br>1. Nutzen Sie [Jianguoyun Webdav] für kostenlose Multi-Geräte-Synchronisierung, aber nicht in Echtzeit, erfordert manuellen Upload und Download auf mehreren Geräten.<br>2. Besuchen Sie die <a href="https://shared-server.lingkuma.org" target="_blank">[Öffentliche Serverliste]</a>, um Server der Community zu nutzen;<br>3. Richten Sie Ihren eigenen Synchronisierungsdienst lokal oder auf einem Server mit dem offiziellen Docker ein;',
    'donationNote3': 'Wenn Sie während der Nutzung Schwierigkeiten haben, können Sie das <a href="https://docs.lingkuma.org/">Benutzerhandbuch</a> lesen, meine Videos ansehen und sind herzlich eingeladen, der Community beizutreten.',
    'donationNote4': 'Vielen Dank für die Nutzung von Lingkuma. Ich hoffe, es kann Ihnen beim Lernen helfen.',
    'cloudServerHealth': 'Server-Statusprüfung',
    'cloudHealthCheckBtn': '🏥 Server-Status prüfen',
    'webdavActions': 'WebDAV-Synchronisierung & Sicherung',
    'webdavWordsSync': 'Webdav Wortsynchronisation',
    'webdavCredentials': 'WebDAV-Zugangsdaten',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': 'Benutzername:',
    'webdavPasswordLabel': 'Passwort:',
    'webdavUploadSyncBtn': '1️⃣ Gerät A Synchronisationsdatenbank hochladen (Cloud überschreiben); z. B. PC-Upload',
    'webdavDownloadMergeBtn': '2️⃣ Gerät B Synchronisationsdatenbank herunterladen (lokal zusammenführen); z. B. Telefon-Download zusammenführen',
    'webdavDownloadReplaceBtn': '⚠️ Gerät B Synchronisationsdatenbank herunterladen (lokal ersetzen); Lokal vollständig überschreiben',
    'webdavUploadBackupBtn': '♻️ Nur Sicherungsdatei hochladen, mehrfach möglich',
    'multiDeviceSettings': 'Multi-Geräte-Einstellungssynchronisation',
    'webdavClearDbBtn': 'Lokale Datenbank löschen',
    'confirmClearDatabase': 'Möchten Sie alle lokalen Wortdaten wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden!',
    'webdavClearingDb': 'Lösche lokale Datenbank...',
    'webdavClearDbSuccess': 'Lokale Datenbank gelöscht!',
    'webdavClearDbError': 'Löschen der lokalen Datenbank fehlgeschlagen',
    'unknownError': 'Ein unbekannter Fehler ist aufgetreten'
  },
  'fr': {
    'databaseOperations': 'Opérations de base de données',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': 'Configuration du serveur',
    'cloudServerUrlLabel': 'URL du serveur:',
    'cloudDbEnabledLabel': 'Activer la base de données cloud(NE PAS ACTIVER, sauf si vous êtes connecté. Désactiver pour utiliser la base de données locale)',
    'cloudDualWriteLabel': 'Activer l\'écriture double (écrire à la fois localement et dans le cloud)',
    'cloudAccountManagement': 'Gestion du compte',
    'cloudSelfHostedLabel': 'Serveur auto-hébergé (Avancé)',
    'cloudSelfHostedHint': 'Activez ceci si vous exécutez votre propre serveur. Sinon, laissez-le désactivé pour utiliser le service cloud officiel.',
    'webdavSettings': 'WebDav',
    'wordList': 'Liste de mots',
    'importWords': 'Importer des mots',
    'backup': 'Sauvegarder/Restaurer',
    'apiConfig': 'Configuration API',
    'ttsConfig': 'Configuration TTS',
    'epubTextFix': 'Réparation de texte EPUB',
    'epubSplitter': 'EPUB Splitter',
    'epubToTelegraphName': 'EPUB vers Telegra.ph', // 新增翻译
    'openPopup': 'Ouvrir la popup',
    'knownWords': 'Mots connus',
    'language': 'Langue',
    'status': 'Statut',
    'all': 'Tous',
    'zh': 'Chinois',
    'en': 'Anglais',
    'de': 'Allemand',
    'fr': 'Français',
    'es': 'Espagnol',
    'it': 'Italien',
    'ja': 'Japonais',
    'ko': 'Coréen',
    'ru': 'Russe',
    'custom': 'Personnalisé',
    'known': 'Connu (0)',
    'learning': 'En apprentissage (1) (Surbrillance jaune)',
    'familiar': 'Familier (2) (Surbrillance jaune clair)',
    'recognized': 'Reconnu (3) (Surbrillance grise)',
    'almostMastered': 'Presque maîtrisé (4) (Souligné)',
    'fullyMastered': 'Totalement maîtrisé (5) (Pas de surbrillance)',
    'itemsPerPage': 'Éléments par page',
    'applyFilter': 'Appliquer le filtre',
    'prevPage': 'Précédent',
    'nextPage': 'Page {current} de {total}',
    'nextBtn': 'Suivant',
    'importTxt': 'Importer des mots TXT',
    'separator': 'Séparateur',
    'newline': 'Nouvelle ligne',
    'comma': 'Virgule',
    'wordStatus': 'Statut du mot',
    // Traductions des paramètres d'arrière-plan de l'infobulle
    'tooltipSettings': 'Paramètres de l\'infobulle',
    'tooltipThemeSettings': 'Paramètres du thème de l\'infobulle',
    'tooltipThemeMode': 'Mode du thème de l\'infobulle',
    'autoDetect': 'Détection automatique (suivre la page web)',
    'lightMode': 'Thème clair fixe',
    'darkMode': 'Thème sombre fixe',
    'backgroundDisplayOptions': 'Options d\'affichage de l\'arrière-plan',
    'enableTooltipBackground': 'Activer l\'effet d\'arrière-plan',
    'backgroundType': 'Type d\'arrière-plan',
    'defaultBackground': 'Utiliser l\'arrière-plan intégré',
    'customBackground': 'Utiliser un arrière-plan personnalisé',
    'defaultBackgroundType': 'Type d\'arrière-plan intégré',
    'imageBackground': 'Arrière-plan d\'image aléatoire',
    'svgBackground': 'Motif SVG aléatoire',
    'videoBackground': 'Arrière-plan vidéo par défaut',
    'specificBackground': 'Arrière-plan intégré spécifique',
    'builtInBackgroundPreview': 'Aperçu de l\'arrière-plan intégré',
    'customBackgroundFile': 'Télécharger un fichier d\'arrière-plan (images et vidéos pris en charge)',
    'supportedFormats': 'Formats pris en charge : PNG, JPEG, GIF, SVG, MP4, WebM, OGG',
    'preview': 'Aperçu',
    'autoSaveHint': 'Les paramètres sont automatiquement enregistrés',
    'tips': 'Conseils',
    'backgroundNote': '• Mode du thème de l\'infobulle : La détection automatique s\'ajuste en fonction du thème de la page web, tandis que les modes fixes utilisent toujours le thème sélectionné\n• Les effets d\'arrière-plan apparaissent derrière le contenu de l\'infobulle et n\'affectent pas la lisibilité du texte\n• Les arrière-plans vidéo seront automatiquement lus en boucle et sont muets\n• L\'opacité des images et des vidéos est ajustée pour une expérience de lecture optimale\n• Les fichiers volumineux peuvent affecter les performances',
    'delete': 'Supprimer (0)',
    'parallelBatches': 'Lots parallèles',
    'wordsPerBatch': 'Mots par lot',
    'import': 'Importer des mots',
    'clearList': 'Effacer la liste de mots',
    'dbBackup': 'Sauvegarde et restauration de la base de données',
    'wordDbBackup': 'Sauvegarde de la base de données de mots',
    'backupDb': 'Sauvegarder la base de données de mots',
    'downloadBackup': 'Cliquez pour télécharger le fichier de sauvegarde',
    'importBackup': 'Importer la sauvegarde de la base de données',
    'configBackup': 'Sauvegarde de la configuration',
    'backupConfig': 'Sauvegarder la configuration',
    'downloadConfigBackup': 'Cliquez pour télécharger le fichier de sauvegarde de la configuration',
    'importConfigBackup': 'Importer la sauvegarde de la configuration',
    'customLangCode': 'Code de langue personnalisé',
    'enterIsoCode': 'Entrez le code de langue ISO 639-1',
    'isoCodeHint': 'Veuillez entrer le code de langue à deux lettres standard ISO 639-1, par exemple : en, de, fr, etc.',
    'ttsChannelSelect': 'Sélection du canal TTS',
    'wordTtsChannel': 'Canal de prononciation des mots',
    'sentenceTtsChannel': 'Canal de prononciation des phrases',
    'localTts': 'TTS local',
    'customUrl': 'URL personnalisée',
    'localTtsConfig': 'Configuration TTS locale',
    'defaultVoice': 'Voix par défaut',
    'autoSelect': 'Sélection automatique',
    'speechRate': 'Vitesse de la parole (0.1-2.0)',
    'pitch': 'Hauteur tonale (0.1-2.0)',
    'testLocalTts': 'Tester TTS local',
    'enableWordTts': 'Activer TTS pour les mots',
    'enableSentenceTts': 'Activer TTS pour les phrases',
    'customAudioUrlConfig': 'Configuration de l\'URL audio personnalisée',
    'urlTemplate': 'Modèle d\'URL',
    'urlTemplateHint': 'Variables disponibles : {lang}, {word}<br>Fonctions disponibles : {encodeURIComponent()}, {utf8ToBase64()}<br>Exemple : https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>Vous pouvez utiliser votre propre API ou des API créées par d\'autres qui renvoient de l\'audio MP3.',
    'apiSettings': 'Configuration API',
    'apiBaseUrl': 'URL de base de l\'API : exemple : https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'Clé API :',
    'model': 'Modèle :',
    'activeProfileLabel': 'Configuration active :',
    'addProfileBtn': '+ Ajouter une configuration',
    'profileName': 'Nom de la configuration :',
    'profileEnablePollingLabel': 'Participer au sondage',
    'languageDetectionPrompt': 'Invite IA de détection de la langue :',
    'tagAnalysisPrompt': 'Invite d\'analyse des parties du discours :',
    'wordExplanationPrompt': 'Invite IA d\'explication des mots :',
    'wordExplanation2Prompt': 'Deuxième invite IA d\'explication des mots :',
    'sentenceTranslationPrompt': 'Invite de traduction de phrases d\'exemple :',
    'sentenceAnalysisPrompt': 'Invite IA d\'analyse des phrases :',
    'sidebarAnalysisPrompt': 'Invite d\'analyse IA de la barre latérale :',
    'restoreDefault': 'Restaurer par défaut',
    'autoSaved': 'Enregistré automatiquement',
    'minimaxiTtsConfig': 'Configuration de l\'API Minimaxi TTS',
    'groupId': 'ID de groupe :',
    'enterGroupId': 'Veuillez entrer l\'ID de groupe',
    'enterApiKey': 'Veuillez entrer la clé API',
    'saved': 'Enregistré',
    'apiUrlPlaceholder': 'https://api.example.com/v1/chat/completions',
    'apiKeyPlaceholder': 'sk-xxxxxxxx',
    'modelPlaceholder': 'Veuillez entrer le nom du modèle',
    'apiBasic': 'Paramètres de base',
    'apiLanguageDetection': 'Détection de la langue',
    'apiTagAnalysis': 'Partie du discorso',
    'apiWordExplanation': 'Explication des mots',
    'apiWordExplanation2': 'Deuxième explication des mots',
    'apiSentenceTranslation': 'Traduction de phrases',
    'apiAnalysis': 'Analyse des phrases',
    'apiSidebar': 'Analyse de la barre latérale',
    'apiBasicSettings': 'Paramètres de base de l\'API',
    'apiLanguageDetectionSettings': 'Paramètres de détection de la langue',
    'apiTagAnalysisSettings': 'Paramètres de la partie du discorso',
    'apiWordExplanationSettings': 'Paramètres d\'explication des mots',
    'apiSentenceTranslationSettings': 'Paramètres de traduction de phrases',
    'apiAnalysisSettings': 'Paramètres d\'analyse des phrases',
    'apiSidebarSettings': 'Paramètres d\'analyse de la barre latérale',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': 'Recommandé',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'noteImportant': 'Note importante',
    'ttsBasic': 'Paramètres de base',
    'ttsLocal': 'TTS local',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': 'URL personnalisée',
    'ttsBasicSettings': 'Paramètres de base de TTS',
    'testMinimaxi': 'Tester Minimaxi',
    'testCustomUrl': 'Tester l\'URL personnalisée 1',
    'testCustomUrl2': 'Tester l\'URL personnalisée 2',
    'about': 'À propos',
    "popupTitle": "Paramètres",
    'minimaxiVoiceId': 'ID de la voix',
    'minimaxiModel': 'Modèle',
    'minimaxiSpeed': 'Vitesse',
    'aiChannelLabel': 'AI Channel:',
    'aiChannelDiy': 'Custom',
    'aiChannelOhmygpt': 'OhMyGpt',
    'apiSidebar': 'Analisi Barra Laterale',
    'apiYoutubeCaption': 'Elaborazione Sottotitoli YouTube', // 新增
    'apiYoutubeCaptionSettings': 'Impostazioni Elaborazione Sottotitoli YouTube', // 新增
    'youtubeCaptionPrompt': 'Prompt AI Elaborazione Sottotitoli YouTube:', // 新增
    'ttsBasicSettings': 'Impostazioni TTS Base',
    'startDate': 'Date de début',
    'endDate': 'Date de fin',
    'filterToday': 'Aujourd\'hui',
    'filterYesterday': 'Hier',
    'filterThisWeek': 'Cette semaine',
    'filterThisMonth': 'Ce mois-ci',
    'filterNoDate': 'Mots sans date',
    'dateFilterWarning': 'Les mots importés peuvent ne pas avoir de données temporelles, les résultats du filtrage peuvent être inexacts. Veuillez ignorer les données temporelles lors du comptage des mots connus.',
    'filterByStatusOnly': 'Filtrer par statut uniquement',
    'pastDays': 'Jours passés',
    'applyPastDays': 'Appliquer',
    'wordStats': 'Statistiques d\'apprentissage',
    'wordStatsTitle': 'Statistiques d\'apprentissage des mots',
    'dailyNewWords': 'Nouveaux mots quotidiens',
    'timeRange': 'Période',
    'allTime': 'Tout le temps',
    'thisYear': 'Cette année',
    'customRange': 'Plage personnalisée',
    'applyRange': 'Appliquer la plage',
    'statusFilter': 'Filtre de statut',
    'chartType': 'Type de graphique',
    'lineChart': 'Graphique linéaire',
    'barChart': 'Graphique à barres',
    'statusFilterMinOne': 'Veuillez sélectionner au moins un statut de mot',
    // Account management related translations
    'cloudLoggedInAs': 'Connecté en tant que:',
    'cloudSubscriptionStatus': 'Abonnement:',
    'cloudExpiresAt': 'Expire le:',
    'cloudDataServer': 'Serveur de données:',
    'cloudAfdianId': 'ID Afdian:',
    'cloudPlanName': 'Plan:',
    'cloudStorage': 'Stockage:',
    // Traductions liées aux dons
    'donateButton': 'Sponsor',
    'donationNote1': 'Lingkuma est entièrement open-source et gratuit. La maintenance du logiciel n\'est pas facile. Si vous trouvez ce logiciel utile, vous êtes invité à faire un don via <a href="https://afdian.com/a/lingkuma" target="_blank">Afdian</a> ou le code QR WeChat.<br>Les mots sont stockés localement par défaut. Après avoir fait un don, vous pouvez utiliser la synchronisation cloud en temps réel officielle et publique pour les mots, permettant une utilisation multi-appareils transparente. (La configuration du plugin contient des informations sensibles comme les API, actuellement ne prend en charge que la synchronisation multi-appareils gérée par l\'utilisateur via Webdav)',
    'donationNote2': 'Vous pouvez toujours synchroniser gratuitement via les méthodes suivantes:<br>1. Utilisez [Jianguoyun Webdav] pour la synchronisation multi-appareils gratuite, mais pas en temps réel, nécessitant un téléchargement et un téléversement manuels sur plusieurs appareils.<br>2. Visitez la <a href="https://shared-server.lingkuma.org" target="_blank">[Liste des serveurs publics]</a> pour utiliser les serveurs fournis par la communauté;<br>3. Configurez votre propre service de synchronisation localement ou sur un serveur en utilisant le Docker officiel;',
    'donationNote3': 'Si vous rencontrez des difficultés lors de l\'utilisation, vous pouvez consulter le <a href="https://docs.lingkuma.org/">Guide de l\'utilisateur</a>, regarder mes vidéos, et vous êtes également invité à rejoindre la communauté.',
    'donationNote4': 'Merci d\'utiliser Lingkuma. J\'espère qu\'il pourra vous aider à apprendre plus facilement.',
    'cloudServerHealth': 'Vérification de l\'état du serveur',
    'cloudHealthCheckBtn': '🏥 Vérifier l\'état du serveur',
    'webdavActions': 'Synchronisation et sauvegarde WebDAV',
    'webdavWordsSync': 'Synchronisation des mots Webdav',
    'webdavCredentials': 'Identifiants WebDAV',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': 'Nom d\'utilisateur:',
    'webdavPasswordLabel': 'Mot de passe:',
    'webdavUploadSyncBtn': '1️⃣ Appareil A Télécharger la base de données de synchronisation (écraser le cloud); par exemple, téléchargement PC',
    'webdavDownloadMergeBtn': '2️⃣ Appareil B Télécharger la base de données de synchronisation (fusion locale); par exemple, téléchargement et fusion téléphone',
    'webdavDownloadReplaceBtn': '⚠️ Appareil B Télécharger la base de données de synchronisation (remplacer local); Écraser complètement le local',
    'webdavUploadBackupBtn': '♻️ Télécharger uniquement le fichier de sauvegarde, plusieurs fois',
    'multiDeviceSettings': 'Synchronisation des paramètres multi-appareils',
    'webdavClearDbBtn': 'Effacer la base de données locale',
    'confirmClearDatabase': 'Êtes-vous sûr de vouloir effacer toutes les données de mots locales? Cette opération ne peut pas être annulée!',
    'webdavClearingDb': 'Effacement de la base de données locale...',
    'webdavClearDbSuccess': 'Base de données locale effacée!',
    'webdavClearDbError': 'Échec de l\'effacement de la base de données locale',
    'unknownError': 'Une erreur inconnue s\'est produite'
  },
  'es': {
    'databaseOperations': 'Operaciones de base de datos',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': 'Configuración del servidor',
    'cloudServerUrlLabel': 'URL del servidor:',
    'cloudDbEnabledLabel': 'Activar base de datos en la nube(NO ACTIVAR, a menos que hayas iniciado sesión. Desactivar para usar la base de datos local)',
    'cloudDualWriteLabel': 'Activar escritura doble (escribir tanto localmente como en la nube)',
    'cloudAccountManagement': 'Gestión de cuenta',
    'cloudSelfHostedLabel': 'Servidor propio (Avanzado)',
    'cloudSelfHostedHint': 'Active esto si está ejecutando su propio servidor. De lo contrario, déjelo desactivado para usar el servicio en la nube oficial.',
    'webdavSettings': 'WebDav',
    'wordList': 'Lista de palabras',
    'importWords': 'Importar palabras',
    'backup': 'Copia de seguridad/Restaurar',
    'apiConfig': 'Configuración de la API',
    'ttsConfig': 'Configuración de TTS',
    'epubTextFix': 'Reparación de texto EPUB',
    'epubSplitter': 'EPUB Splitter',
    'epubToTelegraphName': 'EPUB a Telegra.ph', // 新增翻译
    'openPopup': 'Abrir ventana emergente',
    'knownWords': 'Palabras conocidas',
    'language': 'Idioma',
    'status': 'Estado',
    'all': 'Todos',
    'zh': 'Chino',
    'en': 'Inglés',
    'de': 'Alemán',
    'fr': 'Francés',
    'es': 'Español',
    'it': 'Italiano',
    'ja': 'Japonés',
    'ko': 'Coreano',
    'ru': 'Ruso',
    'custom': 'Personalizado',
    'known': 'Conocido (0)',
    'learning': 'Aprendiendo (1) (Resaltado amarillo)',
    'familiar': 'Familiar (2) (Resaltado amarillo claro)',
    'recognized': 'Reconocido (3) (Resaltado gris)',
    'almostMastered': 'Casi dominado (4) (Subrayado)',
    'fullyMastered': 'Totalmente dominado (5) (Sin resaltado)',
    'itemsPerPage': 'Elementos por página',
    'applyFilter': 'Aplicar filtro',
    'prevPage': 'Anterior',
    'nextPage': 'Página {current} de {total}',
    'nextBtn': 'Siguiente',
    'importTxt': 'Importar palabras TXT',
    'separator': 'Separador',
    'newline': 'Nueva línea',
    'comma': 'Coma',
    'wordStatus': 'Estado de la palabra',
    'delete': 'Eliminar (0)',
    'parallelBatches': 'Lotes paralelos',
    'wordsPerBatch': 'Palabras por lote',
    'import': 'Importar palabras',
    'clearList': 'Borrar lista de palabras',
    'dbBackup': 'Copia de seguridad y restauración de la base de datos',
    'wordDbBackup': 'Copia de seguridad de la base de datos de palabras',
    'backupDb': 'Copia de seguridad de la base de datos de palabras',
    'downloadBackup': 'Haga clic para descargar el archivo de copia de seguridad',
    'importBackup': 'Importar copia de seguridad de la base de datos',
    'configBackup': 'Copia de seguridad de la configuración',
    'backupConfig': 'Copia de seguridad de la configuración',
    'downloadConfigBackup': 'Haga clic para descargar el archivo de copia de seguridad de la configuración',
    'importConfigBackup': 'Importar copia de seguridad de la configuración',
    'customLangCode': 'Código de idioma personalizado',
    'enterIsoCode': 'Ingrese el código de idioma ISO 639-1',
    'isoCodeHint': 'Por favor, ingrese el código de idioma de dos letras estándar ISO 639-1, por ejemplo: en, de, fr, etc.',
    'ttsChannelSelect': 'Selección de canal TTS',
    'wordTtsChannel': 'Canal de pronunciación de palabras',
    'sentenceTtsChannel': 'Canal de pronunciación de oraciones',
    'localTts': 'TTS local',
    'customUrl': 'URL personalizada',
    'localTtsConfig': 'Configuración de TTS local',
    'defaultVoice': 'Voz predeterminada',
    'autoSelect': 'Selección automática',
    'speechRate': 'Velocidad de la voz (0.1-2.0)',
    'pitch': 'Tono (0.1-2.0)',
    'testLocalTts': 'Probar TTS local',
    'enableWordTts': 'Habilitar TTS para palabras',
    'enableSentenceTts': 'Habilitar TTS para oraciones',
    'customAudioUrlConfig': 'Configuración de URL de audio personalizada',
    'urlTemplate': 'Plantilla de URL',
    'urlTemplateHint': 'Variables disponibles: {lang}, {word}<br>Funciones disponibles: {encodeURIComponent()}, {utf8ToBase64()}<br>Ejemplo: https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>Puede utilizar su propia API o las API creadas por otros que devuelven audio MP3.',
    'apiSettings': 'Configuración de la API',
    'apiBaseUrl': 'URL base de la API: ejemplo: https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'Clave de la API:',
    'model': 'Modelo:',
    'activeProfileLabel': 'Configuración activa:',
    'addProfileBtn': '+ Agregar configuración',
    'profileName': 'Nombre de la configuración:',
    'profileEnablePollingLabel': 'Participar en el sondeo',
    'languageDetectionPrompt': 'Indicación de IA de detección de idioma:',
    'tagAnalysisPrompt': 'Indicación de análisis de partes del discurso:',
    'wordExplanationPrompt': 'Indicación de IA de explicación de palabras:',
    'wordExplanation2Prompt': 'Segunda indicación de IA de explicación de palabras:',
    'sentenceTranslationPrompt': 'Indicación de traducción de oraciones de ejemplo:',
    'delete': '삭제 (0)',
    'parallelBatches': '병렬 배치',
    'wordsPerBatch': '배치당 단어 수',
    'import': '단어 가져오기',
    'clearList': '단어 목록 지우기',
    'dbBackup': '데이터베이스 백업 및 복원',
    'wordDbBackup': '단어 데이터베이스 백업',
    'backupDb': '단어 데이터베이스 백업',
    'downloadBackup': '백업 파일을 다운로드하려면 클릭하십시오.',
    'importBackup': '데이터베이스 백업 가져오기',
    'configBackup': '구성 백업',
    'backupConfig': '구성 백업',
    'downloadConfigBackup': '구성 백업 파일을 다운로드하려면 클릭하십시오.',
    'importConfigBackup': '구성 백업 가져오기',
    'customLangCode': '사용자 정의 언어 코드',
    'enterIsoCode': 'ISO 639-1 언어 코드를 입력하십시오',
    'isoCodeHint': 'ISO 639-1 표준 2자리 언어 코드(예: en, de, fr 등)를 입력하십시오.',
    'ttsChannelSelect': 'TTS 채널 선택',
    'wordTtsChannel': '단어 발음 채널',
    'sentenceTtsChannel': '문장 발음 채널',
    'localTts': '로컬 TTS',
    'customUrl': '사용자 정의 URL',
    'localTtsConfig': '로컬 TTS 구성',
    'defaultVoice': '기본 음성',
    'autoSelect': '자동 선택',
    'speechRate': '말하기 속도 (0.1-2.0)',
    'pitch': '피치 (0.1-2.0)',
    'testLocalTts': '로컬 TTS 테스트',
    'enableWordTts': '단어 TTS 활성화',
    'enableSentenceTts': '문장 TTS 활성화',
    'customAudioUrlConfig': '사용자 정의 오디오 URL 구성',
    'urlTemplate': 'URL 템플릿',
    'urlTemplateHint': '사용 가능한 변수: {lang}, {word}<br>사용 가능한 함수: {encodeURIComponent()}, {utf8ToBase64()}<br>예: https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>자신의 API 또는 MP3 오디오를 반환하는 다른 사용자가 만든 API를 사용할 수 있습니다.',
    'apiSettings': 'API 구성',
    'apiBaseUrl': 'API 기본 URL: 예: https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'API 키:',
    'model': '모델:',
    'activeProfileLabel': '활성 구성:',
    'addProfileBtn': '+ 구성 추가',
    'profileName': '구성 이름:',
    'enableApiPollingLabel': '폴링 활성화',
    'profileEnablePollingLabel': '폴링 참여',
    'languageDetectionPrompt': '언어 감지 AI 프롬프트:',
    'tagAnalysisPrompt': '품사 분석 프롬프트:',
    'wordExplanationPrompt': '단어 설명 AI 프롬프트:',
    'wordExplanation2Prompt': '두 번째 단어 설명 AI 프롬프트:',
    'sentenceTranslationPrompt': '예제 문장 번역 프롬프트:',
    'sentenceAnalysisPrompt': '문장 분석 AI 프롬프트:',
    'sidebarAnalysisPrompt': '사이드바 AI 분석 프롬프트:',
    'restoreDefault': '기본값 복원',
    'autoSaved': '자동 저장',
    'minimaxiTtsConfig': 'Minimaxi TTS API 구성',
    'groupId': '그룹 ID:',
    'enterGroupId': '그룹 ID를 입력하십시오',
    'enterApiKey': 'API 키를 입력하십시오',
    'saved': '저장됨',
    'apiUrlPlaceholder': 'https://api.example.com/v1/chat/completions',
    'apiKeyPlaceholder': 'sk-xxxxxxxx',
    'modelPlaceholder': '모델 이름을 입력하십시오',
    'apiBasic': '기본 설정',
    'apiLanguageDetection': '언어 감지',
    'apiTagAnalysis': '품사',
    'apiWordExplanation': '단어 설명',
    'apiWordExplanation2': '두 번째 단어 설명',
    'apiSentenceTranslation': '문장 번역',
    'apiAnalysis': '문장 분석',
    'apiSidebar': '사이드바 분석',
    'apiBasicSettings': 'API 기본 설정',
    'apiLanguageDetectionSettings': '언어 감지 설정',
    'apiTagAnalysisSettings': '품사 설정',
    'apiWordExplanationSettings': '단어 설명 설정',
    'apiSentenceTranslationSettings': '문장 번역 설정',
    'apiAnalysisSettings': '문장 분석 설정',
    'apiSidebarSettings': '사이드바 분석 설정',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': '추천',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'noteImportant': '중요 참고',
    'ttsBasic': '기본 설정',
    'ttsLocal': '로컬 TTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': '사용자 정의 URL',
    'ttsBasicSettings': 'TTS 기본 설정',
    'testMinimaxi': 'Minimaxi 테스트',
    'testCustomUrl': '사용자 정의 URL 테스트',
    'about': '정보',
    "popupTitle": "설정",
    'minimaxiVoiceId': '음성 ID',
    'minimaxiModel': '모델',
    'minimaxiSpeed': '속도',
    'aiChannelLabel': 'AI Channel:',
    'aiChannelDiy': 'Custom',
    'aiChannelOhmygpt': 'OhMyGpt',
    'apiSidebar': '사이드바 분석',
    'apiYoutubeCaption': 'YouTube 자막 처리', // 新增
    'apiYoutubeCaptionSettings': 'YouTube 자막 처리 설정', // 新增
    'youtubeCaptionPrompt': 'YouTube 자막 처리 AI 프롬프트:', // 新增
    'ttsBasicSettings': 'TTS 기본 설정',
    'startDate': '시작 날짜',
    'endDate': '종료 날짜',
    'filterToday': '오늘',
    'filterYesterday': '어제',
    'filterThisWeek': '이번 주',
    'filterThisMonth': '이번 달',
    'filterNoDate': '날짜 없는 단어',
    'dateFilterWarning': '가져온 단어에는 시간 데이터가 없을 수 있으며 필터링 결과가 부정확할 수 있습니다. 알려진 단어를 계산할 때 시간 데이터를 무시하십시오.',
    'filterByStatusOnly': '상태로만 필터링',
    'pastDays': '지난 일수',
    'applyPastDays': '적용',
    'statusFilterMinOne': '하나 이상의 단어 상태를 선택하십시오',
    // Account management related translations
    'cloudLoggedInAs': '로그인됨:',
    'cloudSubscriptionStatus': '구독:',
    'cloudExpiresAt': '만료:',
    'cloudDataServer': '데이터 서버:',
    'cloudAfdianId': 'Afdian ID:',
    'cloudPlanName': '플랜:',
    'cloudStorage': '저장공간:'

  },
  'ru': {
    'databaseOperations': 'Операции с базой данных',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': 'Конфигурация сервера',
    'cloudServerUrlLabel': 'URL сервера:',
    'cloudDbEnabledLabel': 'Включить облачную базу данных(НЕ ВКЛЮЧАТЬ, если вы не вошли в систему. Выключите, чтобы использовать локальную базу данных)',
    'cloudDualWriteLabel': 'Включить двойную запись (записывать как локально, так и в облако)',
    'cloudAccountManagement': 'Управление аккаунтом',
    'cloudSelfHostedLabel': 'Собственный сервер (Расширенный)',
    'cloudSelfHostedHint': 'Включите это, если вы используете свой собственный сервер. В противном случае оставьте выключенным для использования официального облачного сервиса.',
    'webdavSettings': 'WebDav',
    'wordList': 'Список слов',
    'importWords': 'Импорт слов',
    'backup': 'Резервное копирование/Восстановление',
    'apiConfig': 'Конфигурация API',
    'ttsConfig': 'Конфигурация TTS',
    'epubTextFix': 'Исправление текста EPUB',
    'epubSplitter': 'EPUB Splitter',
    'openPopup': 'Открыть всплывающее окно',
    'knownWords': 'Известные слова',
    'language': 'Язык',
    'status': 'Статус',
    'all': 'Все',
    'zh': 'Китайский',
    'en': 'Английский',
    'de': 'Немецкий',
    'fr': 'Французский',
    'es': 'Испанский',
    'it': 'Итальянский',
    'ja': 'Японский',
    'ko': 'Корейский',
    'ru': 'Русский',
    'custom': 'Пользовательский',
    'known': 'Известно (0)',
    'learning': 'Изучается (1) (Желтая подсветка)',
    'familiar': 'Знакомо (2) (Светло-желтая подсветка)',
    'recognized': 'Распознано (3) (Серая подсветка)',
    'almostMastered': 'Почти освоено (4) (Подчеркнуто)',
    'fullyMastered': 'Полностью освоено (5) (Без подсветки)',
    'itemsPerPage': 'Элементов на странице',
    'applyFilter': 'Применить фильтр',
    'prevPage': 'Предыдущая',
    'nextPage': 'Страница {current} из {total}',
    'nextBtn': 'Следующая',
    'importTxt': 'Импорт TXT слов',
    'separator': 'Разделитель',
    'newline': 'Новая строка',
    'comma': 'Запятая',
    'wordStatus': 'Статус слова',
    'delete': 'Удалить (0)',
    'parallelBatches': 'Параллельные пакеты',
    'wordsPerBatch': 'Слов в пакете',
    'import': 'Импорт слов',
    'clearList': 'Очистить список слов',
    'dbBackup': 'Резервное копирование и восстановление базы данных',
    'wordDbBackup': 'Резервное копирование базы данных слов',
    'backupDb': 'Резервное копирование базы данных слов',
    'downloadBackup': 'Нажмите, чтобы скачать файл резервной копии',
    'importBackup': 'Импорт резервной копии базы данных',
    'configBackup': 'Резервное копирование конфигурации',
    'backupConfig': 'Резервное копирование конфигурации',
    'downloadConfigBackup': 'Нажмите, чтобы скачать файл резервной копии конфигурации',
    'importConfigBackup': 'Импорт резервной копии конфигурации',
    'customLangCode': 'Пользовательский код языка',
    'enterIsoCode': 'Введите код языка ISO 639-1',
    'isoCodeHint': 'Пожалуйста, введите двухбуквенный код языка стандарта ISO 639-1, например: en, de, fr и т. д.',
    'ttsChannelSelect': 'Выбор канала TTS',
    'wordTtsChannel': 'Канал произношения слов',
    'sentenceTtsChannel': 'Канал произношения предложений',
    'localTts': 'Локальный TTS',
    'customUrl': 'Пользовательский URL',
    'localTtsConfig': 'Локальная конфигурация TTS',
    'defaultVoice': 'Голос по умолчанию',
    'autoSelect': 'Автоматический выбор',
    'speechRate': 'Скорость речи (0.1-2.0)',
    'pitch': 'Высота тона (0.1-2.0)',
    'testLocalTts': 'Тест локального TTS',
    'enableWordTts': 'Включить TTS для слов',
    'enableSentenceTts': 'Включить TTS для предложений',
    'customAudioUrlConfig': 'Пользовательская конфигурация URL-адреса аудио',
    'urlTemplate': 'Шаблон URL',
    'urlTemplateHint': 'Доступные переменные: {lang}, {word}<br>Доступные функции: {encodeURIComponent()}, {utf8ToBase64()}<br>Пример: https://api.example.com/api/v2/speech/speakweb?langid={lang}&txt={encodeURIComponent("LOL" + utf8ToBase64(word))}<br>Вы можете использовать свой собственный API или API, созданные другими пользователями, которые возвращают аудио MP3.',
    'apiSettings': 'Конфигурация API',
    'apiBaseUrl': 'Базовый URL API: пример: https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'Ключ API:',
    'model': 'Модель:',
    'activeProfileLabel': 'Активная конфигурация:',
    'addProfileBtn': '+ Добавить конфигурацию',
    'profileName': 'Имя конфигурации:',
    'enableApiPollingLabel': 'Включить опрос',
    'profileEnablePollingLabel': 'Участвовать в опросе',
    'languageDetectionPrompt': 'Подсказка AI для определения языка:',
    'tagAnalysisPrompt': 'Подсказка для анализа частей речи:',
    'wordExplanationPrompt': 'Подсказка AI для объяснения слов:',
    'wordExplanation2Prompt': 'Вторая подсказка AI для объяснения слов:',
    'sentenceTranslationPrompt': 'Подсказка для перевода примеров предложений:',
    'sentenceAnalysisPrompt': 'Подсказка AI для анализа предложений:',
    'sidebarAnalysisPrompt': 'Подсказка AI для анализа боковой панели:',
    'restoreDefault': 'Восстановить по умолчанию',
    'autoSaved': 'Автоматически сохранено',
    'minimaxiTtsConfig': 'Конфигурация Minimaxi TTS API',
    'groupId': 'ID группы:',
    'enterGroupId': 'Пожалуйста, введите ID группы',
    'enterApiKey': 'Пожалуйста, введите ключ API',
    'saved': 'Сохранено',
    'apiUrlPlaceholder': 'https://api.example.com/v1/chat/completions',
    'apiKeyPlaceholder': 'sk-xxxxxxxx',
    'modelPlaceholder': 'Пожалуйста, введите имя модели',
    'apiBasic': 'Основные настройки',
    'apiLanguageDetection': 'Определение языка',
    'apiTagAnalysis': 'Часть речи',
    'apiWordExplanation': 'Объяснение слова',
    'apiWordExplanation2': 'Второе объяснение слова',
    'apiSentenceTranslation': 'Перевод предложения',
    'apiAnalysis': 'Анализ предложения',
    'apiSidebar': 'Анализ боковой панели',
    'apiBasicSettings': 'Основные настройки API',
    'apiLanguageDetectionSettings': 'Настройки определения языка',
    'apiTagAnalysisSettings': 'Настройки части речи',
    'apiWordExplanationSettings': 'Настройки объяснения слова',
    'apiSentenceTranslationSettings': 'Настройки перевода предложения',
    'apiAnalysisSettings': 'Настройки анализа предложения',
    'apiSidebarSettings': 'Настройки анализа боковой панели',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': 'Рекомендуется',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'noteImportant': 'Важное примечание',
    'ttsBasic': 'Основные настройки',
    'ttsLocal': 'Локальный TTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': 'Пользовательский URL',
    'ttsBasicSettings': 'Основные настройки TTS',
    'testMinimaxi': 'Тест Minimaxi',
    'testCustomUrl': 'Тест пользовательского URL',
    'about': 'О программе',
    "popupTitle": "Настройки",
    'minimaxiVoiceId': 'ID голоса',
    'minimaxiModel': 'Модель',
    'minimaxiSpeed': 'Скорость',
    'aiChannelLabel': 'AI Channel:',
    'aiChannelDiy': 'Custom',
    'aiChannelOhmygpt': 'OhMyGpt',
    'apiSidebar': 'Анализ боковой панели',
    'apiYoutubeCaption': 'Обработка YouTube-подписей', // 新增
    'apiYoutubeCaptionSettings': 'Настройки обработки YouTube-подписей', // 新增
    'youtubeCaptionPrompt': 'Prompt AI для обработки YouTube-подписей:', // 新增
    'ttsBasicSettings': 'Основные настройки TTS',
    'startDate': 'Дата начала',
    'endDate': 'Дата окончания',
    'filterToday': 'Сегодня',
    'filterYesterday': 'Вчера',
    'filterThisWeek': 'На этой неделе',
    'filterThisMonth': 'В этом месяце',
    'filterNoDate': 'Слова без даты',
    'dateFilterWarning': 'Импортированные слова могут не иметь временных данных, результаты фильтрации могут быть неточными. Пожалуйста, игнорируйте временные данные при подсчете известных слов.',
    'filterByStatusOnly': 'Фильтровать только по статусу',
    'pastDays': 'Прошедшие дни',
    'applyPastDays': 'Применить',
    'statusFilterMinOne': 'Пожалуйста, выберите хотя бы один статус слова',
    // Account management related translations
    'cloudLoggedInAs': 'Вошли как:',
    'cloudSubscriptionStatus': 'Подписка:',
    'cloudExpiresAt': 'Истекает:',
    'cloudDataServer': 'Сервер данных:',
    'cloudAfdianId': 'ID Afdian:',
    'cloudPlanName': 'План:',
    'cloudStorage': 'Хранилище:',
    // Переводы, связанные с пожертвованиями
    'donateButton': 'Sponsor',
    'donationNote1': 'Lingkuma полностью открыта и бесплатна. Поддержка программного обеспечения непроста. Если вы находите это программное обеспечение полезным, вы можете сделать пожертвование через <a href="https://afdian.com/a/lingkuma" target="_blank">Afdian</a> или QR-код WeChat.<br>Слова по умолчанию хранятся локально. После пожертвования вы можете использовать официальную общедоступную синхронизацию в облаке в реальном времени для слов, что обеспечивает бесшовное использование на нескольких устройствах. (Конфигурация плагина содержит конфиденциальную информацию, такую как API, в настоящее время поддерживает только синхронизацию на нескольких устройствах, управляемую пользователем через Webdav)',
    'donationNote2': 'Вы все еще можете синхронизировать бесплатно следующими способами:<br>1. Используйте [Jianguoyun Webdav] для бесплатной синхронизации на нескольких устройствах, но не в реальном времени, требуя ручной загрузки и скачивания на нескольких устройствах.<br>2. Посетите <a href="https://shared-server.lingkuma.org" target="_blank">[Список общедоступных серверов]</a>, чтобы использовать серверы, предоставленные сообществом;<br>3. Настройте свою собственную службу синхронизации локально или на сервере, используя официальный Docker;',
    'donationNote3': 'Если вы столкнулись с трудностями при использовании, вы можете ознакомиться с <a href="https://docs.lingkuma.org/">Руководством пользователя</a>, посмотреть мои видео, а также приглашаем вас присоединиться к сообществу.',
    'donationNote4': 'Спасибо за использование Lingkuma. Надеюсь, это поможет вам учиться легче.',
    'cloudServerHealth': 'Проверка состояния сервера',
    'cloudHealthCheckBtn': '🏥 Проверить состояние сервера',
    'webdavActions': 'Синхронизация и резервное копирование WebDAV',
    'webdavWordsSync': 'Синхронизация слов Webdav',
    'webdavCredentials': 'Учетные данные WebDAV',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': 'Имя пользователя:',
    'webdavPasswordLabel': 'Пароль:',
    'webdavUploadSyncBtn': '1️⃣ Устройство A Загрузить базу данных синхронизации (перезаписать облако); например, загрузка ПК',
    'webdavDownloadMergeBtn': '2️⃣ Устройство B Скачать базу данных синхронизации (объединить локально); например, загрузка и объединение телефона',
    'webdavDownloadReplaceBtn': '⚠️ Устройство B Скачать базу данных синхронизации (заменить локально); Полностью перезаписать локально',
    'webdavUploadBackupBtn': '♻️ Загрузить только файл резервной копии, несколько раз',
    'multiDeviceSettings': 'Синхронизация настроек нескольких устройств',
    'webdavClearDbBtn': 'Очистить локальную базу данных',
    'confirmClearDatabase': 'Вы уверены, что хотите очистить все локальные данные слов? Эта операция не может быть отменена!',
    'webdavClearingDb': 'Очистка локальной базы данных...',
    'webdavClearDbSuccess': 'Локальная база данных очищена!',
    'webdavClearDbError': 'Не удалось очистить локальную базу данных',
    'unknownError': 'Произошла неизвестная ошибка'
  },
  'ja': {
    'customCapsulesSettings': 'Настройки пользовательских капсул',
    'customCapsulesDescription': 'Настройка контейнеров и кнопок капсул',
    'customCapsulesHelp': '<strong>Контейнер капсул</strong>: Каждый контейнер капсул — это строка, которая может содержать несколько кнопок. Несколько контейнеров капсул накладываются друг на друга.<br><strong>Кнопка</strong>: Каждая кнопка — это триггер поиска, который открывает указанный URL при нажатии. <code>{word}</code> в URL будет заменено на текущее слово.',
    'addCapsuleContainer': '+ Добавить контейнер капсул',
    'noCapsulesYet': 'Контейнеры капсул еще не добавлены, нажмите кнопку ниже, чтобы добавить',
    'capsuleContainer': 'Контейнер капсул',
    'buttonName': 'Имя кнопки',
    'buttonUrl': 'URL',
    'buttonIcon': 'Иконка',
    'buttonIconPlaceholder': 'Необязательно, оставьте пустым для использования иконки по умолчанию',
    'buttonOpenMethod': 'Метод открытия',
    'openMethodNewTab': 'Новая вкладка',
    'openMethodIframe': 'iframe всплывающее окно',
    'openMethodNewWindow': 'Новое окно',
    'openMethodSidebar': 'Боковая панель',
    'newButton': 'Новая кнопка',
    'addButton': '+ Добавить кнопку',
    'deleteContainer': 'Удалить контейнер',
    'deleteButton': 'Удалить кнопку',
    'noButtonsYet': 'В этом контейнере пока нет кнопок, нажмите "Добавить кнопку", чтобы добавить',
    'autoSavedCapsule': '✓ Автоматически сохранено',
    'capsuleAutoSaveHint': '✓ Настройки сохраняются автоматически',
    'confirmDeleteContainer': 'Вы уверены, что хотите удалить этот контейнер капсул?',
    'confirmDeleteButton': 'Вы уверены, что хотите удалить эту кнопку?',
    // Known Sentence Animation translations
    'knownSentenceAnimation': 'Анимация известных предложений',
    'knownSentenceAnimationSettings': 'Настройки анимации известных предложений',
    'animationDescription': 'Конфигурация анимации эффекта взрыва предложений для известных предложений',
    'animationHelp': 'Настройте анимацию, отображаемую, когда в предложении нет неизвестных слов. Можно настроить анимацию верхнего и нижнего слоя, поддерживая предустановленные анимации или загрузку пользовательских TGS-файлов.',
    'animationSize': 'Размер анимации',
    'animationWidth': 'Ширина',
    'animationHeight': 'Высота',
    'animationDefaultSize': 'По умолчанию: 150x150px',
    'topLayerAnimation': 'Анимация верхнего слоя',
    'bottomLayerAnimation': 'Анимация нижнего слоя',
    'enable': 'Включить',
    'selectAnimation': 'Выбрать анимацию',
    'uploadCustom': 'Загрузить пользовательский TGS-файл',
    'selectFile': 'Выбрать файл',
    'tgsFormatOnly': 'Поддерживаются только файлы анимации в формате .tgs',
    'animationSaved': '✓ Настройки автоматически сохранены',
    'customAnimationSaved': 'Пользовательская анимация слоя {layer} сохранена',
    'capsuleTips': 'Советы',
    'capsuleTipsContent': '• <strong>Контейнер капсул</strong>: Горизонтальный контейнер кнопок, несколько контейнеров накладываются друг на друга<br>• <strong>Имя кнопки</strong>: Текст, отображаемый на кнопке<br>• <strong>URL</strong>: URL для открытия, используйте {word} как заполнитель для текущего слова<br>• <strong>Метод открытия</strong>:<br>&nbsp;&nbsp;- Новая вкладка: Открыть в новой вкладке браузера<br>&nbsp;&nbsp;- iframe всплывающее окно: Открыть во всплывающем окне iframe на текущей странице<br>&nbsp;&nbsp;- Новое окно: Открыть в новом окне браузера<br>&nbsp;&nbsp;- Боковая панель: Открыть в боковой панели браузера<br>• <strong>Пример</strong>:<br>&nbsp;&nbsp;Контейнер 1: [Google Картинки] [Википедия] [Словарь]<br>&nbsp;&nbsp;Контейнер 2: [YouTube] [Перевод]<br>• <strong>Пример URL</strong>: https://www.google.com/search?q={word}&tbm=isch'
  },
  // 添加日语翻译
  'ja': {
    'databaseOperations': 'データベース操作',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': 'サーバー設定',
    'cloudServerUrlLabel': 'サーバーURL:',
    'cloudDbEnabledLabel': 'クラウドデータベースを有効にする(ログインしていない場合はオンにしないでください。ローカルデータベースを使用するにはオフにしてください)',
    'cloudDualWriteLabel': 'デュアルライトを有効にする（ローカルとクラウドの両方に書き込み）',
    'cloudAccountManagement': 'アカウント管理',
    'cloudSelfHostedLabel': 'セルフホストサーバー（高度）',
    'cloudSelfHostedHint': '独自のサーバーを実行している場合はこれを有効にします。それ以外の場合は、公式クラウドサービスを使用するためにオフのままにします。',
    'webdavSettings': 'WebDav',
    'wordList': '単語リスト',
    'importWords': '単語をインポート',
    'backup': 'バックアップ/復元',
    'apiConfig': 'API設定',
    'ttsConfig': 'TTS設定',
    'epubTextFix': 'EPUBテキスト修復',
    'epubSplitter': 'EPUB分割ツール',
    'epubToTelegraphName': 'EPUB を Telegra.ph へ', // 新增翻译
    'openPopup': 'ポップアップを開く',
    'knownWords': '既知の単語',
    'wordStats': '学習統計',
    'wordOperations': '単語データベース操作',
    'wordOperationsTitle': '単語データベース操作',
    'sentenceManagement': '例文管理',
    'currentDbSize': '現在のデータベースサイズ',
    'totalSentences': '総例文数',
    'sentenceDeleteOptions': '例文削除オプション',
    'deleteAllSentences': 'すべての例文を削除',
    'keepNSentences': '単語ごとに最初のN個の例文を保持',
    'keepCount': '保持数',
    'refreshDbSize': 'データベース情報を更新',
    'executeSentenceOperation': '例文削除を実行',
    'databaseManagement': 'データベース管理',
    'clearLocalDb': 'ローカルデータベースをクリア',
    'resetPhrasesDb': 'フレーズデータベースをリセット',
    'resetPhrasesDbHint': '単語データベースをクリアして再インポートした場合、新しいデータベースから新しいフレーズキャッシュを作成する必要がある場合があります。',
    'resetPhrasesDbSuccess': 'フレーズデータベースのリセットに成功しました！',
    'resetPhrasesDbError': 'フレーズデータベースのリセットに失敗しました',
    'confirmResetPhrasesDb': 'フレーズデータベースをリセットしてもよろしいですか？既存のフレーズキャッシュがクリアされ、メインデータベースから再作成されます。',
    'language': '言語',
    'status': 'ステータス',
    'all': 'すべて',
    'zh': '中国語',
    'en': '英語',
    'de': 'ドイツ語',
    'fr': 'フランス語',
    'es': 'スペイン語',
    'it': 'イタリア語',
    'ja': '日本語',
    'ko': '韓国語',
    'ru': 'ロシア語',
    'custom': 'カスタム',
    'known': '既知 (0)',
    'learning': '学習中 (1) (黄色ハイライト)',
    'familiar': '馴染みのある (2) (淡黄色ハイライト)',
    'recognized': '認識済み (3) (灰色ハイライト)',
    'almostMastered': 'ほぼマスター (4) (下線)',
    'fullyMastered': '完全にマスター (5) (ハイライトなし)',
    'itemsPerPage': 'ページあたりの項目数',
    'applyFilter': 'フィルターを適用',
    'prevPage': '前へ',
    'nextPage': 'ページ {current} / {total}',
    'nextBtn': '次へ',
    'importTxt': 'TXT単語をインポート',
    'separator': '区切り文字',
    'newline': '改行',
    'comma': 'コンマ',
    'wordStatus': '単語の状態',
    // Glass effect settings translations (Japanese)
    'glassEffectSettings': 'ガラス素材設定',
    'glassEffectType': 'ガラス効果タイプ',
    'glassEffectPreview': '効果プレビュー',
    'glassEffectAutoSave': '設定は自動的に保存され、ツールチップに適用されます',
    'glassEffectLiquid': '液体ガラス (Liquid) ⚠️遅延あり、非推奨',
    'glassEffectFractal': 'フラクタルノイズ (Fractal)',
    'glassEffectFlip': 'フリップ (Flip)',
    'glassEffectRgbSplit': 'RGB分離 (RGB Split)',
    'glassEffectPixel': 'ピクセル化 (Pixel)',
    'glassEffectFluted': '溝付き (Fluted)',
    'glassEffectTiled': 'タイル (Tiled)',
    'glassEffectMosaic': 'モザイク (Mosaic)',
    'glassEffectEllipses': '楕円 (Ellipses)',
    'glassEffectRough': '粗い (Rough)',
    'glassEffectBulge': '膨らみ (Bulge)',
    'delete': '削除 (0)',
    'apiBasic': '基本設定',
    'apiLanguageDetection': '言語検出',
    'apiTagAnalysis': '品詞',
    'apiWordExplanation': '単語の説明',
    'apiSentenceTranslation': '文の翻訳',
    'apiAnalysis': '文の分析',
    'apiSidebar': 'サイドバー分析',
    'apiBasicSettings': 'API 基本設定',
    'apiLanguageDetectionSettings': '言語検出設定',
    'apiTagAnalysisSettings': '品詞設定',
    'apiWordExplanationSettings': '単語の説明設定',
    'apiSentenceTranslationSettings': '文の翻訳設定',
    'apiAnalysisSettings': '文の分析設定',
    'apiSidebarSettings': 'サイドバー分析設定',
    'apiBaseUrl': 'APIベースURL: 例: https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'APIキー:',
    'model': 'モデル:',
    'activeProfileLabel': 'アクティブ設定:',
    'addProfileBtn': '+ 設定を追加',
    'profileName': '設定名:',
    'enableApiPollingLabel': 'ポーリングを有効にする',
    'profileEnablePollingLabel': 'ポーリングに参加',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': '推奨',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'ttsBasic': '基本設定',
    'ttsLocal': 'ローカルTTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': 'カスタムURL',
    'about': '概要',
    'startDate': '開始日',
    'endDate': '終了日',
    'filterToday': '今日',
    'filterYesterday': '昨日',
    'filterThisWeek': '今週',
    'filterThisMonth': '今月',
    'filterNoDate': '日付なしの単語',
    'dateFilterWarning': 'インポートされた単語には時間データがない場合があり、フィルタリング結果が不正確になる可能性があります。既知の単語をカウントする際は時間データを無視してください。',
    'filterByStatusOnly': 'ステータスのみでフィルター',
    'pastDays': '過去の日数',
    'applyPastDays': '適用',
    'statusFilterMinOne': '少なくとも1つの単語ステータスを選択してください',
    // Account management related translations
    'cloudLoggedInAs': 'ログイン済み:',
    'cloudSubscriptionStatus': 'サブスクリプション:',
    'cloudExpiresAt': '有効期限:',
    'cloudDataServer': 'データサーバー:',
    'cloudAfdianId': 'Afdian ID:',
    'cloudPlanName': 'プラン:',
    'cloudStorage': 'ストレージ:',
    // 寄付関連の翻訳
    'donateButton': 'Sponsor',
    'donationNote1': 'Lingkumaは完全にオープンソースで無料です。ソフトウェアのメンテナンスは簡単ではありません。このソフトウェアが役立つと思われる場合は、<a href="https://afdian.com/a/lingkuma" target="_blank">Afdian</a>またはWeChat QRコードを通じて寄付をお願いします。<br>単語はデフォルトでローカルに保存されます。寄付後、公式の公共のリアルタイムクラウド同期を単語に使用でき、シームレスなマルチデバイス使用が可能になります。（プラグイン設定にはAPIなどの機密情報が含まれており、現在はWebdavを介したユーザー管理のマルチデバイス同期のみをサポートしています）',
    'donationNote2': '以下の方法で無料で同期できます:<br>1. [Jianguoyun Webdav]を使用して無料のマルチデバイス同期を行うが、リアルタイムではなく、複数のデバイスで手動のアップロードとダウンロードが必要。<br>2. <a href="https://shared-server.lingkuma.org" target="_blank">[公共サーバーリスト]</a>にアクセスしてコミュニティが提供するサーバーを使用する;<br>3. 公式Dockerを使用してローカルまたはサーバーで独自の同期サービスをセットアップする;',
    'donationNote3': '使用中に困難が発生した場合は、<a href="https://docs.lingkuma.org/">ユーザーガイド</a>を確認し、私の動画を見ていただき、コミュニティへの参加も歓迎します。',
    'donationNote4': 'Lingkumaをご利用いただきありがとうございます。よりスムーズな学習のお役に立てることを願っています。',
    'cloudServerHealth': 'サーバー状態チェック',
    'cloudHealthCheckBtn': '🏥 サーバー状態をチェック',
    'webdavActions': 'WebDAV同期とバックアップ',
    'webdavWordsSync': 'Webdav単語同期',
    'webdavCredentials': 'WebDAV認証情報',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': 'ユーザー名:',
    'webdavPasswordLabel': 'パスワード:',
    'webdavUploadSyncBtn': '1️⃣ デバイスA 同期データベースをアップロード（クラウドを上書き）; 例：PCアップロード',
    'webdavDownloadMergeBtn': '2️⃣ デバイスB 同期データベースをダウンロード（ローカルでマージ）; 例：携帯電話ダウンロードとマージ',
    'webdavDownloadReplaceBtn': '⚠️ デバイスB 同期データベースをダウンロード（ローカルを置換）; 完全にローカルを上書き',
    'webdavUploadBackupBtn': '♻️ バックアップファイルのみアップロード、複数回可能',
    'multiDeviceSettings': 'マルチデバイス設定同期',
    'webdavClearDbBtn': 'ローカルデータベースをクリア',
    'confirmClearDatabase': 'すべてのローカル単語データをクリアしてもよろしいですか？この操作は取り消せません！',
    'webdavClearingDb': 'ローカルデータベースをクリア中...',
    'webdavClearDbSuccess': 'ローカルデータベースがクリアされました！',
    'webdavClearDbError': 'ローカルデータベースのクリアに失敗しました',
    'unknownError': '不明なエラーが発生しました'
  },
  'it': {
    'customCapsulesSettings': 'カスタムカプセル設定',
    'customCapsulesDescription': 'カプセルコンテナとボタンをカスタマイズ',
    'customCapsulesHelp': '<strong>カプセルコンテナ</strong>: 各カプセルコンテナは一行で、複数のボタンを含むことができます。複数のカプセルコンテナは上に重ねて表示されます。<br><strong>ボタン</strong>: 各ボタンは検索トリガーで、クリックすると指定されたURLを開きます。URLの <code>{word}</code> は現在の単語に置き換えられます。',
    'addCapsuleContainer': '+ カプセルコンテナを追加',
    'noCapsulesYet': 'まだカプセルコンテナが追加されていません。下のボタンをクリックして追加してください。',
    'capsuleContainer': 'カプセルコンテナ',
    'buttonName': 'ボタン名',
    'buttonUrl': 'URL',
    'buttonIcon': 'アイコン',
    'buttonIconPlaceholder': 'オプション、空欄の場合はデフォルトアイコンを使用',
    'buttonOpenMethod': '開く方法',
    'openMethodNewTab': '新しいタブ',
    'openMethodIframe': 'iframeポップアップ',
    'openMethodNewWindow': '新しいウィンドウ',
    'openMethodSidebar': 'サイドバー',
    'newButton': '新しいボタン',
    'addButton': '+ ボタンを追加',
    'deleteContainer': 'コンテナを削除',
    'deleteButton': 'ボタンを削除',
    'noButtonsYet': 'このコンテナにはまだボタンがありません。「ボタンを追加」をクリックして追加してください。',
    'autoSavedCapsule': '✓ 自動保存されました',
    'capsuleAutoSaveHint': '✓ 設定は自動的に保存されます',
    'confirmDeleteContainer': 'このカプセルコンテナを削除してもよろしいですか？',
    'confirmDeleteButton': 'このボタンを削除してもよろしいですか？',
    // Known Sentence Animation translations
    'knownSentenceAnimation': '既知の文のアニメーション',
    'knownSentenceAnimationSettings': '既知の文のアニメーション設定',
    'animationDescription': '文爆発既知の文効果アニメーション設定',
    'animationHelp': '文に未知の単語がない場合に表示されるアニメーションを設定します。上層と下層の2つのアニメーションを設定でき、プリセットアニメーションまたはカスタムTGSファイルのアップロードをサポートします。',
    'animationSize': 'アニメーションサイズ',
    'animationWidth': '幅',
    'animationHeight': '高さ',
    'animationDefaultSize': 'デフォルト: 150x150px',
    'topLayerAnimation': '上層アニメーション',
    'bottomLayerAnimation': '下層アニメーション',
    'enable': '有効',
    'selectAnimation': 'アニメーションを選択',
    'uploadCustom': 'カスタムTGSファイルをアップロード',
    'selectFile': 'ファイルを選択',
    'tgsFormatOnly': '.tgs形式のアニメーションファイルのみサポートされています',
    'animationSaved': '✓ 設定は自動的に保存されました',
    'customAnimationSaved': '{layer}層のカスタムアニメーションが保存されました',
    'capsuleTips': 'ヒント',
    'capsuleTipsContent': '• <strong>カプセルコンテナ</strong>: 横向きのボタンコンテナ、複数のコンテナは上に重ねて表示されます<br>• <strong>ボタン名</strong>: ボタンに表示されるテキスト<br>• <strong>URL</strong>: 開くURL、{word}を現在の単語のプレースホルダーとして使用します<br>• <strong>開く方法</strong>:<br>&nbsp;&nbsp;- 新しいタブ: ブラウザの新しいタブで開く<br>&nbsp;&nbsp;- iframeポップアップ: 現在のページのiframeポップアップで開く<br>&nbsp;&nbsp;- 新しいウィンドウ: ブラウザの新しいウィンドウで開く<br>&nbsp;&nbsp;- サイドバー: ブラウザのサイドバーで開く<br>• <strong>例</strong>:<br>&nbsp;&nbsp;コンテナ1: [Google画像] [ウィキペディア] [辞書]<br>&nbsp;&nbsp;コンテナ2: [YouTube] [翻訳]<br>• <strong>例URL</strong>: https://www.google.com/search?q={word}&tbm=isch'
  },
  // 添加意大利语翻译
  'it': {
    'databaseOperations': 'Operazioni Database',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': 'Configurazione Server',
    'cloudServerUrlLabel': 'URL Server:',
    'cloudDbEnabledLabel': 'Attiva Database Cloud(NON ATTIVARE, a meno che tu non abbia effettuato l\'accesso. Disattiva per usare il database locale)',
    'cloudDualWriteLabel': 'Attiva Scrittura Doppia (scrivi sia localmente che nel cloud)',
    'cloudAccountManagement': 'Gestione Account',
    'cloudSelfHostedLabel': 'Server Self-Hosted (Avanzato)',
    'cloudSelfHostedHint': 'Attiva questo se stai eseguendo il tuo server. Altrimenti, lascialo disattivato per utilizzare il servizio cloud ufficiale.',
    'webdavSettings': 'WebDav',
    'wordList': 'Lista Parole',
    'importWords': 'Importa Parole',
    'backup': 'Backup/Ripristino',
    'apiConfig': 'Configurazione API',
    'ttsConfig': 'Configurazione TTS',
    'epubTextFix': 'Riparazione testo EPUB',
    'epubSplitter': 'Divisore EPUB',
    'epubToTelegraphName': 'EPUB a Telegra.ph', // 新增翻译
    'openPopup': 'Apri Popup',
    'knownWords': 'Parole Conosciute',
    'wordStats': 'Statistiche di Apprendimento',
    'wordOperations': 'Operazioni Database Parole',
    'wordOperationsTitle': 'Operazioni Database Parole',
    'sentenceManagement': 'Gestione Frasi',
    'currentDbSize': 'Dimensione Database Corrente',
    'totalSentences': 'Frasi Totali',
    'sentenceDeleteOptions': 'Opzioni Eliminazione Frasi',
    'deleteAllSentences': 'Elimina Tutte le Frasi',
    'keepNSentences': 'Mantieni Prime N Frasi per Parola',
    'keepCount': 'Numero da Mantenere',
    'refreshDbSize': 'Aggiorna Informazioni Database',
    'executeSentenceOperation': 'Esegui Eliminazione Frasi',
    'databaseManagement': 'Gestione Database',
    'clearLocalDb': 'Cancella Database Locale',
    'resetPhrasesDb': 'Ripristina Database Frasi',
    'resetPhrasesDbHint': 'Se hai cancellato il database delle parole e reimportato, potrebbe essere necessario creare una nuova cache delle frasi dal nuovo database.',
    'resetPhrasesDbSuccess': 'Database frasi ripristinato con successo!',
    'resetPhrasesDbError': 'Ripristino database frasi fallito',
    'confirmResetPhrasesDb': 'Sei sicuro di voler ripristinare il database delle frasi? Questo cancellerà la cache delle frasi esistente e la ricreerà dal database principale.',
    'language': 'Lingua',
    'status': 'Stato',
    'all': 'Tutti',
    'zh': 'Cinese',
    'en': 'Inglese',
    'de': 'Tedesco',
    'fr': 'Francese',
    'es': 'Spagnolo',
    'it': 'Italiano',
    'ja': 'Giapponese',
    'ko': 'Coreano',
    'ru': 'Russo',
    'custom': 'Personalizzato',
    'known': 'Conosciuto (0)',
    'learning': 'In Apprendimento (1) (Evidenziazione gialla)',
    'familiar': 'Familiare (2) (Evidenziazione giallo chiaro)',
    'recognized': 'Riconosciuto (3) (Evidenziazione grigia)',
    'almostMastered': 'Quasi Padroneggiato (4) (Sottolineato)',
    'fullyMastered': 'Completamente Padroneggiato (5) (Nessuna evidenziazione)',
    'itemsPerPage': 'Elementi per pagina',
    'applyFilter': 'Applica Filtro',
    'prevPage': 'Precedente',
    'nextPage': 'Pagina {current} di {total}',
    'nextBtn': 'Successivo',
    'importTxt': 'Importa Parole TXT',
    'separator': 'Separatore',
    'newline': 'Nuova linea',
    'comma': 'Virgola',
    'wordStatus': 'Stato Parola',
    // Glass effect settings translations (Italian)
    'glassEffectSettings': 'Impostazioni Materiale Vetro',
    'glassEffectType': 'Tipo Effetto Vetro',
    'glassEffectPreview': 'Anteprima Effetto',
    'glassEffectAutoSave': 'Le impostazioni vengono salvate automaticamente e applicate al tooltip',
    'glassEffectLiquid': 'Vetro Liquido (Liquid) ⚠️Lag, non consigliato',
    'glassEffectFractal': 'Rumore Frattale (Fractal)',
    'glassEffectFlip': 'Flip (Flip)',
    'glassEffectRgbSplit': 'Separazione RGB (RGB Split)',
    'glassEffectPixel': 'Pixelato (Pixel)',
    'glassEffectFluted': 'Scanalato (Fluted)',
    'glassEffectTiled': 'Piastrellato (Tiled)',
    'glassEffectMosaic': 'Mosaico (Mosaic)',
    'glassEffectEllipses': 'Ellissi (Ellipses)',
    'glassEffectRough': 'Ruvido (Rough)',
    'glassEffectBulge': 'Rigonfiamento (Bulge)',
    'delete': 'Elimina (0)',
    'apiBasic': 'Impostazioni Base',
    'apiLanguageDetection': 'Rilevamento Lingua',
    'apiTagAnalysis': 'Parte del Discorso',
    'apiWordExplanation': 'Spiegazione Parola',
    'apiSentenceTranslation': 'Traduzione Frase',
    'apiAnalysis': 'Analisi Frase',
    'apiSidebar': 'Analisi Barra Laterale',
    'apiBasicSettings': 'Impostazioni Base API',
    'apiLanguageDetectionSettings': 'Impostazioni Rilevamento Lingua',
    'apiTagAnalysisSettings': 'Impostazioni Parte del Discorso',
    'apiWordExplanationSettings': 'Impostazioni Spiegazione Parola',
    'apiSentenceTranslationSettings': 'Impostazioni Traduzione Frase',
    'apiAnalysisSettings': 'Impostazioni Analisi Frase',
    'apiSidebarSettings': 'Impostazioni Analisi Barra Laterale',
    'apiBaseUrl': 'URL base API: esempio: https://api.chatgpt.com/v1/chat/completions',
    'apiKey': 'Chiave API:',
    'model': 'Modello:',
    'activeProfileLabel': 'Configurazione attiva:',
    'addProfileBtn': '+ Aggiungi configurazione',
    'profileName': 'Nome configurazione:',
    'enableApiPollingLabel': 'Abilita polling',
    'profileEnablePollingLabel': 'Partecipa al polling',
    'ohmygptBaseUrlLabel': 'OhMyGpt Base URL:',
    'ohmygptBaseUrlRecommended': 'Raccomandato',
    'ohmygptBaseUrlRecommendedDesc': 'US Direct | Enterprise',
    'ohmygptBaseUrlCloudflare': 'Cloudflare CDN',
    'ohmygptBaseUrlCloudflareDesc': 'Cloudflare CDN | Global',
    'ohmygptBaseUrlMainland': 'Asia Optimized',
    'ohmygptBaseUrlMainlandDesc': 'Asia Optimized CDN',
    'ohmygptBaseUrlCn2': 'CN2 GIA',
    'ohmygptBaseUrlCn2Desc': 'CN2 GIA | Asia',
    'ttsBasic': 'Impostazioni Base',
    'ttsLocal': 'TTS Locale',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': 'URL Personalizzato',
    'about': 'Informazioni',
    'startDate': 'Data Inizio',
    'endDate': 'Data Fine',
    'filterToday': 'Oggi',
    'filterYesterday': 'Ieri',
    'filterThisWeek': 'Questa Settimana',
    'filterThisMonth': 'Questo Mese',
    'filterNoDate': 'Parole senza Data',
    'dateFilterWarning': 'Le parole importate potrebbero non avere dati temporali, i risultati del filtro potrebbero essere imprecisi. Si prega di ignorare i dati temporali durante il conteggio delle parole conosciute.',
    'filterByStatusOnly': 'Filtra solo per stato',
    'pastDays': 'Giorni passati',
    'applyPastDays': 'Applica',
    'statusFilterMinOne': 'Seleziona almeno uno stato della parola',
    // Account management related translations
    'cloudLoggedInAs': 'Accesso effettuato come:',
    'cloudSubscriptionStatus': 'Abbonamento:',
    'cloudExpiresAt': 'Scade:',
    'cloudDataServer': 'Server dati:',
    'cloudAfdianId': 'ID Afdian:',
    'cloudPlanName': 'Piano:',
    'cloudStorage': 'Spazio:',
    // Traduzioni relative alle donazioni
    'donateButton': 'Sponsor',
    'donationNote1': 'Lingkuma è completamente open-source e gratuito. La manutenzione del software non è facile. Se trovi questo software utile, sei invitato a donare tramite <a href="https://afdian.com/a/lingkuma" target="_blank">Afdian</a> o codice QR WeChat.<br>Le parole sono archiviate localmente per impostazione predefinita. Dopo aver donato, puoi utilizzare la sincronizzazione cloud pubblica ufficiale in tempo reale per le parole, consentendo l\'utilizzo multi-dispositivo senza soluzione di continuità. (La configurazione del plugin contiene informazioni sensibili come le API, attualmente supporta solo la sincronizzazione multi-dispositivo gestita dall\'utente tramite Webdav)',
    'donationNote2': 'Puoi ancora sincronizzare gratuitamente tramite i seguenti metodi:<br>1. Utilizza [Jianguoyun Webdav] per la sincronizzazione multi-dispositivo gratuita, ma non in tempo reale, richiedendo upload e download manuali su più dispositivi.<br>2. Visita la <a href="https://shared-server.lingkuma.org" target="_blank">[Lista dei Server Pubblici]</a> per utilizzare i server forniti dalla community;<br>3. Imposta il tuo servizio di sincronizzazione personalizzato localmente o su un server utilizzando il Docker ufficiale;',
    'donationNote3': 'Se riscontri difficoltà durante l\'utilizzo, puoi consultare la <a href="https://docs.lingkuma.org/">Guida Utente</a>, guardare i miei video, e sei anche invitato a unirti alla community.',
    'donationNote4': 'Grazie per aver utilizzato Lingkuma. Spero che possa aiutarti a imparare più facilmente.',
    'cloudServerHealth': 'Verifica stato server',
    'cloudHealthCheckBtn': '🏥 Verifica stato server',
    'webdavActions': 'Sincronizzazione e backup WebDAV',
    'webdavWordsSync': 'Sincronizzazione parole Webdav',
    'webdavCredentials': 'Credenziali WebDAV',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': 'Nome utente:',
    'webdavPasswordLabel': 'Password:',
    'webdavUploadSyncBtn': '1️⃣ Dispositivo A Carica database di sincronizzazione (sovrascrivi cloud); es. caricamento PC',
    'webdavDownloadMergeBtn': '2️⃣ Dispositivo B Scarica database di sincronizzazione (unisci localmente); es. scaricamento e unione telefono',
    'webdavDownloadReplaceBtn': '⚠️ Dispositivo B Scarica database di sincronizzazione (sostituisci localmente); Sovrascrivi completamente localmente',
    'webdavUploadBackupBtn': '♻️ Carica solo file di backup, più volte',
    'multiDeviceSettings': 'Sincronizzazione impostazioni multi-dispositivo',
    'webdavClearDbBtn': 'Cancella database locale',
    'confirmClearDatabase': 'Sei sicuro di voler cancellare tutti i dati delle parole locali? Questa operazione non può essere annullata!',
    'webdavClearingDb': 'Cancellazione database locale...',
    'webdavClearDbSuccess': 'Database locale cancellato!',
    'webdavClearDbError': 'Impossibile cancellare il database locale',
    'unknownError': 'Si è verificato un errore sconosciuto'
  },
  'ko': {
    'customCapsulesSettings': 'Impostazioni Capsule Personalizzate',
    'customCapsulesDescription': 'Personalizza contenitori e pulsanti delle capsule',
    'customCapsulesHelp': '<strong>Contenitore Capsule</strong>: Ogni contenitore di capsule è una riga che può contenere più pulsanti. Più contenitori di capsule si sovrappongono verso l\'alto.<br><strong>Pulsante</strong>: Ogni pulsante è un trigger di ricerca che apre un URL specifico quando cliccato. Il <code>{word}</code> nell\'URL verrà sostituito con la parola corrente.',
    'addCapsuleContainer': '+ Aggiungi Contenitore Capsule',
    'noCapsulesYet': 'Nessun contenitore di capsule aggiunto ancora, clicca il pulsante qui sotto per aggiungere',
    'capsuleContainer': 'Contenitore Capsule',
    'buttonName': 'Nome Pulsante',
    'buttonUrl': 'URL',
    'buttonIcon': 'Icona',
    'buttonIconPlaceholder': 'Opzionale, lascia vuoto per usare l\'icona predefinita',
    'buttonOpenMethod': 'Metodo Apertura',
    'openMethodNewTab': 'Nuova Scheda',
    'openMethodIframe': 'Popup iframe',
    'openMethodNewWindow': 'Nuova Finestra',
    'openMethodSidebar': 'Barra Laterale',
    'newButton': 'Nuovo Pulsante',
    'addButton': '+ Aggiungi Pulsante',
    'deleteContainer': 'Elimina Contenitore',
    'deleteButton': 'Elimina Pulsante',
    'noButtonsYet': 'Questo contenitore non ha ancora pulsanti, clicca "Aggiungi Pulsante" per aggiungere',
    'autoSavedCapsule': '✓ Salvato automaticamente',
    'capsuleAutoSaveHint': '✓ Le impostazioni vengono salvate automaticamente',
    'confirmDeleteContainer': 'Sei sicuro di voler eliminare questo contenitore di capsule?',
    'confirmDeleteButton': 'Sei sicuro di voler eliminare questo pulsante?',
    // Known Sentence Animation translations
    'knownSentenceAnimation': 'Animazione Frasi Conosciute',
    'knownSentenceAnimationSettings': 'Impostazioni Animazione Frasi Conosciute',
    'animationDescription': 'Configurazione animazione effetto esplosione frasi per frasi conosciute',
    'animationHelp': 'Configura l\'animazione visualizzata quando non ci sono parole sconosciute in una frase. Puoi impostare animazioni di livello superiore e inferiore, supportando animazioni predefinite o caricando file TGS personalizzati.',
    'animationSize': 'Dimensione Animazione',
    'animationWidth': 'Larghezza',
    'animationHeight': 'Altezza',
    'animationDefaultSize': 'Predefinito: 150x150px',
    'topLayerAnimation': 'Animazione Livello Superiore',
    'bottomLayerAnimation': 'Animazione Livello Inferiore',
    'enable': 'Abilita',
    'selectAnimation': 'Seleziona Animazione',
    'uploadCustom': 'Carica File TGS Personalizzato',
    'selectFile': 'Seleziona File',
    'tgsFormatOnly': 'Sono supportati solo file di animazione in formato .tgs',
    'animationSaved': '✓ Impostazioni salvate automaticamente',
    'customAnimationSaved': 'Animazione personalizzata del livello {layer} salvata',
    'capsuleTips': 'Suggerimenti',
    'capsuleTipsContent': '• <strong>Contenitore Capsule</strong>: Un contenitore di pulsanti orizzontale, più contenitori si sovrappongono verso l\'alto<br>• <strong>Nome Pulsante</strong>: Testo visualizzato sul pulsante<br>• <strong>URL</strong>: L\'URL da aprire, usa {word} come segnaposto per la parola corrente<br>• <strong>Metodo Apertura</strong>:<br>&nbsp;&nbsp;- Nuova Scheda: Apri in una nuova scheda del browser<br>&nbsp;&nbsp;- Popup iframe: Apri in un popup iframe sulla pagina corrente<br>&nbsp;&nbsp;- Nuova Finestra: Apri in una nuova finestra del browser<br>&nbsp;&nbsp;- Barra Laterale: Apri nella barra laterale del browser<br>• <strong>Esempio</strong>:<br>&nbsp;&nbsp;Contenitore 1: [Immagini Google] [Wikipedia] [Dizionario]<br>&nbsp;&nbsp;Contenitore 2: [YouTube] [Traduci]<br>• <strong>Esempio URL</strong>: https://www.google.com/search?q={word}&tbm=isch'
  },
  // 添加韩语翻译
  'ko': {
    'databaseOperations': '데이터베이스 작업',
    'cloudDatabaseSettings': 'Cloud Database',
    'cloudServerConfig': '서버 구성',
    'cloudServerUrlLabel': '서버 URL:',
    'cloudDbEnabledLabel': '클라우드 데이터베이스 활성화(로그인하지 않은 경우 켜지 마세요. 로컬 데이터베이스를 사용하려면 끄세요)',
    'cloudDualWriteLabel': '이중 쓰기 활성화 (로컬 및 클라우드 모두에 쓰기)',
    'cloudAccountManagement': '계정 관리',
    'cloudSelfHostedLabel': '셀프 호스트 서버 (고급)',
    'cloudSelfHostedHint': '자체 서버를 실행 중인 경우 이 옵션을 사용하십시오. 그렇지 않으면 공식 클라우드 서비스를 사용하기 위해 끄십시오.',
    'webdavSettings': 'WebDav',
    'wordList': '단어 목록',
    'importWords': '단어 가져오기',
    'backup': '백업/복원',
    'apiConfig': 'API 구성',
    'ttsConfig': 'TTS 구성',
    'epubTextFix': 'EPUB 텍스트 수정',
    'epubSplitter': 'EPUB 분할 도구',
    'epubToTelegraphName': 'EPUB을 Telegra.ph로', // 新增翻译
    'openPopup': '팝업 열기',
    'knownWords': '알고 있는 단어',
    'language': '언어',
    'status': '상태',
    'all': '모두',
    'zh': '중국어',
    'en': '영어',
    'de': '독일어',
    'fr': '프랑스어',
    'es': '스페인어',
    'it': '이탈리아어',
    'ja': '일본어',
    'ko': '한국어',
    'ru': '러시아어',
    'custom': '사용자 정의',
    'known': '알고 있음 (0)',
    'learning': '학습 중 (1) (노란색 강조)',
    'familiar': '익숙함 (2) (연한 노란색 강조)',
    'recognized': '인식됨 (3) (회색 강조)',
    'almostMastered': '거의 마스터됨 (4) (밑줄)',
    'fullyMastered': '완전히 마스터됨 (5) (강조 없음)',
    'itemsPerPage': '페이지당 항목',
    'applyFilter': '필터 적용',
    'prevPage': '이전',
    'nextPage': '페이지 {current}/{total}',
    'nextBtn': '다음',
    'importTxt': 'TXT 단어 가져오기',
    'separator': '구분자',
    'newline': '줄바꿈',
    'comma': '쉼표',
    'wordStatus': '단어 상태',
    'delete': '삭제 (0)',
    'apiBasic': '기본 설정',
    'apiLanguageDetection': '언어 감지',
    'apiTagAnalysis': '품사',
    'apiWordExplanation': '단어 설명',
    'apiSentenceTranslation': '문장 번역',
    'apiAnalysis': '문장 분석',
    'apiSidebar': '사이드바 분석',
    'ttsBasic': '기본 설정',
    'ttsLocal': '로컬 TTS',
    'ttsMinimaxi': 'Minimaxi TTS',
    'ttsCustom': '사용자 정의 URL',
    'about': '정보',
    'startDate': '시작 날짜',
    'endDate': '종료 날짜',
    'filterToday': '오늘',
    'filterYesterday': '어제',
    'filterThisWeek': '이번 주',
    'filterThisMonth': '이번 달',
    'filterNoDate': '날짜 없는 단어',
    'dateFilterWarning': '가져온 단어에는 시간 데이터가 없을 수 있으며 필터링 결과가 부정확할 수 있습니다. 알려진 단어를 계산할 때 시간 데이터를 무시하십시오.',
    'filterByStatusOnly': '상태로만 필터링',
    'pastDays': '지난 일수',
    'applyPastDays': '적용',
    'statusFilterMinOne': '하나 이상의 단어 상태를 선택하십시오',
    // Account management related translations
    'cloudLoggedInAs': '로그인됨:',
    'cloudSubscriptionStatus': '구독:',
    'cloudExpiresAt': '만료:',
    'cloudDataServer': '데이터 서버:',
    'cloudAfdianId': 'Afdian ID:',
    'cloudPlanName': '플랜:',
    'cloudStorage': '저장공간:',
    // 기부 관련 번역
    'donateButton': 'Sponsor',
    'donationNote1': 'Lingkuma는 완전히 오픈 소스이며 무료입니다. 소프트웨어 유지 관리가 쉽지 않습니다. 이 소프트웨어가 도움이 된다고 생각하시면 <a href="https://afdian.com/a/lingkuma" target="_blank">Afdian</a> 또는 WeChat QR 코드를 통해 기부해 주십시오.<br>단어는 기본적으로 로컬에 저장됩니다. 기부 후 공식 공용 실시간 클라우드 동기화를 단어에 사용할 수 있으며, 원활한 다중 장치 사용이 가능합니다. (플러그인 구성에는 API와 같은 민감한 정보가 포함되어 있어 현재는 Webdav를 통한 사용자 관리 다중 장치 동기화만 지원합니다)',
    'donationNote2': '다음 방법을 통해 무료로 동기화할 수 있습니다:<br>1. [Jianguoyun Webdav]를 사용하여 무료 다중 장치 동기화를 하지만 실시간이 아니며 여러 장치에서 수동 업로드 및 다운로드가 필요합니다.<br>2. <a href="https://shared-server.lingkuma.org" target="_blank">[공용 서버 목록]</a>을 방문하여 커뮤니티가 제공하는 서버를 사용합니다;<br>3. 공식 Docker를 사용하여 로컬 또는 서버에서 자체 동기화 서비스를 설정합니다;',
    'donationNote3': '사용 중에 어려움을 겪으시면 <a href="https://docs.lingkuma.org/">사용자 가이드</a>를 확인하고 제 비디오를 시청하시며 커뮤니티에 참여하신 것도 환영합니다.',
    'donationNote4': 'Lingkuma를 사용해 주셔서 감사합니다. 더 원활한 학습에 도움이 되기를 바랍니다.',
    'cloudServerHealth': '서버 상태 확인',
    'cloudHealthCheckBtn': '🏥 서버 상태 확인',
    'webdavActions': 'WebDAV 동기화 및 백업',
    'webdavWordsSync': 'Webdav 단어 동기화',
    'webdavCredentials': 'WebDAV 자격 증명',
    'webdavUrlLabel': 'URL:',
    'webdavUsernameLabel': '사용자 이름:',
    'webdavPasswordLabel': '비밀번호:',
    'webdavUploadSyncBtn': '1️⃣ 장치 A 동기화 데이터베이스 업로드(클라우드 덮어쓰기); 예: PC 업로드',
    'webdavDownloadMergeBtn': '2️⃣ 장치 B 동기화 데이터베이스 다운로드(로컬 병합); 예: 휴대폰 다운로드 및 병합',
    'webdavDownloadReplaceBtn': '⚠️ 장치 B 동기화 데이터베이스 다운로드(로컬 교체); 완전히 로컬 덮어쓰기',
    'webdavUploadBackupBtn': '♻️ 백업 파일만 업로드, 여러 번 가능',
    'multiDeviceSettings': '다중 장치 설정 동기화',
    'webdavClearDbBtn': '로컬 데이터베이스 지우기',
    'confirmClearDatabase': '모든 로컬 단어 데이터를 지우시겠습니까? 이 작업은 취소할 수 없습니다!',
    'webdavClearingDb': '로컬 데이터베이스 지우는 중...',
    'webdavClearDbSuccess': '로컬 데이터베이스가 지워졌습니다!',
    'webdavClearDbError': '로컬 데이터베이스를 지우지 못했습니다',
    'unknownError': '알 수 없는 오류가 발생했습니다'
  },
  'pc': {
    'customCapsulesSettings': '사용자 정의 캡슐 설정',
    'customCapsulesDescription': '캡슐 컨테이너와 버튼 사용자 정의',
    'customCapsulesHelp': '<strong>캡슐 컨테이너</strong>: 각 캡슐 컨테이너는 한 줄로 여러 버튼을 포함할 수 있습니다. 여러 캡슐 컨테이너는 위로 겹쳐서 표시됩니다.<br><strong>버튼</strong>: 각 버튼은 검색 트리거로, 클릭하면 지정된 URL을 엽니다. URL의 <code>{word}</code>는 현재 단어로 대체됩니다.',
    'addCapsuleContainer': '+ 캡슐 컨테이너 추가',
    'noCapsulesYet': '아직 캡슐 컨테이너가 추가되지 않았습니다. 아래 버튼을 클릭하여 추가하세요.',
    'capsuleContainer': '캡슐 컨테이너',
    'buttonName': '버튼 이름',
    'buttonUrl': 'URL',
    'buttonIcon': '아이콘',
    'buttonIconPlaceholder': '선택 사항, 비워두면 기본 아이콘 사용',
    'buttonOpenMethod': '열기 방식',
    'openMethodNewTab': '새 탭',
    'openMethodIframe': 'iframe 팝업',
    'openMethodNewWindow': '새 창',
    'openMethodSidebar': '사이드바',
    'newButton': '새 버튼',
    'addButton': '+ 버튼 추가',
    'deleteContainer': '컨테이너 삭제',
    'deleteButton': '버튼 삭제',
    'noButtonsYet': '이 컨테이너에는 아직 버튼이 없습니다. "버튼 추가"를 클릭하여 추가하세요.',
    'autoSavedCapsule': '✓ 자동 저장됨',
    'capsuleAutoSaveHint': '✓ 설정은 자동으로 저장됩니다',
    'confirmDeleteContainer': '이 캡슐 컨테이너를 삭제하시겠습니까?',
    'confirmDeleteButton': '이 버튼을 삭제하시겠습니까?',
    // Known Sentence Animation translations
    'knownSentenceAnimation': '알고 있는 문장 애니메이션',
    'knownSentenceAnimationSettings': '알고 있는 문장 애니메이션 설정',
    'animationDescription': '문장 폭발 알고 있는 문장 효과 애니메이션 설정',
    'animationHelp': '문장에 알 수 없는 단어가 없을 때 표시되는 애니메이션을 설정합니다. 상위 및 하위 레이어 애니메이션을 설정할 수 있으며, 프리셋 애니메이션 또는 사용자 정의 TGS 파일 업로드를 지원합니다.',
    'animationSize': '애니메이션 크기',
    'animationWidth': '너비',
    'animationHeight': '높이',
    'animationDefaultSize': '기본값: 150x150px',
    'topLayerAnimation': '상위 레이어 애니메이션',
    'bottomLayerAnimation': '하위 레이어 애니메이션',
    'enable': '활성화',
    'selectAnimation': '애니메이션 선택',
    'uploadCustom': '사용자 정의 TGS 파일 업로드',
    'selectFile': '파일 선택',
    'tgsFormatOnly': '.tgs 형식의 애니메이션 파일만 지원됩니다',
    'animationSaved': '✓ 설정이 자동으로 저장됨',
    'customAnimationSaved': '{layer} 레이어 사용자 정의 애니메이션이 저장됨',
    'capsuleTips': '팁',
    'capsuleTipsContent': '• <strong>캡슐 컨테이너</strong>: 가로 방향의 버튼 컨테이너, 여러 컨테이너는 위로 겹쳐서 표시됩니다<br>• <strong>버튼 이름</strong>: 버튼에 표시되는 텍스트<br>• <strong>URL</strong>: 열 URL, 현재 단어의 플레이스홀더로 {word}를 사용하세요<br>• <strong>열기 방식</strong>:<br>&nbsp;&nbsp;- 새 탭: 브라우저의 새 탭에서 열기<br>&nbsp;&nbsp;- iframe 팝업: 현재 페이지의 iframe 팝업에서 열기<br>&nbsp;&nbsp;- 새 창: 브라우저의 새 창에서 열기<br>&nbsp;&nbsp;- 사이드바: 브라우저의 사이드바에서 열기<br>• <strong>예시</strong>:<br>&nbsp;&nbsp;컨테이너 1: [Google 이미지] [위키백과] [사전]<br>&nbsp;&nbsp;컨테이너 2: [YouTube] [번역]<br>• <strong>예시 URL</strong>: https://www.google.com/search?q={word}&tbm=isch'
  }
  // 可以继续添加其他语言的翻译
};

// 翻译函数
function translate(key, params = {}) {
  // 从chrome.storage.local获取当前语言，如果没有则使用全局变量或默认为'zh'
  const currentLang = window.currentUILanguage || 'zh';

  // 使用 i18n 变量而不是未定义的 translations
  let text = (i18n && i18n[currentLang] && i18n[currentLang][key]) ? i18n[currentLang][key] : key;

  // 替换参数
  Object.keys(params).forEach(param => {
    text = text.replace(`{${param}}`, params[param]);
  });

  return text;
}

// 修改updatePageLanguage函数，使用通用的存储键
function updatePageLanguage(lang) {
  // 使用chrome.storage.local而不是localStorage，确保与popup共享
    // 确保语言存在，默认为中文
    const currentLang = i18n[lang] ? lang : 'zh';

    // 设置全局变量，供translate函数使用
    window.currentUILanguage = currentLang;

    // 获取所有需要翻译的元素
    const elements = document.querySelectorAll('[data-i18n]');

    // 应用翻译
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      // 检查是否有附加后缀
      const suffix = el.getAttribute('data-i18n-suffix') || '';

      if (i18n[currentLang] && i18n[currentLang][key]) {
        // 根据元素类型设置内容
        if (el.tagName === 'LABEL' || el.tagName === 'DIV' || el.tagName === 'BUTTON' || el.tagName === 'SPAN'|| el.tagName === 'H2'|| el.tagName === 'H3' || el.tagName === 'H1' || el.tagName === 'SMALL') {
          el.innerHTML = i18n[currentLang][key] + suffix;
        } else if (el.tagName === 'INPUT' && (el.getAttribute('type') === 'text' || el.getAttribute('type') === 'search')) {
          el.placeholder = i18n[currentLang][key] + suffix;
        } else if (el.tagName === 'OPTION') {
          el.textContent = i18n[currentLang][key] + suffix;
        }
      }
    });


}

// 更新页码信息


// 修改 openDB 函数，删除 knownWords 相关代码
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vocabDB", 3); // 升级到版本3以匹配background.js
    request.onerror = function(e) {
      console.error("[options.js] 打开数据库失败:", e.target.error);
      reject(e.target.error);
    };
    request.onupgradeneeded = function(e) {
      const db = e.target.result;
      const oldVersion = e.oldVersion;
      console.log(`[options.js] 数据库升级: 从版本 ${oldVersion} 到版本 3`);

      // 创建 wordDetails 对象存储(如果不存在)
      if (!db.objectStoreNames.contains("wordDetails")) {
        const store = db.createObjectStore("wordDetails", { keyPath: 'word' });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("isCustom", "isCustom", { unique: false });
        console.log("[options.js] 创建 wordDetails 对象存储及索引");
      } else {
        // 已有数据库的升级逻辑
        const store = e.target.transaction.objectStore("wordDetails");

        // 检查并创建 status 索引
        if (!store.indexNames.contains("status")) {
          store.createIndex("status", "status", { unique: false });
          console.log("[options.js] 创建 status 索引");
        }

        // 检查并创建 isCustom 索引(版本3新增)
        if (!store.indexNames.contains("isCustom")) {
          store.createIndex("isCustom", "isCustom", { unique: false });
          console.log("[options.js] 创建 isCustom 索引");
        }
      }
    };
    request.onsuccess = function(e) {
      console.log("[options.js] 数据库打开成功");
      resolve(e.target.result);
    };
  });
}

// 删除 getAllKnownWords, addKnownWord, clearAllKnownWords 函数

// 保留并修改 updateWordStatus 函数
function updateWordStatus(word, status, language) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["wordDetails"], "readwrite");
      const store = transaction.objectStore("wordDetails");
      const getReq = store.get(word);
      getReq.onsuccess = function(e) {
        let record = e.target.result || {
          word: word,
          term: word,
          statusHistory: {},
          isCustom: false
        };

        // 确保 status 是字符串类型
        const strStatus = String(status);
        record.status = strStatus;

        // 只有当 language 有值时才更新
        if (language !== undefined && language !== null && language !== '') {
          record.language = language;
        }

        // 初始化 statusHistory 如果不存在
        if (!record.statusHistory) {
          record.statusHistory = {};
        }

        // 更新状态历史记录（使用字符串作为键）
        if (!record.statusHistory[strStatus]) {
          record.statusHistory[strStatus] = {
            createTime: Date.now(),
            updateTime: Date.now()
          };
        } else {
          record.statusHistory[strStatus].updateTime = Date.now();
        }

        const putReq = store.put(record);
        putReq.onsuccess = function() {
          resolve();
        };
        putReq.onerror = function(e) {
          reject(e.target.errorCode);
        };
      };
      getReq.onerror = function(e) {
        reject(e.target.errorCode);
      };
    });
  });
}

// 新增:从 wordDetails 获取所有单词
function getAllWords() {
  console.log("[options.js] 开始获取所有单词");
  return openDB().then(db => {
    console.log("[options.js] 数据库已打开,准备查询单词");
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["wordDetails"], "readonly");
      const store = transaction.objectStore("wordDetails");
      const request = store.getAll();
      request.onsuccess = function(e) {
        const words = e.target.result.map(item => item.word);
        console.log("[options.js] 成功获取单词数量:", words.length);
        resolve(words);
      };
      request.onerror = function(e) {
        console.error("[options.js] 获取单词失败:", e.target.error);
        reject(e.target.error);
      };
    });
  }).catch(err => {
    console.error("[options.js] getAllWords 失败:", err);
    throw err;
  });
}

// 新增：按状态获取单词
function getWordsByStatus(status) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["wordDetails"], "readonly");
      const store = transaction.objectStore("wordDetails");
      const index = store.index("status");
      const request = status === 'all' ? store.getAll() : index.getAll(status);

      request.onsuccess = function(e) {
        resolve(e.target.result);
      };
      request.onerror = function(e) {
        reject(e.target.errorCode);
      };
    });
  });
}

// 新增：清空 wordDetails
function clearAllWords() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["wordDetails"], "readwrite");
      const store = transaction.objectStore("wordDetails");
      const request = store.clear();
      request.onsuccess = function() {
        resolve();
      };
      request.onerror = function(e) {
        reject(e.target.errorCode);
      };
    });
  });
}

// 分页相关变量和函数
let wordsArray = []; // 重命名，不再是 knownWordsArray
let filteredWordsArray = [];
let currentPage = 1;
let pageSize = 10; // 默认每页显示 10 个单词
let totalPages = 1;
let wordDetailsMap = {}; // 存储单词详情的映射

// 筛选器变量
let currentLanguageFilter = 'all';
let currentStatusFilter = 'all';
let currentStartDateFilter = '';
let currentEndDateFilter = '';
let currentNoDateFilter = false;

// 多选框相关变量
let selectedWords = new Set(); // 存储选中的单词

// 更新操作按钮的显示状态
function updateBulkActionButtons() {
  const bulkActionsDiv = document.getElementById("bulkActions");
  if (!bulkActionsDiv) return;

  if (selectedWords.size > 0) {
    bulkActionsDiv.style.display = "flex";
    const selectedCountSpan = document.getElementById("selectedCount");
    if (selectedCountSpan) {
      selectedCountSpan.textContent = selectedWords.size;
    }
  } else {
    bulkActionsDiv.style.display = "none";
  }
}

// 删除选中的单词
function deleteSelectedWords() {
  if (selectedWords.size === 0) return;

  const wordsToDelete = Array.from(selectedWords);
  console.log('[options.js] 准备删除的单词:', wordsToDelete);
  let deletedCount = 0;
  let errorCount = 0;

  // 使用 Promise.all 并行删除所有单词
  const deletePromises = wordsToDelete.map(word => {
    console.log('[options.js] 删除单词:', word, '类型:', typeof word, '长度:', word.length);

    // 每个单词调用两个删除接口：小写化的和原型的
    const deletePromise1 = new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "deleteWord",
        word: word
      }, (response) => {
        if (chrome.runtime.lastError || (response && response.error)) {
          console.error(`删除单词(小写) ${word} 失败:`, chrome.runtime.lastError || response.error);
        } else {
          console.log(`删除单词(小写) ${word} 成功`);
        }
        resolve();
      });
    });

    const deletePromise2 = new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "deleteWordExact",
        word: word
      }, (response) => {
        if (chrome.runtime.lastError || (response && response.error)) {
          console.error(`删除单词(原型) ${word} 失败:`, chrome.runtime.lastError || response.error);
        } else {
          console.log(`删除单词(原型) ${word} 成功`);
        }
        resolve();
      });
    });

    // 等待两个删除都完成
    return Promise.all([deletePromise1, deletePromise2]).then(() => {
      deletedCount++;
      // 从前端数据中删除
      wordsArray = wordsArray.filter(w => w !== word);
      filteredWordsArray = filteredWordsArray.filter(w => w !== word);
      delete wordDetailsMap[word];
    }).catch(() => {
      errorCount++;
    });
  });

  // 等待所有删除操作完成
  Promise.all(deletePromises).then(() => {
    // 清空选中状态
    selectedWords.clear();

    // 更新分页和显示
    updatePagination();
    displayPage(currentPage);

    // 显示结果
    alert(`成功删除 ${deletedCount} 个单词${errorCount > 0 ? `，失败 ${errorCount} 个` : ''}`);
  });
}

// 显示当前页面中的单词列表，改为表格式布局，状态和语言直接显示在右侧
function displayPage(page) {
  const wordListEl = document.getElementById("wordList");
  wordListEl.innerHTML = ""; // 清空现有列表
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageWords = filteredWordsArray.slice(start, end);

  if (pageWords.length === 0) {
    wordListEl.innerHTML = `<div class="no-data" style="text-align: center; padding: 20px; color: var(--text-secondary);">No words to display</div>`;
  } else {
    // 移除旧的批量操作按钮区域（如果存在）
    const oldBulkActionsDiv = document.getElementById("bulkActions");
    if (oldBulkActionsDiv) {
      oldBulkActionsDiv.remove();
    }

    // 添加操作按钮区域（只在有选中项时显示）
    const bulkActionsDiv = document.createElement("div");
    bulkActionsDiv.id = "bulkActions";
    // 获取wordList的左侧位置，添加20px偏移
    const wordListRect = wordListEl.getBoundingClientRect();
    const leftPosition = wordListRect.left + 20;

    bulkActionsDiv.style.cssText = `
      display: ${selectedWords.size > 0 ? "flex" : "none"};
      position: fixed;
      top: 60px;
      left: ${leftPosition}px;
      gap: 10px;
      align-items: center;
      background: var(--background-color);
      padding: 10px 20px;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      border: 1px solid var(--border-color);
    `;
    bulkActionsDiv.innerHTML = `
      <span style="color: var(--text-secondary); font-size: 14px;">已选中 <span id="selectedCount">${selectedWords.size}</span> 个单词</span>
      <button id="deleteSelectedBtn" style="background-color: var(--danger-color);">删除选中</button>
      <button id="clearSelectionBtn">取消全选</button>
    `;
    document.body.appendChild(bulkActionsDiv);

    // 为按钮添加事件监听器（因为按钮不在wordList中，事件委托失效）
    const deleteBtn = bulkActionsDiv.querySelector('#deleteSelectedBtn');
    const clearBtn = bulkActionsDiv.querySelector('#clearSelectionBtn');

    if (deleteBtn) {
      deleteBtn.addEventListener('click', function() {
        if (selectedWords.size === 0) {
          alert('请先选择要删除的单词');
          return;
        }
        const confirmMsg = `确定要删除选中的 ${selectedWords.size} 个单词吗？此操作不可恢复！`;
        if (confirm(confirmMsg)) {
          deleteSelectedWords();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        selectedWords.clear();
        displayPage(currentPage);
        updateBulkActionButtons();
      });
    }

    // 添加表头
    const tableHeaderDiv = document.createElement("div");
    tableHeaderDiv.className = "word-table-header";
    tableHeaderDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <input type="checkbox" id="selectAllCheckbox" class="word-checkbox" style="cursor: pointer;">
        <span>${translate('knownWords') || '单词'}</span>
      </div>
      <div class="language-column" style="text-align: right;">${translate('language') || '语言'}</div>
      <div class="status-column" style="text-align: right;">${translate('status') || '状态'}</div>
    `;
    wordListEl.appendChild(tableHeaderDiv);

    // 全选复选框事件
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    if (selectAllCheckbox) {
      // 设置全选框的状态
      const allPageWordsSelected = pageWords.every(word => selectedWords.has(word));
      selectAllCheckbox.checked = allPageWordsSelected && pageWords.length > 0;

      selectAllCheckbox.addEventListener("change", function() {
        if (this.checked) {
          // 全选当前页
          pageWords.forEach(word => selectedWords.add(word));
        } else {
          // 取消当前页全选
          pageWords.forEach(word => selectedWords.delete(word));
        }
        displayPage(currentPage); // 重新渲染以更新复选框状态
        updateBulkActionButtons();
      });
    }

    // 添加单词行
    pageWords.forEach(word => {
      const wordItemDiv = document.createElement("div");
      wordItemDiv.className = "expandable-word-item word-item"; // 应用基础和特定样式

      // 获取单词详情
      const details = wordDetailsMap[word] || {};
      const status = details.status || '未知';
      let statusText = '未知';
      switch(status) {
        case '0': statusText = translate('delete') || 'Delete'; break;
        case '1': statusText = translate('learning') || 'Learning'; break;
        case '2': statusText = translate('familiar') || 'Familiar'; break;
        case '3': statusText = translate('recognized') || 'Recognized'; break; // 更正: 'known' 之前是 '认识'，现在用 recognized
        case '4': statusText = translate('almostMastered') || 'Almost Master'; break;
        case '5': statusText = translate('fullyMastered') || 'Fully Mastered'; break;
        default: statusText = 'Unknown'; break;
      }

      const language = details.language || 'unknown';
      let languageText = translate(language) || language;

      // 新增：获取并格式化其他信息
      const term = details.term || word; // 如果没有 term，则使用 word
      const translations = details.translations || [];
      const tags = details.tags || [];
      const sentences = details.sentences || [];

      let addDate = 'N/A';
      if (details.statusHistory) {
        // 尝试找到状态 '1' (Learning) 的创建时间作为添加时间
        // 如果没有，则尝试找到最早的任何状态的创建时间
        let earliestTime = Infinity;
        if (details.statusHistory['1'] && details.statusHistory['1'].createTime) {
            earliestTime = details.statusHistory['1'].createTime;
        } else {
            for (const sKey in details.statusHistory) {
                if (details.statusHistory[sKey] && details.statusHistory[sKey].createTime) {
                    earliestTime = Math.min(earliestTime, details.statusHistory[sKey].createTime);
                }
            }
        }
        if (earliestTime !== Infinity) {
            addDate = new Date(earliestTime).toLocaleDateString();
        }
      }

      // 创建头部 - 表格式布局
      const headerDiv = document.createElement("div");
      headerDiv.className = "word-item-header";

      // 创建表格式布局，添加复选框
      const isChecked = selectedWords.has(word);
      headerDiv.innerHTML = `
        <div class="word-column" style="display: flex; align-items: center; gap: 10px;">
          <input type="checkbox" class="word-checkbox" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
          <span class="word-text-display" style="flex: 1;">${term}</span>
          <span class="expand-icon">&#9654;</span>
        </div>
        <div class="language-column">
          <span class="word-language">${languageText}</span>
        </div>
        <div class="status-column">
          <span class="word-status">${statusText}</span>
        </div>
      `;

      // 复选框事件 - 使用闭包保存word值，避免HTML属性转义问题
      const checkbox = headerDiv.querySelector('.word-checkbox');
      if (checkbox) {
        // 将word值直接存储在DOM元素上
        checkbox._wordKey = word;

        checkbox.addEventListener('change', function(e) {
          e.stopPropagation(); // 防止触发展开/收起
          const wordKey = this._wordKey;
          console.log('[options.js] 复选框变化，单词:', wordKey);
          if (this.checked) {
            selectedWords.add(wordKey);
          } else {
            selectedWords.delete(wordKey);
          }
          updateBulkActionButtons();

          // 更新全选框状态
          const selectAllCheckbox = document.getElementById("selectAllCheckbox");
          if (selectAllCheckbox) {
            const allPageWordsSelected = pageWords.every(w => selectedWords.has(w));
            selectAllCheckbox.checked = allPageWordsSelected && pageWords.length > 0;
          }
        });
      }

      // 创建详情部分 - 增强字体和格式
      const detailsDiv = document.createElement("div");
      detailsDiv.className = "word-item-details";

      let detailsHTML = `
        <div class="word-details-container">`;

      // 1. 首先显示标签
      if (tags.length > 0) {
        detailsHTML += `
          <div class="word-detail-section">
            <div class="word-detail-item">
              <span class="detail-label">标签:</span>
              <div class="detail-content tags-container">
                ${tags.map(tag => `<span class="tag-item">${tag}</span>`).join('')}
              </div>
            </div>
          </div>`;
      } else {
        detailsHTML += `
          <div class="word-detail-section">
            <div class="word-detail-item">
              <span class="detail-label">标签:</span>
              <span class="detail-content">N/A</span>
            </div>
          </div>`;
      }

      // 2. 然后显示翻译
      if (translations.length > 0) {
        detailsHTML += `
          <div class="word-detail-section">
            <div class="word-detail-item">
              <span class="detail-label">翻译:</span>
              <ul class="detail-list">
                ${translations.map(t => `<li class="translation-item">${t}</li>`).join('')}
              </ul>
            </div>
          </div>`;
      } else {
        detailsHTML += `
          <div class="word-detail-section">
            <div class="word-detail-item">
              <span class="detail-label">翻译:</span>
              <span class="detail-content">N/A</span>
            </div>
          </div>`;
      }

      // 3. 接着显示例句，并高亮term单词
      if (sentences.length > 0) {
        detailsHTML += `
          <div class="word-detail-section">
            <div class="word-detail-item">
              <span class="detail-label">例句:</span>
              <div class="detail-list sentences-container">
                ${sentences.map(s => {
                  // 创建正则表达式来匹配term，不区分大小写
                  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                  // 替换例句中的term为带有高亮的版本
                  const highlightedSentence = (s.sentence || 'N/A').replace(regex, '<strong style="color: var(--primary-color);">$1</strong>');

                  return `
                  <div class="sentence-item">
                    <div class="sentence-original">${highlightedSentence}</div>
                    ${s.translation ? `<div class="sentence-translation">${s.translation}</div>` : ''}
                    ${s.url ? `<div class="sentence-url"><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.url}</a></div>` : ''}
                  </div>
                `;
                }).join('')}
              </div>
            </div>
          </div>`;
      } else {
        detailsHTML += `
          <div class="word-detail-section">
            <div class="word-detail-item">
              <span class="detail-label">例句:</span>
              <span class="detail-content">N/A</span>
            </div>
          </div>`;
      }

      // 4. 最后显示原形、键值和添加时间
      detailsHTML += `
          <div class="word-detail-section">
            <div class="word-detail-item">
              <span class="detail-label">原始形式:</span>
              <span class="detail-content">${term}</span>
            </div>
            <div class="word-detail-item">
              <span class="detail-label">键值:</span>
              <span class="detail-content">${word}</span>
            </div>
            <div class="word-detail-item">
              <span class="detail-label">添加日期:</span>
              <span class="detail-content">${addDate}</span>
            </div>
          </div>`;

      detailsHTML += `</div>`;
      detailsDiv.innerHTML = detailsHTML;

      wordItemDiv.appendChild(headerDiv);
      wordItemDiv.appendChild(detailsDiv);
      wordListEl.appendChild(wordItemDiv);

      // 添加点击事件监听器仅到标题栏
      headerDiv.addEventListener('click', (event) => {
        // 如果点击的是复选框或其父元素，不展开/收起
        if (event.target.classList.contains('word-checkbox') ||
            event.target.closest('.word-checkbox')) {
          return;
        }

        // 阻止事件冒泡，防止触发其他点击事件
        event.stopPropagation();

        // 切换详情区域的展开状态
        detailsDiv.classList.toggle('expanded');
        const iconSpan = headerDiv.querySelector('.expand-icon');
        iconSpan.classList.toggle('rotated');

        // 根据展开状态更新图标
        if (detailsDiv.classList.contains('expanded')) {
          // iconSpan.innerHTML = "&#9660;"; // ▼ 符号
        } else {
          iconSpan.innerHTML = "&#9654;"; // ▶ 符号
        }
      });
    });
  }

  // 更新页码信息
  const pageInfoText = translate('nextPage', { current: page, total: totalPages });
  document.getElementById("pageInfo").textContent = pageInfoText;
  // 更新翻页按钮的可用状态
  document.getElementById("prevBtn").disabled = page <= 1;
  document.getElementById("nextBtn").disabled = page >= totalPages;
}

// 应用筛选器（使用数据库层面筛选）
function applyFilters() {
  currentLanguageFilter = document.getElementById('languageFilter').value;

  // 获取选中的状态（多选）
  const selectedStatuses = [];
  const statusCheckboxes = document.querySelectorAll('[id^="statusFilter_"]:checked');
  statusCheckboxes.forEach(checkbox => {
    if (checkbox.value !== 'all') {
      selectedStatuses.push(parseInt(checkbox.value));
    }
  });

  pageSize = parseInt(document.getElementById('pageSizeSelector').value);
  currentStartDateFilter = document.getElementById('startDateFilter').value;
  currentEndDateFilter = document.getElementById('endDateFilter').value;
  // currentNoDateFilter 状态在按钮点击时直接设置

  // 构建筛选条件
  const filters = {
    language: currentLanguageFilter,
    statuses: selectedStatuses
  };

  // 日期筛选
  if (currentNoDateFilter) {
    filters.noDate = true;
  } else if (currentStartDateFilter && currentEndDateFilter) {
    const startDate = new Date(currentStartDateFilter + "T00:00:00");
    const endDate = new Date(currentEndDateFilter + "T23:59:59");
    if (startDate <= endDate) {
      filters.startDate = startDate.getTime();
      filters.endDate = endDate.getTime();
    }
  }

  console.log('[options.js] 应用筛选条件:', filters);

  // 调用新的筛选接口
  getFilteredWordDetails(filters).then(allDetailsMap => {
    wordDetailsMap = allDetailsMap;
    filteredWordsArray = Object.keys(allDetailsMap).sort();

    currentPage = 1;
    updatePagination();
  }).catch(err => {
    console.error("应用筛选时获取单词详情失败:", err);
    const wordListEl = document.getElementById("wordList");
    if (wordListEl) {
        wordListEl.innerHTML = `<div class="no-data" style="text-align: center; padding: 20px; color: var(--danger-color);">Error loading word details.</div>`;
    }
  });
}

// 获取筛选后的单词详情（通过 dataAccessLayer 支持云端/本地）
async function getFilteredWordDetails(filters) {
  try {
    console.log("[options.js] 调用 dataAccessLayer.getFilteredWordDetails, filters:", filters);

    // 使用 dataAccessLayer 自动根据云端开关选择数据源
    const details = await window.dataAccessLayer.getFilteredWordDetails(filters);

    const detailsCount = Object.keys(details).length;
    console.log("[options.js] 获取到筛选后的单词详情数量:", detailsCount);

    return details;
  } catch (error) {
    console.error("[options.js] 获取筛选后的单词详情失败:", error);
    throw error;
  }
}

// 更新总页数和显示当前页
function updatePagination() {
  totalPages = Math.ceil(filteredWordsArray.length / pageSize);
  if (totalPages < 1) {
    totalPages = 1;
  }
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  displayPage(currentPage);
}

// 获取所有单词详情（通过 dataAccessLayer 支持云端/本地）
async function getAllWordDetails() {
  try {
    console.log("[options.js] 直接调用本地数据库获取所有单词详情");

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'getAllWordDetails' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          const detailsCount = Object.keys(response.details).length;
          console.log("[options.js] 获取到单词详情数量:", detailsCount);
          wordDetailsMap = response.details;
          resolve(response.details);
        }
      );
    });
  } catch (error) {
    console.error("[options.js] 获取单词详情失败:", error);
    throw error;
  }
}

// 修改importWords函数
function importWords() {
  const fileInput = document.getElementById('importFile');
  const file = fileInput.files[0];

  if (!file) {
    alert('请选择要导入的文件');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    const separator = document.querySelector('input[name="separator"]:checked').value;
    const languageSelect = document.getElementById('language');
    // 获取语言值，如果是自定义则使用自定义输入框的值
    let language = languageSelect.value;
    if (language === 'custom') {
      language = document.getElementById('customLanguageCode').value.trim().toLowerCase();
      // 验证自定义语言代码
      if (!/^[a-z]{2}$/.test(language)) {
        alert('请输入有效的ISO 639-1双字母语言代码');
        return;
      }
    }
    const status = parseInt(document.getElementById('wordStatus').value);

    console.log('[importWords] 导入参数:', { language, status, separator });

    // 根据选择的分隔符分割单词
    let words = [];
    if (separator === 'newline') {
      words = content.split(/\r?\n/).filter(word => word.trim() !== '');
    } else {
      words = content.split(',').map(word => word.trim()).filter(word => word !== '');
    }

    if (words.length === 0) {
      alert('没有找到有效的单词');
      return;
    }

    const statusEl = document.getElementById('importStatus');
    const progressContainer = document.querySelector('.progress-container');
    const progressBar = document.getElementById('importProgress');
    const progressText = document.getElementById('importProgressText');

    // 显示进度条
    progressContainer.style.display = 'block';
    progressBar.value = 0;
    progressText.textContent = '0%';

    statusEl.textContent = `准备导入 ${words.length} 个单词...`;

    // 获取并行批次数和每批大小
    const parallelBatches = parseInt(document.getElementById('batchCount').value);
    const batchSize = parseInt(document.getElementById('batchSize').value);

    // 使用改进的并行导入功能
    importWordsParallel(words, language, status, batchSize, parallelBatches, statusEl, progressBar, progressText);
  };

  reader.readAsText(file);
}

// 修改并行导入函数，仅更新 wordDetails
function importWordsParallel(words, language, status, batchSize, parallelBatches, statusEl, progressBar, progressText) {
  const totalWords = words.length;
  let processedWords = 0;

  // 将单词分成多个批次
  const batches = [];
  for (let i = 0; i < totalWords; i += batchSize) {
    batches.push(words.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;
  let completedBatches = 0;
  let activeBatches = 0;
  let batchIndex = 0;

  statusEl.textContent = `正在导入，请稍候...`;

  function updateProgress() {
    const progress = Math.round((processedWords / totalWords) * 100);
    progressBar.value = progress;
    progressText.textContent = `${progress}% (${processedWords}/${totalWords})`;

    // 添加并行处理信息
    const remainingBatches = totalBatches - completedBatches;
    const currentlyProcessing = Math.min(activeBatches, parallelBatches);
    statusEl.textContent = `正在导入... 已完成${completedBatches}批，当前并行处理${currentlyProcessing}批，剩余${remainingBatches}批 (每批${batchSize}词)`;
  }

  function processBatch() {
    if (batchIndex >= totalBatches) {
      return;
    }

    const currentBatchIndex = batchIndex++;
    const currentBatch = batches[currentBatchIndex];
    activeBatches++;

    const promises = currentBatch.map(word => {
      return new Promise((resolve) => {
        // 只需更新 wordDetails，不再需要添加到 knownWords
        updateWordStatus(word, status, language).then(() => {
          console.log(`[importWordsParallel] 已导入单词: ${word}, status: ${status} (${typeof status}), language: ${language}`);
          resolve();
        });
      });
    });

    Promise.all(promises).then(() => {
      processedWords += currentBatch.length;
      completedBatches++;
      activeBatches--;

      updateProgress();

      // 继续处理下一批
      if (completedBatches < totalBatches) {
        processBatch();
      }

      // 所有批次都已完成
      if (completedBatches === totalBatches) {
        statusEl.textContent = `导入完成，共导入 ${processedWords} 个单词`;

        // 刷新单词列表
        getAllWords().then(words => {
          wordsArray = words.sort();
          filteredWordsArray = [...wordsArray];
          updatePagination();
        });
      }
    });
  }

  // 启动初始的并行批次
  for (let i = 0; i < Math.min(parallelBatches, totalBatches); i++) {
    processBatch();
  }
}

// 修改清空单词列表函数
function clearWordList() {
  if (confirm('确定要清空所有单词吗？此操作不可撤销。')) {
    clearAllWords().then(() => {
      wordsArray = [];
      filteredWordsArray = [];
      wordDetailsMap = {};
      updatePagination();
      document.getElementById('importStatus').textContent = '已清空所有单词';
    }).catch(err => {
      console.error("清空单词列表失败:", err);
      alert('清空单词列表失败');
    });
  }
}

// 初始化本地TTS配置
function initLocalTTSSettings() {
  // 获取可用的语音列表
  const voiceSelect = document.getElementById('localTTSVoice');
  const voices = window.speechSynthesis.getVoices();

  function populateVoiceList() {
    voiceSelect.innerHTML = '';
    const voices = window.speechSynthesis.getVoices();

    // 添加"自动选择"选项
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = '自动选择';
    voiceSelect.appendChild(autoOption);

    // 添加所有可用的语音
    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });
  }

  // 如果语音列表已加载，直接填充
  if (voices.length > 0) {
    populateVoiceList();
  }

  // 监听语音列表变化
  speechSynthesis.onvoiceschanged = populateVoiceList;

  // 加载保存的设置
  chrome.storage.local.get(['ttsConfig'], function(result) {
    const ttsConfig = result.ttsConfig || {};

    // 设置语音
    if (ttsConfig.localTTSVoice) {
      voiceSelect.value = ttsConfig.localTTSVoice;
    }

    // 设置语速
    const rateInput = document.getElementById('localTTSRate');
    const rateValue = document.getElementById('localTTSRateValue');
    rateInput.value = ttsConfig.localTTSRate || 1.0;
    rateValue.textContent = rateInput.value;

    // 设置音调
    const pitchInput = document.getElementById('localTTSPitch');
    const pitchValue = document.getElementById('localTTSPitchValue');
    pitchInput.value = ttsConfig.localTTSPitch || 1.0;
    pitchValue.textContent = pitchInput.value;
  });
}

// 保存本地TTS设置
function saveLocalTTSSettings() {
  chrome.storage.local.get(['ttsConfig'], function(result) {
    const ttsConfig = result.ttsConfig || {};
    ttsConfig.localTTSVoice = document.getElementById('localTTSVoice').value;
    ttsConfig.localTTSRate = parseFloat(document.getElementById('localTTSRate').value);
    ttsConfig.localTTSPitch = parseFloat(document.getElementById('localTTSPitch').value);
    chrome.storage.local.set({ ttsConfig: ttsConfig });
  });
}

// 初始化Edge TTS设置
function initEdgeTTSSettings() {
  // 导入Edge TTS声音列表
  // import('../plugin/edge_list.js').then(module => {
    import('./edge_list.js').then(module => {
    const edgeVoiceList = module.edgeVoiceList;
    const voiceSelect = document.getElementById('edgeTTSVoice');

    // 清空现有选项
    voiceSelect.innerHTML = '';

    // 按语言和名称排序
    edgeVoiceList.sort((a, b) => {
      if (a.Locale === b.Locale) {
        return a.ShortName.localeCompare(b.ShortName);
      }
      return a.Locale.localeCompare(b.Locale);
    });

    // 添加所有可用的语音
    edgeVoiceList.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.ShortName;
      option.textContent = `${voice.FriendlyName} (${voice.Locale})`;
      voiceSelect.appendChild(option);
    });

    // 加载保存的设置
    chrome.storage.local.get(['ttsConfig'], function(result) {
      const ttsConfig = result.ttsConfig || {};

      // 设置自动选择声音开关
      const autoVoiceCheckbox = document.getElementById('edgeTTSAutoVoice');
      autoVoiceCheckbox.checked = ttsConfig.edgeTTSAutoVoice !== false; // 默认为true

      // 根据自动选择状态显示/隐藏声音选择器
      document.getElementById('edgeTTSVoiceContainer').style.display =
        autoVoiceCheckbox.checked ? 'none' : 'block';

      // 设置声音
      if (ttsConfig.edgeTTSVoice) {
        voiceSelect.value = ttsConfig.edgeTTSVoice;
      } else {
        // 默认设置为英语声音
        const defaultVoice = edgeVoiceList.find(v => v.ShortName === 'en-US-AriaNeural');
        if (defaultVoice) {
          voiceSelect.value = defaultVoice.ShortName;
        }
      }

      // 设置语速
      const rateInput = document.getElementById('edgeTTSRate');
      const rateValue = document.getElementById('edgeTTSRateValue');
      rateInput.value = ttsConfig.edgeTTSRate || 0;
      rateValue.textContent = `${rateInput.value}%`;

      // 设置音量
      const volumeInput = document.getElementById('edgeTTSVolume');
      const volumeValue = document.getElementById('edgeTTSVolumeValue');
      volumeInput.value = ttsConfig.edgeTTSVolume || 0;
      volumeValue.textContent = `${volumeInput.value}%`;

      // 设置音调
      const pitchInput = document.getElementById('edgeTTSPitch');
      const pitchValue = document.getElementById('edgeTTSPitchValue');
      pitchInput.value = ttsConfig.edgeTTSPitch || 0;
      pitchValue.textContent = `${pitchInput.value}%`;
    });

    // 监听自动选择声音开关变化
    document.getElementById('edgeTTSAutoVoice').addEventListener('change', function(e) {
      document.getElementById('edgeTTSVoiceContainer').style.display =
        e.target.checked ? 'none' : 'block';
      saveEdgeTTSSettings();
    });

    // 监听声音选择变化
    document.getElementById('edgeTTSVoice').addEventListener('change', saveEdgeTTSSettings);

    // 监听语速变化
    const rateInput = document.getElementById('edgeTTSRate');
    rateInput.addEventListener('input', function() {
      document.getElementById('edgeTTSRateValue').textContent = `${this.value}%`;
      saveEdgeTTSSettings();
    });

    // 监听音量变化
    const volumeInput = document.getElementById('edgeTTSVolume');
    volumeInput.addEventListener('input', function() {
      document.getElementById('edgeTTSVolumeValue').textContent = `${this.value}%`;
      saveEdgeTTSSettings();
    });

    // 监听音调变化
    const pitchInput = document.getElementById('edgeTTSPitch');
    pitchInput.addEventListener('input', function() {
      document.getElementById('edgeTTSPitchValue').textContent = `${this.value}%`;
      saveEdgeTTSSettings();
    });

    // 测试Edge TTS
    document.getElementById('testEdgeTTS').addEventListener('click', function() {
      const testText = " Woohoo, ding dong, bibbidi-bobbidi-boo,waybibabo,bibbidi-bobbidi-boo,Makka Pakka ,splish splash, kaboom, hahaha, this is absolutely hilarious!";

      // 获取当前设置
      chrome.storage.local.get(['ttsConfig'], function(result) {
        const ttsConfig = result.ttsConfig || {};
        const autoVoice = false;
        const voice = 'en-US-AriaNeural';
        const rate = ttsConfig.edgeTTSRate || 0;
        const volume = ttsConfig.edgeTTSVolume || 100;
        const pitch = ttsConfig.edgeTTSPitch || 0;

        console.log('测试EdgeTTS - 配置:', {
          autoVoice: autoVoice,
          voice: voice,
          rate: rate,
          volume: volume,
          pitch: pitch,
          text: testText
        });

        // 发送消息给background脚本处理Edge TTS请求
        chrome.runtime.sendMessage({
          action: "playAudio",
          audioType: "playEdgeTTS",
          text: testText,
          autoVoice: autoVoice,
          voice: voice,
          rate: rate,
          volume: volume,
          pitch: pitch
        });
      });
    });
  }).catch(error => {
    console.error('加载Edge TTS声音列表失败:', error);
  });
}

// 保存Edge TTS设置
function saveEdgeTTSSettings() {
  chrome.storage.local.get(['ttsConfig'], function(result) {
    const ttsConfig = result.ttsConfig || {};
    ttsConfig.edgeTTSAutoVoice = document.getElementById('edgeTTSAutoVoice').checked;
    ttsConfig.edgeTTSVoice = document.getElementById('edgeTTSVoice').value;
    ttsConfig.edgeTTSRate = parseInt(document.getElementById('edgeTTSRate').value);
    ttsConfig.edgeTTSVolume = parseInt(document.getElementById('edgeTTSVolume').value);
    ttsConfig.edgeTTSPitch = parseInt(document.getElementById('edgeTTSPitch').value);
    chrome.storage.local.set({ ttsConfig: ttsConfig });
  });
}

// 添加DOMContentLoaded事件中的语言选择器处理
document.addEventListener('DOMContentLoaded', function() {
  // 设置语言选择器的初始值并添加事件监听
  const uiLanguageSelect = document.getElementById('ui-language');
  if (uiLanguageSelect) {
    // 从chrome.storage.local获取语言设置
    chrome.storage.local.get('userLanguage', function(result) {
      // 使用用户保存的语言，如果没有则默认为'zh'
      let savedLanguage = result.userLanguage || 'zh';

      // 检查语言是否在i18n对象中存在，如果不存在则默认为'zh'
      if (!i18n[savedLanguage]) {
        savedLanguage = 'zh';
      }

      // 设置语言选择器的值
      uiLanguageSelect.value = savedLanguage;

      // 初始化页面语言
      updatePageLanguage(savedLanguage);
    });

    // 监听语言选择变化
    uiLanguageSelect.addEventListener('change', function() {
      // 保存到chrome.storage.local而不是localStorage
      const selectedLanguage = this.value; // 保存选择的语言值

      chrome.storage.local.set({ userLanguage: selectedLanguage }, function() {
        // 更新页面语言
        updatePageLanguage(selectedLanguage);

        // 向其他页面广播语言变化
        chrome.runtime.sendMessage({
          action: 'languageChanged',
          language: selectedLanguage
        });
      });
    });
  }

// 加载用户保存的 API 配置数据  //初始化
chrome.storage.local.get('aiConfig', function(result) {
  if (result.aiConfig) {
    console.log('aiconfig', result.aiConfig);
    // 设置Custom API Base URL
    document.getElementById('apiBaseURL').value = result.aiConfig.apiBaseURL || '';


    // 新增：设置 AI 渠道单选按钮状态
    const savedChannel = result.aiConfig.aiChannel || 'diy'; // 默认选中 'diy'
    const radioToCheck = document.querySelector(`input[name="aiChannel"][value="${savedChannel}"]`);
    if (radioToCheck) {
      radioToCheck.checked = true;
    }

    // 根据渠道设置UI显示状态
    updateApiChannelUI(savedChannel);

    // 新增：设置 OhMyGpt Base URL 单选按钮状态
    const savedOhmygptBaseUrl = result.aiConfig.ohmygptBaseUrl || 'https://api.ohmygpt.com/v1/chat/completions'; // 默认选中推荐 URL
    const ohmygptRadioToCheck = document.querySelector(`input[name="ohmygptBaseUrl"][value="${savedOhmygptBaseUrl}"]`);
    if (ohmygptRadioToCheck) {
      ohmygptRadioToCheck.checked = true;
    } else {
      // 如果保存的值无效或找不到对应的按钮，默认选中第一个（推荐）
      document.getElementById('ohmygptBaseUrl4').checked = true;
    }
    // //ohmygpt model
    document.getElementById('ohmygptModel').value = result.aiConfig.ohmygptModel || 'gemini-2.5-flash'; // 新增：加载 OhMyGpt 模型，若无则默认为 gpt-4o-mini
    document.getElementById('ohmygptTemperature').value = result.aiConfig.ohmygptTemperature !== undefined ? result.aiConfig.ohmygptTemperature : 1;

    //如果ohmygptModel为空，则设置为gemini-2.5-flash
    if (!result.aiConfig.ohmygptModel) {

      //同步设置aiconfig的ohmygptModel
      chrome.storage.local.get('aiConfig', function(result) {
        const aiConfig = result.aiConfig || {};
        aiConfig.ohmygptModel = 'gemini-2.5-flash';
        chrome.storage.local.set({ aiConfig: aiConfig }, function() {
          console.log("OhMyGpt Model 已保存到 aiConfig");
        });
      });

    }


    // 设置API Key为密码形式
    const apiKeyInput = document.getElementById('apiKey');
    apiKeyInput.value = result.aiConfig.apiKey || '';
    apiKeyInput.type = 'password';

    // 添加鼠标悬浮事件显示明文
    apiKeyInput.addEventListener('mouseenter', function() {
      this.type = 'text';
    });

    // 鼠标离开时恢复为密码形式
    apiKeyInput.addEventListener('mouseleave', function() {
      this.type = 'password';
    });

    document.getElementById('apiModel').value = result.aiConfig.apiModel || '';
    document.getElementById('apiTemperature').value = result.aiConfig.apiTemperature !== undefined ? result.aiConfig.apiTemperature : 1;

    // 新增：设置 minimaxi API 配置
    document.getElementById('minimaxiGroupId').value = result.aiConfig.minimaxiGroupId || '';
    document.getElementById('minimaxiBaseURL').value = result.aiConfig.minimaxiBaseURL || 'https://api.minimaxi.chat/v1/t2a_v2?GroupId=';

    // 设置 minimaxi API Key 为密码形式
    const minimaxiApiKeyInput = document.getElementById('minimaxiApiKey');
    minimaxiApiKeyInput.value = result.aiConfig.minimaxiApiKey || '';
    minimaxiApiKeyInput.type = 'password';


    document.getElementById('minimaxiVoiceId').value = result.aiConfig.minimaxiVoiceId || 'English_Graceful_Lady';
    document.getElementById('minimaxiModel').value = result.aiConfig.minimaxiModel || 'speech-01-turbo';
    document.getElementById('minimaxiSpeed').value = result.aiConfig.minimaxiSpeed || 1.1;




    // 添加鼠标悬浮事件显示明文
    minimaxiApiKeyInput.addEventListener('mouseenter', function() {
      this.type = 'text';
    });

    // 鼠标离开时恢复为密码形式
    minimaxiApiKeyInput.addEventListener('mouseleave', function() {
      this.type = 'password';
    });

    document.getElementById('aiPrompt').value = result.aiConfig.aiPrompt || DEFAULT_PROMPTS.aiPrompt;
    document.getElementById('aiPrompt2').value = result.aiConfig.aiPrompt2 || DEFAULT_PROMPTS.aiPrompt2;
    document.getElementById('aiLanguageDetectionPrompt').value = result.aiConfig.aiLanguageDetectionPrompt || DEFAULT_PROMPTS.aiLanguageDetectionPrompt;
    document.getElementById('aiSentenceTranslationPrompt').value = result.aiConfig.aiSentenceTranslationPrompt || DEFAULT_PROMPTS.aiSentenceTranslationPrompt;
    document.getElementById('aiAnalysisPrompt').value = result.aiConfig.aiAnalysisPrompt || DEFAULT_PROMPTS.aiAnalysisPrompt;
    document.getElementById('sidebarAIPrompt').value = result.aiConfig.sidebarAIPrompt || DEFAULT_PROMPTS.sidebarAIPrompt;
    document.getElementById('aiTagAnalysisPrompt').value = result.aiConfig.aiTagAnalysisPrompt || DEFAULT_PROMPTS.aiTagAnalysisPrompt;
    document.getElementById('aiYoutubeCaptionPrompt').value = result.aiConfig.aiYoutubeCaptionPrompt || DEFAULT_PROMPTS.aiYoutubeCaptionPrompt;


  } else {

    document.getElementById('ohmygptModel').value = 'gemini-2.5-flash'; // 新增：设置 OhMyGpt 模型的默认值


    // 新增：如果没有保存过配置，默认选中 'diy'
    document.getElementById('aiChannelDiy').checked = true;

    // 根据渠道设置UI显示状态
    updateApiChannelUI('diy');


    // 如果没有保存过配置，也设置API Key为密码形式
    const apiKeyInput = document.getElementById('apiKey');
    apiKeyInput.type = 'password';

    // 添加鼠标悬浮事件显示明文
    apiKeyInput.addEventListener('mouseenter', function() {
      this.type = 'text';
    });

    // 鼠标离开时恢复为密码形式
    apiKeyInput.addEventListener('mouseleave', function() {
      this.type = 'password';
    });










    // 如果没有保存过配置，也设置默认值
    document.getElementById('aiPrompt').value = DEFAULT_PROMPTS.aiPrompt;
    document.getElementById('aiPrompt2').value = DEFAULT_PROMPTS.aiPrompt2;
    document.getElementById('aiLanguageDetectionPrompt').value = DEFAULT_PROMPTS.aiLanguageDetectionPrompt;
    document.getElementById('aiSentenceTranslationPrompt').value = DEFAULT_PROMPTS.aiSentenceTranslationPrompt;
    document.getElementById('aiAnalysisPrompt').value = DEFAULT_PROMPTS.aiAnalysisPrompt;
    document.getElementById('sidebarAIPrompt').value = DEFAULT_PROMPTS.sidebarAIPrompt;
    document.getElementById('aiTagAnalysisPrompt').value = DEFAULT_PROMPTS.aiTagAnalysisPrompt;
    document.getElementById('aiYoutubeCaptionPrompt').value = DEFAULT_PROMPTS.aiYoutubeCaptionPrompt;

    // 新增：如果没有保存过配置，也设置默认值
    document.getElementById('minimaxiGroupId').value = '';

    const minimaxiApiKeyInput = document.getElementById('minimaxiApiKey');
    minimaxiApiKeyInput.value = '';
    minimaxiApiKeyInput.type = 'password';




    // 添加鼠标悬浮事件显示明文
    minimaxiApiKeyInput.addEventListener('mouseenter', function() {
      this.type = 'text';
    });

    // 鼠标离开时恢复为密码形式
    minimaxiApiKeyInput.addEventListener('mouseleave', function() {
      this.type = 'password';
    });



    document.getElementById('minimaxiVoiceId').value = 'English_Whispering_girl';
    document.getElementById('minimaxiModel').value = 'speech-01-turbo';
    document.getElementById('minimaxiSpeed').value = 1.1;


  }

  // 初始化所有textarea的高度
  setTimeout(() => {
    const textareas = document.querySelectorAll('textarea[data-auto-save="true"]');
    textareas.forEach(textarea => {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    });
  }, 100);
});

let customApiProfiles = {
  profiles: [],
  activeProfileId: null,
  currentEditingId: null
};

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function loadCustomApiProfiles(callback) {
  chrome.storage.local.get('customApiProfiles', function(result) {
    if (result.customApiProfiles) {
      customApiProfiles = result.customApiProfiles;
    } else {
      customApiProfiles = {
        profiles: [],
        activeProfileId: null,
        currentEditingId: null
      };
    }
    if (callback) callback();
  });
}

function saveCustomApiProfiles(callback) {
  chrome.storage.local.set({ customApiProfiles: customApiProfiles }, function() {
    console.log('Custom API profiles saved:', customApiProfiles);
    if (callback) callback();
  });
}

function renderCustomApiTabs() {
  const tabsContainer = document.getElementById('customApiTabs');
  if (!tabsContainer) return;
  
  tabsContainer.innerHTML = '';
  
  customApiProfiles.profiles.forEach(profile => {
    const tab = document.createElement('div');
    tab.className = 'custom-api-tab';
    tab.dataset.profileId = profile.id;
    
    const isActive = profile.id === customApiProfiles.activeProfileId;
    const isEditing = profile.id === customApiProfiles.currentEditingId;
    const enablePolling = profile.enablePolling !== false;
    
    tab.style.cssText = `
      display: flex; align-items: center; gap: 5px; padding: 6px 12px;
      border-radius: 4px 4px 0 0; cursor: pointer; font-size: 13px;
      border: 1px solid var(--border-color, #ddd); border-bottom: none;
      background: ${isEditing ? 'var(--bg-primary, #fff)' : 'var(--bg-secondary, #f5f5f5)'};
      color: var(--text-primary, #333);
      ${isActive ? 'border-bottom: 2px solid var(--primary-color, #4CAF50);' : ''}
    `;
    
    tab.innerHTML = `
      <span class="tab-name">${profile.name || 'Unnamed'}</span>
      ${isActive ? '<span style="color: var(--primary-color, #4CAF50); font-size: 10px;">●</span>' : ''}
      ${enablePolling ? '<span style="color: var(--success-color, #34c759); font-size: 10px;">✓</span>' : ''}
      <button class="delete-tab-btn" data-profile-id="${profile.id}" style="
        background: none; border: none; cursor: pointer; padding: 0 2px;
        color: var(--text-secondary, #666); font-size: 14px; margin-left: 5px;
      " title="Delete">×</button>
    `;
    
    tab.querySelector('.tab-name').addEventListener('click', function(e) {
      e.stopPropagation();
      switchToProfile(profile.id);
    });
    
    tab.querySelector('.delete-tab-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      deleteProfile(profile.id);
    });
    
    tabsContainer.appendChild(tab);
  });
}

function renderActiveProfileSelect() {
  const select = document.getElementById('activeProfileSelect');
  if (!select) return;
  
  select.innerHTML = '';
  
  if (customApiProfiles.profiles.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '-- No config --';
    select.appendChild(option);
    return;
  }
  
  customApiProfiles.profiles.forEach(profile => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name || 'Unnamed';
    if (profile.id === customApiProfiles.activeProfileId) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function loadProfileToForm(profileId) {
  const profile = customApiProfiles.profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  customApiProfiles.currentEditingId = profileId;
  
  document.getElementById('profileName').value = profile.name || '';
  document.getElementById('apiBaseURL').value = profile.apiBaseURL || '';
  document.getElementById('apiKey').value = profile.apiKey || '';
  document.getElementById('apiModel').value = profile.apiModel || '';
  document.getElementById('apiTemperature').value = profile.apiTemperature !== undefined ? profile.apiTemperature : 1;
  document.getElementById('profileEnablePolling').checked = profile.enablePolling !== false;
  
  renderCustomApiTabs();
}

function switchToProfile(profileId) {
  saveCurrentProfile();
  loadProfileToForm(profileId);
}

function saveCurrentProfile() {
  if (!customApiProfiles.currentEditingId) return;
  
  const profile = customApiProfiles.profiles.find(p => p.id === customApiProfiles.currentEditingId);
  if (!profile) return;
  
  profile.name = document.getElementById('profileName').value || 'Unnamed';
  profile.apiBaseURL = document.getElementById('apiBaseURL').value;
  profile.apiKey = document.getElementById('apiKey').value;
  profile.apiModel = document.getElementById('apiModel').value;
  profile.apiTemperature = parseFloat(document.getElementById('apiTemperature').value) || 1;
  profile.enablePolling = document.getElementById('profileEnablePolling').checked;
  
  saveCustomApiProfiles();
  renderCustomApiTabs();
  renderActiveProfileSelect();
  
  if (customApiProfiles.activeProfileId === customApiProfiles.currentEditingId) {
    syncActiveProfileToAiConfig();
  }
}

function addNewProfile() {
  saveCurrentProfile();
  
  const newProfile = {
    id: generateUUID(),
    name: `Config ${customApiProfiles.profiles.length + 1}`,
    apiBaseURL: '',
    apiKey: '',
    apiModel: '',
    apiTemperature: 1,
    enablePolling: true
  };
  
  customApiProfiles.profiles.push(newProfile);
  customApiProfiles.currentEditingId = newProfile.id;
  
  saveCustomApiProfiles();
  renderCustomApiTabs();
  renderActiveProfileSelect();
  loadProfileToForm(newProfile.id);
}

function deleteProfile(profileId) {
  if (customApiProfiles.profiles.length <= 1) {
    alert('Cannot delete the last config');
    return;
  }
  
  const index = customApiProfiles.profiles.findIndex(p => p.id === profileId);
  if (index === -1) return;
  
  customApiProfiles.profiles.splice(index, 1);
  
  if (customApiProfiles.activeProfileId === profileId) {
    customApiProfiles.activeProfileId = customApiProfiles.profiles[0]?.id || null;
    syncActiveProfileToAiConfig();
  }
  
  if (customApiProfiles.currentEditingId === profileId) {
    customApiProfiles.currentEditingId = customApiProfiles.profiles[0]?.id || null;
    if (customApiProfiles.currentEditingId) {
      loadProfileToForm(customApiProfiles.currentEditingId);
    }
  }
  
  saveCustomApiProfiles();
  renderCustomApiTabs();
  renderActiveProfileSelect();
}

function activateProfile(profileId) {
  if (!profileId) return;
  
  const profile = customApiProfiles.profiles.find(p => p.id === profileId);
  if (!profile) return;
  
  customApiProfiles.activeProfileId = profileId;
  saveCustomApiProfiles();
  renderCustomApiTabs();
  renderActiveProfileSelect();
  syncActiveProfileToAiConfig();
}

function syncActiveProfileToAiConfig() {
  if (!customApiProfiles.activeProfileId) return;
  
  const profile = customApiProfiles.profiles.find(p => p.id === customApiProfiles.activeProfileId);
  if (!profile) return;
  
  chrome.storage.local.get('aiConfig', function(result) {
    const aiConfig = result.aiConfig || {};
    aiConfig.apiBaseURL = profile.apiBaseURL || '';
    aiConfig.apiKey = profile.apiKey || '';
    aiConfig.apiModel = profile.apiModel || '';
    aiConfig.apiTemperature = profile.apiTemperature !== undefined ? profile.apiTemperature : 1;
    
    chrome.storage.local.set({ aiConfig: aiConfig }, function() {
      console.log('Active profile synced to aiConfig:', profile.name);
    });
  });
}

function initCustomApiProfilesManager() {
  loadCustomApiProfiles(function() {
    if (customApiProfiles.profiles.length === 0) {
      chrome.storage.local.get('aiConfig', function(result) {
        const aiConfig = result.aiConfig || {};
        const defaultProfile = {
          id: generateUUID(),
          name: 'Default',
          apiBaseURL: aiConfig.apiBaseURL || '',
          apiKey: aiConfig.apiKey || '',
          apiModel: aiConfig.apiModel || '',
          apiTemperature: aiConfig.apiTemperature !== undefined ? aiConfig.apiTemperature : 1,
          enablePolling: true
        };
        
        customApiProfiles.profiles.push(defaultProfile);
        customApiProfiles.activeProfileId = defaultProfile.id;
        customApiProfiles.currentEditingId = defaultProfile.id;
        
        saveCustomApiProfiles();
        renderCustomApiTabs();
        renderActiveProfileSelect();
        loadProfileToForm(defaultProfile.id);
      });
    } else {
      if (!customApiProfiles.currentEditingId && customApiProfiles.profiles.length > 0) {
        customApiProfiles.currentEditingId = customApiProfiles.profiles[0].id;
      }
      renderCustomApiTabs();
      renderActiveProfileSelect();
      if (customApiProfiles.currentEditingId) {
        loadProfileToForm(customApiProfiles.currentEditingId);
      }
    }
  });
  
  const addBtn = document.getElementById('addCustomProfileBtn');
  if (addBtn) {
    addBtn.addEventListener('click', addNewProfile);
    console.log('addCustomProfileBtn event listener attached');
  } else {
    console.warn('addCustomProfileBtn not found');
  }
  
  const selectEl = document.getElementById('activeProfileSelect');
  if (selectEl) {
    selectEl.addEventListener('change', function() {
      activateProfile(this.value);
    });
  }
  
  const inputs = ['profileName', 'apiBaseURL', 'apiKey', 'apiModel', 'apiTemperature'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', debounce(function() {
        saveCurrentProfile();
      }, 500));
    }
  });
  
  const profilePollingCheckbox = document.getElementById('profileEnablePolling');
  if (profilePollingCheckbox) {
    profilePollingCheckbox.addEventListener('change', function() {
      saveCurrentProfile();
    });
  }
  
  const pollingCheckbox = document.getElementById('enableApiPolling');
  if (pollingCheckbox) {
    chrome.storage.local.get('aiConfig', function(result) {
      pollingCheckbox.checked = result.aiConfig?.enableApiPolling === true;
    });
    pollingCheckbox.addEventListener('change', function() {
      chrome.storage.local.get('aiConfig', function(result) {
        const aiConfig = result.aiConfig || {};
        aiConfig.enableApiPolling = pollingCheckbox.checked;
        chrome.storage.local.set({ aiConfig: aiConfig }, function() {
          console.log('API Polling setting saved:', pollingCheckbox.checked);
        });
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initCustomApiProfilesManager, 100);
  });
} else {
  setTimeout(initCustomApiProfilesManager, 100);
}

// 根据AI渠道更新UI显示状态
function updateApiChannelUI(channel) {
  const customApiSettings = document.getElementById('customApiSettings');
  const ohmygptSettings = document.getElementById('ohmygptSettings');
  
  if (channel === 'ohmygpt') {
    if (customApiSettings) customApiSettings.style.display = 'none';
    if (ohmygptSettings) ohmygptSettings.style.display = 'flex';
  } else {
    if (customApiSettings) customApiSettings.style.display = 'block';
    if (ohmygptSettings) ohmygptSettings.style.display = 'none';
  }
}

// 监听AI渠道切换
document.querySelectorAll('input[name="aiChannel"]').forEach(radio => {
  radio.addEventListener('change', function() {
    if (this.checked) {
      updateApiChannelUI(this.value);
    }
  });
});

chrome.storage.local.get('subscriptionConfig', function(result) {






  const config = result.subscriptionConfig || {};

  // 加载爱发电 User ID
  const afdianUserIdInput = document.getElementById('afdianUserId');
  if (afdianUserIdInput) {
    afdianUserIdInput.value = config.afdianUserId || '';
    afdianUserIdInput.type = 'password';
    // 确保为 afdianUserIdInput 添加密码显隐功能 (如果尚未添加)
    if (!afdianUserIdInput.dataset.passwordToggleAdded) {
        afdianUserIdInput.addEventListener('mouseenter', function() { this.type = 'text'; });
        afdianUserIdInput.addEventListener('mouseleave', function() { this.type = 'password'; });
        afdianUserIdInput.dataset.passwordToggleAdded = 'true';
    }
  }

  // 加载 OhMyGpt User ID
  const ohmygptUserIdInput = document.getElementById('ohmygptUserId');
  if (ohmygptUserIdInput) {
    ohmygptUserIdInput.value = config.ohmygptUserId || '';
    // 如果 User ID 存在，尝试获取并显示到期时间
    // if (config.ohmygptUserId) {
    //   fetchAndDisplayOhMyGptExpiryDate(config.ohmygptUserId);
    // }
  }

  // 加载 OhMyGpt Token
  const ohmygptTokenInput = document.getElementById('ohmygptToken');
  if (ohmygptTokenInput) {

    //同步设置aiconfig的ohmygptToken
    chrome.storage.local.get('aiConfig', function(result) {
      const aiConfig = result.aiConfig || {};
      aiConfig.ohmygptToken = config.ohmygptToken || '';
      chrome.storage.local.set({ aiConfig: aiConfig }, function() {
        console.log("OhMyGpt Token 已保存到 aiConfig");
      });
    });


    ohmygptTokenInput.value = config.ohmygptToken || '';
    ohmygptTokenInput.type = 'password'; // 默认密码
    // 为 ohmygptTokenInput 添加密码显隐功能
     if (!ohmygptTokenInput.dataset.passwordToggleAdded) {
        ohmygptTokenInput.addEventListener('mouseenter', function() { this.type = 'text'; });
        ohmygptTokenInput.addEventListener('mouseleave', function() { this.type = 'password'; });
        ohmygptTokenInput.dataset.passwordToggleAdded = 'true';
     }
  }
}); // 注意：这里结束了 subscriptionConfig 的加载







  // --- 新增 OhMyGpt 获取 Token 逻辑 ---
  const getOhmygptTokenBtn = document.getElementById('getOhmygptTokenBtn');
  const ohmygptCodeInput = document.getElementById('ohmygptCode');
  const ohmygptUserIdInput = document.getElementById('ohmygptUserId');
  const ohmygptTokenInput = document.getElementById('ohmygptToken');
  const ohmygptStatusSpan = document.getElementById('ohmygptStatus');
  const ohmygptExpiryDateDisplay = document.getElementById('ohmygptExpiryDateDisplay');
  const ohmygptExpiryStatusSpan = document.getElementById('ohmygptExpiryStatus');
  const ohmygptAddDaysBtn = document.getElementById('ohmygptAddDaysBtn');
  const ohmygptAddDaysStatusSpan = document.getElementById('ohmygptAddDaysStatus');
  const ohmygptDonateAmountSlider = document.getElementById('ohmygptDonateAmountSlider');
  const ohmygptDonateAmountDisplay = document.getElementById('ohmygptDonateAmountDisplay');
  const ohmygptDonateBtn = document.getElementById('ohmygptDonateBtn');
  const ohmygptDonateStatusSpan = document.getElementById('ohmygptDonateStatus');

  if (getOhmygptTokenBtn && ohmygptCodeInput && ohmygptUserIdInput && ohmygptTokenInput && ohmygptStatusSpan) {
    getOhmygptTokenBtn.addEventListener('click', async () => {
      const code = ohmygptCodeInput.value.trim();
      // 尝试获取国际化文本，如果失败则使用默认文本
      const enterCodeMsg = chrome.i18n.getMessage('ohmygptEnterCode') || '请输入 Code';
      const loadingMsg = chrome.i18n.getMessage('ohmygptStatusLoading') || '正在获取...';
      const saveSuccessMsg = chrome.i18n.getMessage('ohmygptStatusSaveSuccess') || '获取并保存成功!';
      const saveErrorMsg = chrome.i18n.getMessage('ohmygptStatusSaveError') || '保存失败';
      const fetchErrorMsgKey = 'ohmygptStatusFetchError'; // 用于带参数的 i18n
      const fetchExceptionMsg = chrome.i18n.getMessage('ohmygptStatusFetchException') || '获取异常';


      if (!code) {
        ohmygptStatusSpan.textContent = enterCodeMsg;
        ohmygptStatusSpan.style.color = 'red';
        return;
      }

      ohmygptStatusSpan.textContent = loadingMsg;
      ohmygptStatusSpan.style.color = 'orange';
      getOhmygptTokenBtn.disabled = true; // 禁用按钮防止重复点击

      try {
        // 调用 background script 中的函数
        const response = await callOhMyGptGetToken(code);
        console.log("OhMyGpt Token Response:", response); // 调试日志

        if (response && response.success && response.data && response.data.user_id && response.data.token) {
          const userId = response.data.user_id;
          const token = response.data.token;

          // 更新输入框的值
          ohmygptUserIdInput.value = userId;
          ohmygptTokenInput.value = token;

          // 手动保存到 storage，因为输入框是 readonly，不会触发自动保存
          chrome.storage.local.get('subscriptionConfig', function(result) {
            const config = result.subscriptionConfig || {};
            config.ohmygptUserId = userId;
            config.ohmygptToken = token;

            //同步设置aiconfig的ohmygptToken
            chrome.storage.local.get('aiConfig', function(result) {
              const aiConfig = result.aiConfig || {};
              aiConfig.ohmygptToken = config.ohmygptToken || '';
              chrome.storage.local.set({ aiConfig: aiConfig }, function() {
                console.log("OhMyGpt Token 已保存到 aiConfig");
              });
            });




            // Code 是一次性的，不需要保存
            chrome.storage.local.set({ subscriptionConfig: config }, function() {
              if (chrome.runtime.lastError) {
                console.error("保存 OhMyGpt 配置失败:", chrome.runtime.lastError);
                ohmygptStatusSpan.textContent = saveErrorMsg;
                ohmygptStatusSpan.style.color = 'red';
              } else {
                console.log("OhMyGpt 配置已保存");
                ohmygptStatusSpan.textContent = saveSuccessMsg;
                ohmygptStatusSpan.style.color = 'green';
                // 清空 code 输入框
                ohmygptCodeInput.value = '';
                 // 短暂显示输入框旁边的"Automatic save complete."提示（虽然是手动保存的）
                 const userIdStatus = ohmygptUserIdInput.nextElementSibling;
                 const tokenStatus = ohmygptTokenInput.nextElementSibling;
                 if (userIdStatus && userIdStatus.classList.contains('save-status')) {
                     userIdStatus.style.display = 'inline-block';
                     setTimeout(() => { userIdStatus.style.display = 'none'; }, 2000);
                 }
                  if (tokenStatus && tokenStatus.classList.contains('save-status')) {
                     tokenStatus.style.display = 'inline-block';
                     setTimeout(() => { tokenStatus.style.display = 'none'; }, 2000);
                 }
                 // --- 新增：获取 Token 成功后，立即刷新到期时间 ---
                 // 使用刚刚获取并保存的 userId
                 fetchAndDisplayOhMyGptExpiryDate(userId);
                 // --- 新增结束 ---
              }
            });
          });

        } else {
          // 处理获取失败的情况
          const errorDetail = response && response.error ? response.error : 'Unknown error';
          console.error("获取 OhMyGpt Token 失败:", errorDetail);
          // 尝试获取带参数的国际化文本
          let formattedErrorMsg = chrome.i18n.getMessage(fetchErrorMsgKey, errorDetail);
          // 如果 getMessage 返回空字符串（表示 key 不存在或参数处理失败），则使用默认格式
          if (!formattedErrorMsg) {
              formattedErrorMsg = `获取失败: ${errorDetail}`;
          }
          ohmygptStatusSpan.textContent = formattedErrorMsg;
          ohmygptStatusSpan.style.color = 'red';
        }
      } catch (error) {
        // 处理调用过程中的异常
        console.error("调用 callOhMyGptGetToken 时发生异常:", error);
        ohmygptStatusSpan.textContent = fetchExceptionMsg;
        ohmygptStatusSpan.style.color = 'red';
      } finally {
        getOhmygptTokenBtn.disabled = false; // 无论成功或失败，最后都恢复按钮
      }
    });
  }






//手机 侧栏 缩进 自动化优化。
  // Add event listener for the hamburger menu button
  const menuToggle = document.getElementById('menu-toggle');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
  }

  // Add event listener for the overlay to close the sidebar
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      document.body.classList.remove('sidebar-open');
    });
  }

  // Close sidebar when a sidebar item is clicked (Improved version)
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.addEventListener('click', (event) => {
      const targetButton = event.target.closest('button');
      // Check if a button inside the sidebar (main or submenu) was clicked
      if (targetButton && sidebar.contains(targetButton)) {
         // Check if it's a navigation button (has 'tab-' or 'menu-' in ID) or the popup button
         const isNavButton = targetButton.id.startsWith('tab-') || targetButton.id === 'open-popup';

         // 修改：只有当点击的是子菜单项或非菜单项按钮时才关闭侧栏
         // 如果是带有menu-前缀的父菜单项，不关闭侧栏
         const isParentMenuItem = targetButton.id.startsWith('menu-');

         // Only close if on mobile view and it's a navigation button (not a parent menu item)
         if (isNavButton && !isParentMenuItem && window.innerWidth <= 768) {
             // Close for direct panel buttons, submenu items, and open-popup
             document.body.classList.remove('sidebar-open');
         }
      }
    });
  }










  // 获取日期筛选相关的DOM元素
  const startDateFilterInput = document.getElementById('startDateFilter');
  const endDateFilterInput = document.getElementById('endDateFilter');
  const filterTodayBtn = document.getElementById('filterToday');
  const filterYesterdayBtn = document.getElementById('filterYesterday');
  const filterThisWeekBtn = document.getElementById('filterThisWeek');
  const filterThisMonthBtn = document.getElementById('filterThisMonth');
  const filterNoDateBtn = document.getElementById('filterNoDate');

  // 日期快捷按钮事件监听
  if (filterTodayBtn) {
    filterTodayBtn.addEventListener('click', () => {
      const today = new Date();
      startDateFilterInput.value = formatDate(today);
      endDateFilterInput.value = formatDate(today);
      currentNoDateFilter = false;
      // 注释掉自动应用筛选，改为等待用户点击"应用筛选"按钮
      // applyFilters();
    });
  }

  if (filterYesterdayBtn) {
    filterYesterdayBtn.addEventListener('click', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startDateFilterInput.value = formatDate(yesterday);
      endDateFilterInput.value = formatDate(yesterday);
      currentNoDateFilter = false;
      // 注释掉自动应用筛选，改为等待用户点击"应用筛选"按钮
      // applyFilters();
    });
  }

  if (filterThisWeekBtn) {
    filterThisWeekBtn.addEventListener('click', () => {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 周一为一周的开始
      const monday = new Date(today);
      monday.setDate(today.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      startDateFilterInput.value = formatDate(monday);
      endDateFilterInput.value = formatDate(sunday);
      currentNoDateFilter = false;
      // 注释掉自动应用筛选，改为等待用户点击"应用筛选"按钮
      // applyFilters();
    });
  }

  if (filterThisMonthBtn) {
    filterThisMonthBtn.addEventListener('click', () => {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      startDateFilterInput.value = formatDate(firstDayOfMonth);
      endDateFilterInput.value = formatDate(lastDayOfMonth);
      currentNoDateFilter = false;
      // 注释掉自动应用筛选，改为等待用户点击"应用筛选"按钮
      // applyFilters();
    });
  }

  if (filterNoDateBtn) {
    filterNoDateBtn.addEventListener('click', () => {
      startDateFilterInput.value = '';
      endDateFilterInput.value = '';
      currentNoDateFilter = true;
      // 注释掉自动应用筛选，改为等待用户点击"应用筛选"按钮
      // applyFilters();
      // currentNoDateFilter 会在 applyFilters 中被使用，之后若用户选择其他日期或快捷按钮，会被重置为 false
    });
  }

  // 往前N天按钮事件
  const applyPastDaysBtn = document.getElementById('applyPastDaysBtn');
  const pastDaysInput = document.getElementById('pastDaysInput');
  if (applyPastDaysBtn && pastDaysInput) {
    applyPastDaysBtn.addEventListener('click', () => {
      const days = parseInt(pastDaysInput.value);
      if (days && days > 0) {
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - days);
        startDateFilterInput.value = formatDate(pastDate);
        endDateFilterInput.value = formatDate(today);
        currentNoDateFilter = false;
        // 不自动应用筛选，让用户点击"应用筛选"按钮
      }
    });
  }

  // 状态筛选"全部"复选框逻辑
  const statusFilterAll = document.getElementById('statusFilter_all');
  const statusFilterCheckboxes = document.querySelectorAll('[id^="statusFilter_"]:not(#statusFilter_all)');

  // 初始化：默认选中"全部"
  if (statusFilterAll) {
    statusFilterAll.checked = true;

    statusFilterAll.addEventListener('change', function() {
      if (this.checked) {
        // 选中"全部"时，取消其他所有选项
        statusFilterCheckboxes.forEach(cb => cb.checked = false);
      }
    });
  }

  // 其他状态复选框逻辑
  statusFilterCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      if (this.checked && statusFilterAll) {
        // 选中任何具体状态时，取消"全部"
        statusFilterAll.checked = false;
      }

      // 如果所有具体状态都未选中，自动选中"全部"
      const anyChecked = Array.from(statusFilterCheckboxes).some(cb => cb.checked);
      if (!anyChecked && statusFilterAll) {
        statusFilterAll.checked = true;
      }
    });
  });

  // 辅助函数：格式化日期为 YYYY-MM-DD
  function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // 现有的事件绑定保持不变
  document.getElementById('importBtn').addEventListener('click', importWords);
  document.getElementById('clearBtn').addEventListener('click', clearWordList);

  // 分页按钮事件
  document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      displayPage(currentPage);
    }
  });

  document.getElementById('nextBtn').addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      displayPage(currentPage);
    }
  });

  // 筛选器应用按钮事件
  document.getElementById('applyFilterBtn').addEventListener('click', applyFilters);

  // 使用事件委托处理动态创建的删除和取消全选按钮
  document.getElementById('wordList').addEventListener('click', function(e) {
    // 删除选中按钮
    if (e.target && e.target.id === 'deleteSelectedBtn') {
      if (selectedWords.size === 0) {
        alert('请先选择要删除的单词');
        return;
      }

      const confirmMsg = `确定要删除选中的 ${selectedWords.size} 个单词吗？此操作不可恢复！`;
      if (confirm(confirmMsg)) {
        deleteSelectedWords();
      }
    }

    // 取消全选按钮
    if (e.target && e.target.id === 'clearSelectionBtn') {
      selectedWords.clear();
      displayPage(currentPage);
      updateBulkActionButtons();
    }
  });

  // 仅筛选单词状态按钮事件
  document.getElementById('filterByStatusOnlyBtn').addEventListener('click', () => {
    // 清空日期筛选
    document.getElementById('startDateFilter').value = '';
    document.getElementById('endDateFilter').value = '';
    currentNoDateFilter = false;

    // 只应用语言和状态筛选
    currentLanguageFilter = document.getElementById('languageFilter').value;

    // 获取选中的状态（多选）
    const selectedStatuses = [];
    const statusCheckboxes = document.querySelectorAll('[id^="statusFilter_"]:checked');
    statusCheckboxes.forEach(checkbox => {
      if (checkbox.value !== 'all') {
        selectedStatuses.push(checkbox.value);
      }
    });

    pageSize = parseInt(document.getElementById('pageSizeSelector').value);

    getAllWordDetails().then(allDetailsMap => {
      let tempFilteredDetails = Object.values(allDetailsMap);

      if (currentLanguageFilter !== 'all') {
        tempFilteredDetails = tempFilteredDetails.filter(item => item.language === currentLanguageFilter);
      }

      // 状态筛选：如果有选中的状态，则筛选
      if (selectedStatuses.length > 0) {
        tempFilteredDetails = tempFilteredDetails.filter(item => selectedStatuses.includes(String(item.status)));
      }

      // 不应用任何日期筛选
      filteredWordsArray = tempFilteredDetails.map(item => item.word);
      totalPages = Math.ceil(filteredWordsArray.length / pageSize);
      currentPage = 1;
      displayPage(currentPage);
    });
  });

  // 为每个恢复默认按钮添加点击事件
  document.getElementById('restore-aiPrompt').addEventListener('click', () => restoreDefaultPrompt('aiPrompt'));
  document.getElementById('restore-aiPrompt2').addEventListener('click', () => restoreDefaultPrompt('aiPrompt2'));
  document.getElementById('restore-aiLanguageDetectionPrompt').addEventListener('click', () => restoreDefaultPrompt('aiLanguageDetectionPrompt'));
  document.getElementById('restore-aiSentenceTranslationPrompt').addEventListener('click', () => restoreDefaultPrompt('aiSentenceTranslationPrompt'));
  document.getElementById('restore-aiAnalysisPrompt').addEventListener('click', () => restoreDefaultPrompt('aiAnalysisPrompt'));
  document.getElementById('restore-sidebarAIPrompt').addEventListener('click', () => restoreDefaultPrompt('sidebarAIPrompt'));
  document.getElementById('restore-aiTagAnalysisPrompt').addEventListener('click', () => restoreDefaultPrompt('aiTagAnalysisPrompt'));
  document.getElementById('restore-aiYoutubeCaptionPrompt').addEventListener('click', () => restoreDefaultPrompt('aiYoutubeCaptionPrompt'));



  // 设置通用自动保存
  setupAutoSave();

  // 语言选择器变化事件
  const languageSelect = document.getElementById('language');
  const customLanguageInput = document.getElementById('customLanguageInput');
  const customLanguageCode = document.getElementById('customLanguageCode');

  languageSelect.addEventListener('change', function() {
    if (this.value === 'custom') {
      customLanguageInput.style.display = 'block';
    } else {
      customLanguageInput.style.display = 'none';
    }
  });

  // 初始化本地TTS设置
  initLocalTTSSettings();

  // 初始化Edge TTS设置
  initEdgeTTSSettings();

  // 监听语音选择变化
  document.getElementById('localTTSVoice').addEventListener('change', saveLocalTTSSettings);

  // 监听语速变化
  const rateInput = document.getElementById('localTTSRate');
  rateInput.addEventListener('input', function() {
    document.getElementById('localTTSRateValue').textContent = this.value;
    saveLocalTTSSettings();
  });

  // 监听音调变化
  const pitchInput = document.getElementById('localTTSPitch');
  pitchInput.addEventListener('input', function() {
    document.getElementById('localTTSPitchValue').textContent = this.value;
    saveLocalTTSSettings();
  });

  // 测试本地TTS
  document.getElementById('testLocalTTS').addEventListener('click', function() {
    const testText = "Hahaha, this is a local TTS test. I'm a robot, but I have feelings too! Teehee, ribbit ribbit, gurgle gurgle, ding dong, oh my goodness, this is absolutely hilarious!";
    const utterance = new SpeechSynthesisUtterance(testText);

    // 应用当前设置
    const voiceName = document.getElementById('localTTSVoice').value;
    if (voiceName !== 'auto') {
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(voice => voice.name === voiceName);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    utterance.rate = parseFloat(document.getElementById('localTTSRate').value);
    utterance.pitch = parseFloat(document.getElementById('localTTSPitch').value);

    // 停止当前正在播放的语音
    window.speechSynthesis.cancel();

    // 播放测试语音
    window.speechSynthesis.speak(utterance);
  });

  // 主题切换功能
  const themeSwitch = document.getElementById('theme-switch');
  const lightIcon = themeSwitch.querySelector('.light-icon');
  const darkIcon = themeSwitch.querySelector('.dark-icon');

  // 检查并应用保存的主题
  const savedTheme = localStorage.getItem('theme') || 'auto';
  applyTheme(savedTheme);

  themeSwitch.addEventListener('click', () => {
    const currentTheme = localStorage.getItem('theme') || 'auto';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  });

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addListener((e) => {
    if (localStorage.getItem('theme') === 'auto') {
      applyTheme('auto');
    }
  });

  function applyTheme(theme) {
    const isDark = theme === 'dark' ||
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // 更新图标显示
    lightIcon.style.display = isDark ? 'none' : 'block';
    darkIcon.style.display = isDark ? 'block' : 'none';

    // 添加/移除暗色模式类
    if (isDark) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  // 处理二级菜单
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const submenuId = item.id.replace('menu-', 'submenu-');
      const submenu = document.getElementById(submenuId);
      const arrow = item.querySelector('.arrow');

      // 切换子菜单的展开状态
      submenu.classList.toggle('expanded');
      arrow.classList.toggle('rotated');

      // 如果是API配置菜单，自动跳转到基础设置
      if (item.id === 'menu-api') {
        // 移除所有按钮的active样式
        const tabButtons = document.querySelectorAll('.sidebar > button');
        tabButtons.forEach(btn => btn.classList.remove('active'));

        const apiSubmenuButtons = document.querySelectorAll('#submenu-api button');
        apiSubmenuButtons.forEach(btn => btn.classList.remove('active'));

        // 为基础设置按钮添加active样式
        const basicSettingsBtn = document.getElementById('tab-api-basic');
        basicSettingsBtn.classList.add('active');

        // 隐藏所有面板
        const panels = document.querySelectorAll('.main-content > div');
        panels.forEach(panel => panel.classList.add('hidden'));

        // 显示基础设置面板
        document.getElementById('panel-api-basic').classList.remove('hidden');
      }
    });
  });

  // 处理API设置下的子菜单点击
  const apiSubmenuButtons = document.querySelectorAll('#submenu-api button');
  apiSubmenuButtons.forEach(button => {
    button.addEventListener('click', () => {
      // 移除所有按钮的active样式
      tabButtons.forEach(btn => btn.classList.remove('active'));
      apiSubmenuButtons.forEach(btn => btn.classList.remove('active'));

      // 添加active样式到当前按钮
      button.classList.add('active');

      // 隐藏所有面板
      panels.forEach(panel => panel.classList.add('hidden'));

      // 根据按钮ID显示对应面板
      const panelId = button.id.replace('tab-', 'panel-');
      document.getElementById(panelId).classList.remove('hidden');
    });
  });

  // 处理TTS菜单项
  document.getElementById('menu-tts').addEventListener('click', function() {
    const submenu = document.getElementById('submenu-tts');
    this.classList.toggle('active');

    if (this.classList.contains('active')) {
      // submenu.style.maxHeight = submenu.scrollHeight + 'px';
      this.querySelector('.arrow').innerHTML = '▶';




    } else {
      // submenu.style.maxHeight = '0';
      this.querySelector('.arrow').innerHTML = '▼';
    }

       // 新增：点击TTS默认打开基础设置面板
       //延迟100毫秒后执行
       switchTab('panel-tts-basic');


  });





  // 绑定TTS子菜单项点击事件
  document.getElementById('tab-tts-basic').addEventListener('click', () => switchTab('panel-tts-basic'));
  document.getElementById('tab-tts-local').addEventListener('click', () => switchTab('panel-tts-local'));
  document.getElementById('tab-tts-edge').addEventListener('click', () => switchTab('panel-tts-edge'));
  document.getElementById('tab-tts-minimaxi').addEventListener('click', () => switchTab('panel-tts-minimaxi'));
  document.getElementById('tab-tts-custom').addEventListener('click', () => switchTab('panel-tts-custom'));

  // 测试按钮事件
  document.getElementById('testMinimaxi').addEventListener('click', function() {
    // 添加Minimaxi测试逻辑
    alert('Oh my goodness! The Minimaxi TTS test feature is not implemented yet! Please be patient, our programmers are working overtime... tap tap tap, ding ding dong, coding all night long!');
  });

  document.getElementById('testCustomUrl').addEventListener('click', function() {
    // 添加自定义URL1测试逻辑
    alert('Hehehe, the Custom URL1 test feature is not implemented yet! Our programmers are on their fifth cup of coffee, working late into the night... glug glug, tap tap tap, typing until their keyboards break!');
  });

  document.getElementById('testCustomUrl2').addEventListener('click', function() {
    // 添加自定义URL2测试逻辑
    alert('Wahaha! The Custom URL2 test feature is also under development! Our programmers have already had their eighth cup of coffee, their eyes are bloodshot... clang clang, clickety-clack, the keyboard is smoking but they will finish the feature! This is too funny!');
  });





// 处理数据库操作菜单项
document.getElementById('menu-database').addEventListener('click', function() {
  const submenu = document.getElementById('submenu-database');
  this.classList.toggle('active');

  if (this.classList.contains('active')) {
    this.querySelector('.arrow').innerHTML = '▶';
    // 默认打开Cloud Database面板
    setTimeout(() => {
      switchTab('panel-cloud-db');
    }, 100);
  } else {
    this.querySelector('.arrow').innerHTML = '▼';
  }
});

// 处理单词列表菜单项
document.getElementById('menu-wordlist').addEventListener('click', function() {
  const submenu = document.getElementById('submenu-wordlist');
  this.classList.toggle('active');

  if (this.classList.contains('active')) {
    this.querySelector('.arrow').innerHTML = '▶';
    setTimeout(() => {
      switchTab('panel-cloud-wordlist');
    }, 100);
  } else {
    this.querySelector('.arrow').innerHTML = '▼';
  }
});

// 处理订阅管理菜单项
document.getElementById('menu-subscription').addEventListener('click', function() {
  const submenu = document.getElementById('submenu-subscription');
  this.classList.toggle('active');

  if (this.classList.contains('active')) {
    // submenu.style.maxHeight = submenu.scrollHeight + 'px';
    this.querySelector('.arrow').innerHTML = '▶';

    // 默认打开爱发电账号面板
    setTimeout(() => {
      // switchTab('panel-subscription-afdian');
      switchTab('panel-subscription-ohmygpt');

      const currentUserId = document.getElementById('ohmygptUserId').value;
      if (currentUserId) {
          fetchAndDisplayOhMyGptExpiryDate(currentUserId);
      }


    }, 100);


  } else {
    // submenu.style.maxHeight = '0'; //注意是Button，不是div
    this.querySelector('.arrow').innerHTML = '▼';




  }
});

// 处理EPUB文本修复菜单项
document.getElementById('menu-epub').addEventListener('click', function() {
  const submenu = document.getElementById('submenu-epub');
  this.classList.toggle('active');

  if (this.classList.contains('active')) {
    this.querySelector('.arrow').innerHTML = '▶';
    // 默认打开EPUB拆分工具面板
    setTimeout(() => {
      switchTab('panel-epub');
    }, 100);
  } else {
    this.querySelector('.arrow').innerHTML = '▼';
  }
});

// 绑定EPUB子菜单项点击事件
document.getElementById('tab-epub').addEventListener('click', () => switchTab('panel-epub'));
document.getElementById('tab-epub-telegraph').addEventListener('click', () => switchTab('panel-epub-telegraph'));
document.getElementById('tab-epub-roman-clean').addEventListener('click', () => switchTab('panel-epub-roman-clean'));

// 绑定订阅管理子菜单项点击事件
document.getElementById('tab-subscription-afdian').addEventListener('click', () => switchTab('panel-subscription-afdian'));
// document.getElementById('tab-subscription-kuma').addEventListener('click', () => switchTab('panel-subscription-kuma'));
document.getElementById('tab-subscription-ohmygpt').addEventListener('click', () => {
      switchTab('panel-subscription-ohmygpt');
      // 切换到 OhMyGpt 面板时，如果已有 User ID，则尝试刷新到期时间
      // const currentUserId = document.getElementById('ohmygptUserId').value;
      // if (currentUserId) {
      //     fetchAndDisplayOhMyGptExpiryDate(currentUserId);
      // }
  });

// 页面加载时初始化单词列表（默认请求本周数据）
// 注释掉自动加载，改为等待用户手动筛选
window.onload = function() {
  // 计算本周的日期范围
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 周一为一周的开始
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // 设置日期筛选输入框的默认值为本周
  const startDateFilterInput = document.getElementById('startDateFilter');
  const endDateFilterInput = document.getElementById('endDateFilter');
  if (startDateFilterInput && endDateFilterInput) {
    startDateFilterInput.value = formatDate(monday);
    endDateFilterInput.value = formatDate(sunday);
  }

  // 初始化学习统计图表UI（不加载数据）
  initWordStatsChart();

  // 注释掉自动加载数据的代码
  // // 构建默认筛选条件：本周，所有语言，所有状态
  // const filters = {
  //   language: 'all',
  //   statuses: [], // 空数组表示不筛选状态
  //   startDate: monday.getTime(),
  //   endDate: sunday.setHours(23, 59, 59, 999)
  // };

  // console.log('[options.js] 页面加载，默认请求本周数据:', filters);

  // // 获取本周的单词数据
  // Promise.all([
  //   getAllWords(),
  //   getFilteredWordDetails(filters)
  // ]).then(([words, filteredDetails]) => {
  //   // 可对单词按字母排序
  //   wordsArray = words.sort();
  //   // 初始时，筛选后的数组为本周的单词
  //   wordDetailsMap = filteredDetails;
  //   filteredWordsArray = Object.keys(filteredDetails).sort();
  //   updatePagination();
  //   updateLanguageFilter();

  //   // 初始化学习统计图表
  //   initWordStatsChart();
  // }).catch(err => {
  //   console.error("获取数据失败:", err);
  //   updatePagination();
  // });

  // 默认打开Cloud Database面板
  switchTab('panel-cloud-db');

  // 默认展开数据库操作菜单
  const databaseMenu = document.getElementById('menu-database');
  const databaseSubmenu = document.getElementById('submenu-database');
  const databaseArrow = databaseMenu?.querySelector('.arrow');

  if (databaseMenu && databaseSubmenu && databaseArrow) {
    // 添加展开状态
    databaseSubmenu.classList.add('expanded');
    databaseMenu.classList.add('active');
    // 设置箭头为展开状态（根据点击事件逻辑，active时箭头应该是▶）
    databaseArrow.innerHTML = '▶';
  }
};

  // --- 新增：获取并显示 OhMyGpt 到期时间 ---
  async function fetchAndDisplayOhMyGptExpiryDate(userId) {
    if (!userId) {
      ohmygptExpiryDateDisplay.textContent = 'N/A';
      ohmygptExpiryStatusSpan.textContent = chrome.i18n.getMessage('ohmygptExpiryStatusNoUserId') || '需要先获取 User ID';
      ohmygptExpiryStatusSpan.style.color = 'orange';
      return;
    }

    ohmygptExpiryStatusSpan.textContent = chrome.i18n.getMessage('ohmygptExpiryStatusLoading') || '正在查询...';
    ohmygptExpiryStatusSpan.style.color = 'orange';

    try {
      // 注意：假设 callOhMyGptGetDays 返回的 response.data 包含 expire_time
      const response = await callOhMyGptGetDays(userId);
      // 更新：检查 expire_time 字段是否存在且有效
      if (response && response.success && response.data && response.data.expire_time) {
        const expireTimeString = response.data.expire_time;
        const expiryDate = new Date(expireTimeString); // 直接解析 API 返回的到期时间字符串

        // 检查日期是否有效
        if (isNaN(expiryDate.getTime())) {
            throw new Error('Invalid date format received from API');
        }

        // 计算剩余天数（向下取整）
        const now = new Date();
        const timeDiff = expiryDate.getTime() - now.getTime();
        // 更新：如果时间差小于0，则剩余天数为0
        const daysRemaining = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));

        // 尝试使用本地化日期格式，如果失败则使用 ISO 格式
        let displayDate;
        try {
            displayDate = expiryDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) {
            displayDate = expiryDate.toISOString().split('T')[0]; // Fallback
        }

        ohmygptExpiryDateDisplay.textContent = `${displayDate} (${daysRemaining} ${chrome.i18n.getMessage('ohmygptDaysRemainingSuffix') || 'Day left'})`;
        ohmygptExpiryStatusSpan.textContent = chrome.i18n.getMessage('ohmygptExpiryStatusSuccess') || 'request success';
        ohmygptExpiryStatusSpan.style.color = 'green';
      } else {
        // 更新：如果 API 成功但未返回 expire_time，也视为错误
        const errorMsg = response && response.error ? response.error : (response && response.success ? 'Not Donated' : 'Unknown error');
        ohmygptExpiryDateDisplay.textContent = 'request failed';
        ohmygptExpiryStatusSpan.textContent = `${chrome.i18n.getMessage('ohmygptExpiryStatusError') || 'request looks success'}: ${errorMsg}`;
        ohmygptExpiryStatusSpan.style.color = 'red';
      }
    } catch (error) {
      console.error("获取 OhMyGpt 到期时间异常:", error);
      ohmygptExpiryDateDisplay.textContent = 'request exception';
      ohmygptExpiryStatusSpan.textContent = `${chrome.i18n.getMessage('ohmygptExpiryStatusException') || 'request exception'}: ${error.message || 'Unknown exception'}`;
      ohmygptExpiryStatusSpan.style.color = 'red';
    }
  }

  // --- 新增：处理增加 30 天订阅按钮 ---
  if (ohmygptAddDaysBtn) {
    ohmygptAddDaysBtn.addEventListener('click', async () => {
      const userId = ohmygptUserIdInput.value;
      const token = ohmygptTokenInput.value;

      if (!userId || !token) {
        ohmygptAddDaysStatusSpan.textContent = chrome.i18n.getMessage('ohmygptAddDaysStatusNeedLogin') || '请先获取 User ID 和 Token';
        ohmygptAddDaysStatusSpan.style.color = 'red';
        return;
      }

      ohmygptAddDaysStatusSpan.textContent = chrome.i18n.getMessage('ohmygptAddDaysStatusProcessing') || '处理中...';
      ohmygptAddDaysStatusSpan.style.color = 'orange';
      ohmygptAddDaysBtn.disabled = true;

      try {
        const response = await callOhMyGptAddDays(userId, token);
        if (response && response.success) {
          ohmygptAddDaysStatusSpan.textContent = chrome.i18n.getMessage('ohmygptAddDaysStatusSuccess') || '成功增加 30 天！';
          ohmygptAddDaysStatusSpan.style.color = 'green';
          // 成功后刷新到期时间显示
          fetchAndDisplayOhMyGptExpiryDate(userId);
        } else {
          const errorMsg = response && response.error ? response.error : 'Unknown error';
          ohmygptAddDaysStatusSpan.textContent = `${chrome.i18n.getMessage('ohmygptAddDaysStatusError') || '操作失败'}: ${errorMsg}`;
          ohmygptAddDaysStatusSpan.style.color = 'red';
        }
      } catch (error) {
        console.error("增加订阅天数异常:", error);
        ohmygptAddDaysStatusSpan.textContent = chrome.i18n.getMessage('ohmygptAddDaysStatusException') || '操作异常';
        ohmygptAddDaysStatusSpan.style.color = 'red';
      } finally {
        ohmygptAddDaysBtn.disabled = false;
      }
    });
  }

  // --- 新增：处理捐赠滑块和按钮 ---
  const COIN_RATE = 250000; // 1 USD = 250000 Coins

  // 更新捐赠金额显示
  function updateDonateAmountDisplay() {
    if (ohmygptDonateAmountSlider && ohmygptDonateAmountDisplay) {
      const usdAmount = parseInt(ohmygptDonateAmountSlider.value, 10);
      const coinAmount = usdAmount * COIN_RATE;
      // 使用 toLocaleString 来格式化大数字
      const formattedCoins = coinAmount.toLocaleString();
      ohmygptDonateAmountDisplay.textContent = `${usdAmount} USD (${formattedCoins} Coins)`;
    }
  }

  // 初始化滑块显示
  if (ohmygptDonateAmountSlider) {
    updateDonateAmountDisplay(); // 页面加载时更新一次
    ohmygptDonateAmountSlider.addEventListener('input', updateDonateAmountDisplay); // 滑动时更新
  }

  // 处理捐赠按钮点击
  if (ohmygptDonateBtn) {
    ohmygptDonateBtn.addEventListener('click', async () => {
      const token = ohmygptTokenInput.value;

      if (!token) {
        ohmygptDonateStatusSpan.textContent = chrome.i18n.getMessage('ohmygptDonateStatusNeedToken') || '请先获取 Token';
        ohmygptDonateStatusSpan.style.color = 'red';
        return;
      }

      const usdAmount = parseInt(ohmygptDonateAmountSlider.value, 10);
      const coinAmount = usdAmount * COIN_RATE;

      ohmygptDonateStatusSpan.textContent = chrome.i18n.getMessage('ohmygptDonateStatusProcessing') || '处理中...';
      ohmygptDonateStatusSpan.style.color = 'orange';
      ohmygptDonateBtn.disabled = true;
      ohmygptDonateAmountSlider.disabled = true; // 禁用滑块

      try {
        const response = await callOhMyGptSendDollar(token, coinAmount);
        if (response && response.success) {
          ohmygptDonateStatusSpan.textContent = chrome.i18n.getMessage('ohmygptDonateStatusSuccess') || '捐赠成功，感谢支持！';
          ohmygptDonateStatusSpan.style.color = 'green';
        } else {
          const errorMsg = response && response.error ? response.error : 'Unknown error';
          ohmygptDonateStatusSpan.textContent = `${chrome.i18n.getMessage('ohmygptDonateStatusError') || '捐赠失败'}: ${errorMsg}`;
          ohmygptDonateStatusSpan.style.color = 'red';
        }
      } catch (error) {
        console.error("捐赠异常:", error);
        ohmygptDonateStatusSpan.textContent = chrome.i18n.getMessage('ohmygptDonateStatusException') || '捐赠异常';
        ohmygptDonateStatusSpan.style.color = 'red';
      } finally {
        ohmygptDonateBtn.disabled = false;
        ohmygptDonateAmountSlider.disabled = false; // 恢复滑块
      }
    });
  }


  // ... (现有的菜单处理、TTS、订阅管理子菜单绑定等代码) ...

  // 绑定数据库操作子菜单项点击事件（tab-cloud-db和tab-webdav的监听器在后面的DOMContentLoaded中）
  document.getElementById('tab-word-operations').addEventListener('click', () => {
    switchTab('panel-word-operations');
    // 切换到单词库操作面板时，自动计算数据库大小
    calculateDatabaseSize();
  });
  document.getElementById('tab-import').addEventListener('click', () => switchTab('panel-import'));
  document.getElementById('tab-backup').addEventListener('click', () => switchTab('panel-backup'));

  // 绑定单词列表子菜单项点击事件
  document.getElementById('tab-cloud-wordlist').addEventListener('click', () => {
    switchTab('panel-cloud-wordlist');
    updateCustomServerLink();
  });
  document.getElementById('tab-table').addEventListener('click', () => switchTab('panel-table'));
  document.getElementById('tab-word-stats').addEventListener('click', () => switchTab('panel-word-stats'));

  // 绑定订阅管理子菜单项点击事件
  document.getElementById('tab-subscription-afdian').addEventListener('click', () => switchTab('panel-subscription-afdian'));
  // document.getElementById('tab-subscription-kuma').addEventListener('click', () => switchTab('panel-subscription-kuma'));
  document.getElementById('tab-subscription-ohmygpt').addEventListener('click', () => {
      switchTab('panel-subscription-ohmygpt');
      // 切换到 OhMyGpt 面板时，如果已有 User ID，则尝试刷新到期时间
      const currentUserId = document.getElementById('ohmygptUserId').value;
      if (currentUserId) {
          fetchAndDisplayOhMyGptExpiryDate(currentUserId);
      }
  });

  // 加载背景设置
  loadBackgroundSettings().then(() => {
    console.log("背景设置已加载");
  });

  // 捐赠按钮功能
  const donationBtn = document.getElementById('donationBtn');
  if (donationBtn) {
    const eyesContainer = donationBtn.querySelector('.creepy-btn__eyes');
    const pupils = donationBtn.querySelectorAll('.creepy-btn__pupil');

    // 眼睛跟随鼠标效果
    function updateEyes(e) {
      if (!eyesContainer) return;

      // 获取眼睛容器的中心位置
      const eyesRect = eyesContainer.getBoundingClientRect();
      const eyesCenterX = eyesRect.left + eyesRect.width / 2;
      const eyesCenterY = eyesRect.top + eyesRect.height / 2;

      // 获取鼠标位置
      const mouseX = e.clientX;
      const mouseY = e.clientY;

      // 计算角度
      const dx = mouseX - eyesCenterX;
      const dy = mouseY - eyesCenterY;
      const angle = Math.atan2(-dy, dx) + Math.PI / 2;

      // 计算距离（限制范围）
      const visionRangeX = 180;
      const visionRangeY = 75;
      const distance = Math.hypot(dx, dy);
      const x = Math.sin(angle) * distance / visionRangeX;
      const y = Math.cos(angle) * distance / visionRangeY;

      // 更新瞳孔位置
      const translateX = -50 + x * 50;
      const translateY = -50 + y * 50;

      pupils.forEach(pupil => {
        pupil.style.transform = `translate(${translateX}%, ${translateY}%)`;
      });
    }

    // 添加鼠标移动事件监听器
    donationBtn.addEventListener('mousemove', updateEyes);

    // 触摸设备支持
    donationBtn.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updateEyes(e.touches[0]);
      }
    });

    // 点击事件 - 打开爱发电页面
    donationBtn.addEventListener('click', () => {
      window.open('https://afdian.com/a/lingkuma', '_blank');
    });
  }

  // ... (现有的备份/还原、打开 popup、配置备份/还原等代码) ...

}); // 结束 DOMContentLoaded

// ... (现有的 window.onload, switchTab, backup/restore 等函数) ...

// 更新 switchTab 函数以确保在切换时清除状态消息 (可选但推荐)
function switchTab(panelId) {
  // 隐藏所有面板
  panels.forEach(panel => panel.classList.add('hidden'));
  // 移除所有主菜单和子菜单按钮的 active 状态 (简化处理，可以按需细化)
  document.querySelectorAll('.sidebar button, .submenu button').forEach(btn => btn.classList.remove('active'));

  // 控制webdavStatus的显示/隐藏
  const webdavStatusDiv = document.getElementById('webdavStatus');
  if (webdavStatusDiv) {
    if (panelId === 'panel-webdav') {
      webdavStatusDiv.style.display = 'block';
    } else {
      webdavStatusDiv.style.display = 'none';
    }
  }

  // 显示目标面板
  const targetPanel = document.getElementById(panelId);
  if (targetPanel) {
    targetPanel.classList.remove('hidden');

    // 清除 OhMyGpt 面板的状态消息 (如果切换到的是这个面板)
    if (panelId === 'panel-subscription-ohmygpt') {
        const statusSpans = targetPanel.querySelectorAll('span[id$="Status"], span[id$="StatusSpan"]'); // 选择所有状态 span
        statusSpans.forEach(span => { span.textContent = ''; }); // 清空文本内容
        // 尝试获取并显示到期时间
        const currentUserId = document.getElementById('ohmygptUserId').value;
        if (currentUserId) {
            fetchAndDisplayOhMyGptExpiryDate(currentUserId);
        } else {
            // 如果没有 UserID，确保到期时间显示为 N/A
            const expiryDisplay = document.getElementById('ohmygptExpiryDateDisplay');
            const expiryStatus = document.getElementById('ohmygptExpiryStatus');
            if(expiryDisplay) expiryDisplay.textContent = 'N/A';
            if(expiryStatus) {
                expiryStatus.textContent = chrome.i18n.getMessage('ohmygptExpiryStatusNoUserId') || '需要先获取 User ID';
                expiryStatus.style.color = 'orange';
            }
        }
    }

    // 找到对应的菜单按钮并设为 active (需要更复杂的逻辑来处理主/子菜单)
    // 尝试查找 ID 匹配的按钮
    const buttonId = `tab-${panelId.replace('panel-', '').replace(/-/g, '-')}`; // 尝试构造按钮 ID
    const targetButton = document.getElementById(buttonId);
    if (targetButton) {
      // 如果是子菜单按钮，需要同时激活父菜单按钮
      const parentMenu = targetButton.closest('.submenu')?.previousElementSibling;
      if (parentMenu && parentMenu.matches('.sidebar > button')) {
          parentMenu.classList.add('active');
          // 确保父菜单的箭头是展开状态
          const arrow = parentMenu.querySelector('.arrow');
          if (arrow) arrow.innerHTML = '▼';
          // 确保子菜单是展开的
          const submenu = targetButton.closest('.submenu');
          if (submenu && submenu.style.maxHeight !== submenu.scrollHeight + 'px') {
              submenu.style.maxHeight = submenu.scrollHeight + 'px';
          }
      }
      targetButton.classList.add('active');
    } else {
        // 如果找不到对应的 tab 按钮 (例如直接调用 switchTab 时)，
        // 尝试根据 panelId 激活父菜单（如果适用）
        const panelElement = document.getElementById(panelId);
        const parentButton = findParentMenuButtonForPanel(panelId); // 需要实现这个辅助函数或类似逻辑
        if (parentButton) {
            parentButton.classList.add('active');
             // 确保父菜单的箭头是展开状态
            const arrow = parentButton.querySelector('.arrow');
            if (arrow) arrow.innerHTML = '▼';
             // 确保子菜单是展开的
            const submenu = parentButton.nextElementSibling;
             if (submenu && submenu.classList.contains('submenu') && submenu.style.maxHeight !== submenu.scrollHeight + 'px') {
                 submenu.style.maxHeight = submenu.scrollHeight + 'px';
             }
        }
    }
  } else {
    console.warn(`Panel with ID ${panelId} not found.`);
  }
}

// 辅助函数示例 (需要根据你的 HTML 结构调整)
function findParentMenuButtonForPanel(panelId) {
    if (panelId.startsWith('panel-api-')) return document.getElementById('menu-api');
    if (panelId.startsWith('panel-tts-')) return document.getElementById('menu-tts');
    if (panelId.startsWith('panel-subscription-')) return document.getElementById('menu-subscription');
    if (panelId.startsWith('panel-word-') || panelId === 'panel-table' || panelId === 'panel-cloud-wordlist') return document.getElementById('menu-wordlist');
    // 新增：数据库操作菜单的面板
    if (panelId === 'panel-cloud-db' || panelId === 'panel-webdav' || panelId === 'panel-word-operations' || panelId === 'panel-import' || panelId === 'panel-backup') {
        return document.getElementById('menu-database');
    }
    // 新增：EPUB文本修复菜单的面板
    if (panelId === 'panel-epub' || panelId === 'panel-epub-telegraph' || panelId === 'panel-epub-roman-clean') {
        return document.getElementById('menu-epub');
    }
    return null; // 其他面板没有父菜单
}


// 新增面板切换逻辑（更新：新增关于页面处理逻辑）
// 更新原因：修改选择器，仅选择没有子菜单的主菜单按钮，避免事件监听器冲突
const tabButtons = document.querySelectorAll('#tab-about'); // 移除了 #tab-import 和 #tab-backup，它们现在在数据库操作子菜单中；移除了 epub 相关按钮，它们现在在 epub 子菜单中
const panels = document.querySelectorAll('.main-content > div');

// 更新原因：重写针对无子菜单按钮的事件监听逻辑，使其更简洁且避免冲突
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    // 1. 停用所有按钮（主菜单和子菜单）并折叠子菜单
    document.querySelectorAll('.sidebar button, .submenu button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.submenu').forEach(submenu => {
        // submenu.style.maxHeight = '0'; // 直接设为0可能导致动画效果丢失，如果需要动画效果，需要更复杂的处理
        // 暂时保留之前的逻辑，只在非激活时折叠
    });
     // 将带子菜单的主按钮箭头重置
    document.querySelectorAll('#menu-database .arrow, #menu-api .arrow, #menu-tts .arrow, #menu-subscription .arrow, #menu-wordlist .arrow, #menu-epub .arrow').forEach(arrow => arrow.innerHTML = '▶');
     // 折叠所有子菜单
    //  document.querySelectorAll('.submenu').forEach(submenu => submenu.style.maxHeight = '0');


    // 2. 激活当前点击的按钮
    button.classList.add('active');

    // 3. 隐藏所有面板
    panels.forEach(panel => panel.classList.add('hidden'));

    // 4. 显示对应的面板 (ID 约定：tab-xxx -> panel-xxx)
    const panelId = button.id.replace('tab-', 'panel-');
    const targetPanel = document.getElementById(panelId);
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
    } else {
       console.warn(`Panel with derived ID ${panelId} not found for button ${button.id}.`);
    }
  });
});

// 注意：旧的 tabButtons.forEach (lines 2586-2616 in snippet 8) 应该被上面的代码替换掉，
// 这里不再需要旧的循环了，因为我们已经为这些按钮设置了新的监听器。
// 【请确保删除或注释掉旧的 tabButtons.forEach 循环】


// 新增：备份数据库功能
document.getElementById("backupBtn").addEventListener("click", backupDatabase);

// 辅助函数：获取当前时间的 YYYY-MM-DD_HH-MM-SS 格式字符串
function getCurrentDateTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function backupDatabase() {
  const backupBtn = document.getElementById("backupBtn"); // 获取备份按钮
  const statusEl = document.getElementById("backupStatus"); // 获取状态显示元素
  const downloadLink = document.getElementById("downloadLink"); // 获取下载链接元素

  // --- 开始视觉反馈 ---
  let originalBtnText = ''; // 存储按钮原始文本
  if (backupBtn) {
    originalBtnText = backupBtn.textContent; // 保存原始文本
    backupBtn.disabled = true;      // 禁用按钮
    backupBtn.textContent = "备份中... Loading... "; // 更改按钮文本 (后续可考虑 i18n)
  }
  if (statusEl) {
    statusEl.textContent = "正在备份，请稍候... Loading..."; // 更新状态文本 (后续可考虑 i18n)
  }
  // 隐藏之前的下载链接（如果有）
  if (downloadLink) {
    downloadLink.style.display = "none";
  }
  // --- 结束视觉反馈 ---

  chrome.runtime.sendMessage({ action: "backupDatabase" }, function(response) {
    // --- 恢复按钮状态 ---
    if (backupBtn) {
      backupBtn.disabled = false;         // 恢复按钮可用
      backupBtn.textContent = originalBtnText; // 恢复按钮原始文本
    }
    // --- 结束恢复按钮状态 ---

    if (response && response.success && response.data) {
      const jsonStr = JSON.stringify(response.data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // --- 开始修改：使用 chrome.downloads.download ---
      const dateTimeString = getCurrentDateTimeString();
      const filename = `vocab_backup_${dateTimeString}.json`; // 设置下载文件名

      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false // 尝试不显示 "另存为" 对话框
      }, (downloadId) => {
        // 下载开始或失败后撤销 Blob URL
        URL.revokeObjectURL(url);

        if (chrome.runtime.lastError) {
          console.error("下载词库备份时出错:", chrome.runtime.lastError);
          if (statusEl) {
            statusEl.textContent = "备份失败！ Wrong! Error: " + chrome.runtime.lastError.message;
          }
        } else if (downloadId === undefined) {
            console.warn("词库备份下载可能未启动。DownloadId is undefined.");
            if (statusEl) {
              statusEl.textContent = "备份启动可能失败，请检查浏览器下载设置。";
            }
        } else {
           console.log("词库备份下载已启动, Download ID:", downloadId);
          // 更新状态信息
          if (statusEl) {
            statusEl.textContent = "备份成功！已开始下载。 Done! already Download~~";
          }
        }
         // 确保下载链接保持隐藏 (虽然我们不再使用它，但以防万一)
        if (downloadLink) {
            downloadLink.style.display = "none";
        }
      });
      // --- 结束修改 ---

      /* // 原来的 <a> 链接下载代码
      // 创建一个临时的 <a> 元素用于触发下载
      const tempLink = document.createElement('a');
      tempLink.href = url;
      // 使用新的时间格式化文件名
      const dateTimeString = getCurrentDateTimeString();
      tempLink.download = `vocab_backup_${dateTimeString}.json`; // 设置下载文件名

      // 将链接添加到文档中（某些浏览器需要）
      document.body.appendChild(tempLink);

      // 模拟点击链接以触发下载
      tempLink.click();

      // 从文档中移除临时链接
      document.body.removeChild(tempLink);

      // 清理创建的 URL 对象
      URL.revokeObjectURL(url);

      // 更新状态信息
      if (statusEl) {
        statusEl.textContent = "备份成功！已开始下载。 Done! already Download~~"; // (后续可考虑 i18n)
      }
      // 确保下载链接保持隐藏
      if (downloadLink) {
          downloadLink.style.display = "none";
      }
      */

    } else {
      // 更新失败状态信息
      if (statusEl) {
        statusEl.textContent = "备份失败！ Wrong!"; // (后续可考虑 i18n)
      }
    }
  });
}

// 新增：还原数据库功能
document.getElementById("restoreBtn").addEventListener("click", restoreDatabase);

function restoreDatabase() {
  const fileInput = document.getElementById("backupFile");
  const file = fileInput.files[0];
  if (!file) {
    alert("请选择备份文件");
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backupData = JSON.parse(e.target.result);
      chrome.runtime.sendMessage({ action: "restoreDatabase", data: backupData }, function(response) {
        if (response && response.success) {
          document.getElementById("backupStatus").textContent = "还原成功！";
          // 还原后刷新"表格"
          applyFilters();
        } else {
          document.getElementById("backupStatus").textContent = "还原失败！";
        }
      });
    } catch (error) {
      console.error("解析备份文件失败:", error);
      alert("备份文件格式错误");
    }
  };
  reader.readAsText(file);
}


document.getElementById('open-popup').addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('src/popup/popup.html'),
    type: 'popup',
    width: 400,
    height: 600
  });
});

// 新增：备份配置数据功能
document.getElementById("backupConfigBtn").addEventListener("click", backupConfig);

function backupConfig() {
  // 同时获取 sync 和 local 存储的所有数据
  Promise.all([
    new Promise(resolve => chrome.storage.sync.get(null, resolve)),
    new Promise(resolve => chrome.storage.local.get(null, resolve))
  ]).then(([syncData, localData]) => {
    const configData = {
      timestamp: new Date().toISOString(), // 保留原始 ISO 格式的时间戳在数据内部
      settings: {
        sync: syncData,
        local: localData
      }
    };

    // 转换为 JSON 并创建下载
    const jsonStr = JSON.stringify(configData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // --- 开始修改：替换 chrome.downloads.download ---
    // 获取格式化的日期时间字符串
    const dateTimeString = getCurrentDateTimeString();
    const filename = `vocab_config_backup_${dateTimeString}.json`; // 设置下载文件名

    // 使用 chrome.downloads.download API
    chrome.downloads.download({
      url: url, // 使用上面创建的 Blob URL
      filename: filename,
      saveAs: false // 尝试不显示 "另存为" 对话框
    }, (downloadId) => {
      // 下载开始后或失败后撤销 Blob URL
      URL.revokeObjectURL(url);

      if (chrome.runtime.lastError) {
        console.error("下载配置备份时出错:", chrome.runtime.lastError);
        document.getElementById("backupConfigStatus").textContent =
          "备份失败：" + chrome.runtime.lastError.message;
      } else if (downloadId === undefined) {
        // 在某些情况下，如果下载被阻止（例如，由于浏览器设置或扩展冲突），downloadId 可能是 undefined
        console.warn("配置备份下载可能未启动。DownloadId is undefined.");
        document.getElementById("backupConfigStatus").textContent = "备份启动可能失败，请检查浏览器下载设置。";
      } else {
        console.log("配置备份下载已启动, Download ID:", downloadId);
        document.getElementById("backupConfigStatus").textContent = "配置备份成功！已开始下载。 done! already download";
      }
    });
    // --- 结束修改 ---

    /*  // 原来的 <a> 链接下载代码 (现在可以删除或保留为注释)
    // 创建一个临时的 <a> 元素用于触发下载
    const tempLink = document.createElement('a');
    tempLink.href = url;
    // 使用新的时间格式化文件名
    // const dateTimeString = getCurrentDateTimeString();
    // tempLink.download = `vocab_config_backup_${dateTimeString}.json`; // 设置下载文件名

    // 将链接添加到文档中
    // document.body.appendChild(tempLink);

    // 模拟点击链接以触发下载
    // tempLink.click();

    // 从文档中移除临时链接
    // document.body.removeChild(tempLink);

    // 清理创建的 URL 对象
    // URL.revokeObjectURL(url);

    // 更新状态信息
    // document.getElementById("backupConfigStatus").textContent = "配置备份成功！已开始下载。 done! already download";
    */
  }).catch(error => {
    // 新增：处理 Promise 可能出现的错误
    console.error("备份配置时出错:", error);
    document.getElementById("backupConfigStatus").textContent = "备份失败：" + (error.message || "未知错误");
  });
}

// 新增：还原配置数据功能
document.getElementById("restoreConfigBtn").addEventListener("click", restoreConfig);

function restoreConfig() {
  const fileInput = document.getElementById("backupConfigFile");
  const file = fileInput.files[0];

  if (!file) {
    alert("请选择配置备份文件");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backupData = JSON.parse(e.target.result);

      // 验证备份数据格式
      if (!backupData.settings || (!backupData.settings.sync && !backupData.settings.local)) {
        throw new Error("无效的配置备份文件格式");
      }

      // 还原 sync 存储的数据
      if (backupData.settings.sync) {
        chrome.storage.sync.set(backupData.settings.sync);
      }

      // 还原 local 存储的数据
      if (backupData.settings.local) {
        chrome.storage.local.set(backupData.settings.local, function() {
          if (chrome.runtime.lastError) {
            document.getElementById("backupConfigStatus").textContent =
              "还原失败：" + chrome.runtime.lastError.message;
          } else {
            document.getElementById("backupConfigStatus").textContent =
              "配置还原成功！将在重启插件后生效";

            // 提示用户重启插件
            setTimeout(() => {
              if (confirm("配置已还原，需要重启插件才能生效。是否现在重启？")) {
                chrome.runtime.reload();
              }
            }, 500);
          }
        });
      }

    } catch (error) {
      console.error("解析配置备份文件失败:", error);
      document.getElementById("backupConfigStatus").textContent =
        "还原失败：备份文件格式错误";
    }
  };

  reader.readAsText(file);
}

// 定义默认提示词
const DEFAULT_PROMPTS = {
  aiPrompt: `
  # 角色
你是一位精通德语 日语 英语的翻译专家，擅长根据上下文精确判断并翻译单词或固定短语。日语特别注意：日语待翻译词可能由于软件的分词逻辑导致错误，请在翻译时，以 [完整短语]: [中文翻译] 的形式，[完整短语]中，将你认为正确的完整分词放入其中。

# 任务
根据提供的 [句子]，判断 [待翻译词] 在该语境下是作为单个单词还是固定短语的一部分，并严格按照指定格式返回其最贴切的中文翻译。

# 核心规则
1.  **短语优先**: 如果 [待翻译词] 在句子中是一个固定短语/习语的一部分，必须识别并翻译整个短语。
2.  **单词本义**: 如果 [待翻译词] 只是一个独立的单词（即使有引申义），则只翻译该单词。
3.  **禁止分析**: 绝对不要返回任何形式的分析、解释或语法说明。


# 输入
- 句子: {sentence}
- 待翻译词: {word}

# 输出要求
- **如果单词是短语的一部分，则使用"短语：翻译"的键值输出形式**:  即 “完整短语: 中文翻译”（输出不要包含双引号） 
- **如果单词是独立的一个含义，则直接给出单词在文中的中文含义即可，不要使用键值形式**: 即“中文翻译”（输出不要包含双引号） 


`,

  aiPrompt2: `
  # 角色
你是一位精通德语 日语 英语的语法解析专家，擅长根据上下文精确判断对应单词的解析精要

# 任务
根据提供的 [句子]，判断 [待解析词] 在该语境下的具体语法作用，形变规则等

# 核心规则
返回20字左右精要解析。

# 输入
- 句子: {sentence}
- 待解析词: {word}

# 输出格式
直接返回解析内容

  `,

aiLanguageDetectionPrompt: '请判断以下句子中单词 \'{word}\' 在句子\'{sentence}\'中所使用的语言，仅返回ISO 639-1国际标准化组织ISO 639语言代码标准(如en, de, fr等)',
  aiSentenceTranslationPrompt: '请将句子: \'{sentence}\'翻译为中文，并将句子中单词"\'{word}\'\"对应的中文的部分用Markdown加粗显示。只返回翻译结果，不要额外说明。',
  aiAnalysisPrompt: '直译： 我敬畏地观察着两位可怕的战士一次又一次地交叉他们的剑。 解析： 1.- Ich beobachte ehrfürchtig: "我敬畏地观察"。   - Ich: "我"，主语。   - beobachte: "观察"，动词"beobachten"的第一人称单数形式。   - ehrfürchtig: "敬畏地"，副词，表示对某事物的尊敬或畏惧。 2.- wie die beiden furchterregenden Krieger immer wieder ihre Klingen kreuzen: "两位可怕的战士一次又一次地交叉他们的剑"。   - wie: "如何"，引导方式状语从句。   - die beiden furchterregenden Krieger: "这两位可怕的战士"。     - die beiden: "这两位"，指示代词。     - furchterregenden: "可怕的"，形容词，表示"令人恐惧"。     - Krieger: "战士"，名词，指战斗者。   - immer wieder: "一次又一次"，副词短语，表示重复发生。   - ihre Klingen kreuzen: "交叉他们的剑"。      - ihre: "他们的"，物主代词。     - Klingen: "剑"，名词，表示剑或刀刃。     - kreuzen: "交叉"，动词，表示交叉或交锋。 借鉴上面解析格式，用中文解析下列英语/德语等其他语言的句子: {sentence}',
  sidebarAIPrompt: '直译： 我敬畏地观察着两位可怕的战士一次又一次地交叉他们的剑。 解析： 1.- Ich beobachte ehrfürchtig: "我敬畏地观察"。   - Ich: "我"，主语。   - beobachte: "观察"，动词"beobachten"的第一人称单数形式。   - ehrfürchtig: "敬畏地"，副词，表示对某事物的尊敬或畏惧。 2.- wie die beiden furchterregenden Krieger immer wieder ihre Klingen kreuzen: "两位可怕的战士一次又一次地交叉他们的剑"。   - wie: "如何"，引导方式状语从句。   - die beiden furchterregenden Krieger: "这两位可怕的战士"。     - die beiden: "这两位"，指示代词。     - furchterregenden: "可怕的"，形容词，表示"令人恐惧"。     - Krieger: "战士"，名词，指战斗者。   - immer wieder: "一次又一次"，副词短语，表示重复发生。   - ihre Klingen kreuzen: "交叉他们的剑"。      - ihre: "他们的"，物主代词。     - Klingen: "剑"，名词，表示剑或刀刃。     - kreuzen: "交叉"，动词，表示交叉或交锋。 借鉴上面解析格式，用中文解析下列英语/德语等其他语言的句子: {sentence}',
  aiTagAnalysisPrompt: `
你将要按照下列要求，分析单词在句子中的一些信息，用作某单词的tag，请按照下列要求进行分析：
1. 词性(pos): 在句子中的词性
2. 性别(gender): 如果是名词，返回 der/die/das
3. 复数形式(plural): 如果是名词，返回其复数形式
4. 变位(conjugation): 如果是动词，返回其原形
5. 附加信息1(自定义key): 任何其他重要信息，请自行判断添加，可参考示例。
6. 附加信息2(自定义key): 任何其他重要信息，请自行判断添加，可参考示例。
7. ...
...
示例：
德语：{"pos":"n", "gender":"der", "plural":"Häuser", "conjugation":"gehen"}
英语：{"pos":"n", "plural":"houses", "conjugation":"null"}
日语：{"pos":"n", "gender":"null", "plural":"null", "conjugation":"null", "注音":"いえ、うち","罗马音":"ie,uchi"}
中文：{"pos":"n", "gender":"null", "plural":"null", "conjugation":"null", "pinyin":"fáng zi"}
"请分析句子"{sentence}"中的单词"{word}"。返回JSON格式，包含：
仅返回JSON，无需解释，不要加markdown代码块标记，注意不同语言，非日语不要返回注意和罗马音和拼音。
`,
  wordAudioUrlTemplate: '',
  aiYoutubeCaptionPrompt: `你将按照以下要求，为Youtube字幕添加适当的标点符号。
  1.每个逗号小段不要过长或者过短，要和正常的说话停顿相匹配，比如德语里的und,oder,aber,等等在很长的句子历史可以用逗号添加一个作为停顿的
  2.但不要添加或修改任何单词。
  3.仅添加标点符号，如逗号、句号、问号等。
  4.开始和结果的句子可能是其他句子的截断，可以酌情不添加标点符号。
  5.不要添加任何解释或者备注,直接返回带标点的文本。
  请处理以下文本：{text}`
};

// 恢复特定提示词到默认值
function restoreDefaultPrompt(promptId) {
  const element = document.getElementById(promptId);
  element.value = DEFAULT_PROMPTS[promptId];

  // 如果是textarea，触发高度自动调整
  if (element.tagName === 'TEXTAREA') {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  }

  //同时将其对应的vaule值也恢复为默认值 aiconfig下的：

  // 先获取当前的 aiConfig，然后只更新特定的提示词
  chrome.storage.local.get(['aiConfig'], function(result) {
    const aiConfig = result.aiConfig || {};
    aiConfig[promptId] = DEFAULT_PROMPTS[promptId];
    chrome.storage.local.set({ aiConfig: aiConfig });
  });


  // 显示恢复成功的提示消息
  const statusMsg = document.createElement('span');
  statusMsg.className = 'restore-status';
  statusMsg.textContent = '已恢复默认';
  statusMsg.style.color = 'green';
  statusMsg.style.marginLeft = '10px';

  // 如果已有状态消息，则移除
  const existingStatus = document.querySelector(`#${promptId}-container .restore-status`);
  if (existingStatus) {
    existingStatus.remove();
  }

  // 将状态消息添加到容器中
  document.getElementById(`${promptId}-container`).appendChild(statusMsg);

  // 2秒后自动移除状态消息
  setTimeout(() => {
    statusMsg.remove();
  }, 2000);
}

// 设置通用的自动保存功能
function setupAutoSave() {
  // 获取所有标记为自动保存的输入元素
  const autoSaveElements = document.querySelectorAll('[data-auto-save="true"]');

  autoSaveElements.forEach(element => {
    // 根据元素类型选择适当的事件
    const eventType = element.tagName === 'TEXTAREA' ? 'input' : 'input';

    // 为textarea添加自动高度调整功能
    if (element.tagName === 'TEXTAREA') {
      // 定义自动调整高度的函数
      const autoResize = function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      };

      // 初始化高度
      autoResize.call(element);

      // 监听input事件调整高度
      element.addEventListener('input', autoResize);
    }

    // 为每个元素添加事件监听器
    element.addEventListener(eventType, debounce(function() {
      const storageKey = this.getAttribute('data-storage-key');
      const storageArea = this.getAttribute('data-storage-area');

      if (storageKey && storageArea) {
        // 根据元素类型获取正确的值
        let value;
        if (this.type === 'checkbox') {
          value = this.checked;
        } else if (this.type === 'radio') {
          value = this.value;
        } else {
          value = this.value;
        }
        saveToStorage(storageArea, storageKey, value, this);
      }
    }, 500));

    // 为 checkbox 添加 change 事件监听器（立即保存，不需要防抖）
    if (element.type === 'checkbox') {
      element.addEventListener('change', function() {
        const storageKey = this.getAttribute('data-storage-key');
        const storageArea = this.getAttribute('data-storage-area');

        if (storageKey && storageArea) {
          saveToStorage(storageArea, storageKey, this.checked, this);
        }
      });
    }
  });
}

// 通用的存储函数
function saveToStorage(storageArea, key, value, element) {
  chrome.storage.local.get(storageArea, function(result) {
    const data = result[storageArea] || {};
    data[key] = value;

    // 特殊处理：同步更新旧字段以保持兼容性
    if (storageArea === 'cloudConfig') {
      if (key === 'cloudDbEnabled') {
        data.enabled = value; // 同步更新旧字段
      } else if (key === 'cloudDualWrite') {
        data.dualWrite = value; // 同步更新旧字段
      }
    }

    const saveData = {};
    saveData[storageArea] = data;

    chrome.storage.local.set(saveData, function() {
      console.log(`${key} Automatic save complete.`, value);

      // 特殊处理：当云数据库配置改变时，重新初始化 dataAccessLayer
      if (storageArea === 'cloudConfig' && (key === 'cloudDbEnabled' || key === 'cloudDualWrite')) {
        if (window.dataAccessLayer) {
          window.dataAccessLayer.init().then(() => {
            console.log('[options.js] dataAccessLayer 已重新初始化，当前模式:', window.dataAccessLayer.mode);
          }).catch(err => {
            console.error('[options.js] dataAccessLayer 重新初始化失败:', err);
          });
        }
      }

      // 显示保存状态
      const statusElement = element.nextElementSibling;
      if (statusElement && statusElement.classList.contains('save-status')) {
        statusElement.style.display = 'inline-block';

        // 2秒后隐藏状态提示
        setTimeout(() => {
          statusElement.style.display = 'none';
        }, 2000);
      }
    });
  });
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// 更新筛选器的语言选项
function updateLanguageFilter() {
  const languageFilter = document.getElementById('languageFilter');
  // 获取所有已存在的语言
  getAllWords().then(words => {
    const languages = new Set();
    words.forEach(word => {
      if (wordDetailsMap[word] && wordDetailsMap[word].language) {
        languages.add(wordDetailsMap[word].language);
      }
    });

    // 保存当前选中的值
    const currentValue = languageFilter.value;

    // 清空现有选项（除了"全部"）
    while (languageFilter.options.length > 1) {
      languageFilter.remove(1);
    }

    // 添加所有发现的语言
    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang;
      // 获取语言的显示名称
      option.textContent = getLanguageDisplayName(lang);
      languageFilter.appendChild(option);
    });

    // 恢复之前选中的值
    if (languages.has(currentValue)) {
      languageFilter.value = currentValue;
    }




  });
}

// 获取语言显示名称的辅助函数
function getLanguageDisplayName(code) {
  const languageNames = {
    'en': 'english',
    'de': 'german',
    'fr': 'french',
    'es': 'spanish',
    'it': 'italian',
    'ja': 'japanese',
    'ko': 'korean',
    'ru': 'russian'
  };
  return languageNames[code] || code;
}

// TTS设置
const enableWordTTS = document.getElementById('enableWordTTS');
const enableSentenceTTS = document.getElementById('enableSentenceTTS');

// 加载状态
chrome.storage.local.get(['enableWordTTS', 'enableSentenceTTS'], function(result) {
    // 默认都启用
    enableWordTTS.checked = result.enableWordTTS === undefined ? true : result.enableWordTTS;
    enableSentenceTTS.checked = result.enableSentenceTTS === undefined ? true : result.enableSentenceTTS;
});

// 监听变化
enableWordTTS.addEventListener('change', function(e) {
    chrome.storage.local.set({ enableWordTTS: e.target.checked });
});

enableSentenceTTS.addEventListener('change', function(e) {
    chrome.storage.local.set({ enableSentenceTTS: e.target.checked });
});


// 加载状态 初始化
chrome.storage.local.get('ttsConfig', function(result) {
  const ttsConfig = result.ttsConfig || {}; // 如果 ttsConfig 不存在，使用空对象
  //如果不存在，赋值local

  //这里设置好像没用，下面的倒是有用了。
  if (!ttsConfig) {
    ttsConfig = {
      wordTTSProvider: 'edge',
      sentenceTTSProvider: 'edge',
      wordAudioUrlTemplate: '',
      wordAudioUrlTemplate2: ''
    };
  }
  // 设置默认值


  //TTSTTS 选择器
  document.getElementById('wordTTSProvider').value = ttsConfig.wordTTSProvider || 'edge';
  // document.getElementById('sentenceTTSProvider').value = ttsConfig.sentenceTTSProvider || 'minimaxi';
  document.getElementById('sentenceTTSProvider').value = ttsConfig.sentenceTTSProvider || 'edge';

  document.getElementById('wordAudioUrlTemplate').value = ttsConfig.wordAudioUrlTemplate || '';
  document.getElementById('wordAudioUrlTemplate2').value = ttsConfig.wordAudioUrlTemplate2 || '';
});

// 监听变化
document.getElementById('wordTTSProvider').addEventListener('change', function(e) {
  chrome.storage.local.get(['ttsConfig'], function(result) {
    const ttsConfig = result.ttsConfig || {};
    ttsConfig.wordTTSProvider = e.target.value;
    chrome.storage.local.set({ ttsConfig: ttsConfig });
  });
});

document.getElementById('sentenceTTSProvider').addEventListener('change', function(e) {
  chrome.storage.local.get(['ttsConfig'], function(result) {
      const ttsConfig = result.ttsConfig || {};
      ttsConfig.sentenceTTSProvider = e.target.value;
      chrome.storage.local.set({ ttsConfig: ttsConfig });
  });
});

document.getElementById('wordAudioUrlTemplate').addEventListener('change', function(e) {
  chrome.storage.local.get(['ttsConfig'], function(result) {
      const ttsConfig = result.ttsConfig || {};
      ttsConfig.wordAudioUrlTemplate = e.target.value;
      chrome.storage.local.set({ ttsConfig: ttsConfig });
  });
});

document.getElementById('wordAudioUrlTemplate2').addEventListener('change', function(e) {
  chrome.storage.local.get(['ttsConfig'], function(result) {
      const ttsConfig = result.ttsConfig || {};
      ttsConfig.wordAudioUrlTemplate2 = e.target.value;
      chrome.storage.local.set({ ttsConfig: ttsConfig });
  });
});

// 添加switchTab函数的定义（如果还没有定义的话）
function switchTab(panelId) {
  // 隐藏所有面板
  const panels = document.querySelectorAll('.main-content > div');
  panels.forEach(panel => panel.classList.add('hidden'));

  // 移除所有按钮的active样式
  const tabButtons = document.querySelectorAll('.sidebar button');
  tabButtons.forEach(btn => btn.classList.remove('active'));

  // 控制webdavStatus的显示/隐藏
  const webdavStatusDiv = document.getElementById('webdavStatus');
  if (webdavStatusDiv) {
    if (panelId === 'panel-webdav') {
      webdavStatusDiv.style.display = 'block';
    } else {
      webdavStatusDiv.style.display = 'none';
    }
  }

  // 显示选中的面板
  document.getElementById(panelId).classList.remove('hidden');

  // 为对应的按钮添加active样式
  const buttonId = panelId.replace('panel-', 'tab-');
  document.getElementById(buttonId).classList.add('active');
}

// 添加消息监听器，接收来自popup页面的语言变化通知
chrome.runtime.onMessage.addListener(function(request) {
  if (request.action === 'languageChanged') {
    // 更新页面语言
    updatePageLanguage(request.language);
  }
});

// 初始化弹窗背景设置
function initTooltipBackgroundSettings() {
  // 获取DOM元素
  const enableTooltipBg = document.getElementById('enableTooltipBg');
  const bgTypeDefault = document.getElementById('bgTypeDefault');
  const bgTypeCustom = document.getElementById('bgTypeCustom');
  const customBgSection = document.getElementById('customBgSection');
  const customBgFile = document.getElementById('customBgFile');
  const customBgPreview = document.getElementById('customBgPreview');
  const defaultBgTypeSection = document.getElementById('defaultBgTypeSection');
  const defaultBackgroundImage = document.getElementById('defaultBackgroundImage');
  const defaultBackgroundSvg = document.getElementById('defaultBackgroundSvg');
  const defaultBackgroundVideo = document.getElementById('defaultBackgroundVideo');
  const defaultBackgroundSpecific = document.getElementById('defaultBackgroundSpecific');
  const specificBgPreviewSection = document.getElementById('specificBgPreviewSection');
  const builtInBgGallery = document.getElementById('builtInBgGallery');

  // 获取弹窗主题模式选择元素
  const tooltipThemeAuto = document.getElementById('tooltipThemeAuto');
  const tooltipThemeLight = document.getElementById('tooltipThemeLight');
  const tooltipThemeDark = document.getElementById('tooltipThemeDark');

  // 从存储中加载设置
  chrome.storage.local.get(['tooltipBackground', 'tooltipThemeMode'], function(result) {
    const bgSettings = result.tooltipBackground || { enabled: true, useCustom: false, defaultType: 'svg' };
    const themeMode = result.tooltipThemeMode || 'auto';

    // 设置控件状态
    enableTooltipBg.checked = bgSettings.enabled !== false;

    // 设置弹窗主题模式 auto
    if (themeMode === 'light') {
      tooltipThemeLight.checked = true;
    } else if (themeMode === 'dark') {
      tooltipThemeDark.checked = true;
    } else {
      tooltipThemeAuto.checked = true;
    }

    if (bgSettings.useCustom) {
      bgTypeCustom.checked = true;
      customBgSection.style.display = 'block';
      defaultBgTypeSection.style.display = 'none';
      specificBgPreviewSection.style.display = 'none';

      // 只在选中自定义背景时显示预览
      if (bgSettings.customFile) {
        showFilePreview(bgSettings.customFile);
      }
    } else {
      bgTypeDefault.checked = true;
      defaultBgTypeSection.style.display = 'block';
      customBgSection.style.display = 'none'; // 隐藏自定义背景区域

      // 设置默认背景类型
      if (bgSettings.defaultType === 'image') {
        defaultBackgroundImage.checked = true;
        specificBgPreviewSection.style.display = 'none';
      } else if (bgSettings.defaultType === 'svg') {
        defaultBackgroundSvg.checked = true;
        specificBgPreviewSection.style.display = 'none';
      } else if (bgSettings.defaultType === 'video') {
        defaultBackgroundVideo.checked = true;
        specificBgPreviewSection.style.display = 'none';
      } else if (bgSettings.defaultType === 'specific') {
        defaultBackgroundSpecific.checked = true;
        specificBgPreviewSection.style.display = 'block';
        // 加载内置背景预览
        loadBuiltInBackgrounds(bgSettings.specificBgPath);
      } else {
        // 默认选中SVG
        defaultBackgroundSvg.checked = true;
        specificBgPreviewSection.style.display = 'none';
      }
    }
  });

  // 添加事件监听器 - 背景类型切换
  bgTypeDefault.addEventListener('change', function() {
    // 显示默认背景类型选择区域，隐藏自定义背景区域
    defaultBgTypeSection.style.display = 'block';
    customBgSection.style.display = 'none';
    // 自动保存设置
    saveBackgroundSettings();
  });

  bgTypeCustom.addEventListener('change', function() {
    if (this.checked) {
      customBgSection.style.display = 'block';
      defaultBgTypeSection.style.display = 'none';
      specificBgPreviewSection.style.display = 'none';

      // 显示自定义背景预览（如果有）
      chrome.storage.local.get(['tooltipBackground'], function(result) {
        const bgSettings = result.tooltipBackground || {};
        if (bgSettings.customFile) {
          showFilePreview(bgSettings.customFile);
        }
      });
    }
    // 自动保存设置
    saveBackgroundSettings();
  });

  // 添加默认背景类型选择事件监听器
  defaultBackgroundImage.addEventListener('change', function() {
    specificBgPreviewSection.style.display = 'none';
    // 自动保存设置
    saveBackgroundSettings();
  });

  defaultBackgroundSvg.addEventListener('change', function() {
    specificBgPreviewSection.style.display = 'none';
    // 自动保存设置
    saveBackgroundSettings();
  });

  defaultBackgroundVideo.addEventListener('change', function() {
    specificBgPreviewSection.style.display = 'none';
    // 自动保存设置
    saveBackgroundSettings();
  });

  defaultBackgroundSpecific.addEventListener('change', function() {
    if (this.checked) {
      specificBgPreviewSection.style.display = 'block';
      // 加载内置背景预览
      chrome.storage.local.get(['tooltipBackground'], function(result) {
        const bgSettings = result.tooltipBackground || {};
        loadBuiltInBackgrounds(bgSettings.specificBgPath);
      });
    }
    // 自动保存设置
    saveBackgroundSettings();
  });

  // 添加启用背景开关事件监听器
  enableTooltipBg.addEventListener('change', function() {
    // 自动保存设置
    saveBackgroundSettings();
  });

  // 添加弹窗主题模式选择事件监听器
  tooltipThemeAuto.addEventListener('change', function() {
    if (this.checked) {
      saveTooltipThemeMode('auto');
    }
  });

  tooltipThemeLight.addEventListener('change', function() {
    if (this.checked) {
      saveTooltipThemeMode('light');
    }
  });

  tooltipThemeDark.addEventListener('change', function() {
    if (this.checked) {
      saveTooltipThemeMode('dark');
    }
  });

  // 图片压缩函数
  function compressImage(file, maxSizeMB, callback) {
    // 对于GIF，我们不进行压缩，因为Canvas会丢失动画
    // 如果GIF太大，直接返回null表示无法压缩
    if (file.type === 'image/gif') {
      console.log("GIF图片无法有效压缩，检查是否在大小限制内");

      // 如果GIF已经在大小限制内，直接返回原始文件
      if (file.size / 1024 / 1024 <= maxSizeMB) {
        const reader = new FileReader();
        reader.onload = function(e) {
          callback(e.target.result);
        };
        reader.readAsDataURL(file);
      } else {
        // GIF太大，无法压缩
        callback(null);
      }
      return;
    }

    // 非GIF图片的压缩处理
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        let quality = 0.9; // 初始质量
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');

        // 计算新尺寸，保持宽高比
        let width = img.width;
        let height = img.height;

        // 如果图片尺寸很大，先缩小尺寸
        const MAX_DIMENSION = 1920; // 最大尺寸限制
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.floor(height * (MAX_DIMENSION / width));
            width = MAX_DIMENSION;
          } else {
            width = Math.floor(width * (MAX_DIMENSION / height));
            height = MAX_DIMENSION;
          }
          console.log(`图片尺寸过大，调整为: ${width}x${height}`);
        }

        canvas.width = width;
        canvas.height = height;

        // 绘制图像
        ctx.drawImage(img, 0, 0, width, height);

        // 对于其他图片格式，尝试压缩
        let dataUrl = canvas.toDataURL(file.type, quality);

        // 检查压缩后的大小
        let compressedSize = dataUrl.length / 1024 / 1024; // 估算大小（MB）
        console.log(`压缩后大小: ${compressedSize.toFixed(2)}MB, 质量: ${quality}`);

        // 如果仍然太大，继续降低质量
        while (compressedSize > maxSizeMB && quality > 0.1) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL(file.type, quality);
          compressedSize = dataUrl.length / 1024 / 1024;
          console.log(`再次压缩: ${compressedSize.toFixed(2)}MB, 质量: ${quality}`);
        }

        // 如果压缩后仍然太大，返回null
        if (compressedSize > maxSizeMB) {
          console.log("即使压缩到最低质量，图片仍然太大");
          callback(null);
        } else {
          callback(dataUrl);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 文件上传处理
  customBgFile.addEventListener('change', function() {
    if (this.files && this.files[0]) {
      const file = this.files[0];
      const fileSize = file.size / 1024 / 1024; // 文件大小（MB）
      const maxSize = 8; // 最大允许大小（MB）

      console.log("上传文件类型:", file.type);
      console.log("上传文件大小:", fileSize.toFixed(2) + "MB");

      // 显示处理消息
      const processMsg = document.createElement('div');
      processMsg.textContent = '正在处理文件...';
      processMsg.style.color = 'blue';
      processMsg.style.marginTop = '10px';
      processMsg.style.fontWeight = 'bold';
      customBgFile.parentNode.appendChild(processMsg);

      if (fileSize > maxSize) {
        // 文件过大，尝试压缩
        console.log("文件过大，尝试压缩...");

        if (file.type.startsWith('image/')) {
          processMsg.textContent = '文件过大，正在压缩...';
          processMsg.style.color = 'orange';

          // 压缩图片
          compressImage(file, maxSize, function(compressedDataUrl) {
            // 移除处理消息
            processMsg.remove();

            if (!compressedDataUrl) {
              // 压缩失败
              alert(`无法压缩文件到${maxSize}MB以下。对于GIF动画，请上传更小的文件。`);
              return;
            }

            // 检查压缩后的大小
            const compressedSize = compressedDataUrl.length / 1024 / 1024;
            console.log("压缩后大小:", compressedSize.toFixed(2) + "MB");

            // 显示压缩后的预览
            showFilePreview(compressedDataUrl);

            // 自动保存设置
            saveBackgroundSettingsWithCustomFile(compressedDataUrl);
          });
        } else {
          // 移除处理消息
          processMsg.remove();
          alert(`文件过大（${fileSize.toFixed(2)}MB），超过了${maxSize}MB的限制。请上传更小的文件。`);
        }
        return;
      }

      // 文件大小在限制范围内，正常处理
      const reader = new FileReader();

      reader.onload = function(e) {
        const fileUrl = e.target.result;

        // 检查文件URL大小
        const urlSize = fileUrl.length / 1024 / 1024; // 估算大小（MB）
        console.log("Data URL大小:", urlSize.toFixed(2) + "MB");

        if (urlSize > maxSize) {
          // 移除处理消息
          processMsg.remove();

          // 尝试压缩
          if (file.type.startsWith('image/')) {
            const compressMsg = document.createElement('div');
            compressMsg.textContent = '文件数据过大，正在压缩...';
            compressMsg.style.color = 'orange';
            compressMsg.style.marginTop = '10px';
            compressMsg.style.fontWeight = 'bold';
            customBgFile.parentNode.appendChild(compressMsg);

            // 压缩图片
            compressImage(file, maxSize, function(compressedDataUrl) {
              // 移除压缩消息
              compressMsg.remove();

              if (!compressedDataUrl) {
                // 压缩失败
                alert(`无法压缩文件到${maxSize}MB以下。对于GIF动画，请上传更小的文件。`);
                return;
              }

              // 检查压缩后的大小
              const compressedSize = compressedDataUrl.length / 1024 / 1024;
              console.log("压缩后大小:", compressedSize.toFixed(2) + "MB");

              // 显示压缩后的预览
              showFilePreview(compressedDataUrl);

              // 自动保存设置
              saveBackgroundSettingsWithCustomFile(compressedDataUrl);
            });
          } else {
            alert(`转换后的文件数据过大（约${urlSize.toFixed(2)}MB），超过了${maxSize}MB的限制。请上传更小的文件。`);
          }
          return;
        }

        // 移除处理消息
        processMsg.remove();

        // 显示预览
        showFilePreview(fileUrl);

        // 自动保存设置
        saveBackgroundSettingsWithCustomFile(fileUrl);
      };

      reader.readAsDataURL(file);
    }
  });

  // 自动保存背景设置函数
  function saveBackgroundSettings() {
    // 先获取当前存储的设置，以便保留自定义背景文件数据
    chrome.storage.local.get(['tooltipBackground'], function(result) {
      const currentSettings = result.tooltipBackground || {};
      console.log("当前设置:", currentSettings);

      // 确定默认背景类型
      let defaultType = 'svg'; // 默认值
      if (defaultBackgroundImage.checked) {
        defaultType = 'image';
      } else if (defaultBackgroundSvg.checked) {
        defaultType = 'svg';
      } else if (defaultBackgroundVideo.checked) {
        defaultType = 'video';
      } else if (defaultBackgroundSpecific.checked) {
        defaultType = 'specific';
      }

      // 创建新的设置对象
      const settings = {
        enabled: enableTooltipBg.checked,
        useCustom: bgTypeCustom.checked,
        // 保留之前的自定义文件数据，即使当前未选择自定义背景
        customFile: currentSettings.customFile,
        // 添加默认背景类型设置
        defaultType: defaultType,
        // 保留指定的背景路径
        specificBgPath: currentSettings.specificBgPath
      };

      // 无论是否选择了自定义背景，只要有预览内容，就更新文件数据
      // 这样即使用户选择了默认皮肤，编辑自定义壁纸后也会保存
      if (customBgPreview.querySelector('img, video')) {
        const mediaElement = customBgPreview.querySelector('img, video');
        settings.customFile = mediaElement.src;

        // 检查文件URL大小
        const urlSize = settings.customFile.length / 1024 / 1024; // 估算大小（MB）
        console.log("保存的Data URL大小:", urlSize.toFixed(2) + "MB");

        const maxSize = 8; // 最大允许大小（MB）
        if (urlSize > maxSize) {
          alert(`文件数据过大（约${urlSize.toFixed(2)}MB），超过了${maxSize}MB的限制，无法保存。请上传更小的文件。`);

          // 显示保存失败消息
          const saveMsg = document.createElement('div');
          saveMsg.textContent = '保存失败：文件过大';
          saveMsg.style.color = 'red';
          saveMsg.style.marginTop = '10px';
          saveMsg.style.fontWeight = 'bold';

          // 添加到自动保存提示后面
          const autoSaveHint = document.querySelector('#panel-tooltip-bg-settings div[style*="margin-top: 10px; margin-bottom: 10px;"]');
          if (autoSaveHint) {
            autoSaveHint.parentNode.insertBefore(saveMsg, autoSaveHint.nextSibling);
          } else {
            // 如果找不到自动保存提示，添加到预览区域后面
            customBgPreview.parentNode.appendChild(saveMsg);
          }

          // 3秒后移除消息
          setTimeout(() => {
            saveMsg.remove();
          }, 3000);

          return;
        }
      }

      // 保存到存储
      chrome.storage.local.set({ tooltipBackground: settings }, function() {
        if (chrome.runtime.lastError) {
          console.error("保存设置时出错:", chrome.runtime.lastError);
        } else {
          console.log("设置已成功保存");

          // 通知所有内容脚本清除背景设置缓存
          chrome.tabs.query({}, function(tabs) {
            tabs.forEach(function(tab) {
              chrome.tabs.sendMessage(tab.id, { action: "clearBackgroundSettingsCache" })
                .catch(err => console.log("无法发送消息到标签页:", tab.id, err));
            });
          });
        }
      });
    });
  }

  // 自定义文件上传后的保存函数
  function saveBackgroundSettingsWithCustomFile(fileUrl) {
    // 先获取当前存储的设置
    chrome.storage.local.get(['tooltipBackground'], function(result) {
      const currentSettings = result.tooltipBackground || {};

      // 创建新的设置对象
      const settings = {
        enabled: enableTooltipBg.checked,
        useCustom: bgTypeCustom.checked,
        customFile: fileUrl, // 使用新上传的文件URL
        defaultType: defaultBackgroundImage.checked ? 'image' : 'video'
      };

      // 保存到存储
      chrome.storage.local.set({ tooltipBackground: settings }, function() {
        if (chrome.runtime.lastError) {
          console.error("保存设置时出错:", chrome.runtime.lastError);
        } else {
          console.log("设置已成功保存");

          // 通知所有内容脚本清除背景设置缓存
          chrome.tabs.query({}, function(tabs) {
            tabs.forEach(function(tab) {
              chrome.tabs.sendMessage(tab.id, { action: "clearBackgroundSettingsCache" })
                .catch(err => console.log("无法发送消息到标签页:", tab.id, err));
            });
          });
        }
      });
    });
  }

  // 显示文件预览
  function showFilePreview(fileUrl) {
    // 清空预览区域
    const previewContainer = customBgPreview.querySelector('div');
    previewContainer.innerHTML = '';

    // 创建预览元素
    const fileExt = getFileExtension(fileUrl);

    if (['mp4', 'webm', 'ogg'].includes(fileExt)) {
      // 视频文件
      const video = document.createElement('video');
      video.src = fileUrl;
      video.controls = true;
      video.autoplay = false;
      video.muted = true;
      video.style.maxWidth = '100%';
      video.style.maxHeight = '200px';
      previewContainer.appendChild(video);
    } else {
      // 图片文件
      const img = document.createElement('img');
      img.src = fileUrl;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '200px';
      previewContainer.appendChild(img);
    }

    // 显示预览区域
    customBgPreview.style.display = 'block';
  }

  // 获取文件扩展名
  function getFileExtension(url) {
    // 处理 data URL
    if (url.startsWith('data:')) {
      const mimeType = url.split(',')[0].split(':')[1].split(';')[0];
      if (mimeType.startsWith('video/')) {
        return mimeType.split('/')[1];
      } else if (mimeType === 'image/gif') {
        return 'gif'; // 正确识别 GIF 格式
      } else if (mimeType === 'image/jpeg') {
        return 'jpeg'; // 正确识别 JPEG 格式
      } else if (mimeType === 'image/svg+xml') {
        return 'svg'; // 正确识别 SVG 格式
      } else {
        return 'png'; // 默认图片扩展名
      }
    }

    // 处理普通 URL
    return url.split('.').pop().toLowerCase();
  }

  // 加载内置背景预览
  function loadBuiltInBackgrounds(selectedPath) {
    // 清空预览区域
    builtInBgGallery.innerHTML = '';

    // tg_png 目录下的所有 JPG 图片文件名
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

    // 定义所有内置背景资源
    const builtInBackgrounds = [
      // 原有的PNG图片
      { type: 'image', path: 'src/service/image/pattern.png', name: 'Pattern 1' },
      { type: 'image', path: 'src/service/image/pattern2.png', name: 'Pattern 2' },
      { type: 'image', path: 'src/service/image/pattern3.png', name: 'Pattern 3' },
      // tg_png 目录下的 JPG 图片
      ...tgPngFiles.map((filename, i) => ({
        type: 'image',
        path: `src/service/image/tg_png/${filename}`,
        name: filename.replace('.jpg', '').replace('-scaled', '')
      })),
      // SVG图案
      ...Array.from({ length: 33 }, (_, i) => ({
        type: 'svg',
        path: `src/service/image/tg/pattern-${i + 1}.svg`,
        name: `SVG ${i + 1}`
      })),
      // 视频
      { type: 'video', path: 'src/service/videos/kawai.mp4', name: 'Kawai Video' }
    ];

    // 创建预览项
    builtInBackgrounds.forEach(bg => {
      const item = document.createElement('div');
      item.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 220px;
        padding: 10px;
        border: 2px solid ${selectedPath === bg.path ? 'var(--primary-color)' : 'var(--border-color)'};
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 15px;
      `;

      // 创建预览元素
      const preview = document.createElement('div');
      preview.style.cssText = `
        width: 200px;
        height: 300px;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
        background: var(--card-background);
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      if (bg.type === 'video') {
        const video = document.createElement('video');
        video.src = chrome.runtime.getURL(bg.path);
        video.muted = true;
        video.loop = true;
        video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        video.addEventListener('mouseenter', () => video.play());
        video.addEventListener('mouseleave', () => video.pause());
        preview.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = chrome.runtime.getURL(bg.path);
        img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        preview.appendChild(img);
      }

      // 创建名称标签
      const label = document.createElement('div');
      label.textContent = bg.name;
      label.style.cssText = `
        font-size: 12px;
        text-align: center;
        color: var(--text-primary);
        margin-bottom: 8px;
      `;

      // 创建选择按钮
      const selectBtn = document.createElement('button');
      selectBtn.textContent = selectedPath === bg.path ? '已选择' : '选择';
      selectBtn.style.cssText = `
        padding: 4px 12px;
        font-size: 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        background-color: ${selectedPath === bg.path ? 'var(--success-color)' : 'var(--primary-color)'};
        color: white;
      `;

      // 点击选择
      const selectBackground = () => {
        // 保存选择
        chrome.storage.local.get(['tooltipBackground'], function(result) {
          const settings = result.tooltipBackground || {};
          settings.specificBgPath = bg.path;
          chrome.storage.local.set({ tooltipBackground: settings }, function() {
            console.log('已选择背景:', bg.path);
            // 重新加载预览以更新选中状态
            loadBuiltInBackgrounds(bg.path);

            // 通知内容脚本清除缓存
            chrome.tabs.query({}, function(tabs) {
              tabs.forEach(function(tab) {
                chrome.tabs.sendMessage(tab.id, { action: "clearBackgroundSettingsCache" })
                  .catch(err => console.log("无法发送消息到标签页:", tab.id));
              });
            });
          });
        });
      };

      selectBtn.addEventListener('click', selectBackground);
      item.addEventListener('click', selectBackground);

      // 悬停效果
      item.addEventListener('mouseenter', () => {
        if (selectedPath !== bg.path) {
          item.style.borderColor = 'var(--primary-color)';
          item.style.transform = 'translateY(-2px)';
        }
      });
      item.addEventListener('mouseleave', () => {
        if (selectedPath !== bg.path) {
          item.style.borderColor = 'var(--border-color)';
          item.style.transform = 'translateY(0)';
        }
      });

      item.appendChild(preview);
      item.appendChild(label);
      item.appendChild(selectBtn);
      builtInBgGallery.appendChild(item);
    });
  }

  // 保存弹窗主题模式的函数
  function saveTooltipThemeMode(mode) {
    chrome.storage.local.set({ tooltipThemeMode: mode }, function() {
      if (chrome.runtime.lastError) {
        console.error("保存弹窗主题模式时出错:", chrome.runtime.lastError);
      } else {
        console.log("弹窗主题模式已保存:", mode);

        // 通知所有内容脚本更新弹窗主题模式
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(function(tab) {
            chrome.tabs.sendMessage(tab.id, { action: "updateTooltipThemeMode", mode: mode })
              .catch(err => console.log("无法发送消息到标签页:", tab.id, err));
          });
        });
      }
    });
  }

  // 添加菜单点击事件
  document.getElementById('menu-tooltip-bg').addEventListener('click', function() {
    this.classList.toggle('active');
    const submenu = document.getElementById('submenu-tooltip-bg');
    this.querySelector('.arrow').innerHTML = '▶';
  });

  // 添加标签页切换事件
  document.getElementById('tab-tooltip-bg-settings').addEventListener('click', function() {
    switchTab('panel-tooltip-bg-settings');
  });

  // 添加自定义胶囊标签页切换事件
  document.getElementById('tab-custom-capsules').addEventListener('click', function() {
    switchTab('panel-custom-capsules');
  });

  // 添加已知句子动效标签页切换事件
  document.getElementById('tab-known-sentence-animation').addEventListener('click', function() {
    switchTab('panel-known-sentence-animation');
  });
}












/**
 * 调用 background 脚本获取 OhMyGPT Token。
 * @param {string} code - 用于获取 Token 的代码。
 * @returns {Promise<object>} - 返回一个 Promise，解析为 API 的响应对象 { success: boolean, data?: any, error?: string }。
 */
function callOhMyGptGetToken(code) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'ohMyGptGetToken',
        code: code
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("调用 ohMyGptGetToken 时出错:", chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log("收到 ohMyGptGetToken 响应:", response);
          resolve(response);
        }
      }
    );
  });
}

/**
 * 调用 background 脚本为 OhMyGPT 用户增加天数。
 * @param {string} userId - OhMyGPT 用户 ID。
 * @param {string} token - OhMyGPT 认证 Token。
 * @returns {Promise<object>} - 返回一个 Promise，解析为 API 的响应对象 { success: boolean, data?: any, error?: string }。
 */
 function callOhMyGptAddDays(userId, token) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'ohMyGptAddDays',
        userId: userId,
        token: token
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("调用 ohMyGptAddDays 时出错:", chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log("收到 ohMyGptAddDays 响应:", response);
          resolve(response);
        }
      }
    );
  });
}

/**
 * 调用 background 脚本发送 OhMyGPT Dollar。
 * @param {string} token - OhMyGPT 认证 Token。
 * @param {number} amount - 发送的金额。
 * @returns {Promise<object>} - 返回一个 Promise，解析为 API 的响应对象 { success: boolean, data?: any, error?: string }。
 */
 function callOhMyGptSendDollar(token, amount) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'ohMyGptSendDollar',
        token: token,
        amount: amount
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("调用 ohMyGptSendDollar 时出错:", chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log("收到 ohMyGptSendDollar 响应:", response);
          resolve(response);
        }
      }
    );
  });
}

/**
 * 调用 background 脚本获取 OhMyGPT 用户的剩余天数。
 * @param {string} userId - OhMyGPT 用户 ID。
 * @returns {Promise<object>} - 返回一个 Promise，解析为 API 的响应对象 { success: boolean, data?: any, error?: string }。
 */
 function callOhMyGptGetDays(userId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: 'ohMyGptGetDays',
        userId: userId
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("调用 ohMyGptGetDays 时出错:", chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log("收到 ohMyGptGetDays 响应:", response);
          resolve(response);
        }
      }
    );
  });
}

// 你可以在其他需要调用这些 API 的地方导入并使用这些函数
// 例如:
// import { callOhMyGptGetToken, callOhMyGptGetDays } from './service/a0_isOMG.js';
//
// async function exampleUsage() {
//   const tokenResult = await callOhMyGptGetToken("SOME_CODE");
//   if (tokenResult.success) {
//     console.log("Token 获取成功:", tokenResult.data);
//     const daysResult = await callOhMyGptGetDays("USER_ID_HERE");
//     if (daysResult.success) {
//       console.log("剩余天数:", daysResult.data);
//     } else {
//       console.error("获取天数失败:", daysResult.error);
//     }
//   } else {
//     console.error("获取 Token 失败:", tokenResult.error);
//   }
// }

  // 新增：WebDAV 相关元素
  const webdavPanel = document.getElementById("panel-webdav");
  const webdavUrlInput = document.getElementById("webdavUrl");
  const webdavUsernameInput = document.getElementById("webdavUsername");
  const webdavPasswordInput = document.getElementById("webdavPassword");
  const webdavUploadSyncBtn = document.getElementById("webdavUploadSync");
  const webdavDownloadMergeBtn = document.getElementById("webdavDownloadMerge");
  const webdavDownloadReplaceBtn = document.getElementById("webdavDownloadReplace");
  const webdavUploadBackupBtn = document.getElementById("webdavUploadBackup");
  const webdavStatusDiv = document.getElementById("webdavStatus");

  // 单词库操作相关元素
  const clearLocalDbBtn = document.getElementById("clearLocalDbBtn");
  const resetPhrasesDbBtn = document.getElementById("resetPhrasesDbBtn");
  const clearLocalDbResult = document.getElementById("clearLocalDbResult");
  const resetPhrasesResult = document.getElementById("resetPhrasesResult");
  const webdavSettingsSyncBtn = document.getElementById("webdavSettingsSync");
  const webdavSettingsDownloadBtn = document.getElementById("webdavSettingsDownload");
  const webdavSettingsUploadBtn = document.getElementById("webdavSettingsUpload");

  // 新增：WebDAV 面板切换按钮
  const webdavTabBtn = document.getElementById("tab-webdav");


  // --- 初始化和事件监听器 ---

  // 确保 DOM 完全加载后再执行
  document.addEventListener("DOMContentLoaded", () => {
    // 初始化弹窗背景设置
    initTooltipBackgroundSettings();

    // ... (保留现有的 DOMContentLoaded 内容) ...

    // --- 新增 WebDAV 相关事件监听器 ---
    if (webdavTabBtn) {
      webdavTabBtn.addEventListener("click", () => switchTab("panel-webdav"));
    }
    if (webdavUploadSyncBtn) {
      webdavUploadSyncBtn.addEventListener("click", webdavUploadSync);
    }
    if (webdavDownloadMergeBtn) {
      webdavDownloadMergeBtn.addEventListener("click", webdavDownloadMerge);
    }
    if (webdavDownloadReplaceBtn) {
      webdavDownloadReplaceBtn.addEventListener("click", () => {
        if (confirm('⚠️ 警告：此操作将完全删除本地所有单词数据并用云端数据替换！此操作不可恢复！\n\n确定要继续吗？')) {
          webdavDownloadReplace();
        }
      });
    }
    if (webdavUploadBackupBtn) {
      webdavUploadBackupBtn.addEventListener("click", webdavUploadBackup);
    }

    if (webdavSettingsSyncBtn) {
      webdavSettingsSyncBtn.addEventListener("click", webdavSettingsSync);
    }

    if (webdavSettingsDownloadBtn) {
      webdavSettingsDownloadBtn.addEventListener("click", webdavSettingsDownload);
    }

    if (webdavSettingsUploadBtn) {
      webdavSettingsUploadBtn.addEventListener("click", webdavSettingsUpload);
    }



    // 单词库操作相关事件监听器
    if (clearLocalDbBtn) {
        clearLocalDbBtn.addEventListener("click", () => {
            if (confirm(translate('confirmClearDatabase'))) { // 使用国际化确认消息
                clearLocalDatabase();
            }
      });
    }

    if (resetPhrasesDbBtn) {
        resetPhrasesDbBtn.addEventListener("click", () => {
            if (confirm(translate('confirmResetPhrasesDb'))) {
                resetPhrasesDatabase();
            }
        });
    }

    // 为 WebDAV 凭据设置自动保存
    if (webdavUrlInput) setupAutoSave(webdavUrlInput);
    if (webdavUsernameInput) setupAutoSave(webdavUsernameInput);
    if (webdavPasswordInput) setupAutoSave(webdavPasswordInput);





    // 加载 WebDAV 凭据
    if (webdavUrlInput && typeof loadFromStorage === 'function') {
      loadFromStorage('syncConfig', 'webdavUrl', webdavUrlInput);
  } else if (webdavUrlInput) {
      // 备用方案：如果 loadFromStorage 不可用或不支持区域，直接加载
      chrome.storage.local.get(['syncConfig'], (result) => {
          if (result.syncConfig && result.syncConfig.webdavUrl) {
              webdavUrlInput.value = result.syncConfig.webdavUrl;
              console.log('Loaded WebDAV URL from storage.');
          }
      });
  }

  if (webdavUsernameInput && typeof loadFromStorage === 'function') {
      loadFromStorage('syncConfig', 'webdavUsername', webdavUsernameInput);
  } else if (webdavUsernameInput) {
      chrome.storage.local.get(['syncConfig'], (result) => {
          if (result.syncConfig && result.syncConfig.webdavUsername) {
              webdavUsernameInput.value = result.syncConfig.webdavUsername;
              console.log('Loaded WebDAV Username from storage.');
          }
      });
  }

  if (webdavPasswordInput && typeof loadFromStorage === 'function') {
      loadFromStorage('syncConfig', 'webdavPassword', webdavPasswordInput);
  } else if (webdavPasswordInput) {
      // 注意：密码通常不直接加载显示，但如果需要，可以这样做
      chrome.storage.local.get(['syncConfig'], (result) => {
          if (result.syncConfig && result.syncConfig.webdavPassword) {
              webdavPasswordInput.value = result.syncConfig.webdavPassword;
               console.log('Loaded WebDAV Password from storage.');
          }
      });
  }

  // 为 WebDAV 密码输入框设置密码类型和鼠标悬浮显示功能
  if (webdavPasswordInput) {
      webdavPasswordInput.type = 'password';
      // 添加鼠标悬浮事件显示明文
      webdavPasswordInput.addEventListener('mouseenter', function() {
          this.type = 'text';
      });
      // 鼠标离开时恢复为密码形式
      webdavPasswordInput.addEventListener('mouseleave', function() {
          this.type = 'password';
      });
  }



    // ... (保留现有的 DOMContentLoaded 结束部分) ...
  });



  // --- 新增 WebDAV 功能函数 ---

  // 辅助函数：设置WebDAV状态并确保显示
  function setWebdavStatus(message, color = 'black') {
    if (webdavStatusDiv) {
      webdavStatusDiv.textContent = message;
      webdavStatusDiv.style.color = color;
      webdavStatusDiv.style.display = 'block';
    }
  }

  function getWebDAVClient() {
      const url = webdavUrlInput.value.trim();
      const username = webdavUsernameInput.value.trim();
      const password = webdavPasswordInput.value; // 密码不清空格

      if (!url || !username || !password) {
          setWebdavStatus(translate('Account Missing, Scroll down to fill in . 上传失败，下拉填入你的账号'), 'red'); // 提示需要凭据
          return null;
      }

      try {
          // 使用 window.webdav 全局对象
          const client = window.webdav.createClient(url, {
              username: username,
              password: password,
              authType: window.webdav.AuthType.Password // 默认使用密码认证，可根据需要调整
          });
          setWebdavStatus(translate('webdavConnecting'), 'orange');
          return client;
      } catch (error) {
          console.error("Create WebDAV Client Failed:", error);
          setWebdavStatus(`${translate('webdavClientError')}: ${error.message}`, 'red');
          return null;
      }
  }

  async function ensureDirectoryExists(client, directoryPath) {
      try {
          await client.stat(directoryPath);
          // 目录已存在
      } catch (error) {
          // 404: 目录不存在; 409: 父目录不存在 (如坚果云返回 AncestorsNotFound)
          if (error.status === 404 || error.status === 409) {
              // 目录不存在，尝试创建
              try {
                  // 逐级创建目录
                  const parts = directoryPath.split('/').filter(p => p.length > 0);
                  let currentPath = '';
                  for (const part of parts) {
                      currentPath += '/' + part;
                      try {
                          await client.stat(currentPath);
                      } catch (statError) {
                           // 404 或 409 都表示需要创建目录
                           if (statError.status === 404 || statError.status === 409) {
                                console.log(`尝试创建目录: ${currentPath}`);
                                await client.createDirectory(currentPath);
                           } else {
                               throw statError; // 其他错误，抛出
                           }
                      }
                  }
                  console.log(`目录 ${directoryPath} 创建成功 (或已存在)`);
              } catch (createError) {
                  console.error(`创建目录 ${directoryPath} 失败:`, createError);
                  throw new Error(`${translate('webdavCreateDirError')} ${directoryPath}: ${createError.message}`);
              }
          } else {
              // 其他错误 (如权限问题)
              console.error(`检查目录 ${directoryPath} 时出错:`, error);
              throw new Error(`${translate('webdavCheckDirError')} ${directoryPath}: ${error.message}`);
          }
      }
  }


  // 1. 上传同步文件 (覆盖云端 /Lingkuma/Sync/sync_word.json)
  async function webdavUploadSync() {
      const client = getWebDAVClient();
      if (!client) return;

      webdavStatusDiv.textContent = translate('webdavFetchingLocalData');
      webdavStatusDiv.style.color = 'orange';

      // 使用 sendMessage 从 background 获取备份数据
      chrome.runtime.sendMessage({ action: "backupDatabase" }, async function(response) {
          if (response && response.success && response.data) {
              try {
                  const allWords = response.data;
                  const jsonData = JSON.stringify(allWords, null, 2); // 格式化 JSON
                  const syncFilePath = "/Lingkuma/Sync/sync_word.json";
                  const syncDir = "/Lingkuma/Sync";

                  webdavStatusDiv.textContent = translate('webdavUploadingSyncFile');
                  webdavStatusDiv.style.color = 'orange'; // 更新状态为上传中

                  await ensureDirectoryExists(client, syncDir); // 确保 Sync 目录存在
                  await client.putFileContents(syncFilePath, jsonData, { overwrite: true });

                  webdavStatusDiv.textContent = translate('webdavUploadSyncSuccess');
                  webdavStatusDiv.style.color = 'green';

              } catch (error) {
                  // 这个 catch 处理 ensureDirectoryExists 或 putFileContents 的错误
                  console.error("Upload Sync File Failed:", error);
                  webdavStatusDiv.textContent = `${translate('webdavUploadSyncError')}: ${error.message || error}`;
                  webdavStatusDiv.style.color = 'red';
              }
          } else {
              // 获取备份数据失败
              console.error("Get Backup Data from Background Failed:", response);
              webdavStatusDiv.textContent = translate('webdavFetchDataError'); // 需要添加这个翻译键
              webdavStatusDiv.style.color = 'red';
          }
      });
  }

  // 2. 下载合并文件 (合并到本地)
  async function webdavDownloadMerge() {
      const client = getWebDAVClient();
      if (!client) return;

      const syncFilePath = "/Lingkuma/Sync/sync_word.json";
      webdavStatusDiv.textContent = translate('webdavDownloadingSyncFile');
      webdavStatusDiv.style.color = 'orange';

      try {
          const fileContents = await client.getFileContents(syncFilePath, { format: "text" });
          const backupData = JSON.parse(fileContents);

          webdavStatusDiv.textContent = translate('webdavMergingData');

          // 发送消息到 background.js 进行增量合并处理
          chrome.runtime.sendMessage({ action: "mergeDatabase", data: backupData }, function(response) {
              if (response && response.success) {
                  const mergedCount = response.merged || 0;
                  const skippedCount = response.skipped || 0;
                  webdavStatusDiv.textContent = `${translate('webdavMergeSuccess')} - 合并: ${mergedCount}, 跳过: ${skippedCount}`;
                  webdavStatusDiv.style.color = 'green';
                  // 合并成功后刷新单词列表
                  applyFilters();
                  // 合并成功后重建词组数据库
                  chrome.runtime.sendMessage({ action: "resetPhrasesDatabase" }, function(phrasesResponse) {
                      if (phrasesResponse && phrasesResponse.success) {
                          console.log("词组数据库重建成功");
                      } else {
                          console.error("词组数据库重建失败:", phrasesResponse && phrasesResponse.error);
                      }
                  });
              } else {
                  const errorMsg = response && response.error ? response.error : translate('unknownError');
                  webdavStatusDiv.textContent = `${translate('webdavMergeError')}: ${errorMsg}`;
                  webdavStatusDiv.style.color = 'red';
                  console.error("Merge Database Failed:", errorMsg);
              }
          });

      } catch (error) {
           if (error.status === 404) {
               webdavStatusDiv.textContent = translate('webdavSyncFileNotFound');
               webdavStatusDiv.style.color = 'orange'; // 或者 red，取决于是否认为是错误
           } else {
              console.error("Download or Parse Sync File Failed:", error);
              webdavStatusDiv.textContent = `${translate('webdavDownloadSyncError')}: ${error.message || error}`;
              webdavStatusDiv.style.color = 'red';
           }
      }
  }

  // 2.5. 下载覆盖文件 (完全覆盖本地数据库)
  async function webdavDownloadReplace() {
      const client = getWebDAVClient();
      if (!client) return;

      const syncFilePath = "/Lingkuma/Sync/sync_word.json";
      webdavStatusDiv.textContent = translate('webdavDownloadingSyncFile');
      webdavStatusDiv.style.color = 'orange';

      try {
          const fileContents = await client.getFileContents(syncFilePath, { format: "text" });
          const backupData = JSON.parse(fileContents);

          webdavStatusDiv.textContent = translate('webdavReplacingData');

          // 发送消息到 background.js 进行完全覆盖处理
          chrome.runtime.sendMessage({ action: "restoreDatabase", data: backupData }, function(response) {
              if (response && response.success) {
                  webdavStatusDiv.textContent = translate('webdavReplaceSuccess');
                  webdavStatusDiv.style.color = 'green';
                  // 覆盖成功后刷新单词列表
                  applyFilters();
                  // 覆盖成功后重建词组数据库
                  chrome.runtime.sendMessage({ action: "resetPhrasesDatabase" }, function(phrasesResponse) {
                      if (phrasesResponse && phrasesResponse.success) {
                          console.log("词组数据库重建成功");
                      } else {
                          console.error("词组数据库重建失败:", phrasesResponse && phrasesResponse.error);
                      }
                  });
              } else {
                  const errorMsg = response && response.error ? response.error : translate('unknownError');
                  webdavStatusDiv.textContent = `${translate('webdavReplaceError')}: ${errorMsg}`;
                  webdavStatusDiv.style.color = 'red';
                  console.error("Replace Database Failed:", errorMsg);
              }
          });

      } catch (error) {
           if (error.status === 404) {
               webdavStatusDiv.textContent = translate('webdavSyncFileNotFound');
               webdavStatusDiv.style.color = 'orange'; // 或者 red，取决于是否认为是错误
           } else {
              console.error("Download or Parse Sync File Failed:", error);
              webdavStatusDiv.textContent = `${translate('webdavDownloadSyncError')}: ${error.message || error}`;
              webdavStatusDiv.style.color = 'red';
           }
      }
  }

  // 3. 上传日期备份文件 (到云端 /Backups/...)
  async function webdavUploadBackup() {
      const client = getWebDAVClient();
      if (!client) return;

      webdavStatusDiv.textContent = translate('webdavFetchingLocalData');
      webdavStatusDiv.style.color = 'orange';

      // 使用 sendMessage 从 background 获取备份数据
      chrome.runtime.sendMessage({ action: "backupDatabase" }, async function(response) {
        if (response && response.success && response.data) {
            try {
              const allWords = await response.data;
              const jsonData = JSON.stringify(allWords, null, 2);
              const timestamp = getCurrentDateTimeString(); // 获取 YYYYMMDD-HHMMSS 格式时间
              const backupFilename = `backup-words-${timestamp}.json`;
              const backupFilePath = `/Lingkuma/Backups/${backupFilename}`;
              const backupDir = "/Lingkuma/Backups";

              webdavStatusDiv.textContent = `${translate('webdavUploadingBackupFile')} ${backupFilename}`;

              await ensureDirectoryExists(client, backupDir); // 确保 Backups 目录存在
              await client.putFileContents(backupFilePath, jsonData, { overwrite: true }); // 通常备份不希望覆盖，但 WebDAV put 可能默认覆盖或需要检查

              webdavStatusDiv.textContent = translate('webdavUploadBackupSuccess');
              webdavStatusDiv.style.color = 'green';

          } catch (error) {
              console.error("Upload Date Backup File Failed:", error);
              webdavStatusDiv.textContent = `${translate('webdavUploadBackupError')}: ${error.message || error}`;
              webdavStatusDiv.style.color = 'red';
          }
        }
      });
    }

  // 4. 清空本地数据库
  function webdavClearDb() {
    webdavStatusDiv.textContent = translate('webdavClearingDb');
    webdavStatusDiv.style.color = 'orange';

    // 发送消息到 background.js 执行清空操作
    chrome.runtime.sendMessage({ action: "clearDatabase" }, function(response) {
        if (response && response.success) {
            webdavStatusDiv.textContent = translate('webdavClearDbSuccess');
            webdavStatusDiv.style.color = 'green';
            // 清空成功后刷新单词列表
            applyFilters(); // 使用空数据刷新
        } else {
             const errorMsg = response && response.error ? response.error : translate('unknownError');
             webdavStatusDiv.textContent = `${translate('webdavClearDbError')}: ${errorMsg}`;
             webdavStatusDiv.style.color = 'red';
             console.error("Clear Database Failed:", errorMsg);
        }
    });
  }

  // 单词库操作：清空本地数据库
  function clearLocalDatabase() {
    if (!clearLocalDbResult) return;

    clearLocalDbResult.textContent = translate('webdavClearingDb');
    clearLocalDbResult.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
    clearLocalDbResult.style.color = 'orange';
    clearLocalDbResult.style.display = 'block';

    // 发送消息到 background.js 执行清空操作
    chrome.runtime.sendMessage({ action: "clearDatabase" }, function(response) {
        if (response && response.success) {
            clearLocalDbResult.textContent = translate('webdavClearDbSuccess');
            clearLocalDbResult.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
            clearLocalDbResult.style.color = 'green';
            // 清空成功后刷新单词列表
            applyFilters(); // 使用空数据刷新
        } else {
             const errorMsg = response && response.error ? response.error : translate('unknownError');
             clearLocalDbResult.textContent = `${translate('webdavClearDbError')}: ${errorMsg}`;
             clearLocalDbResult.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
             clearLocalDbResult.style.color = 'red';
             console.error("Clear Database Failed:", errorMsg);
        }
    });
  }

  // 单词库操作：重置词组数据库
  function resetPhrasesDatabase() {
    if (!resetPhrasesResult) return;

    resetPhrasesResult.textContent = '正在重置词组数据库...';
    resetPhrasesResult.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
    resetPhrasesResult.style.color = 'orange';
    resetPhrasesResult.style.display = 'block';

    // 发送消息到 background.js 执行重置操作
    chrome.runtime.sendMessage({ action: "resetPhrasesDatabase" }, function(response) {
        if (response && response.success) {
            resetPhrasesResult.textContent = translate('resetPhrasesDbSuccess');
            resetPhrasesResult.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
            resetPhrasesResult.style.color = 'green';
        } else {
             const errorMsg = response && response.error ? response.error : translate('unknownError');
             resetPhrasesResult.textContent = `${translate('resetPhrasesDbError')}: ${errorMsg}`;
             resetPhrasesResult.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
             resetPhrasesResult.style.color = 'red';
             console.error("Reset Phrases Database Failed:", errorMsg);
        }
    });
  }


// 5. 上传配置到 WebDAV (覆盖云端 /Lingkuma/Settings/settings_sync.json)
async function webdavSettingsSync() {
    const client = getWebDAVClient();
    if (!client) return;

    webdavStatusDiv.textContent = translate('webdavFetchingLocalSettings'); // 需要添加翻译: 正在获取本地配置...
    webdavStatusDiv.style.color = 'orange';

    try {
        // 1. 获取本地 sync 和 local 存储数据
        const [syncData, localData] = await Promise.all([
            new Promise(resolve => chrome.storage.sync.get(null, resolve)),
            new Promise(resolve => chrome.storage.local.get(null, resolve))
        ]);

        const configData = {
            timestamp: new Date().toISOString(),
            settings: {
                sync: syncData,
                local: localData
            }
        };

        const jsonData = JSON.stringify(configData, null, 2);
        const settingsFilePath = "/Lingkuma/Settings/settings_sync.json";
        const settingsDir = "/Lingkuma/Settings";

        webdavStatusDiv.textContent = translate('webdavUploadingSettings'); // 需要添加翻译: 正在上传配置到 /Settings/settings_sync.json ...
        webdavStatusDiv.style.color = 'orange';

        // 2. 确保目录存在并上传
        await ensureDirectoryExists(client, settingsDir);
        await client.putFileContents(settingsFilePath, jsonData, { overwrite: true });

        webdavStatusDiv.textContent = translate('webdavUploadSettingsSuccess'); // 需要添加翻译: 配置上传成功！
        webdavStatusDiv.style.color = 'green';

    } catch (error) {
        console.error("Upload WebDAV Configuration Failed:", error);
        webdavStatusDiv.textContent = `${translate('webdavUploadSettingsError')}: ${error.message || error}`; // 需要添加翻译: 配置上传失败
        webdavStatusDiv.style.color = 'red';
    }
}

// 6. 从 WebDAV 下载配置并应用 (覆盖本地)
async function webdavSettingsDownload() {
    const client = getWebDAVClient();
    if (!client) return;

    const settingsFilePath = "/Lingkuma/Settings/settings_sync.json";
    webdavStatusDiv.textContent = translate('webdavDownloadingSettings'); // 需要添加翻译: 正在从 /Settings/settings_sync.json 下载配置...
    webdavStatusDiv.style.color = 'orange';

    try {
        // 1. 下载配置文件
        const fileContents = await client.getFileContents(settingsFilePath, { format: "text" });
        const backupData = JSON.parse(fileContents);

        // 2. 验证格式
        if (!backupData || !backupData.settings || (!backupData.settings.sync && !backupData.settings.local)) {
            throw new Error(translate('webdavInvalidSettingsFile')); // 需要添加翻译: 无效的配置文件格式
        }

        webdavStatusDiv.textContent = translate('webdavApplyingSettings'); // 需要添加翻译: 正在应用配置...
        webdavStatusDiv.style.color = 'orange';

        // 3. 还原配置 (使用 Promise.all 确保两者都完成或捕获错误)
        const restorePromises = [];
        if (backupData.settings.sync) {
            restorePromises.push(new Promise((resolve, reject) => {
                chrome.storage.sync.set(backupData.settings.sync, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(`Sync restore error: ${chrome.runtime.lastError.message}`));
                    } else {
                        resolve();
                    }
                });
            }));
        }
        if (backupData.settings.local) {
            restorePromises.push(new Promise((resolve, reject) => {
                chrome.storage.local.set(backupData.settings.local, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(`Local restore error: ${chrome.runtime.lastError.message}`));
                    } else {
                        resolve();
                    }
                });
            }));
        }

        await Promise.all(restorePromises);

        // 4. 成功提示并建议重启
        webdavStatusDiv.textContent = translate('webdavDownloadSettingsSuccess'); // 需要添加翻译: 配置下载并应用成功！将在重启插件后生效
        webdavStatusDiv.style.color = 'green';

        setTimeout(() => {
            if (confirm(translate('webdavConfirmReload'))) { // 需要添加翻译: 配置已恢复，需要重启插件才能完全生效。是否现在重启？
                chrome.runtime.reload();
            }
        }, 500);

    } catch (error) {
         if (error.status === 404) {
             webdavStatusDiv.textContent = translate('webdavSettingsFileNotFound'); // 需要添加翻译: 未在云端找到 /Settings/settings_sync.json 文件。
             webdavStatusDiv.style.color = 'orange'; // 或者 red
         } else {
            console.error("Download or Apply WebDAV Configuration Failed:", error);
            webdavStatusDiv.textContent = `${translate('webdavDownloadSettingsError')}: ${error.message || error}`; // 需要添加翻译: 下载或应用配置失败
            webdavStatusDiv.style.color = 'red';
         }
    }
}

// ... 现有的其他函数 ...

// 需要在 `_locales` 中添加以下键的翻译：
/*
"webdavSettings": { "message": "WebDAV 设置" },
"webdavCredentials": { "message": "WebDAV 凭据" },
"webdavUrlLabel": { "message": "URL:" },
"webdavUsernameLabel": { "message": "用户名:" },
"webdavPasswordLabel": { "message": "密码:" },
"webdavActions": { "message": "WebDAV 操作" },
"webdavUploadSyncBtn": { "message": "上传同步文件 (覆盖云端)" },
"webdavDownloadMergeBtn": { "message": "下载合并文件 (合并本地)" },
"webdavUploadBackupBtn": { "message": "上传日期备份文件 (到云端)" },
"webdavClearDbBtn": { "message": "清空本地数据库" },
"confirmClearDatabase": { "message": "确定要清空本地所有单词数据吗？此操作不可恢复！" },
"webdavCredentialsMissing": { "message": "请输入完整的 WebDAV URL、用户名和密码。" },
"webdavConnecting": { "message": "正在连接 WebDAV..." },
"webdavClientError": { "message": "创建 WebDAV 客户端时出错" },
"webdavFetchingLocalData": { "message": "正在获取本地数据..." },
"webdavUploadingSyncFile": { "message": "正在上传同步文件到 /Sync/sync_word.json ..." },
"webdavUploadSyncSuccess": { "message": "同步文件上传成功！" },
"webdavUploadSyncError": { "message": "上传同步文件失败" },
"webdavDownloadingSyncFile": { "message": "正在从 /Sync/sync_word.json 下载同步文件..." },
"webdavMergingData": { "message": "正在合并数据到本地数据库..." },
"webdavMergeSuccess": { "message": "数据合并成功！" },
"webdavMergeError": { "message": "合并数据失败" },
"webdavDownloadSyncError": { "message": "下载或解析同步文件失败" },
"webdavSyncFileNotFound": { "message": "未在云端找到 /Sync/sync_word.json 文件。" },
"webdavUploadingBackupFile": { "message": "正在上传备份文件:" },
"webdavUploadBackupSuccess": { "message": "日期备份文件上传成功！" },
"webdavUploadBackupError": { "message": "上传日期备份文件失败" },
"webdavClearingDb": { "message": "正在清空本地数据库..." },
"webdavClearDbSuccess": { "message": "本地数据库已清空！" },
"webdavClearDbError": { "message": "清空本地数据库失败" },
"unknownError": { "message": "发生未知错误" },
"webdavCreateDirError": { "message": "创建 WebDAV 目录失败:" },
"webdavCheckDirError": { "message": "检查 WebDAV 目录时出错:" },
"webdavFetchingLocalSettings": { "message": "正在获取本地配置..." },
"webdavUploadingSettings": { "message": "正在上传配置到 /Settings/settings_sync.json ..." },
"webdavUploadSettingsSuccess": { "message": "配置上传成功！" },
"webdavUploadSettingsError": { "message": "配置上传失败" },
"webdavDownloadingSettings": { "message": "正在从 /Settings/settings_sync.json 下载配置..." },
"webdavInvalidSettingsFile": { "message": "无效的配置文件格式" },
"webdavApplyingSettings": { "message": "正在应用配置..." },
"webdavDownloadSettingsSuccess": { "message": "配置下载并应用成功！将在重启插件后生效" },
"webdavConfirmReload": { "message": "配置已恢复，需要重启插件才能完全生效。是否现在重启？" },
"webdavSettingsFileNotFound": { "message": "未在云端找到 /Settings/settings_sync.json 文件。" },
"webdavDownloadSettingsError": { "message": "下载或应用配置失败" }
*/

// 确保在 setupAutoSave 中处理 syncConfig 存储区域
// (如果 saveToStorage/loadFromStorage 需要更新以支持新区域)
// ...

// 新增：上传带时间戳的配置备份到 WebDAV
async function webdavSettingsUpload() {
  const statusElement = document.getElementById('webdavStatus');
  statusElement.textContent = 'Preparing to Upload Settings Backup...';
  statusElement.style.color = 'orange';

  try {
    const client = await getWebDAVClient();
    if (!client) {
      statusElement.textContent = 'WebDAV Not Configured or Configuration Error.';
      statusElement.style.color = 'red';
      return;
    }

    // 1. 收集配置数据 (获取完整的 sync 和 local 存储数据)
    const [syncData, localData] = await Promise.all([
      new Promise(resolve => chrome.storage.sync.get(null, resolve)),
      new Promise(resolve => chrome.storage.local.get(null, resolve))
    ]);

    const configToBackup = {
      timestamp: new Date().toISOString(),
      settings: {
        sync: syncData,
        local: localData
      }
    };

    // 2. 生成带时间戳的文件名
    const timestamp = getCurrentDateTimeString(); // 复用现有函数
    const backupDir = '/Lingkuma/SettingsBackup/'; // 定义备份目录
    const filename = `Lingkuma_settings_backup_${timestamp}.json`;
    const fullPath = backupDir + filename;

    // 3. 确保目录存在
    await ensureDirectoryExists(client, backupDir); // 复用现有函数

    // 4. 上传文件
    statusElement.textContent = `Uploading ${filename} to ${backupDir}...`;
    const content = JSON.stringify(configToBackup, null, 2);
    // 注意：webdav-client 的 putFileContents 在成功时不一定返回 true，可能只在失败时抛出错误
    await client.putFileContents(fullPath, content, { overwrite: true });

    // 如果上面没有抛出错误，则认为上传成功
    statusElement.textContent = `Settings Backup ${filename} Uploaded Successfully to ${backupDir}!`;
    statusElement.style.color = 'green';

  } catch (error) {
    console.error('Upload Settings Backup Failed:', error);
    statusElement.textContent = `Upload Settings Backup Failed: ${error.message || error}`;
    statusElement.style.color = 'red';
  }
}

// 新增：多设备配置备份功能
// 设备配置映射
const deviceConfigs = {
  'pc': { name: 'PC', settingsDir: '/Lingkuma/Settings1/', backupDir: '/Lingkuma/SettingsBackup1/' },
  'iphone': { name: 'iPhone', settingsDir: '/Lingkuma/Settings2/', backupDir: '/Lingkuma/SettingsBackup2/' },
  'android': { name: 'Android', settingsDir: '/Lingkuma/Settings3/', backupDir: '/Lingkuma/SettingsBackup3/' },
  'laptop': { name: 'Laptop', settingsDir: '/Lingkuma/Settings4/', backupDir: '/Lingkuma/SettingsBackup4/' },
  'mac': { name: 'Mac', settingsDir: '/Lingkuma/Settings5/', backupDir: '/Lingkuma/SettingsBackup5/' }
};

// 获取配置数据的通用函数
async function getConfigData() {
  // 获取完整的 sync 和 local 存储数据
  const [syncData, localData] = await Promise.all([
    new Promise(resolve => chrome.storage.sync.get(null, resolve)),
    new Promise(resolve => chrome.storage.local.get(null, resolve))
  ]);

  return {
    timestamp: new Date().toISOString(),
    settings: {
      sync: syncData,
      local: localData
    }
  };
}

// 设备配置上传功能
async function deviceSettingsUpload(deviceKey) {
  const statusElement = document.getElementById('webdavStatus');
  const deviceConfig = deviceConfigs[deviceKey];

  if (!deviceConfig) {
    statusElement.textContent = 'Invalid Device Type';
    statusElement.style.color = 'red';
    return;
  }

  statusElement.textContent = `Preparing to Upload ${deviceConfig.name} Settings...`;
  statusElement.style.color = 'orange';

  try {
    const client = await getWebDAVClient();
    if (!client) {
      statusElement.textContent = 'WebDAV Not Configured or Configuration Error.';
      statusElement.style.color = 'red';
      return;
    }

    // 获取配置数据
    const configData = await getConfigData();

    // 设置文件路径
    const filename = `${deviceKey}_settings.json`;
    const fullPath = deviceConfig.settingsDir + filename;

    // 确保目录存在
    await ensureDirectoryExists(client, deviceConfig.settingsDir);

    // 上传文件
    statusElement.textContent = `Upload ${deviceConfig.name} Settings to ${deviceConfig.settingsDir}...`;
    const content = JSON.stringify(configData, null, 2);
    await client.putFileContents(fullPath, content, { overwrite: true });

    statusElement.textContent = `${deviceConfig.name} Upload Settings Successfully!`;
    statusElement.style.color = 'green';

  } catch (error) {
    console.error(`Upload ${deviceConfig.name} Settings Failed:`, error);
    statusElement.textContent = `Upload ${deviceConfig.name} Settings Failed: ${error.message || error}`;
    statusElement.style.color = 'red';
  }
}

// 设备配置下载合并功能
async function deviceSettingsMerge(deviceKey) {
  const statusElement = document.getElementById('webdavStatus');
  const deviceConfig = deviceConfigs[deviceKey];

  if (!deviceConfig) {
    statusElement.textContent = 'Invalid Device Type';
    statusElement.style.color = 'red';
    return;
  }

  statusElement.textContent = `Downloading ${deviceConfig.name} Settings...`;
  statusElement.style.color = 'orange';

  try {
    const client = await getWebDAVClient();
    if (!client) {
      statusElement.textContent = 'WebDAV Not Configured or Configuration Error.';
      statusElement.style.color = 'red';
      return;
    }

    // 设置文件路径
    const filename = `${deviceKey}_settings.json`;
    const fullPath = deviceConfig.settingsDir + filename;

    // 下载配置文件
    const configContent = await client.getFileContents(fullPath, { format: "text" });
    const configData = JSON.parse(configContent);

    // 验证配置数据格式
    if (!configData.settings || (!configData.settings.sync && !configData.settings.local)) {
      throw new Error('Invalid Configuration File Format');
    }

    statusElement.textContent = `Merging ${deviceConfig.name} Settings to Local...`;

    // 合并配置到本地存储
    if (configData.settings.sync) {
      await new Promise(resolve => chrome.storage.sync.set(configData.settings.sync, resolve));
    }

    if (configData.settings.local) {
      await new Promise(resolve => chrome.storage.local.set(configData.settings.local, resolve));
    }

    statusElement.textContent = `${deviceConfig.name} Settings Merged to Local Successfully! Suggest Restart Plugin to take effect.`;
    statusElement.style.color = 'green';

    // 提示用户重启插件
    setTimeout(() => {
      if (confirm(`${deviceConfig.name} Settings Merged to Local Successfully! Suggest Restart Plugin to take effect.`)) {
        chrome.runtime.reload();
      }
    }, 1000);

  } catch (error) {
    if (error.status === 404) {
      statusElement.textContent = `${deviceConfig.name} Settings File Not Found, Please Upload Settings First.`;
      statusElement.style.color = 'orange';
    } else {
      console.error(`Download ${deviceConfig.name} Settings Failed:`, error);
      statusElement.textContent = `Download ${deviceConfig.name} Settings Failed: ${error.message || error}`;
      statusElement.style.color = 'red';
    }
  }
}

// 设备配置多次备份功能
async function deviceSettingsMultiUpload(deviceKey) {
  const statusElement = document.getElementById('webdavStatus');
  const deviceConfig = deviceConfigs[deviceKey];

  if (!deviceConfig) {
    statusElement.textContent = 'Invalid Device Type';
    statusElement.style.color = 'red';
    return;
  }

  statusElement.textContent = `Preparing Multiple Backups for ${deviceConfig.name} Settings...`;
  statusElement.style.color = 'orange';

  try {
    const client = await getWebDAVClient();
    if (!client) {
      statusElement.textContent = 'WebDAV Not Configured or Configuration Error.';
      statusElement.style.color = 'red';
      return;
    }

    // 获取配置数据
    const configData = await getConfigData();

    // 生成带时间戳的文件名
    const timestamp = getCurrentDateTimeString();
    const filename = `${deviceKey}_settings_backup_${timestamp}.json`;
    const fullPath = deviceConfig.backupDir + filename;

    // 确保目录存在
    await ensureDirectoryExists(client, deviceConfig.backupDir);

    // 上传文件
    statusElement.textContent = `Uploading ${deviceConfig.name} Settings Backup to ${deviceConfig.backupDir}...`;
    const content = JSON.stringify(configData, null, 2);
    await client.putFileContents(fullPath, content, { overwrite: true });

    statusElement.textContent = `${deviceConfig.name} Settings Backup ${filename} Uploaded Successfully!`;
    statusElement.style.color = 'green';

  } catch (error) {
    console.error(`Upload ${deviceConfig.name} Settings Backup Failed:`, error);
    statusElement.textContent = `Upload ${deviceConfig.name} Settings Backup Failed: ${error.message || error}`;
    statusElement.style.color = 'red';
  }
}

// 单词学习统计图表相关代码
let wordStatsChart = null;
let wordDetailsArray = [];
let currentChartMode = 'modeA'; // 存储当前图表模式，默认为模式A
let currentDerivativeOrder = 0; // 存储当前导数阶数，默认为0阶(原始数据)

// 计算数据的导数
function calculateDerivative(data, order = 1) {
  if (order <= 0 || !Array.isArray(data) || data.length <= 1) {
    return data; // 如果阶数不正确或数据不足，返回原始数据
  }

  // 计算一阶导数 (差分)
  const firstDerivative = [];
  for (let i = 1; i < data.length; i++) {
    // 计算相邻两点的差值
    firstDerivative.push(data[i] - data[i-1]);
  }

  // 如果需要更高阶导数，递归计算
  if (order === 1) {
    return firstDerivative;
  } else {
    return calculateDerivative(firstDerivative, order - 1);
  }
}

// 初始化学习统计图表（只初始化UI和事件，不自动加载数据）
function initWordStatsChart() {
  try {
    // 新增：获取统计模式选择器并设置初始值和事件监听器
    const chartModeSelector = document.getElementById('chartModeSelector');
    if (chartModeSelector) {
      currentChartMode = chartModeSelector.value; // 读取初始模式
      chartModeSelector.addEventListener('change', function() {
        currentChartMode = this.value;
        applyStatsFilter(); // 模式更改时重新应用筛选并刷新图表
      });
    }

    // 设置默认日期范围（本周）
    const today = new Date();
    const firstDayOfWeek = new Date(today);
    const day = today.getDay() || 7; // 获取星期几，如果是0（星期日）则设为7
    firstDayOfWeek.setDate(today.getDate() - day + 1); // 设置为本周一

    document.getElementById('statsStartDate').valueAsDate = firstDayOfWeek;
    document.getElementById('statsEndDate').valueAsDate = today;

    // 高亮"本周"按钮
    document.getElementById('statsFilterThisWeek').classList.add('active');

    // 绑定筛选按钮事件
    bindStatsFilterEvents();

    // 注释掉自动加载数据的代码，改为等待用户手动筛选
    // // 构建筛选条件：本周，所有语言，状态1
    // const filters = {
    //   language: 'all',
    //   statuses: [1],
    //   startDate: firstDayOfWeek.getTime(),
    //   endDate: today.setHours(23, 59, 59, 999)
    // };

    // console.log('[options.js] 学习统计图表初始化，请求本周数据:', filters);

    // // 获取本周的单词详情（数据库层面筛选）
    // getFilteredWordDetails(filters).then(wordDetails => {
    //   try {
    //     wordDetailsArray = Object.values(wordDetails);

    //     // 创建图表，默认为折线图，本周时间范围，状态1，全部语言
    //     createWordStatsChart('line', firstDayOfWeek, new Date(), [1], 'all');

    //     // 初始化状态筛选按钮的UI高亮
    //     // 确保在 bindStatsFilterEvents 之前或独立于它正确设置初始状态
    //     const initialStatusCheckboxes = document.querySelectorAll('.filter-item input[type="checkbox"][id^="statsStatus"]');
    //     initialStatusCheckboxes.forEach(checkbox => {
    //         const parentButton = checkbox.closest('.checkbox-item');
    //         if (parentButton) {
    //             if (checkbox.checked) {
    //                 parentButton.classList.add('active');
    //             } else {
    //                 parentButton.classList.remove('active');
    //             }
    //         }
    //     });

    //     // 输出调试信息
    //     console.log(`初始化图表: 找到 ${wordDetailsArray.length} 个单词`);
    //     console.log(`本周状态1的单词数量: ${wordDetailsArray.length}`);

    //   } catch (innerErr) {
    //     console.error("处理单词详情失败:", innerErr);
    //     // 显示错误信息给用户
    //     const ctx = document.getElementById('wordStatsChart').getContext('2d');
    //     ctx.font = '14px Arial';
    //     ctx.fillStyle = '#ff3b30';
    //     ctx.textAlign = 'center';
    //     ctx.fillText('加载图表失败，请刷新页面重试', ctx.canvas.width / 2, ctx.canvas.height / 2);
    //   }
    // }).catch(err => {
    //   console.error("获取单词详情失败:", err);
    //   // 显示错误信息给用户
    //   const ctx = document.getElementById('wordStatsChart').getContext('2d');
    //   ctx.font = '14px Arial';
    //   ctx.fillStyle = '#ff3b30';
    //   ctx.textAlign = 'center';
    //   ctx.fillText('获取单词数据失败，请刷新页面重试', ctx.canvas.width / 2, ctx.canvas.height / 2);
    // });

    console.log('[options.js] 学习统计图表UI初始化完成，等待用户手动筛选');
  } catch (err) {
    console.error("初始化图表失败:", err);
  }
}

// 新增：生成日期范围内的所有日期字符串
// Helper function to format a Date object to YYYY-MM-DD string
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function generateDateRange(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  // 将时间设置为当天的开始，以避免时区问题导致的天数计算错误
  currentDate.setHours(0, 0, 0, 0);
  const finalEndDate = new Date(endDate);
  finalEndDate.setHours(0, 0, 0, 0);

  while (currentDate <= finalEndDate) {
    dates.push(formatDate(new Date(currentDate))); // 使用已有的 formatDate
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

// 新增：为不同状态定义颜色
const statusColors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#FFCD56', '#C9CBCF', '#7FDBFF', '#F012BE'];

// 新增：为不同状态定义固定的颜色映射
const fixedStatusColors = {
  '0': '#FF9F40', // 删除 - 红色 橙色#FF9F40
  '1': '#FF6384', // 学习中 - 红色#FF6384
  '2': '#FFCE56', // 熟悉 - 黄色
  '3': '#4BC0C0', // 认识 - 青色
  '4': '#9966FF', // 几乎掌握 - 紫色
  '5': '#36A2EB'  // 完全掌握 -  蓝色#36A2EB
};

// 新增：状态ID到i18n键的映射 (用于图例标签)
const statusKeyMap = {
  '0': 'delete',
  '1': 'learning',
  '2': 'familiar',
  '3': 'recognized',
  '4': 'almostMastered',
  '5': 'fullyMastered'
};

// 辅助函数：格式化日期为 yyyy-MM-dd (此函数已在文件其他地方定义，约4794行，此处仅为引用说明)
// function formatDate(date) {
//   const year = date.getFullYear();
//   const month = String(date.getMonth() + 1).padStart(2, '0');
//   const day = String(date.getDate()).padStart(2, '0');
//   return `${year}-${month}-${day}`;
// }

// 创建学习统计图表
function createWordStatsChart(chartType, startDate, endDate, statusFilter, language = 'all', chartMode = 'modeA') {
  const ctx = document.getElementById('wordStatsChart').getContext('2d');

  // 获取当前导数阶数
  currentDerivativeOrder = parseInt(document.getElementById('derivativeSelector').value) || 0;

  console.log('[Lingkuma - options.js DEBUG] createWordStatsChart called with:');
  console.log(`[Lingkuma - options.js DEBUG]   chartMode: ${chartMode}`);
  console.log(`[Lingkuma - options.js DEBUG]   chartType: ${chartType}`);
  console.log(`[Lingkuma - options.js DEBUG]   startDate: ${startDate.toISOString()}`);
  console.log(`[Lingkuma - options.js DEBUG]   endDate: ${endDate.toISOString()}`);
  console.log(`[Lingkuma - options.js DEBUG]   statusFilter: ${JSON.stringify(statusFilter)}`);
  console.log(`[Lingkuma - options.js DEBUG]   language: ${language}`);
  console.log(`[Lingkuma - options.js DEBUG]   derivativeOrder: ${currentDerivativeOrder}`);

  if (wordStatsChart) {
    wordStatsChart.destroy();
  }

  const allDatesForChartLabels = generateDateRange(startDate, endDate);
  let chartDatasets = [];
  // chartOptions 将在下面根据模式和类型构建

  if (chartMode === 'modeB') {
    console.log("[Lingkuma - options.js DEBUG] Executing Mode B logic.");

    // 确保清空之前的数据集
    chartDatasets = [];

    // 为每个选中的状态创建一个数据集
    statusFilter.forEach((statusIdNumeric, index) => {
      const statusIdStr = String(statusIdNumeric);
      const dailyCountsForStatus = {};

      // 初始化每个日期的计数为0
      allDatesForChartLabels.forEach(dateStr => {
        dailyCountsForStatus[dateStr] = 0;
      });

      // 遍历所有单词，统计每个日期达到该状态的单词数量
      wordDetailsArray.forEach(word => {
        // 语言筛选
        if (language !== 'all' && word.language !== language) {
          return;
        }

        // 检查单词是否有该状态的历史记录和创建时间
        if (word.statusHistory &&
            word.statusHistory[statusIdStr] &&
            word.statusHistory[statusIdStr].createTime) {

          const statusAchievedTimestamp = word.statusHistory[statusIdStr].createTime;
          const statusAchievedDate = new Date(statusAchievedTimestamp);

          // 检查日期是否在选定范围内
          if (statusAchievedDate >= startDate && statusAchievedDate <= endDate) {
            const dateString = formatDate(statusAchievedDate);
            if (dailyCountsForStatus.hasOwnProperty(dateString)) {
              dailyCountsForStatus[dateString]++;
            }
          }
        }
      });

      // 将每日计数转换为图表数据点格式
      const dataPoints = allDatesForChartLabels.map(dateStr => ({
        x: dateStr,
        y: dailyCountsForStatus[dateStr] || 0
      }));

      // 获取状态的本地化标签
      const statusI18nKey = statusKeyMap[statusIdStr] || `Status ${statusIdStr}`;
      const datasetLabel = translate(statusI18nKey) || statusI18nKey;

      // 为每个状态分配一个唯一的颜色
      // const color = statusColors[index % statusColors.length]; // 旧的颜色分配逻辑
      // 更新：为每个状态分配一个固定的颜色
      const color = fixedStatusColors[statusIdStr] || statusColors[index % statusColors.length]; // 如果fixedStatusColors中没有对应颜色，则回退

      // 创建数据集并添加到chartDatasets数组
      chartDatasets.push({
        label: datasetLabel,
        data: dataPoints,
        borderColor: color,
        backgroundColor: chartType === 'bar' ? color : 'transparent', // 柱状图使用实色，折线图背景透明
        tension: 0.1,
        fill: false, // 折线图不填充
        pointRadius: chartType === 'line' ? 3 : undefined,
        pointBackgroundColor: chartType === 'line' ? color : undefined,
        pointBorderColor: chartType === 'line' ? '#fff' : undefined,
        pointBorderWidth: chartType === 'line' ? 1 : undefined,
        pointHoverRadius: chartType === 'line' ? 5 : undefined,
        pointHoverBackgroundColor: chartType === 'line' ? color : undefined,
        pointHoverBorderColor: chartType === 'line' ? '#fff' : undefined,
        pointHoverBorderWidth: chartType === 'line' ? 2 : undefined,
        hitRadius: 10,
      });
    });

    // 输出调试信息，查看生成的数据集
    console.log("[Lingkuma - options.js DEBUG] Mode B datasets:", JSON.parse(JSON.stringify(chartDatasets)));

  } else { // Mode A or default
    console.log("[Lingkuma - options.js DEBUG] Executing Mode A logic.");

    // 确保清空之前的数据集
    chartDatasets = [];

    // 为每个选中的状态创建一个单独的数据集
    statusFilter.forEach((statusIdNumeric, index) => {
      const statusIdStr = String(statusIdNumeric);
      const wordsByDate = {};

      // 初始化每个日期的计数为0
      allDatesForChartLabels.forEach(dateStr => {
        wordsByDate[dateStr] = 0;
      });

      // 模式A的筛选逻辑：基于单词的 createdAt 字段
      const filteredWordsModeA = wordDetailsArray.filter(word => {
        // 只筛选当前状态的单词
        if (parseInt(word.status) !== statusIdNumeric) return false;
        // 语言筛选
        if (language !== 'all' && word.language !== language) return false;
        // 必须有创建日期
        if (!word.createdAt) return false;

        const createdDate = new Date(word.createdAt);
        // 日期范围筛选
        return createdDate >= startDate && createdDate <= endDate;
      });

      // 统计每个日期创建的单词数量
      filteredWordsModeA.forEach(word => {
        const dateStr = formatDate(new Date(word.createdAt));
        if (wordsByDate.hasOwnProperty(dateStr)) {
          wordsByDate[dateStr]++;
        }
      });

      // 将每日计数转换为图表数据点格式
      const dataPointsModeA = allDatesForChartLabels.map(dateStr => ({
        x: dateStr,
        y: wordsByDate[dateStr] || 0
      }));

      // 获取状态的本地化标签
      const statusI18nKey = statusKeyMap[statusIdStr] || `Status ${statusIdStr}`;
      const datasetLabel = translate(statusI18nKey) || statusI18nKey;

      // 为每个状态分配一个唯一的颜色
      // const color = statusColors[index % statusColors.length]; // 旧的颜色分配逻辑
      // 更新：为每个状态分配一个固定的颜色
      const color = fixedStatusColors[statusIdStr] || statusColors[index % statusColors.length]; // 如果fixedStatusColors中没有对应颜色，则回退

      // 创建数据集并添加到chartDatasets数组
      chartDatasets.push({
        label: datasetLabel,
        data: dataPointsModeA,
        borderColor: color,
        backgroundColor: chartType === 'bar' ? color : 'transparent', // 柱状图使用实色，折线图背景透明
        tension: 0.1,
        fill: false, // 折线图不填充
        pointRadius: chartType === 'line' ? 3 : undefined,
        pointBackgroundColor: chartType === 'line' ? color : undefined,
        pointBorderColor: chartType === 'line' ? '#fff' : undefined,
        pointBorderWidth: chartType === 'line' ? 1 : undefined,
        pointHoverRadius: chartType === 'line' ? 5 : undefined,
        pointHoverBackgroundColor: chartType === 'line' ? color : undefined,
        pointHoverBorderColor: chartType === 'line' ? '#fff' : undefined,
        pointHoverBorderWidth: chartType === 'line' ? 2 : undefined,
        hitRadius: 10,
      });
    });

    // 输出调试信息，查看生成的数据集
    console.log("[Lingkuma - options.js DEBUG] Mode A datasets:", JSON.parse(JSON.stringify(chartDatasets)));
  }

  // 通用图表配置
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: chartType === 'bar' ? 'category' : 'time',
        time: chartType === 'line' ? {
          unit: 'day',
          parser: 'yyyy-MM-dd', // 确保解析器与数据格式一致
          displayFormats: { day: 'MM-dd' }
        } : undefined,
        title: { display: true, text: translate('date') || '日期' }
      },
      y: {
        beginAtZero: true,
        title: { display: true, text: translate('wordCount') || '单词数量' },
        ticks: { precision: 0 } // 确保Y轴刻度为整数
      }
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: function(context) {
            // context[0].label 对于 category 和 time 轴都应该是日期字符串 'YYYY-MM-DD'
            return context[0] && context[0].label ? context[0].label : '';
          },
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += `${context.parsed.y} ${translate('wordsUnit') || '个'}`;
            }
            return label;
          }
        }
      },
      legend: {
        display: true, // 确保图例对于多数据集是可见的
        position: 'top'
      }
    }
  };

  // 如果需要计算导数，处理每个数据集
  if (currentDerivativeOrder > 0) {
    chartDatasets.forEach(dataset => {
      // 提取原始Y值数组
      const originalYValues = dataset.data.map(point => point.y);

      // 计算导数
      const derivativeValues = calculateDerivative(originalYValues, currentDerivativeOrder);

      // 更新数据集的Y值
      // 注意：导数计算会减少数据点数量，需要调整X轴标签
      const newData = [];
      for (let i = 0; i < derivativeValues.length; i++) {
        // 对于一阶导数，我们从原始数据的第二个点开始
        // 对于二阶导数，我们从原始数据的第三个点开始，以此类推
        const pointIndex = i + currentDerivativeOrder;
        if (pointIndex < dataset.data.length) {
          newData.push({
            x: dataset.data[pointIndex].x,
            y: derivativeValues[i]
          });
        }
      }

      // 更新数据集
      dataset.data = newData;

      // 更新标签以反映这是导数数据
      const derivativeText = currentDerivativeOrder === 1 ?
        (translate('derivativeOrder1') || '一阶导数 (变化率)') :
        (translate('derivativeOrder2') || '二阶导数 (加速度)');
      dataset.label = `${dataset.label} - ${derivativeText}`;
    });
  }

  const finalChartData = {
    labels: allDatesForChartLabels,
    datasets: chartDatasets
  };

  // 调整柱状图颜色 (如果图表类型是柱状图，并且是模式B，颜色已在循环中单独设置)
  // 模式A的柱状图颜色在数据集创建时已设置
  if (chartType === 'bar') {
    finalChartData.datasets.forEach(dataset => {
        // 对于模式B的柱状图，颜色已在上面循环中设置 backgroundColor
        // 对于模式A的柱状图，backgroundColor 也已设置
        dataset.borderWidth = 1; // 统一柱状图边框
    });
  }


  try {
    wordStatsChart = new Chart(ctx, {
      type: chartType,
      data: finalChartData,
      options: chartOptions
    });
    console.log("[Lingkuma - options.js DEBUG] Chart created/updated successfully.");
  } catch (error) {
    console.error("创建/更新图表失败:", error);
    // 可以添加一些用户提示，例如在canvas上绘制错误信息
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // 清除画布
    ctx.font = '14px Arial';
    ctx.fillStyle = 'red';
    ctx.textAlign = 'center';
    ctx.fillText(translate('chartError') || '图表加载失败，请稍后再试。', ctx.canvas.width / 2, ctx.canvas.height / 2);
  }
}

// 绑定统计筛选按钮事件
function bindStatsFilterEvents() {
  // 清除所有按钮的active类
  function clearActiveButtons() {
    document.querySelectorAll('.filter-buttons button').forEach(btn => {
      btn.classList.remove('active');
    });
  }

  // 预设时间范围按钮
  document.getElementById('statsFilterToday').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterToday').classList.add('active');

    const today = new Date();
    document.getElementById('statsStartDate').valueAsDate = today;
    document.getElementById('statsEndDate').valueAsDate = today;
    applyStatsFilter();
  });

  document.getElementById('statsFilterYesterday').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterYesterday').classList.add('active');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    document.getElementById('statsStartDate').valueAsDate = yesterday;
    document.getElementById('statsEndDate').valueAsDate = yesterday;
    applyStatsFilter();
  });

  document.getElementById('statsFilterThisWeek').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterThisWeek').classList.add('active');

    const today = new Date();
    const firstDayOfWeek = new Date(today);
    const day = today.getDay() || 7; // 获取星期几，如果是0（星期日）则设为7
    firstDayOfWeek.setDate(today.getDate() - day + 1); // 设置为本周一

    document.getElementById('statsStartDate').valueAsDate = firstDayOfWeek;
    document.getElementById('statsEndDate').valueAsDate = today;
    // 注释掉自动应用筛选，改为等待用户点击"应用范围"按钮
    // applyStatsFilter();
  });

  document.getElementById('statsFilterThisMonth').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterThisMonth').classList.add('active');

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    document.getElementById('statsStartDate').valueAsDate = firstDayOfMonth;
    document.getElementById('statsEndDate').valueAsDate = today;
    // 注释掉自动应用筛选，改为等待用户点击"应用范围"按钮
    // applyStatsFilter();
  });

  document.getElementById('statsFilterThisYear').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterThisYear').classList.add('active');

    const today = new Date();
    const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

    document.getElementById('statsStartDate').valueAsDate = firstDayOfYear;
    document.getElementById('statsEndDate').valueAsDate = today;
    // 注释掉自动应用筛选，改为等待用户点击"应用范围"按钮
    // applyStatsFilter();
  });

  document.getElementById('statsFilterAllTime').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterAllTime').classList.add('active');

    // 找出最早的单词创建日期
    let earliestDate = new Date();

    wordDetailsArray.forEach(word => {
      if (word.createdAt) {
        const createdDate = new Date(word.createdAt);
        if (createdDate < earliestDate) {
          earliestDate = createdDate;
        }
      }
    });

    const today = new Date();

    document.getElementById('statsStartDate').valueAsDate = earliestDate;
    document.getElementById('statsEndDate').valueAsDate = today;
    // 注释掉自动应用筛选，改为等待用户点击"应用范围"按钮
    // applyStatsFilter();
  });

  // 前30天
  document.getElementById('statsFilterLast30Days').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterLast30Days').classList.add('active');

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    document.getElementById('statsStartDate').valueAsDate = thirtyDaysAgo;
    document.getElementById('statsEndDate').valueAsDate = today;
    // 注释掉自动应用筛选，改为等待用户点击"应用范围"按钮
    // applyStatsFilter();
  });

  // 前60天
  document.getElementById('statsFilterLast60Days').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterLast60Days').classList.add('active');

    const today = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(today.getDate() - 60);

    document.getElementById('statsStartDate').valueAsDate = sixtyDaysAgo;
    document.getElementById('statsEndDate').valueAsDate = today;
    // 注释掉自动应用筛选，改为等待用户点击"应用范围"按钮
    // applyStatsFilter();
  });

  // 前90天
  document.getElementById('statsFilterLast90Days').addEventListener('click', () => {
    clearActiveButtons();
    document.getElementById('statsFilterLast90Days').classList.add('active');

    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);

    document.getElementById('statsStartDate').valueAsDate = ninetyDaysAgo;
    document.getElementById('statsEndDate').valueAsDate = today;
    // 注释掉自动应用筛选，改为等待用户点击"应用范围"按钮
    // applyStatsFilter();
  });

  // 应用自定义日期范围
  document.getElementById('statsApplyRange').addEventListener('click', () => {
    clearActiveButtons();
    applyStatsFilter();
  });

  // 状态筛选按钮
  document.querySelectorAll('.filter-item .checkbox-item').forEach(button => {
    const checkbox = button.querySelector('input[type="checkbox"][id^="statsStatus"]');
    if (checkbox) {
      // 初始化时根据checkbox状态设置active类
      if (checkbox.checked) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }

      button.addEventListener('click', () => {
        const currentlyChecked = checkbox.checked;
        let intendedToCheck = !currentlyChecked;
        let canProceed = true;

        if (!intendedToCheck) { // 用户尝试取消选中
          // 检查如果取消这个，是否会导致没有状态被选中
          const allCheckboxes = document.querySelectorAll('input[type="checkbox"][id^="statsStatus"]');
          let checkedCount = 0;
          allCheckboxes.forEach(cb => {
            if (cb.checked) {
              checkedCount++;
            }
          });

          // 如果当前只有一个被选中，并且用户尝试取消它
          if (checkedCount === 1 && currentlyChecked) {
            alert(translate('statusFilterMinOne') || '请至少选择一种单词状态'); // 使用翻译
            canProceed = false;
            // 确保UI状态不变
            checkbox.checked = true; // 保持选中
            button.classList.add('active'); // 保持高亮
          }
        }

        if (canProceed) {
          checkbox.checked = intendedToCheck;
          if (intendedToCheck) {
            button.classList.add('active');
          } else {
            button.classList.remove('active');
          }
          applyStatsFilter();
        }
      });
    }
  });

  // 语言筛选下拉框
  document.getElementById('statsLanguageFilter').addEventListener('change', () => {
    applyStatsFilter();
  });

  // 图表类型单选按钮
  document.querySelectorAll('input[name="chartType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      applyStatsFilter();
    });
  });

  // 导数选择器
  document.getElementById('derivativeSelector').addEventListener('change', () => {
    applyStatsFilter();
  });
}

// 应用统计筛选（使用数据库层面筛选）
function applyStatsFilter() {
  // 获取日期范围
  const startDateStr = document.getElementById('statsStartDate').value;
  const endDateStr = document.getElementById('statsEndDate').value;

  if (!startDateStr || !endDateStr) {
    alert('请选择开始和结束日期');
    return;
  }

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  endDate.setHours(23, 59, 59, 999); // 设置为当天的最后一毫秒

  if (startDate > endDate) {
    alert('开始日期不能晚于结束日期');
    return;
  }

  // 获取状态筛选
  const statusFilter = [];
  document.querySelectorAll('[id^="statsStatus"]:checked').forEach(checkbox => {
    statusFilter.push(parseInt(checkbox.value));
  });

  if (statusFilter.length === 0) {
    // 此处的 alert 理论上不应该再被触发，因为 bindStatsFilterEvents 已经处理了最后一个状态的取消。
    // 但为保险起见，保留一个日志或一个更温和的提示。
    console.warn('applyStatsFilter called with no status selected, this should have been prevented.');
    // alert('请至少选择一种单词状态'); // 可以考虑移除或改为更不打扰的提示
    return;
  }

  // 获取语言筛选
  const language = document.getElementById('statsLanguageFilter').value;

  // 获取图表类型
  const chartType = document.querySelector('input[name="chartType"]:checked').value;

  // 获取导数阶数
  currentDerivativeOrder = parseInt(document.getElementById('derivativeSelector').value) || 0;

  // 构建筛选条件
  const filters = {
    language: language,
    statuses: statusFilter,
    startDate: startDate.getTime(),
    endDate: endDate.getTime()
  };

  console.log('[options.js] 应用统计筛选条件:', filters);

  // 先获取筛选后的数据，再创建图表
  getFilteredWordDetails(filters).then(wordDetails => {
    wordDetailsArray = Object.values(wordDetails);
    console.log(`[options.js] 统计图表获取到 ${wordDetailsArray.length} 个单词`);

    // 创建图表
    createWordStatsChart(chartType, startDate, new Date(endDate.getTime()), statusFilter, language, currentChartMode);
  }).catch(err => {
    console.error("获取统计数据失败:", err);
    alert('获取统计数据失败，请重试');
  });
}

// 多设备配置功能的事件监听器
function bindDeviceConfigEvents() {
  // 为每个设备添加事件监听器
  Object.keys(deviceConfigs).forEach(deviceKey => {
    // 上传配置按钮
    const uploadBtn = document.getElementById(`device-${deviceKey}-upload`);
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => deviceSettingsUpload(deviceKey));
    }

    // 下载合并配置按钮
    const mergeBtn = document.getElementById(`device-${deviceKey}-merge`);
    if (mergeBtn) {
      mergeBtn.addEventListener('click', () => deviceSettingsMerge(deviceKey));
    }

    // 多次备份按钮
    const multiUploadBtn = document.getElementById(`device-${deviceKey}-multiupload`);
    if (multiUploadBtn) {
      multiUploadBtn.addEventListener('click', () => deviceSettingsMultiUpload(deviceKey));
    }
  });
}

// 在页面加载完成后绑定多设备配置事件
document.addEventListener('DOMContentLoaded', () => {
  bindDeviceConfigEvents();
  initCustomCapsules();
  initGlassEffectSettings();
  initKnownSentenceAnimation();
});

// ========== 玻璃材质设置 ==========

// 初始化玻璃材质设置
function initGlassEffectSettings() {
  const glassEffectTypeSelect = document.getElementById('glassEffectType');

  if (!glassEffectTypeSelect) {
    console.warn('玻璃材质选择器元素未找到');
    return;
  }

  // 从存储中加载设置
  chrome.storage.local.get(['glassEffectType'], function(result) {
    const effectType = result.glassEffectType || 'rough'; // 默认为Rough
    glassEffectTypeSelect.value = effectType;
    console.log('已加载玻璃材质设置:', effectType);
  });

  // 添加change事件监听器，自动保存
  glassEffectTypeSelect.addEventListener('change', function() {
    const selectedEffect = this.value;

    // 保存到存储
    chrome.storage.local.set({ glassEffectType: selectedEffect }, function() {
      if (chrome.runtime.lastError) {
        console.error('保存玻璃材质设置时出错:', chrome.runtime.lastError);
      } else {
        console.log('玻璃材质设置已保存:', selectedEffect);

        // 通知所有内容脚本更新玻璃效果
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(function(tab) {
            chrome.tabs.sendMessage(tab.id, {
              action: "updateGlassEffect",
              effectType: selectedEffect
            }).catch(err => console.log('无法发送消息到标签页:', tab.id, err));
          });
        });
      }
    });
  });
}

// ========== 自定义胶囊管理 ==========

// 初始化自定义胶囊功能
function initCustomCapsules() {
  loadCustomCapsules();

  // 添加新胶囊容器按钮事件
  const addBtn = document.getElementById('addCapsuleContainerBtn');
  if (addBtn) {
    addBtn.addEventListener('click', addNewCapsuleContainer);
  }
}

// 加载自定义胶囊列表
function loadCustomCapsules() {
  chrome.storage.local.get(['customCapsules'], (result) => {
    const capsules = result.customCapsules || [];
    renderCapsulesContainerList(capsules);
  });
}

// 渲染胶囊容器列表
function renderCapsulesContainerList(capsules) {
  const container = document.getElementById('capsulesContainerList');
  if (!container) return;

  container.innerHTML = '';

  if (capsules.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
        <p data-i18n="noCapsulesYet">还没有添加任何胶囊容器，点击下方按钮添加</p>
      </div>
    `;
    return;
  }

  capsules.forEach((capsuleContainer, containerIndex) => {
    const containerItem = createCapsuleContainerItem(capsuleContainer, containerIndex);
    container.appendChild(containerItem);
  });
}

// HTML转义函数 - 用于在HTML属性中安全显示文本
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 创建单个胶囊容器项
function createCapsuleContainerItem(capsuleContainer, containerIndex) {
  const div = document.createElement('div');
  div.className = 'capsule-container-item';
  div.style.cssText = `
    padding: 20px;
    margin-bottom: 20px;
    border: 2px solid var(--primary-color);
    border-radius: 12px;
    background: var(--card-background);
  `;

  const buttonsHTML = (capsuleContainer.buttons || []).map((button, btnIndex) => `
    <div class="capsule-button-item" data-btn-index="${btnIndex}" style="padding: 12px; margin-bottom: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--background-color);">
      <div style="display: flex; gap: 10px; align-items: start;">
        <div style="flex: 1;">
          <div style="margin-bottom: 8px;">
            <label style="display: inline-block; width: 80px; font-weight: 500;">${translate('buttonName')}：</label>
            <input type="text" class="button-name" value="${escapeHtml(button.name || '')}"
                   style="width: calc(100% - 90px); padding: 5px; border: 1px solid var(--border-color); border-radius: 4px;">
          </div>
          <div style="margin-bottom: 8px;">
            <label style="display: inline-block; width: 80px; font-weight: 500;">${translate('buttonUrl')}：</label>
            <input type="text" class="button-url" value="${escapeHtml(button.url || '')}"
                   style="width: calc(100% - 90px); padding: 5px; border: 1px solid var(--border-color); border-radius: 4px;">
          </div>
          <div style="margin-bottom: 8px;">
            <label style="display: inline-block; width: 80px; font-weight: 500;">${translate('buttonOpenMethod')}：</label>
            <select class="button-open-method" style="padding: 5px; border: 1px solid var(--border-color); border-radius: 4px;">
              <option value="newTab" ${button.openMethod === 'newTab' ? 'selected' : ''}>${translate('openMethodNewTab')}</option>
              <option value="iframe" ${button.openMethod === 'iframe' ? 'selected' : ''}>${translate('openMethodIframe')}</option>
              <option value="newWindow" ${button.openMethod === 'newWindow' ? 'selected' : ''}>${translate('openMethodNewWindow')}</option>
              <option value="sidebar" ${button.openMethod === 'sidebar' ? 'selected' : ''}>${translate('openMethodSidebar')}</option>
            </select>
          </div>
          <div style="margin-bottom: 8px;">
            <label style="display: inline-block; width: 80px; font-weight: 500;">${translate('buttonIcon')}：</label>
            <input type="text" class="button-icon" value="${escapeHtml(button.icon || '')}" placeholder="${translate('buttonIconPlaceholder')}"
                   style="width: calc(100% - 90px); padding: 5px; border: 1px solid var(--border-color); border-radius: 4px;">
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <button class="delete-button-btn" data-container-index="${containerIndex}" data-btn-index="${btnIndex}"
                  style="padding: 5px 10px; background: var(--danger-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            ${translate('deleteButton')}
          </button>
        </div>
      </div>
    </div>
  `).join('');

  div.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <h4 style="margin: 0; color: var(--primary-color);">${translate('capsuleContainer')} #${containerIndex + 1}</h4>
      <div style="display: flex; gap: 8px;">
        <button class="add-button-btn" data-container-index="${containerIndex}"
                style="padding: 6px 12px; background: var(--success-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
          ${translate('addButton')}
        </button>
        <button class="delete-container-btn" data-container-index="${containerIndex}"
                style="padding: 6px 12px; background: var(--danger-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
          ${translate('deleteContainer')}
        </button>
      </div>
    </div>
    <div class="buttons-list">
      ${buttonsHTML || `<p style="color: var(--text-secondary); text-align: center; padding: 20px;">${translate('noButtonsYet')}</p>`}
    </div>
    <div style="margin-top: 10px; color: var(--text-secondary); font-size: 12px; text-align: right;">
      <span class="auto-save-hint">${translate('capsuleAutoSaveHint')}</span>
    </div>
  `;

  // 绑定添加按钮事件
  const addButtonBtn = div.querySelector('.add-button-btn');
  addButtonBtn.addEventListener('click', () => addButtonToContainer(containerIndex));

  // 绑定删除容器按钮事件
  const deleteContainerBtn = div.querySelector('.delete-container-btn');
  deleteContainerBtn.addEventListener('click', () => deleteCapsuleContainer(containerIndex));

  // 绑定删除按钮事件
  const deleteButtonBtns = div.querySelectorAll('.delete-button-btn');
  deleteButtonBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const btnIndex = parseInt(e.target.getAttribute('data-btn-index'));
      deleteButtonFromContainer(containerIndex, btnIndex);
    });
  });

  // 为所有输入框添加自动保存功能
  const inputs = div.querySelectorAll('.button-name, .button-url, .button-icon');
  const selects = div.querySelectorAll('.button-open-method');

  inputs.forEach(input => {
    input.addEventListener('input', debounce(() => {
      autoSaveCapsuleContainer(containerIndex);
    }, 1000)); // 1秒防抖
  });

  selects.forEach(select => {
    select.addEventListener('change', () => {
      autoSaveCapsuleContainer(containerIndex);
    });
  });

  return div;
}

// 添加新胶囊容器
function addNewCapsuleContainer() {
  chrome.storage.local.get(['customCapsules'], (result) => {
    const capsules = result.customCapsules || [];
    capsules.push({
      buttons: [
        {
          name: translate('newButton'),
          url: 'https://www.google.com/search?q={word}',
          openMethod: 'newTab',
          icon: ''
        }
      ]
    });

    chrome.storage.local.set({ customCapsules: capsules }, () => {
      loadCustomCapsules();
    });
  });
}

// 添加按钮到容器
function addButtonToContainer(containerIndex) {
  chrome.storage.local.get(['customCapsules'], (result) => {
    const capsules = result.customCapsules || [];
    if (!capsules[containerIndex].buttons) {
      capsules[containerIndex].buttons = [];
    }
    capsules[containerIndex].buttons.push({
      name: translate('newButton'),
      url: 'https://www.google.com/search?q={word}',
      openMethod: 'newTab',
      icon: ''
    });

    chrome.storage.local.set({ customCapsules: capsules }, () => {
      loadCustomCapsules();
    });
  });
}

// 自动保存胶囊容器（静默保存，不弹窗）
function autoSaveCapsuleContainer(containerIndex) {
  const container = document.getElementById('capsulesContainerList');
  const containerItems = container.querySelectorAll('.capsule-container-item');
  const containerItem = containerItems[containerIndex];

  if (!containerItem) return;

  const buttonItems = containerItem.querySelectorAll('.capsule-button-item');
  const buttons = [];

  buttonItems.forEach((btnItem) => {
    const name = btnItem.querySelector('.button-name').value.trim();
    const url = btnItem.querySelector('.button-url').value.trim();
    const openMethod = btnItem.querySelector('.button-open-method').value;
    const icon = btnItem.querySelector('.button-icon').value.trim();

    // 自动保存时，如果名称或URL为空，跳过该按钮但不报错
    if (!name && !url) {
      return; // 完全空的按钮，跳过
    }

    buttons.push({ name, url, openMethod, icon });
  });

  chrome.storage.local.get(['customCapsules'], (result) => {
    const capsules = result.customCapsules || [];
    capsules[containerIndex] = { buttons };

    chrome.storage.local.set({ customCapsules: capsules }, () => {
      console.log(`${translate('capsuleContainer')} #${containerIndex + 1} ${translate('autoSavedCapsule')}`);

      // 显示保存提示
      const hint = containerItem.querySelector('.auto-save-hint');
      if (hint) {
        hint.style.color = 'var(--success-color)';
        hint.textContent = translate('autoSavedCapsule');
        setTimeout(() => {
          hint.style.color = 'var(--text-secondary)';
          hint.textContent = translate('capsuleAutoSaveHint');
        }, 2000);
      }
    });
  });
}

// 删除胶囊容器
function deleteCapsuleContainer(containerIndex) {
  if (!confirm(translate('confirmDeleteContainer'))) {
    return;
  }

  chrome.storage.local.get(['customCapsules'], (result) => {
    const capsules = result.customCapsules || [];
    capsules.splice(containerIndex, 1);

    chrome.storage.local.set({ customCapsules: capsules }, () => {
      loadCustomCapsules();
    });
  });
}

// 删除容器中的按钮
function deleteButtonFromContainer(containerIndex, btnIndex) {
  if (!confirm(translate('confirmDeleteButton'))) {
    return;
  }

  chrome.storage.local.get(['customCapsules'], (result) => {
    const capsules = result.customCapsules || [];
    if (capsules[containerIndex] && capsules[containerIndex].buttons) {
      capsules[containerIndex].buttons.splice(btnIndex, 1);

      chrome.storage.local.set({ customCapsules: capsules }, () => {
        loadCustomCapsules();
      });
    }
  });
}

// ========== 已知句子动效配置 ==========

// 预设动图列表
const PRESET_ANIMATIONS = [
  '哥斯拉狂怒.tgs',
  '快速移动.tgs',
  '气球.tgs',
  '气球子图.tgs',
  '满天繁星.tgs',
  '移动.tgs'
];

// 初始化已知句子动效配置
function initKnownSentenceAnimation() {
  // 生成动图卡片
  generateAnimationCards();

  // 加载配置
  loadAnimationSettings();

  // 顶层动图开关
  const topEnabled = document.getElementById('topAnimationEnabled');
  const topSettings = document.getElementById('topAnimationSettings');
  if (topEnabled && topSettings) {
    topEnabled.addEventListener('change', function() {
      topSettings.style.display = this.checked ? 'block' : 'none';
      saveAnimationSettings();
    });
  }

  // 底层动图开关
  const bottomEnabled = document.getElementById('bottomAnimationEnabled');
  const bottomSettings = document.getElementById('bottomAnimationSettings');
  if (bottomEnabled && bottomSettings) {
    bottomEnabled.addEventListener('change', function() {
      bottomSettings.style.display = this.checked ? 'block' : 'none';
      saveAnimationSettings();
    });
  }

  // 顶层自定义文件上传
  const topFile = document.getElementById('topAnimationFile');
  const topFileBtn = document.getElementById('topAnimationFileBtn');
  if (topFile) {
    topFile.addEventListener('change', function(e) {
      handleAnimationFileUpload(e, 'top');
    });
  }
  if (topFileBtn) {
    topFileBtn.addEventListener('click', function() {
      topFile.click();
    });
  }

  // 底层自定义文件上传
  const bottomFile = document.getElementById('bottomAnimationFile');
  const bottomFileBtn = document.getElementById('bottomAnimationFileBtn');
  if (bottomFile) {
    bottomFile.addEventListener('change', function(e) {
      handleAnimationFileUpload(e, 'bottom');
    });
  }
  if (bottomFileBtn) {
    bottomFileBtn.addEventListener('click', function() {
      bottomFile.click();
    });
  }

  // 尺寸设置
  const widthInput = document.getElementById('animationWidth');
  const heightInput = document.getElementById('animationHeight');
  if (widthInput) {
    widthInput.addEventListener('change', saveAnimationSettings);
  }
  if (heightInput) {
    heightInput.addEventListener('change', saveAnimationSettings);
  }
}

// 生成动图选择卡片
function generateAnimationCards() {
  const topGrid = document.getElementById('topAnimationGrid');
  const bottomGrid = document.getElementById('bottomAnimationGrid');

  if (!topGrid || !bottomGrid) return;

  // 为顶层和底层生成卡片
  [topGrid, bottomGrid].forEach((grid, index) => {
    const layer = index === 0 ? 'top' : 'bottom';
    grid.innerHTML = '';

    PRESET_ANIMATIONS.forEach(filename => {
      const card = document.createElement('div');
      card.className = 'animation-card';
      card.dataset.filename = filename;
      card.dataset.layer = layer;

      // 创建预览容器
      const preview = document.createElement('div');
      preview.className = 'animation-card-preview';

      // 创建tgs-player
      const player = document.createElement('tgs-player');
      player.setAttribute('mode', 'normal');
      player.setAttribute('src', chrome.runtime.getURL(`src/service/image/lottie/${filename}`));
      player.style.width = '80px';
      player.style.height = '80px';

      preview.appendChild(player);

      // 等待player完全准备好后设置默认帧
      player.addEventListener('ready', () => {
        setTimeout(() => {
          player.seek(80);
        }, 50);
      });

      // 鼠标悬浮播放
      card.addEventListener('mouseenter', () => {
        player.play();
      });

      card.addEventListener('mouseleave', () => {
        player.stop();
        player.seek(80);
      });

      // 创建名称标签
      const name = document.createElement('div');
      name.className = 'animation-card-name';
      name.textContent = filename.replace('.tgs', '');

      card.appendChild(preview);
      card.appendChild(name);

      // 点击事件
      card.addEventListener('click', function() {
        selectAnimationCard(layer, filename);
      });

      grid.appendChild(card);
    });
  });
}

// 选择动图卡片
function selectAnimationCard(layer, filename) {
  const grid = document.getElementById(`${layer}AnimationGrid`);
  if (!grid) return;

  // 移除所有选中状态
  grid.querySelectorAll('.animation-card').forEach(card => {
    card.classList.remove('selected');
  });

  // 添加选中状态
  const selectedCard = grid.querySelector(`[data-filename="${filename}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }

  // 保存设置
  saveAnimationSettings();
}

// 加载动效配置
function loadAnimationSettings() {
  chrome.storage.local.get(['knownSentenceAnimation'], (result) => {
    const config = result.knownSentenceAnimation || {
      topEnabled: true,
      topSrc: '气球.tgs',
      topCustom: false,
      topCustomData: null,
      bottomEnabled: false,
      bottomSrc: '气球子图.tgs',
      bottomCustom: false,
      bottomCustomData: null,
      width: 150,
      height: 150
    };

    // 设置顶层动图
    const topEnabled = document.getElementById('topAnimationEnabled');
    const topSettings = document.getElementById('topAnimationSettings');
    const topGrid = document.getElementById('topAnimationGrid');
    if (topEnabled) {
      topEnabled.checked = config.topEnabled;
      if (topSettings) {
        topSettings.style.display = config.topEnabled ? 'block' : 'none';
      }
    }
    if (topGrid) {
      if (config.topCustom && config.topCustomData) {
        // 显示自定义动图卡片
        addCustomAnimationCard('top', config.topSrc, config.topCustomData);
      } else {
        // 选中对应的预设卡片
        const selectedCard = topGrid.querySelector(`[data-filename="${config.topSrc}"]`);
        if (selectedCard) {
          selectedCard.classList.add('selected');
        }
      }
    }

    // 设置底层动图
    const bottomEnabled = document.getElementById('bottomAnimationEnabled');
    const bottomSettings = document.getElementById('bottomAnimationSettings');
    const bottomGrid = document.getElementById('bottomAnimationGrid');
    if (bottomEnabled) {
      bottomEnabled.checked = config.bottomEnabled;
      if (bottomSettings) {
        bottomSettings.style.display = config.bottomEnabled ? 'block' : 'none';
      }
    }
    if (bottomGrid) {
      if (config.bottomCustom && config.bottomCustomData) {
        // 显示自定义动图卡片
        addCustomAnimationCard('bottom', config.bottomSrc, config.bottomCustomData);
      } else {
        // 选中对应的预设卡片
        const selectedCard = bottomGrid.querySelector(`[data-filename="${config.bottomSrc}"]`);
        if (selectedCard) {
          selectedCard.classList.add('selected');
        }
      }
    }

    // 设置尺寸
    const widthInput = document.getElementById('animationWidth');
    const heightInput = document.getElementById('animationHeight');
    if (widthInput) widthInput.value = config.width;
    if (heightInput) heightInput.value = config.height;
  });
}

// 保存动效配置
function saveAnimationSettings() {
  const topEnabled = document.getElementById('topAnimationEnabled');
  const topGrid = document.getElementById('topAnimationGrid');
  const bottomEnabled = document.getElementById('bottomAnimationEnabled');
  const bottomGrid = document.getElementById('bottomAnimationGrid');
  const widthInput = document.getElementById('animationWidth');
  const heightInput = document.getElementById('animationHeight');

  chrome.storage.local.get(['knownSentenceAnimation'], (result) => {
    const config = result.knownSentenceAnimation || {};

    // 更新配置
    config.topEnabled = topEnabled ? topEnabled.checked : true;
    config.bottomEnabled = bottomEnabled ? bottomEnabled.checked : false;
    config.width = widthInput ? parseInt(widthInput.value) : 150;
    config.height = heightInput ? parseInt(heightInput.value) : 150;

    // 顶层动图 - 从选中的卡片获取
    if (topGrid) {
      const selectedCard = topGrid.querySelector('.animation-card.selected');
      if (selectedCard) {
        // 如果是自定义卡片，保持自定义状态
        if (selectedCard.dataset.custom === 'true') {
          // 自定义卡片的数据已经在上传时保存，这里不需要修改
        } else {
          // 预设卡片
          config.topSrc = selectedCard.dataset.filename;
          config.topCustom = false;
        }
      }
    }

    // 底层动图 - 从选中的卡片获取
    if (bottomGrid) {
      const selectedCard = bottomGrid.querySelector('.animation-card.selected');
      if (selectedCard) {
        // 如果是自定义卡片，保持自定义状态
        if (selectedCard.dataset.custom === 'true') {
          // 自定义卡片的数据已经在上传时保存，这里不需要修改
        } else {
          // 预设卡片
          config.bottomSrc = selectedCard.dataset.filename;
          config.bottomCustom = false;
        }
      }
    }

    chrome.storage.local.set({ knownSentenceAnimation: config }, () => {
      showAnimationSaveHint();
    });
  });
}

// 处理文件上传
function handleAnimationFileUpload(event, layer) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.name.endsWith('.tgs')) {
    alert(translate('tgsFormatOnly'));
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result;

    chrome.storage.local.get(['knownSentenceAnimation'], (result) => {
      const config = result.knownSentenceAnimation || {};

      if (layer === 'top') {
        config.topCustom = true;
        config.topCustomData = base64Data;
        config.topSrc = file.name;
      } else {
        config.bottomCustom = true;
        config.bottomCustomData = base64Data;
        config.bottomSrc = file.name;
      }

      chrome.storage.local.set({ knownSentenceAnimation: config }, () => {
        showAnimationSaveHint();
        console.log(translate('customAnimationSaved', { layer: layer === 'top' ? translate('topLayerAnimation') : translate('bottomLayerAnimation') }));

        // 添加自定义动图卡片到网格
        addCustomAnimationCard(layer, file.name, base64Data);
      });
    });
  };

  reader.readAsDataURL(file);
}

// 添加自定义动图卡片
function addCustomAnimationCard(layer, filename, base64Data) {
  const grid = document.getElementById(`${layer}AnimationGrid`);
  if (!grid) return;

  // 移除所有选中状态
  grid.querySelectorAll('.animation-card').forEach(card => {
    card.classList.remove('selected');
  });

  // 检查是否已存在自定义卡片
  let customCard = grid.querySelector('.animation-card[data-custom="true"]');

  if (!customCard) {
    // 创建新的自定义卡片
    customCard = document.createElement('div');
    customCard.className = 'animation-card';
    customCard.dataset.custom = 'true';
    customCard.dataset.layer = layer;

    const preview = document.createElement('div');
    preview.className = 'animation-card-preview';

    const name = document.createElement('div');
    name.className = 'animation-card-name';

    customCard.appendChild(preview);
    customCard.appendChild(name);

    // 点击事件
    customCard.addEventListener('click', function() {
      // 自定义卡片不需要调用selectAnimationCard，因为它已经是选中状态
    });

    grid.appendChild(customCard);
  }

  // 更新卡片内容
  const preview = customCard.querySelector('.animation-card-preview');
  const name = customCard.querySelector('.animation-card-name');

  preview.innerHTML = '';
  const player = document.createElement('tgs-player');
  player.setAttribute('mode', 'normal');
  player.setAttribute('src', base64Data);
  player.style.width = '80px';
  player.style.height = '80px';
  preview.appendChild(player);

  // 等待player完全准备好后设置默认帧
  player.addEventListener('ready', () => {
    setTimeout(() => {
      player.seek(30);
    }, 50);
  });

  // 鼠标悬浮播放
  customCard.addEventListener('mouseenter', () => {
    player.play();
  });

  customCard.addEventListener('mouseleave', () => {
    player.stop();
    player.seek(30);
  });

  name.textContent = filename.replace('.tgs', '') + ' (自定义)';

  // 选中这个卡片
  customCard.classList.add('selected');
}

// ============================
// 单词库操作功能
// ============================

// 计算数据库大小和例句数量
async function calculateDatabaseSize() {
  try {
    const db = await openDB();
    const transaction = db.transaction(["wordDetails"], "readonly");
    const store = transaction.objectStore("wordDetails");
    const allRecords = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // 计算总例句数量
    let totalSentences = 0;
    allRecords.forEach(record => {
      if (record.sentences && Array.isArray(record.sentences)) {
        totalSentences += record.sentences.length;
      }
    });

    // 估算数据库大小（通过JSON序列化）
    const dataSize = new Blob([JSON.stringify(allRecords)]).size;
    const sizeInMB = (dataSize / (1024 * 1024)).toFixed(2);

    // 更新UI
    document.getElementById('currentDbSize').textContent = `${sizeInMB} MB`;
    document.getElementById('totalSentences').textContent = totalSentences.toLocaleString();

    return { sizeInMB, totalSentences };
  } catch (error) {
    console.error('计算数据库大小失败:', error);
    document.getElementById('currentDbSize').textContent = '计算失败';
    document.getElementById('totalSentences').textContent = '计算失败';
    return null;
  }
}

// 执行例句删除操作
async function executeSentenceOperation() {
  const operation = document.querySelector('input[name="sentenceOperation"]:checked').value;
  const keepCount = parseInt(document.getElementById('sentenceKeepCount').value) || 0;

  // 确认操作
  const confirmMessage = operation === 'deleteAll'
    ? '确定要删除所有单词的例句吗？此操作不可撤销！'
    : `确定要将每个单词的例句保留为前 ${keepCount} 个吗？此操作不可撤销！`;

  if (!confirm(confirmMessage)) {
    return;
  }

  const resultDiv = document.getElementById('sentenceOperationResult');
  resultDiv.style.display = 'block';
  resultDiv.style.backgroundColor = 'rgba(0, 122, 255, 0.1)';
  resultDiv.style.border = '1px solid var(--primary-color)';
  resultDiv.innerHTML = '<p style="margin: 0;">正在处理，请稍候...</p>';

  try {
    const db = await openDB();
    const transaction = db.transaction(["wordDetails"], "readwrite");
    const store = transaction.objectStore("wordDetails");

    // 获取所有记录
    const allRecords = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    let processedCount = 0;
    let deletedSentencesCount = 0;
    const beforeSize = new Blob([JSON.stringify(allRecords)]).size;

    // 处理每个单词记录
    for (const record of allRecords) {
      if (record.sentences && Array.isArray(record.sentences) && record.sentences.length > 0) {
        const originalCount = record.sentences.length;

        if (operation === 'deleteAll') {
          // 删除所有例句
          record.sentences = [];
          deletedSentencesCount += originalCount;
        } else if (operation === 'keepN') {
          // 保留前N个例句
          if (record.sentences.length > keepCount) {
            const removed = record.sentences.length - keepCount;
            record.sentences = record.sentences.slice(0, keepCount);
            deletedSentencesCount += removed;
          }
        }

        // 更新记录
        await new Promise((resolve, reject) => {
          const updateRequest = store.put(record);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        });

        processedCount++;
      }
    }

    // 等待事务完成
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // 重新计算数据库大小
    const afterRecords = await new Promise((resolve, reject) => {
      const tx = db.transaction(["wordDetails"], "readonly");
      const st = tx.objectStore("wordDetails");
      const request = st.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const afterSize = new Blob([JSON.stringify(afterRecords)]).size;
    const savedSize = ((beforeSize - afterSize) / (1024 * 1024)).toFixed(2);

    // 显示结果
    resultDiv.style.backgroundColor = 'rgba(52, 199, 89, 0.1)';
    resultDiv.style.border = '1px solid var(--success-color)';
    resultDiv.innerHTML = `
      <p style="margin: 0 0 10px 0; font-weight: 600; color: var(--success-color);">操作完成！</p>
      <p style="margin: 5px 0;">处理单词数：${processedCount}</p>
      <p style="margin: 5px 0;">删除例句数：${deletedSentencesCount.toLocaleString()}</p>
      <p style="margin: 5px 0;">节省空间：约 ${savedSize} MB</p>
    `;

    // 刷新数据库信息
    await calculateDatabaseSize();

  } catch (error) {
    console.error('执行例句操作失败:', error);
    resultDiv.style.backgroundColor = 'rgba(255, 59, 48, 0.1)';
    resultDiv.style.border = '1px solid var(--danger-color)';
    resultDiv.innerHTML = `
      <p style="margin: 0; color: var(--danger-color);">操作失败：${error.message}</p>
    `;
  }
}

// 绑定单词库操作按钮事件
document.addEventListener('DOMContentLoaded', () => {
  const calculateBtn = document.getElementById('calculateDbSizeBtn');
  const executeBtn = document.getElementById('executeSentenceOperationBtn');

  if (calculateBtn) {
    calculateBtn.addEventListener('click', calculateDatabaseSize);
  }

  if (executeBtn) {
    executeBtn.addEventListener('click', executeSentenceOperation);
  }
});

// 显示保存提示
function showAnimationSaveHint() {
  const hint = document.getElementById('animationSaveHint');
  if (hint) {
    hint.style.display = 'block';
    setTimeout(() => {
      hint.style.display = 'none';
    }, 2000);
  }
}


// ============================================
// 云端数据库功能
// ============================================

// 打开自定义词组数据库
function openCustomPhrasesDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('customPhrasesDB', 1);

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('customPhrases')) {
        const store = db.createObjectStore('customPhrases', { keyPath: 'word' });
        store.createIndex('language', 'language', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

// 显示云端数据库状态消息
let cloudDbStatusTimer = null;  // 保存定时器引用，避免闪烁
function showCloudDbStatus(message, type = 'info') {
  const statusDiv = document.getElementById('cloudDbStatus');
  if (!statusDiv) return;

  // 清除之前的定时器，避免闪烁
  if (cloudDbStatusTimer) {
    clearTimeout(cloudDbStatusTimer);
    cloudDbStatusTimer = null;
  }

  statusDiv.style.display = 'block';
  statusDiv.textContent = message;

  // 根据类型设置样式
  if (type === 'success') {
    statusDiv.style.backgroundColor = 'rgba(52, 199, 89, 0.1)';
    statusDiv.style.borderColor = 'var(--success-color)';
    statusDiv.style.color = 'var(--success-color)';
  } else if (type === 'error') {
    statusDiv.style.backgroundColor = 'rgba(255, 59, 48, 0.1)';
    statusDiv.style.borderColor = 'var(--danger-color)';
    statusDiv.style.color = 'var(--danger-color)';
  } else if (type === 'warning') {
    statusDiv.style.backgroundColor = 'rgba(255, 204, 0, 0.1)';
    statusDiv.style.borderColor = 'var(--warning-color)';
    statusDiv.style.color = 'var(--warning-color)';
  } else {
    statusDiv.style.backgroundColor = 'rgba(0, 122, 255, 0.1)';
    statusDiv.style.borderColor = 'var(--primary-color)';
    statusDiv.style.color = 'var(--primary-color)';
  }

  // 成功消息3秒后自动隐藏，info/warning进度消息不自动隐藏
  if (type === 'success') {
    cloudDbStatusTimer = setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}

// 更新自定义服务器链接
function updateCustomServerLink() {
  chrome.storage.local.get(['cloudConfig'], (result) => {
    const config = result.cloudConfig || {};
    const customServerStatus = document.getElementById('customServerStatus');
    const customServerLink = document.getElementById('customServerLink');
    
    if (config.selfHosted && config.serverURL) {
      const serverURL = config.serverURL.replace(/\/$/, '');
      const dashboardURL = `${serverURL}/dashboard/`;
      customServerLink.href = dashboardURL;
      customServerLink.textContent = dashboardURL;
      customServerLink.style.display = 'block';
      customServerStatus.style.display = 'none';
    } else {
      customServerLink.style.display = 'none';
      customServerStatus.style.display = 'block';
      if (config.selfHosted) {
        customServerStatus.textContent = translate('customServerNotConfigured');
      } else {
        customServerStatus.textContent = translate('customServerNotEnabled');
      }
    }
  });
}

// 更新登录状态显示
async function updateCloudLoginStatus() {
  const loginStatus = document.getElementById('cloudLoginStatus');
  const loginForm = document.getElementById('cloudLoginForm');
  const registerForm = document.getElementById('cloudRegisterForm');
  const loggedInActions = document.getElementById('cloudLoggedInActions');
  const afdianOAuthSection = document.getElementById('cloudAfdianOAuthSection');

  try {
    await window.cloudAPI.init();

    if (window.cloudAPI.token) {
      // 已登录，先从本地获取用户名
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['cloudConfig'], resolve);
      });

      const localUsername = result.cloudConfig?.username || 'Unknown User';
      const isSelfHosted = result.cloudConfig?.selfHosted === true;
      const afdianUserId = result.cloudConfig?.afdianUserId || '';

      // 检查本地订阅是否到期
      const localExpireTime = result.cloudConfig?.subscriptionExpireAt;
      let isLocalExpired = false;
      if (localExpireTime) {
        const now = new Date();
        const expireDate = new Date(localExpireTime);
        isLocalExpired = now > expireDate;
      }

      // 如果本地订阅到期，显示提示
      if (isLocalExpired && !isSelfHosted) {
        showCloudDbStatus('⚠️ 订阅已到期，正在自动更新...', 'warning');
      }

      // 已登录时隐藏 OAuth 登录按钮
      if (afdianOAuthSection) {
        afdianOAuthSection.style.display = 'none';
      }

      // 尝试获取服务器用户信息
      try {
        const response = await window.cloudAPI.getUserInfo();

        if (response.success) {
          const userData = response.data;

          // 显示登录状态（使用服务器数据）
          document.getElementById('cloudUsername').textContent = userData.username;
          document.getElementById('cloudSubscriptionStatus').textContent = userData.subscriptionStatus;

          const expireDate = new Date(userData.subscriptionExpireAt);
          document.getElementById('cloudExpiresAt').textContent = expireDate.toLocaleDateString();

          // 显示数据服务器
          document.getElementById('cloudDataServer').textContent = userData.dataServer || '-';

          // 显示存储使用情况
          const storageUsed = userData.wordCount || 0;
          const storageLimit = userData.wordLimit || 20000;
          const storagePercent = storageLimit > 0 ? ((storageUsed / storageLimit) * 100).toFixed(1) : 0;
          document.getElementById('cloudStorage').textContent = `${storageUsed} / ${storageLimit} (${storagePercent}%)`;

          loginStatus.style.display = 'block';
          loginForm.style.display = 'none';
          registerForm.style.display = 'none';
          loggedInActions.style.display = 'block';

          // 将云端用户信息同步到本地存储
          const localResult = await new Promise(resolve => {
            chrome.storage.local.get(['cloudConfig'], resolve);
          });
          const cloudConfig = localResult.cloudConfig || {};
          cloudConfig.username = userData.username;
          cloudConfig.subscriptionStatus = userData.subscriptionStatus;
          cloudConfig.subscriptionExpireAt = userData.subscriptionExpireAt;
          cloudConfig.wordCount = userData.wordCount;
          cloudConfig.wordLimit = userData.wordLimit;
          cloudConfig.dataServer = userData.dataServer;
          if (userData.afdianPlanName) {
            cloudConfig.afdianPlanName = userData.afdianPlanName;
          }
          if (userData.externalSubscription?.afdianUserId) {
            cloudConfig.afdianUserId = userData.externalSubscription.afdianUserId;
          }
          await chrome.storage.local.set({ cloudConfig });
          console.log('[CloudDB] Synced user info to local storage:', {
            username: userData.username,
            subscriptionStatus: userData.subscriptionStatus,
            subscriptionExpireAt: userData.subscriptionExpireAt,
            wordLimit: userData.wordLimit
          });

          // 如果之前检测到本地订阅到期，显示更新成功提示
          if (isLocalExpired && !isSelfHosted) {
            const newExpireDate = new Date(userData.subscriptionExpireAt).toLocaleDateString();
            showCloudDbStatus(`✅ 订阅状态已更新，新到期时间：${newExpireDate}`, 'success');
          }

          // 根据用户类型显示/隐藏爱发电功能
          const afdianSection = document.getElementById('cloudAfdianSection');
          const afdianIdRow = document.getElementById('cloudAfdianIdRow');
          const planNameRow = document.getElementById('cloudPlanNameRow');
          console.log('[CloudDB] userData.isSelfHosted:', userData.isSelfHosted);
          console.log('[CloudDB] afdianSection element:', afdianSection);

          if (userData.isSelfHosted === true) {
            // 自建服务器用户：隐藏爱发电功能，但显示订阅信息
            console.log('[CloudDB] Hiding Afdian section for self-hosted user');
            if (afdianSection) {
              afdianSection.style.display = 'none';
            }
            if (afdianIdRow) afdianIdRow.style.display = 'none';
            if (planNameRow) planNameRow.style.display = 'none';
            // 显示订阅状态和到期时间（自建用户显示 localhost 和永久有效）
            const subscriptionRow = document.getElementById('cloudSubscriptionStatus')?.closest('p');
            const expiresRow = document.getElementById('cloudExpiresAt')?.closest('p');
            if (subscriptionRow) subscriptionRow.style.display = 'block';
            if (expiresRow) expiresRow.style.display = 'block';
          } else {
            // 官方服务器用户：显示爱发电功能和订阅信息
            console.log('[CloudDB] Showing Afdian section for official user');
            if (afdianSection) {
              afdianSection.style.display = 'block';
            }
            // 显示订阅状态和到期时间
            const subscriptionRow = document.getElementById('cloudSubscriptionStatus')?.closest('p');
            const expiresRow = document.getElementById('cloudExpiresAt')?.closest('p');
            if (subscriptionRow) subscriptionRow.style.display = 'block';
            if (expiresRow) expiresRow.style.display = 'block';

            // 显示Afdian ID和计划名称
            if (afdianIdRow) afdianIdRow.style.display = 'block';
            if (planNameRow) planNameRow.style.display = 'block';
            document.getElementById('cloudAfdianId').textContent = userData.externalSubscription?.afdianUserId || result.cloudConfig?.afdianUserId || '-';
            document.getElementById('cloudPlanName').textContent = userData.afdianPlanName || '-';
          }
        } else {
          // API 调用失败，但有 token，显示本地存储的信息
          console.warn('[CloudDB] API call failed, showing local data');
          document.getElementById('cloudUsername').textContent = localUsername;
          document.getElementById('cloudSubscriptionStatus').textContent = result.cloudConfig?.subscriptionStatus || 'Unknown';
          
          const expireTime = result.cloudConfig?.subscriptionExpireAt;
          document.getElementById('cloudExpiresAt').textContent = expireTime ? new Date(expireTime).toLocaleDateString() : 'Unknown';
          
          document.getElementById('cloudDataServer').textContent = result.cloudConfig?.dataServer || '-';
          
          const storageUsed = result.cloudConfig?.wordCount || 0;
          const storageLimit = result.cloudConfig?.wordLimit || 20000;
          const storagePercent = storageLimit > 0 ? ((storageUsed / storageLimit) * 100).toFixed(1) : 0;
          document.getElementById('cloudStorage').textContent = `${storageUsed} / ${storageLimit} (${storagePercent}%)`;

          loginStatus.style.display = 'block';
          loginForm.style.display = 'none';
          registerForm.style.display = 'none';
          loggedInActions.style.display = 'block';

          // 根据 selfHosted 标志隐藏/显示爱发电功能
          const afdianSection = document.getElementById('cloudAfdianSection');
          const afdianIdRow = document.getElementById('cloudAfdianIdRow');
          const planNameRow = document.getElementById('cloudPlanNameRow');
          
          if (isSelfHosted) {
            if (afdianSection) afdianSection.style.display = 'none';
            if (afdianIdRow) afdianIdRow.style.display = 'none';
            if (planNameRow) planNameRow.style.display = 'none';
          } else {
            if (afdianSection) afdianSection.style.display = 'block';
            if (afdianIdRow) afdianIdRow.style.display = 'block';
            if (planNameRow) planNameRow.style.display = 'block';
            document.getElementById('cloudAfdianId').textContent = afdianUserId || '-';
            document.getElementById('cloudPlanName').textContent = result.cloudConfig?.afdianPlanName || '-';
          }
        }
      } catch (apiError) {
        // 网络错误或服务器错误，但有 token，显示本地存储的信息
        console.warn('[CloudDB] Failed to fetch user info, showing local data:', apiError);
        document.getElementById('cloudUsername').textContent = localUsername;
        document.getElementById('cloudSubscriptionStatus').textContent = result.cloudConfig?.subscriptionStatus || 'Offline';
        
        const expireTime = result.cloudConfig?.subscriptionExpireAt;
        document.getElementById('cloudExpiresAt').textContent = expireTime ? new Date(expireTime).toLocaleDateString() : 'Unknown';
        
        document.getElementById('cloudDataServer').textContent = result.cloudConfig?.dataServer || '-';
        
        const storageUsed = result.cloudConfig?.wordCount || 0;
        const storageLimit = result.cloudConfig?.wordLimit || 20000;
        const storagePercent = storageLimit > 0 ? ((storageUsed / storageLimit) * 100).toFixed(1) : 0;
        document.getElementById('cloudStorage').textContent = `${storageUsed} / ${storageLimit} (${storagePercent}%)`;

        loginStatus.style.display = 'block';
        loginForm.style.display = 'none';
        registerForm.style.display = 'none';
        loggedInActions.style.display = 'block';

        // 根据 selfHosted 标志隐藏/显示爱发电功能
        const afdianSection = document.getElementById('cloudAfdianSection');
        const afdianIdRow = document.getElementById('cloudAfdianIdRow');
        const planNameRow = document.getElementById('cloudPlanNameRow');
        
        if (isSelfHosted) {
          if (afdianSection) afdianSection.style.display = 'none';
          if (afdianIdRow) afdianIdRow.style.display = 'none';
          if (planNameRow) planNameRow.style.display = 'none';
        } else {
          if (afdianSection) afdianSection.style.display = 'block';
          if (afdianIdRow) afdianIdRow.style.display = 'block';
          if (planNameRow) planNameRow.style.display = 'block';
          document.getElementById('cloudAfdianId').textContent = afdianUserId || '-';
          document.getElementById('cloudPlanName').textContent = result.cloudConfig?.afdianPlanName || '-';
        }
      }
    } else {
      // 未登录
      loginStatus.style.display = 'none';
      loggedInActions.style.display = 'none';

      // 未登录时，根据 selfHosted 设置控制登录表单显示
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['cloudConfig'], resolve);
      });
      const isSelfHosted = result.cloudConfig?.selfHosted === true;

      if (isSelfHosted) {
        // 自建模式：显示用户名/密码登录表单，隐藏爱发电 OAuth 登录
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        if (afdianOAuthSection) {
          afdianOAuthSection.style.display = 'none';
          console.log('[CloudDB] Hiding Afdian OAuth for self-hosted mode');
        }
      } else {
        // 官方模式：显示爱发电 OAuth 登录，隐藏用户名/密码登录表单和注册表单
        loginForm.style.display = 'none';
        registerForm.style.display = 'none';
        if (afdianOAuthSection) {
          afdianOAuthSection.style.display = 'block';
          console.log('[CloudDB] Showing Afdian OAuth for official mode');
        }
      }
    }
  } catch (error) {
    console.error('[CloudDB] Update login status error:', error);
    loginStatus.style.display = 'none';
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    loggedInActions.style.display = 'none';

    // 错误时也要控制 OAuth 登录按钮
    if (afdianOAuthSection) {
      afdianOAuthSection.style.display = 'none';
    }
  }
}

// 登录
async function cloudLogin() {
  const username = document.getElementById('cloudLoginUsername').value.trim();
  const password = document.getElementById('cloudLoginPassword').value;

  if (!username || !password) {
    showCloudDbStatus('Please enter username and password', 'error');
    return;
  }

  try {
    showCloudDbStatus('Logging in...', 'info');

    // 先从 storage 加载最新配置
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['cloudConfig'], resolve);
    });

    const isSelfHosted = result.cloudConfig?.selfHosted === true;

    // 如果是自建模式，检查是否配置了服务器地址
    if (isSelfHosted) {
      const serverURL = result.cloudConfig?.serverURL;
      if (!serverURL) {
        showCloudDbStatus('Please configure server URL first', 'error');
        return;
      }
    }

    // 重新初始化 cloudAPI（确保使用最新配置）
    await window.cloudAPI.init();

    const response = await window.cloudAPI.login(username, password);

    if (response.success) {
      showCloudDbStatus('Login successful!', 'success');
      await updateCloudLoginStatus();

      // 清空密码
      document.getElementById('cloudLoginPassword').value = '';
    } else {
      showCloudDbStatus(`Login failed: ${response.message}`, 'error');
    }
  } catch (error) {
    console.error('[CloudDB] Login error:', error);
    showCloudDbStatus(`Login error: ${error.message}`, 'error');
  }
}

// 注册
async function cloudRegister() {
  const username = document.getElementById('cloudRegUsername').value.trim();
  const email = document.getElementById('cloudRegEmail').value.trim();
  const password = document.getElementById('cloudRegPassword').value;

  if (!username || !email || !password) {
    showCloudDbStatus('Please fill in all fields', 'error');
    return;
  }

  if (password.length < 6) {
    showCloudDbStatus('Password must be at least 6 characters', 'error');
    return;
  }

  try {
    showCloudDbStatus('Creating account...', 'info');

    // 先从 storage 加载最新配置
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['cloudConfig'], resolve);
    });

    const isSelfHosted = result.cloudConfig?.selfHosted === true;

    // 如果是自建模式，检查是否配置了服务器地址
    if (isSelfHosted) {
      const serverURL = result.cloudConfig?.serverURL;
      if (!serverURL) {
        showCloudDbStatus('Please configure server URL first', 'error');
        return;
      }
    }

    // 重新初始化 cloudAPI（确保使用最新配置）
    await window.cloudAPI.init();

    const response = await window.cloudAPI.register(username, email, password);

    if (response.success) {
      showCloudDbStatus('Account created successfully!', 'success');

      // 清空表单
      document.getElementById('cloudRegUsername').value = '';
      document.getElementById('cloudRegEmail').value = '';
      document.getElementById('cloudRegPassword').value = '';

      // 注册成功后自动登录，更新登录状态（会隐藏登录/注册表单）
      await updateCloudLoginStatus();
    } else {
      showCloudDbStatus(`Registration failed: ${response.message}`, 'error');
    }
  } catch (error) {
    console.error('[CloudDB] Register error:', error);
    showCloudDbStatus(`Registration error: ${error.message}`, 'error');
  }
}

// 登出
async function cloudLogout() {
  try {
    await window.cloudAPI.saveConfig({ token: '', username: '' });
    showCloudDbStatus('Logged out successfully', 'success');
    await updateCloudLoginStatus();
  } catch (error) {
    console.error('[CloudDB] Logout error:', error);
    showCloudDbStatus(`Logout error: ${error.message}`, 'error');
  }
}

// 刷新用户信息
async function cloudRefreshInfo() {
  try {
    showCloudDbStatus('Refreshing user info...', 'info');
    await updateCloudLoginStatus();
    showCloudDbStatus('User info refreshed', 'success');
  } catch (error) {
    console.error('[CloudDB] Refresh info error:', error);
    showCloudDbStatus(`Refresh error: ${error.message}`, 'error');
  }
}

async function cloudAfdianOAuthLogin() {
  try {
    showCloudDbStatus('Opening registration page...', 'info');
    console.log('[Afdian OAuth] Opening registration page...');

    const registerUrl = 'https://dashboard.lingkuma.org/dashboard/register';
    console.log('[Afdian OAuth] Register URL:', registerUrl);

    setTimeout(() => {
      window.open(registerUrl, '_blank');
    }, 100);

    const storageListener = (changes, areaName) => {
      console.log('[Afdian OAuth] Storage changed:', changes, 'Area:', areaName);
      if (areaName === 'local' && changes.cloudConfig) {
        console.log('[Afdian OAuth] cloudConfig changed:', changes.cloudConfig);
        chrome.storage.onChanged.removeListener(storageListener);
        showCloudDbStatus('Login successful!', 'success');
        updateCloudLoginStatus();
      }
    };

    chrome.storage.onChanged.addListener(storageListener);
    console.log('[Afdian OAuth] Storage listener added');

    showCloudDbStatus('Opening registration page...', 'success');
  } catch (error) {
    console.error('[CloudDB] Open registration page error:', error);
    showCloudDbStatus(`Error: ${error.message}`, 'error');
  }
}

// 刷新爱发电订阅状态
async function cloudRefreshAfdian() {
  try {
    showCloudDbStatus('Refreshing subscription status...', 'info');

    const result = await new Promise(resolve => {
      chrome.storage.local.get(['cloudConfig'], resolve);
    });

    const afdianUserId = result.cloudConfig?.afdianUserId || result.cloudConfig?.externalSubscription?.afdianUserId;

    if (!afdianUserId) {
      showCloudDbStatus('No Afdian account bound', 'error');
      return;
    }

    const response = await window.cloudAPI.verifyAfdian(afdianUserId);

    if (response.success) {
      const data = response.data;

      showCloudDbStatus(`✅ 订阅状态已更新`, 'success');

      if (data.wordLimit !== undefined || data.wordCount !== undefined) {
        const cloudConfig = result.cloudConfig || {};
        cloudConfig.wordLimit = data.wordLimit;
        cloudConfig.wordCount = data.wordCount;
        await chrome.storage.local.set({ cloudConfig });
        console.log('[Afdian] Updated wordLimit:', data.wordLimit, 'wordCount:', data.wordCount);
      }

      if (data.subscriptionExpireAt !== undefined || data.subscriptionStatus !== undefined) {
        const cloudConfig = result.cloudConfig || {};
        if (data.subscriptionExpireAt !== undefined) {
          cloudConfig.subscriptionExpireAt = data.subscriptionExpireAt;
        }
        if (data.subscriptionStatus !== undefined) {
          cloudConfig.subscriptionStatus = data.subscriptionStatus;
        }
        if (data.afdianPlanName !== undefined) {
          cloudConfig.afdianPlanName = data.afdianPlanName;
        }
        await chrome.storage.local.set({ cloudConfig });
        console.log('[Afdian] Updated subscriptionExpireAt:', data.subscriptionExpireAt, 'subscriptionStatus:', data.subscriptionStatus);
      }

      await updateCloudLoginStatus();
    } else {
      showCloudDbStatus(`Failed to verify Afdian: ${response.message}`, 'error');
    }
  } catch (error) {
    console.error('[CloudDB] Refresh Afdian error:', error);
    showCloudDbStatus(`Refresh Afdian error: ${error.message}`, 'error');
  }
}

// 数据迁移：本地 → 云端（合并）
async function cloudMigrateLocalToCloud() {
  if (!confirm('This will upload all local words and custom phrases to the cloud (merge mode). Continue?')) {
    return;
  }

  try {
    showCloudDbStatus('Uploading local database to cloud...', 'info');

    // 获取所有本地单词
    const db = await openDB();
    const transaction = db.transaction(["wordDetails"], "readonly");
    const store = transaction.objectStore("wordDetails");

    const allWords = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    console.log(`[CloudDB] Found ${allWords.length} words in local database`);

    const JAN_1_2023 = new Date('2023-01-01T00:00:00.000Z').getTime();
    const TODAY_JAN_2 = new Date(new Date().getFullYear(), 0, 2).getTime();

    allWords.forEach(word => {
      let hasValidCreateTimeInHistory = false;
      let latestCreateTime = 0;

      if (word.statusHistory && typeof word.statusHistory === 'object') {
        ['1', '2', '3', '4', '5'].forEach(statusKey => {
          const statusEntry = word.statusHistory[statusKey];
          if (statusEntry && typeof statusEntry.createTime === 'number' && statusEntry.createTime > 0) {
            hasValidCreateTimeInHistory = true;
            if (statusEntry.createTime > latestCreateTime) {
              latestCreateTime = statusEntry.createTime;
            }
          }
        });
      }

      if (hasValidCreateTimeInHistory) {
        if (!word.createdAt) {
          word.createdAt = latestCreateTime;
        } else {
          const existingCreatedAt = new Date(word.createdAt).getTime();
          if (existingCreatedAt < JAN_1_2023) {
            word.createdAt = latestCreateTime;
          }
        }
      } else {
        if (!word.createdAt) {
          word.createdAt = TODAY_JAN_2;
        } else {
          const existingCreatedAt = new Date(word.createdAt).getTime();
          if (existingCreatedAt < JAN_1_2023) {
            word.createdAt = TODAY_JAN_2;
          }
        }
      }
    });

    console.log(`[CloudDB] Processed createdAt for ${allWords.length} words`);

    allWords.forEach(word => {
      if (word.statusHistory && typeof word.statusHistory === 'object') {
        ['1', '2', '3', '4', '5'].forEach(statusKey => {
          const statusEntry = word.statusHistory[statusKey];
          if (statusEntry) {
            if (typeof statusEntry.createTime === 'number' && statusEntry.createTime > 0) {
              word[`state${statusKey}CreateTime`] = statusEntry.createTime;
            }
            if (typeof statusEntry.updateTime === 'number' && statusEntry.updateTime > 0) {
              word[`state${statusKey}UpdateTime`] = statusEntry.updateTime;
            }
          }
        });
      }
    });

    console.log(`[CloudDB] Converted statusHistory to top-level fields for ${allWords.length} words`);

    const wordsToUpload = allWords.map(w => {
      const { _id, __v, ...wordData } = w;
      return wordData;
    });
    console.log(`[CloudDB] Removed _id and __v from ${wordsToUpload.length} words before upload`);

    // 批量上传单词到云端
    const wordsResponse = await window.cloudAPI.batchSyncWords(wordsToUpload, 'merge');

    // 获取所有本地自定义词组
    const phrasesDB = await openCustomPhrasesDB();
    const phrasesTransaction = phrasesDB.transaction(["customPhrases"], "readonly");
    const phrasesStore = phrasesTransaction.objectStore("customPhrases");

    const allPhrases = await new Promise((resolve, reject) => {
      const request = phrasesStore.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    console.log(`[CloudDB] Found ${allPhrases.length} custom phrases in local database`);

    const phrasesToUpload = allPhrases.map(p => {
      const { _id, __v, ...phraseData } = p;
      return phraseData;
    });
    console.log(`[CloudDB] Removed _id and __v from ${phrasesToUpload.length} phrases before upload`);

    // 批量上传自定义词组到云端
    let phrasesResponse = { success: true, stats: { created: 0, updated: 0, skipped: 0 } };
    if (phrasesToUpload.length > 0) {
      phrasesResponse = await window.cloudAPI.batchSyncPhrases(phrasesToUpload, 'merge');
    }

    if (wordsResponse.success && phrasesResponse.success) {
      showCloudDbStatus(
        `Upload complete! Words - Created: ${wordsResponse.stats.created}, Updated: ${wordsResponse.stats.updated}, Skipped: ${wordsResponse.stats.skipped}; Phrases - Created: ${phrasesResponse.stats.created}, Updated: ${phrasesResponse.stats.updated}, Skipped: ${phrasesResponse.stats.skipped}`,
        'success'
      );
    } else {
      showCloudDbStatus(`Upload failed: ${wordsResponse.message || phrasesResponse.message}`, 'error');
    }
  } catch (error) {
    console.error('[CloudDB] Migrate local to cloud error:', error);
    showCloudDbStatus(`Migration error: ${error.message}`, 'error');
  }
}

// 数据迁移：本地 → 云端（替换）
async function cloudMigrateLocalToCloudReplace() {
  if (!confirm('⚠️ WARNING: This will REPLACE all cloud data (words and custom phrases) with local data. This cannot be undone! Continue?')) {
    return;
  }

  try {
    showCloudDbStatus('Replacing cloud database with local data...', 'info');

    // 获取所有本地单词
    const db = await openDB();
    const transaction = db.transaction(["wordDetails"], "readonly");
    const store = transaction.objectStore("wordDetails");

    const allWords = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    console.log(`[CloudDB] Found ${allWords.length} words to upload`);

    const JAN_1_2023 = new Date('2023-01-01T00:00:00.000Z').getTime();
    const TODAY_JAN_2 = new Date(new Date().getFullYear(), 0, 2).getTime();

    allWords.forEach(word => {
      let hasValidCreateTimeInHistory = false;
      let latestCreateTime = 0;

      if (word.statusHistory && typeof word.statusHistory === 'object') {
        ['1', '2', '3', '4', '5'].forEach(statusKey => {
          const statusEntry = word.statusHistory[statusKey];
          if (statusEntry && typeof statusEntry.createTime === 'number' && statusEntry.createTime > 0) {
            hasValidCreateTimeInHistory = true;
            if (statusEntry.createTime > latestCreateTime) {
              latestCreateTime = statusEntry.createTime;
            }
          }
        });
      }

      if (hasValidCreateTimeInHistory) {
        if (!word.createdAt) {
          word.createdAt = latestCreateTime;
        } else {
          const existingCreatedAt = new Date(word.createdAt).getTime();
          if (existingCreatedAt < JAN_1_2023) {
            word.createdAt = latestCreateTime;
          }
        }
      } else {
        if (!word.createdAt) {
          word.createdAt = TODAY_JAN_2;
        } else {
          const existingCreatedAt = new Date(word.createdAt).getTime();
          if (existingCreatedAt < JAN_1_2023) {
            word.createdAt = TODAY_JAN_2;
          }
        }
      }
    });

    console.log(`[CloudDB] Processed createdAt for ${allWords.length} words`);

    allWords.forEach(word => {
      if (word.statusHistory && typeof word.statusHistory === 'object') {
        ['1', '2', '3', '4', '5'].forEach(statusKey => {
          const statusEntry = word.statusHistory[statusKey];
          if (statusEntry) {
            if (typeof statusEntry.createTime === 'number' && statusEntry.createTime > 0) {
              word[`state${statusKey}CreateTime`] = statusEntry.createTime;
            }
            if (typeof statusEntry.updateTime === 'number' && statusEntry.updateTime > 0) {
              word[`state${statusKey}UpdateTime`] = statusEntry.updateTime;
            }
          }
        });
      }
    });

    console.log(`[CloudDB] Converted statusHistory to top-level fields for ${allWords.length} words`);

    const wordsToUpload = allWords.map(w => {
      const { _id, __v, ...wordData } = w;
      return wordData;
    });
    console.log(`[CloudDB] Removed _id and __v from ${wordsToUpload.length} words before upload`);

    // 分批上传单词（避免请求超时和数据过大）
    const BATCH_SIZE = 5000; // 每批5000个单词
    let totalCreated = 0;

    for (let i = 0; i < wordsToUpload.length; i += BATCH_SIZE) {
      const batch = wordsToUpload.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(wordsToUpload.length / BATCH_SIZE);
      const isFirstBatch = (i === 0);

      showCloudDbStatus(`Uploading words batch ${batchNum}/${totalBatches} (${batch.length} words)...`, 'info');
      console.log(`[CloudDB] Uploading batch ${batchNum}/${totalBatches}: ${batch.length} words, clearFirst: ${isFirstBatch}`);

      // 所有批次都用replace模式，但只有第一批会删除旧数据
      const wordsResponse = await window.cloudAPI.batchSyncWords(batch, 'replace', isFirstBatch);

      if (!wordsResponse.success) {
        throw new Error(`Batch ${batchNum} failed: ${wordsResponse.message}`);
      }

      console.log(`[CloudDB] Batch ${batchNum} response:`, wordsResponse.stats);
      totalCreated += wordsResponse.stats.created;
      console.log(`[CloudDB] Total created so far: ${totalCreated}`);
    }

    console.log(`[CloudDB] All words uploaded: ${totalCreated}`);

    // 获取所有本地自定义词组
    const phrasesDB = await openCustomPhrasesDB();
    const phrasesTransaction = phrasesDB.transaction(["customPhrases"], "readonly");
    const phrasesStore = phrasesTransaction.objectStore("customPhrases");

    const allPhrases = await new Promise((resolve, reject) => {
      const request = phrasesStore.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    let totalPhrasesCreated = 0;
    if (allPhrases.length > 0) {
      console.log(`[CloudDB] Found ${allPhrases.length} phrases to upload`);
      showCloudDbStatus('Uploading custom phrases...', 'info');

      const phrasesToUpload = allPhrases.map(p => {
        const { _id, __v, ...phraseData } = p;
        return phraseData;
      });
      console.log(`[CloudDB] Removed _id and __v from ${phrasesToUpload.length} phrases before upload`);

      const phrasesResponse = await window.cloudAPI.batchSyncPhrases(phrasesToUpload, 'replace');
      if (!phrasesResponse.success) {
        throw new Error(`Phrases upload failed: ${phrasesResponse.message}`);
      }
      totalPhrasesCreated = phrasesResponse.stats.created;
    }

    showCloudDbStatus(
      `Cloud database replaced! Total words: ${totalCreated}, Total phrases: ${totalPhrasesCreated}`,
      'success'
    );
  } catch (error) {
    console.error('[CloudDB] Replace cloud error:', error);
    showCloudDbStatus(`Replace error: ${error.message}`, 'error');
  }
}

// 数据迁移：云端 → 本地（合并）
async function cloudMigrateCloudToLocal() {
  if (!confirm('This will download all cloud words and custom phrases and merge with local database. Continue?')) {
    return;
  }

  try {
    showCloudDbStatus('Downloading cloud database (0%)...', 'info');

    // 使用分页获取所有云端单词
    const wordsResponse = await window.cloudAPI.getAllWordsPaginated({
      limit: 500,
      onProgress: (downloaded, total) => {
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        showCloudDbStatus(`Downloading words: ${downloaded}/${total} (${percent}%)...`, 'info');
      }
    });

    if (!wordsResponse.success || !wordsResponse.data) {
      showCloudDbStatus(`Failed to fetch cloud words: ${wordsResponse.error || 'Unknown error'}`, 'error');
      return;
    }

    const cloudWords = wordsResponse.data;
    console.log(`[CloudDB] Downloaded ${cloudWords.length} words from cloud database`);

    showCloudDbStatus(`Merging ${cloudWords.length} words to local database...`, 'info');

    // 合并单词到本地数据库
    const db = await openDB();
    let wordsCreated = 0;
    let wordsUpdated = 0;

    // 分批处理以避免事务超时
    const BATCH_SIZE = 100;
    for (let i = 0; i < cloudWords.length; i += BATCH_SIZE) {
      const batch = cloudWords.slice(i, i + BATCH_SIZE);
      const transaction = db.transaction(["wordDetails"], "readwrite");
      const store = transaction.objectStore("wordDetails");

      for (const wordData of batch) {
        const existing = await new Promise((resolve) => {
          const request = store.get(wordData.word);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        });

        if (existing) {
          // 合并数据
          const merged = { ...existing, ...wordData };
          await new Promise((resolve, reject) => {
            const request = store.put(merged);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          wordsUpdated++;
        } else {
          // 新增
          await new Promise((resolve, reject) => {
            const request = store.add(wordData);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          wordsCreated++;
        }
      }

      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      // 更新进度
      const mergePercent = Math.round(((i + batch.length) / cloudWords.length) * 100);
      showCloudDbStatus(`Merging words: ${i + batch.length}/${cloudWords.length} (${mergePercent}%)...`, 'info');
    }

    // 获取所有云端自定义词组
    const phrasesResponse = await window.cloudAPI.getAllPhrases();

    if (!phrasesResponse.success || !phrasesResponse.data) {
      console.warn('[CloudDB] Failed to fetch cloud phrases, skipping...');
    } else {
      const cloudPhrases = phrasesResponse.data;
      console.log(`[CloudDB] Found ${cloudPhrases.length} custom phrases in cloud database`);

      // 合并自定义词组到本地数据库
      const phrasesDB = await openCustomPhrasesDB();
      const phrasesTransaction = phrasesDB.transaction(["customPhrases"], "readwrite");
      const phrasesStore = phrasesTransaction.objectStore("customPhrases");

      let phrasesCreated = 0;
      let phrasesUpdated = 0;

      for (const phraseData of cloudPhrases) {
        const existing = await new Promise((resolve) => {
          const request = phrasesStore.get(phraseData.word);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        });

        if (existing) {
          // 合并数据
          const merged = { ...existing, ...phraseData };
          await new Promise((resolve, reject) => {
            const request = phrasesStore.put(merged);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          phrasesUpdated++;
        } else {
          // 新增
          await new Promise((resolve, reject) => {
            const request = phrasesStore.add(phraseData);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          phrasesCreated++;
        }
      }

      await new Promise((resolve, reject) => {
        phrasesTransaction.oncomplete = () => resolve();
        phrasesTransaction.onerror = () => reject(phrasesTransaction.error);
      });

      showCloudDbStatus(
        `Download complete! Words - Created: ${wordsCreated}, Updated: ${wordsUpdated}; Phrases - Created: ${phrasesCreated}, Updated: ${phrasesUpdated}`,
        'success'
      );
      // 下载成功后重建词组数据库
      chrome.runtime.sendMessage({ action: "resetPhrasesDatabase" }, function(phrasesResponse) {
        if (phrasesResponse && phrasesResponse.success) {
          console.log("词组数据库重建成功");
        } else {
          console.error("词组数据库重建失败:", phrasesResponse && phrasesResponse.error);
        }
      });
    }

    if (!phrasesResponse || !phrasesResponse.success) {
      showCloudDbStatus(
        `Download complete! Words - Created: ${wordsCreated}, Updated: ${wordsUpdated}`,
        'success'
      );
      // 下载成功后重建词组数据库
      chrome.runtime.sendMessage({ action: "resetPhrasesDatabase" }, function(phrasesResponse) {
        if (phrasesResponse && phrasesResponse.success) {
          console.log("词组数据库重建成功");
        } else {
          console.error("词组数据库重建失败:", phrasesResponse && phrasesResponse.error);
        }
      });
    }
  } catch (error) {
    console.error('[CloudDB] Migrate cloud to local error:', error);
    showCloudDbStatus(`Migration error: ${error.message}`, 'error');
  }
}

// 数据迁移：云端 → 本地（替换）
async function cloudMigrateCloudToLocalReplace() {
  if (!confirm('⚠️ WARNING: This will DELETE all local data (words and custom phrases) and replace with cloud data. This cannot be undone! Continue?')) {
    return;
  }

  try {
    showCloudDbStatus('Downloading cloud database (0%)...', 'info');

    // 使用分页获取云端单词数据
    const wordsResponse = await window.cloudAPI.getAllWordsPaginated({
      limit: 500,
      onProgress: (downloaded, total) => {
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        showCloudDbStatus(`Downloading words: ${downloaded}/${total} (${percent}%)...`, 'info');
      }
    });

    if (!wordsResponse.success || !wordsResponse.data) {
      showCloudDbStatus(`Failed to fetch cloud words: ${wordsResponse.error || 'Unknown error'}`, 'error');
      return;
    }

    const cloudWords = wordsResponse.data;
    console.log(`[CloudDB] Downloaded ${cloudWords.length} words from cloud database`);

    showCloudDbStatus('Clearing local database...', 'info');

    // 清空本地单词数据库
    const db = await openDB();
    let transaction = db.transaction(["wordDetails"], "readwrite");
    let store = transaction.objectStore("wordDetails");

    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    showCloudDbStatus(`Writing ${cloudWords.length} words to local database...`, 'info');

    // 分批添加云端单词数据以避免事务超时
    const BATCH_SIZE = 100;
    for (let i = 0; i < cloudWords.length; i += BATCH_SIZE) {
      const batch = cloudWords.slice(i, i + BATCH_SIZE);
      transaction = db.transaction(["wordDetails"], "readwrite");
      store = transaction.objectStore("wordDetails");

      for (const wordData of batch) {
        await new Promise((resolve, reject) => {
          const request = store.add(wordData);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      // 更新进度
      const writePercent = Math.round(((i + batch.length) / cloudWords.length) * 100);
      showCloudDbStatus(`Writing words: ${i + batch.length}/${cloudWords.length} (${writePercent}%)...`, 'info');
    }

    // 获取云端自定义词组数据
    const phrasesResponse = await window.cloudAPI.getAllPhrases();

    if (!phrasesResponse.success || !phrasesResponse.data) {
      console.warn('[CloudDB] Failed to fetch cloud phrases, skipping...');
      showCloudDbStatus(
        `Local database replaced! Total words: ${cloudWords.length}`,
        'success'
      );
      return;
    }

    const cloudPhrases = phrasesResponse.data;

    // 清空本地自定义词组数据库
    const phrasesDB = await openCustomPhrasesDB();
    let phrasesTransaction = phrasesDB.transaction(["customPhrases"], "readwrite");
    let phrasesStore = phrasesTransaction.objectStore("customPhrases");

    await new Promise((resolve, reject) => {
      const request = phrasesStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      phrasesTransaction.oncomplete = () => resolve();
      phrasesTransaction.onerror = () => reject(phrasesTransaction.error);
    });

    // 添加云端自定义词组数据
    phrasesTransaction = phrasesDB.transaction(["customPhrases"], "readwrite");
    phrasesStore = phrasesTransaction.objectStore("customPhrases");

    for (const phraseData of cloudPhrases) {
      await new Promise((resolve, reject) => {
        const request = phrasesStore.add(phraseData);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await new Promise((resolve, reject) => {
      phrasesTransaction.oncomplete = () => resolve();
      phrasesTransaction.onerror = () => reject(phrasesTransaction.error);
    });

    showCloudDbStatus(
      `Local database replaced! Total words: ${cloudWords.length}, Total phrases: ${cloudPhrases.length}`,
      'success'
    );
    // 替换成功后重建词组数据库
    chrome.runtime.sendMessage({ action: "resetPhrasesDatabase" }, function(phrasesResponse) {
      if (phrasesResponse && phrasesResponse.success) {
        console.log("词组数据库重建成功");
      } else {
        console.error("词组数据库重建失败:", phrasesResponse && phrasesResponse.error);
      }
    });
  } catch (error) {
    console.error('[CloudDB] Replace local error:', error);
    showCloudDbStatus(`Replace error: ${error.message}`, 'error');
  }
}

// 健康检查
async function cloudHealthCheck() {
  try {
    showCloudDbStatus('Checking server status...', 'info');
    const response = await window.cloudAPI.healthCheck();

    if (response.success) {
      const healthDiv = document.getElementById('cloudHealthStatus');
      healthDiv.style.display = 'block';
      healthDiv.innerHTML = `
        <p style="margin: 0; color: var(--success-color); font-weight: 600;">✅ Server is running</p>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: var(--text-secondary);">
          Message: ${response.message}<br>
          Time: ${new Date(response.timestamp).toLocaleString()}
        </p>
      `;
      showCloudDbStatus('Server is healthy', 'success');
    } else {
      showCloudDbStatus('Server check failed', 'error');
    }
  } catch (error) {
    console.error('[CloudDB] Health check error:', error);
    const healthDiv = document.getElementById('cloudHealthStatus');
    healthDiv.style.display = 'block';
    healthDiv.innerHTML = `
      <p style="margin: 0; color: var(--danger-color); font-weight: 600;">❌ Server is not reachable</p>
      <p style="margin: 5px 0 0 0; font-size: 12px; color: var(--text-secondary);">
        Error: ${error.message}
      </p>
    `;
    showCloudDbStatus(`Server error: ${error.message}`, 'error');
  }
}

// 订阅过期检查和刷新函数
async function checkAndRefreshSubscription() {
  try {
    const now = new Date();

    const storageResult = await new Promise(resolve => {
      chrome.storage.local.get(['cloudConfig', 'subscriptionConfig'], resolve);
    });

    const subscriptionExpireAt = storageResult.cloudConfig?.subscriptionExpireAt || storageResult.subscriptionConfig?.subscriptionExpireAt;

    if (!subscriptionExpireAt) {
      console.log('[Subscription] No subscription expiration time found, skipping check');
      return;
    }

    const expireDate = new Date(subscriptionExpireAt);
    console.log('[Subscription] Local expiration time:', expireDate.toLocaleString());

    if (now < expireDate) {
      console.log('[Subscription] Subscription is valid, no refresh needed');
      return;
    }

    console.log('[Subscription] Subscription expired, attempting to refresh...');

    const afdianUserId = storageResult.cloudConfig?.afdianUserId || storageResult.cloudConfig?.externalSubscription?.afdianUserId || storageResult.subscriptionConfig?.afdianUserId;

    if (!afdianUserId) {
      console.log('[Subscription] No Afdian user ID found, cannot refresh');
      return;
    }

    const response = await window.cloudAPI.verifyAfdian(afdianUserId);

    if (response.success) {
      console.log('[Subscription] Refresh successful:', response.message);

      if (response.data?.subscriptionExpireAt) {
        const newExpireDate = new Date(response.data.subscriptionExpireAt);
        await new Promise(resolve => {
          chrome.storage.local.get(['cloudConfig'], (result) => {
            const cloudConfig = result.cloudConfig || {};
            cloudConfig.subscriptionExpireAt = response.data.subscriptionExpireAt;
            cloudConfig.subscriptionStatus = response.data.subscriptionStatus || 'active';
            chrome.storage.local.set({ cloudConfig }, resolve);
          });
        });
        console.log('[Subscription] Updated local subscriptionExpireAt to:', newExpireDate.toLocaleString());
      }
    } else {
      console.log('[Subscription] Refresh failed:', response.message);
    }
  } catch (error) {
    console.error('[Subscription] Error during check and refresh:', error);
  }
}

// 初始化云端数据库面板
document.addEventListener('DOMContentLoaded', () => {
  checkAndRefreshSubscription();

  // 加载云端数据库配置
  chrome.storage.local.get(['cloudConfig'], (result) => {
    const config = result.cloudConfig || {};

    // 设置自建服务器模式
    const selfHostedCheckbox = document.getElementById('cloudSelfHosted');
    const selfHostedConfigDiv = document.getElementById('cloudSelfHostedConfig');
    if (selfHostedCheckbox) {
      selfHostedCheckbox.checked = config.selfHosted === true;
      // 根据状态显示/隐藏配置区域
      if (selfHostedConfigDiv) {
        selfHostedConfigDiv.style.display = config.selfHosted ? 'block' : 'none';
      }
    }

    // 设置服务器 URL
    const serverUrlInput = document.getElementById('cloudServerUrl');
    if (serverUrlInput && config.serverURL) {
      serverUrlInput.value = config.serverURL;
    }

    // 设置启用状态
    const enabledCheckbox = document.getElementById('cloudDbEnabled');
    if (enabledCheckbox) {
      enabledCheckbox.checked = config.cloudDbEnabled === true;
    }

    // 设置双写状态
    const dualWriteCheckbox = document.getElementById('cloudDualWrite');
    if (dualWriteCheckbox) {
      dualWriteCheckbox.checked = config.cloudDualWrite !== false; // 默认为 true
    }

    console.log('[CloudDB] Loaded config:', config);
  });

  // 页面加载时检查并更新登录状态
  updateCloudLoginStatus();

  // 标签页切换 - Cloud Database
  const cloudDbTab = document.getElementById('tab-cloud-db');
  if (cloudDbTab) {
    cloudDbTab.addEventListener('click', async () => {
      // 切换到云端数据库面板
      switchTab('panel-cloud-db');
      // 更新登录状态
      await updateCloudLoginStatus();
    });
  }

  // 标签页切换 - WebDAV
  const webdavTab = document.getElementById('tab-webdav');
  if (webdavTab) {
    webdavTab.addEventListener('click', () => {
      switchTab('panel-webdav');
    });
  }

  // 登录按钮
  const loginBtn = document.getElementById('cloudLoginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', cloudLogin);
  }

  // 注册按钮（显示注册表单）
  const registerBtn = document.getElementById('cloudRegisterBtn');
  if (registerBtn) {
    registerBtn.addEventListener('click', () => {
      document.getElementById('cloudLoginForm').style.display = 'none';
      document.getElementById('cloudRegisterForm').style.display = 'block';
    });
  }

  // 注册提交按钮
  const registerSubmitBtn = document.getElementById('cloudRegisterSubmitBtn');
  if (registerSubmitBtn) {
    registerSubmitBtn.addEventListener('click', cloudRegister);
  }

  // 注册取消按钮
  const registerCancelBtn = document.getElementById('cloudRegisterCancelBtn');
  if (registerCancelBtn) {
    registerCancelBtn.addEventListener('click', () => {
      document.getElementById('cloudRegisterForm').style.display = 'none';
      document.getElementById('cloudLoginForm').style.display = 'block';
    });
  }

  // 登出按钮
  const logoutBtn = document.getElementById('cloudLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', cloudLogout);
  }

  // 刷新信息按钮
  const refreshInfoBtn = document.getElementById('cloudRefreshInfoBtn');
  if (refreshInfoBtn) {
    refreshInfoBtn.addEventListener('click', cloudRefreshInfo);
  }

  // 刷新爱发电订阅状态按钮
  const refreshAfdianBtn = document.getElementById('cloudRefreshAfdianBtn');
  if (refreshAfdianBtn) {
    refreshAfdianBtn.addEventListener('click', cloudRefreshAfdian);
  }

  // 爱发电OAuth登录按钮
  const afdianLoginBtn = document.getElementById('cloudAfdianLoginBtn');
  if (afdianLoginBtn) {
    afdianLoginBtn.addEventListener('click', cloudAfdianOAuthLogin);
  }

  // 自建服务器模式切换（监听事件）
  const selfHostedCheckbox = document.getElementById('cloudSelfHosted');
  const selfHostedConfigDiv = document.getElementById('cloudSelfHostedConfig');

  if (selfHostedCheckbox && selfHostedConfigDiv) {
    // 监听切换
    selfHostedCheckbox.addEventListener('change', async (e) => {
      if (e.target.checked) {
        selfHostedConfigDiv.style.display = 'block';
      } else {
        selfHostedConfigDiv.style.display = 'none';
      }

      // 重新初始化 cloudAPI 以使用新配置
      await window.cloudAPI.init();
      console.log('[CloudDB] CloudAPI reinitialized after selfHosted change');

      // 更新登录状态（会自动更新 OAuth 按钮显示）
      await updateCloudLoginStatus();
    });
  }

  // 监听服务器 URL 变化
  const serverUrlInput = document.getElementById('cloudServerUrl');
  if (serverUrlInput) {
    serverUrlInput.addEventListener('change', async () => {
      // 重新初始化 cloudAPI 以使用新配置
      await window.cloudAPI.init();
      console.log('[CloudDB] CloudAPI reinitialized after serverURL change');
    });
  }

  // 数据迁移按钮
  const migrateLocalToCloudBtn = document.getElementById('cloudMigrateLocalToCloud');
  if (migrateLocalToCloudBtn) {
    migrateLocalToCloudBtn.addEventListener('click', cloudMigrateLocalToCloud);
  }

  const migrateLocalToCloudReplaceBtn = document.getElementById('cloudMigrateLocalToCloudReplace');
  if (migrateLocalToCloudReplaceBtn) {
    migrateLocalToCloudReplaceBtn.addEventListener('click', cloudMigrateLocalToCloudReplace);
  }

  const migrateCloudToLocalBtn = document.getElementById('cloudMigrateCloudToLocal');
  if (migrateCloudToLocalBtn) {
    migrateCloudToLocalBtn.addEventListener('click', cloudMigrateCloudToLocal);
  }

  const migrateCloudToLocalReplaceBtn = document.getElementById('cloudMigrateCloudToLocalReplace');
  if (migrateCloudToLocalReplaceBtn) {
    migrateCloudToLocalReplaceBtn.addEventListener('click', cloudMigrateCloudToLocalReplace);
  }

  // 健康检查按钮
  const healthCheckBtn = document.getElementById('cloudHealthCheckBtn');
  if (healthCheckBtn) {
    healthCheckBtn.addEventListener('click', cloudHealthCheck);
  }

  // 回车键登录
  const loginPassword = document.getElementById('cloudLoginPassword');
  if (loginPassword) {
    loginPassword.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        cloudLogin();
      }
    });
  }

  // ==================== WeChat 二维码显示控制 ====================
  const wechatBtn = document.getElementById('wechatBtn');
  const qrcodeContainer = document.getElementById('wechatQrcode');
  const closeBtn = document.getElementById('closeQrcode');
  let isPinned = false;

  console.log('WeChat 按钮:', wechatBtn);
  console.log('二维码容器:', qrcodeContainer);
  console.log('关闭按钮:', closeBtn);

  // 点击 WeChat 按钮切换二维码显示
  if (wechatBtn) {
    wechatBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      isPinned = !isPinned;

      console.log('WeChat 按钮被点击，isPinned:', isPinned);

      if (isPinned) {
        qrcodeContainer.classList.add('show');
        qrcodeContainer.classList.remove('closed');
      } else {
        qrcodeContainer.classList.remove('show');
        qrcodeContainer.classList.add('closed');
      }
    });
  }

  // 点击关闭按钮隐藏二维码
  if (closeBtn) {
    console.log('正在为关闭按钮添加事件监听器');

    // 方法1: mousedown事件（更早触发）
    closeBtn.addEventListener('mousedown', function(e) {
      console.log('mousedown - 关闭按钮被点击');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      isPinned = false;
      qrcodeContainer.classList.remove('show');
      qrcodeContainer.classList.add('closed');
    }, true);

    // 方法2: click事件
    closeBtn.addEventListener('click', function(e) {
      console.log('click - 关闭按钮被点击');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      isPinned = false;
      qrcodeContainer.classList.remove('show');
      qrcodeContainer.classList.add('closed');
    }, true);
  } else {
    console.error('关闭按钮未找到！');
  }

  // 点击页面其他地方关闭二维码
  document.addEventListener('click', function(e) {
    console.log('全局点击事件，目标:', e.target, '类名:', e.target.className, 'ID:', e.target.id);

    // 检查是否点击了关闭按钮
    if (e.target && (e.target.id === 'closeQrcode' || e.target.closest('#closeQrcode'))) {
      console.log('通过全局事件检测到关闭按钮点击');
      isPinned = false;
      if (qrcodeContainer) {
        qrcodeContainer.classList.remove('show');
        qrcodeContainer.classList.add('closed');
      }
      return;
    }

    // 点击外部区域关闭
    if (isPinned &&
        qrcodeContainer &&
        !qrcodeContainer.contains(e.target) &&
        wechatBtn &&
        !wechatBtn.contains(e.target)) {
      console.log('点击外部区域，关闭二维码');
      isPinned = false;
      qrcodeContainer.classList.remove('show');
      qrcodeContainer.classList.add('closed');
    }
  });

  // 悬浮时移除 closed 类（允许 hover 效果）
  if (wechatBtn) {
    wechatBtn.addEventListener('mouseenter', function() {
      if (!isPinned && qrcodeContainer) {
        qrcodeContainer.classList.remove('closed');
      }
    });
  }

  // 鼠标移出 wrapper 区域后，延迟移除 closed 类，以便下次 hover 能正常显示
  if (wechatBtn && qrcodeContainer) {
    const wechatWrapper = wechatBtn.closest('.wechat-donation-wrapper');
    if (wechatWrapper) {
      wechatWrapper.addEventListener('mouseleave', function() {
        // 延迟移除 closed 类，避免闪烁
        setTimeout(function() {
          if (!isPinned) {
            qrcodeContainer.classList.remove('closed');
          }
        }, 300);
      });
    }
  }

  // 阻止二维码容器内的点击事件冒泡（但不包括关闭按钮）
  if (qrcodeContainer) {
    qrcodeContainer.addEventListener('click', function(e) {
      console.log('二维码容器被点击，目标:', e.target, 'ID:', e.target.id);
      if (e.target.id !== 'closeQrcode' && !e.target.closest('#closeQrcode')) {
        e.stopPropagation();
      }
    });
  }
});

