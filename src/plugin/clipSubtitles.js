// chrome 扩展版本 - 悬浮字幕组件

// 添加消息监听器
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "toggleClipSubtitles") {
        if (request.isEnabled) {
            // 如果启用,初始化字幕组件
            initClipSubtitles();
        } else {
            // 如果禁用,移除字幕组件
            const container = document.getElementById('untertitle-drag-container');
            if (container) {
                container.remove();
            }
        }
    }
});

// 将原有的初始化代码封装成函数
function initClipSubtitles() {
    // 先获取开关状态和上次保存的位置
    chrome.storage.local.get({
        clipSubtitles: false,
        untertitle_position: { x: '50%', y: '20px' }
    }, function(result) {
        // 如果开关关闭，则不执行后续逻辑
        if (!result.clipSubtitles) return;

        const savedPosition = result.untertitle_position;

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
                font-family: "Fanwood", "LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
                font-size: 30px !important;
            }
        `);

        // 创建外层拖动容器
        const dragContainer = document.createElement('div');
        dragContainer.id = 'untertitle-drag-container';

        Object.assign(dragContainer.style, {
            position: 'fixed',
            left: savedPosition.x,
            top: savedPosition.y,
            cursor: 'move',
            zIndex: '999999',
            pointerEvents: 'none',
            width: '100vw',       // 固定视口宽度
            minWidth: '100vw',    // 防止宽度收缩
            display: 'flex',
            justifyContent: 'center', // 内容水平居中
            // 如果初始位置为居中，则使用 translate 实现居中
            transform: (savedPosition.x === '50%' ? 'translateX(-50%)' : 'none'),
            left: (savedPosition.x === '50%' ? '50%' : savedPosition.x)
        });

        // 创建内部显示容器
        const container = document.createElement('div');
        container.id = 'untertitle-display';
        Object.assign(container.style, {
            position: 'relative', // 相对定位
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            fontSize: '24px',
            maxWidth: '1000px',
            transition: 'opacity 0.3s',
            pointerEvents: 'auto', // 恢复点击事件
            display: 'inline-block',
            width: 'auto',         // 内容自适应
            minWidth: '300px',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            fontFamily: '"Fanwood", "LXGWWenKai", "PingFang SC", "Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol"'
        });

        // 创建内容包裹层
        const contentWrapper = document.createElement('div');
        contentWrapper.style.cssText = `
            display: flex;
            justify-content: center;
            width: max-content;
            max-width: 80vw;
            margin: 0 auto;
        `;

        // 创建文本显示区域
        const textElement = document.createElement('div');
        textElement.id = 'untertitle-text';
        textElement.style.cssText = `
            word-break: break-word;
            white-space: pre-wrap;
            display: inline-block;
            font-size: 30px;
        `;

        contentWrapper.appendChild(textElement);
        container.appendChild(contentWrapper);
        dragContainer.appendChild(container);
        document.body.appendChild(dragContainer);

        // 拖动事件处理
        let isDragging = false;
        let initialX = 0;
        let initialY = 0;

        dragContainer.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            const rect = dragContainer.getBoundingClientRect();
            initialX = e.clientX - rect.left;
            initialY = e.clientY - rect.top;
            isDragging = true;
            dragContainer.style.pointerEvents = 'auto';
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                const newX = e.clientX - initialX;
                const newY = e.clientY - initialY;
                dragContainer.style.left = `${newX}px`;
                dragContainer.style.top = `${newY}px`;
                dragContainer.style.transform = 'none';
            }
        }

        function dragEnd() {
            isDragging = false;
            chrome.storage.local.set({
                untertitle_position: {
                    x: dragContainer.style.left,
                    y: dragContainer.style.top
                }
            });
            dragContainer.style.pointerEvents = 'none';
        }

        // 仿生阅读处理函数
        function processBionicText(node) {
            const text = node.textContent;
            let result = '';
            let currentWord = '';

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const isCJK = /[\u4E00-\u9FFF\u3040-\u30FF\u3130-\u318F\uAC00-\uD7AF\u1100-\u11FF]/.test(char);
                const isPunctuation = /[\u3000-\u303F\uFF00-\uFFEF]/.test(char);
                const isWhitespace = /\s/.test(char);

                if (isCJK || isPunctuation) {
                    if (currentWord) {
                        const boldLength = Math.ceil(currentWord.length * 0.4);
                        const highlight = currentWord.slice(0, boldLength);
                        result += `<span class="highlight-wrapper" data-highlight="${highlight}">${currentWord}</span>`;
                        currentWord = '';
                    }
                    result += char;
                } else if (isWhitespace) {
                    if (currentWord) {
                        const boldLength = Math.ceil(currentWord.length * 0.4);
                        const highlight = currentWord.slice(0, boldLength);
                        result += `<span class="highlight-wrapper" data-highlight="${highlight}">${currentWord}</span>`;
                        currentWord = '';
                    }
                    result += char;
                } else {
                    currentWord += char;
                }
            }

            if (currentWord) {
                const boldLength = Math.ceil(currentWord.length * 0.4);
                const highlight = currentWord.slice(0, boldLength);
                result += `<span class="highlight-wrapper" data-highlight="${highlight}">${currentWord}</span>`;
            }

            return result;
        }

        // 获取 URL 内容方法
        async function getUrlContent() {
            try {
                const response = await fetch('http://localhost:2333');
                return response.ok ? await response.text() : '';
            } catch (error) {
                return '';
            }
        }

        let lastClipboardText = '';
        let lastUrlText = '';

        // 修改为从 storage 获取剪贴板内容
        setInterval(async () => {
            // 从 storage 读取剪贴板内容
            chrome.storage.local.get(['clipboardContent'], async function(result) {
                const clipText = result.clipboardContent || '';

                // 本地服务获取内容（保留原功能）
                // const urlText = await getUrlContent();

                let newText = '';
                if (clipText && clipText !== lastClipboardText) {
                    newText = clipText;
                    lastClipboardText = clipText;
                    // lastUrlText = urlText;
                }
                // else if (urlText && urlText !== lastUrlText) {
                //     newText = urlText;
                //     lastUrlText = urlText;
                //     lastClipboardText = urlText;
                // }

                if (newText) {
                    // const text = newText.slice(0, 300);

                    const text = newText;
                    const tempDiv = document.createElement('div');
                    tempDiv.textContent = text;
                    textElement.replaceChildren(tempDiv);
                    textElement.innerHTML = processBionicText(tempDiv);
                }
            });
        }, 500);
    });
}

// 初始检查开关状态
chrome.storage.local.get({
    clipSubtitles: false
}, function(result) {
    if (result.clipSubtitles) {
        initClipSubtitles();
    }
});
