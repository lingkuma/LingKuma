// ==UserScript==
// @name         YouTube 视频覆盖层
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  在 YouTube 页面上创建白色覆盖层，并在其中显示原视频
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

    chrome.storage.local.get({
        youtubeVideoOverlay: false
    }, function(result) {
        if (result.youtubeVideoOverlay) {
            console.log("YouTube 视频覆盖层已启用");
            initializeOverlay();
            setupUrlMonitoring();
        }
    });

    function initializeOverlay() {
        if (!window.location.href.includes('/watch?v=')) {
            console.log("不是视频页面，跳过初始化");
            return;
        }

        cleanupOverlay();

        waitForElement('#movie_player', createOverlay, 100, 30000);
    }

    function cleanupOverlay() {
        if (overlayContainer) {
            overlayContainer.remove();
            overlayContainer = null;
        }

        if (originalVideo && originalParent) {
            originalParent.appendChild(originalVideo);
            originalVideo.style.display = '';
            originalVideo = null;
            originalParent = null;
        }

        isOverlayActive = false;
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
            zIndex: '2147483647',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            width: '100%',
            padding: '20px',
            backgroundColor: '#f0f0f0',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxSizing: 'border-box'
        });

        const title = document.createElement('h1');
        title.textContent = 'YouTube 视频覆盖层';
        Object.assign(title.style, {
            margin: '0',
            fontSize: '24px',
            color: '#333'
        });

        const closeButton = document.createElement('button');
        closeButton.textContent = '关闭覆盖层';
        Object.assign(closeButton.style, {
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#ff0000',
            color: '#ffffff',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
        });
        closeButton.addEventListener('click', () => {
            cleanupOverlay();
        });

        header.appendChild(title);
        header.appendChild(closeButton);

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
        overlay.appendChild(header);
        overlay.appendChild(videoContainer);

        document.body.appendChild(overlay);
        overlayContainer = overlay;
        isOverlayActive = true;

        Object.assign(originalVideo.style, {
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            position: 'relative'
        });

        console.log("YouTube 视频覆盖层创建成功，视频已移动到覆盖层");
    }

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "toggleYoutubeVideoOverlay") {
            if (isOverlayActive) {
                cleanupOverlay();
            } else {
                initializeOverlay();
            }
        }
    });
})();
