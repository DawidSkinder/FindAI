(function () {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function positiveMod(value, modulus) {
    return ((value % modulus) + modulus) % modulus;
  }

  function isEditableElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    return Boolean(
      element.closest(
        'input, textarea, select, button, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
      ),
    );
  }

  class InfiniteCanvasBackground {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.stage = canvas.closest(".stage");
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.onStateChange = options.onStateChange ?? null;

      this.backgroundColor = options.backgroundColor ?? "#1c1d20";
      this.baseSpacing = options.baseSpacing ?? 16;
      this.baseDotColor = options.baseDotColor ?? "#656565";
      this.hoverDotColor = options.hoverDotColor ?? "#f5f5f5";
      this.hoverRadius = options.hoverRadius ?? 104;
      this.hoverSigma = options.hoverSigma ?? 40;
      this.ambientGlowEnabled = options.ambientGlowEnabled ?? false;
      this.ambientGlowColor = options.ambientGlowColor ?? "#f5f5f5";
      this.ambientGlowRadius = options.ambientGlowRadius ?? 152;
      this.ambientGlowSigma = options.ambientGlowSigma ?? 62;
      this.ambientGlowMinAlpha = options.ambientGlowMinAlpha ?? 0.025;
      this.ambientGlowMaxAlpha = options.ambientGlowMaxAlpha ?? 0.42;
      this.ambientGlowTargetProvider = options.ambientGlowTargetProvider ?? null;
      this.minScale = options.minScale ?? 0.05;
      this.maxScale = options.maxScale ?? 3;
      this.initialScale = options.initialScale ?? 0.5;
      this.zoomIntensity = options.zoomIntensity ?? 0.002;
      this.minDotRadius = options.minDotRadius ?? 0.2;
      this.maxDotRadius = options.maxDotRadius ?? 1.5;
      this.hoverMinAlpha = options.hoverMinAlpha ?? 0.03;
      this.toolMode = options.toolMode ?? "cursor";
      this.interactionEnabled = options.interactionEnabled ?? true;
      this.gridVisible = options.gridVisible ?? true;
      this.cameraBounds = null;
      this.cameraBoundsEnabled = false;

      this.cssWidth = 0;
      this.cssHeight = 0;
      this.dpr = window.devicePixelRatio || 1;

      this.offsetX = 0;
      this.offsetY = 0;
      this.scale = this.initialScale;

      this.pointerX = 0;
      this.pointerY = 0;
      this.pointerInside = false;
      this.spacePressed = false;
      this.isPanning = false;
      this.dragPointerId = null;
      this.touchPointers = new Map();
      this.touchPinchState = null;
      this.lastPointerX = 0;
      this.lastPointerY = 0;
      this.panTravel = 0;
      this.suppressClickUntil = 0;
      this.hasInitialTransform = false;
      this.rafId = 0;
      this.viewAnimationFrame = 0;
      this.mounted = false;

      this.handleResize = this.handleResize.bind(this);
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.handleKeyUp = this.handleKeyUp.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerLeave = this.handlePointerLeave.bind(this);
      this.handleWheel = this.handleWheel.bind(this);
      this.handleWindowBlur = this.handleWindowBlur.bind(this);
    }

    mount() {
      if (this.mounted || !this.ctx || !this.stage) {
        return;
      }

      this.mounted = true;

      window.addEventListener("resize", this.handleResize);
      window.addEventListener("keydown", this.handleKeyDown);
      window.addEventListener("keyup", this.handleKeyUp);
      window.addEventListener("blur", this.handleWindowBlur);

      this.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.canvas.addEventListener("pointermove", this.handlePointerMove);
      this.canvas.addEventListener("pointerup", this.handlePointerUp);
      this.canvas.addEventListener("pointercancel", this.handlePointerUp);
      this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
      this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });

      this.handleResize();
    }

    notifyStateChange() {
      if (typeof this.onStateChange === "function") {
        this.onStateChange(this.getState());
      }
    }

    destroy() {
      if (!this.mounted) {
        return;
      }

      this.mounted = false;

      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("keydown", this.handleKeyDown);
      window.removeEventListener("keyup", this.handleKeyUp);
      window.removeEventListener("blur", this.handleWindowBlur);

      this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.canvas.removeEventListener("pointermove", this.handlePointerMove);
      this.canvas.removeEventListener("pointerup", this.handlePointerUp);
      this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
      this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
      this.canvas.removeEventListener("wheel", this.handleWheel);

      if (this.rafId) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }

      if (this.viewAnimationFrame) {
        window.cancelAnimationFrame(this.viewAnimationFrame);
        this.viewAnimationFrame = 0;
      }

      document.body.classList.remove("is-canvas-panning");
      this.stage.classList.remove("is-hand-mode", "is-panning");
    }

    handleResize() {
      const bounds = this.canvas.getBoundingClientRect();
      const nextWidth = Math.round(bounds.width);
      const nextHeight = Math.round(bounds.height);
      const nextDpr = window.devicePixelRatio || 1;

      if (!nextWidth || !nextHeight) {
        return;
      }

      this.cssWidth = nextWidth;
      this.cssHeight = nextHeight;
      this.dpr = nextDpr;

      this.canvas.width = Math.round(nextWidth * nextDpr);
      this.canvas.height = Math.round(nextHeight * nextDpr);

      if (!this.hasInitialTransform) {
        this.offsetX = nextWidth / 2;
        this.offsetY = nextHeight / 2;
        this.hasInitialTransform = true;
      }

      this.notifyStateChange();
      this.scheduleRender();
    }

    handleKeyDown(event) {
      if (!this.interactionEnabled || event.code !== "Space" || event.repeat || !this.canActivateHandTool(event.target)) {
        return;
      }

      this.spacePressed = true;
      this.syncStageState();
      event.preventDefault();
      this.scheduleRender();
    }

    handleKeyUp(event) {
      if (event.code !== "Space" || !this.spacePressed) {
        return;
      }

      this.spacePressed = false;
      this.stopPanning();
      this.syncStageState();
      event.preventDefault();
      this.scheduleRender();
    }

    handlePointerDown(event) {
      if (this.isTouchPointerEvent(event)) {
        this.handleTouchPointerDown(event);
        return;
      }

      if (event.button !== 0 || !this.interactionEnabled || !this.isHandModeEnabled()) {
        return;
      }

      const pointer = this.getPointerPosition(event);

      this.pointerInside = true;
      this.pointerX = pointer.x;
      this.pointerY = pointer.y;
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.panTravel = 0;
      this.dragPointerId = event.pointerId;
      this.isPanning = true;

      document.body.classList.add("is-canvas-panning");
      this.syncStageState();
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      this.scheduleRender();
    }

    handlePointerMove(event) {
      if (this.isTouchPointerEvent(event)) {
        this.handleTouchPointerMove(event);
        return;
      }

      const pointer = this.getPointerPosition(event);
      const isWithinBounds = this.isWithinCanvas(pointer.x, pointer.y);

      if (this.isPanning && this.dragPointerId === event.pointerId) {
        const deltaX = pointer.x - this.lastPointerX;
        const deltaY = pointer.y - this.lastPointerY;

        this.offsetX += deltaX;
        this.offsetY += deltaY;
        this.clampViewToBounds();
        this.panTravel += Math.hypot(deltaX, deltaY);
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
        this.pointerX = pointer.x;
        this.pointerY = pointer.y;
        this.pointerInside = true;
        event.preventDefault();
        this.scheduleRender();
        return;
      }

      if (!isWithinBounds) {
        return;
      }

      this.pointerInside = true;
      this.pointerX = pointer.x;
      this.pointerY = pointer.y;
      this.scheduleRender();
    }

    handlePointerUp(event) {
      if (this.isTouchPointerEvent(event)) {
        this.handleTouchPointerUp(event);
        return;
      }

      if (this.dragPointerId !== event.pointerId) {
        return;
      }

      if (this.panTravel > 4) {
        this.suppressClickUntil = performance.now() + 160;
      }

      this.stopPanning();

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      this.pointerInside = this.isWithinCanvas(this.pointerX, this.pointerY);
      this.scheduleRender();
    }

    handlePointerLeave(event) {
      if (this.isTouchPointerEvent(event)) {
        return;
      }

      if (this.isPanning) {
        return;
      }

      if (!this.pointerInside) {
        return;
      }

      this.pointerInside = false;
      this.scheduleRender();
    }

    handleWheel(event) {
      if (!this.interactionEnabled || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      const pointer = this.getPointerPosition(event);
      const nextScale = clamp(this.scale * Math.exp(-event.deltaY * this.zoomIntensity), this.minScale, this.maxScale);

      if (nextScale === this.scale) {
        event.preventDefault();
        return;
      }

      // Keep the world point under the cursor visually locked while zoom changes.
      const worldX = (pointer.x - this.offsetX) / this.scale;
      const worldY = (pointer.y - this.offsetY) / this.scale;

      this.scale = nextScale;
      this.offsetX = pointer.x - worldX * nextScale;
      this.offsetY = pointer.y - worldY * nextScale;
      this.pointerX = pointer.x;
      this.pointerY = pointer.y;
      this.pointerInside = this.isWithinCanvas(pointer.x, pointer.y);

      event.preventDefault();
      this.notifyStateChange();
      this.scheduleRender();
    }

    handleWindowBlur() {
      this.spacePressed = false;
      this.pointerInside = false;
      this.touchPointers.clear();
      this.touchPinchState = null;
      this.stopPanning();
      this.syncStageState();
      this.scheduleRender();
    }

    isTouchPointerEvent(event) {
      return event.pointerType === "touch";
    }

    handleTouchPointerDown(event) {
      if (!this.interactionEnabled) {
        return;
      }

      const pointer = this.getPointerPosition(event);

      this.cancelViewAnimation();
      this.touchPointers.set(event.pointerId, pointer);
      this.pointerInside = true;
      this.pointerX = pointer.x;
      this.pointerY = pointer.y;

      if (this.touchPointers.size === 1) {
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
        this.panTravel = 0;
        this.isPanning = true;
      } else {
        this.panTravel = Math.max(this.panTravel, 5);
        this.startTouchPinchGesture();
      }

      this.canvas.setPointerCapture(event.pointerId);
      document.body.classList.add("is-canvas-panning");
      this.syncStageState();
      this.notifyStateChange();
      this.scheduleRender();
    }

    handleTouchPointerMove(event) {
      if (!this.touchPointers.has(event.pointerId)) {
        return;
      }

      const pointer = this.getPointerPosition(event);

      this.touchPointers.set(event.pointerId, pointer);

      if (this.touchPointers.size >= 2) {
        this.updateTouchPinchGesture();
        return;
      }

      const deltaX = pointer.x - this.lastPointerX;
      const deltaY = pointer.y - this.lastPointerY;

      this.offsetX += deltaX;
      this.offsetY += deltaY;
      this.clampViewToBounds();
      this.panTravel += Math.hypot(deltaX, deltaY);
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.pointerX = pointer.x;
      this.pointerY = pointer.y;
      this.pointerInside = true;
      this.scheduleRender();
    }

    handleTouchPointerUp(event) {
      if (!this.touchPointers.has(event.pointerId)) {
        return;
      }

      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      const hadPinchGesture = this.touchPointers.size >= 2 || Boolean(this.touchPinchState);

      this.touchPointers.delete(event.pointerId);

      if (this.touchPointers.size >= 2) {
        this.startTouchPinchGesture();
      } else if (this.touchPointers.size === 1) {
        const [remainingPointer] = this.touchPointers.values();

        this.touchPinchState = null;
        this.lastPointerX = remainingPointer.x;
        this.lastPointerY = remainingPointer.y;
        this.pointerX = remainingPointer.x;
        this.pointerY = remainingPointer.y;
        this.pointerInside = true;
        this.isPanning = true;
      } else {
        this.touchPinchState = null;

        if (hadPinchGesture) {
          this.panTravel = Math.max(this.panTravel, 5);
        }

        if (this.panTravel > 4) {
          this.suppressClickUntil = performance.now() + 160;
        }

        this.pointerInside = false;
        this.stopPanning();
      }

      this.notifyStateChange();
      this.scheduleRender();
    }

    startTouchPinchGesture() {
      const touchPoints = this.getPrimaryTouchPoints();

      if (touchPoints.length < 2) {
        this.touchPinchState = null;
        return;
      }

      const midpoint = this.getTouchMidpoint(touchPoints[0], touchPoints[1]);
      const distance = this.getTouchDistance(touchPoints[0], touchPoints[1]);

      this.touchPinchState = {
        anchorWorldX: (midpoint.x - this.offsetX) / this.scale,
        anchorWorldY: (midpoint.y - this.offsetY) / this.scale,
        distance: Math.max(distance, 1),
        scale: this.scale,
      };

      this.isPanning = true;
      this.pointerInside = true;
      this.pointerX = midpoint.x;
      this.pointerY = midpoint.y;
      this.syncStageState();
    }

    updateTouchPinchGesture() {
      const touchPoints = this.getPrimaryTouchPoints();

      if (touchPoints.length < 2 || !this.touchPinchState) {
        return;
      }

      const midpoint = this.getTouchMidpoint(touchPoints[0], touchPoints[1]);
      const distance = Math.max(this.getTouchDistance(touchPoints[0], touchPoints[1]), 1);
      const nextScale = clamp((this.touchPinchState.scale * distance) / this.touchPinchState.distance, this.minScale, this.maxScale);

      this.scale = nextScale;
      this.offsetX = midpoint.x - this.touchPinchState.anchorWorldX * nextScale;
      this.offsetY = midpoint.y - this.touchPinchState.anchorWorldY * nextScale;
      this.clampViewToBounds();
      this.pointerX = midpoint.x;
      this.pointerY = midpoint.y;
      this.pointerInside = true;
      this.panTravel = Math.max(this.panTravel, 5);
      this.notifyStateChange();
      this.scheduleRender();
    }

    getPrimaryTouchPoints() {
      return Array.from(this.touchPointers.values()).slice(0, 2);
    }

    getTouchMidpoint(firstPoint, secondPoint) {
      return {
        x: (firstPoint.x + secondPoint.x) / 2,
        y: (firstPoint.y + secondPoint.y) / 2,
      };
    }

    getTouchDistance(firstPoint, secondPoint) {
      return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y);
    }

    canActivateHandTool(target) {
      if (isEditableElement(target)) {
        return false;
      }

      if (isEditableElement(document.activeElement)) {
        return false;
      }

      return true;
    }

    isHandModeEnabled() {
      return this.toolMode === "hand" || this.spacePressed;
    }

    stopPanning() {
      this.isPanning = false;
      this.dragPointerId = null;
      document.body.classList.remove("is-canvas-panning");
      this.syncStageState();
      this.notifyStateChange();
    }

    syncStageState() {
      this.stage.classList.toggle("is-hand-mode", this.interactionEnabled && this.isHandModeEnabled() && !this.isPanning);
      this.stage.classList.toggle("is-panning", this.isPanning);
    }

    getPointerPosition(event) {
      const bounds = this.canvas.getBoundingClientRect();

      return {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
    }

    isWithinCanvas(x, y) {
      return x >= 0 && y >= 0 && x <= this.cssWidth && y <= this.cssHeight;
    }

    scheduleRender() {
      if (this.rafId) {
        return;
      }

      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = 0;
        this.render();
      });
    }

    getState() {
      return {
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        scale: this.scale,
        pointerInside: this.pointerInside,
        spacePressed: this.spacePressed,
        isPanning: this.isPanning,
        toolMode: this.toolMode,
        interactionEnabled: this.interactionEnabled,
        gridVisible: this.gridVisible,
        suppressClickUntil: this.suppressClickUntil,
        viewportWidth: this.cssWidth,
        viewportHeight: this.cssHeight,
      };
    }

    shouldSuppressCanvasClick() {
      return (
        !this.interactionEnabled ||
        this.toolMode === "hand" ||
        this.spacePressed ||
        this.isPanning ||
        performance.now() < this.suppressClickUntil
      );
    }

    screenToWorld(screenX, screenY) {
      return {
        x: (screenX - this.offsetX) / this.scale,
        y: (screenY - this.offsetY) / this.scale,
      };
    }

    worldToScreen(worldX, worldY) {
      return {
        x: this.offsetX + worldX * this.scale,
        y: this.offsetY + worldY * this.scale,
      };
    }

    setInteractionEnabled(enabled) {
      this.interactionEnabled = Boolean(enabled);

      if (!this.interactionEnabled) {
        this.spacePressed = false;
        this.stopPanning();
      }

      this.syncStageState();
      this.notifyStateChange();
      this.scheduleRender();
    }

    setToolMode(mode) {
      if (mode !== "cursor" && mode !== "hand") {
        return;
      }

      this.toolMode = mode;

      if (mode === "hand") {
        this.spacePressed = false;
      }

      this.syncStageState();
      this.notifyStateChange();
      this.scheduleRender();
    }

    setGridVisible(visible) {
      this.gridVisible = Boolean(visible);
      this.notifyStateChange();
      this.scheduleRender();
    }

    setAmbientGlowEnabled(enabled) {
      this.ambientGlowEnabled = Boolean(enabled);
      this.notifyStateChange();
      this.scheduleRender();
    }

    setCameraBounds(bounds) {
      if (!bounds || !bounds.width || !bounds.height) {
        this.cameraBounds = null;
        this.cameraBoundsEnabled = false;
        this.notifyStateChange();
        this.scheduleRender();
        return;
      }

      this.cameraBounds = {
        width: bounds.width,
        height: bounds.height,
        minimumVisibleRatio: bounds.minimumVisibleRatio ?? 0.35,
        minimumVisiblePixels: bounds.minimumVisiblePixels ?? 240,
      };

      this.notifyStateChange();
      this.scheduleRender();
    }

    setCameraBoundsEnabled(enabled) {
      this.cameraBoundsEnabled = Boolean(enabled) && Boolean(this.cameraBounds);

      this.notifyStateChange();
      this.scheduleRender();
    }

    getOffsetRangeForAxis(worldSize, viewportSize) {
      if (!this.cameraBounds) {
        return null;
      }

      const worldScreenSize = worldSize * this.scale;
      const minimumVisible = Math.min(
        worldScreenSize,
        Math.max(
          this.cameraBounds.minimumVisiblePixels,
          Math.min(viewportSize, viewportSize * this.cameraBounds.minimumVisibleRatio),
        ),
      );
      const min = minimumVisible - worldScreenSize;
      const max = viewportSize - minimumVisible;

      return {
        min: Math.min(min, max),
        max: Math.max(min, max),
      };
    }

    clampViewToBounds() {
      if (!this.cameraBoundsEnabled || !this.cameraBounds || !this.cssWidth || !this.cssHeight) {
        return;
      }

      const rangeX = this.getOffsetRangeForAxis(this.cameraBounds.width, this.cssWidth);
      const rangeY = this.getOffsetRangeForAxis(this.cameraBounds.height, this.cssHeight);

      if (rangeX) {
        this.offsetX = clamp(this.offsetX, rangeX.min, rangeX.max);
      }

      if (rangeY) {
        this.offsetY = clamp(this.offsetY, rangeY.min, rangeY.max);
      }
    }

    setView({ scale = this.scale, offsetX = this.offsetX, offsetY = this.offsetY } = {}) {
      this.cancelViewAnimation();
      const clampedScale = clamp(scale, this.minScale, this.maxScale);

      this.scale = clampedScale;
      this.offsetX = offsetX;
      this.offsetY = offsetY;
      this.notifyStateChange();
      this.scheduleRender();
    }

    cancelViewAnimation() {
      if (!this.viewAnimationFrame) {
        return;
      }

      window.cancelAnimationFrame(this.viewAnimationFrame);
      this.viewAnimationFrame = 0;
    }

    getFitView(width, height, padding = 0) {
      if (!this.cssWidth || !this.cssHeight || !width || !height) {
        return null;
      }

      const availableWidth = Math.max(1, this.cssWidth - padding * 2);
      const availableHeight = Math.max(1, this.cssHeight - padding * 2);
      const scale = clamp(Math.min(availableWidth / width, availableHeight / height), this.minScale, this.maxScale);
      const offsetX = (this.cssWidth - width * scale) / 2;
      const offsetY = (this.cssHeight - height * scale) / 2;

      return { scale, offsetX, offsetY };
    }

    animateViewTo(targetView, duration = 800) {
      if (!targetView) {
        return Promise.resolve();
      }

      this.cancelViewAnimation();

      if (duration <= 0) {
        this.setView(targetView);
        return Promise.resolve();
      }

      const startScale = this.scale;
      const startOffsetX = this.offsetX;
      const startOffsetY = this.offsetY;
      const startTime = performance.now();

      return new Promise((resolve) => {
        const step = (now) => {
          const elapsed = now - startTime;
          const progress = clamp(elapsed / duration, 0, 1);
          const eased = 1 - Math.pow(1 - progress, 3);

          this.scale = startScale + (targetView.scale - startScale) * eased;
          this.offsetX = startOffsetX + (targetView.offsetX - startOffsetX) * eased;
          this.offsetY = startOffsetY + (targetView.offsetY - startOffsetY) * eased;
          this.notifyStateChange();
          this.scheduleRender();

          if (progress >= 1) {
            this.viewAnimationFrame = 0;
            resolve();
            return;
          }

          this.viewAnimationFrame = window.requestAnimationFrame(step);
        };

        this.viewAnimationFrame = window.requestAnimationFrame(step);
      });
    }

    setScale(nextScale, anchorX = this.cssWidth / 2, anchorY = this.cssHeight / 2) {
      this.cancelViewAnimation();
      const clampedScale = clamp(nextScale, this.minScale, this.maxScale);

      if (!this.cssWidth || !this.cssHeight || clampedScale === this.scale) {
        return;
      }

      const worldX = (anchorX - this.offsetX) / this.scale;
      const worldY = (anchorY - this.offsetY) / this.scale;

      this.scale = clampedScale;
      this.offsetX = anchorX - worldX * clampedScale;
      this.offsetY = anchorY - worldY * clampedScale;
      this.notifyStateChange();
      this.scheduleRender();
    }

    fitToBounds(width, height, padding = 0) {
      const fitView = this.getFitView(width, height, padding);

      if (!fitView) {
        return;
      }

      this.setView(fitView);
    }

    resetView(scale = this.initialScale) {
      if (!this.cssWidth || !this.cssHeight) {
        return;
      }

      this.cancelViewAnimation();
      this.scale = clamp(scale, this.minScale, this.maxScale);
      this.offsetX = this.cssWidth / 2;
      this.offsetY = this.cssHeight / 2;
      this.notifyStateChange();
      this.scheduleRender();
    }

    render() {
      const { ctx } = this;

      if (!ctx || !this.cssWidth || !this.cssHeight) {
        return;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;

      ctx.fillStyle = this.backgroundColor;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

      if (this.gridVisible) {
        this.renderGrid(ctx);
      }

      this.notifyStateChange();

      if (this.ambientGlowEnabled && this.gridVisible) {
        this.scheduleRender();
      }
    }

    getGridMetrics() {
      const stride = this.getZoomBandStride();
      const spacing = this.baseSpacing * this.scale * stride;
      const dotRadius = clamp(spacing / 16, this.minDotRadius, this.maxDotRadius);
      const phaseX = positiveMod(this.offsetX, spacing);
      const phaseY = positiveMod(this.offsetY, spacing);
      const padding = dotRadius + 2;
      const startColumn = Math.floor((-phaseX - padding) / spacing);
      const endColumn = Math.ceil((this.cssWidth - phaseX + padding) / spacing);
      const startRow = Math.floor((-phaseY - padding) / spacing);
      const endRow = Math.ceil((this.cssHeight - phaseY + padding) / spacing);

      return {
        stride,
        spacing,
        dotRadius,
        dotSize: dotRadius * 2,
        phaseX,
        phaseY,
        startColumn,
        endColumn,
        startRow,
        endRow,
      };
    }

    getZoomBandStride() {
      if (this.scale <= 0.1) {
        return 10;
      }

      if (this.scale <= 0.3) {
        return 4;
      }

      return 1;
    }

    renderGrid(ctx) {
      const metrics = this.getGridMetrics();
      const hasHover = this.pointerInside;
      const radiusSquared = this.hoverRadius * this.hoverRadius;
      const sigmaSquared = 2 * this.hoverSigma * this.hoverSigma;
      const ambientGlow = this.getAmbientGlowState();
      const ambientRadiusSquared = ambientGlow.radius * ambientGlow.radius;
      const ambientSigmaSquared = 2 * ambientGlow.sigma * ambientGlow.sigma;
      const dotSize = metrics.dotSize;
      const dotOffset = dotSize / 2;

      ctx.fillStyle = this.baseDotColor;

      for (let row = metrics.startRow; row <= metrics.endRow; row += 1) {
        const y = metrics.phaseY + row * metrics.spacing;
        const dy = y - this.pointerY;
        const dySquared = dy * dy;
        const ambientDy = y - ambientGlow.y;
        const ambientDySquared = ambientDy * ambientDy;

        for (let column = metrics.startColumn; column <= metrics.endColumn; column += 1) {
          const x = metrics.phaseX + column * metrics.spacing;

          ctx.globalAlpha = 1;
          ctx.fillRect(x - dotOffset, y - dotOffset, dotSize, dotSize);

          if (hasHover) {
            const dx = x - this.pointerX;
            const distanceSquared = dx * dx + dySquared;

            if (distanceSquared <= radiusSquared) {
              // Hover intensity is still evaluated in screen space, but now against the exact rendered dot positions.
              const alpha = 0.9 * Math.exp(-distanceSquared / sigmaSquared);

              if (alpha >= this.hoverMinAlpha) {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = this.hoverDotColor;
                ctx.fillRect(x - dotOffset, y - dotOffset, dotSize, dotSize);
                ctx.fillStyle = this.baseDotColor;
                continue;
              }
            }
          }

          if (!ambientGlow.active) {
            continue;
          }

          const ambientDx = x - ambientGlow.x;
          const ambientDistanceSquared = ambientDx * ambientDx + ambientDySquared;

          if (ambientDistanceSquared > ambientRadiusSquared) {
            continue;
          }

          const ambientAlpha = ambientGlow.maxAlpha * Math.exp(-ambientDistanceSquared / ambientSigmaSquared);

          if (ambientAlpha < this.ambientGlowMinAlpha) {
            continue;
          }

          ctx.globalAlpha = ambientAlpha;
          ctx.fillStyle = this.ambientGlowColor;
          ctx.fillRect(x - dotOffset, y - dotOffset, dotSize, dotSize);
          ctx.fillStyle = this.baseDotColor;
        }
      }

      ctx.globalAlpha = 1;
    }

    getAmbientGlowState() {
      if (!this.ambientGlowEnabled || !this.cssWidth || !this.cssHeight) {
        return {
          active: false,
          x: 0,
          y: 0,
          radius: this.ambientGlowRadius,
          sigma: this.ambientGlowSigma,
          maxAlpha: this.ambientGlowMaxAlpha,
        };
      }

      const now = performance.now() * 0.001;
      const target = typeof this.ambientGlowTargetProvider === "function" ? this.ambientGlowTargetProvider() : null;
      const centerX = target?.x ?? this.cssWidth / 2;
      const centerY = target?.y ?? this.cssHeight / 2;
      const driftX = Math.sin(now * 1.08) * 34 + Math.cos(now * 0.52) * 16;
      const driftY = Math.cos(now * 0.94) * 26 + Math.sin(now * 0.41) * 12;

      return {
        active: true,
        x: centerX + driftX,
        y: centerY + driftY,
        radius: this.ambientGlowRadius + 20,
        sigma: this.ambientGlowSigma + 10,
        maxAlpha: Math.min(0.62, this.ambientGlowMaxAlpha + 0.14),
      };
    }
  }

  window.InfiniteCanvasBackground = InfiniteCanvasBackground;
})();
