// 全局变量
let selectedEpubFile = null;

// 获取页面元素
const epubFileInput = document.getElementById('epubFileInput');
const cleanButton = document.getElementById('cleanEpubButton');
const originalButtonText = cleanButton.textContent;

// 文件选择事件监听器
epubFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file && file.name.toLowerCase().endsWith('.epub')) {
        selectedEpubFile = file;
        cleanButton.disabled = false;
    } else {
        selectedEpubFile = null;
        cleanButton.disabled = true;
        if (file) {
            alert('请选择有效的 EPUB 文件！ | Please select a valid EPUB file! | 有効なEPUBファイルを選択してください！');
        }
    }
});

// 清理按钮事件监听器
cleanButton.addEventListener('click', handleEpubClean);

async function handleEpubClean() {
    if (!selectedEpubFile) {
        alert('请先选择一个 EPUB 文件！ | Please select an EPUB file first! | まずEPUBファイルを選択してください！');
        return;
    }

    // 获取选中的清理模式
    const selectedMode = document.querySelector('input[name="cleanMode"]:checked');
    if (!selectedMode) {
        alert('请选择一个清理模式！ | Please select a clean mode! | クリーンモードを選択してください！');
        return;
    }

    const cleanMode = parseInt(selectedMode.value);

    // 更新按钮状态
    cleanButton.textContent = '正在清理中... | Cleaning... | クリーニング中...';
    cleanButton.disabled = true;

    try {
        const zip = new JSZip();
        const epubContent = await zip.loadAsync(selectedEpubFile);
        const newZip = new JSZip();
        let changesMade = false;

        console.log("开始清理注音...");

        // 遍历 EPUB 中的所有文件
        for (const path in epubContent.files) {
            const entry = epubContent.files[path];

            // 只处理 HTML 或 XHTML 文件
            if (path.match(/\.(x?html|xhtml)$/i) && !entry.dir) {
                console.log(`检查文件: ${path}`);
                const content = await entry.async('string');
                const { modifiedContent, fileChanged } = cleanRubyContent(content, cleanMode);

                if (fileChanged) {
                    console.log(`文件 ${path} 已修改，正在写入 newZip...`);
                    newZip.file(path, modifiedContent);
                    changesMade = true;
                } else {
                    // 如果文件未修改，直接将原始内容添加到 newZip
                    newZip.file(path, content);
                }
            } else if (!entry.dir) {
                // 其他文件直接复制
                const binaryContent = await entry.async('uint8array');
                newZip.file(path, binaryContent);
            }
        }

        if (!changesMade) {
            alert('未发现需要清理的注音内容。| No ruby content found needing cleaning. | クリーニングが必要なルビコンテンツは見つかりませんでした。');
            resetButtonState();
            return;
        }

        console.log("清理完成，正在生成新的 EPUB 文件...");
        // 生成新的 EPUB 文件
        const newEpubContent = await newZip.generateAsync({ type: 'blob' });

        // 恢复按钮状态（在下载前）
        resetButtonState();

        // 生成文件名
        const cleanedFileName = selectedEpubFile.name.replace('.epub', '_cleaned.epub');
        saveAs(newEpubContent, cleanedFileName);

        console.log("新 EPUB 文件已生成并开始下载。");

        // 处理完成后清空文件选择
        selectedEpubFile = null;
        epubFileInput.value = '';
        cleanButton.disabled = true;

    } catch (error) {
        console.error('清理 EPUB 文件时出错:', error);
        alert('清理 EPUB 文件时出错: ' + error.message);
        resetButtonState();
    }
}

function resetButtonState() {
    cleanButton.textContent = originalButtonText;
    cleanButton.disabled = selectedEpubFile === null;
}

function cleanRubyContent(htmlContent, cleanMode) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'application/xhtml+xml');
    let fileChanged = false;

    if (cleanMode === 1) {
        // 模式1: 标准日文注音清理
        const rubyElements = doc.querySelectorAll('ruby');
        
        if (rubyElements.length > 0) {
            console.log(`发现 ${rubyElements.length} 个 ruby 元素`);
            fileChanged = true;

            rubyElements.forEach(ruby => {
                // 收集所有 rb 元素中的文本
                const rbElements = ruby.querySelectorAll('rb');
                let cleanText = '';
                
                if (rbElements.length > 0) {
                    // 如果有 rb 元素，提取其中的文本
                    rbElements.forEach(rb => {
                        cleanText += rb.textContent || '';
                    });
                } else {
                    // 如果没有 rb 元素，可能注音格式不标准，尝试提取除 rt 之外的文本
                    const rtElements = ruby.querySelectorAll('rt');
                    rtElements.forEach(rt => rt.remove()); // 先移除所有 rt 元素
                    cleanText = ruby.textContent || '';
                }

                // 创建文本节点替换 ruby 元素
                if (cleanText) {
                    const textNode = doc.createTextNode(cleanText);
                    ruby.parentNode.replaceChild(textNode, ruby);
                }
            });
        }
    }
    // 可以在这里添加其他清理模式的处理逻辑

    if (fileChanged) {
        // 序列化修改后的文档
        const serializer = new XMLSerializer();
        const newHtmlContent = serializer.serializeToString(doc);
        return { modifiedContent: newHtmlContent, fileChanged: true };
    } else {
        // 没有修改，返回原始内容
        return { modifiedContent: htmlContent, fileChanged: false };
    }
}

// 工具函数：检查文件是否包含注音内容
function hasRubyContent(htmlContent) {
    return htmlContent.includes('<ruby>') || htmlContent.includes('<rt>') || htmlContent.includes('<rb>');
}

// 工具函数：统计清理结果
function getCleaningStats(originalContent, cleanedContent) {
    const originalRubyCount = (originalContent.match(/<ruby>/g) || []).length;
    const cleanedRubyCount = (cleanedContent.match(/<ruby>/g) || []).length;
    const rtCount = (originalContent.match(/<rt>/g) || []).length;
    const rbCount = (originalContent.match(/<rb>/g) || []).length;

    return {
        rubyElementsRemoved: originalRubyCount - cleanedRubyCount,
        rtElementsRemoved: rtCount,
        rbElementsProcessed: rbCount
    };
}
