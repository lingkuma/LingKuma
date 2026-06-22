// 检测是否在iframe中运行
// const isInIframe = window !== window.top;
// // const isIframe =  (window.self !== window.top);
// // 如果在iframe中运行，记录到控制台
// if (isInIframe) {
//   console.log("content.js 在iframe中加载");
// }
 
//数据示例：
// 0
// : 
// "epub-rs"
        // value
        // : 
        // "epub-rs"
// 1
// : 
// "bible"
        // value
        // : 
        // "bible"
// 2
// : 
// "britain"
        // value
        // : 
        // "britain"
let knownWords = new Set();

let wordDetails = [];
let wordRangesMap = new Map(); 
let tooltipEl = null;
// 新增全局变量，用于存储当前选中的单词
let currentTooltipWord = null;
let globalDarkMode = false;

// 新增全局变量，用于控制自动展开及保存最新鼠标事件



let lastMouseEvent = null;
// 添加全局变量
let analysisWindow = null;
let currentHighlight = null;
// 新增高亮管理器相关变量
let highlightManager = null;


let highlightChineseEnabled = true;
let highlightJapaneseEnabled = true;
let highlightKoreanEnabled = true;
let highlightAlphabeticEnabled = true;

// 优化：合并所有storage读取为一次调用
chrome.storage.local.get([
  'highlightChineseEnabled',
  'highlightJapaneseEnabled',
  'highlightKoreanEnabled',
  'highlightAlphabeticEnabled',
  'enablePlugin',
  'pluginBlacklistWebsites'
], function(result) {
  // 设置高亮语言开关
  highlightChineseEnabled = result.highlightChineseEnabled || true;
  highlightJapaneseEnabled = result.highlightJapaneseEnabled || true;
  highlightKoreanEnabled = result.highlightKoreanEnabled || true;
  highlightAlphabeticEnabled = result.highlightAlphabeticEnabled || true;

  // 检查插件是否启用
  if (result.enablePlugin === false) {
    console.log("插件已被禁用，清理资源");
    if (highlightManager) {
      highlightManager.highlightEnabled = false;
      highlightManager.removeAllHighlights();
    }
    return;
  }

  // 检查黑名单
  const currentUrl = window.location.href;
  const blacklistPatterns = result.pluginBlacklistWebsites || '*://music.youtube.com/*;*ohmygpt*';

  console.log("blacklistPatterns:  ", blacklistPatterns);
  console.log("currentUrl:  ", currentUrl);

  // 如果当前URL在黑名单中，则不执行高亮
  if (isUrlInBlacklist(currentUrl, blacklistPatterns)) {
    console.log("当前网站在单词高亮黑名单中，不执行高亮功能");
    return;
  }

  // 继续执行原有的高亮初始化逻辑
  highlightAllWords();
});





// console.log("content.js 已加载");

//监听插件开关状态变化
initPlugin();

function initPlugin() {
  console.log("插件功能初始化中...");
  
  // 添加消息监听器，处理插件开关状态变化
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggleHighlight") {
      console.log('Highlight toggle message:', message.enabled);
      if (message.enabled) {
        console.log('Highlight toggle message:', message.enabled);
        // Reapply highlight
        highlightAllWords();
      } else if (highlightManager) {
        highlightManager.highlightEnabled = false;
        if (typeof highlightManager.removeAllHighlights === 'function') {
          highlightManager.removeAllHighlights();
        }
        console.log('Highlight runtime paused');
      }
    } else if (message.action === "teardownHighlightRuntime" && highlightManager) {
      if (typeof highlightManager.destroy === 'function') {
        highlightManager.destroy();
      } else {
        highlightManager.highlightEnabled = false;
        highlightManager.removeAllHighlights();
      }
      highlightManager = null;
    }
  });
}

// 辅助函数：转义正则中需要的特殊字符
function escapeRegExp(str) {
  return str.replace(/[\\^$.+?()[\]{}|]/g, '\\$&');
}

// 将带有 * 通配符的模式转换为正则表达式
function wildcardToRegExp(pattern) {
  return new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$', 'i');
}

// 判断 URL 是否匹配某个单一模式
function isUrlMatch(url, pattern) {
  if (!pattern) return false;
  let regex = wildcardToRegExp(pattern);
  return regex.test(url);
}

// 判断 URL 是否匹配由分号分隔的多个模式中的任意一个
function patternListMatch(url, patternList) {
  if (!patternList) return false;
  const patterns = patternList.split(';').map(s => s.trim()).filter(Boolean);
  for (let pat of patterns) {
    if (isUrlMatch(url, pat)) return true;
  }
  return false;
}

// 检查当前URL是否匹配黑名单模式
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


