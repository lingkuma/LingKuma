const dbName = 'vocabDB';
const dbVersion = 3; // 升级版本以添加isCustom索引
let db;

// 自定义词组数据库
const customPhrasesDBName = 'customPhrasesDB';
const customPhrasesDBVersion = 1;
let customPhrasesDB;

// 全局变量标记数据库是否准备好
let dbReady = false;
let customPhrasesDBReady = false;
// 数据库初始化完成前的请求队列
let pendingRequests = [];
let customPhrasesPendingRequests = [];

// ============================================
// 云端数据库配置和 API
// ============================================
let cloudConfig = {
  selfHosted: false,
  serverURL: '',
  dataServerURL: '',
  token: '',
  enabled: false,
  dualWrite: true
};

// 初始化云端配置
async function initCloudConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cloudConfig'], (result) => {
      if (result.cloudConfig) {
        cloudConfig.selfHosted = result.cloudConfig.selfHosted || false;
        cloudConfig.serverURL = result.cloudConfig.serverURL || '';
        cloudConfig.dataServerURL = result.cloudConfig.dataServerURL || '';
        cloudConfig.token = result.cloudConfig.token || '';
        cloudConfig.enabled = result.cloudConfig.cloudDbEnabled || false;
        cloudConfig.dualWrite = result.cloudConfig.cloudDualWrite !== false; // 默认true
      }
      console.log('[CloudDB] Config loaded:', {
        selfHosted: cloudConfig.selfHosted,
        enabled: cloudConfig.enabled,
        dualWrite: cloudConfig.dualWrite,
        hasToken: !!cloudConfig.token,
        hasDataServerURL: !!cloudConfig.dataServerURL,
        hasServerURL: !!cloudConfig.serverURL
      });
      resolve();
    });
  });
}

// 创建 cloudAPI 对象（兼容 content scripts 的 CloudAPI 类）
const cloudAPI = {
  async init() {
    await initCloudConfig();
  },
  async getUserInfo() {
    return await cloudGetUserInfo();
  },
  async verifyAfdian(afdianUserId) {
    return await cloudVerifyAfdian(afdianUserId);
  },
  async getWord(word) {
    return await cloudGetWord(word);
  },
  async getAllWords(filters) {
    return await cloudGetAllWords(filters);
  },
  async batchGetWords(words) {
    return await cloudBatchGetWords(words);
  },
  async saveWord(wordData) {
    return await cloudSaveWord(wordData);
  },
  async deleteWord(word) {
    return await cloudDeleteWord(word);
  },
  async getAllPhrases(filters) {
    return await cloudGetAllPhrases(filters);
  },
  async savePhrase(phraseData) {
    return await cloudSavePhrase(phraseData);
  },
  async deletePhrase(word) {
    return await cloudDeletePhrase(word);
  },
  async batchSyncPhrases(phrases, mode) {
    return await cloudBatchSyncPhrases(phrases, mode);
  }
};

// 云端 API 请求
async function cloudRequest(endpoint, options = {}) {
  // 根据 selfHosted 模式选择正确的服务器 URL
  let serverURL;
  if (cloudConfig.selfHosted) {
    // 自建服务器模式：使用 serverURL
    serverURL = cloudConfig.serverURL;
  } else {
    // 官方服务器模式：使用 dataServerURL
    serverURL = cloudConfig.dataServerURL;
  }

  if (!serverURL) {
    throw new Error('Cloud server URL not configured');
  }

  // 去除 serverURL 末尾的斜杠(如果有)
  serverURL = serverURL.replace(/\/$/, '');

  const url = `${serverURL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (cloudConfig.token) {
    headers['Authorization'] = `Bearer ${cloudConfig.token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.message || `HTTP ${response.status}`;
    
    if (errorMessage.includes('Word limit reached') || errorMessage.includes('单词限制')) {
      console.log('[CloudDB] Word limit reached, sending notification to all tabs');
      
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: "showWordLimitNotification",
            message: errorMessage
          }).catch(() => {
          });
        });
      });
    }
    
    throw new Error(errorMessage);
  }

  return data;
}

// 云端 API：验证并刷新爱发电订阅状态
async function cloudVerifyAfdian(afdianUserId) {
  try {
    const body = afdianUserId ? { afdianUserId } : {};
    const data = await cloudRequest('/api/auth/verify-afdian', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return data;
  } catch (error) {
    console.error('[CloudDB] cloudVerifyAfdian failed:', error);
    return { success: false, message: error.message };
  }
}

// 云端 API：获取当前用户信息（用于刷新订阅状态）
async function cloudGetUserInfo() {
  try {
    const data = await cloudRequest('/api/auth/me', {
      method: 'GET'
    });
    return data;
  } catch (error) {
    console.error('[CloudDB] cloudGetUserInfo failed:', error);
    return { success: false, message: error.message };
  }
}

// 云端 API：保存单词
// mergeMode: 'merge' - 合并云端数据（用于添加操作）, 'overwrite' - 覆盖云端数据（用于删除操作）
async function cloudSaveWord(wordData, mergeMode = 'merge') {
  try {
    // 总是先从云端获取最新数据以确保版本号正确
    console.log('[CloudDB] Fetching latest version from cloud:', wordData.word, 'mergeMode:', mergeMode);
    try {
      const cloudData = await cloudGetWord(wordData.word);
      console.log('[CloudDB] Cloud data received:', cloudData);
      if (cloudData && cloudData.data) {
        // 合并云端的版本信息和ID
        wordData.__v = cloudData.data.__v;
        wordData._id = cloudData.data._id;
        wordData.userId = cloudData.data.userId;
        console.log('[CloudDB] Merged cloud version info:', { __v: wordData.__v, _id: wordData._id });

        // 只在merge模式下合并云端的数组字段
        if (mergeMode === 'merge') {
          // 合并云端的数组字段（translations, tags, sentences）
          // 使用Set去重，确保不会重复添加
          if (cloudData.data.translations && Array.isArray(cloudData.data.translations)) {
            const localTranslations = wordData.translations || [];
            const cloudTranslations = cloudData.data.translations || [];
            // 合并并去重
            const mergedTranslations = [...new Set([...cloudTranslations, ...localTranslations])];
            wordData.translations = mergedTranslations;
            console.log('[CloudDB] Merged translations:', {
              cloud: cloudTranslations.length,
              local: localTranslations.length,
              merged: mergedTranslations.length
            });
          }

          if (cloudData.data.tags && Array.isArray(cloudData.data.tags)) {
            const localTags = wordData.tags || [];
            const cloudTags = cloudData.data.tags || [];
            // 合并并去重
            const mergedTags = [...new Set([...cloudTags, ...localTags])];
            wordData.tags = mergedTags;
            console.log('[CloudDB] Merged tags:', {
              cloud: cloudTags.length,
              local: localTags.length,
              merged: mergedTags.length
            });
          }

          if (cloudData.data.sentences && Array.isArray(cloudData.data.sentences)) {
            const localSentences = wordData.sentences || [];
            const cloudSentences = cloudData.data.sentences || [];
            // 对于sentences，需要更复杂的去重逻辑（基于sentence字段）
            const sentenceMap = new Map();
            // 先添加云端的句子
            cloudSentences.forEach(s => {
              if (s && s.sentence) {
                sentenceMap.set(s.sentence, s);
              }
            });
            // 再添加本地的句子（如果不存在）
            localSentences.forEach(s => {
              if (s && s.sentence && !sentenceMap.has(s.sentence)) {
                sentenceMap.set(s.sentence, s);
              }
            });
            wordData.sentences = Array.from(sentenceMap.values());
            console.log('[CloudDB] Merged sentences:', {
              cloud: cloudSentences.length,
              local: localSentences.length,
              merged: wordData.sentences.length
            });
          }
        } else {
          // overwrite模式：使用本地数据覆盖云端数据
          console.log('[CloudDB] Overwrite mode: using local data as-is');
        }

        // 合并其他可能的字段（如果云端有而本地没有）
        if (cloudData.data.language && !wordData.language) {
          wordData.language = cloudData.data.language;
        }
        if (cloudData.data.status && !wordData.status) {
          wordData.status = cloudData.data.status;
        }
        if (cloudData.data.statusHistory && !wordData.statusHistory) {
          wordData.statusHistory = cloudData.data.statusHistory;
        }

      } else if (cloudData && cloudData.__v) {
        // 如果数据直接在顶层
        wordData.__v = cloudData.__v;
        wordData._id = cloudData._id;
        wordData.userId = cloudData.userId;
        console.log('[CloudDB] Merged cloud version info (top level):', { __v: wordData.__v, _id: wordData._id });

        // 只在merge模式下合并数组字段
        if (mergeMode === 'merge') {
          if (cloudData.translations && Array.isArray(cloudData.translations)) {
            const localTranslations = wordData.translations || [];
            const cloudTranslations = cloudData.translations || [];
            const mergedTranslations = [...new Set([...cloudTranslations, ...localTranslations])];
            wordData.translations = mergedTranslations;
          }

          if (cloudData.tags && Array.isArray(cloudData.tags)) {
            const localTags = wordData.tags || [];
            const cloudTags = cloudData.tags || [];
            const mergedTags = [...new Set([...cloudTags, ...localTags])];
            wordData.tags = mergedTags;
          }

          if (cloudData.sentences && Array.isArray(cloudData.sentences)) {
            const localSentences = wordData.sentences || [];
            const cloudSentences = cloudData.sentences || [];
            const sentenceMap = new Map();
            cloudSentences.forEach(s => {
              if (s && s.sentence) {
                sentenceMap.set(s.sentence, s);
              }
            });
            localSentences.forEach(s => {
              if (s && s.sentence && !sentenceMap.has(s.sentence)) {
                sentenceMap.set(s.sentence, s);
              }
            });
            wordData.sentences = Array.from(sentenceMap.values());
          }
        }
      }
    } catch (err) {
      // 如果云端不存在该单词，说明是新单词，可以直接保存
      console.log('[CloudDB] Word not found in cloud, will create new:', wordData.word, err.message);
    }

    console.log('[CloudDB] Saving word data:', { word: wordData.word, __v: wordData.__v, _id: wordData._id });

    delete wordData._id;
    delete wordData.__v;

    const response = await cloudRequest('/api/words', {
      method: 'POST',
      body: JSON.stringify(wordData)
    });

    // 保存成功后，更新本地 IndexedDB 中的版本号
    if (response && response.data && response.data.__v) {
      console.log('[CloudDB] Updating local version to:', response.data.__v);
      updateLocalWordVersion(wordData.word, response.data.__v, response.data._id, response.data.userId);
    }

    return response;
  } catch (error) {
    console.error('[CloudDB] Save word error:', error);
    throw error;
  }
}

// 更新本地单词的版本号
function updateLocalWordVersion(word, version, id, userId) {
  if (!db) return;

  const key = word.toLowerCase();
  const tx = db.transaction("wordDetails", "readwrite");
  const store = tx.objectStore("wordDetails");
  const getReq = store.get(key);

  getReq.onsuccess = event => {
    const record = event.target.result;
    if (record) {
      record.__v = version;
      record._id = id;
      record.userId = userId;
      store.put(record);
      console.log('[CloudDB] Local version updated:', { word, __v: version });
    }
  };
}

// 云端 API：删除单词
async function cloudDeleteWord(word) {
  try {
    const response = await cloudRequest(`/api/words/${encodeURIComponent(word)}`, {
      method: 'DELETE'
    });
    return response;
  } catch (error) {
    console.error('[CloudDB] Delete word error:', error);
    throw error;
  }
}

// 云端 API：获取单词
async function cloudGetWord(word) {
  try {
    const response = await cloudRequest(`/api/words/${encodeURIComponent(word)}`);
    return response;
  } catch (error) {
    console.error('[CloudDB] Get word error:', error);
    throw error;
  }
}

// 云端 API：获取所有单词
async function cloudGetAllWords(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const response = await cloudRequest(`/api/words?${params.toString()}`);
    return response;
  } catch (error) {
    console.error('[CloudDB] Get all words error:', error);
    throw error;
  }
}

// 云端 API：批量获取单词
async function cloudBatchGetWords(words) {
  try {
    const response = await cloudRequest('/api/words/batch-get', {
      method: 'POST',
      body: JSON.stringify({ words })
    });
    return response;
  } catch (error) {
    console.error('[CloudDB] Batch get words error:', error);
    throw error;
  }
}

// ============================================
// 云端 API - 自定义词组操作
// ============================================

// 云端 API - 保存/更新自定义词组
async function cloudSavePhrase(phraseData) {
  try {
    const response = await cloudRequest('/api/phrases', {
      method: 'POST',
      body: JSON.stringify(phraseData)
    });
    return response.data;
  } catch (error) {
    console.error('[CloudDB] Save phrase failed:', error);
    throw error;
  }
}

// 云端 API - 删除自定义词组
async function cloudDeletePhrase(word) {
  try {
    await cloudRequest(`/api/phrases/${encodeURIComponent(word)}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('[CloudDB] Delete phrase failed:', error);
    throw error;
  }
}

// 云端 API - 获取单个自定义词组
async function cloudGetPhrase(word) {
  try {
    const response = await cloudRequest(`/api/phrases/${encodeURIComponent(word)}`, {
      method: 'GET'
    });
    return response.data;
  } catch (error) {
    console.error('[CloudDB] Get phrase failed:', error);
    throw error;
  }
}

// 云端 API - 获取所有自定义词组
async function cloudGetAllPhrases(filters = {}) {
  try {
    const params = new URLSearchParams(filters);
    const response = await cloudRequest(`/api/phrases?${params.toString()}`, {
      method: 'GET'
    });
    return response.data || [];
  } catch (error) {
    console.error('[CloudDB] Get all phrases failed:', error);
    throw error;
  }
}

// 云端 API - 批量同步自定义词组
async function cloudBatchSyncPhrases(phrases, mode = 'merge') {
  try {
    const response = await cloudRequest('/api/phrases/batch-sync', {
      method: 'POST',
      body: JSON.stringify({ phrases, mode })
    });
    return response;
  } catch (error) {
    console.error('[CloudDB] Batch sync phrases failed:', error);
    throw error;
  }
}

// 监听 storage 变化，更新云端配置
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.cloudConfig) {
    const newConfig = changes.cloudConfig.newValue;
    if (newConfig) {
      cloudConfig.serverURL = newConfig.serverURL || '';
      cloudConfig.token = newConfig.token || '';
      cloudConfig.enabled = newConfig.cloudDbEnabled || false;
      cloudConfig.dualWrite = newConfig.cloudDualWrite !== false;
      console.log('[CloudDB] Config updated:', {
        enabled: cloudConfig.enabled,
        dualWrite: cloudConfig.dualWrite
      });
    }
  }
});

// 音频播放器实例
let audioPlayer = null;
let pendingAudioData = [];
let mediaSource = null;
let sourceBuffer = null;

// 音频播放相关变量 - 删除playerTab
let isOffscreenOpened = false;
let autoCloseTimeout = null;

// 全局变量标记剪贴板监听器状态
let isClipboardOffscreenOpened = false;
let clipboardAutoCloseTimeout = null;

// 修改打开数据库函数，添加状态通知和请求队列处理
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      console.log(`数据库升级: 从版本 ${oldVersion} 到版本 ${dbVersion}`);

      // 仅当对象存储不存在时创建
      if (!db.objectStoreNames.contains("wordDetails")) {
        const store = db.createObjectStore("wordDetails", { keyPath: "word" });
        store.createIndex("status", "status", { unique: false }); // 创建status索引
        store.createIndex("isCustom", "isCustom", { unique: false }); // 创建isCustom索引
        console.log("创建wordDetails对象存储及索引(status, isCustom)");
      } else {
        // 已有数据库的升级逻辑
        const store = event.target.transaction.objectStore("wordDetails");

        // 检查并创建status索引
        if (!store.indexNames.contains("status")) {
          store.createIndex("status", "status", { unique: false });
          console.log("创建status索引");
        }

        // 检查并创建isCustom索引 (版本3新增)
        if (!store.indexNames.contains("isCustom")) {
          store.createIndex("isCustom", "isCustom", { unique: false });
          console.log("创建isCustom索引");
        }
      }
    };
    // 如果数据库存在，则打开数据库
    request.onsuccess = event => {
      db = event.target.result;
      dbReady = true;
      console.log("数据库初始化成功，处理待处理请求...");
      // 处理待处理的请求
      processPendingRequests();
      resolve(db);
    };
    // 如果数据库打开失败，则拒绝请求
    request.onerror = event => {
      console.error("打开数据库失败:", event.target.error);
      reject(event.target.error);
    };
  });
}

// 处理待处理请求
function processPendingRequests() {
  while (pendingRequests.length > 0) {
    const request = pendingRequests.shift();
    try {
      request.execute()
        .then(result => request.resolve(result))
        .catch(error => request.reject(error));
    } catch (error) {
      console.error("处理请求失败:", error);
      request.reject(error);
    }
  }
}


// 确保数据库操作安全执行的包装函数
function ensureDB(operation) {
  return new Promise((resolve, reject) => {
    if (dbReady && db) {
      // 数据库已准备好，直接执行操作
      operation()
        .then(resolve)
        .catch(reject);
    } else {
      // 数据库未准备好，加入队列
      console.log("数据库尚未准备好，将请求加入队列");
      pendingRequests.push({
        execute: operation,
        resolve: resolve,
        reject: reject
      });

      // 如果数据库尚未初始化，则初始化
      if (!db) {
        console.log("尝试初始化数据库...");
        openDatabase().catch(err => {
          console.error("数据库初始化失败:", err);
          // 通知所有待处理请求失败
          const failedRequests = pendingRequests.splice(0, pendingRequests.length);
          failedRequests.forEach(req => {
            req.reject(new Error("数据库初始化失败"));
          });
        });
      }
    }
  });
}

// 打开自定义词组数据库
function openCustomPhrasesDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(customPhrasesDBName, customPhrasesDBVersion);

    request.onupgradeneeded = event => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;
      console.log(`自定义词组数据库升级: 从版本 ${oldVersion} 到版本 ${customPhrasesDBVersion}`);

      // 创建自定义词组对象存储
      if (!db.objectStoreNames.contains("customPhrases")) {
        const store = db.createObjectStore("customPhrases", { keyPath: "word" });
        store.createIndex("language", "language", { unique: false }); // 创建language索引
        store.createIndex("status", "status", { unique: false }); // 创建status索引
        console.log("创建customPhrases对象存储及索引(language, status)");
      }
    };

    request.onsuccess = event => {
      customPhrasesDB = event.target.result;
      customPhrasesDBReady = true;
      console.log("自定义词组数据库初始化成功，处理待处理请求...");
      // 处理待处理的请求
      processCustomPhrasesPendingRequests();

      // 数据迁移：将主数据库中的自定义词组迁移到新数据库
      migrateCustomPhrasesToNewDB().then(() => {
        console.log("自定义词组数据迁移完成");
        resolve(customPhrasesDB);
      }).catch(err => {
        console.error("自定义词组数据迁移失败:", err);
        resolve(customPhrasesDB); // 即使迁移失败也继续
      });
    };

    request.onerror = event => {
      console.error("打开自定义词组数据库失败:", event.target.error);
      reject(event.target.error);
    };
  });
}

// 处理自定义词组数据库待处理请求
function processCustomPhrasesPendingRequests() {
  while (customPhrasesPendingRequests.length > 0) {
    const request = customPhrasesPendingRequests.shift();
    try {
      request.execute()
        .then(result => request.resolve(result))
        .catch(error => request.reject(error));
    } catch (error) {
      console.error("处理自定义词组请求失败:", error);
      request.reject(error);
    }
  }
}

// 确保自定义词组数据库操作安全执行的包装函数
function ensureCustomPhrasesDB(operation) {
  return new Promise((resolve, reject) => {
    if (customPhrasesDBReady && customPhrasesDB) {
      // 数据库已准备好，直接执行操作
      operation()
        .then(resolve)
        .catch(reject);
    } else {
      // 数据库未准备好，加入队列
      console.log("自定义词组数据库尚未准备好，将请求加入队列");
      customPhrasesPendingRequests.push({
        execute: operation,
        resolve: resolve,
        reject: reject
      });

      // 如果数据库尚未初始化，则初始化
      if (!customPhrasesDB) {
        console.log("尝试初始化自定义词组数据库...");
        openCustomPhrasesDatabase().catch(err => {
          console.error("自定义词组数据库初始化失败:", err);
          // 通知所有待处理请求失败
          const failedRequests = customPhrasesPendingRequests.splice(0, customPhrasesPendingRequests.length);
          failedRequests.forEach(req => {
            req.reject(new Error("自定义词组数据库初始化失败"));
          });
        });
      }
    }
  });
}

// 数据迁移：将主数据库中的自定义词组迁移到新数据库
async function migrateCustomPhrasesToNewDB() {
  // 检查是否已经迁移过
  const migrationKey = 'customPhrasesMigrated';
  const migrated = await new Promise(resolve => {
    chrome.storage.local.get([migrationKey], result => {
      resolve(result[migrationKey] || false);
    });
  });

  if (migrated) {
    console.log("自定义词组已迁移，跳过迁移");
    return;
  }

  console.log("开始迁移自定义词组到新数据库...");

  return new Promise((resolve, reject) => {
    if (!db || !customPhrasesDB) {
      reject(new Error("数据库未初始化"));
      return;
    }

    const tx = db.transaction("wordDetails", "readonly");
    const store = tx.objectStore("wordDetails");
    const request = store.getAll();

    request.onsuccess = event => {
      const allWords = event.target.result || [];
      const customWords = allWords.filter(word => word.isCustom === true);

      console.log(`找到 ${customWords.length} 个自定义词组需要迁移`);

      if (customWords.length === 0) {
        // 标记为已迁移
        chrome.storage.local.set({ [migrationKey]: true });
        resolve();
        return;
      }

      // 写入自定义词组数据库
      const customTx = customPhrasesDB.transaction("customPhrases", "readwrite");
      const customStore = customTx.objectStore("customPhrases");
      let migratedCount = 0;

      customWords.forEach(wordData => {
        const customPhraseRecord = {
          word: wordData.word,
          status: wordData.status || '1',
          language: wordData.language || ''
        };

        const putReq = customStore.put(customPhraseRecord);
        putReq.onsuccess = () => {
          migratedCount++;
          if (migratedCount === customWords.length) {
            console.log(`成功迁移 ${migratedCount} 个自定义词组`);
            // 标记为已迁移
            chrome.storage.local.set({ [migrationKey]: true });
            resolve();
          }
        };
        putReq.onerror = e => {
          console.error("迁移自定义词组失败:", e.target.error);
        };
      });
    };

    request.onerror = event => {
      console.error("读取主数据库失败:", event.target.error);
      reject(event.target.error);
    };
  });
}

// 初始化数据库
openDatabase()
  .then(() => {
    console.log("主数据库初始化完成");
    // 初始化自定义词组数据库
    return openCustomPhrasesDatabase();
  })
  .then(() => {
    console.log("自定义词组数据库初始化完成");
  })
  .catch(err => {
    console.error("数据库初始化失败:", err);
  });

// ============================
// IndexedDB 辅助函数
// ============================

// 智能合并两个单词记录的函数
function mergeWordRecords(localRecord, remoteRecord, word) {
  // 创建合并后的记录，以本地记录为基础
  const mergedRecord = { ...localRecord };
  let hasChanges = false;
  let changeDetails = [];

  // 合并翻译数组
  if (remoteRecord.translations && Array.isArray(remoteRecord.translations)) {
    if (!mergedRecord.translations) mergedRecord.translations = [];

    remoteRecord.translations.forEach(translation => {
      if (translation && translation.trim() && !mergedRecord.translations.includes(translation.trim())) {
        mergedRecord.translations.push(translation.trim());
        hasChanges = true;
        changeDetails.push(`添加新翻译: ${translation.trim()}`);
      }
    });
  }

  // 合并标签数组
  if (remoteRecord.tags && Array.isArray(remoteRecord.tags)) {
    if (!mergedRecord.tags) mergedRecord.tags = [];

    remoteRecord.tags.forEach(tag => {
      if (tag && tag.trim() && !mergedRecord.tags.includes(tag.trim())) {
        mergedRecord.tags.push(tag.trim());
        hasChanges = true;
        console.log(`添加新标签: ${tag.trim()}`);
      }
    });
  }

  // 合并例句数组
  if (remoteRecord.sentences && Array.isArray(remoteRecord.sentences)) {
    if (!mergedRecord.sentences) mergedRecord.sentences = [];

    remoteRecord.sentences.forEach(sentenceObj => {
      if (sentenceObj && sentenceObj.sentence) {
        const exists = mergedRecord.sentences.some(existing =>
          existing.sentence === sentenceObj.sentence
        );
        if (!exists) {
          mergedRecord.sentences.push(sentenceObj);
          hasChanges = true;
          changeDetails.push(`添加新例句: ${sentenceObj.sentence.substring(0, 50)}...`);
        }
      }
    });
  }

  // 合并状态历史（如果远程有更新的状态变化）
  if (remoteRecord.statusHistory && typeof remoteRecord.statusHistory === 'object') {
    if (!mergedRecord.statusHistory) mergedRecord.statusHistory = {};

    Object.keys(remoteRecord.statusHistory).forEach(timestamp => {
      if (!mergedRecord.statusHistory[timestamp]) {
        mergedRecord.statusHistory[timestamp] = remoteRecord.statusHistory[timestamp];
        hasChanges = true;
        console.log(`添加新状态历史: ${timestamp}`);
      }
    });
  }

  // 保持最新的状态（优先使用时间戳更新的状态）
  if (remoteRecord.status !== undefined) {
    const localLastUpdate = getLastStatusUpdateTime(mergedRecord.statusHistory);
    const remoteLastUpdate = getLastStatusUpdateTime(remoteRecord.statusHistory);

    if (remoteLastUpdate > localLastUpdate) {
      mergedRecord.status = remoteRecord.status;
      hasChanges = true;
      changeDetails.push(`更新状态为: ${remoteRecord.status}`);
    }
  }

  // 保持最新的语言设置
  if (remoteRecord.language && remoteRecord.language !== mergedRecord.language) {
    mergedRecord.language = remoteRecord.language;
    hasChanges = true;
    changeDetails.push(`更新语言为: ${remoteRecord.language}`);
  }

  // 确保必要字段存在
  if (!mergedRecord.word) mergedRecord.word = word.toLowerCase();
  if (!mergedRecord.term) mergedRecord.term = word;

  // 如果有变化，打印详细信息
  if (hasChanges) {
    console.log(`合并单词: ${word}`);
    changeDetails.forEach(detail => console.log(`  - ${detail}`));
  }

  return hasChanges ? mergedRecord : localRecord;
}

// 获取状态历史中最后更新的时间戳
function getLastStatusUpdateTime(statusHistory) {
  if (!statusHistory || typeof statusHistory !== 'object') return 0;

  const timestamps = Object.keys(statusHistory).map(ts => parseInt(ts)).filter(ts => !isNaN(ts));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

// 获取单词详情
//对于您的代码，现在使用highlightManager.wordDetailsFromDB对象缓存是一个很好的性能优化。
// 特别是在检查单词状态这种频繁操作中，使用本地对象可以使界面响应更加流畅，避免不必要的数据库查询延迟。
function getWordDetailsFromDB(word) {
  const key = word.toLowerCase();
  return ensureDB(() => {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction("wordDetails", "readonly");
        const store = tx.objectStore("wordDetails");
        const req = store.get(key);
        req.onsuccess = event => resolve(event.target.result || {});
        req.onerror = event => reject(event.target.error);
      } catch (error) {
        reject(error);
      }
    });
  });
}

// 获取所有单词详情
// 返回一个对象，键为单词，值为单词详情
// 示例：
// {
//   "hello": {
//     "word": "hello",
//     "translations": ["你好"],
//     "tags": ["greeting"],
//     "status": "0",
//     "language": "zh-CN"
// 新增：获取数据库单词总数（
function getWordCount() {
  return ensureDB(() => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordDetails", "readonly");
      const store = tx.objectStore("wordDetails");
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        resolve(countRequest.result);
      };

      countRequest.onerror = event => reject(event.target.error);
    });
  });
}

// 新增：批量查询单词状态（按需加载）
// 只查询指定的单词列表，返回 word + status + isCustom
function batchGetWordStatus(words) {
  return ensureDB(() => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordDetails", "readonly");
      const store = tx.objectStore("wordDetails");
      const results = {};
      let completed = 0;

      if (words.length === 0) {
        resolve(results);
        return;
      }

      words.forEach(word => {
        const request = store.get(word.toLowerCase());

        request.onsuccess = () => {
          const item = request.result;
          if (item) {
            results[item.word] = {
              word: item.word,
              status: item.status,
              isCustom: item.isCustom
            };
          }

          completed++;
          if (completed === words.length) {
            resolve(results);
          }
        };

        request.onerror = () => {
          completed++;
          if (completed === words.length) {
            resolve(results);
          }
        };
      });
    });
  });
}

// 保留旧接口（用于options页面等）
// 新增：轻量级接口 - 只返回 word + status + isCustom
// 用于高亮系统初始化，大幅减少数据传输量
function getAllWordStatusMap() {
  return ensureDB(() => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordDetails", "readonly");
      const store = tx.objectStore("wordDetails");
      const req = store.getAll();
      req.onsuccess = event => {
        const detailsArr = event.target.result;
        const statusMap = {};
        detailsArr.forEach(item => {
          // 只保留高亮系统必需的字段
          statusMap[item.word] = {
            word: item.word,
            status: item.status,
            isCustom: item.isCustom
          };
        });
        resolve(statusMap);
      };
      req.onerror = event => reject(event.target.error);
    });
  });
}

function getAllWordDetailsFromDB() {
  return ensureDB(() => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordDetails", "readonly");
      const store = tx.objectStore("wordDetails");
      const req = store.getAll();
      req.onsuccess = event => {
        const detailsArr = event.target.result;
        const details = {};
        detailsArr.forEach(item => {
          let createdAtValue = null;
          let warningMessage = null;

          if (item.statusHistory && typeof item.statusHistory === 'object' && Object.keys(item.statusHistory).length > 0) {
            let earliestCreateTime = Infinity;
            let foundValidCreateTimeInHistory = false;

            Object.values(item.statusHistory).forEach(historyEntry => {
              if (historyEntry &&
                  typeof historyEntry.createTime === 'number' &&
                  !isNaN(historyEntry.createTime) &&
                  historyEntry.createTime > 0) { // 严格验证 createTime
                earliestCreateTime = Math.min(earliestCreateTime, historyEntry.createTime);
                foundValidCreateTimeInHistory = true;
              }
            });

            if (foundValidCreateTimeInHistory) {
              createdAtValue = earliestCreateTime;
            } else {
              warningMessage = `Word "${item.word}" has statusHistory but no valid createTime (>0) entries were found.`;
            }
          } else {
            // warningMessage = `Word "${item.word}" has no statusHistory or it's empty.`;
          }

          // 如果 statusHistory 中没有找到有效时间，则尝试回退逻辑
          if (createdAtValue === null) {
            // 尝试使用 item.id 作为时间戳
            const potentialTimestampFromId = parseInt(item.id, 10);
            if (!isNaN(potentialTimestampFromId) && potentialTimestampFromId > 0 && new Date(potentialTimestampFromId).getFullYear() > 1970) { // 假设 item.id 可能是毫秒时间戳
              createdAtValue = potentialTimestampFromId;
              // console.warn(`[Lingkuma - background.js] ${warningMessage} Using item.id ("${item.id}") as createdAt fallback for word "${item.word}".`);
            } else {
              // 最终回退到固定早期时间戳
              createdAtValue = new Date('1970-01-01T00:00:00.000Z').getTime();
              // console.warn(`[Lingkuma - background.js] ${warningMessage} Using fixed early timestamp (1970-01-01) as createdAt fallback for word "${item.word}".`);
            }
          }

          item.createdAt = createdAtValue;
          details[item.word] = item;
        });
        resolve(details);
      };
      req.onerror = event => reject(event.target.error);
    });
  });
}

// 添加翻译
function addTranslationToDB(word, translation) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    // 对翻译内容进行trim处理
    const trimmedTranslation = translation.trim();

    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");
    const getReq = store.get(key);
    getReq.onsuccess = event => {
      let record = event.target.result || { word: key, translations: [], tags: [], term: word };
      if (!record.term) record.term = word;
      if (!record.translations) record.translations = [];
      if (!record.translations.includes(trimmedTranslation)) {
        record.translations.push(trimmedTranslation);
      }
      const putReq = store.put(record);
      putReq.onsuccess = () => {
        // 云端同步
        if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
          // 等待云端同步完成后再resolve
          console.log('[CloudDB] Waiting for cloud sync to complete...');
          cloudSaveWord(record)
            .then(() => {
              console.log('[CloudDB] Cloud sync completed successfully');
              resolve();
            })
            .catch(err => {
              console.error('[CloudDB] Failed to sync translation:', err);
              // 即使云端同步失败，也resolve（因为本地已保存成功）
              resolve();
            });
        } else {
          // 非云端模式，直接resolve
          resolve();
        }
      };
      putReq.onerror = e => reject(e.target.error);
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// 删除翻译
function removeTranslationFromDB(word, translation) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");
    const getReq = store.get(key);
    getReq.onsuccess = event => {
      let record = event.target.result || { word: key, translations: [], tags: [], term: word };
      if (!record.term) record.term = word;
      if (record.translations) {
        record.translations = record.translations.filter(t => t !== translation);
      }
      const putReq = store.put(record);
      putReq.onsuccess = () => {
        // 云端同步
        if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
          // 等待云端同步完成后再resolve
          console.log('[CloudDB] Waiting for cloud sync to complete (remove translation)...');
          cloudSaveWord(record, 'overwrite')  // 使用overwrite模式，不合并云端数据
            .then(() => {
              console.log('[CloudDB] Cloud sync completed successfully (remove translation)');
              resolve();
            })
            .catch(err => {
              console.error('[CloudDB] Failed to sync translation removal:', err);
              // 即使云端同步失败，也resolve（因为本地已保存成功）
              resolve();
            });
        } else {
          // 非云端模式，直接resolve
          resolve();
        }
      };
      putReq.onerror = e => reject(e.target.error);
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// 添加标签
function addTagToDB(word, tag) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");
    const getReq = store.get(key);
    getReq.onsuccess = event => {
      let record = event.target.result || { word: key, translations: [], tags: [], term: word };
      if (!record.term) record.term = word;
      if (!record.tags) record.tags = [];
      if (!record.tags.includes(tag)) {
        record.tags.push(tag);
        const putReq = store.put(record);
        putReq.onsuccess = () => {
          // 云端同步
          if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
            // 等待云端同步完成后再resolve
            console.log('[CloudDB] Waiting for cloud sync to complete (add tag)...');
            cloudSaveWord(record)
              .then(() => {
                console.log('[CloudDB] Cloud sync completed successfully (add tag)');
                resolve();
              })
              .catch(err => {
                console.error('[CloudDB] Failed to sync tag:', err);
                // 即使云端同步失败，也resolve（因为本地已保存成功）
                resolve();
              });
          } else {
            // 非云端模式，直接resolve
            resolve();
          }
        };
        putReq.onerror = e => reject(e.target.error);
      } else {
        resolve(); // 如果标签已存在，直接返回成功
      }
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// 删除标签
function removeTagFromDB(word, tag) {
  console.log("删除标签：",word,tag);
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");
    const getReq = store.get(key);
    getReq.onsuccess = event => {
      let record = event.target.result || { word: key, translations: [], tags: [], term: word };
      if (!record.term) record.term = word;
      if (record.tags) {
        record.tags = record.tags.filter(t => t !== tag);
      }
      const putReq = store.put(record);
      putReq.onsuccess = () => {
        // 云端同步
        if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
          // 等待云端同步完成后再resolve
          console.log('[CloudDB] Waiting for cloud sync to complete (remove tag)...');
          cloudSaveWord(record, 'overwrite')  // 使用overwrite模式，不合并云端数据
            .then(() => {
              console.log('[CloudDB] Cloud sync completed successfully (remove tag)');
              resolve();
            })
            .catch(err => {
              console.error('[CloudDB] Failed to sync tag removal:', err);
              // 即使云端同步失败，也resolve（因为本地已保存成功）
              resolve();
            });
        } else {
          // 非云端模式，直接resolve
          resolve();
        }
      };
      putReq.onerror = e => reject(e.target.error);
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// 更新自定义词组数据库中的词组
function updateCustomPhraseInDB(word, status, language) {
  return ensureCustomPhrasesDB(() => {
    return new Promise((resolve, reject) => {
      const key = word.toLowerCase();
      const tx = customPhrasesDB.transaction("customPhrases", "readwrite");
      const store = tx.objectStore("customPhrases");

      const customPhraseRecord = {
        word: key,
        status: status || '1',
        language: language || ''
      };

      const putReq = store.put(customPhraseRecord);
      putReq.onsuccess = () => {
        console.log(`自定义词组 "${word}" 已写入自定义词组数据库`);

        // 云端同步
        if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
          cloudSavePhrase(customPhraseRecord).catch(err => {
            console.error('[CloudDB] Failed to sync custom phrase:', err);
          });
        }

        resolve();
      };
      putReq.onerror = e => {
        console.error(`写入自定义词组 "${word}" 失败:`, e.target.error);
        reject(e.target.error);
      };
    });
  });
}

// 更新单词状态
function updateWordStatusInDB(word, status, language, isCustom = false) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");
    const getReq = store.get(key);

    getReq.onsuccess = event => {
      let record = event.target.result || {
        word: key,
        term: word,
        statusHistory: {}, // 用于存储每个状态的时间记录
        isCustom: false // 默认不是自定义词组
      };

      if (!record.term) record.term = word;
      if (!record.statusHistory) record.statusHistory = {};
      if (record.isCustom === undefined) record.isCustom = false;

      // 更新当前状态
      record.status = status;
      record.language = language;

      // 如果是自定义词组，设置标记
      if (isCustom) {
        record.isCustom = true;
        console.log(`标记为自定义词组: ${word}`);
      }

      // 更新状态历史记录
      if (!record.statusHistory[status]) {
        // 如果这个状态第一次出现，创建新的记录
        record.statusHistory[status] = {
          createTime: Date.now(),
          updateTime: Date.now()
        };
      } else {
        // 如果状态已存在，只更新 updateTime
        record.statusHistory[status].updateTime = Date.now();
      }

      const putReq = store.put(record);
      putReq.onsuccess = () => {
        // 本地数据库更新成功后的处理
        const handleSuccess = () => {
          // 如果是自定义词组，同时写入自定义词组数据库
          if (isCustom) {
            console.log('自定义词组已更新，同时写入自定义词组数据库');

            // 写入自定义词组数据库
            updateCustomPhraseInDB(word, status, language)
              .then(() => {
                console.log('自定义词组数据库更新成功');

                // 通知内容脚本增量更新高亮
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                  if (tabs[0]) {
                    // 判断是新增还是状态更新
                    const isNewWord = !event.target.result; // 如果原来没有记录，说明是新增

                    // 发送增量更新消息
                    chrome.tabs.sendMessage(tabs[0].id, {
                      action: 'customWordUpdated',
                      word: word,
                      status: status,
                      isCustom: isCustom,
                      language: language,
                      updateType: isNewWord ? 'newWord' : 'statusChange'
                    }).catch(() => {
                      // 忽略发送失败的错误
                    });
                  }
                });

                resolve();
              })
              .catch(err => {
                console.error('自定义词组数据库更新失败:', err);
                // 即使自定义词组数据库更新失败，主数据库已成功，仍然resolve
                resolve();
              });
          } else {
            resolve();
          }
        };

        // 云端同步逻辑（双写模式）
        if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
          console.log('[CloudDB] Syncing word status to cloud:', word);
          cloudSaveWord(record)
            .then(() => {
              console.log('[CloudDB] Word synced to cloud successfully');
            })
            .catch(err => {
              console.error('[CloudDB] Failed to sync to cloud:', err);
              // 云端同步失败不影响本地操作
            })
            .finally(() => {
              handleSuccess();
            });
        } else {
          handleSuccess();
        }
      };
      putReq.onerror = e => reject(e.target.error);
    };

    getReq.onerror = e => reject(e.target.error);
  });
}

// 新增函数：添加例句到数据库
function addSentenceToDB(word, sentence, translation,url) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");
    const getReq = store.get(key);
    getReq.onsuccess = event => {
      // 如果记录不存在，则创建包含 sentences 数组的新记录
      let record = event.target.result || { word: key, translations: [], tags: [], sentences: [], term: word };
      if (!record.term) record.term = word;
      if (!record.sentences) record.sentences = [];
      // 检查该例句是否已存在（避免重复添加）
      const exists = record.sentences.some(item => item.sentence === sentence);
      if (!exists) {
        record.sentences.push({ sentence: sentence, translation: translation,url:url });
      }
      const putReq = store.put(record);
      putReq.onsuccess = () => {
        // 云端同步
        if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
          // 等待云端同步完成后再resolve
          console.log('[CloudDB] Waiting for cloud sync to complete (add sentence)...');
          cloudSaveWord(record)
            .then(() => {
              console.log('[CloudDB] Cloud sync completed successfully (add sentence)');
              resolve();
            })
            .catch(err => {
              console.error('[CloudDB] Failed to sync sentence:', err);
              // 即使云端同步失败，也resolve（因为本地已保存成功）
              resolve();
            });
        } else {
          // 非云端模式，直接resolve
          resolve();
        }
      };
      putReq.onerror = e => reject(e.target.error);
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// 新增函数：从数据库中删除例句
function removeSentenceFromDB(word, sentence) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");
    const getReq = store.get(key);
    getReq.onsuccess = event => {
      let record = event.target.result;
      if (record && record.sentences) {
        console.log("[background.js] 删除例句前，例句列表:", record.sentences); // 添加日志
        // 过滤掉要删除的例句
        record.sentences = record.sentences.filter(item => item.sentence !== sentence);
        console.log("[background.js] 删除例句后，例句列表:", record.sentences); // 添加日志
        const putReq = store.put(record);
        putReq.onsuccess = () => {
          // 云端同步
          if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
            // 等待云端同步完成后再resolve
            console.log('[CloudDB] Waiting for cloud sync to complete (remove sentence)...');
            cloudSaveWord(record, 'overwrite')  // 使用overwrite模式，不合并云端数据
              .then(() => {
                console.log('[CloudDB] Cloud sync completed successfully (remove sentence)');
                resolve();
              })
              .catch(err => {
                console.error('[CloudDB] Failed to sync sentence removal:', err);
                // 即使云端同步失败，也resolve（因为本地已保存成功）
                resolve();
              });
          } else {
            // 非云端模式，直接resolve
            resolve();
          }
        };
        putReq.onerror = e => reject(e.target.error);
      } else {
        resolve(); // 若没有记录也直接返回成功
      }
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// 从自定义词组数据库中删除词组
function deleteCustomPhraseFromDB(word) {
  return ensureCustomPhrasesDB(() => {
    return new Promise((resolve, reject) => {
      const key = word.toLowerCase();
      const tx = customPhrasesDB.transaction("customPhrases", "readwrite");
      const store = tx.objectStore("customPhrases");
      const deleteReq = store.delete(key);
      deleteReq.onsuccess = () => {
        console.log(`[background.js] 自定义词组 ${word} 已从自定义词组数据库中删除`);

        // 云端同步删除
        if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
          cloudDeletePhrase(key).catch(err => {
            console.error('[CloudDB] Failed to sync custom phrase deletion:', err);
          });
        }

        resolve();
      };
      deleteReq.onerror = e => {
        console.error(`删除自定义词组 ${word} 失败:`, e.target.error);
        reject(e.target.error);
      };
    });
  });
}

// 新增函数：从数据库中完全删除单词（小写化）
function deleteWordFromDB(word) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");

    // 先获取记录，检查是否是自定义词组
    const getReq = store.get(key);
    getReq.onsuccess = event => {
      const record = event.target.result;
      const isCustom = record && record.isCustom === true;

      // 删除主数据库中的记录
      const deleteReq = store.delete(key);
      deleteReq.onsuccess = () => {
        console.log(`[background.js] 单词 ${word} (小写key: ${key}) 已从主数据库中完全删除`);

        // 云端同步删除
        const syncToCloud = () => {
          if (cloudConfig.enabled && cloudConfig.dualWrite && cloudConfig.token) {
            cloudDeleteWord(key).catch(err => {
              console.error('[CloudDB] Failed to sync word deletion:', err);
            });
          }
        };

        // 如果是自定义词组，同时从自定义词组数据库中删除
        if (isCustom) {
          deleteCustomPhraseFromDB(word)
            .then(() => {
              console.log(`自定义词组 ${word} 已从两个数据库中完全删除`);
              syncToCloud();
              resolve();
            })
            .catch(err => {
              console.error(`删除自定义词组数据库记录失败:`, err);
              // 即使自定义词组数据库删除失败，主数据库已删除，仍然resolve
              syncToCloud();
              resolve();
            });
        } else {
          syncToCloud();
          resolve();
        }
      };
      deleteReq.onerror = e => reject(e.target.error);
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// 新增函数：从数据库中删除单词原型（不转换大小写）
function deleteWordExactFromDB(word) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("wordDetails", "readwrite");
    const store = tx.objectStore("wordDetails");

    // 先获取记录，检查是否是自定义词组
    const getReq = store.get(word);
    getReq.onsuccess = event => {
      const record = event.target.result;
      const isCustom = record && record.isCustom === true;

      // 删除主数据库中的记录
      const deleteReq = store.delete(word);
      deleteReq.onsuccess = () => {
        console.log(`[background.js] 单词原型 ${word} 已从主数据库中完全删除`);

        // 如果是自定义词组，同时从自定义词组数据库中删除
        if (isCustom) {
          deleteCustomPhraseFromDB(word)
            .then(() => {
              console.log(`自定义词组原型 ${word} 已从两个数据库中完全删除`);
              resolve();
            })
            .catch(err => {
              console.error(`删除自定义词组数据库记录失败:`, err);
              // 即使自定义词组数据库删除失败，主数据库已删除，仍然resolve
              resolve();
            });
        } else {
          resolve();
        }
      };
      deleteReq.onerror = e => reject(e.target.error);
    };
    getReq.onerror = e => reject(e.target.error);
  });
}

// ============================
// OhMyGPT API 交互函数
// ============================
const OHMYGPT_API_BASE_URL = "https://api.lingkuma.org"; // 将来可能需要修改为线上地址
// const OHMYGPT_API_BASE_URL = "http://localhost:3000"; // 将来可能需要修改为线上地址

async function ohMyGptGetToken(code) {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({ code });
  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow"
  };

  try {
    const response = await fetch(`${OHMYGPT_API_BASE_URL}/api/auth/ohmygpt/getToken`, requestOptions);
    if (!response.ok) {
      // 如果响应状态不是 2xx，尝试解析错误信息
      const errorText = await response.text();
      console.error("OhMyGPT getToken API 错误:", response.status, errorText);
      throw new Error(`API 请求失败: ${response.status} ${errorText}`);
    }
    const result = await response.json(); // 假设 API 返回 JSON 格式
    console.log("OhMyGPT getToken 成功:", result);
    return result
  } catch (error) {
    console.error("调用 OhMyGPT getToken API 时出错:", error);
    return { success: false, error: error.message };
  }
}

async function ohMyGptAddDays(userId, token) {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({ user_id: userId, token });
  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow"
  };

  try {
    const response = await fetch(`${OHMYGPT_API_BASE_URL}/api/auth/ohmygpt/addDays`, requestOptions);
     if (!response.ok) {
      const errorText = await response.text();
      console.error("OhMyGPT addDays API 错误:", response.status, errorText);
      throw new Error(`API 请求失败: ${response.status} ${errorText}`);
    }
    const result = await response.json(); // 假设 API 返回 JSON
    console.log("OhMyGPT addDays 成功:", result);
    return result
  } catch (error) {
    console.error("调用 OhMyGPT addDays API 时出错:", error);
    return { success: false, error: error.message };
  }
}

async function ohMyGptSendDollar(token, amount) {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({ token, amount });
  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow"
  };

  try {
    const response = await fetch(`${OHMYGPT_API_BASE_URL}/api/auth/ohmygpt/sendDoller`, requestOptions); // 注意 API 路径是 sendDoller
     if (!response.ok) {
      const errorText = await response.text();
      console.error("OhMyGPT sendDollar API 错误:", response.status, errorText);
      throw new Error(`API 请求失败: ${response.status} ${errorText}`);
    }
    const result = await response.json(); // 假设 API 返回 JSON
    console.log("OhMyGPT sendDollar 成功:", result);
    return result
  } catch (error) {
    console.error("调用 OhMyGPT sendDollar API 时出错:", error);
    return { success: false, error: error.message };
  }
}

async function ohMyGptGetDays(userId) {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");

  const raw = JSON.stringify({ user_id: userId });
  const requestOptions = {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow"
  };

  try {
    const response = await fetch(`${OHMYGPT_API_BASE_URL}/api/auth/ohmygpt/getDays`, requestOptions);
     if (!response.ok) {
      const errorText = await response.text();
      console.error("OhMyGPT getDays API 错误:", response.status, errorText);
      // API 请求失败，设置状态为无效
      await chrome.storage.local.set({ 'isOhMyGptValid': false });
      console.log("OhMyGPT API 请求失败，已更新本地存储 isOhMyGptValid: false");
      throw new Error(`API 请求失败: ${response.status} ${errorText}`);
    }
    const result = await response.json(); // 假设 API 返回 JSON
    console.log("OhMyGPT getDays 成功:", result);

    // --- 修改代码：根据 expire_time 更新本地存储 ---
    let isValid = false; // 默认无效
    if (result.success && result.data && result.data.expire_time) {
      try {
        const expireDate = new Date(result.data.expire_time);
        const now = new Date();
        // 检查 expireDate 是否是有效的日期对象，并且是否晚于当前时间
        if (!isNaN(expireDate.getTime()) && expireDate > now) {
          isValid = true;
        } else {
           console.log(`OhMyGPT 过期时间 (${expireDate.toISOString()}) 不晚于当前时间 (${now.toISOString()}) 或无效`);
        }
      } catch (dateError) {
        console.error("解析 OhMyGPT 过期时间失败:", dateError);
        // 解析日期出错也视为无效
        isValid = false;
      }
    } else {
        console.log("OhMyGPT API 返回数据格式不符合预期或请求未成功");
    }

    await chrome.storage.local.set({ 'isOhMyGptValid': isValid });
    console.log(`OhMyGPT 状态已更新，本地存储 isOhMyGptValid: ${isValid}`);
    // --- 修改代码结束 ---

    return result // 返回原始 API 结果
  } catch (error) {
    console.error("调用 OhMyGPT getDays API 时出错:", error);
    // 捕获到任何错误，设置状态为无效
    await chrome.storage.local.set({ 'isOhMyGptValid': false });
    console.log("OhMyGPT API 调用出错，已更新本地存储 isOhMyGptValid: false");
    return { success: false, error: error.message };
  }
}

// ============================
// API Key 管理函数
// ============================

// 获取被屏蔽的 API Keys
async function getBlockedApiKeys() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['blockedApiKeys'], (result) => {
      resolve(result.blockedApiKeys || []);
    });
  });
}

// 屏蔽一个 API Key
async function blockApiKey(apiKey, reason = '') {
  const blockedKeys = await getBlockedApiKeys();
  const keyHash = hashApiKey(apiKey); // 使用哈希避免存储完整key
  
  if (!blockedKeys.find(item => item.keyHash === keyHash)) {
    blockedKeys.push({
      keyHash: keyHash,
      keyPreview: apiKey.substring(0, 8) + '...', // 只存储前8位用于识别
      blockedAt: Date.now(),
      reason: reason
    });
    
    // await chrome.storage.local.set({ blockedApiKeys: blockedKeys });
    console.log(`[background.js] API Key 已屏蔽: ${apiKey.substring(0, 8)}... 原因: ${reason}`);
  }
}

// 解除屏蔽一个 API Key
async function unblockApiKey(apiKey) {
  const blockedKeys = await getBlockedApiKeys();
  const keyHash = hashApiKey(apiKey);
  
  const filteredKeys = blockedKeys.filter(item => item.keyHash !== keyHash);
  await chrome.storage.local.set({ blockedApiKeys: filteredKeys });
  console.log(`[background.js] API Key 已解除屏蔽: ${apiKey.substring(0, 8)}...`);
}

// 检查 API Key 是否被屏蔽
async function isApiKeyBlocked(apiKey) {
  const blockedKeys = await getBlockedApiKeys();
  const keyHash = hashApiKey(apiKey);
  return blockedKeys.some(item => item.keyHash === keyHash);
}

// 简单的哈希函数（用于存储key的标识）
function hashApiKey(apiKey) {
  let hash = 0;
  for (let i = 0; i < apiKey.length; i++) {
    const char = apiKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// 从多个 API Keys 中选择一个未被屏蔽的
async function selectValidApiKey(apiKeys) {
  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    return null;
  }

  const blockedKeys = await getBlockedApiKeys();
  const validKeys = [];

  for (const key of apiKeys) {
    const keyHash = hashApiKey(key);
    if (!blockedKeys.some(item => item.keyHash === keyHash)) {
      validKeys.push(key);
    }
  }

  if (validKeys.length === 0) {
    console.warn('[background.js] 所有 API Keys 都已被屏蔽！');
    return null;
  }

  // 随机选择一个有效的key
  return validKeys[Math.floor(Math.random() * validKeys.length)];
}

// 从多平台 API 池中选择一个未被屏蔽的配置
async function selectValidApiConfig(apiPools) {
  if (!apiPools || typeof apiPools !== 'object') {
    return null;
  }

  const blockedKeys = await getBlockedApiKeys();
  const validConfigs = [];

  // 遍历所有平台
  for (const [platformName, platformConfig] of Object.entries(apiPools)) {
    if (!platformConfig.keys || !Array.isArray(platformConfig.keys)) {
      continue;
    }

    // 遍历该平台的所有 keys
    for (const key of platformConfig.keys) {
      const keyHash = hashApiKey(key);
      if (!blockedKeys.some(item => item.keyHash === keyHash)) {
        validConfigs.push({
          platform: platformName,
          baseURL: platformConfig.baseURL,
          model: platformConfig.model,
          apiKey: key
        });
      }
    }
  }

  if (validConfigs.length === 0) {
    console.warn('[background.js] 所有平台的 API Keys 都已被屏蔽！');
    return null;
  }

  // 随机选择一个有效的配置
  const selectedConfig = validConfigs[Math.floor(Math.random() * validConfigs.length)];
  console.log(`[background.js] 从 ${Object.keys(apiPools).length} 个平台中选择: ${selectedConfig.platform} (共 ${validConfigs.length} 个可用配置)`);
  return selectedConfig;
}

// ============================
// AI 请求处理函数（避免 Firefox CSP 限制）
// ============================
async function handleAIRequest({ word, sentence, stream = false, messages, model = null, temperature = 1, tabId = null, isSidebarRequest = false }) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['aiConfig'], async (result) => {
      try {
        // 提供一个默认的空配置对象，以防 result 或 result.aiConfig 不存在
        const responseConfig = result?.aiConfig || {};

        // 获取 AI 通道，默认为 'default' 或其他非 'ohmygpt' 的值
        const aiChannel = responseConfig.aiChannel;

        // 初始化最终使用的配置对象
        let config = {
          apiBaseURL: "",
          apiModel: "",
          apiKey: ""
        };

        // 根据 aiChannel 选择并映射配置
        if (aiChannel === "ohmygpt") {
          // 如果是 ohmygpt 通道，使用 ohmygpt 的特定配置项
          config.apiBaseURL = responseConfig.ohmygptBaseUrl || "https://c-z0-api-01.hash070.com/v1/chat/completions";
          config.apiModel = responseConfig.ohmygptModel || "gemini-2.5-flash";
          config.apiKey = responseConfig.ohmygptToken || "";
          console.log("使用 OhMyGPT 配置:", config);
        } else {
          // 否则，使用默认的 API 配置项
          let apiKey = responseConfig.apiKey;
          let apiBaseURL = responseConfig.apiBaseURL;
          let apiModel = responseConfig.apiModel;

          // 如果用户配置了多个 API Key（用逗号或换行分隔）
          if (apiKey && (apiKey.includes(',') || apiKey.includes('\n'))) {
            const apiKeys = apiKey.split(/[,\n]/).map(k => k.trim()).filter(k => k);
            if (apiKeys.length > 0) {
              const selectedKey = await selectValidApiKey(apiKeys);
              if (selectedKey) {
                apiKey = selectedKey;
                console.log(`[background.js] 从用户配置中选择有效 API Key (${apiKeys.length} 个可用)`);
              } else {
                console.error('[background.js] 用户配置的所有 API Keys 都已被屏蔽');
                reject(new Error("所有配置的 API Keys 都已失效，请检查设置或联系管理员"));
                return;
              }
            }
            // 使用用户配置的 baseURL 和 model
            config.apiBaseURL = apiBaseURL || "https://open.bigmodel.cn/api/paas/v4/chat/completions";
            config.apiModel = apiModel || "GLM-4-Flash";
            config.apiKey = apiKey;
          } else if (!apiKey) {
            // 默认的多平台 API 池配置
            const defaultApiPools = {
              bigmodel: {
                baseURL: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                model: "GLM-4-Flash",
                keys: [
                  atob("YmFlMjdlNDQyODgyNGZlOGExNjFlZTc0ZDYyZWIzM2YubW5uOEVoNEplVG9kcmY0bg=="),
                  atob("ODUwZTNlMmEzYmVkNDg2N2I2MGIzZWI2NmUyMDAyNjMuYWhSOGhxYkJvaG1wRG81eg=="),
                  atob("MGZmMDYwNTZlODhhNGNlMmI1ZTA4NzIxZTNjNGNkNmQuMnV0djhRaDVlZU1jcnJHcA=="),
                  atob("YzZhYzJlYjllMTJiNGJiNWEwZDczYzliNzZkODEzNzAuRnpITlNoZnFteEx4MHV4WA=="),
                  atob("ZjAwMmZlNTUzNGQ4NDYxNWEyM2VjOTlhODM1ZDZiM2UuR2h1NVRrSmVDS0xiSGhMZA=="),
                ]
              }
            };

            const selectedConfig = await selectValidApiConfig(defaultApiPools);
            if (selectedConfig) {
              config.apiBaseURL = selectedConfig.baseURL;
              config.apiModel = selectedConfig.model;
              config.apiKey = selectedConfig.apiKey;
              console.log(`[background.js] 使用平台: ${selectedConfig.platform}`);
            } else {
              console.error('[background.js] 所有平台的 API Keys 都已被屏蔽');
              reject(new Error("所有默认 API Keys 都已失效，请配置新的 API Key"));
              return;
            }
          } else {
            // 用户配置了单个 API Key
            config.apiBaseURL = apiBaseURL || "https://open.bigmodel.cn/api/paas/v4/chat/completions";
            config.apiModel = apiModel || "GLM-4-Flash";
            config.apiKey = apiKey;
          }
        }
        // 检查 API Key 是否配置
        if (!config.apiKey) {
          reject(new Error("AI API Key 或 Token 未配置，请在插件设置中填写"));
          return;
        }

        console.log("[background.js] 发起 AI 请求到:", config.apiBaseURL);

        const response = await fetch(config.apiBaseURL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
            "x-gemini-legacy-support": "true",
          },
          body: JSON.stringify({
            model: model || config.apiModel,
            messages: messages,
            stream: stream,
            temperature: temperature
          })
        });

        if (!response.ok) {
          // 检查是否是 API Key 失效的错误
          const shouldBlockKey = response.status === 401 || // 未授权
                                 response.status === 403 || // 禁止访问
                                 response.status === 429;   // 请求过多（可能是配额用尽）
          
          if (shouldBlockKey && config.apiKey) {
            const errorReason = `HTTP ${response.status}: ${response.statusText}`;
            await blockApiKey(config.apiKey, errorReason);
            console.error(`[background.js] API Key 因错误被屏蔽: ${errorReason}`);
          }
          
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (stream) {
          // 处理流式响应
          console.log("[background.js] 开始处理流式响应");

          const reader = response.body.getReader();
          let buffer = '';
          let isFirstChunk = true;

          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  // 处理最后可能残留的数据
                  if (buffer.trim()) {
                    try {
                      const data = JSON.parse(buffer);
                      const content = data.choices?.[0]?.delta?.content;
                      if (content) {
                        if (isSidebarRequest) {
                          // 发送流式数据到侧栏
                          chrome.runtime.sendMessage({
                            action: "streamUpdate",
                            data: {
                              content: content,
                              isFirstChunk: false
                            }
                          }).catch(err => console.log("发送侧栏流式数据失败:", err));
                        } else if (tabId) {
                          // 发送流式数据到content script
                          chrome.tabs.sendMessage(tabId, {
                            action: "streamChunk",
                            data: {
                              content: content,
                              isFirstChunk: false,
                              isDone: true
                            }
                          }).catch(err => console.log("发送流式数据失败:", err));
                        }
                      }
                    } catch (e) {
                      console.log("解析最后数据块失败:", e);
                    }
                  }

                  // 发送完成信号
                  if (tabId) {
                    chrome.tabs.sendMessage(tabId, {
                      action: "streamComplete",
                      data: { word, sentence }
                    }).catch(err => console.log("发送完成信号失败:", err));
                  }
                  
                  if (isSidebarRequest) {
                    chrome.runtime.sendMessage({
                      action: "streamComplete",
                      data: { word, sentence }
                    }).catch(err => console.log("发送侧边栏完成信号失败:", err));
                  }

                  resolve({ success: true, stream: true });
                  break;
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
                        if (isSidebarRequest) {
                          // 发送流式数据到侧栏
                          console.log('[Background] 发送 streamUpdate 到侧栏:', { content, isFirstChunk });
                          chrome.runtime.sendMessage({
                            action: "streamUpdate",
                            data: {
                              content: content,
                              isFirstChunk: isFirstChunk
                            }
                          }).catch(err => console.log("发送侧栏流式数据失败:", err));
                        } else if (tabId) {
                          // 发送流式数据到content script
                          chrome.tabs.sendMessage(tabId, {
                            action: "streamChunk",
                            data: {
                              content: content,
                              isFirstChunk: isFirstChunk,
                              isDone: false
                            }
                          }).catch(err => console.log("发送流式数据失败:", err));
                        }

                        if (isFirstChunk) {
                          isFirstChunk = false;
                        }
                      }
                    } catch (e) {
                      console.log("解析流式数据失败:", e, "原始数据:", dataStr);
                    }
                  }
                }
              }
            } catch (error) {
              console.error("[background.js] 流式处理错误:", error);
              if (isSidebarRequest) {
                // 发送错误到侧栏
                chrome.runtime.sendMessage({
                  action: "streamUpdate",
                  data: {
                    content: `错误: ${error.message}`,
                    isFirstChunk: true
                  }
                }).catch(err => console.log("发送侧栏错误失败:", err));
              } else if (tabId) {
                chrome.tabs.sendMessage(tabId, {
                  action: "streamError",
                  data: { error: error.message }
                }).catch(err => console.log("发送错误信号失败:", err));
              }
              reject(error);
            }
          };

          processStream();
        } else {
          const data = await response.json();
          resolve(data);
        }
      } catch (error) {
        console.error("[background.js] AI 请求错误:", error);
        reject(error);
      }
    });
  });
}

// ============================
// 后台消息监听器（使用 IndexedDB 方式）
// ============================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[background.js] 收到消息:", message);

  if (message.action === 'getWordDetails') {
    const word = message.word;

    // 检查是否启用云端数据库
    chrome.storage.local.get(['cloudConfig'], async (result) => {
      const cloudEnabled = result.cloudConfig?.cloudDbEnabled || false;

      if (cloudEnabled && cloudAPI) {
        try {
          console.log('[background.js] 从云端获取单词详情:', word);
          await cloudAPI.init();
          const response = await cloudAPI.getWord(word);
          sendResponse({ details: response.data || {} });
        } catch (error) {
          console.error('[background.js] 云端获取失败:', error);
          // // 云端失败时回退到本地
          // getWordDetailsFromDB(word).then(details => {
          //   sendResponse({ details });
          // }).catch(err => {
          //   console.error("获取单词详情失败:", err);
          //   sendResponse({ details: {} });
          // });
          sendResponse({ details: {} });
        }
      } else {
        // 使用本地数据库
        getWordDetailsFromDB(word).then(details => {
          sendResponse({ details });
        }).catch(err => {
          console.error("获取单词详情失败:", err);
          sendResponse({ details: {} });
        });
      }
    });

    return true;
  }
  else if (message.action === 'getAllWordDetails') {
    console.log("[background.js] 开始获取所有单词详情, dbReady:", dbReady, "db:", !!db);
    getAllWordDetailsFromDB().then(details => {
      // const detailsCount = Object.keys(details).length;
      // console.log("[background.js] 成功获取所有单词详情, 数量:", detailsCount);
      sendResponse({ details });
    }).catch(err => {
      console.error("[background.js] 获取所有单词详情失败:", err);
      sendResponse({ details: {} });
    });
    return true;
  }
  // 新增：获取筛选后的单词详情（数据库层面筛选）
  else if (message.action === 'getFilteredWordDetails') {
    const filters = message.filters || {};
    console.log("[background.js] 开始获取筛选后的单词详情, filters:", filters);
    getFilteredWordDetails(filters).then(details => {
      sendResponse({ details });
    }).catch(err => {
      console.error("[background.js] 获取筛选后的单词详情失败:", err);
      sendResponse({ details: {} });
    });
    return true;
  }
  // 新增：获取数据库单词总数
  else if (message.action === 'getWordCount') {
    getWordCount().then(count => {
      sendResponse({ count });
    }).catch(err => {
      console.error("获取单词总数失败:", err);
      sendResponse({ count: 0 });
    });
    return true;
  }
  // 新增：批量查询单词状态
  else if (message.action === 'batchGetWordStatus') {
    const words = message.words || [];

    // 检查是否启用云端数据库
    chrome.storage.local.get(['cloudConfig'], async (result) => {
      const cloudEnabled = result.cloudConfig?.cloudDbEnabled || false;

      if (cloudEnabled && cloudAPI) {
        try {
          console.log('[background.js] 从云端批量查询', words.length, '个单词');
          await cloudAPI.init();
          const response = await cloudAPI.batchGetWords(words);

          // 转换为 statusMap 格式
          const statusMap = {};
          if (response.success && response.data && Array.isArray(response.data)) {
            response.data.forEach(item => {
              const wordLower = item.word.toLowerCase();
              statusMap[wordLower] = {
                word: item.word,
                status: item.status,
                isCustom: item.isCustom
              };
            });
          }

          console.log('[background.js] 云端返回', Object.keys(statusMap).length, '个单词，请求了', words.length, '个单词');
          sendResponse({ statusMap });
        } catch (error) {
          console.error('[background.js] 云端批量查询失败:', error);
          // 不回退到本地，直接返回空结果以测试云数据库模式
          sendResponse({ statusMap: {} });
        }
      } else {
        // 使用本地数据库
        batchGetWordStatus(words).then(statusMap => {
          sendResponse({ statusMap });
        }).catch(err => {
          console.error("批量查询单词状态失败:", err);
          sendResponse({ statusMap: {} });
        });
      }
    });

    return true;
  }
  // 保留旧接口：轻量级接口 - 只返回 word + status + isCustom
  else if (message.action === 'getAllWordStatusMap') {
    // 检查是否启用云端数据库
    chrome.storage.local.get(['cloudConfig'], async (result) => {
      const cloudEnabled = result.cloudConfig?.cloudDbEnabled || false;

      if (cloudEnabled && cloudAPI) {
        try {
          console.log('[background.js] 从云端获取所有单词状态');
          await cloudAPI.init();
          const response = await cloudAPI.getAllWords();

          // 转换为 statusMap 格式
          const statusMap = {};
          if (response.data && Array.isArray(response.data)) {
            response.data.forEach(item => {
              statusMap[item.word.toLowerCase()] = {
                word: item.word,
                status: item.status,
                isCustom: item.isCustom
              };
            });
          }

          sendResponse({ statusMap });
        } catch (error) {
          console.error('[background.js] 云端获取失败:', error);
          // // 云端失败时回退到本地
          // getAllWordStatusMap().then(statusMap => {
          //   sendResponse({ statusMap });
          // }).catch(err => {
          //   console.error("获取单词状态映射失败:", err);
          //   sendResponse({ statusMap: {} });
          // });
          sendResponse({ statusMap: {} });
        }
      } else {
        // 使用本地数据库
        getAllWordStatusMap().then(statusMap => {
          sendResponse({ statusMap });
        }).catch(err => {
          console.error("获取单词状态映射失败:", err);
          sendResponse({ statusMap: {} });
        });
      }
    });

    return true;
  }
  else if (message.action === 'addTranslation') {
    const { word, translation } = message;
    addTranslationToDB(word, translation).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error("添加翻译失败:", err);
      sendResponse({ error: err });
    });
    return true;
  }
  else if (message.action === 'removeTranslation') {
    const { word, translation } = message;
    removeTranslationFromDB(word, translation).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error("删除翻译失败:", err);
      sendResponse({ error: err });
    });
    return true;
  }
  else if (message.action === 'addTag') {
    const { word, tag } = message;
    addTagToDB(word, tag).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error("添加标签失败:", err);
      sendResponse({ error: err });
    });
    return true;
  }
  else if (message.action === 'removeTag') {
    const { word, tag } = message;
    removeTagFromDB(word, tag).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      console.error("删除标签失败:", err);
      sendResponse({ error: err });
    });
    return true;
  }
  else if (message.action === 'updateWordStatus') {
    const { word, status, language, isCustom } = message;

    // 检查云端配置
    chrome.storage.local.get(['cloudConfig'], async (result) => {
      const cloudEnabled = result.cloudConfig?.cloudDbEnabled || false;
      const dualWrite = result.cloudConfig?.cloudDualWrite !== false;

      try {
        // 始终更新本地数据库（云端模式下也需要本地缓存）
        await updateWordStatusInDB(word, status, language, isCustom);

        // 如果启用云端且启用双写，同时更新云端
        if (cloudEnabled && dualWrite && cloudAPI) {
          try {
            await cloudAPI.init();
            // 先获取完整的单词数据
            const localDetails = await getWordDetailsFromDB(word);
            if (localDetails && localDetails.word) {
              // 更新云端
              await cloudAPI.saveWord({
                ...localDetails,
                status,
                language: language || localDetails.language,
                isCustom: isCustom !== undefined ? isCustom : localDetails.isCustom
              });
              console.log('[background.js] 双写：本地和云端都已更新');
            }
          } catch (cloudError) {
            console.error('[background.js] 云端更新失败（本地已更新）:', cloudError);
          }
        }

        sendResponse({ success: true });
      } catch (err) {
        console.error("更新单词状态失败:", err);
        sendResponse({ error: err });
      }
    });

    return true;
  }
  else if (message.action === 'getAIConfig') {
    // 从 Chrome 存储中获取用户设置的配置
    chrome.storage.local.get(['aiConfig'], function(result) {
      console.log("[background.js] 获取 AI 配置:", result.aiConfig);
      sendResponse({ //操蛋返回提，得respond.config.aiSentenceTranslationPrompt;
        config: result.aiConfig || {
          apiBaseURL: "",
          apiModel: "",
          apiKey: ""
        }
      });
    });

    return true; // 必须返回 true 来表示异步响应
  }
  else if (message.action === 'makeAIRequest') {
    // 在 background script 中处理 AI 请求，避免 Firefox CSP 限制
    // 添加tabId参数以支持流式传输，保留isSidebarRequest标识
    const requestData = { ...message.requestData, tabId: sender.tab?.id };

    handleAIRequest(requestData)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        console.error("AI 请求失败:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }
  else if (message.action === 'addSentence') {
    const { word, sentence, translation,url } = message;
    addSentenceToDB(word, sentence, translation,url)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("添加例句失败:", err);
        sendResponse({ error: err });
      });
    return true;
  }
  else if (message.action === 'removeSentence') {
    const { word, sentence } = message;
    removeSentenceFromDB(word, sentence)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("删除例句失败:", err);
        sendResponse({ error: err });
      });
    return true;
  }
  else if (message.action === 'deleteWord') {
    const { word } = message;
    deleteWordFromDB(word)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("删除单词失败:", err);
        sendResponse({ error: err });
      });
    return true;
  }
  else if (message.action === 'deleteWordExact') {
    const { word } = message;
    deleteWordExactFromDB(word)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("删除单词原型失败:", err);
        sendResponse({ error: err });
      });
    return true;
  }
  else if (message.action === 'getKnownWordsByStatus') {
    // 使用主数据库查询
    getKnownWordsByStatus(message.statuses)
      .then(result => {
        sendResponse(result);
      })
      .catch(err => {
        console.error("获取已知单词失败:", err);
        sendResponse({ words: [], details: [] });
      });
    return true;
  }
  else if (message.action === 'getCustomWords') {
    (async () => {
      const cloudEnabled = cloudConfig.enabled && cloudConfig.token;

      if (cloudEnabled && cloudAPI) {
        try {
          console.log('[background.js] 从云端获取自定义词组');
          await cloudAPI.init();
          const cloudPhrases = await cloudGetAllPhrases();

          if (Array.isArray(cloudPhrases)) {
            // 为每个词组添加 isCustom 标记以保持兼容性
            const wordsWithFlag = cloudPhrases.map(word => ({
              ...word,
              isCustom: true
            }));
            console.log(`[background.js] 云端返回 ${wordsWithFlag.length} 个自定义词组`);
            sendResponse({ words: wordsWithFlag });
          } else {
            console.warn('[background.js] 云端返回数据格式错误');
            sendResponse({ words: [] });
          }
        } catch (error) {
          console.error('[background.js] 云端获取自定义词组失败:', error);
          // 云端失败时返回空数组
          sendResponse({ words: [] });
        }
      } else {
        // 使用本地数据库
        getCustomWordsFromDB()
          .then(words => {
            sendResponse({ words });
          })
          .catch(err => {
            console.error("获取自定义词组失败:", err);
            sendResponse({ words: [] });
          });
      }
    })();
    return true;
  }
  else if (message.action === "backupDatabase") {
    // 全量备份：获取所有单词详情
    getAllWordDetailsFromDB().then(details => {
      sendResponse({ success: true, data: details });
    }).catch(err => {
      console.error("备份数据库失败:", err);
      sendResponse({ success: false });
    });
    return true;
  } else if (message.action === "clearDatabase") {
    if (!db) {
        console.error("数据库未初始化 (clearDatabase)");
        sendResponse({ success: false, error: "数据库未连接" });
        return false;
    }
    try {
        const txClear = db.transaction("wordDetails", "readwrite");
        const storeClear = txClear.objectStore("wordDetails");
        const clearReq = storeClear.clear();

        clearReq.onsuccess = () => {
            console.log("数据库已成功清空 (clearDatabase)");
            sendResponse({ success: true });
        };

        clearReq.onerror = (e) => {
            console.error("清空数据库时发生错误 (clearDatabase):", e.target.error);
            sendResponse({ success: false, error: e.target.error?.message || "清空数据库失败" });
        };
    } catch (txError) {
        console.error("创建清空事务时出错 (clearDatabase):", txError);
        sendResponse({ success: false, error: "无法启动清空数据库事务" });
    }
    return true; // 保持通道开放
  } else if (message.action === "resetPhrasesDatabase") {
    // 重置词组数据库：清空词组数据库，清除迁移标记，重新迁移
    (async () => {
      try {
        if (!customPhrasesDB) {
          console.error("词组数据库未初始化 (resetPhrasesDatabase)");
          sendResponse({ success: false, error: "词组数据库未连接" });
          return;
        }

        // 1. 清空词组数据库（使用Promise包装）
        await new Promise((resolve, reject) => {
          const txClear = customPhrasesDB.transaction("customPhrases", "readwrite");
          const storeClear = txClear.objectStore("customPhrases");
          const clearReq = storeClear.clear();

          clearReq.onsuccess = () => {
            console.log("词组数据库已成功清空");
            resolve();
          };

          clearReq.onerror = (e) => {
            console.error("清空词组数据库时发生错误:", e.target.error);
            reject(e.target.error);
          };
        });

        // 2. 清除迁移标记
        await new Promise(resolve => {
          chrome.storage.local.set({ customPhrasesMigrated: false }, () => {
            console.log("迁移标记已清除");
            resolve();
          });
        });

        // 3. 重新执行迁移
        await migrateCustomPhrasesToNewDB();
        console.log("词组数据库重置成功");
        sendResponse({ success: true });

      } catch (error) {
        console.error("重置词组数据库时出错:", error);
        sendResponse({ success: false, error: error.message || "重置词组数据库失败" });
      }
    })();
    return true; // 保持通道开放
  } else if (message.action === "restoreDatabase") {
    // 完全覆盖模式（保留原有逻辑）
    const backupData = message.data;
    const txClear = db.transaction("wordDetails", "readwrite");
    const storeClear = txClear.objectStore("wordDetails");
    const clearReq = storeClear.clear();

    clearReq.onsuccess = () => {
        console.log("数据库已清空 (restoreDatabase)，准备开始写入备份...");
        const words = Object.keys(backupData);
        if (words.length === 0) {
            console.log("备份数据为空，无需写入。", backupData);
            sendResponse({ success: true });
            return;
        }

        try {
            const txRestore = db.transaction("wordDetails", "readwrite");
            const storeRestore = txRestore.objectStore("wordDetails");
            let promises = [];
            console.log(`准备写入 ${words.length} 个单词 (restoreDatabase)...`);

            words.forEach(word => {
                const record = backupData[word];
                if (record && typeof record === 'object') { // 基本检查
                    // 确保设置主键（如果备份数据中没有）
                    if (!record.word) record.word = word.toLowerCase();
                    if (!record.term) record.term = word;

                    promises.push(new Promise((resolvePut, rejectPut) => {
                        const req = storeRestore.put(record);
                        req.onsuccess = () => resolvePut();
                        req.onerror = (e) => {
                            console.error(`写入单词 '${word}' 失败 (restoreDatabase):`, e.target.error);
                            rejectPut(e.target.error);
                        };
                    }));
                } else {
                    console.warn(`跳过无效的单词数据 (restoreDatabase): ${word}`, record);
                }
            });

            Promise.all(promises)
                .then(() => {
                    console.log("所有单词的 put 请求已成功排队 (restoreDatabase)，等待事务提交...");
                })
                .catch(err => {
                    console.error("至少一个 put 请求在排队时失败 (restoreDatabase):", err);
                    try { txRestore.abort(); console.log("事务已中止 (restoreDatabase - put error)。"); } catch (abortError) { console.error("中止事务时出错:", abortError); }
                    // 不要在这里发送响应，让 tx.onerror 处理
                });

            txRestore.oncomplete = () => {
                console.log(`数据库写入事务成功完成 (restoreDatabase)，共处理 ${promises.length} 个有效单词。`);
                sendResponse({ success: true });
            };

            txRestore.onerror = (event) => {
                console.error("数据库写入事务失败 (restoreDatabase):", event.target.error);
                sendResponse({ success: false, error: event.target.error?.message || "事务提交失败" });
            };

        } catch (txError) {
            console.error("创建写入事务时出错 (restoreDatabase):", txError);
            sendResponse({ success: false, error: "无法启动数据库写入事务" });
        }
    };

    clearReq.onerror = (e) => {
        console.error("清空数据库失败 (restoreDatabase):", e.target.error);
        sendResponse({ success: false, error: "清空数据库失败" });
    };
    return true; // 保持通道开放
  } else if (message.action === "mergeDatabase") {
    // 新增：增量合并模式 - 不删除本地数据，只合并新数据
    const backupData = message.data;
    console.log("开始增量合并数据库 (mergeDatabase)...");

    const words = Object.keys(backupData);
    if (words.length === 0) {
        console.log("备份数据为空，无需合并。", backupData);
        sendResponse({ success: true, merged: 0, skipped: 0 });
        return;
    }

    try {
        const txMerge = db.transaction("wordDetails", "readwrite");
        const storeMerge = txMerge.objectStore("wordDetails");
        let mergedCount = 0;
        let skippedCount = 0;
        let processedCount = 0;
        let mergedWords = []; // 记录所有合并的单词
        let newWords = []; // 记录所有新增的单词

        console.log(`准备合并 ${words.length} 个单词 (mergeDatabase)...`);

        const processWord = (wordIndex) => {
            if (wordIndex >= words.length) {
                return; // 所有单词处理完成
            }

            const word = words[wordIndex];
            const remoteRecord = backupData[word];

            if (!remoteRecord || typeof remoteRecord !== 'object') {
                console.warn(`跳过无效的单词数据 (mergeDatabase): ${word}`, remoteRecord);
                skippedCount++;
                processedCount++;
                processWord(wordIndex + 1);
                return;
            }

            // 获取本地记录 ， 不用判断键值 ， 合并就是要键值相同。
            //const getReq = storeMerge.get(word.toLowerCase());
            const getReq = storeMerge.get(word);

            getReq.onsuccess = (event) => {
                const localRecord = event.target.result;
                let finalRecord;

                if (!localRecord) {
                    // 本地没有此单词，直接添加远程记录
                    finalRecord = { ...remoteRecord };
                    if (!finalRecord.word) finalRecord.word = word.toLowerCase();
                    if (!finalRecord.term) finalRecord.term = word;
                    mergedCount++;
                    newWords.push(word);
                    console.log(`新增单词: ${word}`);
                } else {
                    // 本地已有此单词，进行智能合并
                    finalRecord = mergeWordRecords(localRecord, remoteRecord, word);
                    if (finalRecord !== localRecord) {
                        mergedCount++;
                        mergedWords.push(word);
                        // mergeWordRecords函数内部已经打印了详细信息，这里不需要重复打印
                    } else {
                        skippedCount++;
                        // 跳过的单词不打印日志
                    }
                }

                // 保存合并后的记录
                const putReq = storeMerge.put(finalRecord);

                putReq.onsuccess = () => {
                    processedCount++;
                    processWord(wordIndex + 1);
                };

                putReq.onerror = (e) => {
                    console.error(`保存合并单词 '${word}' 失败 (mergeDatabase):`, e.target.error);
                    processedCount++;
                    processWord(wordIndex + 1);
                };
            };

            getReq.onerror = (e) => {
                console.error(`获取本地单词 '${word}' 失败 (mergeDatabase):`, e.target.error);
                skippedCount++;
                processedCount++;
                processWord(wordIndex + 1);
            };
        };

        // 开始处理第一个单词
        processWord(0);

        txMerge.oncomplete = () => {
            console.log(`数据库合并事务成功完成 (mergeDatabase)，合并: ${mergedCount}, 跳过: ${skippedCount}`);

            // 打印汇总信息
            if (newWords.length > 0) {
                console.log(`\n=== 新增单词汇总 (${newWords.length}个) ===`);
                newWords.forEach(word => console.log(`  新增: ${word}`));
            }

            if (mergedWords.length > 0) {
                console.log(`\n=== 合并单词汇总 (${mergedWords.length}个) ===`);
                mergedWords.forEach(word => console.log(`  合并: ${word}`));
            }

            console.log(`\n=== 合并操作完成 ===`);
            console.log(`总计处理: ${words.length}个单词`);
            console.log(`新增: ${newWords.length}个`);
            console.log(`合并: ${mergedWords.length}个`);
            console.log(`跳过: ${skippedCount}个`);

            sendResponse({ success: true, merged: mergedCount, skipped: skippedCount });
        };

        txMerge.onerror = (event) => {
            console.error("数据库合并事务失败 (mergeDatabase):", event.target.error);
            sendResponse({ success: false, error: event.target.error?.message || "合并事务失败" });
        };

    } catch (txError) {
        console.error("创建合并事务时出错 (mergeDatabase):", txError);
        sendResponse({ success: false, error: "无法启动数据库合并事务" });
    }
    return true; // 保持通道开放
  } else if (message.action === "ChangeWordLanguage") {
    console.log("进入了 message.action 分支", message.action);
    console.log("[background.js] 收到 changeWordLanguage 消息:", message);

    // 添加字符串比较的详细日志
    console.log("[background.js] 比较 message.action:", message.action);
    console.log("[background.js] 比较 字符串字面量: ", "ChangeWordLanguage");
    console.log("[background.js] 比较 结果:", message.action === "ChangeWordLanguage"); // 打印比较结果

    const { word, details } = message;

    console.log("[background.js] 准备调用 changeWordLanguageInDB 函数");
    console.log("[background.js] 更改单词语言：", word, details);
    changeWordLanguageInDB(word, details)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("更改单词语言失败:", err);
        sendResponse({ error: err });
      });
    return true;
  } else if (message.action === "playAudio") {
    // 处理音频播放请求
    (async () => {
        try {
            // 检查是否启用了Orion TTS
            let useOrionTTS = false;
            await new Promise(resolve => {
                chrome.storage.local.get(['useOrionTTS'], function(result) {
                    useOrionTTS = result.useOrionTTS === true;
                    resolve();
                });
            });

            if (message.audioType === "playCustom") {
                if (useOrionTTS) {
                    // 使用Orion TTS
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: "playCustom",
                                url: message.url,
                                count: message.count,
                                volume: message.volume
                            }).catch(error => {
                                console.error("发送Orion TTS消息失败:", error);
                            });
                        }
                    });
                } else {
                    // 使用offscreen，确保offscreen页面已初始化
                    if (!isOffscreenOpened) {
                        console.log("offscreen页面未初始化，尝试初始化");
                        await ensureOffscreenDocument();
                    }

                    if (isOffscreenOpened) {
                        // 发送消息到offscreen页面
                        chrome.runtime.sendMessage({
                            action: "playCustom",
                            url: message.url,
                            count: message.count,
                            volume: message.volume
                        }).catch(error => {
                            console.error("发送offscreen消息失败:", error);
                        });
                    } else {
                        console.error("无法初始化offscreen页面，无法播放音频");
                    }
                }
            } else if (message.audioType === "playMinimaxi") {
            if (useOrionTTS) {
                // 使用Orion TTS
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "playMinimaxi",
                            apiEndpoint: message.apiEndpoint,
                            apiKey: message.apiKey,
                            sentence: message.sentence,
                            voiceId: message.voiceId,
                            emotion: message.emotion,
                            language_boost: message.language_boost,
                            model: message.model,
                            speed: message.speed
                        });
                    }
                });
            } else {
                // 使用offscreen，确保offscreen页面已初始化
                if (!isOffscreenOpened) {
                    console.log("offscreen页面未初始化，尝试初始化");
                    await ensureOffscreenDocument();
                }

                if (isOffscreenOpened) {
                    // 发送消息到offscreen页面
                    chrome.runtime.sendMessage({
                        action: "playMinimaxi",
                        apiEndpoint: message.apiEndpoint,
                        apiKey: message.apiKey,
                        sentence: message.sentence,
                        voiceId: message.voiceId,
                        emotion: message.emotion,
                        language_boost: message.language_boost,
                        model: message.model,
                        speed: message.speed
                    });
                } else {
                    console.error("无法初始化offscreen页面，无法播放音频");
                }
            }
        } else if (message.audioType === "playEdgeTTS") {
            // 处理Edge TTS请求
            const { text, autoVoice, voice, rate, volume, pitch } = message;

            if (useOrionTTS) {
                // 使用Orion TTS
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "playEdgeTTS",
                            text: text,
                            autoVoice: autoVoice,
                            voice: voice,
                            rate: rate,
                            volume: volume,
                            pitch: pitch
                        });
                    }
                });
            } else {
                // 使用offscreen，确保offscreen页面已初始化
                if (!isOffscreenOpened) {
                    console.log("offscreen页面未初始化，尝试初始化");
                    await ensureOffscreenDocument();
                }

                if (isOffscreenOpened) {
                    // 发送消息到offscreen页面
                    chrome.runtime.sendMessage({
                        action: "playEdgeTTS",
                        text: text,
                        autoVoice: autoVoice,
                        voice: voice,
                        rate: rate,
                        volume: volume,
                        pitch: pitch
                    });
                } else {
                    console.error("无法初始化offscreen页面，无法播放Edge TTS");
                }
            }
        } else if (message.audioType === "playLocal") {
            // 先进行语言检测
            const { text, lang, isSentence, contextSentence } = message;
            let actualLang = lang;
            let textForDetection = contextSentence || text;

            // 修改条件：如果 lang 是 'auto' 或者 lang 不是标准的两个小写字母代码，则尝试检测
            if (lang.toLowerCase() === 'auto' || !/^[a-z]{2}$/.test(lang.toLowerCase())) {
                console.log(`[background.js] 需要语言检测 (原因: lang 为 '${lang}')，使用文本: "${textForDetection.substring(0, 50)}..."`);
                try {
                    // 首先尝试从数据库获取语言信息
                    // const wordDetails = await getWordDetailsFromDB(text);
                    // if (wordDetails && wordDetails.language && wordDetails.language !== 'auto') {
                    //     actualLang = wordDetails.language;
                    //     console.log(`[background.js] 从数据库获取到语言: ${actualLang}，跳过 API 检测。`);
                    // } else {
                        // 数据库没有或为 auto，再调用 API 检测
                        actualLang = await new Promise((resolve) => {
                            if (chrome.i18n && typeof chrome.i18n.detectLanguage === 'function') {
                                // 使用 textForDetection 进行检测
                                chrome.i18n.detectLanguage(textForDetection, (result) => {
                                    if (chrome.runtime.lastError) {
                                        console.error('[background.js] 语言检测时出错:', chrome.runtime.lastError.message);
                                        resolve('en');
                                        return;
                                    }
                                    if (result && result.languages && result.languages.length > 0) {
                                        const reliableLang = result.languages.find(l => l.isReliable);
                                        let detectedLang = reliableLang ? reliableLang.language : result.languages[0].language;
                                        console.log(`[background.js] 自动检测到语言: ${detectedLang} (可靠: ${!!reliableLang})`);
                                        resolve(detectedLang);
                                    } else {
                                        console.log('[background.js] 语言检测失败，使用默认语言 (en)');
                                        resolve('en');
                                    }
                                });
                            } else {
                                console.error("[background.js] chrome.i18n.detectLanguage API 不可用，使用默认语言 (en)");
                                resolve('en');
                            }
                        });
                    // }
                } catch (error) {
                    console.error('[background.js] 处理语言检测时出错:', error);
                    actualLang = 'en'; // 出错时默认英语
                }
            } else {
                actualLang = lang; // 如果不是 auto，直接使用提供的 lang
            }

            console.log(`[background.js] 最终语言: ${actualLang}`);

            if (useOrionTTS) {
                // 使用Orion TTS
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "playLocal",
                            text: text,         // 要播放的原始文本
                            lang: actualLang,   // 最终确定的语言
                            isSentence: isSentence
                        });
                    }
                });
            } else {
                // 使用offscreen，确保offscreen页面已初始化
                if (!isOffscreenOpened) {
                    console.log("offscreen页面未初始化，尝试初始化");
                    await ensureOffscreenDocument();
                }

                if (isOffscreenOpened) {
                    // 发送消息到offscreen页面
                    chrome.runtime.sendMessage({
                        action: "playLocal",
                        text: text,         // 要播放的原始文本
                        lang: actualLang,   // 最终确定的语言
                        isSentence: isSentence
                    });
                } else {
                    console.error("无法初始化offscreen页面，无法播放音频");
                }
            }
        }
        sendResponse({success: true});
        } catch (error) {
            console.error("处理音频播放请求时发生错误:", error);
            sendResponse({success: false, error: error.message});
        }
    })();
    return true;
  } else if (message.action === "stopAudio") {
    // 处理停止播放请求
    // 检查是否启用了Orion TTS
    chrome.storage.local.get(['useOrionTTS'], function(result) {
        const useOrionTTS = result.useOrionTTS === true;

        if (useOrionTTS) {
            // 使用Orion TTS
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "stopAudio"
                    });
                }
            });
        } else {
            // 使用offscreen，确保offscreen页面已初始化
            if (isOffscreenOpened) {
                // 发送消息到offscreen页面
                chrome.runtime.sendMessage({
                    action: "stopAudio"
                });
            } else {
                console.log("offscreen页面未初始化，无需停止音频");
            }
        }
    });
    sendResponse({success: true});
    return true;
  }

  // 处理音频播放完成通知
  if (message.action === "audioPlaybackCompleted") {
    console.log("音频播放完成");
    // // 设置延时关闭离屏页面（延长至20秒）
    // if (autoCloseTimeout) {
    //   clearTimeout(autoCloseTimeout);
    // }
    // autoCloseTimeout = setTimeout(() => {
    //   // closeOffscreenDocument();
    // }, 20000); // 修改为20秒后关闭
    sendResponse({success: true});
    return true;
  }

  // 处理音频播放开始通知
  if (message.action === "audioPlaybackStarted") {
    console.log("音频播放开始:", message.audioType);
    // 将消息转发给所有标签页
    chrome.tabs.query({}, function(tabs) {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: "audioPlaybackStarted",
          audioType: message.audioType
        }).catch(() => {
          // 忽略无法发送的标签页错误
        });
      });
    });
    sendResponse({success: true});
    return true;
  }

  // 处理音频播放错误
  if (message.action === "audioPlaybackError") {
    console.error("音频播放错误:", message.error);
    sendResponse({success: true});
    return true;
  }

  if (message.action === "openSidebar") {
    try {
      // 使用sender.tab.id作为tabId参数打开侧边栏
      // 这是必要的，因为我们需要指定在哪个标签页打开侧边栏
      chrome.sidePanel.open({
        tabId: sender.tab.id
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("打开侧边栏失败:", chrome.runtime.lastError);
          sendResponse({ status: "error", error: chrome.runtime.lastError.message });
          return;
        }

        // 侧边栏打开成功后，将数据转发给侧边栏
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "updateSidebar",
            data: {
              word: message.data.word,
              sentence: message.data.sentence,
              stream: true
            }
          });
        }, 300); // 给侧边栏一点时间加载

        sendResponse({ status: "opened" });
      });
    } catch (error) {
      console.error("调用侧边栏API失败:", error);
      sendResponse({ status: "error", error: error.message });
    }
    return true; // 保持消息通道开放以进行异步响应
  }
  // 添加到现有的 message listener 中
  if (message.action === "stopSpecificAudio") {
    // 检查是否启用了Orion TTS
    chrome.storage.local.get(['useOrionTTS'], function(result) {
        const useOrionTTS = result.useOrionTTS === true;

        if (useOrionTTS) {
            // 使用Orion TTS
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "stopSpecificAudio",
                        audioType: message.audioType
                    });
                }
            });
        } else {
            // 使用offscreen，确保offscreen页面已初始化
            if (isOffscreenOpened) {
                // 发送消息到offscreen页面
                chrome.runtime.sendMessage({
                    action: "stopSpecificAudio",
                    audioType: message.audioType
                });
            } else {
                console.log("offscreen页面未初始化，无需停止音频");
            }
        }
    });
    sendResponse({success: true});
    return true;
  }


// 添加到现有的 message listener 中
if (message.action === "getAfdianStatus") {
  const { afdianUserId } = message;
  checkAfdianStatus(afdianUserId)
    .then(result => {
      sendResponse(result);
    })
    .catch(error => {
      console.error("处理爱发电状态请求失败:", error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
}

// 获取指定状态的单词
// 优化：使用status索引 + Promise.all并行查询
function getKnownWordsByStatus(statuses) {
  return ensureDB(() => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordDetails", "readonly");
      const store = tx.objectStore("wordDetails");
      const index = store.index("status");

      // 创建所有的查询请求 Promise
      const promises = statuses.map(status => {
        return new Promise((res, rej) => {
          // 直接对每个 status 用 getAll，这是最高效的批量获取方式
          const request = index.getAll(IDBKeyRange.only(status));

          request.onsuccess = () => res(request.result);
          request.onerror = () => rej(request.error);
        });
      });

      // 等所有 status 的查询都结束
      Promise.all(promises)
        .then(results => {
          // results 是一个二维数组 [[status1的数据], [status2的数据]...]
          // 我们把它拍平 (flat)
          const allItems = results.flat();

          const words = [];
          const detailsMap = {}; // 用于去重，万一 status 有重叠（虽然通常 status 是互斥的）

          allItems.forEach(item => {
             // 这里做个简单的去重防止万一
             if (!detailsMap[item.word]) {
                 words.push(item.word);
                 detailsMap[item.word] = item;
             }
          });

          resolve({
            words: words,
            details: Object.values(detailsMap)
          });
        })
        .catch(err => {
          console.error("Error fetching statuses:", err);
          resolve({ words: [], details: [] });
        });
    });
  });
}

/**
 * 获取筛选后的单词详情（数据库层面筛选）
 * @param {Object} filters - 筛选条件
 * @param {string} filters.language - 语言筛选 ('all' 或具体语言)
 * @param {Array<number>} filters.statuses - 状态筛选数组 (空数组表示不筛选状态)
 * @param {number} filters.startDate - 开始日期时间戳 (可选)
 * @param {number} filters.endDate - 结束日期时间戳 (可选)
 * @param {boolean} filters.noDate - 是否只返回没有日期的单词 (可选)
 * @returns {Promise<Object>} - 返回 {word: details} 格式的对象
 */
function getFilteredWordDetails(filters = {}) {
  return ensureDB(() => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("wordDetails", "readonly");
      const store = tx.objectStore("wordDetails");

      const {
        language = 'all',
        statuses = [],
        startDate = null,
        endDate = null,
        noDate = false
      } = filters;

      console.log('[background.js] getFilteredWordDetails 筛选条件:', filters);

      // 如果有状态筛选，使用状态索引查询
      if (statuses && statuses.length > 0) {
        const statusIndex = store.index("status");
        const promises = statuses.map(status => {
          return new Promise((res, rej) => {
            // 注意：数据库中status存储为字符串，需要转换
            const statusStr = String(status);
            const request = statusIndex.getAll(IDBKeyRange.only(statusStr));
            request.onsuccess = () => res(request.result);
            request.onerror = () => rej(request.error);
          });
        });

        Promise.all(promises)
          .then(results => {
            const allItems = results.flat();
            const details = {};

            console.log(`[background.js] getFilteredWordDetails 从索引获取到 ${allItems.length} 个单词`);

            allItems.forEach((item, index) => {
              // 去重
              if (details[item.word]) return;

              // 语言筛选
              if (language !== 'all' && item.language !== language) return;

              // 计算 createdAt（与 getAllWordDetailsFromDB 逻辑一致）
              let createdAtValue = null;
              if (item.statusHistory && typeof item.statusHistory === 'object' && Object.keys(item.statusHistory).length > 0) {
                let earliestCreateTime = Infinity;
                let foundValidCreateTimeInHistory = false;

                Object.values(item.statusHistory).forEach(historyEntry => {
                  if (historyEntry &&
                      typeof historyEntry.createTime === 'number' &&
                      !isNaN(historyEntry.createTime) &&
                      historyEntry.createTime > 0) {
                    earliestCreateTime = Math.min(earliestCreateTime, historyEntry.createTime);
                    foundValidCreateTimeInHistory = true;
                  }
                });

                if (foundValidCreateTimeInHistory) {
                  createdAtValue = earliestCreateTime;
                }
              }

              // 回退逻辑
              if (createdAtValue === null) {
                const potentialTimestampFromId = parseInt(item.id, 10);
                if (!isNaN(potentialTimestampFromId) && potentialTimestampFromId > 0 && new Date(potentialTimestampFromId).getFullYear() > 1970) {
                  createdAtValue = potentialTimestampFromId;
                } else {
                  createdAtValue = new Date('1970-01-01T00:00:00.000Z').getTime();
                }
              }

              item.createdAt = createdAtValue;

              // 调试：打印前3个单词的筛选信息
              if (index < 3) {
                console.log(`[background.js] 单词 "${item.word}" createdAt: ${createdAtValue} (${new Date(createdAtValue).toISOString()}), startDate: ${startDate}, endDate: ${endDate}`);
              }

              // 日期筛选
              if (noDate) {
                // 只返回没有创建日期的单词
                if (!item.statusHistory || !item.statusHistory['1'] || !item.statusHistory['1'].createTime) {
                  details[item.word] = item;
                }
              } else if (startDate !== null && endDate !== null) {
                // 日期范围筛选
                if (createdAtValue >= startDate && createdAtValue <= endDate) {
                  details[item.word] = item;
                  if (index < 3) {
                    console.log(`[background.js] ✓ 单词 "${item.word}" 通过日期筛选`);
                  }
                } else {
                  if (index < 3) {
                    console.log(`[background.js] ✗ 单词 "${item.word}" 未通过日期筛选`);
                  }
                }
              } else {
                // 无日期筛选
                details[item.word] = item;
              }
            });

            console.log(`[background.js] getFilteredWordDetails 返回 ${Object.keys(details).length} 个单词`);
            resolve(details);
          })
          .catch(err => {
            console.error("Error in getFilteredWordDetails:", err);
            reject(err);
          });
      } else {
        // 没有状态筛选，获取所有单词
        const request = store.getAll();
        request.onsuccess = event => {
          const detailsArr = event.target.result;
          const details = {};

          detailsArr.forEach(item => {
            // 语言筛选
            if (language !== 'all' && item.language !== language) return;

            // 计算 createdAt
            let createdAtValue = null;
            if (item.statusHistory && typeof item.statusHistory === 'object' && Object.keys(item.statusHistory).length > 0) {
              let earliestCreateTime = Infinity;
              let foundValidCreateTimeInHistory = false;

              Object.values(item.statusHistory).forEach(historyEntry => {
                if (historyEntry &&
                    typeof historyEntry.createTime === 'number' &&
                    !isNaN(historyEntry.createTime) &&
                    historyEntry.createTime > 0) {
                  earliestCreateTime = Math.min(earliestCreateTime, historyEntry.createTime);
                  foundValidCreateTimeInHistory = true;
                }
              });

              if (foundValidCreateTimeInHistory) {
                createdAtValue = earliestCreateTime;
              }
            }

            if (createdAtValue === null) {
              const potentialTimestampFromId = parseInt(item.id, 10);
              if (!isNaN(potentialTimestampFromId) && potentialTimestampFromId > 0 && new Date(potentialTimestampFromId).getFullYear() > 1970) {
                createdAtValue = potentialTimestampFromId;
              } else {
                createdAtValue = new Date('1970-01-01T00:00:00.000Z').getTime();
              }
            }

            item.createdAt = createdAtValue;

            // 日期筛选
            if (noDate) {
              if (!item.statusHistory || !item.statusHistory['1'] || !item.statusHistory['1'].createTime) {
                details[item.word] = item;
              }
            } else if (startDate !== null && endDate !== null) {
              if (createdAtValue >= startDate && createdAtValue <= endDate) {
                details[item.word] = item;
              }
            } else {
              details[item.word] = item;
            }
          });

          console.log(`[background.js] getFilteredWordDetails 返回 ${Object.keys(details).length} 个单词`);
          resolve(details);
        };
        request.onerror = event => reject(event.target.error);
      }
    });
  });
}

// 获取所有自定义词组
// 从独立的自定义词组数据库查询，只返回必要字段(word, status, language)
function getCustomWordsFromDB() {
  return ensureCustomPhrasesDB(() => {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      const tx = customPhrasesDB.transaction("customPhrases", "readonly");
      const store = tx.objectStore("customPhrases");
      const request = store.getAll();

      request.onsuccess = event => {
        const customWords = event.target.result || [];
        const endTime = performance.now();
        console.log(`[DB性能] getCustomWords 查询完成，耗时: ${(endTime - startTime).toFixed(2)}ms，获取到 ${customWords.length} 个自定义词组`);

        // 为每个词组添加 isCustom 标记以保持兼容性
        const wordsWithFlag = customWords.map(word => ({
          ...word,
          isCustom: true
        }));

        resolve(wordsWithFlag);
      };

      request.onerror = event => {
        console.error("获取自定义词组失败:", event.target.error);
        reject(event.target.error);
      };
    });
  });
}

// 新增函数：更改单词的语言
function changeWordLanguageInDB(word, details) {
  return new Promise((resolve, reject) => {
    const key = word.toLowerCase();
    console.log("[background.js] [changeWordLanguageInDB] 开始处理单词:", word);

    let tx, store, getReq;

    try {
      console.log("[background.js] [changeWordLanguageInDB] 打开事务 (readwrite)");
      tx = db.transaction("wordDetails", "readwrite");
      console.log("[background.js] [changeWordLanguageInDB] 获取对象仓库 (wordDetails)");
      store = tx.objectStore("wordDetails");
      console.log("[background.js] [changeWordLanguageInDB] 发起 get 请求，key:", key);
      getReq = store.get(key);

      getReq.onsuccess = event => {
        console.log("[background.js] [changeWordLanguageInDB] get 请求成功");
        let record = event.target.result || { word: key, term: word };
        if (!record.term) record.term = word;

        console.log("[background.js] [changeWordLanguageInDB] 获取到的原始记录:", record);
        console.log("[background.js] [changeWordLanguageInDB] 接收到的 details:", details);

        console.log("[background.js] [changeWordLanguageInDB] Object.assign 前的 record:", JSON.stringify(record)); // 打印 Object.assign 前的 record

        // 使用传递的 details 对象更新记录
        Object.assign(record, details);

        console.log("[background.js] [changeWordLanguageInDB] 合并 details 后的记录:", record);

        console.log("[background.js] [changeWordLanguageInDB] Object.assign 后的 record:", JSON.stringify(record)); // 打印 Object.assign 后的 record

        console.log("[background.js] [changeWordLanguageInDB] 发起 put 请求");
        const putReq = store.put(record);
        putReq.onsuccess = () => {
          console.log("[background.js] [changeWordLanguageInDB] put 请求成功");
          resolve();
        };
        putReq.onerror = e => {
          console.error("[background.js] [changeWordLanguageInDB] put 请求失败:", e.target.error);
          reject(e.target.error);
        };
      };

      getReq.onerror = e => {
        console.error("[background.js] [changeWordLanguageInDB] get 请求失败:", e.target.error);
        reject(e.target.error);
      };

    } catch (error) {
      console.error("[background.js] [changeWordLanguageInDB] 函数执行过程中发生错误:", error);
      reject(error);
    }
  });

}

// 注册侧边栏
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      .catch(error => console.error("设置侧边栏行为失败:", error));
  }
});

// 处理更新剪贴板内容的消息
if (message.action === "updateClipboardContent") {
  console.log("收到剪贴板内容更新:", message.content.substring(0, 30) + "...");
  // 将剪贴板内容保存到 storage
  chrome.storage.local.set({ clipboardContent: message.content });

  // 可选：将内容广播给所有标签页
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: "clipboardUpdated",
        content: message.content
      }).catch(() => {
        // 忽略无法发送的标签页错误
      });
    });
  });
  return true;
}

// 处理自定义胶囊打开新标签页
if (message.action === "openCustomCapsuleTab") {
  chrome.tabs.create({ url: message.url });
  return true;
}

// 处理自定义胶囊打开新窗口
if (message.action === "openCustomCapsuleWindow") {
  chrome.windows.create({
    url: message.url,
    type: 'popup',
    width: 1000,
    height: 700
  });
  return true;
}

// 处理自定义胶囊在侧边栏打开
if (message.action === "openCustomCapsuleSidebar") {
  // 发送消息给content script，让它创建侧边栏
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showSidebar',
        url: message.url,
        word: message.word
      });
    }
  });
  return true;
}

if (message.action === "checkClipboardStatus") {

  let isClipSubtitles = false;
  // 监听插件启动事件，检查是否需要启动剪贴板监听
  chrome.storage.local.get({
      clipSubtitles: false
  }, function(result) {
      if (result.clipSubtitles) {
          // 如果字幕功能开启，启动剪贴板监听
          isClipSubtitles = true;
          console.log("bg收到offer检查剪贴板状态:", message, isClipSubtitles);

          sendResponse({ clipboardEnabled: isClipSubtitles });

      }else{
        console.log("bg收到offer检查剪贴板状态:", message, isClipSubtitles);

        sendResponse({ clipboardEnabled: isClipSubtitles });
      }
  });


  return true;
}

if (message.action === "playTTS") {

    console.log('playTTS', message);

    const { text, lang, isSentence, options } = message.payload;

    // 停止当前播放
    chrome.tts.stop();

    // 根据不同语言优化 TTS 参数
    const languageSettings = {
        'zh': { rate: 0.9, pitch: 1.0 },      // 中文
        'ja': { rate: 0.85, pitch: 1.0 },     // 日语
        'ko': { rate: 0.9, pitch: 1.0 },      // 韩语
        'de': { rate: 0.9, pitch: 1.0 },      // 德语
        'fr': { rate: 0.9, pitch: 1.0 },      // 法语
        'es': { rate: 0.9, pitch: 1.0 },      // 西班牙语
        'ru': { rate: 0.85, pitch: 1.0 },     // 俄语
        'en': { rate: 0.95, pitch: 1.0 }      // 英语
    };

    // 获取语言的基础代码（如 'zh-CN' -> 'zh'）
    const baseLang = lang.split('-')[0].toLowerCase();

    // 合并语言特定设置和基础设置
    const ttsOptions = {
        ...options,
        ...languageSettings[baseLang] || { rate: 0.9, pitch: 1.0 },
        lang: lang,
        onEvent: function(event) {
            if (event.type === 'end' || event.type === 'interrupted' || event.type === 'cancelled') {
                chrome.runtime.sendMessage({
                    action: "audioPlaybackCompleted",
                    audioType: isSentence ? "sentence" : "word"
                });
            } else if (event.type === 'error') {
                chrome.runtime.sendMessage({
                    action: "audioPlaybackError",
                    error: event.errorMessage || '语音合成错误',
                    audioType: isSentence ? "sentence" : "word"
                });
            }
        }
    };

    // 如果是句子，稍微降低语速
    if (isSentence) {
        ttsOptions.rate *= 0.95;
    }

    // 获取可用语音并优化选择逻辑
    chrome.tts.getVoices((voices) => {
        // 按语言筛选语音
        const matchingVoices = voices.filter(voice =>
            voice.lang && voice.lang.toLowerCase().startsWith(baseLang)
        );

        // 语音质量评分函数
        const getVoiceScore = (voice) => {
            let score = 0;
            // Google 语音优先
            if (voice.voiceName.includes('Google')) score += 5;
            // Microsoft 语音次之
            else if (voice.voiceName.includes('Microsoft')) score += 4;
            // 自然语音
            else if (voice.voiceName.includes('Natural')) score += 3;
            // 本地语音
            else if (!voice.remote) score += 2;
            // 完全匹配语言代码的优先
            if (voice.lang.toLowerCase() === lang.toLowerCase()) score += 2;
            return score;
        };

        // 按评分排序选择最佳语音
        const bestVoice = matchingVoices.sort((a, b) =>
            getVoiceScore(b) - getVoiceScore(a)
        )[0];

        if (bestVoice) {
            console.log(`选择语音: ${bestVoice.voiceName} (${bestVoice.lang})`);
            ttsOptions.voiceName = bestVoice.voiceName;
        } else {
            console.log(`未找到匹配的${lang}语音，使用默认语音`);
        }

        // 特定语言的音量调整
        if (baseLang === 'zh' || baseLang === 'ja') {
            ttsOptions.volume = 0.95; // 中文和日语的音量稍微调低
        }

        chrome.tts.speak(text, ttsOptions);
    });
}

// 添加 API Key 管理的消息处理
else if (message.action === 'getBlockedApiKeys') {
  getBlockedApiKeys()
    .then(result => sendResponse({ success: true, blockedKeys: result }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
}
else if (message.action === 'unblockApiKey') {
  unblockApiKey(message.apiKey)
    .then(() => sendResponse({ success: true }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
}
else if (message.action === 'clearAllBlockedKeys') {
  chrome.storage.local.set({ blockedApiKeys: [] })
    .then(() => {
      console.log('[background.js] 已清除所有屏蔽的 API Keys');
      sendResponse({ success: true });
    })
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
}
// 添加 OhMyGPT API 的消息处理
else if (message.action === 'ohMyGptGetToken') {
  ohMyGptGetToken(message.code)
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ success: false, error: error.message })); // 添加 catch 以防万一
  return true; // 异步响应
}
else if (message.action === 'ohMyGptAddDays') {
  ohMyGptAddDays(message.userId, message.token)
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true; // 异步响应
}
else if (message.action === 'ohMyGptSendDollar') {
  ohMyGptSendDollar(message.token, message.amount)
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true; // 异步响应
}
else if (message.action === 'ohMyGptGetDays') {
  ohMyGptGetDays(message.userId)
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true; // 异步响应
}
else if (message.action === 'refreshAfdianSubscription') {
  const { afdianUserId } = message;
  console.log('[background.js] 收到刷新爱发电订阅请求, afdianUserId:', afdianUserId);

  (async () => {
    try {
      await cloudAPI.init();

      const localResult = await chrome.storage.local.get(['cloudConfig']);
      const cloudConfig = localResult.cloudConfig || {};
      const userId = afdianUserId || cloudConfig?.afdianUserId || cloudConfig?.externalSubscription?.afdianUserId;

      if (!userId) {
        sendResponse({ success: false, message: 'No Afdian account bound' });
        return;
      }

      console.log('[background.js] 先调用 verifyAfdian 验证爱发电订阅, userId:', userId);
      const verifyResponse = await cloudAPI.verifyAfdian(userId);
      console.log('[background.js] verifyAfdian 响应:', verifyResponse);

      if (!verifyResponse.success) {
        sendResponse({ success: false, message: verifyResponse.message || '爱发电验证失败' });
        return;
      }

      console.log('[background.js] 爱发电验证成功，再调用 getUserInfo 获取最新用户信息');
      const response = await cloudAPI.getUserInfo();
      console.log('[background.js] getUserInfo 响应:', response);

      if (response.success) {
        const data = response.data;

        if (data.subscriptionExpireAt) {
          cloudConfig.subscriptionExpireAt = data.subscriptionExpireAt;
          cloudConfig.subscriptionStatus = data.subscriptionStatus || 'active';
        }

        if (data.afdianPlanName) {
          cloudConfig.afdianPlanName = data.afdianPlanName;
        }
        if (data.wordLimit !== undefined) {
          cloudConfig.wordLimit = data.wordLimit;
        }
        if (data.wordCount !== undefined) {
          cloudConfig.wordCount = data.wordCount;
        }
        if (data.afdianUserId) {
          cloudConfig.afdianUserId = data.afdianUserId;
        }

        await chrome.storage.local.set({ cloudConfig });
        console.log('[background.js] 已更新本地存储的订阅信息');

        if (data.subscriptionExpireAt) {
          const expireDate = new Date(data.subscriptionExpireAt).toLocaleDateString();
          sendResponse({
            success: true,
            message: `订阅状态已更新，新到期时间：${expireDate}`,
            extended: false,
            subscriptionExpireAt: data.subscriptionExpireAt
          });
        } else {
          sendResponse({
            success: true,
            message: response.message || '订阅状态已更新',
            extended: false
          });
        }
      } else {
        sendResponse({ success: false, message: response.message || '获取用户信息失败' });
      }
    } catch (error) {
      console.error('[background.js] 刷新爱发电订阅失败:', error);
      sendResponse({ success: false, message: error.message });
    }
  })();
  return true; // 异步响应
}

});


// 确保在插件启动时初始化offscreen页面
// 先清理可能存在的旧offscreen页面,然后重新创建
(async function initializeOnStartup() {
  try {
    // 激进清理:先尝试关闭可能存在的offscreen页面
    console.log("Background启动:尝试清理旧的offscreen页面");
    await chrome.offscreen.closeDocument();
    console.log("成功关闭旧的offscreen页面");
  } catch (error) {
    // 忽略"不存在"的错误
    console.log("没有需要清理的offscreen页面:", error.message);
  }

  // 重置状态标志
  isOffscreenOpened = false;
  isClipboardOffscreenOpened = false;

  // 重新创建offscreen页面
  await ensureOffscreenDocument();

  // 检查是否需要启动剪贴板监听
  chrome.storage.local.get({
      clipSubtitles: false
  }, function(result) {
      if (result.clipSubtitles) {
          // 如果字幕功能开启，启动剪贴板监听
          chrome.runtime.sendMessage({
            action: "startClipboardMonitoring"
          }).catch(err => console.log("启动剪贴板监听失败:", err));
      }
  });
})();
  // 监听存储变化事件，检测是否需要启动或停止剪贴板监听
  chrome.storage.onChanged.addListener(function(changes, namespace) {
      if (namespace === 'local' && changes.clipSubtitles) {
          console.log("clipSubtitles 变化:", changes.clipSubtitles);
          if (changes.clipSubtitles.newValue) {
              // 如果字幕功能被启用，启动剪贴板监听
              console.log("启动剪贴板监听");
              chrome.runtime.sendMessage({
                action: "startClipboardMonitoring"
              });

              // ensureOffscreenDocument();
          } else {
              // 如果字幕功能被禁用，停止剪贴板监听
              if (isClipboardOffscreenOpened) {
                  chrome.runtime.sendMessage({
                      action: "stopClipboardMonitoring"
                  });
                  // ensureOffscreenDocument();
                  // closeOffscreenDocument();
              }
          }
      }
  });


    // 创建离屏文档
    async function ensureOffscreenDocument() {
      try {
        // 检查是否已有离屏页面
        if (isOffscreenOpened) {
          console.log("离屏页面已存在");
          // 取消可能的自动关闭计时
          if (autoCloseTimeout) {
              clearTimeout(autoCloseTimeout);
              autoCloseTimeout = null;
          }
          return;
        }

        // 创建新的离屏页面
        console.log("创建新的离屏页面");
        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('src/player/offscreen.html'),
            reasons: ['AUDIO_PLAYBACK', 'CLIPBOARD'],
            justification: '需要播放音频和监听剪贴板'
        });

        console.log("离屏页面创建成功");
        isOffscreenOpened = true;
        isClipboardOffscreenOpened = true;
      } catch (error) {
        console.error("创建离屏页面失败:", error);
        // 检查是否是因为offscreen文档已存在而失败
        if (error.message && error.message.includes('single')) {
          console.log("离屏页面已存在，设置标志为true");
          isOffscreenOpened = true;
          isClipboardOffscreenOpened = true;
        } else {
          // 其他错误，设置标志为false
          isOffscreenOpened = false;
          isClipboardOffscreenOpened = false;
        }
      }
    }

    // 关闭离屏文档
    async function closeOffscreenDocument() {
      if (isOffscreenOpened) {
          try {
              await chrome.offscreen.closeDocument();
              isOffscreenOpened = false;
              autoCloseTimeout = null;
              isClipboardOffscreenOpened = false;
              clipboardAutoCloseTimeout = null;
          } catch (error) {
              console.error("关闭离屏文档失败:", error);
          }
      }
    }


    // 爱发电API相关功能
async function getAfdianUserInfo(afdianUserId) {
  try {
    const url = `https://api.lingkuma.org/api/auth/afdian/getPlans?user_id=${afdianUserId}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log("AFDIAN 返回数据data", data);
    return data;
  } catch (error) {
    console.error("获取爱发电用户信息失败:", error);
    return { success: false, error: error.message };
  }
}

// 检查用户的爱发电状态并更新存储
async function checkAfdianStatus(afdianUserId) {
  try {
    const status = await getAfdianUserInfo(afdianUserId);
    if (status.success) {
      await chrome.storage.local.set({ 'isKuma': 1 });
      return { success: true, isKuma: 1 };
    } else {
      await chrome.storage.local.set({ 'isKuma': 0 });
      return { success: true, isKuma: 0 };
    }
  } catch (error) {
    console.error("检查爱发电状态失败:", error);
    await chrome.storage.local.set({ 'isKuma': 0 });
    return { success: false, error: error.message };
  }
}



chrome.runtime.onInstalled.addListener((details) => {
  // 初始化云端配置
  initCloudConfig().then(() => {
    console.log('[CloudDB] Cloud config initialized on install');
  });

  // 新增：创建右键菜单项 - 设置
  chrome.contextMenus.create({
    id: "openOptions",
    title: "Options",
    contexts: ["action"] // 只在插件图标上显示
  });

  // 创建电子书父菜单
  chrome.contextMenus.create({
    id: "ebooksMenu",
    title: "E-Book Reader",
    contexts: ["action"] // 只在插件图标上显示
  });

  // 创建右键菜单项 - 日文epub阅读器
  chrome.contextMenus.create({
    id: "openTtsuReader",
    title: "Epub Ttsu (fastest🌸)",
    parentId: "ebooksMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });

  // 创建右键菜单项 - PDF.js Viewer
  chrome.contextMenus.create({
    id: "openPDFViewer",
    title: "PDF Mozilla (fastest🚀)",
    parentId: "ebooksMenu", // 设置父菜单🚀
    contexts: ["action"] // 只在插件图标上显示
  });



  // 创建右键菜单项 - Readest
  chrome.contextMenus.create({
    id: "openReadest",
    title: "Readest (epub, pdf)",
    parentId: "ebooksMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });


  // 创建子菜单项 - Koodo Reader (拓展项目)
  chrome.contextMenus.create({
    id: "openKoodoReader",
    title: "Koodo (epub, pdf )",
    parentId: "ebooksMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });

  //https://app.flowoss.com/zh-CN
  //https://react-reader.metabits.no/
  // 创建右键菜单项 - FlowOSS阅读器
  chrome.contextMenus.create({
    id: "openFlowOSSReader",
    title: "FlowOSS ( epub, pdf )",
    parentId: "ebooksMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });

  // 创建右键菜单项 - React Reader
  chrome.contextMenus.create({
    id: "openReactReader",
    title: "React epub ",
    parentId: "ebooksMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });


  // 创建"KumaTools"父菜单
  chrome.contextMenus.create({
    id: "kumaToolsMenu",
    title: "KumaTools",
    contexts: ["action"] // 只在插件图标上显示
  });

  // 新增：创建右键菜单项 - SyncLingua
  chrome.contextMenus.create({
    id: "openSyncLingua",
    title: "SyncLingua",
    parentId: "kumaToolsMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });

  // 新增：创建右键菜单项 - 前往captions.lingkuma.org
  chrome.contextMenus.create({
    id: "openCaptions",
    title: "LiveCaptions - Luna",
    parentId: "kumaToolsMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });

  // 新增：创建右键菜单项 - 前往ting.lingkuma.org
  chrome.contextMenus.create({
    id: "openTing",
    title: "TingCaptions - Daily",
    parentId: "kumaToolsMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });


  // 创建"More"父菜单
  chrome.contextMenus.create({
    id: "moreMenu",
    title: "More",
    contexts: ["action"] // 只在插件图标上显示
  });

  // 新增：创建右键菜单项 - 前往lingkuma.org
  chrome.contextMenus.create({
    id: "openLingkuma",
    title: "Help",
    parentId: "moreMenu", // 设置父菜单

    contexts: ["action"] // 只在插件图标上显示
  });


  // 创建子菜单项 - 前往blog.lingkuma.org
  chrome.contextMenus.create({
    id: "openLingkumaBlog",
    title: "blog",
    parentId: "moreMenu", // 设置父菜单
    contexts: ["action"] // 只在插件图标上显示
  });






  // 初始化默认设置
  chrome.storage.local.get(['tooltipThemeMode'], function(result) {
    if (result.tooltipThemeMode === undefined) {
      // 如果tooltipThemeMode未设置，则设置默认值为'auto'
      chrome.storage.local.set({ 'tooltipThemeMode': 'auto' });
      console.log("初始化弹窗主题模式为: auto");
    }
  });
  

 //初始化ai请求默认为开启


  // 获取用户的浏览器语言设置
  const userLanguage = chrome.i18n.getUILanguage() || navigator.language || 'en';
  console.log("用户浏览器语言:", userLanguage);

  // 判断是否为中文（包括 zh-CN, zh-TW, zh-HK 等）
  const isChinese = userLanguage.toLowerCase().startsWith('zh');

  // 首次安装时执行
  if (details.reason === "install") {
    console.log("检测到首次安装");

    // 同时打开插件的设置页面
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/options/options.html") // 获取插件内部页面的正确 URL
    });
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/popup/popup.html") // 获取插件内部页面的正确 URL
    });

    // 根据语言选择不同的QA页面
    const qaUrl = isChinese ? "https://docs.lingkuma.org/zh/intro/start/start.html" : "https://docs.lingkuma.org/en/intro/start/start.html";
    console.log("根据语言选择的QA页面:", qaUrl);

    // 打开对应语言的QA页面
    chrome.tabs.create({
      url: qaUrl
    });
  }

  // 软件更新时执行
  else if (details.reason === "update") {
    console.log("检测到软件更新事件");
    console.log("之前版本:", details.previousVersion);
    console.log("当前版本:", chrome.runtime.getManifest().version);

    // 只有当版本号真的发生变化时才打开更新页面
    if (details.previousVersion && details.previousVersion !== chrome.runtime.getManifest().version) {
      console.log("版本号确实发生了变化，准备打开更新详情页面");

      // 从 chrome.storage.local 获取用户语言设置
      chrome.storage.local.get('userLanguage', function(result) {
        let userLang = result.userLanguage;

        // 如果没有保存的语言设置，使用浏览器语言作为后备
        if (!userLang) {
          userLang = isChinese ? 'zh' : 'en';
        }

        console.log("用户语言设置:", userLang);

        // 根据语言选择对应的更新详情页面
        let updateUrl;
        if (userLang === 'zh') {
          updateUrl = "https://docs.lingkuma.org/zh/init/new/new.html";
        } else if (userLang === 'ja') {
          updateUrl = "https://docs.lingkuma.org/ja/init/new/new.html";
        } else {
          // 其他语言使用英文页面
          updateUrl = "https://docs.lingkuma.org/en/init/new/new.html";
        }

        console.log("打开更新详情页面:", updateUrl);

        // 打开更新详情页面
        chrome.tabs.create({
          url: updateUrl
        });
      });
    } else {
      console.log("版本号未变化，跳过打开更新页面");
    }
  }
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "openOptions") { // 新增处理逻辑
    chrome.runtime.openOptionsPage();
  } else if (info.menuItemId === "openReadest") {
    chrome.tabs.create({
      url: "https://web.readest.com/library"
    });
  } else if (info.menuItemId === "openPDFViewer") {
    chrome.tabs.create({
      url: "https://mozilla.github.io/pdf.js/web/viewer.html"
    });
  } else if (info.menuItemId === "openLingkuma") { // 新增处理逻辑
    chrome.tabs.create({
      url: "https://lingkuma.org/"
    });
  } else if (info.menuItemId === "openLingkumaBlog") { // 新增处理逻辑
    chrome.tabs.create({
      url: "https://blog.lingkuma.org/"
    });
  } else if (info.menuItemId === "openSyncLingua") { // SyncLingua
    chrome.tabs.create({
      url: "https://chat.lingkuma.org/"
    });
  } else if (info.menuItemId === "openCaptions") { // 新增处理逻辑
    chrome.tabs.create({
      url: "https://captions.lingkuma.org/"
    });
  } else if (info.menuItemId === "openTing") { // 新增处理逻辑
    chrome.tabs.create({
      url: "https://ting.lingkuma.org/"
    });
  } else if (info.menuItemId === "openKoodoReader") { // 拓展项目 - Koodo Reader
    chrome.tabs.create({
      url: "https://web.koodoreader.com/#/manager/home"
    });
  } else if (info.menuItemId === "openTtsuReader") { // 日文epub阅读器
    chrome.tabs.create({
      url: "https://reader.ttsu.app/"
    });
  } else if (info.menuItemId === "openFlowOSSReader") { // FlowOSS阅读器
    chrome.tabs.create({
      url: "https://app.flowoss.com/"
    });
  } else if (info.menuItemId === "openReactReader") { // React Reader
    chrome.tabs.create({
      url: "https://react-reader.metabits.no/"
    });
  }
});
// ============================================
// 初始化云端配置（Service Worker 启动时）
// ============================================
initCloudConfig().then(() => {
  console.log('[CloudDB] Cloud config initialized on service worker startup');
});

