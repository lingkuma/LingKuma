/**
 * 液态玻璃效果库 (Liquid Glass Effect Library)
 * Chrome插件兼容版本
 *
 * 这是一个用于创建液态玻璃视觉效果的JavaScript库
 * 支持自定义尺寸、透明度、模糊、畸变等多种参数
 * 特别优化了Chrome插件环境和Shadow DOM的兼容性
 *
 * 使用方法：
 * 1. 引入此文件到HTML页面或Chrome插件
 * 2. 调用 LiquidGlass.create() 创建玻璃效果
 * 3. 调用 LiquidGlass.applyToElement() 直接对DOM元素应用效果
 * 4. 调用 LiquidGlass.createMultiple() 批量创建多个玻璃控件
 * 5. 使用返回的更新函数动态修改参数
 *✅ 已改成负数 dx="-20" dy="-20"！

 *  这会让图像向左上方移动20像素。你可以根据实际效果调整这两个值：
 *  
 *  dx="-20": 向左移动20px
 *  dx="20": 向右移动20px
 *  dy="-20": 向上移动20px
 *  dy="20": 向下移动20px
 * @author Liquid Glass Team
 * @version 1.2.0 (Simplified Library)
 */

 (function(global) {
  'use strict';

  /**
   * 液态玻璃效果主类
   */
  const LiquidGlass = {

    // 全局监控管理
    _resizeObservers: new Map(), // 存储 ResizeObserver 实例
    _windowResizeListeners: new Map(), // 存储窗口尺寸监听器
    _debounceTimers: new Map(), // 防抖定时器
    _autoResizeEnabled: true, // 全局自动尺寸调整开关
    _containerConfigs: new Map(), // 存储容器配置信息
    _containerElements: new Map(), // 存储容器元素和玻璃元素的引用
    
    /**
     * 创建液态玻璃控件的主函数
     * @param {string} containerId - 容器元素的ID
     * @param {Object} config - 配置参数
     * @param {number} config.width - 玻璃宽度（参数值，实际显示为width/2）
     * @param {number} config.height - 玻璃高度（参数值，实际显示为height/2）
     * @param {number} config.radius - 圆角半径
     * @param {number} config.darkOpacity - 暗部透明度 (0-255)
     * @param {number} config.darkBlur - 暗部模糊 (0-50)
     * @param {number} config.lightOpacity - 亮部透明度 (0-255)
     * @param {number} config.lightBlur - 亮部模糊 (0-50)
     * @param {number} config.centerDistortion - 中心畸变 (0-255)
     * @param {number} config.centerSize - 中心大小 (0-20)
     * @param {number} config.preBlur - 预模糊 (0-100)
     * @param {number} config.postBlur - 后模糊 (0-100)
     * @param {number} config.rainbow - 彩虹效果 (0-50)
     * @param {string} config.effectType - 玻璃效果类型 (默认'liquid', 可选: 'fractal', 'flip', 'rgb-split', 'pixel', 'fluted', 'tiled', 'mosaic', 'ellipses', 'rough', 'bulge')
     * @param {boolean} config.autoResize - 是否启用自动尺寸调整 (默认true)
     * @param {number} config.resizeDebounce - 尺寸调整防抖延迟(ms) (默认100)
     * @returns {Function} 更新函数，用于动态修改参数
     */
    create: function(containerId, config) {
      const container = document.getElementById(containerId);
      if (!container) {
        console.error(`容器 ${containerId} 不存在`);
        return;
      }

      // 默认配置
      const defaultConfig = {
        width: 200,
        height: 200,
        radius: 25,
        darkOpacity: 17,
        darkBlur: 5,
        lightOpacity: 0,
        lightBlur: 15,
        centerDistortion: 0,
        centerSize: 15,
        preBlur: 0,
        postBlur: 0,
        rainbow: 20,
        effectType: 'liquid', // 默认液态玻璃效果
        autoResize: true,
        resizeDebounce: 100
      };

      // 合并配置
      const finalConfig = { ...defaultConfig, ...config };

      // 生成唯一的滤镜ID
      const filterId = `liquidGlassFilter_${containerId}`;

      // 创建SVG滤镜
      this._createSVGFilter(filterId, finalConfig, container);

      // 计算尺寸
      const glassRealW = finalConfig.width / 2;  // 玻璃真实宽度
      const glassRealH = finalConfig.height / 2; // 玻璃真实高度
      const containerW = glassRealW;             // 容器匹配玻璃真实大小
      const containerH = glassRealH;
      const glassW = finalConfig.width + 90;     // 玻璃渲染大小
      const glassH = finalConfig.height + 90;
      const offsetX = -(glassW - containerW) / 2;
      const offsetY = -(glassH - containerH) / 2;

      // 设置容器样式
      container.style.cssText = `
        width: ${containerW}px;
        height: ${containerH}px;
        position: relative;
        border-radius: ${finalConfig.radius}px;
        overflow: hidden;
        margin: 0 auto;
      `;

      // 创建玻璃元素
      const glassElement = document.createElement('div');

      // 根据效果类型设置不同的 backdrop-filter
      // 某些效果需要在 SVG 滤镜前先应用 blur
      const effectType = finalConfig.effectType || 'liquid';
      let backdropFilterValue = `url(#${filterId})`;

      console.log(`[LiquidGlass] 初始创建: effectType=${effectType}, finalConfig:`, finalConfig);

      // 根据原版 CSS 设置前置模糊
      const preBlurMap = {
        'fractal': 'blur(5px)',
        'flip': 'blur(5px)',
        'rgb-split': 'blur(2px)',
        'mosaic': 'blur(2px)',
        'rough': 'blur(7px)',
        'ellipses': 'blur(1px)'
      };

      if (preBlurMap[effectType]) {
        backdropFilterValue = `${preBlurMap[effectType]} url(#${filterId})`;
      }

      console.log(`[LiquidGlass] 初始 backdrop-filter: ${backdropFilterValue}`);

      glassElement.style.cssText = `
        width: ${glassW}px;
        height: ${glassH}px;
        backdrop-filter: ${backdropFilterValue};
        pointer-events: none;
        position: absolute;
        transform: translate(${offsetX}px, ${offsetY}px);
        border-radius: ${finalConfig.radius}px;
      `;

      // 清空容器并添加玻璃元素
      container.innerHTML = '';
      container.appendChild(glassElement);

      // 存储容器配置和元素引用
      this._containerConfigs.set(containerId, finalConfig);
      this._containerElements.set(containerId, {
        container: container,
        glassElement: glassElement,
        filterId: filterId
      });

      // 启用自动尺寸调整监控
      if (finalConfig.autoResize && this._autoResizeEnabled) {
        this._enableAutoResize(containerId, container, finalConfig, glassElement, filterId);
      }

      // 返回更新函数，用于动态修改参数
      const updateFunction = (newConfig) => {
        console.log(`[LiquidGlass] create.updateFunction 被调用, newConfig:`, newConfig);
        const updatedConfig = { ...finalConfig, ...newConfig };

        // 更新SVG滤镜
        this._updateSVGFilter(filterId, updatedConfig, container);

        // 重新计算尺寸
        const newGlassRealW = updatedConfig.width / 2;
        const newGlassRealH = updatedConfig.height / 2;
        const newContainerW = newGlassRealW;
        const newContainerH = newGlassRealH;
        const newGlassW = updatedConfig.width + 90;
        const newGlassH = updatedConfig.height + 90;
        const newOffsetX = -(newGlassW - newContainerW) / 2;
        const newOffsetY = -(newGlassH - newContainerH) / 2;

        // 更新 backdrop-filter（每次都更新，确保效果类型改变时生效）
        if (updatedConfig.effectType) {
          const newEffectType = updatedConfig.effectType;
          let newBackdropFilterValue = `url(#${filterId})`;

          const preBlurMap = {
            'fractal': 'blur(5px)',
            'flip': 'blur(5px)',
            'rgb-split': 'blur(2px)',
            'mosaic': 'blur(2px)',
            'rough': 'blur(7px)',
            'ellipses': 'blur(1px)'
          };

          if (preBlurMap[newEffectType]) {
            newBackdropFilterValue = `${preBlurMap[newEffectType]} url(#${filterId})`;
          }

          console.log(`[LiquidGlass] 更新 backdrop-filter: effectType=${newEffectType}, value=${newBackdropFilterValue}`);
          glassElement.style.backdropFilter = newBackdropFilterValue;
          console.log(`[LiquidGlass] 设置后的 backdropFilter:`, glassElement.style.backdropFilter);
        }

        // 更新容器样式
        container.style.width = `${newContainerW}px`;
        container.style.height = `${newContainerH}px`;
        container.style.borderRadius = `${updatedConfig.radius}px`;

        // 更新玻璃元素样式
        glassElement.style.width = `${newGlassW}px`;
        glassElement.style.height = `${newGlassH}px`;
        glassElement.style.transform = `translate(${newOffsetX}px, ${newOffsetY}px)`;
        glassElement.style.borderRadius = `${updatedConfig.radius}px`;

        // 更新最终配置
        Object.assign(finalConfig, updatedConfig);

        // 如果自动尺寸调整状态发生变化，更新监控
        if (updatedConfig.hasOwnProperty('autoResize')) {
          if (updatedConfig.autoResize && this._autoResizeEnabled) {
            this._enableAutoResize(containerId, container, updatedConfig, glassElement, filterId);
          } else {
            this._disableAutoResize(containerId);
          }
        }
      };

      // 为更新函数添加控制方法
      updateFunction.enableAutoResize = () => {
        if (!finalConfig.autoResize) {
          finalConfig.autoResize = true;
          this._enableAutoResize(containerId, container, finalConfig, glassElement, filterId);
        }
      };

      updateFunction.disableAutoResize = () => {
        if (finalConfig.autoResize) {
          finalConfig.autoResize = false;
          this._disableAutoResize(containerId);
        }
      };

      updateFunction.getConfig = () => ({ ...finalConfig });

      return updateFunction;
    },

    /**
     * 批量创建多个液态玻璃控件
     * @param {Array} configs - 配置数组，每个元素包含 {containerId, config}
     * @returns {Object} 包含所有更新函数的对象
     */
    createMultiple: function(configs) {
      const updaters = {};
      
      configs.forEach(({ containerId, config }) => {
        const updater = this.create(containerId, config);
        if (updater) {
          updaters[containerId] = updater;
        }
      });

      return updaters;
    },



    /**
     * 获取默认配置
     * @returns {Object} 默认配置对象
     */
    getDefaultConfig: function() {
      return {
        width: 200,
        height: 200,
        radius: 25,
        darkOpacity: 17,
        darkBlur: 5,
        lightOpacity: 0,
        lightBlur: 15,
        centerDistortion: 0,
        centerSize: 15,
        preBlur: 0,
        postBlur: 0,
        rainbow: 20,
        effectType: 'liquid',
        autoResize: true,
        resizeDebounce: 100
      };
    },

    /**
     * 获取所有可用的玻璃效果类型
     * @returns {Array} 效果类型数组
     */
    getAvailableEffects: function() {
      return [
        { id: 'liquid', name: '液态玻璃 (Liquid)' },
        { id: 'fractal', name: '分形噪声 (Fractal)' },
        { id: 'flip', name: '翻转 (Flip)' },
        { id: 'rgb-split', name: 'RGB分离 (RGB Split)' },
        { id: 'pixel', name: '像素化 (Pixel)' },
        { id: 'fluted', name: '凹槽 (Fluted)' },
        { id: 'tiled', name: '瓷砖 (Tiled)' },
        { id: 'mosaic', name: '马赛克 (Mosaic)' },
        { id: 'ellipses', name: '椭圆 (Ellipses)' },
        { id: 'rough', name: '粗糙 (Rough)' },
        { id: 'bulge', name: '凸起 (Bulge)' }
      ];
    },

    /**
     * 清理指定容器的玻璃效果
     * @param {string} containerId - 容器ID
     */
    destroy: function(containerId) {
      // 先禁用自动尺寸调整监控
      this._disableAutoResize(containerId);

      // 清理存储的配置和元素引用
      this._containerConfigs.delete(containerId);
      this._containerElements.delete(containerId);

      // 尝试在不同的根文档中查找容器
      let container = document.getElementById(containerId);

      // 如果在主文档中没找到，尝试在所有Shadow DOM中查找
      if (!container) {
        const allShadowRoots = document.querySelectorAll('*');
        for (const element of allShadowRoots) {
          if (element.shadowRoot) {
            const shadowContainer = element.shadowRoot.getElementById(containerId);
            if (shadowContainer) {
              container = shadowContainer;
              break;
            }
          }
        }
      }

      if (container) {
        container.innerHTML = '';
        container.style.cssText = '';
      }

      // 清理对应的SVG滤镜
      const filterId = `liquidGlassFilter_${containerId}`;

      // 尝试在主文档中查找SVG
      let svg = document.getElementById(`svg_${filterId}`);
      if (svg) {
        svg.remove();
        console.log(`已从主文档删除SVG滤镜: ${filterId}`);
      } else {
        // 如果在主文档中没找到，尝试在所有Shadow DOM中查找
        const allShadowRoots = document.querySelectorAll('*');
        for (const element of allShadowRoots) {
          if (element.shadowRoot) {
            const shadowSvg = element.shadowRoot.getElementById(`svg_${filterId}`);
            if (shadowSvg) {
              shadowSvg.remove();
              console.log(`已从Shadow DOM删除SVG滤镜: ${filterId}`);
              break;
            }
          }
        }
      }
    },

    /**
     * 清理所有玻璃效果
     */
    destroyAll: function() {
      // 清理所有监控
      this._resizeObservers.forEach((_, containerId) => {
        this._disableAutoResize(containerId);
      });

      // 清理所有存储的配置和元素引用
      this._containerConfigs.clear();
      this._containerElements.clear();

      // 清理主文档中的SVG容器
      const svgContainer = document.getElementById('liquidGlassSvgContainer');
      if (svgContainer) {
        svgContainer.remove();
      }

      // 清理所有Shadow DOM中的SVG容器
      const allShadowRoots = document.querySelectorAll('*');
      for (const element of allShadowRoots) {
        if (element.shadowRoot) {
          const shadowSvgContainer = element.shadowRoot.getElementById('liquidGlassSvgContainer');
          if (shadowSvgContainer) {
            shadowSvgContainer.remove();
          }
        }
      }
    },

    /**
     * 清理重复的SVG滤镜
     */
    cleanupDuplicateSVGs: function() {
      console.log('开始清理重复的SVG滤镜...');

      // 清理主文档中的重复SVG
      const mainSvgContainer = document.getElementById('liquidGlassSvgContainer');
      if (mainSvgContainer) {
        this._cleanupSVGContainer(mainSvgContainer, 'main document');
      }

      // 清理所有Shadow DOM中的重复SVG
      const allShadowRoots = document.querySelectorAll('*');
      for (const element of allShadowRoots) {
        if (element.shadowRoot) {
          const shadowSvgContainer = element.shadowRoot.getElementById('liquidGlassSvgContainer');
          if (shadowSvgContainer) {
            this._cleanupSVGContainer(shadowSvgContainer, 'shadow DOM');
          }
        }
      }

      console.log('SVG滤镜清理完成');
    },

    /**
     * 清理指定容器中的重复SVG（私有方法）
     * @param {HTMLElement} container - SVG容器
     * @param {string} location - 位置描述
     */
    _cleanupSVGContainer: function(container, location) {
      const svgElements = container.querySelectorAll('svg[id^="svg_liquidGlassFilter_"]');
      const seenIds = new Set();
      let removedCount = 0;

      svgElements.forEach(svg => {
        const id = svg.id;
        if (seenIds.has(id)) {
          svg.remove();
          removedCount++;
          console.log(`已删除重复的SVG: ${id} (${location})`);
        } else {
          seenIds.add(id);
        }
      });

      if (removedCount > 0) {
        console.log(`在${location}中删除了 ${removedCount} 个重复的SVG滤镜`);
      }
    },

    /**
     * 智能检测并应用玻璃效果到现有元素
     * @param {Object} options - 配置选项
     * @param {string|Array} options.selector - CSS选择器或元素数组
     * @param {Object} options.config - 玻璃效果配置（可选）
     * @param {boolean} options.preserveContent - 是否保留原有内容（默认true）
     * @param {boolean} options.autoSize - 是否自动匹配元素尺寸（默认true）
     * @param {string} options.mode - 应用模式：'overlay'(覆盖) 或 'replace'(替换)，默认'overlay'
     * @returns {Object} 包含所有应用元素的更新函数对象
     */
    applyToElements: function(options = {}) {
      const {
        selector = 'button, .btn, .card, .glass-target',
        config = {},
        preserveContent = true,
        autoSize = true,
        mode = 'overlay'
      } = options;

      // 获取目标元素
      const elements = typeof selector === 'string'
        ? document.querySelectorAll(selector)
        : (Array.isArray(selector) ? selector : [selector]);

      if (elements.length === 0) {
        console.warn('未找到匹配的元素:', selector);
        return {};
      }

      const updaters = {};
      const processedElements = [];

      elements.forEach((element, index) => {
        if (!element || !element.nodeType) return;

        try {
          const result = this._applyToSingleElement(element, {
            config,
            preserveContent,
            autoSize,
            mode,
            index
          });

          if (result) {
            updaters[result.id] = result.updater;
            processedElements.push({
              element: element,
              id: result.id,
              originalStyles: result.originalStyles
            });
          }
        } catch (error) {
          console.error('应用玻璃效果失败:', error, element);
        }
      });

      console.log(`成功为 ${processedElements.length} 个元素应用了液态玻璃效果`);

      // 返回批量更新函数和管理方法
      return {
        ...updaters,
        updateAll: (newConfig) => {
          Object.values(updaters).forEach(updater => {
            if (typeof updater === 'function') {
              updater(newConfig);
            }
          });
        },
        destroyAll: () => {
          processedElements.forEach(({ id, element, originalStyles }) => {
            this.destroy(id);
            // 恢复原始样式
            if (originalStyles && mode === 'replace') {
              Object.assign(element.style, originalStyles);
            }
          });
        },
        getProcessedElements: () => processedElements
      };
    },

    /**
     * 快速应用玻璃效果到常见元素类型
     * @param {string} type - 元素类型：'buttons', 'cards', 'inputs', 'all'
     * @param {Object} config - 玻璃效果配置
     * @returns {Object} 更新函数对象
     */
    applyToCommonElements: function(type = 'buttons', config = {}) {
      const selectorMap = {
        'buttons': 'button, .btn, .original-button, input[type="button"], input[type="submit"], .button',
        'cards': '.card, .panel, .widget, .tile, .original-card',
        'inputs': 'input[type="text"], input[type="email"], input[type="password"], textarea, .input, .original-input',
        'navigation': 'nav, .nav, .navbar, .menu, .navigation',
        'all': 'button, .btn, .original-button, .card, .panel, .original-card, input, textarea, .original-input, .glass-target'
      };

      const selector = selectorMap[type] || selectorMap['buttons'];

      // 根据元素类型设置默认配置
      const typeConfigs = {
        'buttons': { width: 160, height: 80, radius: 8, rainbow: 15 },
        'cards': { width: 300, height: 200, radius: 12, rainbow: 20 },
        'inputs': { width: 300, height: 80, radius: 6, rainbow: 10 },
        'navigation': { width: 200, height: 100, radius: 8, rainbow: 25 }
      };

      const defaultConfig = typeConfigs[type] || typeConfigs['buttons'];
      const finalConfig = { ...defaultConfig, ...config };

      return this.applyToElements({
        selector,
        config: finalConfig,
        preserveContent: true,
        autoSize: true,
        mode: 'overlay'
      });
    },

    /**
     * 直接对DOM元素应用液态玻璃效果（适用于Chrome插件和Shadow DOM）
     * @param {HTMLElement} element - 目标DOM元素
     * @param {Object} config - 玻璃效果配置（可选）
     * @param {Object} options - 应用选项（可选）
     * @param {boolean} options.preserveContent - 是否保留原有内容（默认true）
     * @param {boolean} options.autoSize - 是否自动匹配元素尺寸（默认true）
     * @param {string} options.mode - 应用模式：'overlay'(覆盖) 或 'replace'(替换)，默认'overlay'
     * @param {boolean} options.shadowDomSupport - 是否启用Shadow DOM支持（默认true）
     * @param {boolean} options.monitorParent - 是否监控父容器尺寸变化（默认false）
     * @param {HTMLElement} options.parentContainer - 指定要监控的父容器（可选）
     * @returns {Object} 包含更新函数和控制方法的对象
     */
    applyToElement: function(element, config = {}, options = {}) {
      // 参数验证
      if (!element || !element.nodeType || element.nodeType !== Node.ELEMENT_NODE) {
        console.error('applyToElement: 无效的DOM元素');
        return null;
      }

      const {
        preserveContent = true,
        autoSize = true,
        mode = 'overlay',
        shadowDomSupport = true,
        monitorParent = false,
        parentContainer = null
      } = options;

      try {
        // 检测是否在Shadow DOM中
        const isShadowDom = this._isInShadowDOM(element);
        console.log(`元素${isShadowDom ? '在' : '不在'}Shadow DOM中`);

        const result = this._applyToSingleElement(element, {
          config,
          preserveContent,
          autoSize,
          mode,
          shadowDomSupport,
          isShadowDom,
          monitorParent,
          parentContainer,
          index: Date.now() // 使用时间戳作为唯一标识
        });

        if (result) {
          console.log(`成功为元素应用液态玻璃效果，容器ID: ${result.id}${isShadowDom ? ' (Shadow DOM)' : ''}`);

          // 返回增强的更新函数对象
          const enhancedUpdater = result.updater;

          // 添加销毁方法
          enhancedUpdater.destroy = () => {
            // 清理父容器监控
            if (enhancedUpdater._parentObserver) {
              enhancedUpdater._parentObserver.disconnect();
              console.log('已清理父容器监控');
            }
            this.destroy(result.id);
            console.log(`已销毁元素的液态玻璃效果，容器ID: ${result.id}`);
          };

          // 添加获取容器ID的方法
          enhancedUpdater.getContainerId = () => result.id;

          // 添加获取原始元素的方法
          enhancedUpdater.getElement = () => element;

          // 添加Shadow DOM信息
          enhancedUpdater.isShadowDom = () => isShadowDom;

          return enhancedUpdater;
        }
      } catch (error) {
        console.error('applyToElement: 应用玻璃效果失败:', error, element);
      }

      return null;
    },



    /**
     * 批量对多个DOM元素应用液态玻璃效果
     * @param {Array<HTMLElement>} elements - DOM元素数组
     * @param {Object} config - 玻璃效果配置（可选）
     * @param {Object} options - 应用选项（可选）
     * @returns {Object} 包含所有更新函数的对象
     */
    applyToElementsArray: function(elements, config = {}, options = {}) {
      if (!Array.isArray(elements)) {
        console.error('applyToElementsArray: elements 必须是数组');
        return {};
      }

      const updaters = {};
      const processedElements = [];

      elements.forEach((element) => {
        const updater = this.applyToElement(element, config, options);
        if (updater) {
          const containerId = updater.getContainerId();
          updaters[containerId] = updater;
          processedElements.push({
            element: element,
            id: containerId,
            updater: updater
          });
        }
      });

      console.log(`成功为 ${processedElements.length} 个元素应用了液态玻璃效果`);

      // 返回批量管理对象
      return {
        ...updaters,
        updateAll: (newConfig) => {
          Object.values(updaters).forEach(updater => {
            if (typeof updater === 'function') {
              updater(newConfig);
            }
          });
        },
        destroyAll: () => {
          Object.values(updaters).forEach(updater => {
            if (updater && typeof updater.destroy === 'function') {
              updater.destroy();
            }
          });
        },
        getProcessedElements: () => processedElements,
        count: () => processedElements.length
      };
    },

    // ========== 尺寸监控管理方法 ==========

    /**
     * 启用全局自动尺寸调整
     */
    enableGlobalAutoResize: function() {
      this._autoResizeEnabled = true;

      // 重新启用所有具有 autoResize: true 配置的容器的监控
      this._reEnableAllAutoResize();

      console.log('全局自动尺寸调整已启用');
    },

    /**
     * 禁用全局自动尺寸调整
     */
    disableGlobalAutoResize: function() {
      this._autoResizeEnabled = false;
      // 清理所有现有的监控
      this._resizeObservers.forEach((_, containerId) => {
        this._disableAutoResize(containerId);
      });
      console.log('全局自动尺寸调整已禁用');
    },

    /**
     * 获取全局自动尺寸调整状态
     * @returns {boolean} 是否启用全局自动尺寸调整
     */
    isGlobalAutoResizeEnabled: function() {
      return this._autoResizeEnabled;
    },

    /**
     * 禁用所有容器的自动尺寸调整，但保持玻璃效果
     */
    disableAllAutoResize: function() {
      console.log('禁用所有容器的自动尺寸调整...');
      // 清理所有现有的监控，但不销毁玻璃效果
      this._resizeObservers.forEach((observer, containerId) => {
        try {
          observer.disconnect();
          console.log(`已禁用容器 ${containerId} 的 ResizeObserver`);
        } catch (error) {
          console.error(`禁用容器 ${containerId} 的 ResizeObserver 时出错:`, error);
        }
      });
      this._resizeObservers.clear();

      this._windowResizeListeners.forEach((listener, containerId) => {
        try {
          window.removeEventListener('resize', listener);
          console.log(`已禁用容器 ${containerId} 的 window resize 监听器`);
        } catch (error) {
          console.error(`禁用容器 ${containerId} 的 window resize 监听器时出错:`, error);
        }
      });
      this._windowResizeListeners.clear();

      this._debounceTimers.forEach((timer, containerId) => {
        try {
          clearTimeout(timer);
          console.log(`已清理容器 ${containerId} 的防抖定时器`);
        } catch (error) {
          console.error(`清理容器 ${containerId} 的防抖定时器时出错:`, error);
        }
      });
      this._debounceTimers.clear();

      console.log('所有自动尺寸调整已禁用，玻璃效果保持不变');
    },

    /**
     * 获取当前监控的容器列表
     * @returns {Array} 监控中的容器ID列表
     */
    getMonitoredContainers: function() {
      return Array.from(this._resizeObservers.keys());
    },

    /**
     * 重新启用所有具有 autoResize: true 配置的容器的自动尺寸调整（私有方法）
     */
    _reEnableAllAutoResize: function() {
      console.log(`尝试重新启用 ${this._containerConfigs.size} 个容器的自动尺寸调整`);

      // 遍历所有存储的容器配置
      this._containerConfigs.forEach((config, containerId) => {
        if (config.autoResize) {
          const elementData = this._containerElements.get(containerId);
          if (elementData) {
            const { container, glassElement, filterId } = elementData;

            // 检查容器和玻璃元素是否仍然存在于DOM中
            if (container && container.parentNode && glassElement && glassElement.parentNode) {
              // 重新启用自动尺寸调整
              this._enableAutoResize(containerId, container, config, glassElement, filterId);
              console.log(`已重新启用容器 ${containerId} 的自动尺寸调整`);
            } else {
              console.warn(`容器 ${containerId} 或其玻璃元素已从DOM中移除，跳过重新启用`);
            }
          }
        }
      });
    },



    // ========== Chrome插件和Shadow DOM支持方法 ==========

    /**
     * 检测元素是否在Shadow DOM中（私有方法）
     * @param {HTMLElement} element - 要检测的元素
     * @returns {boolean} 是否在Shadow DOM中
     */
    _isInShadowDOM: function(element) {
      let current = element;
      while (current) {
        if (current.getRootNode && current.getRootNode() !== document) {
          const root = current.getRootNode();
          if (root instanceof ShadowRoot) {
            return true;
          }
        }
        current = current.parentNode;
      }
      return false;
    },

    /**
     * 获取元素的根文档（普通文档或Shadow Root）（私有方法）
     * @param {HTMLElement} element - 目标元素
     * @returns {Document|ShadowRoot} 根文档
     */
    _getRootDocument: function(element) {
      if (element.getRootNode) {
        return element.getRootNode();
      }
      return document;
    },

    /**
     * 在指定根文档中查找或创建SVG容器（私有方法）
     * @param {Document|ShadowRoot} rootDoc - 根文档
     * @returns {HTMLElement} SVG容器元素
     */
    _getSVGContainer: function(rootDoc) {
      const containerId = 'liquidGlassSvgContainer';
      let svgContainer = rootDoc.getElementById ? rootDoc.getElementById(containerId) : rootDoc.querySelector(`#${containerId}`);

      if (!svgContainer) {
        svgContainer = document.createElement('div');
        svgContainer.id = containerId;
        // 修复: 添加 width:0, height:0, overflow:hidden, pointer-events:none
        // 防止容器尺寸扩展并阻挡鼠标事件
        svgContainer.style.cssText = 'position:absolute;top:-999px;left:-999px;width:0;height:0;overflow:hidden;pointer-events:none;';

        // 根据根文档类型选择插入位置
        if (rootDoc instanceof ShadowRoot) {
          rootDoc.appendChild(svgContainer);
        } else {
          document.documentElement.appendChild(svgContainer);
        }
      }

      return svgContainer;
    },

    // ========== 私有方法 ==========

    /**
     * 启用单个容器的自动尺寸调整（私有方法）
     * @param {string} containerId - 容器ID
     * @param {HTMLElement} container - 容器元素
     * @param {Object} config - 玻璃配置
     * @param {HTMLElement} glassElement - 玻璃元素
     * @param {string} filterId - 滤镜ID
     */
    _enableAutoResize: function(containerId, container, config, glassElement, filterId) {
      // 先清理可能存在的旧监控
      this._disableAutoResize(containerId);

      // 检查浏览器支持
      if (typeof ResizeObserver === 'undefined') {
        console.warn('浏览器不支持 ResizeObserver，使用 window.resize 事件作为备选方案');
        this._enableWindowResizeListener(containerId, container, config, glassElement, filterId);
        return;
      }

      // 创建 ResizeObserver
      const resizeObserver = new ResizeObserver((entries) => {
        this._handleResize(containerId, container, config, glassElement, filterId, entries[0]);
      });

      // 开始观察容器
      resizeObserver.observe(container);
      this._resizeObservers.set(containerId, resizeObserver);

      console.log(`已为容器 ${containerId} 启用自动尺寸调整监控`);
    },

    /**
     * 禁用单个容器的自动尺寸调整（私有方法）
     * @param {string} containerId - 容器ID
     */
    _disableAutoResize: function(containerId) {
      // 清理 ResizeObserver
      const resizeObserver = this._resizeObservers.get(containerId);
      if (resizeObserver) {
        resizeObserver.disconnect();
        this._resizeObservers.delete(containerId);
      }

      // 清理 window resize 监听器
      const windowListener = this._windowResizeListeners.get(containerId);
      if (windowListener) {
        window.removeEventListener('resize', windowListener);
        this._windowResizeListeners.delete(containerId);
      }

      // 清理防抖定时器
      const debounceTimer = this._debounceTimers.get(containerId);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        this._debounceTimers.delete(containerId);
      }

      console.log(`已为容器 ${containerId} 禁用自动尺寸调整监控`);
    },

    /**
     * 启用基于 window.resize 的监听器（私有方法，作为 ResizeObserver 的备选方案）
     * @param {string} containerId - 容器ID
     * @param {HTMLElement} container - 容器元素
     * @param {Object} config - 玻璃配置
     * @param {HTMLElement} glassElement - 玻璃元素
     * @param {string} filterId - 滤镜ID
     */
    _enableWindowResizeListener: function(containerId, container, config, glassElement, filterId) {
      const windowListener = () => {
        // 模拟 ResizeObserver 的 entry 对象
        const rect = container.getBoundingClientRect();
        const mockEntry = {
          contentRect: {
            width: rect.width,
            height: rect.height
          }
        };
        this._handleResize(containerId, container, config, glassElement, filterId, mockEntry);
      };

      window.addEventListener('resize', windowListener);
      this._windowResizeListeners.set(containerId, windowListener);
    },

    /**
     * 处理尺寸变化（私有方法）
     * @param {string} containerId - 容器ID
     * @param {HTMLElement} container - 容器元素
     * @param {Object} config - 玻璃配置
     * @param {HTMLElement} glassElement - 玻璃元素
     * @param {string} filterId - 滤镜ID
     * @param {Object} entry - ResizeObserver 条目或模拟对象
     */
    _handleResize: function(containerId, container, config, glassElement, filterId, entry) {
      // 防抖处理
      const debounceTimer = this._debounceTimers.get(containerId);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      const newTimer = setTimeout(() => {
        this._performResize(containerId, container, config, glassElement, filterId, entry);
        this._debounceTimers.delete(containerId);
      }, config.resizeDebounce || 100);

      this._debounceTimers.set(containerId, newTimer);
    },

    /**
     * 执行实际的尺寸调整（私有方法）
     * @param {string} containerId - 容器ID
     * @param {HTMLElement} container - 容器元素
     * @param {Object} config - 玻璃配置
     * @param {HTMLElement} glassElement - 玻璃元素
     * @param {string} filterId - 滤镜ID
     * @param {Object} entry - ResizeObserver 条目或模拟对象
     */
    _performResize: function(containerId, container, config, glassElement, filterId, entry) {
      const newWidth = entry.contentRect.width;
      const newHeight = entry.contentRect.height;

      // 检查尺寸是否真的发生了变化 - 降低阈值以提高敏感度
      const currentGlassRealW = config.width / 2;
      const currentGlassRealH = config.height / 2;

      if (Math.abs(newWidth - currentGlassRealW) < 0.5 && Math.abs(newHeight - currentGlassRealH) < 0.5) {
        return; // 尺寸变化太小，忽略
      }

      // 计算新的配置参数（转换为库的参数值）
      const newConfig = {
        width: newWidth * 2, // 转换为库的参数值，完全匹配父元素
        height: newHeight * 2 // 转换为库的参数值，完全匹配父元素
      };

      // 更新配置
      Object.assign(config, newConfig);

      // 更新SVG滤镜
      this._updateSVGFilter(filterId, config, container);

      // 重新计算尺寸和位移
      const glassRealW = config.width / 2;
      const glassRealH = config.height / 2;
      const containerW = glassRealW;
      const containerH = glassRealH;
      const glassW = config.width + 90;
      const glassH = config.height + 90;
      const offsetX = -(glassW - containerW) / 2;
      const offsetY = -(glassH - containerH) / 2;

      // 更新容器样式 - 对于覆盖模式，不修改容器尺寸，因为它应该跟随父元素
      if (!container.style.position || container.style.position === 'static') {
        // 只有在非覆盖模式下才修改容器尺寸
        container.style.width = `${containerW}px`;
        container.style.height = `${containerH}px`;
      }

      // 更新玻璃元素样式
      glassElement.style.width = `${glassW}px`;
      glassElement.style.height = `${glassH}px`;
      glassElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

      console.log(`容器 ${containerId} 尺寸已自动调整: ${newWidth}x${newHeight} -> 参数 ${config.width}x${config.height}`);
    },

    /**
     * 为单个元素应用玻璃效果（私有方法）
     * @param {HTMLElement} element - 目标元素
     * @param {Object} options - 配置选项
     * @returns {Object} 包含ID和更新函数的对象
     */
    _applyToSingleElement: function(element, options) {
      const { config, preserveContent, autoSize, mode, index, monitorParent, parentContainer } = options;

      // 生成唯一ID
      const elementId = element.id || `liquidGlass_auto_${Date.now()}_${index}`;
      const containerId = `${elementId}_container`;

      // 获取元素的计算样式和尺寸
      const computedStyle = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      // 保存原始样式（用于恢复）
      const originalStyles = {
        position: element.style.position,
        zIndex: element.style.zIndex,
        overflow: element.style.overflow,
        background: element.style.background,
        backgroundColor: element.style.backgroundColor
      };

      let glassConfig = { ...this.getDefaultConfig(), ...config };

      // 自动尺寸匹配
      if (autoSize) {
        glassConfig.width = rect.width * 2; // 转换为库的参数值，完全匹配父元素
        glassConfig.height = rect.height * 2; // 转换为库的参数值，完全匹配父元素

        // 尝试获取圆角值
        const borderRadius = computedStyle.borderRadius;
        if (borderRadius && borderRadius !== '0px') {
          const radiusValue = parseInt(borderRadius);
          if (!isNaN(radiusValue)) {
            glassConfig.radius = Math.min(radiusValue, 50);
          }
        }
      }

      let result;
      if (mode === 'overlay') {
        // 覆盖模式：在元素上方创建玻璃层
        result = this._createOverlayGlass(element, containerId, glassConfig, preserveContent);
      } else {
        // 替换模式：将元素转换为玻璃容器
        result = this._createReplaceGlass(element, containerId, glassConfig, originalStyles);
      }

      // 如果启用了父容器监控，设置监控机制
      if (result && (monitorParent || parentContainer)) {
        this._setupParentContainerMonitoring(element, result, parentContainer);
      }

      return result;
    },

    /**
     * 设置父容器监控（私有方法）
     * @param {HTMLElement} element - 目标元素
     * @param {Object} result - 玻璃效果结果对象
     * @param {HTMLElement} parentContainer - 指定的父容器（可选）
     */
    _setupParentContainerMonitoring: function(element, result, parentContainer) {
      // 确定要监控的父容器
      let targetParent = parentContainer;
      if (!targetParent) {
        // 自动查找可调整大小的父容器
        targetParent = this._findResizableParent(element);
      }

      if (!targetParent) {
        console.warn('未找到可监控的父容器，跳过父容器监控');
        return;
      }

      console.log('设置父容器监控:', targetParent);

      // 创建父容器监控器
      const parentObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        let parentWidth = entry.contentRect.width;
        let parentHeight = entry.contentRect.height;

        // 如果监控的是document.documentElement（viewport），使用window尺寸
        if (targetParent === document.documentElement) {
          parentWidth = window.innerWidth;
          parentHeight = window.innerHeight;
        }

        // 获取元素当前尺寸
        const currentRect = element.getBoundingClientRect();

        // 对于弹窗元素，不强制匹配父容器尺寸，而是保持合理的尺寸比例
        let newElementWidth, newElementHeight;

        if (element.classList.contains('vocab-tooltip') ||
            element.classList.contains('tooltip') ||
            element.classList.contains('popup') ||
            element.classList.contains('modal')) {
          // 弹窗元素保持原有尺寸，只在必要时调整
          newElementWidth = Math.min(currentRect.width, parentWidth * 0.9);
          newElementHeight = Math.min(currentRect.height, parentHeight * 0.9);
        } else {
          // 普通元素完全匹配父容器
          const margin = 0;
          newElementWidth = Math.max(parentWidth - margin, 100);
          newElementHeight = Math.max(parentHeight - margin, 100);
        }

        // 保存原始尺寸数据（用于调试）
        if (!element.dataset.originalWidth) {
          element.dataset.originalWidth = currentRect.width;
          element.dataset.originalHeight = currentRect.height;
        }

        // 更新玻璃效果参数（不更新元素尺寸，避免影响弹窗布局）
        if (result.updater) {
          result.updater({
            width: newElementWidth * 2,  // 转换为库的参数值
            height: newElementHeight * 2
          });
        }

        console.log(`父容器尺寸变化: ${parentWidth}x${parentHeight}, 玻璃效果调整为: ${newElementWidth * 2}x${newElementHeight * 2}`);
      });

      // 开始监控父容器
      parentObserver.observe(targetParent);

      // 如果监控的是viewport，还需要监听window resize事件
      if (targetParent === document.documentElement) {
        const windowResizeHandler = () => {
          // 触发ResizeObserver回调
          parentObserver.disconnect();
          parentObserver.observe(targetParent);
        };
        window.addEventListener('resize', windowResizeHandler);

        // 存储事件处理器以便后续清理
        if (result.updater) {
          result.updater._windowResizeHandler = windowResizeHandler;
        }
      }

      // 将监控器附加到更新函数上，以便后续清理
      if (result.updater) {
        result.updater._parentObserver = parentObserver;
        result.updater._monitoredParent = targetParent;
      }

      console.log('父容器监控已启用');
    },

    /**
     * 查找可调整大小的父容器（私有方法）
     * @param {HTMLElement} element - 目标元素
     * @returns {HTMLElement|null} 找到的父容器或null
     */
    _findResizableParent: function(element) {
      let current = element.parentElement;

      while (current && current !== document.body) {
        const computedStyle = window.getComputedStyle(current);

        // 检查是否有resize属性
        if (computedStyle.resize && computedStyle.resize !== 'none') {
          return current;
        }

        // 检查是否有resizable相关的class
        if (current.classList.contains('resizable') ||
            current.classList.contains('resizable-container') ||
            current.id.includes('resizable')) {
          return current;
        }

        // 检查是否是tooltip或弹窗相关的容器
        if (current.classList.contains('vocab-tooltip') ||
            current.classList.contains('tooltip') ||
            current.classList.contains('popup') ||
            current.classList.contains('modal') ||
            current.id.includes('tooltip') ||
            current.id.includes('popup')) {
          return current;
        }

        // 检查是否是Shadow DOM的host元素
        if (current.shadowRoot) {
          return current;
        }

        current = current.parentElement;
      }

      // 如果没有找到合适的父容器，但元素是tooltip类型，返回viewport作为监控目标
      if (element.classList.contains('vocab-tooltip') ||
          element.classList.contains('tooltip') ||
          element.classList.contains('popup') ||
          element.classList.contains('modal')) {
        // 对于弹窗元素，使用document.documentElement作为监控目标
        return document.documentElement;
      }

      return null;
    },

    /**
     * 创建覆盖式玻璃效果（私有方法）
     * @param {HTMLElement} element - 目标元素
     * @param {string} containerId - 容器ID
     * @param {Object} config - 玻璃配置
     * @param {boolean} preserveContent - 是否保留内容
     * @returns {Object} 包含ID和更新函数的对象
     */
    _createOverlayGlass: function(element, containerId, config, preserveContent) {
      // 确保元素有相对定位
      const originalPosition = element.style.position;
      if (!originalPosition || originalPosition === 'static') {
        element.style.position = 'relative';
      }

      // 创建玻璃容器
      const glassContainer = document.createElement('div');
      glassContainer.id = containerId;
      glassContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
        border-radius: inherit;
        overflow: hidden;
      `;

      // 插入玻璃容器
      element.appendChild(glassContainer);

      // 如果需要保留内容，确保内容在玻璃层之上
      if (preserveContent) {
        const children = Array.from(element.children).filter(child => child !== glassContainer);
        children.forEach(child => {
          if (child.style.position !== 'absolute' && child.style.position !== 'fixed') {
            child.style.position = 'relative';
            child.style.zIndex = '2';
          }
        });
      }

      // 直接创建玻璃效果而不使用 create 方法（避免修改容器尺寸）
      const updater = this._createDirectGlassEffect(glassContainer, config);

      return {
        id: containerId,
        updater: updater
      };
    },

    /**
     * 创建替换式玻璃效果（私有方法）
     * @param {HTMLElement} element - 目标元素
     * @param {string} containerId - 容器ID
     * @param {Object} config - 玻璃配置
     * @param {Object} originalStyles - 原始样式
     * @returns {Object} 包含ID和更新函数的对象
     */
    _createReplaceGlass: function(element, containerId, config, originalStyles) {
      // 保存原始内容
      const originalContent = element.innerHTML;

      // 设置元素为玻璃容器
      element.id = containerId;
      element.innerHTML = '';

      // 应用玻璃效果
      const updater = this.create(containerId, config);

      // 如果需要，可以在玻璃内部添加原始内容
      if (originalContent.trim()) {
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = originalContent;
        contentDiv.style.cssText = `
          position: relative;
          z-index: 2;
          pointer-events: auto;
        `;
        element.appendChild(contentDiv);
      }

      return {
        id: containerId,
        updater: updater,
        originalStyles: originalStyles
      };
    },

    /**
     * 直接创建玻璃效果（私有方法，用于覆盖模式）
     * @param {HTMLElement} container - 玻璃容器元素
     * @param {Object} config - 玻璃配置
     * @returns {Function} 更新函数
     */
    _createDirectGlassEffect: function(container, config) {
      // 合并默认配置
      const finalConfig = { ...this.getDefaultConfig(), ...config };

      // 生成唯一的滤镜ID
      const filterId = `liquidGlassFilter_${container.id}`;

      // 创建SVG滤镜
      this._createSVGFilter(filterId, finalConfig, container);

      // 获取容器的实际尺寸
      const containerRect = container.getBoundingClientRect();
      const containerW = containerRect.width;
      const containerH = containerRect.height;

      // 计算玻璃渲染尺寸和位移补偿
      const glassW = finalConfig.width + 90;
      const glassH = finalConfig.height + 90;
      const offsetX = -(glassW - containerW) / 2;
      const offsetY = -(glassH - containerH) / 2;

      // 创建玻璃元素
      const glassElement = document.createElement('div');

      // 根据效果类型设置不同的 backdrop-filter
      const effectType = finalConfig.effectType || 'liquid';
      let backdropFilterValue = `url(#${filterId})`;

      // 根据原版 CSS 设置前置模糊
      const preBlurMap = {
        'fractal': 'blur(5px)',
        'flip': 'blur(5px)',
        'rgb-split': 'blur(2px)',
        'mosaic': 'blur(2px)',
        'rough': 'blur(7px)',
        'ellipses':'blur(1px)',
      };

      if (preBlurMap[effectType]) {
        backdropFilterValue = `${preBlurMap[effectType]} url(#${filterId})`;
      }

      glassElement.style.cssText = `
        width: ${glassW}px;
        height: ${glassH}px;
        backdrop-filter: ${backdropFilterValue};
        pointer-events: none;
        position: absolute;
        transform: translate(${offsetX}px, ${offsetY}px);
        border-radius: ${finalConfig.radius}px;
      `;

      // 清空容器并添加玻璃元素
      container.innerHTML = '';
      container.appendChild(glassElement);

      // 存储容器配置和元素引用
      this._containerConfigs.set(container.id, finalConfig);
      this._containerElements.set(container.id, {
        container: container,
        glassElement: glassElement,
        filterId: filterId
      });

      // 启用自动尺寸调整监控（如果启用）
      // 对于覆盖模式，监控父元素而不是玻璃容器本身
      if (finalConfig.autoResize && this._autoResizeEnabled) {
        const parentElement = container.parentElement;
        if (parentElement) {
          this._enableAutoResize(container.id, parentElement, finalConfig, glassElement, filterId);
        } else {
          this._enableAutoResize(container.id, container, finalConfig, glassElement, filterId);
        }
      }

      // 返回更新函数
      const updateFunction = (newConfig) => {
        console.log(`[LiquidGlass] updateFunction 被调用, newConfig:`, newConfig);
        const updatedConfig = { ...finalConfig, ...newConfig };
        console.log(`[LiquidGlass] updatedConfig:`, updatedConfig);

        // 更新SVG滤镜
        this._updateSVGFilter(filterId, updatedConfig, container);

        // 重新计算位移补偿
        const newGlassW = updatedConfig.width + 90;
        const newGlassH = updatedConfig.height + 90;
        const newOffsetX = -(newGlassW - containerW) / 2;
        const newOffsetY = -(newGlassH - containerH) / 2;

        // 更新 backdrop-filter（每次都更新，确保效果类型改变时生效）
        if (updatedConfig.effectType) {
          const newEffectType = updatedConfig.effectType;
          let newBackdropFilterValue = `url(#${filterId})`;

          const preBlurMap = {
            'fractal': 'blur(5px)',
            'flip': 'blur(5px)',
            'rgb-split': 'blur(2px)',
            'mosaic': 'blur(2px)',
            'rough': 'blur(7px)',
            'ellipses': 'blur(1px)'
          };

          if (preBlurMap[newEffectType]) {
            newBackdropFilterValue = `${preBlurMap[newEffectType]} url(#${filterId})`;
          }

          console.log(`[LiquidGlass] 更新 backdrop-filter: effectType=${newEffectType}, value=${newBackdropFilterValue}`);
          console.log(`[LiquidGlass] glassElement:`, glassElement);
          glassElement.style.backdropFilter = newBackdropFilterValue;
          console.log(`[LiquidGlass] 设置后的 backdropFilter:`, glassElement.style.backdropFilter);
        } else {
          console.log(`[LiquidGlass] 警告: updatedConfig.effectType 未定义`, updatedConfig);
        }

        // 更新玻璃元素样式
        glassElement.style.width = `${newGlassW}px`;
        glassElement.style.height = `${newGlassH}px`;
        glassElement.style.transform = `translate(${newOffsetX}px, ${newOffsetY}px)`;
        glassElement.style.borderRadius = `${updatedConfig.radius}px`;

        // 更新最终配置
        Object.assign(finalConfig, updatedConfig);

        // 如果自动尺寸调整状态发生变化，更新监控
        if (updatedConfig.hasOwnProperty('autoResize')) {
          if (updatedConfig.autoResize && this._autoResizeEnabled) {
            this._enableAutoResize(container.id, container, updatedConfig, glassElement, filterId);
          } else {
            this._disableAutoResize(container.id);
          }
        }
      };

      // 为更新函数添加控制方法
      updateFunction.enableAutoResize = () => {
        if (!finalConfig.autoResize) {
          finalConfig.autoResize = true;
          this._enableAutoResize(container.id, container, finalConfig, glassElement, filterId);
        }
      };

      updateFunction.disableAutoResize = () => {
        if (finalConfig.autoResize) {
          finalConfig.autoResize = false;
          this._disableAutoResize(container.id);
        }
      };

      updateFunction.getConfig = () => ({ ...finalConfig });

      return updateFunction;
    },

    /**
     * 创建SVG滤镜（私有方法）
     * @param {string} filterId - 滤镜ID
     * @param {Object} config - 配置参数
     * @param {HTMLElement} targetElement - 目标元素（用于确定SVG容器位置）
     */
    _createSVGFilter: function(filterId, config, targetElement = null) {
      // 确定SVG容器的根文档
      const rootDoc = targetElement ? this._getRootDocument(targetElement) : document;
      const svgContainer = this._getSVGContainer(rootDoc);

      // 检查是否已经存在相同ID的SVG滤镜
      const existingSvg = rootDoc.getElementById ? rootDoc.getElementById(`svg_${filterId}`) : rootDoc.querySelector(`#svg_${filterId}`);
      if (existingSvg) {
        console.log(`SVG滤镜 ${filterId} 已存在，跳过创建`);
        return;
      }

      // 创建SVG元素
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = `svg_${filterId}`;

      // 某些效果需要 primitiveUnits="objectBoundingBox"
      const effectType = config.effectType || 'liquid';
      const usesObjectBoundingBox = ['flip', 'rgb-split', 'bulge'].includes(effectType);

      // 对于使用 objectBoundingBox 的效果，SVG 尺寸设置为 0
      // 对于其他效果，使用 config 中的尺寸
      if (usesObjectBoundingBox) {
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
      } else {
        svg.setAttribute('width', config.width);
        svg.setAttribute('height', config.height);
        svg.setAttribute('viewBox', `0 0 ${config.width} ${config.height}`);
      }

      // 创建滤镜
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.id = filterId;

      if (usesObjectBoundingBox) {
        filter.setAttribute('primitiveUnits', 'objectBoundingBox');
      }

      // 创建滤镜内容
      const filterContent = this._createFilterElements(config);
      filter.innerHTML = filterContent;

      svg.appendChild(filter);
      svgContainer.appendChild(svg);

      console.log(`已创建SVG滤镜: ${filterId}`);
    },

    /**
     * 更新SVG滤镜（私有方法）
     * @param {string} filterId - 滤镜ID
     * @param {Object} config - 配置参数
     * @param {HTMLElement} targetElement - 目标元素（用于确定根文档）
     */
    _updateSVGFilter: function(filterId, config, targetElement = null) {
      // 尝试在不同的根文档中查找SVG元素
      let svg = null;
      let filter = null;

      if (targetElement) {
        const rootDoc = this._getRootDocument(targetElement);
        svg = rootDoc.getElementById ? rootDoc.getElementById(`svg_${filterId}`) : rootDoc.querySelector(`#svg_${filterId}`);
        filter = rootDoc.getElementById ? rootDoc.getElementById(filterId) : rootDoc.querySelector(`#${filterId}`);
      }

      // 如果在目标根文档中没找到，尝试在全局文档中查找
      if (!svg) {
        svg = document.getElementById(`svg_${filterId}`);
      }
      if (!filter) {
        filter = document.getElementById(filterId);
      }

      if (svg && filter) {
        // 检查是否使用 objectBoundingBox
        const effectType = config.effectType || 'liquid';
        const usesObjectBoundingBox = ['flip', 'rgb-split', 'bulge'].includes(effectType);

        // 更新SVG尺寸
        if (usesObjectBoundingBox) {
          svg.setAttribute('width', '0');
          svg.setAttribute('height', '0');
          svg.removeAttribute('viewBox');
        } else {
          // 对于 liquid 等效果，需要正确的尺寸和 viewBox
          svg.setAttribute('width', config.width);
          svg.setAttribute('height', config.height);
          svg.setAttribute('viewBox', `0 0 ${config.width} ${config.height}`);
        }

        // 更新 filter 的 primitiveUnits 属性
        if (usesObjectBoundingBox) {
          filter.setAttribute('primitiveUnits', 'objectBoundingBox');
        } else {
          // 对于 liquid 等效果，移除 primitiveUnits（使用默认值）
          filter.removeAttribute('primitiveUnits');
        }

        // 更新滤镜内容
        filter.innerHTML = this._createFilterElements(config);
        console.log(`已更新SVG滤镜: ${filterId} (effectType: ${effectType})`);
      } else {
        console.warn(`未找到SVG滤镜: ${filterId}`);
      }
    },

    /**
     * 创建滤镜元素内容（私有方法）
     * @param {Object} config - 配置参数
     * @returns {string} 滤镜HTML内容
     */
    _createFilterElements: function(config) {
      const effectType = config.effectType || 'liquid';

      // 根据效果类型调用对应的生成函数
      switch(effectType) {
        case 'fractal':
          return this._createFractalFilter(config);
        case 'flip':
          return this._createFlipFilter(config);
        case 'rgb-split':
          return this._createRgbSplitFilter(config);
        case 'pixel':
          return this._createPixelFilter(config);
        case 'fluted':
          return this._createFlutedFilter(config);
        case 'tiled':
          return this._createTiledFilter(config);
        case 'mosaic':
          return this._createMosaicFilter(config);
        case 'ellipses':
          return this._createEllipsesFilter(config);
        case 'rough':
          return this._createRoughFilter(config);
        case 'bulge':
          return this._createBulgeFilter(config);
        case 'liquid':
        default:
          return this._createLiquidFilter(config);
      }
    },

    /**
     * 创建液态玻璃滤镜（原始效果）
     */
    _createLiquidFilter: function(config) {
      const w = config.width;
      const h = config.height;
      const r = config.radius;

      return `
        <feImage
          xlink:href="data:image/svg+xml,%3Csvg width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='rgb%280 0 0 %2F${config.darkOpacity/2.55}%25%29' /%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='%23FFF' style='filter:blur(${config.darkBlur}px)' /%3E%3C/svg%3E"
          x="0%" y="0%" width="100%" height="100%" result="thing9" />
        <feImage
          xlink:href="data:image/svg+xml,%3Csvg width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='rgb%28255 255 255 %2F${config.lightOpacity/2.55}%25%29' style='filter:blur(${config.lightBlur}px)' /%3E%3C/svg%3E"
          x="0%" y="0%" width="100%" height="100%" result="thing0" />
        <feImage
          xlink:href="data:image/svg+xml,%3Csvg width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='%23000' /%3E%3C/svg%3E"
          x="0%" y="0%" width="100%" height="100%" result="thing1" />
        <feImage
          xlink:href="data:image/svg+xml,%3Csvg width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='gradient1' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%23000'/%3E%3Cstop offset='100%25' stop-color='%2300F'/%3E%3C/linearGradient%3E%3ClinearGradient id='gradient2' x1='0%25' y1='0%25' x2='0%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23000'/%3E%3Cstop offset='100%25' stop-color='%230F0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect x='0' y='0' width='${w}' height='${h}' rx='${r}' fill='%237F7F7F' /%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='%23000' /%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='url(%23gradient1)' style='mix-blend-mode: screen' /%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='url(%23gradient2)' style='mix-blend-mode: screen' /%3E%3Crect x='${w/4}' y='${h/4}' width='${w/2}' height='${h/2}' rx='${r}' fill='rgb%28127 127 127 %2F${(255-config.centerDistortion)/2.55}%25%29' style='filter:blur(${20-config.centerSize}px)' /%3E%3C/svg%3E"
          x="0%" y="0%" width="100%" height="100%" result="thing2" />
        <feGaussianBlur stdDeviation="${config.preBlur/10}" in="SourceGraphic" result="preblur" />
        <feDisplacementMap in2="thing2" in="preblur" scale="${-150+config.rainbow/10}" xChannelSelector="B" yChannelSelector="G" />
        <feColorMatrix type="matrix" values="1 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 1 0" result="disp1" />
        <feDisplacementMap in2="thing2" in="preblur" scale="-150" xChannelSelector="B" yChannelSelector="G" />
        <feColorMatrix type="matrix" values="0 0 0 0 0
                0 1 0 0 0
                0 0 0 0 0
                0 0 0 1 0" result="disp2" />
        <feDisplacementMap in2="thing2" in="preblur" scale="${-150-config.rainbow/10}" xChannelSelector="B" yChannelSelector="G" />
        <feColorMatrix type="matrix" values="0 0 0 0 0
                0 0 0 0 0
                0 0 1 0 0
                0 0 0 1 0" result="disp3" />
        <feBlend in2="disp2" mode="screen" />
        <feBlend in2="disp1" mode="screen" />
        <feGaussianBlur stdDeviation="${config.postBlur/10}" />
        <feBlend in2="thing0" mode="screen" />
        <feBlend in2="thing9" mode="multiply" />
        <feComposite in2="thing1" operator="in" />
        <feOffset dx="43" dy="43" />
      `;
    },

    /**
     * 创建分形噪声滤镜
     */
    _createFractalFilter: function(config) {
      return `
        <feTurbulence type="fractalNoise" baseFrequency=".1" numOctaves="1" result="warp" />
        <feDisplacementMap xChannelSelector="R" yChannelSelector="G" scale="30" in="SourceGraphic" in2="warp" />
      `;
    },

    /**
     * 创建翻转滤镜
     */
    _createFlipFilter: function(config) {
      return `
        <feImage result="gradient-raw" xlink:href="data:image/svg+xml;charset=utf-8,
          <svg xmlns='http://www.w3.org/2000/svg'>
          <defs>
            <linearGradient id='grad'>
              <stop offset='0%' stop-color='red' />
              <stop offset='100%' stop-color='black' />
            </linearGradient>
          </defs>
          <rect width='100%' height='100%' x='0' y='0' fill='url(%23grad)' />
        </svg>" x="0" y="0" width="1" height="1" preserveAspectRatio="none" />
        <feComponentTransfer in="gradient-raw" result="gradient">
          <feFuncA type="linear" slope="0.5" intercept="0" />
        </feComponentTransfer>
        <feDisplacementMap result="displaced" in="SourceGraphic" in2="gradient" scale="2" xChannelSelector="R" />
      `;
    },

    /**
     * 创建RGB分离滤镜
     */
    _createRgbSplitFilter: function(config) {
      return `
        <feOffset dx="0.02" in="SourceGraphic" result="f225-0"></feOffset>
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0 " in="f225-0" result="f49-0"></feColorMatrix>
        <feOffset in="SourceGraphic" result="f241-0"></feOffset>
        <feColorMatrix type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0 " in="f241-0" result="f121-0"></feColorMatrix>
        <feBlend mode="screen" in="f49-0" in2="f121-0" result="f102-0"></feBlend>
        <feOffset dx="-0.02" in="SourceGraphic" result="f257-0"></feOffset>
        <feColorMatrix type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 " in="f257-0" result="f137-0"></feColorMatrix>
        <feBlend mode="screen" in="f102-0" in2="f137-0" result="f150-0"></feBlend>
      `;
    },

    /**
     * 创建像素化滤镜
     */
    _createPixelFilter: function(config) {
      return `
        <feFlood x="4" y="4" height="2" width="2" />
        <feComposite width="10" height="10" />
        <feTile result="a" />
        <feComposite in="SourceGraphic" in2="a" operator="in" />
        <feMorphology operator="dilate" radius="5" />
      `;
    },

    /**
     * 创建凹槽滤镜
     */
    _createFlutedFilter: function(config) {
      const h = config.height;
      return `
        <feImage x="0" y="0" height="${h}" result="image_0" preserveAspectRatio="none meet" width="20" xlink:href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' color-interpolation-filters='sRGB'>
          <g>
            <rect width='1' height='1' fill='black' />
            <rect width='1' height='1' fill='url(%23red)' style='mix-blend-mode:screen' />
            <rect width='1' height='1' fill='url(%23green)' style='mix-blend-mode:screen' />
            <rect width='1' height='1' fill='url(%23yellow)' style='mix-blend-mode:screen' />
          </g>
          <defs>
            <radialGradient id='yellow' cx='0' cy='0' r='1' >
              <stop stop-color='yellow' />
              <stop stop-color='yellow' offset='1' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='green' cx='1' cy='0' r='1' >
              <stop stop-color='green' />
              <stop stop-color='green' offset='1' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='red' cx='0' cy='1' r='1' >
              <stop stop-color='red' />
              <stop stop-color='red' offset='1' stop-opacity='0' />
            </radialGradient>
          </defs>
        </svg>" />
        <feTile in="image_0" result="tile_0" />
        <feGaussianBlur stdDeviation="1" edgeMode="none" in="tile_0" result="bar_smoothness" x="0" y="0" />
        <feGaussianBlur stdDeviation="7.5" edgeMode="none" in="SourceGraphic" result="blur_glass" />
        <feDisplacementMap scale="75" xChannelSelector="R" yChannelSelector="G" in="blur_glass" in2="bar_smoothness" result="displacement_0" />
        <feOffset dx="-27" dy="-40" />
      `;
    },

    /**
     * 创建瓷砖滤镜
     */
    _createTiledFilter: function(config) {
      return `
        <feImage x="0" y="0" result="image_0" preserveAspectRatio="none meet" width="40" height='45' xlink:href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' color-interpolation-filters='sRGB'>
          <g>
            <rect width='1' height='1' fill='black' />
            <rect width='1' height='1' fill='url(%23red)' style='mix-blend-mode:screen' />
            <rect width='1' height='1' fill='url(%23green)' style='mix-blend-mode:screen' />
            <rect width='1' height='1' fill='url(%23yellow)' style='mix-blend-mode:screen' />
          </g>
          <defs>
            <radialGradient id='yellow' cx='0' cy='0' r='1' >
              <stop stop-color='yellow' />
              <stop stop-color='yellow' offset='1' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='green' cx='1' cy='0' r='1' >
              <stop stop-color='green' />
              <stop stop-color='green' offset='1' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='red' cx='0' cy='1' r='1' >
              <stop stop-color='red' />
              <stop stop-color='red' offset='1' stop-opacity='0' />
            </radialGradient>
          </defs>
        </svg>" />
        <feTile in="image_0" result="tile_0" />
        <feGaussianBlur stdDeviation="2" edgeMode="none" in="tile_0" result="bar_smoothness" x="0" y="0" />
        <feGaussianBlur stdDeviation="7.5" edgeMode="none" in="SourceGraphic" result="blur_glass" />
        <feDisplacementMap scale="112.5" xChannelSelector="R" yChannelSelector="G" in="blur_glass" in2="bar_smoothness" result="displacement_0" />
        <feOffset dx="15" dy="-25" in="displaced" />

        `;
    },

    /**
     * 创建马赛克滤镜
     * 使用固定尺寸 + feTile 实现固定背景效果
     * 配合 backdrop-filter: blur(2px) 使用
     */
    _createMosaicFilter: function(config) {
      return `
        <feImage result="f275-0" xlink:href="data:image/svg+xml,
          <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' width='100%' height='100%'>
            <rect width='1' height='1' fill='olive' />
           <rect fill='url(%23mosaic)' width='1' height='1'></rect>
            <defs>
              <pattern id='mosaic' viewBox='0 0 40 40' width='.4' height='.4' preserveAspectRatio='none'
                patternUnits='userSpaceOnUse' patternTransform='rotate(45)'>
                <path
                  d='M20 20.5V18H0v-2h20v-2H0v-2h20v-2H0V8h20V6H0V4h20V2H0V0h22v20h2V0h2v20h2V0h2v20h2V0h2v20h2V0h2v20h2v2H20v-1.5zM0 20h2v20H0V20zm4 0h2v20H4V20zm4 0h2v20H8V20zm4 0h2v20h-2V20zm4 0h2v20h-2V20zm4 4h20v2H20v-2zm0 4h20v2H20v-2zm0 4h20v2H20v-2zm0 4h20v2H20v-2z'
                  fill='red' fill-opacity='1' fill-rule='evenodd' />
              </pattern>
            </defs>
          </svg>
  " x="0" y="0" width="250" height="250" preserveAspectRatio="xMidYMid slice" />
        <feTile in="f275-0" result="tile" />
        <feGaussianBlur stdDeviation="1.875" result="blur" in="tile" />
        <feDisplacementMap xChannelSelector="R" yChannelSelector="G" scale="75" in="SourceGraphic" in2="blur" result="displaced" />
        <feOffset dx="15" dy="-25" in="displaced" />
      `;
    },

    /**
     * 创建椭圆滤镜
     */
    _createEllipsesFilter: function(config) {
      return `
        <feImage xlink:href="data:image/svg+xml;utf8,<svg width='300' height='300' preserveAspectRatio='none' xmlns='http://www.w3.org/2000/svg'
    xmlns:xlink='http://www.w3.org/1999/xlink'>
    <defs>
      <radialGradient id='radialGradient' r='.035' cx='50%' cy='50%' spreadMethod='reflect'>
        <stop offset='10%' stop-color='red' stop-opacity='1'></stop>
        <stop offset='100%' stop-color='white'></stop>
      </radialGradient>
    </defs>
    <rect fill='url(%23radialGradient)' width='300' height='300' fill-opacity='1'></rect>
  </svg>" result="img4" x="0" y="0" width="250" height="250" preserveAspectRatio='none' />
        <feTile in="img4" result="tile" />
        <feDisplacementMap scale="12.5" xChannelSelector="R" yChannelSelector="G" in2="tile" in="SourceGraphic" />
      `;
    },

    /**
     * 创建粗糙滤镜
     */
    _createRoughFilter: function(config) {
      return `
        <feImage preserveAspectRatio="none" xlink:href="data:image/svg+xml,
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' width='100%' height='100%'>
    <defs>
      <pattern id='mosaic' viewBox='0 0 40 40' width='1' height='1' preserveAspectRatio='none'
        patternUnits='userSpaceOnUse' patternTransform='rotate(-90)'>
        <path
          d='M40 37.1429v2.8571h-5.5357c1.6429-1.8143 3.5286-2.8571 5.5357-2.8571zm-18.5714 2.8571a2.8571 1.4286 90 10-2.8571 0h-2.9214A37.1143 18.5571 90 000 22.8571v-2.8571c.4786 0 .9571.0286 1.4286.1V20a2.8571 1.4286 90 00-1.4286-2.8571v-2.8571a5.7143 2.8571 90 012.8429 5.1429 40.1286 20.0643 90 012-5.5143A11.4286 5.7143 90 000 8.5714V5.7143a14.2714 7.1357 90 015.8357 6.0429c.6714-1.3571 1.4-2.6143 2.1643-3.7571A19.9714 9.9857 90 000 0h5.5357c1.4286 1.5714 2.6643 3.7571 3.6429 6.3571.8-1.0286 1.6429-1.9571 2.5214-2.7571A28.7143 14.3571 90 0010.2 0h1.9286c.3214.8.6286 1.6286.9214 2.4857.9286-.6857 1.8786-1.2429 2.8571-1.6429-.0786-.2857-.1643-.5714-.2571-.8429H18.5714v.1a40.5714 20.2857 90 012.8571 0V0h2.9214l-.2643.8429c.9857.4 1.9429.9571 2.8643 1.6429.2857-.8571.6-1.6857.9286-2.4857h1.9214a28.7143 14.3571 90 00-1.5 3.6c.8786.8 1.7214 1.7143 2.5286 2.7571A22.9714 11.4857 90 0134.4643 0H40c-3.2714 0-6.1786 3.1429-8 8 .7643 1.1429 1.4929 2.4 2.1643 3.7571A14.2714 7.1357 90 0140 5.7143v2.8571a11.4286 5.7143 90 00-4.8357 5.3429c.7357 1.7143 1.4071 3.5714 1.9929 5.5143A5.7143 2.8571 90 0140 14.2857v2.8571a2.8571 1.4286 90 00-1.4286 2.9571 40.5714 20.2857 90 011.4286-.1v2.8571c-6.5714 0-12.3571 6.8286-15.65 17.1429H21.4286zM5.5357 40H0v-2.8571c2.0071 0 3.9 1.0429 5.5357 2.8571zM40 28.5714v2.8571c-4 0-7.6071 3.2857-10.2 8.5714h-1.9286c2.8857-6.9857 7.25-11.4286 12.1286-11.4286zm-27.8786 11.4286h-1.9214C7.6071 34.7143 4 31.4286 0 31.4286v-2.8571c4.8786 0 9.2429 4.4429 12.1214 11.4286zm10.7214-.5714a40.1286 20.0643 90 012-5.5143 11.4286 5.7143 90 00-9.6786 0c.7357 1.7143 1.4071 3.5714 1.9929 5.5143a5.7143 2.8571 90 015.6857 0zm10.2071-16.9429c.9286-.6857 1.8786-1.2429 2.8571-1.6429a37.1286 18.5643 90 00-31.8214 0c.9857.4 1.9429.9571 2.8643 1.6429a31.4 15.7 90 0126.1 0zm-3.8786 3.8714c.8071-1.0286 1.6429-1.9571 2.5286-2.7571a28.5429 14.2714 90 00-23.4 0c.8786.8 1.7214 1.7143 2.5286 2.7571a22.8286 11.4143 90 0118.3429 0zm-3.3357 5.4c.6714-1.3571 1.4-2.6143 2.1643-3.7571a19.9714 9.9857 90 00-16 0c.7643 1.1429 1.4929 2.4 2.1643 3.7571a14.2714 7.1357 90 0111.6714 0z'
          fill='red' fill-opacity='1' fill-rule='evenodd' />
      </pattern>
    </defs>
    <rect fill='url(%23mosaic)' width='100%25' height='100%25'></rect>
  </svg>" result="pattern-raw" width="250" height="250" />
        <feTile in="pattern-raw" result="tile" />
        <feGaussianBlur stdDeviation="1" result="pattern-smooth" in="tile" />
        <feTurbulence type="fractalNoise" baseFrequency=".3" result="noise" />
        <feComposite operator="xor" result="masked" in1="noise" in2="pattern-smooth" />
        <feDisplacementMap scale="100" xChannelSelector="R" yChannelSelector="G" in="SourceGraphic" in2="masked" />
        <feOffset dx="45" dy="20" in="displaced" />
        `;
    },

    /**
     * 创建凸起滤镜
     */
    _createBulgeFilter: function(config) {
      return `
        <feImage result="gradient" xlink:href="data:image/svg+xml;charset=utf-8,
        <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' color-interpolation-filters='sRGB'>
          <rect width='1' height='1' fill='olive' />
          <g mask='url(%23c)'>
            <rect width='1' height='1' fill='%23000' />
            <rect width='1' height='1' fill='url(%23red)' style='mix-blend-mode:screen' />
            <rect width='1' height='1' fill='url(%23green)' style='mix-blend-mode:screen' />
            <rect width='1' height='1' fill='url(%23yellow)' style='mix-blend-mode:screen' />
          </g>
          <defs>
            <mask id='c' >
              <rect width='1' height='1' fill='url(%23b)' />
            </mask>
            <radialGradient id='b' cx='50%' cy='50%' r='50%'>
              <stop offset='.5' stop-color='white' />
              <stop offset='1' stop-color='white' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='yellow' cx='0' cy='0' r='1' >
              <stop stop-color='yellow' />
              <stop stop-color='yellow' offset='1' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='green' cx='1' cy='0' r='1' >
              <stop stop-color='green' />
              <stop stop-color='green' offset='1' stop-opacity='0' />
            </radialGradient>
            <radialGradient id='red' cx='0' cy='1' r='1' >
              <stop stop-color='red' />
              <stop stop-color='red' offset='1' stop-opacity='0' />
            </radialGradient>
          </defs>
        </svg>" x="0" y="0" width="1" height="1" preserveAspectRatio="none" />
        <feDisplacementMap result="displaced" in="SourceGraphic" in2="gradient" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
      `;
    }
  };

  // 将库暴露到全局作用域
  global.LiquidGlass = LiquidGlass;

})(typeof window !== 'undefined' ? window : this);
