// 音频播放器实例 - 分离单词和句子播放器
let wordAudioPlayer = null;
let sentenceAudioPlayer = null;
let pendingAudioData = [];
let mediaSource = null;
let sourceBuffer = null;

// 不再使用全局 Edge TTS 实例

// 剪贴板相关变量
let lastClipboardContent = '';
let pushing = false;
let fetching = false;
let intervalId = null;
let isClipboardEnabled = false;

// 监听剪贴板事件
window.addEventListener(
  "paste",
  async (e) => {
    e.preventDefault();

    if (pushing || !e.clipboardData || !isClipboardEnabled) {
      return;
    }

    const text = e.clipboardData.getData("text/plain");
    if (!text || text === lastClipboardContent) {
      return;
    }

    try {
      pushing = true;
      lastClipboardContent = text;

      // 发送消息到 background.js
      chrome.runtime.sendMessage({
        action: "updateClipboardContent",
        content: text
      }).catch(err => {
        console.log('发送剪贴板内容失败:', err);
      });
    } catch (e) {
      console.log('处理剪贴板内容出错:', e);
    } finally {
      pushing = false;
    }
  },
  { capture: true }
);

// 开始监听剪贴板
function startClipboardMonitoring() {
  console.log("开始监听剪贴板");
  isClipboardEnabled = true;

  // 清除可能存在的旧定时器
  if (intervalId) {
    clearInterval(intervalId);
  }

  // 设置定时器定期触发 paste 命令
  intervalId = setInterval(async () => {
    if (fetching || !isClipboardEnabled) {
      return;
    }

    try {
      fetching = true;
      document.execCommand("paste");
    } catch (error) {
      console.error('触发剪贴板命令失败:', error);
    } finally {
      fetching = false;
    }
  }, 800); // 每800毫秒检查一次

  console.log("剪贴板监听已启动");
}

// 停止监听剪贴板
function stopClipboardMonitoring() {
  isClipboardEnabled = false;

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  console.log("剪贴板监听已停止");
}

// 检测 extension context 是否有效
function isContextValid() {
    try {
        // 尝试访问 chrome.runtime.id
        return !!chrome.runtime?.id;
    } catch (error) {
        console.error("Extension context 已失效:", error);
        return false;
    }
}

// 初始化监听器，接收来自background.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 检查 context 是否有效
    if (!isContextValid()) {
        console.error("Extension context 已失效,offscreen 页面需要重新加载");
        // 尝试通知用户或自动关闭
        window.close();
        return false;
    }

    console.log("离屏文档收到消息:", request.action);

    if (request.action === "playCustom") {
        try {
            playCustom(request.url, request.count, request.volume);
            sendResponse({success: true});
        } catch (error) {
            sendResponse({success: false, error: error.message});
        }
        return true;
    }

    if (request.action === "playMinimaxi") {
        playMinimaxi(
            request.apiEndpoint,
            request.apiKey,
            request.sentence,
            request.voiceId,
            request.emotion,
            request.language_boost,
            request.model,
            request.speed
        ).then(() => sendResponse({success: true}))
         .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }

    if (request.action === "playEdgeTTS") {
        playEdgeTTS(
            request.text,
            request.autoVoice,
            request.voice,
            request.rate,
            request.volume,
            request.pitch
        ).then(() => sendResponse({success: true}))
         .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }

    if (request.action === "playLocal") {
        playLocalSpeech(
            request.text,
            request.lang,
            request.isSentence
        ).then(() => sendResponse({success: true}))
         .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }

    if (request.action === "stopAudio") {
        stopAllAudio();
        sendResponse({success: true});
        return true;
    }

    if (request.action === "stopSpecificAudio") {
        if (request.audioType === "word") {
            stopWordAudio();
        } else if (request.audioType === "sentence") {
            stopSentenceAudio();
        }
        sendResponse({success: true});
        return true;
    }

    // 新增剪贴板相关处理
    if (request.action === "startClipboardMonitoring") {
        startClipboardMonitoring();
        sendResponse({success: true});
        return true;
    }

    if (request.action === "stopClipboardMonitoring") {
        stopClipboardMonitoring();
        sendResponse({success: true});
        return true;
    }
});

// 页面加载后可能需要立即启动剪贴板监听
chrome.runtime.sendMessage({action: "checkClipboardStatus"}, (response) => {
    console.log("检查剪贴板状态:", response);
    if (response && response.clipboardEnabled) {
        startClipboardMonitoring();
    }
});


// 播放单词 //源playWord
function playCustom(url, count, volume) {
    // 只停止单词音频
    stopWordAudio();

    wordAudioPlayer = new Audio();
    wordAudioPlayer.src = url;

    // 确保音量是有效的数值，范围在0-1之间
    let safeVolume = 0.5; // 默认音量
    if (typeof volume === 'number' && isFinite(volume) && volume >= 0 && volume <= 1) {
        safeVolume = volume;
    }
    wordAudioPlayer.volume = safeVolume;
    console.log('设置音频音量:', safeVolume);

    let playCount = 0;
    wordAudioPlayer.onended = () => {
        playCount++;
        if (playCount < count && wordAudioPlayer) {
            wordAudioPlayer.play();
        } else {
            // 单词播放完成通知
            chrome.runtime.sendMessage({
                action: "audioPlaybackCompleted",
                audioType: "word"
            });
        }
    };

    // 添加播放开始事件监听
    wordAudioPlayer.addEventListener('playing', () => {
        console.log('单词音频播放中...');
        // 发送音频开始播放的消息
        chrome.runtime.sendMessage({
            action: "audioPlaybackStarted",
            audioType: "word"
        });
    });

    wordAudioPlayer.play().catch(error => {
        // 如果是因为播放被中断导致的错误，不需要报告为错误
        if (error.name === 'AbortError' && error.message.includes('interrupted by a call to pause')) {
            console.log('单词音频播放被正常中断');
            return;
        }

        console.error('播放单词出错:', error);
        chrome.runtime.sendMessage({
            action: "audioPlaybackError",
            error: error.message,
            audioType: "word"
        });
    });
}

/**
 * 生成SSML字符串用于TTS请求
 * @param {Object} options - TTS选项
 * @returns {string} SSML格式化字符串
 */
function ssmlStr(options) {
    var voice = options.voice || 'en-US-AvaNeural';
    var language = options.language || 'en-US';
    var rate = options.rate || 'default';
    var pitch = options.pitch || 'default';
    var volume = options.volume || 'default';
    var requestId = globalThis.crypto.randomUUID();

    return 'X-RequestId:' + requestId + '\r\n' +
      'X-Timestamp:' + new Date().toString() + 'Z\r\n' +
      'Content-Type:application/ssml+xml\r\n' +
      'Path:ssml\r\n\r\n' +
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ' +
      'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="' + language + '">' +
      '<voice name="' + voice + '">' +
      '    <prosody rate="' + rate + '" pitch="' + pitch + '" volume="' + volume + '">' +
      '    ' + options.text +
      '    </prosody>' +
      '</voice>' +
      '</speak>';
}

/**
 * TTS结果类，用于处理音频部分和标记
 */
function TtsResult() {
    this.audioParts = [];
    this.marks = [];
}

/**
 * 从音频部分获取MP3 blob
 * @returns {Blob} MP3 blob
 */
TtsResult.prototype.mp3Blob = function() {
    return new Blob(this.audioParts, { type: 'audio/mpeg' });
};

/**
 * Edge TTS客户端
 * @param {string} token - 认证令牌
 */
function EdgeTts(token) {
    this.websocket = null;
    this.token = token || '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
    this.wssUrl = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
    this.isConnecting = false;
    this.lastUsedTime = Date.now();
    this.connectionTimeout = 5 * 60 * 1000; // 5分钟无活动自动断开
}

/**
 * 生成UUID
 * @returns {string} UUID字符串
 */
EdgeTts.prototype.generateUUID = function() {
    return 'xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/**
 * 生成Sec-MS-GEC参数
 * @param {string} trustedClientToken - 客户端令牌
 * @returns {Promise<string>} Sec-MS-GEC值
 */
EdgeTts.prototype.generateSecMsGec = function(trustedClientToken) {
    return new Promise(async (resolve) => {
        const ticks = Math.floor(Date.now() / 1000) + 11644473600;
        const rounded = ticks - (ticks % 300);
        const windowsTicks = rounded * 10000000;

        const encoder = new TextEncoder();
        const data = encoder.encode(windowsTicks + trustedClientToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);

        const hash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
        
        resolve(hash);
    });
};

/**
 * 获取合成URL
 * @returns {Promise<string>} WebSocket URL
 */
EdgeTts.prototype.getSynthUrl = function() {
    return this.generateSecMsGec(this.token).then((secMsGEC) => {
        const reqId = this.generateUUID();
        return this.wssUrl + '?TrustedClientToken=' + this.token + 
               '&Sec-MS-GEC=' + secMsGEC + 
               '&Sec-MS-GEC-Version=1-130.0.2849.68' + 
               '&ConnectionId=' + reqId;
    });
};

/**
 * 检查WebSocket连接状态
 * @returns {boolean} 连接是否有效
 */
EdgeTts.prototype.isConnectionValid = function() {
    // 检查连接是否存在且处于打开状态
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
        return false;
    }

    // 检查连接是否超时
    const now = Date.now();
    if (now - this.lastUsedTime > this.connectionTimeout) {
        console.log('WebSocket连接已超时，需要重新连接');
        this.close();
        return false;
    }

    return true;
};

/**
 * 连接到websocket
 * @returns {Promise} 解析为websocket的Promise
 */
EdgeTts.prototype.connWebsocket = function() {
    // 如果已有有效连接，直接返回
    if (this.isConnectionValid()) {
        console.log('使用现有WebSocket连接');
        this.lastUsedTime = Date.now(); // 更新最后使用时间
        return Promise.resolve(this.websocket);
    }

    // 如果正在连接中，等待连接完成
    if (this.isConnecting) {
        console.log('WebSocket正在连接中，等待连接完成');
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    clearInterval(checkInterval);
                    this.lastUsedTime = Date.now();
                    resolve(this.websocket);
                } else if (!this.isConnecting) {
                    clearInterval(checkInterval);
                    reject(new Error('WebSocket连接失败'));
                }
            }, 100);
        });
    }

    // 创建新连接
    this.isConnecting = true;
    console.log('创建新的WebSocket连接');

    var self = this;

    // 使用新的URL生成方法
    return this.getSynthUrl().then(function(url) {
        var ws = new WebSocket(url);

        // 初始消息配置服务
        var initialMessage =
          'X-Timestamp:' + new Date().toString() + '\r\n' +
          'Content-Type:application/json; charset=utf-8\r\n' +
          'Path:speech.config\r\n\r\n' +
          '{"context":{"synthesis":{"audio":{"metadataoptions":' +
          '{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"true"},' +
          '"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}';

        return new Promise(function(resolve, reject) {
          ws.addEventListener('open', function() {
            ws.send(initialMessage);
            self.websocket = ws;
            self.lastUsedTime = Date.now();
            self.isConnecting = false;
            console.log('WebSocket连接已建立');
            resolve(ws);
          });

          ws.addEventListener('error', function(error) {
            console.error('WebSocket连接错误:', error);
            self.isConnecting = false;
            reject(error);
          });

          ws.addEventListener('close', function() {
            console.info('WebSocket连接已关闭');
            self.websocket = null;
            self.isConnecting = false;
          });
        });
    });
};

/**
 * 关闭websocket连接
 */
EdgeTts.prototype.close = function() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
      console.log('WebSocket连接已手动关闭');
    }
    this.websocket = null;
    this.isConnecting = false;
};

/**
 * 使用Edge TTS播放文本
 * @param {Object} options - TTS选项
 * @param {Function} onAudioChunk - 当收到音频块时的回调函数
 * @param {Function} onComplete - 当所有音频接收完成时的回调函数
 * @returns {Promise} 解析为TTS结果的Promise
 */
EdgeTts.prototype.speak = function(options, onAudioChunk, onComplete) {
    return this.connWebsocket().then((ws) => {
      this.websocket = ws;
      var textXml = ssmlStr(options);
      ws.send(textXml);
      var result = new TtsResult();

      // 是否为单词模式（短文本）
      var isWord = !options.text.includes(' ') && options.text.length <= 10;
      console.log(`播放模式: ${isWord ? '单词' : '句子'}, 文本: "${options.text}"`);

      // 如果没有提供回调函数，则使用传统方式（等待所有数据接收完毕）
      if (!onAudioChunk && !onComplete) {
        return new Promise(function(resolve) {
          ws.addEventListener('message', function(message) {
            if (typeof message.data !== 'string') {
              var blob = message.data;
              var separator = 'Path:audio\r\n';

              blob.text().then(function(text) {
                var index = text.indexOf(separator) + separator.length;
                var audioBlob = blob.slice(index);
                result.audioParts.push(audioBlob);
              });

              return;
            }

            if (message.data.includes('Path:audio.metadata')) {
              var parts = message.data.split('Path:audio.metadata');
              if (parts.length >= 2) {
                try {
                  var meta = JSON.parse(parts[1]);
                  if (meta && meta.Metadata && meta.Metadata.length > 0) {
                    result.marks.push(meta.Metadata[0]);
                  }
                } catch (e) {
                  console.error('解析元数据错误:', e);
                }
              }
            } else if (message.data.includes('Path:turn.end')) {
              return resolve(result);
            }
          });
        });
      }

      // 单词模式下，我们收集所有音频块后一次性播放
      if (isWord) {
        // 收集所有音频块
        var allAudioParts = [];

        return new Promise(function(resolve) {
          ws.addEventListener('message', function(message) {
            if (typeof message.data !== 'string') {
              var blob = message.data;
              var separator = 'Path:audio\r\n';

              blob.text().then(function(text) {
                var index = text.indexOf(separator) + separator.length;
                var audioBlob = blob.slice(index);
                result.audioParts.push(audioBlob);
                allAudioParts.push(audioBlob);
              });

              return;
            }

            if (message.data.includes('Path:audio.metadata')) {
              var parts = message.data.split('Path:audio.metadata');
              if (parts.length >= 2) {
                try {
                  var meta = JSON.parse(parts[1]);
                  if (meta && meta.Metadata && meta.Metadata.length > 0) {
                    result.marks.push(meta.Metadata[0]);
                  }
                } catch (e) {
                  console.error('解析元数据错误:', e);
                }
              }
            } else if (message.data.includes('Path:turn.end')) {
              // 单词模式下，等待所有数据接收完毕后一次性播放
              if (typeof onAudioChunk === 'function' && allAudioParts.length > 0) {
                var finalBlob = new Blob(allAudioParts, { type: 'audio/mpeg' });
                console.log(`单词音频接收完成，总大小: ${Math.round(finalBlob.size / 1024)} KB, 块数: ${allAudioParts.length}`);
                onAudioChunk(finalBlob, true);
              }

              // 如果提供了完成回调，通知所有音频已接收完成
              if (typeof onComplete === 'function') {
                onComplete(result);
              }
              return resolve(result);
            }
          });
        });
      }
      // 句子模式，使用流式播放
      else {
        // 跟踪是否已经开始接收音频数据
        var hasReceivedAudio = false;
        // 跟踪接收到的音频块数量
        var audioChunksCount = 0;
        // 最小音频块数量，用于确定何时开始播放
        var MIN_CHUNKS_TO_START = 3; // 增加到3，确保有足够的数据开始播放

        // 收集的音频块，用于合并处理
        var collectedChunks = [];

        return new Promise(function(resolve) {
          ws.addEventListener('message', function(message) {
            if (typeof message.data !== 'string') {
              var blob = message.data;
              var separator = 'Path:audio\r\n';

              blob.text().then(function(text) {
                var index = text.indexOf(separator) + separator.length;
                var audioBlob = blob.slice(index);
                result.audioParts.push(audioBlob);

                // 增加音频块计数
                audioChunksCount++;

                // 收集音频块
                collectedChunks.push(audioBlob);

                // 如果提供了回调函数，通知收到新的音频块
                if (typeof onAudioChunk === 'function') {
                  // 如果是第一批音频块且已经收到足够的块，通知可以开始播放
                  if (audioChunksCount >= MIN_CHUNKS_TO_START && !hasReceivedAudio) {
                    hasReceivedAudio = true;
                    console.log(`已收集${audioChunksCount}个音频块，开始播放`);

                    // 合并前面收集的块，一次性发送
                    if (collectedChunks.length > 0) {
                      var combinedBlob = new Blob(collectedChunks, { type: 'audio/mpeg' });
                      onAudioChunk(combinedBlob, true); // 第二个参数表示这是第一批块
                      collectedChunks = []; // 清空已处理的块
                    }
                  } else if (hasReceivedAudio) {
                    // 已经开始播放后，每收集到一定数量的块再发送
                    if (collectedChunks.length >= 3) { // 每3个块合并一次
                      var combinedBlob = new Blob(collectedChunks, { type: 'audio/mpeg' });
                      onAudioChunk(combinedBlob, false);
                      collectedChunks = []; // 清空已处理的块
                    }
                  }
                }
              });

              return;
            }

            if (message.data.includes('Path:audio.metadata')) {
              var parts = message.data.split('Path:audio.metadata');
              if (parts.length >= 2) {
                try {
                  var meta = JSON.parse(parts[1]);
                  if (meta && meta.Metadata && meta.Metadata.length > 0) {
                    result.marks.push(meta.Metadata[0]);
                  }
                } catch (e) {
                  console.error('解析元数据错误:', e);
                }
              }
            } else if (message.data.includes('Path:turn.end')) {
              // 处理剩余的音频块
              if (collectedChunks.length > 0 && typeof onAudioChunk === 'function') {
                var finalBlob = new Blob(collectedChunks, { type: 'audio/mpeg' });
                onAudioChunk(finalBlob, false);
              }

              // 如果提供了完成回调，通知所有音频已接收完成
              if (typeof onComplete === 'function') {
                onComplete(result);
              }
              return resolve(result);
            }
          });
        });
      }
    });
};

/**
 * 播放Edge TTS
 * @param {string} text - 要播放的文本
 * @param {boolean} autoVoice - 是否自动选择声音
 * @param {string} voice - 声音名称
 * @param {number} rate - 语速 (正负百分比)
 * @param {number} volume - 音量 (正负百分比)
 * @param {number} pitch - 音调 (正负百分比)
 */
async function playEdgeTTS(text, autoVoice, voice, rate, volume, pitch) {
    try {
        console.log('Edge TTS播放参数:', { text, autoVoice, voice, rate, volume, pitch });

        // 根据播放的文本长度决定是停止单词还是句子音频
        const isSentence = text.includes(' ') || text.length > 10;
        if (isSentence) {
            stopSentenceAudio();
        } else {
            stopWordAudio();
        }

        // 将rate转换为Edge TTS格式 (-100到100 -> -100%到+100%)
        const rateStr = rate > 0 ? `+${rate}%` : `${rate}%`;
        // 将volume转换为Edge TTS格式 (0到100 -> 百分比字符串)
        const volumeStr = volume > 0 ? `+${volume}%` : `${volume}%`;
        // 将pitch转换为Edge TTS格式 (-50到50 -> -50%到+50%)
        const pitchStr = pitch > 0 ? `+${pitch}%` : `${pitch}%`;

        // 每次播放都创建新的EdgeTts实例
        console.log('创建新的Edge TTS实例');
        const tts = new EdgeTts();

        // 如果是德语句子，使用SeraphinaMultilingualNeural模型
        if (isSentence && voice.startsWith('de-DE') && autoVoice) {
            voice = 'de-DE-SeraphinaMultilingualNeural';
        }

        // 准备播放选项
        const speakOptions = {
            text: text,
            voice: voice,
            language: voice.split('-').slice(0, 2).join('-'), // 从voice中提取语言代码
            rate: rateStr,
            pitch: pitchStr,
            volume: volumeStr
        };

        console.log('Edge TTS播放选项:', speakOptions);

        // 单词模式和句子模式使用不同的处理方式
        if (!isSentence) {
            // 单词模式：等待所有数据接收完毕后一次性播放
            console.log('Edge TTS单词模式：等待所有数据接收完毕后一次性播放');

            // 使用传统方式获取完整音频
            const result = await tts.speak(speakOptions);

            // 获取完整的音频Blob
            const audioBlob = result.mp3Blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            console.log(`单词音频接收完成，总大小: ${Math.round(audioBlob.size / 1024)} KB`);

            // 创建音频播放器
            wordAudioPlayer = new Audio(audioUrl);

            // 设置播放完成事件
            wordAudioPlayer.onended = function() {
                // 释放资源
                URL.revokeObjectURL(audioUrl);

                // 关闭WebSocket连接
                tts.close();

                // 通知播放完成
                chrome.runtime.sendMessage({
                    action: "audioPlaybackCompleted",
                    audioType: "word"
                });
            };

            // 设置播放开始事件
            wordAudioPlayer.onplay = function() {
                console.log('Edge TTS单词播放开始');
                chrome.runtime.sendMessage({
                    action: "audioPlaybackStarted",
                    audioType: "word"
                });
            };

            // 设置播放错误事件
            wordAudioPlayer.onerror = function(event) {
                console.error('Edge TTS单词播放错误:', event);
                URL.revokeObjectURL(audioUrl);

                // 关闭WebSocket连接
                tts.close();

                chrome.runtime.sendMessage({
                    action: "audioPlaybackError",
                    error: event.message || "播放错误",
                    audioType: "word"
                });
            };

            // 播放音频
            try {
                await wordAudioPlayer.play();
                console.log('Edge TTS单词播放已开始');
            } catch (error) {
                // 如果是因为播放被中断导致的错误，不需要报告为错误
                if (error.name === 'AbortError' && error.message.includes('interrupted by a call to pause')) {
                    console.log('Edge TTS单词音频播放被正常中断');
                    return;
                }

                console.error('Edge TTS单词播放错误:', error);
                URL.revokeObjectURL(audioUrl);
                tts.close();

                chrome.runtime.sendMessage({
                    action: "audioPlaybackError",
                    error: error.message,
                    audioType: "word"
                });
            }
        }
        // 句子模式：使用流式播放
        else {
            console.log('Edge TTS句子模式：使用流式播放');

            // 初始化MediaSource和音频播放器
            const audioPlayer = new Audio();
            sentenceAudioPlayer = audioPlayer;

            mediaSource = new MediaSource();
            audioPlayer.src = URL.createObjectURL(mediaSource);
            pendingAudioData = [];

            // 设置播放完成事件
            audioPlayer.addEventListener('ended', () => {
                console.log('Edge TTS句子播放完成');

                // 关闭WebSocket连接
                tts.close();

                // 通知播放完成
                chrome.runtime.sendMessage({
                    action: "audioPlaybackCompleted",
                    audioType: "sentence"
                });
            });

            // 添加缓冲不足事件处理
            audioPlayer.addEventListener('waiting', () => {
                console.log('Edge TTS句子音频缓冲中...');
            });

            // 添加播放状态监控事件
            audioPlayer.addEventListener('playing', () => {
                console.log('Edge TTS句子音频播放中...');
                // 发送音频开始播放的消息
                chrome.runtime.sendMessage({
                    action: "audioPlaybackStarted",
                    audioType: "sentence"
                });
            });

            // 设置播放错误事件
            audioPlayer.addEventListener('error', (event) => {
                console.error('Edge TTS句子播放错误:', event);

                // 关闭WebSocket连接
                tts.close();

                chrome.runtime.sendMessage({
                    action: "audioPlaybackError",
                    error: event.message || "播放错误",
                    audioType: "sentence"
                });
            });

            // 初始化MediaSource
            await new Promise(resolve => {
                mediaSource.addEventListener('sourceopen', () => {
                    sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
                    sourceBuffer.addEventListener('updateend', () => {
                        if (pendingAudioData.length > 0 && !sourceBuffer.updating) {
                            const nextChunk = pendingAudioData.shift();
                            sourceBuffer.appendBuffer(nextChunk);
                        }
                    });
                    resolve();
                });
            });

            // 跟踪初始缓冲状态
            let initialBufferingComplete = false;

            // 使用流式播放方式
            await tts.speak(
            speakOptions,
            // 音频块回调
            (audioBlob, isFirstChunk) => {
                console.log(`收到音频块，大小: ${Math.round(audioBlob.size / 1024)} KB, 是否首块: ${isFirstChunk}`);

                // 单词模式下，我们直接使用完整的音频块，不使用MediaSource
                if (!isSentence) {
                    if (isFirstChunk) {
                        // 创建一个新的Audio元素直接播放完整的音频
                        const audioUrl = URL.createObjectURL(audioBlob);
                        wordAudioPlayer = new Audio(audioUrl);

                        // 设置播放完成事件
                        wordAudioPlayer.onended = function() {
                            // 释放资源
                            URL.revokeObjectURL(audioUrl);

                            // 通知播放完成
                            chrome.runtime.sendMessage({
                                action: "audioPlaybackCompleted",
                                audioType: "word"
                            });
                        };

                        // 设置播放开始事件
                        wordAudioPlayer.onplay = function() {
                            console.log('Edge TTS单词播放开始');
                            chrome.runtime.sendMessage({
                                action: "audioPlaybackStarted",
                                audioType: "word"
                            });
                        };

                        // 设置播放错误事件
                        wordAudioPlayer.onerror = function(event) {
                            console.error('Edge TTS单词播放错误:', event);
                            URL.revokeObjectURL(audioUrl);

                            chrome.runtime.sendMessage({
                                action: "audioPlaybackError",
                                error: event.message || "播放错误",
                                audioType: "word"
                            });
                        };

                        // 播放音频
                        wordAudioPlayer.play()
                            .then(() => console.log('Edge TTS单词播放已开始'))
                            .catch(e => console.error('Edge TTS单词播放启动失败:', e));
                    }
                }
                // 句子模式，使用MediaSource流式播放
                else {
                    // 将Blob转换为ArrayBuffer
                    audioBlob.arrayBuffer().then(buffer => {
                        try {
                            // 添加到待处理队列
                            if (sourceBuffer.updating || pendingAudioData.length > 0) {
                                pendingAudioData.push(buffer);
                            } else {
                                sourceBuffer.appendBuffer(buffer);
                            }

                            // 如果是第一个块且尚未开始播放，则开始播放
                            if (isFirstChunk && !initialBufferingComplete) {
                                initialBufferingComplete = true;
                                console.log('Edge TTS句子初始缓冲完成，开始播放');
                                // 延迟一点开始播放，确保有足够的数据
                                setTimeout(() => {
                                    audioPlayer.play()
                                        .then(() => console.log('Edge TTS句子播放开始'))
                                        .catch(e => console.error('Edge TTS句子播放启动失败:', e));
                                }, 100);
                            }
                        } catch (error) {
                            console.error('处理音频块时出错:', error);
                        }
                    }).catch(error => {
                        console.error('转换音频Blob到ArrayBuffer时出错:', error);
                    });
                }
            },
            // 完成回调
            async () => {
                console.log('Edge TTS所有数据接收完成');

                // 只有句子模式需要处理MediaSource结束
                if (isSentence) {
                    try {
                        // 等待所有更新完成
                        while (pendingAudioData.length > 0) {
                            if (!sourceBuffer.updating) {
                                const nextChunk = pendingAudioData.shift();
                                sourceBuffer.appendBuffer(nextChunk);
                            }
                            await waitForUpdateEnd();
                        }

                        // 结束流
                        if (!sourceBuffer.updating) {
                            mediaSource.endOfStream();
                        } else {
                            sourceBuffer.addEventListener('updateend', () => {
                                try {
                                    mediaSource.endOfStream();
                                } catch (e) {
                                    console.error('结束媒体流时出错:', e);
                                }
                            }, { once: true });
                        }
                    } catch (error) {
                        console.error('处理结束流时出错:', error);
                    }
                }
            }
        );

            console.log('Edge TTS请求已发送，等待数据流...');
        }

    } catch (error) {
        console.error('Edge TTS出错:', error);
        // 发生错误时关闭连接
        if (tts && tts.websocket) {
            tts.close();
        }

        chrome.runtime.sendMessage({
            action: "audioPlaybackError",
            error: error.message,
            audioType: text.includes(' ') ? "sentence" : "word"
        });
    }
}

// 播放句子 //源playSentence
async function playMinimaxi(apiEndpoint, apiKey, sentence, voiceId, emotion, language_boost,model,speed) {
    try {
        // 只停止句子音频
        stopSentenceAudio();


        //把sentetnce里面的"im"，替换成Im
        sentence = sentence.replace(/im/g, "Im");


        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model || "speech-01-turbo",
                text: sentence,
                stream: true,
                language_boost: language_boost,
                voice_setting: {
                    voice_id: voiceId,
                    speed: speed || 1.0,
                    vol: 1,
                    pitch: 0,
                    emotio: emotion

                },
                audio_setting: {
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: "mp3",
                    channel: 1
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // 初始化句子音频播放器
        sentenceAudioPlayer = new Audio();
        mediaSource = new MediaSource();
        sentenceAudioPlayer.src = URL.createObjectURL(mediaSource);
        pendingAudioData = [];

        // 监听播放结束事件
        sentenceAudioPlayer.addEventListener('ended', () => {
            // 播放完成后，通知background
            chrome.runtime.sendMessage({
                action: "audioPlaybackCompleted",
                audioType: "sentence"
            });
        });

        // 添加缓冲不足事件处理
        sentenceAudioPlayer.addEventListener('waiting', () => {
            console.log('音频缓冲中...');
        });

        // 添加播放状态监控事件
        sentenceAudioPlayer.addEventListener('playing', () => {
            console.log('音频播放中...');
            // 发送音频开始播放的消息
            chrome.runtime.sendMessage({
                action: "audioPlaybackStarted",
                audioType: "sentence"
            });
        });

        // 初始化MediaSource
        await new Promise(resolve => {
            mediaSource.addEventListener('sourceopen', () => {
                sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
                sourceBuffer.addEventListener('updateend', () => {
                    if (pendingAudioData.length > 0 && !sourceBuffer.updating) {
                        const nextChunk = pendingAudioData.shift();
                        sourceBuffer.appendBuffer(nextChunk);
                    }
                });
                resolve();
            });
        });

        // 收集初始数据标志
        let initialBufferingComplete = false;
        let initialChunksCount = 0;
        const MIN_INITIAL_CHUNKS = 1; // 设置初始缓冲区大小 (改为1，只要有1段数据就开始播放)

        // 处理流数据
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                // 等待所有更新完成
                while (pendingAudioData.length > 0) {
                    if (!sourceBuffer.updating) {
                        const nextChunk = pendingAudioData.shift();
                        sourceBuffer.appendBuffer(nextChunk);
                    }
                    await waitForUpdateEnd();
                }

                // 结束流
                if (!sourceBuffer.updating) {
                    mediaSource.endOfStream();
                } else {
                    sourceBuffer.addEventListener('updateend', () => {
                        mediaSource.endOfStream();
                    }, { once: true });
                }
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            while (true) {
                const endIndex = buffer.indexOf('\n\n');
                if (endIndex === -1) break;

                const chunk = buffer.slice(0, endIndex);
                buffer = buffer.slice(endIndex + 2);

                try {
                    const jsonStr = chunk.replace(/^data: /, '');
                    const data = JSON.parse(jsonStr);

                    if (data.data?.status === 1 && data.data?.audio) {
                        appendAudioChunk(data.data.audio);

                        // 初始缓冲逻辑
                        if (!initialBufferingComplete) {
                            initialChunksCount++;
                            if (initialChunksCount >= MIN_INITIAL_CHUNKS) {
                                initialBufferingComplete = true;
                                console.log('初始缓冲完成，开始播放');
                                sentenceAudioPlayer.play();
                            }
                        }
                    }
                } catch (error) {
                    console.error('JSON解析错误:', error);
                }
            }

            // 当收集了足够的初始数据后开始播放
            if (!initialBufferingComplete && initialChunksCount >= MIN_INITIAL_CHUNKS) {
                initialBufferingComplete = true;
                console.log('初始缓冲完成，开始播放');
                sentenceAudioPlayer.play().catch(e => console.error('播放启动失败:', e));
            }
        }
    } catch (error) {
        console.error('播放句子出错:', error);
        chrome.runtime.sendMessage({
            action: "audioPlaybackError",
            error: error.message,
            audioType: "sentence"
        });
    }
}

// 添加音频数据到流
function appendAudioChunk(hexString) {
    if (!hexString || !sourceBuffer) return null;

    const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    if (sourceBuffer.updating || pendingAudioData.length > 0) {
        pendingAudioData.push(bytes.buffer);
    } else {
        sourceBuffer.appendBuffer(bytes.buffer);
    }

    return bytes.buffer;
}

// 等待sourceBuffer更新完成
function waitForUpdateEnd() {
    return new Promise((resolve) => {
        if (!sourceBuffer.updating) {
            resolve();
        } else {
            sourceBuffer.addEventListener('updateend', resolve, { once: true });
        }
    });
}

// 停止单词音频
function stopWordAudio() {
    if (wordAudioPlayer) {
        try {
            wordAudioPlayer.pause();
            wordAudioPlayer.currentTime = 0;
        } catch (error) {
            // 忽略停止时的错误，这通常是正常的
            console.log('停止单词音频时的正常错误:', error.message);
        }
        wordAudioPlayer = null;

        // 通知单词音频已停止
        chrome.runtime.sendMessage({
            action: "audioPlaybackCompleted",
            audioType: "word"
        });
    }

    // 如果当前正在播放的是单词，也停止语音合成
    try {
        window.speechSynthesis.cancel();
    } catch (error) {
        console.log('停止语音合成时的正常错误:', error.message);
    }
}

// 停止句子音频
function stopSentenceAudio() {
    if (sentenceAudioPlayer) {
        try {
            sentenceAudioPlayer.pause();
            sentenceAudioPlayer.currentTime = 0;
        } catch (error) {
            // 忽略停止时的错误，这通常是正常的
            console.log('停止句子音频时的正常错误:', error.message);
        }

        if (mediaSource && mediaSource.readyState === 'open') {
            try {
                mediaSource.endOfStream();
            } catch (e) {
                // 忽略可能的错误
                console.log('结束MediaSource时的正常错误:', e.message);
            }
        }
        sentenceAudioPlayer = null;
        mediaSource = null;
        sourceBuffer = null;
        pendingAudioData = [];

        // 通知句子音频已停止
        chrome.runtime.sendMessage({
            action: "audioPlaybackCompleted",
            audioType: "sentence"
        });
    }

    // 如果当前正在播放的是句子，也停止语音合成
    try {
        window.speechSynthesis.cancel();
    } catch (error) {
        console.log('停止语音合成时的正常错误:', error.message);
    }
}

// 停止所有音频
function stopAllAudio() {
    stopWordAudio();
    stopSentenceAudio();

    // 停止语音合成
    window.speechSynthesis.cancel();
}


// ... existing code ...

function playLocalSpeechChromeTTS(text, lang, isSentence) {
    // 停止当前播放
    if (isSentence) {
        stopSentenceAudio();
    } else {
        stopWordAudio();
    }

    // 通过消息传递给后台页面处理 TTS
    chrome.runtime.sendMessage({
        action: "playTTS",
        payload: {
            text: text,
            lang: lang === 'auto' ? 'en-US' : lang,
            isSentence: isSentence,
            options: {
                rate: isSentence ? 0.9 : 1.0,
                pitch: 1.0,
                volume: 1.0
            }
        }
    });
}
/**
 * 目前使用本地SpeechSynthesis API播放语音
 * @param {string} text - 要播放的文本
 * @param {string} lang - 语言代码 (不再是 'auto', 而是检测后的具体代码)
 * @param {boolean} isSentence - 是否为句子
 */
async function playLocalSpeech(text, lang, isSentence) {


    console.log('playLocalSpeech received:', text, lang, isSentence); // 修改日志，显示接收到的参数
    // 停止当前播放
    // if (isSentence) {
    //     stopSentenceAudio();
    // } else {
    //     stopWordAudio();
    // }
    

    playLocalSpeechChromeTTS(text, lang, isSentence);
    return;

    window.speechSynthesis.cancel();

    // 不再需要语言检测，直接使用传入的 lang
    let actualLang = lang.split('-')[0].toLowerCase(); // 确保使用基础语言代码

    // 创建语音合成实例
    const utterance = new SpeechSynthesisUtterance(text);

    // 根据不同语言优化语音参数
    const languageSettings = {
        'zh': { rate: 0.9, pitch: 1.0, volume: 0.95 },  // 中文
        'ja': { rate: 0.85, pitch: 1.0, volume: 0.95 }, // 日语
        'ko': { rate: 0.9, pitch: 1.0, volume: 1.0 },   // 韩语
        'de': { rate: 0.9, pitch: 1.0, volume: 1.0 },   // 德语
        'fr': { rate: 0.9, pitch: 1.0, volume: 1.0 },   // 法语
        'es': { rate: 0.9, pitch: 1.0, volume: 1.0 },   // 西班牙语
        'ru': { rate: 0.85, pitch: 1.0, volume: 1.0 },  // 俄语
        'en': { rate: 0.95, pitch: 1.0, volume: 1.0 }   // 英语
    };

    // 获取语言的基础代码
    let baseLang = actualLang; // 使用传入的语言代码
    let settings;

    // 检查 baseLang 是否在预设中，否则用英语设置
    if (!languageSettings[baseLang]) {
        console.log(`语言 '${baseLang}' 未找到特定设置，默认使用英语设置。`);
        settings = languageSettings['en']; // 默认使用英语设置
    } else {
        settings = languageSettings[baseLang]; // 使用特定语言设置
    }


    // console.log('settings', settings);
    console.log('最终使用的语言代码 (baseLang):', baseLang);

    // 应用设置
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;

    // 如果是句子，降低语速
    if (isSentence) {
        utterance.rate *= 0.95;
    }

    // 获取所有可用的语音
    let voices = window.speechSynthesis.getVoices();

    // 按语言筛选语音
    const matchingVoices = voices.filter(voice =>
        voice.lang && voice.lang.toLowerCase().startsWith(baseLang)
    );

    // 语音质量评分函数
    const getVoiceScore = (voice) => {
        let score = 0;
        // Google 语音优先
        if (voice.name.includes('Google')) score += 5;
        // Microsoft 语音次之
        else if (voice.name.includes('Microsoft')) score += 4;
        // 自然语音
        else if (voice.name.includes('Natural')) score += 3;
        // 本地语音
        else if (!voice.localService) score += 2;
        // 完全匹配语言代码的优先
        if (voice.lang.toLowerCase() === actualLang || voice.lang.toLowerCase().startsWith(baseLang)) score += 2;
        return score;
    };

    // 按评分排序选择最佳语音
    const bestVoice = matchingVoices.sort((a, b) =>
        getVoiceScore(b) - getVoiceScore(a)
    )[0];

    // 应用选中的语音
    if (bestVoice) {
        console.log(`选择语音: ${bestVoice.name} (${bestVoice.lang})`);
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang; // 使用找到的最佳语音的lang
    } else {
        console.log(`未找到匹配的 ${baseLang} 语音，使用默认语音`);
        utterance.lang = baseLang; // fallback 到基础语言代码
    }

    // 设置播放完成事件
    utterance.onend = function() {
        chrome.runtime.sendMessage({
            action: "audioPlaybackCompleted",
            audioType: isSentence ? "sentence" : "word"
        });
    };

    // 设置播放开始事件
    utterance.onstart = function() {
        console.log('本地TTS开始播放...');
        chrome.runtime.sendMessage({
            action: "audioPlaybackStarted",
            audioType: isSentence ? "sentence" : "word"
        });
    };

    // 设置播放错误事件
    utterance.onerror = function(event) {
        console.error('语音合成错误:', event.error);
        chrome.runtime.sendMessage({
            action: "audioPlaybackError",
            error: event.error,
            audioType: isSentence ? "sentence" : "word"
        });
    };

    // 播放语音
    window.speechSynthesis.speak(utterance);
}
