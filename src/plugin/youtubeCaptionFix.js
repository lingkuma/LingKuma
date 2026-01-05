// ==UserScript==
// @name         YouTube AI 字幕插件
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  为 YouTube 视频添加自定义字幕显示，支持仿生阅读和拖动定位；使用setInterval精准暂停
// @author       You
// @match        https://www.youtube.com/watch*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// 日语分词现在似乎没啥问题，如果用户问，一段里为什么有多个句号，
// 这是因为youtube字幕原本的问题，youtube把多个句子放在了一个单词iteam里，
// 就导致我们无论怎么处理，都可能出现多个句号，不过这个问题对用户来说影响不大，所以就先不处理了。

// 还有\n的断句干扰


(function() {
    'use strict';

    // 全局变量
    let currentUrl = window.location.href;
    let subtitleUpdateInterval = null;
    let keydownHandler = null;
    let playHandler = null;

    chrome.storage.local.get({
        youtubeCaptionFix: false,
        youtubeCommaSentencing: false,
        youtubeBionicReading: true,
        youtubeFontSize: 24,
        youtubeFontFamily: 'Fanwood',
    }, function(result) {
        console.log("result: ", result);

        // 检查插件设置是否启用
        if (result.youtubeCaptionFix) {
            console.log("YouTube 字幕插件插件已启用，开始初始化...");
            // 保存逗号分句设置到全局变量
            window.youtubeCommaSentencingEnabled = result.youtubeCommaSentencing;
            console.log("逗号分句设置:", window.youtubeCommaSentencingEnabled);
            // 保存仿生阅读设置到全局变量
            window.youtubeBionicReadingEnabled = result.youtubeBionicReading !== undefined ? result.youtubeBionicReading : true;
            console.log("仿生阅读设置:", window.youtubeBionicReadingEnabled);
            // 保存字体设置到全局变量
            window.youtubeFontSize = result.youtubeFontSize !== undefined ? result.youtubeFontSize : 24;
            window.youtubeFontFamily = result.youtubeFontFamily !== undefined ? result.youtubeFontFamily : 'Fanwood';
            console.log("字体设置:", window.youtubeFontSize + 'px', window.youtubeFontFamily);
            initializePlugin();
            setupUrlMonitoring();
        } else {
            console.log("YouTube 字幕插件插件未启用。");
        }
    });

    // 初始化插件
    function initializePlugin() {
        // 检查是否是视频页面
        if (!window.location.href.includes('/watch?v=')) {
            console.log("不是视频页面，跳过初始化");
            return;
        }

        console.log("开始初始化YouTube字幕插件...");

        // 先清理旧实例
        cleanupPlugin();

        // 等待视频播放器加载完成后执行 main 函数
        waitForElement('#movie_player', main, 100, 30000);
    }

    // 清理插件
    function cleanupPlugin() {
        console.log("清理YouTube字幕插件...");

        // 清理定时器
        if (subtitleUpdateInterval) {
            clearInterval(subtitleUpdateInterval);
            subtitleUpdateInterval = null;
        }

        // 清理事件监听器
        if (keydownHandler) {
            document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }

        // 移除UI元素
        const existingContainer = document.getElementById('untertitle-drag-container');
        if (existingContainer) {
            existingContainer.remove();
            console.log("已移除旧的字幕容器");
        }
    }

    // 设置URL监控
    function setupUrlMonitoring() {
        // 定期检查URL变化
        setInterval(() => {
            const newUrl = window.location.href;
            if (newUrl !== currentUrl) {
                console.log("检测到URL变化:", currentUrl, "->", newUrl);
                currentUrl = newUrl;

                // 延迟重新初始化，确保页面已更新
                setTimeout(() => {
                    initializePlugin();
                }, 1500);
            }
        }, 1000);
    }

    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "updateYoutubeCommaSentencing") {
            console.log("收到逗号分句设置更新:", request.enabled);
            window.youtubeCommaSentencingEnabled = request.enabled;
            // 可以在这里添加其他需要更新的逻辑
        } else if (request.action === "updateYoutubeBionicReading") {
            console.log("收到仿生阅读设置更新:", request.enabled);
            window.youtubeBionicReadingEnabled = request.enabled;
            // 可以在这里添加其他需要更新的逻辑
        } else if (request.action === "updateYoutubeFontSize") {
            console.log("收到字体大小设置更新:", request.fontSize);
            window.youtubeFontSize = request.fontSize;
            // 更新字幕容器的字体大小
            const textElement = document.getElementById('untertitle-text');
            if (textElement) {
                textElement.style.fontSize = request.fontSize + 'px';
            }
        } else if (request.action === "updateYoutubeFontFamily") {
            console.log("收到字体样式设置更新:", request.fontFamily);
            window.youtubeFontFamily = request.fontFamily;
            // 更新字幕容器的字体样式
            const textElement = document.getElementById('untertitle-text');
            if (textElement) {
                const fontFamilyMap = {
                    'Fanwood': '"Fanwood", "LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
                    'LXGWWenKai': '"LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
                    'Arial': 'Arial, sans-serif',
                    'Helvetica': 'Helvetica, Arial, sans-serif',
                    'Times New Roman': '"Times New Roman", Times, serif',
                    'Georgia': 'Georgia, serif',
                    'Verdana': 'Verdana, sans-serif',
                    'Tahoma': 'Tahoma, sans-serif',
                    'Trebuchet MS': '"Trebuchet MS", sans-serif',
                    'Impact': 'Impact, sans-serif'
                };
                textElement.style.fontFamily = fontFamilyMap[request.fontFamily] || fontFamilyMap['Fanwood'];
            }
        }
    });











    // 等待页面加载完成
    function waitForElement(selector, callback, checkFrequencyInMs, timeoutInMs) {
        var startTimeInMs = Date.now();
        (function loopSearch() {
            if (document.querySelector(selector) != null) {
                callback();
                return;
            } else {
                setTimeout(function () {
                    if (timeoutInMs && Date.now() - startTimeInMs > timeoutInMs) {
                        return;
                    }
                    loopSearch();
                }, checkFrequencyInMs);
            }
        })();
    }

    // 主函数
    function main() {
        console.log("YouTube字幕插件主函数开始执行...");

        // 局部变量
        let subtitles = [];
        let rebuiltSubtitles = [];
        let currentSubtitleIndex = -1;
        let isReplayMode = false;
        let currentSubtitleInheiten = '';
        let isProgramTriggeredPlay = false;
        let isAIRequesting = false;
        let lastRequestTime = 0;
        let lastDisplayedTimestamp = -1;
        let cachedSegments = {};
        let videoElement = null;
        let lastSubtitleText = '';
        let skipSubtitleRefresh = false;

        // 获取标点符号正则表达式的函数
        function getPunctuationRegex() {
            // 根据设置决定是否包含逗号
            if (window.youtubeCommaSentencingEnabled) {
                // 包含逗号的完整标点符号集合
                return /[,.!?:;。、？！]/;
            } else {
                // 不包含逗号，只使用句号等结束符号
                return /[.!?:;。？！]/;
            }
        }

        // 添加可靠的视频元素获取函数
        function getVideoElement() {
            // 首先尝试使用局部变量
            if (videoElement) {
                return videoElement;
            }

            // 如果局部变量不存在，尝试查找并缓存
            const newVideoElement = document.querySelector('video');
            if (newVideoElement) {
                videoElement = newVideoElement; // 更新局部变量
                return videoElement;
            }

            // 如果没有找到，返回null
            return null;
        }

        // 获取youtube视频的当前时间
        function getYoutubeCurrentTime() {
            // 使用可靠的获取视频元素函数
            const video = getVideoElement();

            // 检查 video 是否存在并且有 currentTime 属性
            if (video && typeof video.currentTime === 'number') {
                return video.currentTime * 1000;
            } else {
                // console.warn("无法获取视频元素或 currentTime 属性不可用。"); // 减少控制台噪音，注释掉警告
                return 0; // 返回默认值
            }
        }

        // 添加设置视频时间的函数
        function setYoutubeTime(timeMs) {
            // 使用可靠的获取视频元素函数
            const video = getVideoElement();

            // 检查 video 是否存在
            if (video) {
                video.currentTime = timeMs / 1000;
            } else {
                console.warn("无法获取视频元素，无法设置时间。");
            }
        }

        // 控制视频播放状态的函数
        function playVideo() {
            const video = getVideoElement();
            if (video) {
                try {
                    // 使用Promise确保play()方法执行成功
                    const playPromise = video.play();

                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.warn('播放视频时出错:', error);
                        });
                    }
                } catch (e) {
                    console.warn('调用play()方法时出错:', e);
                }
            } else {
                console.warn("无法获取视频元素，无法播放视频。");
            }
        }

        // 暂停视频的函数
        function pauseVideo() {
            const video = getVideoElement();
            if (video) {
                try {
                    video.pause();
                } catch (e) {
                    console.warn('调用pause()方法时出错:', e);
                }
            } else {
                console.warn("无法获取视频元素，无法暂停视频。");
            }
        }

        function getYoutubeID() {
            const videoURL = window.location.href;

            var splited = videoURL.split("v=");
            if (splited.length < 2) return null;

            var splitedAgain = splited[1].split("&");
            var videoId = splitedAgain[0];
            console.log("videoId: ", videoId);
            return videoId;
        }

        // 通过官方API获取YouTube字幕（直接获取而不使用第三方服务）

            async function getYoutubeSubtitlesAPI() {
                try {
                  // 等待获取字幕URL
                  console.log('开始获取字幕URL...');
                  const url = await window.forceSubtitleAndGetJsonUrl();

                  if (url) {
                    console.log(`成功获取字幕URL: ${url}`);
                    return await getTrackData(url);
                  } else {
                    console.log('无法获取字幕URL');
                    return null;
                  }

                  // 5. 获取指定字幕数据
                  async function getTrackData(subtitleUrl) {
                    console.log(`正在获取json字幕: ${subtitleUrl}`);

                    try {
                      // 获取字幕内容
                      const subtitleResponse = await fetch(subtitleUrl);
                      const subtitleData = await subtitleResponse.json();

                      console.log('字幕数据获取成功');
                      return subtitleData;
                    } catch (fetchError) {
                      console.error('获取字幕内容时出错:', fetchError);
                      return null;
                    }
                  }
                } catch (error) {
                  console.error('获取字幕时出错:', error);
                  return null;
                }
              }


        // 函数：将字幕数据重组为单词级时间轴
        function rebuildSubtitles(subtitleData) {
            const result = [];
            const words = [];

            // 使用动态的标点符号正则表达式
            const punctuationRegex = getPunctuationRegex();

            // 检查数据结构，获取正确的字幕数组
            const events = subtitleData.events || [];

            // 遍历所有段落
            events.forEach(paragraph => {
                // 获取段落的开始时间
                const paragraphStartTime = paragraph.tStartMs;

                // 遍历段落中的所有片段
                if (paragraph.segs) {
                    paragraph.segs.forEach(segment => {
                        // 跳过只包含换行符的片段
                        if (segment.utf8 === "\n") return;

                        // 计算单词的开始和结束时间
                        let wordStartTime = paragraphStartTime;
                        if (segment.tOffsetMs !== undefined) {
                            wordStartTime += segment.tOffsetMs;
                        }

                        let wordText = segment.utf8.trim();
                        if (wordText === "") return;

                        // 检查单词是否包含标点符号
                        const hasPunctuation = punctuationRegex.test(wordText);
                        let punctuation = null;

                        // 如果包含标点符号，将其分离出来
                        if (hasPunctuation) {
                            // 查找最后一个标点符号
                            const lastChar = wordText.charAt(wordText.length - 1);
                            if (punctuationRegex.test(lastChar)) {
                                punctuation = lastChar;
                                // 移除标点符号
                                wordText = wordText.substring(0, wordText.length - 1).trim();
                            }
                        }

                        // 如果处理后的单词为空，跳过
                        if (wordText === "") return;

                        // 计算单词的结束时间（如果有下一个单词，则为下一个单词的开始时间；否则为段落结束时间）
                        let wordEndTime = paragraphStartTime + paragraph.dDurationMs;

                        // 添加单词到结果数组
                        words.push({
                            utf8: wordText,
                            tStartMs: wordStartTime,
                            tEndMs: wordEndTime,
                            punctuation: punctuation // 保存标点符号信息
                        });
                    });
                }
            });

            // 修正单词的结束时间（使用下一个单词的开始时间）
            for (let i = 0; i < words.length - 1; i++) {
                words[i].tEndMs = words[i + 1].tStartMs;
            }

            // 构建结果数组，将单词和标点符号分开存储
            for (let i = 0; i < words.length; i++) {
                // 添加单词
                result.push(words[i]);

                // 添加标点符号数组（如果有标点符号）
                const punctuationArray = words[i].punctuation ? [words[i].punctuation] : [];
                result.push(punctuationArray);
            }

            console.log("重建字幕结构，处理了原生标点符号");
            return result;
        }

        // 获取时间戳附近的单词
        function getWordsAroundTimestamp(timestamp, subtitles, wordCount = 50) {
            // 找到最接近时间戳的单词索引
            let closestIndex = -1;
            let minTimeDiff = Infinity;

            // 遍历所有元素找到匹配的时间戳
            for (let i = 0; i < subtitles.length; i++) {
                const element = subtitles[i];

                // 跳过空数组或undefined
                if (!element || Array.isArray(element) || !element.utf8) continue;

                // 检查单词是否在时间戳范围内
                if (timestamp >= element.tStartMs && timestamp <= element.tEndMs) {
                    closestIndex = i;
                    break;
                }

                // 如果没有直接匹配，找最接近的
                const timeDiff = Math.min(
                    Math.abs(timestamp - element.tStartMs),
                    Math.abs(timestamp - element.tEndMs)
                );

                if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestIndex = i;
                }
            }

            if (closestIndex === -1) {
                return []; // 没有找到匹配的单词，返回空数组
            }



            // 计算要返回的数组范围
            let startIndex = Math.max(0, closestIndex - 200);
            let endIndex = Math.min(subtitles.length - 1, closestIndex + 200);

            // 确保返回的总数量不超过200个元素
            const totalElements = endIndex - startIndex + 1;
            if (totalElements > 400) {
                const excess = totalElements - 400;
                // 从两端平均减少
                startIndex += Math.floor(excess / 2);
                endIndex -= Math.ceil(excess / 2);
            }

            // 创建新的返回数组
            const result = [];

            for (let i = startIndex; i <= endIndex; i++) {
                const element = subtitles[i];
                // 跳过空数组
                if (Array.isArray(element) && element.length === 0) {
                    continue;
                }
                // 将原始索引和元素信息一起添加到结果数组
                result.push({
                    originalIndex: i,
                    data: element
                });
            }

            return result;
        }

        // 单词合并成句子
        function mergeWordsIntoSentences(words) {
            let result = '';

            // 遍历所有词项
            for (let i = 0; i < words.length; i++) {
                const item = words[i];

                // 确保item有data属性
                if (!item || !item.data) continue;

                // 如果data是对象且有utf8属性，说明是单词
                if (item.data && typeof item.data === 'object' && item.data.utf8) {
                    // 添加空格，除非是第一个单词
                    if (result.length > 0) {
                        result += ' ';
                    }

                    // 添加单词内容
                    result += item.data.utf8;
                }
            }

            return result.trim();
        }

        // 日语字幕滑动窗口处理器
        class JapaneseSubtitleProcessor {
            constructor(options = {}) {
                this.windowSize = options.windowSize || 10; // 适中的窗口大小
                this.multiplier = options.multiplier || 2.6; // 适中的倍数阈值 ，大于最小用倍数分割。
                this.minGap = options.minGap || 300; // 降低最小间隔，捕获对话切换 小于就合并。
                this.maxGap = options.maxGap || 3000; // 适中的最大间隔 大于就分割
            }

            // 检测文本是否为日语
            isJapaneseText(text) {
                return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
            }

            // 从当前句子的单词中提取时间间隔信息
            extractTimeGaps(words) {
                const gaps = [];

                for (let i = 1; i < words.length; i++) {
                    const prevWord = words[i-1];
                    const currentWord = words[i];

                    // 跳过标点符号数组
                    if (Array.isArray(prevWord.data) || Array.isArray(currentWord.data)) {
                        continue;
                    }

                    const prevTime = prevWord.data?.tStartMs || 0;
                    const currentTime = currentWord.data?.tStartMs || 0;
                    const gap = Math.max(0, currentTime - prevTime);

                    gaps.push({
                        index: i - 1,
                        gap: gap,
                        beforeWord: prevWord,
                        afterWord: currentWord
                    });
                }

                return gaps;
            }

            // 计算滑动窗口平均值（排除异常长的间隔）
            calculateWindowAverage(gaps, centerIndex) {
                const halfWindow = Math.floor(this.windowSize / 2);
                const startIndex = Math.max(0, centerIndex - halfWindow);
                const endIndex = Math.min(gaps.length - 1, centerIndex + halfWindow);

                let sum = 0;
                let count = 0;
                const outlierThreshold = 1500; // 超过1000ms的间隔不参与平均值计算

                for (let i = startIndex; i <= endIndex; i++) {
                    if (i !== centerIndex && gaps[i].gap <= outlierThreshold) {
                        sum += gaps[i].gap;
                        count++;
                    }
                }

                // 如果窗口内没有有效的短间隔，使用全局短间隔的平均值
                if (count === 0) {
                    const shortGaps = gaps.filter(g => g.gap <= outlierThreshold);
                    if (shortGaps.length > 0) {
                        return shortGaps.reduce((acc, g) => acc + g.gap, 0) / shortGaps.length;
                    } else {
                        return this.minGap; // 如果没有短间隔，返回最小阈值
                    }
                }

                return sum / count;
            }

            // 找到句子边界
            findSentenceBoundaries(gaps) {
                const boundaries = new Set();

                // 如果间隔太少，不进行分割
                if (gaps.length < 2) {
                    return boundaries;
                }

                for (let i = 0; i < gaps.length; i++) {
                    const currentGap = gaps[i].gap;

                    if (currentGap < this.minGap) continue;

                    // 超长间隔直接分割（可能是对话切换）
                    if (currentGap > this.maxGap) {
                        boundaries.add(gaps[i].index + 1);
                        continue;
                    }

                    const windowAverage = this.calculateWindowAverage(gaps, i);

                    // 显著长于平均值的间隔分割
                    if (currentGap > windowAverage * this.multiplier) {
                        const currentIndex = gaps[i].index + 1;

                        // 检查是否与上一个边界距离合理
                        const lastBoundary = Math.max(...Array.from(boundaries), -1);
                        const distance = currentIndex - lastBoundary;

                        // 如果距离太近（<2词），只有在间隔特别长时才分割
                        if (distance < 2 && currentGap < this.maxGap * 0.8) {
                            continue;
                        }

                        // 如果距离适中（2-4词），正常分割
                        // 如果距离较远（>4词），降低阈值以避免过长句子
                        if (distance >= 2) {
                            boundaries.add(currentIndex);
                        }
                    }
                }

                return boundaries;
            }

            // 处理日语句子，添加标点符号
            processJapaneseSentence(words) {
                // 检查是否为日语文本
                const hasJapanese = words.some(word =>
                    word.data && word.data.utf8 && this.isJapaneseText(word.data.utf8)
                );

                if (!hasJapanese) {
                    return null; // 不是日语，返回null表示不处理
                }

                // 提取时间间隔
                const gaps = this.extractTimeGaps(words);

                if (gaps.length === 0) {
                    return null; // 没有足够的数据进行分析
                }

                // 找到句子边界
                const boundaries = this.findSentenceBoundaries(gaps);

                if (boundaries.size === 0) {
                    return null; // 没有找到边界
                }

                // 返回需要插入标点符号的位置信息
                return {
                    boundaries: Array.from(boundaries).sort((a, b) => a - b),
                    words: words
                };
            }
        }

        // 创建日语处理器实例
        const japaneseProcessor = new JapaneseSubtitleProcessor();

        // 发送文本到AI添加标点符号
        async function sendToAIForPunctuation(text) {
            // 设置 API 参数 - 已移除 baseUrl 和 apiKey，将由 makeAIRequest 处理
            // const baseUrl = "https://ki/v1/chat/completions"; // 可修改为其他兼容的 API 基础 URL - 已移除
            // const apiKey = "sk-QyJXkS7O4FguvqfXEeEb772eBc234b03Bb4b97Cf271965B8"; // 请替换为您的 API 密钥 - 已移除

            // 1. 获取 AI 配置 (特别是 youtube 字幕的提示词)
            //    我们从 chrome.storage.local 获取 aiConfig 对象
            const result = await new Promise(resolve => chrome.storage.local.get('aiConfig', resolve));
            const aiConfig = result?.aiConfig || {};
            //    获取在选项页设置的 YouTube 字幕提示词 (aiYoutubeCaptionPrompt)
            const customPrompt = aiConfig.aiYoutubeCaptionPrompt;

            // 2. 构建提示词
            //    如果用户设置了自定义提示词，则使用它，并替换 {text} 占位符
            //    否则，使用一个默认的提示词，指导 AI 添加标点


            const defaultPrompt = `
                        你将按照以下要求，为Youtube字幕添加适当的标点符号。
                        1.每个逗号小段不要过长或者过短，要和正常的说话停顿相匹配，比如德语里的und,oder,aber,等等在很长的句子历史可以用逗号添加一个作为停顿的
                        2.但不要添加或修改任何单词。
                        3.仅添加标点符号，如逗号、句号、问号等。
                        4.开始和结果的句子可能是其他句子的截断，可以酌情不添加标点符号。
                        5.不要添加任何解释或者备注,直接返回带标点的文本。
                        6.如果文本是日文，请保留原文中的空格，且不要换行。
                        `


            const promptText = customPrompt
                ? customPrompt // 假设自定义提示词使用 {text} 占位符
                : defaultPrompt



            // 准备请求内容
            const requestBody = {
                model: "flash", // 也可以使用其他支持的模型，将传递给 makeAIRequest
                messages: [
                    {
                        role: "system",
                        content: promptText
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                // 注意: makeAIRequest 目前不传递 temperature 和 max_tokens
                // 如果需要，需要修改 makeAIRequest 函数本身
                temperature: 0.3,
                max_tokens: 1000
            };

            console.log("发送文本到AI：", text);

            // 使用 makeAIRequest 替换 fetch 调用
            try {
                // 调用 makeAIRequest 函数 (假设它在当前作用域可用)
                // word 和 sentence 在此场景下不相关，传 null
                // stream 设置为 false
                // model 从 requestBody 中获取，覆盖 makeAIRequest 中的默认模型
                const data = await makeAIRequest({
                    word: null,
                    sentence: null,
                    stream: false,
                    messages: requestBody.messages,
                    model: null,
                    temperature: 0.3
                });

                // 处理响应 (逻辑与之前相同)
                if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                    const punctuatedText = data.choices[0].message.content.trim();
                    console.log("AI 返回的带标点文本:", punctuatedText);
                    return punctuatedText;
                } else {
                    console.error("API 返回了意外格式:", data);
                    throw new Error("无法从 API 响应中获取文本");
                }
            } catch (error) {
                // 捕获 makeAIRequest 或后续处理中的错误
                console.error("调用 AI API 时出错:", error);
                // 出错时返回原始文本，这样至少不会丢失内容
                return text;
            }
        }

        // 格式化AI结果
        function formatAIResult(text, words) {
            // 如果words或text为空，直接返回原始文本
            if (!words || words.length === 0 || !text) {
                return text;
            }

            // 获取words中第一个有效单词
            let firstWord = null;
            for (let i = 0; i < words.length; i++) {
                if (words[i] && words[i].data && typeof words[i].data === 'object' && words[i].data.utf8) {
                    firstWord = words[i].data.utf8;
                    break;
                }
            }

            // 如果找不到第一个单词，返回原始文本
            if (!firstWord) {
                return text;
            }

            // 在AI返回的文本中查找第一个单词
            const firstWordIndex = text.indexOf(firstWord);

            // 如果找到了第一个单词，删除它之前的所有内容
            let result = text;
            if (firstWordIndex !== -1) {
                result = text.substring(firstWordIndex);
            }

            // 删除文本末尾的省略号
            result = result.replace(/[…\.]{3,}$/, '').trim();

            // 换行
            result = result.replace(/\n/g, '');

            console.log("格式化AI结果：", result);
            return result;
        }

        // 将AI添加的标点符号提取并插入到字幕数据结构中
        function insertPunctuationIntoSubtitles(text, punctuatedText, words, subtitles) {
            // 不改变原始subtitles数组，创建一个副本
            const updatedSubtitles = [...subtitles];

            // 使用动态的标点符号正则表达式
            const punctuationRegex = getPunctuationRegex();

            // 根据设置构建匹配正则表达式
            let regex;
            if (window.youtubeCommaSentencingEnabled) {
                // 包含逗号的完整标点符号集合
                regex = /([^\s,.!?:;。、？！]+)([,.!?:;。、？！])/g;
            } else {
                // 不包含逗号，只使用句号等结束符号
                regex = /([^\s.!?:;。？！]+)([.!?:;。？！])/g;
            }

            let match;

            // 保存已处理的单词索引，避免重复处理
            const processedWordIndices = new Set();

            // 首先处理[music]标记
            const musicRegex = /\[music\]/g;
            let musicMatch;
            while ((musicMatch = musicRegex.exec(punctuatedText)) !== null) {
                // 在words数组中查找[music]标记的位置
                for (let i = 0; i < words.length; i++) {
                    const wordItem = words[i];
                    if (wordItem && wordItem.data && wordItem.data.utf8 === "[music]") {
                        const originalIndex = wordItem.originalIndex;
                        // 在[music]标记后添加句号
                        const nextArrayIndex = originalIndex + 1;
                        if (nextArrayIndex < updatedSubtitles.length &&
                            Array.isArray(updatedSubtitles[nextArrayIndex])) {
                            updatedSubtitles[nextArrayIndex] = ["。"];
                            break;
                        }
                    }
                }
            }

            // 逐个处理匹配到的标点符号
            while ((match = regex.exec(punctuatedText)) !== null) {
                const word = match[1]; // 标点符号前的单词
                const punctuation = match[2]; // 标点符号本身

                // 在words数组中查找匹配的单词
                for (let i = 0; i < words.length; i++) {
                    if (processedWordIndices.has(i)) continue; // 跳过已处理的单词

                    const wordItem = words[i];
                    if (wordItem && wordItem.data && wordItem.data.utf8 === word) {
                        // 找到匹配的单词，将标点符号插入到其后的空数组中
                        const originalIndex = wordItem.originalIndex;
                        const nextArrayIndex = originalIndex + 1;

                        // 确保下一个索引是空数组
                        if (nextArrayIndex < updatedSubtitles.length &&
                            Array.isArray(updatedSubtitles[nextArrayIndex])) {
                            // 将标点符号添加到数组中
                            updatedSubtitles[nextArrayIndex] = [punctuation];
                            processedWordIndices.add(i); // 标记为已处理
                            break;
                        }
                    }
                }
            }

            // 处理句尾标点符号（如果文本以标点符号结尾）
            let lastPuncMatch;
            if (window.youtubeCommaSentencingEnabled) {
                // 包含逗号的完整标点符号集合
                lastPuncMatch = punctuatedText.match(/([^\s,.!?:;。、？！]+)([,.!?:;。、？！])$/);
            } else {
                // 不包含逗号，只使用句号等结束符号
                lastPuncMatch = punctuatedText.match(/([^\s.!?:;。？！]+)([.!?:;。？！])$/);
            }

            if (lastPuncMatch) {
                const lastWord = lastPuncMatch[1];
                const lastPunc = lastPuncMatch[2];

                // 在words数组中查找最后一个单词
                for (let i = words.length - 1; i >= 0; i--) {
                    const wordItem = words[i];
                    if (wordItem && wordItem.data && wordItem.data.utf8 === lastWord) {
                        const originalIndex = wordItem.originalIndex;
                        const nextArrayIndex = originalIndex + 1;

                        if (nextArrayIndex < updatedSubtitles.length &&
                            Array.isArray(updatedSubtitles[nextArrayIndex])) {
                            updatedSubtitles[nextArrayIndex] = [lastPunc];
                            break;
                        }
                    }
                }
            }

            return updatedSubtitles;
        }



        // 异步获取YouTube字幕
        async function getYoutubeSubtitles() {
            const videoId = getYoutubeID();
            if (!videoId) {
                console.error("无法获取视频ID");
                return [];
            }

            try {
                // 使用新的方式获取字幕
                const subtitleData = await getYoutubeSubtitlesAPI(videoId);

                if (subtitleData) {
                    console.log("字幕数据已加载");
                    subtitles = subtitleData;
                    // 重建字幕结构
                    rebuiltSubtitles = rebuildSubtitles(subtitleData);
                    console.log("字幕已重建，共有单词：", rebuiltSubtitles.length);
                    return rebuiltSubtitles;
                } else {
                    console.error("获取字幕失败");
                    return [];
                }
            } catch (error) {
                console.error("获取字幕时发生错误:", error);
                return [];
            }
        }

        // 获取当前时间戳对应的字幕片段
        function getCurrentSentence(currentTime, subtitles) {
            // 获取当前时间戳附近的单词
            const wordsAround = getWordsAroundTimestamp(currentTime, subtitles);

            if (!wordsAround || wordsAround.length === 0) {
                return null;
            }

            // 使用动态的标点符号正则表达式
            const punctuationRegex = getPunctuationRegex();

            // 找到当前时间对应的单词索引
            let currentWordIndex = -1;
            for (let i = 0; i < wordsAround.length; i++) {
                const wordItem = wordsAround[i];
                if (wordItem && wordItem.data && !Array.isArray(wordItem.data) &&
                    currentTime >= wordItem.data.tStartMs && currentTime <= wordItem.data.tEndMs) {
                    currentWordIndex = i;
                    break;
                }
            }

            // 没有找到当前单词，使用最接近的单词
            if (currentWordIndex === -1) {
                // 寻找最接近当前时间的单词
                let minTimeDiff = Infinity;
                for (let i = 0; i < wordsAround.length; i++) {
                    const wordItem = wordsAround[i];
                    if (wordItem && wordItem.data && !Array.isArray(wordItem.data)) {
                        const midTime = (wordItem.data.tStartMs + wordItem.data.tEndMs) / 2;
                        const timeDiff = Math.abs(currentTime - midTime);
                        if (timeDiff < minTimeDiff) {
                            minTimeDiff = timeDiff;
                            currentWordIndex = i;
                        }
                    }
                }

                // 如果还是找不到，使用第一个单词
                if (currentWordIndex === -1) {
                    currentWordIndex = 0;
                }
            }

            // 查找当前片段的边界（向前找到最近的标点符号）
            let segmentStartIndex = 0;
            for (let i = currentWordIndex - 1; i >= 0; i--) {
                // 更新：使用新的标点符号正则判断
                // 之前的判断: /[,.!?;:。，！？]/.test(wordsAround[i].data[0])
                if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                    wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                    segmentStartIndex = i + 1;
                    break;
                }
            }

            // 向后找片段结尾（下一个标点符号）
            let segmentEndIndex = wordsAround.length - 1;
            for (let i = currentWordIndex; i < wordsAround.length; i++) {
                // 更新：使用新的标点符号正则判断
                // 之前的判断: /[,.!?;:。，！？]/.test(wordsAround[i].data[0])
                if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                    wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                    segmentEndIndex = i;
                    break;
                }
            }

            // 提取当前片段的单词
            const segmentWords = wordsAround.slice(segmentStartIndex, segmentEndIndex + 1);

            // 更新当前字幕索引
            if (wordsAround[currentWordIndex]) {
                currentSubtitleIndex = wordsAround[currentWordIndex].originalIndex;
            }

            return {
                words: segmentWords,
                currentIndex: currentSubtitleIndex
            };
        }

        // 替换原有的getCurrentSubtitles函数
        function getCurrentSubtitles() {
            // 在函数内部获取视频元素
            // const videoElement = document.querySelector('video');


            // if (!videoElement || !rebuiltSubtitles || rebuiltSubtitles.length === 0) {
            //     return null;
            // }

            if (isReplayMode) {
                return currentSubtitleInheiten;
            }



            const currentTime =  getYoutubeCurrentTime()
            // console.log("当前时间：", currentTime);
            // 获取当前时间戳对应的完整句子而不是所有单词
            const currentSentence = getCurrentSentence(currentTime, rebuiltSubtitles);
            currentSubtitleInheiten = currentSentence;
            // console.log("当前句子：", currentSentence);

            // 如果没有找到句子，返回null获取视频ID
            if (!currentSentence) {
                return null;
            }

            // 检查是否需要请求AI添加标点
            const now = Date.now();
            if (!isAIRequesting && (now - lastRequestTime > 5000)) {


                // 检查当前句子是否已经有标点符号
                let hasExistingPunctuation = false;
                for (let i = 0; i < currentSentence.words.length; i++) {
                    const wordItem = currentSentence.words[i];
                    // 检查是否存在标点符号数组
                    if (wordItem && Array.isArray(wordItem.data) &&
                        wordItem.data[0] && /[,.!?;:。，！？]/.test(wordItem.data[0])) {
                        hasExistingPunctuation = true;
                        console.log("当前句子已有标点符号，无需请求AI");
                        break;
                    }
                }

                // 只有当没有现有标点符号时才处理
                if (!hasExistingPunctuation) {
                    // 创建缓存键（使用显示文本的范围作为键）
                    const cacheKey = `${currentSentence.words[0].originalIndex}-${currentSentence.words[currentSentence.words.length-1].originalIndex}`;

                    // 检查是否已缓存
                    if (!cachedSegments[cacheKey]) {
                        // 检查是否为日语文本
                        const hasJapanese = currentSentence.words.some(word =>
                            word.data && word.data.utf8 && /[\u3040-\u309F\u30A0-\u30FF]/.test(word.data.utf8)
                        );

                        if (hasJapanese) {
                            console.log("检测到日语文本，使用滑动窗口算法添加标点");

                            try {
                                // 使用日语处理器处理句子
                                const processResult = japaneseProcessor.processJapaneseSentence(currentSentence.words);

                                if (processResult && processResult.boundaries.length > 0) {
                                    // 在边界位置插入标点符号
                                    let insertOffset = 0;

                                    for (const boundaryIndex of processResult.boundaries) {
                                        const wordIndex = currentSentence.words[boundaryIndex].originalIndex;
                                        const insertIndex = wordIndex + insertOffset;

                                        // 在rebuiltSubtitles中插入标点符号
                                        if (insertIndex < rebuiltSubtitles.length) {
                                            rebuiltSubtitles.splice(insertIndex, 0, ['。']);
                                            insertOffset++;
                                        }
                                    }

                                    console.log(`日语标点符号添加成功，插入了${processResult.boundaries.length}个句号`);
                                } else {
                                    console.log("日语文本未找到合适的分割点");
                                }

                                // 缓存处理结果
                                cachedSegments[cacheKey] = true;

                                // 强制刷新当前显示的字幕
                                lastSubtitleText = "";

                            } catch (error) {
                                console.error("日语标点处理出错:", error);
                            }
                        } else {
                            console.log("非日语文本，使用AI添加标点");

                            isAIRequesting = true;
                            lastRequestTime = now;

                            // 合并单词成句子
                            const mergedText = mergeWordsIntoSentences(currentSentence.words);

                            // 异步处理AI请求
                            sendToAIForPunctuation(mergedText).then(punctuatedText => {
                                // 格式化AI结果
                                const formattedText = formatAIResult(punctuatedText, currentSentence.words);

                                // 尝试将标点插入到字幕中
                                try {
                                    const updatedSubtitles = insertPunctuationIntoSubtitles(
                                        mergedText, formattedText, currentSentence.words, rebuiltSubtitles);

                                    // 更新全局字幕结构
                                    rebuiltSubtitles = updatedSubtitles;

                                    // 缓存处理结果
                                    cachedSegments[cacheKey] = true;

                                    console.log("AI标点符号添加成功");

                                    // 强制刷新当前显示的字幕
                                    lastSubtitleText = "";

                                } catch (error) {
                                    console.error("处理AI结果时出错:", error);
                                    // 延迟后重试
                                    setTimeout(() => {
                                        delete cachedSegments[cacheKey];
                                    }, 10000);
                                }

                                isAIRequesting = false;
                            }).catch(error => {
                                console.error("AI请求失败:", error);
                                isAIRequesting = false;
                                // 延迟后允许重试
                                setTimeout(() => {
                                    delete cachedSegments[cacheKey];
                                }, 10000);
                            });
                        }
                    }
                }
            }

            // 返回当前句子
            // console.log("返回当前句子：", currentSentence);
            return currentSentence;
        }

        // 用于预加载
        function getTimeSubtitles(currentTime) {

            // 检查是否有字幕数据
            if (!rebuiltSubtitles || rebuiltSubtitles.length === 0) {
                return null;
            }

            // 获取当前时间戳对应的完整句子而不是所有单词
            const currentSentence = getCurrentSentence(currentTime, rebuiltSubtitles);
            // console.log("当前句子：", currentSentence);

            // 如果没有找到句子，返回null
            if (!currentSentence) {
                return null;
            }

            // 检查是否需要请求AI添加标点
            const now = Date.now();
            if (!isAIRequesting && (now - lastRequestTime > 5000)) {


                // 检查当前句子是否已经有标点符号
                let hasExistingPunctuation = false;
                for (let i = 0; i < currentSentence.words.length; i++) {
                    const wordItem = currentSentence.words[i];
                    // 检查是否存在标点符号数组
                    if (wordItem && Array.isArray(wordItem.data) &&
                        wordItem.data[0] && /[,.!?;:。，！？]/.test(wordItem.data[0])) {
                        hasExistingPunctuation = true;
                        console.log("预加载：当前句子已有标点符号，无需请求AI");
                        break;
                    }
                }

                // 只有当没有现有标点符号时才请求AI
                if (!hasExistingPunctuation) {
                    console.log("预加载开始：需要请求AI添加标点", currentTime);

                    // 创建缓存键（使用显示文本的范围作为键）
                    const cacheKey = `${currentSentence.words[0].originalIndex}-${currentSentence.words[currentSentence.words.length-1].originalIndex}`;

                    // 检查是否已缓存
                    if (!cachedSegments[cacheKey]) {
                        // 检查是否为日语文本
                        const hasJapanese = currentSentence.words.some(word =>
                            word.data && word.data.utf8 && /[\u3040-\u309F\u30A0-\u30FF]/.test(word.data.utf8)
                        );

                        if (hasJapanese) {
                            console.log("预加载：检测到日语文本，使用滑动窗口算法添加标点");

                            try {
                                // 使用日语处理器处理句子
                                const processResult = japaneseProcessor.processJapaneseSentence(currentSentence.words);

                                if (processResult && processResult.boundaries.length > 0) {
                                    // 在边界位置插入标点符号
                                    let insertOffset = 0;

                                    for (const boundaryIndex of processResult.boundaries) {
                                        const wordIndex = currentSentence.words[boundaryIndex].originalIndex;
                                        const insertIndex = wordIndex + insertOffset;

                                        // 在rebuiltSubtitles中插入标点符号
                                        if (insertIndex < rebuiltSubtitles.length) {
                                            rebuiltSubtitles.splice(insertIndex, 0, ['。']);
                                            insertOffset++;
                                        }
                                    }

                                    console.log(`预加载：日语标点符号添加成功，插入了${processResult.boundaries.length}个句号`);
                                } else {
                                    console.log("预加载：日语文本未找到合适的分割点");
                                }

                                // 缓存处理结果
                                cachedSegments[cacheKey] = true;

                            } catch (error) {
                                console.error("预加载：日语标点处理出错:", error);
                            }
                        } else {
                            console.log("预加载：非日语文本，使用AI添加标点");

                            isAIRequesting = true;
                            lastRequestTime = now;

                            // 合并单词成句子
                            const mergedText = mergeWordsIntoSentences(currentSentence.words);

                            // 异步处理AI请求
                            sendToAIForPunctuation(mergedText).then(punctuatedText => {
                                // 格式化AI结果
                                const formattedText = formatAIResult(punctuatedText, currentSentence.words);

                                // 尝试将标点插入到字幕中
                                try {
                                    const updatedSubtitles = insertPunctuationIntoSubtitles(
                                        mergedText, formattedText, currentSentence.words, rebuiltSubtitles);

                                    // 更新全局字幕结构
                                    rebuiltSubtitles = updatedSubtitles;

                                    // 缓存处理结果
                                    cachedSegments[cacheKey] = true;

                                    console.log("预加载：AI标点符号添加成功");

                                    // 强制刷新当前显示的字幕
                                    lastSubtitleText = "";

                                } catch (error) {
                                    console.error("预加载：处理AI结果时出错:", error);
                                    // 延迟后重试
                                    setTimeout(() => {
                                        delete cachedSegments[cacheKey];
                                    }, 10000);
                                }

                                isAIRequesting = false;
                            }).catch(error => {
                                console.error("预加载：AI请求失败:", error);
                                isAIRequesting = false;
                                // 延迟后允许重试
                                setTimeout(() => {
                                    delete cachedSegments[cacheKey];
                                }, 10000);
                            });
                        }
                    }
                }
            }

            // 返回当前句子
            // console.log("返回当前句子：", currentSentence);
            return currentSentence;
        }


        // 负责找到上一句和下一句的时间戳。然后跳过去。而字幕的刷新时靠定时器来刷新的。
        // 导航到上一句/当前句/下一句字幕
        function navigateSubtitles(direction) {
            if (!rebuiltSubtitles || rebuiltSubtitles.length === 0) return;

            // 获取当前时间戳
            const currentTime = getYoutubeCurrentTime();

            // 获取当前句子
            const currentSentence = getCurrentSentence(currentTime, rebuiltSubtitles);
            if (!currentSentence || !currentSentence.words || currentSentence.words.length === 0) {
                console.log("无法获取当前句子");
                return;
            }

            // 使用动态的标点符号正则表达式
            const punctuationRegex = getPunctuationRegex();

            // 定义查找目标句子的函数
            function findTargetSentence() {
                if (direction === 'current') {

                    currentSubtitleInheiten = currentSentence;
                    return currentSentence;
                }

                // 获取当前句子的开始和结束索引
                const firstWordItem = currentSentence.words[0];
                const lastWordItem = currentSentence.words[currentSentence.words.length - 1];

                if (!firstWordItem || !lastWordItem) return null;

                const currentStartIndex = firstWordItem.originalIndex;
                const currentEndIndex = lastWordItem.originalIndex;

                if (direction === 'prev') {
                    // 查找前一个句子：向前找到最近的标点符号
                    let prevSentenceEndIndex = -1;

                    // 从当前句子的起始位置向前查找
                    for (let i = currentStartIndex - 1; i >= 0; i--) {
                        // 更新：使用新的标点符号正则判断
                        // 之前的判断: /[,.!?;:。，！？]/.test(rebuiltSubtitles[i][0])
                        if (Array.isArray(rebuiltSubtitles[i]) &&
                            rebuiltSubtitles[i][0] &&
                            punctuationRegex.test(rebuiltSubtitles[i][0])) {
                            prevSentenceEndIndex = i;
                            break;
                        }
                    }

                    // 如果找到了前一句的结束位置
                    if (prevSentenceEndIndex > 0) {
                        // 再向前查找这个句子的开始位置（再上一个标点符号）
                        let prevSentenceStartIndex = 0;
                        for (let i = prevSentenceEndIndex - 1; i >= 0; i--) {
                            // 更新：使用新的标点符号正则判断
                            // 之前的判断: /[,.!?;:。，！？]/.test(rebuiltSubtitles[i][0])
                            if (Array.isArray(rebuiltSubtitles[i]) &&
                                rebuiltSubtitles[i][0] &&
                                punctuationRegex.test(rebuiltSubtitles[i][0])) {
                                prevSentenceStartIndex = i + 1;
                                break;
                            }
                        }

                        // 构建前一句的单词列表
                        const prevSentenceWords = [];
                        for (let i = prevSentenceStartIndex; i <= prevSentenceEndIndex; i++) {
                            prevSentenceWords.push({
                                originalIndex: i,
                                data: rebuiltSubtitles[i]
                            });
                        }

                        return {
                            words: prevSentenceWords,
                            currentIndex: prevSentenceStartIndex
                        };
                    }
                } else if (direction === 'next') {
                    // 查找下一个句子：向后找到最近的标点符号
                    let nextSentenceStartIndex = -1;

                    // 从当前句子的结束位置向后查找
                    for (let i = currentEndIndex + 1; i < rebuiltSubtitles.length; i++) {
                        // 更新：使用新的标点符号正则判断
                        // 之前的判断: /[,.!?;:。，！？]/.test(rebuiltSubtitles[i-1][0])
                        if (Array.isArray(rebuiltSubtitles[i-1]) &&
                            rebuiltSubtitles[i-1][0] &&
                            punctuationRegex.test(rebuiltSubtitles[i-1][0]) &&
                            !Array.isArray(rebuiltSubtitles[i])) {
                            nextSentenceStartIndex = i;
                            break;
                        }
                    }

                    // 如果找到了下一句的开始位置
                    if (nextSentenceStartIndex > 0) {
                        // 向后查找这个句子的结束位置（下一个标点符号）
                        let nextSentenceEndIndex = rebuiltSubtitles.length - 1;
                        for (let i = nextSentenceStartIndex; i < rebuiltSubtitles.length; i++) {
                            // 更新：使用新的标点符号正则判断
                            // 之前的判断: /[,.!?;:。，！？]/.test(rebuiltSubtitles[i][0])
                            if (Array.isArray(rebuiltSubtitles[i]) &&
                                rebuiltSubtitles[i][0] &&
                                punctuationRegex.test(rebuiltSubtitles[i][0])) {
                                nextSentenceEndIndex = i;
                                break;
                            }
                        }

                        // 构建下一句的单词列表
                        const nextSentenceWords = [];
                        for (let i = nextSentenceStartIndex; i <= nextSentenceEndIndex; i++) {
                            nextSentenceWords.push({
                                originalIndex: i,
                                data: rebuiltSubtitles[i]
                            });
                        }

                        return {
                            words: nextSentenceWords,
                            currentIndex: nextSentenceStartIndex
                        };
                    }
                }

                // 如果没找到目标句子，返回当前句子
                return currentSentence;
            }

            // 获取目标句子
            const targetSentence = findTargetSentence();
            currentSubtitleInheiten = targetSentence;
            if (!targetSentence || !targetSentence.words || targetSentence.words.length === 0) {
                console.log("无法获取目标句子");
                return;
            }

            // 获取目标句子的第一个和最后一个有效单词（用于确定时间范围）
            let firstValidWord = null;
            let lastValidWord = null;

            for (let i = 0; i < targetSentence.words.length; i++) {
                const wordItem = targetSentence.words[i];
                if (wordItem && wordItem.data && !Array.isArray(wordItem.data) &&
                    wordItem.data.tStartMs !== undefined && wordItem.data.tEndMs !== undefined) {
                    if (!firstValidWord) firstValidWord = wordItem.data;
                    lastValidWord = wordItem.data;
                }
            }

            if (!firstValidWord || !lastValidWord) {
                console.log("无法确定目标句子的时间范围");
                return;
            }

            // 进入重播模式
            console.log("重播模式开启");
            isReplayMode = true;
            currentSubtitleIndex = targetSentence.currentIndex; // 更新当前索引

            // 直接获取视频元素
            const video = getVideoElement();

            // 检查视频元素是否存在
            if (video) {
                // 标记这是程序触发的播放
                isProgramTriggeredPlay = true;

                console.log(`导航到${direction}句，当前视频状态: ${video.paused ? '暂停' : '播放中'}`);

                // 先暂停视频，确保状态一致
                video.pause();

                // 设置时间点
                video.currentTime = firstValidWord.tStartMs / 1000;

                // 添加一个小延迟，确保时间设置生效后再播放
                setTimeout(() => {
                    console.log(`开始播放${direction}句`);
                    // 无论什么情况，都自动播放
                    playVideo();
                }, 50);

                // 用 setInterval 轮询，等时间到了句子结束立刻暂停
                const checkInterval = setInterval(() => {
                    // 在 interval 内部也需要重新获取视频元素
                    const currentVideo = getVideoElement();

                    // 增加检查视频元素是否存在的判断
                    if (currentVideo) {
                        const now = currentVideo.currentTime * 1000;

                        // 增加检查 lastValidWord 是否存在的判断
                        if (lastValidWord && now >= lastValidWord.tEndMs - 100) {
                            clearInterval(checkInterval);
                            pauseVideo();  // 使用新的暂停函数
                            console.log("重播句子结束");
                        }
                    } else {
                        // 如果视频元素失效，也停止 interval
                        clearInterval(checkInterval);
                        console.warn("在 interval 中无法获取视频元素");
                    }
                }, 50); // 每50ms检查一次

                // 设置延时，在播放开始后将标志重置
                setTimeout(() => {
                    isProgramTriggeredPlay = false;
                }, 100);
            } else {
                console.warn("无法获取视频元素");
            }

            // 如果是当前句子(S键)，设置跳过字幕刷新
            if (direction === 'current') {
                skipSubtitleRefresh = true;
                // 1秒后恢复字幕刷新
                setTimeout(() => {
                    skipSubtitleRefresh = false;
                }, 1000);
            }
        }

        function initYoutubeSubtitles() {

            // 初始化全局视频元素
            videoElement = getVideoElement();

            // 工具函数：插入样式
            function addStyle(css) {
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
            }

            // 加载字体
            const fontUrl = chrome.runtime.getURL("src/fonts/LXGWWenKaiGBLite-Regular.ttf");
            const fanwoodFontUrl = chrome.runtime.getURL("src/fonts/Fanwood.otf");
            // 使用encodeURIComponent处理文件名中的空格
            const fanwoodBoldFontUrl = chrome.runtime.getURL("src/fonts/Fanwood_Bold.otf").replace(/ /g, "%20");
            const fanwoodItalicFontUrl = chrome.runtime.getURL("src/fonts/Fanwood_Italic.otf").replace(/ /g, "%20");

            // 添加字体样式
            addStyle(`
                @font-face {
                    font-family: 'LXGWWenKai';
                    src: url('${fontUrl}') format('truetype');
                    font-weight: normal;
                    font-style: normal;
                    font-display: swap;
                }
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
            `);

            // 添加仿生阅读样式
            addStyle(`
                .highlight-wrapper {
                    position: relative;
                    display: inline-block;
                }
                .highlight-wrapper::before {
                    content: attr(data-highlight);
                    position: absolute;
                    color: rgb(227,20,20);
                    background: linear-gradient(to right,
                        currentColor 0%,
                        rgba(0,0,0,0.1) 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    opacity: 0.5;
                    mix-blend-mode: multiply;
                    font-family: inherit !important;
                    font-size: inherit !important;
                    white-space: pre;
                    pointer-events: none;
                }
            `);

            // 添加基础样式
            addStyle(`
                #untertitle-drag-container {
                    margin: 0 !important;
                    padding: 0 !important;
                    transform: none !important;
                }
                #untertitle-display {
                    white-space: pre-wrap;
                    word-break: break-word;
                }
                /* 为Fanwood字体单独设置字号 */
                #untertitle-text {
                    font-family: "Fanwood",  "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
                }
                /* 移除固定字体大小，让JavaScript动态控制 */
            `);

            // 创建外层容器（固定在页面中，不跟随滚动）
            const dragContainer = document.createElement('div');
            dragContainer.id = 'untertitle-drag-container';

            // 居中定位函数
            function centerSubtitle() {
                const videoContainer = document.querySelector('.ytp-caption-window-container') || document.querySelector('#movie_player');
                if (videoContainer) {
                    const containerRect = videoContainer.getBoundingClientRect();
                    const containerWidth = containerRect.width;
                    const containerHeight = containerRect.height;

                    Object.assign(dragContainer.style, {
                        position: 'absolute',
                        left: '0',
                        right: '0',
                        bottom: '30%', // 在视频框靠下70%位置
                        zIndex: '999999',
                        pointerEvents: 'none',
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    });
                }
            }

            centerSubtitle();

            // 监听视频容器大小变化，自动重新居中
            const resizeObserver = new ResizeObserver(() => {
                if (!isDragging) { // 只有在不拖动时才自动居中
                    centerSubtitle();
                }
            });

            const videoContainer = document.querySelector('.ytp-caption-window-container') || document.querySelector('#movie_player');
            if (videoContainer) {
                resizeObserver.observe(videoContainer);
            }

            // 创建内部显示容器
            const container = document.createElement('div');
            container.id = 'untertitle-display';
            Object.assign(container.style, {
                position: 'relative',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '5px',
                // fontSize 由 textElement 控制
                maxWidth: '1000px',
                transition: 'opacity 0.3s',
                pointerEvents: 'auto',
                display: 'block', // 使用block布局
                width: 'max-content', // 宽度根据内容自适应
                margin: '0 auto', // 自动居中
                minWidth: '300px',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                fontFamily: '"Fanwood", "LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
                userSelect: 'text', // 允许文本选择
                textAlign: 'left' // 文本左对齐
            });

            // 创建拖动区域（只在边框的一小部分区域）
            const dragArea = document.createElement('div');
            dragArea.id = 'untertitle-drag-area';
            Object.assign(dragArea.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                cursor: 'default',
                zIndex: '1000000',
                pointerEvents: 'none', // 默认不拦截事件
                border: '8px solid transparent', // 创建8px的边框区域
                boxSizing: 'border-box'
            });

            // 创建四个边框拖动区域
            const createBorderArea = (position) => {
                const borderArea = document.createElement('div');
                borderArea.style.position = 'absolute';
                borderArea.style.pointerEvents = 'auto';
                borderArea.style.cursor = 'default';
                borderArea.style.zIndex = '1000001';

                switch(position) {
                    case 'top':
                        borderArea.style.top = '0';
                        borderArea.style.left = '0';
                        borderArea.style.right = '0';
                        borderArea.style.height = '8px';
                        break;
                    case 'bottom':
                        borderArea.style.bottom = '0';
                        borderArea.style.left = '0';
                        borderArea.style.right = '0';
                        borderArea.style.height = '8px';
                        break;
                    case 'left':
                        borderArea.style.top = '8px';
                        borderArea.style.bottom = '8px';
                        borderArea.style.left = '0';
                        borderArea.style.width = '8px';
                        break;
                    case 'right':
                        borderArea.style.top = '8px';
                        borderArea.style.bottom = '8px';
                        borderArea.style.right = '0';
                        borderArea.style.width = '8px';
                        break;
                }
                return borderArea;
            };

            const topBorder = createBorderArea('top');
            const bottomBorder = createBorderArea('bottom');
            const leftBorder = createBorderArea('left');
            const rightBorder = createBorderArea('right');

            container.appendChild(dragArea);
            container.appendChild(topBorder);
            container.appendChild(bottomBorder);
            container.appendChild(leftBorder);
            container.appendChild(rightBorder);

            // 创建内容包裹层
            const contentWrapper = document.createElement('div');
            contentWrapper.style.cssText = `
                display: flex;
                justify-content: center;
                width: max-content;
                max-width: 1000px;
                margin: 0 auto;
            `;

            // 创建文本显示区域
            const textElement = document.createElement('div');
            textElement.id = 'untertitle-text';

            // 获取字体设置
            const fontSize = window.youtubeFontSize || 24;
            const fontFamily = window.youtubeFontFamily || 'Fanwood';
            const fontFamilyMap = {
                'Fanwood': '"Fanwood", "LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
                'LXGWWenKai': '"LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"',
                'Arial': 'Arial, sans-serif',
                'Helvetica': 'Helvetica, Arial, sans-serif',
                'Times New Roman': '"Times New Roman", Times, serif',
                'Georgia': 'Georgia, serif',
                'Verdana': 'Verdana, sans-serif',
                'Tahoma': 'Tahoma, sans-serif',
                'Trebuchet MS': '"Trebuchet MS", sans-serif',
                'Impact': 'Impact, sans-serif'
            };

            textElement.style.cssText = `
                word-break: break-word;
                white-space: pre-wrap;
                display: inline-block;
                font-size: ${fontSize}px;
                font-family: ${fontFamilyMap[fontFamily] || fontFamilyMap['Fanwood']};
            `;

            contentWrapper.appendChild(textElement);
            container.appendChild(contentWrapper);
            dragContainer.appendChild(container);

            // 为所有边框区域添加鼠标事件
            const borderAreas = [topBorder, bottomBorder, leftBorder, rightBorder];
            borderAreas.forEach(borderArea => {
                borderArea.addEventListener('mouseenter', function() {
                    borderArea.style.cursor = 'move';
                });

                borderArea.addEventListener('mouseleave', function() {
                    if (!isDragging) {
                        borderArea.style.cursor = 'default';
                    }
                });
            });

            // 拖动事件处理
            let isDragging = false;
            let initialX = 0;
            let initialY = 0;

            // 为所有边框区域添加拖动事件
            borderAreas.forEach(borderArea => {
                borderArea.addEventListener('mousedown', dragStart);
            });
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            function dragStart(e) {
                e.preventDefault();
                e.stopPropagation();

                // 获取视频容器的边界
                const videoContainer = document.querySelector('.ytp-caption-window-container') || document.querySelector('#movie_player');
                if (!videoContainer) return;

                const containerRect = videoContainer.getBoundingClientRect();
                const dragRect = dragContainer.getBoundingClientRect();

                // 计算相对于视频容器的初始偏移
                initialX = e.clientX - dragRect.left;
                initialY = e.clientY - dragRect.top;
                isDragging = true;
                // 为所有边框区域设置移动光标
                borderAreas.forEach(borderArea => {
                    borderArea.style.cursor = 'move';
                });
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();

                    // 获取视频容器的边界
                    const videoContainer = document.querySelector('.ytp-caption-window-container') || document.querySelector('#movie_player');
                    if (!videoContainer) return;

                    const containerRect = videoContainer.getBoundingClientRect();
                    const dragRect = dragContainer.getBoundingClientRect();

                    // 计算新位置
                    let newX = e.clientX - initialX;
                    let newY = e.clientY - initialY;

                    // 限制在视频容器内
                    const minX = containerRect.left;
                    const maxX = containerRect.right - dragRect.width;
                    const minY = containerRect.top;
                    const maxY = containerRect.bottom - dragRect.height;

                    newX = Math.max(minX, Math.min(maxX, newX));
                    newY = Math.max(minY, Math.min(maxY, newY));

                    // 转换为相对于视频容器的位置
                    const relativeX = newX - containerRect.left;
                    const relativeY = newY - containerRect.top;

                    dragContainer.style.left = `${relativeX}px`;
                    dragContainer.style.bottom = 'auto';
                    dragContainer.style.top = `${relativeY}px`;
                    dragContainer.style.transform = 'none';
                }
            }

            function dragEnd() {
                isDragging = false;
                // 恢复默认光标
                setTimeout(() => {
                    borderAreas.forEach(borderArea => {
                        if (!borderArea.matches(':hover')) {
                            borderArea.style.cursor = 'default';
                        }
                    });
                }, 100);
            }

            // 仿生阅读处理函数
            function processBionicText(node) {
                const text = node.textContent;
                let result = document.createDocumentFragment();
                let currentWord = '';

                // 检查是否启用仿生阅读
                if (!window.youtubeBionicReadingEnabled) {
                    // 如果未启用仿生阅读，直接返回原文本
                    result.appendChild(document.createTextNode(text));
                    return result;
                }

                // 检测是否为日语文本
                const isJapaneseText = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);

                // 如果是日语文本，整体作为一个单元处理
                if (isJapaneseText) {
                    // 将整个日语文本作为一个单元，不进行仿生阅读处理
                    result.appendChild(document.createTextNode(text));
                    return result;
                }

                // 非日语文本的原始处理逻辑
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    const isCJK = /[\u4E00-\u9FFF\u3040-\u30FF\u3130-\u318F\uAC00-\uD7AF\u1100-\u11FF]/.test(char);
                    const isPunctuation = /[\u3000-\u303F\uFF00-\uFFEF]/.test(char);
                    const isWhitespace = /\s/.test(char);

                    if (isCJK || isPunctuation) {
                        if (currentWord) {
                            const boldLength = Math.ceil(currentWord.length * 0.4);
                            const highlight = currentWord.slice(0, boldLength);

                            const span = document.createElement('span');
                            span.className = 'highlight-wrapper';
                            span.setAttribute('data-highlight', highlight);
                            span.textContent = currentWord;
                            result.appendChild(span);

                            currentWord = '';
                        }
                        result.appendChild(document.createTextNode(char));
                    } else if (isWhitespace) {
                        if (currentWord) {
                            const boldLength = Math.ceil(currentWord.length * 0.4);
                            const highlight = currentWord.slice(0, boldLength);

                            const span = document.createElement('span');
                            span.className = 'highlight-wrapper';
                            span.setAttribute('data-highlight', highlight);
                            span.textContent = currentWord;
                            result.appendChild(span);

                            currentWord = '';
                        }
                        result.appendChild(document.createTextNode(char));
                    } else {
                        currentWord += char;
                    }
                }

                if (currentWord) {
                    const boldLength = Math.ceil(currentWord.length * 0.4);
                    const highlight = currentWord.slice(0, boldLength);

                    const span = document.createElement('span');
                    span.className = 'highlight-wrapper';
                    span.setAttribute('data-highlight', highlight);
                    span.textContent = currentWord;
                    result.appendChild(span);
                }

                return result;
            }

            // 从新的字幕结构中构建显示文本
            function buildDisplayTextFromWords(words) {
                if (!words || words.length === 0) return '';

                let text = '';

                // 检测是否为日语文本
                let isJapanese = false;
                for (let i = 0; i < words.length; i++) {
                    const item = words[i];
                    if (item && item.data && typeof item.data === 'object' && item.data.utf8) {
                        // 日语字符范围检测
                        if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(item.data.utf8)) {
                            isJapanese = true;
                            break;
                        }
                    }
                }

                // 如果是日语文本，将整个句子合并到一个双引号中
                if (isJapanese) {
                    let fullSentence = '';

                    // 先收集所有单词和标点
                    for (let i = 0; i < words.length; i++) {
                        const item = words[i];

                        // 跳过无效项
                        if (!item || !item.data) continue;

                        // 如果是数组，可能是标点符号
                        if (Array.isArray(item.data) && item.data.length > 0) {
                            fullSentence += item.data[0]; // 添加标点符号
                        }
                        // 如果是单词对象
                        else if (item.data && typeof item.data === 'object' && item.data.utf8) {
                            // 日语不需要添加额外空格
                            fullSentence += item.data.utf8;
                        }
                    }

                    // 返回整个句子
                    return fullSentence;
                }

                // 非日语文本的原始处理逻辑
                // 遍历所有词项
                for (let i = 0; i < words.length; i++) {
                    const item = words[i];

                    // 跳过无效项
                    if (!item || !item.data) continue;

                    // 如果是数组，可能是标点符号
                    if (Array.isArray(item.data) && item.data.length > 0) {
                        text += item.data[0]; // 添加标点符号
                    }
                    // 如果是单词对象
                    else if (item.data && typeof item.data === 'object' && item.data.utf8) {
                        // 添加空格（除非是第一个单词或前面是标点）
                        if (text.length > 0 && !text.match(/[,.!?:;]$/)) {
                            text += ' ';
                        }

                        // 添加单词内容
                        text += item.data.utf8;
                    }
                }

                return text.trim();
            }

            let lastProcessedTime = 0; // 添加变量跟踪上次处理的时间

            // 首先加载字幕
            getYoutubeSubtitles().then(() => {
                // 每0.1秒刷新一次显示的字幕
                subtitleUpdateInterval = setInterval(async () => {
                    try {
                        // 如果需要跳过字幕刷新，直接返回
                        if (skipSubtitleRefresh) {
                            return;
                        }

                        // 定期尝试更新视频元素引用
                        if (!videoElement) {
                            videoElement = getVideoElement();
                        }

                        // 获取当前视频时间
                        const currentTime = getYoutubeCurrentTime();

                        // 只有当时间变化超过一定阈值(100ms)才更新字幕，避免频繁更新
                        if (Math.abs(currentTime - lastProcessedTime) >= 0.1) {
                            lastProcessedTime = currentTime;

                            // 获取当前字幕内容
                            const currentSubtitlesData = getCurrentSubtitles();

                            if(currentTime > 20000){
                                // console.log("20秒之后才触发预加载", currentTime);
                                // 预加载未来的字幕，但不需要使用返回值
                                getTimeSubtitles(currentTime + 20000);
                            }

                            // const preloadSubtitlesData = await getPreloadSubtitles();

                            // console.log("准备更新字幕内容：", currentSubtitlesData);
                            if (currentSubtitlesData && currentSubtitlesData.words && currentSubtitlesData.words.length > 0) {
                                // 构建显示文本
                                const newText = buildDisplayTextFromWords(currentSubtitlesData.words);

                                // 如果字幕和之前一样，就不用更新
                                if (newText && newText !== lastSubtitleText) {
                                    lastSubtitleText = newText;

                                    const text = newText.slice(0, 300); // 最多显示300字符，可自行调整
                                    const tempDiv = document.createElement('div');
                                    tempDiv.textContent = text;

                                    // 清空再插入
                                    while (textElement.firstChild) {
                                        textElement.removeChild(textElement.firstChild);
                                    }

                                    // 检测是否为日语文本
                                    const isJapaneseText = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);

                                    // 设置语言属性，以便CSS选择器可以正确应用
                                    if (isJapaneseText) {
                                        textElement.setAttribute('lang', 'ja');
                                    } else {
                                        textElement.removeAttribute('lang');
                                    }

                                    textElement.appendChild(processBionicText(tempDiv));
                                    console.log("显示字幕更新:", text);
                                }
                            }
                        }
                    } catch (error) {
                        console.error("获取或显示字幕时出错:", error);
                    }
                }, 100);
            });

            // 添加键盘事件 A=上句 S=当前句 D=下句
            keydownHandler = function(event) {
                // 如果焦点在输入框，就不劫持
                if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                    return;
                }

                switch(event.code) {
                    case 'KeyA':
                        event.preventDefault();
                        navigateSubtitles('prev');
                        break;
                    case 'KeyS':
                        event.preventDefault();
                        navigateSubtitles('current');
                        break;
                    case 'KeyD':
                        event.preventDefault();
                        navigateSubtitles('next');
                        break;
                }
            };
            document.addEventListener('keydown', keydownHandler);

            // 监听播放事件，只有用户手动播放时才退出重播模式
            playHandler = function() {
                // 如果不是程序触发的播放，才退出重播模式
                if (!isProgramTriggeredPlay) {
                    console.log("用户手动播放，重播模式关闭");
                    isReplayMode = false;
                } else {
                    console.log("程序触发的播放，保持重播模式");
                }
            };

            if (videoElement) {
                videoElement.addEventListener('play', playHandler);
            } else {
                // 如果第一次没找到视频元素，尝试定期检查
                const videoCheckInterval = setInterval(() => {
                    videoElement = getVideoElement();
                    if (videoElement) {
                        clearInterval(videoCheckInterval);
                        console.log('已找到视频元素并设置事件监听');
                        videoElement.addEventListener('play', playHandler);
                    }
                }, 2000);
            }

            // 尝试把字幕容器添加到 YouTube 内部的字幕容器
            function attachToCaptionContainer() {
                const captionContainer = document.querySelector('.ytp-caption-window-container');
                if (captionContainer) {
                    // 如果已经添加过，就先移除
                    if (dragContainer.parentNode) {
                        dragContainer.parentNode.removeChild(dragContainer);
                    }
                    captionContainer.appendChild(dragContainer);
                    // 确保容器可见
                    dragContainer.style.display = 'flex';
                    container.style.opacity = '1';
                    return true;
                }
                return false;
            }

            // 尝试挂载
            if (!attachToCaptionContainer()) {
                // 万一找不到，就先挂 body
                document.body.appendChild(dragContainer);
                console.warn('未找到YouTube字幕容器，先挂到body');

                // 定时再尝试
                const checkInterval = setInterval(() => {
                    if (attachToCaptionContainer()) {
                        clearInterval(checkInterval);
                        console.log('已成功挂载到YouTube字幕容器');
                    }
                }, 2000);
            } else {
                 // 初始挂载成功也确保可见性
                 dragContainer.style.display = 'flex';
                 container.style.opacity = '1';
            }
        }

        // 初始化
        getYoutubeSubtitles().then(() => {
            initYoutubeSubtitles(); // 字幕加载完成后再初始化UI和事件监听
        }).catch(error => {
            console.error("初始化过程中加载字幕失败:", error);
        });
    }

    // 等待视频播放器加载完成后执行
    // waitForElement('#movie_player', main, 100, 30000); // 这行在文件顶部被调用，这里注释掉避免重复
})();