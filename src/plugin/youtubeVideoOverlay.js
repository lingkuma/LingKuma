// ==UserScript==
// @name         YouTube 视频覆盖层
// @namespace    http://tampermonkey.net/
// @version      0.2
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
    let floatButton = null;

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
            zIndex: '2147483646',
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
        youtubeVideoOverlay: false
    }, function(result) {
        if (result.youtubeVideoOverlay) {
            console.log("YouTube 视频覆盖层已启用");
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
            zIndex: '2147483647',
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
            zIndex: '2147483648',
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
        overlay.appendChild(closeButton);
        overlay.appendChild(videoContainer);

        document.body.appendChild(overlay);
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
