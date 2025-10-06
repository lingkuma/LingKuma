# 初始化

## 为什么页面上单词都是蓝色的？
::: tip
因为这些单词你都不认识。
:::

::: warning
我认识这些单词，怎么办？
:::

::: tip
那么你就这样导入你认识的单词
:::

1. #### 下载或者制作已知词库
    ``` txt
    apple
    banana
    orange
    pear
    ```
    > 示例 english.txts

    [英语四六级词库文件下载](https://www.notion.so/1b899894aa16801fa623f91527e590f3?pvs=21)
  
1. #### 导入词库
    可以分批按照不同的单词状态进行导入，单词状态有 0 1 2 3 4 5 种类别

    ![../start/assets/1758997229239.png](../start/assets/1758997229239.png)


## 为什么AI翻译不准？
::: tip
因为默认AI是智谱的免费AI，所以很傻。请你换成Gemini-2.5-flash 或者DeepSeek-v3 以上等级的大模型API。
:::

## 我怎么去找这个API(接口)？

::: tabs
==  使用 Ohmygpt
<iframe width="560" height="315" src="https://www.youtube.com/embed/RHh3Upabtfk?si=mt_hZksXLw26XpKb&amp;start=296" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>


==  DeepSeek

<iframe src="//player.bilibili.com/player.html?bvid=BV1xJtgztEHE" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="560" height="315"></iframe>


:::

## 如何用外部查词？

![](<./assets/pill.png>)
点击图中 4 号红点位置，触发胶囊功能。  
同时也可以在开关设置内默认展开胶囊

胶囊自定义：  
设置-弹窗设置-胶囊设置  
这里可以添加多层胶囊，多种查看方式，自定义任意第三方词典等网站，

## 日语分词太碎，不准。

如上图 3 号红点位置，鼠标拖选文本后，点击弹出的"create" 按钮创建自定义高亮。




## 如何更改翻译风格？

设置-API 配置 里面的Prompt咒语，改成你想要的风格，以及你想要的翻译方式。  
开关设置内可以开启两个AI提示框，你可以一个用来翻译，一个用来解析语法



![](<./assets/1758997344316.png>)



## 例句，Tag 内容有错，翻译如何重置？

删除例句，tag，并重新点击单词即可。



![](<./assets/1758997344983.png>)

## 如何开启关闭某语言的高亮？
这里：
![](<./assets/1758997345364.png>)



## 弹窗和单词有间隙

开关设置处可以更改gap 值，目的用于防止挡住下一行句子



![](<./assets/1758997345742.png>)



## Mini 窗口的按钮呢？

所有按钮都是悬浮显示；位置可能会更改；

按钮 1：已知状态切换



![](<./assets/1758997346133.png>)



按钮 2: 显示句子翻译



![](<./assets/1758997346539.png>)



按钮 3: AI 解析



![](<./assets/1758997346916.png>)



按钮 4: 放大窗口



![](<./assets/1758997347282.png>)



## 如何缩放窗口？

缩放算法是这里的值 `1 / (页面DPR/Custom DPR)` 2K 屏幕的页面 DPR 是 2 ； Iphone 的 DPR 是 3；某些手机是 2 或者 1.8；所以可以用来调节窗口异常，以及可以用来手动放大缩小。



![](<./assets/1758997347657.png>)



## 如何更换弹窗背景？

若自定义背景，请根据图片颜色固定为黑主题或者白主题，否则对比度不够，影响阅读。
支持svg,png,gif,mp4等


![](<./assets/1758997348025.png>)
> 此图为关闭


## 如何鼠标实时悬浮显示小窗？

关闭仅点击模式打开鼠标离开小窗自动关闭建议配合 Mini 窗口使用

![](<./assets/1758997348395.png>)

