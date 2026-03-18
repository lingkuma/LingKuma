(function() {
    'use strict';

    // =======================
    // 词性高亮插件 - 使用 compromise/de-compromise 识别动词和介词
    // =======================

    // 配置项（从storage加载）
    let posHighlightConfig = {
        enabled: false, // 功能总开关
        language: 'english', // 高亮语言：german, english
        
        // 动词高亮设置
        verbEnabled: true, // 动词高亮开关
        verbBackgroundEnabled: true, // 动词背景高亮开关
        verbBackgroundColor: '#FF6B6B40', // 动词背景颜色
        verbUnderlineEnabled: true, // 动词下划线开关
        verbUnderlineStyle: 'wavy', // 动词下划线样式
        verbUnderlineColor: '#FF6B6B', // 动词下划线颜色
        verbUnderlineThickness: 2, // 动词下划线粗度
        verbUnderlinePosition: 'bottom', // 动词下划线位置
        
        // 介词高亮设置
        prepositionEnabled: true, // 介词高亮开关
        prepositionBackgroundEnabled: true, // 介词背景高亮开关
        prepositionBackgroundColor: '#f2935440', // 介词背景颜色
        prepositionUnderlineEnabled: true, // 介词下划线开关
        prepositionUnderlineStyle: 'solid', // 介词下划线样式
        prepositionUnderlineColor: '#f29354', // 介词下划线颜色
        prepositionUnderlineThickness: 2, // 介词下划线粗度
        prepositionUnderlinePosition: 'bottom' // 介词下划线位置
    };

    // 全局变量
    let posHighlightObserver = null; // 观察器实例
    let nlpInstance = null; // NLP 实例（德语或英语）

    // CSS Highlight 组名
    const VERB_UNDERLINE_GROUP = 'pos-verb-underline-group';
    const VERB_BACKGROUND_GROUP = 'pos-verb-background-group';
    const PREPOSITION_UNDERLINE_GROUP = 'pos-preposition-underline-group';
    const PREPOSITION_BACKGROUND_GROUP = 'pos-preposition-background-group';

    // =======================
    // 初始化：加载配置并启动
    // =======================
    function initPosHighlight() {
        chrome.storage.local.get([
            'posHighlightEnabled',
            'posHighlightLanguage',
            'posHighlightVerbEnabled',
            'posHighlightVerbBackgroundEnabled',
            'posHighlightVerbBackgroundColor',
            'posHighlightVerbUnderlineEnabled',
            'posHighlightVerbUnderlineStyle',
            'posHighlightVerbUnderlineColor',
            'posHighlightVerbUnderlineThickness',
            'posHighlightVerbUnderlinePosition',
            'posHighlightPrepositionEnabled',
            'posHighlightPrepositionBackgroundEnabled',
            'posHighlightPrepositionBackgroundColor',
            'posHighlightPrepositionUnderlineEnabled',
            'posHighlightPrepositionUnderlineStyle',
            'posHighlightPrepositionUnderlineColor',
            'posHighlightPrepositionUnderlineThickness',
            'posHighlightPrepositionUnderlinePosition'
        ], (result) => {
            posHighlightConfig.enabled = result.posHighlightEnabled || false;
            posHighlightConfig.language = result.posHighlightLanguage || 'german';
            
            // 动词设置
            posHighlightConfig.verbEnabled = result.posHighlightVerbEnabled !== false;
            posHighlightConfig.verbBackgroundEnabled = result.posHighlightVerbBackgroundEnabled !== false;
            posHighlightConfig.verbBackgroundColor = result.posHighlightVerbBackgroundColor || '#FF6B6B40';
            posHighlightConfig.verbUnderlineEnabled = result.posHighlightVerbUnderlineEnabled !== false;
            posHighlightConfig.verbUnderlineStyle = result.posHighlightVerbUnderlineStyle || 'wavy';
            posHighlightConfig.verbUnderlineColor = result.posHighlightVerbUnderlineColor || '#FF6B6B';
            posHighlightConfig.verbUnderlineThickness = result.posHighlightVerbUnderlineThickness || 2;
            posHighlightConfig.verbUnderlinePosition = result.posHighlightVerbUnderlinePosition || 'bottom';
            
            // 介词设置
            posHighlightConfig.prepositionEnabled = result.posHighlightPrepositionEnabled !== false;
            posHighlightConfig.prepositionBackgroundEnabled = result.posHighlightPrepositionBackgroundEnabled !== false;
            posHighlightConfig.prepositionBackgroundColor = result.posHighlightPrepositionBackgroundColor || '#f2935440';
            posHighlightConfig.prepositionUnderlineEnabled = result.posHighlightPrepositionUnderlineEnabled !== false;
            posHighlightConfig.prepositionUnderlineStyle = result.posHighlightPrepositionUnderlineStyle || 'solid';
            posHighlightConfig.prepositionUnderlineColor = result.posHighlightPrepositionUnderlineColor || '#f29354';
            posHighlightConfig.prepositionUnderlineThickness = result.posHighlightPrepositionUnderlineThickness || 2;
            posHighlightConfig.prepositionUnderlinePosition = result.posHighlightPrepositionUnderlinePosition || 'bottom';

            console.log('[PosHighlight] 配置已加载:', posHighlightConfig);

            // 如果启用，则启动高亮
            if (posHighlightConfig.enabled) {
                startPosHighlight();
            }
        });
    }

    // =======================
    // 启动词性高亮
    // =======================
    function startPosHighlight() {
        const language = posHighlightConfig.language;
        
        // 根据语言选择对应的 NLP 库
        if (language === 'german') {
            if (typeof window.deCompromise !== 'undefined') {
                nlpInstance = window.deCompromise;
                console.log('[PosHighlight] de-compromise 已加载');
                initializeHighlighter();
            } else {
                console.warn('[PosHighlight] de-compromise 未加载，等待加载...');
                setTimeout(() => {
                    if (typeof window.deCompromise !== 'undefined') {
                        nlpInstance = window.deCompromise;
                        initializeHighlighter();
                    } else {
                        console.error('[PosHighlight] de-compromise 加载失败');
                    }
                }, 1000);
            }
        } else if (language === 'english') {
            if (typeof window.nlp !== 'undefined') {
                nlpInstance = window.nlp;
                console.log('[PosHighlight] compromise (English) 已加载');
                initializeHighlighter();
            } else {
                console.warn('[PosHighlight] compromise 未加载，等待加载...');
                setTimeout(() => {
                    if (typeof window.nlp !== 'undefined') {
                        nlpInstance = window.nlp;
                        initializeHighlighter();
                    } else {
                        console.error('[PosHighlight] compromise 加载失败');
                    }
                }, 1000);
            }
        } else {
            console.log('[PosHighlight] 当前语言不支持:', language);
        }
    }

    // =======================
    // 初始化高亮器
    // =======================
    function initializeHighlighter() {
        injectHighlightStyles();

        posHighlightObserver = new PosHighlightObserver({
            scope: document.body,
            nlp: nlpInstance,
            language: posHighlightConfig.language
        });

        console.log('[PosHighlight] 高亮器已初始化');
    }

    // =======================
    // 注入高亮样式
    // =======================
    function injectHighlightStyles() {
        let styleEl = document.getElementById('pos-highlight-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'pos-highlight-styles';
            document.head.appendChild(styleEl);
        }

        let styleContent = '';

        // 动词背景高亮样式
        if (posHighlightConfig.verbEnabled && posHighlightConfig.verbBackgroundEnabled) {
            styleContent += `
                ::highlight(${VERB_BACKGROUND_GROUP}) {
                    background-color: ${posHighlightConfig.verbBackgroundColor};
                }
            `;
        }

        // 动词下划线高亮样式
        if (posHighlightConfig.verbEnabled && posHighlightConfig.verbUnderlineEnabled) {
            const textDecorationLine = posHighlightConfig.verbUnderlinePosition === 'top' ? 'overline' : 'underline';
            styleContent += `
                ::highlight(${VERB_UNDERLINE_GROUP}) {
                    text-decoration: ${textDecorationLine} ${posHighlightConfig.verbUnderlineStyle} ${posHighlightConfig.verbUnderlineColor};
                    text-decoration-thickness: ${posHighlightConfig.verbUnderlineThickness}px;
                    text-underline-offset: 2px;
                }
            `;
        }

        // 介词背景高亮样式
        if (posHighlightConfig.prepositionEnabled && posHighlightConfig.prepositionBackgroundEnabled) {
            styleContent += `
                ::highlight(${PREPOSITION_BACKGROUND_GROUP}) {
                    background-color: ${posHighlightConfig.prepositionBackgroundColor};
                }
            `;
        }

        // 介词下划线高亮样式
        if (posHighlightConfig.prepositionEnabled && posHighlightConfig.prepositionUnderlineEnabled) {
            const textDecorationLine = posHighlightConfig.prepositionUnderlinePosition === 'top' ? 'overline' : 'underline';
            styleContent += `
                ::highlight(${PREPOSITION_UNDERLINE_GROUP}) {
                    text-decoration: ${textDecorationLine} ${posHighlightConfig.prepositionUnderlineStyle} ${posHighlightConfig.prepositionUnderlineColor};
                    text-decoration-thickness: ${posHighlightConfig.prepositionUnderlineThickness}px;
                    text-underline-offset: 2px;
                }
            `;
        }

        styleEl.textContent = styleContent;
        console.log('[PosHighlight] 样式已注入');
    }

    // =======================
    // 停止词性高亮
    // =======================
    function stopPosHighlight() {
        // 移除所有 CSS Highlight
        [VERB_UNDERLINE_GROUP, VERB_BACKGROUND_GROUP, 
         PREPOSITION_UNDERLINE_GROUP, PREPOSITION_BACKGROUND_GROUP].forEach(group => {
            if (CSS.highlights.has(group)) {
                CSS.highlights.delete(group);
            }
        });

        if (posHighlightObserver) {
            posHighlightObserver.disconnect();
            posHighlightObserver = null;
        }

        const styleEl = document.getElementById('pos-highlight-styles');
        if (styleEl) {
            styleEl.remove();
        }

        console.log('[PosHighlight] 高亮已停止');
    }

    // =======================
    // 更新高亮样式
    // =======================
    function updateHighlightStyles() {
        injectHighlightStyles();
        if (posHighlightObserver && posHighlightConfig.enabled) {
            posHighlightObserver.reapplyHighlights();
        }
    }

    // =======================
    // 词性高亮观察器类
    // =======================
    class PosHighlightObserver {
        constructor(options) {
            this.scope = options.scope || document.body;
            this.nlp = options.nlp;
            this.language = options.language || 'german';
            this.intersectionObserver = null;
            this.mutationObserver = null;
            this.processedTextNodes = new Map();
            this.visibleRanges = new Map();

            this.ignoredSelectors = [
                'script', 'style', 'noscript', 'iframe',
                'input', 'textarea', 'select', 'button',
                '[contenteditable="true"]',
                '.pos-highlight-ignore',
                'code', 'pre', 'kbd', 'samp'
            ];

            this.init();
        }

        init() {
            this.intersectionObserver = new IntersectionObserver(
                this.handleIntersection.bind(this),
                { threshold: 0.1, rootMargin: '100px' }
            );

            this.mutationObserver = new MutationObserver(
                this.handleMutation.bind(this)
            );

            this.mutationObserver.observe(this.scope, {
                childList: true,
                subtree: true,
                characterData: true
            });

            this.scanExistingNodes();
            console.log('[PosHighlightObserver] 初始化完成');
        }

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

        acceptNode(node) {
            if (!node.textContent || !node.textContent.trim()) {
                return NodeFilter.FILTER_REJECT;
            }

            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            for (const selector of this.ignoredSelectors) {
                if (parent.closest(selector)) {
                    return NodeFilter.FILTER_REJECT;
                }
            }

            return NodeFilter.FILTER_ACCEPT;
        }

        processTextNode(textNode) {
            if (!textNode || !textNode.parentElement) return;

            const parent = textNode.parentElement;
            const text = textNode.textContent;

            if (!text.trim()) return;

            if (this.processedTextNodes.has(textNode)) return;

            for (const selector of this.ignoredSelectors) {
                if (parent.closest(selector)) return;
            }

            // 使用 NLP 提取动词和介词
            const { verbs, prepositions } = this.extractPOS(text);
            
            if (verbs.length === 0 && prepositions.length === 0) return;

            this.processedTextNodes.set(textNode, {
                verbs: verbs,
                prepositions: prepositions,
                text: text
            });

            this.intersectionObserver.observe(parent);

            if (this.isElementInViewport(parent)) {
                this.highlightPOS(textNode, verbs, prepositions);
            }
        }

        // 使用 NLP 提取词性
        extractPOS(text) {
            if (!this.nlp) return { verbs: [], prepositions: [] };

            const result = {
                verbs: [],
                prepositions: []
            };

            try {
                const doc = this.nlp(text);
                
                // 提取动词 - 使用 offset 获取精确位置
                // out('offset') 返回格式: [{ text: '...', offset: { index, start, length } }, ...]
                const verbMatches = doc.verbs().out('offset');
                verbMatches.forEach(match => {
                    if (match.offset && match.offset.start !== undefined && match.offset.length !== undefined) {
                        result.verbs.push({
                            word: match.text || text.substring(match.offset.start, match.offset.start + match.offset.length),
                            start: match.offset.start,
                            end: match.offset.start + match.offset.length
                        });
                    }
                });

                // 提取介词 - 使用 match('#Preposition') 获取
                // 注意：compromise/de-compromise 没有 prepositions() 方法
                const prepMatches = doc.match('#Preposition').out('offset');
                prepMatches.forEach(match => {
                    if (match.offset && match.offset.start !== undefined && match.offset.length !== undefined) {
                        result.prepositions.push({
                            word: match.text || text.substring(match.offset.start, match.offset.start + match.offset.length),
                            start: match.offset.start,
                            end: match.offset.start + match.offset.length
                        });
                    }
                });

                return result;
            } catch (error) {
                console.error('[PosHighlight] 提取词性失败:', error);
                return result;
            }
        }

        isElementInViewport(element) {
            const rect = element.getBoundingClientRect();
            return (
                rect.top < window.innerHeight &&
                rect.bottom > 0 &&
                rect.left < window.innerWidth &&
                rect.right > 0
            );
        }

        // 高亮词性
        highlightPOS(textNode, verbs, prepositions) {
            if (!textNode) return;

            const verbRanges = [];
            const prepRanges = [];

            // 创建动词 Range
            verbs.forEach(verb => {
                try {
                    const range = new Range();
                    range.setStart(textNode, verb.start);
                    range.setEnd(textNode, verb.end);
                    verbRanges.push(range);
                } catch (error) {
                    // 忽略无效的范围
                }
            });

            // 创建介词 Range
            prepositions.forEach(prep => {
                try {
                    const range = new Range();
                    range.setStart(textNode, prep.start);
                    range.setEnd(textNode, prep.end);
                    prepRanges.push(range);
                } catch (error) {
                    // 忽略无效的范围
                }
            });

            // 添加动词高亮
            if (posHighlightConfig.verbEnabled && verbRanges.length > 0) {
                // 背景高亮
                if (posHighlightConfig.verbBackgroundEnabled) {
                    let highlight;
                    if (!CSS.highlights.has(VERB_BACKGROUND_GROUP)) {
                        highlight = new Highlight();
                        CSS.highlights.set(VERB_BACKGROUND_GROUP, highlight);
                    } else {
                        highlight = CSS.highlights.get(VERB_BACKGROUND_GROUP);
                    }
                    verbRanges.forEach(range => highlight.add(range));
                }

                // 下划线高亮
                if (posHighlightConfig.verbUnderlineEnabled) {
                    let highlight;
                    if (!CSS.highlights.has(VERB_UNDERLINE_GROUP)) {
                        highlight = new Highlight();
                        CSS.highlights.set(VERB_UNDERLINE_GROUP, highlight);
                    } else {
                        highlight = CSS.highlights.get(VERB_UNDERLINE_GROUP);
                    }
                    verbRanges.forEach(range => highlight.add(range));
                }
            }

            // 添加介词高亮
            if (posHighlightConfig.prepositionEnabled && prepRanges.length > 0) {
                // 背景高亮
                if (posHighlightConfig.prepositionBackgroundEnabled) {
                    let highlight;
                    if (!CSS.highlights.has(PREPOSITION_BACKGROUND_GROUP)) {
                        highlight = new Highlight();
                        CSS.highlights.set(PREPOSITION_BACKGROUND_GROUP, highlight);
                    } else {
                        highlight = CSS.highlights.get(PREPOSITION_BACKGROUND_GROUP);
                    }
                    prepRanges.forEach(range => highlight.add(range));
                }

                // 下划线高亮
                if (posHighlightConfig.prepositionUnderlineEnabled) {
                    let highlight;
                    if (!CSS.highlights.has(PREPOSITION_UNDERLINE_GROUP)) {
                        highlight = new Highlight();
                        CSS.highlights.set(PREPOSITION_UNDERLINE_GROUP, highlight);
                    } else {
                        highlight = CSS.highlights.get(PREPOSITION_UNDERLINE_GROUP);
                    }
                    prepRanges.forEach(range => highlight.add(range));
                }
            }

            // 存储可见范围
            if (verbRanges.length > 0 || prepRanges.length > 0) {
                this.visibleRanges.set(textNode, {
                    verbs: verbRanges,
                    prepositions: prepRanges
                });
            }
        }

        removeHighlight(textNode) {
            const ranges = this.visibleRanges.get(textNode);
            if (ranges) {
                // 移除动词高亮
                if (ranges.verbs && ranges.verbs.length > 0) {
                    [VERB_BACKGROUND_GROUP, VERB_UNDERLINE_GROUP].forEach(group => {
                        if (CSS.highlights.has(group)) {
                            const highlight = CSS.highlights.get(group);
                            ranges.verbs.forEach(range => {
                                try { highlight.delete(range); } catch (e) {}
                            });
                        }
                    });
                }

                // 移除介词高亮
                if (ranges.prepositions && ranges.prepositions.length > 0) {
                    [PREPOSITION_BACKGROUND_GROUP, PREPOSITION_UNDERLINE_GROUP].forEach(group => {
                        if (CSS.highlights.has(group)) {
                            const highlight = CSS.highlights.get(group);
                            ranges.prepositions.forEach(range => {
                                try { highlight.delete(range); } catch (e) {}
                            });
                        }
                    });
                }

                this.visibleRanges.delete(textNode);
            }
        }

        handleIntersection(entries) {
            entries.forEach(entry => {
                const element = entry.target;
                
                this.processedTextNodes.forEach((data, textNode) => {
                    if (textNode.parentElement === element) {
                        if (entry.isIntersecting) {
                            this.highlightPOS(textNode, data.verbs, data.prepositions);
                        } else {
                            this.removeHighlight(textNode);
                        }
                    }
                });
            });
        }

        handleMutation(mutations) {
            mutations.forEach(mutation => {
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

                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        this.removeHighlight(node);
                        this.processedTextNodes.delete(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        this.processedTextNodes.forEach((data, textNode) => {
                            if (node.contains(textNode)) {
                                this.removeHighlight(textNode);
                                this.processedTextNodes.delete(textNode);
                            }
                        });
                    }
                });

                if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
                    const textNode = mutation.target;
                    this.removeHighlight(textNode);
                    this.processedTextNodes.delete(textNode);
                    this.processTextNode(textNode);
                }
            });
        }

        reapplyHighlights() {
            // 清除所有现有高亮
            [VERB_UNDERLINE_GROUP, VERB_BACKGROUND_GROUP, 
             PREPOSITION_UNDERLINE_GROUP, PREPOSITION_BACKGROUND_GROUP].forEach(group => {
                if (CSS.highlights.has(group)) {
                    CSS.highlights.delete(group);
                }
            });
            this.visibleRanges.clear();

            // 重新处理所有文本节点
            this.processedTextNodes.forEach((data, textNode) => {
                if (textNode.parentElement && this.isElementInViewport(textNode.parentElement)) {
                    this.highlightPOS(textNode, data.verbs, data.prepositions);
                }
            });
        }
    }

    // =======================
    // 消息监听器
    // =======================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'togglePosHighlight') {
            posHighlightConfig.enabled = message.enabled;
            
            if (message.enabled) {
                startPosHighlight();
            } else {
                stopPosHighlight();
            }
            
            sendResponse({ success: true });
        } else if (message.action === 'updatePosHighlightLanguage') {
            posHighlightConfig.language = message.language;
            
            if (posHighlightConfig.enabled) {
                stopPosHighlight();
                startPosHighlight();
            }
            
            sendResponse({ success: true });
        } else if (message.action === 'updatePosHighlightConfig') {
            // 更新配置
            Object.keys(message.config).forEach(key => {
                if (posHighlightConfig.hasOwnProperty(key)) {
                    posHighlightConfig[key] = message.config[key];
                }
            });
            
            updateHighlightStyles();
            sendResponse({ success: true });
        }
        
        return true;
    });

    // =======================
    // 启动
    // =======================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPosHighlight);
    } else {
        initPosHighlight();
    }

})();
