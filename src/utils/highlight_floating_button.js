(function() {
  if (window.self !== window.top) {
    return;
  }

  const FLOATING_BUTTON_ENABLED_KEY = 'wordHighlightFloatingButtonEnabled';
  const HIGHLIGHT_ENABLED_KEY = 'enablePlugin';
  const POSITION_KEY = 'wordHighlightFloatingButtonPosition';
  const ROOT_ID = 'lingkuma-word-highlight-floating-root';
  const EDGE_THRESHOLD = 35;
  const BUTTON_WIDTH = 86;
  const BUTTON_HEIGHT = 42;

  let rootHost = null;
  let shadowRoot = null;
  let buttonWrap = null;
  let currentHighlightEnabled = true;
  let currentPosition = null;
  let pointerState = null;

  function getDefaultPosition() {
    return {
      x: 18,
      y: Math.max(80, Math.round((window.innerHeight - BUTTON_HEIGHT) * 0.45)),
      dock: 'none'
    };
  }

  function normalizePosition(position) {
    const fallback = getDefaultPosition();
    const maxX = Math.max(0, window.innerWidth - BUTTON_WIDTH);
    const maxY = Math.max(0, window.innerHeight - BUTTON_HEIGHT);

    return {
      x: Math.min(Math.max(Number(position?.x ?? fallback.x), 0), maxX),
      y: Math.min(Math.max(Number(position?.y ?? fallback.y), 0), maxY),
      dock: ['left', 'right', 'top', 'bottom', 'none'].includes(position?.dock) ? position.dock : 'none'
    };
  }

  function getHostPosition(savedPosition) {
    const host = location.hostname || 'local';
    if (savedPosition && savedPosition.host === host && savedPosition.position) {
      return normalizePosition(savedPosition.position);
    }
    return getDefaultPosition();
  }

  function savePosition() {
    if (!currentPosition) {
      return;
    }

    chrome.storage.local.set({
      [POSITION_KEY]: {
        host: location.hostname || 'local',
        position: currentPosition
      }
    });
  }

  function applyPosition(position) {
    if (!buttonWrap) {
      return;
    }

    currentPosition = normalizePosition(position);
    buttonWrap.style.left = `${currentPosition.x}px`;
    buttonWrap.style.top = `${currentPosition.y}px`;
    buttonWrap.dataset.dock = currentPosition.dock;
  }

  function snapToEdge(position) {
    const maxX = Math.max(0, window.innerWidth - BUTTON_WIDTH);
    const maxY = Math.max(0, window.innerHeight - BUTTON_HEIGHT);
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

  function toggleHighlight() {
    chrome.storage.local.get({ [HIGHLIGHT_ENABLED_KEY]: true }, (result) => {
      const enabled = !(result[HIGHLIGHT_ENABLED_KEY] !== false);
      updateHighlightState(enabled);
      chrome.storage.local.set({ [HIGHLIGHT_ENABLED_KEY]: enabled }, () => {
        broadcastHighlightState(enabled);
      });
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
        --spark: 1.8s;
        --hue: 245;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
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
        position: fixed;
        width: ${BUTTON_WIDTH}px;
        height: ${BUTTON_HEIGHT}px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.25em;
        border: 0;
        border-radius: 2rem;
        padding: 0.9em 1.3em;
        color: hsl(0 0% calc(60% + (var(--active) * 26%)));
        background: var(--bg);
        box-shadow:
          0 0 calc(var(--active) * 6em) calc(var(--active) * 3em) hsl(var(--hue) 97% 61% / 0.5),
          0 0.05em 0 0 hsl(var(--hue) calc(var(--active) * 97%) calc((var(--active) * 50%) + 30%)) inset,
          0 -0.05em 0 0 hsl(var(--hue) calc(var(--active) * 97%) calc(var(--active) * 10%)) inset,
          0 12px 30px rgba(20, 20, 19, 0.18);
        cursor: grab;
        font-size: 16px;
        font-weight: 600;
        line-height: 1;
        letter-spacing: 0;
        white-space: nowrap;
        opacity: 0.88;
        transform: translate3d(0, 0, 0);
        scale: calc(1 + (var(--active) * 0.1));
        transform-style: preserve-3d;
        perspective: 100vmin;
        overflow: hidden;
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          box-shadow var(--transition),
          scale var(--transition),
          background var(--transition),
          color var(--transition);
        user-select: none;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
      }

      .lk-floating-highlight:hover:not([data-collapse-after-click="true"]),
      .lk-floating-highlight:focus-visible,
      .lk-floating-highlight[data-dragging="true"] {
        opacity: 0.98;
        transform: translate3d(0, 0, 0) !important;
      }

      .lk-floating-highlight:focus-visible {
        outline: 2px solid #3898ec;
        outline-offset: 3px;
      }

      .lk-floating-highlight:active {
        cursor: grabbing;
        scale: 1;
      }

      .lk-floating-highlight[data-highlight="on"] {
        --active: 1;
        --play-state: running;
      }

      .lk-floating-highlight[data-highlight="off"] {
        --active: 0;
      }

      .lk-floating-highlight[data-dock="left"] {
        opacity: 0.42;
        transform: translate3d(-58px, 0, 0);
      }

      .lk-floating-highlight[data-dock="right"] {
        opacity: 0.42;
        transform: translate3d(58px, 0, 0);
      }

      .lk-floating-highlight[data-dock="top"] {
        opacity: 0.42;
        transform: translate3d(0, -34px, 0);
      }

      .lk-floating-highlight[data-dock="bottom"] {
        opacity: 0.42;
        transform: translate3d(0, 34px, 0);
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
    `;
    return style;
  }

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const rect = buttonWrap.getBoundingClientRect();
    pointerState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      dock: currentPosition?.dock || buttonWrap.dataset.dock || 'none',
      moved: false
    };

    buttonWrap.dataset.dragging = 'true';
    delete buttonWrap.dataset.collapseAfterClick;
    buttonWrap.dataset.dock = 'none';
    buttonWrap.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = Math.abs(event.clientX - pointerState.startX);
    const deltaY = Math.abs(event.clientY - pointerState.startY);
    if (deltaX > 3 || deltaY > 3) {
      pointerState.moved = true;
    }

    const maxX = Math.max(0, window.innerWidth - BUTTON_WIDTH);
    const maxY = Math.max(0, window.innerHeight - BUTTON_HEIGHT);
    const x = Math.min(Math.max(event.clientX - pointerState.offsetX, 0), maxX);
    const y = Math.min(Math.max(event.clientY - pointerState.offsetY, 0), maxY);

    currentPosition = { x, y, dock: 'none' };
    buttonWrap.style.left = `${x}px`;
    buttonWrap.style.top = `${y}px`;
    event.preventDefault();
  }

  function handlePointerUp(event) {
    if (!pointerState || pointerState.pointerId !== event.pointerId) {
      return;
    }

    const wasMoved = pointerState.moved;
    const previousDock = pointerState.dock;
    pointerState = null;
    buttonWrap.dataset.dragging = 'false';

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
      buttonWrap.dataset.dock = dock;
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

  function createButton(savedPosition) {
    if (document.getElementById(ROOT_ID)) {
      return;
    }

    rootHost = document.createElement('div');
    rootHost.id = ROOT_ID;
    shadowRoot = rootHost.attachShadow({ mode: 'open' });

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

    shadowRoot.append(createStyles(), buttonWrap);
    document.documentElement.appendChild(rootHost);

    buttonWrap.addEventListener('pointerdown', handlePointerDown);
    buttonWrap.addEventListener('pointermove', handlePointerMove);
    buttonWrap.addEventListener('pointerup', handlePointerUp);
    buttonWrap.addEventListener('pointercancel', handlePointerUp);
    buttonWrap.addEventListener('pointerleave', handlePointerLeave);
    buttonWrap.addEventListener('keydown', handleKeyDown);

    initializeStars();
    applyPosition(getHostPosition(savedPosition));
    updateHighlightState(currentHighlightEnabled);
  }

  function destroyButton() {
    if (rootHost) {
      rootHost.remove();
    }
    rootHost = null;
    shadowRoot = null;
    buttonWrap = null;
    pointerState = null;
  }

  function initializeFloatingButton() {
    chrome.storage.local.get({
      [FLOATING_BUTTON_ENABLED_KEY]: false,
      [HIGHLIGHT_ENABLED_KEY]: true,
      [POSITION_KEY]: null
    }, (result) => {
      currentHighlightEnabled = result[HIGHLIGHT_ENABLED_KEY] !== false;

      if (result[FLOATING_BUTTON_ENABLED_KEY] === true) {
        createButton(result[POSITION_KEY]);
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes[HIGHLIGHT_ENABLED_KEY]) {
      updateHighlightState(changes[HIGHLIGHT_ENABLED_KEY].newValue !== false);
    }

    if (changes[FLOATING_BUTTON_ENABLED_KEY]) {
      if (changes[FLOATING_BUTTON_ENABLED_KEY].newValue === true) {
        chrome.storage.local.get({ [POSITION_KEY]: null }, (result) => {
          createButton(result[POSITION_KEY]);
        });
      } else {
        destroyButton();
      }
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
