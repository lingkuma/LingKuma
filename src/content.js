// =======================
// 新增：屏蔽所有错误信息，仅用于生产环境或测试时暂不需要调试信息
// window.onerror = function(message, source, lineno, colno, error) {
//   return true;  // 阻止错误显示
// };

// console.error = function() {};  // 禁用 console.error

// =======================
// 检测 extension context 是否有效
// =======================
function isContextValid() {
    try {
        return !!chrome.runtime?.id;
    } catch (error) {
        return false;
    }
}

// 监听 extension context 失效
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isContextValid()) {
        console.error("Extension context 已失效,content script 停止运行");
        return false;
    }
    return true;
});

// 全局错误处理器 - 捕获 Extension context invalidated 错误
window.addEventListener('error', function(event) {
    if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
        console.error("捕获到 Extension context invalidated 错误,停止执行");
        event.preventDefault();
        return true;
    }
});

// 全局 Promise 错误处理器
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message && event.reason.message.includes('Extension context invalidated')) {
        console.error("捕获到未处理的 Promise 错误: Extension context invalidated");
        event.preventDefault();
        return true;
    }
});

// =======================
// 新增辅助函数：标准化文本，替换所有空白符和软连字符为单个空格，并 trim
// =======================
function normalizeText(text) {
  if (!text) return "";
  // 替换软连字符为空字符串（因为它们通常不占空间）
  let normalized = text.replace(/\u00AD/g, '');
  // 替换所有空白字符（包括 \s 和 \u00A0 非断行空格）为单个普通空格
  normalized = normalized.replace(/[\s\u00A0]+/g, ' ');
  // 去除首尾空格
  return normalized.trim();
}

// =======================
// 检查元素是否为 YouTube 上允许处理的元素
// =======================
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
    'above-the-fold',
    'trancy-app'
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

      // 向上遍历到父元素
      currentElement = currentElement.parentElement;
    }
  }

  return isAllowedElement;
}

// =======================
// 新增辅助函数：根据单词所在 range 获取所在句子
// =======================
function getSentenceForWord(detail) {
  // 新增：检查 detail 和其必要属性是否有效
  if (!detail || !detail.range || !detail.range.startContainer) {
    // console.error("getSentenceForWord: 传入的 detail 或其 range/startContainer 无效。", detail);
    return ""; // 无效则直接返回空字符串
  }
  // console.log("=== [Debug] 开始获取句子 for word:", detail.word, "Container:", detail.range.startContainer, "Offset:", detail.range.startOffset);
  let container = detail.range.startContainer;
  let parent = container;

  // 向上查找合适的父元素 (逻辑不变)
  const MIN_TEXT_LENGTH = 10;
  while (parent && (parent.nodeType === Node.TEXT_NODE ||
         (parent.innerText && parent.innerText.trim().length < MIN_TEXT_LENGTH))) {
    parent = parent.parentElement;
  }
  if (!parent || parent.nodeType !== Node.ELEMENT_NODE) {
    parent = document.body;
  }
  // console.log("=== [Debug] 选定的 Parent Element:", parent);

  // --- 步骤 1: 使用 TreeWalker 构建原始 fullText (无清理) ---
  // 添加过滤器,只收集可见元素中的文本节点
  let rawFullTextBuilder = "";
  const isYouTube = window.location.hostname.includes('youtube.com');
  const walker = document.createTreeWalker(
    parent,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // 检查文本节点的父元素是否可见
        let element = node.parentElement;

        // YouTube 特定过滤:只允许字幕相关元素
        if (isYouTube) {
          if (!isAllowedYouTubeElement(element)) {
            return NodeFilter.FILTER_REJECT;
          }
        }

        // 检查元素是否隐藏
        while (element && element !== parent) {
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
  let currentNode;
  while (currentNode = walker.nextNode()) {
    rawFullTextBuilder += (currentNode.textContent || ""); // 获取原始文本
  }
  // console.log("=== [Debug] TreeWalker 构建的 rawFullText:", rawFullTextBuilder);

  // --- 步骤 2-5: 基于 Range 计算 Offset (在标准化和清理后) ---
  let offset = -1;
  let normalizedFullText = ""; // 将在下面计算

  try {
    const preRange = document.createRange();
    preRange.selectNodeContents(parent);
    preRange.setEnd(detail.range.startContainer, detail.range.startOffset);

    let rawRangeText = preRange.toString();
    // console.log("=== [Debug] Range.toString() 文本 (raw):", rawRangeText);

    // --- 标准化 Range 文本 ---
    let normalizedRangeText = normalizeText(rawRangeText);
    // console.log("=== [Debug] 标准化后的 Range 文本:", normalizedRangeText);

    // --- 清理标准化后的 Range 文本 (移除引用标记) ---
    let cleanedNormalizedRangeText = normalizedRangeText.replace(/\[\d+\]/g, '');
    // console.log("=== [Debug] 清理并标准化后的 Range 文本:", cleanedNormalizedRangeText);

    // --- 计算精确 offset ---
    offset = cleanedNormalizedRangeText.length;
    // console.log("=== [Debug] 标准化+清理后 Range 计算的 Offset:", offset);

  } catch (e) {
    console.error("使用 Range 计算 Offset 时出错:", e, "Parent:", parent, "Container:", detail.range.startContainer);
    return ""; // 出错则返回
  }

  if (offset === -1) {
      console.error("未能使用 Range 方法计算 Offset");
      return "";
  }
  // --- 结束 Range Offset 计算 ---

  // --- 步骤 6: 标准化并清理 fullText ---
  normalizedFullText = normalizeText(rawFullTextBuilder); // 标准化原始 fullText
  // console.log("=== [Debug] 标准化后的 fullText:", normalizedFullText);
  let cleanedNormalizedFullText = normalizedFullText.replace(/\[\d+\]/g, ''); // 移除引用标记
  // console.log("=== [Debug] 清理并标准化后的 fullText:", cleanedNormalizedFullText);


  // --- 步骤 7: 提取句子 (使用清理并标准化的 fullText 和精确的 offset) ---
  let leftText = cleanedNormalizedFullText.slice(0, offset);
  // console.log("=== [Debug] 用于查找开始标记的 leftText (来自标准化文本):", leftText);
  let sentenceStart = 0;
  let foundStartMarker = null;
  // 确保 startMarkers 使用标准空格
   const startMarkers = [
    '. ', '? ', '! ',
    '.] ', '?] ', '!] ',
    '." ', '?" ', '!" ',
    '。', '？', '！',
    '。」', '？」', '！」',
    '。』', '？』', '！』',
    '。］', '？］', '！］',
    '。）', '？）', '！）',')','）',
    '。\n', '？\n', '！\n', // 注意：\n 理论上已被 normalizeText 替换为空格
    '\n\n', // 注意：同上
    '^',
    '다. ', '까? ', '어! ',
    '；', '; ',
    '…… ', '... '
  ];


  let lastStartPos = -1;
  let foundMarkerLength = 0; // 新增：记录找到的标记的长度
  foundStartMarker = null; // 重置 foundStartMarker

  // 重新排序 startMarkers，将更长或带空格的放前面，增加仅标点的作为后备
  const orderedStartMarkers = [
    '. ', '? ', '! ', '.] ', '?] ', '!] ', '." ', '?" ', '!" ', '다. ', '까? ', '어! ', '; ', '…… ', '... ', // 长/带空格
    '.', '?', '!', '。', '？', '！', '。」', '？」', '！」', '。』', '？』', '！』', '。］', '？］', '！］', '。）', '？）', '！）', '；' ,// 短/无空格/CJK
    ')','）',
    '： ','：',
  ];

  // Find the last occurrence of any sentence-ending marker *before* the word
  for (const marker of orderedStartMarkers) { // 使用排序后的列表
      // 移除 normalizedMarker 逻辑，因为 cleanedNormalizedFullText 已处理
      const pos = leftText.lastIndexOf(marker); // 直接在 leftText 中查找

      if (pos > lastStartPos) { // 找到更靠后的标记
          lastStartPos = pos;
          foundMarkerLength = marker.length; // 记录这个标记的长度
          // sentenceStart is the position *after* the found marker
          // 使用标准化后的 marker 长度计算起始位置
          // sentenceStart = pos + normalizedMarker.length; // 旧逻辑，移动到后面统一处理
           // 记录找到的原始 marker
          foundStartMarker = marker; // 记录是哪个标记确定了最终位置
      }
      // 不需要 else if (pos === lastStartPos)，因为 orderedStartMarkers 中长的优先，
      // lastIndexOf 找到最后一个即可。
  }

 // If no marker was found in leftText, the sentence likely starts at the beginning of the text.
 // Or, the marker logic failed.
 if (lastStartPos === -1) {
     // 未找到标记，句子从文本开头算起
     sentenceStart = 0; // Set start to the beginning of the full text
     foundStartMarker = '^'; // Indicate it starts from the beginning
     // 跳过开头的空白字符
     while (sentenceStart < cleanedNormalizedFullText.length && /\s/.test(cleanedNormalizedFullText[sentenceStart])) {
        sentenceStart++;
     }
    //  console.log("=== [Debug] 未找到句首标记，将 sentenceStart 设为 (跳过空格后):", sentenceStart);
 } else {
    // 找到了标记，计算标记后的位置
    let tentativeStart = lastStartPos + foundMarkerLength;
    // 跳过标记后面可能存在的任何空白字符
    while (tentativeStart < cleanedNormalizedFullText.length && /\s/.test(cleanedNormalizedFullText[tentativeStart])) {
        tentativeStart++;
    }
    sentenceStart = tentativeStart; // 最终的句子起始位置

    // Log the found marker and calculated start position
    //  console.log("=== [Debug] 找到的句子开始标记:", foundStartMarker, "原始位置:", lastStartPos, "计算出的 sentenceStart (在标准化文本中，跳过空格后):", sentenceStart);
 }


  // 回退逻辑: 如果找不到标记，仍然基于 offset 回退 -- 这部分逻辑已被上面的 if (lastStartPos === -1) 覆盖，不再需要
  //  if (lastStartPos === -1) {
  //     // 标准化后，换行符查找可能失效，这里直接使用回退
  //     sentenceStart = Math.max(0, offset - 100);
  //     foundStartMarker = null; // 明确未找到标记
  //  }


  // console.log("=== [Debug] (最终确定) 计算出的 sentenceStart (在标准化文本中):", sentenceStart);

  // 向右查找句子结束位置 (在标准化文本上)
  let rightText = cleanedNormalizedFullText.slice(offset);
  // console.log("=== [Debug] 用于查找结束标记的 rightText (来自标准化文本):", rightText);
  let nextEnd = Infinity; // 在 rightText 中的索引
   // 确保 endMarkers 使用标准空格，并优化列表
  const endMarkers = [ // 同样，长/带空格的优先
    '. ', '? ', '! ',
    '。」', '！」', '？」', // CJK 带引号
    '。』', '！』', '？』',
    '。）', '！）', '？）',
    '.', '?', '!', // 无空格后备
    '。', '！', '？', // CJK 无引号
    // '\n\n' // 理论上已被 normalizeText 替换为空格
  ];
  let foundEndMarker = null;
  let foundEndMarkerLength = 0; // 新增：记录结束标记长度

  for (const marker of endMarkers) {
       // const normalizedMarker = marker.replace(/\n/g, ' '); // 移除，文本已标准化
       const pos = rightText.indexOf(marker); // 在标准化文本中查找
       if (pos !== -1 && pos < nextEnd) { // 找到更早结束的标记
           // nextEnd 计算的是在 rightText 中的偏移
           nextEnd = pos; // 记录标记开始的位置
           // nextEnd = pos + normalizedMarker.length; // 旧逻辑：记录标记结束的位置
           foundEndMarker = marker; // 记录原始 marker
           foundEndMarkerLength = marker.length; // 记录标记长度
       }
  }
  // console.log("=== [Debug] 找到的句子结束标记:", foundEndMarker, "在 rightText 中的起始位置:", nextEnd);

  // 优化句子长度处理逻辑 (基于标准化文本)
  const MAX_SENTENCE_LENGTH = 600; // 修改：从 300 提高到 600，支持更长的句子
  const MIN_SENTENCE_LENGTH = 30;

  let sentenceEnd;
  if (nextEnd === Infinity) {
    // 未找到结束标记，从句子实际开始处计算最大长度
    sentenceEnd = Math.min(sentenceStart + MAX_SENTENCE_LENGTH, cleanedNormalizedFullText.length);
    // console.log("=== [Debug] 未找到结束标记，使用 MAX_SENTENCE_LENGTH 限制，sentenceEnd:", sentenceEnd);
  } else {
    // 找到了标记，结束位置是 单词偏移量 + 标记在rightText的起始位置 + 标记长度
    sentenceEnd = offset + nextEnd + foundEndMarkerLength;
    // 确保不超过最大长度限制 (从句子实际开始处算)
    sentenceEnd = Math.min(sentenceEnd, sentenceStart + MAX_SENTENCE_LENGTH);
    // console.log("=== [Debug] 找到结束标记，计算出的 sentenceEnd (标记后，有长度限制):", sentenceEnd);
  }
  // 确保 sentenceEnd 不会小于 sentenceStart (非常边缘的情况)
  sentenceEnd = Math.max(sentenceStart, sentenceEnd);
  // console.log("=== [Debug] 计算出的 sentenceEnd (在标准化文本中的索引):", sentenceEnd);

  // 提取句子 (从标准化文本中提取)
  let sentence = cleanedNormalizedFullText.slice(sentenceStart, sentenceEnd).trim(); // trim 再次确保
  // console.log("=== [Debug] 初始提取的句子 (来自标准化文本):", sentence);

  // 判断是否需要扩展句子 (逻辑不变，但在标准化句子上操作)
  const needsExtension = () => {
    // 如果句子已经达到最大长度，不需要扩展
    if (sentence.length >= MAX_SENTENCE_LENGTH) return false;

    // 如果句子以标点符号结尾，不需要扩展
    if (/[。！？\.\!\?]$/.test(sentence)) return false;

    // 如果句子长度小于最小长度，需要扩展
    if (sentence.length < MIN_SENTENCE_LENGTH) return true;

    // 如果句子中包含未闭合的引号或括号，需要扩展
    const quotes = (sentence.match(/[「『（]/g) || []).length;
    const closeQuotes = (sentence.match(/[」』）]/g) || []).length;
    if (quotes > closeQuotes) return true;

    // 如果句子以逗号结尾，需要扩展
    if (sentence.endsWith('、')) return true;

    return false;
  };

  if (needsExtension() && sentenceEnd < cleanedNormalizedFullText.length) {
      // 扩展逻辑 (基于标准化文本)
      // console.log("=== [Debug] 句子需要扩展 (基于标准化文本)");
      const EXTENSION_LENGTH = 100;
      sentenceEnd = Math.min(sentenceEnd + EXTENSION_LENGTH, cleanedNormalizedFullText.length);
      sentence = cleanedNormalizedFullText.slice(sentenceStart, sentenceEnd).trim();
      // console.log("=== [Debug] 扩展后的句子 (初步, 来自标准化文本):", sentence);

       // 在扩展后的标准化句子中找结束点
      const endMatch = sentence.match(/[。！？\.\!\?][」』）]?/); // 正则不需要改，因为它匹配的是字符本身
      if (endMatch) {
          const endPos = sentence.indexOf(endMatch[0]) + endMatch[0].length;
          sentence = sentence.slice(0, endPos);
          // console.log("=== [Debug] 扩展后找到结束点，截取后的句子 (来自标准化文本):", sentence);
      }
  }

  // --- 最终清理步骤已在 normalizeText 中完成大半 ---
  // 移除多余的 replace(/\s+/g, ' ') 因为 normalizeText 已经处理了
  sentence = sentence
    // .replace(/\s+/g, ' ') // 已由 normalizeText 处理
    .replace(/["""]/g, '"')
    .replace(/['']/g, "'")
    .trim(); // 最终 trim

  // console.log("=== [Debug] 最终返回的句子:", sentence);
  return sentence;
}

// 辅助函数：判断元素是否为块级元素
function isBlockElement(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
  const display = window.getComputedStyle(element).display;
  return display === 'block' || display === 'flex' || display === 'grid';
}



// =======================
// 修改函数：显示扩展后的 tooltip 小窗，用于标记单词及其相关数据（标签、AI解析、翻译、例句、状态）
// =======================
// 新增：全局变量声明

// 修改处理单词分析的主函数
function handleWordAnalysis() {
  if (lastMouseEvent) {
    let hoveredDetail = null;
    let hoveredRect = null;

    const word = getWordAtPoint(lastMouseEvent.clientX, lastMouseEvent.clientY);
    console.log("用户触发后；word:  ", word);
    if (word) {
      console.log("鼠标所在单词为:", word);
      let wordRangesArrays   = wordRangesMap.get(word.toLowerCase());
      console.log("wordRangesArrays:  ", wordRangesArrays);
      for (const detail of wordRangesArrays) {
        console.log("detail:  ", detail);
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

      // 高亮句子
      try {
        highlightSentence(hoveredDetail, sentence);
      } catch (error) {
        console.error('高亮句子时发生错误:', error);
      }

      // 显示分析窗口
      try {
        console.log("显示分析窗口");
        showAnalysisWindow(hoveredDetail.word, sentence, hoveredRect);
      } catch (error) {
        console.error('显示分析窗口时发生错误:', error);
      }
    }
  }
}

// 修改显示分析窗口的逻辑，并适配黑夜模式
async function showAnalysisWindow(word, sentence, hoveredRect) {
  // 如果已有解析窗口，先移除
  if (analysisWindow) {
    analysisWindow.remove();
  }

  // 设置全局标志，表示句子解析弹窗正在显示
  window.isAnalysisWindowActive = true;

  // 创建解析窗口元素
  analysisWindow = document.createElement('div');
  analysisWindow.className = 'analysis-window';
  analysisWindow.setAttribute('data-extension-element', 'true');

  // 防止鼠标事件穿透
  ['mousemove', 'mouseenter', 'click'].forEach(eventName => {
    analysisWindow.addEventListener(eventName, e => e.stopPropagation());
  });

  analysisWindow.classList.add(isDarkMode() ? 'dark-mode' : 'light-mode');

  // 检查是否启用解析句子玻璃效果
  chrome.storage.local.get(['analysisGlassEnabled'], (result) => {
    const isGlassEnabled = result.analysisGlassEnabled !== undefined ? result.analysisGlassEnabled : true;
    if (isGlassEnabled && analysisWindow) {
      analysisWindow.classList.add('glass-effect');
    }
  });

  // 先添加到DOM以获取尺寸，但设置为不可见以防止闪烁
  analysisWindow.style.visibility = 'hidden';
  shadowRoot.appendChild(analysisWindow);

  // 设置窗口内容结构
  analysisWindow.innerHTML = `
    <div class="analysis-header">
      <span class="drag-handle">Sentence Analysis</span>
      <div class="header-buttons">
        <button class="analysis-glass-toggle-btn" title="切换玻璃效果">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 48 48">
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M42.199 23.504c-.203-.609-.576-1.705-1.621-2.436c-1.265-.877-2.942-.82-3.242-.812c-.616.024-.957.13-1.621 0c-.47-.098-1.24-.244-1.621-.812c-.324-.48-.122-.877 0-2.437c.097-1.226.138-1.843 0-2.436c-.3-1.283-1.208-2.079-1.621-2.436c-.851-.747-1.929-1.267-4.052-1.624c-1.475-.252-3.85-.487-7.295 0c-1.742.244-4.425.706-6.483 1.397a17.7 17.7 0 0 0-4.863 2.436c-.016.008-.033.016-.04.024c-2.789 1.82-4.37 5.035-4.231 8.373c.737 17.922 33.091 20.18 36.69 4.823c.073-.487.64-2.152 0-4.06m-16.85-4.775a2.24 2.24 0 0 1-2.237-2.241c0-1.243.997-2.242 2.237-2.242h2.196a2.238 2.238 0 0 1 1.58 3.825a2.23 2.23 0 0 1-1.58.658z"/>
            <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M8.159 21.068a2.434 2.434 0 0 0 2.43 2.437a2.434 2.434 0 0 0 2.432-2.434v-.003a2.434 2.434 0 0 0-2.43-2.438a2.434 2.434 0 0 0-2.432 2.435zm4.051 7.308a2.434 2.434 0 0 0 2.432 2.437a2.434 2.434 0 0 0 2.432-2.436v0a2.434 2.434 0 0 0-2.43-2.438a2.434 2.434 0 0 0-2.433 2.434zm8.106 2.437a2.434 2.434 0 0 0 2.429 2.438a2.434 2.434 0 0 0 2.434-2.434v-.005a2.434 2.434 0 0 0-2.432-2.436a2.434 2.434 0 0 0-2.431 2.436zM28.42 30a2.434 2.434 0 0 0 2.43 2.439a2.434 2.434 0 0 0 2.433-2.434V30a2.434 2.434 0 0 0-2.43-2.436A2.434 2.434 0 0 0 28.42 30"/>
          </svg>
        </button>
        <span class="close-btn">&times;</span>
      </div>
    </div>
    <div class="analysis-content">
      <div class="sentence-display">${sentence}</div>
      <div class="analysis-result">loading...</div>
    </div>
    <div class="analysis-input-container">
      <input type="text" class="analysis-input" placeholder="输入问题继续对话..." />
      <button class="analysis-send-btn">发送</button>
    </div>
  `;

  // 添加关闭按钮事件监听
  const closeBtn = analysisWindow.querySelector('.close-btn');
  closeBtn.addEventListener('click', () => {
    closeAnalysisWindowWithAnimation();
  });

  // 添加玻璃效果切换按钮事件监听
  const glassToggleBtn = analysisWindow.querySelector('.analysis-glass-toggle-btn');
  glassToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 切换玻璃效果状态
    chrome.storage.local.get(['analysisGlassEnabled'], (result) => {
      const currentState = result.analysisGlassEnabled !== undefined ? result.analysisGlassEnabled : true;
      const newState = !currentState;

      // 保存新状态
      chrome.storage.local.set({ analysisGlassEnabled: newState }, () => {
        console.log('解析句子玻璃效果状态已更新:', newState);

        // 立即应用或移除玻璃效果
        if (newState) {
          analysisWindow.classList.add('glass-effect');
        } else {
          analysisWindow.classList.remove('glass-effect');
        }

        // 更新按钮外观
        updateAnalysisGlassToggleButton(glassToggleBtn, newState);
      });
    });
  });

  // 初始化玻璃效果切换按钮外观
  chrome.storage.local.get(['analysisGlassEnabled'], (result) => {
    const isEnabled = result.analysisGlassEnabled !== undefined ? result.analysisGlassEnabled : true;
    updateAnalysisGlassToggleButton(glassToggleBtn, isEnabled);
  });

  // 添加点击窗口外关闭的事件处理函数
  const handleOutsideClick = (event) => {
    // 检查点击是否在分析窗口之外
    if (analysisWindow && !analysisWindow.contains(event.target)) {
      document.removeEventListener('click', handleOutsideClick); // 在开始动画前就移除监听
      closeAnalysisWindowWithAnimation(); // <-- 调用新函数
    }
  };

  // 添加全局点击事件监听
  document.addEventListener('click', handleOutsideClick);

  // 获取窗口尺寸和视口信息
  const windowRect = analysisWindow.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 设置最大高度为视口高度的70%
  const maxHeight = Math.floor(viewportHeight * 0.7);
  analysisWindow.style.maxHeight = `${maxHeight}px`;

  // === 添加缩放算法 ===
  // 获取用户设置的基准DPR值
  const baseDPR = await getStorageValue('devicePixelRatio') || window.devicePixelRatio || 1.0;
  // 获取当前浏览器的实际DPR
  const currentDPR = window.devicePixelRatio || 1;
  // 计算缩放比例：当前DPR / 基准DPR
  let zoomFactor = currentDPR / baseDPR;
  console.log(`分析窗口DPR计算: 基准DPR=${baseDPR}, 当前DPR=${currentDPR}, 缩放比例=${zoomFactor}`);

  // 获取屏幕宽度
  const screenWidth = document.documentElement.clientWidth;

  // 根据设备类型和屏幕特性处理缩放比例
  // 检查是否为移动设备
  const isMobile = /iPhone|iPad|iPod|Android|Orion|Samsung/i.test(navigator.userAgent);

  if (isMobile || screenWidth < 500) {
    // 移动设备保持原有逻辑，可以根据需要调整
  }

  // --- 重写定位逻辑 ---
  // 目标：计算窗口左上角的绝对坐标 (finalLeft, finalTop)

  // 初始候选位置：窗口左上角在单词下方
  let candidateLeft = hoveredRect.left;
  let candidateTop = hoveredRect.bottom;

  // 1. 水平位置调整 (基于视口)
  // 如果窗口按 candidateLeft 放置，其右边缘是否超出视口？
  if (candidateLeft + windowRect.width > viewportWidth) {
      // 尝试将窗口右边缘与视口右边缘对齐 (留 10px 边距)
      candidateLeft = viewportWidth - windowRect.width - 10;
      // 确保窗口不会移到视口左侧外部
      candidateLeft = Math.max(10, candidateLeft);
  }
  // 确保窗口不会移到视口左侧外部 (即使初始位置没超右边界)
  candidateLeft = Math.max(10, candidateLeft);

  // 2. 垂直位置调整 (基于视口)
  // 如果窗口按 candidateTop 放置，其下边缘是否超出视口？
  if (candidateTop + windowRect.height > viewportHeight) {
      // 尝试将窗口放在单词上方
      let topPositionAboveWord = hoveredRect.top - windowRect.height;

      // 检查上方是否有足够空间 (距离视口顶部至少 10px)
      if (topPositionAboveWord >= 10) {
          candidateTop = topPositionAboveWord;
      } else {
          // 如果上方空间不足，则将窗口固定在视口顶部 (留 10px 边距)
          candidateTop = 10;
          // 此时窗口可能需要滚动条
          analysisWindow.style.maxHeight = `${viewportHeight - 20}px`;
          analysisWindow.style.overflowY = 'auto';
      }
  }
  // 确保窗口不会移到视口顶部外部
  candidateTop = Math.max(10, candidateTop);

  // 计算最终绝对位置 (加上滚动偏移)
  const finalLeft = candidateLeft + window.scrollX;
  const finalTop = candidateTop + window.scrollY;

  // 应用计算后的位置
  analysisWindow.style.left = finalLeft + 'px';
  analysisWindow.style.top = finalTop + 'px';

  // === 应用缩放变换 ===
  // 添加CSS变换以抵消浏览器缩放
  analysisWindow.style.transform = `scale(${1/zoomFactor})`;
  // 设置变换原点为左上角，确保缩放时基于左上角
  analysisWindow.style.transformOrigin = "left top";

  // --- 修改：添加淡入动画 ---
  analysisWindow.style.visibility = 'visible'; // 先设为可见
  requestAnimationFrame(() => { // 确保在下一帧设置透明度
    analysisWindow.style.opacity = '1';
  });
  // --- 修改结束 ---

  // --- 滚轮和内容变化监听保持不变 ---

  // 添加滚轮事件监听，防止页面被滚动
  analysisWindow.addEventListener('wheel', (e) => {
    if (analysisWindow.contains(e.target)) {
      e.stopPropagation();
    }
  }, { capture: true });

  // 监听内容变化，向上调整窗口位置 (这部分逻辑可能需要微调，因为它基于旧的 top 计算)
  // TODO: 检查 MutationObserver 逻辑是否仍适用于绝对定位
  const contentObserver = new MutationObserver(() => {
    // 首先检查 analysisWindow 是否仍然存在
    if (!analysisWindow) {
      // 如果窗口已经不存在，断开观察器连接
      contentObserver.disconnect();
      activeContentObserver = null;
      return;
    }

    try {
      // 获取的是视口相对位置，但 top 是绝对位置，需要调整
      const currentWindowRect = analysisWindow.getBoundingClientRect();
      const currentAbsoluteTop = parseFloat(analysisWindow.style.top) || 0; // 获取当前的绝对 top
      const currentAbsoluteBottomEdge = currentAbsoluteTop + currentWindowRect.height;
      const viewportAbsoluteBottomEdge = window.scrollY + viewportHeight;

      // 如果内容增加导致窗口底部超出视口底部
      if (currentAbsoluteBottomEdge > viewportAbsoluteBottomEdge && currentAbsoluteTop > window.scrollY + 10) {
        // 向上调整窗口位置，但不超过视口顶部 (10px 边距)
        const newTop = Math.max(window.scrollY + 10, currentAbsoluteTop - (currentAbsoluteBottomEdge - viewportAbsoluteBottomEdge));
        analysisWindow.style.top = `${newTop}px`;
      }
    } catch (error) {
      // 如果访问属性时出错，可能是窗口已被移除但变量尚未设为null
      console.error('MutationObserver回调中访问analysisWindow属性时出错:', error);
      contentObserver.disconnect();
      activeContentObserver = null;
    }
  });

  // 保存当前活动的MutationObserver，以便在关闭窗口时断开连接
  activeContentObserver = contentObserver;

  // 监听内容变化
  contentObserver.observe(analysisWindow.querySelector('.analysis-content'), {
    childList: true,
    subtree: true,
    characterData: true
  });

  // 添加输入框和发送按钮的事件处理
  const inputContainer = analysisWindow.querySelector('.analysis-input-container');
  const inputField = analysisWindow.querySelector('.analysis-input');
  const sendBtn = analysisWindow.querySelector('.analysis-send-btn');

  // 保存对话历史
  let conversationHistory = [];
  let isProcessing = false;

  // 发送消息的函数
  const sendMessage = async () => {
    const userMessage = inputField.value.trim();
    if (!userMessage || isProcessing) return;

    isProcessing = true;
    sendBtn.disabled = true;
    inputField.disabled = true;

    // 添加用户消息到分析结果
    const analysisResult = analysisWindow.querySelector('.analysis-result');
    analysisResult.innerHTML += `<div class="user-message"><strong>你:</strong> ${userMessage}</div>`;
    analysisResult.scrollTop = analysisResult.scrollHeight;

    // 保存到对话历史
    conversationHistory.push({ role: 'user', content: userMessage });

    // 清空输入框
    inputField.value = '';

    // 调用 AI 进行对话
    try {
      await streamChatAnalysis(word, sentence, conversationHistory, analysisResult);
    } catch (error) {
      console.error('对话分析出错:', error);
      analysisResult.innerHTML += `<div class="error-message">分析出错: ${error.message}</div>`;
    }

    isProcessing = false;
    sendBtn.disabled = false;
    inputField.disabled = false;
    inputField.focus();
  };

  // 发送按钮点击事件
  sendBtn.addEventListener('click', sendMessage);

  // 输入框回车事件
  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // 开始调用 AI 流式句子解析
  streamAnalysis(word, sentence);
}

// 修改高亮句子函数
function highlightSentence(detail, sentence) {
  return;
  try {
    // 清除之前的高亮
    if (currentHighlight) {
      CSS.highlights.delete('sentence-highlight');
    }

    // 创建新的高亮
    const sentenceRange = document.createRange();
    const textNode = detail.range.startContainer;
    const fullText = textNode.textContent;

    // 查找句子在文本中的位置
    let startOffset = fullText.indexOf(sentence);
    let highlightSuccess = false;

    if (startOffset === -1) {
      // 如果找不到完整句子，尝试使用部分匹配
      const words = sentence.split(/\s+/);
      const wordIndex = words.findIndex(w => w.includes(detail.word));
      if (wordIndex !== -1) {
        const beforeWords = words.slice(0, wordIndex).join(' ');
        const afterWords = words.slice(wordIndex + 1).join(' ');
        const wordPos = fullText.indexOf(detail.word);
        if (wordPos !== -1) {
          // 从单词位置向前后扩展
          startOffset = Math.max(0, wordPos - beforeWords.length - 1);
          const endOffset = Math.min(fullText.length, wordPos + detail.word.length + afterWords.length + 1);
          sentenceRange.setStart(textNode, startOffset);
          sentenceRange.setEnd(textNode, endOffset);
          highlightSuccess = true;
        }
      }

      // 如果部分匹配也失败，尝试使用 getSentenceWordDetails 获取句子中的单词详情
      if (!highlightSuccess) {
        console.log("尝试使用 getSentenceWordDetails 获取句子中的单词详情");

        // 检查 sentenseOoOo.js 是否已加载
        if (typeof window.getSentenceWordDetails === 'function') {
          // 使用 window 对象访问全局函数
          const wordDetails = window.getSentenceWordDetails(detail);
          if (wordDetails && wordDetails.length > 0) {
            console.log("成功获取句子中的单词详情，单词数量:", wordDetails.length);

            // 使用 highlightSpecificWords 函数高亮这些单词
            if (typeof window.highlightSpecificWords === 'function') {
              // 获取用户设置的高亮速度
              chrome.storage.local.get(['highlightSpeed'], function(result) {
                // 修复：使用 !== undefined 检查，而不是 || 运算符，以正确处理 highlightSpeed 为 0 的情况
                const msPerChar = result.highlightSpeed !== undefined ? result.highlightSpeed : 100; // 默认值为 100ms/字符
                window.highlightSpecificWords(wordDetails, msPerChar);
                console.log("使用 highlightSpecificWords 高亮句子中的单词");
              });
              return; // 提前返回，等待异步获取高亮速度
            } else {
              console.warn("highlightSpecificWords 函数不可用");
            }
          } else {
            console.warn("getSentenceWordDetails 未返回有效的单词详情");
          }
        } else {
          console.warn("getSentenceWordDetails 函数不可用，可能 sentenseOoOo.js 未正确加载");

          // 添加事件监听器，等待 sentenseOoOo.js 加载完成
          document.addEventListener('sentenseOoOoLoaded', function onSentenseOoOoLoaded() {
            console.log("sentenseOoOo.js 已加载，重试高亮句子");
            document.removeEventListener('sentenseOoOoLoaded', onSentenseOoOoLoaded);

            // 重试高亮
            setTimeout(() => {
              highlightSentence(detail, sentence);
            }, 100);
          });
        }
      }
    } else {
      sentenceRange.setStart(textNode, startOffset);
      sentenceRange.setEnd(textNode, startOffset + sentence.length);
      highlightSuccess = true;
    }

    // 只有在成功设置了范围的情况下才创建高亮
    if (highlightSuccess) {
      currentHighlight = new Highlight(sentenceRange);
      CSS.highlights.set('sentence-highlight', currentHighlight);
      console.log('句子高亮成功 (使用 CSS.highlights):', sentence);
    } else {
      console.warn('无法使用 CSS.highlights 高亮句子，尝试其他方法');
    }
  } catch (error) {
    console.error('高亮句子时发生错误:', error, '\n句子:', sentence);
  }
}

 // 格式化内容，添加简单的Markdown解析
function formatContent(content) {
  if (!content) return '';


  // 为拉丁字母文本添加特定样式
  // 匹配拉丁字母单词、短语或句子（包括标点符号和特殊字符）
  // 包含德语、法语、西班牙语、意大利语等常见拉丁字母语言的特殊字符
  content = content.replace(/([a-zA-ZäöüßÄÖÜéèêëàâîïôûùçñáíóúÉÈÊËÀÂÎÏÔÛÙÇÑÁÍÓÚ][a-zA-ZäöüßÄÖÜéèêëàâîïôûùçñáíóúÉÈÊËÀÂÎÏÔÛÙÇÑÁÍÓÚ\s\.,;:!?'"()\-]*[a-zA-ZäöüßÄÖÜéèêëàâîïôûùçñáíóúÉÈÊËÀÂÎÏÔÛÙÇÑÁÍÓÚ\.,;:!?'"()\-])/g, '<span class="fanwood-text">$1</span>');
  // 替换Markdown语法
  content = content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/`(.*?)`/g, '<code>$1</code>');

  return content;
}






// 添加函数：检测页面是否为暗色模式
function isDarkMode() {
  let limit=100;
  let textElements = [];
  let walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let count = 0;

  while (walker.nextNode() && count < limit) {
    let parentElement = walker.currentNode.parentElement;
    if (parentElement && window.getComputedStyle(parentElement).color) {
      let color = window.getComputedStyle(parentElement).color;
      let [r, g, b] = color.match(/\d+/g).map(Number);
      let brightness = (r * 299 + g * 587 + b * 114) / 1000; // 计算亮度

      textElements.push({
        text: walker.currentNode.textContent.trim(),
        color: color,
        isDark: brightness < 128 // 亮度小于128认为是暗色
      });

      count++;
    }
  }

  // 过滤掉空文本节点
  textElements = textElements.filter(element => element.text.length > 0);

  let darkCount = textElements.filter(element => element.isDark).length;
  let lightCount = textElements.length - darkCount;

  console.log("lightCount:", lightCount, "darkCount:", darkCount);
  console.log("是黑模式嘛？：", lightCount >= darkCount);
  return lightCount >= darkCount; // 黑色返回 true，白色返回 false
  }


// 添加到文件末尾
// 监听系统暗色模式变化
if (window.matchMedia) {
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkModeMediaQuery.addEventListener('change', () => {
    console.log("系统暗色模式设置已变更，重新应用高亮");
    if (highlightManager) {
      highlightManager.reapplyHighlights();
    }
  });
}

// 添加getStorageValue函数
function getStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key]);
    });
  });
}

// 更新解析窗口玻璃效果切换按钮的外观
function updateAnalysisGlassToggleButton(button, enabled) {
  if (!button) return;

  // 如果没有传入状态，从存储中读取
  if (enabled === undefined) {
    chrome.storage.local.get(['analysisGlassEnabled'], (result) => {
      const isEnabled = result.analysisGlassEnabled !== undefined ? result.analysisGlassEnabled : true;
      updateAnalysisGlassToggleButton(button, isEnabled);
    });
    return;
  }

  // 更新按钮样式和提示文本
  if (enabled) {
    button.style.opacity = '1';
    button.title = '玻璃效果: 已启用 (点击禁用)';
    button.classList.add('glass-enabled');
  } else {
    button.style.opacity = '0.5';
    button.title = '玻璃效果: 已禁用 (点击启用)';
    button.classList.remove('glass-enabled');
  }
}

// 监听来自 background.js 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理音频播放开始消息
  if (message.action === "audioPlaybackStarted") {
    console.log("Content script 收到音频播放开始消息:", message.audioType);
    // 创建自定义事件并分发到页面
    const event = new CustomEvent('audioPlaybackStarted', {
      detail: {
        audioType: message.audioType
      }
    });
    document.dispatchEvent(event);
  }
  // 处理流式数据块
  else if (message.action === "streamChunk") {
    const { content, isFirstChunk, isDone } = message.data;

    if (window.currentStreamContext) {
      const context = window.currentStreamContext;

      if (context.type === 'analysis' && context.element) {
        // 处理分析窗口的流式数据
        if (isFirstChunk) {
          context.element.innerHTML = ''; // 清空 "分析中..." 的文本
        }
        context.element.innerHTML += formatContent(content);
        context.element.scrollTop = context.element.scrollHeight;
      } else if (context.type === 'chat' && context.element) {
        // 处理对话的流式数据
        if (isFirstChunk) {
          context.element.innerHTML = '';
        }
        context.element.innerHTML += formatContent(content);
        const analysisResult = context.element.closest('.analysis-result');
        if (analysisResult) {
          analysisResult.scrollTop = analysisResult.scrollHeight;
        }
      } else if (context.type === 'sidebar') {
        // 处理侧边栏的流式数据
        if (isContextValid()) {
          chrome.runtime.sendMessage({
            action: "streamUpdate",
            data: {
              content: content,
              isFirstChunk: isFirstChunk
            }
          }).catch(err => console.log("发送流式更新失败:", err));
        }
      }
    }
  }
  // 处理流式完成信号
  else if (message.action === "streamComplete") {
    console.log("流式传输完成:", message.data);
    // 清理流式上下文
    window.currentStreamContext = null;
  }
  // 处理流式错误
  else if (message.action === "streamError") {
    const { error } = message.data;
    console.error("流式传输错误:", error);

    if (window.currentStreamContext) {
      const context = window.currentStreamContext;

      if (context.type === 'analysis' && context.element) {
        context.element.innerHTML = `分析出错: ${error}`;
      } else if (context.type === 'sidebar') {
        if (isContextValid()) {
          chrome.runtime.sendMessage({
            action: "streamUpdate",
            data: {
              content: `分析出错: ${error}`,
              isFirstChunk: true
            }
          }).catch(err => console.log("发送错误信息失败:", err));
        }
      }
    }

    // 清理流式上下文
    window.currentStreamContext = null;
  }
  // 处理Orion TTS相关消息 - 这些消息会被orion_tts.js处理，这里只是为了兼容性
  else if (message.action === "playCustom" ||
           message.action === "playMinimaxi" ||
           message.action === "playLocal" ||
           message.action === "stopAudio" ||
           message.action === "stopSpecificAudio") {
    // 这些消息会被orion_tts.js处理，这里只返回成功
    sendResponse({success: true});
    return true;
  }
});

// 监听页面样式变化（可能影响暗色模式判断）
const bodyObserver = new MutationObserver(() => {
  if (highlightManager && highlightManager.isDarkMode !== isDarkMode()) {
    console.log("页面暗色模式状态已变更，重新应用高亮");
    highlightManager.reapplyHighlights();
  }
});

// 开始观察body样式变化
bodyObserver.observe(document.body, {
  attributes: true,
  attributeFilter: ['class', 'style']
});



// 更新相关的 CSS 样式
const analysisStyles = document.createElement('style');
analysisStyles.textContent = `
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
  .analysis-window {
    font-family: "Fanwood","LXGWWenKai", "PingFang SC","Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol" !important; /* <--- 添加自定义字体 */

    /* position: fixed; */ /* 旧代码：固定定位 */
    position: absolute; /* 新代码：绝对定位 */

    max-width: 500px; /* 最大宽度     width: 500px; */
    width: 95vw;     /* 默认宽度为视口宽度，最大不超过392px */




    max-height: 80vh;
    box-sizing: border-box;
    border-radius: 10px;
    z-index: 2147483647;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
    transform: translate3d(0, 0, 0);
    will-change: transform;
    backface-visibility: hidden;
    perspective: 1000px;
    display: flex;
    flex-direction: column;
    opacity: 0; /* <--- 添加：初始透明度为 0 */
    transition: opacity 0.08s ease-in-out; /* <--- 添加：透明度过渡效果 */
  }

  .analysis-header {
      font-family: 'LXGWWenKai';
    padding: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    cursor: grab;
    font-size: 16px;
    position: sticky;
    top: 0;
    z-index: 100;
    flex-shrink: 0;
  }

  .header-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .analysis-glass-toggle-btn {
    cursor: pointer;
    padding: 4px;
    border-radius: 50%;
    border: none;
    background: none;
    transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .analysis-glass-toggle-btn:hover {
    transform: scale(1.1);
  }

  .analysis-glass-toggle-btn svg {
    width: 20px;
    height: 20px;
  }

  .analysis-glass-toggle-btn svg path {
    stroke: #000000 !important;
  }

  .dark-mode .analysis-glass-toggle-btn svg path {
    stroke: #ffffff !important;
  }

  .analysis-glass-toggle-btn.glass-enabled {
    opacity: 1 !important;
  }

  .light-mode .analysis-header {
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
    color: #333;
  }

  .dark-mode .analysis-header {
    background: #333;
    border-bottom: 1px solid #444;
    color: #eee;
  }

  .close-btn {
    cursor: pointer;
    font-size: 18px;
    padding: 4px 8px;
    z-index: 1;
    border: none;
    background: none;
    transition: transform 0.2s ease-in-out, color 0.2s ease-in-out;
    border-radius: 50%;
  }

  .close-btn:hover {
    color: #ff4444;
    transform: scale(1.1);
  }

  .analysis-content {
    padding: 15px;
    overflow-y: auto;
    font-size: 14px;
    flex-grow: 1;
    max-height: calc(80vh - 40px);
  }

  .light-mode .analysis-content {
    background-color: #fafafa;
    color: #333;
  }

  .analysis-window.glass-effect.light-mode .analysis-content {
    background-color: rgba(255, 255, 255, 0.1) !important;
    color: #333;
  }



  .dark-mode .analysis-content {
    background-color: #2a2a2a;
    color: #eee;
  }

  .analysis-window.glass-effect.dark-mode .analysis-content {
    background-color: rgba(0, 0, 0, 0.2) !important;

  }



  .sentence-display {
    margin-bottom: 10px;
    padding: 10px;
    border-radius: 10px;
    line-height: 1.3;
    font-size: 17px;
   font-family: 'Fanwood', serif !important;
    font-style: italic !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    display: none;
  }

  .light-mode .sentence-display {
    background: #e3e3e3;
    
  }

  .dark-mode .sentence-display {
    background: #3a3a3a;
  }

  .analysis-result {
    padding: 10px;
    font-size: 16px;
    border-radius: 10px;
    line-height: 1.1;
    white-space: pre-wrap;
  }



  /* 使用更通用的选择器为英文文本设置Fanwood字体和特定字号 */
  .analysis-result {
    /* 基本字体设置 */
    font-family: "LXGWWenKai", "PingFang SC", sans-serif;
    font-size: 16px;

  }

  /* 为英文文本设置Fanwood字体和更大字号 */
  .analysis-result .english-text,
  .analysis-result em,
  .analysis-result i,
  .analysis-result span[lang="en"],
  .analysis-result p[lang="en"],
  .analysis-result div[lang="en"] {
    font-family: "Fanwood", serif !important;
    font-size: 18px !important;
  }



.dark-mode .analysis-result {

    color:rgb(255, 255, 255);
}

.light-mode .analysis-result {

color:rgb(0, 0, 0);
}


  /* 添加一个通用类，可以手动添加到需要使用Fanwood字体的元素上 */
  .dark-mode .analysis-result  .fanwood-text {
    font-family: "Fanwood", serif !important;
    font-size: 21px !important;
    color: #148bf3;
  }

  .light-mode .analysis-result  .fanwood-text {
    font-family: "Fanwood", serif !important;
    font-size: 21px !important;
    color: #148bf3;
  }


  /* 确保strong元素使用Fanwood Bold字体 */
  .analysis-result strong,
  .fanwood-text strong {
    font-family: "Fanwood","LXGWWenKai", serif !important;
    font-weight: bold !important;
    font-size: 18px !important;
  }

  /* Markdown样式 */
  .analysis-result h1 {
    font-size: 22px;
    margin: 15px 0 10px 0;
     font-family: 'LXGWWenKai';
  }

  .analysis-result h2 {
    font-size: 18px;
    margin: 12px 0 8px 0;
     font-family: 'LXGWWenKai';
  }

  .analysis-result h3 {
    font-size: 16px;
    margin: 10px 0 6px 0;
     font-family: 'LXGWWenKai';
  }

  .analysis-result pre {
    background: rgba(0,0,0,0.05);
    padding: 10px;
    border-radius: 5px;
    overflow-x: auto;
  }

  .analysis-result code {
    font-family: monospace;
    background: rgba(0,0,0,0.05);
    padding: 2px 4px;
    border-radius: 3px;
  }

  .analysis-result blockquote {
    border-left: 4px solid #ccc;
    margin: 8px 0;
    padding: 0 10px;
    color: #666;
  }

  .analysis-result li {
    margin: 5px 0 5px 20px;
  }

  .analysis-result a {
    text-decoration: underline;
  }

  .dark-mode .analysis-result code,
  .dark-mode .analysis-result pre {
    background: rgba(255,255,255,0.1);
  }

  .dark-mode .analysis-result blockquote {
    border-left-color: #555;
    color: #aaa;
  }

  .dark-mode .analysis-result a {
    color: #8ab4f8;
  }

  .light-mode .analysis-result {
    background: #fafafa;
  }

  .dark-mode .analysis-result {
    background: #2a2a2a;
  }

  .analysis-input-container {
    display: flex;
    gap: 8px;
    padding: 10px 15px;
    border-top: 1px solid #ddd;
    background-color: #fafafa;
  }

  .dark-mode .analysis-input-container {
    border-top: 1px solid #444;
    background-color: #2a2a2a;  
  }

  .analysis-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }

  .analysis-input:focus {
    border-color: #007bff;
  }

  .dark-mode .analysis-input {
    background: #3a3a3a;
    border-color: #555;
    color: #eee;
  }

  .dark-mode .analysis-input:focus {
    border-color: #8ab4f8;
  }

  .analysis-send-btn {
    padding: 8px 16px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s;
  }

  .analysis-send-btn:hover {
    background: #0056b3;
  }

  .dark-mode .analysis-send-btn {
    background: #8ab4f8;
  }

  .dark-mode .analysis-send-btn:hover {
    background: #6ea5f0;
  }

  .analysis-send-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .dark-mode .analysis-send-btn:disabled {
    background: #555;
  }

  .user-message {
    margin: 10px 0;
    padding: 8px 12px;
    background: #e3f2fd;
    border-radius: 8px;
    border-left: 3px solid #2196f3;
  }

  .dark-mode .user-message {
    background: #1a2332;
    border-left: 3px solid #64b5f6;
  }

  .ai-message {
    margin: 10px 0;
    padding: 8px 12px;
    background: #f1f8e9;
    border-radius: 8px;
    border-left: 3px solid #4caf50;
  }

  .dark-mode .ai-message {
    background: #1b3a25;
    border-left: 3px solid #81c784;
  }

  .error-message {
    margin: 10px 0;
    padding: 8px 12px;
    background: #ffebee;
    border-radius: 8px;
    border-left: 3px solid #f44336;
    color: #c62828;
  }

  .dark-mode .error-message {
    background: #3a1a1a;
    border-left: 3px solid #ef5350;
    color: #ef9a9a;
  }

  /* 解析句子玻璃效果样式 */
  .analysis-window.glass-effect {
    background: rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(20px) saturate(180%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1) !important;
  }

  .analysis-window.glass-effect.dark-mode {
    background: rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
  }

  .analysis-window.glass-effect .sentence-display {
    background: rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
  }

  .analysis-window.glass-effect.dark-mode .sentence-display {
    background: rgba(0, 0, 0, 0.2) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
  }

  .analysis-window.glass-effect .analysis-result {
    background: rgb(255 255 255 / 0%) !important
      /* backdrop-filter: blur(8px) !important;*/
      /* -webkit-backdrop-filter: blur(8px) !important;*/
      /* border: 1px solid rgba(255, 255, 255, 0.1) !important;*/
  }

  .analysis-window.glass-effect.dark-mode .analysis-result {
    background: rgb(0 0 0 / 0%) !important;
    border: unset !important;
    backdrop-filter: unset !important;
  }

  .analysis-window.glass-effect .analysis-header {
    background: rgba(255, 255, 255, 0.1) !important;
    backdrop-filter: blur(15px) !important;
    -webkit-backdrop-filter: blur(15px) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
  }

  .analysis-window.glass-effect.dark-mode .analysis-header {
    background: rgba(0, 0, 0, 0.2) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
  }
`;

// 将样式添加到shadowRoot
shadowRoot.appendChild(analysisStyles);

// 处理侧边栏词句分析
function handleSidebarAnalysis() {
  if (lastMouseEvent) {
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



      // 检查侧边栏功能是否开启
      chrome.storage.local.get('sidePanelBtn', function(result) {
        if (result.sidePanelBtn !== false) {
          // 高亮句子
          try {
            highlightSentence(hoveredDetail, sentence);
          } catch (error) {
            console.error('高亮句子时发生错误:', error);
          }

          // 打开侧边栏并发送数据
          openSidebarWithAnalysis(hoveredDetail.word, sentence);
        }
      });
    }
  }
}

// 打开侧边栏并进行分析
function openSidebarWithAnalysis(word, sentence) {
  // 检查 context 是否有效
  if (!isContextValid()) {
    console.error("Extension context 已失效,无法打开侧边栏");
    return;
  }

  // 通过发送消息给background脚本来打开侧边栏
  chrome.runtime.sendMessage({
    action: "openSidebar",
    data: {
      word: word,
      sentence: sentence
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("发送消息失败:", chrome.runtime.lastError);
      return;
    }

    if (response && response.status === "opened") {
      // 侧边栏已打开，开始流式分析
      sidebarStreamAnalysis(word, sentence);




    } else {
      console.error("打开侧边栏失败:", response?.error || "未知错误");
    }
  });
}

// --- 新增：带动画关闭分析窗口的函数 ---
let isClosingAnalysisWindow = false; // 防止重复触发关闭
// 保存当前活动的MutationObserver
let activeContentObserver = null;

function closeAnalysisWindowWithAnimation() {
  if (!analysisWindow || isClosingAnalysisWindow) return; // 如果窗口不存在或正在关闭，则返回

  isClosingAnalysisWindow = true;

  // 1. 开始淡出动画
  analysisWindow.style.opacity = '0';

  // 2. 保存需要清理的引用
  const windowToRemove = analysisWindow;

  // 3. 断开MutationObserver连接
  if (activeContentObserver) {
    activeContentObserver.disconnect();
    activeContentObserver = null;
    console.log('已断开MutationObserver连接');
  }

  // 4. 清理全局变量
  analysisWindow = null;

  // 清除全局标志，表示句子解析弹窗已关闭
  window.isAnalysisWindowActive = false;

  // 5. 等待动画完成 (0.08 秒)
  setTimeout(() => {
    // 6. 动画完成后，移除元素
    if (windowToRemove) {
      windowToRemove.remove();
    }

    // 7. 清除句子高亮
    if (currentHighlight) {
      CSS.highlights.delete('sentence-highlight');
      currentHighlight = null;
    }

    // 8. 重置关闭状态
    isClosingAnalysisWindow = false;

  }, 80); // 动画持续时间
}
// --- 新增结束 ---

// =======================
// 自定义查词功能初始化
// =======================
console.log('开始初始化自定义查词功能');

// 确保所有必要的脚本都已加载后再初始化
function initCustomWordFeatures() {
  // 检查必要的函数是否存在
  if (typeof initCustomWordSelection === 'function') {

    console.log('初始化自定义查词功能');

    // 初始化自定义查词选择功能
    initCustomWordSelection();

    console.log('自定义查词功能初始化完成');

    // 注意：不在这里调用 initCustomHighlight()
    // 词组高亮系统会在 a6_custom_highlight.js 中自动异步初始化
    // 这样可以避免与正常单词高亮系统冲突

  } else {
    console.log('等待必要脚本加载...');
    // 如果函数还没有加载，延迟重试(优化:减少延迟时间)
    setTimeout(initCustomWordFeatures, 50);
  }
}

// 优化:立即初始化,移除硬编码的1000ms延迟
// 由于manifest.json中content_scripts按顺序加载,a5_custom_word_selection.js在content.js之前
// 因此可以立即检查并初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomWordFeatures);
} else {
  // DOM已加载完成,立即执行
  initCustomWordFeatures();
}

