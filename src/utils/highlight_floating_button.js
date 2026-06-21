(function() {
  if (window.self !== window.top) {
    return;
  }

  const FLOATING_BUTTON_ENABLED_KEY = 'wordHighlightFloatingButtonEnabled';
  const HIGHLIGHT_ENABLED_KEY = 'enablePlugin';
  const HIGHLIGHT_SCOPE_KEY = 'wordHighlightFloatingButtonScope';
  const PAGE_TAB_OVERRIDES_KEY = 'wordHighlightPageTabOverrides';
  const PAGE_THEME_OVERRIDES_KEY = 'highlightPageThemeOverrides';
  const POSITION_KEY = 'wordHighlightFloatingButtonPosition';
  const ROOT_ID = 'lingkuma-word-highlight-floating-root';
  const EDGE_THRESHOLD = 35;
  const BUTTON_WIDTH = 86;
  const BUTTON_HEIGHT = 34;
  const THEME_BUTTON_HEIGHT = 34;
  const BUTTON_STACK_GAP = 8;
  const BUTTON_STACK_HEIGHT = BUTTON_HEIGHT + BUTTON_STACK_GAP + THEME_BUTTON_HEIGHT;
  const BUTTON_FRAME_HEIGHT = Math.max(BUTTON_STACK_HEIGHT, BUTTON_WIDTH);
  const DOCK_VISIBLE_SIZE = 28;
  const SIDE_DOCK_OFFSET = BUTTON_WIDTH - DOCK_VISIBLE_SIZE;

  let rootHost = null;
  let shadowRoot = null;
  let buttonStack = null;
  let highlightSlot = null;
  let themeSlot = null;
  let buttonWrap = null;
  let themeButtonWrap = null;
  let currentHighlightEnabled = true;
  let currentPageThemeIsDark = false;
  let currentPosition = null;
  let pointerState = null;

  function getDefaultPosition() {
    return {
      x: 18,
      y: Math.max(80, Math.round((window.innerHeight - BUTTON_FRAME_HEIGHT) * 0.45)),
      dock: 'none'
    };
  }

  function normalizePosition(position) {
    const fallback = getDefaultPosition();
    const maxX = Math.max(0, window.innerWidth - BUTTON_WIDTH);
    const maxY = Math.max(0, window.innerHeight - BUTTON_FRAME_HEIGHT);

    return {
      x: Math.min(Math.max(Number(position?.x ?? fallback.x), 0), maxX),
      y: Math.min(Math.max(Number(position?.y ?? fallback.y), 0), maxY),
      dock: ['left', 'right', 'top', 'bottom', 'none'].includes(position?.dock) ? position.dock : 'none'
    };
  }

  function getSharedPosition(savedPosition) {
    if (savedPosition?.position) {
      return normalizePosition(savedPosition.position);
    }
    if (savedPosition && typeof savedPosition === 'object') {
      return normalizePosition(savedPosition);
    }
    return getDefaultPosition();
  }

  function savePosition() {
    if (!currentPosition) {
      return;
    }

    chrome.storage.local.set({
      [POSITION_KEY]: currentPosition
    });
  }

  function applyPosition(position) {
    if (!buttonStack) {
      return;
    }

    currentPosition = normalizePosition(position);
    buttonStack.style.left = `${currentPosition.x}px`;
    buttonStack.style.top = `${currentPosition.y}px`;
    buttonStack.dataset.dock = currentPosition.dock;
  }

  function snapToEdge(position) {
    const maxX = Math.max(0, window.innerWidth - BUTTON_WIDTH);
    const maxY = Math.max(0, window.innerHeight - BUTTON_FRAME_HEIGHT);
    const distances = [
      { edge: 'left', value: position.x },
      { edge: 'right', value: maxX - position.x },
      { edge: 'top', value: position.y },
      { edge: 'bottom', value: maxY - position.y }
    ].sort((a, b) => a.value - b.value);

    const closest = distances[0];
    const nextPosition = normalizePosition(position);

    if (closest.value > EDGE_THRESHOLD) {
      nextPosition.dock = 'none';
      return nextPosition;
    }

    nextPosition.dock = closest.edge;
    if (closest.edge === 'left') {
      nextPosition.x = 0;
    } else if (closest.edge === 'right') {
      nextPosition.x = maxX;
    } else if (closest.edge === 'top') {
      nextPosition.y = 0;
    } else if (closest.edge === 'bottom') {
      nextPosition.y = maxY;
    }

    return nextPosition;
  }

  function updateHighlightState(enabled) {
    currentHighlightEnabled = enabled !== false;
    if (buttonWrap) {
      buttonWrap.dataset.highlight = currentHighlightEnabled ? 'on' : 'off';
      buttonWrap.setAttribute(
        'aria-label',
        currentHighlightEnabled ? 'Word highlight is on. Click to turn off.' : 'Word highlight is off. Click to turn on.'
      );
      buttonWrap.setAttribute(
        'title',
        currentHighlightEnabled ? 'Word highlight: On' : 'Word highlight: Off'
      );
    }
  }

  function triggerButtonPulse(button) {
    if (!button) {
      return;
    }

    button.dataset.pulse = 'true';
    window.setTimeout(() => {
      if (button) {
        delete button.dataset.pulse;
      }
    }, 280);
  }

  function broadcastHighlightState(enabled) {
    chrome.runtime.sendMessage({
      action: 'broadcastToggleHighlight',
      enabled
    }, () => {
      if (chrome.runtime.lastError) {
        console.debug('[LingKuma] broadcastToggleHighlight failed:', chrome.runtime.lastError.message);
      }
    });
  }

  function getPageThemeKey() {
    try {
      return window.location.hostname.toLowerCase();
    } catch (error) {
      return window.location.host.toLowerCase();
    }
  }

  function getCurrentHighlightTheme(fallback = false) {
    try {
      if (typeof highlightManager !== 'undefined' && highlightManager && typeof highlightManager.isDarkMode === 'boolean') {
        return highlightManager.isDarkMode;
      }
    } catch (error) {
      // The highlighter may not be initialized yet.
    }
    return fallback;
  }

  function updatePageThemeState(isDark) {
    currentPageThemeIsDark = isDark === true;
    if (!themeButtonWrap) {
      return;
    }

    themeButtonWrap.dataset.theme = currentPageThemeIsDark ? 'dark' : 'light';
    themeButtonWrap.setAttribute(
      'aria-label',
      currentPageThemeIsDark ? 'Current page highlight theme is dark. Click to use light.' : 'Current page highlight theme is light. Click to use dark.'
    );
    themeButtonWrap.setAttribute(
      'title',
      currentPageThemeIsDark ? 'Current page highlight: Dark' : 'Current page highlight: Light'
    );
  }

  function normalizePageThemeOverride(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value && typeof value.isDark === 'boolean') {
      return value.isDark;
    }
    return null;
  }

  function applyCurrentPageTheme(isDark) {
    updatePageThemeState(isDark);

    try {
      if (typeof highlightManager !== 'undefined' && highlightManager) {
        highlightManager.setDarkMode(isDark);
        highlightManager.reapplyHighlights();
      }
    } catch (error) {
      console.debug('[LingKuma] apply current page highlight theme failed:', error);
    }
  }

  function saveCurrentPageTheme(isDark) {
    chrome.storage.local.get({ [PAGE_THEME_OVERRIDES_KEY]: {} }, (result) => {
      const overrides = result[PAGE_THEME_OVERRIDES_KEY] || {};
      const pageKey = getPageThemeKey();
      const nextOverrides = {};

      Object.entries(overrides).forEach(([key, value]) => {
        const normalized = normalizePageThemeOverride(value);
        if (normalized !== null) {
          nextOverrides[key] = normalized;
        }
      });

      nextOverrides[pageKey] = isDark === true;

      chrome.storage.local.set({
        [PAGE_THEME_OVERRIDES_KEY]: nextOverrides
      });
    });
  }

  function toggleCurrentPageTheme(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const nextIsDark = !currentPageThemeIsDark;
    applyCurrentPageTheme(nextIsDark);
    triggerButtonPulse(themeButtonWrap);
    saveCurrentPageTheme(nextIsDark);

    if (event?.type === 'click' && event.detail > 0) {
      themeButtonWrap.blur();
    }
  }

  function refreshHighlightControlState() {
    chrome.runtime.sendMessage({ action: 'getWordHighlightControlState' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        chrome.storage.local.get({ [HIGHLIGHT_ENABLED_KEY]: false }, (result) => {
          updateHighlightState(result[HIGHLIGHT_ENABLED_KEY] === true);
        });
        return;
      }

      updateHighlightState(response.enabled !== false);
    });
  }

  function toggleHighlight() {
    const enabled = !currentHighlightEnabled;
    updateHighlightState(enabled);
    triggerButtonPulse(buttonWrap);

    chrome.runtime.sendMessage({
      action: 'toggleWordHighlightFromFloatingButton',
      enabled
    }, (response) => {
      if (chrome.runtime.lastError || response?.success === false) {
        console.debug('[LingKuma] floating highlight toggle failed:', chrome.runtime.lastError?.message || response?.error);
        refreshHighlightControlState();
        return;
      }

      updateHighlightState(response.enabled !== false);
    });
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  function initializeStars() {
    if (!buttonWrap) {
      return;
    }

    buttonWrap.querySelectorAll('.star').forEach((star) => {
      star.style.setProperty('--angle', randomInt(0, 360));
      star.style.setProperty('--duration', randomInt(6, 20));
      star.style.setProperty('--delay', randomInt(1, 10));
      star.style.setProperty('--alpha', randomInt(40, 90) / 100);
      star.style.setProperty('--size', randomInt(2, 6));
      star.style.setProperty('--distance', randomInt(40, 200));
    });
  }

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        --transition: 0.25s;
        --dock-motion: 470ms cubic-bezier(0.16, 1, 0.3, 1);
        --spark: 1.8s;
        --hue: 245;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      .lk-floating-stack {
        position: fixed;
        width: ${BUTTON_WIDTH}px;
        height: ${BUTTON_STACK_HEIGHT}px;
        z-index: 2147483647;
        transform: translate3d(0, 0, 0);
        transform-origin: center;
        transition:
          width var(--dock-motion),
          height var(--dock-motion);
      }

      .lk-floating-stack[data-dock="top"],
      .lk-floating-stack[data-dock="bottom"] {
        width: ${BUTTON_STACK_HEIGHT}px;
        height: ${BUTTON_WIDTH}px;
      }

      .lk-floating-slot {
        position: absolute;
        top: 0;
        left: 0;
        width: ${BUTTON_WIDTH}px;
        height: ${BUTTON_HEIGHT}px;
        opacity: 0.88;
        transform: translate3d(0, 0, 0);
        transform-origin: center;
        transition:
          opacity 180ms ease,
          transform var(--dock-motion),
          top var(--dock-motion),
          left var(--dock-motion),
          width var(--dock-motion),
          height var(--dock-motion);
      }

      .lk-floating-slot--theme {
        top: ${BUTTON_HEIGHT + BUTTON_STACK_GAP}px;
      }

      .lk-floating-stack[data-dock="left"] .lk-floating-slot {
        opacity: 0.42;
        transform: translate3d(-${SIDE_DOCK_OFFSET}px, 0, 0);
      }

      .lk-floating-stack[data-dock="right"] .lk-floating-slot {
        opacity: 0.42;
        transform: translate3d(${SIDE_DOCK_OFFSET}px, 0, 0);
      }

      .lk-floating-stack[data-dock="top"] .lk-floating-slot,
      .lk-floating-stack[data-dock="bottom"] .lk-floating-slot {
        width: ${BUTTON_HEIGHT}px;
        height: ${BUTTON_WIDTH}px;
        opacity: 0.42;
      }

      .lk-floating-stack[data-dock="top"] .lk-floating-slot {
        top: 0;
        transform: translate3d(0, -${SIDE_DOCK_OFFSET}px, 0);
      }

      .lk-floating-stack[data-dock="bottom"] .lk-floating-slot {
        top: 0;
        transform: translate3d(0, ${SIDE_DOCK_OFFSET}px, 0);
      }

      .lk-floating-stack[data-dock="top"] .lk-floating-slot--highlight,
      .lk-floating-stack[data-dock="bottom"] .lk-floating-slot--highlight {
        left: 0;
      }

      .lk-floating-stack[data-dock="top"] .lk-floating-slot--theme,
      .lk-floating-stack[data-dock="bottom"] .lk-floating-slot--theme {
        left: ${BUTTON_HEIGHT + BUTTON_STACK_GAP}px;
      }

      .lk-floating-stack[data-dock="left"] .lk-floating-slot:hover,
      .lk-floating-stack[data-dock="left"] .lk-floating-slot:focus-within,
      .lk-floating-stack[data-dock="right"] .lk-floating-slot:hover,
      .lk-floating-stack[data-dock="right"] .lk-floating-slot:focus-within,
      .lk-floating-stack[data-dock="top"] .lk-floating-slot:hover,
      .lk-floating-stack[data-dock="top"] .lk-floating-slot:focus-within,
      .lk-floating-stack[data-dock="bottom"] .lk-floating-slot:hover,
      .lk-floating-stack[data-dock="bottom"] .lk-floating-slot:focus-within,
      .lk-floating-stack[data-dragging="true"] .lk-floating-slot {
        opacity: 0.98;
        transform: translate3d(0, 0, 0);
      }

      .lk-floating-highlight {
        --cut: 0.1em;
        --active: 0;
        --bg:
          radial-gradient(
            120% 120% at 126% 126%,
            hsl(var(--hue) calc(var(--active) * 97%) 98% / calc(var(--active) * 0.9)) 40%,
            transparent 50%
          ) calc(100px - (var(--active) * 100px)) 0 / 100% 100% no-repeat,
          radial-gradient(
            120% 120% at 120% 120%,
            hsl(var(--hue) calc(var(--active) * 97%) 70% / calc(var(--active) * 1)) 30%,
            transparent 70%
          ) calc(100px - (var(--active) * 100px)) 0 / 100% 100% no-repeat,
          hsl(var(--hue) calc(var(--active) * 100%) calc(12% - (var(--active) * 8%)));
        position: absolute;
        top: 0;
        left: 0;
        width: ${BUTTON_WIDTH}px;
        height: ${BUTTON_HEIGHT}px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.25em;
        border: 0;
        border-radius: 2rem;
        padding: 0.9em 1.3em;
        color: hsl(0 0% calc(60% + (var(--active) * 26%)));
        background: var(--bg);
        // box-shadow:
        //   0 0 calc(var(--active) * 6em) calc(var(--active) * 3em) hsl(var(--hue) 97% 61% / 0.5),
        //   0 0.05em 0 0 hsl(var(--hue) calc(var(--active) * 97%) calc((var(--active) * 50%) + 30%)) inset,
        //   0 -0.05em 0 0 hsl(var(--hue) calc(var(--active) * 97%) calc(var(--active) * 10%)) inset,
        //   0 12px 30px rgba(20, 20, 19, 0.18);
        cursor: grab;
        font-size: 16px;
        font-weight: 600;
        line-height: 1;
        letter-spacing: 0;
        white-space: nowrap;
        opacity: 0.88;
        transform: translate3d(0, 0, 0);
        scale: 1;
        transform-style: preserve-3d;
        perspective: 100vmin;
        overflow: hidden;
        transition:
          opacity 180ms ease,
          transform var(--dock-motion),
          box-shadow var(--transition),
          scale var(--transition),
          background var(--transition),
          color var(--transition);
        user-select: none;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
      }

      .lk-floating-stack[data-dock="top"] .lk-floating-highlight,
      .lk-floating-stack[data-dock="top"] .lk-current-page-theme {
        top: ${Math.round((BUTTON_WIDTH - BUTTON_HEIGHT) / 2)}px;
        left: -${Math.round((BUTTON_WIDTH - BUTTON_HEIGHT) / 2)}px;
        transform: rotate(-90deg);
      }

      .lk-floating-stack[data-dock="bottom"] .lk-floating-highlight,
      .lk-floating-stack[data-dock="bottom"] .lk-current-page-theme {
        top: ${Math.round((BUTTON_WIDTH - BUTTON_HEIGHT) / 2)}px;
        left: -${Math.round((BUTTON_WIDTH - BUTTON_HEIGHT) / 2)}px;
        transform: rotate(90deg);
      }

      .lk-floating-stack[data-dragging="true"] .lk-floating-highlight,
      .lk-floating-stack[data-dragging="true"] .lk-current-page-theme {
        top: 0;
        left: 0;
        transform: translate3d(0, 0, 0);
      }

      .lk-floating-highlight:hover:not([data-collapse-after-click="true"]),
      .lk-floating-highlight:focus-visible,
      .lk-floating-highlight[data-dragging="true"] {
        opacity: 0.98;
      }

      .lk-floating-highlight:focus-visible {
        outline: 2px solid #3898ec;
        outline-offset: 3px;
      }

      .lk-floating-highlight:active {
        cursor: grabbing;
      }

      .lk-floating-highlight[data-pulse="true"],
      .lk-current-page-theme[data-pulse="true"] {
        -webkit-animation: lk-button-pop 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
        animation: lk-button-pop 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .lk-floating-highlight[data-highlight="on"] {
        --active: 1;
        --play-state: running;
      }

      .lk-floating-highlight[data-highlight="off"] {
        --active: 0;
      }

      .spark {
        position: absolute;
        inset: 0;
        border-radius: 2rem;
        rotate: 0deg;
        overflow: hidden;
        -webkit-mask: linear-gradient(white, transparent 50%);
        mask: linear-gradient(white, transparent 50%);
        -webkit-animation: flip calc(var(--spark) * 2) infinite steps(2, end);
        animation: flip calc(var(--spark) * 2) infinite steps(2, end);
      }

      .spark::before {
        content: "";
        position: absolute;
        width: 200%;
        aspect-ratio: 1;
        top: 0%;
        left: 50%;
        z-index: -1;
        translate: -50% -15%;
        rotate: 0;
        transform: rotate(-90deg);
        opacity: calc((var(--active)) + 0.4);
        background: conic-gradient(
          from 0deg,
          transparent 0 340deg,
          white 360deg
        );
        transition: opacity var(--transition);
        -webkit-animation: rotate var(--spark) linear infinite both;
        animation: rotate var(--spark) linear infinite both;
      }

      .spark::after {
        content: "";
        position: absolute;
        inset: var(--cut);
        border-radius: 2rem;
      }

      .backdrop {
        position: absolute;
        inset: var(--cut);
        background: var(--bg);
        border-radius: 2rem;
        transition: background var(--transition);
      }

      .galaxy {
        position: absolute;
        width: 100%;
        aspect-ratio: 1;
        top: 50%;
        left: 50%;
        translate: -50% -50%;
        overflow: hidden;
        opacity: var(--active);
        transition: opacity var(--transition);
      }

      .galaxy__ring {
        height: 200%;
        width: 200%;
        position: absolute;
        top: 50%;
        left: 50%;
        border-radius: 50%;
        transform: translate(-28%, -40%) rotateX(-24deg) rotateY(-30deg) rotateX(90deg);
        transform-style: preserve-3d;
      }

      .galaxy__container {
        position: absolute;
        inset: 0;
        opacity: var(--active);
        transition: opacity var(--transition);
        -webkit-mask: radial-gradient(white, transparent);
        mask: radial-gradient(white, transparent);
      }

      .star {
        height: calc(var(--size) * 1px);
        aspect-ratio: 1;
        background: white;
        border-radius: 50%;
        position: absolute;
        opacity: var(--alpha);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(10deg) rotate(0deg) translateY(calc(var(--distance) * 1px));
        -webkit-animation: orbit calc(var(--duration) * 1s) calc(var(--delay) * -1s) infinite linear;
        animation: orbit calc(var(--duration) * 1s) calc(var(--delay) * -1s) infinite linear;
      }

      .star--static {
        -webkit-animation:
          move-x calc(var(--duration) * 0.1s) calc(var(--delay) * -0.1s) infinite linear,
          move-y calc(var(--duration) * 0.2s) calc(var(--delay) * -0.2s) infinite linear;
        animation:
          move-x calc(var(--duration) * 0.1s) calc(var(--delay) * -0.1s) infinite linear,
          move-y calc(var(--duration) * 0.2s) calc(var(--delay) * -0.2s) infinite linear;
        top: 50%;
        left: 50%;
        transform: translate(0, 0);
        max-height: 4px;
        filter: brightness(4);
        opacity: 0.9;
      }

      .lk-floating-highlight[data-highlight="on"] .star--static {
        -webkit-animation-play-state: paused;
        animation-play-state: paused;
      }

      .text {
        position: relative;
        z-index: 1;
        translate: 2% -6%;
        color: hsl(0 0% calc(60% + (var(--active) * 26%)));
        letter-spacing: 0.01ch;
        transition: color var(--transition);
        pointer-events: none;
      }

      .lk-current-page-theme {
        position: absolute;
        top: 0;
        left: 0;
        width: ${BUTTON_WIDTH}px;
        height: ${THEME_BUTTON_HEIGHT}px;
        border: 0;
        border-radius: 999px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #ebebeb;
        box-shadow:
          inset 0 2px 7px rgba(0, 0, 0, 0.26),
          inset 0 -2px 7px rgba(255, 255, 255, 0.46),
          0 10px 24px rgba(20, 20, 19, 0.16);
        cursor: pointer;
        opacity: 0.88;
        overflow: hidden;
        transition:
          opacity 180ms ease,
          transform var(--dock-motion),
          background 220ms ease,
          box-shadow 220ms ease;
        user-select: none;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      .lk-current-page-theme:hover,
      .lk-current-page-theme:focus-visible {
        opacity: 0.98;
      }

      .lk-current-page-theme:focus-visible {
        outline: 2px solid #3898ec;
        outline-offset: 3px;
      }

      .lk-current-page-theme::after {
        content: "";
        position: absolute;
        width: 28px;
        height: 28px;
        top: 3px;
        left: 4px;
        border-radius: 999px;
        background: linear-gradient(180deg, #ffcc89, #d8860b);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22);
        transition:
          left 220ms ease,
          transform 220ms ease,
          background 220ms ease;
      }

      .lk-current-page-theme svg {
        position: relative;
        z-index: 1;
        width: 18px;
        height: 18px;
        flex: 0 0 18px;
        transition: fill 220ms ease, color 220ms ease;
      }

      .lk-current-page-theme .theme-sun {
        margin-left: 9px;
        fill: #fff;
      }

      .lk-current-page-theme .theme-moon {
        margin-right: 9px;
        fill: #7e7e7e;
      }

      .lk-current-page-theme[data-theme="dark"] {
        background: #242424;
      }

      .lk-current-page-theme[data-theme="dark"]::after {
        left: calc(100% - 4px);
        transform: translateX(-100%);
        background: linear-gradient(180deg, #777, #3a3a3a);
      }

      .lk-current-page-theme[data-theme="dark"] .theme-sun {
        fill: #7e7e7e;
      }

      .lk-current-page-theme[data-theme="dark"] .theme-moon {
        fill: #fff;
      }

      @-webkit-keyframes orbit {
        to {
          transform: translate(-50%, -50%) rotate(10deg) rotate(360deg) translateY(calc(var(--distance) * 1px));
        }
      }

      @keyframes orbit {
        to {
          transform: translate(-50%, -50%) rotate(10deg) rotate(360deg) translateY(calc(var(--distance) * 1px));
        }
      }

      @-webkit-keyframes move-x {
        0% {
          translate: -100px 0;
        }
        100% {
          translate: 100px 0;
        }
      }

      @keyframes move-x {
        0% {
          translate: -100px 0;
        }
        100% {
          translate: 100px 0;
        }
      }

      @-webkit-keyframes move-y {
        0% {
          transform: translate(0, -50px);
        }
        100% {
          transform: translate(0, 50px);
        }
      }

      @keyframes move-y {
        0% {
          transform: translate(0, -50px);
        }
        100% {
          transform: translate(0, 50px);
        }
      }

      @-webkit-keyframes flip {
        to {
          rotate: 360deg;
        }
      }

      @keyframes flip {
        to {
          rotate: 360deg;
        }
      }

      @-webkit-keyframes rotate {
        to {
          transform: rotate(90deg);
        }
      }

      @keyframes rotate {
        to {
          transform: rotate(90deg);
        }
      }

      @-webkit-keyframes lk-button-pop {
        0% {
          scale: 1;
        }
        45% {
          scale: 1.08;
        }
        100% {
          scale: 1;
        }
      }

      @keyframes lk-button-pop {
        0% {
          scale: 1;
        }
        45% {
          scale: 1.08;
        }
        100% {
          scale: 1;
        }
      }
    `;
    return style;
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const baseX = currentPosition?.x ?? buttonStack.getBoundingClientRect().left;
    const baseY = currentPosition?.y ?? buttonStack.getBoundingClientRect().top;
    pointerState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - baseX,
      offsetY: event.clientY - baseY,
      dock: currentPosition?.dock || buttonStack.dataset.dock || 'none',
      moved: false
    };

    if (shadowRoot?.activeElement && shadowRoot.activeElement !== buttonWrap) {
      shadowRoot.activeElement.blur();
    }
    delete buttonWrap.dataset.collapseAfterClick;
    buttonWrap.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = Math.abs(event.clientX - pointerState.startX);
    const deltaY = Math.abs(event.clientY - pointerState.startY);
    if (!pointerState.moved && (deltaX > 3 || deltaY > 3)) {
      pointerState.moved = true;
      buttonStack.dataset.dragging = 'true';
      buttonStack.dataset.dock = 'none';
      buttonWrap.dataset.dragging = 'true';
      delete buttonWrap.dataset.collapseAfterClick;
    }

    if (!pointerState.moved) {
      event.preventDefault();
      return;
    }

    const maxX = Math.max(0, window.innerWidth - BUTTON_WIDTH);
    const maxY = Math.max(0, window.innerHeight - BUTTON_FRAME_HEIGHT);
    const x = Math.min(Math.max(event.clientX - pointerState.offsetX, 0), maxX);
    const y = Math.min(Math.max(event.clientY - pointerState.offsetY, 0), maxY);

    currentPosition = { x, y, dock: 'none' };
    buttonStack.style.left = `${x}px`;
    buttonStack.style.top = `${y}px`;
    buttonStack.dataset.dock = 'none';
    event.preventDefault();
  }

  function handlePointerUp(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    const wasMoved = pointerState.moved;
    const previousDock = pointerState.dock;
    pointerState = null;
    delete buttonStack.dataset.dragging;
    delete buttonWrap.dataset.dragging;

    try {
      buttonWrap.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture may already be released by the browser.
    }

    if (wasMoved) {
      applyPosition(snapToEdge(currentPosition));
      savePosition();
    } else {
      const dock = currentPosition?.dock || previousDock || 'none';
      buttonStack.dataset.dock = dock;
      if (dock === 'none') {
        delete buttonWrap.dataset.collapseAfterClick;
      } else {
        buttonWrap.dataset.collapseAfterClick = 'true';
      }
      toggleHighlight();
    }

    event.preventDefault();
  }

  function handlePointerLeave() {
    if (buttonWrap) {
      delete buttonWrap.dataset.collapseAfterClick;
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleHighlight();
    }
  }

  function createButton(savedPosition, pageThemeOverride = null) {
    if (document.getElementById(ROOT_ID)) {
      return;
    }

    rootHost = document.createElement('div');
    rootHost.id = ROOT_ID;
    shadowRoot = rootHost.attachShadow({ mode: 'open' });

    buttonStack = document.createElement('div');
    buttonStack.className = 'lk-floating-stack';

    highlightSlot = document.createElement('div');
    highlightSlot.className = 'lk-floating-slot lk-floating-slot--highlight';

    buttonWrap = document.createElement('button');
    buttonWrap.className = 'lk-floating-highlight';
    buttonWrap.type = 'button';
    buttonWrap.innerHTML = `
      <span class="spark" aria-hidden="true"></span>
      <span class="backdrop" aria-hidden="true"></span>
      <span class="galaxy__container" aria-hidden="true">
        <span class="star star--static"></span>
        <span class="star star--static"></span>
        <span class="star star--static"></span>
        <span class="star star--static"></span>
      </span>
      <span class="galaxy" aria-hidden="true">
        <span class="galaxy__ring">
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
          <span class="star"></span>
        </span>
      </span>
      <span class="text">Kuma</span>
    `;

    themeSlot = document.createElement('div');
    themeSlot.className = 'lk-floating-slot lk-floating-slot--theme';

    themeButtonWrap = document.createElement('button');
    themeButtonWrap.className = 'lk-current-page-theme';
    themeButtonWrap.type = 'button';
    themeButtonWrap.innerHTML = `
      <svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 18.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm0-15.5a1 1 0 0 1-1-1V1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1Zm0 21a1 1 0 0 1-1-1v-1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1Zm11-11h-1a1 1 0 1 1 0-2h1a1 1 0 1 1 0 2ZM3 13H1a1 1 0 1 1 0-2h2a1 1 0 1 1 0 2Zm15.78-6.36a1 1 0 0 1-.7-1.71l.7-.71a1 1 0 1 1 1.42 1.42l-.71.7a1 1 0 0 1-.71.3ZM4.93 20.07a1 1 0 0 1-.71-1.7l.71-.71a1 1 0 0 1 1.41 1.41l-.7.71a1 1 0 0 1-.71.29Zm14.56 0a1 1 0 0 1-.71-.29l-.7-.71a1 1 0 0 1 1.41-1.41l.71.7a1 1 0 0 1-.71 1.71ZM5.64 6.34a1 1 0 0 1-.71-.3l-.71-.7a1 1 0 0 1 1.42-1.42l.7.71a1 1 0 0 1-.7 1.71Z"/>
      </svg>
      <svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21.3 14.05a1 1 0 0 0-1.08-.25 7.8 7.8 0 0 1-3.2.68 7.95 7.95 0 0 1-7.95-7.95c0-1.1.22-2.18.66-3.2a1 1 0 0 0-1.33-1.3A10.5 10.5 0 1 0 22 15.13a1 1 0 0 0-.7-1.08Z"/>
      </svg>
    `;

    highlightSlot.append(buttonWrap);
    themeSlot.append(themeButtonWrap);
    buttonStack.append(highlightSlot, themeSlot);
    shadowRoot.append(createStyles(), buttonStack);
    document.documentElement.appendChild(rootHost);

    buttonWrap.addEventListener('pointerdown', handlePointerDown);
    buttonWrap.addEventListener('pointermove', handlePointerMove);
    buttonWrap.addEventListener('pointerup', handlePointerUp);
    buttonWrap.addEventListener('pointercancel', handlePointerUp);
    buttonWrap.addEventListener('pointerleave', handlePointerLeave);
    buttonWrap.addEventListener('keydown', handleKeyDown);
    themeButtonWrap.addEventListener('click', toggleCurrentPageTheme);
    themeButtonWrap.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        toggleCurrentPageTheme(event);
      }
    });

    initializeStars();
    applyPosition(getSharedPosition(savedPosition));
    updateHighlightState(currentHighlightEnabled);
    const pageThemeIsDark = normalizePageThemeOverride(pageThemeOverride);
    updatePageThemeState(
      pageThemeIsDark !== null
        ? pageThemeIsDark
        : getCurrentHighlightTheme(currentPageThemeIsDark)
    );

    setTimeout(() => {
      if (!themeButtonWrap || pageThemeOverride) {
        return;
      }
      updatePageThemeState(getCurrentHighlightTheme(currentPageThemeIsDark));
    }, 800);
  }

  function destroyButton() {
    if (rootHost) {
      rootHost.remove();
    }
    rootHost = null;
    shadowRoot = null;
    buttonStack = null;
    highlightSlot = null;
    themeSlot = null;
    buttonWrap = null;
    themeButtonWrap = null;
    pointerState = null;
  }

  function initializeFloatingButton() {
    chrome.storage.local.get({
      [FLOATING_BUTTON_ENABLED_KEY]: false,
      [HIGHLIGHT_ENABLED_KEY]: false,
      [POSITION_KEY]: null,
      [PAGE_THEME_OVERRIDES_KEY]: {}
    }, (result) => {
      currentHighlightEnabled = result[HIGHLIGHT_ENABLED_KEY] !== false;
      const pageThemeOverride = (result[PAGE_THEME_OVERRIDES_KEY] || {})[getPageThemeKey()];
      const pageThemeIsDark = normalizePageThemeOverride(pageThemeOverride);
      currentPageThemeIsDark = pageThemeIsDark !== null
        ? pageThemeIsDark
        : getCurrentHighlightTheme(false);

      if (result[FLOATING_BUTTON_ENABLED_KEY] !== false) {
        createButton(result[POSITION_KEY], pageThemeOverride);
        refreshHighlightControlState();
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes[HIGHLIGHT_ENABLED_KEY] || changes[HIGHLIGHT_SCOPE_KEY] || changes[PAGE_TAB_OVERRIDES_KEY]) {
      refreshHighlightControlState();
    }

    if (changes[FLOATING_BUTTON_ENABLED_KEY]) {
      if (changes[FLOATING_BUTTON_ENABLED_KEY].newValue === true) {
        chrome.storage.local.get({ [POSITION_KEY]: null, [PAGE_THEME_OVERRIDES_KEY]: {} }, (result) => {
          const pageThemeOverride = (result[PAGE_THEME_OVERRIDES_KEY] || {})[getPageThemeKey()];
          createButton(result[POSITION_KEY], pageThemeOverride);
        });
      } else {
        destroyButton();
      }
    }

    if (changes[PAGE_THEME_OVERRIDES_KEY]) {
      const pageThemeOverride = (changes[PAGE_THEME_OVERRIDES_KEY].newValue || {})[getPageThemeKey()];
      const pageThemeIsDark = normalizePageThemeOverride(pageThemeOverride);
      if (pageThemeIsDark !== null) {
        updatePageThemeState(pageThemeIsDark);
      }
    }

    if (changes[POSITION_KEY] && !pointerState) {
      applyPosition(getSharedPosition(changes[POSITION_KEY].newValue));
    }
  });

  window.addEventListener('resize', () => {
    if (!currentPosition || !buttonWrap) {
      return;
    }
    applyPosition(currentPosition);
    savePosition();
  });

  initializeFloatingButton();
})();
