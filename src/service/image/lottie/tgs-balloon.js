// 从URL参数读取配置
const urlParams = new URLSearchParams(window.location.search);
const topEnabled = urlParams.get('topEnabled') === 'true';
const bottomEnabled = urlParams.get('bottomEnabled') === 'true';
const topSrc = urlParams.get('topSrc') || '气球.tgs';
const bottomSrc = urlParams.get('bottomSrc') || '气球子图.tgs';
const isTopCustom = urlParams.get('topCustom') === 'true';
const isBottomCustom = urlParams.get('bottomCustom') === 'true';

// 动态创建tgs-player元素
const body = document.body;

// 底层动图
if (bottomEnabled) {
  const bottomPlayer = document.createElement('tgs-player');
  bottomPlayer.setAttribute('autoplay', '');
  bottomPlayer.setAttribute('loop', '');
  bottomPlayer.setAttribute('mode', 'normal');

  // 如果是自定义文件（base64），直接使用；否则使用相对路径
  if (isBottomCustom) {
    bottomPlayer.setAttribute('src', bottomSrc);
  } else {
    bottomPlayer.setAttribute('src', bottomSrc);
  }

  body.appendChild(bottomPlayer);
}

// 顶层动图
if (topEnabled) {
  const topPlayer = document.createElement('tgs-player');
  topPlayer.className = 'balloon-overlay';
  topPlayer.setAttribute('autoplay', '');
  topPlayer.setAttribute('loop', '');
  topPlayer.setAttribute('mode', 'normal');

  // 如果是自定义文件（base64），直接使用；否则使用相对路径
  if (isTopCustom) {
    topPlayer.setAttribute('src', topSrc);
  } else {
    topPlayer.setAttribute('src', topSrc);
  }

  body.appendChild(topPlayer);
}

