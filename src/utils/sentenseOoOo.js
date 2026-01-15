/**
 * Injects custom CSS styles into the document's head.
 * @param {string} css The CSS rules to inject.
 * @param {string} id An ID for the style element for later removal.
 * @returns {HTMLStyleElement} The created style element.
 */
function injectSelectionStyles(css, id) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
    console.log(`Injected styles with ID: ${id}`);
    return style;
}

/**
 * Removes a style element from the document's head by its ID.
 * @param {string} id The ID of the style element to remove.
 */
function removeSelectionStyles(id) {
    const styleElement = document.getElementById(id);
    if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
        console.log(`Removed styles with ID: ${id}`);
    } else {
        console.warn(`Could not find style element with ID: ${id} to remove.`);
    }
}

/**
 * 检查元素是否为 YouTube 上允许处理的元素
 */
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
    'trancy-app',
    'overlay-subtitle-text',
    'youtube-video-overlay',
    'overlay-subtitle-container',
    'overlay-subtitle-list-container',
    'overlay-subtitle-list',
    'subtitle-item'
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

// 将关键函数导出到全局作用域，以便在其他脚本中使用
window.highlightSpecificWords = highlightSpecificWords;
window.getSentenceWordDetails = getSentenceWordDetails;
window.findSentenceAcrossElements = findSentenceAcrossElements;

/**
 * Highlights a list of text nodes in the page one by one using the Selection API,
 * with the duration of each highlight based on the word's length.
 *
 * @param {Array<Object>} wordsToHighlight An array of objects, where each object
 *   should have the following properties:
 *   - word: The string content of the word.
 *   - parentNode: The text node containing the word.
 *   - offset: The starting offset of the word within the text node.
 * @param {number} [msPerChar=100] The default time in milliseconds to highlight per character.
 * @param {number|null} [msPerCharZh=null] Specific time per character for words containing Chinese characters. Falls back to msPerChar if null.
 * @param {number|null} [msPerCharJa=null] Specific time per character for words containing Japanese Kana. Falls back to msPerChar if null.
 * @param {boolean} [waitForTTS=true] Whether to wait for TTS audio playback to start before highlighting. If false, starts immediately.
 * @returns {object} An object with a `cancel` method to stop the highlighting sequence.
 */
function highlightSpecificWords(wordsToHighlight, msPerChar = 100, msPerCharZh = 200, msPerCharJa = 200, waitForTTS = true) {

    // 设置全局标志，禁用a5划词功能
    window.isWordByWordHighlighting = true;

    let initialTimeoutId = null; // ID for the initial delay
    let highlightTimeoutId = null; // ID for the ongoing highlight timeouts
    let isCancelled = false; // Flag to track cancellation
    const styleId = `highlight-selection-styles-${Date.now()}`; // Unique ID for the style tag
    const highlightName = `word-by-word-highlight-${Date.now()}`; // Unique name for CSS Highlight
    let currentHighlight = null; // Store current CSS Highlight object

    // 获取文本颜色亮度的函数
    function getTextColorBrightness(element) {
        if (!element) return null;

        // 获取元素的计算样式
        const style = window.getComputedStyle(element);
        const color = style.color;

        // 解析RGB值
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/i);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1], 10);
            const g = parseInt(rgbMatch[2], 10);
            const b = parseInt(rgbMatch[3], 10);

            // 计算亮度 (基于人眼对不同颜色的感知权重)
            // 亮度公式: 0.299*R + 0.587*G + 0.114*B
            const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return brightness;
        }

        return null; // 无法解析颜色
    }

    // 获取当前选中文本的父元素
    let textElement = null;
    if (wordsToHighlight && wordsToHighlight.length > 0 && wordsToHighlight[0].parentNode) {
        textElement = wordsToHighlight[0].parentNode.parentElement;
    }

    // 确定文本颜色亮度
    let isDarkText = true; // 默认假设是深色文本
    const brightness = textElement ? getTextColorBrightness(textElement) : null;

    if (brightness !== null) {
        // 亮度阈值：0.5 (0是黑色，1是白色)
        isDarkText = brightness < 0.5;
        console.log(`文本亮度: ${brightness}, 是深色文本: ${isDarkText}`);
    } else {
        // 如果无法获取亮度，则回退到全局暗色模式设置
        isDarkText = !globalDarkMode;
        console.log(`无法获取文本亮度，回退到全局设置，是深色文本: ${isDarkText}`);
    }

    // Define the CSS for CSS Highlight API
    let highlightCSS;
    if (isDarkText) {
        // 深色文本(黑色文本)使用浅色高亮背景
        highlightCSS = `
        ::highlight(${highlightName}) {
           background-color: #CCE3AD !important;
           color: #000000 !important;
        }
        `;
    } else {
        // 浅色文本(白色文本)使用深色高亮背景
        highlightCSS = `
        ::highlight(${highlightName}) {
            background-color: #4F455C !important;
            color: #ffffff !important;
        }
        `;
    }

    // 检查是否在bionic模式下
    const isBionicActive = document.querySelector('.highlight-wrapper') !== null;
    if (isBionicActive) {
        console.log("检测到bionic模式已激活，使用特殊高亮样式");
        // 在bionic模式下，我们需要确保高亮样式能够覆盖bionic的样式
        highlightCSS = `
        ::highlight(${highlightName}) {
            background-color: ${isDarkText ? '#CCE3AD' : '#4F455C'} !important;
            color: ${isDarkText ? '#000000' : '#ffffff'} !important;
            opacity: 1 !important;
        }
        `;
    }



    // Helper function to detect script type (simple version)
    const getWordScriptType = (word) => {
        // Check for Japanese Hiragana/Katakana first
        if (/[぀-ゟ゠-ヿ]/.test(word)) {
            return 'ja';
        }
        // Check for common CJK Ideographs (Chinese)
        if (/[一-鿿㐀-䶿豈-﫿]/.test(word)) {
            return 'zh';
        }
        // Add other script checks here if needed (e.g., Korean Hangul: /[가-힯]/)
        return 'other'; // Default
    };

    // The core highlighting logic, now moved into a separate function
    const startHighlightingSequence = () => {
        // If cancelled before starting, do nothing
        if (isCancelled) return;

        // If there are no words to highlight, stop here.
        if (!wordsToHighlight || wordsToHighlight.length === 0) {
          console.log("No words provided to highlight.");
          return; // No need to proceed
        }

        // 从用户点击的单词开始高亮，而不是从第一个单词开始
        // 我们需要确保 wordsToHighlight 数组中的第一个单词就是用户点击的单词
        // 这是因为 getSentenceWordDetails 函数已经确保了这一点
        let index = 0;
        const range = new Range();

        console.log(`开始高亮，共有 ${wordsToHighlight.length} 个单词需要高亮，从用户点击的单词开始`);

        // Function to perform the highlighting for one word and schedule the next
        const highlightNextWord = () => {
          // If cancelled during the sequence, stop
          if (isCancelled) {
             // 清除CSS Highlight
             if (currentHighlight && CSS.highlights) {
                 CSS.highlights.delete(highlightName);
             }
             // 恢复a5划词功能
             window.isWordByWordHighlighting = false;
             console.log("Highlighting cancelled during sequence.");
             return;
          }

          // Check if we've processed all words
          if (index >= wordsToHighlight.length) {
            // 清除CSS Highlight
            if (currentHighlight && CSS.highlights) {
                CSS.highlights.delete(highlightName);
            }
            removeSelectionStyles(styleId); // Remove the dynamic styles
            console.log("Finished highlighting sequence.");
            highlightTimeoutId = null; // Clear the stored ID
            // 恢复a5划词功能
            window.isWordByWordHighlighting = false;
            return; // Stop the sequence
          }

          // Get current word details
          const {
            word,
            parentNode,
            offset
          } = wordsToHighlight[index];

          // Ensure parentNode is a valid node before setting the range
          if (parentNode && typeof parentNode.textContent === 'string') {
             try {
                 // 使用CSS Highlight API代替Selection API
                 range.setStart(parentNode, offset);
                 const endOffset = Math.min(offset + word.length, parentNode.textContent.length);
                 range.setEnd(parentNode, endOffset);

                 // 检查浏览器是否支持CSS Highlight API
                 if (CSS.highlights) {
                     // 清除之前的高亮
                     if (currentHighlight) {
                         CSS.highlights.delete(highlightName);
                     }
                     // 创建新的高亮
                     currentHighlight = new Highlight(range.cloneRange());
                     CSS.highlights.set(highlightName, currentHighlight);
                 } else {
                     // 回退到Selection API（旧浏览器）
                     document.getSelection().removeAllRanges();
                     document.getSelection().addRange(range);
                 }

                 // Determine the effective msPerChar based on word script type
                 const scriptType = getWordScriptType(word);
                 let effectiveMsPerChar = msPerChar; // Default
                 if (scriptType === 'ja' && msPerCharJa !== null) {
                    effectiveMsPerChar = msPerCharJa;
                 } else if (scriptType === 'zh' && msPerCharZh !== null) {
                    effectiveMsPerChar = msPerCharZh;
                 }

                 // Calculate duration for the current word
                 const currentWordDuration = Math.max(50, word.length * effectiveMsPerChar); // Ensure a minimum duration

                 // Move to the next word index *before* scheduling the next timeout
                 index++;

                 // Schedule the next word highlight
                 highlightTimeoutId = setTimeout(highlightNextWord, currentWordDuration);

             } catch (e) {
                console.error("Error during highlighting word:", word, e);
                // Optional: Decide if you want to stop on error
                // highlightTimeoutId = null;
                // document.getSelection().removeAllRanges();
                // return;
                // Or just skip to the next word immediately/after short delay
                 index++;
                 // Check cancellation again before scheduling next
                 if (!isCancelled) {
                    highlightTimeoutId = setTimeout(highlightNextWord, 50); // Schedule next word quickly after an error
                 }
             }
          } else {
             console.warn("Invalid parentNode provided for highlighting, skipping word:", wordsToHighlight[index]);
             // Skip to the next word
             index++;
             // Schedule the next highlight immediately, checking cancellation
             if (!isCancelled) {
                highlightTimeoutId = setTimeout(highlightNextWord, 0);
             }
          }
        };

        // Start the actual highlighting sequence (after the initial delay)
        highlightNextWord();
    };

    // Inject styles *before* starting the timeout sequence
    injectSelectionStyles(highlightCSS, styleId);

    // 根据waitForTTS参数决定是否等待TTS
    if (waitForTTS) {
        // 默认延迟时间（如果没有收到音频开始播放事件，将使用此延迟）
        initialTimeoutId = setTimeout(startHighlightingSequence, 5900);

        // 添加音频播放开始事件监听器
        const audioStartListener = function(event) {
            if (event.detail && event.detail.audioType) {
                console.log("收到音频开始播放事件:", event.detail.audioType);
                // 清除默认延迟
                if (initialTimeoutId) {
                    clearTimeout(initialTimeoutId);
                    initialTimeoutId = null;
                }
                // 立即开始高亮序列
                startHighlightingSequence();
                // 移除事件监听器，避免重复触发
                document.removeEventListener('audioPlaybackStarted', audioStartListener);
            }
        };

        // 注册事件监听器
        document.addEventListener('audioPlaybackStarted', audioStartListener, { once: true });
    } else {
        // 无TTS模式：立即开始高亮，不等待音频事件
        console.log("无TTS模式：立即开始逐词高亮");
        startHighlightingSequence();
    }

    // Return an object with a method to cancel the sequence
    return {
      cancel: () => {
        isCancelled = true; // Set the flag
        // Clear the initial delay timeout if it's still pending
        if (initialTimeoutId) {
          clearTimeout(initialTimeoutId);
          initialTimeoutId = null;
        }
        // Clear the ongoing highlight timeout if it exists
        if (highlightTimeoutId) {
          clearTimeout(highlightTimeoutId);
          highlightTimeoutId = null;
        }
        // 移除音频播放开始事件监听器
        document.removeEventListener('audioPlaybackStarted', audioStartListener);
        // 清除CSS Highlight
        if (currentHighlight && CSS.highlights) {
            CSS.highlights.delete(highlightName);
        }
        // Always clear selection on cancel (for fallback)
        document.getSelection().removeAllRanges();
        removeSelectionStyles(styleId); // Remove the dynamic styles on cancel
        // 恢复a5划词功能
        window.isWordByWordHighlighting = false;
        console.log("Highlighting sequence cancelled.");
      }
    };
  }

  // Example usage (you would replace this with your code to get the elements):
  // Assume 'myWordsArray' is the array of objects you obtained from your logic
  // const myWordsArray = [
  //   { word: "example", parentNode: someTextNode, offset: 5 },
  //   { word: "highlight", parentNode: anotherTextNode, offset: 10 },
  //   // ... more words
  // ];
  //
  // const highlightControl = highlightSpecificWords(myWordsArray, 100); // Start with 100ms per char
  //
  // // To stop highlighting:
  // highlightControl.cancel();






// ::selection {
//     background-color: #8B81C3;
//     color: white;
//   }


/**
 * Attempts to find the precise location (parentNode and offset) for all words
 * within the sentence identified by the initial detail object.
 *
 * @param {Object} detail The detail object for the initial word, containing { word, range }.
 * @returns {Array<Object>|null} An array of { word, parentNode, offset } objects for each word
 *   in the sentence, or null if the process fails.
 */
function getSentenceWordDetails(detail) {
    if (!detail || !detail.range || !detail.range.startContainer) {
      console.error("getSentenceWordDetails: Invalid input detail.");
      return null;
    }
    console.log("[DEBUG] getSentenceWordDetails called with detail:", JSON.stringify(detail, (key, value) => key === 'range' ? 'RangeObject' : value)); // 添加日志，避免循环引用

    // 1. 获取句子文本
    const targetSentenceText = getSentenceForWord(detail);
    console.log("[DEBUG] getSentenceForWord returned:", targetSentenceText); // 添加日志
    if (!targetSentenceText) {
      console.warn("getSentenceWordDetails: Could not get sentence text.");
      return null;
    }

    console.log("获取到的句子文本:", targetSentenceText);

    // 2. 分词
    const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    const targetSegments = Array.from(sentenceSegmenter.segment(targetSentenceText));
    const targetWords = targetSegments.filter(seg => seg.isWordLike).map(seg => seg.segment);
    console.log("[DEBUG] Segmented targetWords:", targetWords); // 添加日志

    if (targetWords.length === 0) {
        console.warn("getSentenceWordDetails: Sentence text resulted in no words after segmentation.");
        return null;
    }

    console.log("句子中的单词:", targetWords);

    // 3. 获取包含用户点击单词的节点
    const container = detail.range.startContainer;

    // 检查是否在bionic模式下（是否有highlight-wrapper父元素）
    let textNode;
    let bionicMode = false;
    let bionicParent = null;

    // 检查是否在bionic模式下
    if (container.nodeType === Node.TEXT_NODE) {
        // 检查父元素是否是highlight-wrapper
        if (container.parentElement && container.parentElement.classList &&
            container.parentElement.classList.contains('highlight-wrapper')) {
            bionicMode = true;
            bionicParent = container.parentElement;
            textNode = container; // 在bionic模式下，使用文本节点
            console.log("[DEBUG] Bionic mode detected (parent is highlight-wrapper). Using text node:", textNode); // 添加日志
        } else {
            textNode = container; // 普通模式，直接使用文本节点
            console.log("[DEBUG] Normal mode. Using text node:", textNode); // 添加日志
        }
    } else {
        // 非文本节点，尝试获取第一个子文本节点
        textNode = container.firstChild;

        // 检查是否是highlight-wrapper元素
        if (container.classList && container.classList.contains('highlight-wrapper')) {
            bionicMode = true;
            bionicParent = container;
            // 在bionic模式下，尝试找到文本节点
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
            const firstTextNode = walker.nextNode();
            if (firstTextNode) {
                textNode = firstTextNode;
                console.log("[DEBUG] Found text node inside highlight-wrapper:", textNode); // 添加日志
            }
        } else {
             console.log("[DEBUG] Clicked element is not highlight-wrapper. Trying firstChild:", textNode); // 添加日志
        }
    }

    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        console.warn("getSentenceWordDetails: 无法找到有效的文本节点");
        return null;
    }

    // 4. 在文本节点中查找句子的位置
    const nodeText = textNode.textContent;
    const sentenceStartIndex = nodeText.indexOf(targetSentenceText);

    if (sentenceStartIndex === -1) {
        console.warn("getSentenceWordDetails: 在文本节点中找不到句子");

        // 如果在bionic模式下找不到句子，尝试在原始数据中查找
        if (bionicMode && bionicParent) {
            const originalText = bionicParent.getAttribute('data-original');
            if (originalText) {
                console.log("[DEBUG] Sentence not found in nodeText in Bionic mode. Trying handleBionicSentence with original text:", originalText); // 添加日志
                // 这里可以添加在原始数据中查找的逻辑
                // 但由于bionic模式下DOM结构已改变，我们需要特殊处理
                return handleBionicSentence(targetSentenceText, targetWords, bionicParent);
            } else {
                 console.warn("[DEBUG] Bionic mode detected, but no data-original attribute found on parent:", bionicParent); // 添加日志
            }
        }

        // 尝试在相邻元素中查找句子
        console.log("[DEBUG] 尝试在相邻元素中查找句子:", targetSentenceText);
        const acrossElementsResult = findSentenceAcrossElements(detail, targetSentenceText, targetWords);
        if (acrossElementsResult) {
            console.log("[DEBUG] 在相邻元素中找到句子，单词详情数量:", acrossElementsResult.length);
            return acrossElementsResult;
        }

        return null;
    }

    console.log("在文本节点中找到句子，起始位置:", sentenceStartIndex);

    // 5. 创建单词详情数组
    const sentenceWordDetails = [];

    // 6. 遍历句子中的每个单词，计算其在文本节点中的位置
    let currentPosition = sentenceStartIndex;

    // 提取句子文本用于精确匹配
    const sentenceText = nodeText.substring(sentenceStartIndex, sentenceStartIndex + targetSentenceText.length);
    console.log("用于精确匹配的句子文本:", sentenceText);

    // 重置当前位置为0（相对于句子开始）
    let relativePosition = 0;

    for (const word of targetWords) {
        // 从当前相对位置开始在句子文本中查找单词
        const relativeWordIndex = sentenceText.indexOf(word, relativePosition);

        if (relativeWordIndex !== -1) {
            // 计算单词在整个文本节点中的绝对位置
            const absoluteWordIndex = sentenceStartIndex + relativeWordIndex;

            // 找到单词，添加到结果数组
            sentenceWordDetails.push({
                word: word,
                parentNode: textNode,
                offset: absoluteWordIndex
            });

            // 更新相对位置，确保下一次查找从这个单词之后开始
            relativePosition = relativeWordIndex + word.length;

            console.log(`找到单词 "${word}" 在句子中的相对位置: ${relativeWordIndex}, 绝对位置: ${absoluteWordIndex}`);
        } else {
            console.log(`无法在句子文本中找到单词: "${word}"`);

            // 尝试在整个文本节点中查找
            const fallbackIndex = nodeText.indexOf(word, currentPosition);
            if (fallbackIndex !== -1) {
                sentenceWordDetails.push({
                    word: word,
                    parentNode: textNode,
                    offset: fallbackIndex
                });

                // 更新当前位置
                currentPosition = fallbackIndex + word.length;

                console.log(`在整个文本节点中找到单词 "${word}", 位置: ${fallbackIndex}`);
            }
        }
    }

    if (sentenceWordDetails.length === 0) {
        console.warn("getSentenceWordDetails: 无法找到任何单词详情");
        return null;
    }

    console.log("找到的单词详情:", sentenceWordDetails.length, "个单词");
    return sentenceWordDetails;
}

/**
 * 处理bionic模式下的句子高亮
 * @param {string} targetSentenceText 目标句子文本
 * @param {Array<string>} targetWords 目标单词数组
 * @param {Element} bionicParent bionic父元素
 * @returns {Array<Object>|null} 单词详情数组或null
 */
function handleBionicSentence(targetSentenceText, targetWords, bionicParent) {
    console.log("[DEBUG] handleBionicSentence called. targetSentenceText:", targetSentenceText, "targetWords:", targetWords, "bionicParent:", bionicParent); // 添加日志

    // 在bionic模式下，我们需要找到所有的highlight-wrapper元素
    // 这些元素包含了原始文本的各个部分
    const sentenceWordDetails = [];

    // 获取包含句子的所有highlight-wrapper元素
    // 如果提供了bionicParent，优先从它开始查找
    let allWrappers;
    if (bionicParent && bionicParent.classList && bionicParent.classList.contains('highlight-wrapper')) {
        // 从bionicParent开始查找，包括它自己和它的所有兄弟元素
        const parent = bionicParent.parentElement;
        allWrappers = parent ? Array.from(parent.querySelectorAll('.highlight-wrapper')) : [bionicParent];
    } else {
        // 如果没有提供有效的bionicParent，则查找整个文档
        allWrappers = document.querySelectorAll('.highlight-wrapper');
    }

    console.log(`[DEBUG] Initial allWrappers length: ${allWrappers.length}`);
    if (allWrappers.length > 0) {
      console.log("[DEBUG] allWrappers data-original values:", Array.from(allWrappers).map(w => w.getAttribute('data-original')));
    }
    if (bionicParent) {
        console.log("[DEBUG] bionicParent data-original:", bionicParent.getAttribute('data-original'));
        const bionicParentIndexInAllWrappers = Array.from(allWrappers).indexOf(bionicParent);
        console.log("[DEBUG] Index of bionicParent in allWrappers:", bionicParentIndexInAllWrappers);
    }


    let finalSentenceWrappers = [];
    if (allWrappers.length > 0) {
        // Try to find a contiguous sequence of wrappers that exactly matches targetSentenceText
        // and includes the bionicParent (the clicked wrapper).
        for (let i = 0; i < allWrappers.length; i++) {
            let currentConcatenatedText = "";
            const currentSequence = [];
            let sequenceContainsBionicParent = false;

            for (let j = i; j < allWrappers.length; j++) {
                const wrapper = allWrappers[j];
                const original = wrapper.getAttribute('data-original');
                if (!original) { // Should ideally not happen for .highlight-wrapper
                    if (currentConcatenatedText.length > 0 && !targetSentenceText.startsWith(currentConcatenatedText)) {
                        // If we've started building text and hit a non-original wrapper, and it's already a mismatch, break.
                        break;
                    }
                    continue; // Skip wrappers without data-original, or handle as sentence break.
                }

                currentSequence.push(wrapper);
                // Add the original text AND a space to simulate inter-word spacing
                // We'll trim later for comparison if needed.
                currentConcatenatedText += original + " ";

                if (wrapper === bionicParent) {
                    sequenceContainsBionicParent = true;
                }

                // Trim the potentially trailing space from concatenated text for comparison
                const currentTrimmedText = currentConcatenatedText.trim();
                const startsWith = targetSentenceText.startsWith(currentTrimmedText);
                // Compare lengths based on trimmed text vs original target
                const lengthMatch = currentTrimmedText.length === targetSentenceText.length;

                // console.log(`[DEBUG] Loop i=${i}, j=${j}: wrapper Original="${original}"`);
                // console.log(`[DEBUG] CurrentConcat Trimmed (${currentTrimmedText.length}): "${currentTrimmedText}"`);
                // console.log(`[DEBUG] TargetSentence (${targetSentenceText.length}): "${targetSentenceText}"`);
                // console.log(`[DEBUG] Eval: StartsWith: ${startsWith}, LengthMatch: ${lengthMatch}, bionicInSeq: ${sequenceContainsBionicParent}`);

                if (startsWith) {
                    if (lengthMatch) {
                        // Exact match for the target sentence text (after trimming)
                        console.log(`[DEBUG] Exact textual match found at i=${i}, j=${j}: "${currentTrimmedText}"`);
                        if (sequenceContainsBionicParent) {
                            finalSentenceWrappers = currentSequence;
                            console.log("[DEBUG] Assigning finalSentenceWrappers (exact, with bionicParent):", finalSentenceWrappers.map(sw => sw.getAttribute('data-original')).join(' ')); // Log with spaces
                        } else if (finalSentenceWrappers.length === 0) {
                            // If no match with bionicParent found yet, store this one as a candidate
                            finalSentenceWrappers = currentSequence;
                            console.log("[DEBUG] Assigning candidate finalSentenceWrappers (exact, bionicParent NOT in this one yet):", finalSentenceWrappers.map(sw => sw.getAttribute('data-original')).join(' ')); // Log with spaces
                        }
                        break; // Inner loop (j) - found an exact match for this starting point i
                    }
                    // If it's a prefix, continue extending the sequence
                    // console.log(`[DEBUG] Is prefix. Continuing inner loop j.`);
                } else {
                    // Mismatch or overshot
                    // console.log(`[DEBUG] Mismatch/Overshot at i=${i}, j=${j}. Current Trimmed: "${currentTrimmedText}", Target: "${targetSentenceText}" (Last original added: "${original}")`);
                    break; // Inner loop (j) - this sequence is not a match
                }
            }
            if (finalSentenceWrappers.length > 0 && finalSentenceWrappers.includes(bionicParent)) {
                 // Prioritize the first exact match that contains the bionicParent
                // console.log("[DEBUG] Breaking outer loop i, found exact match with bionicParent.");
                break; // Outer loop (i)
            }
        }
    }

    if (finalSentenceWrappers.length === 0) {
        console.warn(`[DEBUG] Could not find an exact wrapper sequence for targetSentenceText: "${targetSentenceText}". bionicParent original: "${bionicParent ? bionicParent.getAttribute('data-original') : 'N/A'}"`);
        return null; // Indicate failure to robustly find the sentence wrappers
    }

    const sentenceWrappers = finalSentenceWrappers;
    // console.log("[DEBUG] Using sentenceWrappers:", sentenceWrappers.map(sw => sw.getAttribute('data-original'))); // Log the final chosen wrappers

    // 构建完整的句子文本和单词位置映射
    let fullText = '';
    const wrapperTextMap = new Map(); // 存储每个wrapper的文本及其在完整句子中的位置

    // 首先按照DOM顺序收集所有wrapper的文本
    // IMPORTANT: Use the now accurately determined 'sentenceWrappers'
    for (const wrapper of sentenceWrappers) {
        const original = wrapper.getAttribute('data-original');
        if (original) {
            const startPos = fullText.length;
            fullText += original;
            wrapperTextMap.set(wrapper, {
                text: original,
                startPos: startPos,
                textNodes: [] // 存储wrapper中的文本节点
            });

            // 收集wrapper中的所有文本节点
            const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
            let textNode;
            while (textNode = walker.nextNode()) {
                wrapperTextMap.get(wrapper).textNodes.push(textNode);
            }
        }
    }

    console.log("[DEBUG] Constructed fullText from wrappers:", fullText); // 添加日志
    console.log("[DEBUG] wrapperTextMap:", wrapperTextMap); // 添加日志

    // 现在按照targetWords的顺序在fullText中查找每个单词
    let currentPosition = 0;

    for (const word of targetWords) {
        // 从当前位置开始查找单词
        const wordIndex = fullText.indexOf(word, currentPosition);

        if (wordIndex !== -1) {
            // 找到单词在完整句子中的位置
            console.log(`[DEBUG] Found word "${word}" in fullText at index:`, wordIndex); // 添加日志

            // 更新当前位置，确保下一次查找从这个单词之后开始
            currentPosition = wordIndex + word.length;

            // 找到这个单词所在的wrapper
            let foundWrapper = null;
            let relativeOffset = -1;

            for (const [wrapper, info] of wrapperTextMap.entries()) {
                const wrapperEndPos = info.startPos + info.text.length;

                // 检查单词是否在这个wrapper的范围内
                if (wordIndex >= info.startPos && wordIndex < wrapperEndPos) {
                    foundWrapper = wrapper;
                    relativeOffset = wordIndex - info.startPos;
                    break;
                }
            }

            if (foundWrapper) {
                const info = wrapperTextMap.get(foundWrapper);

                // 找到单词在wrapper中的文本节点
                let accumulatedLength = 0;
                let targetTextNode = null;
                let nodeOffset = -1;

                for (const textNode of info.textNodes) {
                    const nodeLength = textNode.textContent.length;

                    if (relativeOffset >= accumulatedLength &&
                        relativeOffset < accumulatedLength + nodeLength) {
                        // 找到包含单词的文本节点
                        targetTextNode = textNode;
                        nodeOffset = relativeOffset - accumulatedLength;
                        break;
                    }

                    accumulatedLength += nodeLength;
                }

                if (targetTextNode) {
                    // 找到单词，添加到结果数组
                    const detailToAdd = {
                        word: word,
                        parentNode: targetTextNode,
                        offset: nodeOffset
                    };
                    sentenceWordDetails.push(detailToAdd);
                    console.log(`[DEBUG] Added detail for "${word}":`, detailToAdd); // 添加日志
                } else {
                    console.warn(`[DEBUG] Could not find text node for word "${word}" within wrapper:`, foundWrapper); // 添加日志
                }
            } else {
                console.warn(`[DEBUG] Could not find wrapper containing word "${word}" at index ${wordIndex}`); // 添加日志
            }
        } else {
            console.warn(`[DEBUG] Could not find word "${word}" in fullText starting from position ${currentPosition}`); // 添加日志
        }
    }

    if (sentenceWordDetails.length === 0) {
        console.warn("handleBionicSentence: 无法找到任何单词详情");
        return null;
    }

    console.log("[DEBUG] Final sentenceWordDetails from handleBionicSentence:", sentenceWordDetails); // 添加日志
    return sentenceWordDetails;
}

/**
 * 在多个文本节点中查找句子，并为每个单词找到其在对应文本节点中的位置
 * @param {Object} detail 初始单词的详情对象
 * @param {string} targetSentenceText 目标句子文本
 * @param {Array<string>} targetWords 目标单词数组
 * @returns {Array<Object>|null} 单词详情数组或null
 */
function findSentenceAcrossElements(detail, targetSentenceText, targetWords) {
    if (!detail || !detail.range || !detail.range.startContainer) {
        console.error("findSentenceAcrossElements: Invalid input detail.");
        return null;
    }

    // 获取初始容器和其父元素
    const initialContainer = detail.range.startContainer;
    const initialParent = initialContainer.parentElement;
    if (!initialParent) {
        console.warn("findSentenceAcrossElements: 无法获取父元素");
        return null;
    }

    // 找到当前单词所在的文本节点
    let textNodeParent = initialContainer.nodeType === Node.TEXT_NODE ? initialParent : initialContainer;
    
    // 向上查找合适的父元素 
    const MIN_TEXT_LENGTH = 10; 
    while (textNodeParent && textNodeParent !== document.body) { 
        // 如果当前节点是文本节点，继续向上查找 
        if (textNodeParent.nodeType === Node.TEXT_NODE) { 
            textNodeParent = textNodeParent.parentElement; 
            continue; 
        } 
        
        // 检查当前元素是否是absolute/fixed定位 
        const style = window.getComputedStyle(textNodeParent); 
        if (style.position === 'absolute' || style.position === 'fixed') { 
            // 如果是absolute/fixed定位，停止向上查找，使用当前元素 
            break; 
        } 
        
        // 如果不是absolute/fixed定位，检查文本长度 
        if (textNodeParent.innerText && textNodeParent.innerText.trim().length >= MIN_TEXT_LENGTH) { 
            // 文本长度足够，停止查找 
            break; 
        } 
        
        // 文本长度不够，继续向上查找 
        textNodeParent = textNodeParent.parentElement; 
    }
    
    // 使用找到的父元素作为遍历起点
    let commonParent = textNodeParent || initialParent;
    
    // 向上查找更大的父元素，直到找到包含足够文本的元素
    const COMMON_PARENT_MIN_TEXT_LENGTH = 100; // 最小文本长度阈值
    while (commonParent && commonParent.textContent.length < COMMON_PARENT_MIN_TEXT_LENGTH && commonParent.parentElement) {
        commonParent = commonParent.parentElement;
    }

    console.log("[DEBUG] findSentenceAcrossElements: 找到共同父元素:", commonParent);

    // 获取所有文本节点(只收集可见元素中的文本)
    const textNodes = [];
    const isYouTube = window.location.hostname.includes('youtube.com');
    const walker = document.createTreeWalker(
        commonParent,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // 忽略空文本节点
                if (!node.textContent.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }

                let element = node.parentElement;

                // YouTube 特定过滤:只允许字幕相关元素
                if (isYouTube) {
                    if (!isAllowedYouTubeElement(element)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                }

                // 检查文本节点的父元素是否可见
                while (element && element !== commonParent) {
                    const style = window.getComputedStyle(element);
                    // 检查元素是否隐藏
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
        textNodes.push(currentNode);
    }

    if (textNodes.length === 0) {
        console.warn("findSentenceAcrossElements: 未找到文本节点");
        return null;
    }

    console.log("[DEBUG] findSentenceAcrossElements: 找到文本节点数量:", textNodes.length);

    // 查找包含目标单词的文本节点
    const initialWord = detail.word;
    let initialNodeIndex = -1;
    for (let i = 0; i < textNodes.length; i++) {
        if (textNodes[i].textContent.includes(initialWord)) {
            initialNodeIndex = i;
            break;
        }
    }

    if (initialNodeIndex === -1) {
        console.warn("findSentenceAcrossElements: 未找到包含初始单词的文本节点");
        return null;
    }

    // 尝试在相邻的文本节点中查找句子的各个部分
    const sentenceWordDetails = [];
    const maxSearchRange = 5; // 向前后最多查找的节点数量

    // 构建完整的文本内容，包括相邻节点
    let fullText = "";
    const nodeStartPositions = []; // 记录每个节点在fullText中的起始位置
    const startIndex = Math.max(0, initialNodeIndex - maxSearchRange);
    const endIndex = Math.min(textNodes.length - 1, initialNodeIndex + maxSearchRange);

    for (let i = startIndex; i <= endIndex; i++) {
        nodeStartPositions.push(fullText.length);
        fullText += textNodes[i].textContent;
    }

    console.log("[DEBUG] findSentenceAcrossElements: 构建的完整文本:", fullText);

    // 在完整文本中查找句子
    const sentenceStartIndex = fullText.indexOf(targetSentenceText);
    if (sentenceStartIndex === -1) {
        console.warn("findSentenceAcrossElements: 在完整文本中未找到句子");
        return null;
    }

    console.log("[DEBUG] findSentenceAcrossElements: 在完整文本中找到句子，起始位置:", sentenceStartIndex);

    // 为每个单词找到其在对应文本节点中的位置
    let currentPosition = sentenceStartIndex;
    for (const word of targetWords) {
        // 跳过纯数字、标点符号等非语言类符号
        if (/^[\d\s\p{P}]+$/u.test(word)) {
            console.log(`[DEBUG] 跳过非语言符号: "${word}"`);
            continue;
        }

        // 从当前位置开始查找单词
        const wordIndex = fullText.indexOf(word, currentPosition);
        if (wordIndex === -1) {
            console.log(`[DEBUG] 在完整文本中未找到单词: "${word}"`);
            continue;
        }

        // 更新当前位置，确保下一次查找从这个单词之后开始
        currentPosition = wordIndex + word.length;

        // 确定单词所在的文本节点
        let nodeIndex = -1;
        let relativeOffset = -1;
        for (let i = 0; i < nodeStartPositions.length; i++) {
            const nodeStart = nodeStartPositions[i];
            const nodeEnd = (i < nodeStartPositions.length - 1) ?
                            nodeStartPositions[i + 1] :
                            fullText.length;

            if (wordIndex >= nodeStart && wordIndex < nodeEnd) {
                nodeIndex = startIndex + i;
                relativeOffset = wordIndex - nodeStart;
                break;
            }
        }

        if (nodeIndex !== -1 && relativeOffset !== -1) {
            // 找到单词所在的文本节点和偏移量
            sentenceWordDetails.push({
                word: word,
                parentNode: textNodes[nodeIndex],
                offset: relativeOffset
            });
            console.log(`[DEBUG] 找到单词 "${word}" 在节点 ${nodeIndex} 中的位置: ${relativeOffset}`);
        }
    }

    if (sentenceWordDetails.length === 0) {
        console.warn("findSentenceAcrossElements: 未找到任何单词详情");
        return null;
    }

    console.log("[DEBUG] findSentenceAcrossElements: 找到的单词详情数量:", sentenceWordDetails.length);
    return sentenceWordDetails;
}

// 添加事件监听器，监听bionic模式的启动和关闭
document.addEventListener('bionicActivated', function(event) {
  console.log('Bionic模式已启动，可能需要调整逐词高亮功能:', event.detail.message);
  // 这里可以添加特定的处理逻辑，例如调整高亮样式或暂停当前的高亮
});

document.addEventListener('bionicDeactivated', function(event) {
  console.log('Bionic模式已关闭，恢复正常的逐词高亮功能:', event.detail.message);
  // 这里可以添加特定的处理逻辑，例如恢复默认的高亮样式
});

// 确保所有函数都被导出到全局作用域
window.highlightSpecificWords = highlightSpecificWords;
window.getSentenceWordDetails = getSentenceWordDetails;
window.findSentenceAcrossElements = findSentenceAcrossElements;
window.handleBionicSentence = handleBionicSentence;
window.injectSelectionStyles = injectSelectionStyles;
window.removeSelectionStyles = removeSelectionStyles;

// 导出完成后，通知其他脚本
document.dispatchEvent(new CustomEvent('sentenseOoOoLoaded', { detail: { message: 'sentenseOoOo.js 加载完成' } }));
