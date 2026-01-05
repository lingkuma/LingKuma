// 音频播放器实例（删除全局audioPlayer）
// let audioPlayer;
/**
 * 判断文本是否为句子
 * @param {string} text - 要判断的文本
 * @param {string} lang - 语言代码
 * @returns {boolean}
 */
function isSentenceText(text, lang) {
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
/**
 * 播放文本（支持单词或句子）
 * @param {Object} params
 * @param {string} params.text - 要播放的文本
 * @param {number} [params.count=1] - 重复播放次数（仅对单词有效）
 */
async function playText(params) {
    const { text, count = 1, sentence } = params;

    // 检查是否使用Orion TTS
    const useOrionTTS = await new Promise(resolve => {
        chrome.storage.local.get(['useOrionTTS'], function(result) {
            resolve(result.useOrionTTS === true);
        });
    });

    // 如果使用Orion TTS且orion_playText函数可用，则使用Orion TTS
    if (useOrionTTS && window.orion_playText) {
        console.log('使用Orion TTS播放');
        return window.orion_playText(params);
    }

    // 添加防抖机制，避免频繁调用导致冲突
    if (window.ttsPlayTimeout) {
        clearTimeout(window.ttsPlayTimeout);
    }

    // 短暂延迟执行，确保之前的停止操作完成
    return new Promise((resolve) => {
        window.ttsPlayTimeout = setTimeout(async () => {
            try {
                await playTextInternal(params);
                resolve();
            } catch (error) {
                console.error('TTS播放失败:', error);
                resolve();
            }
        }, 10); // 10毫秒延迟
    });
}

async function playTextInternal(params) {
    const { text, count = 1, sentence } = params;

    // 以下是原始TTS逻辑
    // 获取语言
    const lang = await fetchLanguageDetection(text, sentence) || 'auto';
    // 获取TTS设置，决定是否播放
    let canPlayTTS = true;
    let ttsConfig = { wordTTSProvider: 'edge', sentenceTTSProvider: 'edge' };

    await new Promise(resolve => {
        chrome.storage.local.get(['enableWordTTS', 'enableSentenceTTS', 'ttsConfig'], function(result) {
            // 使用新的判断函数
            const textIsSentence = isSentenceText(text, lang);

            // 根据文本类型和对应的设置决定是否播放
            // 如果是句子，同时句子不允许播放，则不播放，否则检查是否是单词。
            if (textIsSentence && result.enableSentenceTTS === false) {
                canPlayTTS = false;
            } else if (!textIsSentence && result.enableWordTTS === false) {
                canPlayTTS = false;
            }

            // 获取TTS渠道配置
            if (result.ttsConfig) {
                ttsConfig = result.ttsConfig;
            }

            resolve();
        });
    });

    // 如果设置为不播放，则直接返回
    if (!canPlayTTS) {
        return;
    }

    // 判断是句子还是单词
    const isSentence = isSentenceText(text, lang);

    // 仅停止相同类型的音频，而不是所有音频
    // 添加延迟确保停止操作完成
    stopSpecificAudioType(isSentence ? 'sentence' : 'word');

    // 短暂延迟确保停止操作完成
    await new Promise(resolve => setTimeout(resolve, 20));

    // 根据TTS配置选择播放渠道
    try {
        if (isSentence) {
            // 句子播放
            const provider = ttsConfig.sentenceTTSProvider || 'local';
            if (provider === 'minimaxi') {
                await playMinimaxi(text);
            } else if (provider === 'edge') {
                await playEdgeTTS(text, lang, isSentence, sentence);
            } else if (provider === 'custom') {
                await playCustom(text, count, sentence, 1);
            } else if (provider === 'custom2') {
                await playCustom(text, count, sentence, 2);
            } else if (provider === 'local') {
                await playLocal(text, lang, isSentence, sentence);
            }
        } else {
            // 单词播放
            const provider = ttsConfig.wordTTSProvider || 'local';
            if (provider === 'minimaxi') {
                await playMinimaxi(text);
            } else if (provider === 'edge') {
                await playEdgeTTS(text, lang, isSentence, sentence);
            } else if (provider === 'custom') {
                await playCustom(text, count, sentence, 1);
            } else if (provider === 'custom2') {
                await playCustom(text, count, sentence, 2);
            } else if (provider === 'local') {
                console.log('playLocal', text, lang, isSentence);
                await playLocal(text, lang, isSentence, sentence);
            }
        }
    } catch (error) {
        console.error('TTS播放失败:', error);
        // 不抛出错误，避免影响其他功能
    }
}

/**
 * 播放单词
 * 源playWord
 * @private
 * @param {string} word - 要播放的单词或句子
 * @param {number} count - 重复播放次数
 * @param {string} sentence - 上下文句子
 * @param {number} urlType - URL类型：1表示自定义URL1，2表示自定义URL2
 */
async function playCustom(word, count, sentence, urlType = 1) {
    try {
        const lang = await fetchLanguageDetection(word, sentence) || 'auto';
        const url = await getWordAudioUrl(word, lang, urlType);

        // 发送消息给background脚本处理音频播放
        chrome.runtime.sendMessage({
            action: "playAudio",
            audioType: "playCustom",
            url: url,
            count: count,
            volume: 0.5 // 固定音量为0.5
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('发送TTS播放消息失败:', chrome.runtime.lastError);
            }
        });
    } catch (error) {
        console.error('播放单词出错:', error);
    }
}


/**
 * 评估简单表达式
 * @private
 */
function evalSimpleExpr(expr, context) {
    // 处理函数调用
    if (expr.includes('(')) {
        const [funcName, ...args] = expr.split(/[\(\)]/);
        const func = context[funcName.trim()];
        if (typeof func === 'function') {
            // 处理参数
            const evaluatedArgs = args[0].split('+').map(arg => {
                arg = arg.trim();
                if (arg.startsWith('"') || arg.startsWith("'")) {
                    return arg.slice(1, -1);
                }
                return context[arg] || arg;
            });
            return func(...evaluatedArgs);
        }
    }
    // 处理简单变量
    return context[expr.trim()] || expr;
}

/**
 * 评估简单条件
 * @private
 */
function evalSimpleCondition(condition, context) {
    const [left, op, right] = condition.split(/\s*(===|==|!==|!=)\s*/);
    const leftValue = context[left.trim()] || left.trim();
    const rightValue = context[right.trim()] || right.trim().replace(/['"]/g, '');

    switch(op) {
        case '===':
        case '==':
            return leftValue === rightValue;
        case '!==':
        case '!=':
            return leftValue !== rightValue;
        default:
            return false;
    }
}

/**
 * 获取单词音频URL
 * @private
 * @param {string} word - 要播放的单词或句子
 * @param {string} lang - 语言代码
 * @param {number} urlType - URL类型：1表示自定义URL1，2表示自定义URL2
 * @returns {Promise<string>} 处理后的音频URL
 */
function getWordAudioUrl(word, lang, urlType = 1) {
    return new Promise((resolve) => {
        chrome.storage.local.get('ttsConfig', function(result) {
            const config = result.ttsConfig || {};
            let urlTemplate = '';

            // 输出完整的TTS配置，用于调试
            console.log('完整的TTS配置:', config);

            // 根据urlType选择不同的URL模板
            if (urlType === 1) {
                urlTemplate = config.wordAudioUrlTemplate || '';
            } else if (urlType === 2) {
                urlTemplate = config.wordAudioUrlTemplate2 || '';
            }

            console.log(`选择的URL模板 (类型${urlType}):`, urlTemplate);

            const context = {
                lang,
                word
            };

            // 如果URL模板为空，则返回当前页面URL（这是一个临时解决方案）
            if (!urlTemplate) {
                console.warn('URL模板为空，使用默认URL');
                // 使用一个有效的默认URL，例如Google TTS
                const defaultUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=${lang}&client=tw-ob`;
                resolve(defaultUrl);
                return;
            }

            const url = parseTemplateAll(urlTemplate, context);
            console.log(`处理后的音频url (类型${urlType}):`, url);

            // 检查URL是否有效
            if (!url || url === window.location.href) {
                console.error('生成的URL无效:', url);
                // 使用一个有效的默认URL
                const defaultUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(word)}&tl=${lang}&client=tw-ob`;
                resolve(defaultUrl);
                return;
            }

            resolve(url);
        });
    });
}

/**
 * 播放句子
 * 源playSentence
 * @private
 */
async function playMinimaxi(sentence) {
    const voice_id_list = ["English_Whispering_girl", "violet_de"];
    const emotion_list = ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"];

    const randomVoice = voice_id_list[Math.floor(Math.random() * voice_id_list.length)];
    const randomEmotion = emotion_list[Math.floor(Math.random() * emotion_list.length)];
    //lang是ISO 639-1 语言代码
    const lang = await fetchLanguageDetection(sentence, sentence) || 'auto';

    console.log('lang', lang);
// language_boost
// Enhance the ability to recognize specified languages and dialects.
// Supported values include:
// 'Chinese', 'Chinese,Yue', 'English', 'Arabic', 'Russian', 'Spanish', 'French', 'Portuguese', 'German', 'Turkish', 'Dutch', 'Ukrainian', 'Vietnamese', 'Indonesian', 'Japanese', 'Italian', 'Korean', 'auto'


    //根据lang选择language_boost
    let language_boost = 'auto';
    switch (lang) {
        case 'zh':
            language_boost = 'Chinese';
            break;
        case 'en':
            language_boost = 'English';
            break;
        case 'ar':
            language_boost = 'Arabic';
            break;
        case 'ru':
            language_boost = 'Russian';
            break;
        case 'es':
            language_boost = 'Spanish';
            break;
        case 'fr':
            language_boost = 'French';
            break;
        case 'pt':
            language_boost = 'Portuguese';
            break;
        case 'de':
            language_boost = 'German';
            break;
        case 'tr':
            language_boost = 'Turkish';
            break;
        case 'nl':
            language_boost = 'Dutch';
            break;
        case 'uk':
            language_boost = 'Ukrainian';
            break;
        case 'vi':
            language_boost = 'Vietnamese';
            break;
        case 'id':
            language_boost = 'Indonesian';
            break;
        case 'ja':
            language_boost = 'Japanese';
            break;
        case 'it':
            language_boost = 'Italian';
            break;
        case 'ko':
            language_boost = 'Korean';
            break;
        default:
            language_boost = 'auto';
    }

    console.log('language_boost', language_boost);



    // 从存储中获取 minimaxi API 配置
    chrome.storage.local.get('aiConfig', function(result) {
        // 使用存储的值或默认值
        const group_id = result.aiConfig?.minimaxiGroupId || "1879163477474414979" ;
        const api_key = result.aiConfig?.minimaxiApiKey || "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiJraW5nIGFkb20iLCJVc2VyTmFtZSI6ImtpbmcgYWRvbSIsIkFjY291bnQiOiIiLCJTdWJqZWN0SUQiOiIxODc5MTYzNDc3NDgyODAzNTg3IiwiUGhvbmUiOiIiLCJHcm91cElEIjoiMTg3OTE2MzQ3NzQ3NDQxNDk3OSIsIlBhZ2VOYW1lIjoiIiwiTWFpbCI6InRpbnZkZUBnbWFpbC5jb20iLCJDcmVhdGVUaW1lIjoiMjAyNS0wMy0xNSAwMzoxMTozMSIsIlRva2VuVHlwZSI6MSwiaXNzIjoibWluaW1heCJ9.F2qLKhTG9SbJcttPAvMPBGCC3ejDnB53xkut_eflk6SJSzuz5sT89aHnVx_yA6e3v08mcYfwNhwV1DHkcUJMZnNtEJM_V-smBZ1rgnM3eZ0QfLozGBB1hnuRhhHOURJ7usXcfMzb6fCpO7m0GSdcJpNIJugl3T-uQl6_-ucc8Dlj4waWulqGGMC10rwb_OUwW8IL7VINTKuz8d_mdafUbTWUNujuQDlHwWS7s7Nuz6PGa8v9RVnyY_cpwyoWDZBJXigLf6KxcBhunmWEeT7PeVf06hWCKQrW4Az3Ib1dcYtiWlyDphmZN9L6n0NEo92eeRMcsC8ZJLRmLr1bHQAumw";
        const voice_id = result.aiConfig?.minimaxiVoiceId || 'English_Graceful_Lady';//violet_de English_Whispering_girl
        const model = result.aiConfig?.minimaxiModel || 'speech-01-turbo';
        const speed = parseInt(result.aiConfig?.minimaxiSpeed) || 1.1; // 这里做一下str to int 转换
        const baseURL = result.aiConfig?.minimaxiBaseURL || 'https://api.minimaxi.chat/v1/t2a_v2?GroupId=';


        // 发送消息给background脚本处理句子TTS请求
        chrome.runtime.sendMessage({
            action: "playAudio",
            audioType: "playMinimaxi",
            apiEndpoint: `${baseURL}${group_id}`,
            apiKey: api_key,
            sentence: sentence,
            voiceId: voice_id,
            emotion: randomEmotion,
            language_boost: language_boost,
            model: model,
            speed: speed
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('发送Minimax TTS消息失败:', chrome.runtime.lastError);
            }
        });
    });
}

/**
 * 停止特定类型的音频播放
 * @param {string} audioType - 'word' 或 'sentence'
 */
function stopSpecificAudioType(audioType) {
    // 检查是否使用Orion TTS
    chrome.storage.local.get(['useOrionTTS'], function(result) {
        const useOrionTTS = result.useOrionTTS === true;

        // 如果使用Orion TTS且orion_stopAllAudio函数可用
        if (useOrionTTS && window.orion_stopAllAudio) {
            // 由于Orion TTS不支持停止特定类型，所以停止所有音频
            window.orion_stopAllAudio();
        } else {
            // 发送停止特定类型音频的消息给background脚本
            chrome.runtime.sendMessage({
                action: "stopSpecificAudio",
                audioType: audioType
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('发送停止音频消息失败:', chrome.runtime.lastError);
                }
            });
        }
    });
}

/**
 * 停止所有播放
 */
function stopPlay() {
    // 检查是否使用Orion TTS
    chrome.storage.local.get(['useOrionTTS'], function(result) {
        const useOrionTTS = result.useOrionTTS === true;

        // 如果使用Orion TTS且orion_stopAllAudio函数可用
        if (useOrionTTS && window.orion_stopAllAudio) {
            window.orion_stopAllAudio();
        } else {
            // 发送停止播放的消息给background脚本
            chrome.runtime.sendMessage({
                action: "stopAudio"
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('发送停止播放消息失败:', chrome.runtime.lastError);
                }
            });
        }
    });
}

/**
 * 本地TTS播放
 * @param {string} text - 要播放的文本 (单词或句子)
 * @param {string} lang - 目标语言代码或 'auto'
 * @param {boolean} isSentence - 标记是单词还是句子
 * @param {string} [contextSentence] - 可选的上下文句子，用于语言检测
 * @private
 */
async function playLocal(text, lang, isSentence, contextSentence) {
    console.log('Sending playLocal message to background:', { text, lang, isSentence, contextSentence });
    chrome.runtime.sendMessage({
        action: "playAudio",
        audioType: "playLocal",
        text: text, // 要实际播放的文本
        lang: lang, // 用户指定的语言或 'auto'
        isSentence: isSentence,
        contextSentence: contextSentence || text // 如果没有提供上下文句子，则使用text本身进行检测
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('发送本地TTS消息失败:', chrome.runtime.lastError);
        }
    });
}

/**
 * Edge TTS播放
 * @param {string} text - 要播放的文本 (单词或句子)
 * @param {string} lang - 目标语言代码或 'auto'
 * @param {boolean} isSentence - 标记是单词还是句子
 * @param {string} [contextSentence] - 可选的上下文句子，用于语言检测
 * @private
 */
async function playEdgeTTS(text, lang, isSentence, contextSentence) {
    console.log('Preparing Edge TTS playback:', { text, lang, isSentence, contextSentence });

    // 获取Edge TTS配置
    const ttsConfig = await new Promise(resolve => {
        chrome.storage.local.get(['ttsConfig'], function(result) {
            resolve(result.ttsConfig || {});
        });
    });

    // 确定是否自动选择声音
    const autoVoice = ttsConfig.edgeTTSAutoVoice !== false; // 默认为true

    // 如果自动选择声音，根据语言选择合适的声音
    let voice = ttsConfig.edgeTTSVoice || 'en-US-AriaNeural';

    if (autoVoice) {
        // 根据语言自动选择声音
        const baseLang = lang.split('-')[0].toLowerCase();

        switch (baseLang) {
            case 'zh':
                voice = 'zh-CN-XiaoxiaoNeural';
                break;
            case 'en':
                voice = 'en-US-AriaNeural';
                break;
            case 'de':
                voice = isSentence ? 'de-DE-SeraphinaMultilingualNeural' : 'de-DE-AmalaNeural';
                break;
            case 'ja':
                voice = 'ja-JP-NanamiNeural';
                break;
            case 'ru':
                voice = 'ru-RU-DmitryNeural';
                break;
            case 'fr':
                voice = 'fr-FR-VivienneMultilingualNeural';
                break;
            case 'es':
                voice = 'es-ES-ElviraNeural';
                break;
            default:
                voice = 'en-US-AriaNeural'; // 默认使用英语
        }
    }

    // 获取其他参数
    const rate = ttsConfig.edgeTTSRate || 1;
    const volume = ttsConfig.edgeTTSVolume || 1;
    const pitch = ttsConfig.edgeTTSPitch || 1;

    // 发送消息给background脚本处理Edge TTS请求
    chrome.runtime.sendMessage({
        action: "playAudio",
        audioType: "playEdgeTTS",
        text: text,
        autoVoice: autoVoice,
        voice: voice,
        rate: rate,
        volume: volume,
        pitch: pitch
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('发送Edge TTS消息失败:', chrome.runtime.lastError);
        }
    });
}

// /**
//  * 初始化TTS配置
//  * 确保TTS配置有默认值，防止首次使用时播放失败
//  */
// async function initTTSConfig() {
//     // 检查ttsConfig和TTS开关是否存在
//     const result = await new Promise(resolve => {
//         chrome.storage.local.get(['ttsConfig', 'enableWordTTS', 'enableSentenceTTS'], function(result) {
//             resolve(result);
//         });
//     });

//     // 初始化需要保存的设置
//     let settingsToSave = {};
//     let needSave = false;

//     // 如果ttsConfig不存在或为空对象，设置默认值
//     if (!result.ttsConfig || Object.keys(result.ttsConfig).length === 0) {
//         console.log('初始化TTS配置默认值');
//         settingsToSave.ttsConfig = {
//             wordTTSProvider: 'edge',
//             sentenceTTSProvider: 'edge',
//             edgeTTSAutoVoice: true,
//             edgeTTSVoice: 'en-US-AriaNeural',
//             edgeTTSRate: 1,
//             edgeTTSVolume: 1,
//             edgeTTSPitch: 1,
//             localTTSRate: 1.0,
//             localTTSPitch: 1.0,
//             wordAudioUrlTemplate: '',
//             wordAudioUrlTemplate2: ''
//         };
//         needSave = true;
//     }

//     // 确保TTS开关有默认值
//     if (result.enableWordTTS === undefined) {
//         settingsToSave.enableWordTTS = true;
//         needSave = true;
//     }

//     if (result.enableSentenceTTS === undefined) {
//         settingsToSave.enableSentenceTTS = true;
//         needSave = true;
//     }

//     // 如果需要保存设置
//     if (needSave) {
//         // 保存默认配置
//         chrome.storage.local.set(settingsToSave);
//     }
// }

// // 在脚本加载时初始化TTS配置
// initTTSConfig();

// 暴露函数到全局作用域
window.playText = playText;

