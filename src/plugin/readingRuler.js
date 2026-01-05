(function() {
  // 防止重复初始化
  if (window.readingRulerInitialized) return;
  window.readingRulerInitialized = true;

  // 添加黑名单处理函数，参照 bionic.js 的实现
  function escapeRegExp(str) {
    return str.replace(/[\\^$.+?()[\]{}|]/g, '\\$&');
  }
  function wildcardToRegExp(pattern) {
    return new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$', 'i');
  }
  function isUrlMatch(url, pattern) {
    if (!pattern) return false;
    const regex = wildcardToRegExp(pattern);
    return regex.test(url);
  }
  function patternListMatch(url, patternList) {
    if (!patternList) return false;
    const patterns = patternList.split(';').map(s => s.trim()).filter(Boolean);
    for (let pat of patterns) {
      if (isUrlMatch(url, pat)) return true;
    }
    return false;
  }

  // 全局变量
  let ruler = null;
  let shadowRoot = null;
  let isRulerEnabled = false;

  // 默认设置
  const defaultSettings = {
    height: 24,
    color: '#6f6f6f',
    opacity: 0.3,
    isInverted: false,
    widthMode: 'auto',    // 默认自动宽度模式
    customWidth: 200      // 默认自定义宽度值
  };

  let settings = { ...defaultSettings };

  // 防抖函数
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // 更进一步优化节流函数，使用 RAF 节流
  function rafThrottle(callback) {
    let requestId = null;
    let lastArgs = null;
    
    return function(...args) {
      lastArgs = args;
      
      if (requestId === null) {
        requestId = requestAnimationFrame(() => {
          requestId = null;
          callback.apply(this, lastArgs);
        });
      }
    };
  }

  // 优化核心逻辑，减少样式计算和重绘
  function updateRulerPositionCore(e) {
    // 缓存当前鼠标位置
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // 获取鼠标下方的元素
    const elementUnderCursor = document.elementFromPoint(mouseX, mouseY);
    
    // 检查元素是否为iframe，如果是则不显示标尺
    if (!elementUnderCursor || elementUnderCursor.tagName === 'IFRAME') {
      ruler.style.display = 'none';
      return;
    }
    
    // 如果不是iframe，确保标尺显示
    ruler.style.display = 'block';
    
    // 计算新的垂直位置
    const newY = mouseY - (settings.height / 2);
    
    // 使用 transform 设置垂直位置 - 减少样式查询
    ruler.style.transform = `translateY(${newY}px)`;
    
    // 获取元素边界
    const rect = elementUnderCursor.getBoundingClientRect();
    
    // 根据宽度模式调整标尺的宽度和水平位置
    let newWidth, newLeft;
    
    switch (settings.widthMode) {
      case 'auto':
        newWidth = rect.width;
        newLeft = rect.left;
        break;
      case 'screen':
        newWidth = window.innerWidth;
        newLeft = 0;
        break;
      case 'custom':
        newWidth = settings.customWidth;
        newLeft = Math.max(0, mouseX - settings.customWidth / 2);
        break;
    }
    
    // 批量更新样式，减少重绘
    ruler.style.cssText += `
      width: ${newWidth}px;
      left: ${newLeft}px;
      transform: translateY(${newY}px);
      will-change: transform;
    `;
    
    // 处理反色模式下的遮罩效果
    if (settings.isInverted) {
      if (settings.widthMode === 'screen') {
        ruler.style.boxShadow = '0 0 0 100vh rgba(0, 0, 0, 0.5)';
      } else if (settings.widthMode === 'auto') {
        ruler.style.boxShadow = `0 0 0 100vh rgba(0, 0, 0, 0.5), 
                                ${-rect.left}px 0 0 0 rgba(0, 0, 0, 0.5), 
                                ${window.innerWidth - rect.right}px 0 0 0 rgba(0, 0, 0, 0.5)`;
      } else {
        ruler.style.boxShadow = `0 0 0 100vh rgba(0, 0, 0, 0.5), 
                                ${-newLeft}px 0 0 0 rgba(0, 0, 0, 0.5), 
                                ${window.innerWidth - (newLeft + newWidth)}px 0 0 0 rgba(0, 0, 0, 0.5)`;
      }
    } else {
      ruler.style.boxShadow = 'none';
    }
  }

  // 更新标尺位置函数优化 - 使用 RAF 节流
  const updateRulerPosition = rafThrottle(function(e) {
    if (!isRulerEnabled || !ruler) return;
    // 
    // 如果 Bionic 模式激活，使用更严格的节流
    if (window.bionicActive) {
      // 在 Bionic 模式下，每 3 帧更新一次
      if (!updateRulerPosition.frameCount) {
        updateRulerPosition.frameCount = 0;
      }
      
      updateRulerPosition.frameCount++;
      if (updateRulerPosition.frameCount % 3 !== 0) {
        return;
      }
    }
    
    // 简化位置计算，减少样式查询
    updateRulerPositionCore(e);
  });

  // 创建标尺
  function createRuler() {
    // 创建容器并附加Shadow DOM
    const container = document.createElement('div');
    container.id = 'reading-ruler-container';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    document.documentElement.appendChild(container);

    // 创建Shadow DOM
    shadowRoot = container.attachShadow({ mode: 'closed' });

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .reading-ruler {
        position: fixed;
        pointer-events: none;
        transition: background-color 0.2s ease, box-shadow 0.2s ease;
        transform: translateY(0);
        will-change: transform, width, left;
        transition: transform 0.1s ease-out, width 0.2s ease-out, left 0.2s ease-out;
        border-radius: 5px;
        backface-visibility: hidden;
        perspective: 1000;
        -webkit-backface-visibility: hidden;
        -webkit-perspective: 1000;
      }
      .reading-ruler.no-transition {
        transition: none;
      }
      .reading-ruler.inverted {
        background-color: transparent !important;
        box-shadow: 0 0 0 100vh rgba(0, 0, 0, 0.5);
      }
      .reading-ruler.bionic-active {
        transition: none;
      }
    `;
    shadowRoot.appendChild(style);

    // 创建标尺元素
    ruler = document.createElement('div');
    ruler.className = 'reading-ruler';
    updateRulerStyle();
    shadowRoot.appendChild(ruler);
  }

  // 更新标尺样式
  function updateRulerStyle() {
    if (!ruler) return;
    
    // 保存当前的 transform、width 和 left
    const currentTransform = ruler.style.transform;
    const currentWidth = ruler.style.width;
    const currentLeft = ruler.style.left;
    
    if (settings.isInverted) {
      ruler.classList.add('inverted');
      ruler.style.height = `${settings.height}px`;
      ruler.style.boxShadow = '0 0 0 100vh rgba(0, 0, 0, 0.5)';
    } else {
      ruler.classList.remove('inverted');
      ruler.style.height = `${settings.height}px`;
      ruler.style.backgroundColor = `${settings.color}${Math.round(settings.opacity * 255).toString(16).padStart(2, '0')}`;
      ruler.style.boxShadow = 'none';
    }
    
    // 恢复原始的 transform、width 和 left
    ruler.style.transform = currentTransform;
    ruler.style.width = currentWidth;
    ruler.style.left = currentLeft;
  }

  // 监控 Bionic 状态
  function monitorBionicStatus() {
    // 初始检测
    window.bionicActive = !!document.querySelector('.highlight-wrapper');
    
    // 使用 MutationObserver 监听 Bionic 的启用状态
    const observer = new MutationObserver(debounce((mutations) => {
      const bionicActive = !!document.querySelector('.highlight-wrapper');
      if (window.bionicActive !== bionicActive) {
        window.bionicActive = bionicActive;
        
        // 根据 Bionic 状态调整 Ruler 样式
        if (ruler) {
          if (bionicActive) {
            ruler.classList.add('bionic-active');
          } else {
            ruler.classList.remove('bionic-active');
          }
        }
      }
    }, 100));
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
  }

  // 优化 toggleRuler 函数
  function toggleRuler(enabled) {
    isRulerEnabled = enabled;
    
    if (isRulerEnabled) {
      if (!ruler) createRuler();
      ruler.style.display = 'block';
      
      // 检测 Bionic 状态并应用相应的类
      window.bionicActive = !!document.querySelector('.highlight-wrapper');
      if (window.bionicActive && ruler) {
        ruler.classList.add('bionic-active');
      }
      
      // 使用被动事件监听器减少主线程阻塞
      document.addEventListener('mousemove', updateRulerPosition, { passive: true });
      
      // 启动 Bionic 状态监控
      monitorBionicStatus();
    } else {
      if (ruler) {
        ruler.style.display = 'none';
        document.removeEventListener('mousemove', updateRulerPosition);
      }
    }
    
    // 保存状态
    chrome.storage.local.set({ readingRuler: isRulerEnabled });
  }

  // 重置标尺位置
  function resetRulerPosition() {
    positionControlPanel(20, '50%');
  }

  // 保存设置
  function saveSettings() {
    chrome.storage.local.set({ rulerSettings: settings });
  }

  // 初始化 iframe 支持（修改此函数）
  function initIframeSupport() {
    const isIframe = window !== window.top;
    
    if (isIframe) {
      // 在iframe内部添加标记以防止重复初始化
      if (window.readingRulerIframeInitialized) return;
      window.readingRulerIframeInitialized = true;
      
      // 仍然发送鼠标位置到父页面，用于协调
      const sendMousePosition = rafThrottle(function(e) {
        try {
          window.top.postMessage({
            type: 'reading-ruler-mouse-position',
            clientX: e.clientX,
            clientY: e.clientY,
            iframeOffsetTop: window.frameElement ? window.frameElement.getBoundingClientRect().top : 0,
            iframeOffsetLeft: window.frameElement ? window.frameElement.getBoundingClientRect().left : 0
          }, '*');
        } catch (e) {
          // 忽略跨域错误
        }
      });
      
      document.addEventListener('mousemove', sendMousePosition);
      
      // 在iframe内部也加载设置并初始化标尺
      loadSettings();
      return;
    }
    
    // 以下是主页面的处理逻辑
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'reading-ruler-mouse-position') {
        // 当收到iframe内的鼠标移动消息时，隐藏主页面的标尺
        if (ruler) {
          ruler.style.display = 'none';
        }
        
        // 不再模拟鼠标事件，因为我们希望iframe内部有自己的标尺
        // const simulatedEvent = {
        //   clientX: event.data.clientX + event.data.iframeOffsetLeft,
        //   clientY: event.data.clientY + event.data.iframeOffsetTop
        // };
        // updateRulerPosition(simulatedEvent);
      }
    });
    
    function addFrameHighlight(iframe) {
      try {
        if (iframe.contentDocument) {
          const highlight = document.createElement('div');
          highlight.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            border: 2px solid transparent;
            border-radius: 4px;
            box-sizing: border-box;
            transition: border-color 0.2s ease;
            z-index: 2147483647;
          `;
          
          iframe.parentNode.insertBefore(highlight, iframe);
          highlight.style.width = iframe.offsetWidth + 'px';
          highlight.style.height = iframe.offsetHeight + 'px';
          
          iframe.dataset.rulerHighlightId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          highlight.dataset.forFrame = iframe.dataset.rulerHighlightId;
          
          iframe.addEventListener('mouseenter', () => {
            highlight.style.borderColor = settings.color;
          });
          
          iframe.addEventListener('mouseleave', () => {
            highlight.style.borderColor = 'transparent';
          });
        }
      } catch (e) {
        // 忽略跨域错误
      }
    }
    
    document.querySelectorAll('iframe').forEach(iframe => {
      addFrameHighlight(iframe);
    });
    
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.addedNodes) {
          mutation.addedNodes.forEach(node => {
            if (node.tagName === 'IFRAME') {
              addFrameHighlight(node);
            }
          });
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 从存储中加载设置，包括黑名单配置
  function loadSettings() {
    // 防止重复加载设置
    console.log("reading ruler loadSettings");
    if (window.readingRulerSettingsLoaded) return;
    window.readingRulerSettingsLoaded = true;
    
    chrome.storage.local.get(['readingRuler', 'rulerSettings', 'readingRulerBlacklistWebsites'], result => {
      const blacklist = result.readingRulerBlacklistWebsites || '';
      // 如果当前页面 URL 匹配黑名单中的任一模式，则不启用 Reading Ruler
      if (patternListMatch(window.location.href, blacklist)) {
          // console.log("当前页面匹配 Reading Ruler 黑名单，不激活标尺功能");
          // toggleRuler(false);
          return;
      }
      
      if (result.rulerSettings) {
        settings = { ...settings, ...result.rulerSettings };
      }
      
      if (result.readingRuler) {
        toggleRuler(true);
      }
    });
  }

  // 处理来自 popup 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateRulerSettings") {
      settings = { ...settings, ...message.settings };
      updateRulerStyle();
    } else if (message.action === "toggleReadingRuler") {
      toggleRuler(message.isEnabled);
    } else if (message.action === "resetRulerPosition") {
      resetRulerPosition();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (window !== window.top) {
        initIframeSupport();
      } else {
        loadSettings();
      }
    });
  } else {
    if (window !== window.top) {
      initIframeSupport();
    } else {
      loadSettings();
    }
  }
})();
