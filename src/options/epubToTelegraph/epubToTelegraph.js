// telegraph 会在唯一网页名后面添加以UTC-0 的“-月-日”后缀。 
// 例如：https://telegra.ph/test-05-04
// 因此，我们要为每个过程的 每个网页名字 添加同一个 一个随机数。就是说比如10个网页，要给后面添加相同的随机数。 然后获取UTC-0的日期。
// 这样，我们就可以获取网页的具体链接了。而不用等网页创建之后再获取。 而且即使是相同的epub文件，因为我们会每次添加不同的随机数，也不会冲突。
// 而且我们 还可以在每个网页的开头和结尾，添加上一页和下一页。
// 对了，我们的网页名称也要处理一下，我看到类似https://telegra.ph/index-split-000part0xhtml-05-13-2 这样的。可以看到，网页名里的小数点和下划线，都会被转换成-和删除。
// 所以，我们也要处理一下。


document.addEventListener('DOMContentLoaded', () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)); // 新增 sleep 函数

    const epubFileInput = document.getElementById('epubFile');
    const convertButton = document.getElementById('convertToTelegraphButton');
    const statusArea = document.getElementById('statusArea');
    const publishedPagesArea = document.getElementById('publishedPagesArea'); // 新增

    // Telegra.ph API 相关常量
    const TELEGRAPH_API_URL = 'https://api.telegra.ph';
    const TELEGRAPH_ACCOUNT_KEY = 'telegraph_access_token';
    const TELEGRAPH_SHORT_NAME = 'EPUBConverterExtension'; // 插件的简称，用于创建账户
    // const TELEGRAPH_AUTHOR_NAME = ''; // 可选的作者名

    let epubChapters = []; // 用于存储提取的章节 { fileName: string, htmlContent: string }
    let sharedRandomIdentifier = ''; // 新增：共享随机标识符
    let utcDateString = ''; // 新增：UTC 日期字符串 MM-DD

    // 辅助函数：生成随机标识符
    function generateRandomIdentifier(length = 7) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    // 辅助函数：获取 UTC-0 日期字符串 (MM-DD)
    function getUTCDateString() {
        const date = new Date();
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = date.getUTCDate().toString().padStart(2, '0');
        return `${month}-${day}`;
    }

    // 自然排序函数
    function naturalSort(a, b) {
        const re = /(\d+)|(\D+)/g; // 匹配数字或非数字
        const aParts = String(a).match(re) || [];
        const bParts = String(b).match(re) || [];

        for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
            const aPart = aParts[i];
            const bPart = bParts[i];

            if (isNaN(aPart) || isNaN(bPart)) { // 如果任一部分不是数字，则按字符串比较
                if (aPart < bPart) return -1;
                if (aPart > bPart) return 1;
            } else { // 如果两部分都是数字
                const numA = parseInt(aPart, 10);
                const numB = parseInt(bPart, 10);
                if (numA < numB) return -1;
                if (numA > numB) return 1;
            }
        }
        // 如果所有共同部分都相同，则较短的字符串优先
        return aParts.length - bParts.length;
    }

    // 辅助函数：清理标题用于 URL 路径
    function sanitizeTitleForPath(title) {
        if (!title) return 'untitled'; // 如果原始标题为空或未定义，返回默认值
        let sanitized = String(title) // 确保是字符串
            .toLowerCase()
            .replace(/\./g, '-') // 将所有小数点替换为连字符
            // 将非字母数字字符（包括下划线 _、空格等，但不包括已删除的小数点）替换为连字符 -
            // 保留中文字符、字母、数字，其他替换为连字符
            .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-') // 移除非(中文、字母、数字)的字符，替换为连字符
            .replace(/-+/g, '-') // 将多个连续的连字符替换为单个连字符
            .replace(/^-+|-+$/g, ''); // 移除开头和结尾的连字符
        
        // 如果处理后为空（例如，标题全是特殊字符）
        if (sanitized.length === 0) {
            return 'untitled';
        }

        // Telegra.ph 路径长度限制（估算）
        // 注意：这个长度限制是针对最终路径的一部分，即 sanitizeTitleForPath(fileName) + sharedRandomIdentifier
        // 我们需要为 sharedRandomIdentifier 和可能的连字符留出空间
        const identifierLength = sharedRandomIdentifier ? sharedRandomIdentifier.length + 1 : 0; // +1 for the hyphen
        const maxLength = 60 - identifierLength; // 为标题部分预留的长度
        
        // 截断逻辑，确保考虑 URI 编码后的长度
        if (encodeURIComponent(sanitized).length > maxLength) {
            let tempSanitized = sanitized;
            // 从后往前逐个字符削减，直到满足长度要求
            while (encodeURIComponent(tempSanitized).length > maxLength && tempSanitized.length > 0) {
                tempSanitized = tempSanitized.slice(0, -1);
            }
            // 再次清理可能在末尾产生的连字符
            sanitized = tempSanitized.replace(/-+$/g, '');
        }
        
        // 如果经过所有处理（包括截断）后为空，则返回默认值
        return sanitized || 'untitled';
    }


    if (!epubFileInput) {
        console.error('错误：找不到 ID 为 "epubFile" 的文件输入元素。');
        statusArea.textContent = '错误：初始化失败，无法找到文件输入控件。';
        return;
    }
    if (!convertButton) {
        console.error('错误：找不到 ID 为 "convertToTelegraphButton" 的按钮元素。');
        statusArea.textContent = '错误：初始化失败，无法找到转换按钮。';
        return;
    }
    if (!statusArea) {
        console.error('错误：找不到 ID 为 "statusArea" 的状态显示区域元素。');
        // 此时无法更新 statusArea，只能 console.error
        return;
    }

    // 检查 JSZip 是否已加载
    if (typeof JSZip === 'undefined') {
        console.error('错误：JSZip 库未加载。请确保 jszip.min.js 已正确引入。');
        statusArea.textContent = '错误：核心压缩库 JSZip 未能加载，请检查 HTML 文件中的引用。';
        return;
    }

    epubFileInput.addEventListener('change', handleFileSelect);
    convertButton.addEventListener('click', processEpub); // 按钮点击后处理已选择的文件

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            if (file.name.endsWith('.epub')) {
                statusArea.textContent = `已选择文件：${file.name}。点击按钮开始处理。`;
                // 清空之前可能存在的章节数据
                epubChapters = [];
            } else {
                statusArea.textContent = '请选择一个有效的 .epub 文件。';
                epubFileInput.value = ''; // 清空选择
            }
        }
    }

    async function processEpub() {
        const file = epubFileInput.files[0];
        if (!file) {
            statusArea.textContent = '请先选择一个 EPUB 文件。';
            return;
        }

        statusArea.textContent = '正在处理 EPUB 文件，请稍候...';
        epubChapters = []; // 重置章节数组
        sharedRandomIdentifier = generateRandomIdentifier(); // 生成本次处理的共享随机标识符
        utcDateString = getUTCDateString(); // 获取当前 UTC 日期
        console.log(`本次发布共享标识符: ${sharedRandomIdentifier}, UTC 日期: ${utcDateString}`);
        statusArea.textContent = `正在处理 EPUB，共享标识符: ${sharedRandomIdentifier}, UTC 日期: ${utcDateString}...`;

        try {
            const zip = await JSZip.loadAsync(file);
            const chapterFiles = [];

            // 遍历 ZIP 中的所有文件
            zip.forEach((relativePath, zipEntry) => {
                // 根据常见的 EPUB 结构和文件扩展名筛选章节文件
                // 通常在 OEBPS, EPUB, OPS, content 目录下
                const lowerPath = relativePath.toLowerCase();
                if (!zipEntry.dir &&
                    (lowerPath.endsWith('.html') || lowerPath.endsWith('.xhtml') || lowerPath.endsWith('.htm')) &&
                    (
                        lowerPath.includes('oebps/') ||
                        lowerPath.includes('epub/') ||
                        lowerPath.includes('ops/') ||
                        lowerPath.includes('content/') ||
                        !lowerPath.includes('/') // 检查是否在根目录 (路径中不含'/')
                    )
                ) {
                    chapterFiles.push(zipEntry);
                }
            });

            // 对 chapterFiles 进行自然排序
            if (chapterFiles.length > 0) {
                chapterFiles.sort((zipEntryA, zipEntryB) => {
                    // 使用 zipEntry.name 进行排序，它是包含完整路径的文件名
                    // 例如： "OEBPS/Text/chapter1.xhtml", "OEBPS/Text/chapter10.xhtml"
                    return naturalSort(zipEntryA.name.toLowerCase(), zipEntryB.name.toLowerCase());
                });
                console.log('Sorted chapter files by name:', chapterFiles.map(f => f.name)); // 调试日志
            }

            if (chapterFiles.length === 0) {
                statusArea.textContent = '未在 EPUB 文件中找到 HTML/XHTML 章节。请检查文件结构。';
                console.warn('No HTML/XHTML chapter files found in the EPUB.');
                return;
            }

            statusArea.textContent = `找到 ${chapterFiles.length} 个正确排序的章节文件。正在提取内容...`; // 更新状态文本
            console.log(`Found and sorted ${chapterFiles.length} potential chapter files:`); // 更新日志文本
            
            for (const zipEntry of chapterFiles) {
                const fileName = zipEntry.name.split('/').pop(); // 获取文件名
                const fileContent = await zipEntry.async('string'); // 获取文件内容字符串
                
                // 提取 body 内容
                // 使用 DOMParser 解析 HTML 字符串
                const parser = new DOMParser();
                const doc = parser.parseFromString(fileContent, 'text/html'); // text/html 更宽容
                const bodyContent = doc.body ? doc.body.innerHTML : fileContent; // 如果没有body，则使用完整内容

                epubChapters.push({
                    fileName: fileName,
                    htmlContent: bodyContent 
                });
                console.log(`- 已提取: ${fileName}`);
            }

            if (epubChapters.length > 0) {
                statusArea.innerHTML = `成功提取 ${epubChapters.length} 个章节：<br> - ${epubChapters.map(c => c.fileName).join('<br> - ')} <br><br>准备发布到 Telegra.ph...`;
                console.log('提取完成的章节数据:', epubChapters);
                
                // 开始发布流程
                initiateTelegraphPublishing();
            } else {
                statusArea.textContent = '虽然找到了章节文件，但未能成功提取任何章节内容。';
                console.warn('Chapter files were found, but no content could be extracted.');
            }

        } catch (error) {
            console.error('处理 EPUB 文件时发生错误:', error);
            statusArea.textContent = `处理 EPUB 文件失败：${error.message}`;
            epubChapters = []; // 出错时清空
        }
    }

    // --- Telegra.ph 发布逻辑 ---

    async function initiateTelegraphPublishing() {
        statusArea.textContent = '正在获取 Telegra.ph 授权...';
        if(publishedPagesArea) publishedPagesArea.innerHTML = ''; // 清空之前的发布结果

        try {
            const accessToken = await getAccessToken();
            if (accessToken) {
                statusArea.textContent = 'Telegra.ph 授权成功，准备开始发布页面...';
                await publishToTelegraph(accessToken, epubChapters);
            } else {
                statusArea.textContent = '获取 Telegra.ph 授权失败，无法发布。请检查网络或稍后重试。';
                console.warn('未能获取 access_token');
            }
        } catch (error) {
            console.error('Telegra.ph 发布流程初始化出错:', error);
            statusArea.textContent = `发布到 Telegra.ph 失败：${error.message}`;
        }
    }

    async function getAccessToken() {
        return new Promise((resolve, reject) => {
            if (!chrome || !chrome.storage || !chrome.storage.local) {
                return reject(new Error('Chrome Storage API 不可用。此功能可能无法在非扩展环境运行。'));
            }
            chrome.storage.local.get([TELEGRAPH_ACCOUNT_KEY], async (result) => {
                if (chrome.runtime.lastError) {
                    console.error('从 chrome.storage.local 读取 access_token 时出错:', chrome.runtime.lastError);
                    return reject(new Error(`读取本地存储失败: ${chrome.runtime.lastError.message}`));
                }
                if (result[TELEGRAPH_ACCOUNT_KEY]) {
                    console.log('找到已存储的 Telegra.ph access_token。');
                    // TODO: 可选 - 调用 getAccountInfo 验证 token 有效性
                    // const accountInfo = await getTelegraphAccountInfo(result[TELEGRAPH_ACCOUNT_KEY]);
                    // if (accountInfo) {
                    //    resolve(result[TELEGRAPH_ACCOUNT_KEY]);
                    // } else {
                    //    console.log('已存储的 access_token 无效或已过期，将创建新账户。');
                    //    try {
                    //        const newAccount = await createTelegraphAccount();
                    //        resolve(newAccount.access_token);
                    //    } catch (error) {
                    //        reject(error);
                    //    }
                    // }
                    resolve(result[TELEGRAPH_ACCOUNT_KEY]);
                } else {
                    console.log('未找到 Telegra.ph access_token，尝试创建新账户...');
                    try {
                        const newAccount = await createTelegraphAccount();
                        if (newAccount && newAccount.access_token) {
                            resolve(newAccount.access_token);
                        } else {
                            reject(new Error('创建账户成功但未返回 access_token。'));
                        }
                    } catch (error) {
                        console.error('创建 Telegra.ph 账户失败:', error);
                        reject(error);
                    }
                }
            });
        });
    }

    async function createTelegraphAccount(shortName = TELEGRAPH_SHORT_NAME, authorName = '') {
        const params = new URLSearchParams({
            short_name: shortName,
        });
        if (authorName) { // author_name 是可选的
            params.append('author_name', authorName);
        }
        // Telegra.ph API 文档中还提到 author_url，如果需要也可以添加
        // if (authorUrl) { params.append('author_url', authorUrl); }

        try {
            const response = await fetch(`${TELEGRAPH_API_URL}/createAccount?${params.toString()}`, { method: 'GET' });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                console.error('Telegra.ph API createAccount 请求失败:', response.status, errorData);
                throw new Error(`Telegra.ph API 错误 (createAccount): ${errorData.error || `HTTP ${response.status}`}`);
            }
            
            const data = await response.json();

            if (data.ok && data.result && data.result.access_token) {
                console.log('Telegra.ph 账户创建成功:', data.result);
                const accessToken = data.result.access_token;
                
                await new Promise((resolveStore, rejectStore) => {
                    chrome.storage.local.set({ [TELEGRAPH_ACCOUNT_KEY]: accessToken }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('保存 access_token 到 chrome.storage.local 失败:', chrome.runtime.lastError);
                            rejectStore(new Error(`保存 access_token 失败: ${chrome.runtime.lastError.message}`));
                        } else {
                            console.log('Telegra.ph access_token 已成功保存到 chrome.storage.local。');
                            resolveStore();
                        }
                    });
                });
                return data.result; // 返回 { short_name, author_name?, author_url?, access_token, auth_url?, page_count? }
            } else {
                const errorMessage = data.error || 'createAccount API 响应成功，但未返回有效的 access_token 或结果。';
                console.error('Telegra.ph API createAccount 逻辑错误:', errorMessage, data);
                throw new Error(`Telegra.ph API 逻辑错误 (createAccount): ${errorMessage}`);
            }
        } catch (error) {
            console.error('调用 Telegra.ph createAccount API 时发生网络或解析错误:', error);
            // 避免暴露原始 fetch 错误信息给上层（如果它包含敏感信息或过于技术性）
            throw new Error(`调用 Telegra.ph createAccount API 失败。请检查网络连接。 (${error.message})`);
        }
    }

    async function publishToTelegraph(accessToken, chapters) {
        statusArea.innerHTML = `准备发布 ${chapters.length} 个章节... 共享标识符: ${sharedRandomIdentifier}, UTC 日期: ${utcDateString}.<br>请稍候，这可能需要一些时间。`;
        if (publishedPagesArea) publishedPagesArea.innerHTML = '<h4>发布结果：</h4><div id="publishedLinksContainer"></div>';
        
        const linksContainer = document.getElementById('publishedLinksContainer');
        let successCount = 0;
        let errorCount = 0;
        const publishedPagesInfo = []; // 用于存储成功发布的页面信息 { title: string, url: string, originalFileName: string }

        // 预先生成所有章节的预测 URL，用于导航
        const predictedUrls = chapters.map(chapter => {
            const sanitizedFileName = sanitizeTitleForPath(chapter.fileName);
            // 预测 URL 结构: https://telegra.ph/{sanitizedFileName}-{sharedRandomIdentifier}-{MM-DD}
            // 这里的 sanitizedFileName 已经经过处理，sharedRandomIdentifier 会被 Telegra.ph 根据我们传递的 title 附加
            // Telegra.ph 会根据传递给 createPage 的 title 生成 path。
            // 我们传递的 title 是 sanitizedFileName-sharedRandomIdentifier
            // Telegra.ph 会自动附加日期后缀 -MM-DD
            return `https://telegra.ph/${sanitizedFileName}-${sharedRandomIdentifier}-${utcDateString}`;
        });

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const originalFileName = chapter.fileName; // 保留原始文件名用于目录和状态显示
            const displayChapterTitle = originalFileName || `未命名章节 ${i + 1}`; // 用于UI显示和日志

            // 构造传递给 Telegra.ph API 的 title，这将影响其生成的 path
            // 格式: sanitizedOriginalFileName-sharedRandomIdentifier
            const sanitizedBaseTitle = sanitizeTitleForPath(originalFileName);
            const titleForTelegraphApi = `${sanitizedBaseTitle}-${sharedRandomIdentifier}`;
            
            statusArea.innerHTML = `正在发布 ${chapters.length} 个章节中的第 ${i + 1} 章: "${displayChapterTitle}" (API title: ${titleForTelegraphApi})...`;
            
            try {
                console.log(`处理章节: ${displayChapterTitle}, HTML 长度: ${chapter.htmlContent.length}`);
                
                let contentNodes = htmlToTelegraphNodes(chapter.htmlContent, displayChapterTitle);

                if (!contentNodes || contentNodes.length === 0) {
                    console.warn(`章节 "${displayChapterTitle}" 的内容转换后为空。`);
                }
                
                // 添加导航链接 (使用预测的 URL)
                let finalContentNodes = [];
                
                // 上一页链接 (如果存在)
                if (i > 0) {
                    finalContentNodes.push({
                        tag: 'p',
                        children: [{
                            tag: 'a',
                            attrs: { href: predictedUrls[i - 1] }, // 使用预测的 URL
                            children: ['上一页']
                        }]
                    });
                }

                // 章节实际内容
                if (contentNodes && contentNodes.length > 0) {
                    finalContentNodes.push(...contentNodes);
                }

                // 下一页链接 (如果存在)
                if (i < chapters.length - 1) {
                    finalContentNodes.push({
                        tag: 'p',
                        children: [{
                            tag: 'a',
                            attrs: { href: predictedUrls[i + 1] }, // 使用预测的 URL
                            children: ['下一页']
                        }]
                    });
                }
                
                finalContentNodes = finalContentNodes.filter(node => node);

                if (finalContentNodes.length === 0 && (!contentNodes || contentNodes.length === 0)) {
                    console.warn(`章节 "${displayChapterTitle}" 最终内容节点和原始内容都为空，但仍尝试发布（可能仅标题）或依赖API处理。`);
                }
                 if (finalContentNodes.length === 0 && chapters.length ===1){
                     console.warn(`章节 "${displayChapterTitle}" 内容为空，且是唯一章节，可能发布失败。`);
                 }

                if (finalContentNodes.length === 0 && (!contentNodes || contentNodes.length === 0)) {
                    console.warn(`章节 "${displayChapterTitle}" 最终内容节点为空，跳过发布。`);
                     if (linksContainer) {
                        const p = document.createElement('p');
                        p.textContent = `章节 "${displayChapterTitle}": 内容为空或转换失败，已跳过。`;
                        linksContainer.appendChild(p);
                    }
                    errorCount++;
                    continue;
                }
                
                console.log(`为章节 "${displayChapterTitle}" 生成了 ${finalContentNodes.length} 个 Telegra.ph 节点 (包含导航)。`);

                // 使用构造好的 titleForTelegraphApi 调用 createTelegraphPage
                const pageResult = await createTelegraphPage(accessToken, titleForTelegraphApi, finalContentNodes);

                if (pageResult && !pageResult.error && pageResult.url) {
                    successCount++;
                    const actualUrl = pageResult.url; // Telegra.ph 返回的实际 URL
                    console.log(`章节 "${displayChapterTitle}" (API title: "${titleForTelegraphApi}") 发布成功: ${actualUrl}`);
                    // publishedPagesInfo 存储时，title 可以用 displayChapterTitle 或 originalFileName，url 是实际的
                    publishedPagesInfo.push({ title: displayChapterTitle, url: actualUrl, originalFileName: originalFileName });
                    
                    if (linksContainer) {
                        const p = document.createElement('p');
                        p.innerHTML = `章节 "${displayChapterTitle}" 发布成功: <a href="${actualUrl}" target="_blank">${actualUrl}</a> (预测: ${predictedUrls[i]})`;
                        linksContainer.appendChild(p);
                    }
                } else {
                    errorCount++;
                    const errorMessage = pageResult && pageResult.message ? pageResult.message : '未知错误';
                    console.error(`章节 "${displayChapterTitle}" (API title: "${titleForTelegraphApi}") 发布失败:`, errorMessage, pageResult ? pageResult.details : '');
                    if (linksContainer) {
                        const p = document.createElement('p');
                        p.style.color = 'red';
                        p.innerHTML = `章节 "${displayChapterTitle}" 发布失败: ${errorMessage}`;
                        linksContainer.appendChild(p);
                    }
                }
            } catch (error) {
                errorCount++;
                console.error(`发布章节 "${displayChapterTitle}" (API title: "${titleForTelegraphApi}") 时发生严重错误:`, error);
                if (linksContainer) {
                    const p = document.createElement('p');
                    p.style.color = 'red';
                    p.innerHTML = `章节 "${displayChapterTitle}" 发布时发生严重错误: ${error.message}`;
                    linksContainer.appendChild(p);
                }
            }
            // 短暂延时避免触发API速率限制
            if (i < chapters.length - 1) { // 避免在最后一个章节后也延迟
                statusArea.innerHTML = `第 ${i + 1} 章处理完毕，准备发布下一章... (等待 1 秒)`;
                await sleep(1000); // 延迟1秒
            }
        }

        // --- 创建目录页面 ---
        if (publishedPagesInfo.length > 0) {
            statusArea.innerHTML = '所有章节处理完毕，正在创建目录页面...';
            const epubFileName = epubFileInput.files[0] ? epubFileInput.files[0].name.replace(/\.epub$/i, '') : 'EPUB';
            const tocTitle = `${epubFileName} - 目录`;
            const tocNodes = [{ tag: 'h3', children: [tocTitle] }];
            const ulChildren = publishedPagesInfo.map(page => ({
                tag: 'li',
                children: [{
                    tag: 'a',
                    attrs: { href: page.url },
                    children: [page.originalFileName || page.title] // 优先使用原始文件名
                }]
            }));
            tocNodes.push({ tag: 'ul', children: ulChildren });

            try {
                const tocPageResult = await createTelegraphPage(accessToken, tocTitle, tocNodes);
                if (tocPageResult && !tocPageResult.error && tocPageResult.url) {
                    console.log(`目录页面创建成功: ${tocPageResult.url}`);
                    if (linksContainer) {
                        const p = document.createElement('p');
                        p.style.fontWeight = 'bold';
                        p.innerHTML = `目录页面: <a href="${tocPageResult.url}" target="_blank">${tocPageResult.url}</a>`;
                        // 将目录链接放在最前面
                        linksContainer.insertBefore(p, linksContainer.firstChild);
                    }
                    statusArea.innerHTML = `所有章节和目录发布完成！<br>成功: ${successCount} 章。<br>失败/跳过: ${errorCount} 章。<br><strong>目录链接已生成。</strong>`;
                } else {
                    console.error('目录页面创建失败:', tocPageResult ? tocPageResult.message : '未知错误');
                    statusArea.innerHTML = `章节发布完成，但目录页面创建失败: ${tocPageResult ? tocPageResult.message : '未知错误'}`;
                    if (linksContainer) {
                        const p = document.createElement('p');
                        p.style.color = 'red';
                        p.textContent = `目录页面创建失败: ${tocPageResult ? tocPageResult.message : '未知错误'}`;
                        linksContainer.appendChild(p);
                    }
                }
            } catch (error) {
                console.error('创建目录页面时发生严重错误:', error);
                statusArea.innerHTML = `章节发布完成，但创建目录页面时发生严重错误: ${error.message}`;
                 if (linksContainer) {
                    const p = document.createElement('p');
                    p.style.color = 'red';
                    p.textContent = `创建目录页面时发生严重错误: ${error.message}`;
                    linksContainer.appendChild(p);
                }
            }
        } else {
             statusArea.innerHTML = `所有章节处理完毕。<br>成功发布: ${successCount} 章。<br>失败或跳过: ${errorCount} 章。<br>没有成功发布的章节，无法创建目录。`;
        }
        
        // 更新最终状态信息
        let finalMessage = `发布流程结束。<br>成功发布章节: ${successCount}。<br>失败或跳过章节: ${errorCount}。`;
        if (publishedPagesInfo.length > 0 && linksContainer.querySelector('a[href*="telegra.ph"]')) { // 检查是否有目录链接
             const tocLinkElement = linksContainer.querySelector('p > a[href*="telegra.ph"]'); // 更精确地找到目录链接
             if (tocLinkElement && tocLinkElement.closest('p').style.fontWeight === 'bold') { // 确保是目录链接
                finalMessage += `<br><strong>主要目录链接已在上方显示。</strong> 各章节链接可在目录页或下方查看。`;
             } else {
                finalMessage += `<br>请在上方查看已发布的链接。`;
             }
        } else if (successCount > 0) {
            finalMessage += `<br>请在上方查看已发布的链接。`;
        }
        statusArea.innerHTML = finalMessage;
        console.log(`发布完成。成功: ${successCount}, 失败/跳过: ${errorCount}, 已发布页面信息:`, publishedPagesInfo);
    }

    function htmlToTelegraphNodes(htmlString, chapterFileName = '未知章节') {
        console.log(`开始转换HTML到Telegra.ph节点: ${chapterFileName}`);
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const body = doc.body;
        const nodes = [];

        if (!body) {
            console.warn(`章节 "${chapterFileName}" 解析后没有 body 元素。`);
            // 尝试直接从字符串创建单个 <p> 节点（如果内容是纯文本）
            // 但这可能不安全，因为 htmlString 可能仍然是复杂的 HTML
            // 暂时返回空数组
            return [];
        }

        // 辅助函数：递归转换 HTML 元素到 Telegra.ph Node
        function convertElementToNode(element) {
            const telegraphNode = {};
            let isValidTag = false;
            const tagName = element.nodeName.toLowerCase();
            
            // Telegra.ph 支持的标签
            const supportedTags = ['a', 'aside', 'b', 'blockquote', 'br', 'code', 'em', 'figcaption', 'figure', 'h3', 'h4', 'hr', 'i', 'iframe', 'img', 'li', 'ol', 'p', 'pre', 's', 'strong', 'u', 'ul', 'video'];

            if (supportedTags.includes(tagName)) {
                telegraphNode.tag = tagName;
                isValidTag = true;
            } else {
                // 对于不支持的标签，我们不创建该标签的节点，但会递归处理其子节点
                // 这些子节点（如果是文本或受支持的元素）将被添加到当前父节点的子节点列表中
                // 或者，如果它们是块级元素，可能会被扁平化处理
                // console.log(`不支持的标签: ${tagName}, 将处理其子节点。`);
            }

            // 处理属性 (attrs) - 仅支持 href 和 src
            const attrs = {};
            if (element.attributes) {
                for (let i = 0; i < element.attributes.length; i++) {
                    const attr = element.attributes[i];
                    if (attr.name === 'href' && tagName === 'a') {
                        attrs.href = attr.value;
                    } else if (attr.name === 'src' && (tagName === 'img' || tagName === 'iframe' || tagName === 'video')) {
                        if (tagName === 'img') {
                            if (attr.value.startsWith('/file/')) { // Telegra.ph 要求图片先上传
                                attrs.src = attr.value;
                            } else {
                                // 策略：如果 img src 无效，则不生成此 img 节点，或生成一个占位符
                                // console.warn(`图片 ${attr.value} 的 src 无效，将忽略此图片。`);
                                isValidTag = false; // 标记此img节点无效
                            }
                        } else { // iframe, video
                            attrs.src = attr.value;
                        }
                    }
                    // Telegra.ph API 文档没有明确指出其他属性是否支持，为安全起见，只包含 href 和 src
                }
            }
            if (Object.keys(attrs).length > 0 && isValidTag) {
                telegraphNode.attrs = attrs;
            } else if (Object.keys(attrs).length > 0 && !isValidTag && tagName === 'img') {
                // 如果是img且src无效，即使有其他属性也不应创建attrs
            }


            // 处理子节点 (children)
            const children = [];
            if (element.childNodes && element.childNodes.length > 0) {
                element.childNodes.forEach(child => {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        const childNodes = convertElementToNode(child); // 可能返回单个节点或节点数组
                        if (childNodes) {
                            if (Array.isArray(childNodes)) {
                                children.push(...childNodes.filter(cn => cn)); // 过滤掉 null 或 undefined
                            } else {
                                children.push(childNodes);
                            }
                        }
                    } else if (child.nodeType === Node.TEXT_NODE) {
                        const textContent = child.textContent;
                        // Telegra.ph 似乎会自动处理空白，但我们可以先 trim 一下
                        // 重要的是，即使是空字符串，如果它是元素间的唯一内容，也可能需要保留以形成结构
                        // 但如果只是纯粹的空白节点，可以考虑忽略
                        if (textContent.trim()) {
                             children.push(textContent); // Telegra.ph 接受字符串作为子节点
                        } else if (element.childNodes.length === 1 && !textContent.trim()){
                            // 如果一个元素只包含一个空白文本节点，则忽略它
                        } else if (textContent) { // 保留包含换行符等的文本节点
                            children.push(textContent);
                        }
                    }
                });
            }

            if (children.length > 0 && isValidTag) {
                telegraphNode.children = children;
            } else if (children.length > 0 && !isValidTag) {
                // 如果标签本身不被支持，但它有子节点，则返回其子节点（扁平化）
                // 这有助于提取嵌套在不支持标签内的有效内容
                return children.length === 1 ? (children[0] || null) : children.filter(c => c);
            }


            // 只有当标签被支持且至少有标签名（或有子节点/属性来证明其非空）时，才返回节点
            if (isValidTag) {
                 // 确保 br 和 hr 这种自闭合标签即使没有 children 也被正确处理
                if ((tagName === 'br' || tagName === 'hr') && !telegraphNode.children) {
                    return { tag: tagName };
                }
                // 对于其他标签，如果它没有子节点也没有属性，它可能是无意义的空标签，可以考虑不返回
                // 例如 <p></p> 应该返回 {tag: 'p'} 而不是 null
                // Telegra.ph 接受 {tag: 'p'} 这样的空元素
                if (telegraphNode.children || telegraphNode.attrs || Object.keys(telegraphNode).length > 0) {
                     return telegraphNode;
                }
            }
            
            return null; // 对于完全不支持或处理后为空的节点
        }

        body.childNodes.forEach(childElement => {
            if (childElement.nodeType === Node.ELEMENT_NODE) {
                const convertedNodes = convertElementToNode(childElement);
                if (convertedNodes) {
                    if (Array.isArray(convertedNodes)) {
                        nodes.push(...convertedNodes.filter(cn => cn));
                    } else {
                        nodes.push(convertedNodes);
                    }
                }
            } else if (childElement.nodeType === Node.TEXT_NODE) {
                const text = childElement.textContent.trim();
                if (text) {
                    // 顶层文本节点应该用 <p> 包裹
                    nodes.push({ tag: 'p', children: [text] });
                }
            }
        });
        
        console.log(`转换完成: ${chapterFileName}, 生成 ${nodes.length} 个根节点。`, nodes);
        return nodes.filter(n => n); // 再次过滤以防万一
    }

    async function createTelegraphPage(accessToken, title, contentNodes, returnContent = false) {
        console.log(`准备创建 Telegra.ph 页面: "${title}"`);
        if (!contentNodes || contentNodes.length === 0) {
            console.warn(`内容节点为空，无法为章节 "${title}" 创建页面。`);
            // throw new Error(`内容为空，无法为章节 "${title}" 创建页面。`); // 或者返回特定错误对象
            return { error: true, message: `内容为空，无法为章节 "${title}" 创建页面。` };
        }

        const body = {
            access_token: accessToken,
            title: title,
            content: JSON.stringify(contentNodes), // Telegra.ph API 要求 content 是 JSON string of Node objects
            return_content: returnContent
        };

        try {
            const response = await fetch(`${TELEGRAPH_API_URL}/createPage`, {
                method: 'POST',
                // Telegra.ph API 通常使用 application/x-www-form-urlencoded 或 multipart/form-data
                // 根据官方文档 "Content (JSON string)"，应该使用 FormData
                body: new URLSearchParams(body) // 使用 application/x-www-form-urlencoded
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error ${response.status}` }));
                console.error(`Telegra.ph API createPage 请求失败 for "${title}":`, response.status, errorData);
                return { error: true, message: `Telegra.ph API 错误 (createPage for "${title}"): ${errorData.error || `HTTP ${response.status}`}`, details: errorData };
            }

            const data = await response.json();

            if (data.ok && data.result) {
                console.log(`Telegra.ph 页面 "${title}" 创建成功:`, data.result.url);
                return data.result; // { path, url, title, description, author_name?, author_url?, image_url?, views, can_edit? }
            } else {
                const errorMessage = data.error || `createPage API 响应成功但未返回有效结果 for "${title}"。`;
                console.error('Telegra.ph API createPage 逻辑错误:', errorMessage, data);
                return { error: true, message: `Telegra.ph API 逻辑错误 (createPage for "${title}"): ${errorMessage}`, details: data };
            }
        } catch (error) {
            console.error(`调用 Telegra.ph createPage API 时发生网络或解析错误 for "${title}":`, error);
            return { error: true, message: `调用 Telegra.ph createPage API 失败 for "${title}"。 (${error.message})` };
        }
    }

    // 可选：用于验证 access_token 的函数 (如果需要)
    // async function getTelegraphAccountInfo(accessToken, fields = ["short_name", "page_count"]) {
    //     try {
    //         const params = new URLSearchParams({ access_token: accessToken });
    //         if (fields && fields.length > 0) {
    //             params.append('fields', JSON.stringify(fields));
    //         }
    //         const response = await fetch(`${TELEGRAPH_API_URL}/getAccountInfo?${params.toString()}`);
    //         const data = await response.json();
    //         if (data.ok) {
    //             console.log('Telegra.ph getAccountInfo 成功:', data.result);
    //             return data.result;
    //         } else {
    //             console.warn('Telegra.ph getAccountInfo 失败:', data.error);
    //             return null; // Token 可能无效
    //         }
    //     } catch (error) {
    //         console.error('调用 Telegra.ph getAccountInfo API 时出错:', error);
    //         return null;
    //     }
    // }

});