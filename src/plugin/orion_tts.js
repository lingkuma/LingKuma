// Orion TTS - 用于在iOS Safari ORION浏览器中处理TTS逻辑
// 纯JavaScript实现，不依赖chrome.runtime.onMessage通信


//搞笑；Orion记不住信任。IOS不信任本地证书。权威证书不授权本地地址。

// 音频播放器实例 - 分离单词和句子播放器
let orion_wordAudioPlayer = null;
let orion_sentenceAudioPlayer = null;
let orion_pendingAudioData = [];
let orion_mediaSource = null;
let orion_sourceBuffer = null;

// 全局音频元素 - 用于在弹窗中显示
let orion_globalAudioElement = null;
let orion_currentAudioUrl = null;
let orion_isIOS = false; // 默认值设为false
// 初始化时立即获取状态
(async function initOrionTTS() {
    try {
        orion_isIOS = await getOrionTTSEnabled();
        console.log('Orion TTS初始化完成，状态:', orion_isIOS);
    } catch (error) {
        console.error('Orion TTS初始化失败:', error);
    }
})();

// 获取Orion TTS开关状态
async function getOrionTTSEnabled() {
    try {
        const orionTTSEnabled = await getStorageValue('useOrionTTS');
        console.log('Orion TTS开关状态:', orionTTSEnabled);
        return orionTTSEnabled === true; // 确保返回布尔值
    } catch (error) {
        console.error('获取Orion TTS状态失败:', error);
        return false; // 出错时返回false
    }
}



// TTS配置缓存
let orion_ttsConfig = null;
let orion_aiConfig = null;

// 初始化函数 - 加载必要的配置
async function orion_init() {
    // 加载TTS配置
    orion_ttsConfig = await orion_getStorageData('ttsConfig') || {
        wordTTSProvider: 'edge',
        sentenceTTSProvider: 'edge ',
        wordAudioUrlTemplate: '',
        wordAudioUrlTemplate2: ''
    };

    // 加载AI配置
    orion_aiConfig = await orion_getStorageData('aiConfig') || {};

    console.log("Orion TTS 已初始化", orion_ttsConfig);
}

// 从storage获取数据的辅助函数
function orion_getStorageData(key) {
    return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(key, function(result) {
                resolve(result[key]);
            });
        } else {
            // 在不支持chrome API的环境中提供默认值
            resolve(null);
        }
    });
}

// 判断文本是否为句子
function orion_isSentenceText(text, lang) {
    // 对于日语和中文等语言的特殊处理
    if (lang === 'ja' || lang === 'zh') {
        // 检查是否包含句号、感叹号、问号等标点符号
        const punctuationMarks = /[。！？\.!?]/;
        // 或者文本长度超过特定字符
        return punctuationMarks.test(text) || text.length > 4;
    }

    // 其他语言继续使用空格判断
    return text.includes(' ');
}



// 主要的播放文本函数
async function orion_playText(params) {
    const { text, count = 1, sentence } = params;
    if (!text) return;
    // 语言检测已切换为tts主流程的AI检测
    const lang = await fetchLanguageDetection(text, sentence) || 'auto';
    const isSentence = orion_isSentenceText(text, lang);
    let canPlayTTS = true;
    if (!orion_ttsConfig) {
        await orion_init();
    }
    const enableWordTTS = await orion_getStorageData('enableWordTTS');
    const enableSentenceTTS = await orion_getStorageData('enableSentenceTTS');
    if (isSentence && enableSentenceTTS === false) {
        canPlayTTS = false;
    } else if (!isSentence && enableWordTTS === false) {
        canPlayTTS = false;
    }
    if (!canPlayTTS) return;
    if (isSentence) {
        orion_stopSentenceAudio();
    } else {
        orion_stopWordAudio();
    }
    if (isSentence) {
        const provider = orion_ttsConfig.sentenceTTSProvider || 'local';
        if (provider === 'edge') {
            await orion_playEdgeTTS(text, lang, isSentence);
        } else if (provider === 'minimaxi') {
            await orion_playMinimaxi(text, lang);
        } else if (provider === 'custom') {
            await orion_playCustom(text, count, 1, sentence);
        } else if (provider === 'custom2') {
            await orion_playCustom(text, count, 2, sentence);
        } else {
            await orion_playLocalSpeech(text, lang, true);
        }
    } else {
        const provider = orion_ttsConfig.wordTTSProvider || 'local';
        if (provider === 'edge') {
            await orion_playEdgeTTS(text, lang, isSentence);
        } else if (provider === 'minimaxi') {
            await orion_playMinimaxi(text, lang);
        } else if (provider === 'custom') {
            await orion_playCustom(text, count, 1, sentence);
        } else if (provider === 'custom2') {
            await orion_playCustom(text, count, 2, sentence);
        } else {
            await orion_playLocalSpeech(text, lang, false);
        }
    }
}

// 获取自定义音频URL
async function orion_getWordAudioUrl(word, lang, urlType = 1) {
    // 如果配置未加载，先加载配置
    if (!orion_ttsConfig) {
        await orion_init();
    }

    let urlTemplate = '';

    // 根据urlType选择不同的URL模板
    if (urlType === 1) {
        urlTemplate = orion_ttsConfig.wordAudioUrlTemplate || '';
    } else if (urlType === 2) {
        urlTemplate = orion_ttsConfig.wordAudioUrlTemplate2 || '';
    }

    // 如果URL模板为空，则使用默认URL
    if (!urlTemplate) {
        return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=${lang}&client=tw-ob`;
    }

    // 使用 parseTemplateAll 进行完整的表达式解析（支持复杂函数调用）
    const context = {
        lang,
        word
    };

    let url = parseTemplateAll(urlTemplate, context);

    // 检查URL是否有效
    if (!url) {
        return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=${lang}&client=tw-ob`;
    }

    return url;
}

// 播放自定义URL音频
async function orion_playCustom(word, count, urlType = 1, sentence = "") {
    try {
        // 语言检测已切换为tts主流程的AI检测
        const lang = await fetchLanguageDetection(word, sentence) || 'auto';
        const url = await orion_getWordAudioUrl(word, lang, urlType);
        // 只停止单词音频
        orion_stopWordAudio();

        // 设置全局音频URL
        orion_setAudioUrl(url);

        // 优先使用全局音频元素
        if (orion_globalAudioElement) {
            console.log('使用全局音频元素播放自定义URL');
            orion_wordAudioPlayer = orion_globalAudioElement;
            orion_wordAudioPlayer.volume = 0.5;
        } else {
            // 如果全局音频元素不存在，使用普通Audio对象
            console.log('全局音频元素不存在，使用普通Audio对象');
            orion_wordAudioPlayer = new Audio(url);
            orion_wordAudioPlayer.volume = 0.5;
        }

        let playCount = 0;
        orion_wordAudioPlayer.onended = () => {
            playCount++;
            if (playCount < count && orion_wordAudioPlayer) {
                orion_wordAudioPlayer.play();
            }
        };

        // 播放音频
        orion_wordAudioPlayer.play().catch(error => {
            console.error('播放单词出错:', error);
            console.log('iOS设备需要用户交互才能播放音频，请点击播放按钮');
        });
    } catch (error) {
        console.error('播放单词出错:', error);
    }
}

// 播放minimaxi TTS
async function orion_playMinimaxi(sentence, lang) {
    try {
        // 如果配置未加载，先加载配置
        if (!orion_aiConfig) {
            await orion_init();
        }

        // 只停止句子音频
        orion_stopSentenceAudio();

        // 替换文本中的"im"为"Im"
        sentence = sentence.replace(/im/g, "Im");

        // 获取minimaxi配置
        const group_id = orion_aiConfig.minimaxiGroupId || "1879163477474414979";
        const api_key = orion_aiConfig.minimaxiApiKey || "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiJraW5nIGFkb20iLCJVc2VyTmFtZSI6ImtpbmcgYWRvbSIsIkFjY291bnQiOiIiLCJTdWJqZWN0SUQiOiIxODc5MTYzNDc3NDgyODAzNTg3IiwiUGhvbmUiOiIiLCJHcm91cElEIjoiMTg3OTE2MzQ3NzQ3NDQxNDk3OSIsIlBhZ2VOYW1lIjoiIiwiTWFpbCI6InRpbnZkZUBnbWFpbC5jb20iLCJDcmVhdGVUaW1lIjoiMjAyNS0wMy0xNSAwMzoxMTozMSIsIlRva2VuVHlwZSI6MSwiaXNzIjoibWluaW1heCJ9.F2qLKhTG9SbJcttPAvMPBGCC3ejDnB53xkut_eflk6SJSzuz5sT89aHnVx_yA6e3v08mcYfwNhwV1DHkcUJMZnNtEJM_V-smBZ1rgnM3eZ0QfLozGBB1hnuRhhHOURJ7usXcfMzb6fCpO7m0GSdcJpNIJugl3T-uQl6_-ucc8Dlj4waWulqGGMC10rwb_OUwW8IL7VINTKuz8d_mdafUbTWUNujuQDlHwWS7s7Nuz6PGa8v9RVnyY_cpwyoWDZBJXigLf6KxcBhunmWEeT7PeVf06hWCKQrW4Az3Ib1dcYtiWlyDphmZN9L6n0NEo92eeRMcsC8ZJLRmLr1bHQAumw";
        const voice_id = orion_aiConfig.minimaxiVoiceId || 'English_Graceful_Lady';
        const model = orion_aiConfig.minimaxiModel || 'speech-01-turbo';
        const speed = parseInt(orion_aiConfig.minimaxiSpeed) || 1.1;
        const baseURL = orion_aiConfig.minimaxiBaseURL || 'https://api.minimaxi.chat/v1/t2a_v2?GroupId=';

        // 随机选择情感
        const emotion_list = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"];
        const randomEmotion = emotion_list[Math.floor(Math.random() * emotion_list.length)];

        // 根据语言选择language_boost
        let language_boost = 'auto';
        switch (lang) {
            case 'zh': language_boost = 'Chinese'; break;
            case 'en': language_boost = 'English'; break;
            case 'ja': language_boost = 'Japanese'; break;
            case 'ko': language_boost = 'Korean'; break;
            case 'fr': language_boost = 'French'; break;
            case 'de': language_boost = 'German'; break;
            case 'es': language_boost = 'Spanish'; break;
            case 'ru': language_boost = 'Russian'; break;
            default: language_boost = 'auto';
        }

        const apiEndpoint = `${baseURL}${group_id}`;

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                text: sentence,
                stream: true,
                language_boost: language_boost,
                voice_setting: {
                    voice_id: voice_id,
                    speed: speed,
                    vol: 1,
                    pitch: 0,
                    emotio: randomEmotion
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
        if (orion_globalAudioElement) {
            console.log('使用全局音频元素播放minimaxi TTS');
            orion_sentenceAudioPlayer = orion_globalAudioElement;
        } else {
            console.log('全局音频元素不存在，使用普通Audio对象');
            orion_sentenceAudioPlayer = new Audio();
        }
        orion_mediaSource = new MediaSource();
        const mediaSourceUrl = URL.createObjectURL(orion_mediaSource);
        orion_sentenceAudioPlayer.src = mediaSourceUrl;
        // 如果使用全局音频元素，设置全局音频URL
        if (orion_globalAudioElement) {
            orion_currentAudioUrl = mediaSourceUrl;
        }
        orion_pendingAudioData = [];

        // 初始化MediaSource
        await new Promise(resolve => {
            orion_mediaSource.addEventListener('sourceopen', () => {
                orion_sourceBuffer = orion_mediaSource.addSourceBuffer('audio/mpeg');
                orion_sourceBuffer.addEventListener('updateend', () => {
                    if (orion_pendingAudioData.length > 0 && !orion_sourceBuffer.updating) {
                        const nextChunk = orion_pendingAudioData.shift();
                        orion_sourceBuffer.appendBuffer(nextChunk);
                    }
                });
                resolve();
            });
        });

        // 收集初始数据标志
        let initialBufferingComplete = false;
        let initialChunksCount = 0;
        const MIN_INITIAL_CHUNKS = 1; // 只要有2段数据就开始播放

        // 处理流数据
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                // 等待所有更新完成
                while (orion_pendingAudioData.length > 0) {
                    if (!orion_sourceBuffer.updating) {
                        const nextChunk = orion_pendingAudioData.shift();
                        orion_sourceBuffer.appendBuffer(nextChunk);
                    }
                    await orion_waitForUpdateEnd();
                }

                // 结束流
                if (!orion_sourceBuffer.updating) {
                    orion_mediaSource.endOfStream();
                } else {
                    orion_sourceBuffer.addEventListener('updateend', () => {
                        orion_mediaSource.endOfStream();
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
                        const audioData = orion_appendAudioChunk(data.data.audio);

                        // 初始缓冲逻辑
                        if (!initialBufferingComplete) {
                            initialChunksCount++;
                            if (initialChunksCount >= MIN_INITIAL_CHUNKS && !orion_sentenceAudioPlayer.paused) {
                                initialBufferingComplete = true;
                                console.log('初始缓冲完成，开始播放');
                                orion_sentenceAudioPlayer.play();
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
                orion_sentenceAudioPlayer.play().catch(e => console.error('播放启动失败:', e));
            }
        }
    } catch (error) {
        console.error('播放句子出错:', error);
    }
}

// 添加音频数据到流
function orion_appendAudioChunk(hexString) {
    if (!hexString || !orion_sourceBuffer) return null;

    const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

    if (orion_sourceBuffer.updating || orion_pendingAudioData.length > 0) {
        orion_pendingAudioData.push(bytes.buffer);
    } else {
        orion_sourceBuffer.appendBuffer(bytes.buffer);
    }

    return bytes.buffer;
}

// 等待sourceBuffer更新完成
function orion_waitForUpdateEnd() {
    return new Promise((resolve) => {
        if (!orion_sourceBuffer.updating) {
            resolve();
        } else {
            orion_sourceBuffer.addEventListener('updateend', resolve, { once: true });
        }
    });
}

// 播放本地语音
async function orion_playLocalSpeech(text, lang, isSentence) {
    console.log('orion_playLocalSpeech:', text, lang, isSentence);

    // 停止当前播放
    if (isSentence) {
        orion_stopSentenceAudio();
    } else {
        orion_stopWordAudio();
    }
    window.speechSynthesis.cancel();


    // 确保使用基础语言代码
    let actualLang = lang.split('-')[0].toLowerCase();

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
    let baseLang = actualLang;
    let settings;

    // 检查 baseLang 是否在预设中，否则用英语设置
    if (!languageSettings[baseLang]) {
        console.log(`语言 '${baseLang}' 未找到特定设置，默认使用英语设置。`);
        settings = languageSettings['en']; // 默认使用英语设置
    } else {
        settings = languageSettings[baseLang]; // 使用特定语言设置
    }

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

    // 播放语音
    window.speechSynthesis.speak(utterance);
}

// 停止单词音频
function orion_stopWordAudio() {
    if (orion_wordAudioPlayer) {
        orion_wordAudioPlayer.pause();
        orion_wordAudioPlayer = null;
    }

    // 如果当前正在播放的是单词，也停止语音合成
    window.speechSynthesis.cancel();
}

// 停止句子音频
function orion_stopSentenceAudio() {
    if (orion_sentenceAudioPlayer) {
        orion_sentenceAudioPlayer.pause();
        if (orion_mediaSource && orion_mediaSource.readyState === 'open') {
            try {
                orion_mediaSource.endOfStream();
            } catch (e) {
                // 忽略可能的错误
            }
        }
        orion_sentenceAudioPlayer = null;
        orion_mediaSource = null;
        orion_sourceBuffer = null;
        orion_pendingAudioData = [];
    }

    // 如果当前正在播放的是句子，也停止语音合成
    window.speechSynthesis.cancel();
}

// 停止所有音频
function orion_stopAllAudio() {
    orion_stopWordAudio();
    orion_stopSentenceAudio();

    // 停止语音合成
    window.speechSynthesis.cancel();
}

// 新增 edge 播放实现
async function orion_playEdgeTTS(text, lang, isSentence) {
    // 参考 tts.js 的参数选择逻辑
    let ttsConfig = orion_ttsConfig || {};
    const autoVoice = ttsConfig.edgeTTSAutoVoice !== false;
    let voice = ttsConfig.edgeTTSVoice || 'en-US-AriaNeural';
    if (autoVoice) {
        const baseLang = lang.split('-')[0].toLowerCase();
        switch (baseLang) {
            case 'zh': voice = 'zh-CN-XiaoxiaoNeural'; break;
            case 'en': voice = 'en-US-AriaNeural'; break;
            case 'de': voice = isSentence ? 'de-DE-SeraphinaMultilingualNeural' : 'de-DE-AmalaNeural'; break;
            case 'ja': voice = 'ja-JP-NanamiNeural'; break;
            case 'ru': voice = 'ru-RU-DmitryNeural'; break;
            case 'fr': voice = 'fr-FR-VivienneMultilingualNeural'; break;
            case 'es': voice = 'es-ES-ElviraNeural'; break;
            default: voice = 'en-US-AriaNeural';
        }
    }
    const rate = ttsConfig.edgeTTSRate || 1;
    const volume = ttsConfig.edgeTTSVolume || 1;
    const pitch = ttsConfig.edgeTTSPitch || 1;
    // 参数转换
    const rateStr = rate > 0 ? `+${rate}%` : `${rate}%`;
    const volumeStr = volume > 0 ? `+${volume}%` : `${volume}%`;
    const pitchStr = pitch > 0 ? `+${pitch}%` : `${pitch}%`;

    // 检测是否为iOS设备
    const isIOS = true; // 强制启用iOS模式，用于测试

    const speakOptions = {
        text: text,
        voice: voice,
        language: voice.split('-').slice(0, 2).join('-'),
        rate: rateStr,
        pitch: pitchStr,
        volume: volumeStr
    };

    // 单词模式：收集所有音频块后一次性播放
    if (!isSentence) {
        const result = await edgetts_speak(speakOptions);
        const audioBlob = edgetts_mp3Blob(result);
        const audioUrl = URL.createObjectURL(audioBlob);

        // 在iOS Safari中，设置全局音频URL
        if (orion_isIOS) {
            // 设置全局音频URL
            orion_setAudioUrl(audioUrl);

            // 如果全局音频元素已存在，使用它
            if (orion_globalAudioElement) {
                orion_wordAudioPlayer = orion_globalAudioElement;
            } else {
                // 如果全局音频元素不存在，使用普通Audio对象
                orion_wordAudioPlayer = new Audio(audioUrl);
            }
        } else {
            // 非iOS设备使用普通Audio对象
            orion_wordAudioPlayer = new Audio(audioUrl);
        }

        orion_wordAudioPlayer.onended = function() {
            URL.revokeObjectURL(audioUrl);
        };

        // 尝试播放
        orion_wordAudioPlayer.play().catch(e => {
            console.error('Orion TTS: Error playing word audio from edge:', e);

            // 在iOS Safari中，如果自动播放失败，提示用户点击播放
            if (isIOS) {
                console.log('iOS设备需要用户交互才能播放音频，请点击播放按钮');
            } else {
                URL.revokeObjectURL(audioUrl);
            }
        });
    } else {
        // 句子模式：由于 edgetts_speak 现在返回完整的 Blob，直接播放
        orion_stopSentenceAudio(); // 确保停止之前的句子播放实例

        const result = await edgetts_speak(speakOptions);
        const audioBlob = edgetts_mp3Blob(result);
        const audioUrl = URL.createObjectURL(audioBlob);

        // 在iOS Safari中，设置全局音频URL
        if (orion_isIOS) {
            // 设置全局音频URL
            orion_setAudioUrl(audioUrl);

            // 如果全局音频元素已存在，使用它
            if (orion_globalAudioElement) {
                orion_sentenceAudioPlayer = orion_globalAudioElement;
            } else {
                // 如果全局音频元素不存在，使用普通Audio对象
                orion_sentenceAudioPlayer = new Audio(audioUrl);
            }
        } else {
            // 非iOS设备使用普通Audio对象
            orion_sentenceAudioPlayer = new Audio(audioUrl);
        }

        orion_sentenceAudioPlayer.onended = function() {
            URL.revokeObjectURL(audioUrl);
        };

        orion_sentenceAudioPlayer.onerror = function(e) {
            console.error('Orion TTS: Error playing sentence audio from edge:', e);
            URL.revokeObjectURL(audioUrl);
        };

        // 尝试播放
        try {
            await orion_sentenceAudioPlayer.play();
        } catch (error) {
            console.error('Orion TTS: Failed to play sentence audio from edge:', error);

            // 在iOS Safari中，如果自动播放失败，提示用户点击播放
            if (isIOS) {
                console.log('iOS设备需要用户交互才能播放音频，请点击播放按钮');
            } else {
                URL.revokeObjectURL(audioUrl); // 确保在播放失败时也释放对象URL
            }
        }
    }
}

// 初始化Orion TTS
orion_init();

// 设置全局音频元素的URL
function orion_setAudioUrl(url) {
    console.log('设置全局音频URL:', url);
    orion_currentAudioUrl = url;

    // 如果全局音频元素已存在，更新其URL
    if (orion_globalAudioElement) {
        orion_globalAudioElement.src = url;

        // 尝试播放
        orion_globalAudioElement.play().catch(error => {
            console.error('播放全局音频出错:', error);
            console.log('iOS设备需要用户交互才能播放音频，请点击播放按钮');
        });
    }

    return url;
}

// 获取全局音频元素
function orion_getAudioElement() {
    return orion_globalAudioElement;
}

// 设置全局音频元素
function orion_setAudioElement(audioElement) {
    orion_globalAudioElement = audioElement;

    // 如果有当前URL，设置到新的音频元素
    if (orion_currentAudioUrl && orion_globalAudioElement) {
        orion_globalAudioElement.src = orion_currentAudioUrl;
    }

    return orion_globalAudioElement;
}

// 创建临时的音频元素（用于测试）
function orion_createVisibleAudioElement(url, id = 'visible-audio-player') {
    console.log('创建临时音频元素:', id, url);

    // 设置全局音频URL
    orion_setAudioUrl(url);

    // 创建临时音频元素
    const tempAudio = document.createElement('audio');
    tempAudio.id = id + '-temp';
    tempAudio.controls = true;
    tempAudio.autoplay = true;
    tempAudio.src = url;

    return tempAudio;
}

// 暴露函数到全局作用域
window.orion_playText = orion_playText;
window.orion_stopAllAudio = orion_stopAllAudio;
window.orion_createVisibleAudioElement = orion_createVisibleAudioElement;
window.orion_setAudioUrl = orion_setAudioUrl;
window.orion_getAudioElement = orion_getAudioElement;
window.orion_setAudioElement = orion_setAudioElement;
window.orion_isIOS = orion_isIOS;

console.log("Orion TTS 纯JS版本已加载");
