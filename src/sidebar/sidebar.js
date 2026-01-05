// 获取字体URL
const fanwoodFontUrl = chrome.runtime.getURL("src/fonts/Fanwood.otf");
// 使用replace处理文件名中的空格
const fanwoodBoldFontUrl = chrome.runtime.getURL("src/fonts/Fanwood_Bold.otf").replace(/ /g, "%20");
const fanwoodItalicFontUrl = chrome.runtime.getURL("src/fonts/Fanwood_Italic.otf").replace(/ /g, "%20");
// 获取LXGWWenKai字体URL
const lxgwWenKaiFontUrl = chrome.runtime.getURL("src/fonts/LXGWWenKaiGBLite-Regular.ttf");

// 添加字体样式
const fontStyle = document.createElement('style');
fontStyle.textContent = `
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
@font-face {
    font-family: 'LXGWWenKai';
    src: url('${lxgwWenKaiFontUrl}') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
  /* 全局字体设置 */
  body {
    font-family: "Fanwood","LXGWWenKai", "PingFang SC","Segoe UI Variable Display", "Segoe UI", Helvetica, "Microsoft YaHei", "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol" !important;
    transition: opacity 0.168s ease-in-out;
  }

  /* 适配header样式 */
  .header {
    font-family: 'LXGWWenKai';
    padding: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    font-size: 16px;
    position: sticky;
    top: 0;
    z-index: 100;
    flex-shrink: 0;
  }

  body:not(.dark-theme) .header {
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
    color: #333;
  }

  .dark-theme .header {
    background: #333;
    border-bottom: 1px solid #444;
    color: #eee;
  }

  .close-btn {
    cursor: pointer;
    font-size: 18px;
    padding: 0 8px;
    z-index: 1;
  }

  .close-btn:hover {
    color: #ff4444;
  }

  /* 适配sidebar-content样式 */
  .sidebar-content {
    padding: 15px;
    overflow-y: auto;
    font-size: 14px;
    flex-grow: 1;
    max-height: calc(100vh - 40px);
  }

  body:not(.dark-theme) .sidebar-content {
    background-color: #fafafa;
    color: #333;
  }

  .dark-theme .sidebar-content {
    background-color: #2a2a2a;
    color: #eee;
  }

  .sentence-display {
    margin-bottom: 10px;
    padding: 10px;
    border-radius: 10px;
    line-height: 1.3;
    font-size: 17px;
    font-family: 'Fanwood', serif !important;
    font-style: italic !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body:not(.dark-theme) .sentence-display {
    background: #e3e3e3;
  }

  .dark-theme .sentence-display {
    background: #3a3a3a;
  }

  .analysis-result {
    padding: 10px;
    font-size: 16px;
    border-radius: 10px;
    line-height: 1.1;
    white-space: pre-wrap;
  }



  /* 使用更通用的选择器为英文文本设置Fanwood字体和特定字号 */
  .analysis-result {
    /* 基本字体设置 */
    font-family: "LXGWWenKai", "PingFang SC", sans-serif;
    font-size: 16px;
     color: #000000;
  }

  /* 为英文文本设置Fanwood字体和更大字号 */
  .analysis-result .english-text,
  .analysis-result em,
  .analysis-result i,
  .analysis-result span[lang="en"],
  .analysis-result p[lang="en"],
  .analysis-result div[lang="en"] {
    font-family: "Fanwood", serif !important;
    font-size: 18px !important;
  }



 .dark-theme .analysis-result {

    color:rgb(255, 255, 255);
}

 body:not(.dark-theme) .analysis-result {

  color:rgb(0, 0, 0);
}


  /* 添加一个通用类，可以手动添加到需要使用Fanwood字体的元素上 */
  .dark-theme .analysis-result .fanwood-text {
    font-family: "Fanwood", serif !important;
    font-size: 21px !important;
    color: #148bf3;
  }

  body:not(.dark-theme) .analysis-result .fanwood-text {
    font-family: "Fanwood", serif !important;
    font-size: 21px !important;
    color: #148bf3;
  }

  /* 确保strong元素使用Fanwood Bold字体 */
  .analysis-result strong,
  .fanwood-text strong {
    font-family: "Fanwood","LXGWWenKai", serif !important;
    font-weight: bold !important;
    font-size: 22px !important;
  }

  /* Markdown样式 */
  /* Markdown样式 */
  .analysis-result h1 {
    font-size: 22px;
    margin: 15px 0 10px 0;
     font-family: 'LXGWWenKai';
  }

  .analysis-result h2 {
    font-size: 18px;
    margin: 12px 0 8px 0;
     font-family: 'LXGWWenKai';
  }

  .analysis-result h3 {
    font-size: 16px;
    margin: 10px 0 6px 0;
     font-family: 'LXGWWenKai';
  }
  .analysis-result pre {
    background: rgba(0,0,0,0.05);
    padding: 10px;
    border-radius: 5px;
    overflow-x: auto;
  }

  .analysis-result code {
    font-family: monospace;
    background: rgba(0,0,0,0.05);
    padding: 2px 4px;
    border-radius: 3px;
  }

  .analysis-result blockquote {
    border-left: 4px solid #ccc;
    margin: 8px 0;
    padding: 0 10px;
    color: #666;
  }

  .analysis-result li {
    margin: 5px 0 5px 20px;
  }

  .analysis-result a {
    text-decoration: underline;
  }

  .dark-theme .analysis-result code,
  .dark-theme .analysis-result pre {
    background: rgba(255,255,255,0.1);
  }

  .dark-theme .analysis-result blockquote {
    border-left-color: #555;
    color: #aaa;
  }

  .dark-theme .analysis-result a {
    color: #8ab4f8;
  }

  body:not(.dark-theme) .analysis-result {
    background:#e3e3e3;
  }

  .dark-theme .analysis-result {
    background: #3a3a3a;
  }
`;
document.head.appendChild(fontStyle);

// 加载Fanwood字体（常规）
const fanwoodFont = new FontFace('Fanwood', `url('${fanwoodFontUrl}')`, { weight: 'normal', style: 'normal' });
fanwoodFont.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  console.log('Sidebar.js: Fanwood常规字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('Sidebar.js: Fanwood常规字体加载失败:', error);
});

// 加载Fanwood_Bold字体（粗体）
const fanwoodBoldFont = new FontFace('Fanwood', `url('${fanwoodBoldFontUrl}')`, { weight: 'bold', style: 'normal' });
fanwoodBoldFont.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  console.log('Sidebar.js: Fanwood粗体字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('Sidebar.js: Fanwood粗体字体加载失败:', error);
});

// 加载Fanwood_Italic字体（斜体）
const fanwoodItalicFont = new FontFace('Fanwood', `url('${fanwoodItalicFontUrl}')`, { weight: 'normal', style: 'italic' });
fanwoodItalicFont.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  console.log('Sidebar.js: Fanwood斜体字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('Sidebar.js: Fanwood斜体字体加载失败:', error);
});

// 加载LXGWWenKai字体
const lxgwWenKaiFont = new FontFace('LXGWWenKai', `url('${lxgwWenKaiFontUrl}')`);
lxgwWenKaiFont.load().then(function(loadedFont) {
  document.fonts.add(loadedFont);
  console.log('Sidebar.js: LXGWWenKai字体加载成功:', loadedFont);
}).catch(function(error) {
  console.error('Sidebar.js: LXGWWenKai字体加载失败:', error);
});

// 全局变量：保存当前 AI 回复的 span 元素
let currentAIResponseSpan = null;

// 全局变量：保存对话历史
let conversationHistory = [];
let isProcessing = false;
let currentSentence = '';

// 当文档加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  // 添加一个变量来跟踪iframe是否已加载
  let waifuIframeLoaded = false;

  // 检查侧栏独立的暗黑模式设置
  chrome.storage.local.get('sidebarDarkTheme', function(result) {
    const isDark = result.sidebarDarkTheme || false;
    if (isDark) {
      document.body.classList.add('dark-theme');
    }
  });

  // 主题切换按钮事件
  document.querySelector('.theme-toggle-btn').addEventListener('click', function() {
    const isDark = document.body.classList.toggle('dark-theme');
    // 保存侧栏独立的主题设置
    chrome.storage.local.set({ sidebarDarkTheme: isDark }, function() {
      console.log('侧栏主题已切换为:', isDark ? '暗色' : '亮色');
    });
  });

  // 关闭按钮事件
  document.querySelector('.close-btn').addEventListener('click', function() {
    window.close();
  });

  // 添加Waifu按钮事件
  document.querySelector('.waifu-btn').addEventListener('click', function() {
    // 获取Waifu URL
    chrome.storage.local.get('waifuUrl', function(result) {
      const waifuUrl = result.waifuUrl || '';
      if (waifuUrl) {
        // 只有在首次点击或iframe未加载时才设置src
        if (!waifuIframeLoaded) {
          document.getElementById('waifu-iframe').src = waifuUrl;
          waifuIframeLoaded = true;
        }
        // 显示Waifu容器
        document.querySelector('.waifu-container').style.display = 'flex';
      } else {
        alert('请先在设置中配置Waifu URL');
      }
    });
  });

  // 添加关闭Waifu的事件
  document.querySelector('.close-waifu').addEventListener('click', function() {
    document.querySelector('.waifu-container').style.display = 'none';
    // 注意：不再清空iframe内容，以保持状态
  });

  // 添加设置按钮事件
  document.querySelector('.settings-btn').addEventListener('click', function() {
    // 创建设置iframe容器（如果不存在）
    let settingsContainer = document.querySelector('.settings-iframe');
    if (!settingsContainer) {
      settingsContainer = document.createElement('div');
      settingsContainer.className = 'settings-iframe';

      // 添加关闭按钮
      const closeBtn = document.createElement('div');
      closeBtn.className = 'close-settings';
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('click', function() {
        settingsContainer.style.display = 'none';
      });

      // 创建iframe
      const iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('src/popup/popup.html');

      // 添加到容器
      settingsContainer.appendChild(closeBtn);
      settingsContainer.appendChild(iframe);
      document.body.appendChild(settingsContainer);
    }

    // 显示设置iframe
    settingsContainer.style.display = 'block';
  });

  // 添加输入框和发送按钮的事件处理
  const inputField = document.querySelector('.sidebar-input');
  const sendBtn = document.querySelector('.sidebar-send-btn');

  // 发送消息的函数
  const sendMessage = async () => {
    const userMessage = inputField.value.trim();
    if (!userMessage || isProcessing) return;

    isProcessing = true;
    sendBtn.disabled = true;
    inputField.disabled = true;

    // 添加用户消息到分析结果
    const analysisResult = document.querySelector('.analysis-result');
    analysisResult.innerHTML += `<div class="user-message"><strong>你:</strong> ${userMessage}</div>`;
    analysisResult.scrollTop = analysisResult.scrollHeight;

    // 保存到对话历史
    conversationHistory.push({ role: 'user', content: userMessage });

    // 清空输入框
    inputField.value = '';

    // 调用 AI 进行对话
    try {
      await streamSidebarChatAnalysis(currentSentence, conversationHistory, analysisResult);
    } catch (error) {
      console.error('对话分析出错:', error);
      analysisResult.innerHTML += `<div class="error-message">分析出错: ${error.message}</div>`;
    }

    isProcessing = false;
    sendBtn.disabled = false;
    inputField.disabled = false;
    inputField.focus();
  };

  // 发送按钮点击事件
  sendBtn.addEventListener('click', sendMessage);

  // 输入框回车事件
  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
});

// 格式化内容，添加简单的Markdown解析
function formatContent(content) {
  if (!content) return '';


  // 为拉丁字母文本添加特定样式
  // 匹配拉丁字母单词、短语或句子（包括标点符号和特殊字符）
  // 包含德语、法语、西班牙语、意大利语等常见拉丁字母语言的特殊字符
  content = content.replace(/([a-zA-ZäöüßÄÖÜéèêëàâîïôûùçñáíóúÉÈÊËÀÂÎÏÔÛÙÇÑÁÍÓÚ][a-zA-ZäöüßÄÖÜéèêëàâîïôûùçñáíóúÉÈÊËÀÂÎÏÔÛÙÇÑÁÍÓÚ\s\.,;:!?'"()\-]*[a-zA-ZäöüßÄÖÜéèêëàâîïôûùçñáíóúÉÈÊËÀÂÎÏÔÛÙÇÑÁÍÓÚ\.,;:!?'"()\-])/g, '<span class="fanwood-text">$1</span>');
  // 替换Markdown语法
  content = content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/`(.*?)`/g, '<code>$1</code>');

  return content;
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateSidebar") {
    const { word, sentence, stream } = message.data;

    // 如果句子改变，清空对话历史
    if (currentSentence && currentSentence !== sentence) {
      conversationHistory = [];
      console.log('[Sidebar] 句子改变，清空对话历史');
    }

    // 保存当前句子
    currentSentence = sentence;

    // 更新句子显示
    document.querySelector('.sentence-display').textContent = sentence;

    // 清空分析结果区域
    const analysisResult = document.querySelector('.analysis-result');
    analysisResult.innerHTML = '';

    // 如果是流式请求
    if (stream) {
      analysisResult.textContent = '分析中...';

      // 告诉发送者我们已准备好接收流式数据
      sendResponse({ status: "ready" });
    }
  } else if (message.action === "streamUpdate") {
    const { content, isFirstChunk } = message.data;
    console.log('[Sidebar] 收到 streamUpdate:', { content, isFirstChunk, currentAIResponseSpan });

    const analysisResult = document.querySelector('.analysis-result');

    if (currentAIResponseSpan) {
      if (isFirstChunk) {
        currentAIResponseSpan.innerHTML = '';
      }
      currentAIResponseSpan.innerHTML += formatContent(content);
    } else {
      console.log('[Sidebar] currentAIResponseSpan 为空，创建临时 span 元素');
      
      if (analysisResult) {
        const aiResponseDiv = document.createElement('div');
        aiResponseDiv.className = 'ai-message';
        aiResponseDiv.innerHTML = '<strong>AI:</strong> ';
        analysisResult.appendChild(aiResponseDiv);

        currentAIResponseSpan = document.createElement('span');
        aiResponseDiv.appendChild(currentAIResponseSpan);

        currentAIResponseSpan.innerHTML += formatContent(content);
        console.log('[Sidebar] 已创建并设置 currentAIResponseSpan:', currentAIResponseSpan);
      } else {
        console.error('[Sidebar] 无法找到 .analysis-result 元素');
      }
    }

    if (analysisResult) {
      analysisResult.scrollTop = analysisResult.scrollHeight;
    }

    sendResponse({ status: "updated" });
  } else if (message.action === "streamComplete") {
    console.log('[Sidebar] 收到 streamComplete:', message.data);
    
    // 将 AI 回复添加到对话历史
    if (currentAIResponseSpan) {
      const aiResponseText = currentAIResponseSpan.textContent || currentAIResponseSpan.innerText;
      if (aiResponseText) {
        conversationHistory.push({ role: 'assistant', content: aiResponseText });
        console.log('[Sidebar] 已添加 AI 回复到对话历史:', aiResponseText.substring(0, 50) + '...');
      }
    }
    
    // 清理流式上下文
    currentAIResponseSpan = null;
    
    sendResponse({ status: "completed" });
  }

  return true; // 保持消息通道开放以进行异步响应
});

// 辅助函数：检测是否使用Orion模式
async function isOrionMode() {
  try {
    const response = await chrome.runtime.sendMessage({ action: "getAIConfig" });
    const orionTTSEnabled = response?.config?.useOrionTTS;
    return orionTTSEnabled === true;
  } catch (error) {
    console.error('[isOrionMode] 获取useOrionTTS设置失败:', error);
    return false;
  }
}

// 辅助函数：获取存储值
function getStorageValue(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, function(result) {
      resolve(result[key]);
    });
  });
}

// 新增：侧边栏对话分析函数
async function streamSidebarChatAnalysis(sentence, conversationHistory, analysisResult) {
  // 获取用户自定义的 AI 提示词
  chrome.storage.local.get('aiConfig', async function(result) {
    let customChatPrompt = result?.aiConfig?.chatPrompt || '请根据以下句子和对话历史回答用户的问题：\n\n句子：{sentence}\n\n对话历史：{history}\n\n用户问题：{question}';
    
    // 构建对话历史字符串
    const historyStr = conversationHistory.map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`).join('\n');
    
    // 获取最后一个用户问题
    const lastUserMessage = conversationHistory[conversationHistory.length - 1];
    const question = lastUserMessage ? lastUserMessage.content : '';
    
    let promptText = customChatPrompt
      .replace('{sentence}', sentence)
      .replace('{history}', historyStr)
      .replace('{question}', question);

    // 构建完整的消息数组（包含对话历史）
    const messages = [
      {
        role: "system",
        content: `你是一个语言学习助手，专门帮助用户理解句子中的单词和语法。当前句子是：${sentence}`
      },
      ...conversationHistory,
      {
        role: "user",
        content: promptText
      }
    ];

    // 添加 AI 回复的占位符
    const aiResponseDiv = document.createElement('div');
    aiResponseDiv.className = 'ai-message';
    aiResponseDiv.innerHTML = '<strong>AI:</strong> ';
    analysisResult.appendChild(aiResponseDiv);
    analysisResult.scrollTop = analysisResult.scrollHeight;

    const responseContentSpan = document.createElement('span');
    aiResponseDiv.appendChild(responseContentSpan);

    // 保存当前 AI 回复的 span 元素到全局变量
    currentAIResponseSpan = responseContentSpan;
    console.log('[Sidebar] 已设置 currentAIResponseSpan:', currentAIResponseSpan);

    // 检测是否使用Orion模式
    const useOrionMode = await isOrionMode();

    if (useOrionMode) {
      // Orion模式使用原来的实现方式（直接在content script中处理流式数据）
      useLegacySidebarChatAnalysis(messages, responseContentSpan, analysisResult);
    } else {
      // 非Orion模式使用background实现方式
      useBackgroundSidebarChatAnalysis(messages, responseContentSpan, analysisResult);
    }
  });
}

// Orion模式的侧边栏对话分析实现方式
function useLegacySidebarChatAnalysis(messages, responseContentSpan, analysisResult) {
  // 直接在content script中处理AI请求和流式数据
  chrome.runtime.sendMessage({ action: "getAIConfig" }, (response) => {
    const config = response.config || {};

    // 检查 API Key 是否配置
    if (!config.apiKey) {
      responseContentSpan.innerHTML = 'AI API Key 或 Token 未配置，请在插件设置中填写';
      return;
    }

    fetch(config.apiBaseURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
        "x-gemini-legacy-support": "true",
      },
      body: JSON.stringify({
        model: config.apiModel,
        messages: messages,
        stream: true,
        temperature: 1
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // 将 AI 回复添加到对话历史
              const aiResponseText = responseContentSpan.textContent || responseContentSpan.innerText;
              if (aiResponseText) {
                conversationHistory.push({ role: 'assistant', content: aiResponseText });
                console.log('[Sidebar] Orion模式已添加 AI 回复到对话历史:', aiResponseText.substring(0, 50) + '...');
              }
              return;
            }

            const chunk = new TextDecoder().decode(value);
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') continue;

                try {
                  const data = JSON.parse(dataStr);
                  const content = data.choices?.[0]?.delta?.content;

                  if (content) {
                    responseContentSpan.innerHTML += formatContent(content);
                    analysisResult.scrollTop = analysisResult.scrollHeight;
                  }
                } catch (e) {
                  console.log("解析流式数据失败:", e);
                }
              }
            }
          }
        } catch (error) {
          console.error("流式处理错误:", error);
          responseContentSpan.innerHTML += ` 错误: ${error.message}`;
        }
      };

      processStream();
    })
    .catch(err => {
      console.error('对话分析失败:', err);
      responseContentSpan.innerHTML += ` 错误: ${err.message}`;
    });
  });
}

// 标准模式的侧边栏对话分析实现方式（通过background处理）
function useBackgroundSidebarChatAnalysis(messages, responseContentSpan, analysisResult) {
  console.log('[Sidebar] 开始 useBackgroundSidebarChatAnalysis, responseContentSpan:', responseContentSpan);

  // 设置流式处理的上下文
  window.currentStreamContext = {
    type: 'chat',
    element: responseContentSpan
  };

  // 通过background处理流式请求，添加 isSidebarRequest 标识
  chrome.runtime.sendMessage({
    action: "makeAIRequest",
    requestData: { stream: true, messages, isSidebarRequest: true }
  }, (response) => {
    console.log('[Sidebar] makeAIRequest 响应:', response);
    if (chrome.runtime.lastError) {
      console.error('发送AI请求失败:', chrome.runtime.lastError);
      responseContentSpan.innerHTML += ` 错误: ${chrome.runtime.lastError.message}`;
      return;
    }

    if (response.error) {
      console.error('AI请求错误:', response.error);
      responseContentSpan.innerHTML += ` 错误: ${response.error}`;
      return;
    }

    // background正在处理流式数据，等待streamUpdate消息
    console.log('侧边栏对话流式请求已启动，等待background发送数据');
  });
}