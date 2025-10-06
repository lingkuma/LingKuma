# 初始化

## 為什麼頁面上單詞都是藍色的？
::: tip
因為這些單詞你都不認識。
:::

::: warning
我認識這些單詞，怎麼辦？
:::

::: tip
那麼你就這樣導入你認識的單詞
:::

1. #### 下載或者製作已知詞庫
    ``` txt
    apple
    banana
    orange
    pear
    ```
    > 示例 english.txts

    [英語四六級詞庫文件下載](https://www.notion.so/1b899894aa16801fa623f91527e590f3?pvs=21)
  
1. #### 導入詞庫
    可以分批按照不同的單詞狀態進行導入，單詞狀態有 0 1 2 3 4 5 種類別

    ![../start/assets/1758997229239.png](../start/assets/1758997229239.png)


## 為什麼AI翻譯不準？
::: tip
因為默認AI是智譜的免費AI，所以很傻。請你換成Gemini-2.5-flash 或者DeepSeek-v3 以上等級的大模型API。
:::

## 我怎麼去找這個API(接口)？

::: tabs
==  使用 Ohmygpt
<iframe width="560" height="315" src="https://www.youtube.com/embed/RHh3Upabtfk?si=mt_hZksXLw26XpKb&amp;start=296" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>


==  DeepSeek

<iframe src="//player.bilibili.com/player.html?bvid=BV1xJtgztEHE" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="560" height="315"></iframe>


:::

## 如何用外部查詞？

![](<./assets/pill.png>)
點擊圖中 4 號紅點位置，觸發膠囊功能。  
同時也可以在開關設置內默認展開膠囊

膠囊自定義：  
設置-彈窗設置-膠囊設置  
這裡可以添加多層膠囊，多種查看方式，自定義任意第三方詞典等網站，

## 日語分詞太碎，不準。

如上圖 3 號紅點位置，鼠標拖選文本後，點擊彈出的"create" 按鈕創建自定義高亮。




## 如何更改翻譯風格？

設置-API 配置 裡面的Prompt咒語，改成你想要的風格，以及你想要的翻譯方式。  
開關設置內可以開啟兩個AI提示框，你可以一個用來翻譯，一個用來解析語法



![](<./assets/1758997344316.png>)



## 例句，Tag 內容有錯，翻譯如何重置？

刪除例句，tag，並重新點擊單詞即可。



![](<./assets/1758997344983.png>)

## 如何開啟關閉某語言的高亮？
這裡：
![](<./assets/1758997345364.png>)



## 彈窗和單詞有間隙

開關設置處可以更改gap 值，目的用於防止擋住下一行句子



![](<./assets/1758997345742.png>)



## Mini 窗口的按鈕呢？

所有按鈕都是懸浮顯示；位置可能會更改；

按鈕 1：已知狀態切換



![](<./assets/1758997346133.png>)



按鈕 2: 顯示句子翻譯



![](<./assets/1758997346539.png>)



按鈕 3: AI 解析



![](<./assets/1758997346916.png>)



按鈕 4: 放大窗口



![](<./assets/1758997347282.png>)



## 如何縮放窗口？

縮放算法是這裡的值 `1 / (頁面DPR/Custom DPR)` 2K 屏幕的頁面 DPR 是 2 ； Iphone 的 DPR 是 3；某些手機是 2 或者 1.8；所以可以用來調節窗口異常，以及可以用來手動放大縮小。



![](<./assets/1758997347657.png>)



## 如何更換彈窗背景？

若自定義背景，請根據圖片顏色固定為黑主題或者白主題，否則對比度不夠，影響閱讀。
支持svg,png,gif,mp4等


![](<./assets/1758997348025.png>)
> 此圖為關閉


## 如何鼠標實時懸浮顯示小窗？

關閉僅點擊模式打開鼠標離開小窗自動關閉建議配合 Mini 窗口使用

![](<./assets/1758997348395.png>)


