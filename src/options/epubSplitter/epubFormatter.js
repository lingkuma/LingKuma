// --- 获取新按钮和相关元素 ---
// const fixButton = document.getElementById('fixNakedTextButton'); // 删除此行，变量由 epubSplitter.js 提供
// 如果需要共享 selectedEpubFile, 从 epubSplitter.js 获取 (假设它是全局的)
// 或者通过其他方式传递/访问

// --- 存储按钮原始文本 ---
const originalFixButtonText = fixButton.textContent; // 直接使用 fixButton

// --- 为修复按钮添加点击事件监听器 ---
fixButton.addEventListener('click', handleFixNakedText); // 直接使用 fixButton

async function handleFixNakedText() {
    // 复用 epubSplitter.js 中的 selectedEpubFile 变量 (假设它是全局可访问的)
    // 注意：确保 selectedEpubFile 在 epubSplitter.js 中是全局作用域或者可以通过某种方式访问
    const file = window.selectedEpubFile; // 明确表示使用全局变量

    if (!file) {
        alert('请先选择一个 EPUB 文件！ | Please select an EPUB file first! | まずEPUBファイルを選択してください！');
        return;
    }

    // --- 开始处理：更新按钮状态 ---
    fixButton.textContent = '正在修复中... | Fixing... | 修正中...'; // 直接使用 fixButton
    fixButton.disabled = true; // 直接使用 fixButton
    // 可选：同时禁用拆分按钮，防止并发操作
    // const processButton = document.getElementById('processEpubButton'); // 删除此行，变量由 epubSplitter.js 提供
    if (processButton) processButton.disabled = true; // 直接使用 processButton


    try {
        const zip = new JSZip();
        const epubContent = await zip.loadAsync(file);
        const newZip = new JSZip();
        let changesMade = false; // 标记是否有文件被修改

        console.log("开始修复裸文本...");

        // 遍历 EPUB 中的所有文件
        for (const path in epubContent.files) {
            const entry = epubContent.files[path];

            // 只处理 HTML 或 XHTML 文件
            if (path.match(/\.(x?html|xhtml)$/i) && !entry.dir) {
                console.log(`检查文件: ${path}`);
                const content = await entry.async('string');
                const { modifiedContent, fileChanged } = wrapNakedTextNodes(content);

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
            alert('未发现需要修复的裸文本。| No naked text found needing fixing. | 修正が必要な裸のテキストは見つかりませんでした。');
            // --- 处理完成（无修改）：恢复按钮状态 ---
            fixButton.textContent = originalFixButtonText;
            // 保持禁用，因为文件处理逻辑认为已完成
            // 如果希望用户能再次点击（即使无修改），则设为 false
            // fixButton.disabled = false;
            // 恢复拆分按钮状态 (如果之前禁用了它)
             if (processButton) processButton.disabled = (window.selectedEpubFile === null); // 直接使用 processButton

            // 不需要下载，也不需要清空文件选择
            return;
        }

        console.log("修复完成，正在生成新的 EPUB 文件...");
        // 生成新的 EPUB 文件
        const newEpubContent = await newZip.generateAsync({ type: 'blob' });

        // --- 处理成功：恢复按钮状态（在下载前） ---
        fixButton.textContent = originalFixButtonText;
        // 保持按钮禁用，因为处理已完成，文件已清空

        saveAs(newEpubContent, file.name.replace('.epub', '_fixed.epub'));

        console.log("新 EPUB 文件已生成并开始下载。");

        // 处理完成后清空文件选择等 (与 splitter 保持一致)
        window.selectedEpubFile = null; // 假设 selectedEpubFile 是全局的
        document.getElementById('epubFileInput').value = '';
        // 确保两个按钮都禁用
        fixButton.disabled = true; // 直接使用 fixButton
        if (processButton) processButton.disabled = true; // 直接使用 processButton


    } catch (error) {
        console.error('修复 EPUB 文件时出错:', error);
        alert('修复 EPUB 文件时出错: ' + error.message);

        // --- 处理失败：恢复按钮状态 ---
        fixButton.textContent = originalFixButtonText;
        fixButton.disabled = false; // 允许重试
        // 恢复拆分按钮状态 (如果之前禁用了它)
        if (processButton) processButton.disabled = (window.selectedEpubFile === null); // 直接使用 processButton
    }
}

function wrapNakedTextNodes(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'application/xhtml+xml');
    const body = doc.body;
    let fileChanged = false;

    if (!body) {
        console.warn("无法找到 body 元素，跳过处理。");
        return { modifiedContent: htmlContent, fileChanged: false };
    }

    const newNodes = []; // 用于存储处理后的节点
    let needsWrapping = []; // 临时存储需要包裹的连续文本节点

    function wrapCollectedNodes() {
        if (needsWrapping.length > 0) {
            const combinedText = needsWrapping.map(node => node.textContent).join('');
            if (combinedText.trim() !== '') {
                const p = doc.createElement('p');
                p.textContent = combinedText; // 直接设置文本内容，避免创建不必要的子文本节点
                newNodes.push(p);
                fileChanged = true; // 标记发生了修改
                console.log("包裹了裸文本:", combinedText.substring(0, 50) + "...");
            } else {
                 // 如果合并后只有空白，也需要将其添加回去，以保持结构
                 needsWrapping.forEach(node => newNodes.push(node.cloneNode(true)));
            }
            needsWrapping = []; // 清空临时数组
        }
    }

    body.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            // 是文本节点，先收集起来
            needsWrapping.push(node);
        } else {
            // 遇到非文本节点（元素、注释等）
            // 先处理之前收集到的文本节点
            wrapCollectedNodes();
            // 然后将这个非文本节点加入新节点列表
            newNodes.push(node.cloneNode(true)); // 克隆以防万一
        }
    });

    // 处理循环结束后可能还剩下的文本节点
    wrapCollectedNodes();

    // 如果有修改，则用新节点替换 body 的内容
    if (fileChanged) {
        // 清空 body
        while (body.firstChild) {
            body.removeChild(body.firstChild);
        }
        // 添加新节点
        newNodes.forEach(newNode => {
            body.appendChild(newNode);
        });

        // 序列化修改后的文档
        const serializer = new XMLSerializer();
        const newHtmlContent = serializer.serializeToString(doc);
        return { modifiedContent: newHtmlContent, fileChanged: true };
    } else {
        // 没有修改，返回原始内容
        return { modifiedContent: htmlContent, fileChanged: false };
    }
} 