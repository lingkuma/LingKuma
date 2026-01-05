# i18n (Internationalization) 国际化入口

## 已创建的语言支持

本扩展已经创建了以下语言的 i18n 入口结构：

### 已支持语言列表
1. **en** - English (英语) - 默认语言
2. **zh_CN** - 简体中文
3. **ja** - 日本語 (日语)
4. **de** - Deutsch (德语)
5. **fr** - Français (法语)
6. **es** - Español (西班牙语)
7. **ko** - 한국어 (韩语)
8. **ru** - Русский (俄语)
9. **it** - Italiano (意大利语)
10. **pt** - Português (葡萄牙语)

## 结构说明

```
_locales/
├── en/
│   └── messages.json      # 英语翻译（默认）
├── zh_CN/
│   └── messages.json      # 简体中文翻译
├── ja/
│   └── messages.json      # 日语翻译
└── ...
```

## 当前翻译内容

每个 `messages.json` 文件目前包含以下基础翻译：

- `extName`: 扩展名称
- `extDescription`: 扩展描述

## 如何添加新的翻译项

在任意语言的 `messages.json` 中添加新的翻译键值对：

```json
{
  "messageName": {
    "message": "翻译内容",
    "description": "说明"
  }
}
```

在代码中使用：
```javascript
// JavaScript 中
chrome.i18n.getMessage("messageName")

// HTML 中
data-i18n="messageName"

// CSS 中（通过 content）
content: "__MSG_messageName__";
```

## Edge Add-ons 商店识别

Edge Add-ons 商店会自动识别 `_locales` 文件夹中的语言，并在发布时要求为每个语言提供：
- 描述（Description）
- Logo
- 截图（Screenshots）

## 注意事项

1. 所有语言文件夹必须包含相同的消息键（message keys）
2. `default_locale` 设置为 `en`（在 manifest.json 中）
3. 语言代码必须符合 Chrome/Edge 扩展标准（如 `zh_CN` 而非 `zh-CN`）

## 待完善

当前只创建了基础的扩展名称和描述的翻译入口，仅用于  Add-ons 商店的发布。

