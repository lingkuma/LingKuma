# 電子書使用教學

::: warning

這裡列出支援 Lingkuma 擴充套件的閱讀器，除此之外的 EPUB、PDF 未主動支援。

:::


## EPUB 閱讀器

1. ### ttsu 網頁 EPUB 閱讀器
    [https://reader.ttsu.app/](https://reader.ttsu.app/)

     >[!tip]
    缺點：
    部分 EPUB 檔案無法載入。


1. ### 將 EPUB 發布到 telegra.ph

    >[!tip]
    擴充套件 -> 設定 -> EPUB 轉換工具自動發布；
    目的是將 EPUB 轉換為純網頁，即可在所有平台上相容 Lingkuma。



1. ### 擴充套件內建 EPUB 處理腳本

    >[!tip]
    >1. 格式修復：若 EPUB 的文字大小和樣式無法自訂，可嘗試此方法。
    >2. 章節分割：便於發布到 telegra.ph，或縮小每章的文字數量，以減少潛在的卡頓問題。
    >3. 日語 Ruby 注音清理：可修復標示（highlight）和查詢詞彙時，選取文字錯誤的問題。




## PDF 閱讀器

### Mozilla PDF 網頁閱讀器
[https://mozilla.github.io/pdf.js/web/viewer.html](https://mozilla.github.io/pdf.js/web/viewer.html)

>[!tip]
缺點：
無書櫃介面（UI），每次皆需重新匯入檔案。


## Readest 閱讀器

>[!tip]
優點：
支援 EPUB、PDF 與書籍管理功能。
缺點：
iOS 不相容 Lingkuma 的標示（highlight）功能。



 ### PC 端設定建議
 

    僅需停用「點擊翻頁」功能。當標示（highlight）的範圍在第一行或最後一行時，可能會觸發翻譯，停用此功能即可解決。


![](<./assets/1758997455840.png>)

 ### Android 端

1. #### Android 手機

    >[!tip]
    同上，請停用「點擊翻頁」功能。
  

    >[!tip]
    **請務必開啟「滾動模式」，否則彈出視窗將無法完整顯示。**
  

    ![](<./assets/1758997456227.png>)

    >[!tip]
    此時仍可點擊**最上方左側的空白邊緣**來翻到上一頁，或點擊**最下方的空白邊緣**翻到下一頁。
 


2. #### Android 平板

::: tip
設定方式與 Android 手機相同。
:::

::: tip
**平板**可能無法透過點擊空白處翻頁，此時可點擊畫面任意處來開啟**進度面板**，面板左右兩側即有翻頁按鈕。
:::


![](<./assets/1758997456631.png>)