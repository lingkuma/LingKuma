(function() {
    'use strict';

    // =======================
    // 词性高亮插件 - 使用 compromise/de-compromise 识别动词和介词
    // =======================

    // =======================
    // 黑名单检查（与其他插件同步）
    // =======================
    let isInBlacklist = true; // 当前网站是否在黑名单中（默认为true，等待异步检查完成后更新）

    // 检查URL是否匹配黑名单模式
    function isUrlInBlacklist(url, blacklistPatterns) {
        if (!blacklistPatterns) return false;

        const patterns = blacklistPatterns.split(';').filter(pattern => pattern.trim() !== '');

        for (const pattern of patterns) {
            const trimmedPattern = pattern.trim();
            if (trimmedPattern === '') continue;

            // 将通配符模式转换为正则表达式
            const regexPattern = trimmedPattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');

            const regex = new RegExp(`^${regexPattern}$`);

            if (regex.test(url)) {
                return true;
            }
        }

        return false;
    }

    // 立即执行黑名单检查（在脚本加载时）
    (function() {
        chrome.storage.local.get(['pluginBlacklistWebsites'], function(result) {
            const currentUrl = window.location.href;
            const blacklistPatterns = result.pluginBlacklistWebsites || '*://music.youtube.com/*;*ohmygpt*';

            console.log('[PosHighlight] 黑名单检查 - blacklistPatterns:', blacklistPatterns);
            console.log('[PosHighlight] 黑名单检查 - currentUrl:', currentUrl);

            // 如果当前URL在黑名单中，则设置标志并不执行高亮功能
            if (isUrlInBlacklist(currentUrl, blacklistPatterns)) {
                isInBlacklist = true;
                console.log('[PosHighlight] 当前网站在黑名单中，不启用词性高亮功能');
                return;
            }

            // 不在黑名单中，设置标志并初始化
            isInBlacklist = false;
            console.log('[PosHighlight] 当前网站不在黑名单中，启用词性高亮功能');

            // 黑名单检查完成后，初始化词性高亮
            initPosHighlight();
        });
    })();

    // 配置项（从storage加载）
    let posHighlightConfig = {
        enabled: false, // 功能总开关
        language: 'english', // POS language: german, english, auto
        
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
    let nlpInstances = {
        english: null,
        german: null
    };

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

        if (language === 'auto') {
            if (areAutoModeDependenciesReady()) {
                nlpInstances = {
                    english: window.nlp,
                    german: window.deCompromise
                };
                console.log('[PosHighlight] Auto language detection enabled');
                initializeHighlighter();
            } else {
                console.warn('[PosHighlight] Auto language dependencies not loaded, waiting...');
                setTimeout(() => {
                    if (areAutoModeDependenciesReady()) {
                        nlpInstances = {
                            english: window.nlp,
                            german: window.deCompromise
                        };
                        initializeHighlighter();
                    } else {
                        console.error('[PosHighlight] Auto language dependencies failed to load');
                    }
                }, 1000);
            }
            return;
        }

        // Select the NLP library for the configured language
        if (language === 'german') {
            if (typeof window.deCompromise !== 'undefined') {
                nlpInstance = window.deCompromise;
                nlpInstances.german = window.deCompromise;
                console.log('[PosHighlight] de-compromise loaded');
                initializeHighlighter();
            } else {
                console.warn('[PosHighlight] de-compromise not loaded, waiting...');
                setTimeout(() => {
                    if (typeof window.deCompromise !== 'undefined') {
                        nlpInstance = window.deCompromise;
                        nlpInstances.german = window.deCompromise;
                        initializeHighlighter();
                    } else {
                        console.error('[PosHighlight] de-compromise failed to load');
                    }
                }, 1000);
            }
        } else if (language === 'english') {
            if (typeof window.nlp !== 'undefined') {
                nlpInstance = window.nlp;
                nlpInstances.english = window.nlp;
                console.log('[PosHighlight] compromise (English) loaded');
                initializeHighlighter();
            } else {
                console.warn('[PosHighlight] compromise not loaded, waiting...');
                setTimeout(() => {
                    if (typeof window.nlp !== 'undefined') {
                        nlpInstance = window.nlp;
                        nlpInstances.english = window.nlp;
                        initializeHighlighter();
                    } else {
                        console.error('[PosHighlight] compromise failed to load');
                    }
                }, 1000);
            }
        } else {
            console.log('[PosHighlight] Unsupported language:', language);
        }
    }

    function areAutoModeDependenciesReady() {
        return typeof window.eld !== 'undefined' &&
            typeof window.eld.detect === 'function' &&
            typeof window.nlp !== 'undefined' &&
            typeof window.deCompromise !== 'undefined';
    }

    function initializeHighlighter() {
        injectHighlightStyles();

        posHighlightObserver = new PosHighlightObserver({
            scope: document.body,
            nlp: nlpInstance,
            nlpInstances: nlpInstances,
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

    function schedulePosHighlightReapply() {
        if (!posHighlightConfig.enabled) return;

        [80, 400].forEach(delay => {
            setTimeout(() => {
                if (posHighlightObserver && posHighlightConfig.enabled) {
                    posHighlightObserver.reapplyHighlights();
                }
            }, delay);
        });
    }

    class PosHighlightObserver {
        constructor(options) {
            this.scope = options.scope || document.body;
            this.nlp = options.nlp;
            this.nlpInstances = options.nlpInstances || {};
            this.language = options.language || 'german';
            this.intersectionObserver = null;
            this.mutationObserver = null;
            this.processedTextNodes = new Map();
            this.pendingTextNodes = new Map();
            this.processingQueue = [];
            this.processingTextNodes = new WeakSet();
            this.processingScheduled = false;
            this.scanCancelled = false;
            this.languageDetectionCache = new Map();
            this.autoSegmentsPerTextNode = 0;
            this.visibleRanges = new Map();
            this.viewportRefreshScheduled = false;
            this.boundHandleViewportChange = this.handleViewportChange.bind(this);

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

            window.addEventListener('scroll', this.boundHandleViewportChange, { passive: true, capture: true });
            window.addEventListener('resize', this.boundHandleViewportChange, { passive: true });

            this.scanExistingNodes();
            this.handleViewportChange();
            console.log('[PosHighlightObserver] Initialized');
        }

        disconnect() {
            if (this.intersectionObserver) {
                this.intersectionObserver.disconnect();
            }
            if (this.mutationObserver) {
                this.mutationObserver.disconnect();
            }
            window.removeEventListener('scroll', this.boundHandleViewportChange, true);
            window.removeEventListener('resize', this.boundHandleViewportChange);
            this.scanCancelled = true;
            this.processingQueue = [];
            this.processingScheduled = false;
            this.processedTextNodes.clear();
            this.pendingTextNodes.clear();
            this.languageDetectionCache.clear();
            this.visibleRanges.clear();
        }

        scanExistingNodes() {
            const walker = document.createTreeWalker(
                this.scope,
                NodeFilter.SHOW_TEXT,
                { acceptNode: this.acceptNode.bind(this) }
            );

            const scanChunk = (deadline) => {
                if (this.scanCancelled) return;

                let count = 0;
                let textNode = null;
                const hasIdleTime = deadline && typeof deadline.timeRemaining === 'function';

                while (count < 120) {
                    if (hasIdleTime && deadline.timeRemaining() < 3 && count > 0) break;

                    textNode = walker.nextNode();
                    if (!textNode) {
                        console.log('[PosHighlightObserver] Initial scan complete');
                        return;
                    }

                    this.queueTextNode(textNode);
                    count++;
                }

                this.scheduleIdle(scanChunk);
            };

            this.scheduleIdle(scanChunk);
        }

        scheduleIdle(callback) {
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(callback, { timeout: 500 });
                return;
            }

            setTimeout(() => callback({ timeRemaining: () => 8 }), 16);
        }

        handleViewportChange() {
            if (this.scanCancelled || this.viewportRefreshScheduled) return;

            this.viewportRefreshScheduled = true;
            const refresh = () => {
                this.viewportRefreshScheduled = false;
                if (!this.scanCancelled) {
                    this.refreshVisibleTextNodes();
                }
            };

            if (typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(refresh);
                return;
            }

            setTimeout(refresh, 16);
        }

        refreshVisibleTextNodes() {
            this.pendingTextNodes.forEach((textNodes, parent) => {
                if (!parent || !parent.isConnected) {
                    this.pendingTextNodes.delete(parent);
                    return;
                }

                if (this.isElementNearViewport(parent)) {
                    textNodes.forEach(textNode => this.enqueueTextNodeProcessing(textNode));
                    this.pendingTextNodes.delete(parent);
                }
            });

            const seenTextNodes = new Set();
            this.collectViewportCandidateElements().forEach(element => {
                this.queueVisibleTextNodesInElement(element, seenTextNodes);
            });

            this.processedTextNodes.forEach((data, textNode) => {
                const parent = textNode.parentElement;
                if (!parent) return;

                if (this.isElementInViewport(parent) && !this.visibleRanges.has(textNode)) {
                    this.highlightPOS(textNode, data.verbs, data.prepositions);
                }
            });
        }

        collectViewportCandidateElements() {
            const candidates = new Set();
            const width = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
            const height = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);

            if (!width || !height || typeof document.elementFromPoint !== 'function') {
                candidates.add(this.scope);
                return candidates;
            }

            const xPoints = [0.25, 0.5, 0.75].map(ratio => Math.max(0, Math.min(width - 1, Math.floor(width * ratio))));
            const yPoints = [];
            const yStep = Math.max(120, Math.floor(height / 6));

            for (let y = 0; y < height; y += yStep) {
                yPoints.push(Math.min(height - 1, y));
            }
            yPoints.push(height - 1);

            yPoints.forEach(y => {
                xPoints.forEach(x => {
                    let element = document.elementFromPoint(x, y);
                    let depth = 0;

                    while (element && depth < 4) {
                        if (element === this.scope || this.scope.contains(element)) {
                            candidates.add(element);
                        }
                        element = element.parentElement;
                        depth++;
                    }
                });
            });

            return candidates;
        }

        queueVisibleTextNodesInElement(element, seenTextNodes) {
            if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

            for (const selector of this.ignoredSelectors) {
                if (element.closest(selector)) return;
            }

            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                { acceptNode: this.acceptNode.bind(this) }
            );

            let textNode;
            let count = 0;
            while ((textNode = walker.nextNode()) && count < 120) {
                if (seenTextNodes.has(textNode)) continue;
                seenTextNodes.add(textNode);

                const parent = textNode.parentElement;
                if (!parent || !this.isElementNearViewport(parent)) continue;

                if (this.processedTextNodes.has(textNode)) {
                    const data = this.processedTextNodes.get(textNode);
                    if (this.isElementInViewport(parent) && !this.visibleRanges.has(textNode)) {
                        this.highlightPOS(textNode, data.verbs, data.prepositions);
                    }
                } else {
                    this.queueTextNode(textNode);
                }

                count++;
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

        queueTextNode(textNode) {
            if (!textNode || !textNode.parentElement) return false;
            if (this.processedTextNodes.has(textNode) || this.processingTextNodes.has(textNode)) return false;

            const parent = textNode.parentElement;
            const text = textNode.textContent;
            if (!text || !text.trim()) return false;

            for (const selector of this.ignoredSelectors) {
                if (parent.closest(selector)) return false;
            }

            this.intersectionObserver.observe(parent);

            if (this.isElementNearViewport(parent)) {
                this.enqueueTextNodeProcessing(textNode);
                return true;
            }

            if (!this.pendingTextNodes.has(parent)) {
                this.pendingTextNodes.set(parent, new Set());
            }
            this.pendingTextNodes.get(parent).add(textNode);
            return true;
        }

        enqueueTextNodeProcessing(textNode) {
            if (!textNode || this.processedTextNodes.has(textNode) || this.processingTextNodes.has(textNode)) return;

            this.processingTextNodes.add(textNode);
            this.processingQueue.push(textNode);
            this.scheduleTextNodeProcessing();
        }

        scheduleTextNodeProcessing() {
            if (this.processingScheduled) return;

            this.processingScheduled = true;
            this.scheduleIdle(deadline => this.processQueuedTextNodes(deadline));
        }

        processQueuedTextNodes(deadline) {
            this.processingScheduled = false;
            const start = performance.now();
            let count = 0;
            const hasIdleTime = deadline && typeof deadline.timeRemaining === 'function';

            const maxNodes = this.language === 'auto' ? 1 : 6;
            const maxMs = this.language === 'auto' ? 4 : 8;

            while (this.processingQueue.length > 0 && count < maxNodes && performance.now() - start < maxMs) {
                if (hasIdleTime && deadline.timeRemaining() < 3 && count > 0) break;

                const textNode = this.processingQueue.shift();
                this.processingTextNodes.delete(textNode);
                this.processTextNode(textNode);
                count++;
            }

            if (this.processingQueue.length > 0) {
                this.scheduleTextNodeProcessing();
            }
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

            const { verbs, prepositions } = this.extractPOS(text);

            this.processedTextNodes.set(textNode, {
                verbs: verbs,
                prepositions: prepositions,
                text: text
            });

            if (verbs.length === 0 && prepositions.length === 0) return;

            this.intersectionObserver.observe(parent);

            if (this.isElementInViewport(parent)) {
                this.highlightPOS(textNode, verbs, prepositions);
            }
        }

        extractPOS(text) {
            if (this.language === 'auto') {
                return this.extractAutoPOS(text);
            }

            if (!this.nlp) return { verbs: [], prepositions: [] };
            return this.extractPOSWithNlp(text, this.nlp);
        }

        extractAutoPOS(text) {
            const result = {
                verbs: [],
                prepositions: []
            };

            this.getLanguageDetectionSegments(text, this.autoSegmentsPerTextNode).forEach(segment => {
                const nlp = this.getNlpForText(segment.text);
                if (!nlp) return;

                const segmentResult = this.extractPOSWithNlp(segment.text, nlp, segment.start);
                result.verbs.push(...segmentResult.verbs);
                result.prepositions.push(...segmentResult.prepositions);
            });

            return result;
        }

        getLanguageDetectionSegments(text, maxSegments = 0) {
            const segments = [];
            const sentencePattern = /[^.!?]+(?:[.!?]+|$)/g;
            let match;
            const hasSegmentLimit = maxSegments > 0;

            while ((match = sentencePattern.exec(text)) !== null) {
                const rawText = match[0];
                const leadingWhitespace = rawText.match(/^\s*/)[0].length;
                const trailingWhitespace = rawText.match(/\s*$/)[0].length;
                const segmentText = rawText.slice(leadingWhitespace, rawText.length - trailingWhitespace);

                if (segmentText && segmentText.length <= 240) {
                    segments.push({
                        text: segmentText,
                        start: match.index + leadingWhitespace
                    });
                    if (hasSegmentLimit && segments.length >= maxSegments) break;
                }
            }

            if (segments.length === 0 && text.trim()) {
                const leadingWhitespace = text.match(/^\s*/)[0].length;
                segments.push({
                    text: text.trim().slice(0, 240),
                    start: leadingWhitespace
                });
            }

            return segments;
        }

        extractPOSWithNlp(text, nlp, offset = 0) {
            const result = {
                verbs: [],
                prepositions: []
            };

            try {
                const doc = nlp(text);

                const verbMatches = doc.verbs().out('offset');
                verbMatches.forEach(match => {
                    if (match.offset && match.offset.start !== undefined && match.offset.length !== undefined) {
                        result.verbs.push({
                            word: match.text || text.substring(match.offset.start, match.offset.start + match.offset.length),
                            start: offset + match.offset.start,
                            end: offset + match.offset.start + match.offset.length
                        });
                    }
                });

                const prepMatches = doc.match('#Preposition').out('offset');
                prepMatches.forEach(match => {
                    if (match.offset && match.offset.start !== undefined && match.offset.length !== undefined) {
                        result.prepositions.push({
                            word: match.text || text.substring(match.offset.start, match.offset.start + match.offset.length),
                            start: offset + match.offset.start,
                            end: offset + match.offset.start + match.offset.length
                        });
                    }
                });

                return result;
            } catch (error) {
                console.error('[PosHighlight] Failed to extract POS:', error);
                return result;
            }
        }

        getNlpForText(text) {
            if (this.language !== 'auto') {
                return this.nlp;
            }

            const detectedLanguage = this.detectSupportedLanguage(text);
            if (detectedLanguage === 'en') {
                return this.nlpInstances.english || window.nlp;
            }
            if (detectedLanguage === 'de') {
                return this.nlpInstances.german || window.deCompromise;
            }

            return null;
        }

        detectSupportedLanguage(text) {
            if (!text || typeof window.eld === 'undefined' || typeof window.eld.detect !== 'function') {
                return '';
            }

            const sample = text.trim().slice(0, 160);
            if (sample.length < 12) return '';

            const cacheKey = sample.toLowerCase();
            if (this.languageDetectionCache.has(cacheKey)) {
                return this.languageDetectionCache.get(cacheKey);
            }

            try {
                const result = window.eld.detect(sample);
                const language = result && (!result.isReliable || result.isReliable()) && (result.language === 'en' || result.language === 'de')
                    ? result.language
                    : '';

                if (this.languageDetectionCache.size > 500) {
                    this.languageDetectionCache.clear();
                }
                this.languageDetectionCache.set(cacheKey, language);
                return language;
            } catch (error) {
                console.error('[PosHighlight] Auto language detection failed:', error);
                return '';
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

        isElementNearViewport(element, margin = 250) {
            const rect = element.getBoundingClientRect();
            return (
                rect.top < window.innerHeight + margin &&
                rect.bottom > -margin &&
                rect.left < window.innerWidth + margin &&
                rect.right > -margin
            );
        }

        highlightPOS(textNode, verbs, prepositions) {
            if (!textNode) return;
            if (this.visibleRanges.has(textNode)) return;

            const verbRanges = [];
            const prepRanges = [];

            verbs.forEach(verb => {
                try {
                    const range = new Range();
                    range.setStart(textNode, verb.start);
                    range.setEnd(textNode, verb.end);
                    verbRanges.push(range);
                } catch (error) {}
            });

            prepositions.forEach(prep => {
                try {
                    const range = new Range();
                    range.setStart(textNode, prep.start);
                    range.setEnd(textNode, prep.end);
                    prepRanges.push(range);
                } catch (error) {}
            });

            if (posHighlightConfig.verbEnabled && verbRanges.length > 0) {
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

            if (posHighlightConfig.prepositionEnabled && prepRanges.length > 0) {
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

            if (verbRanges.length > 0 || prepRanges.length > 0) {
                this.visibleRanges.set(textNode, {
                    verbs: verbRanges,
                    prepositions: prepRanges
                });
            }
        }

        removePendingTextNode(textNode) {
            this.pendingTextNodes.forEach((textNodes, parent) => {
                if (textNodes.has(textNode)) {
                    textNodes.delete(textNode);
                    if (textNodes.size === 0) {
                        this.pendingTextNodes.delete(parent);
                    }
                }
            });
        }

        removePendingNodesInside(element) {
            this.pendingTextNodes.forEach((textNodes, parent) => {
                if (parent === element || element.contains(parent)) {
                    this.pendingTextNodes.delete(parent);
                    return;
                }

                textNodes.forEach(textNode => {
                    if (element.contains(textNode)) {
                        textNodes.delete(textNode);
                    }
                });

                if (textNodes.size === 0) {
                    this.pendingTextNodes.delete(parent);
                }
            });
        }

        removeHighlight(textNode) {
            const ranges = this.visibleRanges.get(textNode);
            if (ranges) {
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

                if (entry.isIntersecting) {
                    const pendingNodes = this.pendingTextNodes.get(element);
                    if (pendingNodes) {
                        pendingNodes.forEach(textNode => this.enqueueTextNodeProcessing(textNode));
                        this.pendingTextNodes.delete(element);
                    }
                }

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
                        this.queueTextNode(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const walker = document.createTreeWalker(
                            node,
                            NodeFilter.SHOW_TEXT,
                            { acceptNode: this.acceptNode.bind(this) }
                        );
                        let textNode;
                        while ((textNode = walker.nextNode())) {
                            this.queueTextNode(textNode);
                        }
                    }
                });

                mutation.removedNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        this.removeHighlight(node);
                        this.removePendingTextNode(node);
                        this.processedTextNodes.delete(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        this.removePendingNodesInside(node);
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
                    this.removePendingTextNode(textNode);
                    this.queueTextNode(textNode);
                }
            });
        }

        reapplyHighlights(options = {}) {
            [VERB_UNDERLINE_GROUP, VERB_BACKGROUND_GROUP,
             PREPOSITION_UNDERLINE_GROUP, PREPOSITION_BACKGROUND_GROUP].forEach(group => {
                if (CSS.highlights.has(group)) {
                    CSS.highlights.delete(group);
                }
            });
            this.visibleRanges.clear();

            this.processedTextNodes.forEach((data, textNode) => {
                if (!textNode.parentElement) return;

                let nextData = data;
                if (options.refreshPOS) {
                    const refreshed = this.extractPOS(textNode.textContent || '');
                    nextData = {
                        verbs: refreshed.verbs,
                        prepositions: refreshed.prepositions,
                        text: textNode.textContent || ''
                    };
                    this.processedTextNodes.set(textNode, nextData);
                }

                if (this.isElementInViewport(textNode.parentElement)) {
                    this.highlightPOS(textNode, nextData.verbs, nextData.prepositions);
                }
            });
        }
    }

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
        } else if (message.action === 'toggleHighlight') {
            schedulePosHighlightReapply();
        }
        
        return false;
    });

})();
