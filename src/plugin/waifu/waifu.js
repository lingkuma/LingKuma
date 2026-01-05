// Waifu浮动窗口功能
class WaifuWindow {
  constructor() {
    this.iframe = null;
    this.container = null;
    this.isVisible = false;
    this.url = '';
    this.position = { x: 20, y: 20 }; // 绝对位置(像素)
    this.relativePosition = { x: 0.02, y: 0.02 }; // 相对位置(百分比)
    this.size = { width: 300, height: 400 };
    this.isMinimized = false;
    this.isDragging = false;
    this.isResizing = false;
    this.offset = { x: 0, y: 0 };
    
    // 初始化
    this.init();
  }

  // 初始化配置和事件监听
  init() {
    console.log("初始化waifu窗口");
    // 检查是否在iframe内，如果是则不初始化waifu窗口
    if (window.self !== window.top) {
      console.log("在iframe内运行，不初始化waifu窗口");
      return; // 如果在iframe内运行，直接返回，不继续初始化
    }
    
    // 从存储中获取配置
    chrome.storage.local.get(['waifuUrl', 'enableWaifu', 'waifuPosition', 'waifuRelativePosition', 'waifuSize', 'waifuMinimized'], (result) => {
      this.url = result.waifuUrl || '';
      
      // 优先使用相对位置，如果没有则使用绝对位置并转换为相对位置
      if (result.waifuRelativePosition) {
        this.relativePosition = result.waifuRelativePosition;
        // 根据相对位置计算像素位置
        this.position = {
          x: Math.round(window.innerWidth * this.relativePosition.x),
          y: Math.round(window.innerHeight * this.relativePosition.y)
        };
      } else if (result.waifuPosition) {
        this.position = result.waifuPosition;
        // 根据像素位置计算相对位置
        this.relativePosition = {
          x: this.position.x / window.innerWidth,
          y: this.position.y / window.innerHeight
        };
      } else {
        // 默认位置
        this.position = { x: 20, y: 20 };
        this.relativePosition = { x: 0.02, y: 0.02 };
      }
      
      this.size = result.waifuSize || { width: 300, height: 400 };
      this.isMinimized = result.waifuMinimized || false;
      
      // 如果需要显示，创建窗口
      if (result.enableWaifu) {
        console.log("创建waifu窗口");
        this.create();
        this.show();
      }
    });

    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggleWaifu') {
        this.toggle(request.enabled, request.url);
      } else if (request.action === 'updateWaifuUrl') {
        this.updateUrl(request.url);
      }
      sendResponse({ success: true });
      return true;
    });

    // 添加窗口大小调整监听
    window.addEventListener('resize', this.handleWindowResize);
  }

  // 处理窗口大小变化
  handleWindowResize = () => {
    if (!this.container) return;
    
    // 根据相对位置重新计算像素位置
    this.position = {
      x: Math.round(window.innerWidth * this.relativePosition.x),
      y: Math.round(window.innerHeight * this.relativePosition.y)
    };
    
    // 更新容器位置
    this.container.style.left = `${this.position.x}px`;
    this.container.style.top = `${this.position.y}px`;
  }

  // 应用液体玻璃效果到悬浮球
  applyGlassEffectToFloatingBall(floatingBall) {
    try {
      // 检查是否有液体玻璃库
      if (typeof window.LiquidGlass === 'undefined') {
        console.log('液体玻璃库未加载，等待加载...');
        // 延迟一下再尝试，因为content scripts可能还在加载中
        setTimeout(() => {
          if (typeof window.LiquidGlass !== 'undefined') {
            this.createGlassEffect(floatingBall);
          } else {
            console.warn('液体玻璃库仍未加载，使用默认样式');
            this.applyDefaultFloatingBallStyle(floatingBall);
          }
        }, 500);
      } else {
        this.createGlassEffect(floatingBall);
      }
    } catch (error) {
      console.warn('应用玻璃效果失败，使用默认样式:', error);
      this.applyDefaultFloatingBallStyle(floatingBall);
    }
  }

  // 创建玻璃效果
  createGlassEffect(floatingBall) {
    try {
      // 配置玻璃效果参数
      const glassConfig = {
        width: 80,  // 参数值，实际显示40px (库内部会除以2)
        height: 80, // 参数值，实际显示40px (库内部会除以2)
        radius: 50, // 圆形效果
        // darkOpacity: 25,
        // darkBlur: 8,
        // lightOpacity: 5,
        // lightBlur: 12,
        rainbow: 15
      };

      // 使用applyToElement方法创建玻璃效果，支持Shadow DOM
      const glassUpdater = window.LiquidGlass.applyToElement(floatingBall, glassConfig, {
        preserveContent: true, // 保留图标内容
        shadowDomSupport: true, // 启用Shadow DOM支持
        autoSize: false, // 禁用自动尺寸，使用我们的配置
        mode: 'overlay' // 使用overlay模式
      });

      if (glassUpdater) {
        console.log('✅ 悬浮球玻璃效果创建成功');

        // 保存更新器引用，以便后续可能的更新或销毁
        this.floatingBallGlassUpdater = glassUpdater;

        // 可选：添加一些动态效果
        this.addGlassAnimations(floatingBall);
      } else {
        console.warn('玻璃效果创建失败，使用默认样式');
        this.applyDefaultFloatingBallStyle(floatingBall);
      }
    } catch (error) {
      console.error('创建玻璃效果时出错:', error);
      this.applyDefaultFloatingBallStyle(floatingBall);
    }
  }

  // 添加玻璃动画效果
  addGlassAnimations(floatingBall) {
    // 鼠标悬停时增强玻璃效果
    floatingBall.addEventListener('mouseenter', () => {
      if (this.floatingBallGlassUpdater) {
        this.floatingBallGlassUpdater({
          rainbow: 25,
          darkOpacity: 35,
          lightBlur: 18
        });
      }
    });

    // 鼠标离开时恢复原始效果
    floatingBall.addEventListener('mouseleave', () => {
      if (this.floatingBallGlassUpdater) {
        this.floatingBallGlassUpdater({
          rainbow: 15,
          darkOpacity: 25,
          lightBlur: 12
        });
      }
    });
  }

  // 应用默认悬浮球样式（当玻璃效果不可用时）
  applyDefaultFloatingBallStyle(floatingBall) {
    floatingBall.style.background = 'rgba(74, 144, 226, 0.8)';
    floatingBall.style.borderRadius = '50%';
    floatingBall.style.backdropFilter = 'blur(5px)';
    floatingBall.style.border = '1px solid rgba(255, 255, 255, 0.3)';
    floatingBall.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';

    console.log('应用了默认悬浮球样式');
  }

  // 创建Waifu窗口
  create() {
    if (this.container) return;

    // 创建容器
    this.container = document.createElement('div');
    this.container.id = 'waifu-container';
    // 设置waifu-container为完全透明，不影响玻璃效果
    this.container.style.cssText = `
      position: fixed;
      top: ${this.position.y}px;
      left: ${this.position.x}px;
      width: ${this.size.width}px;
      height: ${this.size.height}px;
      z-index: 9999;
      background: transparent;
      border: none;
      outline: none;
      box-shadow: none;
      backdrop-filter: none;
      filter: none;
      border-radius: 0;
      overflow: visible;
      transition: none;
      pointer-events: auto;
    `;


    // background: rgba(168, 178, 235, 0.51);
    // 创建悬浮球容器
    const floatingBall = document.createElement('div');
    floatingBall.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: move;
      z-index: 10000;
      opacity: unset;
    `;

    // 直接在悬浮球上设置文字，让玻璃效果能够反射
    floatingBall.innerHTML = '🐳';
    floatingBall.style.cssText += `
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 20px;
      font-weight: bold;
      text-shadow: rgb(43 137 173 / 98%) 0px 0px 10px
    `;
    
    // 创建iframe
    this.iframe = document.createElement('iframe');
    this.iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
    `;
    this.iframe.src = this.url || 'about:blank';
    
    // 调整大小的手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute;
      right: 0;
      bottom: 0;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      opacity: 0.7;
    `;
    
    // 使用斜线替代三角形
    const resizeSvg = `
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <line x1="18" y1="10" x2="10" y2="18" stroke="#4a90e2" stroke-width="2" />
        <line x1="18" y1="14" x2="14" y2="18" stroke="#4a90e2" stroke-width="2" />
        <line x1="18" y1="18" x2="18" y2="18" stroke="#4a90e2" stroke-width="2" />
      </svg>
    `;
    resizeHandle.innerHTML = resizeSvg;
    
    // 创建Shadow DOM并附加到documentElement
    const wfhostElement = document.createElement('div');
    wfhostElement.id = 'waifu-shadow-host';
    // 设置waifu-shadow-host为完全透明，不影响玻璃效果
    wfhostElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      border: none;
      outline: none;
      box-shadow: none;
      backdrop-filter: none;
      filter: none;
      pointer-events: none;
      z-index: 9998;
    `;
    const shadowRoot = wfhostElement.attachShadow({ mode: 'open' });
    
    // 添加到Shadow DOM
    this.container.appendChild(this.iframe);
    this.container.appendChild(resizeHandle);
    this.container.appendChild(floatingBall);
    shadowRoot.appendChild(this.container);
    document.documentElement.appendChild(wfhostElement);

    // 现在悬浮球已经在Shadow DOM中，可以应用玻璃效果了
    this.applyGlassEffectToFloatingBall(floatingBall);

    // 添加事件监听
    this.addEventListeners(floatingBall, resizeHandle);

    this.isVisible = true;
  }
  
  // 添加事件监听
  addEventListeners(floatingBall, resizeHandle) {
    // 用于跟踪是否发生了实际拖动
    let hasMoved = false;
    
    // 悬浮球点击事件 - 切换显示/隐藏
    floatingBall.addEventListener('click', (e) => {
      e.stopPropagation();
      // 只有当没有拖动时才切换可见性
      if (!hasMoved) {
        this.toggleVisibility();
      }
    });
    
    // 悬浮球拖动功能
    floatingBall.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      
      // 重置移动标志
      hasMoved = false;
      
      this.isDragging = true;
      this.offset = {
        x: e.clientX - this.container.offsetLeft,
        y: e.clientY - this.container.offsetTop
      };
      
      document.addEventListener('mousemove', this.handleDrag);
      document.addEventListener('mouseup', this.handleDragEnd);
    });
    
    // 添加mousemove事件跟踪是否移动
    const dragMoveDetector = () => {
      if (this.isDragging) {
        hasMoved = true;
      }
    };
    document.addEventListener('mousemove', dragMoveDetector);
    
    // 调整大小功能
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.isResizing = true;
      
      document.addEventListener('mousemove', this.handleResize);
      document.addEventListener('mouseup', this.handleResizeEnd);
    });
  }
  
  // 处理拖动
  handleDrag = (e) => {
    if (!this.isDragging) return;
    
    const newLeft = Math.max(0, e.clientX - this.offset.x);
    const newTop = Math.max(0, e.clientY - this.offset.y);
    
    this.container.style.left = `${newLeft}px`;
    this.container.style.top = `${newTop}px`;
    
    this.position = { x: newLeft, y: newTop };
    
    // 更新相对位置
    this.relativePosition = {
      x: newLeft / window.innerWidth,
      y: newTop / window.innerHeight
    };
  }
  
  // 结束拖动
  handleDragEnd = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.handleDragEnd);
    
    // 保存位置到存储
    chrome.storage.local.set({ 
      waifuPosition: this.position,
      waifuRelativePosition: this.relativePosition
    });
  }
  
  // 处理调整大小
  handleResize = (e) => {
    if (!this.isResizing) return;
    
    const newWidth = Math.max(200, e.clientX - this.container.offsetLeft);
    const newHeight = Math.max(150, e.clientY - this.container.offsetTop);
    
    this.container.style.width = `${newWidth}px`;
    if (!this.isMinimized) {
      this.container.style.height = `${newHeight}px`;
    }
    
    this.size = { width: newWidth, height: newHeight };
  }
  
  // 结束调整大小
  handleResizeEnd = () => {
    this.isResizing = false;
    document.removeEventListener('mousemove', this.handleResize);
    document.removeEventListener('mouseup', this.handleResizeEnd);
    
    // 保存大小到存储
    chrome.storage.local.set({ waifuSize: this.size });
  }
  
  // 切换窗口可见性
  toggleVisibility() {
    if (this.iframe.style.display !== 'none') {
      this.iframe.style.display = 'none';
      // 保持容器完全透明，不影响玻璃效果
      this.container.style.background = 'transparent';
      this.container.style.boxShadow = 'none';
      this.container.style.backdropFilter = 'none';
      this.container.style.filter = 'none';
    } else {
      this.iframe.style.display = 'block';
      // 保持容器完全透明，不影响玻璃效果
      this.container.style.background = 'transparent';
      this.container.style.boxShadow = 'none';
      this.container.style.backdropFilter = 'none';
      this.container.style.filter = 'none';
    }
  }
  
  // 显示窗口
  show() {
    if (!this.container) {
      this.create();
    }
    this.container.style.display = 'block';
    this.isVisible = true;
  }
  
  // 隐藏窗口
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }
  
  // 切换窗口显示状态
  toggle(enabled, url) {
    if (enabled) {
      if (url && url !== this.url) {
        this.url = url;
        if (this.iframe) {
          this.iframe.src = this.url;
        }
        chrome.storage.local.set({ waifuUrl: this.url });
      }
      this.show();
    } else {
      this.hide();
    }
  }
  
  // 更新URL
  updateUrl(url) {
    if (!url || url === this.url) return;
    
    this.url = url;
    if (this.iframe) {
      this.iframe.src = this.url;
    }
    chrome.storage.local.set({ waifuUrl: this.url });
  }

  // 销毁窗口
  destroy() {
    if (this.container) {
      // 清理悬浮球玻璃效果
      if (this.floatingBallGlassUpdater && typeof this.floatingBallGlassUpdater.destroy === 'function') {
        this.floatingBallGlassUpdater.destroy();
        this.floatingBallGlassUpdater = null;
        console.log('悬浮球玻璃效果已清理');
      }

      const wfhostElement = document.getElementById('waifu-shadow-host');
      if (wfhostElement) {
        document.documentElement.removeChild(wfhostElement);
      }
      this.container = null;
      this.iframe = null;
      this.isVisible = false;

      // 移除窗口大小调整监听
      window.removeEventListener('resize', this.handleWindowResize);
    }
  }
}

// 创建Waifu窗口实例
// 只在非iframe环境中创建实例
const waifuWindow = window.self === window.top ? new WaifuWindow() : null;
