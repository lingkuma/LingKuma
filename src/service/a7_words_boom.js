// =======================
// 单词爆炸功能 - Word Explosion
// 显示句子中所有未知单词(状态0-4)及其翻译
// =======================

// 全局变量
let wordExplosionEl = null; // 单词爆炸弹窗元素
let wordExplosionEnabled = true; // 功能开关，默认开启
let wordExplosionLocked = false; // UI锁定状态
let wordExplosionUpdateTimer = null; // 定时更新计时器
let currentExplosionSentence = null; // 当前显示的句子
let currentExplosionSentenceInfo = null; // 当前句子的详细信息（用于逐词高亮）
let currentExplosionWords = []; // 当前句子中的未知单词列表
let lastMouseMoveEvent = null; // 最后一次鼠标移动事件
let isMouseInsideExplosion = false; // 鼠标是否在弹窗内部
let wordExplosionDragging = false; // 是否正在拖动
let wordExplosionDragOffset = { x: 0, y: 0 }; // 拖动偏移量
let wordExplosionSavedPosition = null; // 保存的位置
let cachedUIContent = ''; // 缓存当前UI内容，用于对比是否需要更新
let lastHoverSentence = null; // 缓存上一次悬停的句子，避免重复刷新
let hoverDelayTimer = null; // 鼠标悬浮延迟计时器
const HOVER_DELAY = 150; // 悬浮延迟时间（毫秒）
let isInBlacklist = true; // 当前网站是否在黑名单中（默认为true，等待异步检查完成后更新）
let isPluginEnabled = false; // 插件总开关状态（默认为true，等待异步检查完成后更新）
let currentExplosionSentenceRange = null; // 当前爆炸句子的Range对象，用于高亮
let explosionThemeMode = 'auto'; // 主题模式：'auto', 'light', 'dark'（跟随tooltip的tooltipThemeMode）
let currentExplosionPosition = null; // 记录当前弹窗的定位信息：{ isAbove: boolean, sentenceRect: DOMRect }
let explosionResizeObserver = null; // 监听弹窗内容变化的ResizeObserver
let wordExplosionFontSize = 14; // 爆炸弹窗字体大小，默认14px
let wordExplosionMaxWidth = 772; // 爆炸弹窗最大宽度，默认772px

// Shadow DOM 相关变量
let explosionShadowHost = null; // Shadow DOM 宿主元素
let explosionShadowRoot = null; // Shadow DOM 根节点

// 独立的句子翻译缓存（不依赖单词数据库）
let explosionSentenceTranslationsCache = {}; // 格式: { sentence: [translation1, translation2, ...] }
let lastSentenceTranslationCount = 0; // 用于检测翻译数量变化

// 语言高亮开关（从storage加载，与popup中的设置同步）
let highlightLanguageSettings = {
  highlightChineseEnabled: false, // 中文默认不高亮
  highlightJapaneseEnabled: true, // 日语默认高亮
  highlightKoreanEnabled: true, // 韩语默认高亮
  highlightAlphabeticEnabled: true // 字母语言默认高亮
};

// 配置项（从storage加载）
let wordExplosionConfig = {
  enabled: true, // 功能开关
  triggerMode: 'click', // 'click' 或 'hover'
  positionMode: 'auto', // 'auto' 或 'manual'
  preferUp: true, // 优先向上显示
  layout: 'vertical', // 'vertical' 或 'horizontal' - 单词对象内部翻译的排列
  wordsLayout: 'triple-column', // 'single-column' 或 'double-column' 或 'triple-column' - 单词列表在窗口内的排列
  translationCount: 'all', // 显示翻译数量: 1, 2, 3, 或 'all'
  highlightSentence: true, // 高亮当前爆炸的句子，默认开启
  highlightColor: '#955FBD40', // 高亮背景颜色，默认紫色半透明
  underlineEnabled: false, // 下划线开关，默认关闭
  underlineStyle: 'solid', // 下划线样式：solid/wavy/dotted
  underlinePosition: 'bottom', // 下划线位置：bottom/top/both
  underlineColor: '#955FBD80', // 下划线颜色，默认紫色
  underlineThickness: 3, // 下划线粗度，默认3px
  showExplosionSentence: false // 显示爆炸原句，默认关闭
};

// 初始化：加载配置
function initWordExplosion() {
  chrome.storage.local.get([
    'enablePlugin', // 插件总开关
    'wordExplosionEnabled',
    'wordExplosionTriggerMode',
    'wordExplosionPositionMode',
    'wordExplosionFontSize',
    'wordExplosionMaxWidth',
    'wordExplosionPreferUp',
    'wordExplosionLayout',
    'wordExplosionWordsLayout',
    'wordExplosionTranslationCount',
    'wordExplosionSavedPosition',
    'wordExplosionHighlightSentence',
    'wordExplosionHighlightColor',
    'wordExplosionUnderlineEnabled',
    'wordExplosionUnderlineStyle',
    'wordExplosionUnderlinePosition',
    'wordExplosionUnderlineColor',
    'wordExplosionUnderlineThickness',
    'showExplosionSentence',
    'tooltipThemeMode',
    // 新增：语言高亮设置
    'highlightChineseEnabled',
    'highlightJapaneseEnabled',
    'highlightKoreanEnabled',
    'highlightAlphabeticEnabled'
  ], (result) => {
    // 加载插件总开关状态
    isPluginEnabled = result.enablePlugin
    wordExplosionConfig.enabled = result.wordExplosionEnabled !== undefined ? result.wordExplosionEnabled : true;
    wordExplosionConfig.triggerMode = result.wordExplosionTriggerMode || 'click';
    wordExplosionConfig.positionMode = result.wordExplosionPositionMode || 'auto';
    wordExplosionFontSize = result.wordExplosionFontSize !== undefined ? result.wordExplosionFontSize : 14;
    wordExplosionMaxWidth = result.wordExplosionMaxWidth !== undefined ? result.wordExplosionMaxWidth : 772;
    wordExplosionConfig.preferUp = result.wordExplosionPreferUp !== undefined ? result.wordExplosionPreferUp : true;
    wordExplosionConfig.layout = result.wordExplosionLayout || 'vertical';
    wordExplosionConfig.wordsLayout = result.wordExplosionWordsLayout || 'triple-column';
    wordExplosionConfig.translationCount = result.wordExplosionTranslationCount || 'all';
    wordExplosionConfig.highlightSentence = result.wordExplosionHighlightSentence !== undefined ? result.wordExplosionHighlightSentence : true;
    wordExplosionConfig.highlightColor = result.wordExplosionHighlightColor !== undefined ? result.wordExplosionHighlightColor : '#955FBD40';
    wordExplosionConfig.underlineEnabled = result.wordExplosionUnderlineEnabled !== undefined ? result.wordExplosionUnderlineEnabled : false;
    wordExplosionConfig.underlineStyle = result.wordExplosionUnderlineStyle || 'solid';
    wordExplosionConfig.underlinePosition = result.wordExplosionUnderlinePosition || 'bottom';
    wordExplosionConfig.underlineColor = result.wordExplosionUnderlineColor !== undefined ? result.wordExplosionUnderlineColor : '#955FBD80';
    wordExplosionConfig.underlineThickness = result.wordExplosionUnderlineThickness !== undefined ? result.wordExplosionUnderlineThickness : 3;
    wordExplosionConfig.showExplosionSentence = result.showExplosionSentence !== undefined ? result.showExplosionSentence : false;
    wordExplosionSavedPosition = result.wordExplosionSavedPosition || null;
    explosionThemeMode = result.tooltipThemeMode || 'auto';

    // 加载语言高亮设置（与popup中的设置同步）
    highlightLanguageSettings.highlightChineseEnabled = result.highlightChineseEnabled !== undefined ? result.highlightChineseEnabled : false;
    highlightLanguageSettings.highlightJapaneseEnabled = result.highlightJapaneseEnabled !== undefined ? result.highlightJapaneseEnabled : true;
    highlightLanguageSettings.highlightKoreanEnabled = result.highlightKoreanEnabled !== undefined ? result.highlightKoreanEnabled : true;
    highlightLanguageSettings.highlightAlphabeticEnabled = result.highlightAlphabeticEnabled !== undefined ? result.highlightAlphabeticEnabled : true;

    wordExplosionEnabled = wordExplosionConfig.enabled;

    console.log('[WordExplosion] 配置已加载:', wordExplosionConfig);
    console.log('[WordExplosion] 语言高亮设置:', highlightLanguageSettings);
    console.log('[WordExplosion] 主题模式:', explosionThemeMode);
    console.log('[WordExplosion] 字体大小:', wordExplosionFontSize);

    // 在配置加载完成后初始化Shadow DOM
    initExplosionShadowDOM();
  });

  // 监听单词缓存更新事件（来自AI翻译完成）
  window.addEventListener('wordCacheUpdated', (event) => {
    const updatedWord = event.detail.word;
    console.log('[WordExplosion] 收到单词缓存更新事件:', updatedWord);

    // 延迟200ms后强制刷新，确保缓存完全更新
    setTimeout(() => {
      if (!wordExplosionEl || !currentExplosionSentence || currentExplosionWords.length === 0) {
        return;
      }

      // 查找需要更新的单词
      const wordToUpdate = currentExplosionWords.find(w => w.wordLower === updatedWord);
      if (!wordToUpdate) {
        return;
      }

      // 从缓存中获取最新的details
      const cachedDetails = highlightManager?.wordDetailsFromDB?.[updatedWord];
      if (cachedDetails && cachedDetails.translations && cachedDetails.translations.length > 0) {
        console.log('[WordExplosion] 强制更新单词UI:', updatedWord, cachedDetails.translations);
        // 更新currentExplosionWords中的details
        wordToUpdate.details = cachedDetails;
        // 只更新这一个单词的UI，而不是刷新整个列表
        updateSingleWordUI(wordToUpdate);
      }
    }, 200);
  });
}

// 监听配置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    // 监听插件总开关变化
    if (changes.enablePlugin) {
      isPluginEnabled = changes.enablePlugin.newValue;
      if (!isPluginEnabled) {
        hideWordExplosion();
        console.log('[WordExplosion] 插件已禁用，隐藏爆炸弹窗');
      }
    }
    if (changes.wordExplosionEnabled) {
      wordExplosionEnabled = changes.wordExplosionEnabled.newValue;
      if (!wordExplosionEnabled) {
        hideWordExplosion();
      }
    }
    if (changes.wordExplosionTriggerMode) {
      wordExplosionConfig.triggerMode = changes.wordExplosionTriggerMode.newValue;
      // 当切换到点击模式时，清除悬浮延迟计时器
      if (wordExplosionConfig.triggerMode === 'click' && hoverDelayTimer) {
        clearTimeout(hoverDelayTimer);
        hoverDelayTimer = null;
      }
    }
    // 监听语言高亮设置变化
    if (changes.highlightChineseEnabled) {
      highlightLanguageSettings.highlightChineseEnabled = changes.highlightChineseEnabled.newValue;
    }
    if (changes.highlightJapaneseEnabled) {
      highlightLanguageSettings.highlightJapaneseEnabled = changes.highlightJapaneseEnabled.newValue;
    }
    if (changes.highlightKoreanEnabled) {
      highlightLanguageSettings.highlightKoreanEnabled = changes.highlightKoreanEnabled.newValue;
    }
    if (changes.highlightAlphabeticEnabled) {
      highlightLanguageSettings.highlightAlphabeticEnabled = changes.highlightAlphabeticEnabled.newValue;
    }
    if (changes.wordExplosionPositionMode) {
      wordExplosionConfig.positionMode = changes.wordExplosionPositionMode.newValue;
      // 更新position属性
      if (wordExplosionEl) {
        if (wordExplosionConfig.positionMode === 'manual') {
          wordExplosionEl.style.position = 'fixed';
        } else {
          wordExplosionEl.style.position = 'absolute';
        }
      }
    }
    if (changes.wordExplosionFontSize) {
      wordExplosionFontSize = changes.wordExplosionFontSize.newValue;
      // 重新注入CSS以应用新的字体大小
      if (explosionShadowRoot) {
        // 移除旧的style标签
        const oldStyle = explosionShadowRoot.querySelector('style');
        if (oldStyle) {
          oldStyle.remove();
        }
        // 重新注入CSS
        injectExplosionStyles();
      }
    }
    if (changes.wordExplosionMaxWidth) {
      wordExplosionMaxWidth = changes.wordExplosionMaxWidth.newValue;
      // 重新注入CSS以应用新的最大宽度
      if (explosionShadowRoot) {
        const oldStyle = explosionShadowRoot.querySelector('style');
        if (oldStyle) {
          oldStyle.remove();
        }
        injectExplosionStyles();
      }
    }
    if (changes.wordExplosionPreferUp) {
      wordExplosionConfig.preferUp = changes.wordExplosionPreferUp.newValue;
    }
    if (changes.wordExplosionLayout) {
      wordExplosionConfig.layout = changes.wordExplosionLayout.newValue;
      if (wordExplosionEl) {
        updateWordExplosionLayout();
      }
    }
    if (changes.wordExplosionWordsLayout) {
      wordExplosionConfig.wordsLayout = changes.wordExplosionWordsLayout.newValue;
      if (wordExplosionEl) {
        updateWordExplosionLayout();
      }
    }
    if (changes.wordExplosionTranslationCount) {
      wordExplosionConfig.translationCount = changes.wordExplosionTranslationCount.newValue;
    }
    if (changes.wordExplosionHighlightSentence) {
      wordExplosionConfig.highlightSentence = changes.wordExplosionHighlightSentence.newValue;
      // 如果关闭高亮，立即移除当前高亮
      if (!wordExplosionConfig.highlightSentence) {
        removeExplosionSentenceHighlight();
      }
    }
    if (changes.wordExplosionHighlightColor) {
      wordExplosionConfig.highlightColor = changes.wordExplosionHighlightColor.newValue;
      // 如果颜色改变且当前有高亮，重新应用高亮
      if (wordExplosionConfig.highlightSentence && currentExplosionSentenceRange) {
        applyExplosionSentenceHighlight();
      }
    }
    if (changes.wordExplosionUnderlineEnabled) {
      wordExplosionConfig.underlineEnabled = changes.wordExplosionUnderlineEnabled.newValue;
      // 重新应用高亮样式
      if (wordExplosionConfig.highlightSentence && currentExplosionSentenceRange) {
        applyExplosionSentenceHighlight();
      }
    }
    if (changes.wordExplosionUnderlineStyle) {
      wordExplosionConfig.underlineStyle = changes.wordExplosionUnderlineStyle.newValue;
      if (wordExplosionConfig.highlightSentence && currentExplosionSentenceRange) {
        applyExplosionSentenceHighlight();
      }
    }
    if (changes.wordExplosionUnderlinePosition) {
      wordExplosionConfig.underlinePosition = changes.wordExplosionUnderlinePosition.newValue;
      if (wordExplosionConfig.highlightSentence && currentExplosionSentenceRange) {
        applyExplosionSentenceHighlight();
      }
    }
    if (changes.wordExplosionUnderlineColor) {
      wordExplosionConfig.underlineColor = changes.wordExplosionUnderlineColor.newValue;
      if (wordExplosionConfig.highlightSentence && currentExplosionSentenceRange) {
        applyExplosionSentenceHighlight();
      }
    }
    if (changes.wordExplosionUnderlineThickness) {
      wordExplosionConfig.underlineThickness = changes.wordExplosionUnderlineThickness.newValue;
      if (wordExplosionConfig.highlightSentence && currentExplosionSentenceRange) {
        applyExplosionSentenceHighlight();
      }
    }
    if (changes.showExplosionSentence) {
      wordExplosionConfig.showExplosionSentence = changes.showExplosionSentence.newValue;
      // 如果弹窗正在显示，刷新内容
      if (wordExplosionEl && wordExplosionEl.style.display !== 'none') {
        refreshWordExplosionData();
      }
    }
    if (changes.tooltipThemeMode) {
      explosionThemeMode = changes.tooltipThemeMode.newValue;
      // 如果当前有弹窗显示，立即更新主题
      if (wordExplosionEl) {
        applyWordExplosionTheme(wordExplosionEl);
      }
    }
  }
});

// 添加window消息监听器，用于接收单词翻译更新通知
window.addEventListener('message', function(event) {
  // 只处理来自同一窗口的消息
  if (event.source !== window) return;

  if (event.data.type === 'WORD_TRANSLATION_UPDATED') {
    const updatedWord = event.data.word;
    console.log('[WordExplosion] 收到单词翻译更新通知:', updatedWord);
    refreshWordTranslationData(updatedWord);
  }
});

// 添加消息监听器，用于接收主题更新消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  try {
    // 监听高亮模式切换消息（当用户通过胶囊按钮或popup切换高亮明暗模式时）
    if (message.action === "updateHighlightTheme") {
      // 当高亮模式改变时，如果爆炸窗口处于auto模式，需要更新主题
      if (explosionThemeMode === 'auto' && wordExplosionEl) {
        console.log('[WordExplosion] 检测到高亮模式切换，更新爆炸窗口主题');
        applyWordExplosionTheme(wordExplosionEl);
      }
    }
    // 监听tooltip主题模式更新消息（与tooltip保持一致）
    else if (message.action === "updateTooltipThemeMode") {
      // 爆炸窗口跟随tooltip的主题设置
      explosionThemeMode = message.mode || 'auto';

      // 如果当前有弹窗显示，立即更新主题
      if (wordExplosionEl) {
        applyWordExplosionTheme(wordExplosionEl);
        console.log('[WordExplosion] 跟随tooltip主题更新:', explosionThemeMode);
      }
    }
  } catch (error) {
    console.error('[WordExplosion] 消息处理失败:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});

// 创建单词爆炸弹窗
function createWordExplosionTooltip() {
  if (wordExplosionEl) return wordExplosionEl;

  const container = document.createElement('div');
  container.id = 'word-explosion-tooltip';
  container.className = 'word-explosion-container';

  // 设置初始隐藏状态，避免首次显示时在左上角闪现
  container.style.display = 'none';
  container.style.visibility = 'hidden'; // 额外保险：即使display变为block也不可见

  // 设置初始position（根据模式）
  if (wordExplosionConfig.positionMode === 'manual') {
    container.style.position = 'fixed';
  } else {
    container.style.position = 'absolute';
  }

  // 应用主题模式
  applyWordExplosionTheme(container);

  // 创建左侧按钮容器（用于解析按钮）
  const leftButtons = document.createElement('div');
  leftButtons.className = 'word-explosion-left-buttons';

  // 添加Ask按钮到左侧
  const analysisBtn = document.createElement('button');
  analysisBtn.className = 'word-explosion-analysis-btn word-explosion-left-btn';
  analysisBtn.title = 'Ask';
  analysisBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32.676 38.106c.878.325 1.79.466 2.7.397c2.551-.195 3.428.879 3.405 1.704c-.06 2.096-3.317 2.692-7.443 1.815a8.8 8.8 0 0 1-3.264-1.436m-2.337-2.146q-.514-.588-1.003-1.23m2.998-3.803c.67 1.324 1.552 2.44 2.56 3.288m-3.896-8.861c.02 1.226.2 2.384.508 3.454"/>
        <path d="M25.198 32.797c.673.923 1.929.484 2.825.64"/>
        <path d="M25.112 31.335c1.888-.137 3.818-.255 4.185 1.97c.12.731-.123 1.424-.504 1.805m-3.174 3.33c2.838.053 4.292-2.19 6.351-2.218c2.19-.03 2.405 1.09 2.619 2.289"/><path d="M33.159 37.886c-1.997.868-3.712 2.086-4.955 2.645c-1.779.8-3.705-.671-4.025-2.21m13.177.342c.554-.733.634-1.39.903-2.829c.282-1.507 1.899-1.118 2.043-.173c.281 1.844-.685 3.168-1.549 4.267m1.152-6.8c-3.112.375-2.436-3.085-1.006-4.074c.319.86 1.82 1.329 1.59-1.578c2.366.54 3.189 6.615-.584 5.652M25.363 27.2c-.688.484-2.137.566-5.216-1.079c-1.986-1.06-3.298-2.664-3.461-5.44c-.124-2.098.347-4.36-.366-6.426c2.36 1.966 2.331 3.107 3.27 4.3c1.521 1.94 3.383 2.286 4.526 3.8c1.46 1.937 2.197 4.174 1.247 4.844"/><path d="M25.717 26.698c2.341-.321 4.116-2.32 5.205-4.951c.928-2.241.017-5.302-1.287-8.109c-.417 2.573-1.53 4.07-2.327 5.064c-1.347 1.685-2.12 3.224-2.24 5.148m.27 3.397c1.559.605 2.765 2.217 4.074 3.433c2.197 2.04 4.005 2.478 5.698 2.977l.643.574c-.254-4.43-3.06-4.702-5.81-6.701m-4.618-.305c-.697 5.203.517 6.829-.456 9.63c-.83 2.39-2.636 3.923-4.401 4.36l.3-.508c-.837-2.661-1.77-5.334-.836-7.65l1.343-3.334"/><path d="M20.317 19.35c-.938-1.904-.42-3.496.113-5.085c-.44 1.59 2.458 3.003 1.005-1.676c-.363-1.17-.82-2.542-.228-3.651c.5 1.317.95 2.913 2.448 2.792c.407-.033.781-.617-.115-1.677c-1.234-1.46-2.033-2.921-1.009-3.844c-.038 2.096 2.122 3.041 3.362 5.09c.731 1.206.127 3.313 1.318 3.233c.9-.06.355-2.32-.062-2.865c.737 1.05 1.163 1.578.879 3.215c-.287 1.65-.346 2.116-.19 3.12"/>
        <path d="M31.089 17.657c1.11-3.201 2.314-7.092-1.09-11.897L28.272 7.9c-.195-1.122-.462-1.77-1.06-2.313c-1.199.557-2.463 2.485-2.851 3.847m-7.551 12.3c-2.969-2.875-4.226-5.14-6.008-10.48l-.584-1.75c.986.31 1.95.549 3.043 1.186c.392-.634-.054-1.534.73-2.945c3.132 1.697 6.092 3.483 7.677 5.977"/><path d="M31.884 15.037c1.686-2.031 3.503-3.528 5.738-3.329c-1.975 2.92-3.503 5.587-4.331 7.862"/><path d="M36.01 14.205c.061 5.057-2.225 8.968-5.865 11.393"/><path d="M33.43 22.584c2.366-1.805 7.395-2.29 6.604-1.329c-.796.967-1.747 1.592-2.619 2.671c-1.053 1.837-3.472 2.37-7.108 2.46m-9.927 2.189c-4.823 1.846-7.814-1.109-10.593-4.452c-.993-1.195-1.658-2.605-3.863-4.326c-1.481-1.156 1.204-1.236 3.685-.542c2.64.74 5.007 2.792 7.238 2.798"/><path d="M20.704 29.239c-2.995 2.503-7.135 6.071-12.425 4.38c-.796-.255-1.06-1.19.82-1.743c1.671-1.408 3.31-2.931 5.187-3.602"/><path d="M24.453 27.532c-.074 1.443-1.006 2.178-2.056 2.347c-1.162.187-1.99-.598-2.088-1.709a5 5 0 0 1 .193-1.866m8.841-1.719c1.07.85 1.155 1.974.72 2.708c-.402.676-1.481 1.868-2.785.969c-.602-.415-.844-.791-.833-1.65m1.964.526v-1.274m-6.08 2.615v-1.057"/>
      </g>
    </svg>
  `;
  analysisBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleExplosionAnalysisClick();
  });

  // 添加Sidebar按钮到左侧
  const sidebarBtn = document.createElement('button');
  sidebarBtn.className = 'word-explosion-sidebar-btn word-explosion-left-btn';
  sidebarBtn.title = 'Sidebar';
  sidebarBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M33.471 17.755c-1.38.414-2.809 1.777-3.996 2.568c-.203.135-1.815 1.176-2.785 1.844m1.48.895c-1.593.742-4.915 3.845-5.093 4.753m2.937-.342l-1.96 1.89c-1.186 1.144-2.269 2.152-3.361 4.156c-.148.272-1.522.986-1.727 1.182c-.701.673-1.443.762-2.357 1.106c-.543.205-1.176.778-1.818.852c-1.201.139-3.507-.266-1.914-.893c1.302-.512-2.002.849-3.069-.577m-.192-.54c-1.538.614-3.185-.335-3.99-1.934c-.66-1.242-1.126-3.162-1.126-4.667a8.886 8.886 0 0 1 8.886-8.886c1.043 0 1.465.153 2.174.198c2.952-.73 7.314-3.658 8.828-4.3M22.6 17.604l2.379-1.112c1.163-.534 2.418-.921 3.61-1.396c.516-.205.968-.453 1.515-.567m-2.75 2.961c1.287-.835 2.789-1.525 4.15-2.216c1.74-.883 3.545-1.617 5.351-2.343c.586-.236 1.2-.428 1.773-.681m4.871-.94l-9.522 4.97m-20.762 4.698c.247.403-1.791 1.932-3.557 3.119M7.733 31.23c1.498 1.745 5.105.058 2.703.013c2.463-.203 4.576-1.491 5.28-2.649c.548-.903 1.675-2.186 1.524-3.036c-.101-.567-.617-.473-1.077-.423c-2.09.23-2.377 2.082-4.785 1.915c2.992-2.972 5.477-4.466-1.561-.849"/>
    </svg>
  `;
  sidebarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleExplosionSidebarClick();
  });

  // 添加一键已知按钮到左侧
  const markAllKnownBtn = document.createElement('button');
  markAllKnownBtn.className = 'word-explosion-mark-all-known-btn word-explosion-left-btn';
  markAllKnownBtn.title = '一键已知';
  markAllKnownBtn.innerHTML = '✓';
  markAllKnownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleMarkAllKnownClick();
  });

  // 将左侧按钮添加到左侧容器（从上到下：Ask、Sidebar、一键已知）
  leftButtons.appendChild(analysisBtn);
  leftButtons.appendChild(sidebarBtn);
  leftButtons.appendChild(markAllKnownBtn);

  // 确保左侧按钮容器的鼠标事件正常
  leftButtons.addEventListener('mouseenter', () => {
    isMouseInsideExplosion = true;
  });
  leftButtons.addEventListener('mouseleave', () => {
    isMouseInsideExplosion = false;
  });

  // 创建右上角按钮容器
  const topRightButtons = document.createElement('div');
  topRightButtons.className = 'word-explosion-top-right-buttons';

  // 添加关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'word-explosion-close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 清除悬浮延迟计时器
    if (hoverDelayTimer) {
      clearTimeout(hoverDelayTimer);
      hoverDelayTimer = null;
    }
    hideWordExplosion();
  });

  // 添加TTS喇叭按钮
  const ttsBtn = document.createElement('button');
  ttsBtn.className = 'word-explosion-tts-btn word-explosion-top-btn';
  ttsBtn.title = '播放句子';
  ttsBtn.innerHTML = '🔊';
  ttsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 触发TTS播放句子
    if (typeof playText === 'function' && currentExplosionSentence) {
      playText({
        text: currentExplosionSentence,
        count: 1,
        sentence: currentExplosionSentence
      });
    } else {
      console.error('[WordExplosion] playText function is not available or no sentence');
    }
  });

  // 将按钮添加到右上角容器（从上到下：关闭、TTS）
  topRightButtons.appendChild(closeBtn);
  topRightButtons.appendChild(ttsBtn);

  // 添加拖动手柄（仅在手动模式下显示）
  const dragHandle = document.createElement('div');
  dragHandle.className = 'word-explosion-drag-handle';
  dragHandle.innerHTML = '⋮⋮';

  // 内容容器
  const content = document.createElement('div');
  content.className = 'word-explosion-content';

  container.appendChild(topRightButtons);
  container.appendChild(dragHandle);
  container.appendChild(content);

  // 添加拖动事件
  dragHandle.addEventListener('mousedown', startDragWordExplosion);

  // 鼠标进入/离开事件
  container.addEventListener('mouseenter', () => {
    isMouseInsideExplosion = true;
  });

  container.addEventListener('mouseleave', () => {
    isMouseInsideExplosion = false;
  });

  // 点击内部时关闭查词弹窗
  container.addEventListener('click', (e) => {
    if (typeof tooltipEl !== 'undefined' && tooltipEl && !tooltipEl.contains(e.target)) {
      if (typeof hideTooltip === 'function') {
        hideTooltip();
      }
    }
  });

  // 添加到Shadow DOM而不是document.body
  if (explosionShadowRoot) {
    explosionShadowRoot.appendChild(container);
    // 将左侧按钮单独添加到Shadow DOM，而不是作为container的子元素
    leftButtons.id = 'word-explosion-left-buttons-wrapper';
    explosionShadowRoot.appendChild(leftButtons);

    // 创建透明连接层，填充按钮和弹窗之间的空隙，阻止鼠标穿透
    const leftButtonsBridge = document.createElement('div');
    leftButtonsBridge.id = 'word-explosion-left-buttons-bridge';
    leftButtonsBridge.className = 'word-explosion-left-buttons-bridge';
    // 添加鼠标事件，确保被认为在弹窗内
    leftButtonsBridge.addEventListener('mouseenter', () => {
      isMouseInsideExplosion = true;
    });
    leftButtonsBridge.addEventListener('mouseleave', () => {
      isMouseInsideExplosion = false;
    });
    explosionShadowRoot.appendChild(leftButtonsBridge);
  } else {
    console.error('[WordExplosion] Shadow DOM未初始化');
  }



  wordExplosionEl = container;

  // 创建ResizeObserver监听弹窗内容变化
  if (typeof ResizeObserver !== 'undefined') {
    explosionResizeObserver = new ResizeObserver((entries) => {
      // 只在向上展开且弹窗可见时重新定位
      if (currentExplosionPosition && currentExplosionPosition.isAbove &&
          wordExplosionEl && wordExplosionEl.style.display !== 'none') {

        // 使用requestAnimationFrame避免频繁重排
        requestAnimationFrame(() => {
          repositionExplosionWhenAbove();
        });
      }
    });

    // 监听内容容器的大小变化
    explosionResizeObserver.observe(content);
  }

  return container;
}

// 应用主题模式到爆炸窗口
function applyWordExplosionTheme(container) {
  if (!container) return;

  // 从Shadow DOM中获取左侧按钮容器
  const leftButtons = explosionShadowRoot ? explosionShadowRoot.getElementById('word-explosion-left-buttons-wrapper') : null;

  if (explosionThemeMode === 'dark') {
    // 固定暗色主题
    container.classList.add('dark-mode');
    if (leftButtons) leftButtons.classList.add('dark-mode');
  } else if (explosionThemeMode === 'light') {
    // 固定亮色主题
    container.classList.remove('dark-mode');
    if (leftButtons) leftButtons.classList.remove('dark-mode');
  } else {
    // 自动检测模式（跟随当前页面的高亮模式）
    if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.isDarkMode !== undefined) {
      if (highlightManager.isDarkMode) {
        container.classList.add('dark-mode');
        if (leftButtons) leftButtons.classList.add('dark-mode');
      } else {
        container.classList.remove('dark-mode');
        if (leftButtons) leftButtons.classList.remove('dark-mode');
      }
    } else {
      container.classList.remove('dark-mode');
      if (leftButtons) leftButtons.classList.remove('dark-mode');
    }
  }
}

// 开始拖动
function startDragWordExplosion(e) {
  e.preventDefault();
  e.stopPropagation();

  wordExplosionDragging = true;
  wordExplosionLocked = true;

  const rect = wordExplosionEl.getBoundingClientRect();
  wordExplosionDragOffset.x = e.clientX - rect.left;
  wordExplosionDragOffset.y = e.clientY - rect.top;

  document.addEventListener('mousemove', dragWordExplosion);
  document.addEventListener('mouseup', stopDragWordExplosion);
}

// 拖动中
function dragWordExplosion(e) {
  if (!wordExplosionDragging) return;

  const x = e.clientX - wordExplosionDragOffset.x;
  const y = e.clientY - wordExplosionDragOffset.y;

  wordExplosionEl.style.left = x + 'px';
  wordExplosionEl.style.top = y + 'px';
}

// 停止拖动
function stopDragWordExplosion() {
  if (!wordExplosionDragging) return;

  wordExplosionDragging = false;

  // 保存位置
  const rect = wordExplosionEl.getBoundingClientRect();
  wordExplosionSavedPosition = {
    x: rect.left,
    y: rect.top
  };

  chrome.storage.local.set({ wordExplosionSavedPosition });

  document.removeEventListener('mousemove', dragWordExplosion);
  document.removeEventListener('mouseup', stopDragWordExplosion);
}

function hideWordExplosion() {
  if (wordExplosionEl) {
    wordExplosionEl.style.display = 'none';
  }

  // 从Shadow DOM中隐藏左侧按钮
  if (explosionShadowRoot) {
    const leftButtons = explosionShadowRoot.getElementById('word-explosion-left-buttons-wrapper');
    if (leftButtons) {
      leftButtons.style.display = 'none';
    }

    // 隐藏透明连接层
    const leftButtonsBridge = explosionShadowRoot.getElementById('word-explosion-left-buttons-bridge');
    if (leftButtonsBridge) {
      leftButtonsBridge.style.display = 'none';
    }
  }

  // 清除定时器
  if (wordExplosionUpdateTimer) {
    clearInterval(wordExplosionUpdateTimer);
    wordExplosionUpdateTimer = null;
  }

  // 清除悬浮延迟计时器
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer);
    hoverDelayTimer = null;
  }

  // 注意：不在这里移除句子高亮，因为需求是“弹窗关闭时，高亮的句子的高亮不自动删除”

  currentExplosionSentence = null;
  currentExplosionWords = [];
  currentExplosionPosition = null; // 清除定位信息
  wordExplosionLocked = false;
  lastHoverSentence = null; // 清除悬停句子缓存
}

// 应用爆炸句子高亮
function applyExplosionSentenceHighlight() {
  if (!wordExplosionConfig.highlightSentence || !currentExplosionSentenceRange) {
    return;
  }

  try {
    // 移除旧的高亮
    if (CSS.highlights.has('explosion-sentence-highlight')) {
      CSS.highlights.delete('explosion-sentence-highlight');
    }

    // 创建新的高亮
    const highlight = new Highlight(currentExplosionSentenceRange);
    CSS.highlights.set('explosion-sentence-highlight', highlight);

    // 如果用户设置了自定义颜色，动态更新CSS
    updateExplosionHighlightColor();

    console.log('[WordExplosion] 句子高亮已应用');
  } catch (error) {
    console.error('[WordExplosion] 应用句子高亮失败:', error);
  }
}

// 更新爆炸句子高亮的颜色和下划线样式
function updateExplosionHighlightColor() {
  // 查找或创建style元素
  let styleEl = document.getElementById('explosion-highlight-custom-color');

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'explosion-highlight-custom-color';
    document.head.appendChild(styleEl);
  }

  // 构建CSS样式
  let cssRules = [];

  // 背景颜色
  if (wordExplosionConfig.highlightColor && wordExplosionConfig.highlightColor.trim() !== '') {
    cssRules.push(`background-color: ${wordExplosionConfig.highlightColor} !important;`);
  }

  // 下划线样式
  if (wordExplosionConfig.underlineEnabled) {
    const thickness = wordExplosionConfig.underlineThickness || 3;
    const color = wordExplosionConfig.underlineColor || '#955FBD80';
    const style = wordExplosionConfig.underlineStyle || 'solid';
    const position = wordExplosionConfig.underlinePosition || 'bottom';

    // 根据位置设置下划线
    if (position === 'bottom') {
      cssRules.push(`text-decoration: underline ${style} ${color} ${thickness}px !important;`);
    } else if (position === 'top') {
      cssRules.push(`text-decoration: overline ${style} ${color} ${thickness}px !important;`);
    } else if (position === 'both') {
      cssRules.push(`text-decoration: underline overline ${style} ${color} ${thickness}px !important;`);
    }
  }

  // 应用样式
  if (cssRules.length > 0) {
    styleEl.textContent = `
      ::highlight(explosion-sentence-highlight) {
        ${cssRules.join('\n        ')}
      }
    `;
  } else {
    // 如果没有自定义样式，清空
    styleEl.textContent = '';
  }
}

// 移除爆炸句子高亮
function removeExplosionSentenceHighlight() {
  try {
    if (CSS.highlights.has('explosion-sentence-highlight')) {
      CSS.highlights.delete('explosion-sentence-highlight');
      console.log('[WordExplosion] 句子高亮已移除');
    }
    currentExplosionSentenceRange = null;
  } catch (error) {
    console.error('[WordExplosion] 移除句子高亮失败:', error);
  }
}

// 规范化文本：将各种空格字符统一为普通空格
// 这样可以处理 &nbsp; (U+00A0) 等特殊空格字符
// 注意：这里的规范化必须与content.js中的normalizeText函数保持一致
function normalizeTextForHighlight(text) {
  if (!text) return "";
  // 替换软连字符为空字符串
  let normalized = text.replace(/\u00AD/g, '');
  // 替换所有空白字符（包括 \s 和 \u00A0 非断行空格）为单个普通空格
  normalized = normalized.replace(/[\s\u00A0]+/g, ' ');
  return normalized;
}

// 跨元素创建句子的Range对象
// 当句子被多个元素分割时，此函数可以找到句子的起始和结束位置，创建跨越多个元素的Range
function createCrossElementSentenceRange(sentence, sentenceInfo) {
  if (!sentence) return null;

  console.log('[WordExplosion] 尝试跨元素创建句子Range:', sentence.substring(0, 50) + '...');

  const normalizedSentence = normalizeTextForHighlight(sentence);
  if (!normalizedSentence || normalizedSentence.trim().length === 0) {
    console.log('[WordExplosion] 规范化后的句子为空，返回null');
    return null;
  }

  // 确定搜索的根元素
  let rootElement = document.body;
  
  // 如果有sentenceInfo，尝试找到更精确的搜索范围
  if (sentenceInfo) {
    if (sentenceInfo.textNode && document.contains(sentenceInfo.textNode)) {
      // 从文本节点向上找到合适的父元素
      let parent = sentenceInfo.textNode.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        // 如果是absolute/fixed定位，使用这个元素作为根
        if (style.position === 'absolute' || style.position === 'fixed') {
          rootElement = parent;
          break;
        }
        // 如果文本内容足够长，使用这个元素作为根
        if (parent.innerText && parent.innerText.trim().length >= normalizedSentence.length) {
          rootElement = parent;
          break;
        }
        parent = parent.parentElement;
      }
    } else if (sentenceInfo.range && document.contains(sentenceInfo.range.startContainer)) {
      // 从range的起始容器向上找到合适的父元素
      let container = sentenceInfo.range.startContainer;
      let parent = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (style.position === 'absolute' || style.position === 'fixed') {
          rootElement = parent;
          break;
        }
        if (parent.innerText && parent.innerText.trim().length >= normalizedSentence.length) {
          rootElement = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
  }

  console.log('[WordExplosion] 搜索根元素:', rootElement.tagName, rootElement.className);

  // 使用TreeWalker遍历所有文本节点
  const walker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // 检查文本节点的父元素是否可见
        let element = node.parentElement;
        while (element && element !== rootElement) {
          const style = window.getComputedStyle(element);
          if (style.display === 'none' ||
              style.visibility === 'hidden' ||
              style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          element = element.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  // 收集所有文本节点和它们的规范化文本
  const textNodes = [];
  let currentNode;
  while (currentNode = walker.nextNode()) {
    textNodes.push({
      node: currentNode,
      originalText: currentNode.textContent,
      normalizedText: normalizeTextForHighlight(currentNode.textContent)
    });
  }

  console.log('[WordExplosion] 找到文本节点数量:', textNodes.length);

  // 构建完整的规范化文本，并记录每个字符对应的文本节点和偏移量
  let fullNormalizedText = '';
  const charMap = []; // 每个规范化字符对应的 {node, originalOffset}

  for (const textNodeInfo of textNodes) {
    const originalText = textNodeInfo.originalText;
    const normalizedText = textNodeInfo.normalizedText;
    
    // 为每个规范化字符建立映射
    let originalOffset = 0;
    let normalizedOffset = 0;
    
    while (originalOffset < originalText.length) {
      const char = originalText[originalOffset];
      
      // 软连字符在规范化时被删除
      if (char === '\u00AD') {
        originalOffset++;
        continue;
      }
      
      // 空白字符在规范化时被替换为单个空格
      if (/[\s\u00A0]/.test(char)) {
        // 跳过连续的空白字符
        while (originalOffset < originalText.length && /[\s\u00A0]/.test(originalText[originalOffset])) {
          originalOffset++;
        }
        // 记录规范化后的空格
        charMap.push({
          node: textNodeInfo.node,
          originalOffset: originalOffset, // 指向空白后的第一个字符
          isSpace: true
        });
        fullNormalizedText += ' ';
        normalizedOffset++;
      } else {
        // 普通字符
        charMap.push({
          node: textNodeInfo.node,
          originalOffset: originalOffset,
          isSpace: false
        });
        fullNormalizedText += char;
        originalOffset++;
        normalizedOffset++;
      }
    }
  }

  console.log('[WordExplosion] 完整规范化文本长度:', fullNormalizedText.length);

  // 在完整规范化文本中查找句子
  const sentenceStartIndex = fullNormalizedText.indexOf(normalizedSentence);
  
  if (sentenceStartIndex === -1) {
    console.warn('[WordExplosion] 在完整文本中找不到句子');
    return null;
  }

  const sentenceEndIndex = sentenceStartIndex + normalizedSentence.length;
  console.log('[WordExplosion] 找到句子位置:', sentenceStartIndex, '-', sentenceEndIndex);

  // 找到起始位置对应的文本节点和偏移量
  const startCharInfo = charMap[sentenceStartIndex];
  if (!startCharInfo) {
    console.warn('[WordExplosion] 无法找到起始字符信息');
    return null;
  }

  // 找到结束位置对应的文本节点和偏移量
  // 结束位置是句子最后一个字符的下一个位置
  const endCharInfo = charMap[sentenceEndIndex - 1];
  if (!endCharInfo) {
    console.warn('[WordExplosion] 无法找到结束字符信息');
    return null;
  }

  // 创建Range对象
  try {
    const sentenceRange = document.createRange();
    
    // 设置起始位置
    // 如果起始字符是空格，需要找到下一个非空格字符的位置
    let startNode = startCharInfo.node;
    let startOffset = startCharInfo.originalOffset;
    
    // 如果起始位置是空格标记，需要向前查找实际的起始位置
    if (startCharInfo.isSpace) {
      // 空格标记的originalOffset指向空白后的第一个字符
      // 我们需要找到空白开始的位置
      // 向前查找空白字符
      const nodeText = startNode.textContent;
      let tempOffset = startCharInfo.originalOffset - 1;
      while (tempOffset >= 0 && /[\s\u00A0]/.test(nodeText[tempOffset])) {
        tempOffset--;
      }
      startOffset = tempOffset + 1;
    }
    
    sentenceRange.setStart(startNode, startOffset);
    
    // 设置结束位置
    let endNode = endCharInfo.node;
    let endOffset = endCharInfo.originalOffset + 1; // Range的endOffset是 exclusive
    
    // 如果结束字符是空格标记
    if (endCharInfo.isSpace) {
      // 找到空白结束的位置
      const nodeText = endNode.textContent;
      while (endOffset < nodeText.length && /[\s\u00A0]/.test(nodeText[endOffset])) {
        endOffset++;
      }
    }
    
    sentenceRange.setEnd(endNode, endOffset);
    
    console.log('[WordExplosion] 成功创建跨元素Range');
    console.log('[WordExplosion] 起始节点:', startNode.textContent.substring(0, 30), '偏移:', startOffset);
    console.log('[WordExplosion] 结束节点:', endNode.textContent.substring(0, 30), '偏移:', endOffset);
    
    return sentenceRange;
  } catch (error) {
    console.error('[WordExplosion] 创建跨元素Range失败:', error);
    return null;
  }
}

// 创建句子的Range对象
// 首先尝试在单个文本节点中查找（高效），如果失败则使用预计算的sentenceRange或尝试跨元素查找
function createSentenceRange(sentence, sentenceInfo) {
  if (!sentence || !sentenceInfo) return null;

  try {
    const sentenceRange = document.createRange();

    // 规范化文本：将各种空格字符统一为普通空格
    // 这样可以处理 &nbsp; (U+00A0) 等特殊空格字符
    // 注意：这里的规范化必须与content.js中的normalizeText函数保持一致
    const normalizeText = (text) => {
      if (!text) return "";
      // 替换软连字符为空字符串
      let normalized = text.replace(/\u00AD/g, '');
      // 替换所有空白字符（包括 \s 和 \u00A0 非断行空格）为单个普通空格
      normalized = normalized.replace(/[\s\u00A0]+/g, ' ');
      return normalized;
    };

    // 处理备用系统的情况（只有range属性）
    if (sentenceInfo.range && !sentenceInfo.textNode) {
      const textNode = sentenceInfo.range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) {
        // 尝试使用预计算的sentenceRange
        if (sentenceInfo.sentenceRange && document.contains(sentenceInfo.sentenceRange.startContainer)) {
          console.log('[WordExplosion] 备用系统：使用预计算的sentenceRange（跨元素）');
          return sentenceInfo.sentenceRange;
        }
        // 尝试跨元素查找
        console.log('[WordExplosion] 备用系统：startContainer不是文本节点，尝试跨元素查找');
        return createCrossElementSentenceRange(sentence, sentenceInfo);
      }

      const fullText = textNode.textContent;
      const normalizedFullText = normalizeText(fullText);
      const normalizedSentence = normalizeText(sentence);

      // 在规范化后的文本中查找句子位置
      const sentenceStartInNormalized = normalizedFullText.indexOf(normalizedSentence);

      if (sentenceStartInNormalized === -1) {
        // 如果在单个节点中找不到句子，检查是否有预计算的sentenceRange（跨元素）
        if (sentenceInfo.sentenceRange && document.contains(sentenceInfo.sentenceRange.startContainer)) {
          console.log('[WordExplosion] 备用系统：使用预计算的sentenceRange（跨元素）');
          return sentenceInfo.sentenceRange;
        }
        // 尝试跨元素查找
        console.log('[WordExplosion] 备用系统：在单个节点中找不到句子，尝试跨元素查找');
        const crossRange = createCrossElementSentenceRange(sentence, sentenceInfo);
        if (crossRange) return crossRange;
        
        // 如果跨元素查找也失败，使用原始range
        console.warn('[WordExplosion] 在规范化文本中找不到句子，使用原始range');
        sentenceRange.setStart(sentenceInfo.range.startContainer, sentenceInfo.range.startOffset);
        sentenceRange.setEnd(sentenceInfo.range.endContainer, sentenceInfo.range.endOffset);
      } else {
        console.log('[WordExplosion] 正常句子高亮，无跨越元素');
        // 找到了句子，需要将规范化后的位置映射回原始文本的位置
        const sentenceStart = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized);
        const sentenceEnd = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized + normalizedSentence.length);

        sentenceRange.setStart(textNode, sentenceStart);
        sentenceRange.setEnd(textNode, sentenceEnd);
      }

      return sentenceRange;
    }

    // 处理新系统的情况
    const { textNode } = sentenceInfo;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      // 尝试使用预计算的sentenceRange
      if (sentenceInfo.sentenceRange && document.contains(sentenceInfo.sentenceRange.startContainer)) {
        console.log('[WordExplosion] 新系统：使用预计算的sentenceRange（跨元素）');
        return sentenceInfo.sentenceRange;
      }
      // 尝试跨元素查找
      console.log('[WordExplosion] 新系统：textNode无效，尝试跨元素查找');
      return createCrossElementSentenceRange(sentence, sentenceInfo);
    }

    const fullText = textNode.textContent;
    const normalizedFullText = normalizeText(fullText);
    const normalizedSentence = normalizeText(sentence);

    // 在规范化后的文本中查找句子位置
    const sentenceStartInNormalized = normalizedFullText.indexOf(normalizedSentence);

    if (sentenceStartInNormalized === -1) {
      // 如果句子不在当前文本节点中，检查是否有预计算的sentenceRange（跨元素）
      if (sentenceInfo.sentenceRange && document.contains(sentenceInfo.sentenceRange.startContainer)) {
        console.log('[WordExplosion] 新系统：使用预计算的sentenceRange（跨元素）');
        return sentenceInfo.sentenceRange;
      }
      // 尝试跨元素查找
      console.log('[WordExplosion] 新系统：在单个节点中找不到句子，尝试跨元素查找');
      const crossRange = createCrossElementSentenceRange(sentence, sentenceInfo);
      if (crossRange) return crossRange;
      
      // 如果跨元素查找也失败，尝试使用原始范围
      console.warn('[WordExplosion] 在规范化文本中找不到句子，尝试使用原始范围');
      if (sentenceInfo.range) {
        sentenceRange.setStart(sentenceInfo.range.startContainer, sentenceInfo.range.startOffset);
        sentenceRange.setEnd(sentenceInfo.range.endContainer, sentenceInfo.range.endOffset);
      } else {
        return null;
      }
    } else {
      // 找到了句子，正常高亮路径（无跨越元素）
      console.log('[WordExplosion] 正常句子高亮，无跨越元素');
      const sentenceStart = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized);
      const sentenceEnd = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized + normalizedSentence.length);

      sentenceRange.setStart(textNode, sentenceStart);
      sentenceRange.setEnd(textNode, sentenceEnd);
    }

    return sentenceRange;
  } catch (error) {
    console.error('[WordExplosion] 创建句子Range失败:', error);
    // 尝试跨元素查找作为最后的备选方案
    return createCrossElementSentenceRange(sentence, sentenceInfo);
  }
}

// 辅助函数：将规范化后的位置映射回原始文本的位置
function mapNormalizedPositionToOriginal(originalText, normalizedPosition) {
  let originalPos = 0;
  let normalizedPos = 0;

  while (originalPos < originalText.length && normalizedPos < normalizedPosition) {
    const char = originalText[originalPos];

    // 软连字符在规范化时被删除，不增加normalizedPos
    if (char === '\u00AD') {
      originalPos++;
      continue;
    }

    // 空白字符（包括\u00A0）在规范化时被替换为单个空格
    if (/[\s\u00A0]/.test(char)) {
      // 跳过连续的空白字符，它们在规范化后只占一个位置
      while (originalPos < originalText.length && /[\s\u00A0]/.test(originalText[originalPos])) {
        originalPos++;
      }
      normalizedPos++;
    } else {
      // 普通字符，一一对应
      originalPos++;
      normalizedPos++;
    }
  }

  return originalPos;
}

// 显示单词爆炸弹窗
function showWordExplosion(sentence, sentenceRect = null, sentenceInfo = null) {
  console.log('[WordExplosion] showWordExplosion 被调用');
  console.log('[WordExplosion] 参数:', { 
    sentence: sentence?.substring(0, 50) + '...', 
    hasSentenceRect: !!sentenceRect,
    hasSentenceInfo: !!sentenceInfo
  });
  console.log('[WordExplosion] wordExplosionEnabled:', wordExplosionEnabled);
  
  if (!wordExplosionEnabled) {
    console.log('[WordExplosion] wordExplosionEnabled 为 false，直接返回');
    return;
  }

  // === 新增：检测句子语言，根据popup中的语言高亮设置过滤 ===
  if (!shouldShowExplosionForLanguage(sentence)) {
    console.log('[WordExplosion] 句子语言未启用高亮，跳过爆炸:', sentence);
    return;
  }
  // === 语言检测结束 ===

  // 如果查词弹窗显示中，只在悬停模式下锁定UI
  // 点击模式下允许查词弹窗和爆炸弹窗同时显示
  if (typeof tooltipEl !== 'undefined' && tooltipEl && tooltipEl.style.display !== 'none') {
    if (wordExplosionConfig.triggerMode === 'hover') {
      wordExplosionLocked = true;
      console.log('[WordExplosion] 查词弹窗显示中（悬停模式），不响应新句子');
      return;
    } else {
      console.log('[WordExplosion] 查词弹窗显示中（点击模式），允许显示爆炸弹窗');
    }
  }

  // 如果UI被锁定且鼠标在弹窗内，不更新
  if (wordExplosionLocked && isMouseInsideExplosion) return;

  // 检查是否与当前显示的句子相同，避免重复刷新
  if (currentExplosionSentence === sentence && wordExplosionEl && wordExplosionEl.style.display !== 'none') {
    console.log('[WordExplosion] 句子相同，跳过刷新:', sentence);
    return;
  }

  // 切换句子时，移除旧的高亮
  if (currentExplosionSentence !== sentence) {
    removeExplosionSentenceHighlight();
  }

  currentExplosionSentence = sentence;
  currentExplosionSentenceInfo = sentenceInfo; // 保存句子详细信息用于逐词高亮

  // === 激活句子导航器 ===
  if (typeof window.sentenceNavigator !== 'undefined' && window.sentenceNavigator.activate) {
    window.sentenceNavigator.activate(sentenceInfo);
  }
  // === 导航器激活结束 ===

  // 重置翻译计数器
  lastSentenceTranslationCount = (explosionSentenceTranslationsCache[sentence] || []).length;

  // 创建句子的Range对象用于高亮
  if (wordExplosionConfig.highlightSentence && sentenceInfo) {
    try {
      currentExplosionSentenceRange = createSentenceRange(sentence, sentenceInfo);
      // 应用高亮
      applyExplosionSentenceHighlight();
    } catch (error) {
      console.error('[WordExplosion] 创建句子Range失败:', error);
    }
  }

  // 触发逐词高亮（与爆炸窗口同时触发）
  chrome.storage.local.get(['explosionHighlightWithTTS', 'explosionHighlightNoTTS'], function(result) {
    const highlightWithTTS = result.explosionHighlightWithTTS || false;
    const highlightNoTTS = result.explosionHighlightNoTTS !== undefined ? result.explosionHighlightNoTTS : false;

    console.log('[WordExplosion] 爆炸窗口触发，检查逐词高亮设置:', {
      highlightWithTTS,
      highlightNoTTS,
      hasSentenceInfo: !!sentenceInfo
    });

    // 如果启用了任一逐词高亮功能
    if ((highlightWithTTS || highlightNoTTS) && sentenceInfo) {
      // 只在启用TTS高亮时播放TTS
      if (highlightWithTTS && typeof playText === 'function') {
        playText({ text: sentence });
      }

      // 触发逐词高亮（传入waitForTTS参数）
      triggerExplosionWordByWordHighlight(sentenceInfo, sentence, highlightWithTTS);
    }
  });

  // 解析句子，获取未知单词
  extractUnknownWords(sentence).then(async unknownWords => {
    // 创建或获取弹窗（无论是否有生词都创建，以支持爆炸优先模式）
    const tooltip = createWordExplosionTooltip();

    if (unknownWords.length === 0) {
      // 没有未知单词，检查是否显示动效
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['showKnownSentenceAnimation'], resolve);
      });
      const showAnimation = result.showKnownSentenceAnimation !== undefined ? result.showKnownSentenceAnimation : true;

      if (showAnimation) {
        // 显示动效
        updateWordExplosionContent('本句无生词');
      } else {
        // 不显示动效，但仍然创建透明空白窗口（用于爆炸优先模式）
        updateWordExplosionContent('空白窗口');
      }
    } else {
      currentExplosionWords = unknownWords;
      updateWordExplosionContent(unknownWords);

      // 启动定时更新（每1秒）
      if (wordExplosionUpdateTimer) {
        clearInterval(wordExplosionUpdateTimer);
      }
      wordExplosionUpdateTimer = setInterval(() => {
        refreshWordExplosionData();
      }, 1000);
    }

    // 先将弹窗移到屏幕外，避免在定位前闪现
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';

    // 先隐藏弹窗，让浏览器完成内容渲染和布局，但不显示给用户
    tooltip.style.visibility = 'hidden';
    tooltip.style.display = 'block';

    // 更新拖动手柄显示
    const dragHandle = tooltip.querySelector('.word-explosion-drag-handle');
    if (dragHandle) {
      dragHandle.style.display = wordExplosionConfig.positionMode === 'manual' ? 'flex' : 'none';
    }

    // 使用requestAnimationFrame确保浏览器已完成渲染，再进行精确定位
    requestAnimationFrame(async () => {
      await positionWordExplosion(sentenceRect);
      // 定位完成后才显示弹窗，避免在屏幕左侧闪现
      tooltip.style.visibility = 'visible';
    });
  });
}

// 辅助函数：从storage获取值
function getStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key]);
    });
  });
}

// 定位弹窗 - 智能上下定位模式
async function positionWordExplosion(sentenceRect = null) {
  if (!wordExplosionEl) return;

  // 获取缩放因子
  // 使用 devicePixelRatio 来检测页面缩放（Ctrl++）
  // 通过对比当前DPR和基准DPR来计算缩放比例
  const baseDPR = await getStorageValue('devicePixelRatio') || window.devicePixelRatio || 1.0;
  const currentDPR = window.devicePixelRatio || 1;
  const zoomFactor = currentDPR / baseDPR;

  console.log('[WordExplosion] 缩放检测 - baseDPR:', baseDPR, ', currentDPR:', currentDPR, ', zoomFactor:', zoomFactor);

  // 根据缩放比例调整字体大小，使字体在视觉上保持为用户设置的大小
  const adjustedFontSize = wordExplosionFontSize / zoomFactor;
  wordExplosionEl.style.fontSize = adjustedFontSize + 'px';
  console.log('[WordExplosion] 字体大小调整 - 用户设置:', wordExplosionFontSize, 'px, 缩放比例:', zoomFactor, ', 调整后:', adjustedFontSize, 'px');

  // 手动模式：使用保存的位置，position: fixed
  if (wordExplosionConfig.positionMode === 'manual' && wordExplosionSavedPosition) {
    wordExplosionEl.style.position = 'fixed';

    // 手动模式使用保存的位置
    wordExplosionEl.style.left = wordExplosionSavedPosition.x + 'px';
    wordExplosionEl.style.top = wordExplosionSavedPosition.y + 'px';

    // 手动模式下也需要定位左侧按钮
    if (explosionShadowRoot) {
      const leftButtons = explosionShadowRoot.getElementById('word-explosion-left-buttons-wrapper');
      const leftButtonsBridge = explosionShadowRoot.getElementById('word-explosion-left-buttons-bridge');
      if (leftButtons) {
        // 显示左侧按钮
        leftButtons.style.display = 'flex';
        // 同步弹窗的暗色模式类到左侧按钮容器
        if (wordExplosionEl.classList.contains('dark-mode')) {
          leftButtons.classList.add('dark-mode');
        } else {
          leftButtons.classList.remove('dark-mode');
        }
        // 手动模式使用fixed定位
        leftButtons.style.position = 'fixed';
        leftButtons.style.left = (wordExplosionSavedPosition.x - 28) + 'px';
        leftButtons.style.top = (wordExplosionSavedPosition.y + 16) + 'px';

        // 定位透明连接层
        if (leftButtonsBridge) {
          leftButtonsBridge.style.display = 'block';
          leftButtonsBridge.style.position = 'fixed';
          leftButtonsBridge.style.left = (wordExplosionSavedPosition.x - 4) + 'px';
          leftButtonsBridge.style.top = wordExplosionSavedPosition.y + 'px';
          // 获取弹窗高度
          const explosionRect = wordExplosionEl.getBoundingClientRect();
          leftButtonsBridge.style.height = explosionRect.height + 'px';
        }
      }
    }
    return;
  }

  // 自动模式：使用 position: absolute
  // 注意：爆炸弹窗的shadowHost是position:fixed（相对于视口）
  // 但我们希望弹窗钉在网页中（跟随页面滚动），所以需要加上scrollX/Y
  wordExplosionEl.style.position = 'absolute';

  // 自动模式：根据句子位置智能定位
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  // 获取滚动偏移，使弹窗钉在网页中
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  // 动态获取弹窗的实际宽度（而不是硬编码500px）
  // 强制重排以确保获取准确的尺寸
  wordExplosionEl.offsetHeight;
  wordExplosionEl.offsetWidth;

  const explosionRect = wordExplosionEl.getBoundingClientRect();
  let explosionWidth = explosionRect.width;
  
  // 如果获取的宽度无效（0或undefined），使用默认值500
  if (!explosionWidth || explosionWidth === 0) {
    console.warn('[WordExplosion] 无法获取弹窗宽度，使用默认值500');
    explosionWidth = 500;
  }

  console.log('[WordExplosion] 弹窗实际宽度:', explosionWidth, '弹窗矩形:', explosionRect);

  const minHeight = 150; // 最小检测高度

  // 检测是否为空白窗口（已知句子且没有动效）
  const contentEl = wordExplosionEl.querySelector('.word-explosion-content');
  const isEmptyWindow = contentEl && contentEl.querySelector('.word-explosion-empty') &&
                        !contentEl.querySelector('iframe'); // 有.word-explosion-empty但没有iframe说明是空白窗口

  // 与句子的间距：空白窗口向上弹出时增加20px
  // 增大基础gap以避免覆盖句子
  let gap = 20;

  // 如果没有句子位置信息，使用固定位置（右下角）
  if (!sentenceRect) {
    const x = viewportWidth - explosionWidth - 20 + scrollX;
    const y = viewportHeight - 620 + scrollY;

    wordExplosionEl.style.left = Math.max(20 + scrollX, x) + 'px';
    wordExplosionEl.style.top = Math.max(20 + scrollY, y) + 'px';
    wordExplosionEl.style.bottom = 'auto';
    wordExplosionEl.style.maxHeight = '600px';
    wordExplosionEl.style.overflow = 'auto';
    return;
  }

  // 计算句子中心点（视口坐标）
  const sentenceCenterX = sentenceRect.left + sentenceRect.width / 2;
  const sentenceCenterY = sentenceRect.top + sentenceRect.height / 2;

  // console.log('[WordExplosion] 居中计算 step1 - 句子矩形:', sentenceRect);
  // console.log('[WordExplosion] 居中计算 step2 - 句子中心X:', sentenceCenterX, '(句子left:', sentenceRect.left, '+ 宽度/2:', sentenceRect.width / 2, ')');
  // console.log('[WordExplosion] 居中计算 step3 - 弹窗宽度:', explosionWidth);

  // 计算弹窗水平位置（视口坐标），使弹窗中心对齐句子中心
  // 注意：这里explosionWidth/2 是弹窗宽度的一半，减去后得到弹窗左边缘的位置
  const halfExplosionWidth = explosionWidth / 2;
  let explosionLeft = sentenceCenterX - halfExplosionWidth;

  // console.log('[WordExplosion] 居中计算 step4 - 弹窗宽度的一半:', halfExplosionWidth);
  // console.log('[WordExplosion] 居中计算 step5 - 初始弹窗左边缘:', explosionLeft, '(句子中心:', sentenceCenterX, '- 半宽:', halfExplosionWidth, ')');

  // 确保不超出左右边界（视口坐标）
  const originalLeft = explosionLeft;
  if (explosionLeft < 20) {
    explosionLeft = 20;
  } else if (explosionLeft + explosionWidth > viewportWidth - 20) {
    explosionLeft = viewportWidth - explosionWidth - 20;
  }

  if (originalLeft !== explosionLeft) {
    // console.log('[WordExplosion] 居中计算 step6 - 边界调整后的弹窗左边缘:', explosionLeft);
  }

  // 转换为页面坐标（加上滚动偏移）
  const explosionLeftInViewport = explosionLeft;
  explosionLeft += scrollX;

  // console.log('[WordExplosion] 居中计算 step7 - 最终弹窗左边缘(视口):', explosionLeftInViewport, '最终弹窗左边缘(页面):', explosionLeft);
  // console.log('[WordExplosion] 居中计算 step8 - 弹窗中心应该在(视口):', explosionLeftInViewport + halfExplosionWidth);

  // 计算句子上方和下方的可用空间
  const spaceAbove = sentenceRect.top;
  const spaceBelow = viewportHeight - sentenceRect.bottom;

  // console.log('[WordExplosion] 句子位置:', sentenceRect);
  // console.log('[WordExplosion] 弹窗宽度:', explosionWidth);
  // console.log('[WordExplosion] 上方空间:', spaceAbove, '下方空间:', spaceBelow);
  // console.log('[WordExplosion] 滚动偏移:', scrollX, scrollY);

  // 判断向上还是向下展示
  // 根据用户设置的preferUp配置决定弹窗方向
  let showAbove;
  if (wordExplosionConfig.preferUp) {
    // 优先向上：只要上方空间足够就向上显示
    showAbove = spaceAbove > minHeight;
    console.log('[WordExplosion] 优先向上模式 - 上方空间:', spaceAbove, 'minHeight:', minHeight, '结果:', showAbove ? '向上' : '向下');
  } else {
    // 优先向下：只有当下方空间不足且上方空间足够时才向上显示
    showAbove = spaceBelow < minHeight && spaceAbove > minHeight;
    console.log('[WordExplosion] 优先向下模式 - 下方空间:', spaceBelow, '上方空间:', spaceAbove, 'minHeight:', minHeight, '结果:', showAbove ? '向上' : '向下');
  }

  if (showAbove) {
    // 向上展示：底部固定在句子上方，顶部向上扩展
    // console.log('[WordExplosion] 向上展示');
//
    // 空白窗口向上弹出时增加20px间距，避免覆盖句子
    const actualGap = isEmptyWindow ? gap + 20 : gap;

    // 弹窗底部应该在句子上方gap距离处（页面坐标）
    // 注意：sentenceRect.top 是CSS像素，已经考虑了页面缩放
    // 所以这里不需要额外的缩放调整
    const explosionBottomInPage = sentenceRect.top - actualGap + scrollY;

    // 弹窗顶部最高位置（页面坐标，距离页面顶部至少20px）
    const minTopInPage = 20 + scrollY;

    // 可用的最大高度：从最高位置到弹窗底部的距离
    const availableHeight = explosionBottomInPage - minTopInPage;

    // 临时显示弹窗以获取实际高度
    const wasHidden = wordExplosionEl.style.display === 'none';
    if (wasHidden) {
      wordExplosionEl.style.visibility = 'hidden';
      wordExplosionEl.style.display = 'block';
    }

    // 先设置样式，以便获取实际高度
    wordExplosionEl.style.left = explosionLeft + 'px';
    wordExplosionEl.style.maxHeight = 'none'; // 先不限制，获取自然高度
    wordExplosionEl.style.overflow = 'auto';

    // 强制重排以获取实际高度
    wordExplosionEl.offsetHeight;
    const naturalHeight = wordExplosionEl.getBoundingClientRect().height;

    // 恢复隐藏状态
    if (wasHidden) {
      wordExplosionEl.style.display = 'none';
      wordExplosionEl.style.visibility = '';
    }

    // 获取弹窗的padding和border（这些不包含在maxHeight中）
    const computedStyle = window.getComputedStyle(wordExplosionEl);
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;
    const extraHeight = paddingTop + paddingBottom + borderTop + borderBottom;

    // console.log('[WordExplosion] 向上定位 - 额外高度:', {
    //   paddingTop,
    //   paddingBottom,
    //   borderTop,
    //   borderBottom,
    //   total: extraHeight
    // });

    // 确定最终maxHeight
    let finalMaxHeight;

    if (naturalHeight <= availableHeight) {
      // 自然高度可以放下，不需要限制
      finalMaxHeight = naturalHeight;
    } else {
      // 自然高度放不下，限制高度为可用高度
      // 注意：maxHeight需要减去padding和border，因为maxHeight只限制内容区域
      finalMaxHeight = availableHeight - extraHeight;
    }

    // 计算期望的底部中心点位置（页面坐标）
    // 底部中心点应该在句子上方 gap 距离处
    const bottomCenterX = sentenceCenterX + scrollX;
    const bottomCenterY = explosionBottomInPage;

    // 先设置 maxHeight 和临时的 left，以便获取实际高度
    wordExplosionEl.style.left = (bottomCenterX - explosionWidth / 2) + 'px';
    wordExplosionEl.style.maxHeight = finalMaxHeight + 'px';
    wordExplosionEl.style.overflow = 'auto';
    wordExplosionEl.style.bottom = 'auto';

    // 强制重排以获取实际高度
    wordExplosionEl.offsetHeight;
    const actualHeight = wordExplosionEl.getBoundingClientRect().height;

    // 向上弹出时，计算top使得底部在期望位置
    // 期望的左下角位置 = (bottomCenterX - width/2, bottomCenterY)
    // 所以 top = bottomCenterY - actualHeight
    const adjustedTop = bottomCenterY - actualHeight;

    wordExplosionEl.style.top = adjustedTop + 'px';

    // 记录定位信息，用于内容变化时重新定位
    currentExplosionPosition = {
      isAbove: true,
      sentenceRect: sentenceRect,
      explosionBottomInPage: explosionBottomInPage,
      minTopInPage: minTopInPage,
      scrollX: scrollX,
      scrollY: scrollY
    };

    // 验证最终位置
    wordExplosionEl.offsetHeight; // 强制重排
    const finalRect = wordExplosionEl.getBoundingClientRect();
    const finalBottomInPage = finalRect.bottom + scrollY;
    const sentenceTopInPage = sentenceRect.top + scrollY;

    // console.log('[WordExplosion] 向上定位 - 底部位置(期望):', explosionBottomInPage, '自然高度:', naturalHeight, '可用高度:', availableHeight, '最终高度:', finalHeight, 'top:', finalTop);
    // console.log('[WordExplosion] 向上定位 - 验证: 弹窗bottom(页面):', finalBottomInPage, '句子top(页面):', sentenceTopInPage, '差距:', sentenceTopInPage - finalBottomInPage, 'gap设置:', gap);
  } else {
    // 向下展示：顶部固定在句子下方，底部向下扩展
    // console.log('[WordExplosion] 向下展示');

    const maxHeight = spaceBelow - gap - 20; // 减去间距和底部边距
    const explosionTop = sentenceRect.bottom + gap + scrollY;

    // 向下弹出时，计算left和top使得弹窗居中对齐句子
    const topCenterX = sentenceCenterX + scrollX;
    const topCenterY = explosionTop;

    const adjustedLeft = topCenterX - (explosionWidth / 2);

    wordExplosionEl.style.left = adjustedLeft + 'px';
    wordExplosionEl.style.top = topCenterY + 'px';
    wordExplosionEl.style.bottom = 'auto';
    wordExplosionEl.style.maxHeight = maxHeight + 'px';
    wordExplosionEl.style.overflow = 'auto';

    // 记录定位信息（向下展开不需要重新定位）
    currentExplosionPosition = {
      isAbove: false,
      sentenceRect: sentenceRect,
      scrollX: scrollX,
      scrollY: scrollY
    };

    // console.log('[WordExplosion] 向下定位 - top:', explosionTop, 'maxHeight:', maxHeight);
  }

  // 从Shadow DOM中定位左侧按钮
  if (explosionShadowRoot) {
    const leftButtons = explosionShadowRoot.getElementById('word-explosion-left-buttons-wrapper');
    const leftButtonsBridge = explosionShadowRoot.getElementById('word-explosion-left-buttons-bridge');
    if (leftButtons) {
      // 显示左侧按钮
      leftButtons.style.display = 'flex';
      // 同步弹窗的暗色模式类到左侧按钮容器
      if (wordExplosionEl.classList.contains('dark-mode')) {
        leftButtons.classList.add('dark-mode');
      } else {
        leftButtons.classList.remove('dark-mode');
      }
      // 根据弹窗位置定位左侧按钮
      const explosionRect = wordExplosionEl.getBoundingClientRect();
      leftButtons.style.position = wordExplosionEl.style.position; // 与弹窗使用相同的position模式
      leftButtons.style.left = (parseFloat(wordExplosionEl.style.left) - 28) + 'px'; // 24px按钮 + 4px空隙 = 28px
      leftButtons.style.top = (parseFloat(wordExplosionEl.style.top) + 16) + 'px'; // 向下偏移16px，避免与弹窗圆角平齐

      // 定位透明连接层，填充按钮和弹窗之间的空隙
      if (leftButtonsBridge) {
        leftButtonsBridge.style.display = 'block';
        leftButtonsBridge.style.position = wordExplosionEl.style.position;
        leftButtonsBridge.style.left = (parseFloat(wordExplosionEl.style.left) - 4) + 'px'; // 从弹窗左边往外-4px
        leftButtonsBridge.style.top = wordExplosionEl.style.top;
        // 高度与弹窗一致
        leftButtonsBridge.style.height = explosionRect.height + 'px';
      }
    }
  }
}

// 向上展开时重新定位弹窗（保持底部固定）
function repositionExplosionWhenAbove() {
  if (!wordExplosionEl || !currentExplosionPosition || !currentExplosionPosition.isAbove) {
    return;
  }

  const { explosionBottomInPage, minTopInPage } = currentExplosionPosition;

  // 获取弹窗当前的实际高度
  const currentHeight = wordExplosionEl.getBoundingClientRect().height;

  // 计算新的top位置，使底部保持在explosionBottomInPage
  const newTop = explosionBottomInPage - currentHeight;

  // 确保不超出顶部边界
  const finalTop = Math.max(newTop, minTopInPage);

  // 更新top位置
  wordExplosionEl.style.top = finalTop + 'px';

  // 从Shadow DOM中同步更新左侧按钮和连接层的位置
  if (explosionShadowRoot) {
    const leftButtons = explosionShadowRoot.getElementById('word-explosion-left-buttons-wrapper');
    const leftButtonsBridge = explosionShadowRoot.getElementById('word-explosion-left-buttons-bridge');

    if (leftButtons) {
      leftButtons.style.top = (finalTop + 16) + 'px'; // 向下偏移16px，避免与弹窗圆角平齐
    }

    if (leftButtonsBridge) {
      leftButtonsBridge.style.top = finalTop + 'px';
      // 更新连接层高度
      leftButtonsBridge.style.height = currentHeight + 'px';
    }
  }

  console.log('[WordExplosion] 重新定位(向上) - 当前高度:', currentHeight, '新top:', finalTop, '底部位置(期望):', explosionBottomInPage);
}

// =======================
// 语言检测函数（复用highlightManager的逻辑）
// =======================

/**
 * 检测文本是否为日语
 * @param {string} text - 要检测的文本
 * @returns {boolean} - 是否为日语文本
 */
function isJapaneseTextExplosion(text) {
  // 检测是否含有日语特有的平假名或片假名
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return true;
  }

  // 如果highlightManager可用，使用其智能识别功能
  if (typeof highlightManager !== 'undefined' && highlightManager) {
    // 如果开启了智能识别且页面被判定为日文页面，纯汉字文本也视为日文
    if (highlightManager.autoDetectJapaneseKanji && highlightManager.isJapaneseDominantPage) {
      if (/^[\u4E00-\u9FFF]+$/.test(text)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检测文本是否为中文
 * @param {string} text - 要检测的文本
 * @returns {boolean} - 是否为中文文本
 */
function isChineseTextExplosion(text) {
  // 检测是否含有中文汉字（排除日语特有的假名）
  return /[\u4E00-\u9FFF]+/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/**
 * 检测文本是否为韩语
 * @param {string} text - 要检测的文本
 * @returns {boolean} - 是否为韩语文本
 */
function isKoreanTextExplosion(text) {
  // 检测是否含有韩语特有字符
  return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(text);
}

/**
 * 根据语言高亮设置判断是否应该显示爆炸弹窗
 * @param {string} sentence - 要检测的句子
 * @returns {boolean} - 是否应该显示爆炸弹窗
 */
function shouldShowExplosionForLanguage(sentence) {
  if (!sentence || !sentence.trim()) {
    return false;
  }

  // 检测句子语言类型
  const isJapanese = isJapaneseTextExplosion(sentence);
  const isChinese = isChineseTextExplosion(sentence);
  const isKorean = isKoreanTextExplosion(sentence);

  // 如果是日语文本
  if (isJapanese) {
    if (!highlightLanguageSettings.highlightJapaneseEnabled) {
      console.log('[WordExplosion] 日语高亮已关闭，跳过句子:', sentence.substring(0, 50));
      return false;
    }
    return true;
  }

  // 如果是中文文本
  if (isChinese) {
    if (!highlightLanguageSettings.highlightChineseEnabled) {

      if (/[a-zA-Z]/.test(sentence)) {
        // 如果包含拉丁字母，使用西方文本处理方法
  
        return true;
      }else{

        console.log('[WordExplosion] 中文高亮已关闭，跳过句子:', sentence.substring(0, 50));
        return false;
      }
      
    }
    return true;
  }

  // 如果是韩语文本
  if (isKorean) {
    if (!highlightLanguageSettings.highlightKoreanEnabled) {
      console.log('[WordExplosion] 韩语高亮已关闭，跳过句子:', sentence.substring(0, 50));
      return false;
    }
    return true;
  }

  // 其他语言（字母语言）
  if (!highlightLanguageSettings.highlightAlphabeticEnabled) {
    console.log('[WordExplosion] 字母语言高亮已关闭，跳过句子:', sentence.substring(0, 50));
    return false;
  }

  return true;
}

// =======================
// 语言检测函数结束
// =======================

// 检查是否为纯数字、纯标点符号或数字与标点的组合（如版本号）
function isNonLanguageSymbol(word) {
  // 检查是否为纯数字
  if (/^\d+$/.test(word)) {
    return true;
  }

  // 检查是否为纯标点符号（不包含任何字母或数字）
  if (/^[^\p{L}\d]+$/u.test(word)) {
    return true;
  }

  // 检查是否为数字和标点的组合（如版本号、日期等）
  // 使用更简单的方法：检查是否不包含任何字母
  if (!/\p{L}/u.test(word)) {
    return true;
  }

  return false;
}

// 从句子中提取未知单词和词组（状态0-4）
async function extractUnknownWords(sentence, shouldTriggerQuery = true) {
  // console.log(`[extractUnknownWords] 开始提取未知单词, shouldTriggerQuery: ${shouldTriggerQuery}`);
  
  if (!sentence || !sentence.trim()) return [];

  // 使用 Map 进行去重，key 为 wordLower，value 为单词/词组信息
  const wordMap = new Map();

  // ========== 第一步：提取单词 ==========
  // 使用 Intl.Segmenter 分词
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const segments = Array.from(segmenter.segment(sentence));

  const words = segments
    .filter(seg => seg.isWordLike)
    .map(seg => seg.segment.trim())
    .filter(word => word.length > 0)
    .filter(word => !isNonLanguageSymbol(word)) // 过滤掉纯数字和标点符号
    .filter(word => {
      // 根据语言高亮设置过滤单词
      // 如果word是中文且中文高亮未启用，则跳过
      if (isChineseTextExplosion(word)) {
        if (!highlightLanguageSettings.highlightChineseEnabled) {
          return false;
        }
      }
      // 如果word是日语且日语高亮未启用，则跳过
      else if (isJapaneseTextExplosion(word)) {
        if (!highlightLanguageSettings.highlightJapaneseEnabled) {
          return false;
        }
      }
      // 如果word是韩语且韩语高亮未启用，则跳过
      else if (isKoreanTextExplosion(word)) {
        if (!highlightLanguageSettings.highlightKoreanEnabled) {
          return false;
        }
      }
      // 字母语言（西文）检查
      else if (!highlightLanguageSettings.highlightAlphabeticEnabled) {
        // 如果是字母语言且字母语言高亮未启用，则跳过
        if (/[a-zA-Z]/.test(word)) {
          return false;
        }
      }
      return true;
    });

  // 收集需要查询的单词
  const wordsToQuery = [];
  const wordDetailsCache = new Map(); // 临时缓存，存储从缓存或数据库获取的详情

  for (const word of words) {
    const wordLower = word.toLowerCase();

    // 如果已经处理过这个单词（不区分大小写），跳过
    if (wordMap.has(wordLower)) {
      continue;
    }

    // 先从缓存中查找
    let wordDetails = null;
    if (highlightManager && highlightManager.wordDetailsFromDB) {
      wordDetails = highlightManager.wordDetailsFromDB[wordLower];
    }

    // 如果缓存中没有，或者只有轻量级数据（没有translations字段），需要从数据库查询
    if (shouldTriggerQuery && (!wordDetails || !wordDetails.hasOwnProperty('translations'))) {
      wordsToQuery.push({ word, wordLower });

      // 先创建一个临时的details对象，避免后续处理时找不到
      // 如果缓存中完全没有，创建一个空对象
      if (!wordDetails) {
        wordDetails = { word: word, status: undefined };
        if (highlightManager && highlightManager.wordDetailsFromDB) {
          highlightManager.wordDetailsFromDB[wordLower] = wordDetails;
          console.log(`[extractUnknownWords] 第一个循环创建临时缓存: ${wordLower}, status: undefined`);
        }
      }
      wordDetailsCache.set(wordLower, wordDetails);
    } else {
      // 已有缓存数据，直接存储
      wordDetailsCache.set(wordLower, wordDetails);
    }
  }

  // 异步并发查询所有需要查询的单词（不等待完成）
  if (wordsToQuery.length > 0) {
    console.log('[WordExplosion] 异步查询', wordsToQuery.length, '个单词的详情');

    // 不等待查询完成，立即返回，让UI先渲染
    Promise.all(
      wordsToQuery.map(({ wordLower }) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getWordDetails", word: wordLower }, (response) => {
            resolve({ wordLower, details: response?.details });
          });
        })
      )
    ).then(results => {
      // 查询完成后，更新缓存，并检查状态1-4的单词是否需要补充数据
      results.forEach(({ wordLower, details }) => {
        // console.log(`[extractUnknownWords] 异步查询结果: ${wordLower}`, details);
        
        // 获取缓存中当前的状态（可能在第二个循环中已被更新为1）
        const existingStatus = highlightManager?.wordDetailsFromDB?.[wordLower]?.status;
        const existingStatusNum = existingStatus !== undefined ? parseInt(existingStatus, 10) : undefined;
        
        // 检查数据库返回的是否为有效数据（有word字段或status字段）
        const hasValidData = details && (details.word || details.status !== undefined);
        // console.log(`[extractUnknownWords] hasValidData: ${hasValidData}, 当前缓存状态: ${existingStatus}`);
        
        if (hasValidData) {
          // 如果缓存中的状态已经是1-4，而数据库返回的状态是undefined或0，保留缓存中的状态
          if (existingStatusNum >= 1 && existingStatusNum <= 4 && 
              (details.status === undefined || details.status === '0' || details.status === 0)) {
            console.log(`[WordExplosion] 保留缓存中的状态 ${existingStatus}，不使用数据库返回的状态:`, wordLower);
            // 合并数据：保留缓存中的状态，但使用数据库中的其他数据
            details.status = existingStatus;
          }
          
          // 更新缓存
          if (highlightManager && highlightManager.wordDetailsFromDB) {
            highlightManager.wordDetailsFromDB[wordLower] = details;
          }
          wordDetailsCache.set(wordLower, details);

          // 检查状态1-4的单词是否需要智能补充缺失数据
          // 现在我们有了完整的数据库数据，可以准确判断
          const status = details.status !== undefined ? parseInt(details.status, 10) : undefined;
          if (shouldTriggerQuery && status >= 1 && status <= 4) {
            const hasTranslations = details.translations && details.translations.length > 0;
            const hasTags = details.tags && details.tags.length > 0;
            const hasLanguage = !!details.language;

            if (!hasTranslations || !hasTags || !hasLanguage) {
              console.log('[WordExplosion] 状态1-4单词缺少数据，触发智能补充:', wordLower, {
                hasTranslations, hasTags, hasLanguage
              });
              triggerMissingDataQuery(details.word || wordLower, sentence, details);
            }
          }
        } else {
          // 数据库返回空数据时，检查缓存中是否已有有效状态（如已被设置为1）
          // 如果有，保留缓存中的状态，不要被空数据覆盖
          if (existingStatusNum >= 1 && existingStatusNum <= 4) {
            console.log(`[WordExplosion] 数据库返回空数据，但缓存中已有状态 ${existingStatus}，保留缓存状态:`, wordLower);
            // 确保缓存条目存在且状态正确
            if (highlightManager && highlightManager.wordDetailsFromDB) {
              if (!highlightManager.wordDetailsFromDB[wordLower]) {
                highlightManager.wordDetailsFromDB[wordLower] = { word: wordLower, status: existingStatus };
              } else {
                highlightManager.wordDetailsFromDB[wordLower].status = existingStatus;
              }
            }
          }
        }
      });
      console.log('[WordExplosion] 异步查询完成，缓存已更新');
    }).catch(error => {
      console.error('[WordExplosion] 并发查询单词详情失败:', error);
    });
  }

  // 处理所有单词，添加到wordMap并触发查询
  for (const word of words) {
    const wordLower = word.toLowerCase();

    // 如果已经处理过这个单词（不区分大小写），跳过
    if (wordMap.has(wordLower)) {
      continue;
    }

    const wordDetails = wordDetailsCache.get(wordLower);

    // 判断单词状态（注意：数据库中status可能是字符串）
    let status = wordDetails?.status;

    // 转换为数字
    if (status !== undefined && status !== null) {
      status = parseInt(status, 10);
    }

    // 状态0-4的单词都算未知单词
    if (status === undefined || status === 0 || status === 1 || status === 2 || status === 3 || status === 4) {
      // 添加到 Map 中（去重）
      wordMap.set(wordLower, {
        word: word,
        wordLower: wordLower,
        status: status,
        details: wordDetails,
        isPhrase: false // 标记为单词
      });

      // 检查是否需要触发全套初始化查询（仅限状态0或undefined）
      // 注意：状态1-4的单词的缺失数据判断已移到数据库查询完成后进行
      // 因为此时本地缓存只有轻量级数据，无法准确判断translations/tags是否缺失
      const needsFullQuery = shouldTriggerQuery && (
        status === undefined ||
        status === 0
      );

      // console.log(`[extractUnknownWords] 单词 ${wordLower}, status: ${status}, needsFullQuery: ${needsFullQuery}`);

      if (needsFullQuery) {
        // 立即更新本地缓存中的状态为1，避免UI显示延迟
        if (highlightManager && highlightManager.wordDetailsFromDB) {
          console.log(`[extractUnknownWords] 更新前缓存状态: ${wordLower} = ${highlightManager.wordDetailsFromDB[wordLower]?.status}`);
          if (!highlightManager.wordDetailsFromDB[wordLower]) {
            highlightManager.wordDetailsFromDB[wordLower] = { word: word, status: '1' };
            console.log(`[extractUnknownWords] 创建缓存条目: ${wordLower} -> status: 1`);
          } else {
            highlightManager.wordDetailsFromDB[wordLower].status = '1';
            console.log(`[extractUnknownWords] 更新缓存状态: ${wordLower} -> status: 1`);
          }
          console.log(`[extractUnknownWords] 更新后缓存状态: ${wordLower} = ${highlightManager.wordDetailsFromDB[wordLower]?.status}`);
        }

        // 同时更新wordMap中的status为1
        const wordMapEntry = wordMap.get(wordLower);
        if (wordMapEntry) {
          wordMapEntry.status = 1;
          if (wordMapEntry.details) {
            wordMapEntry.details.status = '1';
          }
        }

        // 异步触发全套查询（不等待）
        triggerWordQuery(word, sentence);
      }
      // 状态1-4的单词的缺失数据补充在数据库查询的.then()回调中处理
    }
  }

  // ========== 第二步：提取词组 ==========
  // 检查a6自定义词组系统是否可用
  if (typeof customWordTrie !== 'undefined' && customWordTrie && typeof customWordDetails !== 'undefined') {
    try {
      // 使用 Aho-Corasick 算法搜索句子中的词组
      const phraseMatches = customWordTrie.search(sentence);

      // console.log('[WordExplosion] 在句子中找到词组:', phraseMatches.length, '个');

      // 收集需要查询的词组
      const phrasesToQuery = [];
      const phraseDetailsCache = new Map(); // 临时缓存，存储从缓存或数据库获取的详情
      const phraseBasicInfoMap = new Map(); // 存储词组的基本信息

      for (const match of phraseMatches) {
        const phraseLower = match.word.toLowerCase();

        // 如果已经作为单词处理过，跳过（词组优先级更高，所以覆盖）
        // 或者如果已经作为词组处理过，也跳过
        if (wordMap.has(phraseLower) && wordMap.get(phraseLower).isPhrase) {
          continue;
        }

        // 从 customWordDetails 获取词组基本信息（status, isCustom）
        const phraseBasicInfo = customWordDetails.get(phraseLower);

        if (!phraseBasicInfo) {
          console.warn('[WordExplosion] 词组详情不存在:', match.word);
          continue;
        }

        // 判断词组状态
        let status = phraseBasicInfo.status;
        if (status !== undefined && status !== null) {
          status = parseInt(status, 10);
        }

        // 状态0-4的词组都算未知词组
        if (status === undefined || status === 0 || status === 1 || status === 2 || status === 3 || status === 4) {
          // 保存基本信息
          phraseBasicInfoMap.set(phraseLower, { ...phraseBasicInfo, status, match });

          // 先从highlightManager缓存查找
          let phraseFullDetails = null;
          if (highlightManager && highlightManager.wordDetailsFromDB) {
            phraseFullDetails = highlightManager.wordDetailsFromDB[phraseLower];
          }

          // 如果缓存中没有，或者只有轻量级数据（没有translations字段），需要从数据库查询
          if (shouldTriggerQuery && (!phraseFullDetails || !phraseFullDetails.hasOwnProperty('translations'))) {
            phrasesToQuery.push({ word: match.word, wordLower: phraseLower });
          } else {
            // 已有缓存数据，直接存储
            phraseDetailsCache.set(phraseLower, phraseFullDetails);
          }
        }
      }

      // 并发查询所有需要查询的词组
      if (phrasesToQuery.length > 0) {
        console.log('[WordExplosion] 并发查询', phrasesToQuery.length, '个词组的详情');
        const queryPromises = phrasesToQuery.map(({ wordLower }) =>
          new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "getWordDetails", word: wordLower }, (response) => {
              resolve({ wordLower, details: response?.details });
            });
          })
        );

        try {
          const results = await Promise.all(queryPromises);

          // 处理查询结果
          results.forEach(({ wordLower, details }) => {
            if (details) {
              // 更新缓存
              if (highlightManager && highlightManager.wordDetailsFromDB) {
                highlightManager.wordDetailsFromDB[wordLower] = details;
              }
              phraseDetailsCache.set(wordLower, details);
            }
          });
        } catch (error) {
          console.error('[WordExplosion] 并发查询词组详情失败:', error);
        }
      }

      // 处理所有词组，添加到wordMap并触发查询
      for (const [phraseLower, basicInfo] of phraseBasicInfoMap.entries()) {
        const phraseFullDetails = phraseDetailsCache.get(phraseLower);
        const { status, match } = basicInfo;

        // 合并基本信息和完整详情
        const mergedDetails = {
          ...basicInfo,
          ...(phraseFullDetails || {}),
          status: status, // 确保使用最新的status
          isCustom: basicInfo.isCustom
        };

        // 添加到 Map 中（如果是单词，则覆盖；如果是词组，则去重）
        wordMap.set(phraseLower, {
          word: match.word,
          wordLower: phraseLower,
          status: status,
          details: mergedDetails,
          isPhrase: true // 标记为词组
        });

        console.log('[WordExplosion] 添加词组:', match.word, 'status:', status, 'translations:', mergedDetails.translations?.length || 0);

        // 检查词组是否需要触发全套初始化查询（仅限状态0或undefined）
        const needsFullQuery = shouldTriggerQuery && (
          status === undefined ||
          status === 0
        );

        // 检查是否需要智能补充缺失数据（状态1-4且缺少翻译/语言/标签）
        const needsMissingDataQuery = shouldTriggerQuery &&
          status >= 1 && status <= 4 && (
            !mergedDetails?.translations || mergedDetails.translations.length === 0 ||
            !mergedDetails?.tags || mergedDetails.tags.length === 0 ||
            !mergedDetails?.language
          );

        if (needsFullQuery) {
          triggerWordQuery(match.word, sentence);
        } else if (needsMissingDataQuery) {
          // 状态1-4的词组，只补充缺失的数据，不修改状态
          triggerMissingDataQuery(match.word, sentence, mergedDetails);
        }
      }
    } catch (error) {
      console.error('[WordExplosion] 提取词组失败:', error);
    }
  } else {
    console.log('[WordExplosion] 自定义词组系统未初始化，跳过词组提取');
  }

  // 将 Map 转换为数组返回
  return Array.from(wordMap.values());
}

// 触发单词查询（用于状态0的单词）
// 复用现有的AI查询函数，确保数据库和缓存正确更新
async function triggerWordQuery(word, sentence) {
  console.log('[WordExplosion] 触发单词查询:', word);

  const wordLower = word.toLowerCase();

  // 检查是否已经在查询中
  const translationKey = `${wordLower}_${sentence}`;
  if (window.aiTranslationInProgress && window.aiTranslationInProgress.has(translationKey)) {
    console.log('[WordExplosion] 单词已在查询中，跳过:', word);
    return;
  }

  // 异步更新数据库状态为1（不等待完成，因为本地缓存已经更新）
  chrome.runtime.sendMessage({
    action: 'updateWordStatus',
    word: wordLower,
    status: '1' // 注意：数据库中status存储为字符串
  }, (response) => {
    console.log('[WordExplosion] 数据库状态已更新为1:', word);

    // 刷新主页面的高亮（本地缓存已在extractUnknownWords中更新）
    if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.updateWordHighlight) {
      console.log('[WordExplosion] 刷新主页面高亮:', word);
      highlightManager.updateWordHighlight(word, '1', document.body);
    }
  });

  // 并发执行所有查询任务（语言检测、AI翻译、标签推荐、例句翻译）
  // 这些任务互不依赖，可以同时进行
  const queryTasks = [];

  // 1. 语言检测任务
  if (typeof fetchLanguageDetection === 'function') {
    const languageTask = fetchLanguageDetection(word, sentence)
      .then(language => {
        console.log('[WordExplosion] 语言检测完成:', word, language);

        // 更新数据库和缓存
        if (language && language !== false) {
          chrome.runtime.sendMessage({
            action: 'updateWordLanguage',
            word: wordLower,
            language: language
          });

          // 更新highlightManager缓存
          if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.wordDetailsFromDB) {
            if (highlightManager.wordDetailsFromDB[wordLower]) {
              highlightManager.wordDetailsFromDB[wordLower].language = language;
            }
          }
        }
      })
      .catch(error => {
        console.error('[WordExplosion] 语言检测失败:', error);
      });
    queryTasks.push(languageTask);
  }

  // 2. AI翻译任务（需要先获取设置）
  const translationTask = new Promise((resolve) => {
    chrome.storage.local.get(['autoRequestAITranslations'], (settings) => {
      if (settings.autoRequestAITranslations && typeof fetchAIWordTranslation === 'function') {
        // fetchAIWordTranslation会自动处理数据库更新和缓存更新
        fetchAIWordTranslation(word, sentence)
          .then(translation => {
            console.log('[WordExplosion] AI翻译完成:', word, translation);
            resolve();
          })
          .catch(error => {
            console.error('[WordExplosion] AI翻译失败:', error);
            resolve();
          });
      } else {
        resolve();
      }
    });
  });
  queryTasks.push(translationTask);

  // 3. 标签推荐任务
  if (typeof fetchAITags === 'function') {
    const tagsTask = fetchAITags(word, sentence)
      .then(tags => {
        console.log('[WordExplosion] 标签推荐完成:', word, tags);

        // 将tags存储到数据库（逐个添加）
        if (tags && typeof tags === 'object' && Object.keys(tags).length > 0) {
          // 将tags对象转换为数组格式，过滤掉null值
          const tagArray = [];
          for (const [key, value] of Object.entries(tags)) {
            if (value !== null && value !== 'null' && value !== undefined && value !== '') {
              // 将key:value格式化为字符串标签
              const tagString = typeof value === 'string' || typeof value === 'number'
                ? `${key}:${value}`
                : `${key}:${JSON.stringify(value)}`;
              tagArray.push(tagString);
            }
          }

          if (tagArray.length > 0) {
            console.log('[WordExplosion] 准备添加标签:', tagArray);

            // 逐个添加标签到数据库
            let addedCount = 0;
            tagArray.forEach((tag) => {
              chrome.runtime.sendMessage({
                action: 'addTag',
                word: wordLower,
                tag: tag
              }, (response) => {
                if (response && !response.error) {
                  addedCount++;
                  console.log(`[WordExplosion] 标签已添加 (${addedCount}/${tagArray.length}):`, tag);

                  // 当所有标签都添加完成后，更新highlightManager缓存
                  if (addedCount === tagArray.length) {
                    if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.wordDetailsFromDB) {
                      if (!highlightManager.wordDetailsFromDB[wordLower]) {
                        highlightManager.wordDetailsFromDB[wordLower] = { word: word, tags: tagArray };
                      } else {
                        if (!highlightManager.wordDetailsFromDB[wordLower].tags) {
                          highlightManager.wordDetailsFromDB[wordLower].tags = [];
                        }
                        // 合并标签，避免重复
                        tagArray.forEach(t => {
                          if (!highlightManager.wordDetailsFromDB[wordLower].tags.includes(t)) {
                            highlightManager.wordDetailsFromDB[wordLower].tags.push(t);
                          }
                        });
                      }
                    }
                  }
                } else {
                  console.error('[WordExplosion] 添加标签失败:', tag, response?.error);
                }
              });
            });
          }
        }
      })
      .catch(error => {
        console.error('[WordExplosion] 标签推荐失败:', error);
      });
    queryTasks.push(tagsTask);
  }

  // 注意：不再在这里添加例句翻译任务
  // 爆炸窗口已经有独立的句子翻译系统（getSentenceTranslations），避免重复请求

  // 等待所有任务完成（不阻塞，仅用于日志）
  Promise.all(queryTasks).then(() => {
    console.log('[WordExplosion] 所有查询任务已完成:', word);
  }).catch(error => {
    console.error('[WordExplosion] 查询任务执行出错:', error);
  });
}

// 智能补充缺失数据（用于状态1-4的单词，不修改状态）
// 只补充缺失的翻译、语言、标签，不会改变单词的当前状态
async function triggerMissingDataQuery(word, sentence, wordDetails) {
  const wordLower = word.toLowerCase();

  console.log('[WordExplosion] 智能补充缺失数据:', word, {
    hasTranslations: !!(wordDetails?.translations?.length),
    hasLanguage: !!wordDetails?.language,
    hasTags: !!(wordDetails?.tags?.length)
  });

  // 检查是否已经在查询中（复用同一个防重复机制）
  const queryKey = `missing_${wordLower}`;
  if (window.aiTranslationInProgress && window.aiTranslationInProgress.has(queryKey)) {
    console.log('[WordExplosion] 该单词已在补充查询中，跳过:', word);
    return;
  }

  // 标记为正在查询
  if (!window.aiTranslationInProgress) {
    window.aiTranslationInProgress = new Set();
  }
  window.aiTranslationInProgress.add(queryKey);

  const queryTasks = [];

  // 1. 如果缺少语言信息，补充语言检测
  if (!wordDetails?.language && typeof fetchLanguageDetection === 'function') {
    const languageTask = fetchLanguageDetection(word, sentence)
      .then(language => {
        console.log('[WordExplosion] 语言检测完成(补充):', word, language);
        if (language && language !== false) {
          chrome.runtime.sendMessage({
            action: 'updateWordLanguage',
            word: wordLower,
            language: language
          });
          // 更新highlightManager缓存
          if (typeof highlightManager !== 'undefined' && highlightManager?.wordDetailsFromDB?.[wordLower]) {
            highlightManager.wordDetailsFromDB[wordLower].language = language;
          }
        }
      })
      .catch(error => {
        console.error('[WordExplosion] 语言检测失败(补充):', error);
      });
    queryTasks.push(languageTask);
  }

  // 2. 如果缺少翻译，补充AI翻译
  const hasTranslations = wordDetails?.translations && wordDetails.translations.length > 0;
  if (!hasTranslations) {
    const translationTask = new Promise((resolve) => {
      chrome.storage.local.get(['autoRequestAITranslations'], (settings) => {
        if (settings.autoRequestAITranslations && typeof fetchAIWordTranslation === 'function') {
          fetchAIWordTranslation(word, sentence)
            .then(translation => {
              console.log('[WordExplosion] AI翻译完成(补充):', word, translation);
              resolve();
            })
            .catch(error => {
              console.error('[WordExplosion] AI翻译失败(补充):', error);
              resolve();
            });
        } else {
          resolve();
        }
      });
    });
    queryTasks.push(translationTask);
  }

  // 3. 如果缺少标签，补充标签推荐
  const hasTags = wordDetails?.tags && wordDetails.tags.length > 0;
  if (!hasTags && typeof fetchAITags === 'function') {
    const tagsTask = fetchAITags(word, sentence)
      .then(tags => {
        console.log('[WordExplosion] 标签推荐完成(补充):', word, tags);
        if (tags && typeof tags === 'object' && Object.keys(tags).length > 0) {
          const tagArray = [];
          for (const [key, value] of Object.entries(tags)) {
            if (value !== null && value !== 'null' && value !== undefined && value !== '') {
              const tagString = typeof value === 'string' || typeof value === 'number'
                ? `${key}:${value}`
                : `${key}:${JSON.stringify(value)}`;
              tagArray.push(tagString);
            }
          }
          if (tagArray.length > 0) {
            tagArray.forEach((tag) => {
              chrome.runtime.sendMessage({
                action: 'addTag',
                word: wordLower,
                tag: tag
              }, (response) => {
                if (response && !response.error) {
                  console.log('[WordExplosion] 标签已添加(补充):', tag);
                  // 更新缓存
                  if (typeof highlightManager !== 'undefined' && highlightManager?.wordDetailsFromDB?.[wordLower]) {
                    if (!highlightManager.wordDetailsFromDB[wordLower].tags) {
                      highlightManager.wordDetailsFromDB[wordLower].tags = [];
                    }
                    if (!highlightManager.wordDetailsFromDB[wordLower].tags.includes(tag)) {
                      highlightManager.wordDetailsFromDB[wordLower].tags.push(tag);
                    }
                  }
                }
              });
            });
          }
        }
      })
      .catch(error => {
        console.error('[WordExplosion] 标签推荐失败(补充):', error);
      });
    queryTasks.push(tagsTask);
  }

  // 如果没有需要补充的数据，直接返回
  if (queryTasks.length === 0) {
    console.log('[WordExplosion] 该单词数据完整，无需补充:', word);
    window.aiTranslationInProgress.delete(queryKey);
    return;
  }

  // 等待所有任务完成
  Promise.all(queryTasks).then(() => {
    console.log('[WordExplosion] 缺失数据补充完成:', word);
    window.aiTranslationInProgress.delete(queryKey);
  }).catch(error => {
    console.error('[WordExplosion] 缺失数据补充出错:', error);
    window.aiTranslationInProgress.delete(queryKey);
  });
}

// 处理一键已知按钮点击
function handleMarkAllKnownClick() {
  if (!currentExplosionWords || currentExplosionWords.length === 0) {
    console.log('[WordExplosion] 没有未知单词需要标记');
    return;
  }

  console.log('[WordExplosion] 开始批量标记为已知，共', currentExplosionWords.length, '个单词');

  let updatedCount = 0;
  let needUpdateCount = 0;

  // 先统计需要更新的单词数量
  currentExplosionWords.forEach((wordInfo) => {
    if (wordInfo.status >= 0 && wordInfo.status <= 4) {
      needUpdateCount++;
    }
  });

  if (needUpdateCount === 0) {
    console.log('[WordExplosion] 所有单词已经是已知状态');
    if (typeof showToast === 'function') {
      showToast('所有单词已经是已知状态');
    }
    return;
  }

  // 遍历所有未知单词
  currentExplosionWords.forEach((wordInfo) => {
    const word = wordInfo.word;
    const wordLower = word.toLowerCase();
    const currentStatus = wordInfo.status;

    // 只处理状态为0-4的单词
    if (currentStatus >= 0 && currentStatus <= 4) {
      // 发送消息更新状态为5
      chrome.runtime.sendMessage({
        action: 'updateWordStatus',
        word: wordLower,
        status: '5' // 注意：数据库中status存储为字符串
      }, (response) => {
        if (response && !response.error) {
          console.log('[WordExplosion] 单词已标记为已知:', word);
          updatedCount++;

          // 更新highlightManager缓存
          if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.wordDetailsFromDB) {
            if (highlightManager.wordDetailsFromDB[wordLower]) {
              highlightManager.wordDetailsFromDB[wordLower].status = '5';
            }

            // // 更新knownWords集合
            // if (typeof knownWords !== 'undefined' && knownWords) {
            //   knownWords.add(wordLower);
            // }

            // 立即更新该单词的高亮状态
            if (typeof highlightManager.updateWordHighlight === 'function') {
              highlightManager.updateWordHighlight(word, '5', null);
            }
          }

          // 当所有单词都处理完成后
          if (updatedCount === needUpdateCount) {
            console.log('[WordExplosion] 批量标记完成，共更新', updatedCount, '个单词');

            // 关闭爆炸弹窗
            hideWordExplosion();

            // 显示提示信息
            if (typeof showToast === 'function') {
              showToast(`已将 ${updatedCount} 个单词标记为已知`);
            }
          }
        } else {
          console.error('[WordExplosion] 更新单词状态失败:', word, response?.error);
        }
      });
    }
  });
}

// 处理单个单词标记为已知（状态5）
function handleMarkSingleWordKnown(word, wordLower, wordDiv) {
  console.log('[WordExplosion] 标记单个单词为已知:', word);

  // 查找当前单词的状态
  const wordInfo = currentExplosionWords.find(w => w.wordLower === wordLower);
  if (!wordInfo) {
    console.error('[WordExplosion] 找不到单词信息:', word);
    return;
  }

  const currentStatus = wordInfo.status;

  // 只处理状态为0-4的单词
  if (currentStatus < 0 || currentStatus > 4) {
    console.log('[WordExplosion] 单词已经是已知状态:', word);
    if (typeof showToast === 'function') {
      showToast('该单词已经是已知状态');
    }
    return;
  }

  // 发送消息更新状态为5
  chrome.runtime.sendMessage({
    action: 'updateWordStatus',
    word: wordLower,
    status: '5' // 注意：数据库中status存储为字符串
  }, (response) => {
    if (response && !response.error) {
      console.log('[WordExplosion] 单词已标记为已知:', word);

      // 更新wordInfo的状态
      wordInfo.status = '5';

      // 更新highlightManager缓存
      if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.wordDetailsFromDB) {
        if (highlightManager.wordDetailsFromDB[wordLower]) {
          highlightManager.wordDetailsFromDB[wordLower].status = '5';
        }

        // 立即更新该单词的高亮状态
        if (typeof highlightManager.updateWordHighlight === 'function') {
          highlightManager.updateWordHighlight(word, '5', null);
        }
      }

      // 从DOM中移除该单词条目（添加淡出动画）
      if (wordDiv) {
        wordDiv.style.transition = 'opacity 0.3s, transform 0.3s';
        wordDiv.style.opacity = '0';
        wordDiv.style.transform = 'translateX(20px)';
        setTimeout(() => {
          wordDiv.remove();

          // 检查是否还有未知单词
          const remainingWords = currentExplosionWords.filter(w => w.status >= 0 && w.status <= 4);
          if (remainingWords.length === 0) {
            console.log('[WordExplosion] 所有单词已标记为已知，关闭弹窗');
            hideWordExplosion();
            if (typeof showToast === 'function') {
              showToast('所有单词已标记为已知');
            }
          }
        }, 300);
      }

      // 显示提示信息
      if (typeof showToast === 'function') {
        showToast(`已将 "${word}" 标记为已知`);
      }
    } else {
      console.error('[WordExplosion] 更新单词状态失败:', word, response?.error);
      if (typeof showToast === 'function') {
        showToast('标记失败，请重试');
      }
    }
  });
}

// 更新弹窗内容
async function updateWordExplosionContent(content) {
  if (!wordExplosionEl) return;

  const contentEl = wordExplosionEl.querySelector('.word-explosion-content');
  if (!contentEl) return;

  // 如果是字符串（提示信息）
  if (typeof content === 'string') {
    // 特殊处理：空白窗口（用于爆炸优先模式）
    if (content === '空白窗口') {
      // 显示空白内容，但保留弹窗结构（用于爆炸优先模式）
      // 设置最小宽度和高度，确保右上角的按钮（喇叭、关闭）能正常显示
      contentEl.innerHTML = '<div class="word-explosion-empty" style="min-width: 10px; min-height: 50px;"></div>';
      cachedUIContent = contentEl.innerHTML;
      return;
    }

    // 使用Promise包装chrome.storage.local.get
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['showKnownSentenceAnimation', 'knownSentenceAnimation'], resolve);
    });

    const showAnimation = result.showKnownSentenceAnimation !== undefined ? result.showKnownSentenceAnimation : true;

    if (!showAnimation) {
      // 这个分支不应该被执行到，因为在showWordExplosion中已经处理了
      // 但为了安全起见，仍然保留这个逻辑
      contentEl.innerHTML = '<div class="word-explosion-empty" style="min-height: 50px;"></div>';
      cachedUIContent = contentEl.innerHTML;
      return;
    }

    // 获取动图配置
    const animConfig = result.knownSentenceAnimation || {
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

    // 构建URL参数
    const params = new URLSearchParams();
    params.set('topEnabled', animConfig.topEnabled);
    params.set('bottomEnabled', animConfig.bottomEnabled);

    // 顶层动图
    if (animConfig.topCustom && animConfig.topCustomData) {
      params.set('topSrc', animConfig.topCustomData);
      params.set('topCustom', 'true');
    } else {
      // 使用完整的chrome URL
      const topFullUrl = chrome.runtime.getURL(`src/service/image/lottie/${animConfig.topSrc}`);
      params.set('topSrc', topFullUrl);
      params.set('topCustom', 'false');
    }

    // 底层动图
    if (animConfig.bottomCustom && animConfig.bottomCustomData) {
      params.set('bottomSrc', animConfig.bottomCustomData);
      params.set('bottomCustom', 'true');
    } else {
      // 使用完整的chrome URL
      const bottomFullUrl = chrome.runtime.getURL(`src/service/image/lottie/${animConfig.bottomSrc}`);
      params.set('bottomSrc', bottomFullUrl);
      params.set('bottomCustom', 'false');
    }

    // 使用iframe嵌入tgs-balloon.html
    const balloonHtmlUrl = chrome.runtime.getURL('src/service/image/lottie/tgs-balloon.html');
    // 添加时间戳避免iframe缓存旧动画
    params.set('_t', Date.now());
    const iframeUrl = `${balloonHtmlUrl}?${params.toString()}`;
    const newContent = `
      <div class="word-explosion-empty">
        <iframe
          src="${iframeUrl}"
          style="width:${animConfig.width}px;height:${animConfig.height}px;border:none;background:transparent;color-scheme:none !important;"
          frameborder="0">
        </iframe>
      </div>`;
    contentEl.innerHTML = newContent;
    cachedUIContent = newContent;
    return;
  }

  // 如果是单词数组
  if (Array.isArray(content) && content.length > 0) {
    await renderWordExplosionContent(contentEl, content, false);
    // 更新缓存
    cachedUIContent = contentEl.innerHTML;
  }
}

// 渲染弹窗内容
async function renderWordExplosionContent(container, unknownWords, forceRefresh = false) {
  container.innerHTML = '';

  // 如果启用了显示原句，添加原句显示
  if (wordExplosionConfig.showExplosionSentence && currentExplosionSentence) {
    const sentenceDiv = document.createElement('div');
    sentenceDiv.className = 'word-explosion-sentence';
    sentenceDiv.textContent = currentExplosionSentence;
    container.appendChild(sentenceDiv);
  }

  // 创建句子翻译容器
  const translationsDiv = document.createElement('div');
  translationsDiv.className = 'word-explosion-sentence-translations';
  translationsDiv.id = 'sentence-translations-container'; // 添加ID以便后续更新

  // 先检查缓存中是否已有翻译
  const cachedTranslations = explosionSentenceTranslationsCache[currentExplosionSentence] || [];

  if (cachedTranslations.length > 0) {
    // 如果缓存中有翻译，直接显示
    for (let i = 0; i < cachedTranslations.length; i++) {
      const transDiv = document.createElement('div');
      transDiv.className = 'word-explosion-sentence-translation';
      transDiv.textContent = cachedTranslations[i];
      translationsDiv.appendChild(transDiv);
    }
  } else {
    // 如果缓存中没有翻译，显示"AI 请求中..."占位符
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'word-explosion-sentence-translation word-explosion-loading';
    loadingDiv.textContent = 'AI 请求中...';
    translationsDiv.appendChild(loadingDiv);
  }

  container.appendChild(translationsDiv);

  // 添加分隔线
  const separator = document.createElement('div');
  separator.className = 'word-explosion-separator';
  container.appendChild(separator);

  // 添加单词列表(不等待句子翻译)
  const wordsContainer = document.createElement('div');
  wordsContainer.className = `word-explosion-words word-explosion-layout-${wordExplosionConfig.layout} word-explosion-words-layout-${wordExplosionConfig.wordsLayout}`;

  for (const wordInfo of unknownWords) {
    const wordDiv = await createWordItem(wordInfo, forceRefresh);
    wordsContainer.appendChild(wordDiv);
  }

  container.appendChild(wordsContainer);

  // 如果缓存中没有翻译，异步获取句子翻译(不阻塞单词加载)
  if (cachedTranslations.length === 0) {
    getSentenceTranslations(currentExplosionSentence, unknownWords, forceRefresh).then(sentenceTranslations => {
      // 更新句子翻译UI
      const translationsContainer = container.querySelector('#sentence-translations-container');
      if (!translationsContainer) return;

      if (sentenceTranslations.length > 0) {
        // 有翻译,清空占位符并显示所有翻译
        translationsContainer.innerHTML = '';

        for (let i = 0; i < sentenceTranslations.length; i++) {
          const transDiv = document.createElement('div');
          transDiv.className = 'word-explosion-sentence-translation';
          transDiv.textContent = sentenceTranslations[i];
          translationsContainer.appendChild(transDiv);
        }
      } else {
        // 如果没有翻译,保留"AI 请求中..."占位符
        // 等待AI翻译完成后,通过refreshSentenceTranslationsUI更新
        console.log('[WordExplosion] 没有翻译,保留占位符,等待AI翻译');
      }
    }).catch(error => {
      console.error('[WordExplosion] 获取句子翻译失败:', error);
      // 出错时移除占位符
      const translationsContainer = container.querySelector('#sentence-translations-container');
      if (translationsContainer) {
        translationsContainer.remove();
      }
    });
  }
}

// 创建单词/词组项
async function createWordItem(wordInfo, forceRefresh = false) {
  const wordDiv = document.createElement('div');
  wordDiv.className = 'word-explosion-word-item';

  // 如果是词组，添加特殊样式类
  if (wordInfo.isPhrase) {
    wordDiv.classList.add('word-explosion-phrase-item');
  }

  // 单词/词组标题
  const wordTitle = document.createElement('div');
  wordTitle.className = 'word-explosion-word-title';

  // 如果是词组，添加标记
  // if (wordInfo.isPhrase) {
  //   const phraseTag = document.createElement('span');
  //   phraseTag.className = 'word-explosion-phrase-tag';
  //   phraseTag.textContent = '词组';
  //   wordTitle.appendChild(phraseTag);
  // }

  const wordText = document.createElement('span');
  wordText.textContent = wordInfo.word;
  wordTitle.appendChild(wordText);

  // 添加TTS喇叭按钮
  const ttsButton = document.createElement('span');
  ttsButton.className = 'word-explosion-tts-button';
  ttsButton.innerHTML = '🔊';
  ttsButton.title = '播放发音';
  ttsButton.addEventListener('click', (e) => {
    e.stopPropagation();
    // 触发TTS播放
    if (typeof playText === 'function') {
      playText({
        text: wordInfo.word,
        count: 1,
        sentence: currentExplosionSentence
      });
    } else {
      console.error('[WordExplosion] playText function is not available');
    }
  });
  wordTitle.appendChild(ttsButton);

  // 添加快捷标记为状态5的按钮
  const markKnownButton = document.createElement('span');
  markKnownButton.className = 'word-explosion-mark-known-button';
  markKnownButton.innerHTML = '✓';
  markKnownButton.title = '标记为已知(状态5)';
  markKnownButton.addEventListener('click', (e) => {
    e.stopPropagation();
    // 更新单词状态为5
    handleMarkSingleWordKnown(wordInfo.word, wordInfo.wordLower, wordDiv);
  });
  wordTitle.appendChild(markKnownButton);

  wordDiv.appendChild(wordTitle);

  // 先检查缓存中是否有翻译
  const cachedDetails = wordInfo.details || highlightManager?.wordDetailsFromDB?.[wordInfo.wordLower];
  const cachedTranslations = cachedDetails?.translations;
  const hasTranslations = Array.isArray(cachedTranslations) && cachedTranslations.length > 0;

  if (hasTranslations) {
    // 缓存中有翻译，直接显示
    const translationsDiv = document.createElement('div');
    translationsDiv.className = 'word-explosion-word-translations';

    const count = wordExplosionConfig.translationCount === 'all'
      ? cachedTranslations.length
      : Math.min(cachedTranslations.length, wordExplosionConfig.translationCount);

    for (let i = 0; i < count; i++) {
      const transDiv = document.createElement('div');
      transDiv.className = 'word-explosion-word-translation';

      if (count > 1) {
        // 多个翻译时显示序号
        transDiv.innerHTML = `<span class="translation-number">${i + 1}.</span> ${cachedTranslations[i]}`;
      } else {
        transDiv.textContent = cachedTranslations[i];
      }

      translationsDiv.appendChild(transDiv);
    }

    wordDiv.appendChild(translationsDiv);
  } else {
    // 没有翻译，显示加载中占位符
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'word-explosion-word-loading';
    loadingDiv.textContent = '加载中...';
    loadingDiv.dataset.word = wordInfo.wordLower; // 添加标识，方便后续更新
    wordDiv.appendChild(loadingDiv);

    // 异步获取翻译（不阻塞UI渲染）
    getWordTranslations(wordInfo, false).then(translations => {
      if (translations.length > 0) {
        // 从数据库获取到翻译，手动更新UI
        console.log('[WordExplosion] 异步获取翻译完成，更新UI:', wordInfo.word, translations);
        updateSingleWordUI(wordInfo);
      }
    }).catch(error => {
      console.error('[WordExplosion] 异步获取翻译失败:', error);
    });
  }

  return wordDiv;
}

// 获取单词翻译
async function getWordTranslations(wordInfo, forceRefresh = false) {
  const translations = [];

  // 从缓存或数据库获取
  let wordDetails = wordInfo.details;

  // 检查是否需要获取新数据
  const needFetch = forceRefresh ||
                    !wordDetails ||
                    !wordDetails.hasOwnProperty('translations') ||
                    (Array.isArray(wordDetails.translations) && wordDetails.translations.length === 0);

  if (needFetch) {
    // 先尝试从highlightManager缓存中获取
    if (!forceRefresh && highlightManager && highlightManager.wordDetailsFromDB) {
      const cachedDetails = highlightManager.wordDetailsFromDB[wordInfo.wordLower];
      if (cachedDetails && cachedDetails.hasOwnProperty('translations')) {
        const cachedTranslations = cachedDetails.translations;
        // 只有当缓存中的翻译比当前的更多时才使用
        if (Array.isArray(cachedTranslations) && cachedTranslations.length > 0) {
          wordDetails = cachedDetails;
          wordInfo.details = wordDetails; // 更新本地缓存
          console.log('[WordExplosion] 从highlightManager缓存获取翻译:', wordInfo.word, cachedTranslations);
        }
      }
    }

    // 如果highlightManager缓存中也没有有效数据，才从数据库获取
    const currentTranslations = wordDetails?.translations;
    const hasValidTranslations = Array.isArray(currentTranslations) && currentTranslations.length > 0;

    if (!hasValidTranslations) {
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getWordDetails", word: wordInfo.wordLower }, resolve);
        });
        const dbDetails = response?.details;
        console.log('[WordExplosion] 从数据库获取翻译:', wordInfo.word, dbDetails?.translations);

        // 只有当数据库返回的数据比当前缓存更完整时才更新
        if (dbDetails) {
          const dbTranslations = dbDetails.translations;
          const currentCachedDetails = highlightManager?.wordDetailsFromDB?.[wordInfo.wordLower];
          const currentCachedTranslations = currentCachedDetails?.translations;
          const currentCachedStatus = currentCachedDetails?.status;

          // 检查数据库返回的数据是否有效（有translations或status）
          const hasDbTranslations = Array.isArray(dbTranslations) && dbTranslations.length > 0;
          const hasDbStatus = dbDetails.status !== undefined;

          // 如果数据库返回的translations不为空，或者缓存中也没有translations，才更新
          if (hasDbTranslations ||
              !currentCachedTranslations ||
              !Array.isArray(currentCachedTranslations) ||
              currentCachedTranslations.length === 0) {
            // 合并数据：如果缓存中有status但数据库没有，保留缓存中的status
            if (currentCachedStatus !== undefined && dbDetails.status === undefined) {
              dbDetails.status = currentCachedStatus;
              console.log(`[WordExplosion] 数据库返回空状态，保留缓存中的状态: ${currentCachedStatus}`);
            }
            wordDetails = dbDetails;
            wordInfo.details = wordDetails;
            // 同时更新highlightManager缓存
            if (highlightManager && highlightManager.wordDetailsFromDB) {
              highlightManager.wordDetailsFromDB[wordInfo.wordLower] = wordDetails;
            }
          } else {
            // 数据库返回空数组，但缓存中有数据，保留缓存
            console.log('[WordExplosion] 数据库返回空数组，保留缓存中的翻译:', currentCachedTranslations);
            wordDetails = currentCachedDetails;
            wordInfo.details = wordDetails;
          }
        } else {
          // 数据库返回null/undefined，检查缓存中是否已有有效状态
          const currentCachedDetails = highlightManager?.wordDetailsFromDB?.[wordInfo.wordLower];
          const currentCachedStatus = currentCachedDetails?.status;
          const currentCachedStatusNum = currentCachedStatus !== undefined ? parseInt(currentCachedStatus, 10) : undefined;
          
          if (currentCachedStatusNum >= 1 && currentCachedStatusNum <= 4) {
            console.log(`[WordExplosion] 数据库返回空数据，保留缓存中的状态: ${currentCachedStatus}`);
            // 确保缓存条目存在且状态正确
            if (highlightManager && highlightManager.wordDetailsFromDB) {
              if (!highlightManager.wordDetailsFromDB[wordInfo.wordLower]) {
                highlightManager.wordDetailsFromDB[wordInfo.wordLower] = { word: wordInfo.wordLower, status: currentCachedStatus };
              } else {
                highlightManager.wordDetailsFromDB[wordInfo.wordLower].status = currentCachedStatus;
              }
            }
          }
        }
      } catch (error) {
        console.error('[WordExplosion] 获取单词翻译失败:', error);
      }
    }
  }

  if (wordDetails && wordDetails.translations && Array.isArray(wordDetails.translations)) {
    translations.push(...wordDetails.translations);
  }

  return translations;
}

// 获取句子翻译（使用独立缓存，不依赖单词数据库）
async function getSentenceTranslations(sentence, unknownWords, forceRefresh = false) {
  // 先检查独立缓存
  if (!forceRefresh && explosionSentenceTranslationsCache[sentence]) {
    console.log('[WordExplosion] 从独立缓存获取句子翻译:', explosionSentenceTranslationsCache[sentence]);
    return explosionSentenceTranslationsCache[sentence];
  }

  // 如果缓存中没有翻译，获取配置并触发AI翻译
  // 使用Promise包装以确保正确的异步流程
  return new Promise((resolve) => {
    chrome.storage.local.get(['explosionSentenceTranslationCount'], async (result) => {
      const translationCount = result.explosionSentenceTranslationCount || 1;
      console.log('[WordExplosion] 需要获取', translationCount, '条翻译');

      // 初始化缓存数组（避免重复触发）
      if (!explosionSentenceTranslationsCache[sentence]) {
        explosionSentenceTranslationsCache[sentence] = [];
      }

      // 异步触发AI翻译（不阻塞返回）
      if (typeof fetchSentenceTranslation === 'function') {
        const firstWord = unknownWords[0]?.word || '';

        // 根据配置请求多个翻译
        for (let i = 0; i < translationCount; i++) {
          fetchSentenceTranslation(firstWord, sentence, i + 1)
            .then(aiTranslation => {
              if (aiTranslation && aiTranslation !== '暂无翻译' && aiTranslation !== '翻译失败') {
                // 移除Markdown加粗标记 **关键词** -> 关键词
                const cleanedTranslation = aiTranslation.replace(/\*\*/g, '');
                console.log(`[WordExplosion] AI句子翻译${i + 1}完成:`, cleanedTranslation);

                // 保存到独立缓存（去重）
                if (!explosionSentenceTranslationsCache[sentence].includes(cleanedTranslation)) {
                  explosionSentenceTranslationsCache[sentence].push(cleanedTranslation);
                }

                // 刷新UI显示
                if (currentExplosionSentence === sentence) {
                  refreshSentenceTranslationsUI();
                }
              }
            })
            .catch(error => {
              console.error(`[WordExplosion] AI句子翻译${i + 1}失败:`, error);
            });
        }
      }

      // 立即返回当前缓存（可能为空数组）
      resolve(explosionSentenceTranslationsCache[sentence] || []);
    });
  });
}

// 刷新句子翻译UI（当新翻译到达时调用）
function refreshSentenceTranslationsUI() {
  if (!wordExplosionEl || !currentExplosionSentence) return;

  const translationsContainer = wordExplosionEl.querySelector('#sentence-translations-container');
  if (!translationsContainer) return;

  const translations = explosionSentenceTranslationsCache[currentExplosionSentence] || [];

  if (translations.length > 0) {
    // 清空占位符并显示所有翻译
    translationsContainer.innerHTML = '';

    for (let i = 0; i < translations.length; i++) {
      const transDiv = document.createElement('div');
      transDiv.className = 'word-explosion-sentence-translation';
      transDiv.textContent = translations[i];
      translationsContainer.appendChild(transDiv);
    }

    console.log('[WordExplosion] 句子翻译UI已刷新,显示', translations.length, '条翻译');
  }
}

// 单独更新句子翻译UI
async function updateSentenceTranslationUI(container, unknownWords) {
  const translationsContainer = container.querySelector('#sentence-translations-container');
  if (!translationsContainer) {
    console.log('[WordExplosion] 未找到句子翻译容器');
    return;
  }

  // 获取句子翻译(使用缓存数据,不强制刷新)
  const sentenceTranslations = await getSentenceTranslations(currentExplosionSentence, unknownWords, false);

  if (sentenceTranslations.length > 0) {
    // 有翻译,清空占位符并显示所有翻译
    translationsContainer.innerHTML = '';

    for (let i = 0; i < sentenceTranslations.length; i++) {
      const transDiv = document.createElement('div');
      transDiv.className = 'word-explosion-sentence-translation';
      transDiv.textContent = sentenceTranslations[i];
      translationsContainer.appendChild(transDiv);
    }

    console.log('[WordExplosion] 句子翻译UI已更新,显示', sentenceTranslations.length, '条翻译');
  } else {
    console.log('[WordExplosion] 仍然没有句子翻译');
  }
}

// 刷新单词翻译数据（当收到翻译更新通知时调用）
async function refreshWordTranslationData(updatedWord) {
  if (!wordExplosionEl || !currentExplosionSentence || !currentExplosionWords) return;

  const contentEl = wordExplosionEl.querySelector('.word-explosion-content');
  if (!contentEl) return;

  console.log('[WordExplosion] 收到单词翻译更新通知:', updatedWord);

  // 查找是否是当前句子中的单词
  const wordInfo = currentExplosionWords.find(w => w.wordLower === updatedWord.toLowerCase());
  if (!wordInfo) {
    console.log('[WordExplosion] 更新的单词不在当前句子中，忽略');
    return;
  }

  // 从数据库获取最新数据
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getWordDetails", word: wordInfo.wordLower }, resolve);
    });
    const newDetails = response?.details;

    if (!newDetails) {
      console.log('[WordExplosion] 未获取到单词详情');
      return;
    }

    // 对比翻译数据是否变化
    const oldTranslations = JSON.stringify(wordInfo.details?.translations || []);
    const newTranslations = JSON.stringify(newDetails?.translations || []);

    if (oldTranslations !== newTranslations) {
      console.log(`[WordExplosion] ${wordInfo.isPhrase ? '词组' : '单词'} ${wordInfo.word} 翻译已变化`);
      wordInfo.details = newDetails; // 更新本地缓存

      // 同时更新highlightManager的全局缓存
      if (typeof highlightManager !== 'undefined' && highlightManager && highlightManager.wordDetailsFromDB) {
        highlightManager.wordDetailsFromDB[wordInfo.wordLower] = newDetails;
        console.log(`[WordExplosion] 已更新highlightManager缓存: ${wordInfo.word}`);
      }

      // 如果是词组，还需要更新customWordDetails缓存
      if (wordInfo.isPhrase && typeof customWordDetails !== 'undefined' && customWordDetails) {
        const existingData = customWordDetails.get(wordInfo.wordLower);
        if (existingData) {
          const updatedData = {
            ...existingData,
            translations: newDetails.translations,
            sentences: newDetails.sentences
          };
          customWordDetails.set(wordInfo.wordLower, updatedData);
          console.log(`[WordExplosion] 已更新customWordDetails缓存: ${wordInfo.word}`);
        }
      }

      // 只更新这个单词的UI，而不是重新渲染整个弹窗
      console.log('[WordExplosion] 单词翻译已变化，更新单词UI');
      await updateSingleWordUI(wordInfo);
    }
  } catch (error) {
    console.error('[WordExplosion] 刷新单词翻译数据失败:', error);
  }
}

// 更新单个单词的UI
async function updateSingleWordUI(wordInfo) {
  if (!wordExplosionEl) return;

  const contentEl = wordExplosionEl.querySelector('.word-explosion-content');
  if (!contentEl) return;

  // 查找该单词在UI中的元素
  const wordsContainer = contentEl.querySelector('.word-explosion-words');
  if (!wordsContainer) return;

  // 查找该单词的索引
  const wordIndex = currentExplosionWords.findIndex(w => w.wordLower === wordInfo.wordLower);
  if (wordIndex === -1) return;

  // 获取该单词的DOM元素
  const wordItems = wordsContainer.querySelectorAll('.word-explosion-word-item');
  if (wordIndex >= wordItems.length) return;

  const oldWordItem = wordItems[wordIndex];

  // 创建新的单词项
  const newWordItem = await createWordItem(wordInfo, false);

  // 替换旧的单词项
  oldWordItem.replaceWith(newWordItem);

  console.log('[WordExplosion] 已更新单词UI:', wordInfo.word);
}

// 刷新数据（定时调用）
async function refreshWordExplosionData() {
  if (!wordExplosionEl || !currentExplosionSentence || currentExplosionWords.length === 0) {
    return;
  }

  // 重新获取未知单词（可能状态已改变），但不触发查询
  const updatedWords = await extractUnknownWords(currentExplosionSentence, false);

  // 检查单词列表是否真正变化（增加或减少单词）
  const wordListChanged = updatedWords.length !== currentExplosionWords.length ||
    updatedWords.some((word, index) => {
      const current = currentExplosionWords[index];
      return !current || word.wordLower !== current.wordLower;
    });

  // 检查是否只是状态变化（单词列表相同，但状态不同）
  const onlyStatusChanged = !wordListChanged && updatedWords.some((word, index) => {
    const current = currentExplosionWords[index];
    return current && word.status !== current.status;
  });

  if (wordListChanged) {
    // 单词列表真正变化（增加或减少单词）→ 需要全量刷新
    console.log('[WordExplosion] 单词列表已变化，执行全量刷新');

    // 合并新旧数据：保留旧的details对象，只更新status
    const mergedWords = updatedWords.map(newWord => {
      const oldWord = currentExplosionWords.find(w => w.wordLower === newWord.wordLower);
      if (oldWord && oldWord.details && oldWord.details.hasOwnProperty('translations')) {
        // 保留旧的完整details，只更新status
        return {
          ...newWord,
          details: {
            ...oldWord.details,
            status: newWord.status
          }
        };
      }
      return newWord;
    });

    currentExplosionWords = mergedWords;

    if (mergedWords.length === 0) {
      updateWordExplosionContent('本句无生词');
      // 没有未知单词了，停止定时更新
      if (wordExplosionUpdateTimer) {
        clearInterval(wordExplosionUpdateTimer);
        wordExplosionUpdateTimer = null;
      }
    } else {
      updateWordExplosionContent(mergedWords);
    }
  } else if (onlyStatusChanged) {
    // 只是状态变化（如0→1）→ 不刷新UI，等待AI翻译完成后通过wordCacheUpdated事件更新
    console.log('[WordExplosion] 检测到状态变化，但不触发全量刷新，等待AI翻译完成');

    // 更新内存中的状态，但不刷新UI
    currentExplosionWords = updatedWords.map((newWord, index) => {
      const oldWord = currentExplosionWords[index];
      if (oldWord && oldWord.details) {
        return {
          ...newWord,
          details: {
            ...oldWord.details,
            status: newWord.status
          }
        };
      }
      return newWord;
    });
  } else {
    // 单词列表和状态都没变，但需要检查details是否已更新（比如AI翻译完成）
    let detailsUpdated = false;

    // 从缓存中获取最新的details
    const updatedWordsWithCache = currentExplosionWords.map(wordInfo => {
      const cachedDetails = highlightManager?.wordDetailsFromDB?.[wordInfo.wordLower];

      // 检查缓存中的details是否比当前的更完整
      if (cachedDetails) {
        // 获取当前的translations（可能不存在或为undefined）
        const currentTranslations = wordInfo.details?.translations;
        const cachedTranslations = cachedDetails.translations;

        // console.log(`[WordExplosion] 检查缓存更新: ${wordInfo.word}, 当前:`, currentTranslations, '缓存:', cachedTranslations);

        // 检查translations是否有更新
        let translationsUpdated = false;
        if (cachedTranslations && Array.isArray(cachedTranslations)) {
          if (!currentTranslations || !Array.isArray(currentTranslations)) {
            // 当前没有translations，但缓存中有
            translationsUpdated = cachedTranslations.length > 0;
          } else {
            // 都有translations，比较长度
            translationsUpdated = cachedTranslations.length > currentTranslations.length;
          }
        }

        // console.log(`[WordExplosion] translations更新检查: ${wordInfo.word}, 是否更新:`, translationsUpdated);

        // 检查其他字段是否有更新（tags、language等）
        const currentTags = wordInfo.details?.tags;
        const cachedTags = cachedDetails.tags;
        let tagsUpdated = false;
        if (cachedTags && Array.isArray(cachedTags)) {
          if (!currentTags || !Array.isArray(currentTags)) {
            tagsUpdated = cachedTags.length > 0;
          } else {
            tagsUpdated = cachedTags.length > currentTags.length;
          }
        }

        const currentLanguage = wordInfo.details?.language;
        const cachedLanguage = cachedDetails.language;
        const languageUpdated = cachedLanguage && !currentLanguage;

        // 如果有任何字段更新，就更新整个details
        if (translationsUpdated || tagsUpdated || languageUpdated) {
          detailsUpdated = true;
          return {
            ...wordInfo,
            details: cachedDetails
          };
        }
      }

      return wordInfo;
    });

    // 如果details有更新
    if (detailsUpdated) {
      currentExplosionWords = updatedWordsWithCache;
      // 不在这里刷新UI，等待AI翻译完成后的事件触发更新
      console.log('[WordExplosion] 单词details已更新，等待AI翻译完成后刷新UI');
    } else {
      // 只检查句子翻译缓存是否有变化
      const currentTranslationCount = (explosionSentenceTranslationsCache[currentExplosionSentence] || []).length;
      if (currentTranslationCount !== lastSentenceTranslationCount) {
        console.log('[WordExplosion] 独立翻译缓存已变化:', lastSentenceTranslationCount, '->', currentTranslationCount);
        lastSentenceTranslationCount = currentTranslationCount;
        refreshSentenceTranslationsUI();
      }
    }
  }
}

// 更新布局
function updateWordExplosionLayout() {
  if (!wordExplosionEl) return;

  const wordsContainer = wordExplosionEl.querySelector('.word-explosion-words');
  if (wordsContainer) {
    wordsContainer.className = `word-explosion-words word-explosion-layout-${wordExplosionConfig.layout} word-explosion-words-layout-${wordExplosionConfig.wordsLayout}`;
  }
}

// 鼠标移动事件处理 - 悬停触发模式（基于单词位置信息）
document.addEventListener('mousemove', (e) => {
  // 检查插件总开关
  if (!isPluginEnabled) return;

  // 检查是否在黑名单中（与高亮黑名单同步）
  if (isInBlacklist) return;

  // 只在悬停模式下触发
  if (!wordExplosionEnabled || wordExplosionConfig.triggerMode !== 'hover') return;
  if (wordExplosionLocked && isMouseInsideExplosion) return;
  if (wordExplosionDragging) return;

  // --- 新增：检查句子解析弹窗是否正在显示 ---
  // 如果句子解析弹窗正在显示，完全禁用爆炸弹窗功能
  if (window.isAnalysisWindowActive) {
    return;
  }
  // --- 检查结束 ---

  lastMouseMoveEvent = e;

  // 获取鼠标下的元素
  const target = e.target;
  if (!target) return;

  // 检查是否在弹窗内
  if (wordExplosionEl && wordExplosionEl.contains(target)) {
    return;
  }

  // 排除特定元素（按钮、输入框、链接等）
  const excludedTags = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG'];
  if (excludedTags.includes(target.tagName)) {
    return;
  }

  // 排除弹窗、工具栏等UI元素（与高亮黑名单同步）
  const excludedSelectors = [
    '.textBasedSub',
    '[data-no-highlight]',
    '.vocab-tooltip',
    '.custom-word-tooltip',
    '.custom-word-selection-popup',
    '.custom-word-query-button',
    '.word-explosion-container'
  ];

  for (const selector of excludedSelectors) {
    if (target.matches && target.matches(selector)) {
      return;
    }
    if (target.closest && target.closest(selector)) {
      return;
    }
  }

  // 清除之前的延迟计时器
  if (hoverDelayTimer) {
    clearTimeout(hoverDelayTimer);
    hoverDelayTimer = null;
  }

  // 使用基于单词位置的检测算法
  const sentenceInfo = findWordAndSentenceAtPosition(e.clientX, e.clientY);

  if (sentenceInfo && sentenceInfo.sentence && sentenceInfo.sentence.trim().length >= 5) {
    // 检查是否与上次悬停的句子相同，避免重复刷新
    if (sentenceInfo.sentence === lastHoverSentence) {
      return;
    }

    // 设置延迟计时器
    hoverDelayTimer = setTimeout(() => {
      // 在延迟触发时再次检查鼠标是否在弹窗内
      // 如果鼠标已经在弹窗内，则不更新弹窗内容
      if (isMouseInsideExplosion) {
        console.log('[WordExplosion] 鼠标在弹窗内，取消更新');
        return;
      }

      // 检查弹窗是否已经显示且未锁定
      // 如果弹窗已显示且鼠标不在弹窗内，允许更新
      if (wordExplosionEl && wordExplosionEl.style.display !== 'none' && wordExplosionLocked) {
        console.log('[WordExplosion] 弹窗已锁定，取消更新');
        return;
      }

      // 更新缓存
      lastHoverSentence = sentenceInfo.sentence;

      // 获取句子的位置信息
      const sentenceRect = getSentenceRect(sentenceInfo.sentence, {
        textNode: sentenceInfo.textNode,
        range: sentenceInfo.range
      });
      showWordExplosion(sentenceInfo.sentence, sentenceRect, sentenceInfo);
    }, HOVER_DELAY);
  } else {
    // 如果没有找到有效句子，清除上一次悬停的句子缓存和延迟计时器
    lastHoverSentence = null;
    if (hoverDelayTimer) {
      clearTimeout(hoverDelayTimer);
      hoverDelayTimer = null;
    }
  }
}, true);

// 监听鼠标离开文档事件，清除延迟计时器
document.addEventListener('mouseleave', (e) => {
  // 如果鼠标离开文档（不是离开某个元素）
  if (e.target === document.body || e.target === document.documentElement) {
    if (hoverDelayTimer) {
      clearTimeout(hoverDelayTimer);
      hoverDelayTimer = null;
    }
  }
});

// 检查点击是否在任意高亮单词上
function isClickOnHighlightedWord(x, y) {
  if (!highlightManager || !highlightManager.parent2Text2RawsAllUnknow) {
    return false;
  }

  // 如果 highlightManager 有可用的过滤函数，使用它
  const highlightManagerFilter = highlightManager.isNonLanguageSymbol || isNonLanguageSymbol;

  try {
    // 获取所有存储的父元素和文本节点数据
    const allParents = Array.from(highlightManager.parent2Text2RawsAllUnknow.entries());

    for (const [parent, textMap] of allParents) {
      // 确保父元素仍在文档中且可见
      if (!document.contains(parent)) {
        continue;
      }

      // 检查父元素是否可见
      const parentRect = parent.getBoundingClientRect();
      if (parentRect.width === 0 || parentRect.height === 0) {
        continue;
      }

      // 检查鼠标是否在父元素范围内
      if (x < parentRect.left || x > parentRect.right || y < parentRect.top || y > parentRect.bottom) {
        continue;
      }

      // 遍历该父元素下的所有文本节点
      const textEntries = Array.from(textMap.entries());
      for (const [textNode, rawRanges] of textEntries) {
        // 确保文本节点仍在文档中
        if (!document.contains(textNode)) {
          continue;
        }

        // 获取文本节点的位置信息
        let textNodeRect = null;
        try {
          if (textNode.getBoundingClientRect) {
            textNodeRect = textNode.getBoundingClientRect();
          } else {
            const tempRange = document.createRange();
            tempRange.selectNodeContents(textNode);
            textNodeRect = tempRange.getBoundingClientRect();
            tempRange.detach();
          }
        } catch (e) {
          continue;
        }

        if (!textNodeRect || textNodeRect.width === 0 || textNodeRect.height === 0) {
          continue;
        }

        // 检查鼠标是否在文本节点范围内
        if (x < textNodeRect.left || x > textNodeRect.right || y < textNodeRect.top || y > textNodeRect.bottom) {
          continue;
        }

        // 首先过滤掉纯数字和标点符号的rawRanges
        const filteredRanges = rawRanges.filter(raw => !highlightManagerFilter(raw.word));

        // 在过滤后的文本节点中查找鼠标位置的单词
        const foundWord = findWordAtPositionInTextNode(textNode, filteredRanges, x, y);
        if (foundWord) {
          return true; // 点击在高亮单词上
        }
      }
    }

    return false; // 点击不在任何高亮单词上
  } catch (error) {
    console.error('[WordExplosion] 检查点击位置失败:', error);
    return false;
  }
}

// 点击事件处理（兼容移动设备）- 基于单词位置信息
// 改成pointerdown，兼容触控
document.addEventListener('pointerdown',async (e) => {
  // === 关键修复：在延迟之前保存composedPath，因为延迟后事件对象可能失效 ===
  const eventPath = e.composedPath ? e.composedPath() : [e.target];
  const eventTarget = e.target;
  const eventClientX = e.clientX;
  const eventClientY = e.clientY;

  // 提前检查是否点击在爆炸窗口内部（在延迟之前）
  const isInsideExplosion = explosionShadowHost && eventPath.includes(explosionShadowHost);

  console.log('[WordExplosion] pointerdown事件, path:', eventPath.map(el => el.tagName || el.nodeName || el));
  console.log('[WordExplosion] isInsideExplosion:', isInsideExplosion);

  // 如果点击在爆炸窗口内部，直接返回，不处理
  if (isInsideExplosion) {
    console.log('[WordExplosion] 点击在爆炸窗口内部，不处理');
    return;
  }

  // 延迟 50ms（非阻塞）
  // 这里慢50ms，让单词弹窗的pointerdown提前判断，在爆炸优先情况下，可以不弹出单词弹窗。
  // Dont delete it.
  await new Promise(res => setTimeout(res, 50));

  // 检查插件总开关
  if (!isPluginEnabled) return;

  // 检查是否在黑名单中（与高亮黑名单同步）
  if (isInBlacklist) return;

  // 只在点击模式下触发 - 提前检查，避免在悬浮模式下执行后续逻辑
  if (!wordExplosionEnabled || wordExplosionConfig.triggerMode !== 'click') {
    // 如果是悬浮模式，但弹窗正在显示，检查是否需要关闭弹窗
    if (wordExplosionEl && wordExplosionEl.style.display !== 'none') {
      // 检查点击是否在查词弹窗内部
      const tooltipShadowHost = document.getElementById('lingkuma-tooltip-host');

      if ((typeof tooltipEl !== 'undefined' && tooltipEl && tooltipEl.contains(eventTarget)) ||
          (tooltipShadowHost && eventPath.includes(tooltipShadowHost)) ||
          (eventTarget.closest && (eventTarget.closest('.vocab-tooltip') ||
                                eventTarget.closest('#lingkuma-tooltip-host') ||
                                eventTarget.closest('.custom-word-tooltip')))) {
        return; // 点击在查词弹窗内部，不关闭爆炸弹窗
      }

      // 检查点击是否在高亮单词上
      const isOnHighlightedWord = isClickOnHighlightedWord(eventClientX, eventClientY);

      if (!isOnHighlightedWord) {
        // 点击在高亮区域外部，关闭弹窗
        hideWordExplosion();
        return;
      }
    }
    return; // 不是点击模式，不触发新的爆炸弹窗
  }

  // --- 新增：检查句子解析弹窗是否正在显示 ---
  // 如果句子解析弹窗正在显示，完全禁用爆炸弹窗功能
  if (window.isAnalysisWindowActive) {
    return;
  }
  // --- 检查结束 ---

  // 如果弹窗当前显示中
  if (wordExplosionEl && wordExplosionEl.style.display !== 'none') {
    // 检查点击是否在查词弹窗内部
    const tooltipShadowHost = document.getElementById('lingkuma-tooltip-host');

    if ((typeof tooltipEl !== 'undefined' && tooltipEl && tooltipEl.contains(eventTarget)) ||
        (tooltipShadowHost && eventPath.includes(tooltipShadowHost)) ||
        (eventTarget.closest && (eventTarget.closest('.vocab-tooltip') ||
                              eventTarget.closest('#lingkuma-tooltip-host') ||
                              eventTarget.closest('.custom-word-tooltip')))) {
      return; // 点击在查词弹窗内部，不关闭爆炸弹窗
    }

    // 检查点击是否在高亮单词上
    const isOnHighlightedWord = isClickOnHighlightedWord(eventClientX, eventClientY);

    if (!isOnHighlightedWord) {
      // 点击在高亮区域外部，关闭弹窗
      hideWordExplosion();
      return;
    }
  }

  // 只处理文本节点或包含文本的元素
  if (!eventTarget) return;

  // 排除特定元素（按钮、输入框、链接等）
  const excludedTags = ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG'];
  if (excludedTags.includes(eventTarget.tagName)) {
    return;
  }

  // 排除弹窗、工具栏等UI元素（与高亮黑名单同步）
  const excludedSelectors = [
    '.textBasedSub',
    '[data-no-highlight]',
    '.vocab-tooltip',
    '.custom-word-tooltip',
    '.custom-word-selection-popup',
    '.custom-word-query-button',
    '.word-explosion-container'
  ];

  for (const selector of excludedSelectors) {
    if (eventTarget.matches && eventTarget.matches(selector)) {
      return;
    }
    if (eventTarget.closest && eventTarget.closest(selector)) {
      return;
    }
  }

  // 使用基于单词位置的检测算法
  console.log('[WordExplosion] 开始查找句子，坐标:', { x: eventClientX, y: eventClientY });
  const sentenceInfo = findWordAndSentenceAtPosition(eventClientX, eventClientY);
  console.log('[WordExplosion] findWordAndSentenceAtPosition 返回结果:', sentenceInfo);

  // 只有当句子长度合理时才显示（至少5个字符）
  if (sentenceInfo && sentenceInfo.sentence && sentenceInfo.sentence.trim().length >= 5) {
    console.log('[WordExplosion] 找到有效句子，准备显示弹窗:', sentenceInfo.sentence);
    // 获取句子的位置信息
    const sentenceRect = getSentenceRect(sentenceInfo.sentence, {
      textNode: sentenceInfo.textNode,
      range: sentenceInfo.range
    });
    console.log('[WordExplosion] 句子位置信息:', sentenceRect);
    showWordExplosion(sentenceInfo.sentence, sentenceRect, sentenceInfo);
  } else {
    console.log('[WordExplosion] 未找到有效句子，原因:', {
      hasSentenceInfo: !!sentenceInfo,
      hasSentence: !!(sentenceInfo && sentenceInfo.sentence),
      sentenceLength: sentenceInfo && sentenceInfo.sentence ? sentenceInfo.sentence.trim().length : 0
    });
  }
}, true);

// 备用方案：使用传统方法查找单词和句子（当highlightManager不可用时）
function findWordAndSentenceAtPositionFallback(x, y) {
  try {
    // 获取鼠标位置的句子
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return null;

    // 检查range是否在文本节点中
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    const detail = {
      range: range,
      word: ''
    };

    const {sentence, range: sentenceRange} = getSentenceForWord(detail);

    // 只有当句子长度合理时才返回
    if (sentence && sentence.trim().length >= 5) {
      return {
        sentence: sentence,
        rect: getSentenceRectFallback(sentence, range),
        range: range,
        sentenceRange: sentenceRange // 新增：返回句子的 Range 对象
      };
    }

    return null;
  } catch (error) {
    console.error('[WordExplosion] 备用查找方法失败:', error);
    return null;
  }
}

// 备用方案：获取句子矩形
function getSentenceRectFallback(sentence, clickRange) {
  if (!sentence || !clickRange) return null;

  try {
    // 获取点击位置所在的文本节点
    const textNode = clickRange.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return null;

    // 规范化文本：将各种空格字符统一为普通空格
    const normalizeText = (text) => {
      if (!text) return "";
      let normalized = text.replace(/\u00AD/g, '');
      normalized = normalized.replace(/[\s\u00A0]+/g, ' ');
      return normalized;
    };

    const fullText = textNode.textContent;
    const normalizedFullText = normalizeText(fullText);
    const normalizedSentence = normalizeText(sentence);

    // 在规范化后的文本中查找句子位置
    const sentenceStartInNormalized = normalizedFullText.indexOf(normalizedSentence);
    if (sentenceStartInNormalized === -1) {
      console.warn('[WordExplosion] getSentenceRectFallback - 在规范化文本中找不到句子');
      return null;
    }

    // 将规范化后的位置映射回原始文本的位置
    const sentenceStart = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized);
    const sentenceEnd = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized + normalizedSentence.length);

    // 创建Range来获取句子的位置
    const sentenceRange = document.createRange();
    sentenceRange.setStart(textNode, sentenceStart);
    sentenceRange.setEnd(textNode, sentenceEnd);

    // 获取句子的边界矩形
    const rects = sentenceRange.getClientRects();
    if (rects.length === 0) return null;

    // 计算所有矩形的边界（句子可能跨多行）
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
      maxRight = Math.max(maxRight, rect.right);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }

    return {
      left: minLeft,
      top: minTop,
      right: maxRight,
      bottom: maxBottom,
      width: maxRight - minLeft,
      height: maxBottom - minTop
    };
  } catch (error) {
    console.error('[WordExplosion] 备用获取句子位置失败:', error);
    return null;
  }
}

// 基于单词位置信息查找鼠标位置的单词和句子
function findWordAndSentenceAtPosition(x, y) {
  console.log('[WordExplosion] findWordAndSentenceAtPosition 开始，坐标:', { x, y });
  console.log('[WordExplosion] highlightManager 存在:', !!highlightManager);
  console.log('[WordExplosion] parent2Text2RawsAllUnknow 存在:', !!(highlightManager && highlightManager.parent2Text2RawsAllUnknow));
  
  if (!highlightManager || !highlightManager.parent2Text2RawsAllUnknow) {
    console.log('[WordExplosion] highlightManager 或单词位置数据未初始化，使用备用方案');
    return findWordAndSentenceAtPositionFallback(x, y);
  }

  // 如果 highlightManager 有可用的过滤函数，使用它
  const highlightManagerFilter = highlightManager.isNonLanguageSymbol || isNonLanguageSymbol;

  try {
    // 获取所有存储的父元素和文本节点数据
    const allParents = Array.from(highlightManager.parent2Text2RawsAllUnknow.entries());
    console.log('[WordExplosion] 存储的父元素数量:', allParents.length);

    let matchedParent = null;
    let matchedTextNode = null;
    let parentsChecked = 0;

    for (const [parent, textMap] of allParents) {
      parentsChecked++;
      
      // 确保父元素仍在文档中且可见
      if (!document.contains(parent)) {
        continue;
      }

      // 检查父元素是否可见
      const parentRect = parent.getBoundingClientRect();
      if (parentRect.width === 0 || parentRect.height === 0) {
        continue;
      }

      // 检查鼠标是否在父元素范围内
      if (x < parentRect.left || x > parentRect.right || y < parentRect.top || y > parentRect.bottom) {
        continue;
      }

      console.log('[WordExplosion] 找到匹配的父元素:', parent.tagName, parent.className, parent.id);
      matchedParent = parent;

      // 遍历该父元素下的所有文本节点
      const textEntries = Array.from(textMap.entries());
      console.log('[WordExplosion] 父元素下的文本节点数量:', textEntries.length);
      
      for (const [textNode, rawRanges] of textEntries) {
        // 确保文本节点仍在文档中
        if (!document.contains(textNode)) {
          continue;
        }

        // 获取文本节点的位置信息
        let textNodeRect = null;
        try {
          // 尝试直接获取文本节点的边界矩形
          if (textNode.getBoundingClientRect) {
            textNodeRect = textNode.getBoundingClientRect();
          } else {
            // 如果文本节点没有getBoundingClientRect方法，使用Range来获取
            const tempRange = document.createRange();
            tempRange.selectNodeContents(textNode);
            textNodeRect = tempRange.getBoundingClientRect();
            tempRange.detach();
          }
        } catch (e) {
          console.warn('[WordExplosion] 无法获取文本节点位置信息:', e);
          continue;
        }

        if (!textNodeRect || textNodeRect.width === 0 || textNodeRect.height === 0) {
          continue;
        }

        // 检查鼠标是否在文本节点范围内
        if (x < textNodeRect.left || x > textNodeRect.right || y < textNodeRect.top || y > textNodeRect.bottom) {
          continue;
        }

        console.log('[WordExplosion] 找到匹配的文本节点:', textNode.textContent.substring(0, 50));
        console.log('[WordExplosion] 文本节点位置:', textNodeRect);
        console.log('[WordExplosion] 文本节点单词数量:', rawRanges.length);
        matchedTextNode = textNode;

        // 首先过滤掉纯数字和标点符号的rawRanges
        const filteredRanges = rawRanges.filter(raw => !highlightManagerFilter(raw.word));
        console.log('[WordExplosion] 过滤后的单词数量:', filteredRanges.length);

        // 在过滤后的文本节点中查找鼠标位置的单词
        const foundWord = findWordAtPositionInTextNode(textNode, filteredRanges, x, y);
        console.log('[WordExplosion] findWordAtPositionInTextNode 结果:', foundWord);
        
        if (foundWord) {
          // 找到单词后，获取包含该单词的完整句子
          const {sentence, range: sentenceRange} = getSentenceForWord({
            range: foundWord.range,
            word: foundWord.word
          });
          console.log('[WordExplosion] getSentenceForWord 返回:', sentence);

          if (sentence) {
            console.log('[WordExplosion] 成功找到句子和单词:', { word: foundWord.word, sentence: sentence.substring(0, 50) + '...' });
            return {
              word: foundWord.word,
              wordLower: foundWord.wordLower,
              sentence: sentence,
              rect: foundWord.rect,
              textNode: textNode,
              range: foundWord.range,
              sentenceRange: sentenceRange // 新增：返回句子的 Range 对象
            };
          } else {
            console.log('[WordExplosion] getSentenceForWord 返回空');
          }
        }
      }
    }
    
    console.log('[WordExplosion] 检查了', parentsChecked, '个父元素，匹配的父元素:', matchedParent?.tagName, '匹配的文本节点:', matchedTextNode?.textContent?.substring(0, 30));
    console.log('[WordExplosion] 未找到匹配的单词，使用备用方案');
    return findWordAndSentenceAtPositionFallback(x, y);

    // 如果没有找到任何单词，返回null
    return null;
  } catch (error) {
    console.error('[WordExplosion] 基于位置查找单词失败:', error);
    return null;
  }
}

// 在指定的文本节点中查找指定位置的单词
function findWordAtPositionInTextNode(textNode, rawRanges, x, y) {
  try {
    console.log('[WordExplosion] findWordAtPositionInTextNode 开始，坐标:', { x, y });
    console.log('[WordExplosion] 文本节点内容:', textNode.textContent.substring(0, 100));
    console.log('[WordExplosion] rawRanges 数量:', rawRanges.length);
    
    // 创建Range对象来获取文本节点的精确位置信息
    const textRange = document.createRange();
    textRange.selectNodeContents(textNode);
    const textNodeRects = textRange.getClientRects();

    console.log('[WordExplosion] 文本节点矩形数量:', textNodeRects.length);
    if (textNodeRects.length === 0) {
      console.log('[WordExplosion] 文本节点没有矩形，返回null');
      return null;
    }

    // 找到鼠标所在的行（处理多行文本）
    let targetLineRect = null;
    for (const rect of textNodeRects) {
      console.log('[WordExplosion] 检查行矩形:', { top: rect.top, bottom: rect.bottom, y });
      if (y >= rect.top && y <= rect.bottom) {
        targetLineRect = rect;
        break;
      }
    }

    if (!targetLineRect) {
      console.log('[WordExplosion] 未找到匹配的行矩形，返回null');
      return null;
    }

    console.log('[WordExplosion] 找到匹配的行矩形:', targetLineRect);

    // 在该行的单词中查找鼠标位置的单词
    let wordsChecked = 0;
    for (const rawRange of rawRanges) {
      wordsChecked++;
      
      // 跳过纯数字和标点符号（虽然它们不应该出现在rawRanges中，但双重保险）
      if (isNonLanguageSymbol(rawRange.word)) {
        console.log('[WordExplosion] 跳过非语言符号:', rawRange.word);
        continue;
      }

      // 创建单词的Range对象
      const wordRange = document.createRange();
      wordRange.setStart(textNode, rawRange.start);
      wordRange.setEnd(textNode, rawRange.end);

      // 获取单词的边界矩形
      const wordRects = wordRange.getClientRects();
      console.log('[WordExplosion] 单词:', rawRange.word, '矩形数量:', wordRects.length);

      for (const wordRect of wordRects) {
        // 检查鼠标是否在这个单词的矩形范围内
        const isInside = x >= wordRect.left && x <= wordRect.right &&
                       y >= wordRect.top && y <= wordRect.bottom;
        
        console.log('[WordExplosion] 检查单词矩形:', {
          word: rawRange.word,
          rect: { left: wordRect.left, right: wordRect.right, top: wordRect.top, bottom: wordRect.bottom },
          isInside: isInside,
          mouse: { x, y }
        });

        if (isInside) {
          console.log('[WordExplosion] 找到匹配的单词:', rawRange.word);
          return {
            word: rawRange.word,
            wordLower: rawRange.wordLower,
            range: wordRange,
            rect: wordRect,
            rawRange: rawRange
          };
        }
      }
    }

    console.log('[WordExplosion] 检查了', wordsChecked, '个单词，未找到匹配，返回null');
    return null;
  } catch (error) {
    console.error('[WordExplosion] 在文本节点中查找单词失败:', error);
    return null;
  }
}

// 获取句子的边界矩形（支持新系统和备用系统）
function getSentenceRect(sentence, foundInfo) {
  if (!sentence || !foundInfo) return null;

  try {
    // 处理备用系统的情况（只有range属性）
    if (foundInfo.range && !foundInfo.textNode) {
      return getSentenceRectFallback(sentence, foundInfo.range);
    }

    // 处理新系统的情况
    const { textNode, range } = foundInfo;

    // 使用 getSentenceForWord 获取句子范围
    const sentenceRange = document.createRange();

    // 规范化文本：将各种空格字符统一为普通空格
    // 注意：这里的规范化必须与content.js中的normalizeText函数保持一致
    const normalizeText = (text) => {
      if (!text) return "";
      let normalized = text.replace(/\u00AD/g, '');
      normalized = normalized.replace(/[\s\u00A0]+/g, ' ');
      return normalized;
    };

    // 获取完整的句子文本
    const fullText = textNode.textContent;
    const normalizedFullText = normalizeText(fullText);
    const normalizedSentence = normalizeText(sentence);

    // 在规范化后的文本中查找句子位置
    const sentenceStartInNormalized = normalizedFullText.indexOf(normalizedSentence);

    if (sentenceStartInNormalized === -1) {
      // 如果句子不在当前文本节点中，尝试使用原始范围
      console.warn('[WordExplosion] getSentenceRect - 在规范化文本中找不到句子，使用原始范围');
      sentenceRange.setStart(range.startContainer, range.startOffset);
      sentenceRange.setEnd(range.endContainer, range.endOffset);
    } else {
      // 找到了句子，需要将规范化后的位置映射回原始文本的位置
      const sentenceStart = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized);
      const sentenceEnd = mapNormalizedPositionToOriginal(fullText, sentenceStartInNormalized + normalizedSentence.length);

      sentenceRange.setStart(textNode, sentenceStart);
      sentenceRange.setEnd(textNode, sentenceEnd);
    }

    // 获取句子的边界矩形
    const rects = sentenceRange.getClientRects();
    if (rects.length === 0) return null;

    // console.log('[WordExplosion] getSentenceRect - 句子矩形数量:', rects.length);
    // for (let i = 0; i < rects.length; i++) {
    //   console.log(`[WordExplosion] getSentenceRect - 矩形${i}:`, {
    //     left: rects[i].left,
    //     top: rects[i].top,
    //     right: rects[i].right,
    //     bottom: rects[i].bottom,
    //     width: rects[i].width,
    //     height: rects[i].height
    //   });
    // }

    // 计算所有矩形的边界（句子可能跨多行）
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      minLeft = Math.min(minLeft, rect.left);
      minTop = Math.min(minTop, rect.top);
      maxRight = Math.max(maxRight, rect.right);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }

    // console.log('[WordExplosion] getSentenceRect - 最终边界:', {
    //   left: minLeft,
    //   top: minTop,
    //   right: maxRight,
    //   bottom: maxBottom,
    //   width: maxRight - minLeft,
    //   height: maxBottom - minTop
    // });

    return {
      left: minLeft,
      top: minTop,
      right: maxRight,
      bottom: maxBottom,
      width: maxRight - minLeft,
      height: maxBottom - minTop
    };
  } catch (error) {
    console.error('[WordExplosion] 获取句子位置失败:', error);
    return null;
  }
}

// 检查URL是否匹配黑名单模式（与高亮黑名单同步）
function isUrlInBlacklist(url, blacklistPatterns) {
  if (!blacklistPatterns) return false;

  const patterns = blacklistPatterns.split(';').filter(pattern => pattern.trim() !== '');

  for (const pattern of patterns) {
    const trimmedPattern = pattern.trim();
    if (trimmedPattern === '') continue;

    // 将通配符模式转换为正则表达式
    const regexPattern = trimmedPattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);

    if (regex.test(url)) {
      return true;
    }
  }

  return false;
}

// 立即执行黑名单检查（在脚本加载时）
(function() {
  chrome.storage.local.get(['pluginBlacklistWebsites'], function(result) {
    const currentUrl = window.location.href;
    const blacklistPatterns = result.pluginBlacklistWebsites || '*://music.youtube.com/*;*ohmygpt*';

    console.log('[WordExplosion] 黑名单检查 - blacklistPatterns:', blacklistPatterns);
    console.log('[WordExplosion] 黑名单检查 - currentUrl:', currentUrl);

    // 如果当前URL在黑名单中，则设置标志并不执行爆炸功能
    if (isUrlInBlacklist(currentUrl, blacklistPatterns)) {
      isInBlacklist = true;
      console.log('[WordExplosion] 当前网站在黑名单中，不启用爆炸功能');
      return;
    }

    // 不在黑名单中，设置标志
    isInBlacklist = false;
    console.log('[WordExplosion] 当前网站不在黑名单中，等待高亮系统调用初始化');
  });
})();

// 初始化前检查黑名单（与高亮黑名单同步）
function initWordExplosionWithBlacklistCheck() {
  // 黑名单检查已在脚本加载时完成，这里只需要检查标志
  if (isInBlacklist) {
    console.log('[WordExplosion] 当前网站在黑名单中，跳过初始化');
    return;
  }

  // 不在黑名单中，继续执行原有的初始化逻辑
  initWordExplosion();
  console.log('[WordExplosion] 单词爆炸功能已加载');
}

// 导出初始化函数供其他模块调用
window.initWordExplosionSystem = initWordExplosionWithBlacklistCheck;

// 注意：单词爆炸系统不再自动初始化
// 它将由正常单词高亮系统在完成初始化后、词组高亮之前主动调用

// =======================
// 句子解析按钮事件处理
// =======================

// 处理弹窗句子解析按钮点击
function handleExplosionAnalysisClick() {
  if (!currentExplosionSentence) {
    console.error('[WordExplosion] 没有当前句子');
    return;
  }

  try {
    // 获取爆炸窗口的位置信息，用于定位分析窗口
    if (wordExplosionEl) {
      const explosionRect = wordExplosionEl.getBoundingClientRect();
      const wordRect = {
        left: explosionRect.left,
        right: explosionRect.left + 100,
        top: explosionRect.top,
        bottom: explosionRect.top + 30,
        width: 100,
        height: 30
      };

      // 显示分析窗口
      if (typeof showAnalysisWindow === 'function') {
        showAnalysisWindow('', currentExplosionSentence, wordRect);
        console.log('[WordExplosion] 触发弹窗句子解析');
      } else {
        console.error('[WordExplosion] showAnalysisWindow function is not available');
      }
    }
  } catch (error) {
    console.error('[WordExplosion] 触发弹窗句子解析时发生错误:', error);
  }
}

// 处理侧栏句子解析按钮点击
function handleExplosionSidebarClick() {
  if (!currentExplosionSentence) {
    console.error('[WordExplosion] 没有当前句子');
    return;
  }

  try {
    // 打开侧边栏并发送数据
    if (typeof openSidebarWithAnalysis === 'function') {
      openSidebarWithAnalysis('', currentExplosionSentence);
      console.log('[WordExplosion] 触发侧栏句子解析');
    } else {
      console.error('[WordExplosion] openSidebarWithAnalysis function is not available');
    }
  } catch (error) {
    console.error('[WordExplosion] 触发侧栏句子解析时发生错误:', error);
  }
}

// =======================
// 暴露给a4使用的函数：检查爆炸弹窗状态
// =======================

/**
 * 检查爆炸弹窗是否正在显示
 * @returns {boolean} - 爆炸弹窗是否显示
 */
function isWordExplosionVisible() {
  return wordExplosionEl && wordExplosionEl.style.display !== 'none';
}

/**
 * 获取当前爆炸弹窗显示的句子
 * @returns {string|null} - 当前爆炸的句子，如果没有则返回null
 */
function getCurrentExplosionSentence() {
  return currentExplosionSentence;
}

/**
 * 检查给定的单词是否在当前爆炸的句子中
 * @param {string} word - 要检查的单词
 * @returns {boolean} - 单词是否在当前爆炸句子中
 */
function isWordInCurrentExplosionSentence(word) {
  if (!currentExplosionSentence || !word) {
    return false;
  }

  // 不区分大小写地检查单词是否在句子中
  const lowerWord = word.toLowerCase();
  const lowerSentence = currentExplosionSentence.toLowerCase();

  return lowerSentence.includes(lowerWord);
}

// =======================
// 逐词高亮功能
// =======================

/**
 * 触发爆炸窗口的逐词高亮
 * @param {Object} sentenceInfo 句子详细信息（包含textNode、range等）
 * @param {string} sentence 句子文本
 * @param {boolean} waitForTTS 是否等待TTS播放开始
 */
function triggerExplosionWordByWordHighlight(sentenceInfo, sentence, waitForTTS = true) {
  console.log('[WordExplosion] triggerExplosionWordByWordHighlight调用:', {
    hasSentenceInfo: !!sentenceInfo,
    sentence,
    waitForTTS,
    sentenceInfoKeys: sentenceInfo ? Object.keys(sentenceInfo) : []
  });

  if (!sentenceInfo || !sentence) {
    console.warn('[WordExplosion] 无法触发逐词高亮：缺少句子信息');
    return;
  }

  // 检查sentenseOoOo.js是否已加载
  if (typeof window.getSentenceWordDetails !== 'function' || typeof window.highlightSpecificWords !== 'function') {
    console.warn('[WordExplosion] sentenseOoOo.js未加载，无法触发逐词高亮');
    return;
  }

  try {
    // 构建detail对象（模拟a4_tooltip_new.js中的格式）
    const detail = {
      word: sentence.trim().split(/\s+/)[0] || '', // 使用句子的第一个单词
      range: sentenceInfo.range || null
    };

    console.log('[WordExplosion] 构建的detail对象:', {
      word: detail.word,
      hasRange: !!detail.range
    });

    // 获取句子中所有单词的详细信息
    const wordDetails = window.getSentenceWordDetails(detail);

    console.log('[WordExplosion] getSentenceWordDetails返回:', wordDetails);

    if (!wordDetails || wordDetails.length === 0) {
      console.warn('[WordExplosion] 无法获取句子单词详情');
      return;
    }

    console.log(`[WordExplosion] 开始逐词高亮，共${wordDetails.length}个单词，waitForTTS=${waitForTTS}`);

    // 获取高亮速度设置（优先使用爆炸窗口专用速度，否则使用通用速度）
    chrome.storage.local.get(['explosionHighlightSpeed', 'highlightSpeed'], function(result) {
      const msPerChar = result.explosionHighlightSpeed !== undefined ? result.explosionHighlightSpeed :
                        (result.highlightSpeed !== undefined ? result.highlightSpeed : 100);

      console.log('[WordExplosion] 使用高亮速度:', msPerChar, 'ms/字符');

      // 调用highlightSpecificWords函数，传入waitForTTS参数
      // highlightSpecificWords函数内部会管理isWordByWordHighlighting标志
      window.highlightSpecificWords(wordDetails, msPerChar, 200, 200, waitForTTS);
    });
  } catch (error) {
    console.error('[WordExplosion] 触发逐词高亮时发生错误:', error);
    window.isWordByWordHighlighting = false; // 出错时也要恢复
  }
}

// =======================
// Shadow DOM 初始化
// =======================

// 创建 Shadow DOM 容器 - 使用保护机制
function initExplosionShadowDOM() {
  // 创建自定义标签作为宿主元素
  explosionShadowHost = document.createElement('lingkuma-explosion-root');
  explosionShadowHost.id = 'lingkuma-explosion-host';

  // 设置宿主元素样式 - 完全透明,不影响页面布局,但允许内部元素自由扩展
  // 使用 position: absolute 使其跟随页面滚动，内部的 absolute 定位元素可以钉在网页中
  explosionShadowHost.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    min-height: 100vh;
    pointer-events: none;
    z-index: 2147483645;
    overflow: visible;
  `;

  // 重写remove方法,防止被网页脚本移除
  Object.defineProperty(explosionShadowHost, 'remove', {
    configurable: false,
    writable: false,
    value: () => {
      console.log('[WordExplosion] 阻止移除爆炸窗口Shadow DOM');
      return false;
    }
  });

  // 使用closed模式创建Shadow DOM,完全隔离网页CSS
  explosionShadowRoot = explosionShadowHost.attachShadow({ mode: 'closed' });

  // 挂载到documentElement
  document.documentElement.appendChild(explosionShadowHost);

  // 添加MutationObserver保护,防止被移除
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const removedNodes = Array.from(mutation.removedNodes);
        if (removedNodes.includes(explosionShadowHost)) {
          console.log('[WordExplosion] 检测到Shadow DOM被移除,正在恢复...');
          document.documentElement.appendChild(explosionShadowHost);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true
  });

  // 动态更新shadowHost的高度以覆盖整个页面内容
  function updateShadowHostHeight() {
    const pageHeight = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight
    );
    explosionShadowHost.style.height = pageHeight + 'px';
  }

  // 初始更新高度
  updateShadowHostHeight();

  // 监听页面高度变化 - 只监听 body，避免视口变化（如打开/关闭开发者工具）的影响
  const resizeObserver = new ResizeObserver(() => {
    updateShadowHostHeight();
  });
  resizeObserver.observe(document.body);

  // 注入CSS样式到Shadow DOM
  injectExplosionStyles();

  console.log('[WordExplosion] Shadow DOM 初始化完成');
}

// 注入爆炸窗口CSS样式到Shadow DOM
function injectExplosionStyles() {
  if (!explosionShadowRoot) return;

  const style = document.createElement('style');
  style.textContent = `
    /* Shadow DOM 宿主样式 */
    :host {
      pointer-events: none !important;
    }

    /* 爆炸窗口容器可交互 */
    .word-explosion-container,
    #word-explosion-left-buttons-wrapper,
    .word-explosion-left-buttons-bridge {
      pointer-events: auto !important;
    }

    /* =======================
       单词爆炸弹窗样式
       ======================= */
    .word-explosion-container {
      /* position由JS动态控制: 自动模式用absolute, 手动模式用fixed */
      background: #FBFAF5;
      border: 1px solid #ccc;
      border-radius: 16px;
      padding: 10px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2147483645; /* 比查词弹窗低一层 */
      max-width: min(${wordExplosionMaxWidth}px, 80vw);
      max-height: 600px;
      overflow: auto; /* 外层容器负责滚动 */
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: ${wordExplosionFontSize}px;
      line-height: 1.5;
      display: none;
      pointer-events: auto; /* 确保可以点击 */
    }

    .word-explosion-container:has(.word-explosion-empty) {
      background: rgba(251, 250, 245, 0);
      border-color: rgba(254, 254, 254, 0);
      box-shadow: none;
    }

    /* 左侧按钮容器（外挂在弹窗左侧） */
    .word-explosion-left-buttons {
      position: absolute;
      top: 24px;
      left: -28px; /* 定位在弹窗左侧外部，24px按钮+4px空隙 */
      display: flex;
      flex-direction: column;
      gap: 6px; /* 与右侧按钮保持一致 */
      z-index: 2147483647; /* 确保在最上层 */
      pointer-events: auto; /* 确保按钮可以点击 */
      visibility: visible; /* 强制可见 */
    }

    /* 透明连接层，填充按钮和弹窗之间的空隙 */
    .word-explosion-left-buttons-bridge {
      position: absolute;
      top: 8px;
      left: -4px; /* 从弹窗左边往外-4px */
      width: 4px; /* 填充空隙 */
      /* 高度由JS动态设置与弹窗一致 */
      background: transparent; /* 完全透明 */
      z-index: 2147483647; /* 与按钮同层 */
      pointer-events: auto; /* 阻止鼠标穿透 */
      display: none;
    }

    /* 右上角按钮容器 */
    .word-explosion-top-right-buttons {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-end;
      z-index: 100;
    }

    /* 关闭按钮 */
    .word-explosion-close-btn {
      position: relative;
      top: 0;
      right: 0;
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      color: #666;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 7px;
      transition: all 0.2s;
    }

    .word-explosion-close-btn:hover {
      background: #f0f0f0;
      color: #ff0000;
    }

    /* 左侧按钮样式（Ask和Sidebar） */
    .word-explosion-left-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: #f5f5f5;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.2s;
      padding: 2px;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .word-explosion-left-btn:hover {
      background: #e0e0e0;
      color: #333;
      transform: scale(1.05);
    }

    .word-explosion-left-btn:active {
      transform: scale(0.95);
    }

    .word-explosion-left-btn svg {
      width: 20px;
      height: 20px;
    }

    /* 右上角按钮样式 */
    .word-explosion-top-btn {
      position: relative;
      top: 0;
      right: 0;
      width: 24px;
      height: 24px;
      border: none;
      background: #f5f5f5;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.2s;
      padding: 2px;
      color: #666;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .word-explosion-top-btn:hover {
      background: #e0e0e0;
      color: #333;
      transform: scale(1.05);
    }

    .word-explosion-top-btn svg {
      width: 18px;
      height: 18px;
    }

    /* TTS按钮特殊样式（使用emoji） */
    .word-explosion-tts-btn {
      font-size: 14px;
      line-height: 1;
    }

    /* 一键已知按钮特殊样式 */
    .word-explosion-mark-all-known-btn {
      font-size: 16px;
      line-height: 1;
      font-weight: bold;
      color: #4CAF50;
    }

    .word-explosion-mark-all-known-btn:hover {
      background: #e8f5e9;
      color: #2E7D32;
    }

    /* 拖动手柄 */
    .word-explosion-drag-handle {
      position: absolute;
      top: 6px;
      left: 6px;
      width: 24px;
      height: 24px;
      cursor: move;
      color: #999;
      font-size: 16px;
      display: none; /* 默认隐藏，手动模式下显示 */
      align-items: center;
      justify-content: center;
      user-select: none;
    }

    .word-explosion-drag-handle:hover {
      color: #666;
    }

    /* 内容容器 */
    .word-explosion-content {
      margin-top: 4px;
      /* 移除max-height和overflow，让内容自然撑开，由外层容器负责滚动 */
    }

    /* 原句 */
    .word-explosion-sentence {
      position: relative;
      font-size: 12px;
      font-weight: 500;
      color: #333;
      margin-bottom: 2px;
      padding: 2px 4px;
      background: #f8f9fa;
      border-radius: 7px;
      border-left: 2px solid #4CAF50;
      display: block;
      word-wrap: break-word;
      word-break: break-word;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }

    /* 按钮容器 - 悬浮在喇叭下方 */
    .word-explosion-button-container {
      position: absolute;
      top: calc(100% + 4px);
      right: 4px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-end;
      opacity: 0.5;
      pointer-events: auto;
      z-index: 10;
    }

    /* 句子解析按钮样式 */
    .word-explosion-analysis-btn,
    .word-explosion-sidebar-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      background: #f5f5f5;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.2s;
      padding: 2px;
      color: #666;
    }

    .word-explosion-analysis-btn:hover,
    .word-explosion-sidebar-btn:hover {
      background: #e8e8e8;
      color: #333;
      transform: scale(1.05);
    }

    .word-explosion-analysis-btn:active,
    .word-explosion-sidebar-btn:active {
      transform: scale(0.95);
    }

    .word-explosion-analysis-btn svg,
    .word-explosion-sidebar-btn svg {
      width: 20px;
      height: 20px;
    }

    /* 句子翻译 */
    .word-explosion-sentence-translations {
      margin-bottom: 2px;
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }
    /* 句子翻译 font-size: 11px;*/
    .word-explosion-sentence-translation {
      
      color: #555;
      padding: 1px 4px;
      background: #fff3cd;
      border-radius: 7px;
      border: 1px solid #ffc107;
      flex: 0 1 auto;
    }

    /* 分隔线 */
    .word-explosion-separator {
      height: 1px;
      background: #e0e0e0;
      margin: 3px 0;
    }

    /* 单词列表容器 */
    .word-explosion-words {
      display: flex;
      gap: 3px;
    }

    /* 垂直布局 */
    .word-explosion-layout-vertical {
      flex-direction: column;
    }

    /* 水平布局 */
    .word-explosion-layout-horizontal {
       flex-direction: column;
    }

    /* 单词列表单列布局（默认） */
    .word-explosion-words-layout-single-column {
      display: flex;
      flex-direction: column;
    }

    /* 单词列表双列布局 - 蛇形排列，从上到下填满后流向下一列 */
    .word-explosion-words-layout-double-column {
      display: block !important;
      column-count: 2;
      column-gap: 12px;
    }

    /* 单词列表三列布局 - 蛇形排列 */
    .word-explosion-words-layout-triple-column {
      display: block !important;
      column-count: 3;
      column-gap: 12px;
    }

    /* 多列布局下的单词项 - 防止被分割 */
    .word-explosion-words-layout-double-column .word-explosion-word-item,
    .word-explosion-words-layout-triple-column .word-explosion-word-item {
      break-inside: avoid;
      page-break-inside: avoid;
      
      min-width: unset;
      flex: none;
      margin-bottom: 3px;
    }

    /* 单词项 padding: 2px 4px; */
    .word-explosion-word-item {
      padding: 0px 1px 3px 5px;
      background: #f5f5f5;
      border-radius: 7px;
      border: 1px solid #e0e0e0;
      transition: all 0.2s;
    }

    .word-explosion-word-item:hover {
      background: #ebebeb;
      border-color: #4CAF50;
    }

    /* 词组项特殊样式 */
    .word-explosion-phrase-item {
      background: #f0f8ff;
      border-color: #87ceeb;
    }

    .word-explosion-phrase-item:hover {
      background: #e6f3ff;
      border-color: #4682b4;
    }

    /* 水平布局下的单词项 */
    .word-explosion-layout-horizontal .word-explosion-word-item {
      flex: 0 0 calc(50% - 6px);
      min-width: 150px;
    }

    /* 单词标题font-size: 13px;  margin-bottom: 3px; */
    .word-explosion-word-title {
      
      font-weight: 600;
      color: #2c3e50;
      margin-top: -2px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* TTS喇叭按钮 */
    .word-explosion-tts-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
      border-radius: 7px;
      transition: all 0.2s;
      user-select: none;
    }

    .word-explosion-tts-button:hover {
      background: rgba(76, 175, 80, 0.1);
      transform: scale(1.1);
    }

    .word-explosion-tts-button:active {
      transform: scale(0.95);
    }

    /* 标记为已知按钮 */
    .word-explosion-mark-known-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
      border-radius: 7px;
      transition: all 0.2s;
      user-select: none;
      color: #4CAF50;
      font-weight: bold;
    }

    .word-explosion-mark-known-button:hover {
      background: rgba(76, 175, 80, 0.15);
      transform: scale(1.1);
    }

    .word-explosion-mark-known-button:active {
      transform: scale(0.95);
      background: rgba(76, 175, 80, 0.25);
    }

    /* 单词翻译列表 */
    .word-explosion-word-translations {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }

    /* 单词翻译项   font-size: 11px; */
    .word-explosion-word-translation {
   
      color: #555;
      padding: 1px 3px;
      background: #f0f0f0;
      border-radius: 7px;
      border: 1px solid #ddd;
      flex: 0 1 auto;
    }

    .word-explosion-word-translation .translation-number {
      color: #999;
      margin-right: 2px;
      font-weight: 500;
    }

    /* 水平布局下的翻译列表 - 翻译元素水平排列，自动换行，宽度自适应 */
    .word-explosion-layout-horizontal .word-explosion-word-translations {
      flex-direction: row;
      flex-wrap: wrap;
    }

    /* 垂直布局下的翻译列表 - 每个翻译独占一行，宽度自适应 */
    .word-explosion-layout-vertical .word-explosion-word-translations {
      flex-direction: column;
      flex-wrap: nowrap;
    }

    /* 垂直布局下的翻译项 - 宽度自适应 */
    .word-explosion-layout-vertical .word-explosion-word-translation {
      width: fit-content;
    }

    /* 加载中 */
    .word-explosion-word-loading {
      font-size: 13px;
      color: #999;
      font-style: italic;
    }

    /* 空状态 */
    .word-explosion-empty {
      text-align: center;
      padding: 0px;
      color: #999;
      font-size: 14px;
    }

    /* 滚动条样式 */
    .word-explosion-container::-webkit-scrollbar {
      width: 8px;
    }

    .word-explosion-container::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }

    .word-explosion-container::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }

    .word-explosion-container::-webkit-scrollbar-thumb:hover {
      background: #555;
    }

    /* =======================
       单词爆炸弹窗 - 暗色主题
       ======================= */
    .word-explosion-container.dark-mode {
      background: #1e1e1e;
      border-color: #444;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .word-explosion-container.dark-mode:has(.word-explosion-empty) {
      background: rgba(30, 30, 30, 0);
      border-color: rgba(68, 68, 68, 0);
      box-shadow: none;
    }

    /* 暗色主题 - 关闭按钮 */
    .word-explosion-container.dark-mode .word-explosion-close-btn {
      color: #aaa;
      background-color: #ffffff00;
    }

    .word-explosion-container.dark-mode .word-explosion-close-btn:hover {
      background: #33333300;
      color: #ff6666;
    }

    /* 暗色主题 - 左侧按钮（弹窗内） */
    .word-explosion-container.dark-mode .word-explosion-left-btn {
      background: #2a2a2a;
      color: #aaa;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    .word-explosion-container.dark-mode .word-explosion-left-btn:hover {
      background: #3a3a3a;
      color: #ddd;
      box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4);
    }

    /* 暗色主题 - 左侧悬挂按钮容器（独立于弹窗外部） */
    #word-explosion-left-buttons-wrapper.dark-mode .word-explosion-left-btn {
      background: #2a2a2a;
      color: #aaa;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }

    #word-explosion-left-buttons-wrapper.dark-mode .word-explosion-left-btn:hover {
      background: #3a3a3a;
      color: #ddd;
      box-shadow: 0 3px 6px rgba(0, 0, 0, 0.4);
    }

    /* 暗色主题 - 右上角按钮 */
    .word-explosion-container.dark-mode .word-explosion-top-btn {
      background: #2a2a2a;
      color: #aaa;
    }

    .word-explosion-container.dark-mode .word-explosion-top-btn:hover {
      background: #3a3a3a;
      color: #ddd;
    }

    /* 暗色主题 - 一键已知按钮 */
    .word-explosion-container.dark-mode .word-explosion-mark-all-known-btn {
      color: #66BB6A;
    }

    .word-explosion-container.dark-mode .word-explosion-mark-all-known-btn:hover {
      background: #1b5e20;
      color: #81C784;
    }

    /* 暗色主题 - 拖动手柄 */
    .word-explosion-container.dark-mode .word-explosion-drag-handle {
      color: #4FC3F7;
    }

    .word-explosion-container.dark-mode .word-explosion-drag-handle:hover {
      color: #4FC3F7;
    }

    /* 暗色主题 - 原句 */
    .word-explosion-container.dark-mode .word-explosion-sentence {
      color: #e0e0e0;
      background: #2a2a2a;
      border-left-color: #66bb6a;
    }

    /* 暗色主题 - 句子解析按钮 */
    .word-explosion-container.dark-mode .word-explosion-analysis-btn,
    .word-explosion-container.dark-mode .word-explosion-sidebar-btn {
      background: #2a2a2a;
      color: #aaa;
    }

    .word-explosion-container.dark-mode .word-explosion-analysis-btn:hover,
    .word-explosion-container.dark-mode .word-explosion-sidebar-btn:hover {
      background: #333;
      color: #e0e0e0;
    }

    /* 暗色主题 - 句子翻译 */
    .word-explosion-container.dark-mode .word-explosion-sentence-translation {
      color: #e0e0e0;
      background: #3a3a1a;
      border-color: #d4a017;
    }

    /* 暗色主题 - 分隔线 */
    .word-explosion-container.dark-mode .word-explosion-separator {
      background: #444;
    }

    /* 暗色主题 - 单词项 */
    .word-explosion-container.dark-mode .word-explosion-word-item {
      background: #2a2a2a;
      border-color: #444;
    }

    .word-explosion-container.dark-mode .word-explosion-word-item:hover {
      background: #333;
      border-color: #6b5e80;
    }

    /* 暗色主题 - 词组项 */
    .word-explosion-container.dark-mode .word-explosion-phrase-item {
      background: #1a2a3a;
      border-color: #4682b4;
    }

    .word-explosion-container.dark-mode .word-explosion-phrase-item:hover {
      background: #243444;
      border-color: #5a9fd4;
    }

    /* 暗色主题 - 单词标题 */
    .word-explosion-container.dark-mode .word-explosion-word-title {
      color: #e0e0e0;
    }

    /* 暗色主题 - TTS喇叭按钮 */
    .word-explosion-container.dark-mode .word-explosion-tts-button:hover {
      background: rgba(102, 187, 106, 0.2);
    }

    /* 暗色主题 - 单词翻译项 */
    .word-explosion-container.dark-mode .word-explosion-word-translation {
      color: #ccc;
      background: #2a2a2a;
      border-color: #555;
    }

    .word-explosion-container.dark-mode .word-explosion-word-translation .translation-number {
      color: #888;
    }

    /* 暗色主题 - 加载中 */
    .word-explosion-container.dark-mode .word-explosion-word-loading {
      color: #888;
    }

    /* 暗色主题 - 空状态 */
    .word-explosion-container.dark-mode .word-explosion-empty {
      color: #888;
    }

    /* 暗色主题 - 滚动条 */
    .word-explosion-container.dark-mode::-webkit-scrollbar-track {
      background: #2a2a2a;
    }

    .word-explosion-container.dark-mode::-webkit-scrollbar-thumb {
      background: #555;
    }

    .word-explosion-container.dark-mode::-webkit-scrollbar-thumb:hover {
      background: #777;
    }
  `;

  explosionShadowRoot.appendChild(style);
}

console.log('[WordExplosion] 单词爆炸系统已加载，等待配置加载和Shadow DOM初始化...');
