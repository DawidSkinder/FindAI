const stage = document.querySelector(".stage");
const canvasElement = document.querySelector("[data-infinite-canvas]");
const designWorldElement = document.querySelector("[data-design-world]");
const guessLayerElement = document.querySelector("[data-guess-layer]");
const guessSurfaceElement = document.querySelector("[data-guess-surface]");
const guessMarkerElement = document.querySelector("[data-guess-marker]");
const countdownTextElement = document.querySelector("[data-countdown-text]");
const postgameTextElement = document.querySelector("[data-postgame-text]");
const introHeadlineSymbol = document.querySelector(".intro-headline-symbol");
const startGameButton = document.querySelector("[data-enter-game]");
const toolButtons = Array.from(document.querySelectorAll("[data-tool-button]"));
const zoomToggleButton = document.querySelector("[data-zoom-toggle]");
const zoomMenu = document.querySelector("[data-zoom-menu]");
const zoomMenuButtons = Array.from(document.querySelectorAll("[data-zoom-action]"));
const resetViewButtons = Array.from(document.querySelectorAll("[data-reset-view]"));
const zoomReadout = document.querySelector("[data-zoom-readout]");
const shareLinks = Array.from(document.querySelectorAll("[data-share-target]"));
const infoPopover = document.querySelector(".info-popover");
const infoPill = document.querySelector(".info-pill");
const progressCycle = document.querySelector("[data-progress-cycle]");
const progressFill = document.querySelector("[data-progress-fill]");
const progressDurationMs = 45000;
const worldTransitionDurationMs = 960;
const worldFadeOutDurationMs = 1400;
const postgameMessageHoldDurationMs = 3000;
const postgameMessageFadeDurationMs = 360;
const canonicalShareUrl = "https://findai.dawidskinder.pl/";
const shareTitle = "Find AI in DESIGN";
const shareMessage = `I just played Find AI by @DawidSkinder.

https://findai.dawidskinder.pl/

Zoom in. Look closely. See what you discover.

#Design #AI #UXDesign #CreativeCoding`;
const gameCanvasPanBounds = {
  minimumVisibleRatio: 0.35,
  minimumVisiblePixels: 240,
};
const countdownSteps = ["3", "2", "1", "Start!"];
const countdownStepDurationMs = 1120;
const countdownFadeDurationMs = 320;
const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
const activeDesignWorldConfig = coarsePointerQuery.matches
  ? {
      manifestUrl: "generated/design-v2-smaller-pyramid/manifest-mobile.json",
      baseUrl: "generated/design-v2-smaller-pyramid",
      useOverview: false,
      tileLoading: "lazy",
      tileBuffer: 0,
      tileExtension: "webp",
      tileEvictionPolicy: "visible-only",
      maxRetainedTiles: 6,
      maxScale: 0.4,
    }
  : {
      manifestUrl: "generated/design-v2-smaller-pyramid/manifest.json",
      baseUrl: "generated/design-v2-smaller-pyramid",
      useOverview: true,
      overviewPath: "overview.webp",
      decodeBeforeAttach: true,
      tileLoading: "eager",
      tileBuffer: 1,
      interactiveTileBuffer: 0,
      tileExtension: "webp",
      tileEvictionPolicy: "lru",
      maxRetainedTiles: 48,
      keepCurrentLevelWhileInteracting: true,
      levelSwitchHysteresis: 0.35,
      settleDelayMs: 120,
      maxScale: 1,
    };
let infiniteCanvas = null;
let designWorld = null;
let isZoomMenuOpen = false;
let gameStartedAt = null;
let guessState = null;
let countdownTimers = [];
let countdownToken = 0;
let revealTimers = [];
let revealToken = 0;
let introSequenceFrameId = 0;
const mobileUiQuery = window.matchMedia("(max-width: 767px)");

function clearIntroSequence() {
  if (introSequenceFrameId) {
    window.cancelAnimationFrame(introSequenceFrameId);
    introSequenceFrameId = 0;
  }

  if (stage) {
    delete stage.dataset.introPhase;
  }
}

function startIntroSequence() {
  if (!stage) {
    return;
  }

  clearIntroSequence();

  introSequenceFrameId = window.requestAnimationFrame(() => {
    introSequenceFrameId = window.requestAnimationFrame(() => {
      introSequenceFrameId = 0;

      if (stage?.dataset.uiState !== "intro") {
        return;
      }

      stage.dataset.introPhase = "visible";
    });
  });
}

function getDefaultGameView(padding = 48) {
  if (!infiniteCanvas || !designWorld?.isReady()) {
    return null;
  }

  const worldSize = designWorld.getWorldSize();

  if (!worldSize) {
    return null;
  }

  return infiniteCanvas.getFitView(worldSize.width, worldSize.height, padding);
}

function getDefaultGridScale() {
  return getDefaultGameView()?.scale ?? 0.06;
}

function fitDesignWorld(padding = 48, { animate = false, duration = worldTransitionDurationMs } = {}) {
  const fitView = getDefaultGameView(padding);

  if (!infiniteCanvas || !fitView) {
    return Promise.resolve(false);
  }

  if (!animate) {
    infiniteCanvas.setView(fitView);
    return Promise.resolve(true);
  }

  return infiniteCanvas.animateViewTo(fitView, duration).then(() => true);
}

function setActiveToolButton(mode) {
  for (const button of toolButtons) {
    const isActive = button.dataset.toolButton === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function syncToolButtonsWithCanvasState(state) {
  if (!state) {
    return;
  }

  const activeMode = state.toolMode === "hand" || state.spacePressed ? "hand" : "cursor";
  setActiveToolButton(activeMode);
}

function updateZoomReadout(state) {
  if (!zoomReadout || !state) {
    return;
  }

  zoomReadout.textContent = `${Math.round(state.scale * 100)}%`;
}

function setZoomMenuOpen(nextOpen) {
  if (!zoomToggleButton || !zoomMenu) {
    return;
  }

  isZoomMenuOpen = nextOpen;
  zoomToggleButton.classList.toggle("is-active", nextOpen);
  zoomToggleButton.setAttribute("aria-expanded", String(nextOpen));
  zoomMenu.hidden = !nextOpen;
}

function closeZoomMenu() {
  setZoomMenuOpen(false);
}

function isMobileUi() {
  return mobileUiQuery.matches;
}

function setInfoPopoverOpen(nextOpen) {
  if (!infoPopover || !infoPill) {
    return;
  }

  if (nextOpen) {
    infoPopover.dataset.mobileOpen = "true";
  } else {
    delete infoPopover.dataset.mobileOpen;
  }

  infoPill.setAttribute("aria-expanded", String(nextOpen));
}

function closeInfoPopover() {
  setInfoPopoverOpen(false);
}

function buildShareHref(target) {
  const shareUrl = encodeURIComponent(canonicalShareUrl);

  if (target === "x") {
    return `https://x.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`;
  }

  if (target === "linkedin") {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`;
  }

  return "#";
}

function openSharePopup(url, name) {
  const popupWidth = 720;
  const popupHeight = 720;
  const popupLeft = Math.max(0, Math.round(window.screenX + (window.outerWidth - popupWidth) / 2));
  const popupTop = Math.max(0, Math.round(window.screenY + (window.outerHeight - popupHeight) / 2));
  const popupFeatures = [
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${popupLeft}`,
    `top=${popupTop}`,
    "toolbar=no",
    "location=yes",
    "status=no",
    "menubar=no",
    "scrollbars=yes",
    "resizable=yes",
  ].join(",");

  return window.open(url, name, popupFeatures);
}

function isMobileOrTabletShareContext() {
  return mobileUiQuery.matches || window.matchMedia("(pointer: coarse)").matches;
}

async function handleLinkedInShareClick(event) {
  const linkedinShareUrl = buildShareHref("linkedin");

  if (isMobileOrTabletShareContext() && typeof navigator.share === "function") {
    event.preventDefault();

    try {
      await navigator.share({
        title: shareTitle,
        text: shareTitle,
        url: canonicalShareUrl,
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  event.preventDefault();

  const popup = openSharePopup(linkedinShareUrl, "linkedin-share");

  if (popup) {
    popup.focus();
    return;
  }

  window.location.href = linkedinShareUrl;
}

function clearCountdownTimers() {
  for (const timerId of countdownTimers) {
    window.clearTimeout(timerId);
  }

  countdownTimers = [];
}

function clearRevealTimers() {
  for (const timerId of revealTimers) {
    window.clearTimeout(timerId);
  }

  revealTimers = [];
}

function resetCountdownOverlay() {
  clearCountdownTimers();
  countdownToken += 1;

  if (stage) {
    delete stage.dataset.countdownPhase;
  }

  if (countdownTextElement) {
    countdownTextElement.textContent = "";
  }
}

function resetPostgameOverlay() {
  if (stage) {
    delete stage.dataset.postgamePhase;
  }

  if (postgameTextElement) {
    postgameTextElement.textContent = "Time has passed. Curious what was wrong?";
  }
}

function startCountdown() {
  if (!stage) {
    return;
  }

  resetCountdownOverlay();
  const token = countdownToken;
  setUiState("countdown");

  countdownSteps.forEach((label, index) => {
    const startDelay = index * countdownStepDurationMs;

    countdownTimers.push(
      window.setTimeout(() => {
        if (countdownToken !== token || !stage || !countdownTextElement) {
          return;
        }

        countdownTextElement.textContent = label;
        stage.dataset.countdownPhase = "visible";
      }, startDelay),
    );

    if (index < countdownSteps.length - 1) {
      countdownTimers.push(
        window.setTimeout(() => {
          if (countdownToken !== token || !stage) {
            return;
          }

          stage.dataset.countdownPhase = "hidden";
        }, startDelay + countdownStepDurationMs - countdownFadeDurationMs),
      );
    }
  });

  countdownTimers.push(
    window.setTimeout(() => {
      if (countdownToken !== token || !stage) {
        return;
      }

      stage.dataset.countdownPhase = "hidden";
    }, countdownSteps.length * countdownStepDurationMs - countdownFadeDurationMs),
  );

  countdownTimers.push(
    window.setTimeout(() => {
      if (countdownToken !== token) {
        return;
      }

      resetCountdownOverlay();
      setUiState("game");
    }, countdownSteps.length * countdownStepDurationMs),
  );
}

function startRevealSequence() {
  clearRevealTimers();
  revealToken += 1;
  const token = revealToken;
  resetPostgameOverlay();
  setUiState("postgame");

  revealTimers.push(
    window.setTimeout(() => {
      if (revealToken !== token || !stage) {
        return;
      }

      stage.dataset.postgamePhase = "visible";
    }, worldFadeOutDurationMs),
  );

  revealTimers.push(
    window.setTimeout(() => {
      if (revealToken !== token || !stage) {
        return;
      }

      stage.dataset.postgamePhase = "hidden";
    }, worldFadeOutDurationMs + postgameMessageHoldDurationMs - postgameMessageFadeDurationMs),
  );

  revealTimers.push(
    window.setTimeout(() => {
      if (revealToken !== token) {
        return;
      }

      resetPostgameOverlay();
      setUiState("reveal");
    }, worldFadeOutDurationMs + postgameMessageHoldDurationMs),
  );
}

function clearGuess() {
  guessState = null;

  if (guessMarkerElement) {
    guessMarkerElement.hidden = true;
  }
}

function updateGuessView(viewState = infiniteCanvas?.getState()) {
  if (!guessMarkerElement) {
    return;
  }

  if (!viewState) {
    guessMarkerElement.hidden = true;
    return;
  }

  if (!guessState) {
    guessMarkerElement.hidden = true;
    return;
  }

  const { x: screenX, y: screenY } = infiniteCanvas.worldToScreen(guessState.worldX, guessState.worldY);

  guessMarkerElement.hidden = false;
  guessMarkerElement.style.left = `${screenX}px`;
  guessMarkerElement.style.top = `${screenY}px`;
}

function placeGuessAtScreenPosition(screenX, screenY) {
  if (!infiniteCanvas) {
    return;
  }

  const { x: worldX, y: worldY } = infiniteCanvas.screenToWorld(screenX, screenY);

  guessState = {
    worldX,
    worldY,
    placedAt: Date.now(),
  };

  updateGuessView();
}

function setUiState(nextState) {
  if (!stage) {
    return;
  }

  closeInfoPopover();

  if (nextState !== "intro") {
    clearIntroSequence();
  }

  if (nextState !== "countdown") {
    resetCountdownOverlay();
  }

  if (nextState !== "postgame" && nextState !== "reveal") {
    clearRevealTimers();
    revealToken += 1;
  }

  if (nextState !== "postgame") {
    resetPostgameOverlay();
  }

  stage.dataset.uiState = nextState;
  closeZoomMenu();

  if (!infiniteCanvas) {
    if (nextState === "intro") {
      startIntroSequence();
    }

    return;
  }

  infiniteCanvas.setCameraBoundsEnabled(nextState === "game");

  if (nextState === "game") {
    gameStartedAt = performance.now();
    setProgress(0);
    clearGuess();
    infiniteCanvas.setToolMode("cursor");
    infiniteCanvas.setGridVisible(true);
    infiniteCanvas.setAmbientGlowEnabled(false);
    infiniteCanvas.setInteractionEnabled(false);

    fitDesignWorld(48, { animate: true }).then((didFit) => {
      if (stage?.dataset.uiState !== "game") {
        return;
      }

      if (!didFit) {
        infiniteCanvas.resetView(getDefaultGridScale());
      }

      infiniteCanvas.setInteractionEnabled(true);
    });

    designWorld?.setUiState(nextState);
    return;
  }

  gameStartedAt = null;
  setProgress(0);
  infiniteCanvas.setToolMode("cursor");
  infiniteCanvas.setAmbientGlowEnabled(nextState === "intro");
  infiniteCanvas.setInteractionEnabled(false);

  if (nextState === "intro") {
    clearGuess();
  }

  updateGuessView();

  if (nextState === "postgame" || nextState === "reveal") {
    infiniteCanvas.setGridVisible(true);
    designWorld?.setUiState(nextState);
    return;
  } else if (nextState === "countdown") {
    infiniteCanvas.setGridVisible(true);
    infiniteCanvas.resetView(getDefaultGridScale());
  } else {
    infiniteCanvas.setGridVisible(true);
    infiniteCanvas.resetView(getDefaultGridScale());
  }

  designWorld?.setUiState(nextState);

  if (nextState === "intro") {
    startIntroSequence();
  }
}

if (canvasElement && window.InfiniteCanvasBackground) {
  infiniteCanvas = new window.InfiniteCanvasBackground(canvasElement, {
    interactionEnabled: false,
    minScale: 0.05,
    maxScale: activeDesignWorldConfig.maxScale,
    ambientGlowTargetProvider: () => {
      if (!introHeadlineSymbol || !canvasElement) {
        return null;
      }

      const symbolBounds = introHeadlineSymbol.getBoundingClientRect();
      const canvasBounds = canvasElement.getBoundingClientRect();

      return {
        x: symbolBounds.left - canvasBounds.left + symbolBounds.width / 2,
        y: symbolBounds.top - canvasBounds.top + symbolBounds.height / 2,
      };
    },
    onStateChange: (state) => {
      updateZoomReadout(state);
      syncToolButtonsWithCanvasState(state);
      designWorld?.setView(state);
      updateGuessView(state);
    },
  });
  infiniteCanvas.mount();
  window.__noAiInDesign = {
    infiniteCanvas,
    designWorld: null,
    setUiState,
    getUiState: () => stage?.dataset.uiState ?? null,
    getGuessState: () => (guessState ? { ...guessState } : null),
  };

  setUiState("intro");
}

if (designWorldElement && window.DesignWorldLayer) {
  designWorld = new window.DesignWorldLayer(designWorldElement, {
    manifestUrl: activeDesignWorldConfig.manifestUrl,
    baseUrl: activeDesignWorldConfig.baseUrl,
    useOverview: activeDesignWorldConfig.useOverview,
    overviewPath: activeDesignWorldConfig.overviewPath,
    decodeBeforeAttach: activeDesignWorldConfig.decodeBeforeAttach,
    tileLoading: activeDesignWorldConfig.tileLoading,
    tileBuffer: activeDesignWorldConfig.tileBuffer,
    interactiveTileBuffer: activeDesignWorldConfig.interactiveTileBuffer,
    tileExtension: activeDesignWorldConfig.tileExtension,
    tileEvictionPolicy: activeDesignWorldConfig.tileEvictionPolicy,
    maxRetainedTiles: activeDesignWorldConfig.maxRetainedTiles,
    keepCurrentLevelWhileInteracting: activeDesignWorldConfig.keepCurrentLevelWhileInteracting,
    levelSwitchHysteresis: activeDesignWorldConfig.levelSwitchHysteresis,
    settleDelayMs: activeDesignWorldConfig.settleDelayMs,
    onReady: (worldSize) => {
      if (worldSize) {
        infiniteCanvas?.setCameraBounds({
          width: worldSize.width,
          height: worldSize.height,
          ...gameCanvasPanBounds,
        });
      }

      if (stage?.dataset.uiState === "game") {
        fitDesignWorld(48);
      } else if (stage?.dataset.uiState === "intro" || stage?.dataset.uiState === "countdown") {
        infiniteCanvas?.resetView(getDefaultGridScale());
      }

      if (infiniteCanvas) {
        designWorld.setView(infiniteCanvas.getState());
        updateGuessView(infiniteCanvas.getState());
      }
    },
  });

  designWorld.mount();
  designWorld.setUiState(stage?.dataset.uiState ?? "intro");

  if (window.__noAiInDesign) {
    window.__noAiInDesign.designWorld = designWorld;
  }
}

if (startGameButton) {
  startGameButton.addEventListener("click", () => {
    startCountdown();
  });
}

if (canvasElement) {
  canvasElement.addEventListener("click", (event) => {
    if (!infiniteCanvas || stage?.dataset.uiState !== "game") {
      return;
    }

    if (infiniteCanvas.shouldSuppressCanvasClick()) {
      return;
    }

    const bounds = canvasElement.getBoundingClientRect();
    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;

    placeGuessAtScreenPosition(screenX, screenY);
  });
}

for (const toolButton of toolButtons) {
  toolButton.addEventListener("click", () => {
    if (!infiniteCanvas) {
      return;
    }

    const mode = toolButton.dataset.toolButton;

    if (mode !== "cursor" && mode !== "hand") {
      return;
    }

    infiniteCanvas.setToolMode(mode);
  });
}

if (zoomToggleButton) {
  zoomToggleButton.addEventListener("click", () => {
    setZoomMenuOpen(!isZoomMenuOpen);
  });
}

for (const shareLink of shareLinks) {
  shareLink.href = buildShareHref(shareLink.dataset.shareTarget);

  if (shareLink.dataset.shareTarget === "linkedin") {
    shareLink.addEventListener("click", handleLinkedInShareClick);
  }
}

if (infoPill) {
  infoPill.addEventListener("click", (event) => {
    if (!isMobileUi()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setInfoPopoverOpen(infoPopover?.dataset.mobileOpen !== "true");
  });
}

for (const resetViewButton of resetViewButtons) {
  resetViewButton.addEventListener("click", () => {
    setUiState("intro");
  });
}

for (const zoomMenuButton of zoomMenuButtons) {
  zoomMenuButton.addEventListener("click", () => {
    if (!infiniteCanvas) {
      return;
    }

    const { scale } = infiniteCanvas.getState();
    const action = zoomMenuButton.dataset.zoomAction;

    if (action === "in") {
      infiniteCanvas.setScale(scale * 1.25);
    } else if (action === "out") {
      infiniteCanvas.setScale(scale / 1.25);
    } else if (action === "100") {
      infiniteCanvas.setScale(1);
    } else if (action === "fit") {
      fitDesignWorld(48, { animate: true }).then((didFit) => {
        if (!didFit) {
          infiniteCanvas.resetView(getDefaultGridScale());
        }
      });
    }

    closeZoomMenu();
  });
}

document.addEventListener("click", (event) => {
  if (!isZoomMenuOpen || !zoomToggleButton || !zoomMenu) {
    // keep flowing so mobile info popover can still close on outside tap
  } else {
    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    if (!zoomToggleButton.contains(target) && !zoomMenu.contains(target)) {
      closeZoomMenu();
    }
  }

  if (!isMobileUi() || infoPopover?.dataset.mobileOpen !== "true") {
    return;
  }

  const target = event.target;

  if (!(target instanceof Node)) {
    return;
  }

  if (infoPopover.contains(target)) {
    return;
  }

  closeInfoPopover();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeZoomMenu();
    closeInfoPopover();
  }

  if (!infiniteCanvas || stage?.dataset.uiState !== "game") {
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === "=") {
    event.preventDefault();
    infiniteCanvas.setScale(infiniteCanvas.getState().scale * 1.25);
    closeZoomMenu();
  } else if ((event.metaKey || event.ctrlKey) && event.key === "-") {
    event.preventDefault();
    infiniteCanvas.setScale(infiniteCanvas.getState().scale / 1.25);
    closeZoomMenu();
  } else if (event.shiftKey && event.key === "0") {
    event.preventDefault();
    infiniteCanvas.setScale(1);
    closeZoomMenu();
  } else if (event.shiftKey && event.key === "1") {
    event.preventDefault();
    fitDesignWorld(48, { animate: true }).then((didFit) => {
      if (!didFit) {
        infiniteCanvas.resetView(getDefaultGridScale());
      }
    });
    closeZoomMenu();
  } else if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "r") {
    event.preventDefault();
    fitDesignWorld(48, { animate: true }).then((didFit) => {
      if (!didFit) {
        infiniteCanvas.resetView(getDefaultGridScale());
      }
    });
    closeZoomMenu();
  }
});

function getProgressPath(progress) {
  const center = 16;
  const radius = 10;

  if (progress >= 0.999) {
    return `M ${center} ${center} m ${-radius} 0 a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
  }

  const startX = center;
  const startY = center - radius;
  const angle = -Math.PI / 2 + progress * Math.PI * 2;
  const endX = center + radius * Math.cos(angle);
  const endY = center + radius * Math.sin(angle);
  const largeArcFlag = progress > 0.5 ? 1 : 0;

  return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
}

function setProgress(progress) {
  if (!progressCycle || !progressFill) {
    return;
  }

  progressFill.setAttribute("d", getProgressPath(progress));
  progressCycle.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
}

if (progressCycle && progressFill) {
  const tick = (now) => {
    if (stage?.dataset.uiState === "game" && gameStartedAt !== null) {
      const elapsed = Math.min(now - gameStartedAt, progressDurationMs);
      setProgress(elapsed / progressDurationMs);

      if (elapsed >= progressDurationMs) {
        startRevealSequence();
      }
    }

    window.requestAnimationFrame(tick);
  };

  setProgress(0);
  window.requestAnimationFrame(tick);
}

if (mobileUiQuery) {
  mobileUiQuery.addEventListener("change", (event) => {
    if (!event.matches) {
      closeInfoPopover();
    }
  });
}
