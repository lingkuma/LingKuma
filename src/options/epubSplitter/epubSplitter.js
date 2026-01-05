// 存储文件映射关系，用于更新目录文件
let fileMapping = new Map();
// 修改：让 selectedEpubFile 成为全局变量，以便 epubFormatter.js 访问
// 或者你可以选择其他模块通信方式
window.selectedEpubFile = null; // 使用 window 使其全局可见
// 获取处理按钮元素
const processButton = document.getElementById('processEpubButton');
// 新增：获取修复按钮元素
const fixButton = document.getElementById('fixNakedTextButton');
// 存储按钮原始文本
const originalButtonText = processButton.textContent;
// 新增：存储修复按钮原始文本 (虽然 formatter.js 也存了，这里是为了统一管理启用/禁用逻辑)
// const originalFixButtonText = fixButton.textContent; // formatter.js 中已有

// 修改：文件选择事件监听器 - 控制两个按钮
document.getElementById('epubFileInput').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        window.selectedEpubFile = file; // 存储文件到全局变量
        processButton.disabled = false; // 启用拆分按钮
        fixButton.disabled = false;     // 启用修复按钮
    } else {
        window.selectedEpubFile = null; // 清空文件
        processButton.disabled = true; // 禁用拆分按钮
        fixButton.disabled = true;     // 禁用修复按钮
    }
});

// 为处理按钮添加点击事件监听器
processButton.addEventListener('click', handleEpubUpload);

async function handleEpubUpload() {
    // 修改：从全局变量获取文件
    const file = window.selectedEpubFile;
    if (!file) {
        alert('请先选择一个 EPUB 文件！ | Please select an EPUB file first! | まずEPUBファイルを選択してください！');
        return;
    }

    // --- 开始处理：更新按钮状态 ---
    processButton.textContent = '正在处理中... | Processing... | 処理中...';
    processButton.disabled = true; // 明确禁用按钮防止重复点击
    // 新增：同时禁用修复按钮
    if (fixButton) fixButton.disabled = true;

    // 获取用户输入的目标单词数
    const targetWordsInput = document.getElementById('targetWordsInput');
    const targetWords = parseInt(targetWordsInput.value) || 8000; // 如果输入无效，默认使用500

    try {
        const zip = new JSZip();
        const epubContent = await zip.loadAsync(file);
        
        const newZip = new JSZip();
        
        // 修改文件分类
        const htmlFiles = [];
        const opfFiles = [];
        const tocFiles = [];
        const coverFiles = [];
        const imageFiles = [];  // 专门存储图片文件
        const otherFiles = [];

        // 第一次遍历：读取所有文件，分类存储内容
        for (const path in epubContent.files) {
            const entry = epubContent.files[path];
            
            // 检查是否是图片文件
            if (path.match(/\.(jpg|jpeg|png|gif)$/i)) {
                const binaryContent = await entry.async('uint8array');
                imageFiles.push({ path, content: binaryContent });
                continue;
            }

            const content = await entry.async('string');
            
            // 更新文件分类逻辑
            if (path.match(/cover\.|titlepage\./i) || content.includes('calibre:cover')) {
                coverFiles.push({ path, content });
            } else if (path.match(/\.(?:x?html|xhtml)$/i) && !path.includes('toc')) {
                htmlFiles.push({ path, content });
            } else if (path.endsWith('content.opf')) {
                opfFiles.push({ path, content });
            } else if (path.endsWith('toc.ncx')) {
                tocFiles.push({ path, content });
            } else {
                otherFiles.push({ path, content });
            }
        }

        // 首先处理所有图片文件
        for (const file of imageFiles) {
            newZip.file(file.path, file.content);
        }

        // 处理封面相关文件
        for (const file of coverFiles) {
            // 检查封面文件中的图片引用路径是否需要修正
            let updatedContent = file.content;
            if (file.path.match(/\.(x?html|xhtml)$/i)) {
                // 修正 SVG 中的图片引用路径
                updatedContent = file.content.replace(
                    /(xlink:href=["'])(.*?)(cover\.(jpg|jpeg|png|gif))["']/i,
                    (match, p1, p2, p3) => {
                        // 保持原始的图片文件名
                        return `${p1}${p3}${p1.charAt(0)}`; 
                    }
                );
            }
            newZip.file(file.path, updatedContent);
        }

        // 第二次遍历：先处理所有 HTML/XHTML 文件，对其进行拆分，并更新 fileMapping
        for (const file of htmlFiles) {
            const parts = await splitChapter(file.content, file.path, targetWords);
            // 将拆分后的每个文件加入新的 zip 文件
            for (let [newPath, newContent] of parts) {
                newZip.file(newPath, newContent);
            }
            // 注意：这里把拆分后的所有新路径作为一个数组存入 fileMapping
            fileMapping.set(file.path, Array.from(parts.keys()));
        }

        // 处理 content.opf，此时 fileMapping 应该已经填充完毕
        for (const file of opfFiles) {
            console.log("fileMapping", fileMapping);
            const updatedOpf = updateContentOpf(file.content);
            newZip.file(file.path, updatedOpf);
        }

        // 处理 toc.ncx 文件，它可能需要依赖 fileMapping 的信息（如果有的话）
        for (const file of tocFiles) {
            const updatedToc = updateTocNcx(file.content);
            newZip.file(file.path, updatedToc);
        }

        // 处理其他文件
        for (const file of otherFiles) {
            newZip.file(file.path, file.content);
        }

        // 生成新的epub文件
        const newEpubContent = await newZip.generateAsync({type: 'blob'});
        
        // --- 处理成功：恢复按钮状态（在下载前） ---
        processButton.textContent = originalButtonText; // 恢复原始文本
        // 保持按钮禁用，因为处理已完成，文件已清空
        
        saveAs(newEpubContent, file.name.replace('.epub', '_split.epub'));

        // 处理完成后清空文件选择等
        window.selectedEpubFile = null; // 清空全局变量
        document.getElementById('epubFileInput').value = '';
        // 确保两个按钮都禁用
        processButton.disabled = true;
        if (fixButton) fixButton.disabled = true;

    } catch (error) {
        console.error('处理EPUB文件时出错:', error);
        alert('处理EPUB文件时出错: ' + error.message);
        
        // --- 处理失败：恢复按钮状态 ---
        processButton.textContent = originalButtonText; // 恢复原始文本
        processButton.disabled = false; // 重新启用按钮，允许用户重试
        // 新增：根据是否有文件选择，恢复修复按钮状态
         if (fixButton) fixButton.disabled = (window.selectedEpubFile === null);
    }
}

function splitChapter(content, originalPath, targetWords) {
    return new Promise((resolve) => {
        const parts = new Map();
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'application/xhtml+xml');
        
        // 获取正文内容
        const bodyContent = doc.querySelector('body');
        const words = bodyContent.textContent.trim().split(/\s+/);
        
        // 使用传入的 targetWords 替代原来的固定值
        if (words.length <= targetWords) {
            parts.set(originalPath, content);
            resolve(parts);
            return;
        }

        // 拆分章节
        let currentPart = 0;
        let currentWords = 0;
        let currentContent = [];
        const paragraphs = bodyContent.querySelectorAll('p');

        paragraphs.forEach((p) => {
            const pWords = p.textContent.trim().split(/\s+/).length;
            
            if (currentWords + pWords > targetWords) {
                // 创建新的分段文件
                const newPath = originalPath.replace(
                    /(.+)\.(?:x?html|xhtml)$/i,
                    `$1.part${currentPart}.xhtml`
                );
                
                const newDoc = doc.cloneNode(true);
                const newBody = newDoc.querySelector('body');
                newBody.innerHTML = currentContent.join('');
                
                parts.set(newPath, new XMLSerializer().serializeToString(newDoc));
                
                currentPart++;
                currentWords = pWords;
                currentContent = [p.outerHTML];
            } else {
                currentWords += pWords;
                currentContent.push(p.outerHTML);
            }
        });

        // 处理最后一部分
        if (currentContent.length > 0) {
            const newPath = originalPath.replace(
                /(.+)\.(?:x?html|xhtml)$/i,
                `$1.part${currentPart}.xhtml`
            );
            
            const newDoc = doc.cloneNode(true);
            const newBody = newDoc.querySelector('body');
            newBody.innerHTML = currentContent.join('');
            
            parts.set(newPath, new XMLSerializer().serializeToString(newDoc));
        }

        resolve(parts);
    });
}

function findItemByHref(manifest, originalPath) {
    // 假设 originalPath 以 "OEBPS/" 开头，则去掉这个前缀
    const relativePath = originalPath.replace(/^OEBPS\//, '');
    // 获取命名空间下的所有 item 节点
    const items = manifest.getElementsByTagNameNS('http://www.idpf.org/2007/opf', 'item');
    for (let item of items) {
        const href = item.getAttribute('href');
        if (href && href.indexOf(relativePath) !== -1) {
            return item;
        }
    }
    return null;
}

function updateContentOpf(content) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'application/xml');

    // 获取 manifest 和 spine 节点
    const manifest = doc.querySelector('manifest');
    const spine = doc.querySelector('spine');

    // 先收集所有要替换（拆分）的章节信息
    let replacements = [];
    fileMapping.forEach((newPaths, originalPath) => {
        const originalItem = findItemByHref(manifest, originalPath);
        if (!originalItem) return;
        const originalId = originalItem.getAttribute('id');

        if (newPaths.length > 1) {
            const originalSpineItem = spine.querySelector(`itemref[idref="${originalId}"]`);
            // 记录在 spine 中的顺序位置
            let spineIndex = originalSpineItem ? Array.from(spine.children).indexOf(originalSpineItem) : -1;
            replacements.push({
                originalPath,
                newPaths,
                originalId,
                originalItem,
                originalSpineItem,
                spineIndex
            });
        } else {
            // 对于未拆分的章节，仅更新 href 移除 "OEBPS/" 前缀
            originalItem.setAttribute('href', normalizePath(originalPath));
        }
    });

    // 根据原始章节在 spine 中的位置进行排序（升序）
    replacements.sort((a, b) => a.spineIndex - b.spineIndex);

    // 逐个替换
    replacements.forEach(rep => {
        const { originalId, originalItem, originalSpineItem, newPaths } = rep;
        // 记录原始 spine 项的下一个兄弟节点作为参考位置
        let referenceNode = originalSpineItem ? originalSpineItem.nextSibling : null;
        // 删除原始的 <item> 和 <itemref>
        if (originalSpineItem) {
            spine.removeChild(originalSpineItem);
        }
        manifest.removeChild(originalItem);

        // 顺序插入新的拆分项
        newPaths.forEach((newPath, index) => {
            const newId = `split_${originalId}_part${index}`;
            // 使用 createElementNS 保持命名空间一致，避免出现 xmlns=""
            const newItem = doc.createElementNS("http://www.idpf.org/2007/opf", 'item');
            newItem.setAttribute('id', newId);
            newItem.setAttribute('href', normalizePath(newPath));
            newItem.setAttribute('media-type', 'application/xhtml+xml');
            // Manifest 顺序通常不影响阅读顺序，但如果有需要可以重新维护，此处直接追加即可
            manifest.appendChild(newItem);

            // 创建对应的 spine 项，并插入到参考位置前
            const newSpineItem = doc.createElementNS("http://www.idpf.org/2007/opf", 'itemref');
            newSpineItem.setAttribute('idref', newId);
            if (referenceNode) {
                spine.insertBefore(newSpineItem, referenceNode);
            } else {
                spine.appendChild(newSpineItem);
            }
        });
    });

    return new XMLSerializer().serializeToString(doc);
}

function updateTocNcx(content) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'application/xml');
    
    // 更新 navMap 中的 src 引用
    fileMapping.forEach((newPaths, originalPath) => {
        console.log("updateTocNcx  newPaths", newPaths);
        console.log("updateTocNcx originalPath", originalPath);

        const navPoints = doc.querySelectorAll('navPoint');
        navPoints.forEach((navPoint) => {
            const contentElement = navPoint.querySelector('content');
            if (contentElement) {
                let srcAttr = contentElement.getAttribute('src');
                let normalizedSrc = normalizePath(srcAttr).split('#')[0];

                console.log("updateTocNcx srcAttr", srcAttr);
                console.log("updateTocNcx normalizedSrc", normalizedSrc);

                let normalizedOriginal = normalizePath(originalPath);
                if (normalizedSrc === normalizedOriginal) {
                    if (newPaths.length > 1) {
                        // 将原 navPoint 的链接指向第1部分
                        contentElement.setAttribute('src', normalizePath(newPaths[0]));
                        
                        // 获取当前 navPoint 的命名空间（保证创建的子节点与之保持一致）
                        const ns = navPoint.namespaceURI || null;
                        
                        // 针对拆分的部分，从下标1开始创建新的 Teil 项
                        for (let i = 1; i < newPaths.length; i++) {
                            // 创建新的 navPoint（不复制已有子节点，以免嵌套层级混乱）
                            const newNavPoint = doc.createElementNS(ns, 'navPoint');
                            newNavPoint.setAttribute('id', `${navPoint.getAttribute('id')}_part${i}`);
                            
                            // 创建 navLabel 元素
                            const newNavLabel = doc.createElementNS(ns, 'navLabel');
                            const newText = doc.createElementNS(ns, 'text');
                            // 使用原 navPoint 的标题，并添加 (Teil i+1) 标记
                            const originalTitle = (navPoint.querySelector('navLabel text')?.textContent || '').trim();
                            newText.textContent = `${originalTitle} (Teil ${i + 1})`;
                            newNavLabel.appendChild(newText);
                            newNavPoint.appendChild(newNavLabel);
                            
                            // 创建 content 元素，指向拆分后的对应部分
                            const newContent = doc.createElementNS(ns, 'content');
                            newContent.setAttribute('src', normalizePath(newPaths[i]));
                            newNavPoint.appendChild(newContent);
                            
                            // 将新建的 navPoint 添加为原 navPoint 的子节点，实现缩进效果且保证顺序
                            navPoint.appendChild(newNavPoint);
                        }
                    } else {
                        // 若未拆分，则直接标准化 href
                        contentElement.setAttribute('src', normalizePath(originalPath));
                    }
                }
            }
        });
    });
    
    // 重新排序 playOrder（将所有 navPoint 按文档顺序一一赋值）
    const allNavPoints = doc.querySelectorAll('navPoint');
    allNavPoints.forEach((navPoint, index) => {
        navPoint.setAttribute('playOrder', (index + 1).toString());
    });
    
    return new XMLSerializer().serializeToString(doc);
}

function normalizePath(path) {
    return path.replace(/^OEBPS\//, '');
}
