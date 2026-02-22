// =======================
// 修改后的 AI 语言检测函数：使用自定义提示词(如有配置)进行语言检测
// =======================
async function fetchLanguageDetection(word, sentence) {
  // 优化：优先检查本地缓存，避免云服务器查询延迟
  let existingDetails = null;
  let hasLanguage = false;

  // 1. 首先检查本地缓存（最快）
  if (highlightManager?.wordDetailsFromDB) {
    existingDetails = highlightManager.wordDetailsFromDB[word.toLowerCase()];
    if (existingDetails && existingDetails.language && existingDetails.language !== 'auto') {
      hasLanguage = true;
      console.log("本地缓存中存在语言", existingDetails.language);
      return existingDetails.language;
    }
  }

  // 2. 如果本地缓存没有，再查询数据库（可能触发云服务器请求）
  try {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, resolve);
    });
    existingDetails = response?.details;

    if (existingDetails && existingDetails.language && existingDetails.language !== 'auto') {
      hasLanguage = true;
      console.log("数据库中存在语言", existingDetails.language);
      return existingDetails.language;
    }
  } catch (error) {
    console.log("获取数据库语言信息失败，继续AI检测:", error);
  }

  console.log("数据库中不存在语言，开始AI检测");
  hasLanguage = false;

  // 获取 AI 配置
  const result = await new Promise(resolve =>
    chrome.storage.local.get('aiConfig', resolve)
  );

  // 构建提示词
  let customPrompt = result?.aiConfig?.aiLanguageDetectionPrompt;
  let promptText = customPrompt
    ? customPrompt.replace('{sentence}', sentence).replace('{word}', word)
    : `请判断以下句子中单词 '${word}' 在句子'${sentence}'中所使用的语言，仅返回ISO 639语言代码标准(如en, de, fr等)`;

  const messages = [{
    role: "user",
    content: promptText
  }];

  try {
    const data = await makeAIRequest({ word, sentence, messages });

    // const languageValue = (data.choices?.[0]?.message?.content || "auto").trim();

    // 检查 AI 请求是否成功并且返回了有效内容
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      console.log("AI语言检测请求成功，但未返回有效内容:", data);
      return false; // 如果没有有效内容，则返回 false
    }

    const languageValue = content.trim();





    if(!hasLanguage){

      console.log("写入单词数据库语言值", languageValue);
      // 确保等待消息处理完成
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: "ChangeWordLanguage",
            word: word,
            details: { language: languageValue }  // 修改为传递完整的details对象
          },
          (response) => {

            if (highlightManager && highlightManager.wordDetailsFromDB) {
              highlightManager.wordDetailsFromDB[word.toLowerCase()] = {
                ...highlightManager.wordDetailsFromDB[word.toLowerCase()],
                language: languageValue
              };
            }



            console.log("数据库写入响应:", response);
            resolve(response);
          }
        );
      });
    }

    console.log("即将写入数据库的语言值 languageValue:", languageValue);
    return languageValue.length > 7 ? "?" : languageValue;
  } catch (err) {
    console.error("语言检测失败", err);
    return false;
  }
}







// =======================
// 新增 AI 单词翻译函数：请求 AI 翻译句子中的单词
// =======================
function fetchAIWordTranslation(word, sentence) {
  return new Promise((resolve) => {
    // 检查是否已经在进行AI翻译，防止重复请求
    const translationKey = `${word.toLowerCase()}_${sentence}`;
    if (window.aiTranslationInProgress && window.aiTranslationInProgress.has(translationKey)) {
      console.log(`AI翻译已在进行中，跳过重复请求: ${word}`);
      resolve("翻译进行中...");
      return;
    }

    // 标记开始翻译
    if (!window.aiTranslationInProgress) {
      window.aiTranslationInProgress = new Set();
    }
    window.aiTranslationInProgress.add(translationKey);

    // 获取用户保存的 AI 配置，其中可能包含自定义的提示词 (aiPrompt)
    chrome.storage.local.get('aiConfig', function(result) {
      // 如果用户自定义的提示词存在，则使用，并将占位符替换为实际的句子和单词
      let customPrompt = result && result.aiConfig && result.aiConfig.aiPrompt;
      let promptText = customPrompt
                         ? customPrompt.replace('{sentence}', sentence).replace('{word}', word)
                         : `
# 角色
你是一位精通德语 日语 英语的翻译专家，擅长根据上下文精确判断并翻译单词或固定短语。

# 任务
根据提供的 [句子]，判断 [待翻译词] 在该语境下是作为单个单词还是固定短语的一部分，并严格按照指定格式返回其最贴切的中文翻译。

# 核心规则
1.  **短语优先**: 如果 [待翻译词] 在句子中是一个固定短语/习语的一部分，必须识别并翻译整个短语。
2.  **单词本义**: 如果 [待翻译词] 只是一个独立的单词（即使有引申义），则只翻译该单词。
3.  **禁止分析**: 绝对不要返回任何形式的分析、解释或语法说明。


# 输入
  句子：'${sentence}'
  单词：'${word}'

# 输出要求
- **当翻译短语时**: [完整短语]: [中文翻译]
- **当翻译单词时**: [中文翻译]

# 输出格式
- [完整短语]: [中文翻译]
- [中文翻译]
---

日语特别注意：日语待翻译词可能由于软件的分词逻辑导致错误，请在翻译时，以 [完整短语]: [中文翻译] 的形式，[完整短语]中，将你认为正确的完整分词放入其中。

`;
      const messages = [{
        role: "user",
        content: promptText
      }];

      makeAIRequest({ word, sentence, messages })
        .then(data => {
          let aiTranslation = data.choices?.[0]?.message?.content || "暂无翻译";
          console.log("AI翻译结果", aiTranslation);
          aiTranslation = aiTranslation.trim();
          console.log("AI翻译结果 去除空格", aiTranslation);
          // 获取现有翻译列表进行比对
          chrome.runtime.sendMessage({ action: "getWordDetails", word: word }, (response) => {
            const existingTranslations = response?.details?.translations || [];

            // 检查 AI 翻译是否已存在
            const translationExists = existingTranslations.some(
              trans => trans.toLowerCase().trim() === aiTranslation.toLowerCase().trim()
            );

            // 是否自动添加AI释义，加入数据库
            chrome.storage.local.get('autoAddAITranslations', function(result) {
              console.log("自动添加AI释义状态已更新:", result.autoAddAITranslations);
              if(result.autoAddAITranslations){
                if (!translationExists && aiTranslation !== "暂无翻译" && aiTranslation !== "翻译失败") {
                  // 如果翻译不存在且有效，则添加翻译和例句
                  chrome.runtime.sendMessage({
                    action: "addTranslation",
                    word: word,
                    translation: aiTranslation
                  }, (response) => {
                    if (response && response.error) {
                      console.error("添加AI翻译失败:", response.error);
                    } else {


                      //添加本地缓存
                      addTranslationToLocalCache(word, aiTranslation);





                      console.log("添加AI翻译成功");
                    }
                  });
                }
              } else {


                // 自动添加未知单词AI释义
                chrome.storage.local.get('autoAddAITranslationsFromUnknown', function(result) {
                  console.log("自动添加未知单词AI释义状态已更新:", result.autoAddAITranslationsFromUnknown);
                  if(result.autoAddAITranslationsFromUnknown){

                    console.log("更新数据库 ：当前单词:", word, "是否需要更新状态:", ShouldAutoUpdateStatus);
                    if(ShouldAutoUpdateStatus || getTranslationCount(word) === 0){
                      if (!translationExists && aiTranslation !== "暂无翻译" && aiTranslation !== "翻译失败") {
                        chrome.runtime.sendMessage({
                          action: "addTranslation",
                          word: word,
                          translation: aiTranslation
                        }, (response) => {
                          if (response && response.error) {
                            console.error("添加AI翻译失败:", response.error);
                          } else {


                         //添加本地缓存
                      addTranslationToLocalCache(word, aiTranslation);
                            console.log("添加AI翻译成功");

                            // 触发自定义事件，通知tooltip刷新
                            window.dispatchEvent(new CustomEvent('aiTranslationAdded', {
                              detail: { word: word, translation: aiTranslation }
                            }));
                          }
                        });
                      }
                    }
                  }






                });




              }
            });
            // 返回 AI 翻译结果用于显示
            resolve(aiTranslation);
          });
        })
        .catch(err => {
          console.error("AI单词翻译失败", err);
          resolve("翻译失败");//不确定能不能改，好像有个判断是这个值
        })
        .finally(() => {
          // 清理翻译进行中的标记
          const translationKey = `${word.toLowerCase()}_${sentence}`;
          if (window.aiTranslationInProgress) {
            window.aiTranslationInProgress.delete(translationKey);
          }
        });
    });
  });
}

function addTranslationToLocalCache(word, translation) {
  //添加本地缓存
  if (!highlightManager || !highlightManager.wordDetailsFromDB) {
    console.warn("highlightManager或wordDetailsFromDB未初始化");
    return;
  }

  const lowerCaseWord = word.toLowerCase();

  // 如果单词不存在于缓存中，创建新的词条
  if (!highlightManager.wordDetailsFromDB[lowerCaseWord]) {
    highlightManager.wordDetailsFromDB[lowerCaseWord] = {
      word: word,
      translations: [],
      status: '1' // 新单词默认状态为1（学习中）
    };
  }

  // 如果translations数组不存在，创建新数组
  if (!highlightManager.wordDetailsFromDB[lowerCaseWord].translations) {
    highlightManager.wordDetailsFromDB[lowerCaseWord].translations = [];
  }

  // 添加新的翻译
  highlightManager.wordDetailsFromDB[lowerCaseWord].translations.push(translation);
  console.log("本地缓存已更新，添加AI释义", highlightManager.wordDetailsFromDB[lowerCaseWord]);

  // 触发爆炸窗口刷新（使用自定义事件）
  window.dispatchEvent(new CustomEvent('wordCacheUpdated', {
    detail: { word: lowerCaseWord }
  }));
}


// =======================
// 第二个AI单词翻译函数：请求第二个AI翻译句子中的单词
// =======================
function fetchAIWordTranslation2(word, sentence) {
  return new Promise((resolve) => {
    // 检查是否已经在进行AI翻译，防止重复请求
    const translationKey = `${word.toLowerCase()}_${sentence}_2`;
    if (window.aiTranslationInProgress && window.aiTranslationInProgress.has(translationKey)) {
      console.log(`第二个AI翻译已在进行中，跳过重复请求: ${word}`);
      resolve("翻译进行中...");
      return;
    }

    // 标记开始翻译
    if (!window.aiTranslationInProgress) {
      window.aiTranslationInProgress = new Set();
    }
    window.aiTranslationInProgress.add(translationKey);

    // 获取用户保存的 AI 配置，其中可能包含自定义的提示词 (aiPrompt2)
    chrome.storage.local.get('aiConfig', function(result) {
      // 如果用户自定义的提示词存在，则使用，并将占位符替换为实际的句子和单词
      let customPrompt = result && result.aiConfig && result.aiConfig.aiPrompt2;
      let promptText = customPrompt
                         ? customPrompt.replace('{sentence}', sentence).replace('{word}', word)
                         : `
# 角色
你是一位精通德语 日语 英语的语法解析专家，擅长根据上下文精确判断对应单词的解析精要

# 任务
根据提供的 [句子]，判断 [待解析词] 在该语境下的具体语法作用，形变规则等

# 核心规则
返回20字左右精要解析。

# 输入
句子：'${sentence}'
待解析词：'${word}'

# 输出格式
直接返回解析内容
`;
      const messages = [{
        role: "user",
        content: promptText
      }];

      makeAIRequest({ word, sentence, messages })
        .then(data => {
          let aiTranslation = data.choices?.[0]?.message?.content || "暂无翻译";
          console.log("第二个AI翻译结果", aiTranslation);
          aiTranslation = aiTranslation.trim();
          console.log("第二个AI翻译结果 去除空格", aiTranslation);

          // 注意：第二个AI翻译不会自动添加到数据库
          // 用户需要手动点击添加按钮

          // 返回 AI 翻译结果用于显示
          resolve(aiTranslation);
        })
        .catch(err => {
          console.error("第二个AI单词翻译失败", err);
          resolve("翻译失败");
        })
        .finally(() => {
          // 清理翻译进行中的标记
          const translationKey = `${word.toLowerCase()}_${sentence}_2`;
          if (window.aiTranslationInProgress) {
            window.aiTranslationInProgress.delete(translationKey);
          }
        });
    });
  });
}



// 新增通用 AI 请求函数 - 修改为通过 background script 执行，避免 Firefox CSP 限制
function makeAIRequest({ word, sentence, stream = false, messages, model = null, temperature = 1}) {
  return new Promise((resolve, reject) => {
    // 将 AI 请求转发到 background script
    chrome.runtime.sendMessage({ 
      action: "makeAIRequest",
      requestData: { word, sentence, stream, messages, model, temperature }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      
      resolve(response);
    });
  });
}

// 检查是否使用Orion TTS模式（通过用户设置）
async function isOrionMode() {
  try {
    const orionTTSEnabled = await getStorageValue('useOrionTTS');
    // console.log('[isOrionMode] useOrionTTS设置:', orionTTSEnabled);
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

// 修改流式分析函数
async function streamAnalysis(word, sentence) {
  //获取分析结果的DOM元素，用来流式输出
  const analysisResult = analysisWindow.querySelector('.analysis-result');

  // 获取用户自定义的 AI 提示词
  chrome.storage.local.get('aiConfig', async function(result) {
    let customAnalysisPrompt = result?.aiConfig?.aiAnalysisPrompt;
    let promptText = customAnalysisPrompt
      ? customAnalysisPrompt.replace('{sentence}', sentence).replace('{word}', word)
      : `直译： 我敬畏地观察着两位可怕的战士一次又一次地交叉他们的剑。 解析： - Ich beobachte ehrfürchtig: "我敬畏地观察"。   - Ich: "我"，主语。   - beobachte: "观察"，动词"beobachten"的第一人称单数形式。   - ehrfürchtig: "敬畏地"，副词，表示对某事物的尊敬或畏惧。 - wie die beiden furchterregenden Krieger immer wieder ihre Klingen kreuzen: "两位可怕的战士一次又一次地交叉他们的剑"。   - wie: "如何"，引导方式状语从句。   - die beiden furchterregenden Krieger: "这两位可怕的战士"。     - die beiden: "这两位"，指示代词。     - furchterregenden: "可怕的"，形容词，表示"令人恐惧"。     - Krieger: "战士"，名词，指战斗者。   - immer wieder: "一次又一次"，副词短语，表示重复发生。   - ihre Klingen kreuzen: "交叉他们的剑"。     - ihre: "他们的"，物主代词。     - Klingen: "剑"，名词，表示剑或刀刃。     - kreuzen: "交叉"，动词，表示交叉或交锋。 借鉴上面解析格式，用中文解析下列英语/德语等其他语言的句子: ${sentence}

      `;

    const messages = [{
      role: "user",
      content: promptText
    }];

    // 检测是否使用Orion模式
    const useOrionMode = await isOrionMode();

    // 在界面上显示调试信息
    // analysisResult.innerHTML = `useOrionTTS设置: ${useOrionMode}<br>正在初始化...`;

    if (useOrionMode) {
      // Orion模式使用原来的实现方式（直接在content script中处理流式数据）
      useLegacyStreamAnalysis(word, sentence, messages, analysisResult);
    } else {
      // 非Orion模式使用background实现方式
      useBackgroundStreamAnalysis(word, sentence, messages, analysisResult);
    }
  });
}

// Orion模式的实现方式（直接在content script中处理）
function useLegacyStreamAnalysis(word, sentence, messages, analysisResult) {
  // analysisResult.innerHTML += '<br>开始Orion模式分析...';

  // 直接在content script中处理AI请求和流式数据
  chrome.runtime.sendMessage({ action: "getAIConfig" }, (response) => {
    if (chrome.runtime.lastError) {
      analysisResult.innerHTML = `配置获取失败: ${chrome.runtime.lastError.message}`;
      return;
    }

    const config = response?.config || {};
    // analysisResult.innerHTML += `<br>配置获取成功，API URL: ${config.apiBaseURL || '未设置'}`;

    // 检查 API Key 是否配置
    if (!config.apiKey) {
      analysisResult.innerHTML = "AI API Key 或 Token 未配置，请在插件设置中填写";
      return;
    }

    if (!config.apiBaseURL) {
      analysisResult.innerHTML = "AI API BaseURL 未配置，请在插件设置中填写";
      return;
    }

    // analysisResult.innerHTML += '<br>开始发起AI请求...';

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
      // analysisResult.innerHTML += `<br>收到响应，状态: ${response.status}`;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      // analysisResult.innerHTML += '<br>开始处理流式数据...';

      const reader = response.body.getReader();
      let buffer = '';
      let isFirstChunk = true;

      function processText({ done, value }) {
        if (done) {
          // 处理最后可能残留的数据
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                analysisResult.innerHTML += formatContent(content);
                analysisResult.scrollTop = analysisResult.scrollHeight;
              }
            } catch (e) {
              console.log("解析最后数据块失败:", e);
            }
          }
          return;
        }

        // 将新的数据块添加到缓冲区
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;

        // 处理数据流
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(dataStr);
              const content = data.choices?.[0]?.delta?.content;

              if (content) {
                if (isFirstChunk) {
                  analysisResult.innerHTML = ''; // 清空 "分析中..." 的文本
                  isFirstChunk = false;
                }
                analysisResult.innerHTML += formatContent(content);
                analysisResult.scrollTop = analysisResult.scrollHeight;
              }
            } catch (e) {
              console.log("解析流式数据失败:", e, "原始数据:", dataStr);
            }
          }
        }

        // 继续读取
        return reader.read().then(processText);
      }

      return reader.read().then(processText);
    })
    .catch(err => {
      // analysisResult.innerHTML = `<br>Orion模式流式请求失败: ${err.message}<br>尝试非流式请求...`;
      analysisResult.innerHTML = '正在分析（非流式模式）...';

      // 尝试非流式请求
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
          stream: false,
          temperature: 1
        })
      })
      .then(response => response.json())
      .then(data => {
        const content = data.choices?.[0]?.message?.content || '分析失败';
        analysisResult.innerHTML = formatContent(content);
        analysisResult.scrollTop = analysisResult.scrollHeight;
      })
      .catch(nonStreamErr => {
        analysisResult.innerHTML = `分析出错: ${nonStreamErr.message}`;
      });
    });
  });
}

// 标准模式的实现方式（通过background处理）
function useBackgroundStreamAnalysis(word, sentence, messages, analysisResult) {
  // 设置流式处理的上下文
  window.currentStreamContext = {
    type: 'analysis',
    element: analysisResult,
    word: word,
    sentence: sentence
  };

  // 通过background处理流式请求
  makeAIRequest({ word, sentence, stream: true, messages })
    .then(response => {
      // 如果返回的是流式响应标识，说明background正在处理流式数据
      if (response.success && response.stream) {
        console.log('流式请求已启动，等待background发送数据');
        return;
      }

      // 如果不是流式响应，按原来的方式处理
      const reader = response.body.getReader();
      let buffer = '';
      let isFirstChunk = true;

      function processText({ done, value }) {
        if (done) {
          // 处理最后可能残留的数据
          if (buffer) {
            try {
              const data = JSON.parse(buffer);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                analysisResult.innerHTML += formatContent(content);
                analysisResult.scrollTop = analysisResult.scrollHeight;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
          return;
        }

        // 将新的数据块添加到缓冲区
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;

        // 处理数据流
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                if (isFirstChunk) {
                  analysisResult.innerHTML = ''; // 清空 "分析中..." 的文本
                  isFirstChunk = false;
                }
                analysisResult.innerHTML += formatContent(content);
                analysisResult.scrollTop = analysisResult.scrollHeight;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        });

        // 继续读取
        return reader.read().then(processText);
      }

      return reader.read().then(processText);
    })
    .catch(err => {
      console.log('流式请求失败，尝试非流式请求:', err.message);
      // 如果流式请求失败（比如在Firefox中），尝试非流式请求
      if (err.message.includes('流式请求暂时不支持')) {
        analysisResult.innerHTML = '正在分析（非流式模式）...';
        makeAIRequest({ word, sentence, stream: false, messages })
          .then(data => {
            const content = data.choices?.[0]?.message?.content || '分析失败';
            analysisResult.innerHTML = formatContent(content);
            analysisResult.scrollTop = analysisResult.scrollHeight;
          })
          .catch(nonStreamErr => {
            analysisResult.innerHTML = `分析出错: ${nonStreamErr.message}`;
            console.error('非流式AI分析也失败:', nonStreamErr);
          });
      } else {
        analysisResult.innerHTML = `分析出错: ${err.message}`;
        console.error('AI分析失败:', err);
      }
    });
}




// 新增函数：使用 AI 翻译例句，并对当前单词在翻译中进行加粗标记（Markdown格式）
function fetchSentenceTranslation(word, sentence) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getAIConfig" }, (response) => {

      //aiSentenceTranslationPrompt
      // 构造提示语，请求 AI 翻译句子，并将句子中单词进行加粗显示
      let customPrompt = response?.config?.aiSentenceTranslationPrompt;
      console.log("aiSentenceTranslationPromptcustomPrompt:", customPrompt);
      let promptText = customPrompt
                         ? customPrompt.replace('{sentence}', sentence).replace('{word}', word)
                         : `请将句子: ${sentence}翻译为中文，并将句子中单词"${word}"对应的中文的部分用Markdown加粗显示。只返回翻译结果，不要额外说明。\n`;

      const messages = [{
        role: "user",
        content: promptText
      }];

      makeAIRequest({ word, sentence, messages, })
        .then(data => {
          const result = data.choices?.[0]?.message?.content || "暂无翻译";
          resolve(result);
        })
        .catch(err => {
          console.error("句子翻译失败", err);
          resolve("翻译失败");
        });
    });
  });
}


  // 修改函数：获取AI建议的标签
  function fetchAITags(word, sentence) {
    return new Promise((resolve) => {
      // 不再需要在这里获取config，makeAIRequest内部会处理
      // chrome.runtime.sendMessage({ action: "getAIConfig" }, (response) => {
        // const config = response.config

        // 直接获取AI配置，主要是为了获取自定义提示词 aiTagAnalysisPrompt
        chrome.storage.local.get('aiConfig', function(result) {
          const config = result?.aiConfig || {}; // 获取配置，提供默认空对象防止错误
          let customPrompt = config?.aiTagAnalysisPrompt;
          // console.log("aiTagAnalysisPrompt customPrompt:", customPrompt);
          let promptText = customPrompt
                         ? customPrompt.replace('{sentence}', sentence).replace('{word}', word)
                         : `
你将要按照下列要求，分析单词在句子中的一些信息，用作某单词的tag，请按照下列要求进行分析：
1. 词性(pos): 在句子中的词性
2. 性别(gender): 如果是名词，返回 der/die/das
3. 复数形式(plural): 如果是名词，返回其复数形式
4. 变位(conjugation): 如果是动词，返回其原形
5. 附加信息1(自定义key): 任何其他重要信息，请自行判断添加，可参考示例。
6. 附加信息2(自定义key): 任何其他重要信息，请自行判断添加，可参考示例。
7. ...
...
示例：
德语：{"pos":"n", "gender":"der", "plural":"Häuser", "conjugation":"gehen"}
英语：{"pos":"n", "plural":"houses", "conjugation":"null"}
日语：{"pos":"n", "gender":"null", "plural":"null", "conjugation":"null", "注音":"いえ、うち","罗马音":"ie,uchi"}
中文：{"pos":"n", "gender":"null", "plural":"null", "conjugation":"null", "pinyin":"fáng zi"}

请分析句子"${sentence}"中的单词"${word}"。返回JSON格式，包含：
仅返回JSON，无需解释，不要加markdown代码块标记，注意不同语言，非日语不要返回注意和罗马音和拼音。
   `;

          const messages = [{ role: "user", content: promptText }];

          // 使用 makeAIRequest 发送请求
          makeAIRequest({ word, sentence, messages, stream: false }) // model 会使用 makeAIRequest 内部的默认值或配置值
          .then(data => {
            try {
              let content = data.choices?.[0]?.message?.content || "{}";

              // 移除可能存在的代码块标记
              content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

              // 解析 JSON
              const result = JSON.parse(content);

              // 确保返回值的格式正确
              const formattedResult = {
                pos: result.pos || [],
                plural: result.plural || null,
                conjugation: result.conjugation || null,
                gender: result.gender || null,
                ...result  // 保留所有其他字段
              };

              // 确保 pos 始终是数组
              if (!Array.isArray(formattedResult.pos)) {
                formattedResult.pos = [formattedResult.pos].filter(Boolean);
              }

              resolve(formattedResult);
            } catch (e) {
              console.error("解析AI标签响应失败:", e);
              resolve({
                pos: [],
                plural: null,
                conjugation: null,
                gender: null
              });
            }
          })
          .catch(err => {
            console.error("获取AI标签建议失败", err);
            resolve({
              pos: [],
              plural: null,
              conjugation: null,
              gender: null
            });
          });
        }); // 结束 chrome.storage.local.get 的回调
    });
}

// 新增：对话式分析函数（支持持续性对话）
async function streamChatAnalysis(word, sentence, conversationHistory, analysisResult) {
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

    // 检测是否使用Orion模式
    const useOrionMode = await isOrionMode();

    if (useOrionMode) {
      // Orion模式使用原来的实现方式（直接在content script中处理流式数据）
      useLegacyChatAnalysis(word, sentence, messages, analysisResult, conversationHistory);
    } else {
      // 非Orion模式使用background实现方式
      useBackgroundChatAnalysis(word, sentence, messages, analysisResult, conversationHistory);
    }
  });
}

// Orion模式的对话分析实现方式
function useLegacyChatAnalysis(word, sentence, messages, analysisResult, conversationHistory) {
  // 直接在content script中处理AI请求和流式数据
  chrome.runtime.sendMessage({ action: "getAIConfig" }, (response) => {
    const config = response.config || {};

    // 检查 API Key 是否配置
    if (!config.apiKey) {
      analysisResult.innerHTML += `<div class="error-message">AI API Key 或 Token 未配置，请在插件设置中填写</div>`;
      return;
    }

    // 添加 AI 回复的占位符
    const aiResponseDiv = document.createElement('div');
    aiResponseDiv.className = 'ai-message';
    aiResponseDiv.innerHTML = '<strong>AI:</strong> ';
    analysisResult.appendChild(aiResponseDiv);
    analysisResult.scrollTop = analysisResult.scrollHeight;

    const responseContentSpan = document.createElement('span');
    aiResponseDiv.appendChild(responseContentSpan);

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
      let isFirstChunk = true;

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // 流式传输完成
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

// 标准模式的对话分析实现方式（通过background处理）
function useBackgroundChatAnalysis(word, sentence, messages, analysisResult, conversationHistory) {
  // 添加 AI 回复的占位符
  const aiResponseDiv = document.createElement('div');
  aiResponseDiv.className = 'ai-message';
  aiResponseDiv.innerHTML = '<strong>AI:</strong> ';
  analysisResult.appendChild(aiResponseDiv);
  analysisResult.scrollTop = analysisResult.scrollHeight;

  const responseContentSpan = document.createElement('span');
  aiResponseDiv.appendChild(responseContentSpan);

  // 设置流式处理的上下文
  window.currentStreamContext = {
    type: 'chat',
    element: responseContentSpan,
    word: word,
    sentence: sentence,
    conversationHistory: conversationHistory
  };

  // 通过background处理流式请求
  makeAIRequest({ word, sentence, stream: true, messages })
    .then(response => {
      if (response.success && response.stream) {
        console.log('对话流式请求已启动，等待background发送数据');
        return;
      }

      // 如果不是流式响应，按原来的方式处理
      const reader = response.body.getReader();
      let buffer = '';
      let isFirstChunk = true;

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
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
}

// 为侧边栏进行流式分析
async function sidebarStreamAnalysis(word, sentence) {
  // 获取用户自定义的AI提示词
  chrome.storage.local.get('aiConfig', async function(result) {
    let customSidebarPrompt = result?.aiConfig?.sidebarAIPrompt;
    let promptText = customSidebarPrompt
      ? customSidebarPrompt.replace('{sentence}', sentence)
      : `直译： 我敬畏地观察着两位可怕的战士一次又一次地交叉他们的剑。 解析： - Ich beobachte ehrfürchtig: "我敬畏地观察"。   - Ich: "我"，主语。   - beobachte: "观察"，动词"beobachten"的第一人称单数形式。   - ehrfürchtig: "敬畏地"，副词，表示对某事物的尊敬或畏惧。 - wie die beiden furchterregenden Krieger immer wieder ihre Klingen kreuzen: "两位可怕的战士一次又一次地交叉他们的剑"。   - wie: "如何"，引导方式状语从句。   - die beiden furchterregenden Krieger: "这两位可怕的战士"。     - die beiden: "这两位"，指示代词。     - furchterregenden: "可怕的"，形容词，表示"令人恐惧"。     - Krieger: "战士"，名词，指战斗者。   - immer wieder: "一次又一次"，副词短语，表示重复发生。   - ihre Klingen kreuzen: "交叉他们的剑"。     - ihre: "他们的"，物主代词。     - Klingen: "剑"，名词，表示剑或刀刃。     - kreuzen: "交叉"，动词，表示交叉或交锋。 借鉴上面解析格式，用中文解析下列英语/德语等其他语言的句子： ${sentence}`;

    const messages = [{
      role: "user",
      content: promptText
    }];

    // 检测是否使用Orion模式
    const useOrionMode = await isOrionMode();

    if (useOrionMode) {
      // console.log('检测到Orion模式，侧边栏使用原来的实现方式');
      // Orion模式使用原来的实现方式（直接在content script中处理流式数据）
      useLegacySidebarStreamAnalysis(word, sentence, messages);
    } else {
      // console.log('非Orion模式，侧边栏使用background实现方式');
      // 非Orion模式使用background实现方式
      useBackgroundSidebarStreamAnalysis(word, sentence, messages);
    }
  });
}

// Orion模式的侧边栏实现方式（直接在content script中处理）
function useLegacySidebarStreamAnalysis(word, sentence, messages) {
  // 直接在content script中处理AI请求和流式数据
  chrome.runtime.sendMessage({ action: "getAIConfig" }, (response) => {
    const config = response.config || {};

    // 检查 API Key 是否配置
    if (!config.apiKey) {
      chrome.runtime.sendMessage({
        action: "streamUpdate",
        data: {
          content: "AI API Key 或 Token 未配置，请在插件设置中填写",
          isFirstChunk: true
        }
      });
      return;
    }

    console.log("[aiFragen.js] Safari模式 - 侧边栏发起 AI 请求到:", config.apiBaseURL);

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
      let isFirstChunk = true;

      function processText({ done, value }) {
        if (done) {
          // 处理最后可能残留的数据
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                chrome.runtime.sendMessage({
                  action: "streamUpdate",
                  data: {
                    content: content,
                    isFirstChunk: false
                  }
                });
              }
            } catch (e) {
              console.log("解析最后数据块失败:", e);
            }
          }
          return;
        }

        // 将新的数据块添加到缓冲区
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;

        // 处理数据流
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(dataStr);
              const content = data.choices?.[0]?.delta?.content;

              if (content) {
                chrome.runtime.sendMessage({
                  action: "streamUpdate",
                  data: {
                    content: content,
                    isFirstChunk: isFirstChunk
                  }
                });

                if (isFirstChunk) {
                  isFirstChunk = false;
                }
              }
            } catch (e) {
              console.log("解析流式数据失败:", e, "原始数据:", dataStr);
            }
          }
        }

        // 继续读取
        return reader.read().then(processText);
      }

      return reader.read().then(processText);
    })
    .catch(err => {
      console.log('Safari模式侧边栏流式请求失败，尝试非流式请求:', err.message);
      chrome.runtime.sendMessage({
        action: "streamUpdate",
        data: {
          content: '正在分析（非流式模式）...',
          isFirstChunk: true
        }
      });

      // 尝试非流式请求
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
          stream: false,
          temperature: 1
        })
      })
      .then(response => response.json())
      .then(data => {
        const content = data.choices?.[0]?.message?.content || '分析失败';
        chrome.runtime.sendMessage({
          action: "streamUpdate",
          data: {
            content: content,
            isFirstChunk: true
          }
        });
      })
      .catch(nonStreamErr => {
        chrome.runtime.sendMessage({
          action: "streamUpdate",
          data: {
            content: `分析出错: ${nonStreamErr.message}`,
            isFirstChunk: true
          }
        });
        console.error('Safari模式侧边栏非流式AI分析也失败:', nonStreamErr);
      });
    });
  });
}

// 标准模式的侧边栏实现方式（通过background处理）
function useBackgroundSidebarStreamAnalysis(word, sentence, messages) {
  // 设置流式处理的上下文
  window.currentStreamContext = {
    type: 'sidebar',
    word: word,
    sentence: sentence
  };

  // 通过background处理流式请求
  makeAIRequest({ word, sentence, stream: true, messages })
    .then(response => {
      // 如果返回的是流式响应标识，说明background正在处理流式数据
      if (response.success && response.stream) {
        console.log('侧边栏流式请求已启动，等待background发送数据');
        return;
      }

      // 如果不是流式响应，按原来的方式处理
      const reader = response.body.getReader();
      let buffer = '';
      let isFirstChunk = true;

      function processText({ done, value }) {
        if (done) {
          // 处理最后可能残留的数据
          if (buffer) {
            try {
              const data = JSON.parse(buffer);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                // 发送到侧边栏
                chrome.runtime.sendMessage({
                  action: "streamUpdate",
                  data: {
                    content: content,
                    isFirstChunk: false
                  }
                });
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
          return;
        }

        // 将新的数据块添加到缓冲区
        const chunk = new TextDecoder().decode(value);
        buffer += chunk;

        // 处理数据流
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                // 发送到侧边栏
                chrome.runtime.sendMessage({
                  action: "streamUpdate",
                  data: {
                    content: content,
                    isFirstChunk: isFirstChunk
                  }
                });

                if (isFirstChunk) {
                  isFirstChunk = false;
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        });

        // 继续读取
        return reader.read().then(processText);
      }

      return reader.read().then(processText);
    })
    .catch(err => {
      console.log('侧边栏流式请求失败，尝试非流式请求:', err.message);
      // 如果流式请求失败（比如在Firefox中），尝试非流式请求
      if (err.message.includes('流式请求暂时不支持')) {
        chrome.runtime.sendMessage({
          action: "streamUpdate",
          data: {
            content: '正在分析（非流式模式）...',
            isFirstChunk: true
          }
        });

        makeAIRequest({ word, sentence, stream: false, messages })
          .then(data => {
            const content = data.choices?.[0]?.message?.content || '分析失败';
            chrome.runtime.sendMessage({
              action: "streamUpdate",
              data: {
                content: content,
                isFirstChunk: true
              }
            });
          })
          .catch(nonStreamErr => {
            chrome.runtime.sendMessage({
              action: "streamUpdate",
              data: {
                content: `分析出错: ${nonStreamErr.message}`,
                isFirstChunk: true
              }
            });
            console.error('侧边栏非流式AI分析也失败:', nonStreamErr);
          });
      } else {
        // 向侧边栏发送错误信息
        chrome.runtime.sendMessage({
          action: "streamUpdate",
          data: {
            content: `分析出错: ${err.message}`,
            isFirstChunk: true
          }
        });
        console.error('AI分析失败:', err);
      }
    });
}
