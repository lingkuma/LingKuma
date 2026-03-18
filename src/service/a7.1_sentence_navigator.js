// =======================
// 句子导航模块 - Sentence Navigator
// 用于在页面句子之间快速导航，支持方向键切换和智能滚动
// =======================

// 全局变量
let sentenceNavigatorEnabled = true; // 功能开关
let sentenceList = []; // 句子列表，按DOM顺序排序
let currentSentenceIndex = -1; // 当前选中的句子索引
let isNavigatorActive = false; // 导航器是否激活（用户点击句子后激活）
let sentenceNavigatorUpdateTimer = null; // 句子列表更新定时器
let lastSentenceListUpdateTime = 0; // 上次更新句子列表的时间
let sentenceListNeedsUpdate = false; // 句子列表是否需要更新 

// 配置项
let sentenceNavigatorConfig = {
  scrollThreshold: 0.7, // 滚动阈值：70%位置
  scrollBehavior: 'smooth', // 滚动行为：smooth 或 instant
  autoUpdateInterval: 2000, // 自动更新句子列表的间隔（毫秒）
  minSentenceLength: 5, // 最小句子长度
};

// 初始化句子导航器
function initSentenceNavigator() {
  console.log('[SentenceNavigator] 初始化句子导航器');
  
  // 从storage加载配置
  chrome.storage.local.get(['sentenceNavigatorEnabled'], (result) => {
    sentenceNavigatorEnabled = result.sentenceNavigatorEnabled !== undefined ? result.sentenceNavigatorEnabled : true;
    console.log('[SentenceNavigator] 功能开关:', sentenceNavigatorEnabled);
  });

  // 监听配置变化
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.sentenceNavigatorEnabled) {
      sentenceNavigatorEnabled = changes.sentenceNavigatorEnabled.newValue;
      console.log('[SentenceNavigator] 功能开关已更新:', sentenceNavigatorEnabled);
      
      if (!sentenceNavigatorEnabled) {
        deactivateNavigator();
      }
    }
  });

  // 监听键盘事件
  document.addEventListener('keydown', handleNavigatorKeyDown, true);
  
  console.log('[SentenceNavigator] 初始化完成');
}

// 处理键盘事件
function handleNavigatorKeyDown(e) {
  // 如果功能未启用，直接返回
  if (!sentenceNavigatorEnabled) {
    return;
  }

  // 如果导航器未激活，不处理方向键
  if (!isNavigatorActive) {
    return;
  }

  // 检查是否在输入框中，如果是则不处理
  if (isInputFocused()) {
    return;
  }

  // 左右方向键处理
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    e.stopPropagation();
    navigateToNextSentence();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    e.stopPropagation();
    navigateToPreviousSentence();
  }
}

// 检查是否在输入框中
function isInputFocused() {
  const activeElement = document.activeElement;
  if (!activeElement) return false;
  
  const tagName = activeElement.tagName.toLowerCase();
  const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  const isEditable = activeElement.isContentEditable;
  
  return isInput || isEditable;
}

// 激活导航器（当用户点击句子时调用）
function activateNavigator(sentenceInfo) {
  if (!sentenceNavigatorEnabled) {
    return;
  }

  console.log('[SentenceNavigator] 激活导航器');
  
  // 标记列表需要更新，但不立即更新（避免阻塞UI）
  sentenceListNeedsUpdate = true;
  
  // 找到当前句子在列表中的索引（如果列表已存在）
  if (sentenceInfo && sentenceInfo.sentence && sentenceList.length > 0) {
    currentSentenceIndex = findSentenceIndex(sentenceInfo.sentence, sentenceInfo);
    console.log('[SentenceNavigator] 当前句子索引:', currentSentenceIndex);
  } else {
    currentSentenceIndex = -1;
  }
  
  isNavigatorActive = true;
  
  // 在浏览器空闲时更新句子列表（不阻塞UI）
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      if (sentenceListNeedsUpdate) {
        updateSentenceList();
        sentenceListNeedsUpdate = false;
      }
    }, { timeout: 2000 });
  } else {
    // 降级方案：延迟执行
    setTimeout(() => {
      if (sentenceListNeedsUpdate) {
        updateSentenceList();
        sentenceListNeedsUpdate = false;
      }
    }, 100);
  }
}

// 停用导航器
function deactivateNavigator() {
  console.log('[SentenceNavigator] 停用导航器');
  isNavigatorActive = false;
  currentSentenceIndex = -1;
}

// 更新句子列表
function updateSentenceList() {
  const now = Date.now();
  
  // 如果距离上次更新不到1秒，跳过
  if (now - lastSentenceListUpdateTime < 1000) {
    return;
  }
  
  lastSentenceListUpdateTime = now;
  
  console.log('[SentenceNavigator] 更新句子列表');
  
  // 检查highlightManager是否可用
  if (!highlightManager || !highlightManager.parent2Text2RawsAllUnknow) {
    console.log('[SentenceNavigator] highlightManager不可用，无法获取句子列表');
    return;
  }

  const newSentenceList = [];
  const sentenceSet = new Set(); // 用于去重

  try {
    // 获取所有存储的父元素和文本节点数据
    const allParents = Array.from(highlightManager.parent2Text2RawsAllUnknow.entries());
    console.log('[SentenceNavigator] 找到父元素数量:', allParents.length);

    for (const [parent, textMap] of allParents) {
      // 确保父元素仍在文档中
      if (!document.contains(parent)) {
        continue;
      }

      // 遍历该父元素下的所有文本节点
      for (const [textNode, rawRanges] of textMap.entries()) {
        // 确保文本节点仍在文档中
        if (!document.contains(textNode)) {
          continue;
        }

        // 遍历该文本节点中的所有单词位置
        // rawRanges 结构: [{wordLower, start, end}, ...] 
        if (rawRanges && rawRanges.length > 0) {
          for (const rawRange of rawRanges) {
            if (rawRange && rawRange.start !== undefined && rawRange.end !== undefined) {
              try {
                // 创建Range对象
                const wordRange = document.createRange();
                wordRange.setStart(textNode, rawRange.start);
                wordRange.setEnd(textNode, rawRange.end);
                
                // 创建detail对象用于getSentenceForWord
                const detail = {
                  range: wordRange,
                  word: rawRange.wordLower || ''
                };

                // 获取句子
                const { sentence, range: sentenceRange } = getSentenceForWord(detail);
                
                if (sentence && sentence.trim().length >= sentenceNavigatorConfig.minSentenceLength) {
                  // 去重检查
                  const normalizedSentence = sentence.trim().toLowerCase();
                  if (!sentenceSet.has(normalizedSentence)) {
                    sentenceSet.add(normalizedSentence);
                    
                    newSentenceList.push({
                      sentence: sentence,
                      textNode: textNode,
                      parent: parent,
                      range: wordRange,
                      sentenceRange: sentenceRange,
                      rect: null, // 延迟计算，不在收集时计算
                      wordStart: rawRange.start
                    });
                  }
                }
              } catch (rangeError) {
                // 创建Range失败，跳过这个单词
              }
            }
          }
        }
      }
    }

    // 使用 Range.compareBoundaryPoints 进行排序（更高效）
    newSentenceList.sort((a, b) => {
      // 如果是同一个文本节点，按文本中的位置排序
      if (a.textNode === b.textNode) {
        return a.wordStart - b.wordStart;
      }
      // 不同文本节点，使用 Range 比较位置
      try {
        return a.range.compareBoundaryPoints(Range.START_TO_START, b.range);
      } catch (e) {
        return 0;
      }
    });

    sentenceList = newSentenceList;
    console.log('[SentenceNavigator] 句子列表已更新，共', sentenceList.length, '个句子');
    
  } catch (error) {
    console.error('[SentenceNavigator] 更新句子列表失败:', error);
  }
}

// 查找句子在列表中的索引
function findSentenceIndex(sentence, sentenceInfo) {
  if (!sentence || sentenceList.length === 0) {
    return -1;
  }

  const normalizedSentence = sentence.trim().toLowerCase();
  
  // 首先尝试精确匹配
  for (let i = 0; i < sentenceList.length; i++) {
    if (sentenceList[i].sentence.trim().toLowerCase() === normalizedSentence) {
      return i;
    }
  }
  
  // 如果有sentenceInfo，尝试通过位置匹配
  if (sentenceInfo && sentenceInfo.textNode) {
    for (let i = 0; i < sentenceList.length; i++) {
      if (sentenceList[i].textNode === sentenceInfo.textNode) {
        return i;
      }
    }
  }
  
  // 尝试部分匹配
  for (let i = 0; i < sentenceList.length; i++) {
    if (sentenceList[i].sentence.includes(sentence) || sentence.includes(sentenceList[i].sentence)) {
      return i;
    }
  }
  
  return -1;
}

// 导航到下一个句子（右键）
function navigateToNextSentence() {
  console.log('[SentenceNavigator] 导航到下一个句子');
  
  // 如果列表为空或需要更新，先同步更新
  if (sentenceList.length === 0 || sentenceListNeedsUpdate) {
    updateSentenceList();
    sentenceListNeedsUpdate = false;
  }
  
  if (sentenceList.length === 0) {
    console.log('[SentenceNavigator] 句子列表为空');
    return;
  }

  // 计算下一个索引
  const nextIndex = currentSentenceIndex + 1;
  
  // 检查是否超出范围
  if (nextIndex >= sentenceList.length) {
    console.log('[SentenceNavigator] 已到达最后一个句子');
    return;
  }

  // 导航到下一个句子
  navigateToSentence(nextIndex, 'next');
}

// 导航到上一个句子（左键）
function navigateToPreviousSentence() {
  console.log('[SentenceNavigator] 导航到上一个句子');
  
  // 如果列表为空或需要更新，先同步更新
  if (sentenceList.length === 0 || sentenceListNeedsUpdate) {
    updateSentenceList();
    sentenceListNeedsUpdate = false;
  }
  
  if (sentenceList.length === 0) {
    console.log('[SentenceNavigator] 句子列表为空');
    return;
  }

  // 计算上一个索引
  const prevIndex = currentSentenceIndex - 1;
  
  // 检查是否超出范围
  if (prevIndex < 0) {
    console.log('[SentenceNavigator] 已到达第一个句子');
    return;
  }

  // 导航到上一个句子
  navigateToSentence(prevIndex, 'prev');
}

// 导航到指定句子
function navigateToSentence(index, direction) {
  const sentenceInfo = sentenceList[index];
  if (!sentenceInfo) {
    console.error('[SentenceNavigator] 无法找到句子信息，索引:', index);
    return;
  }

  console.log('[SentenceNavigator] 导航到句子:', index, sentenceInfo.sentence.substring(0, 50) + '...');

  // 更新当前索引
  currentSentenceIndex = index;

  // 获取句子的最新位置（因为页面可能已滚动）
  // 使用A7的getSentenceRect函数
  if (typeof getSentenceRect === 'function' && sentenceInfo.textNode && sentenceInfo.range) {
    try {
      sentenceInfo.rect = getSentenceRect(sentenceInfo.sentence, { textNode: sentenceInfo.textNode, range: sentenceInfo.range });
    } catch (e) {
      console.warn('[SentenceNavigator] 获取句子位置失败:', e);
    }
  }

  // 检查是否需要滚动
  checkAndScroll(sentenceInfo, direction);

  // 触发句子爆炸
  triggerSentenceExplosion(sentenceInfo);
}

// 检查并执行滚动
function checkAndScroll(sentenceInfo, direction) {
  if (!sentenceInfo.rect) {
    return;
  }

  const viewportHeight = window.innerHeight;
  const sentenceTop = sentenceInfo.rect.top;

  console.log('[SentenceNavigator] 滚动检查 - 方向:', direction, 
    '句子顶部:', sentenceTop, '视口高度:', viewportHeight);

  if (direction === 'next') {
    // 向右导航（下一句）：判断句子是否在底部70%区域
    // 底部70%区域 = 从视口30%到底部
    const bottomThreshold = viewportHeight * 0.3; // 视口30%位置
    
    if (sentenceTop > bottomThreshold) {
      // 句子在底部70%区域，需要向上滚动页面（显示下面的内容）
      // 将句子滚动到距离顶部30%的位置
      const targetPosition = viewportHeight * 0.3;
      const scrollTarget = sentenceTop + window.scrollY - targetPosition;
      console.log('[SentenceNavigator] 右键翻页 - 向上滚动到:', scrollTarget);
      
      window.scrollTo({
        top: scrollTarget,
        behavior: sentenceNavigatorConfig.scrollBehavior
      });
    }
  } else if (direction === 'prev') {
    // 向左导航（上一句）：判断句子是否在底部70%区域
    // 底部70%区域 = 从视口30%到底部
    const bottomThreshold = viewportHeight * 0.3; // 视口30%位置
    
    if (sentenceTop > bottomThreshold) {
      // 句子在底部70%区域，需要向下滚动页面（显示上面的内容）
      // 将句子滚动到距离顶部70%的位置
      const targetPosition = viewportHeight * 0.7;
      const scrollTarget = sentenceTop + window.scrollY - targetPosition;
      console.log('[SentenceNavigator] 左键翻页 - 向下滚动到:', scrollTarget);
      
      window.scrollTo({
        top: scrollTarget,
        behavior: sentenceNavigatorConfig.scrollBehavior
      });
    }
  }
}

// 触发句子爆炸
function triggerSentenceExplosion(sentenceInfo) {
  console.log('[SentenceNavigator] 触发句子爆炸:', sentenceInfo.sentence?.substring(0, 50) + '...');

  // 检查必要的数据
  if (!sentenceInfo || !sentenceInfo.sentence) {
    console.error('[SentenceNavigator] sentenceInfo 或 sentence 为空');
    return;
  }

  // 构建sentenceInfo对象，供showWordExplosion使用
  const explosionSentenceInfo = {
    sentence: sentenceInfo.sentence,
    textNode: sentenceInfo.textNode || null,
    range: sentenceInfo.range || null,
    sentenceRange: sentenceInfo.sentenceRange || null
  };

  // 使用已经计算好的rect，避免重复计算
  let rect = sentenceInfo.rect;
  
  // 如果rect还没计算，才计算
  if (!rect && typeof getSentenceRect === 'function' && sentenceInfo.textNode && sentenceInfo.range) {
    try {
      rect = getSentenceRect(sentenceInfo.sentence, { textNode: sentenceInfo.textNode, range: sentenceInfo.range });
      sentenceInfo.rect = rect; // 缓存结果
    } catch (e) {
      console.warn('[SentenceNavigator] getSentenceRect 调用失败:', e);
    }
  }

  // 调用A7的showWordExplosion函数
  if (typeof showWordExplosion === 'function') {
    showWordExplosion(sentenceInfo.sentence, rect, explosionSentenceInfo);
  } else {
    console.error('[SentenceNavigator] showWordExplosion函数不可用');
  }
}

// 导出函数供外部调用
window.sentenceNavigator = {
  init: initSentenceNavigator,
  activate: activateNavigator,
  deactivate: deactivateNavigator,
  updateList: updateSentenceList,
  navigateNext: navigateToNextSentence,
  navigatePrev: navigateToPreviousSentence,
  isEnabled: () => sentenceNavigatorEnabled,
  isActive: () => isNavigatorActive,
  getSentenceList: () => sentenceList,
  getCurrentIndex: () => currentSentenceIndex
};

// 自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSentenceNavigator);
} else {
  // 延迟初始化，确保highlightManager已准备好
  setTimeout(initSentenceNavigator, 1000);
}

console.log('[SentenceNavigator] 模块已加载');
