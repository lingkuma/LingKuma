// ==UserScript==
// @name         YouTube 视频覆盖层
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  在 YouTube 页面上创建白色覆盖层，并在其中显示原视频，支持字幕显示和多种显示模式
// @author       You
// @match        https://www.youtube.com/watch*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let overlayContainer = null;
    let videoContainer = null;
    let originalVideo = null;
    let originalParent = null;
    let isOverlayActive = false;
    let currentUrl = window.location.href;
    let floatButton = null;

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
    let subtitleUpdateInterval = null;
    let autoPauseEnabled = false;
    let currentDisplayMode = 'theater';
    let isMobileMode = false;
    let keydownHandler = null;
    let playHandler = null;
    let lastOverlaySubtitleText = '';
    let subtitleListInitialized = false;
    let subtitleListItems = [];
    let subtitleOffsetMode = 'normal';

    function createFloatButton() {
        if (floatButton) return;

        floatButton = document.createElement('button');
        floatButton.id = 'youtube-overlay-float-button';
        const iconUrl = chrome.runtime.getURL('src/icons/icon48.png');
        floatButton.innerHTML = `<img src="${iconUrl}" alt="覆盖层" style="width: 100%; height: 100%; object-fit: contain;">`;
        Object.assign(floatButton.style, {
            position: 'fixed',
            right: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '2px solid #ff0000',
            cursor: 'pointer',
            zIndex: '114512',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
            padding: '4px'
        });

        floatButton.addEventListener('mouseenter', () => {
            floatButton.style.transform = 'translateY(-50%) scale(1.1)';
            floatButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
        });

        floatButton.addEventListener('mouseleave', () => {
            floatButton.style.transform = 'translateY(-50%) scale(1)';
            floatButton.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        });

        floatButton.addEventListener('click', () => {
            if (isOverlayActive) {
                cleanupOverlay();
            } else {
                initializeOverlay();
            }
        });

        document.body.appendChild(floatButton);
    }

    function updateFloatButtonState() {
        if (!floatButton) return;
        if (isOverlayActive) {
            floatButton.style.backgroundColor = '#ff0000';
            floatButton.style.borderColor = '#ffffff';
        } else {
            floatButton.style.backgroundColor = '#ffffff';
            floatButton.style.borderColor = '#ff0000';
        }
    }

    chrome.storage.local.get({
        youtubeVideoOverlay: false,
        youtubeDisplayMode: 'theater',
        youtubeCommaSentencing: false,
        youtubeSubtitleOffset: 'normal'
    }, function(result) {
        if (result.youtubeVideoOverlay) {
            console.log("YouTube 视频覆盖层已启用");
            currentDisplayMode = result.youtubeDisplayMode || 'theater';
            window.youtubeCommaSentencingEnabled = result.youtubeCommaSentencing || false;
            subtitleOffsetMode = result.youtubeSubtitleOffset || 'normal';
            initializeOverlay();
            setupUrlMonitoring();
        }
        createFloatButton();
    });

    function initializeOverlay() {
        if (!window.location.href.includes('/watch') || !window.location.href.includes('v=')) {
            console.log("不是视频页面，跳过初始化");
            return;
        }

        cleanupOverlay();

        waitForElement('#movie_player', createOverlay, 100, 30000);
    }

    function cleanupOverlay() {
        stopSubtitleUpdate();

        if (overlayContainer) {
            overlayContainer.remove();
            overlayContainer = null;
        }

        if (keydownHandler) {
            document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
        }

        if (playHandler) {
            const video = getVideoElement();
            if (video) {
                video.removeEventListener('play', playHandler);
            }
            playHandler = null;
        }

        if (originalVideo && originalParent) {
            originalParent.appendChild(originalVideo);
            originalVideo.style.display = '';
            originalVideo = null;
            originalParent = null;
        }

        document.body.style.overflow = '';
        isOverlayActive = false;
        chrome.storage.local.set({ youtubeVideoOverlay: false });
        updateFloatButtonState();
    }

    function setupUrlMonitoring() {
        setInterval(() => {
            const newUrl = window.location.href;
            if (newUrl !== currentUrl) {
                console.log("检测到URL变化:", currentUrl, "->", newUrl);
                currentUrl = newUrl;
                setTimeout(() => {
                    initializeOverlay();
                }, 1500);
            }
        }, 1000);
    }

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

    function createOverlay() {
        console.log("创建 YouTube 视频覆盖层...");

        const videoElement = document.querySelector('video');
        if (!videoElement) {
            console.log("未找到视频元素");
            return;
        }

        originalVideo = videoElement;
        originalParent = videoElement.parentElement;

        const overlay = document.createElement('div');
        overlay.id = 'youtube-video-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: '#ffffff',
            zIndex: '114513',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
        });

        const closeButton = document.createElement('button');
        closeButton.textContent = '✕';
        Object.assign(closeButton.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            fontSize: '24px',
            backgroundColor: '#DCE2AF',
            color: '#ffffff',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            zIndex: '114515',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
        });
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.transform = 'scale(1.1)';
            closeButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
        });
        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.transform = 'scale(1)';
            closeButton.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        });
        closeButton.addEventListener('click', () => {
            cleanupOverlay();
        });

        videoContainer = document.createElement('div');
        videoContainer.id = 'overlay-video-container';
        Object.assign(videoContainer.style, {
            flex: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: '1280px',
            padding: '20px',
            boxSizing: 'border-box'
        });

        const videoWrapper = document.createElement('div');
        videoWrapper.id = 'overlay-video-wrapper';
        Object.assign(videoWrapper.style, {
            position: 'relative',
            width: '100%',
            maxWidth: '100%',
            aspectRatio: '16/9',
            backgroundColor: '#000',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
        });

        videoWrapper.appendChild(originalVideo);
        videoContainer.appendChild(videoWrapper);

        const controlBar = createControlButtons();

        document.body.appendChild(overlay);
        document.body.appendChild(closeButton);
        document.body.appendChild(controlBar);
        overlay.appendChild(videoContainer);
        document.body.style.overflow = 'hidden';
        overlayContainer = overlay;
        isOverlayActive = true;
        chrome.storage.local.set({ youtubeVideoOverlay: true });
        updateFloatButtonState();

        Object.assign(originalVideo.style, {
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            position: 'relative'
        });

        console.log("YouTube 视频覆盖层创建成功，视频已移动到覆盖层");

        getYoutubeSubtitles().then(() => {
            updateDisplayMode();
            startSubtitleUpdate();
        });

        keydownHandler = function(event) {
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

        playHandler = function() {
            if (!isProgramTriggeredPlay) {
                console.log("用户手动播放，重播模式关闭");
                isReplayMode = false;
            } else {
                console.log("程序触发的播放，保持重播模式");
            }
        };
        const video = getVideoElement();
        if (video) {
            video.addEventListener('play', playHandler);
        }
    }

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "toggleYoutubeVideoOverlay") {
            if (isOverlayActive) {
                cleanupOverlay();
            } else {
                initializeOverlay();
            }
        } else if (request.action === "updateYoutubeSubtitleOffset") {
            subtitleOffsetMode = request.offsetMode || 'normal';
            lastOverlaySubtitleText = '';
            console.log("字幕偏移模式已更新:", subtitleOffsetMode);
        }
    });

    function getPunctuationRegex() {
        if (window.youtubeCommaSentencingEnabled) {
            return /[,.!?:;。、？！]/;
        } else {
            return /[.!?:;。？！]/;
        }
    }

    function getVideoElement() {
        if (videoElement) {
            return videoElement;
        }
        const newVideoElement = document.querySelector('video');
        if (newVideoElement) {
            videoElement = newVideoElement;
            return videoElement;
        }
        return null;
    }

    function getYoutubeCurrentTime() {
        const video = getVideoElement();
        if (video && typeof video.currentTime === 'number') {
            return video.currentTime * 1000;
        }
        return 0;
    }

    function setYoutubeTime(timeMs) {
        const video = getVideoElement();
        if (video) {
            video.currentTime = timeMs / 1000;
        }
    }

    function playVideo() {
        const video = getVideoElement();
        if (video) {
            try {
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn('播放视频时出错:', error);
                    });
                }
            } catch (e) {
                console.warn('调用play()方法时出错:', e);
            }
        }
    }

    function pauseVideo() {
        const video = getVideoElement();
        if (video) {
            try {
                video.pause();
            } catch (e) {
                console.warn('调用pause()方法时出错:', e);
            }
        }
    }

    function getYoutubeID() {
        const videoURL = window.location.href;
        var splited = videoURL.split("v=");
        if (splited.length < 2) return null;
        var splitedAgain = splited[1].split("&");
        var videoId = splitedAgain[0];
        return videoId;
    }

    async function getYoutubeSubtitlesAPI() {
        try {
            console.log('开始获取字幕URL...');
            const url = await window.forceSubtitleAndGetJsonUrl();
            if (url) {
                console.log(`成功获取字幕URL: ${url}`);
                return await getTrackData(url);
            } else {
                console.log('无法获取字幕URL');
                return null;
            }
        } catch (error) {
            console.error('获取字幕时出错:', error);
            return null;
        }

        async function getTrackData(subtitleUrl) {
            console.log(`正在获取json字幕: ${subtitleUrl}`);
            try {
                const subtitleResponse = await fetch(subtitleUrl);
                const subtitleData = await subtitleResponse.json();
                console.log('字幕数据获取成功');
                return subtitleData;
            } catch (fetchError) {
                console.error('获取字幕内容时出错:', fetchError);
                return null;
            }
        }
    }

    function rebuildSubtitles(subtitleData) {
        const result = [];
        const words = [];
        const punctuationRegex = getPunctuationRegex();
        const events = subtitleData.events || [];

        events.forEach(paragraph => {
            const paragraphStartTime = paragraph.tStartMs;
            if (paragraph.segs) {
                paragraph.segs.forEach(segment => {
                    if (segment.utf8 === "\n") return;
                    let wordStartTime = paragraphStartTime;
                    if (segment.tOffsetMs !== undefined) {
                        wordStartTime += segment.tOffsetMs;
                    }
                    let wordText = segment.utf8.trim();
                    if (wordText === "") return;
                    const hasPunctuation = punctuationRegex.test(wordText);
                    let punctuation = null;
                    if (hasPunctuation) {
                        const lastChar = wordText.charAt(wordText.length - 1);
                        if (punctuationRegex.test(lastChar)) {
                            punctuation = lastChar;
                            wordText = wordText.substring(0, wordText.length - 1).trim();
                        }
                    }
                    if (wordText === "") return;
                    let wordEndTime = paragraphStartTime + paragraph.dDurationMs;
                    words.push({
                        utf8: wordText,
                        tStartMs: wordStartTime,
                        tEndMs: wordEndTime,
                        punctuation: punctuation
                    });
                });
            }
        });

        for (let i = 0; i < words.length - 1; i++) {
            words[i].tEndMs = words[i + 1].tStartMs;
        }

        for (let i = 0; i < words.length; i++) {
            result.push(words[i]);
            const punctuationArray = words[i].punctuation ? [words[i].punctuation] : [];
            result.push(punctuationArray);
        }

        console.log("重建字幕结构，处理了原生标点符号");
        return result;
    }

    function getWordsAroundTimestamp(timestamp, subtitles, wordCount = 50) {
        let closestIndex = -1;
        let minTimeDiff = Infinity;

        for (let i = 0; i < subtitles.length; i++) {
            const element = subtitles[i];
            if (!element || Array.isArray(element) || !element.utf8) continue;
            if (timestamp >= element.tStartMs && timestamp <= element.tEndMs) {
                closestIndex = i;
                break;
            }
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
            return [];
        }

        let startIndex = Math.max(0, closestIndex - 200);
        let endIndex = Math.min(subtitles.length - 1, closestIndex + 200);
        const totalElements = endIndex - startIndex + 1;
        if (totalElements > 400) {
            const excess = totalElements - 400;
            startIndex += Math.floor(excess / 2);
            endIndex -= Math.ceil(excess / 2);
        }

        const result = [];
        for (let i = startIndex; i <= endIndex; i++) {
            const element = subtitles[i];
            if (Array.isArray(element) && element.length === 0) {
                continue;
            }
            result.push({
                originalIndex: i,
                data: element
            });
        }

        return result;
    }

    function mergeWordsIntoSentences(words) {
        let result = '';
        for (let i = 0; i < words.length; i++) {
            const item = words[i];
            if (!item || !item.data) continue;
            if (item.data && typeof item.data === 'object' && item.data.utf8) {
                if (result.length > 0) {
                    result += ' ';
                }
                result += item.data.utf8;
            } else if (Array.isArray(item.data) && item.data.length > 0) {
                result += item.data[0];
            }
        }
        return result.trim();
    }

    function getCurrentSentence(currentTime, subtitles) {
        const wordsAround = getWordsAroundTimestamp(currentTime, subtitles);
        if (!wordsAround || wordsAround.length === 0) {
            return null;
        }

        const punctuationRegex = getPunctuationRegex();
        let currentWordIndex = -1;
        for (let i = 0; i < wordsAround.length; i++) {
            const wordItem = wordsAround[i];
            if (wordItem && wordItem.data && !Array.isArray(wordItem.data) &&
                currentTime >= wordItem.data.tStartMs && currentTime <= wordItem.data.tEndMs) {
                currentWordIndex = i;
                break;
            }
        }

        if (currentWordIndex === -1) {
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
            if (currentWordIndex === -1) {
                currentWordIndex = 0;
            }
        }

        let segmentStartIndex = 0;
        for (let i = currentWordIndex - 1; i >= 0; i--) {
            if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                segmentStartIndex = i + 1;
                break;
            }
        }

        let segmentEndIndex = wordsAround.length - 1;
        for (let i = currentWordIndex; i < wordsAround.length; i++) {
            if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                segmentEndIndex = i;
                break;
            }
        }

        const segmentWords = wordsAround.slice(segmentStartIndex, segmentEndIndex + 1);
        const sentenceText = mergeWordsIntoSentences(segmentWords);

        let startTime = 0;
        let endTime = 0;
        for (let i = 0; i < segmentWords.length; i++) {
            const wordItem = segmentWords[i];
            if (wordItem && wordItem.data && !Array.isArray(wordItem.data)) {
                if (startTime === 0 || wordItem.data.tStartMs < startTime) {
                    startTime = wordItem.data.tStartMs;
                }
                if (wordItem.data.tEndMs > endTime) {
                    endTime = wordItem.data.tEndMs;
                }
            }
        }

        return {
            text: sentenceText,
            words: segmentWords,
            startTime: startTime,
            endTime: endTime
        };
    }

    async function getYoutubeSubtitles() {
        const videoId = getYoutubeID();
        if (!videoId) {
            console.error("无法获取视频ID");
            return [];
        }

        try {
            const subtitleData = await getYoutubeSubtitlesAPI(videoId);
            if (subtitleData) {
                console.log("字幕数据已加载");
                subtitles = subtitleData;
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

    function getCurrentSubtitles() {
        if (isReplayMode) {
            return currentSubtitleInheiten;
        }

        const currentTime = getYoutubeCurrentTime();
        let currentSentence = getCurrentSentence(currentTime, rebuiltSubtitles);

        if (!currentSentence) {
            return null;
        }

        if (subtitleOffsetMode === 'prev') {
            const prevSentence = getPrevSentence(currentTime, rebuiltSubtitles);
            if (prevSentence) {
                currentSentence = prevSentence;
            }
        } else if (subtitleOffsetMode === 'next') {
            const nextSentence = getNextSentence(currentTime, rebuiltSubtitles);
            if (nextSentence) {
                currentSentence = nextSentence;
            }
        }

        currentSubtitleInheiten = currentSentence;
        return currentSentence;
    }

    function getPrevSentence(currentTime, subtitles) {
        const wordsAround = getWordsAroundTimestamp(currentTime, subtitles);
        if (!wordsAround || wordsAround.length === 0) {
            return null;
        }

        const punctuationRegex = getPunctuationRegex();
        let currentWordIndex = -1;
        for (let i = 0; i < wordsAround.length; i++) {
            const wordItem = wordsAround[i];
            if (wordItem && wordItem.data && !Array.isArray(wordItem.data) &&
                currentTime >= wordItem.data.tStartMs && currentTime <= wordItem.data.tEndMs) {
                currentWordIndex = i;
                break;
            }
        }

        if (currentWordIndex === -1) {
            return null;
        }

        let segmentStartIndex = 0;
        for (let i = currentWordIndex - 1; i >= 0; i--) {
            if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                segmentStartIndex = i + 1;
                break;
            }
        }

        if (segmentStartIndex === 0) {
            return null;
        }

        let prevSegmentEndIndex = -1;
        for (let i = segmentStartIndex - 1; i >= 0; i--) {
            if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                prevSegmentEndIndex = i;
                break;
            }
        }

        if (prevSegmentEndIndex === -1) {
            prevSegmentEndIndex = segmentStartIndex - 1;
        }

        let prevSegmentStartIndex = 0;
        for (let i = prevSegmentEndIndex - 1; i >= 0; i--) {
            if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                prevSegmentStartIndex = i + 1;
                break;
            }
        }

        const segmentWords = wordsAround.slice(prevSegmentStartIndex, prevSegmentEndIndex + 1);
        const sentenceText = mergeWordsIntoSentences(segmentWords);

        let startTime = 0;
        let endTime = 0;
        for (let i = 0; i < segmentWords.length; i++) {
            const wordItem = segmentWords[i];
            if (wordItem && wordItem.data && !Array.isArray(wordItem.data)) {
                if (startTime === 0 || wordItem.data.tStartMs < startTime) {
                    startTime = wordItem.data.tStartMs;
                }
                if (wordItem.data.tEndMs > endTime) {
                    endTime = wordItem.data.tEndMs;
                }
            }
        }

        return {
            text: sentenceText,
            words: segmentWords,
            startTime: startTime,
            endTime: endTime
        };
    }

    function getNextSentence(currentTime, subtitles) {
        const wordsAround = getWordsAroundTimestamp(currentTime, subtitles);
        if (!wordsAround || wordsAround.length === 0) {
            return null;
        }

        const punctuationRegex = getPunctuationRegex();
        let currentWordIndex = -1;
        for (let i = 0; i < wordsAround.length; i++) {
            const wordItem = wordsAround[i];
            if (wordItem && wordItem.data && !Array.isArray(wordItem.data) &&
                currentTime >= wordItem.data.tStartMs && currentTime <= wordItem.data.tEndMs) {
                currentWordIndex = i;
                break;
            }
        }

        if (currentWordIndex === -1) {
            return null;
        }

        let segmentEndIndex = wordsAround.length - 1;
        for (let i = currentWordIndex; i < wordsAround.length; i++) {
            if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                segmentEndIndex = i;
                break;
            }
        }

        if (segmentEndIndex >= wordsAround.length - 1) {
            return null;
        }

        let nextSegmentStartIndex = segmentEndIndex + 1;
        let nextSegmentEndIndex = wordsAround.length - 1;
        for (let i = nextSegmentStartIndex; i < wordsAround.length; i++) {
            if (wordsAround[i] && Array.isArray(wordsAround[i].data) &&
                wordsAround[i].data[0] && punctuationRegex.test(wordsAround[i].data[0])) {
                nextSegmentEndIndex = i;
                break;
            }
        }

        const segmentWords = wordsAround.slice(nextSegmentStartIndex, nextSegmentEndIndex + 1);
        const sentenceText = mergeWordsIntoSentences(segmentWords);

        let startTime = 0;
        let endTime = 0;
        for (let i = 0; i < segmentWords.length; i++) {
            const wordItem = segmentWords[i];
            if (wordItem && wordItem.data && !Array.isArray(wordItem.data)) {
                if (startTime === 0 || wordItem.data.tStartMs < startTime) {
                    startTime = wordItem.data.tStartMs;
                }
                if (wordItem.data.tEndMs > endTime) {
                    endTime = wordItem.data.tEndMs;
                }
            }
        }

        return {
            text: sentenceText,
            words: segmentWords,
            startTime: startTime,
            endTime: endTime
        };
    }

    function navigateSubtitles(direction) {
        if (!rebuiltSubtitles || rebuiltSubtitles.length === 0) return;

        const currentTime = getYoutubeCurrentTime();
        const currentSentence = getCurrentSentence(currentTime, rebuiltSubtitles);
        if (!currentSentence || !currentSentence.words || currentSentence.words.length === 0) {
            console.log("无法获取当前句子");
            return;
        }

        const punctuationRegex = getPunctuationRegex();

        function findTargetSentence() {
            if (direction === 'current') {
                return currentSentence;
            }

            const firstWordItem = currentSentence.words[0];
            const lastWordItem = currentSentence.words[currentSentence.words.length - 1];

            if (!firstWordItem || !lastWordItem) return null;

            const currentStartIndex = firstWordItem.originalIndex;
            const currentEndIndex = lastWordItem.originalIndex;

            if (direction === 'prev') {
                let prevSentenceEndIndex = -1;

                for (let i = currentStartIndex - 1; i >= 0; i--) {
                    if (Array.isArray(rebuiltSubtitles[i]) &&
                        rebuiltSubtitles[i][0] &&
                        punctuationRegex.test(rebuiltSubtitles[i][0])) {
                        prevSentenceEndIndex = i;
                        break;
                    }
                }

                if (prevSentenceEndIndex > 0) {
                    let prevSentenceStartIndex = 0;
                    for (let i = prevSentenceEndIndex - 1; i >= 0; i--) {
                        if (Array.isArray(rebuiltSubtitles[i]) &&
                            rebuiltSubtitles[i][0] &&
                            punctuationRegex.test(rebuiltSubtitles[i][0])) {
                            prevSentenceStartIndex = i + 1;
                            break;
                        }
                    }

                    const prevSentenceWords = [];
                    for (let i = prevSentenceStartIndex; i <= prevSentenceEndIndex; i++) {
                        prevSentenceWords.push({
                            originalIndex: i,
                            data: rebuiltSubtitles[i]
                        });
                    }

                    const prevSentenceText = mergeWordsIntoSentences(prevSentenceWords);
                    let prevStartTime = 0;
                    let prevEndTime = 0;
                    for (let i = 0; i < prevSentenceWords.length; i++) {
                        const wordItem = prevSentenceWords[i];
                        if (wordItem && wordItem.data && !Array.isArray(wordItem.data)) {
                            if (prevStartTime === 0 || wordItem.data.tStartMs < prevStartTime) {
                                prevStartTime = wordItem.data.tStartMs;
                            }
                            if (wordItem.data.tEndMs > prevEndTime) {
                                prevEndTime = wordItem.data.tEndMs;
                            }
                        }
                    }

                    return {
                        text: prevSentenceText,
                        words: prevSentenceWords,
                        startTime: prevStartTime,
                        endTime: prevEndTime,
                        currentIndex: prevSentenceStartIndex
                    };
                }
            } else if (direction === 'next') {
                let nextSentenceStartIndex = -1;

                for (let i = currentEndIndex + 1; i < rebuiltSubtitles.length; i++) {
                    if (Array.isArray(rebuiltSubtitles[i-1]) &&
                        rebuiltSubtitles[i-1][0] &&
                        punctuationRegex.test(rebuiltSubtitles[i-1][0]) &&
                        !Array.isArray(rebuiltSubtitles[i])) {
                        nextSentenceStartIndex = i;
                        break;
                    }
                }

                if (nextSentenceStartIndex > 0) {
                    let nextSentenceEndIndex = rebuiltSubtitles.length - 1;
                    for (let i = nextSentenceStartIndex; i < rebuiltSubtitles.length; i++) {
                        if (Array.isArray(rebuiltSubtitles[i]) &&
                            rebuiltSubtitles[i][0] &&
                            punctuationRegex.test(rebuiltSubtitles[i][0])) {
                            nextSentenceEndIndex = i;
                            break;
                        }
                    }

                    const nextSentenceWords = [];
                    for (let i = nextSentenceStartIndex; i <= nextSentenceEndIndex; i++) {
                        nextSentenceWords.push({
                            originalIndex: i,
                            data: rebuiltSubtitles[i]
                        });
                    }

                    const nextSentenceText = mergeWordsIntoSentences(nextSentenceWords);
                    let nextStartTime = 0;
                    let nextEndTime = 0;
                    for (let i = 0; i < nextSentenceWords.length; i++) {
                        const wordItem = nextSentenceWords[i];
                        if (wordItem && wordItem.data && !Array.isArray(wordItem.data)) {
                            if (nextStartTime === 0 || wordItem.data.tStartMs < nextStartTime) {
                                nextStartTime = wordItem.data.tStartMs;
                            }
                            if (wordItem.data.tEndMs > nextEndTime) {
                                nextEndTime = wordItem.data.tEndMs;
                            }
                        }
                    }

                    return {
                        text: nextSentenceText,
                        words: nextSentenceWords,
                        startTime: nextStartTime,
                        endTime: nextEndTime,
                        currentIndex: nextSentenceStartIndex
                    };
                }
            } else if (direction === 'replay') {
                return {
                    text: currentSentence.text,
                    words: currentSentence.words,
                    startTime: currentSentence.startTime,
                    endTime: currentSentence.endTime,
                    currentIndex: currentStartIndex
                };
            }

            return null;
        }

        const targetSentence = findTargetSentence();
        if (!targetSentence || !targetSentence.words || targetSentence.words.length === 0) {
            console.log("无法获取目标句子");
            return;
        }

        currentSubtitleInheiten = targetSentence;

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

        console.log("重播模式开启");
        isReplayMode = true;
        currentSubtitleIndex = targetSentence.currentIndex;

        const video = getVideoElement();

        if (video) {
            isProgramTriggeredPlay = true;

            console.log(`导航到${direction}句，当前视频状态: ${video.paused ? '暂停' : '播放中'}`);

            video.pause();

            video.currentTime = firstValidWord.tStartMs / 1000;

            setTimeout(() => {
                console.log(`开始播放${direction}句`);
                playVideo();
            }, 50);

            if (autoPauseEnabled) {
                const checkInterval = setInterval(() => {
                    const currentVideo = getVideoElement();

                    if (currentVideo) {
                        const now = currentVideo.currentTime * 1000;

                        if (lastValidWord && now >= lastValidWord.tEndMs - 100) {
                            clearInterval(checkInterval);
                            pauseVideo();
                            console.log("重播句子结束");
                        }
                    } else {
                        clearInterval(checkInterval);
                        console.warn("在 interval 中无法获取视频元素");
                    }
                }, 50);
            } else {
                const checkInterval = setInterval(() => {
                    const currentVideo = getVideoElement();

                    if (currentVideo) {
                        const now = currentVideo.currentTime * 1000;

                        if (lastValidWord && now >= lastValidWord.tEndMs - 100) {
                            clearInterval(checkInterval);
                            isReplayMode = false;
                            console.log("句子播放结束，退出重播模式");
                        }
                    } else {
                        clearInterval(checkInterval);
                        console.warn("在 interval 中无法获取视频元素");
                    }
                }, 50);
            }

            setTimeout(() => {
                isProgramTriggeredPlay = false;
            }, 100);
        } else {
            console.warn("无法获取视频元素");
        }

        if (direction === 'current') {
            skipSubtitleRefresh = true;
            setTimeout(() => {
                skipSubtitleRefresh = false;
            }, 1000);
        }
    }

    function checkMobileMode() {
        isMobileMode = window.innerWidth <= 768;
        return isMobileMode;
    }

    function createControlButtons() {
        const controlBar = document.createElement('div');
        controlBar.id = 'overlay-control-bar';
        Object.assign(controlBar.style, {
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '15px',
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
            zIndex: '114514'
        });

        const autoPauseBtn = createControlButton('⏸️', '自动暂停', () => {
            autoPauseEnabled = !autoPauseEnabled;
            autoPauseBtn.style.backgroundColor = autoPauseEnabled ? '#4CAF50' : '#ffffff';
            autoPauseBtn.style.color = autoPauseEnabled ? '#ffffff' : '#333333';
            console.log('自动暂停:', autoPauseEnabled);
        });

        const prevBtn = createControlButton('⏮️', '上一句', () => {
            navigateSubtitles('prev');
        });

        const replayBtn = createControlButton('🔄', '重播', () => {
            navigateSubtitles('replay');
        });

        const nextBtn = createControlButton('⏭️', '下一句', () => {
            navigateSubtitles('next');
        });

        const modeBtn = createControlButton('🎬', '显示模式', () => {
            showModeSelector();
        });

        const offsetBtn = createControlButton('⏱️', '字幕偏移', () => {
            showSubtitleOffsetSelector();
        });

        controlBar.appendChild(autoPauseBtn);
        controlBar.appendChild(prevBtn);
        controlBar.appendChild(replayBtn);
        controlBar.appendChild(nextBtn);
        controlBar.appendChild(modeBtn);
        controlBar.appendChild(offsetBtn);

        return controlBar;
    }

    function createControlButton(icon, title, onClick) {
        const button = document.createElement('button');
        button.innerHTML = icon;
        button.title = title;
        Object.assign(button.style, {
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '1px solid #cccccc',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            transition: 'all 0.2s ease'
        });

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = 'none';
        });

        button.addEventListener('click', onClick);

        return button;
    }

    function showModeSelector() {
        const existingSelector = document.getElementById('mode-selector');
        if (existingSelector) {
            existingSelector.remove();
            return;
        }

        const selector = document.createElement('div');
        selector.id = 'mode-selector';
        Object.assign(selector.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            zIndex: '114515',
            padding: '20px',
            minWidth: '300px'
        });

        const title = document.createElement('h3');
        title.textContent = '选择显示模式';
        Object.assign(title.style, {
            margin: '0 0 15px 0',
            textAlign: 'center',
            color: '#333333'
        });

        const modes = [
            { id: 'theater', name: '剧场模式', desc: '视频在上，字幕在下' },
            { id: 'cinema', name: '影院模式', desc: '视频全屏，字幕居中覆盖' },
            { id: 'reading', name: '阅读模式', desc: '左侧视频，右侧字幕列表' },
            { id: 'hybrid', name: '混合模式', desc: '视频靠左，下方字幕，右侧字幕列表' },
            { id: 'mobile-theater', name: '手机剧场模式', desc: '顶部40%视频，底部字幕' },
            { id: 'mobile-reading', name: '手机阅读模式', desc: '顶部40%视频，底部字幕列表' }
        ];

        const modeList = document.createElement('div');
        Object.assign(modeList.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });

        modes.forEach(mode => {
            const modeBtn = document.createElement('button');
            modeBtn.innerHTML = `<strong>${mode.name}</strong><br><small>${mode.desc}</small>`;
            Object.assign(modeBtn.style, {
                padding: '10px',
                border: '1px solid #e0e0e0',
                borderRadius: '5px',
                backgroundColor: currentDisplayMode === mode.id ? '#4CAF50' : '#ffffff',
                color: currentDisplayMode === mode.id ? '#ffffff' : '#333333',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
            });

            modeBtn.addEventListener('mouseenter', () => {
                if (currentDisplayMode !== mode.id) {
                    modeBtn.style.backgroundColor = '#f5f5f5';
                }
            });

            modeBtn.addEventListener('mouseleave', () => {
                if (currentDisplayMode !== mode.id) {
                    modeBtn.style.backgroundColor = '#ffffff';
                }
            });

            modeBtn.addEventListener('click', () => {
                currentDisplayMode = mode.id;
                chrome.storage.local.set({ youtubeDisplayMode: mode.id });
                updateDisplayMode();
                selector.remove();
            });

            modeList.appendChild(modeBtn);
        });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        Object.assign(closeBtn.style, {
            marginTop: '15px',
            padding: '8px 16px',
            backgroundColor: '#f44336',
            color: '#ffffff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%'
        });

        closeBtn.addEventListener('click', () => {
            selector.remove();
        });

        selector.appendChild(title);
        selector.appendChild(modeList);
        selector.appendChild(closeBtn);
        document.body.appendChild(selector);
    }

    function showSubtitleOffsetSelector() {
        const existingSelector = document.getElementById('subtitle-offset-selector');
        if (existingSelector) {
            existingSelector.remove();
            return;
        }

        const selector = document.createElement('div');
        selector.id = 'subtitle-offset-selector';
        Object.assign(selector.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            zIndex: '114515',
            padding: '20px',
            minWidth: '300px'
        });

        const title = document.createElement('h3');
        title.textContent = '字幕偏移设置';
        Object.assign(title.style, {
            margin: '0 0 15px 0',
            textAlign: 'center',
            color: '#333333'
        });

        const modes = [
            { id: 'normal', name: '正常', desc: '显示当前时间戳对应的字幕' },
            { id: 'prev', name: '延迟一句', desc: '显示上一句字幕' },
            { id: 'next', name: '提前一句', desc: '显示下一句字幕' }
        ];

        const modeList = document.createElement('div');
        Object.assign(modeList.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });

        modes.forEach(mode => {
            const modeBtn = document.createElement('button');
            modeBtn.innerHTML = `<strong>${mode.name}</strong><br><small>${mode.desc}</small>`;
            Object.assign(modeBtn.style, {
                padding: '10px',
                border: '1px solid #e0e0e0',
                borderRadius: '5px',
                backgroundColor: subtitleOffsetMode === mode.id ? '#4CAF50' : '#ffffff',
                color: subtitleOffsetMode === mode.id ? '#ffffff' : '#333333',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
            });

            modeBtn.addEventListener('mouseenter', () => {
                if (subtitleOffsetMode !== mode.id) {
                    modeBtn.style.backgroundColor = '#f5f5f5';
                }
            });

            modeBtn.addEventListener('mouseleave', () => {
                if (subtitleOffsetMode !== mode.id) {
                    modeBtn.style.backgroundColor = '#ffffff';
                }
            });

            modeBtn.addEventListener('click', () => {
                subtitleOffsetMode = mode.id;
                chrome.storage.local.set({ youtubeSubtitleOffset: mode.id });
                lastOverlaySubtitleText = '';
                selector.remove();
            });

            modeList.appendChild(modeBtn);
        });

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        Object.assign(closeBtn.style, {
            marginTop: '15px',
            padding: '8px 16px',
            backgroundColor: '#f44336',
            color: '#ffffff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            width: '100%'
        });

        closeBtn.addEventListener('click', () => {
            selector.remove();
        });

        selector.appendChild(title);
        selector.appendChild(modeList);
        selector.appendChild(closeBtn);
        document.body.appendChild(selector);
    }

    function updateDisplayMode() {
        const overlay = document.getElementById('youtube-video-overlay');
        if (!overlay) return;

        const videoContainer = document.getElementById('overlay-video-container');
        const controlBar = document.getElementById('overlay-control-bar');
        const subtitleContainer = document.getElementById('overlay-subtitle-container');
        const subtitleListContainer = document.getElementById('overlay-subtitle-list-container');
        const leftContainer = document.getElementById('overlay-left-container');
        const rightContainer = document.getElementById('overlay-right-container');

        if (subtitleContainer) subtitleContainer.remove();
        if (subtitleListContainer) subtitleListContainer.remove();
        if (rightContainer) rightContainer.remove();

        if (leftContainer) {
            if (videoContainer && videoContainer.parentElement === leftContainer) {
                overlay.appendChild(videoContainer);
            }
            leftContainer.remove();
        }

        lastOverlaySubtitleText = '';
        subtitleListInitialized = false;

        checkMobileMode();

        switch (currentDisplayMode) {
            case 'theater':
                applyTheaterMode(overlay, videoContainer, controlBar);
                break;
            case 'cinema':
                applyCinemaMode(overlay, videoContainer, controlBar);
                break;
            case 'reading':
                applyReadingMode(overlay, videoContainer, controlBar);
                break;
            case 'hybrid':
                applyHybridMode(overlay, videoContainer, controlBar);
                break;
            case 'mobile-theater':
                applyMobileTheaterMode(overlay, videoContainer, controlBar);
                break;
            case 'mobile-reading':
                applyMobileReadingMode(overlay, videoContainer, controlBar);
                break;
        }
    }

    function applyTheaterMode(overlay, videoContainer, controlBar) {
        Object.assign(overlay.style, {
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start'
        });

        Object.assign(videoContainer.style, {
            flex: '0 0 auto',
            maxWidth: '1280px',
            padding: '20px'
        });

        if (controlBar) {
            Object.assign(controlBar.style, {
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: '114514'
            });
        }

        const subtitleContainer = createSubtitleContainer();
        Object.assign(subtitleContainer.style, {
            flex: '1',
            width: '100%',
            maxWidth: '1280px',
            padding: '20px',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '80px'
        });

        overlay.appendChild(subtitleContainer);
    }

    function applyCinemaMode(overlay, videoContainer, controlBar) {
        Object.assign(overlay.style, {
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
        });

        Object.assign(videoContainer.style, {
            flex: '1',
            width: '100%',
            maxWidth: '100%',
            padding: '0'
        });

        if (controlBar) {
            Object.assign(controlBar.style, {
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: '114514'
            });
        }

        const subtitleContainer = createSubtitleContainer();
        Object.assign(subtitleContainer.style, {
            position: 'fixed',
            bottom: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#ffffff',
            padding: '15px 30px',
            borderRadius: '10px',
            maxWidth: '80%',
            textAlign: 'center',
            zIndex: '114514'
        });

        const subtitleText = subtitleContainer.querySelector('#overlay-subtitle-text');
        if (subtitleText) {
            subtitleText.style.color = '#ffffff';
        }

        overlay.appendChild(subtitleContainer);
    }

    function applyReadingMode(overlay, videoContainer, controlBar) {
        Object.assign(overlay.style, {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'center'
        });

        Object.assign(videoContainer.style, {
            flex: '0 0 50%',
            maxWidth: '50%',
            padding: '20px'
        });

        if (controlBar) {
            Object.assign(controlBar.style, {
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: '114514'
            });
        }

        const subtitleListContainer = createSubtitleListContainer();
        Object.assign(subtitleListContainer.style, {
            flex: '0 0 50%',
            maxWidth: '50%',
            height: 'calc(100vh - 80px)',
            overflow: 'auto',
            padding: '20px',
            boxSizing: 'border-box',
            backgroundColor: '#f9f9f9',
            marginBottom: '80px'
        });

        overlay.appendChild(subtitleListContainer);
    }

    function applyHybridMode(overlay, videoContainer, controlBar) {
        Object.assign(overlay.style, {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'flex-start'
        });

        if (controlBar) {
            Object.assign(controlBar.style, {
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: '114514'
            });
        }

        const leftContainer = document.createElement('div');
        leftContainer.id = 'overlay-left-container';
        Object.assign(leftContainer.style, {
            flex: '0 0 60%',
            maxWidth: '60%',
            height: 'calc(100vh - 80px)',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '80px'
        });

        Object.assign(videoContainer.style, {
            flex: '0 0 auto',
            width: '100%',
            maxWidth: '100%',
            padding: '20px'
        });

        const subtitleContainer = createSubtitleContainer();
        Object.assign(subtitleContainer.style, {
            flex: '1',
            padding: '20px',
            minHeight: '100px',
            backgroundColor: '#f5f5f5',
            borderTop: '1px solid #e0e0e0'
        });

        const rightContainer = document.createElement('div');
        rightContainer.id = 'overlay-right-container';
        Object.assign(rightContainer.style, {
            flex: '0 0 40%',
            maxWidth: '40%',
            height: 'calc(100vh - 80px)',
            overflow: 'auto',
            padding: '20px',
            boxSizing: 'border-box',
            backgroundColor: '#f9f9f9',
            marginBottom: '80px'
        });

        const subtitleListContainer = createSubtitleListContainer();
        rightContainer.appendChild(subtitleListContainer);

        leftContainer.appendChild(videoContainer);
        leftContainer.appendChild(subtitleContainer);

        overlay.appendChild(leftContainer);
        overlay.appendChild(rightContainer);
    }

    function applyMobileTheaterMode(overlay, videoContainer, controlBar) {
        Object.assign(overlay.style, {
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start'
        });

        Object.assign(videoContainer.style, {
            flex: '0 0 40%',
            width: '100%',
            padding: '10px'
        });

        if (controlBar) {
            Object.assign(controlBar.style, {
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: '114514'
            });
        }

        const subtitleContainer = createSubtitleContainer();
        Object.assign(subtitleContainer.style, {
            flex: '1',
            width: '100%',
            padding: '15px',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f5f5f5',
            marginBottom: '80px'
        });

        overlay.appendChild(subtitleContainer);
    }

    function applyMobileReadingMode(overlay, videoContainer, controlBar) {
        Object.assign(overlay.style, {
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start'
        });

        Object.assign(videoContainer.style, {
            flex: '0 0 40%',
            width: '100%',
            padding: '10px'
        });

        if (controlBar) {
            Object.assign(controlBar.style, {
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                zIndex: '114514'
            });
        }

        const subtitleListContainer = createSubtitleListContainer();
        Object.assign(subtitleListContainer.style, {
            flex: '1',
            width: '100%',
            height: 'calc(100vh - 80px)',
            overflow: 'auto',
            padding: '15px',
            boxSizing: 'border-box',
            backgroundColor: '#f9f9f9',
            marginBottom: '80px'
        });

        overlay.appendChild(subtitleListContainer);
    }

    function createSubtitleContainer() {
        const container = document.createElement('div');
        container.id = 'overlay-subtitle-container';
        const subtitleText = document.createElement('div');
        subtitleText.id = 'overlay-subtitle-text';
        Object.assign(subtitleText.style, {
            fontSize: '24px',
            fontFamily: '"Fanwood", "LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif',
            lineHeight: '1.6',
            textAlign: 'center',
            color: '#333333'
        });
        container.appendChild(subtitleText);
        return container;
    }

    function createSubtitleListContainer() {
        const container = document.createElement('div');
        container.id = 'overlay-subtitle-list-container';
        const subtitleList = document.createElement('div');
        subtitleList.id = 'overlay-subtitle-list';
        Object.assign(subtitleList.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });
        container.appendChild(subtitleList);
        return container;
    }

    function updateSubtitleDisplay() {
        const currentSentence = getCurrentSubtitles();
        const subtitleText = document.getElementById('overlay-subtitle-text');
        const subtitleList = document.getElementById('overlay-subtitle-list');

        if (subtitleText && currentSentence) {
            if (currentSentence.text !== lastOverlaySubtitleText) {
                lastOverlaySubtitleText = currentSentence.text;
                subtitleText.textContent = currentSentence.text;
            }
        }

        if (subtitleList && rebuiltSubtitles.length > 0) {
            updateSubtitleList(subtitleList, currentSentence);
        }
    }

    function updateSubtitleList(subtitleList, currentSentence) {
        const currentTime = getYoutubeCurrentTime();

        if (!subtitleListInitialized) {
            const sentences = extractAllSentences(rebuiltSubtitles);
            subtitleListItems = [];

            sentences.forEach((sentence, index) => {
                const item = document.createElement('div');
                item.className = 'subtitle-item';
                item.dataset.startTime = sentence.startTime;
                item.dataset.endTime = sentence.endTime;
                Object.assign(item.style, {
                    padding: '10px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e0e0e0',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                });

                const playBtn = document.createElement('button');
                playBtn.innerHTML = '▶️';
                Object.assign(playBtn.style, {
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#4CAF50',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px'
                });

                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setYoutubeTime(sentence.startTime);
                    playVideo();
                });

                const text = document.createElement('div');
                text.textContent = sentence.text;
                Object.assign(text.style, {
                    flex: '1',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: '#333333'
                });

                item.appendChild(playBtn);
                item.appendChild(text);

                item.addEventListener('click', () => {
                    setYoutubeTime(sentence.startTime);
                    playVideo();
                });

                subtitleList.appendChild(item);
                subtitleListItems.push({
                    element: item,
                    sentence: sentence
                });
            });

            subtitleListInitialized = true;
        }

        subtitleListItems.forEach(({ element, sentence }) => {
            const isActive = currentTime >= sentence.startTime && currentTime <= sentence.endTime;
            element.style.backgroundColor = isActive ? '#e3f2fd' : '#ffffff';

            if (isActive) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    function extractAllSentences(subtitles) {
        const sentences = [];
        const punctuationRegex = getPunctuationRegex();
        let currentSentenceWords = [];
        let currentStartTime = 0;
        let currentEndTime = 0;

        for (let i = 0; i < subtitles.length; i++) {
            const element = subtitles[i];

            if (Array.isArray(element)) {
                if (element.length > 0) {
                    const punctuation = element[0];
                    if (punctuationRegex.test(punctuation) && currentSentenceWords.length > 0) {
                        const sentenceText = mergeWordsIntoSentences(currentSentenceWords);
                        sentences.push({
                            text: sentenceText,
                            startTime: currentStartTime,
                            endTime: currentEndTime,
                            words: currentSentenceWords
                        });
                        currentSentenceWords = [];
                    }
                }
                continue;
            }

            if (currentSentenceWords.length === 0) {
                currentStartTime = element.tStartMs;
            }
            currentEndTime = element.tEndMs;

            const wordItem = {
                originalIndex: i,
                data: element
            };

            currentSentenceWords.push(wordItem);

            if (element.utf8) {
                const lastChar = element.utf8.charAt(element.utf8.length - 1);
                if (punctuationRegex.test(lastChar)) {
                    const sentenceText = mergeWordsIntoSentences(currentSentenceWords);
                    sentences.push({
                        text: sentenceText,
                        startTime: currentStartTime,
                        endTime: currentEndTime,
                        words: currentSentenceWords
                    });
                    currentSentenceWords = [];
                }
            }
        }

        if (currentSentenceWords.length > 0) {
            const sentenceText = mergeWordsIntoSentences(currentSentenceWords);
            sentences.push({
                text: sentenceText,
                startTime: currentStartTime,
                endTime: currentEndTime,
                words: currentSentenceWords
            });
        }

        return sentences;
    }

    function startSubtitleUpdate() {
        if (subtitleUpdateInterval) {
            clearInterval(subtitleUpdateInterval);
        }

        subtitleUpdateInterval = setInterval(() => {
            updateSubtitleDisplay();
        }, 100);
    }

    function stopSubtitleUpdate() {
        if (subtitleUpdateInterval) {
            clearInterval(subtitleUpdateInterval);
            subtitleUpdateInterval = null;
        }
    }
})();
