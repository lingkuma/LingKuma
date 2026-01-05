// 自定义词组高亮系统
// 使用 Aho-Corasick 算法进行高效多模式匹配

// =======================
// 带重试机制的 sendMessage 包装函数
// =======================
/**
 * 带重试机制的 chrome.runtime.sendMessage
 * @param {Object} message - 要发送的消息
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数，默认3次
 * @param {number} options.timeout - 单次请求超时时间(ms)，默认5000ms
 * @param {Array<number>} options.retryDelays - 重试延迟数组(ms)，默认[100, 300, 500]
 * @returns {Promise} - 返回响应的Promise
 */
function sendMessageWithRetry(message, options = {}) {
  const {
    maxRetries = 3,
    timeout = 5000,
    retryDelays = [100, 300, 500]
  } = options;

  return new Promise((resolve, reject) => {
    let attemptCount = 0;

    function attemptSend() {
      attemptCount++;

      // 创建超时Promise
      const timeoutPromise = new Promise((_, timeoutReject) => {
        setTimeout(() => {
          timeoutReject(new Error(`Request timeout after ${timeout}ms (attempt ${attemptCount}/${maxRetries})`));
        }, timeout);
      });

      // 创建sendMessage Promise
      const sendPromise = new Promise((sendResolve, sendReject) => {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            // 检查runtime错误
            if (chrome.runtime.lastError) {
              sendReject(new Error(chrome.runtime.lastError.message));
              return;
            }

            // 检查响应是否为undefined (background可能未响应)
            if (response === undefined) {
              sendReject(new Error('Background script did not respond (response is undefined)'));
              return;
            }

            sendResolve(response);
          });
        } catch (error) {
          sendReject(error);
        }
      });

      // 竞速：哪个先完成就用哪个
      Promise.race([sendPromise, timeoutPromise])
        .then(response => {
          // 成功获取响应
          if (attemptCount > 1) {
            console.log(`[Retry Success] Message sent successfully on attempt ${attemptCount}:`, message.action);
          }
          resolve(response);
        })
        .catch(error => {
          console.warn(`[Retry ${attemptCount}/${maxRetries}] Failed:`, message.action, error.message);

          // 判断是否需要重试
          if (attemptCount < maxRetries) {
            const delay = retryDelays[attemptCount - 1] || retryDelays[retryDelays.length - 1];
            console.log(`[Retry] Retrying in ${delay}ms...`);
            setTimeout(attemptSend, delay);
          } else {
            // 所有重试都失败
            console.error(`[Retry Failed] All ${maxRetries} attempts failed for:`, message.action);
            reject(new Error(`Failed after ${maxRetries} attempts: ${error.message}`));
          }
        });
    }

    // 开始第一次尝试
    attemptSend();
  });
}

// 全局变量
let customWordTrie = null;
let customWordRangesMap = new Map();
let customHighlightEnabled = true;
let customWordDetails = new Map(); // 存储自定义词组的详细信息

// 增量更新缓存相关变量
let customWordCache = new Map(); // 本地词组缓存，避免重复数据库查询
let lastSyncTimestamp = 0; // 上次同步时间戳
let pendingHighlightUpdates = new Set(); // 待处理的高亮更新队列
let customHighlightInitialized = false; // 初始化状态标志，防止重复初始化

// Aho-Corasick 算法实现
class AhoCorasick {
  constructor() {
    this.root = { children: {}, isEnd: false, word: null, fail: null };
    this.patterns = [];
  }

  // 添加模式串
  addPattern(pattern) {
    if (!pattern || pattern.length === 0) return;
    
    this.patterns.push(pattern);
    let node = this.root;
    
    for (let char of pattern.toLowerCase()) {
      if (!node.children[char]) {
        node.children[char] = { children: {}, isEnd: false, word: null, fail: null };
      }
      node = node.children[char];
    }
    
    node.isEnd = true;
    node.word = pattern;
  }

  // 构建失败函数
  buildFailureFunction() {
    const queue = [];
    
    // 初始化第一层节点的失败函数
    for (let char in this.root.children) {
      const child = this.root.children[char];
      child.fail = this.root;
      queue.push(child);
    }
    
    // BFS 构建失败函数
    while (queue.length > 0) {
      const current = queue.shift();
      
      for (let char in current.children) {
        const child = current.children[char];
        queue.push(child);
        
        let fail = current.fail;
        while (fail && !fail.children[char]) {
          fail = fail.fail;
        }
        
        child.fail = fail ? fail.children[char] : this.root;
        
        // 如果失败节点是结束节点，当前节点也应该标记为结束
        if (child.fail.isEnd && !child.isEnd) {
          child.isEnd = true;
          child.word = child.fail.word;
        }
      }
    }
  }

  // 搜索所有匹配
  search(text) {
    if (!text) return [];
    
    const matches = [];
    let node = this.root;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i].toLowerCase();
      
      // 根据失败函数跳转
      while (node && !node.children[char]) {
        node = node.fail;
      }
      
      if (!node) {
        node = this.root;
        continue;
      }
      
      node = node.children[char];
      
      // 检查当前节点及其失败链上的所有匹配
      let temp = node;
      while (temp) {
        if (temp.isEnd) {
          const start = i - temp.word.length + 1;
          const end = i + 1;
          matches.push({
            word: temp.word,
            start: start,
            end: end,
            match: text.substring(start, end)
          });
        }
        temp = temp.fail;
      }
    }
    
    return matches;
  }
}

// 初始化自定义词组高亮系统
function initCustomHighlight() {
  if (customHighlightInitialized) {
    console.log('自定义词组高亮系统已初始化，跳过重复初始化');
    return;
  }

  customHighlightInitialized = true;
  console.log('初始化自定义词组高亮系统');

  // 添加自定义高亮样式
  addCustomHighlightStyles();

  // 创建 Aho-Corasick 实例
  customWordTrie = new AhoCorasick();

  // 加载自定义词组
  loadCustomWords();

  // 添加鼠标事件监听
  addMouseEventListeners();

  // 添加DOM变化监听
  addDOMObserver();

  // 监听数据库变化和主题切换
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'customWordUpdated') {
      console.log('检测到自定义词组更新，使用增量更新', message);
      console.log('消息详情 - word:', message.word, 'updateType:', message.updateType, 'status:', message.status);

      // 使用增量更新处理词组变化
      handleCustomWordUpdate(message);
    }
    // 监听明暗模式切换消息
    else if (message.action === 'updateHighlightTheme') {
      console.log('检测到明暗模式切换，重新应用自定义词组高亮');
      // 重新应用自定义词组高亮
      if (customHighlightEnabled && customWordTrie) {
        highlightCustomWordsInPage();
      }
    }
  });
}

// 增量更新处理函数
function handleCustomWordUpdate(message) {
  console.log('handleCustomWordUpdate 被调用，消息:', message);

  if (message.word && message.status !== undefined) {
    const wordKey = message.word.toLowerCase();
    console.log('处理词组:', message.word, '类型:', message.updateType);

    // 根据更新类型处理
    if (message.updateType === 'newWord') {
      // 新词组：增量添加
      console.log('检测到新自定义词组，增量添加:', message.word);
      addSingleCustomWord(message.word, message.status, message.isCustom, message.language);
    } else if (message.updateType === 'statusChange') {
      // 状态更新：直接更新本地缓存
      const wordData = customWordDetails.get(wordKey);

      if (wordData) {
        wordData.status = message.status;
        if (message.language !== undefined) {
          wordData.language = message.language;
        }
        customWordDetails.set(wordKey, wordData);
        customWordCache.set(wordKey, wordData);
        console.log('增量更新词组状态:', message.word, message.status);

        // 只更新这个特定单词的高亮，而不是全局重新高亮
        if (customHighlightEnabled) {
          updateSingleWordHighlight(message.word, message.status);
        }
      } else {
        // 如果本地没有这个词组，当作新词组处理
        console.log('本地未找到词组，当作新词组处理:', message.word);
        addSingleCustomWord(message.word, message.status, message.isCustom, message.language);
      }
    } else if (message.updateType === 'wordDeleted') {
      // 词组删除：移除高亮和缓存
      console.log('检测到词组删除，移除高亮:', message.word);
      removeSingleWordHighlight(message.word);

      // 从缓存中移除
      customWordDetails.delete(wordKey);
      customWordCache.delete(wordKey);
      customWordRangesMap.delete(wordKey);

      // 重建 Trie 以移除已删除的词组
      console.log('重建 Trie 以移除已删除的词组:', message.word);
      rebuildTrieAfterDeletion();
    } else {
      // 未指定更新类型，智能判断
      const wordData = customWordDetails.get(wordKey);
      if (wordData) {
        // 存在则更新状态
        wordData.status = message.status;
        customWordDetails.set(wordKey, wordData);
        customWordCache.set(wordKey, wordData);
        console.log('智能判断：更新词组状态:', message.word, message.status);

        if (customHighlightEnabled) {
          updateSingleWordHighlight(message.word, message.status);
        }
      } else {
        // 不存在则新增
        console.log('智能判断：新增词组:', message.word);
        addSingleCustomWord(message.word, message.status, message.isCustom);
      }
    }
  } else {
    // 其他情况：回退到完全重新加载
    console.log('消息格式不正确，回退到完全重新加载');
    loadCustomWords();
  }
}

// 增量添加单个自定义词组
function addSingleCustomWord(word, status, isCustom, language) {
  if (!word) return;

  console.log('增量添加自定义词组:', word);
  const wordKey = word.toLowerCase();
  const wordData = {
    word: word,
    status: status || '1',
    isCustom: isCustom || true,
    language: language || '' // 添加language字段支持
  };

  // 更新本地缓存
  customWordDetails.set(wordKey, wordData);
  customWordCache.set(wordKey, wordData);

  // 增量添加到 Trie（避免重建整个 Trie）
  if (customWordTrie) {
    customWordTrie.addPattern(word);
    // 重新构建失败函数（这是必需的，但比重建整个 Trie 快）
    customWordTrie.buildFailureFunction();
  } else {
    // 如果 Trie 不存在，创建新的
    customWordTrie = new AhoCorasick();
    customWordTrie.addPattern(word);
    customWordTrie.buildFailureFunction();
  }

  console.log('增量添加完成，当前模式数量:', customWordTrie.patterns.length);

  // 只高亮新添加的词组，而不是全局重新高亮
  if (customHighlightEnabled) {
    highlightSingleNewWord(word, status);
  }
}

// 异步高亮调度器（优化版本 - 让正常单词高亮优先）
function scheduleAsyncHighlight() {
  // 防抖：避免频繁触发高亮
  if (window.customHighlightTimeout) {
    clearTimeout(window.customHighlightTimeout);
  }

  // 增加延迟时间，确保正常单词高亮系统有足够时间先执行
  window.customHighlightTimeout = setTimeout(() => {
    if (customHighlightEnabled && customWordTrie) {
      console.log('执行异步高亮更新（延迟执行，避免与正常单词高亮冲突）');

      // 使用 requestIdleCallback 进一步确保在空闲时执行
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          highlightCustomWordsInPageAsync();
        }, { timeout: 2000 });
      } else {
        // 回退到 setTimeout，但仍然保持异步
        setTimeout(() => {
          highlightCustomWordsInPageAsync();
        }, 100);
      }
    }
  }, 500); // 增加到500ms防抖延迟，给正常单词高亮更多时间
}

// 从数据库加载自定义词组（完全异步版本）
function loadCustomWords() {
  console.log('开始异步加载自定义词组...');

  // 使用异步方式执行，避免阻塞主线程
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => {
      performLoadCustomWords();
    }, { timeout: 1000 });
  } else {
    setTimeout(() => {
      performLoadCustomWords();
    }, 50);
  }
}

// 执行实际的词组加载逻辑
async function performLoadCustomWords() {
  // 检查缓存是否有效
  if (customWordCache.size > 0 && Date.now() - lastSyncTimestamp < 30000) {
    console.log('使用本地缓存，跳过数据库查询');
    rebuildTrieFromCache();
    return;
  }

  const loadStartTime = performance.now();

  try {
    const response = await sendMessageWithRetry({
      action: "getCustomWords"
    }, {
      maxRetries: 3,
      timeout: 5000,
      retryDelays: [100, 300, 500]
    });

    const loadDuration = (performance.now() - loadStartTime).toFixed(2);
    console.log(`[性能] 自定义词组数据获取耗时: ${loadDuration}ms`);
    console.log('收到自定义词组响应:', response);

    if (response && response.words) {
      console.log('加载自定义词组:', response.words.length, '个');

      // 更新缓存和时间戳
      customWordCache.clear();
      customWordDetails.clear();
      lastSyncTimestamp = Date.now();

      // 重建 Trie
      customWordTrie = new AhoCorasick();

      // 添加所有自定义词组到 Trie 和缓存
      response.words.forEach(wordData => {
        if (wordData.word && wordData.isCustom) {
          const wordKey = wordData.word.toLowerCase();
          customWordTrie.addPattern(wordData.word);
          customWordDetails.set(wordKey, wordData);
          customWordCache.set(wordKey, wordData);
        }
      });

      // 构建失败函数
      customWordTrie.buildFailureFunction();
      console.log('Trie 构建完成，模式数量:', customWordTrie.patterns.length);

      // 异步高亮页面
      if (customHighlightEnabled) {
        console.log('开始异步高亮页面...');
        scheduleAsyncHighlight();
      }
    } else {
      console.log('没有收到自定义词组数据');
      initializeEmptyTrie();
    }
  } catch (error) {
    console.error('获取自定义词组失败:', error);
    const loadDuration = (performance.now() - loadStartTime).toFixed(2);
    console.log(`[性能] 自定义词组数据获取失败，耗时: ${loadDuration}ms`);
    // 失败时初始化空Trie
    initializeEmptyTrie();
  }
}

// 从缓存重建 Trie
function rebuildTrieFromCache() {
  console.log('从缓存重建 Trie');
  customWordTrie = new AhoCorasick();
  customWordDetails.clear();

  for (const [wordKey, wordData] of customWordCache) {
    if (wordData.word && wordData.isCustom) {
      customWordTrie.addPattern(wordData.word);
      customWordDetails.set(wordKey, wordData);
    }
  }

  customWordTrie.buildFailureFunction();
  console.log('从缓存重建 Trie 完成，模式数量:', customWordTrie.patterns.length);

  if (customHighlightEnabled) {
    scheduleAsyncHighlight();
  }
}

// 删除词组后重建 Trie（不触发全局重新高亮）
function removeWordFromTrie(word) {
  console.log('从 Trie 中移除词组:', word);

  // 重建 Trie，但不包含已删除的词组
  customWordTrie = new AhoCorasick();

  // 从当前的 customWordDetails 重建 Trie（已经移除了删除的词组）
  for (const [, wordData] of customWordDetails) {
    if (wordData.word && wordData.isCustom) {
      customWordTrie.addPattern(wordData.word);
    }
  }

  customWordTrie.buildFailureFunction();
  console.log('Trie 重建完成，模式数量:', customWordTrie.patterns.length);

  // 注意：不触发全局重新高亮，只移除了特定词组的高亮
}

// 删除词组后重建 Trie（保留原函数以兼容其他地方的调用）
function rebuildTrieAfterDeletion() {
  console.log('删除词组后重建 Trie');
  customWordTrie = new AhoCorasick();

  // 从当前的 customWordDetails 重建 Trie（已经移除了删除的词组）
  for (const [, wordData] of customWordDetails) {
    if (wordData.word && wordData.isCustom) {
      customWordTrie.addPattern(wordData.word);
    }
  }

  customWordTrie.buildFailureFunction();
  console.log('删除后重建 Trie 完成，模式数量:', customWordTrie.patterns.length);

  // 重新高亮页面以应用更改
  if (customHighlightEnabled) {
    console.log('重新高亮页面以移除已删除词组的高亮');
    scheduleAsyncHighlight();
  }
}

// 初始化空 Trie
function initializeEmptyTrie() {
  customWordTrie = new AhoCorasick();
  customWordDetails.clear();
  customWordCache.clear();
  console.log('初始化空 Trie 完成');
}



// 在页面中高亮自定义词组（同步版本）
function highlightCustomWordsInPage() {
  if (!customWordTrie || !customHighlightEnabled) return;

  console.log('开始同步高亮自定义词组');
  performHighlighting();
}

// 异步高亮自定义词组
function highlightCustomWordsInPageAsync() {
  if (!customWordTrie || !customHighlightEnabled) return;

  console.log('开始异步高亮自定义词组');

  // 使用 requestIdleCallback 进行异步处理
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => {
      performHighlighting();
    }, { timeout: 1000 });
  } else {
    // 回退到 setTimeout
    setTimeout(() => {
      performHighlighting();
    }, 0);
  }
}

// 执行高亮的核心逻辑（优化异步版本）
function performHighlighting() {
  if (!customWordTrie || !customHighlightEnabled) return;

  console.log('开始执行异步高亮，词组数量:', customWordTrie.patterns.length);

  // 清除现有的自定义高亮
  clearCustomHighlights();

  // 使用异步方式获取文本节点，避免阻塞
  if (window.requestIdleCallback) {
    window.requestIdleCallback(() => {
      performAsyncHighlighting();
    }, { timeout: 500 });
  } else {
    setTimeout(() => {
      performAsyncHighlighting();
    }, 10);
  }
}

// 异步执行高亮处理
function performAsyncHighlighting() {
  // 获取所有文本节点（优化：使用更高效的方法）
  const textNodes = getTextNodesOptimized(document.body);

  if (textNodes.length === 0) {
    console.log('没有找到文本节点，跳过高亮');
    return;
  }

  // 为每个状态创建高亮组
  const customHighlightGroups = {
    'custom-state0': new Set(),
    'custom-state1': new Set(),
    'custom-state2': new Set(),
    'custom-state3': new Set(),
    'custom-state4': new Set(),
    'custom-state5': new Set()
  };

  // 分批处理文本节点，避免阻塞主线程
  const batchSize = 30; // 减小批次大小，更频繁地让出控制权
  let currentIndex = 0;

  function processBatch() {
    const startTime = performance.now();
    const endIndex = Math.min(currentIndex + batchSize, textNodes.length);

    for (let i = currentIndex; i < endIndex; i++) {
      // 检查是否需要让出控制权（避免长时间阻塞）
      if (performance.now() - startTime > 8) {
        // 如果处理时间超过8ms，立即让出控制权
        break;
      }
      highlightCustomWordsInNode(textNodes[i], customHighlightGroups);
    }

    currentIndex = endIndex;

    if (currentIndex < textNodes.length) {
      // 继续处理下一批，使用更短的超时时间
      if (window.requestIdleCallback) {
        window.requestIdleCallback(processBatch, { timeout: 50 });
      } else {
        setTimeout(processBatch, 1);
      }
    } else {
      // 所有节点处理完成，异步应用高亮
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          applyHighlightGroups(customHighlightGroups);
        }, { timeout: 100 });
      } else {
        setTimeout(() => {
          applyHighlightGroups(customHighlightGroups);
        }, 5);
      }
    }
  }

  // 开始处理第一批
  processBatch();
}

// 应用高亮组
function applyHighlightGroups(customHighlightGroups) {
  Object.keys(customHighlightGroups).forEach(groupName => {
    if (customHighlightGroups[groupName].size > 0) {
      CSS.highlights.set(groupName, new Highlight(...customHighlightGroups[groupName]));
    }
  });

  console.log('自定义词组高亮完成');
}

// 应用高亮组（增量版本 - 与现有高亮合并）
function applyHighlightGroupsIncremental(newHighlightGroups) {
  Object.keys(newHighlightGroups).forEach(groupName => {
    if (newHighlightGroups[groupName].size > 0) {
      // 获取现有的高亮组
      const existingHighlight = CSS.highlights.get(groupName);

      if (existingHighlight) {
        // 合并现有的和新的高亮范围
        const allRanges = new Set([...existingHighlight, ...newHighlightGroups[groupName]]);
        CSS.highlights.set(groupName, new Highlight(...allRanges));
      } else {
        // 如果没有现有的高亮组，直接设置新的
        CSS.highlights.set(groupName, new Highlight(...newHighlightGroups[groupName]));
      }
    }
  });

  console.log('增量自定义词组高亮应用完成');
}

// 在单个文本节点中高亮自定义词组
function highlightCustomWordsInNode(textNode, customHighlightGroups) {
  if (!textNode || !textNode.textContent) return;

  const text = textNode.textContent;
  const matches = customWordTrie.search(text);

  if (matches.length === 0) return;

  // 按位置排序，但允许重叠高亮
  matches.sort((a, b) => a.start - b.start);

  if (matches.length === 0) return;

  // 为每个匹配创建 Range 并添加到对应的高亮组（允许重叠）
  matches.forEach(match => {
    const range = document.createRange();
    range.setStart(textNode, match.start);
    range.setEnd(textNode, match.end);

    // 获取词组状态
    const wordData = customWordDetails.get(match.word.toLowerCase());
    const status = wordData ? wordData.status : '0';
    const groupName = `custom-state${status}`;

    // 添加到对应的高亮组
    if (customHighlightGroups[groupName]) {
      customHighlightGroups[groupName].add(range);
    }

    // 存储 Range 信息用于查询功能
    storeCustomWordRange(match.word, range, textNode, match.start, match.end);
  });
}

// 添加自定义高亮的 CSS 样式
function addCustomHighlightStyles() {
  if (document.getElementById('custom-highlight-styles')) return;

  const style = document.createElement('style');
  style.id = 'custom-highlight-styles';
  style.textContent = `
    ::highlight(custom-state0) {
      /* 状态0：无色 */
      background-color: transparent;
    }
    ::highlight(custom-state1) {
      background-color: rgba(88, 212, 64, 0.66);
      border-radius: 3px;
    }
    ::highlight(custom-state2) {
      background-color: rgba(45, 177, 45, 0.5);
      border-radius: 3px;
    }
    ::highlight(custom-state3) {
      background-color: rgba(32, 107, 32, 0.6);
      border-radius: 3px;
    }
    ::highlight(custom-state4) {
      /* 状态4：下划线 */
      background-color: transparent;
      text-decoration: underline;
      text-decoration-color:rgb(44, 134, 36);
      text-decoration-thickness: 2px;
    }
    ::highlight(custom-state5) {
      /* 状态5：无色 */
      background-color: transparent;
    }
  `;
  document.head.appendChild(style);
}

// 添加鼠标事件监听
function addMouseEventListeners() {
  // 使用 capture 模式和高优先级
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('mousemove', handleMouseMove, true);
}

// 添加DOM变化监听（轻量级版本 - 避免与正常单词高亮冲突）
let domObserver = null;
let domChangeTimeout = null;

function addDOMObserver() {
  if (domObserver) {
    domObserver.disconnect();
  }

  domObserver = new MutationObserver((mutations) => {
    // 使用防抖机制，避免频繁触发
    if (domChangeTimeout) {
      clearTimeout(domChangeTimeout);
    }

    domChangeTimeout = setTimeout(() => {
      processDOMChanges(mutations);
    }, 200); // 减少延迟，提高响应速度
  });

  // 开始观察整个文档的变化，增加 characterData 监听以处理文本内容变化
  domObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true, // 添加文本内容变化监听，处理字幕刷新场景
  });

  console.log('轻量级DOM变化监听器已启动（延迟处理，避免冲突）');
}

// 爆炸窗口高亮延迟定时器
let explosionHighlightTimer = null;

// 异步处理DOM变化
function processDOMChanges(mutations) {
  // 检查是否有爆炸窗口的变化
  const hasExplosionChange = mutations.some(mutation =>
    mutation.target?.classList?.contains('word-explosion-content') ||
    mutation.target?.closest?.('.word-explosion-content')
  );

  if (hasExplosionChange) {
    // 如果是爆炸窗口的变化，延迟处理以等待所有节点添加完成
    if (explosionHighlightTimer) {
      clearTimeout(explosionHighlightTimer);
    }
    explosionHighlightTimer = setTimeout(() => {
      // 直接高亮爆炸窗口内的所有文本节点
      const explosionContent = document.querySelector('.word-explosion-content');
      if (explosionContent) {
        console.log('[自定义高亮] 检测到爆炸窗口内容变化，开始高亮');
        const textNodes = getTextNodesFromElement(explosionContent);
        console.log('[自定义高亮] 爆炸窗口内找到', textNodes.length, '个文本节点');
        if (textNodes.length > 0) {
          highlightCustomWordsInNewNodes(textNodes);
        }
      }
      explosionHighlightTimer = null;
    }, 150); // 延迟150ms等待所有节点添加完成
  } else {
    // 其他变化直接处理
    checkDOMChangesForHighlight(mutations);
  }
}

// 检查DOM变化是否需要重新高亮
function checkDOMChangesForHighlight(mutations) {
  const newTextNodes = new Set();
  const changedTextNodes = new Set();

  mutations.forEach((mutation) => {
    if (mutation.type === 'childList') {
      // 收集新增的文本节点
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          // 对于文本节点，检查其父元素是否在 YouTube 允许列表中
          if (window.location.hostname.includes('youtube.com')) {
            if (node.parentElement && isAllowedYouTubeElement(node.parentElement)) {
              newTextNodes.add(node);
            }
          } else {
            newTextNodes.add(node);
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // 检查元素是否包含文本内容
          if (node.textContent && node.textContent.trim()) {
            // 排除扩展自己创建的元素
            if (!node.hasAttribute('data-extension-element') &&
                !node.classList?.contains('custom-word-query-button') &&
                !node.classList?.contains('vocab-tooltip')) {

              // 对于 YouTube，检查元素是否在允许列表中
              if (window.location.hostname.includes('youtube.com')) {
                if (isAllowedYouTubeElement(node)) {
                  // 获取元素内的所有文本节点
                  const textNodes = getTextNodesFromElement(node);
                  textNodes.forEach(textNode => newTextNodes.add(textNode));
                }
              } else {
                // 获取元素内的所有文本节点
                const textNodes = getTextNodesFromElement(node);
                textNodes.forEach(textNode => newTextNodes.add(textNode));
              }
            }
          }
        }
      });

      // 特殊处理：检查 mutation.target 是否是爆炸弹窗的内容容器
      // 当 container.innerHTML = '' 后再添加子元素时，需要重新扫描整个容器
      if (mutation.target &&
          mutation.target.classList?.contains('word-explosion-content') &&
          mutation.addedNodes.length > 0) {
        const allTextNodesInContainer = getTextNodesFromElement(mutation.target);
        allTextNodesInContainer.forEach(textNode => newTextNodes.add(textNode));
      }
    } else if (mutation.type === 'characterData') {
      // 处理文本内容变化（字幕刷新场景）
      const textNode = mutation.target;
      if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent.trim()) {
        // 检查父元素是否在允许列表中
        if (window.location.hostname.includes('youtube.com')) {
          if (textNode.parentElement && isAllowedYouTubeElement(textNode.parentElement)) {
            changedTextNodes.add(textNode);
          }
        } else {
          changedTextNodes.add(textNode);
        }
      }
    }
  });

  // 合并新增和变化的文本节点
  const allTextNodes = new Set([...newTextNodes, ...changedTextNodes]);

  if (allTextNodes.size > 0 && customHighlightEnabled && customWordTrie) {
    console.log(`检测到内容变化，增量高亮 ${allTextNodes.size} 个文本节点（新增: ${newTextNodes.size}, 变化: ${changedTextNodes.size}）`);

    // 对于变化的文本节点，需要先清理旧的高亮
    if (changedTextNodes.size > 0) {
      clearHighlightForTextNodes(Array.from(changedTextNodes));
    }

    // 使用增量高亮，处理所有相关的文本节点
    highlightCustomWordsInNewNodes(Array.from(allTextNodes));
  }
}

// 清理指定文本节点的高亮
function clearHighlightForTextNodes(textNodes) {
  if (!textNodes || textNodes.length === 0) return;

  console.log(`清理 ${textNodes.length} 个文本节点的旧高亮`);

  // 获取所有自定义高亮组
  const customGroups = ['custom-state0', 'custom-state1', 'custom-state2', 'custom-state3', 'custom-state4', 'custom-state5'];

  textNodes.forEach(textNode => {
    // 从 customWordRangesMap 中清理相关的 Range
    for (const [word, ranges] of customWordRangesMap) {
      const filteredRanges = ranges.filter(rangeData => rangeData.textNode !== textNode);
      if (filteredRanges.length !== ranges.length) {
        if (filteredRanges.length > 0) {
          customWordRangesMap.set(word, filteredRanges);
        } else {
          customWordRangesMap.delete(word);
        }
      }
    }

    // 从 CSS.highlights 中移除包含该文本节点的 Range
    customGroups.forEach(groupName => {
      const existingHighlight = CSS.highlights.get(groupName);
      if (existingHighlight) {
        const rangesToRemove = [];
        for (const range of existingHighlight) {
          try {
            // 检查 Range 是否包含该文本节点
            if (range.startContainer === textNode || range.endContainer === textNode) {
              rangesToRemove.push(range);
            }
          } catch (error) {
            // Range 可能已经无效，直接移除
            rangesToRemove.push(range);
          }
        }

        rangesToRemove.forEach(range => existingHighlight.delete(range));

        // 如果高亮组为空，删除整个组
        if (existingHighlight.size === 0) {
          CSS.highlights.delete(groupName);
        }
      }
    });
  });
}

// 获取元素内的所有文本节点
function getTextNodesFromElement(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );

  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  return textNodes;
}

// 增量高亮新增的文本节点
function highlightCustomWordsInNewNodes(newTextNodes) {
  if (!customWordTrie || !customHighlightEnabled || newTextNodes.length === 0) return;

  console.log(`开始增量高亮 ${newTextNodes.length} 个文本节点`);

  // 为每个状态创建高亮组
  const customHighlightGroups = {
    'custom-state0': new Set(),
    'custom-state1': new Set(),
    'custom-state2': new Set(),
    'custom-state3': new Set(),
    'custom-state4': new Set(),
    'custom-state5': new Set()
  };

  // 处理每个文本节点
  newTextNodes.forEach(textNode => {
    // 确保文本节点仍在DOM中
    if (document.contains(textNode)) {
      highlightCustomWordsInNode(textNode, customHighlightGroups);
    }
  });

  // 使用增量版本应用高亮组，与现有高亮合并
  applyHighlightGroupsIncremental(customHighlightGroups);

  console.log('增量自定义词组高亮完成');
}

// 更新单个单词的高亮状态
function updateSingleWordHighlight(word, newStatus) {
  if (!customWordTrie || !customHighlightEnabled) return;

  console.log(`更新单词 "${word}" 的高亮状态为 ${newStatus}`);

  // 获取所有相关的高亮组
  const allGroupNames = ['custom-state0', 'custom-state1', 'custom-state2', 'custom-state3', 'custom-state4', 'custom-state5'];
  const newGroupName = `custom-state${newStatus}`;

  // 从所有高亮组中移除这个单词的高亮范围
  allGroupNames.forEach(groupName => {
    const existingHighlight = CSS.highlights.get(groupName);
    if (existingHighlight) {
      const filteredRanges = [];

      // 遍历现有的高亮范围，过滤掉匹配当前单词的范围
      for (const range of existingHighlight) {
        const rangeText = range.toString().toLowerCase();
        if (rangeText !== word.toLowerCase()) {
          filteredRanges.push(range);
        }
      }

      // 更新高亮组
      if (filteredRanges.length > 0) {
        CSS.highlights.set(groupName, new Highlight(...filteredRanges));
      } else {
        CSS.highlights.delete(groupName);
      }
    }
  });

  // 清除该单词的旧 Range 信息
  const wordKey = word.toLowerCase();
  customWordRangesMap.delete(wordKey);

  // 重新为这个单词创建高亮（在新的状态组中）
  const textNodes = getTextNodesOptimized(document.body);
  const newHighlightGroup = new Set();

  textNodes.forEach(textNode => {
    if (!textNode || !textNode.textContent) return;

    const text = textNode.textContent;
    const matches = customWordTrie.search(text);

    matches.forEach(match => {
      if (match.word && match.word.toLowerCase() === word.toLowerCase()) {
        const range = document.createRange();
        range.setStart(textNode, match.start);
        range.setEnd(textNode, match.end);
        newHighlightGroup.add(range);

        // 存储 Range 信息用于查询功能
        storeCustomWordRange(match.word, range, textNode, match.start, match.end);
      }
    });
  });

  // 应用新的高亮
  if (newHighlightGroup.size > 0) {
    const existingNewGroupHighlight = CSS.highlights.get(newGroupName);
    if (existingNewGroupHighlight) {
      const allRanges = new Set([...existingNewGroupHighlight, ...newHighlightGroup]);
      CSS.highlights.set(newGroupName, new Highlight(...allRanges));
    } else {
      CSS.highlights.set(newGroupName, new Highlight(...newHighlightGroup));
    }
  }

  console.log(`单词 "${word}" 高亮状态更新完成，新状态: ${newStatus}`);
}

// 高亮单个新添加的词组
function highlightSingleNewWord(word, status) {
  if (!customWordTrie || !customHighlightEnabled) return;

  console.log(`高亮新添加的词组 "${word}"，状态: ${status}`);

  const groupName = `custom-state${status}`;
  const newHighlightGroup = new Set();

  // 获取所有文本节点并查找匹配
  const textNodes = getTextNodesOptimized(document.body);

  textNodes.forEach(textNode => {
    if (!textNode || !textNode.textContent) return;

    const text = textNode.textContent;
    const matches = customWordTrie.search(text);

    matches.forEach(match => {
      if (match.word && match.word.toLowerCase() === word.toLowerCase()) {
        const range = document.createRange();
        range.setStart(textNode, match.start);
        range.setEnd(textNode, match.end);
        newHighlightGroup.add(range);

        // 存储 Range 信息用于查询功能
        storeCustomWordRange(match.word, range, textNode, match.start, match.end);
      }
    });
  });

  // 应用新的高亮
  if (newHighlightGroup.size > 0) {
    const existingHighlight = CSS.highlights.get(groupName);
    if (existingHighlight) {
      const allRanges = new Set([...existingHighlight, ...newHighlightGroup]);
      CSS.highlights.set(groupName, new Highlight(...allRanges));
    } else {
      CSS.highlights.set(groupName, new Highlight(...newHighlightGroup));
    }
  }

  console.log(`新词组 "${word}" 高亮完成`);
}

// 移除单个单词的所有高亮
function removeSingleWordHighlight(word) {
  console.log(`[removeSingleWordHighlight] 开始移除单词 "${word}" 的高亮`);
  console.log(`[removeSingleWordHighlight] customWordTrie 存在:`, !!customWordTrie);
  console.log(`[removeSingleWordHighlight] customHighlightEnabled:`, customHighlightEnabled);

  if (!customHighlightEnabled) {
    console.log(`[removeSingleWordHighlight] 自定义高亮已禁用，跳过移除`);
    return;
  }

  console.log(`移除单词 "${word}" 的所有高亮`);

  // 获取所有相关的高亮组
  const allGroupNames = ['custom-state0', 'custom-state1', 'custom-state2', 'custom-state3', 'custom-state4', 'custom-state5'];
  const wordLower = word.toLowerCase();
  let totalRemoved = 0;

  // 从所有高亮组中移除这个单词的高亮范围
  allGroupNames.forEach(groupName => {
    const existingHighlight = CSS.highlights.get(groupName);
    if (existingHighlight) {
      const filteredRanges = [];
      let removedCount = 0;

      // 遍历现有的高亮范围，过滤掉匹配当前单词的范围
      for (const range of existingHighlight) {
        const rangeText = range.toString().toLowerCase().trim();
        // 使用trim()去除空格，并且支持多词词组的匹配
        if (rangeText !== wordLower) {
          filteredRanges.push(range);
        } else {
          removedCount++;
          console.log(`[removeSingleWordHighlight] 从 ${groupName} 中移除匹配的range: "${rangeText}"`);
        }
      }

      // 更新高亮组
      if (filteredRanges.length > 0) {
        CSS.highlights.set(groupName, new Highlight(...filteredRanges));
        console.log(`[removeSingleWordHighlight] ${groupName} 更新后剩余 ${filteredRanges.length} 个range`);
      } else {
        CSS.highlights.delete(groupName);
        console.log(`[removeSingleWordHighlight] ${groupName} 已清空并删除`);
      }

      totalRemoved += removedCount;
    }
  });

  // 从 customWordRangesMap 中移除该词组的所有Range数据
  const wordKey = wordLower;
  if (customWordRangesMap.has(wordKey)) {
    customWordRangesMap.delete(wordKey);
    console.log(`[removeSingleWordHighlight] 已从customWordRangesMap中移除: "${wordKey}"`);
  }

  console.log(`单词 "${word}" 的所有高亮已移除，共移除 ${totalRemoved} 个range`);
}

// 处理鼠标悬浮事件
function handleMouseOver(event) {
  if (!customHighlightEnabled) return;

  // 检查鼠标是否在查询按钮上
  if (customQueryButtons && customQueryButtons.some(button =>
    button && (button.contains(event.target) || event.target === button))) {
    // console.log('鼠标悬浮在查询按钮上，跳过词组检测');
    return;
  }

  // 检查鼠标位置是否在自定义高亮区域内
  const mouseX = event.clientX;
  const mouseY = event.clientY;

  // console.log('鼠标悬浮检测:', mouseX, mouseY, '自定义词组数量:', customWordRangesMap.size);

  // 收集所有匹配的词组
  const matchedWords = [];
  for (const [word, ranges] of customWordRangesMap) {
    // 检查词组是否仍然存在于自定义词组详情中
    if (!customWordDetails.has(word)) {
      // console.log('跳过已删除的词组:', word);
      continue;
    }

    // console.log('检查词组:', word, '范围数量:', ranges.length);
    for (const rangeData of ranges) {
      if (isPointInRange(mouseX, mouseY, rangeData.range)) {
        // console.log('找到匹配的词组:', word);
        matchedWords.push(word);
        break; // 同一个词组只需要添加一次
      }
    }
  }

  // 如果找到匹配的词组，显示多个查询按钮
  if (matchedWords.length > 0) {
    showMultipleCustomWordQueryButtons(matchedWords, mouseX, mouseY);
  }
}

// 处理鼠标移动事件
function handleMouseMove(event) {
  if (!customHighlightEnabled) return;

  // 检查鼠标是否在任何查询按钮上或按钮内部
  const isOnAnyButton = customQueryButtons.some(button => {
    if (!button) return false;

    // 首先检查事件目标是否是按钮或其子元素
    if (button.contains(event.target) || event.target === button) {
      // console.log('鼠标在查询按钮或其子元素上，不处理隐藏逻辑');
      return true;
    }

    // 然后检查鼠标坐标是否在按钮区域内
    const buttonRect = button.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    // 添加一些边距容错
    const margin = 5;
    if (mouseX >= (buttonRect.left - margin) && mouseX <= (buttonRect.right + margin) &&
        mouseY >= (buttonRect.top - margin) && mouseY <= (buttonRect.bottom + margin)) {
      // console.log('鼠标在查询按钮区域内，不处理隐藏逻辑');
      return true;
    }

    return false;
  });

  if (isOnAnyButton) {
    return;
  }

  // 检查鼠标位置是否在自定义高亮区域内
  const mouseX = event.clientX;
  const mouseY = event.clientY;

  // 收集所有匹配的词组
  const matchedWords = [];
  for (const [word, ranges] of customWordRangesMap) {
    // 检查词组是否仍然存在于自定义词组详情中
    if (!customWordDetails.has(word)) {
      // console.log('跳过已删除的词组:', word);
      continue;
    }

    for (const rangeData of ranges) {
      if (isPointInRange(mouseX, mouseY, rangeData.range)) {
        // console.log('鼠标移动检测到匹配的词组:', word);
        matchedWords.push(word);
        break; // 同一个词组只需要添加一次
      }
    }
  }

  // 如果找到匹配的词组，显示多个查询按钮
  if (matchedWords.length > 0) {
    showMultipleCustomWordQueryButtons(matchedWords, mouseX, mouseY);
  } else {
    // 如果没有找到匹配的词组，延迟隐藏按钮
    scheduleHideAllCustomWordQueryButtons();
  }
}

// 处理鼠标离开事件
function handleMouseOut(event) {
  // 检查鼠标是否在任何查询按钮上
  const isOnAnyButton = customQueryButtons.some(button =>
    button && (button.contains(event.target) || event.target === button));

  if (isOnAnyButton) {
    // console.log('鼠标离开事件：鼠标在查询按钮上，不隐藏按钮');
    return;
  }

  // 延迟隐藏查询按钮
  scheduleHideAllCustomWordQueryButtons();
}

// 检查点是否在 Range 内
function isPointInRange(x, y, range) {
  try {
    const rects = range.getClientRects();
    // console.log('检查 Range 矩形:', rects.length, '个');
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      // console.log(`矩形 ${i}:`, rect.left, rect.top, rect.right, rect.bottom);
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        // console.log('鼠标在范围内!');
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('检查点是否在 Range 内时出错:', error);
    return false;
  }
}

// 显示自定义词组查询按钮
let customQueryButton = null; // 保留单个按钮的兼容性
let customQueryButtons = []; // 多个查询按钮数组
let queryButtonHideTimer = null;
let currentButtonWords = []; // 缓存当前显示的按钮词组

function showCustomWordQueryButton(word, mouseX, mouseY) {
  // 清除之前的隐藏定时器
  if (queryButtonHideTimer) {
    clearTimeout(queryButtonHideTimer);
    queryButtonHideTimer = null;
  }

  // 如果按钮已存在，更新位置和词组信息
  if (customQueryButton) {
    updateQueryButtonPosition(word, mouseX, mouseY);
    return;
  }

  // 创建查询按钮
  customQueryButton = document.createElement('div');
  customQueryButton.className = 'custom-word-query-button';
  customQueryButton.setAttribute('data-extension-element', 'true');

  let buttonStyles = `
    position: absolute;
    background: rgba(0, 150, 0, 0.9);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    z-index: 2147483647;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(10px);
    user-select: none;
    transition: all 0.2s ease;
  `;

  // 检测竖排文本模式，如果是则添加保护样式
  if (detectVerticalWritingMode()) {
    buttonStyles += `
      writing-mode: horizontal-tb !important;
      -webkit-writing-mode: horizontal-tb !important;
      -moz-writing-mode: horizontal-tb !important;
      -ms-writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      -webkit-text-orientation: mixed !important;
      direction: ltr !important;
      unicode-bidi: normal !important;
    `;
    console.log("检测到竖排文本页面，已为自定义词组查询按钮添加横向保护样式");
  }

  customQueryButton.style.cssText = buttonStyles;

  customQueryButton.innerHTML = `
    <div style="display: flex; align-items: center; gap: 4px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="21 21l-4.35-4.35"/>
      </svg>
      <span>查询</span>
    </div>
  `;

  // 使用页面坐标计算按钮位置（加上滚动偏移）
  const buttonWidth = 60;
  const buttonHeight = 30;
  const gap = 10;

  // 获取页面滚动偏移
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  let left = mouseX + scrollX - (buttonWidth / 2);
  let top = mouseY + scrollY - buttonHeight - gap;

  // 边界检查（相对于视口）
  if (left - scrollX < 10) {
    left = scrollX + 10;
  } else if (left - scrollX + buttonWidth > window.innerWidth - 10) {
    left = scrollX + window.innerWidth - buttonWidth - 10;
  }

  if (top - scrollY < 10) {
    top = mouseY + scrollY + gap;
  }

  customQueryButton.style.left = left + 'px';
  customQueryButton.style.top = top + 'px';
  
  // 设置初始词组数据和鼠标位置
  customQueryButton.setAttribute('data-current-word', word);
  customQueryButton.setAttribute('data-mouse-x', mouseX.toString());
  customQueryButton.setAttribute('data-mouse-y', mouseY.toString());

  // 添加点击事件
  customQueryButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const button = e.target.closest('.custom-word-query-button');
    const currentWord = button.getAttribute('data-current-word');
    const storedMouseX = parseFloat(button.getAttribute('data-mouse-x')) || mouseX;
    const storedMouseY = parseFloat(button.getAttribute('data-mouse-y')) || mouseY;
    // 传递鼠标位置信息给查询处理函数
    handleCustomWordQuery(currentWord || word, storedMouseX, storedMouseY);
  });

  // 添加悬浮效果
  customQueryButton.addEventListener('mouseenter', () => {
    // 鼠标进入按钮时，取消隐藏定时器
    if (queryButtonHideTimer) {
      clearTimeout(queryButtonHideTimer);
      queryButtonHideTimer = null;
    }
    customQueryButton.style.transform = 'scale(1.05)';
    customQueryButton.style.backgroundColor = 'rgba(0, 120, 0, 0.95)';
    // console.log('鼠标进入查询按钮，取消隐藏定时器');
  });

  customQueryButton.addEventListener('mouseleave', () => {
    customQueryButton.style.transform = 'scale(1)';
    customQueryButton.style.backgroundColor = 'rgba(0, 150, 0, 0.9)';
    // 鼠标离开按钮时，延迟隐藏
    scheduleHideCustomWordQueryButton();
    // console.log('鼠标离开查询按钮，开始延迟隐藏');
  });
  
  document.body.appendChild(customQueryButton);
}

// 比较两个数组是否相等
function arraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

// 获取按钮实际宽度（使用auto宽度后测量）
function getButtonActualWidth(button) {
  if (!button) return 60;

  // 获取按钮的实际宽度
  const rect = button.getBoundingClientRect();
  return Math.max(60, rect.width); // 最小宽度60px
}

// 调整按钮位置（处理边界检查）
function adjustButtonPositions(mouseX, mouseY) {
  customQueryButtons.forEach((button, index) => {
    if (!button || !button.parentNode) return;

    const buttonWidth = getButtonActualWidth(button);
    const buttonHeight = 26;
    const gap = 10;
    const verticalSpacing = 30;

    // 获取页面滚动偏移
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // 计算位置：按钮左边缘与鼠标正上方对齐，向左偏移15px
    let left = mouseX + scrollX - 15;
    let top = mouseY + scrollY - buttonHeight - gap - 10 - (index * verticalSpacing);

    // 检查右边界
    if (left + buttonWidth > window.innerWidth + scrollX) {
      left = mouseX + scrollX - buttonWidth + 15; // 右侧显示时，右边缘与鼠标对齐，向右偏移15px
    }

    // 检查上边界
    if (top < scrollY) {
      top = mouseY + scrollY + gap + (index * verticalSpacing);
    }

    // 更新位置
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;

    // 更新存储的鼠标坐标
    button.setAttribute('data-mouse-x', mouseX.toString());
    button.setAttribute('data-mouse-y', mouseY.toString());
  });
}

// 更新所有按钮位置（仅更新位置，不重新计算宽度）
function updateAllButtonPositions(mouseX, mouseY) {
  adjustButtonPositions(mouseX, mouseY);
}

// 显示多个自定义词组查询按钮
function showMultipleCustomWordQueryButtons(words, mouseX, mouseY) {
  // 参数验证
  if (!Array.isArray(words) || words.length === 0) {
    console.error('showMultipleCustomWordQueryButtons: 无效的words参数', words);
    return;
  }
  if (typeof mouseX !== 'number' || typeof mouseY !== 'number') {
    console.error('showMultipleCustomWordQueryButtons: 无效的鼠标坐标', mouseX, mouseY);
    return;
  }

  // 清除之前的隐藏定时器
  if (queryButtonHideTimer) {
    clearTimeout(queryButtonHideTimer);
    queryButtonHideTimer = null;
  }

  // 按词组长度排序，长的在前面
  const sortedWords = words.sort((a, b) => b.length - a.length);

  // 检查内容是否相同
  const wordsChanged = !arraysEqual(currentButtonWords, sortedWords);

  if (wordsChanged) {
    // 内容发生变化，重新创建按钮
    hideAllCustomWordQueryButtons();
    currentButtonWords = [...sortedWords]; // 更新缓存

    // 为每个词组创建查询按钮
    sortedWords.forEach((word, index) => {
      const button = createCustomWordQueryButton(word, mouseX, mouseY, index);
      if (button) { // 只有成功创建的按钮才添加
        customQueryButtons.push(button);
        document.body.appendChild(button);
      }
    });

    // 添加到DOM后，重新计算位置以处理边界检查
    adjustButtonPositions(mouseX, mouseY);

    // console.log(`重新创建了 ${sortedWords.length} 个查询按钮:`, sortedWords);
  } else {
    // 内容相同，只更新位置
    updateAllButtonPositions(mouseX, mouseY);
    // console.log(`更新了 ${sortedWords.length} 个查询按钮位置`);
  }
}

// 创建单个自定义词组查询按钮
function createCustomWordQueryButton(word, mouseX, mouseY, index) {
  // 参数验证
  if (!word || typeof word !== 'string') {
    console.error('createCustomWordQueryButton: 无效的word参数', word);
    return null;
  }
  if (typeof mouseX !== 'number' || typeof mouseY !== 'number') {
    console.error('createCustomWordQueryButton: 无效的鼠标坐标', mouseX, mouseY);
    return null;
  }
  if (typeof index !== 'number') {
    console.error('createCustomWordQueryButton: 无效的index参数', index);
    index = 0; // 使用默认值
  }

  const button = document.createElement('div');
  button.className = 'custom-word-query-button';
  button.setAttribute('data-extension-element', 'true');

  // 计算按钮位置
  const buttonHeight = 26; // 减小高度，只比文字多2px空余
  const gap = 10;
  const verticalSpacing = 30; // 减小多个按钮之间的垂直间距

  // 获取页面滚动偏移
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  // 初始位置：按钮左边缘与鼠标正上方对齐，向左偏移15px（宽度检查将在添加到DOM后进行）
  let left = mouseX + scrollX - 15;
  let top = mouseY + scrollY - buttonHeight - gap - 10 - (index * verticalSpacing); // 额外向上10px

 

  let multiButtonStyles = `
    position: absolute;
    background: rgba(31, 31, 31, 0.85);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 2px 8px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    z-index: ${2147483647 - index}; /* 确保按钮层级正确 */
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
    transition: all 0.2s ease;
    left: ${left}px;
    top: ${top}px;
    width: auto;
    min-width: 60px;
    height: ${buttonHeight}px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // 检测竖排文本模式，如果是则添加保护样式
  if (detectVerticalWritingMode()) {
    multiButtonStyles += `
      writing-mode: horizontal-tb !important;
      -webkit-writing-mode: horizontal-tb !important;
      -moz-writing-mode: horizontal-tb !important;
      -ms-writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      -webkit-text-orientation: mixed !important;
      direction: ltr !important;
      unicode-bidi: normal !important;
    `;
  }

  button.style.cssText = multiButtonStyles;

  // HTML转义函数，防止特殊字符导致innerHTML出错
  const escapeHtml = (text) => {
    if (!text) return '';
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  button.innerHTML = `
    <div style="display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
        <circle cx="11" cy="11" r="8"/>
        <path d="M21 21l-4.35-4.35"/>
      </svg>
      <span style="font-weight: 500; font-size: 12px;">${escapeHtml(word)}</span>
    </div>
  `;

  // 设置数据属性
  button.setAttribute('data-current-word', word);
  button.setAttribute('data-mouse-x', mouseX.toString());
  button.setAttribute('data-mouse-y', mouseY.toString());

  // 添加点击事件
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWord = button.getAttribute('data-current-word');
    const storedMouseX = parseFloat(button.getAttribute('data-mouse-x')) || mouseX;
    const storedMouseY = parseFloat(button.getAttribute('data-mouse-y')) || mouseY;
    handleCustomWordQuery(currentWord || word, storedMouseX, storedMouseY);
  });

  // 添加悬浮效果
  button.addEventListener('mouseenter', () => {
    if (queryButtonHideTimer) {
      clearTimeout(queryButtonHideTimer);
      queryButtonHideTimer = null;
    }
    button.style.transform = 'scale(1.05)';
    button.style.backgroundColor = 'rgba(55, 55, 65, 0.95)';
    button.style.borderColor = 'rgba(255, 255, 255, 0.2)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.backgroundColor = 'rgba(45, 45, 55, 0.85)';
    button.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    scheduleHideAllCustomWordQueryButtons();
  });

  return button;
}

// 更新查询按钮位置和词组信息
function updateQueryButtonPosition(word, mouseX, mouseY) {
  if (!customQueryButton) return;

  // 更新按钮位置（使用页面坐标）
  const buttonWidth = 60;
  const buttonHeight = 30;
  const gap = 10;

  // 获取页面滚动偏移
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
  const scrollY = window.pageYOffset || document.documentElement.scrollTop;

  let left = mouseX + scrollX - (buttonWidth / 2);
  let top = mouseY + scrollY - buttonHeight - gap;

  // 边界检查（相对于视口）
  if (left - scrollX < 10) {
    left = scrollX + 10;
  } else if (left - scrollX + buttonWidth > window.innerWidth - 10) {
    left = scrollX + window.innerWidth - buttonWidth - 10;
  }

  if (top - scrollY < 10) {
    top = mouseY + scrollY + gap;
  }

  customQueryButton.style.left = left + 'px';
  customQueryButton.style.top = top + 'px';

  // 更新按钮的数据属性，用于点击时获取当前词组和鼠标位置
  customQueryButton.setAttribute('data-current-word', word);
  customQueryButton.setAttribute('data-mouse-x', mouseX.toString());
  customQueryButton.setAttribute('data-mouse-y', mouseY.toString());

  // console.log('更新查询按钮位置和词组:', word);
}

// 延迟隐藏自定义词组查询按钮
function scheduleHideCustomWordQueryButton() {
  // 清除之前的定时器
  if (queryButtonHideTimer) {
    clearTimeout(queryButtonHideTimer);
  }

  // 设置新的延迟隐藏定时器（500ms后隐藏）
  queryButtonHideTimer = setTimeout(() => {
    hideCustomWordQueryButton();
    queryButtonHideTimer = null;
  }, 500);
}

// 立即隐藏自定义词组查询按钮
function hideCustomWordQueryButton() {
  // 清除定时器
  if (queryButtonHideTimer) {
    clearTimeout(queryButtonHideTimer);
    queryButtonHideTimer = null;
  }

  if (customQueryButton) {
    customQueryButton.remove();
    customQueryButton = null;
  }
}

// 隐藏所有自定义词组查询按钮
function hideAllCustomWordQueryButtons() {
  // 清除定时器
  if (queryButtonHideTimer) {
    clearTimeout(queryButtonHideTimer);
    queryButtonHideTimer = null;
  }

  // 移除所有查询按钮
  customQueryButtons.forEach(button => {
    if (button && button.parentNode) {
      button.remove();
    }
  });
  customQueryButtons = [];
  currentButtonWords = []; // 清除缓存

  // 同时清除单个按钮（兼容性）
  if (customQueryButton) {
    customQueryButton.remove();
    customQueryButton = null;
  }
}

// 延迟隐藏所有自定义词组查询按钮
function scheduleHideAllCustomWordQueryButtons() {
  // 清除之前的定时器
  if (queryButtonHideTimer) {
    clearTimeout(queryButtonHideTimer);
  }

  // 设置新的延迟隐藏定时器
  queryButtonHideTimer = setTimeout(() => {
    hideAllCustomWordQueryButtons();
    // console.log('延迟隐藏所有查询按钮');
  }, 300); // 300ms 延迟
}

// 处理自定义词组查询
function handleCustomWordQuery(word, mouseX, mouseY) {
  // console.log('查询自定义词组:', word, '鼠标位置:', mouseX, mouseY);

  // 隐藏所有查询按钮
  hideAllCustomWordQueryButtons();

  // 检查词组是否仍然存在于自定义词组详情中
  const wordData = customWordDetails.get(word.toLowerCase());
  if (!wordData) {
    console.log('词组已被删除，不显示查询弹窗:', word);
    return;
  }

  // 获取词组的所有 Range
  const ranges = customWordRangesMap.get(word.toLowerCase());
  if (!ranges || ranges.length === 0) {
    console.error('找不到词组的 Range 信息:', word);
    return;
  }

  // 如果有鼠标位置信息，找到最接近鼠标位置的 Range
  let targetRange = ranges[0]; // 默认使用第一个

  if (mouseX !== undefined && mouseY !== undefined) {
    let minDistance = Infinity;

    for (const rangeData of ranges) {
      const rect = rangeData.range.getBoundingClientRect();

      // 检查鼠标是否在这个 Range 内
      if (mouseX >= rect.left && mouseX <= rect.right &&
          mouseY >= rect.top && mouseY <= rect.bottom) {
        targetRange = rangeData;
        break; // 找到包含鼠标的 Range，直接使用
      }

      // 如果鼠标不在任何 Range 内，找到距离最近的
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));

      if (distance < minDistance) {
        minDistance = distance;
        targetRange = rangeData;
      }
    }
  }

  const rect = targetRange.range.getBoundingClientRect();
  const wordRect = {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };

  // 获取上下文句子
  const sentence = getContextSentenceFromRange(targetRange);

  // 播放词组 TTS
  try {
    if (typeof playText === 'function') {
      playText({
        sentence: sentence,
        text: word,
        count: 1
      });
    }
  } catch (error) {
    console.error('播放词组 TTS 时发生错误:', error);
  }

  // 调用现有的查词功能
  // 注意：词组查询不受爆炸优先模式限制，因为查询按钮本身就是独立的UI元素
  // 所以这里传入 isOffscreen=false，避免触发爆炸优先模式检测
  // 最后一个参数 isCustom 设置为 true，表示这是自定义词组
  if (typeof showEnhancedTooltipForWord === 'function') {
    showEnhancedTooltipForWord(word, sentence, wordRect, targetRange.textNode.parentElement, word, true);
  } else {
    console.error('showEnhancedTooltipForWord 函数不存在');
  }
}

// 从 Range 获取上下文句子
function getContextSentenceFromRange(rangeData) {
  try {
    const textNode = rangeData.textNode;
    let parent = textNode.parentElement;

    // 向上查找，直到找到包含完整句子的元素
    while (parent && parent !== document.body) {
      const text = parent.textContent || '';
      const wordText = textNode.textContent.substring(rangeData.start, rangeData.end);

      if (text.length > wordText.length * 3) {
        // 尝试提取包含目标词的句子
        const sentences = text.split(/[.!?。！？]/);
        for (const sentence of sentences) {
          if (sentence.includes(wordText)) {
            return sentence.trim();
          }
        }
        return text.trim();
      }
      parent = parent.parentElement;
    }

    return textNode.textContent.substring(rangeData.start, rangeData.end);
  } catch (error) {
    console.error('获取上下文句子失败:', error);
    return rangeData.word;
  }
}

// 从元素获取上下文句子（保留原函数以兼容其他代码）
function getContextSentenceFromElement(element) {
  try {
    let parent = element.parentElement;

    // 向上查找，直到找到包含完整句子的元素
    while (parent && parent !== document.body) {
      const text = parent.textContent || '';
      if (text.length > element.textContent.length * 3) {
        // 尝试提取包含目标词的句子
        const sentences = text.split(/[.!?。！？]/);
        for (const sentence of sentences) {
          if (sentence.includes(element.textContent)) {
            return sentence.trim();
          }
        }
        return text.trim();
      }
      parent = parent.parentElement;
    }

    return element.textContent;
  } catch (error) {
    console.error('获取上下文句子失败:', error);
    return element.textContent;
  }
}

// 存储自定义词组的 Range 信息
function storeCustomWordRange(word, range, textNode, start, end) {
  const key = word.toLowerCase();
  if (!customWordRangesMap.has(key)) {
    customWordRangesMap.set(key, []);
  }

  // 检查是否已经存在相同文本节点和位置的Range，避免重复存储
  const existingRanges = customWordRangesMap.get(key);
  const isDuplicate = existingRanges.some(rangeData =>
    rangeData.textNode === textNode &&
    rangeData.start === start &&
    rangeData.end === end
  );

  if (!isDuplicate) {
    customWordRangesMap.get(key).push({
      range: range,
      textNode: textNode,
      start: start,
      end: end,
      word: word
    });
  }
}

// 清除自定义高亮
function clearCustomHighlights() {
  // 清除所有自定义高亮组
  const customGroups = ['custom-state0', 'custom-state1', 'custom-state2', 'custom-state3', 'custom-state4', 'custom-state5'];
  customGroups.forEach(groupName => {
    CSS.highlights.delete(groupName);
  });

  customWordRangesMap.clear();

  // 清除所有查询按钮
  hideAllCustomWordQueryButtons();

  // 清除文本节点缓存
  clearTextNodeCache();
}

// 清除文本节点缓存
function clearTextNodeCache() {
  try {
    // 清除 document.body 的缓存
    if (document.body) {
      delete document.body._textNodesCache;
      delete document.body._textNodesCacheTime;
    }

    // 清除其他可能的缓存
    const elementsWithCache = document.querySelectorAll('[data-text-cache]');
    elementsWithCache.forEach(element => {
      delete element._textNodesCache;
      delete element._textNodesCacheTime;
      element.removeAttribute('data-text-cache');
    });
  } catch (error) {
    console.warn('清除文本节点缓存时出错:', error);
  }
}

// 获取所有文本节点
function getTextNodes(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // 跳过脚本、样式和扩展元素
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (parent.hasAttribute('data-extension-element')) {
          return NodeFilter.FILTER_REJECT;
        }

        // 跳过空白文本
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        // YouTube 特定的过滤逻辑
        if (window.location.hostname.includes('youtube.com')) {
          if (!isAllowedYouTubeElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }

  return textNodes;
}

// 优化的文本节点获取函数（增强版）
function getTextNodesOptimized(element) {
  const textNodes = [];

  // 使用缓存避免重复计算
  if (element._textNodesCache && element._textNodesCacheTime &&
      Date.now() - element._textNodesCacheTime < 5000) {
    return element._textNodesCache;
  }

  // 使用递归遍历，避免TreeWalker的开销
  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // 检查文本节点是否有效
      const parent = node.parentElement;
      if (parent &&
          !['script', 'style', 'noscript'].includes(parent.tagName.toLowerCase()) &&
          !parent.hasAttribute('data-extension-element') &&
          node.textContent.trim()) {

        // YouTube 特定的过滤逻辑
        if (window.location.hostname.includes('youtube.com')) {
          if (isAllowedYouTubeElement(parent)) {
            textNodes.push(node);
          }
        } else {
          textNodes.push(node);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 跳过不需要处理的元素
      const tagName = node.tagName.toLowerCase();
      if (!['script', 'style', 'noscript'].includes(tagName) &&
          !node.hasAttribute('data-extension-element')) {
        // 递归处理子节点
        for (let child of node.childNodes) {
          traverse(child);
        }
      }
    }
  }

  traverse(element);

  // 缓存结果
  element._textNodesCache = textNodes;
  element._textNodesCacheTime = Date.now();

  return textNodes;
}

// 检查元素是否为 YouTube 上允许处理的元素
function isAllowedYouTubeElement(parent) {
  // 定义YouTube上允许处理的元素类名和ID
  const allowedYoutubeIdentifiers = [
    'ytp-caption-window-container',
    'untertitle-drag-container',
    'untertitle-display',
    'untertitle-text',
    'highlight-wrapper',
    'caption-window',
    'captions-text',
    'caption-visual-line',
    'ytp-caption-segment',
    // 'ytd-watch-metadata',
    // 'yt-core-attributed-string',
    // 'yt-core-attributed-string--white-space-pre-wrap',
    'above-the-fold',
    'trancy-app'
    // 'video-title',
  ];

  // 检查元素是否属于允许的类或ID
  let isAllowedElement = false;

  if (parent) {
    // 检查当前元素及其所有父元素
    let currentElement = parent;

    while (currentElement && !isAllowedElement) {
      // 检查当前元素的ID
      if (currentElement.id && allowedYoutubeIdentifiers.some(id => currentElement.id.includes(id))) {
        isAllowedElement = true;
        break;
      }

      // 检查当前元素的classList
      if (currentElement.classList && currentElement.classList.length > 0) {
        const classList = Array.from(currentElement.classList);
        if (classList.some(cls => allowedYoutubeIdentifiers.some(allowed => cls.includes(allowed)))) {
          isAllowedElement = true;
          break;
        }
      }

      // 检查当前元素的className字符串（兼容性处理）
      if (typeof currentElement.className === 'string' && currentElement.className) {
        const classNames = currentElement.className.split(' ');
        if (classNames.some(cls => allowedYoutubeIdentifiers.some(allowed => cls.includes(allowed)))) {
          isAllowedElement = true;
          break;
        }
      }

      // 向上查找父元素，直到document.body或document.documentElement
      currentElement = currentElement.parentElement;
      if (currentElement === document.body || currentElement === document.documentElement) {
        break;
      }
    }
  }

  return isAllowedElement;
}

// 启用/禁用自定义高亮
function toggleCustomHighlight(enabled) {
  customHighlightEnabled = enabled;

  if (enabled) {
    highlightCustomWordsInPage();
    // 重新启动DOM观察器
    if (!domObserver) {
      addDOMObserver();
    }
  } else {
    clearCustomHighlights();
    // 停止DOM观察器
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
  }

  console.log('自定义词组高亮', enabled ? '已启用' : '已禁用');
}

// 直接处理词组删除（避免消息传递问题）
function handleCustomWordDeletion(word) {
  console.log('[handleCustomWordDeletion] 直接处理词组删除:', word);

  const wordKey = word.toLowerCase();

  console.log('[handleCustomWordDeletion] 步骤1: 移除高亮');
  // 移除高亮
  removeSingleWordHighlight(word);

  console.log('[handleCustomWordDeletion] 步骤2: 从缓存中移除');
  // 从缓存中移除
  const hadInDetails = customWordDetails.has(wordKey);
  const hadInCache = customWordCache.has(wordKey);
  const hadInRangesMap = customWordRangesMap.has(wordKey);

  customWordDetails.delete(wordKey);
  customWordCache.delete(wordKey);
  customWordRangesMap.delete(wordKey);

  console.log(`[handleCustomWordDeletion] 缓存删除结果 - Details: ${hadInDetails}, Cache: ${hadInCache}, RangesMap: ${hadInRangesMap}`);

  console.log('[handleCustomWordDeletion] 步骤3: 从 Trie 中移除词组');
  // 从 Trie 中移除词组（不触发全局重新高亮）
  removeWordFromTrie(word);

  console.log('[handleCustomWordDeletion] 词组删除完成:', word);
}

// 导出函数供其他模块使用
window.initCustomHighlight = initCustomHighlight;
window.toggleCustomHighlight = toggleCustomHighlight;
window.loadCustomWords = loadCustomWords;
window.highlightCustomWordsInPage = highlightCustomWordsInPage;
window.clearCustomHighlights = clearCustomHighlights;
window.handleCustomWordDeletion = handleCustomWordDeletion;
window.clearHighlightForTextNodes = clearHighlightForTextNodes;
window.highlightCustomWordsInNewNodes = highlightCustomWordsInNewNodes;

// 注意：词组高亮系统不再自动初始化
// 它将由正常单词高亮系统在完成初始化后主动调用
console.log('词组高亮系统已加载，等待正常单词高亮系统调用...');
