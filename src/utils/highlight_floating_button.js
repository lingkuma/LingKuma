(function() {
  if (window.self !== window.top) {
    return;
  }

  const FLOATING_BUTTON_ENABLED_KEY = 'wordHighlightFloatingButtonEnabled';
  const HIGHLIGHT_ENABLED_KEY = 'enablePlugin';
  const POSITION_KEY = 'wordHighlightFloatingButtonPosition';
  const ROOT_ID = 'lingkuma-word-highlight-floating-root';
  const EDGE_THRESHOLD = 30;
  const BUTTON_WIDTH = 58;
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

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }

      .lk-floating-highlight {
        position: fixed;
        width: ${BUTTON_WIDTH}px;
        height: ${BUTTON_HEIGHT}px;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 14px;
        padding: 0;
        color: #4d4c48;
        background: rgba(250, 249, 245, 0.68);
        box-shadow:
          0 0 0 1px rgba(209, 207, 197, 0.88),
          0 12px 30px rgba(20, 20, 19, 0.12);
        backdrop-filter: blur(14px) saturate(1.08);
        -webkit-backdrop-filter: blur(14px) saturate(1.08);
        cursor: grab;
        opacity: 0.78;
        transform: translate3d(0, 0, 0);
        transition:
          opacity 180ms ease,
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          background-color 180ms ease,
          box-shadow 180ms ease,
          color 180ms ease;
        user-select: none;
        touch-action: none;
      }

      .lk-floating-highlight:hover,
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
      }

      .lk-floating-highlight[data-highlight="on"] {
        color: #faf9f5;
        background: rgba(201, 100, 66, 0.78);
        box-shadow:
          0 0 0 1px rgba(201, 100, 66, 0.92),
          0 12px 30px rgba(201, 100, 66, 0.22);
      }

      .lk-floating-highlight[data-highlight="off"] {
        color: #5e5d59;
        background: rgba(232, 230, 220, 0.58);
        box-shadow:
          0 0 0 1px rgba(194, 192, 182, 0.72),
          0 10px 26px rgba(20, 20, 19, 0.08);
      }

      .lk-floating-highlight[data-dock="left"] {
        opacity: 0.42;
        transform: translate3d(-36px, 0, 0);
      }

      .lk-floating-highlight[data-dock="right"] {
        opacity: 0.42;
        transform: translate3d(36px, 0, 0);
      }

      .lk-floating-highlight[data-dock="top"] {
        opacity: 0.42;
        transform: translate3d(0, -26px, 0);
      }

      .lk-floating-highlight[data-dock="bottom"] {
        opacity: 0.42;
        transform: translate3d(0, 26px, 0);
      }

      .lk-icon {
        position: relative;
        width: 38px;
        height: 28px;
        display: grid;
        place-items: center;
        font: 600 14px/1 Georgia, "Times New Roman", serif;
        letter-spacing: 0;
      }

      .lk-icon::before {
        content: "";
        position: absolute;
        inset: 2px 3px;
        border-radius: 10px;
        background: rgba(250, 249, 245, 0.2);
        box-shadow: inset 0 0 0 1px rgba(250, 249, 245, 0.2);
      }

      .lk-icon span {
        position: relative;
        transform: translateY(-1px);
      }

      .lk-status-dot {
        position: absolute;
        right: 6px;
        bottom: 5px;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #87867f;
        box-shadow: 0 0 0 2px rgba(250, 249, 245, 0.82);
      }

      .lk-floating-highlight[data-highlight="on"] .lk-status-dot {
        background: #f5f4ed;
      }

      .lk-floating-highlight[data-highlight="off"] .lk-status-dot {
        background: #b0aea5;
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
      moved: false
    };

    buttonWrap.dataset.dragging = 'true';
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
      toggleHighlight();
    }

    event.preventDefault();
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
      <span class="lk-icon" aria-hidden="true"><span>Aa</span></span>
      <span class="lk-status-dot" aria-hidden="true"></span>
    `;

    shadowRoot.append(createStyles(), buttonWrap);
    document.documentElement.appendChild(rootHost);

    buttonWrap.addEventListener('pointerdown', handlePointerDown);
    buttonWrap.addEventListener('pointermove', handlePointerMove);
    buttonWrap.addEventListener('pointerup', handlePointerUp);
    buttonWrap.addEventListener('pointercancel', handlePointerUp);
    buttonWrap.addEventListener('keydown', handleKeyDown);

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
