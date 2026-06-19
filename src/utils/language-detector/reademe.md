# ELD extrasmall 单文件用法说明

这个仓库已经把 `src/entries/static.extrasmall.js` 和它依赖的最小语言包合并成了一个纯浏览器可用的单文件：

```text
LingKuma/src/utils/language-detector/eld.extrasmall.global.js
```

它不需要 npm、不需要 import、不需要打包器。浏览器插件里只要先加载这个文件，就会得到一个全局变量：

```js
globalThis.eld
```

通常可以直接写：

```js
const result = eld.detect('This is a simple English sentence.');
console.log(result.language); // "en"
```

## 在浏览器插件里加载

Chrome extension 的 `manifest.json` 里，把这个文件排在你的业务脚本前面：

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": [
        "LingKuma/src/utils/language-detector/eld.extrasmall.global.js",
        "your-content-script.js"
      ]
    }
  ]
}
```

之后在 `your-content-script.js` 里直接使用 `eld`。

## detect(text)

检测一段文本的语言。

```js
const result = eld.detect('Hola, como estas?');

console.log(result.language);     // "es"
console.log(result.isReliable());  // true 或 false
console.log(result.getScores());   // 例如 { es: 0.45, pt: 0.21 }
```

参数：

```js
eld.detect(text)
```

- `text`: 字符串。非字符串会返回空结果，不会抛错。

返回值不是普通对象，而是一个结果对象，主要有这 3 个成员：

```js
{
  language: 'en',
  getScores: Function,
  isReliable: Function
}
```

如果检测不到语言：

```js
const result = eld.detect('');
console.log(result.language); // ""
```

短文本检测本来就不稳定，建议配合 `isReliable()` 判断。

## result.language

检测出来的 ISO 639-1 语言代码。

常见例子：

```js
eld.detect('Hello world').language;      // "en"
eld.detect('Hola mundo').language;       // "es"
eld.detect('Bonjour le monde').language; // "fr"
eld.detect('你好，世界').language;        // "zh"
```

如果没有足够信息，可能返回空字符串：

```js
eld.detect('ok').language; // 可能是 "" 或不可靠结果
```

短文本检测本来就不稳定，建议配合 `isReliable()` 判断。

## result.isReliable(thresholdRatio)

判断检测结果是否可靠。

```js
const result = eld.detect('This is a longer sentence for language detection.');

if (result.isReliable()) {
  console.log(result.language);
}
```

参数可选：

```js
result.isReliable(0.75)
```

- 默认值是 `0.75`
- 越高越严格
- 文本太短时通常会返回 `false`

推荐用法：

```js
function detectLanguage(text) {
  const result = eld.detect(text);
  return result.isReliable() ? result.language : '';
}
```

## result.getScores()

返回候选语言的分数。

```js
const result = eld.detect('This is a simple English sentence.');
console.log(result.getScores());
```

可能输出：

```js
{
  en: 0.52,
  nl: 0.18,
  de: 0.12
}
```

分数越高越可能。通常业务里只需要 `language` 和 `isReliable()`，调试时再看 `getScores()`。

## enableTextCleanup(flag)

开启或关闭文本清理。

```js
eld.enableTextCleanup(true);
```

开启后，`detect()` 会在检测前尝试移除：

- URL
- 邮箱
- `.com` 域名
- 混合数字编号

适合网页正文、评论、社交内容这类可能夹杂链接的文本。

```js
eld.enableTextCleanup(true);
const result = eld.detect('Check https://example.com Hola como estas');
```

关闭：

```js
eld.enableTextCleanup(false);
```

## cleanText(flag)

旧名字，等同于 `enableTextCleanup(flag)`。

```js
eld.cleanText(true);
```

新代码建议用：

```js
eld.enableTextCleanup(true);
```

## setLanguageSubset(languages)

限制只在指定语言里检测。

```js
eld.setLanguageSubset(['en', 'zh', 'ja', 'ko']);

console.log(eld.detect('This is English text.').language); // "en"
```

适合插件业务只关心少数几种语言的场景，可以减少误判范围。

取消限制：

```js
eld.setLanguageSubset(false);
```

返回值是实际生效的语言列表：

```js
const enabled = eld.setLanguageSubset(['en', 'zh', 'xx']);
console.log(enabled);
// { 11: "en", 59: "zh" }
```

不存在的语言代码会被忽略。

## dynamicLangSubset(languages)

旧名字，等同于 `setLanguageSubset(languages)`。

```js
eld.dynamicLangSubset(['en', 'es']);
```

新代码建议用：

```js
eld.setLanguageSubset(['en', 'es']);
```

## info()

查看当前语言包信息。

```js
console.log(eld.info());
```

返回示例：

```js
{
  "Data type": "XS60",
  "Languages": {
    "0": "am",
    "1": "ar",
    "11": "en",
    "59": "zh"
  },
  "Subset": false
}
```

如果设置了语言子集：

```js
eld.setLanguageSubset(['en', 'zh']);
console.log(eld.info().Subset);
// { 11: "en", 59: "zh" }
```

## saveSubset(languages)

生成一个只包含指定语言的新 ngram 数据文件。

```js
eld.saveSubset(['en', 'zh', 'ja']);
```

注意：

- 这个函数会触发浏览器下载文件。
- 在普通插件运行时一般不需要用。
- 它主要是给开发阶段裁剪语言库用的。
- 当前单文件已经是 extrasmall 版本，通常直接用 `setLanguageSubset()` 就够了。

## 推荐封装

如果只是想在插件里判断文本语言，可以封装成这样：

```js
function getReliableLanguage(text, languages) {
  if (Array.isArray(languages)) {
    eld.setLanguageSubset(languages);
  }

  const result = eld.detect(text);
  return result.isReliable() ? result.language : '';
}

const lang = getReliableLanguage(
  'This is a browser extension content script.',
  ['en', 'zh', 'ja', 'ko', 'es', 'fr']
);
```

如果你不想让某次调用改变全局语言子集，记得用完恢复：

```js
eld.setLanguageSubset(['en', 'zh']);
const result = eld.detect(text);
eld.setLanguageSubset(false);
```

## 重新生成单文件

如果上游源码改了，运行：

```bash
node scripts/build-extrasmall-global.cjs
```

会重新生成：

```text
LingKuma/src/utils/language-detector/eld.extrasmall.global.js
```

## AI 使用提示

以后让 AI 接这个包时，可以只给它看这个文件和下面这段约定：

```text
我使用的是 LingKuma/src/utils/language-detector/eld.extrasmall.global.js。
它会暴露全局变量 eld。
不要 import，不要 npm install，不要分析整个大包。
直接使用 eld.detect(text)，返回 result.language。
可靠性用 result.isReliable() 判断。
候选分数用 result.getScores() 查看。
只检测指定语言时用 eld.setLanguageSubset([...])，取消时用 eld.setLanguageSubset(false)。
```
