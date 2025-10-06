# Initialization

## Why are all the words on the page blue?
::: tip
Because you don't know these words.
:::

::: warning
I know these words, what should I do?
:::

::: tip
Then you can import the words you know like this:
:::

1. #### Download or create an existing vocabulary list
    ``` txt
    apple
    banana
    orange
    pear
    ```
    > Example english.txt

    [Download English CET-4/6 Vocabulary File](https://www.notion.so/1b899894aa16801fa623f91527e590f3?pvs=21)

1. #### Import Vocabulary
    You can import in batches according to different word statuses. Word statuses have 0, 1, 2, 3, 4, 5 categories.

    ![../start/assets/1758997229239.png](../start/assets/1758997229239.png)


## Why is AI translation inaccurate?
::: tip
Because the default AI is ZhiPu's free AI, it's very silly. Please switch to a large language model API of Gemini-2.5-flash or DeepSeek-v3 or higher.
:::

## How do I find this API?

::: tabs
== Using Ohmygpt
<iframe width="560" height="315" src="https://www.youtube.com/embed/RHh3Upabtfk?si=mt_hZksXLw26XpKb&amp;start=296" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>


==  DeepSeek

<iframe src="//player.bilibili.com/player.html?bvid=BV1xJtgztEHE" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="560" height="315"></iframe>


:::

## How to use external word lookups?

![](<./assets/pill.png>)
Click the red dot at position 4 in the image to activate the capsule function.
You can also set the capsule to expand by default in the settings.

Capsule customization:
Settings - Pop-up Settings - Capsule Settings
Here you can add multiple layers of capsules, various viewing methods, and customize any third-party dictionary or website.

## Japanese word segmentation is too fragmented and inaccurate.

As shown in the red dot at position 3 in the image, after dragging and selecting text, click the "create" button that pops up to create custom highlighting.

## How to change the translation style?

In Settings - API Configuration, change the Prompt "spell" to your desired style and translation method.
In the switch settings, you can enable two AI prompt boxes, one for translation and one for grammar parsing.

![](<./assets/1758997344316.png>)

## Example sentences, Tag content is wrong, how to reset the translation?

Delete the example sentence, tag, and re-click the word.

![](<./assets/1758997344983.png>)

## How to enable/disable highlighting for a specific language?
Here:
![](<./assets/1758997345364.png>)

## Gap between pop-up and word

The gap value can be changed in the switch settings, to prevent it from blocking the next line of text.

![](<./assets/1758997345742.png>)

## Where are the Mini window buttons?

All buttons are floating; their position may change.

Button 1: Known status toggle

![](<./assets/1758997346133.png>)

Button 2: Display sentence translation

![](<./assets/1758997346539.png>)

Button 3: AI analysis

![](<./assets/1758997346916.png>)

Button 4: Enlarge window

![](<./assets/1758997347282.png>)

## How to scale the window?

The scaling algorithm is `1 / (Page DPR / Custom DPR)`. The page DPR of a 2K screen is 2; an iPhone's DPR is 3; some phones are 2 or 1.8; so it can be used to adjust abnormal windows, and also for manual zooming in and out.

![](<./assets/1758997347657.png>)

## How to change the pop-up background?

If you customize the background, please fix it to a dark or light theme according to the image color, otherwise, the contrast will be insufficient, affecting readability.
Supports svg, png, gif, mp4, etc.

![](<./assets/1758997348025.png>)
> This image shows it turned off

## How to show a mini-window on mouse hover in real-time?

Turn off "Click-only mode" and enable "Close mini-window automatically on mouse leave" (recommended to use with the Mini window).

![](<./assets/1758997348395.png>)