// Convert duration to milliseconds


// ---配置项目
//在options.js添加edgetts的渠道，以及配置页面。
//配置页面添加一个按钮，取消就是自动程序进行选择声音，开启就是用户选择声音，强制覆盖。

//但是语速 音调 音量 这些参数是公用的， 也就是是说这个参数不管是程序自动选择还是用户自定义，都是可用的。 
//用户只是强制选择了某个声音，但是语速 音调 音量 这些参数是公用的。
//edge_list.js 是所有可用添加edge的列表。


// ---TTS 播放
// 在tts.js 中添加对edgetts渠道的判断。
//  在tts中完成对用户配置/程序自动选择 的过程。
// 如果用户配置了，则强制使用用户配置的声音。
// 如果用户没有配置，则程序自动选择。
// 我们代码已经有语言判断的代码，所以我需要给你几个 语言对应出来的固定值
// 英语：voice: "en-US-AriaNeural" language: "en-US"
// 中文：voice: "zh-CN-XiaoxiaoNeural" language: "zh-CN"
// 德语：voice: "de-DE-SeraphinaMultilingualNeural" language: "de-DE"
// 日语：voice: "ja-JP-NanamiNeural" language: "ja-JP"
// 俄语：voice: "ru-RU-DmitryNeural" language: "ru-RU"
// 法语：voice: "fr-FR-VivienneMultilingualNeural" language: "fr-FR"
// 西班牙语：voice: "es-ES-ElviraNeural" language: "es-ES"
// 其他语言：voice: "en-US-AriaNeural" language: "en-US"


// 在background中监听tts.js 的播放事件，然后调用offscreen.js 的播放函数。
// 在offscreen.js 中重新实现edge_tts.js 代码（可以直接拷贝国区）
// 先不管orion 渠道的代码。先完成offscreen 等TTS的实现。



// 2. 播放句子的方法
// 在控制台中，您可以这样播放一个句子
// ///
// // 创建EdgeTts实例
// var tts = new EdgeTts();

// 、
// // 播放中文句子
// tts.speak({
//   text: "你好，这是一个测试句子。",
//   voice: "zh-CN-XiaoxiaoNeural", // 中文女声
//   language: "zh-CN",
// rate: '+10%', // 语速
// pitch: "-10%" , // 音调
// volume:  '-40%'
// }).then(function(result) {
//   // 获取音频Blob并播放
//   var audioBlob = result.mp3Blob();
//   var audioUrl = URL.createObjectURL(audioBlob);
//   var audio = new Audio(audioUrl);
//   audio.play();
  
//   // 播放完成后释放资源
//   audio.onended = function() {
//     URL.revokeObjectURL(audioUrl);
//     tts.close(); // 关闭WebSocket连接
//   };
// });


// 3. 播放单词的方法
// 播放单个英文单词


// // 创建EdgeTts实例
// var tts = new EdgeTts();

// // 播放英文单词
// tts.speak({
//   text: "hello",
//   voice: "en-US-AriaNeural", // 英文女声
//   language: "en-US"
// }).then(function(result) {
//   var audioBlob = result.mp3Blob();
//   var audioUrl = URL.createObjectURL(audioBlob);
//   var audio = new Audio(audioUrl);
//   audio.play();
  
//   audio.onended = function() {
//     URL.revokeObjectURL(audioUrl);
//     tts.close();
//   };
// });
// 4. 获取可用语音列表
// 如果您想查看所有可用的语音：




// var tts = new EdgeTts();
// tts.voices().then(function(voices) {
//   console.log('可用语音列表:', voices);
  
//   // 筛选中文语音
//   var chineseVoices = voices.filter(function(voice) {
//     return voice.Locale.startsWith('zh-');
//   });
//   console.log('中文语音:', chineseVoices);
  
//   // 筛选英文语音
//   var englishVoices = voices.filter(function(voice) {
//     return voice.Locale.startsWith('en-');
//   });
//   console.log('英文语音:', englishVoices);
// });


// 5. 简化的播放函数
// 您可以在控制台中定义这些辅助函数，方便使用

// // 播放句子
// function playSentence(text, voice, language) {
//   var tts = new EdgeTts();
//   return tts.speak({
//     text: text,
//     voice: voice || 'zh-CN-XiaoxiaoNeural',
//     language: language || 'zh-CN'
//   }).then(function(result) {
//     var audioBlob = result.mp3Blob();
//     var audioUrl = URL.createObjectURL(audioBlob);
//     var audio = new Audio(audioUrl);
//     audio.play();
    
//     audio.onended = function() {
//       URL.revokeObjectURL(audioUrl);
//       tts.close();
//     };
//     return audio;
//   });
// }

// // 播放单词
// function playWord(word) {
//   return playSentence(word, 'en-US-AriaNeural', 'en-US');
// }



// // 播放中文句子
// playSentence("今天天气真好");

// // 播放英文单词
// playWord("hello");








//---





// 全局变量
var edgetts_token = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
var edgetts_wss_url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

// 工具函数
function edgetts_toMs(duration) {
  return Math.floor(duration / 10000);
}

// 生成UUID
function edgetts_generateUUID() {
  return 'xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 生成Sec-MS-GEC参数
function edgetts_generateSecMsGec(trustedClientToken) {
  return new Promise(async function(resolve) {
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
}

// 获取合成URL
function edgetts_getSynthUrl(token) {
  token = token || edgetts_token;
  return edgetts_generateSecMsGec(token).then(function(secMsGEC) {
    const reqId = edgetts_generateUUID();
    return edgetts_wss_url + '?TrustedClientToken=' + token + 
           '&Sec-MS-GEC=' + secMsGEC + 
           '&Sec-MS-GEC-Version=1-130.0.2849.68' + 
           '&ConnectionId=' + reqId;
  });
}

// 生成SSML字符串
function edgetts_ssmlStr(options) {
  var voice = options.voice || 'en-US-AvaNeural';
  var language =  'en-US'; //options.language ||
  var rate = options.rate || 'default';
  var pitch = options.pitch || 'default';
  var volume = options.volume || 'default';
  var requestId = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : (Date.now() + Math.random());
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

// TTS结果对象
function edgetts_TtsResult() {
  this.audioParts = [];
  this.marks = [];
}
function edgetts_mp3Blob(result) {
  return new Blob(result.audioParts, { type: 'audio/mpeg' });
}

// 获取可用语音
function edgetts_voices(token) {
  token = token || edgetts_token;
  var url = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=' + token;
  return fetch(url).then(function(response) {
    return response.json();
  });
}

// 连接WebSocket
function edgetts_connWebsocket(token) {
  token = token || edgetts_token;
  return edgetts_getSynthUrl(token).then(function(url) {
    var ws = new WebSocket(url);
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
        resolve(ws);
      });
      ws.addEventListener('error', reject);
      ws.addEventListener('close', console.info);
    });
  });
}

// 关闭WebSocket
function edgetts_close(ws) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}

// 主播函数（支持流式播放）
function edgetts_speak(options, onAudioChunk, onComplete) {
  return edgetts_connWebsocket().then(function(ws) {
    var textXml = edgetts_ssmlStr(options);
    ws.send(textXml);
    var result = new edgetts_TtsResult();
    
    let pendingBlobProcessing = 0;
    let turnEnded = false;

    return new Promise(function(resolveSpeakPromise, rejectSpeakPromise) {
      function checkAndFinalize() {
        if (turnEnded && pendingBlobProcessing === 0) {
          // 所有 blob.text() 操作完成，并且 turn.end 已接收
          if (typeof onAudioChunk === 'function' && result.audioParts.length > 0) {
            var finalBlob = new Blob(result.audioParts, { type: 'audio/mpeg' });
            onAudioChunk(finalBlob, true); // true 表示这是完整的音频
          }
          if (typeof onComplete === 'function') {
            onComplete(result);
          }
          resolveSpeakPromise(result);
        }
      }

      ws.addEventListener('message', function(message) {
        if (typeof message.data !== 'string') { // Audio data
          pendingBlobProcessing++;
          var blob = message.data;
          var separator = 'Path:audio\r\n';
          
          blob.text().then(function(text) {
            var index = text.indexOf(separator);
            if (index === -1) {
                console.error("Separator 'Path:audio\r\n' not found in audio message part.");
                // 如果找不到分隔符，可能需要跳过这个blob或以其他方式处理错误
            } else {
                index += separator.length; // separator.length 是 12
                var audioBlob = blob.slice(index);
                result.audioParts.push(audioBlob);
            }
            pendingBlobProcessing--;
            checkAndFinalize();
          }).catch(function(err){
            console.error("Error processing blob.text():", err);
            pendingBlobProcessing--;
            checkAndFinalize(); // 即使出错，也需要检查是否可以结束
          });
          return; 
        }
        
        // Metadata handling
        if (message.data.includes('Path:audio.metadata')) {
          var parts = message.data.split('Path:audio.metadata');
          if (parts.length >= 2) {
            try {
              var meta = JSON.parse(parts[1]);
              if (meta && meta.Metadata && meta.Metadata.length > 0) {
                result.marks.push(meta.Metadata[0]);
              }
            } catch (e) { /* console.error("Error parsing metadata:", e); */ }
          }
        } else if (message.data.includes('Path:turn.end')) {
          turnEnded = true;
          checkAndFinalize();
        }
      });

      ws.addEventListener('error', function(err) {
        console.error("WebSocket error in edgetts_speak:", err);
        rejectSpeakPromise(err); // 发生错误时拒绝主 Promise
      });

      // 可以选择性地处理 'close' 事件，例如如果非正常关闭
      // ws.addEventListener('close', function(event) {
      //   if (!turnEnded) { // 如果在 turn.end 之前关闭
      //     console.warn("WebSocket closed before turn.end.", event);
      //     // 根据情况决定是否 reject 或 resolve (可能带有部分数据)
      //     // rejectSpeakPromise(new Error('WebSocket closed prematurely'));
      //   }
      // });
    });
  });
}

// 兼容原有API
// 以前的EdgeTts、toMs等名字，保留为全局函数（指向新实现）
var EdgeTts = function(token) {
  this.token = token || edgetts_token;
};
EdgeTts.prototype.voices = function() { return edgetts_voices(this.token); };
EdgeTts.prototype.connWebsocket = function() { return edgetts_connWebsocket(this.token); };
EdgeTts.prototype.close = function() { /* 仅保留兼容性，实际不再需要 */ };
EdgeTts.prototype.speak = function(options, onAudioChunk, onComplete) { return edgetts_speak(options, onAudioChunk, onComplete); };

// 兼容toMs
function toMs(duration) { return edgetts_toMs(duration); }

// 兼容window.XXX
window.EdgeTts = EdgeTts;
window.toMs = toMs;
// 但建议直接用edgetts_xxx系列函数
