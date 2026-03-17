(function() {
    'use strict';

    // =======================
    // 动词高亮插件 - 使用 compromise/de-compromise 识别动词
    // =======================

    // 配置项（从storage加载）
    let verbHighlightConfig = {
        enabled: false, // 功能总开关
        language: 'german', // 高亮语言：german, english
        backgroundEnabled: true, // 背景高亮开关
        backgroundColor: '#FF6B6B40', // 背景颜色
        underlineEnabled: true, // 下划线开关
        underlineStyle: 'wavy', // 下划线样式：solid/wavy/dotted/dashed
        underlineColor: '#FF6B6B', // 下划线颜色
        underlineThickness: 2, // 下划线粗度
        underlinePosition: 'bottom' // 下划线位置：bottom/top
    };

    // 全局变量
    let verbHighlightObserver = null; // ScopeObserver 实例
    let nlpInstance = null; // NLP 实例（德语或英语）

    // CSS Highlight 组名
    const VERB_HIGHLIGHT_UNDERLINE_GROUP = 'verb-highlight-underline-group';
    const VERB_HIGHLIGHT_BACKGROUND_GROUP = 'verb-highlight-background-group';

    // =======================
    // 初始化：加载配置并启动
    // =======================
    function initVerbHighlight() {
        chrome.storage.local.get([
            'verbHighlightEnabled',
            'verbHighlightLanguage',
            'verbHighlightBackgroundEnabled',
            'verbHighlightBackgroundColor',
            'verbHighlightUnderlineEnabled',
            'verbHighlightUnderlineStyle',
            'verbHighlightUnderlineColor',
            'verbHighlightUnderlineThickness',
            'verbHighlightUnderlinePosition'
        ], (result) => {
            verbHighlightConfig.enabled = result.verbHighlightEnabled || false;
            verbHighlightConfig.language = result.verbHighlightLanguage || 'german';
            verbHighlightConfig.backgroundEnabled = result.verbHighlightBackgroundEnabled !== false;
            verbHighlightConfig.backgroundColor = result.verbHighlightBackgroundColor || '#FF6B6B40';
            verbHighlightConfig.underlineEnabled = result.verbHighlightUnderlineEnabled !== false;
            verbHighlightConfig.underlineStyle = result.verbHighlightUnderlineStyle || 'wavy';
            verbHighlightConfig.underlineColor = result.verbHighlightUnderlineColor || '#FF6B6B';
            verbHighlightConfig.underlineThickness = result.verbHighlightUnderlineThickness || 2;
            verbHighlightConfig.underlinePosition = result.verbHighlightUnderlinePosition || 'bottom';

            console.log('[VerbHighlight] 配置已加载:', verbHighlightConfig);

            // 如果启用，则启动高亮
            if (verbHighlightConfig.enabled) {
                startVerbHighlight();
            }
        });
    }

    // =======================
    // 启动动词高亮
    // =======================
    function startVerbHighlight() {
        const language = verbHighlightConfig.language;
        
        // 根据语言选择对应的 NLP 库
        if (language === 'german') {
            // 检查 de-compromise 是否已加载（全局变量名为 deCompromise）
            if (typeof window.deCompromise !== 'undefined') {
                nlpInstance = window.deCompromise;
                console.log('[VerbHighlight] de-compromise 已加载');
                initializeHighlighter();
            } else {
                console.warn('[VerbHighlight] de-compromise 未加载，等待加载...');
                // 延迟重试
                setTimeout(() => {
                    if (typeof window.deCompromise !== 'undefined') {
                        nlpInstance = window.deCompromise;
                        initializeHighlighter();
                    } else {
                        console.error('[VerbHighlight] de-compromise 加载失败');
                    }
                }, 1000);
            }
        } else if (language === 'english') {
            // 检查 compromise 是否已加载（全局变量名为 nlp）
            if (typeof window.nlp !== 'undefined') {
                nlpInstance = window.nlp;
                console.log('[VerbHighlight] compromise (English) 已加载');
                initializeHighlighter();
            } else {
                console.warn('[VerbHighlight] compromise 未加载，等待加载...');
                // 延迟重试
                setTimeout(() => {
                    if (typeof window.nlp !== 'undefined') {
                        nlpInstance = window.nlp;
                        initializeHighlighter();
                    } else {
                        console.error('[VerbHighlight] compromise 加载失败');
                    }
                }, 1000);
            }
        } else {
            console.log('[VerbHighlight] 当前语言不支持:', language);
        }
    }

    // =======================
    // 初始化高亮器
    // =======================
    function initializeHighlighter() {
        // 注入自定义样式
        injectHighlightStyles();

        // 创建 ScopeObserver
        verbHighlightObserver = new VerbHighlightObserver({
            scope: document.body,
            nlp: nlpInstance,
            language: verbHighlightConfig.language
        });

        console.log('[VerbHighlight] 高亮器已初始化');
    }

    // =======================
    // 注入高亮样式
    // =======================
    function injectHighlightStyles() {
        let styleEl = document.getElementById('verb-highlight-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'verb-highlight-styles';
            document.head.appendChild(styleEl);
        }

        const { 
            backgroundEnabled, 
            backgroundColor,
            underlineEnabled,
            underlineStyle, 
            underlineColor, 
            underlineThickness, 
            underlinePosition 
        } = verbHighlightConfig;

        // 构建样式内容
        let styleContent = '';

        // 背景高亮样式
        if (backgroundEnabled) {
            styleContent += `
                ::highlight(${VERB_HIGHLIGHT_BACKGROUND_GROUP}) {
                    background-color: ${backgroundColor};
                }
            `;
        }

        // 下划线高亮样式
        if (underlineEnabled) {
            // 构建下划线样式
            let textDecorationLine = '';
            switch (underlinePosition) {
                case 'top':
                    textDecorationLine = 'overline';
                    break;
                case 'bottom':
                default:
                    textDecorationLine = 'underline';
            }

            styleContent += `
                ::highlight(${VERB_HIGHLIGHT_UNDERLINE_GROUP}) {
                    text-decoration: ${textDecorationLine} ${underlineStyle} ${underlineColor};
                    text-decoration-thickness: ${underlineThickness}px;
                    text-underline-offset: 2px;
                }
            `;
        }

        styleEl.textContent = styleContent;

        console.log('[VerbHighlight] 样式已注入');
    }

    // =======================
    // 停止动词高亮
    // =======================
    function stopVerbHighlight() {
        // 移除 CSS Highlight
        if (CSS.highlights.has(VERB_HIGHLIGHT_UNDERLINE_GROUP)) {
            CSS.highlights.delete(VERB_HIGHLIGHT_UNDERLINE_GROUP);
        }
        if (CSS.highlights.has(VERB_HIGHLIGHT_BACKGROUND_GROUP)) {
            CSS.highlights.delete(VERB_HIGHLIGHT_BACKGROUND_GROUP);
        }

        // 断开观察器
        if (verbHighlightObserver) {
            verbHighlightObserver.disconnect();
            verbHighlightObserver = null;
        }

        // 移除样式
        const styleEl = document.getElementById('verb-highlight-styles');
        if (styleEl) {
            styleEl.remove();
        }

        console.log('[VerbHighlight] 高亮已停止');
    }

    // =======================
    // 更新高亮样式
    // =======================
    function updateHighlightStyles() {
        injectHighlightStyles();
        // 重新应用高亮
        if (verbHighlightObserver && verbHighlightConfig.enabled) {
            verbHighlightObserver.reapplyHighlights();
        }
    }

    // =======================
    // 动词高亮观察器类
    // =======================
    class VerbHighlightObserver {
        constructor(options) {
            this.scope = options.scope || document.body;
            this.nlp = options.nlp;
            this.language = options.language || 'german';
            this.intersectionObserver = null;
            this.mutationObserver = null;
            this.processedTextNodes = new Map(); // 已处理的文本节点
            this.visibleRanges = new Map(); // 可见的高亮范围

            // 忽略的元素选择器
            this.ignoredSelectors = [
                'script', 'style', 'noscript', 'iframe',
                'input', 'textarea', 'select', 'button',
                '[contenteditable="true"]',
                '.verb-highlight-ignore',
                'code', 'pre', 'kbd', 'samp'
            ];

            this.init();
        }

        // 初始化
        init() {
            // 创建 IntersectionObserver
            this.intersectionObserver = new IntersectionObserver(
                this.handleIntersection.bind(this),
                { threshold: 0.1, rootMargin: '100px' }
            );

            // 创建 MutationObserver
            this.mutationObserver = new MutationObserver(
                this.handleMutation.bind(this)
            );

            // 开始观察
            this.mutationObserver.observe(this.scope, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // 扫描现有文本节点
            this.scanExistingNodes();

            console.log('[VerbHighlightObserver] 初始化完成');
        }

        // 断开观察器
        disconnect() {
            if (this.intersectionObserver) {
                this.intersectionObserver.disconnect();
            }
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
            }
            this.processedTextNodes.clear();
            this.visibleRanges.clear();
        }

        // 扫描现有节点
        scanExistingNodes() {
            const walker = document.createTreeWalker(
                this.scope,
                NodeFilter.SHOW_TEXT,
                { acceptNode: this.acceptNode.bind(this) }
            );

            let textNode;
            while (textNode = walker.nextNode()) {
                this.processTextNode(textNode);
            }
        }

        // 节点过滤器
        acceptNode(node) {
            if (!node.textContent || !node.textContent.trim()) {
                return NodeFilter.FILTER_REJECT;
            }

            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            // 检查是否在忽略的元素中
            for (const selector of this.ignoredSelectors) {
                if (parent.closest(selector)) {
                    return NodeFilter.FILTER_REJECT;
                }
            }

            return NodeFilter.FILTER_ACCEPT;
        }

        // 处理文本节点
        processTextNode(textNode) {
            if (!textNode || !textNode.parentElement) return;

            const parent = textNode.parentElement;
            const text = textNode.textContent;

            // 跳过空文本
            if (!text.trim()) return;

            // 检查是否已处理
            if (this.processedTextNodes.has(textNode)) return;

            // 检查是否在忽略的元素中
            for (const selector of this.ignoredSelectors) {
                if (parent.closest(selector)) return;
            }

            // 使用 NLP 提取动词
            const verbs = this.extractVerbs(text);
            if (verbs.length === 0) return;

            // 存储处理结果
            this.processedTextNodes.set(textNode, {
                verbs: verbs,
                text: text
            });

            // 观察父元素
            this.intersectionObserver.observe(parent);

            // 如果元素在视口内，立即高亮
            if (this.isElementInViewport(parent)) {
                this.highlightVerbs(textNode, verbs);
            }
        }

        // 使用 NLP 提取动词
        extractVerbs(text) {
            if (!this.nlp) return [];

            try {
                const doc = this.nlp(text);
                const verbs = doc.verbs().out('array');
                
                // 返回动词及其位置信息
                const result = [];
                verbs.forEach(verb => {
                    // 找到动词在文本中的所有位置
                    let startIndex = 0;
                    while (true) {
                        const index = text.indexOf(verb, startIndex);
                        if (index === -1) break;
                        
                        result.push({
                            word: verb,
                            start: index,
                            end: index + verb.length
                        });
                        startIndex = index + 1;
                    }
                });

                return result;
            } catch (error) {
                console.error('[VerbHighlight] 提取动词失败:', error);
                return [];
            }
        }

        // 检查元素是否在视口内
        isElementInViewport(element) {
            const rect = element.getBoundingClientRect();
            return (
                rect.top < window.innerHeight &&
                rect.bottom > 0 &&
                rect.left < window.innerWidth &&
                rect.right > 0
            );
        }

        // 高亮动词
        highlightVerbs(textNode, verbs) {
            if (!textNode || verbs.length === 0) return;

            const { backgroundEnabled, underlineEnabled } = verbHighlightConfig;

            // 为每个动词创建 Range
            const ranges = [];
            verbs.forEach(verb => {
                try {
                    const range = new Range();
                    range.setStart(textNode, verb.start);
                    range.setEnd(textNode, verb.end);
                    ranges.push(range);
                } catch (error) {
                    // 忽略无效的范围
                }
            });

            // 添加背景高亮
            if (backgroundEnabled && ranges.length > 0) {
                let bgHighlight;
                if (!CSS.highlights.has(VERB_HIGHLIGHT_BACKGROUND_GROUP)) {
                    bgHighlight = new Highlight();
                    CSS.highlights.set(VERB_HIGHLIGHT_BACKGROUND_GROUP, bgHighlight);
                } else {
                    bgHighlight = CSS.highlights.get(VERB_HIGHLIGHT_BACKGROUND_GROUP);
                }
                ranges.forEach(range => bgHighlight.add(range));
            }

            // 添加下划线高亮
            if (underlineEnabled && ranges.length > 0) {
                let ulHighlight;
                if (!CSS.highlights.has(VERB_HIGHLIGHT_UNDERLINE_GROUP)) {
                    ulHighlight = new Highlight();
                    CSS.highlights.set(VERB_HIGHLIGHT_UNDERLINE_GROUP, ulHighlight);
                } else {
                    ulHighlight = CSS.highlights.get(VERB_HIGHLIGHT_UNDERLINE_GROUP);
                }
                ranges.forEach(range => ulHighlight.add(range));
            }

            // 存储可见范围
            if (ranges.length > 0) {
                this.visibleRanges.set(textNode, ranges);
            }
        }

        // 移除高亮
        removeHighlight(textNode) {
            const ranges = this.visibleRanges.get(textNode);
            if (ranges) {
                // 移除背景高亮
                if (CSS.highlights.has(VERB_HIGHLIGHT_BACKGROUND_GROUP)) {
                    const bgHighlight = CSS.highlights.get(VERB_HIGHLIGHT_BACKGROUND_GROUP);
                    ranges.forEach(range => {
                        try {
                            bgHighlight.delete(range);
                        } catch (error) {
                            // 忽略错误
                        }
                    });
                }

                // 移除下划线高亮
                if (CSS.highlights.has(VERB_HIGHLIGHT_UNDERLINE_GROUP)) {
                    const ulHighlight = CSS.highlights.get(VERB_HIGHLIGHT_UNDERLINE_GROUP);
                    ranges.forEach(range => {
                        try {
                            ulHighlight.delete(range);
                        } catch (error) {
                            // 忽略错误
                        }
                    });
                }
                this.visibleRanges.delete(textNode);
            }
        }

        // 处理 IntersectionObserver 回调
        handleIntersection(entries) {
            entries.forEach(entry => {
                const element = entry.target;
                
                // 找到该元素下的所有文本节点
                this.processedTextNodes.forEach((data, textNode) => {
                    if (textNode.parentElement === element) {
                        if (entry.isIntersecting) {
                            // 进入视口，添加高亮
                            this.highlightVerbs(textNode, data.verbs);
                        } else {
                            // 离开视口，移除高亮
                            this.removeHighlight(textNode);
                        }
                    }
                });
            });
        }

        // 处理 MutationObserver 回调
        handleMutation(mutations) {
            mutations.forEach(mutation => {
                // 处理新增节点
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        this.processTextNode(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const walker = document.createTreeWalker(
                            node,
                            NodeFilter.SHOW_TEXT,
                            { acceptNode: this.acceptNode.bind(this) }
                        );
                        let textNode;
                        while (textNode = walker.nextNode()) {
                            this.processTextNode(textNode);
                        }
                    }
                });

                // 处理删除节点
                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        this.removeHighlight(node);
                        this.processedTextNodes.delete(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        // 清理该元素下的所有文本节点
                        this.processedTextNodes.forEach((data, textNode) => {
                            if (node.contains(textNode)) {
                                this.removeHighlight(textNode);
                                this.processedTextNodes.delete(textNode);
                            }
                        });
                    }
                });

                // 处理文本变化
                if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
                    const textNode = mutation.target;
                    this.removeHighlight(textNode);
                    this.processedTextNodes.delete(textNode);
                    this.processTextNode(textNode);
                }
            });
        }

        // 重新应用所有高亮
        reapplyHighlights() {
            // 清除所有现有高亮
            if (CSS.highlights.has(VERB_HIGHLIGHT_UNDERLINE_GROUP)) {
                CSS.highlights.delete(VERB_HIGHLIGHT_UNDERLINE_GROUP);
            }
            if (CSS.highlights.has(VERB_HIGHLIGHT_BACKGROUND_GROUP)) {
                CSS.highlights.delete(VERB_HIGHLIGHT_BACKGROUND_GROUP);
            }
            this.visibleRanges.clear();

            // 重新处理所有文本节点
            this.processedTextNodes.forEach((data, textNode) => {
                if (textNode.parentElement && this.isElementInViewport(textNode.parentElement)) {
                    this.highlightVerbs(textNode, data.verbs);
                }
            });
        }
    }

    // =======================
    // 消息监听器
    // =======================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'toggleVerbHighlight') {
            const enabled = message.enabled;
            verbHighlightConfig.enabled = enabled;
            
            if (enabled) {
                startVerbHighlight();
            } else {
                stopVerbHighlight();
            }
            
            sendResponse({ success: true });
        } else if (message.action === 'updateVerbHighlightLanguage') {
            verbHighlightConfig.language = message.language;
            
            // 重新启动高亮
            if (verbHighlightConfig.enabled) {
                stopVerbHighlight();
                startVerbHighlight();
            }
            
            sendResponse({ success: true });
        } else if (message.action === 'updateVerbHighlightStyle') {
            // 更新样式配置
            if (message.backgroundEnabled !== undefined) {
                verbHighlightConfig.backgroundEnabled = message.backgroundEnabled;
            }
            if (message.backgroundColor) {
                verbHighlightConfig.backgroundColor = message.backgroundColor;
            }
            if (message.underlineEnabled !== undefined) {
                verbHighlightConfig.underlineEnabled = message.underlineEnabled;
            }
            if (message.style) {
                verbHighlightConfig.underlineStyle = message.style;
            }
            if (message.color) {
                verbHighlightConfig.underlineColor = message.color;
            }
            if (message.thickness !== undefined) {
                verbHighlightConfig.underlineThickness = message.thickness;
            }
            if (message.position) {
                verbHighlightConfig.underlinePosition = message.position;
            }
            
            updateHighlightStyles();
            sendResponse({ success: true });
        }
        
        return true;
    });

    // =======================
    // 启动
    // =======================
    // 等待 DOM 加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initVerbHighlight);
    } else {
        initVerbHighlight();
    }

})();
