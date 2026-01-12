// 在类顶部添加日语分词器引用
let JapaneseTokenizer = null;

// 添加iOS设备检测
// orion_isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

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

// =======================
// 修改函数：更新单词状态，同时调用 AI 检测单词语言后同步到数据库
// =======================
function updateWordStatus(word, status, sentence, parent, originalWord, isCustom = false) {
  console.log(`更新单词 ${word} 的状态为 ${status}`, isCustom ? '(自定义词组)' : '(普通单词)');
  const lower = word.toLowerCase();

  // 发送消息到后台更新单词状态
  chrome.runtime.sendMessage({
    action: "updateWordStatus",
    word: originalWord,
    status: status,
    isCustom: isCustom
  }, (response) => {
    if (response && response.error) {
      console.error("更新单词状态失败:", response.error);
    } else {
      console.log(`单词 ${word} 状态更新成功`);

      // 更新本地缓存
      if (highlightManager && highlightManager.wordDetailsFromDB) {
        // 修复：在更新缓存之前，先保存旧状态
        const oldStatus = highlightManager.wordDetailsFromDB[lower]?.status;
        const wasKnown = oldStatus === "5";

        highlightManager.wordDetailsFromDB[lower] = {
          ...highlightManager.wordDetailsFromDB[lower],
          status: status,
          isCustom: isCustom
        };
        console.log("本地缓存已更新:", highlightManager.wordDetailsFromDB[lower]);

        // 如果是自定义词组，通知自定义高亮系统更新
        if (isCustom) {
          console.log('通知自定义高亮系统更新');
          // 更新自定义词组详情
          if (typeof customWordDetails !== 'undefined' && customWordDetails) {
            const wordData = customWordDetails.get(lower);
            if (wordData) {
              wordData.status = status;
              customWordDetails.set(lower, wordData);
            }
          }

          // 通知自定义高亮系统进行增量更新
          chrome.runtime.sendMessage({
            action: 'customWordUpdated',
            word: originalWord,
            status: status,
            isCustom: isCustom,
            updateType: 'statusChange'
          });
        }

        // 更新高亮管理器
        // 修复：恢复被误删的 isWordKnown 判断逻辑
        if (highlightManager) {
          console.log("更新高亮管理器");

          // 检查单词原来是否为已知单词（状态5）
          if (wasKnown) {
            // 如果原来是已知单词（状态5）
            if (status === "5") {
              console.log("已知单词，保持状态5，不更新高亮", word);
            } else {
              // 状态5 → 其他状态：需要重新创建Range
              console.log("已知单词状态变更（5→" + status + "），需要重新创建Range", word);
              highlightManager.updateWordHighlight(word, status, parent, true);
            }
          } else {
            // 非已知单词：直接更新现有Range
            highlightManager.updateWordHighlight(word, status, parent);
          }
        }
      }
    }
  });
}


// =======================
// 高亮系统核心类 - 作用域观察者
// =======================


class ScopeObserver {
  constructor(tree) {
    this.tree = tree; // 作用域树
    this.walked = false; // 是否已完成初始扫描
    this.parent2Text2RawsAllUnknow = new Map(); // 存储所有文本节点的原始数据
    this.parent2Text2RawsAll = new Map(); // 存储所有文本节点的原始数据
    this.parent2Text2RangesView = new Map(); // 存储当前可见的高亮范围
    this.mutPairFlag = 0; // 变更观察器状态标志
    this.wordDetailsFromDB = {}; // 单词详情数据
    // this.wordStatusCache = new Map();           // 单词状态缓存

    // 添加高亮开关成员变量，并设置默认值
    this.highlightChineseEnabled = true;
    this.highlightJapaneseEnabled = true;
    this.highlightKoreanEnabled = true;
    this.highlightAlphabeticEnabled = true;
    this.autoDetectJapaneseKanji = true; // 智能识别日文汉字开关，默认开启
    this.isJapaneseDominantPage = false; // 页面是否为日文主导，默认false

    // 日语分词器相关设置
    this.useKuromojiTokenizer = false; // 是否使用kuromoji分词，默认关闭
    this.autoLoadKuromojiForJapanese = false; // 是否智能加载kuromoji（仅日语页面），默认关闭
    this.kuromojiInitPromise = null; // kuromoji初始化Promise
    this.kuromojiInitialized = false; // kuromoji是否已初始化

    // 默认设置为未定义，等待异步检测完成
    this.isDarkMode = undefined;

    // 初始化暗色模式检测
    this.initDarkModeDetection().then(() => {
      // 在暗色模式检测完成后初始化其他组件
      this.handleIntersectingBound = this.handleIntersecting();
      this.mutOb = this.newMutOb();
      this.hlParentSecOb = this.newTextParentSecOb();

      // 初始化扫描
      Promise.resolve().then(() => this.initWalk());
    });

    // 添加消息监听器
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "toggleHighlight") {
        if (message.enabled) {
          this.reapplyHighlights();
        } else {
          this.removeAllHighlights();
        }
      } else if (message.action === "redetectPageLanguage") {
        // 重新加载设置并检测页面语言
        chrome.storage.local.get(['autoDetectJapaneseKanji'], (result) => {
          this.autoDetectJapaneseKanji = result.autoDetectJapaneseKanji !== false;
          console.log("智能识别日文汉字开关已更新:", this.autoDetectJapaneseKanji);

          // 重新检测页面语言
          this.detectPageLanguage();

          // 重新应用高亮
          this.reapplyHighlights();
        });
      } else if (message.action === "reinitializeJapaneseTokenizer") {
        // 重新初始化日语分词器
        this.autoLoadKuromojiForJapanese = message.autoLoad === true;
        this.useKuromojiTokenizer = message.useKuromoji === true;

        console.log("日语分词器设置已更新:",
          this.autoLoadKuromojiForJapanese ? "智能加载kuromoji" :
          (this.useKuromojiTokenizer ? "全局使用kuromoji" : "使用Intl.Segmenter"));

        // 判断是否需要加载kuromoji
        // iOS设备永远不加载kuromoji
        const shouldLoadKuromoji = !orion_isIOS &&
          (this.useKuromojiTokenizer || (this.autoLoadKuromojiForJapanese && this.isJapaneseDominantPage));

        if (orion_isIOS) {
          console.log("iOS设备不支持kuromoji，使用Intl.Segmenter");
        }

        if (shouldLoadKuromoji && !this.kuromojiInitialized) {
          // 如果需要kuromoji且未初始化，则初始化
          this.initializeJapaneseTokenizer().then(() => {
            console.log("kuromoji初始化完成，重新应用高亮");
            this.reapplyHighlights();
          }).catch(err => {
            console.error("kuromoji初始化失败，将使用Intl.Segmenter:", err);
            this.reapplyHighlights();
          });
        } else {
          // 直接重新应用高亮
          this.reapplyHighlights();
        }
      }
    });

    this.ignoredElements = new Set(); // 添加忽略元素集合

    // 新增：本地缓存 - 避免重复分词和Range创建
    this.textCache = new Map(); // 文本内容 -> 分词结果缓存
    this.maxCacheSize = 1000; // 最大缓存条目数

    // 在类定义开始处添加CSS选择器黑名单
    ScopeObserver.IGNORED_SELECTORS = [
      '.textBasedSub', // 添加textBasedSub类
      '[data-no-highlight]', // 用户可以通过添加此属性手动排除元素
      '.vocab-tooltip', // 屏蔽搜索弹窗
      '.custom-word-tooltip', // 屏蔽自定义词组弹窗
      '.custom-word-selection-popup', // 屏蔽自定义词组选择弹窗
      '.custom-word-query-button', // 屏蔽自定义词组查询按钮
      'video',
      'canvas'
    ];

    // 注意：不再在构造函数中提前加载kuromoji
    // kuromoji.js (380KB) 会占用大量CPU资源，可能导致原始网页加载失败
    // 改为在页面加载完成后，根据条件延迟初始化
  }

  // 等待页面加载完成
  waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        console.log("[waitForPageLoad] 页面已加载完成");
        resolve();
      } else {
        console.log("[waitForPageLoad] 等待页面加载完成...");
        window.addEventListener('load', () => {
          console.log("[waitForPageLoad] 页面加载完成事件触发");
          resolve();
        }, { once: true });
      }
    });
  }

  // 设置单词详情数据
  setWordDetails(details) {
    console.log("更新词典数据");
    console.log("更新前:", this.wordDetailsFromDB);
    this.wordDetailsFromDB = details;
    console.log("更新后:", this.wordDetailsFromDB);
  }

  // 重新应用所有高亮
  reapplyHighlights() {
    console.log("重新应用所有高亮...");
    try {
      // 确保先完全清除所有高亮
      this.removeAllHighlights();

      // 检查插件是否启用
      chrome.storage.local.get(['enablePlugin'], (result) => {
        if (result.enablePlugin === false) {
          console.log("插件已禁用，不重新应用高亮");
          return;
        }

        // Firefox兼容性：继续原有的重新应用高亮逻辑
        const parentEntries = Array.from(this.parent2Text2RawsAllUnknow.entries());
        for (let i = 0; i < parentEntries.length; i++) {
          const [parent, textMap] = parentEntries[i];
          
          // 检查 parent 是否仍在文档中
          if (!document.contains(parent)) {
            this.parent2Text2RawsAllUnknow.delete(parent);
            continue;
          }

          if (this.isInViewport(parent)) {
            const textMapView = new Map();
            this.parent2Text2RangesView.set(parent, textMapView);

            const textEntries = Array.from(textMap.entries());
            for (let j = 0; j < textEntries.length; j++) {
              const [textNode, rawRanges] = textEntries[j];
              
              // 检查 textNode 是否仍在文档中
              if (!document.contains(textNode)) {
                textMap.delete(textNode);
                continue;
              }

              const ranges = [];
              for (let k = 0; k < rawRanges.length; k++) {
                const raw = rawRanges[k];
                if (this.isWordKnown(raw.wordLower)) continue;

                try {
                  const range = new Range();
                  range.setStart(textNode, raw.start);
                  range.setEnd(textNode, raw.end);

                  const darkModePrefix = this.isDarkMode ? "dark-" : "";
                  let group = darkModePrefix + "default";

                  if (this.wordDetailsFromDB[raw.wordLower]) {
                    const status = this.wordDetailsFromDB[raw.wordLower].status;
                    if (status === "5") continue; // 只有状态5才跳过高亮
                    if (["1", "2", "3", "4"].includes(status)) {
                      group = darkModePrefix + "state" + status;
                    }
                    // 状态0和其他状态都显示为默认蓝色高亮
                  }

                  range.highlightGroup = group;

                  if (!CSS.highlights.has(group)) {
                    CSS.highlights.set(group, new Highlight());
                  }
                  const hl = CSS.highlights.get(group);
                  hl.add(range);

                  ranges.push(range);
                } catch (e) {
                  console.error("创建或应用Range时出错:", e);
                }
              }

              if (ranges.length > 0) {
                textMapView.set(textNode, ranges);
              }
            }
          }
        }
      });
    } catch (e) {
      console.error("重新应用高亮时出错:", e);
    }
  }

  // 初始化文档扫描
  async initWalk() {
    const initStartTime = performance.now();
    console.log("开始初始化文档扫描（按需加载模式）...");

    // 初始化空缓存
    this.wordDetailsFromDB = {};

    // 获取数据库总大小（用于VIP判断）
    // chrome.runtime.sendMessage({
    //   action: "getWordCount"
    // }, (response) => {
    //   const wordCount = response?.count || 0;
    //   chrome.storage.local.set({
    //     wordDetailsFromDBSize: wordCount
    //   });
    //   console.log("数据库单词总量:", wordCount);
    // });

    const elapsed = performance.now() - initStartTime;
    console.log("初始化完成（无需加载数据）", `耗时: ${elapsed.toFixed(2)} ms`);

    // 加载高亮开关设置
    chrome.storage.local.get(['highlightChineseEnabled', 'highlightJapaneseEnabled', 'highlightKoreanEnabled', 'highlightAlphabeticEnabled', 'autoDetectJapaneseKanji', 'autoLoadKuromojiForJapanese', 'useKuromojiTokenizer'], (result) => {
      // 从存储中获取值，如果未定义则保持默认值 true
      // 使用 !== false 来确保 undefined 或 true 都被视为 true
      this.highlightChineseEnabled = result.highlightChineseEnabled !== false;
      this.highlightJapaneseEnabled = result.highlightJapaneseEnabled !== false;
      this.highlightKoreanEnabled = result.highlightKoreanEnabled !== false;
      this.highlightAlphabeticEnabled = result.highlightAlphabeticEnabled !== false;
      this.autoDetectJapaneseKanji = result.autoDetectJapaneseKanji !== false; // 默认开启
      this.autoLoadKuromojiForJapanese = result.autoLoadKuromojiForJapanese === true; // 默认关闭
      this.useKuromojiTokenizer = result.useKuromojiTokenizer === true; // 默认关闭

      console.log("高亮开关状态已加载:",
        "中:", this.highlightChineseEnabled,
        "日:", this.highlightJapaneseEnabled,
        "韩:", this.highlightKoreanEnabled,
        "字母:", this.highlightAlphabeticEnabled,
        "智能识别日文汉字:", this.autoDetectJapaneseKanji,
        "智能加载kuromoji:", this.autoLoadKuromojiForJapanese,
        "全局使用kuromoji:", this.useKuromojiTokenizer
      );

      // 执行页面语言检测
      this.detectPageLanguage();

      // 检查是否需要加载kuromoji
      // 1. iOS设备：永远不加载kuromoji
      // 2. 全局使用kuromoji：所有页面都加载
      // 3. 智能加载kuromoji：仅日语页面加载
      const needKuromoji = !orion_isIOS && this.highlightJapaneseEnabled &&
        (this.useKuromojiTokenizer || (this.autoLoadKuromojiForJapanese && this.isJapaneseDominantPage));

      if (needKuromoji) {
        const loadReason = this.useKuromojiTokenizer ? "全局使用kuromoji" :
          (this.autoLoadKuromojiForJapanese && this.isJapaneseDominantPage ? "检测到日语页面，智能加载kuromoji" : "未知原因");
        console.log(`[initWalk] ${loadReason}，等待页面加载完成后再初始化...`);
        console.log(`[initWalk] iOS设备检测: ${orion_isIOS ? 'iOS设备，不加载kuromoji' : '非iOS设备'}`);

        // 先等待页面加载完成，避免kuromoji阻塞原始网页加载
        this.waitForPageLoad().then(() => {
          console.log("[initWalk] 页面加载完成，开始初始化kuromoji...");

          // kuromoji模式下添加200ms延迟，避免阻塞页面交互
          ////没必要了，靠waitForPageLoad即可实现慢加载，由于kuromoji.js又380kb，若不慢加载会把网站干死。
          const startScanWithDelay = () => {
            // console.log("[initWalk] kuromoji模式，延迟200ms后开始扫描");
            setTimeout(() => {
              this.startDocumentScan();
            }, 1);
          };

          if (this.kuromojiInitialized) {
            // 已经初始化完成（例如用户在popup中切换设置触发的）
            console.log("[initWalk] kuromoji已初始化完成");
            startScanWithDelay();
          } else if (this.kuromojiInitPromise) {
            // 正在初始化中（例如用户在popup中切换设置触发的）
            console.log("[initWalk] kuromoji正在初始化中，等待完成...");
            this.kuromojiInitPromise.then(() => {
              console.log("[initWalk] kuromoji初始化完成");
              startScanWithDelay();
            }).catch(err => {
              console.error("[initWalk] kuromoji初始化失败，将使用Intl.Segmenter:", err);
              startScanWithDelay();
            });
          } else {
            // 开始初始化kuromoji
            console.log("[initWalk] 开始初始化kuromoji...");
            this.initializeJapaneseTokenizer().then(() => {
              console.log("[initWalk] kuromoji初始化完成");
              startScanWithDelay();
            }).catch(err => {
              console.error("[initWalk] kuromoji初始化失败，将使用Intl.Segmenter:", err);
              startScanWithDelay();
            });
          }
        });
      } else {
        // 不需要kuromoji，直接开始扫描（无延迟）
        const skipReason = orion_isIOS ? "iOS设备不支持kuromoji" :
          (!this.highlightJapaneseEnabled ? "日语高亮未启用" :
          (!this.useKuromojiTokenizer && !this.autoLoadKuromojiForJapanese ? "kuromoji功能未启用" :
          (!this.isJapaneseDominantPage ? "非日语页面" : "未知原因")));
        console.log(`[initWalk] 不需要kuromoji（${skipReason}），直接开始扫描`);
        this.startDocumentScan();
      }
    });
  }

  // 提取扫描文档的逻辑为独立方法
  startDocumentScan() {
    // 确保在获取设置之后再执行扫描和观察
    this.scanDocument();
    this.mutObserve(); // 开始观察DOM变化
    this.walked = true;
    console.log("文档扫描完成，高亮系统初始化成功");

    // 正常单词高亮完成后，启动词组高亮系统
    this.initCustomHighlightAfterNormalHighlight();
  }

  // 扫描文档
  scanDocument() {
    console.log("扫描文档中的文本节点...");

    const scope = this.tree.scope;
    // 修改扫描起点为整个document，而不只是body
    const documentRoot = document.documentElement || document;

    if (!documentRoot) {
      console.error("无法找到文档根元素");
      return;
    }

    // 清空全局单词详情数组
    wordDetails = [];

    // 使用TreeWalker遍历所有文本节点
    const treeWalker = document.createTreeWalker(documentRoot, NodeFilter.SHOW_TEXT);
    let currentNode = treeWalker.nextNode();

    // 收集所有文本节点
    const allTextNodes = [];
    while (currentNode) {
      const parent = currentNode.parentNode;
      // 跳过隐藏元素
      if (parent && getComputedStyle(parent).display !== 'none') {
        allTextNodes.push(currentNode);
      }
      currentNode = treeWalker.nextNode();
    }

    // 优先处理可视区域的节点
    if (this.tree.prioritizeViewport) {
      this.processVisibleTextNodesFirst(allTextNodes);
    } else {
      this.processTextNodesInChunks(allTextNodes);
    }
  }

  // 新增方法：优先处理可视区域的节点
  processVisibleTextNodesFirst(allTextNodes) {
    const visibleNodes = [];
    const otherNodes = [];

    // Firefox兼容性：分类文本节点
    for (let i = 0; i < allTextNodes.length; i++) {
      const node = allTextNodes[i];
      if (this.isNodeInViewport(node)) {
        visibleNodes.push(node);
      } else {
        otherNodes.push(node);
      }
    }

    // 先处理可视节点
    this.processTextNodesInChunks(visibleNodes, () => {
      // 然后处理其余节点
      this.processTextNodesInChunks(otherNodes);
    });
  }

  // 判断节点是否在可视区域内
  isNodeInViewport(node) {
    const parent = node.parentNode;
    if (!parent) return false;

    const rect = parent.getBoundingClientRect();

    // rect.top >= 0 &&
    // rect.left >= 0 &&
    // rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    // rect.right <= (window.innerWidth || document.documentElement.clientWidth)

    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  // 分块处理文本节点
  async processTextNodesInChunks(nodes, callback) {
    if (!nodes || nodes.length === 0) {
      if (callback) callback();
      return;
    }

    // 第一步：提取所有可能的单词
    const extractStartTime = performance.now();
    const wordsToQuery = new Set();

    for (let i = 0; i < nodes.length; i++) {
      const textNode = nodes[i];
      if (!textNode || !textNode.textContent) continue;

      const text = textNode.textContent.replace(/\u00AD/g, '');

      // 判断文本类型并使用对应的分词方式
      if (this.isJapaneseText(text)) {
        // 日语文本处理
        if (orion_isIOS) {
          // iOS设备使用Intl.Segmenter
          const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
          const segments = segmenter.segment(text);
          for (const segment of segments) {
            if (segment.isWordLike) {
              const word = segment.segment;
              if (word.length >= 1 && !this.isNonLanguageSymbol(word)) {
                wordsToQuery.add(word);
              }
            }
          }
        } else if (this.useKuromojiTokenizer && JapaneseTokenizer) {
          // 用户选择使用kuromoji且已初始化
          try {
            const tokens = JapaneseTokenizer.tokenize(text);
            for (const token of tokens) {
              const word = token.surface_form;
              if (word.length >= 1 && !this.isNonLanguageSymbol(word)) {
                wordsToQuery.add(word);
              }
            }
          } catch (error) {
            console.error("日语分词失败，降级使用Intl.Segmenter:", error);
            // 降级使用Intl.Segmenter
            const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
            const segments = segmenter.segment(text);
            for (const segment of segments) {
              if (segment.isWordLike) {
                const word = segment.segment;
                if (word.length >= 1 && !this.isNonLanguageSymbol(word)) {
                  wordsToQuery.add(word);
                }
              }
            }
          }
        } else {
          // 默认使用Intl.Segmenter
          const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
          const segments = segmenter.segment(text);
          for (const segment of segments) {
            if (segment.isWordLike) {
              const word = segment.segment;
              if (word.length >= 1 && !this.isNonLanguageSymbol(word)) {
                wordsToQuery.add(word);
              }
            }
          }
        }
      } else if (this.isChinseText(text)) {
        // 中文文本使用Intl.Segmenter
        const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
        const segments = segmenter.segment(text);
        for (const segment of segments) {
          if (segment.isWordLike) {
            const word = segment.segment;
            if (word.length >= 1) {
              wordsToQuery.add(word);
            }
          }
        }
      } else if (this.isKoreanText(text)) {
        // 韩语文本使用Intl.Segmenter
        const segmenter = new Intl.Segmenter("ko", { granularity: "word" });
        const segments = segmenter.segment(text);
        for (const segment of segments) {
          if (segment.isWordLike) {
            const word = segment.segment;
            if (word.length >= 1) {
              wordsToQuery.add(word);
            }
          }
        }
      } else {
        // 西方文本使用Intl.Segmenter
        const segmenter = new Intl.Segmenter("en", { granularity: "word" });
        const segments = segmenter.segment(text);
        for (const segment of segments) {
          if (segment.isWordLike) {
            const word = segment.segment.toLowerCase();
            if (word.length >= 1 && !this.isNonLanguageSymbol(word)) {
              wordsToQuery.add(word);
            }
          }
        }
      }
    }

    const extractTime = performance.now() - extractStartTime;
    console.log(`提取了 ${wordsToQuery.size} 个待查询单词，耗时: ${extractTime.toFixed(2)} ms`);

    // 第二步：批量查询单词状态
    if (wordsToQuery.size > 0) {
      const queryStartTime = performance.now();
      const wordsArray = Array.from(wordsToQuery);

      try {
        const response = await sendMessageWithRetry({
          action: "batchGetWordStatus",
          words: wordsArray
        }, {
          maxRetries: 3,
          timeout: 5000,
          retryDelays: [100, 300, 500]
        });

        const statusMap = response?.statusMap || {};

        // 合并到缓存
        Object.assign(this.wordDetailsFromDB, statusMap);

        const queryTime = performance.now() - queryStartTime;
        console.log(`批量查询 ${wordsToQuery.size} 个单词，返回 ${Object.keys(statusMap).length} 个结果，耗时: ${queryTime.toFixed(2)} ms`);
      } catch (error) {
        console.error(`批量查询单词状态失败:`, error);
        // 即使失败也继续，使用空的statusMap
        const queryTime = performance.now() - queryStartTime;
        console.log(`批量查询 ${wordsToQuery.size} 个单词失败，耗时: ${queryTime.toFixed(2)} ms`);
      }
    }

    // 第三步：分批处理文本节点（现在可以直接使用缓存）
    let chunkSize = this.tree.chunkSize || 50;
    let chunkDelay = this.tree.chunkDelay || 20;

    let index = 0;

    // 使用RAF代替setTimeout
    const processChunk = () => {
      const start = index;
      const end = Math.min(index + chunkSize, nodes.length);

      const startTime = performance.now();
      for (let i = start; i < end; i++) {
        const textNode = nodes[i];
        const parent = textNode.parentNode;
        // 检查文本节点和父节点是否仍然有效
        if (textNode && parent && document.contains(textNode)) {
          this.processTextNode(textNode, parent);
        }
      }
      const processingTime = performance.now() - startTime;

      index = end;

      if (index < nodes.length) {
        // 根据处理时间动态调整延迟
        const adaptiveDelay = processingTime > 50 ? chunkDelay * 2 : chunkDelay;
        setTimeout(() => {
          window.requestAnimationFrame(processChunk);
        }, adaptiveDelay);
      } else if (callback) {
        callback();
      }
    };

    window.requestAnimationFrame(processChunk);
  }


  shouldHighlightText(text) {
    // 日语直接返回true
    if (this.isJapaneseText(text)) return true;

    // 原有中文/韩文检测逻辑
    return !/[\u4E00-\u9FFF\u3130-\u318F\uAC00-\uD7AF]/.test(text);
  }
  // 处理单个文本节点 - 优化版：使用缓存
  processTextNode(textNode, parent) {
    // 检查文本节点和父节点是否有效
    if (!textNode || !parent || !textNode.textContent) {
      return;
    }

    // 添加空白文本过滤
    if (!textNode.textContent.trim()) {
      return;
    }

    // 预处理文本，移除软连字符
    const text = textNode.textContent.replace(/\u00AD/g, '');

    // 检查缓存
    const cacheKey = text + '|' + this.getCurrentLanguageSettings();
    let cachedResult = this.textCache.get(cacheKey);

    if (cachedResult) {
      // 使用缓存结果直接创建高亮
      this.applyHighlightFromCache(textNode, parent, cachedResult);
      return;
    }




    // 检查父元素是否在忽略列表中
// 检查父元素是否在忽略列表中
if (window.location.hostname.includes('youtube.com')) {
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

    // 如果不是允许的元素，直接忽略
    if (!isAllowedElement) {
      // console.log("不是允许的元素类或ID，直接忽略");
      return;
    }
  }


    // console.log("终于进到动态更新的parent是：",parent);
    if (parent && typeof parent.matches === 'function') {
      for (const selector of ScopeObserver.IGNORED_SELECTORS) {
        if (parent.matches(selector) || parent.closest(selector)) {
          return; // 跳过此节点处理
        }
      }
    }

    // 检查是否在小窗口内，如果是则跳过
    if (parent && (parent.closest('.vocab-tooltip') || parent.closest('.analysis-window') || parent.closest('.custom-word-tooltip') || parent.closest('.custom-word-selection-popup') || parent.closest('.custom-word-query-button'))) {
      return;
    }

    // 如果已经有缓存结果，直接处理
    if (cachedResult) {
      this.applyHighlightFromCache(textNode, parent, cachedResult);
      return;
    }

    // 没有缓存，进行正常的分词处理
    // 根据语言选择分词方式，并使用 this. 访问成员变量


    if (this.isJapaneseText(text)) { // 使用 this.
      // console.log(" 这是日语文本" , text)
      if (this.highlightJapaneseEnabled) {
        // 检查是否为短汉字文本（≤4字符的纯汉字）
        const isShortKanji = /^[\u4E00-\u9FFF]+$/.test(text) && text.length <= 4;

        // 短汉字文本统一使用 Intl.Segmenter 分词
        if (isShortKanji) {
          this.processIntlSegmenterText(textNode, parent, text);
        }
        // 根据iOS设备判断使用不同的分词方法
        else if (orion_isIOS) {
          console.log(orion_isIOS," 这是iOS设备,使用Intl.Segmenter进行日语分词" );
          // iOS设备使用Intl.Segmenter进行日语分词
          this.processIntlSegmenterText(textNode, parent, text);
        } else if (this.useKuromojiTokenizer) {
          // 用户选择使用kuromoji分词
          this.processJapaneseText(textNode, parent, text);
        } else {
          // 默认使用Intl.Segmenter
          this.processIntlSegmenterText(textNode, parent, text);
        }
      } else {
        return;
      }
    } else
    if (this.isChinseText(text)) { // 使用 this.
      // console.log(" 这是中文文本" , text);
      if (this.highlightChineseEnabled) {


        this.processIntlSegmenterText(textNode, parent, text);
      } else {
        // 检查文本中是否包含拉丁字母（a-z, A-Z）
        if (/[a-zA-Z]/.test(text)) {
          // 如果包含拉丁字母，使用西方文本处理方法
          this.processWesternText(textNode, parent, text);
        }
        return;
      }
    } else
    if (this.isKoreanText(text)) { // 使用 this.
      // console.log(" 这是韩语文本" , text);
      if (this.highlightKoreanEnabled) {
        this.processIntlSegmenterText(textNode, parent, text);
      } else {
        return;
      }
    } else
    if (this.highlightAlphabeticEnabled) { // 使用 this.
      // 检查是否是纯字母或西方文本，避免处理混合文本
      // 可以添加更严格的检查，例如检查是否包含非 CJK 字符
      // console.log(" 这是西方文本" , text);
      this.processWesternText(textNode, parent, text);

    }
  }

  // 新增日语文本处理方法
  processJapaneseText(textNode, parent, text) {
    // 如果kuromoji未初始化或初始化失败，降级使用Intl.Segmenter
    if (!JapaneseTokenizer) {
      console.log("kuromoji未初始化，降级使用Intl.Segmenter");
      this.processIntlSegmenterText(textNode, parent, text);
      return;
    }

    try {
      const tokens = JapaneseTokenizer.tokenize(text);
      const ranges = [];
      const darkModePrefix = this.isDarkMode ? "dark-" : "";
      // console.log("tokens",tokens);
      tokens.forEach(token => {
        // 忽略助词、符号等非实义词
        // if (['助詞', '助動詞', '記号'].includes(token.pos)) {
        //     return;
        // }
        // 忽略助词、符号等非实义词
        if (['記号'].includes(token.pos)) {
          return;
      }
        // 忽略纯数字、标点符号等非语言类符号
        const word = token.surface_form;
        if (this.isNonLanguageSymbol(word)) {
            return; // 跳过纯数字和纯标点符号
        }

        // console.log("token",token);

        const start = token.word_position - 1;
        const end = start + token.surface_form.length;
        const wordLower = word.toLowerCase();

        // 检查单词是否已知
        const isKnown = this.isWordKnown(wordLower);

        // 创建实际Range
        const range = new Range();
        range.setStart(textNode, start);
        range.setEnd(textNode, end);

        // 添加到全局wordDetails和wordRangesMap
        let detail = {
          range: range,
          word: word,
          wordLower: wordLower
        };

        // 将词汇添加到wordRangesMap（所有单词都添加，用于查词）
        if (wordRangesMap.has(wordLower)) {
          wordRangesMap.get(wordLower).push(detail);
        } else {
          wordRangesMap.set(wordLower, [detail]);
        }

        // 确定高亮组和是否需要高亮
        let group = darkModePrefix + "default";
        let shouldHighlight = true;

        // 检查数据库中是否有状态信息
        if (this.wordDetailsFromDB[wordLower]) {
          const status = this.wordDetailsFromDB[wordLower].status;
          if (status === "5") {
            group = darkModePrefix + "hidden";
            shouldHighlight = false; // 状态5的单词不高亮，但仍需要Range
          } else if (["1", "2", "3", "4"].includes(status)) {
            group = darkModePrefix + "state" + status;
          }
          // 状态0和其他状态都显示为默认蓝色高亮
        }

        // 创建原始范围数据
        const rawRange = {
          start: start,
          end: end,
          word: word,
          wordLower: wordLower,
          group: group,
          shouldHighlight: shouldHighlight // 添加是否需要高亮的标记
        };

        ranges.push(rawRange);
        // }
      });

      // 保存高亮范围
      if (ranges.length > 0) {
        let textMap = this.parent2Text2RawsAllUnknow.get(parent);
        if (!textMap) {
          textMap = new Map();
          this.parent2Text2RawsAllUnknow.set(parent, textMap);
        }
        textMap.set(textNode, ranges);

        // 注册交叉观察
        this.hlParentSecOb.observe(parent);

        // 缓存分词结果
        const languageSettings = this.getCurrentLanguageSettings();
        this.addToCache(text, languageSettings, ranges);
      }
    } catch (error) {
      console.error("日语分词失败:", error);
    }
  }

  processIntlSegmenterText(textNode, parent, text) {
    // console.log("textNode",textNode); // "Curiouser and curiouser"
    // console.log("parent",parent); // div class="analysis-window" <div class="analysis-window">
    // console.log("text",text); // text Curiouser and curiouser

    // 根据文本类型选择合适的语言设置
    let locale = "zh"; // 默认使用中文区域设置

    // 如果是日语文本，使用日语区域设置
    if (this.isJapaneseText(text)) {
      locale = "ja";
    }
    // 如果是韩语文本，使用韩语区域设置
    else if (this.isKoreanText(text)) {
      locale = "ko";
    }

    const segmenter = new Intl.Segmenter(locale, {
      granularity: "word"
    });
    const segments = segmenter.segment(text);
    // console.log("中文分词segments", text);


    const ranges = [];
    const darkModePrefix = this.isDarkMode ? "dark-" : "";

    for (const segment of segments) {
      // console.log("中文分词segments内容",segment);
      // 忽略空格和标点符号
      if (segment.isWordLike) {
        const word = segment.segment;
        const wordLower = word.toLowerCase();

        // 检查单词是否已知
        const isKnown = this.isWordKnown(wordLower);

        // 创建实际Range
        const range = new Range();
        range.setStart(textNode, segment.index);
        range.setEnd(textNode, segment.index + word.length);

        let detail = {
          range: range,
          word: word,
          wordLower: wordLower
        };

        // 将词汇添加到wordRangesMap
        if (wordRangesMap.has(wordLower)) {
          wordRangesMap.get(wordLower).push(detail);
        } else {
          wordRangesMap.set(wordLower, [detail]);
        }

        // 确定高亮组和是否需要高亮
        let group = darkModePrefix + "default";
        let shouldHighlight = true;

        // 检查数据库中是否有状态信息
        if (this.wordDetailsFromDB[wordLower]) {
          const status = this.wordDetailsFromDB[wordLower].status;
          if (status === "5") {
            group = darkModePrefix + "hidden";
            shouldHighlight = false; // 状态5的单词不高亮，但仍需要Range
          } else if (["1", "2", "3", "4"].includes(status)) {
            group = darkModePrefix + "state" + status;
          }
          // 状态0和其他状态都显示为默认蓝色高亮
        }

        // 创建原始范围数据
        const rawRange = {
          start: segment.index,
          end: segment.index + word.length,
          word: word,
          wordLower: wordLower,
          group: group,
          shouldHighlight: shouldHighlight // 添加是否需要高亮的标记
        };

        ranges.push(rawRange);
        // }
      }
    }

    // 保存高亮范围
    if (ranges.length > 0) {
      let textMap = this.parent2Text2RawsAllUnknow.get(parent);
      if (!textMap) {
        textMap = new Map();
        this.parent2Text2RawsAllUnknow.set(parent, textMap);
      }
      textMap.set(textNode, ranges);

      // 注册交叉观察
      this.hlParentSecOb.observe(parent);

      // 缓存分词结果
      const languageSettings = this.getCurrentLanguageSettings();
      this.addToCache(text, languageSettings, ranges);
    }
  }



  // 页面语言检测方法
  detectPageLanguage() {
    console.log("开始检测页面主要语言...");

    // 获取视口内的所有文本节点
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let japaneseCount = 0;
    let chineseCount = 0;

    // 创建 TreeWalker 遍历视口内的文本节点
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过脚本和样式标签
          const parent = node.parentElement;
          if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }

          // 检查节点是否在视口内
          const rect = parent.getBoundingClientRect();
          if (rect.top < viewportHeight && rect.bottom > 0 &&
              rect.left < viewportWidth && rect.right > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    // 遍历文本节点并统计
    let node;
    let sampleCount = 0;
    const maxSamples = 200; // 限制采样数量，提高性能

    while ((node = walker.nextNode()) && sampleCount < maxSamples) {
      const text = node.textContent.trim();
      if (text.length < 2) continue; // 跳过太短的文本

      // 检查是否包含片假名或平假名（日文特征）
      if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
        japaneseCount++;
      }
      // 检查是否只包含汉字（可能是中文）
      else if (/[\u4E00-\u9FFF]/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
        chineseCount++;
      }

      sampleCount++;
    }

    // 判断页面主要语言
    this.isJapaneseDominantPage = japaneseCount > chineseCount;

    console.log(`页面语言检测完成: 日文元素=${japaneseCount}, 中文元素=${chineseCount}, 判定为${this.isJapaneseDominantPage ? '日文' : '中文'}页面`);
  }

  // 修改日语文本检测方法，避免误识别中文
  isJapaneseText(text) {
    // 检测是否含有日语特有的平假名或片假名
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
      return true;
    }

    // 如果开启了智能识别且页面被判定为日文页面，纯汉字文本也视为日文
    if (this.autoDetectJapaneseKanji && this.isJapaneseDominantPage) {
      if (/^[\u4E00-\u9FFF]+$/.test(text)) {
        return true;
      }
    }

    return false;
  }



  // 检测文本是否为中文
  isChinseText(text) {
    // 检测是否含有中文汉字（排除日语特有的假名）
    return /[\u4E00-\u9FFF]+/.test(text) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(text);
  }

  // 检测文本是否为韩语
  isKoreanText(text) {
    // 检测是否含有韩语特有字符
    return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(text);
  }



  // kuoHaodelte(text,index,length){
  //   //删除单词开头或者末尾的() {} [] "" '' <> <> 「」『』【】《》〈〉""''（）等括号
  //   //分左右

  //   // 左侧符号的正则表达式
  //   const leftRegex = /^[（(\[{\['"<《〈「『【]/;
  //   // 右侧符号的正则表达式
  //   const rightRegex = /[)\]}\]'"">》〉」』】]$/;

  //   // 检查并处理左侧符号
  //   if (leftRegex.test(text)) {
  //       text = text.slice(1); // 移除左侧符号

  //       console.log("text左侧符号处理前位置： ", index);
  //       index += 1; // index 向右移动一位
  //       console.log("text左侧符号处理后位置： ", index);

  //       console.log("text左侧符号处理前长度： ", length);
  //       length -= 1; // 长度减一
  //       console.log("text左侧符号处理后长度： ", length);
  //   }

  //   // 检查并处理右侧符号
  //   if (rightRegex.test(text)) {
  //       // console.log("text右侧符号处理前位置： ", index);
  //       text = text.slice(0, -1); // 移除右侧符号
  //       // console.log("text右侧符号处理后位置： ", index);
  //       length -= 1; // 长度减一
  //       console.log("text右侧符号处理后长度： ", length);
  //   }

  //   return {text, index, length};
  //  }


  WesternTextFix(text, index, length) {
    // 如果输入的文本为空或无效，直接返回null
    if(!text){
      return null;
    }

    // 定义一个包含常见英文缩写的集合，用于判断输入文本是否是缩写
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
    ]);
//第一步，处理缩写
    // 检查输入的文本是否是常见缩写之一
    if(commonAbbreviations.has(text)){
      // 如果是缩写，通常不需要进一步处理，直接返回原始的文本、索引和长度

      return {text, index, length};
    }else{
  //第二步， 不是字母开头的，就不用处理了。
      // 如果不是缩写，则进行处理以去除首尾的非字母数字字符

      //获取第一个\w 字母和她的位置;
      //获取最后一个字母或者数字和位置
      //捕获中间的部分
      //更新index和length
      //返回处理后的text,index,length

      // 获取第一个字母和它的位置
      // 查找第一个Unicode字母字符 (\p{L}) 及其在文本中的索引
      const firstLetterMatch = text.match(/[\p{L}]/u);
      // 查找最后一个Unicode字母或数字字符 (\p{L}\d)，允许其后跟任意非字母数字字符 ([^\p{L}\d]*) 直到字符串末尾 ($)
      // 这用于定位最后一个核心字符的位置，并包含它本身
      const lastLetterMatch = text.match(/[\p{L}\d][^\p{L}\d]*$/u);

      // 如果找不到第一个字母或最后一个字母/数字（例如，文本只包含符号），则无法处理，返回原始值
      if (!firstLetterMatch || !lastLetterMatch) {
        return {text, index, length}; // 如果没有找到字母，返回原始值
      }



  //第三步 会有下面这些bug。应该在第三步里做一下细节处理。
  //不太行，处理不了。因为最开始的匹配是作为单个结果出来的，这里只能做矫正，不能再拆分了。
  //nicht.,,Wenn
  // Hecke.,,Ich
  // hatte.,,Irgendetwas
  // geraten.",,Warum?",„Ich
      // 获取第一个字母的索引
      const firstIndex = firstLetterMatch.index;
      // 获取最后一个匹配项（包含末尾非核心字符）在原文本中的起始索引
      const lastIndex = text.lastIndexOf(lastLetterMatch[0]);
      // 计算最后一个核心字母/数字字符在原文本中的结束索引（不包括末尾的非核心字符）
      // 通过移除匹配项中的非字母数字字符来得到核心字符的长度
      const lastLetterEndIndex = lastIndex + lastLetterMatch[0].replace(/[^\p{L}\d]/gu, '').length;

      // 如果第一个字母就在开头 (firstIndex === 0) 并且最后一个核心字符就在末尾 (lastLetterEndIndex === length)
      // 说明文本首尾没有需要去除的非字母数字字符，无需处理，返回原始值
      if (firstIndex === 0 && lastLetterEndIndex === length) {
        return {text, index, length};
      }

      // 提取从第一个字母到最后一个核心字符之间的子字符串作为新的文本
      const newText = text.substring(firstIndex, lastLetterEndIndex);
      // 计算新的起始索引：原索引加上第一个字母在原子串中的偏移量
      const newIndex = index + firstIndex;
      // 新的长度即为提取出的子字符串的长度
      const newLength = newText.length;

      // (可选) 打印修正前后的对比信息，用于调试
      // console.log(`文本修正: "${text}" → "${newText}" (位置: ${index} → ${newIndex}, 长度: ${length} → ${newLength})`);

      // 返回修正后的文本、新的起始索引和新的长度
      return {text: newText, index: newIndex, length: newLength};

      }
    }


  // 检查是否为纯数字、纯标点符号或数字与标点的组合（如版本号）
  isNonLanguageSymbol(word) {
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

  processWesternText(textNode, parent, text) {
    // console.log("textNode",textNode); // "Curiouser and curiouser"
    // console.log("parent",parent); // div class="analysis-window" <div class="analysis-window">
    // console.log("text",text); // text Curiouser and curiouser
    // console.log("processWesternText",text); // processWesternText Curiouser and curiouser

    // --- 修改开始: 使用 Intl.Segmenter 替换正则表达式 ---
    try {
      // 使用 Intl.Segmenter 进行更准确的、基于语言环境的单词分割。
      // 鉴于示例是德语，我们使用 "de" 区域设置。如果需要支持其他西文，可能需要动态选择或使用更通用的 "en"。
      const segmenter = new Intl.Segmenter("en", { granularity: "word" });
      const segments = segmenter.segment(text);

      const ranges = [];
      const darkModePrefix = this.isDarkMode ? "dark-" : "";

      // 遍历 segmenter 返回的所有文本片段
      for (const segment of segments) {
        // 只处理被识别为 "类单词 (word-like)" 的片段，这通常会排除纯标点符号
        if (segment.isWordLike) {
          let word = segment.segment;
          let index = segment.index;
          let length = word.length;

          // console.log(`Segmenter found word: "${word}" at index: ${index}`);

          // 注意：暂时移除了 this.WesternTextFix 的调用。
          // Intl.Segmenter 通常能更好地处理单词边界。
          // 如果后续发现 segmenter 仍包含不需要的前后标点，
          // 或需要特殊处理缩写（如 "z.B."），再考虑添加后处理步骤。
          // const result = this.WesternTextFix(word, index, length);
          // if (result) {
          //   word = result.text;
          //   index = result.index;
          //   length = result.length;
          // }

          // 检查是否为纯数字或纯标点符号，如果是则跳过
          if (this.isNonLanguageSymbol(word)) {
            continue; // 跳过纯数字和纯标点符号
          }

          // 如果word是中文，则忽略。即continue，这样由中文那边触发的西文高亮就会忽略中文的分词高亮。
          if (this.isChinseText(word)) {
            continue; // 跳过中文字符
          }
   
          const wordLower = word.toLowerCase(); // 将单词转换为小写

          // 检查这个 "单词" 是否包含中日韩字符，如果是则跳过 (虽然 segmenter 按 "de" 分割，以防万一)
          if (!this.shouldHighlightText(word)) {
            continue; // 跳过这个片段，处理下一个
          }

          // 检查单词是否已知（使用小写形式）
          const isKnown = this.isWordKnown(wordLower);

          // 创建实际Range
          const range = new Range();
          range.setStart(textNode, index); // 使用 segmenter 提供的索引
          range.setEnd(textNode, index + length); // 使用 segmenter 提供的单词长度

          // --- 后续逻辑基本不变 ---

          // 无论是否已知都添加到全局wordDetails（用于交互功能）
          // let shouldHighlight = true; // 这个变量似乎没被使用，可以考虑移除
          // if (this.wordDetailsFromDB[wordLower]) { // 使用小写形式检查数据库
          //   const status = this.wordDetailsFromDB[wordLower].status;
          //   if (status === "0" || status === "5") {
          //     shouldHighlight = false;
          //   }
          // }

          // 创建 detail 对象，保存 range、原始单词以及小写单词
          let detail = {
            range: range,
            word: word, // 使用 segmenter 分割出的单词
            wordLower: wordLower // 添加小写形式以便后续查询
          };

          // 添加到 wordRangesMap 集合中，存储 detail 对象
          if (wordRangesMap.has(wordLower)) {
            wordRangesMap.get(wordLower).push(detail);
          } else {
            wordRangesMap.set(wordLower, [detail]);
          }

          // 确定高亮组和是否需要高亮
          let group = darkModePrefix + "default";
          let shouldHighlight = true;

          // 如果数据库中已有该单词详情，则根据状态确定高亮颜色
          if (this.wordDetailsFromDB[wordLower]) { // 使用小写形式检查数据库
            const status = this.wordDetailsFromDB[wordLower].status;
            if (status === "5") {
              group = darkModePrefix + "hidden"; // 状态5标记为已知，不高亮
              shouldHighlight = false; // 状态5的单词不高亮，但仍需要Range
            } else if (["1", "2", "3", "4"].includes(status)) {
              group = darkModePrefix + "state" + status; // 使用对应状态的颜色
            }
            // 状态0和其他状态都显示为默认蓝色高亮
          }

          // 创建原始范围数据 (用于存储和后续重新应用高亮)
          const rawRange = {
            start: index,
            end: index + length,
            word: word,
            wordLower: wordLower,
            group: group,
            shouldHighlight: shouldHighlight // 添加是否需要高亮的标记
          };

          // 只有当单词不是已知（状态不为0或5）时，才需要实际添加到高亮列表
          // （或者说，所有单词都记录rawRange，但在应用高亮时根据group决定是否显示）
          // 当前逻辑是所有isWordLike的都加入ranges，然后在handleIntersecting或reapplyHighlights里根据isWordKnown过滤
          // 为了保持一致性，我们继续将所有isWordLike的rawRange加入
           ranges.push(rawRange);

          // if (!isKnown) { // 这个 if 块似乎是空的，可以移除
          // }
        }
      }

      // 如果找到了需要高亮的范围，保存到Map中
      if (ranges.length > 0) {
        let textMap = this.parent2Text2RawsAllUnknow.get(parent);
        if (!textMap) {
          textMap = new Map();
          this.parent2Text2RawsAllUnknow.set(parent, textMap);
        }
        textMap.set(textNode, ranges);
        this.hlParentSecOb.observe(parent);

        // 缓存分词结果
        const languageSettings = this.getCurrentLanguageSettings();
        this.addToCache(text, languageSettings, ranges);
      }
      // --- 修改结束 ---

    } catch (error) {
      console.error('Error using Intl.Segmenter for western text, potentially unsupported locale or other issue:', error);
      // 这里可以添加一个回退机制，比如调用旧的使用正则表达式的方法
      // console.log("Falling back to regex-based western text processing for:", text);
      // processWesternTextRegexFallback(textNode, parent, text); // 假设有这样一个函数
    }
  }
  // 处理元素进入和离开视口
  handleIntersecting() {
    const removeSet = new Set();
    const addSet = new Set();

    return (remove, add) => {
      // 处理离开视口的元素
      if (remove) {
        if (addSet.has(remove)) {
          addSet.delete(remove);
        } else {
          removeSet.add(remove);
        }
      }

      // 处理进入视口的元素
      if (add) {
        if (removeSet.has(add)) {
          removeSet.delete(add);
        } else {
          addSet.add(add);
        }
      }

      // Firefox兼容性：移除离开视口元素的高亮
      const removeParents = Array.from(removeSet);
      for (let i = 0; i < removeParents.length; i++) {
        const parent = removeParents[i];
        // console.log("离开视口的parent",parent);
        const textMap = this.parent2Text2RangesView.get(parent);
        if (textMap) {
          const textEntries = Array.from(textMap.values());
          for (let j = 0; j < textEntries.length; j++) {
            const ranges = textEntries[j];
            for (let k = 0; k < ranges.length; k++) {
              const range = ranges[k];
              const group = range.highlightGroup;
              if (group && CSS.highlights.has(group)) {
                const hl = CSS.highlights.get(group);
                // console.log("删除：range",range);
                hl.delete(range);
                if (hl.size === 0) {
                  // console.log("删除：group",group);
                  CSS.highlights.delete(group);
                }
              }
            }
          }
          this.parent2Text2RangesView.delete(parent);
        }
      }
      removeSet.clear();

      // Firefox兼容性：添加进入视口元素的高亮
      const addParents = Array.from(addSet);
      for (let i = 0; i < addParents.length; i++) {
        const parent = addParents[i];
        // console.log("进入视口的parent",parent);
        let rebuild = false;
        if (rebuild) {
          // 重新扫描当前视口







        } else {











          // 获取原始文本范围
          const rawTextMap = this.parent2Text2RawsAllUnknow.get(parent);
          if (!rawTextMap) return;

          // console.log("当前视口中的元素:", parent);
          // rawTextMap.forEach((rawRanges, textNode) => {
          //   console.log("视口中的单词:", rawRanges.map(raw => raw.word));
          // });

          let textMap = this.parent2Text2RangesView.get(parent);
          if (!textMap) {
            textMap = new Map();
            this.parent2Text2RangesView.set(parent, textMap);
          }

          const darkModePrefix = this.isDarkMode ? "dark-" : "";


          // const rawTextMap  = this.parent2Text2RangesView.get(parent);

          // Firefox兼容性：处理rawTextMap
          const rawTextEntries = Array.from(rawTextMap.entries());
          for (let j = 0; j < rawTextEntries.length; j++) {
            const [textNode, rawRanges] = rawTextEntries[j];
            
            // 检查 textNode 是否仍在文档中
            if (!document.contains(textNode)) {
              rawTextMap.delete(textNode);
              continue;
            }

            // 创建实际 Range 对象进行高亮
            const ranges = [];

            // Firefox兼容性：处理rawRanges
            for (let k = 0; k < rawRanges.length; k++) {
              const raw = rawRanges[k];
              // console.log("raw新单词：",raw);
              // 检查该单词是否需要高亮（状态可能更新）
              // 跳过你马勒戈壁，艾玛真香
              if (this.isWordKnown(raw.wordLower)) continue;
              // console.log("raw新单词需要高亮：",raw);
              // 可能需要更新高亮组
              let group = darkModePrefix + "default";
              if (this.wordDetailsFromDB[raw.wordLower]) {
                const status = this.wordDetailsFromDB[raw.wordLower].status;
                // console.log("raw新单词状态：",status);
                //好像用不到LOL
                if (status === "5") { // 只有状态5才隐藏
                  console.log("状态5单词不高亮：", status);
                  group = darkModePrefix + "hidden";
                }
                if (["1", "2", "3", "4"].includes(status)) {
                  // console.log("单词有状态：", status);
                  group = darkModePrefix + "state" + status;
                }
                // 状态0和其他状态都显示为默认蓝色高亮
              }

              // 创建 Range
              const range = new Range();
              range.setStart(textNode, raw.start);
              range.setEnd(textNode, raw.end);
              range.highlightGroup = group;

              // 添加到当前组的高亮
              if (!CSS.highlights.has(group)) {
                CSS.highlights.set(group, new Highlight());
              }
              const hl = CSS.highlights.get(group);
              hl.add(range);

              // 保存 Range 以便后续管理
              ranges.push(range);
            }

            if (ranges.length > 0) {
              textMap.set(textNode, ranges);
            }
          }
        }
      }
      addSet.clear();
    };
  }

  // 创建文本父元素交叉观察器
  newTextParentSecOb() {
    return new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.handleIntersectingBound(null, entry.target);
        } else {
          this.handleIntersectingBound(entry.target, null);
        }
      }
    }, {
      threshold: 0
    });
    // }, { threshold: 0, rootMargin: "0px 0px 100px 100px" });

  }

  // 创建变更观察器 - 优化版：只处理新增的文本节点
  newMutOb() {
    const self = this;
    let throttleTimer = null;
    let pendingMutations = [];

    return new MutationObserver(mutations => {
      // 收集新增的文本节点，避免重复处理
      const newTextNodes = new Set();
      const removedNodes = new Set();

      for (const mutation of mutations) {
        // 检查目标元素是否应该被忽略
        if (this.isElementIgnored(mutation.target)) {
          continue;
        }

        // 处理删除的节点
        if (mutation.removedNodes.length > 0) {
          for (const node of mutation.removedNodes) {
            removedNodes.add(node);
          }
        }

        // 处理新增的节点
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              // 直接是文本节点
              if (node.textContent.trim()) {
                newTextNodes.add(node);
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // 元素节点，查找其中的文本节点
              const textNodes = this.getTextNodesFromElement(node);
              // Firefox兼容性：遍历文本节点
              for (let k = 0; k < textNodes.length; k++) {
                newTextNodes.add(textNodes[k]);
              }
            }
          }
        }

        // 处理文本内容变化
        if (mutation.type === 'characterData' && mutation.target.textContent.trim()) {
          newTextNodes.add(mutation.target);
        }
      }

      // 立即处理删除的节点（无需节流）
      if (removedNodes.size > 0) {
        this.handleRemovedNodes(removedNodes);
      }

      // 如果没有新文本节点，直接返回
      if (newTextNodes.size === 0) return;

      // 节流处理新增的文本节点
      pendingMutations.push(...newTextNodes);

      if (throttleTimer) return;

      throttleTimer = setTimeout(() => {
        if (pendingMutations.length === 0) {
          throttleTimer = null;
          return;
        }

        const nodesToProcess = [...pendingMutations];
        pendingMutations = [];

        // console.log(`增量处理 ${nodesToProcess.length} 个新文本节点`);

        // 增量处理新文本节点
        self.processNewTextNodes(nodesToProcess);

        throttleTimer = null;
      }, 100); // 减少节流延迟到100ms
    });
  }

  // 开始变更观察
  mutObserve() {
    // 修改观察目标为document.documentElement，确保能捕获到所有元素变化
    this.mutOb.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // 暂停变更观察
  pauseMutObservation() {
    this.mutPairFlag++;
    if (this.mutPairFlag === 1) {
      this.mutOb.disconnect();
    }
  }

  // 恢复变更观察
  resumeMutObservation() {
    this.mutPairFlag--;
    if (this.mutPairFlag === 0) {
      this.mutObserve();
    }
  }

  // 新增：从元素中获取所有文本节点
  getTextNodesFromElement(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 过滤掉空白文本节点和在忽略元素中的节点
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          if (this.isElementIgnored(node.parentNode)) return NodeFilter.FILTER_REJECT;
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

  // 新增：处理删除的节点
  handleRemovedNodes(removedNodes) {
    for (const node of removedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        // 清理文本节点的高亮
        this.cleanupTextNodeHighlight(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // 清理元素及其子节点的高亮
        this.cleanupElementHighlight(node);
      }
    }
  }

  // 新增：清理文本节点高亮
  cleanupTextNodeHighlight(textNode) {
    // Firefox兼容性：从所有存储结构中移除该文本节点
    const rawAllEntries = Array.from(this.parent2Text2RawsAllUnknow.entries());
    for (let i = 0; i < rawAllEntries.length; i++) {
      const [parent, textMap] = rawAllEntries[i];
      if (textMap.has(textNode)) {
        textMap.delete(textNode);
        if (textMap.size === 0) {
          this.parent2Text2RawsAllUnknow.delete(parent);
          this.hlParentSecOb.unobserve(parent);
        }
      }
    }

    const viewEntries = Array.from(this.parent2Text2RangesView.entries());
    for (let i = 0; i < viewEntries.length; i++) {
      const [parent, textMap] = viewEntries[i];
      if (textMap.has(textNode)) {
        // 清理CSS高亮
        const ranges = textMap.get(textNode);
        for (let j = 0; j < ranges.length; j++) {
          const range = ranges[j];
          const group = range.highlightGroup;
          if (group && CSS.highlights.has(group)) {
            CSS.highlights.get(group).delete(range);
          }
        }
        textMap.delete(textNode);
        if (textMap.size === 0) {
          this.parent2Text2RangesView.delete(parent);
        }
      }
    }
  }

  // 新增：清理元素高亮
  cleanupElementHighlight(element) {
    const elementsToClean = [];
    // Firefox兼容性：收集需要清理的元素
    const rawAllEntries = Array.from(this.parent2Text2RawsAllUnknow.entries());
    for (let i = 0; i < rawAllEntries.length; i++) {
      const [parent, textMap] = rawAllEntries[i];
      if (element.contains(parent)) {
        elementsToClean.push(parent);
      }
    }

    // Firefox兼容性：清理收集到的元素
    for (let i = 0; i < elementsToClean.length; i++) {
      const parent = elementsToClean[i];
      this.hlParentSecOb.unobserve(parent);
      this.parent2Text2RawsAllUnknow.delete(parent);

      const viewMap = this.parent2Text2RangesView.get(parent);
      if (viewMap) {
        const viewMapEntries = Array.from(viewMap.values());
        for (let j = 0; j < viewMapEntries.length; j++) {
          const ranges = viewMapEntries[j];
          for (let k = 0; k < ranges.length; k++) {
            const range = ranges[k];
            const group = range.highlightGroup;
            if (group && CSS.highlights.has(group)) {
              CSS.highlights.get(group).delete(range);
            }
          }
        }
        this.parent2Text2RangesView.delete(parent);
      }
    }
  }

  // 新增：增量处理新文本节点（支持按需加载）
  async processNewTextNodes(textNodes) {
    const startTime = performance.now();

    // 第一步：提取所有可能的单词
    const wordsToQuery = new Set();

    for (const textNode of textNodes) {
      if (!textNode || !textNode.textContent) continue;

      const text = textNode.textContent.replace(/\u00AD/g, '');

      // 判断文本类型并使用对应的分词方式
      if (this.isJapaneseText(text)) {
        // 日语文本处理
        if (orion_isIOS) {
          // iOS设备使用Intl.Segmenter
          const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
          const segments = segmenter.segment(text);
          for (const segment of segments) {
            if (segment.isWordLike) {
              const word = segment.segment;
              if (word.length >= 1 && !this.isNonLanguageSymbol(word) && !this.wordDetailsFromDB[word]) {
                wordsToQuery.add(word);
              }
            }
          }
        } else if (this.useKuromojiTokenizer && JapaneseTokenizer) {
          // 用户选择使用kuromoji且已初始化
          try {
            const tokens = JapaneseTokenizer.tokenize(text);
            for (const token of tokens) {
              const word = token.surface_form;
              if (word.length >= 1 && !this.isNonLanguageSymbol(word) && !this.wordDetailsFromDB[word]) {
                wordsToQuery.add(word);
              }
            }
          } catch (error) {
            console.error("日语分词失败，降级使用Intl.Segmenter:", error);
            // 降级使用Intl.Segmenter
            const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
            const segments = segmenter.segment(text);
            for (const segment of segments) {
              if (segment.isWordLike) {
                const word = segment.segment;
                if (word.length >= 1 && !this.isNonLanguageSymbol(word) && !this.wordDetailsFromDB[word]) {
                  wordsToQuery.add(word);
                }
              }
            }
          }
        } else {
          // 默认使用Intl.Segmenter
          const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
          const segments = segmenter.segment(text);
          for (const segment of segments) {
            if (segment.isWordLike) {
              const word = segment.segment;
              if (word.length >= 1 && !this.isNonLanguageSymbol(word) && !this.wordDetailsFromDB[word]) {
                wordsToQuery.add(word);
              }
            }
          }
        }
      } else if (this.isChinseText(text)) {
        // 中文文本使用Intl.Segmenter
        const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
        const segments = segmenter.segment(text);
        for (const segment of segments) {
          if (segment.isWordLike) {
            const word = segment.segment;
            if (word.length >= 1 && !this.wordDetailsFromDB[word]) {
              wordsToQuery.add(word);
            }
          }
        }
      } else if (this.isKoreanText(text)) {
        // 韩语文本使用Intl.Segmenter
        const segmenter = new Intl.Segmenter("ko", { granularity: "word" });
        const segments = segmenter.segment(text);
        for (const segment of segments) {
          if (segment.isWordLike) {
            const word = segment.segment;
            if (word.length >= 1 && !this.wordDetailsFromDB[word]) {
              wordsToQuery.add(word);
            }
          }
        }
      } else {
        // 西方文本使用Intl.Segmenter
        const segmenter = new Intl.Segmenter("en", { granularity: "word" });
        const segments = segmenter.segment(text);
        for (const segment of segments) {
          if (segment.isWordLike) {
            const word = segment.segment.toLowerCase();
            if (word.length >= 1 && !this.isNonLanguageSymbol(word) && !this.wordDetailsFromDB[word]) {
              wordsToQuery.add(word);
            }
          }
        }
      }
    }

    // 第二步：批量查询未缓存的单词
    if (wordsToQuery.size > 0) {
      const wordsArray = Array.from(wordsToQuery);

      try {
        const response = await sendMessageWithRetry({
          action: "batchGetWordStatus",
          words: wordsArray
        }, {
          maxRetries: 3,
          timeout: 5000,
          retryDelays: [100, 300, 500]
        });

        const statusMap = response?.statusMap || {};
        Object.assign(this.wordDetailsFromDB, statusMap);
      } catch (error) {
        console.error(`批量查询单词状态失败(processNewTextNodes):`, error);
        // 即使失败也继续
      }
    }

    // 第三步：处理文本节点
    for (const textNode of textNodes) {
      // 检查文本节点是否仍在DOM中
      if (!document.contains(textNode)) continue;

      const parent = textNode.parentNode;
      if (!parent) continue;

      // 直接处理单个文本节点，无需重新扫描整个文档
      this.processTextNode(textNode, parent);
    }

    const endTime = performance.now();
    // console.log(`增量处理完成，耗时: ${(endTime - startTime).toFixed(2)}ms`);
  }

  // 新增：获取当前语言设置（用于缓存key）
  getCurrentLanguageSettings() {
    return `${this.highlightChineseEnabled}-${this.highlightJapaneseEnabled}-${this.highlightKoreanEnabled}-${this.highlightAlphabeticEnabled}`;
  }

  // 新增：从缓存应用高亮
  applyHighlightFromCache(textNode, parent, cachedResult) {
    const ranges = [];
    const darkModePrefix = this.isDarkMode ? "dark-" : "";

    // Firefox兼容性：遍历缓存结果
    for (let i = 0; i < cachedResult.length; i++) {
      const item = cachedResult[i];
      // 总是重新计算group和shouldHighlight，因为单词状态可能已经更新
      let shouldHighlight = true;
      let group = darkModePrefix + "default";

      if (this.wordDetailsFromDB[item.wordLower]) {
        const status = this.wordDetailsFromDB[item.wordLower].status;
        if (status === "5") {
          group = darkModePrefix + "hidden";
          shouldHighlight = false; // 状态5的单词不高亮，但仍需要Range
        } else if (["1", "2", "3", "4"].includes(status)) {
          group = darkModePrefix + "state" + status;
        }
        // 状态0和其他状态都显示为默认蓝色高亮
      }

      // 创建Range（所有单词都创建，包括已知单词）
      const range = new Range();
      range.setStart(textNode, item.start);
      range.setEnd(textNode, item.end);
      range.highlightGroup = group;

      // 只有需要高亮的单词才添加到CSS高亮
      if (shouldHighlight) {
        if (!CSS.highlights.has(group)) {
          CSS.highlights.set(group, new Highlight());
        }
        const hl = CSS.highlights.get(group);
        hl.add(range);
      }

      ranges.push(range);

      // 添加到全局wordRangesMap（所有单词都添加，用于查词）
      const detail = {
        range: range,
        word: item.word,
        wordLower: item.wordLower
      };
      if (wordRangesMap.has(item.wordLower)) {
        wordRangesMap.get(item.wordLower).push(detail);
      } else {
        wordRangesMap.set(item.wordLower, [detail]);
      }
    }

    // 保存高亮范围
    if (ranges.length > 0) {
      let textMap = this.parent2Text2RawsAllUnknow.get(parent);
      if (!textMap) {
        textMap = new Map();
        this.parent2Text2RawsAllUnknow.set(parent, textMap);
      }
      textMap.set(textNode, cachedResult);

      // 新增元素总是添加到视图映射，确保updateWordHighlight能找到它们
      let viewTextMap = this.parent2Text2RangesView.get(parent);
      if (!viewTextMap) {
        viewTextMap = new Map();
        this.parent2Text2RangesView.set(parent, viewTextMap);
      }
      viewTextMap.set(textNode, ranges);

      // 注册交叉观察
      this.hlParentSecOb.observe(parent);
    }
  }

  // 新增：添加到缓存
  addToCache(text, languageSettings, result) {
    const cacheKey = text + '|' + languageSettings;

    // 如果缓存已满，删除最旧的条目
    if (this.textCache.size >= this.maxCacheSize) {
      const firstKey = this.textCache.keys().next().value;
      this.textCache.delete(firstKey);
    }

    this.textCache.set(cacheKey, result);
  }

  // 修改：更新包含指定单词的缓存条目状态，而不是删除
  updateCacheForWord(word, newStatus) {
    const wordLower = word.toLowerCase();
    const darkModePrefix = this.isDarkMode ? "dark-" : "";
    let updatedCount = 0;

    // 根据新状态确定新的高亮组
    let newGroup = darkModePrefix + "default";
    let newShouldHighlight = true;

    if (newStatus === "5") {
      newGroup = darkModePrefix + "hidden";
      newShouldHighlight = false;
    } else if (["1", "2", "3", "4"].includes(newStatus)) {
      newGroup = darkModePrefix + "state" + newStatus;
    }
    // 状态0和其他状态都显示为默认蓝色高亮

    // Firefox兼容性：遍历所有缓存条目，更新包含该单词的条目
    const cacheEntries = Array.from(this.textCache.entries());
    for (let i = 0; i < cacheEntries.length; i++) {
      const [cacheKey, cachedResult] = cacheEntries[i];
      let hasUpdates = false;

      // 更新缓存结果中包含该单词的项目
      for (let j = 0; j < cachedResult.length; j++) {
        const item = cachedResult[j];
        if (item.wordLower === wordLower || item.word.toLowerCase() === wordLower) {
          item.group = newGroup;
          item.shouldHighlight = newShouldHighlight;
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        updatedCount++;
        console.log(`更新包含单词 "${word}" 的缓存条目:`, cacheKey);
      }
    }

    console.log(`为单词 "${word}" 更新了 ${updatedCount} 个缓存条目`);
  }

  // 保留原方法作为备用（某些情况下可能仍需要清除缓存）
  clearCacheForWord(word) {
    const wordLower = word.toLowerCase();
    const keysToDelete = [];

    // Firefox兼容性：遍历所有缓存条目，找到包含该单词的条目
    const cacheEntries = Array.from(this.textCache.entries());
    for (let i = 0; i < cacheEntries.length; i++) {
      const [cacheKey, cachedResult] = cacheEntries[i];
      
      // 检查缓存结果中是否包含该单词
      let containsWord = false;
      for (let j = 0; j < cachedResult.length; j++) {
        const item = cachedResult[j];
        if (item.wordLower === wordLower || item.word.toLowerCase() === wordLower) {
          containsWord = true;
          break;
        }
      }

      if (containsWord) {
        keysToDelete.push(cacheKey);
      }
    }

    // Firefox兼容性：删除包含该单词的缓存条目
    for (let i = 0; i < keysToDelete.length; i++) {
      const key = keysToDelete[i];
      this.textCache.delete(key);
      console.log(`清除包含单词 "${word}" 的缓存条目:`, key);
    }

    console.log(`为单词 "${word}" 清除了 ${keysToDelete.length} 个缓存条目`);
  }



  // 新增方法：更新指定单词的高亮状态，并在必要时补充创建 Range（第二种方案）//parent可用
  updateWordHighlight(word, status,parent,shouldReGroup = false) {
    console.log(`更新单词 ${word} 的高亮状态为 ${status}`);

    // 更新包含该单词的缓存条目状态，而不是删除缓存
    this.updateCacheForWord(word, status);

    // 根据暗色模式设置前缀
    const darkModePrefix = this.isDarkMode ? "dark-" : "";
    let newGroup = "";

    // 根据状态确定新的高亮组
    if (status === "5") {
      newGroup = darkModePrefix + "hidden";
    } else if (["1", "2", "3", "4"].includes(status)) {
      newGroup = darkModePrefix + "state" + status;
    } else {
      newGroup = darkModePrefix + "default";
    }
    // 状态0和其他状态都显示为默认蓝色高亮




    //这里占据性能嘛也不知道。哎。。。
    // 新增：彻底清除所有CSS.highlights中包含该单词的Range，防止孤儿Range残留
    console.log(`开始彻底清除单词 "${word}" 的所有高亮Range`);
    const wordLower = word.toLowerCase();
    const allGroups = [
      darkModePrefix + "default",
      darkModePrefix + "state1",
      darkModePrefix + "state2",
      darkModePrefix + "state3",
      darkModePrefix + "state4",
      darkModePrefix + "hidden"
    ];

    // 遍历所有可能的高亮组，清除包含该单词的Range
    for (let i = 0; i < allGroups.length; i++) {
      const groupName = allGroups[i];
      if (CSS.highlights.has(groupName)) {
        const highlight = CSS.highlights.get(groupName);
        const rangesToDelete = [];

        // Firefox兼容性：将迭代器转换为数组来避免Xray包装问题
        let ranges;
        try {
          ranges = Array.from(highlight);
        } catch (e) {
          console.warn("无法迭代高亮组，跳过:", groupName, e);
          continue;
        }

        // 收集需要删除的Range
        for (let j = 0; j < ranges.length; j++) {
          const range = ranges[j];
          try {
            if (range.toString().toLowerCase() === wordLower) {
              rangesToDelete.push(range);
            }
          } catch (e) {
            // Range可能已经无效，直接删除
            rangesToDelete.push(range);
          }
        }

        // 删除收集到的Range
        for (let k = 0; k < rangesToDelete.length; k++) {
          const range = rangesToDelete[k];
          highlight.delete(range);
          console.log(`从组 ${groupName} 中删除了Range:`, range.toString());
        }

        // 如果组为空，删除整个组
        if (highlight.size === 0) {
          CSS.highlights.delete(groupName);
          console.log(`删除了空的高亮组: ${groupName}`);
        }
      }
    }

    // 标记是否在当前可见区域中找到对应的 Range
    // let foundMatch = false;

    // 第一部分：更新已存在于高亮视图（parent2Text2RangesView）中的 Range
    if (!shouldReGroup) {
    // Firefox兼容性：将Map迭代器转换为数组
    const viewEntries = Array.from(this.parent2Text2RangesView.entries());
    for (let i = 0; i < viewEntries.length; i++) {
      const [parent, textMap] = viewEntries[i];
      const textEntries = Array.from(textMap.entries());
      for (let j = 0; j < textEntries.length; j++) {
        const [textNode, ranges] = textEntries[j];
        // console.log("未知单词更新:textMap,找到当前需要高亮的文本", ranges, textNode);
        const updatedRanges = [];
        for (let k = 0; k < ranges.length; k++) {
          const range = ranges[k];
          const rangeText = range.toString();
          // 判断 Range 对应的单词（不区分大小写）是否匹配更新的单词
          if (rangeText.toLowerCase() === word.toLowerCase()) {
            console.log("判断其是否相等", range, rangeText);
            // foundMatch = true;
            // 移除旧高亮组的 Range（这里已经在上面彻底清除过了，但保留以确保一致性）
            const oldGroup = range.highlightGroup;
            if (oldGroup && CSS.highlights.has(oldGroup)) {
              const hl = CSS.highlights.get(oldGroup);
              hl.delete(range);
            }
            // 更新 Range 的高亮组
            range.highlightGroup = newGroup;
            // 状态不是"已知"（0 或 5）才添加新高亮
            if (status !== "0" && status !== "5") {
              if (!CSS.highlights.has(newGroup)) {
                CSS.highlights.set(newGroup, new Highlight());
              }
              const hl = CSS.highlights.get(newGroup);
              hl.add(range);
            }
            updatedRanges.push(range);
          } else {
            updatedRanges.push(range);
          }
        }
        if (updatedRanges.length > 0) {
          textMap.set(textNode, updatedRanges);
        }
      }
    }
    }else{
      console.log(`已知单词更新: 重新应用当前视图中所有元素的高亮`);

      // Firefox兼容性：遍历parent2Text2RangesView中的所有parent
      const parentViewEntries = Array.from(this.parent2Text2RangesView.entries());
      for (let i = 0; i < parentViewEntries.length; i++) {
        const [parentElement, viewTextMap] = parentViewEntries[i];
        
        // 先清除此parent下的所有高亮
        const viewTextEntries = Array.from(viewTextMap.entries());
        for (let j = 0; j < viewTextEntries.length; j++) {
          const [textNode, ranges] = viewTextEntries[j];
          for (let k = 0; k < ranges.length; k++) {
            const range = ranges[k];
            const oldGroup = range.highlightGroup;
            if (oldGroup && CSS.highlights.has(oldGroup)) {
              const hl = CSS.highlights.get(oldGroup);
              hl.delete(range);
            }
          }
        }

        // 清空当前视图映射
        viewTextMap.clear();

        // 获取此parent对应的原始数据
        const rawTextMap = this.parent2Text2RawsAllUnknow.get(parentElement);
        if (!rawTextMap) {
          console.log("未找到parent对应的原始数据，跳过处理", parentElement);
          continue;
        }

        // console.log("正在重新应用parent的高亮:", parentElement);

        // Firefox兼容性：重新应用该parent的所有高亮
        const rawTextEntries = Array.from(rawTextMap.entries());
        for (let j = 0; j < rawTextEntries.length; j++) {
          const [textNode, rawRanges] = rawTextEntries[j];
          
          // 检查textNode是否仍在文档中
          if (!document.contains(textNode)) {
            rawTextMap.delete(textNode);
            continue;
          }

          // 创建实际Range对象进行高亮
          const ranges = [];

          for (let k = 0; k < rawRanges.length; k++) {
            const raw = rawRanges[k];
            // 检查该单词是否需要高亮
            if (this.isWordKnown(raw.wordLower)) continue;

            // 确定高亮组
            let group = darkModePrefix + "default";
            if (this.wordDetailsFromDB[raw.wordLower]) {
              const wordStatus = this.wordDetailsFromDB[raw.wordLower].status;
              if (wordStatus === "5") {
                group = darkModePrefix + "hidden";
              } else if (["1", "2", "3", "4"].includes(wordStatus)) {
                group = darkModePrefix + "state" + wordStatus;
              }
              // 状态0和其他状态都显示为默认蓝色高亮
            }

            // 创建Range
            const range = new Range();
            range.setStart(textNode, raw.start);
            range.setEnd(textNode, raw.end);
            range.highlightGroup = group;

            // 添加到当前组的高亮
            if (!CSS.highlights.has(group)) {
              CSS.highlights.set(group, new Highlight());
            }
            const hl = CSS.highlights.get(group);
            hl.add(range);

            // 保存Range以便后续管理
            ranges.push(range);
          }

          if (ranges.length > 0) {
            viewTextMap.set(textNode, ranges);
          }
        }
      }
    }
    // console.log(`更新完成，${word} 是否成功刷新高亮：`, foundMatch);
  }

  // 检查单词是否已知（只有状态5才算已知）
  isWordKnown(word) {
    if (!word) return false;
    const lower = word.toLowerCase();
    const details = this.wordDetailsFromDB[lower];
    if (details) {
      return details.status === "5";
    }
    return false;
  }

  setDarkMode(isDark) {
    this.isDarkMode = isDark;
    console.log("高亮暗色模式已设置为:", isDark);
  }

  // 在正常单词高亮完成后同步启动单词爆炸和词组高亮系统
  initCustomHighlightAfterNormalHighlight() {
    console.log("正常单词高亮已完成，现在同步启动：单词爆炸 + 词组高亮");

    // 同时初始化单词爆炸和词组高亮功能
    this.initWordExplosionAfterNormalHighlight();
    this.initCustomHighlightSystem();
  }

  // 在正常单词高亮完成后启动单词爆炸功能
  initWordExplosionAfterNormalHighlight() {
    console.log("正常单词高亮已完成，现在启动单词爆炸系统");

    // 检查单词爆炸函数是否存在
    if (typeof window.initWordExplosionSystem === 'function') {
      // 使用短延迟确保正常高亮完全完成
      setTimeout(() => {
        console.log("调用单词爆炸初始化函数");
        window.initWordExplosionSystem();
      }, 1);
    } else {
      console.log("单词爆炸函数尚未加载，延迟重试");
      // 如果函数还没加载，延迟重试
      setTimeout(() => {
        this.initWordExplosionAfterNormalHighlight();
      }, 500);
    }
  }

  // 启动词组高亮系统
  initCustomHighlightSystem() {
    console.log("正常单词高亮已完成，现在启动词组高亮系统");

    // 检查词组高亮函数是否存在
    if (typeof window.initCustomHighlight === 'function') {
      // 使用短延迟确保正常高亮完全完成
      setTimeout(() => {
        console.log("调用词组高亮初始化函数");
        window.initCustomHighlight();
      }, 1);
    } else {
      console.log("词组高亮函数尚未加载，延迟重试");
      // 如果函数还没加载，延迟重试
      setTimeout(() => {
        this.initCustomHighlightSystem();
      }, 500);
    }
  }

  // 新增方法：移除所有高亮
  removeAllHighlights() {
    console.log("移除所有高亮...");
    try {
      // 清除所有 CSS Highlights
      CSS.highlights.clear();

      // 清除视图中的高亮记录
      this.parent2Text2RangesView.clear();

      // 遍历所有已知的高亮组，确保它们被清除
      const darkModePrefix = this.isDarkMode ? "dark-" : "";
      const groups = [
        darkModePrefix + "default",
        darkModePrefix + "state1",
        darkModePrefix + "state2",
        darkModePrefix + "state3",
        darkModePrefix + "state4",
        darkModePrefix + "hidden"
      ];

      // Firefox兼容性：使用传统for循环
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (CSS.highlights.has(group)) {
          CSS.highlights.delete(group);
        }
      }

      console.log("所有高亮已移除");
    } catch (e) {
      console.error("移除高亮时出错:", e);
    }
  }

  // 添加 isInViewport 方法
  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  // 新增方法：初始化暗色模式检测
  async initDarkModeDetection() {
    if (window.self == window.top) {
      console.log("主窗口的暗色模式检测");

      // 等待主题列表检查完成
      const themeMode = await checkSiteInThemeLists();
      console.log("checkSiteInThemeLists() 异步结果:", themeMode);

      if (themeMode == 2) {
        this.isDarkMode = true;
        console.log("themeMode2 黑色白名单", true);
        globalDarkMode = true;
      } else if (themeMode == 1) {
        this.isDarkMode = false;
        console.log("themeMode1 白色白名单", false);
        globalDarkMode = false;
      } else {
        // 自动检测暗色模式
        const isDarkModeValue = isDarkMode();
        this.isDarkMode = isDarkModeValue;
        console.log("themeMode3 自动isDarkMode，获取的值：", isDarkModeValue);
        globalDarkMode = isDarkModeValue;
      }

      console.log("黑色模式检测结束，最终值：", this.isDarkMode);
    } else {
      console.log("iframe中的暗色模式检测");

      // iframe 也进行独立检测，不依赖父窗口
      const themeMode = await checkSiteInThemeLists();
      if (themeMode == 2) {
        this.isDarkMode = true;
      } else if (themeMode == 1) {
        this.isDarkMode = false;
      } else {
        this.isDarkMode = isDarkMode();
      }
      console.log("iframe独立检测暗色模式:", this.isDarkMode);
    }

    console.log("this.isDarkMode: 最终高亮模式的值：", this.isDarkMode);
    return this.isDarkMode;
  }

  // 新增方法：设置暗色模式（供胶囊按钮和popup调用）
  setDarkMode(isDark) {
    console.log(`setDarkMode: 设置高亮模式为 ${isDark ? '暗色' : '亮色'}`);
    this.isDarkMode = isDark;
    globalDarkMode = isDark;
  }

  // 新增：检查元素是否应该被忽略
  isElementIgnored(element) {
    // 直接检查元素自身
    if (this.ignoredElements.has(element)) {
      return true;
    }

    // 检查所有父元素
    let parent = element.parentElement;
    while (parent) {
      if (this.ignoredElements.has(parent)) {
        return true;
      }
      parent = parent.parentElement;
    }

    return false;
  }





  // 新增日语分词器初始化方法
  //JapaneseTokenizer.tokenize("ある雨の降る日、心優しい青年ヒロシは、道端でずぶ濡れになって震えている一匹の白い猫を見つけました");

  async initializeJapaneseTokenizer() {
    // 如果已经在初始化中，返回现有的Promise
    if (this.kuromojiInitPromise) {
      console.log("kuromoji正在初始化中，等待完成...");
      return this.kuromojiInitPromise;
    }

    // 如果已经初始化完成，直接返回
    if (this.kuromojiInitialized) {
      console.log("kuromoji已经初始化完成");
      return Promise.resolve();
    }

    if (typeof kuromoji === 'undefined') {
      console.error("kuromoji未加载");
      this.kuromojiInitialized = false;
      return Promise.reject(new Error("kuromoji未加载"));
    }

    const dicPath = chrome.runtime.getURL('src/service/jp/dict/');
    const builder = kuromoji.builder({
      dicPath
    });

    console.log("开始初始化kuromoji，字典路径:", dicPath);

    // 创建初始化Promise并保存
    this.kuromojiInitPromise = new Promise((resolve, reject) => {
      builder.build((err, tokenizer) => {
        if (err) {
          console.error("kuromoji初始化失败:", err);
          this.kuromojiInitialized = false;
          this.kuromojiInitPromise = null;
          reject(err);
        } else {
          JapaneseTokenizer = tokenizer;
          this.kuromojiInitialized = true;
          console.log("kuromoji初始化成功");
          resolve();
        }
      });
    });

    return this.kuromojiInitPromise;
  }
}

let isIframe = true;

// 高亮函数，使用 ScopeObserver 系统
function highlightAllWords() {
  // 检查当前页面是否处于 iframe 中
  isIframe = (window.self !== window.top);
  console.log("当前页面是否处于iframe中：", isIframe);

  // 检查插件是否启用
  chrome.storage.local.get(['enablePlugin'], (result) => {
    // if (result.enablePlugin === false) {
    //     console.log("插件已禁用，清除所有高亮");
    //     if (highlightManager) {
    //         try {
    //             // 1. 断开所有观察器
    //             highlightManager.hlParentSecOb.disconnect();
    //             highlightManager.mutOb.disconnect();

    //             // 2. 清除所有CSS Highlights
    //             CSS.highlights.clear();

    //             // 3. 移除所有高亮范围
    //             highlightManager.removeAllHighlights();

    //             // 4. 清空所有数据结构
    //             highlightManager.parent2Text2RawsAllUnknow.clear();
    //             highlightManager.parent2Text2RangesView.clear();
    //             highlightManager.wordStatusCache.clear();

    //             // 5. 清空全局变量
    //             wordDetails = [];
    //             wordRangesMap.clear();
    //             knownWords = new Set();

    //             // 6. 重置所有回调和监听器
    //             highlightManager.handleIntersectingBound = null;

    //             // 7. 最后设置为 null
    //             highlightManager = null;

    //             console.log("成功清除所有高亮和相关资源");
    //         } catch (error) {
    //             console.error("清除高亮时发生错误:", error);
    //         }
    //     }
    //     return;
    // }

    // 继续原有的高亮逻辑
    if (highlightManager) {
      console.log("更新高亮管理器");
      chrome.runtime.sendMessage({
        action: "getAllWordStatusMap"
      }, (response) => {
        let wordDetailsFromDB = response.statusMap || {};

        // Firefox兼容性：处理单词详情数据格式
        if (Array.isArray(wordDetailsFromDB)) {
          const temp = {};
          for (let i = 0; i < wordDetailsFromDB.length; i++) {
            const item = wordDetailsFromDB[i];
            temp[item.word.toLowerCase()] = item;
          }
          wordDetailsFromDB = temp;
        } else {
          // 如果返回的是对象，则将所有键转换为小写
          const temp = {};
          const keys = Object.keys(wordDetailsFromDB);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            temp[key.toLowerCase()] = wordDetailsFromDB[key];
          }
          wordDetailsFromDB = temp;
        }

        // 更新高亮管理器的单词详情
        highlightManager.setWordDetails(wordDetailsFromDB);
      });
    } else {
      console.log("初始化高亮管理器");
      highlightManager = new ScopeObserver({
        scope: document,
        chunkSize: 100,
        chunkDelay: 10,
        prioritizeViewport: !isIframe
      });
    }
  });
}




// 检查当前网站是否在高亮黑白名单中
function checkSiteInThemeLists() {
  return new Promise(resolve => { // 返回 Promise
    chrome.storage.local.get(['highlightDefaultDayWebsites', 'highlightDefaultNightWebsites'], function (result) {
      const currentUrl = window.location.href;
      const dayWebsites = (result.highlightDefaultDayWebsites || '').split(';').filter(Boolean);
      const nightWebsites = (result.highlightDefaultNightWebsites || '*lingkuma*;').split(';').filter(Boolean);
      let themeMode = 3; // 默认返回3，表示不在任何列表中

      // 检查是否匹配日间模式网站规则
      for (const pattern of dayWebsites) {
        console.log("检查是否匹配日间模式网站规则：", pattern);
        console.log("当前网站URL：", currentUrl);
        console.log("是否匹配：", urlMatchesPattern(currentUrl, pattern.trim()));
        if (urlMatchesPattern(currentUrl, pattern.trim())) {
          themeMode = 1; // 在白色模式列表中
          break;
        }
      }

      // 检查是否匹配夜间模式网站规则
      if (themeMode === 3) { // 如果不在白色列表中才检查黑色列表
        for (const pattern of nightWebsites) {
          console.log("检查是否匹配夜间模式网站规则：", pattern);
          console.log("当前网站URL：", currentUrl);
          console.log("是否匹配：", urlMatchesPattern(currentUrl, pattern.trim()));
          if (urlMatchesPattern(currentUrl, pattern.trim())) {
            themeMode = 2; // 在黑色模式列表中
            break;
          }
        }
      }
      // 这里可以根据themeMode的值进行后续处理
      // 1 = 白色模式, 2 = 黑色模式, 3 = 默认系统设置
      console.log("当前网站主题模式：", themeMode);
      resolve(themeMode); // 在回调函数中 resolve Promise，并返回 themeMode
    });
  });
}

// 辅助函数：判断URL是否匹配通配符模式
function urlMatchesPattern(url, pattern) {
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  return regex.test(url);
}

// 添加消息监听器处理主题切换
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "updateHighlightTheme") {
    if (highlightManager) {
      highlightManager.setDarkMode(request.isDark);
      highlightManager.reapplyHighlights();
    }
  }
});