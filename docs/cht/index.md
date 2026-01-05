---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Lingkuma"
  text: "在網頁學習任何語言"
  # tagline: 💡 靈感來自 Lingq 的標示與翻譯，更支援：AI 解析、PDF、EPUB、Youtube……
  image:
    src: /hero.png
    alt: Lingkuma
  actions:
    - theme: brand
      text: 介紹與安裝
      link: ./init/Lingkuma/Lingkuma
    - theme: alt
      text: 基本用法
      link: ./intro/start/start

features:
  - title: 最新功能
    details: 即將推出重大更新！
    link: ./init/new/new
  - title: 多平台支援
    details: 支援 iOS、Android、Chrome、Firefox
    link: ./more/platform/platform
  - title: 電子書閱讀
    details: 支援 EPUB、PDF、Youtube
    link: ./intro/ebook/ebook
  - title: 即時字幕醒目標示
    details: 支援即時字幕醒目標示
    link: ./more/WindowsCaptions/WindowsCaptions
---

<script setup>
import img1 from './init/Lingkuma/assets/1280x800-1-boom-word-side1.png'
import img2 from './init/Lingkuma/assets/1280x800-2-explan.png'
import img3 from './init/Lingkuma/assets/1280x800-4-epub.png'
import img4 from './init/Lingkuma/assets/1280-800-3-youtube.png'
import img5 from './init/Lingkuma/assets/1280-800-5-PDF.png'
import img6 from './init/Lingkuma/assets/1280-800-6-phone.png'
import img7 from './init/Lingkuma/assets/1758916889304.png'
import img8 from './init/Lingkuma/assets/1758916889324.png'
import img9 from './init/Lingkuma/assets/1758916889331.png'

const galleryImages = [
  { src: img1, caption: '單詞爆炸' },
  { src: img2, caption: 'AI 解析' },
  { src: img3, caption: 'EPUB 閱讀' },
  { src: img4, caption: 'YouTube 字幕' },
  { src: img5, caption: 'PDF 閱讀' },
  { src: img6, caption: '移動端支援' },
  { src: img7, caption: '動圖展示' },
  { src: img8, caption: 'Bionic ADHD 閱讀輔助' },
  { src: img9, caption: 'YouTube 字幕高亮' }
]
</script>

<div style="display: flex; flex-wrap: wrap; gap: 20px; margin: 20px 0;">

<div style="flex: 1 1 320px; min-width: 280px;">

::: tabs
== Chrome
[Chrome Store](https://chromewebstore.google.com/detail/lingkuma-language-learnin/denpakphibjnpnnkcnhiniicbffdamfh)

== Edge
[Edge Store](https://microsoftedge.microsoft.com/addons/detail/lingkuma-language-learn/jmdokmfnifcbgmdgodgokigjkaagnmik)
== Firefox
[Firefox Store](https://addons.mozilla.org/en-US/firefox/addon/lingkuma-language-learning/)
== iOS
[多平台使用教學](./more/platform/platform)
== Android
[多平台使用教學](./more/platform/platform)
:::



::: tabs
== Youtube

<iframe width="100%" height="315" style="max-width: 100%;" src="https://www.youtube.com/embed/RHh3Upabtfk?si=NI2Bquz66PzQZe2H" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

== bilibili

<iframe src="//player.bilibili.com/player.html?bvid=BV1RGZ8YbEGh" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="100%" height="315" style="max-width: 100%;"></iframe>


:::

</div>

<div style="flex: 1 1 320px; min-width: 280px;">



<ImageGallery
  :images="galleryImages"
  item-width="600px"
  gap="20px"
/>

</div>

</div>



