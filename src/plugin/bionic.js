(function() {
    'use strict';

    // 辅助函数：转义正则中需要的特殊字符
    function escapeRegExp(str) {
        return str.replace(/[\\^$.+?()[\]{}|]/g, '\\$&');
    }

    // 将带有 * 通配符的模式转换为正则表达式
    function wildcardToRegExp(pattern) {
        return new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$', 'i');
    }

    // 判断 URL 是否匹配某个单一模式
    function isUrlMatch(url, pattern) {
        if (!pattern) return false;
        let regex = wildcardToRegExp(pattern);
        return regex.test(url);
    }

    // 判断 URL 是否匹配由分号分隔的多个模式中的任意一个
    function patternListMatch(url, patternList) {
        // console.log("patternListMatch", url, patternList);

        if (!patternList) return false;
        const patterns = patternList.split(';').map(s => s.trim()).filter(Boolean);
        for (let pat of patterns) {
            if (isUrlMatch(url, pat)) return true;
        }
        return false;
    }

    // 如果外部没有定义 isDarkMode，则定义之（依赖于后续 window.globalIsDarkMode 的设定）
    // function isDarkMode() {
    //     return window.globalIsDarkMode ? window.globalIsDarkMode() : false;
    // }

    // 获取 Bionic 配置及当前页面 URL 判断是否启动与主题适配
    let isEnabled = true;
    let currentScopeObserver = null;
    var bionicisDark;
    var bionicFontFamily = 'auto';
    var bionicFontSize = 16;

    chrome.storage.local.get({
        bionicEnabled: false,  // 默认在 popup 中设为 true
        bionicBlacklistWebsites: '',
        bionicDefaultDayWebsites: 'https://day.test.com/*;',
        bionicDefaultNightWebsites: '*://github.com/*;*://*.github.com/*',
        bionicFontFamily: 'auto', // 新增字体设置默认值
        bionicFontSize: 16, // 新增字号设置默认值
        // Thanox Reading 设置
        thanoxReadingEnabled: false,
        thanoxProcessingOpacity: 50,
        thanoxCompletedOpacity: 10,
        thanoxWordSpeed: 1000,
        // 碎片特效设置
        thanoxFragmentEffect: true,
        thanoxFragmentCount: 8,
        thanoxFragmentDuration: 2000
    }, function(result) {
        // 如果 bionicEnabled 为 undefined，则默认认为可用
        isEnabled = result.bionicEnabled || false;

        var currentUrl = window.location.href;
        // 如果当前页面在黑名单中，则不启动 Bionic Reading
        if (patternListMatch(currentUrl, result.bionicBlacklistWebsites)) {
            // console.log("当前网站在Bionic Reading黑名单中，停止启动");
            return;
        }
        // 根据白名单判断当前页面的主题

        if (patternListMatch(currentUrl, result.bionicDefaultNightWebsites)) {
            bionicisDark = 1;

        } else if (patternListMatch(currentUrl, result.bionicDefaultDayWebsites)) {
            bionicisDark = 2;

        } else {
            bionicisDark = 3;  // 如果均未匹配，则走原逻辑

        }

        // 保存字体设置
        bionicFontFamily = result.bionicFontFamily;
        bionicFontSize = result.bionicFontSize;

        // 保存 Thanox Reading 设置
        thanoxReadingEnabled = result.thanoxReadingEnabled;
        thanoxProcessingOpacity = result.thanoxProcessingOpacity / 100; // 转换为 0-1 范围
        thanoxCompletedOpacity = result.thanoxCompletedOpacity / 100;   // 转换为 0-1 范围
        thanoxWordSpeed = result.thanoxWordSpeed;

        // 保存碎片特效设置
        thanoxFragmentEffect = result.thanoxFragmentEffect;
        thanoxFragmentCount = result.thanoxFragmentCount;
        thanoxFragmentDuration = result.thanoxFragmentDuration;

        if (!isEnabled) {
            console.log("Bionic Reading 已禁用");
            return;
        }
        // 固定延迟后启动 bionic 初始化
        setTimeout(function() {
            // console.log("Bionic Reading 固定延迟启动！");
            initBionicReading();
        }, 1);
    });

    // 替换 GM_addStyle 实现动态添加样式
    function addStyle(css) {
        const style = document.createElement('style');
        style.id = 'bionic-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // 主题切换函数 (仅影响当前页面)
    // 修改 setTheme 函数以支持字体和字号设置
function setTheme(isDark) {
    const oldStyle = document.getElementById('bionic-style');
    if (oldStyle) oldStyle.remove();

    // 根据字体设置生成 CSS
    let styleContent = isDark ? css : css_white;

    // 应用字体和字号样式
    styleContent = applyFontToCSS(styleContent, bionicFontFamily, bionicFontSize);

    addStyle(styleContent);

    // 同时更新页面中所有 iframe 样式
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc) return;

            const oldIframeStyle = iframeDoc.getElementById('bionic-style');
            if (oldIframeStyle) oldIframeStyle.remove();

            const iframeStyle = iframeDoc.createElement('style');
            iframeStyle.id = 'bionic-style';
            iframeStyle.type = 'text/css';
            iframeStyle.appendChild(iframeDoc.createTextNode(styleContent));
            iframeDoc.head.appendChild(iframeStyle);
        } catch (e) {
            console.log('无法访问iframe内容:', e);
        }
    });
}

    // 定义主题样式
    const css = `
        .highlight-first-three::before {
            text-indent: 0 !important;
            content: attr(data-first-three);
            font-weight: inherit;
            color: rgb(92, 122, 234);
            position: absolute;
            white-space: pre;
            pointer-events: none;
            font-family: inherit;
            font-size: inherit;
            font-style: inherit;
            font-variant: inherit;
            font-weight: inherit;
            line-height: inherit;
            letter-spacing: inherit;
            word-spacing: inherit;
        }
        .highlight-wrapper {
            position: relative;
            display: inline-block;
            text-indent: 0 !important;
        }
        .textLayer .highlight-wrapper {
            display: inline !important;
            position: relative !important;
        }
        .highlight-wrapper::before {
            text-indent: 0 !important;
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
            text-shadow: none;
            left: 0;
            top: 0;
            width: auto;
            height: auto;
            font-family: inherit !important;
            font-size: inherit !important;
            letter-spacing: inherit !important;
            word-spacing: inherit !important;
            line-height: inherit !important;
            text-rendering: geometricPrecision;
            -webkit-font-smoothing: subpixel-antialiased;
            font-kerning: inherit !important;
            font-variant-ligatures: inherit !important;
            font-feature-settings: inherit !important;
            white-space: pre;
            pointer-events: none;
        }
        .highlight-wrapper::after {
            content: attr(data-original);
            display: none;
        }

        /* 碎片特效样式 */
        .thanox-fragment {
            position: absolute;
            pointer-events: none;
            font-family: inherit;
            font-size: inherit;
            font-weight: inherit;
            color: inherit;
            z-index: 1000;
            animation: fragmentFloat 2s ease-out forwards;
        }

        @keyframes fragmentFloat {
            0% {
                opacity: 1;
                transform: translate(0, 0) rotate(0deg) scale(1);
            }
            50% {
                opacity: 0.7;
                transform: translate(calc(var(--end-x, 0px) * 0.5), calc(var(--end-y, -30px) * 0.5))
                          rotate(calc(var(--end-rotation, 180deg) * 0.5)) scale(0.8);
            }
            100% {
                opacity: 0;
                transform: translate(var(--end-x, 0px), var(--end-y, -60px))
                          rotate(var(--end-rotation, 360deg)) scale(0.3);
            }
        }

        .thanox-fragmenting {
            position: relative;
            overflow: visible;
        }
    `;

    const css_white = `
        .highlight-first-three::before {
            text-indent: 0 !important;
            content: attr(data-first-three);
            font-weight: inherit;
            color: rgb(92, 122, 234);
            position: absolute;
            white-space: pre;
            pointer-events: none;
            font-family: inherit;
            font-size: inherit;
            font-style: inherit;
            font-variant: inherit;
            font-weight: inherit;
            line-height: inherit;
            letter-spacing: inherit;
            word-spacing: inherit;
        }
        .highlight-wrapper {
            position: relative;
            display: inline-block;
            text-indent: 0 !important;
        }
        .textLayer .highlight-wrapper {
            display: inline !important;
            position: relative !important;
        }
        .highlight-wrapper::before {
            text-indent: 0 !important;
            content: attr(data-highlight);
            position: absolute;
            color: rgb(0, 0, 0);
            background: linear-gradient(to right, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.65) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            opacity: 100;
            mix-blend-mode: multiply;
            text-shadow: none;
            left: 0;
            top: 0;
            width: auto;
            height: auto;

            font-size: inherit !important;
            letter-spacing: inherit !important;
            word-spacing: inherit !important;
            line-height: inherit !important;
            text-rendering: geometricPrecision;
            -webkit-font-smoothing: subpixel-antialiased;
            font-kerning: inherit !important;
            font-variant-ligatures: inherit !important;
            font-feature-settings: inherit !important;
            white-space: pre;
            pointer-events: none;
        }
        .highlight-wrapper::after {
            content: attr(data-original);
            display: none;
        }

        /* 碎片特效样式 */
        .thanox-fragment {
            position: absolute;
            pointer-events: none;
            font-family: inherit;
            font-size: inherit;
            font-weight: inherit;
            color: inherit;
            z-index: 1000;
            animation: fragmentFloat 2s ease-out forwards;
        }

        @keyframes fragmentFloat {
            0% {
                opacity: 1;
                transform: translate(0, 0) rotate(0deg) scale(1);
            }
            50% {
                opacity: 0.7;
                transform: translate(calc(var(--end-x, 0px) * 0.5), calc(var(--end-y, -30px) * 0.5))
                          rotate(calc(var(--end-rotation, 180deg) * 0.5)) scale(0.8);
            }
            100% {
                opacity: 0;
                transform: translate(var(--end-x, 0px), var(--end-y, -60px))
                          rotate(var(--end-rotation, 360deg)) scale(0.3);
            }
        }

        .thanox-fragmenting {
            position: relative;
            overflow: visible;
        }
    `;

    // 防抖函数
    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => {
                fn.apply(this, args);
            }, delay);
        };
    }

    // 作用域观察器类（省略部分内部逻辑，保持原有功能）
    class ScopeObserver {
        constructor(scopeTree) {
            this.scopeTree = scopeTree;
            this.scope = scopeTree.scope;
            this.initialized = false;
            this.intersectionObserver = this.createIntersectionObserver();
            this.pendingMutations = {
                addedElements: new Set(),
                removedElements: new Set(),
                changedTextNodes: new Set()
            };
            this.processPendingDebounced = debounce(() => {
                this.processPendingMutations();
            }, 50);
            this.mutationObserver = this.createMutationObserver();
            this.processedParents = new Map();
            this.visibleHighlights = new Map();
            Promise.resolve().then(() => this.initializeObserver());
        }

        createIntersectionObserver() {
            return new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    const target = entry.target;
                    if (entry.isIntersecting) {
                        this.handleElementVisible(target);
                    } else {
                        this.handleElementHidden(target);
                    }
                });
            });
        }

        createMutationObserver() {
            return new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.pendingMutations.addedElements.add(node);
                        } else if (
                            node.nodeType === Node.TEXT_NODE &&
                            node.textContent.trim() &&
                            node.parentNode &&
                            this.isValidTextParent(node.parentNode)
                        ) {
                            this.pendingMutations.changedTextNodes.add(node);
                        }
                    });

                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.pendingMutations.removedElements.add(node);
                            this.cleanupRemovedElement(node);
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            this.cleanupTextNode(node);
                        }
                    });

                    if (
                        mutation.type === 'characterData' &&
                        mutation.target.nodeType === Node.TEXT_NODE &&
                        mutation.target.textContent.trim()
                    ) {
                        this.pendingMutations.changedTextNodes.add(mutation.target);
                        this.cleanupTextNode(mutation.target);
                    }
                });
                this.processPendingDebounced();
            });
        }

        processPendingMutations() {
            this.pendingMutations.addedElements.forEach(element => {
                this.processElement(element);
            });
            this.pendingMutations.addedElements.clear();
            this.pendingMutations.changedTextNodes.forEach(textNode => {
                this.processTextNode(textNode);
            });
            this.pendingMutations.changedTextNodes.clear();
        }

        async initializeObserver() {
            if (this.initialized) return;
            this.mutationObserver.observe(this.scope, {
                childList: true,
                subtree: true,
                characterData: true
            });
            this.scanVisibleTextNodes();
            this.initialized = true;
        }

        scanVisibleTextNodes() {
            const walker = document.createTreeWalker(
                this.scope,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: node => {
                        if (!node.textContent.trim() ||
                            !this.isValidTextParent(node.parentNode)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            const textNodes = [];
            let currentNode;
            while (currentNode = walker.nextNode()) {
                textNodes.push(currentNode);
            }
            textNodes.forEach(node => {
                this.processTextNode(node);
            });
        }

        processTextNode(textNode) {
            if (!textNode || !textNode.parentNode) return;
            const parent = textNode.parentNode;
            if (!this.isValidTextParent(parent)) return;
            let textNodeMap = this.processedParents.get(parent);
            if (!textNodeMap) {
                textNodeMap = new Map();
                this.processedParents.set(parent, textNodeMap);
                this.intersectionObserver.observe(parent);
            }
            const text = textNode.textContent;
            if (text.trim() && this.shouldHighlightText(text)) {
                const highlightData = this.createHighlightData(text);
                textNodeMap.set(textNode, highlightData);
            }
        }

        processElement(element) {
            if (!element) return;
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: node => {
                        if (!node.textContent.trim() ||
                            !this.isValidTextParent(node.parentNode)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            const textNodes = [];
            let currentNode;
            while (currentNode = walker.nextNode()) {
                textNodes.push(currentNode);
            }
            textNodes.forEach(node => {
                this.processTextNode(node);
            });
        }

        isValidTextParent(element) {
            if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
            const tagName = element.tagName.toUpperCase();
            if (tagName === 'SCRIPT' || tagName === 'STYLE' ||
                tagName === 'INPUT' || tagName === 'TEXTAREA') {
                return false;
            }
            if (element.isContentEditable) return false;
            if (element.classList.contains('highlight-wrapper')) return false;
            let currentElement = element;
            while (currentElement) {
                if (currentElement.isContentEditable ||
                    currentElement.tagName === 'INPUT' ||
                    currentElement.tagName === 'TEXTAREA' ||
                    currentElement.role === 'textbox') {
                    return false;
                }
                currentElement = currentElement.parentElement;
            }
            return true;
        }

        shouldHighlightText(text) {
            const CJKRegex = /[\u4E00-\u9FFF\u3040-\u30FF\u3130-\u318F\u3000-\u303F\uAC00-\uD7AF\u1100-\u11FF]/.test(text);
            if (text.length === 1 && /[\u3000-\u303F\uFF00-\uFFEF]/.test(text)) {
                return false;
            }
            return !CJKRegex;
        }

        createHighlightData(text) {
            const words = text.match(/\S+|\s+/g) || [];
            const highlightData = [];
            words.forEach(word => {
                if (word.trim()) {
                    const boldLength = Math.ceil(word.length * 0.4);
                    const highlightText = word.slice(0, boldLength);
                    highlightData.push({
                        original: word,
                        highlight: highlightText,
                        isSpace: false
                    });
                } else {
                    highlightData.push({
                        original: word,
                        isSpace: true
                    });
                }
            });
            return highlightData;
        }

        handleElementVisible(parent) {
            const textNodeMap = this.processedParents.get(parent);
            if (!textNodeMap) return;
            let visibleMap = this.visibleHighlights.get(parent);
            if (!visibleMap) {
                visibleMap = new Map();
                this.visibleHighlights.set(parent, visibleMap);
            }
            for (const [textNode, highlightData] of textNodeMap.entries()) {
                if (visibleMap.has(textNode)) continue;
                const fragment = document.createDocumentFragment();
                highlightData.forEach(data => {
                    if (data.isSpace) {
                        fragment.appendChild(document.createTextNode(data.original));
                    } else {
                        const wordSpan = document.createElement('span');
                        wordSpan.className = 'highlight-wrapper';
                        wordSpan.setAttribute('data-first-three', data.highlight);
                        wordSpan.setAttribute('data-highlight', data.highlight);
                        wordSpan.setAttribute('data-original', data.original);
                        wordSpan.textContent = data.original;
                        fragment.appendChild(wordSpan);
                    }
                });
                visibleMap.set(textNode, fragment);
                if (textNode.parentNode) {
                    const parentElement = textNode.parentNode;
                    parentElement.replaceChild(fragment, textNode);

                    // 检查父元素是否是 <p dir="auto">
                    if (parentElement.tagName === 'P' && parentElement.getAttribute('dir') === 'auto') {
                        // 检查其最后一个子元素是否已经是空的 <p dir="auto"></p>
                        const lastChild = parentElement.lastElementChild;
                        if (!lastChild ||
                            lastChild.tagName !== 'P' ||
                            lastChild.getAttribute('dir') !== 'auto' ||
                            lastChild.childNodes.length > 0 ||
                            (lastChild.textContent && lastChild.textContent.trim() !== '')) {

                            const newEmptyP = document.createElement('p');
                            newEmptyP.setAttribute('dir', 'auto');
                            // 将新的空 <p> 元素追加到主P元素的内部，作为其最后一个子元素
                            parentElement.appendChild(newEmptyP);
                        }
                    }
                }
            }
        }

        handleElementHidden(parent) {
            const visibleMap = this.visibleHighlights.get(parent);
            if (!visibleMap) return;
            this.visibleHighlights.delete(parent);
        }

        cleanupRemovedElement(element) {
            if (this.processedParents.has(element)) {
                this.intersectionObserver.unobserve(element);
                this.processedParents.delete(element);
            }
            if (this.visibleHighlights.has(element)) {
                this.visibleHighlights.delete(element);
            }
            for (const [parent] of this.processedParents) {
                if (element.contains(parent)) {
                    this.intersectionObserver.unobserve(parent);
                    this.processedParents.delete(parent);
                    this.visibleHighlights.delete(parent);
                }
            }
        }

        cleanupTextNode(textNode) {
            for (const [parent, textMap] of this.processedParents.entries()) {
                if (textMap.has(textNode)) {
                    textMap.delete(textNode);
                    if (textMap.size === 0) {
                        this.intersectionObserver.unobserve(parent);
                        this.processedParents.delete(parent);
                    }
                    const visibleMap = this.visibleHighlights.get(parent);
                    if (visibleMap && visibleMap.has(textNode)) {
                        visibleMap.delete(textNode);
                        if (visibleMap.size === 0) {
                            this.visibleHighlights.delete(parent);
                        }
                    }
                    return;
                }
            }
        }

        dispose() {
            this.intersectionObserver.disconnect();
            this.mutationObserver.disconnect();
            this.processedParents.clear();
            this.visibleHighlights.clear();
        }
    }

    // 作用域树类 - 管理多个文档作用域
    class ScopeTree {
        constructor(scope, parent = null) {
            this.scope = scope;
            this.parent = parent;
            this.children = [];
            this.observer = new ScopeObserver(this);
        }

        getOrCreateChildScope(scope) {
            for (const child of this.children) {
                if (child.scope === scope) {
                    return child;
                }
            }
            const childTree = new ScopeTree(scope, this);
            this.children.push(childTree);
            return childTree;
        }

        dispose() {
            for (const child of this.children) {
                child.dispose();
            }
            this.observer.dispose();
            this.children = [];
        }
    }

    // Thanox Read 相关变量
    let thanoxReadActive = false;
    let thanoxReadTimer = null;
    let thanoxReadWordIndex = 0;
    let thanoxReadWords = [];
    let processedWords = new Set(); // 记录已处理的单词，防止重复处理
    let thanoxReadObserver = null; // 用于监听新单词的出现

    // Thanox Read 设置变量
    let thanoxReadingEnabled = false;
    let thanoxProcessingOpacity = 0.5; // 处理中的透明值 (0-1)
    let thanoxCompletedOpacity = 0.1;  // 处理完成后的透明值 (0-1)
    let thanoxWordSpeed = 1000;        // 单词消失速度 (毫秒)

    // 碎片特效设置变量
    let thanoxFragmentEffect = true;   // 是否启用碎片特效
    let thanoxFragmentCount = 8;       // 碎片数量
    let thanoxFragmentDuration = 2000; // 碎片动画持续时间 (毫秒)

    // 主函数：初始化 Bionic Reading 功能
    function initBionicReading() {
        if (!isEnabled) return;
        console.log("初始化 Bionic Reading, 当前窗口:", window.location.href, window.top === window ? '主页面' : 'iframe');
        console.log("bionicisDark值:", bionicisDark);

        // 清理之前的实例
        if (currentScopeObserver) {
            currentScopeObserver.dispose();
        }

        const rootTree = new ScopeTree(document);
        currentScopeObserver = rootTree.observer; // 保存新的实例引用
        const sharedStyle = document.createElement('style');
        sharedStyle.id = 'bionic-style';

        // 触发自定义事件，通知其他功能bionic模式已启动
        const bionicActivatedEvent = new CustomEvent('bionicActivated', {
            detail: { message: 'Bionic mode has been activated' }
        });
        document.dispatchEvent(bionicActivatedEvent);

        //获取高亮功能是否启动
        chrome.storage.local.get('enablePlugin', function(result) {
            result.enablePlugin
        });




        // 使用 async/await 重构主题设置逻辑
        async function setInitialStyle() {
            let styleContent;

            // 先检查是否有明确的主题设置
            if (bionicisDark == 1) {
                styleContent = css;
            } else if (bionicisDark == 2) {
                styleContent = css_white;
            } else {
                // 获取高亮插件状态
                const highlightResult = await chrome.storage.local.get(['enablePlugin']);

                if (highlightResult.enablePlugin) {
                    // 如果高亮插件开启，使用其isDarkMode设置
                    const result = await chrome.storage.local.get(['isDarkMode']);
                    styleContent = result.isDarkMode ? css : css_white;
                } else {
                    // 如果高亮插件关闭，延迟检测系统暗色模式
                    // await new Promise(resolve => setTimeout(resolve, 2000)); // 延迟2秒
                    console.log("高亮插件关闭，延迟2秒后检测系统暗色模式");
                    // 尝试多种方式检测暗色模式
                    const isDark = isDarkMode();

                    styleContent = isDark ? css : css_white;
                }
            }

            // 应用字体和字号设置
            styleContent = applyFontToCSS(styleContent, bionicFontFamily, bionicFontSize);

            sharedStyle.textContent = styleContent;
            document.head.appendChild(sharedStyle);
        }











        // 调用异步函数
        setInitialStyle().catch(error => {
            console.error('设置样式时出错:', error);
            // 发生错误时使用默认样式
            sharedStyle.textContent = css_white;
            document.head.appendChild(sharedStyle);
        });

        // 启动 Thanox Read 功能（延迟启动以确保bionic处理完成）
        setTimeout(() => {
            if (thanoxReadingEnabled) {
                startThanoxRead();
            }
        }, 2000);
    }

    // 新增：将字体和字号应用到 CSS 的辅助函数
function applyFontToCSS(cssText, fontFamily, fontSize) {
    // 修改 highlight-wrapper 的字体和字号
    let fontStyles = '';
    if (fontFamily !== 'auto') {
        fontStyles += `font-family: ${fontFamily} !important;`;
    }
    if (fontSize && fontSize !== 16) {
        fontStyles += `font-size: ${fontSize}px !important;`;
    }

    if (fontStyles) {
        cssText = cssText.replace(
            '.highlight-wrapper {',
            `.highlight-wrapper {
            ${fontStyles}`
        );
    }

    return cssText;
}

// 创建碎片特效
function createFragmentEffect(wordElement) {
    if (!thanoxFragmentEffect || !wordElement || !wordElement.parentNode) {
        return;
    }

    const rect = wordElement.getBoundingClientRect();
    const text = wordElement.textContent;
    const fragmentContainer = document.createElement('div');
    fragmentContainer.className = 'thanox-fragmenting';
    fragmentContainer.style.position = 'absolute';
    fragmentContainer.style.left = rect.left + window.scrollX + 'px';
    fragmentContainer.style.top = rect.top + window.scrollY + 'px';
    fragmentContainer.style.width = rect.width + 'px';
    fragmentContainer.style.height = rect.height + 'px';
    fragmentContainer.style.pointerEvents = 'none';
    fragmentContainer.style.zIndex = '1000';

    // 计算每个碎片的字符数
    const charsPerFragment = Math.max(1, Math.floor(text.length / thanoxFragmentCount));

    for (let i = 0; i < thanoxFragmentCount; i++) {
        const startIndex = i * charsPerFragment;
        const endIndex = i === thanoxFragmentCount - 1 ? text.length : (i + 1) * charsPerFragment;
        const fragmentText = text.slice(startIndex, endIndex);

        if (fragmentText.trim()) {
            const fragment = document.createElement('span');
            fragment.className = 'thanox-fragment';
            fragment.textContent = fragmentText;

            // 设置碎片的初始位置
            const fragmentX = (rect.width / thanoxFragmentCount) * i;
            fragment.style.left = fragmentX + 'px';
            fragment.style.top = '0px';

            // 添加随机的飘散方向
            const randomX = (Math.random() - 0.5) * 100; // -50px 到 50px
            const randomY = -60 - Math.random() * 40; // -60px 到 -100px
            const randomRotation = Math.random() * 720 - 360; // -360deg 到 360deg

            // 设置动画持续时间
            fragment.style.animationDuration = thanoxFragmentDuration + 'ms';

            // 自定义动画终点
            fragment.style.setProperty('--end-x', randomX + 'px');
            fragment.style.setProperty('--end-y', randomY + 'px');
            fragment.style.setProperty('--end-rotation', randomRotation + 'deg');

            fragmentContainer.appendChild(fragment);
        }
    }

    // 将碎片容器添加到页面
    document.body.appendChild(fragmentContainer);

    // 隐藏原始单词
    wordElement.style.opacity = '0';
    wordElement.style.transition = 'opacity 0.3s ease';

    // 动画结束后清理碎片
    setTimeout(() => {
        if (fragmentContainer && fragmentContainer.parentNode) {
            fragmentContainer.parentNode.removeChild(fragmentContainer);
        }
    }, thanoxFragmentDuration + 100);
}

// Thanox Read 功能实现
function startThanoxRead() {
    console.log("启动 Thanox Read 功能");

    // 停止之前的定时器和观察器
    if (thanoxReadTimer) {
        clearInterval(thanoxReadTimer);
        thanoxReadTimer = null;
    }

    if (thanoxReadObserver) {
        thanoxReadObserver.disconnect();
        thanoxReadObserver = null;
    }

    // 重置状态
    thanoxReadActive = true;
    thanoxReadWordIndex = 0;
    processedWords.clear();

    // 初始收集单词
    collectWords();

    // 设置观察器监听新单词的出现
    setupWordObserver();

    console.log(`开始 Thanox Read，当前有 ${thanoxReadWords.length} 个单词`);

    // 启动定时器，根据设置的速度处理单词
    thanoxReadTimer = setInterval(() => {
        processNextWord();
    }, thanoxWordSpeed); // 使用设置中的单词消失速度
}

function processNextWord() {
    // 重新收集单词以包含新出现的单词
    collectWords();

    // 寻找下一个未处理的单词
    let nextWordFound = false;
    for (let i = thanoxReadWordIndex; i < thanoxReadWords.length; i++) {
        const currentWord = thanoxReadWords[i];
        if (currentWord && currentWord.parentNode && !processedWords.has(currentWord)) {
            // 找到下一个未处理的单词
            if (thanoxFragmentEffect) {
                // 如果启用了碎片特效，创建碎片特效
                createFragmentEffect(currentWord);
            } else {
                // 否则使用普通的透明度变化
                currentWord.style.opacity = thanoxProcessingOpacity.toString(); // 使用设置中的处理中透明值
                currentWord.style.transition = 'opacity 0.3s ease';
            }

            currentWord.setAttribute('data-thanox-processed', 'true');
            processedWords.add(currentWord);
            thanoxReadWordIndex = i + 1;
            console.log(`处理第 ${i + 1} 个单词:`, currentWord.textContent);
            nextWordFound = true;
            break;
        }
    }

    if (!nextWordFound) {
        console.log("当前所有单词都已处理，等待新单词出现...");
        // 继续等待，不停止定时器，因为可能会有新单词出现
    }
}

function collectWords() {
    // 获取所有的highlight-wrapper元素（bionic已经处理过的单词）
    const wordElements = document.querySelectorAll('.highlight-wrapper');

    // 按照在文档中的顺序收集单词，并保持已处理单词的状态
    const sortedWords = Array.from(wordElements).sort((a, b) => {
        const position = a.compareDocumentPosition(b);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
            return -1; // a在b之前
        } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
            return 1; // a在b之后
        }
        return 0;
    });

    // 恢复已处理单词的透明状态
    sortedWords.forEach(word => {
        if (processedWords.has(word) || word.getAttribute('data-thanox-processed') === 'true') {
            word.style.opacity = thanoxCompletedOpacity.toString(); // 使用设置中的处理完成后透明值
            word.style.transition = 'opacity 0.3s ease';
            processedWords.add(word);
        }
    });

    thanoxReadWords = sortedWords;
    console.log(`收集到 ${thanoxReadWords.length} 个单词，其中 ${processedWords.size} 个已处理`);
}

function setupWordObserver() {
    // 创建观察器来监听新单词的出现
    thanoxReadObserver = new MutationObserver((mutations) => {
        let hasNewWords = false;

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // 检查新添加的元素是否包含highlight-wrapper
                    if (node.classList && node.classList.contains('highlight-wrapper')) {
                        hasNewWords = true;
                    } else if (node.querySelectorAll) {
                        const newWords = node.querySelectorAll('.highlight-wrapper');
                        if (newWords.length > 0) {
                            hasNewWords = true;
                        }
                    }
                }
            });
        });

        if (hasNewWords) {
            console.log("检测到新单词，重新收集...");
            // 不需要立即重新收集，processNextWord会处理
        }
    });

    // 开始观察整个文档的变化
    thanoxReadObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function stopThanoxRead() {
    console.log("停止 Thanox Read 功能");

    if (thanoxReadTimer) {
        clearInterval(thanoxReadTimer);
        thanoxReadTimer = null;
    }

    if (thanoxReadObserver) {
        thanoxReadObserver.disconnect();
        thanoxReadObserver = null;
    }

    thanoxReadActive = false;
    thanoxReadWordIndex = 0;

    // 可选：重置所有单词的透明度
    resetWordOpacity();
}

function resetWordOpacity() {
    // 重置所有已处理的单词
    processedWords.forEach(word => {
        if (word && word.parentNode) {
            word.style.opacity = '1';
            word.removeAttribute('data-thanox-processed');
        }
    });

    // 也重置当前收集的单词列表中的单词
    thanoxReadWords.forEach(word => {
        if (word && word.parentNode) {
            word.style.opacity = '1';
            word.removeAttribute('data-thanox-processed');
        }
    });

    // 清理所有碎片特效容器
    const fragmentContainers = document.querySelectorAll('.thanox-fragmenting');
    fragmentContainers.forEach(container => {
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
        }
    });

    // 清空已处理单词集合
    processedWords.clear();
    console.log("已重置所有单词的透明度并清理碎片特效");
}

// 将Thanox Read函数暴露到全局作用域，方便测试和外部调用
window.startThanoxRead = startThanoxRead;
window.stopThanoxRead = stopThanoxRead;
window.resetWordOpacity = resetWordOpacity;

// 添加清理函数
function cleanupBionicReading() {
    // 停止 Thanox Read 功能
    stopThanoxRead();

    if (currentScopeObserver) {
        // 清理所有高亮元素
        const highlights = document.querySelectorAll('.highlight-wrapper');
        highlights.forEach(highlight => {
            const originalText = highlight.getAttribute('data-original');
            const textNode = document.createTextNode(originalText);
            highlight.parentNode.replaceChild(textNode, highlight);
        });

        // 断开观察器连接
        currentScopeObserver.dispose();
        currentScopeObserver = null;
    }

    // 移除样式
    const style = document.getElementById('bionic-style');
    if (style) {
        style.remove();
    }

    // 触发自定义事件，通知其他功能bionic模式已关闭
    const bionicDeactivatedEvent = new CustomEvent('bionicDeactivated', {
        detail: { message: 'Bionic mode has been deactivated' }
    });
    document.dispatchEvent(bionicDeactivatedEvent);
}

// 修改消息监听处理函数
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggleBionic") {
        isEnabled = message.isEnabled; // 更新启用状态
        console.log("收到切换请求，新状态:", isEnabled);

        if (isEnabled) {
            console.log("Bionic Reading 热启动");
            initBionicReading();
        } else {
            console.log("Bionic Reading 清理");
            cleanupBionicReading();
        }
        // 可选：发送响应确认
        sendResponse({ success: true });
    } else if (message.action === "toggleThanoxReading") {
        thanoxReadingEnabled = message.isEnabled;
        console.log("收到 Thanox Reading 切换请求，新状态:", thanoxReadingEnabled);

        if (thanoxReadingEnabled && isEnabled) {
            // 如果 bionic 已启用且 thanox reading 被启用，启动 thanox reading
            setTimeout(() => {
                startThanoxRead();
            }, 1000);
        } else {
            // 停止 thanox reading
            stopThanoxRead();
        }
        sendResponse({ success: true });
    } else if (message.action === "updateThanoxSettings") {
        // 更新 Thanox Reading 设置
        if (message.settings.processingOpacity !== undefined) {
            thanoxProcessingOpacity = message.settings.processingOpacity;
        }
        if (message.settings.completedOpacity !== undefined) {
            thanoxCompletedOpacity = message.settings.completedOpacity;
        }
        if (message.settings.wordSpeed !== undefined) {
            thanoxWordSpeed = message.settings.wordSpeed;

            // 如果定时器正在运行，重新启动以应用新的速度
            if (thanoxReadTimer) {
                clearInterval(thanoxReadTimer);
                thanoxReadTimer = setInterval(() => {
                    processNextWord();
                }, thanoxWordSpeed);
            }
        }
        // 更新碎片特效设置
        if (message.settings.fragmentEffect !== undefined) {
            thanoxFragmentEffect = message.settings.fragmentEffect;
        }
        if (message.settings.fragmentCount !== undefined) {
            thanoxFragmentCount = message.settings.fragmentCount;
        }
        if (message.settings.fragmentDuration !== undefined) {
            thanoxFragmentDuration = message.settings.fragmentDuration;
        }
        console.log("Thanox Reading 设置已更新:", message.settings);
        sendResponse({ success: true });
    } else if (message.action === "setFont") {
        // 更新字体设置
        bionicFontFamily = message.fontFamily;
        console.log("收到字体更新请求:", bionicFontFamily);

        // 重新应用样式
        if (isEnabled) {
            // 获取当前主题状态并重新应用样式
            chrome.storage.local.get(['isDarkMode'], function(result) {
                const isDark = result.isDarkMode || false;
                setTheme(isDark);
            });
        }
        sendResponse({ success: true });
    } else if (message.action === "setFontSize") {
        // 更新字号设置
        bionicFontSize = message.fontSize;
        console.log("收到字号更新请求:", bionicFontSize);

        // 重新应用样式
        if (isEnabled) {
            // 获取当前主题状态并重新应用样式
            chrome.storage.local.get(['isDarkMode'], function(result) {
                const isDark = result.isDarkMode || false;
                setTheme(isDark);
            });
        }
        sendResponse({ success: true });
    }
    return true; // 保持消息通道开放
});




    // 添加消息监听器
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "setTheme") {
            setTheme(request.isDark);
        }
    });
})();