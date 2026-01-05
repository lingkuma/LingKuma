// 自定义查词功能 - 文本选择和弹窗处理
// 全局变量


let customWordSelectionPopup = null;
let isCustomWordSelectionEnabled = true;
let lastSelectedText = '';
let lastSelectionRect = null;
let isInCustomWordBlacklist = false; // 当前网站是否在黑名单中（与高亮黑名单同步）
let selectionChangeTimer = null; // 用于 selectionchange 事件的防抖计时器
let isCreatingPopup = false; // 防止同时创建多个弹窗的标志

// 跟踪鼠标/触控位置，用于词组创建时的弹窗定位
window.lastMouseX = 0;
window.lastMouseY = 0;

// 添加全局鼠标位置跟踪
document.addEventListener('mousemove', (e) => {
  window.lastMouseX = e.clientX;
  window.lastMouseY = e.clientY;
}, { passive: true });

// 添加全局触控位置跟踪（移动设备支持）
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 0) {
    window.lastMouseX = e.touches[0].clientX;
    window.lastMouseY = e.touches[0].clientY;
  }
}, { passive: true });

// 触控结束时也记录位置
document.addEventListener('touchend', (e) => {
  if (e.changedTouches && e.changedTouches.length > 0) {
    window.lastMouseX = e.changedTouches[0].clientX;
    window.lastMouseY = e.changedTouches[0].clientY;
  }
}, { passive: true });

// 初始化自定义查词功能
function initCustomWordSelection() {
  console.log('初始化自定义查词功能');

  // 监听鼠标抬起事件，检测文本选择
  document.addEventListener('mouseup', handleTextSelection, true);

  // 监听触控抬起事件，检测文本选择（移动设备支持）
  document.addEventListener('touchend', handleTextSelection, true);

  // 监听文本选择变化事件（支持拖动选择手柄的场景）
  // 这对触控设备特别重要，因为拖动手柄不会触发 touchend
  document.addEventListener('selectionchange', handleSelectionChange, true);

  // 监听点击事件，关闭弹窗
  document.addEventListener('click', handleDocumentClick, true);

  // 监听触控事件，关闭弹窗（移动设备支持）
  document.addEventListener('touchstart', handleDocumentClick, true);

  // 监听键盘事件，ESC关闭弹窗
  document.addEventListener('keydown', handleKeyDown, true);
}

// 处理文本选择
async function handleTextSelection(e) {
  // 检查是否在黑名单中（与高亮黑名单同步）
  if (isInCustomWordBlacklist) return;

  // 如果功能被禁用，直接返回
  if (!isCustomWordSelectionEnabled) return;

  // 如果正在进行逐词高亮，不触发划词弹窗
  if (window.isWordByWordHighlighting) return;

  // 触控设备需要更长的延迟，因为原生选择菜单会先出现
  // 检测是否是触控事件
  const isTouchEvent = e.type === 'touchend';
  const delay = isTouchEvent ? 200 : 50; // 触控设备使用200ms延迟

  console.log(`文本选择事件类型: ${e.type}, 延迟: ${delay}ms`);

  // 延迟处理，确保选择完成
  setTimeout(async () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    console.log(`选中的文本: "${selectedText}", 长度: ${selectedText.length}`);

    // 如果没有选择文本或文本太短，隐藏弹窗
    if (!selectedText || selectedText.length < 2) {
      hideCustomWordSelectionPopup();
      return;
    }

    // 如果选择的文本与上次相同，不重复处理
    if (selectedText === lastSelectedText) {
      console.log('文本与上次相同，跳过处理');
      return;
    }

    lastSelectedText = selectedText;

    // 获取选择区域的位置信息
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      lastSelectionRect = rect;

      console.log('检测到文本选择:', selectedText, '位置:', rect);

      // 显示自定义查词弹窗
      await showCustomWordSelectionPopup(selectedText, rect);
    } catch (error) {
      console.error('获取选择范围失败:', error);
      // 即使获取位置失败，也尝试使用鼠标/触控位置显示弹窗
      const fallbackRect = {
        left: window.lastMouseX,
        right: window.lastMouseX,
        top: window.lastMouseY - 20,
        bottom: window.lastMouseY + 20,
        width: 0,
        height: 40
      };
      await showCustomWordSelectionPopup(selectedText, fallbackRect);
    }
  }, delay);
}

// 处理文本选择变化（用于拖动选择手柄的场景）
async function handleSelectionChange() {
  // 清除之前的定时器
  if (selectionChangeTimer) {
    clearTimeout(selectionChangeTimer);
  }

  // 使用防抖，避免频繁触发
  // 触控设备拖动手柄时会持续触发 selectionchange
  selectionChangeTimer = setTimeout(async () => {
    // 检查是否在黑名单中
    if (isInCustomWordBlacklist) return;

    // 如果功能被禁用，直接返回
    if (!isCustomWordSelectionEnabled) return;

    // 如果正在进行逐词高亮，不触发划词弹窗
    if (window.isWordByWordHighlighting) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    console.log(`[selectionchange] 检测到选择变化: "${selectedText}", 长度: ${selectedText.length}`);

    // 如果没有选择文本或文本太短，隐藏弹窗
    if (!selectedText || selectedText.length < 2) {
      // 只有当之前有弹窗时才隐藏，避免不必要的操作
      if (customWordSelectionPopup) {
        hideCustomWordSelectionPopup();
      }
      return;
    }

    // 如果选择的文本与上次相同，且弹窗已经显示，不重复处理
    if (selectedText === lastSelectedText && customWordSelectionPopup) {
      console.log('[selectionchange] 文本与上次相同且弹窗已显示，跳过处理');
      return;
    }

    lastSelectedText = selectedText;

    // 获取选择区域的位置信息
    try {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      lastSelectionRect = rect;

      console.log('[selectionchange] 显示弹窗:', selectedText);

      // 显示自定义查词弹窗
      await showCustomWordSelectionPopup(selectedText, rect);
    } catch (error) {
      console.error('[selectionchange] 获取选择范围失败:', error);
      // 即使获取位置失败，也尝试使用鼠标/触控位置显示弹窗
      const fallbackRect = {
        left: window.lastMouseX,
        right: window.lastMouseX,
        top: window.lastMouseY - 20,
        bottom: window.lastMouseY + 20,
        width: 0,
        height: 40
      };
      await showCustomWordSelectionPopup(selectedText, fallbackRect);
    }
  }, 300); // 300ms 防抖延迟，适合拖动手柄的场景
}

// 显示自定义查词弹窗
async function showCustomWordSelectionPopup(selectedText, rect) {
  // 如果正在创建弹窗，直接返回，防止重复创建
  if (isCreatingPopup) {
    console.log('弹窗正在创建中，跳过重复请求');
    return;
  }
  
  // 设置创建标志
  isCreatingPopup = true;
  
  // 先隐藏现有弹窗
  hideCustomWordSelectionPopup();
  
  // 获取划词弹窗间隙设置
  let gap = 0; // 默认值
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get('selectionPopupGap', resolve);
    });
    gap = result.selectionPopupGap !== undefined ? result.selectionPopupGap : 10;
  } catch (error) {
    console.error('获取划词弹窗间隙设置失败:', error);
  }
  
  // 获取划词弹窗优先向下弹出设置
  let preferDown = false; // 默认值
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get('selectionPopupPreferDown', resolve);
    });
    preferDown = result.selectionPopupPreferDown || false;
  } catch (error) {
    console.error('获取划词弹窗优先向下弹出设置失败:', error);
  }
  
  // 创建弹窗元素
  customWordSelectionPopup = document.createElement('div');
  customWordSelectionPopup.className = 'custom-word-selection-popup';
  customWordSelectionPopup.setAttribute('data-extension-element', 'true');
  
  // 设置弹窗样式
  let popupStyles = `
    position: absolute;
    background: rgba(31, 31, 31, 0.85);
    color: #f0f0f0;
    border: 1px solid #555;
    border-radius: 10px;
    padding: 2px 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 2147483647;
    font-size: 12px;
    line-height: 1;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(10px);
    user-select: none;
    height: 28px;
    display: flex;
    align-items: center;
    box-sizing: border-box;
  `;

  // 检测竖排文本模式，如果是则添加保护样式
  if (detectVerticalWritingMode()) {
    popupStyles += `
      writing-mode: horizontal-tb !important;
      -webkit-writing-mode: horizontal-tb !important;
      -moz-writing-mode: horizontal-tb !important;
      -ms-writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      -webkit-text-orientation: mixed !important;
      direction: ltr !important;
      unicode-bidi: normal !important;
    `;
    console.log("检测到竖排文本页面，已为自定义词组选择弹窗添加横向保护样式");
  }

  customWordSelectionPopup.style.cssText = popupStyles;

  
  // 创建按钮内容 - 包含Create按钮和句子解析按钮 <span>Create</span>
  customWordSelectionPopup.innerHTML = ` 
    <div style="display: flex; align-items: center; gap: 0px;">
      <div class="create-word-btn" style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: background 0.2s;">
        <span style="font-size: 14px;">🌟</span>
        
      </div>
      <div class="analyze-sentence-btn" style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: background 0.2s;" title="Analyze Sentence">
        <span style="font-size: 14px;">🤔</span>
      </div>
    </div>
  `;
  
  // 计算弹窗位置
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popupWidth = 120; // 估算弹窗宽度 - 增加以容纳两个按钮
  const popupHeight = 26; // 估算弹窗高度
  
  // 获取滚动偏移量
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  // 对于 position: absolute 的元素，需要加上滚动偏移
  let left = rect.left + scrollX + (rect.width / 2) - (popupWidth / 2);
  let top;

  // 根据设置决定默认弹出方向
  if (preferDown) {
    // 优先向下弹出
    top = rect.bottom + scrollY + gap;
    // 如果下方空间不够，显示在上方
    if (top + popupHeight > scrollY + viewportHeight - gap) {
      top = rect.top + scrollY - popupHeight - gap;
    }
  } else {
    // 默认向上弹出
    top = rect.top + scrollY - popupHeight - gap;
    // 如果上方空间不够，显示在下方
    if (top < scrollY + gap) {
      top = rect.bottom + scrollY + gap;
    }
  }

  // 边界检查（相对于页面）
  if (left < scrollX + gap) {
    left = scrollX + gap;
  } else if (left + popupWidth > scrollX + viewportWidth - gap) {
    left = scrollX + viewportWidth - popupWidth - gap;
  }
  
  customWordSelectionPopup.style.left = left + 'px';
  customWordSelectionPopup.style.top = top + 'px';

  // 添加到页面
  document.body.appendChild(customWordSelectionPopup);

  // 重置创建标志
  isCreatingPopup = false;

  // 获取按钮元素
  const createBtn = customWordSelectionPopup.querySelector('.create-word-btn');
  const analyzeBtn = customWordSelectionPopup.querySelector('.analyze-sentence-btn');

  // Create按钮点击事件
  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleCustomWordLookup(selectedText);
    });

    // Create按钮悬浮效果
    createBtn.addEventListener('mouseenter', () => {
      createBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });

    createBtn.addEventListener('mouseleave', () => {
      createBtn.style.background = 'transparent';
    });
  }

  // 句子解析按钮点击事件
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleSentenceAnalysis(selectedText);
    });

    // 句子解析按钮悬浮效果
    analyzeBtn.addEventListener('mouseenter', () => {
      analyzeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });

    analyzeBtn.addEventListener('mouseleave', () => {
      analyzeBtn.style.background = 'transparent';
    });
  }

  // 整个弹窗的悬浮效果
  customWordSelectionPopup.addEventListener('mouseenter', () => {
    customWordSelectionPopup.style.transform = 'scale(1.05)';
    customWordSelectionPopup.style.background = 'rgba(45, 45, 45, 0.9)';
    customWordSelectionPopup.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
  });

  customWordSelectionPopup.addEventListener('mouseleave', () => {
    customWordSelectionPopup.style.transform = 'scale(1)';
    customWordSelectionPopup.style.background = 'rgba(31, 31, 31, 0.85)';
    customWordSelectionPopup.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  });

  console.log('自定义查词弹窗已显示');
}

// 隐藏自定义查词弹窗
function hideCustomWordSelectionPopup() {
  if (customWordSelectionPopup) {
    customWordSelectionPopup.remove();
    customWordSelectionPopup = null;
    lastSelectedText = '';
    lastSelectionRect = null;
    isCreatingPopup = false; // 重置创建标志
    console.log('自定义查词弹窗已隐藏');
  }
}

// 处理自定义查词
function handleCustomWordLookup(selectedText) {
  console.log('处理自定义查词:', selectedText);

  // 在清除选择之前先获取句子，确保能获取到完整的上下文
  const sentence = getContextSentence(selectedText);
  console.log('初始创建词组时获取的句子:', sentence);

  // 隐藏弹窗
  hideCustomWordSelectionPopup();

  // 清除文本选择
  window.getSelection().removeAllRanges();

  // 创建一个模拟的 wordRect 用于显示 tooltip
  // 优先使用 lastSelectionRect，如果没有则使用当前鼠标位置
  let wordRect;
  if (lastSelectionRect) {
    wordRect = lastSelectionRect;
  } else {
    // 如果没有选择区域信息，尝试使用当前鼠标位置
    // 获取当前鼠标位置（如果有的话）
    const mouseX = window.lastMouseX || window.innerWidth / 2;
    const mouseY = window.lastMouseY || window.innerHeight / 2;

    wordRect = {
      left: mouseX - 50,
      right: mouseX + 50,
      top: mouseY - 15,
      bottom: mouseY + 15,
      width: 100,
      height: 30
    };
  }

  // 播放词组 TTS
  try {
    if (typeof playText === 'function') {
      playText({
        sentence: sentence,
        text: selectedText,
        count: 1
      });
    }
  } catch (error) {
    console.error('播放词组 TTS 时发生错误:', error);
  }

  // 调用现有的查词功能，但标记为自定义词组
  showEnhancedTooltipForCustomWord(selectedText, sentence, wordRect);

  // 通知自定义高亮系统有新词组添加（使用增量更新）
  if (typeof addSingleCustomWord === 'function') {
    setTimeout(() => {
      console.log('新自定义词组添加，使用增量更新');
      addSingleCustomWord(selectedText, '1', true);
    }, 500); // 延迟确保数据库操作完成
  } else if (typeof loadCustomWords === 'function') {
    // 回退方案
    setTimeout(() => {
      console.log('新自定义词组添加，回退到重新加载高亮');
      loadCustomWords();
    }, 500);
  }
}

// 处理句子解析
function handleSentenceAnalysis(selectedText) {
  console.log('处理句子解析:', selectedText);

  // 直接使用用户选中的文本作为句子，不自动获取上下文
  const sentence = selectedText;
  console.log('句子解析使用的句子(用户选中的文本):', sentence);

  // 隐藏弹窗
  hideCustomWordSelectionPopup();

  // 清除文本选择
  window.getSelection().removeAllRanges();

  // 创建一个模拟的 wordRect 用于定位分析窗口
  // 优先使用 lastSelectionRect，如果没有则使用当前鼠标位置
  let wordRect;
  if (lastSelectionRect) {
    wordRect = lastSelectionRect;
  } else {
    // 如果没有选择区域信息，尝试使用当前鼠标位置
    const mouseX = window.lastMouseX || window.innerWidth / 2;
    const mouseY = window.lastMouseY || window.innerHeight / 2;

    wordRect = {
      left: mouseX - 50,
      right: mouseX + 50,
      top: mouseY - 15,
      bottom: mouseY + 15,
      width: 100,
      height: 30
    };
  }

  // 播放句子 TTS
  try {
    if (typeof playText === 'function') {
      playText({ text: sentence });
    }
  } catch (error) {
    console.error('播放句子 TTS 时发生错误:', error);
  }

  // 显示分析窗口
  try {
    if (typeof showAnalysisWindow === 'function') {
      console.log('显示分析窗口，使用用户选中的文本作为句子');
      // 使用选中的文本作为单词和句子
      showAnalysisWindow(selectedText, sentence, wordRect);
    } else {
      console.error('showAnalysisWindow 函数不存在');
    }
  } catch (error) {
    console.error('显示分析窗口时发生错误:', error);
  }
}

// 获取上下文句子
function getContextSentence(selectedText) {
  try {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      console.log('没有选择范围，返回选择文本本身:', selectedText);
      return selectedText;
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // 获取包含选择文本的父元素
    let parentElement = container.nodeType === Node.TEXT_NODE ?
                       container.parentElement : container;

    console.log('开始查找包含词组的完整句子，选择文本:', selectedText);

    // 向上查找，直到找到包含完整句子的元素
    let attempts = 0;
    const maxAttempts = 10; // 防止无限循环

    while (parentElement && parentElement !== document.body && attempts < maxAttempts) {
      const text = parentElement.textContent || '';
      console.log(`尝试第${attempts + 1}次，父元素文本长度:`, text.length, '选择文本长度:', selectedText.length);

      if (text.length > selectedText.length * 2) { // 降低阈值，确保能找到合适的句子
        console.log('找到合适长度的父元素，开始提取句子');

        // 使用更全面的句子分割符
        const sentenceDelimiters = /[.!?。！？；;]\s*|[\n\r]+/g;
        const sentences = text.split(sentenceDelimiters);

        console.log('分割后的句子数量:', sentences.length);

        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i].trim();
          if (sentence.includes(selectedText) && sentence.length > selectedText.length) {
            console.log('找到包含词组的句子:', sentence);
            return sentence;
          }
        }

        // 如果没有找到合适的句子，但文本包含选择文本，返回整个文本的合理部分
        if (text.includes(selectedText)) {
          const maxSentenceLength = 300; // 限制句子最大长度
          if (text.length <= maxSentenceLength) {
            console.log('返回整个父元素文本作为句子');
            return text.trim();
          } else {
            // 尝试找到包含选择文本的合理片段
            const selectedIndex = text.indexOf(selectedText);
            const start = Math.max(0, selectedIndex - 100);
            const end = Math.min(text.length, selectedIndex + selectedText.length + 100);
            const fragment = text.substring(start, end).trim();
            console.log('返回包含词组的文本片段:', fragment);
            return fragment;
          }
        }
      }

      parentElement = parentElement.parentElement;
      attempts++;
    }

    console.log('未找到合适的句子，返回选择文本本身');
    return selectedText;
  } catch (error) {
    console.error('获取上下文句子失败:', error);
    return selectedText;
  }
}

// 处理文档点击事件
function handleDocumentClick(e) {
  // 如果点击的是弹窗本身，不关闭
  if (customWordSelectionPopup && customWordSelectionPopup.contains(e.target)) {
    return;
  }
  
  // 如果点击的是其他扩展元素，不关闭
  if (e.target.closest('[data-extension-element]')) {
    return;
  }
  
  // 关闭弹窗
  hideCustomWordSelectionPopup();
}

// 处理键盘事件
function handleKeyDown(e) {
  if (e.key === 'Escape' && customWordSelectionPopup) {
    hideCustomWordSelectionPopup();
  }
}

// 显示自定义词组的 tooltip
async function showEnhancedTooltipForCustomWord(customWord, sentence, wordRect) {
  console.log('显示自定义词组 tooltip:', customWord);
  
  // 调用现有的 tooltip 显示函数，但传入特殊参数表示这是自定义词组
  if (typeof showEnhancedTooltipForWord === 'function') {
    // 创建一个模拟的 parent 元素
    const mockParent = document.body;
    
    // 调用现有函数，传入 isCustom 标记
    await showEnhancedTooltipForWord(customWord, sentence, wordRect, mockParent, customWord, true);
  } else {
    console.error('showEnhancedTooltipForWord 函数不存在');
  }
}

// 启用/禁用自定义查词功能
function toggleCustomWordSelection(enabled) {
  isCustomWordSelectionEnabled = enabled;
  if (!enabled) {
    hideCustomWordSelectionPopup();
  }
  console.log('自定义查词功能', enabled ? '已启用' : '已禁用');
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

// 初始化前检查黑名单（与高亮黑名单同步）
function initCustomWordSelectionWithBlacklistCheck() {
  chrome.storage.local.get(['pluginBlacklistWebsites'], function(result) {
    const currentUrl = window.location.href;
    const blacklistPatterns = result.pluginBlacklistWebsites || '*://music.youtube.com/*;*ohmygpt*';

    console.log('[CustomWordSelection] 黑名单检查 - blacklistPatterns:', blacklistPatterns);
    console.log('[CustomWordSelection] 黑名单检查 - currentUrl:', currentUrl);

    // 如果当前URL在黑名单中，则设置标志并不执行词组功能
    if (isUrlInBlacklist(currentUrl, blacklistPatterns)) {
      isInCustomWordBlacklist = true;
      console.log('[CustomWordSelection] 当前网站在黑名单中，不启用词组功能');
      return;
    }

    // 不在黑名单中，继续执行原有的初始化逻辑
    isInCustomWordBlacklist = false;
    initCustomWordSelection();
    console.log('[CustomWordSelection] 词组功能已加载');
  });
}

// 导出函数供其他模块使用
window.initCustomWordSelection = initCustomWordSelection;
window.toggleCustomWordSelection = toggleCustomWordSelection;
window.hideCustomWordSelectionPopup = hideCustomWordSelectionPopup;

// 自动初始化（使用黑名单检查）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomWordSelectionWithBlacklistCheck);
} else {
  initCustomWordSelectionWithBlacklistCheck();
}
