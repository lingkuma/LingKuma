---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Lingkuma"
  text: "- Learning any language on the web"
  # tagline: 💡 Inspired by Lingq highlighting, translation but: AI parsing, PDF, EPUB, Youtube ·····
  image:
    src: /hero.png
    alt: Lingkuma
  actions:
    - theme: brand
      text: Introduction & Installation
      link: ./init/Lingkuma/Lingkuma
    - theme: alt
      text: Basic Usage
      link: ./intro/start/start



features:
  - title: Latest Features
    details: Something big is coming?
    link: ./init/new/new
  - title: Multi-platform Support
    details: Supports iOS, Android, Chrome, Firefox
    link: ./more/platform/platform
  - title: E-book Reading
    details: Supports Epub, Pdf, Youtube
    link: ./intro/ebook/ebook
  - title: Live Caption Highlighting
    details: Supports live caption highlighting
    link: ./more/WindowsCaptions/WindowsCaptions
---

<div style="display: flex; flex-wrap: wrap; gap: 20px; margin: 20px 0;">

<div style="flex: 1 1 320px; min-width: 280px;">

::: tabs
== Chrome
[Chrome Store](https://chromewebstore.google.com/detail/lingkuma-language-learnin/denpakphibjnpnnkcnhiniicbffdamfh)

== Edge
[Edge Store](https://microsoftedge.microsoft.com/addons/detail/lingkuma-language-learn/jmdokmfnifcbgmdgodgokigjkaagnmik)
== Firefox
[Firefox Store](https://addons.mozilla.org/en-US/firefox/addon/lingkuma-language-learning/)
== ios
[Multi-platform Tutorial](./more/platform/platform)
== Android
[Multi-platform Tutorial](./more/platform/platform)
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
  :images="[
    { src: './init/Lingkuma/assets/1280x800-1-boom-word-side1.png', caption: 'Word Explosion' },
    { src: './init/Lingkuma/assets/1280x800-2-explan.png', caption: 'AI Analysis' },
    { src: './init/Lingkuma/assets/1280x800-4-epub.png', caption: 'EPUB Reading' },
    { src: './init/Lingkuma/assets/1280-800-3-youtube.png', caption: 'YouTube Subtitles' },
    { src: './init/Lingkuma/assets/1280-800-5-PDF.png', caption: 'PDF Reading' },
    { src: './init/Lingkuma/assets/1280-800-6-phone.png', caption: 'Mobile Support' },
    { src: './init/Lingkuma/assets/1758916889304.png', caption: 'Animation Demo' },
    { src: './init/Lingkuma/assets/1758916889324.png', caption: 'Bionic ADHD Reading Assistant' },
    { src: './init/Lingkuma/assets/1758916889331.png', caption: 'Youtube Subtitle Highlighting' }
  ]"
  item-width="600px"
  gap="20px"
/>

</div>

</div>



