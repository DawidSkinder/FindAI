(function () {
  class DesignWorldLayer {
    constructor(root, options = {}) {
      this.root = root;
      this.surface = root?.querySelector("[data-design-world-surface]") ?? null;
      this.modeName = typeof options.modeName === "string" && options.modeName ? options.modeName : "unknown";
      this.manifestUrl = options.manifestUrl ?? "";
      this.baseUrl = options.baseUrl ?? "";
      this.onReady = options.onReady ?? null;
      this.tileElements = new Map();
      this.pendingTiles = new Map();
      this.currentLevelIndex = -1;
      this.currentKeys = new Set();
      this.viewState = {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        viewportWidth: 0,
        viewportHeight: 0,
        isPanning: false,
      };
      this.manifest = null;
      this.levelMap = new Map();
      this.overviewImage = null;
      this.isMounted = false;
      this.useOverview = options.useOverview ?? true;
      this.overviewPath = typeof options.overviewPath === "string" && options.overviewPath ? options.overviewPath : "";
      this.tileAttachMode = options.tileAttachMode === "attach-before-load" ? "attach-before-load" : "decode-before-attach";
      this.tileLoading = options.tileLoading ?? "eager";
      this.tileBuffer = Number.isFinite(options.tileBuffer) ? Math.max(0, options.tileBuffer) : 1;
      this.interactiveTileBuffer = Number.isFinite(options.interactiveTileBuffer)
        ? Math.max(0, options.interactiveTileBuffer)
        : Math.max(0, this.tileBuffer - 1);
      this.tileEvictionPolicy = options.tileEvictionPolicy ?? "none";
      this.maxRetainedTiles = Number.isFinite(options.maxRetainedTiles) ? Math.max(0, options.maxRetainedTiles) : Number.POSITIVE_INFINITY;
      this.keepCurrentLevelWhileInteracting = options.keepCurrentLevelWhileInteracting ?? false;
      this.levelSwitchHysteresis = Number.isFinite(options.levelSwitchHysteresis)
        ? Math.max(0, options.levelSwitchHysteresis)
        : 0;
      this.settleDelayMs = Number.isFinite(options.settleDelayMs) ? Math.max(0, options.settleDelayMs) : 96;
      this.tileExtension = typeof options.tileExtension === "string" && options.tileExtension ? options.tileExtension : "png";
      this.rafId = 0;
      this.pendingRenderMode = "settled";
      this.settleTimeoutId = 0;
      this.tileUsageClock = 0;
      this.diagnostics = {
        createdTiles: 0,
        removedTiles: 0,
        failedTiles: 0,
        levelSwitches: 0,
        recentLevelSwitches: [],
        recentTileErrors: [],
      };
    }

    async mount() {
      if (this.isMounted || !this.root || !this.surface) {
        return;
      }

      this.isMounted = true;
      this.root.dataset.worldState = "loading";

      try {
        this.manifest = await this.loadManifest();
        this.levelMap = new Map(this.manifest.levels.map((level) => [level.index, level]));
        this.setupSurface();
        if (this.useOverview) {
          this.loadOverview();
        }
        this.root.dataset.worldState = "ready";
        this.scheduleTileRender();

        if (typeof this.onReady === "function") {
          this.onReady(this.getWorldSize());
        }
      } catch (error) {
        this.root.dataset.worldState = "error";
        console.error("Failed to mount design world pyramid", error);
      }
    }

    async loadManifest() {
      const registry = window.__NO_AI_IN_DESIGN_MANIFESTS;

      if (registry && registry[this.manifestUrl]) {
        return registry[this.manifestUrl];
      }

      const response = await fetch(this.manifestUrl);

      if (!response.ok) {
        throw new Error(`Unable to load design world manifest: ${response.status}`);
      }

      return response.json();
    }

    setupSurface() {
      if (!this.manifest || !this.surface) {
        return;
      }

      this.surface.textContent = "";
      this.surface.style.width = `${this.manifest.width}px`;
      this.surface.style.height = `${this.manifest.height}px`;
      this.tileElements.clear();
      this.pendingTiles.clear();
      this.currentKeys.clear();
      this.currentLevelIndex = -1;
      this.pendingRenderMode = "settled";

      if (this.settleTimeoutId) {
        window.clearTimeout(this.settleTimeoutId);
        this.settleTimeoutId = 0;
      }
    }

    loadOverview() {
      if (!this.manifest || !this.surface) {
        return;
      }

      const overview = document.createElement("img");
      overview.className = "design-world-overview";
      overview.decoding = "async";
      overview.draggable = false;
      overview.alt = "";
      overview.src = `${this.baseUrl}/${this.overviewPath || this.manifest.overview}`;
      overview.style.width = `${this.manifest.width}px`;
      overview.style.height = `${this.manifest.height}px`;
      this.surface.appendChild(overview);
      this.overviewImage = overview;
    }

    isReady() {
      return Boolean(this.manifest);
    }

    getWorldSize() {
      if (!this.manifest) {
        return null;
      }

      return {
        width: this.manifest.width,
        height: this.manifest.height,
      };
    }

    setUiState(state) {
      if (!this.root) {
        return;
      }

      this.root.dataset.uiState = state;
    }

    setView(state) {
      const previousViewState = this.viewState;
      const nextViewState = {
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        scale: state.scale,
        viewportWidth: state.viewportWidth ?? this.root.clientWidth,
        viewportHeight: state.viewportHeight ?? this.root.clientHeight,
        isPanning: Boolean(state.isPanning),
      };
      const hasTransformChanged =
        previousViewState.offsetX !== nextViewState.offsetX ||
        previousViewState.offsetY !== nextViewState.offsetY ||
        previousViewState.scale !== nextViewState.scale ||
        previousViewState.viewportWidth !== nextViewState.viewportWidth ||
        previousViewState.viewportHeight !== nextViewState.viewportHeight;
      const hasInteractionChanged = previousViewState.isPanning !== nextViewState.isPanning;

      this.viewState = {
        ...nextViewState,
      };

      this.applyTransform();

      if (hasTransformChanged) {
        this.scheduleTileRender("interactive");
        this.scheduleSettledTileRender();
        return;
      }

      if (hasInteractionChanged && !nextViewState.isPanning) {
        this.scheduleSettledTileRender();
      }
    }

    applyTransform() {
      if (!this.surface) {
        return;
      }

      this.surface.style.transform = `translate(${this.viewState.offsetX}px, ${this.viewState.offsetY}px) scale(${this.viewState.scale})`;
    }

    scheduleTileRender(mode = "settled") {
      if (!this.isReady()) {
        return;
      }

      const requestedPriority = mode === "settled" ? 1 : 0;
      const pendingPriority = this.pendingRenderMode === "settled" ? 1 : 0;

      if (!this.rafId || requestedPriority >= pendingPriority) {
        this.pendingRenderMode = mode;
      }

      if (this.rafId) {
        return;
      }

      this.rafId = window.requestAnimationFrame(() => {
        const renderMode = this.pendingRenderMode;

        this.rafId = 0;
        this.pendingRenderMode = "settled";
        this.renderTiles(renderMode);
      });
    }

    scheduleSettledTileRender() {
      if (this.settleTimeoutId) {
        window.clearTimeout(this.settleTimeoutId);
      }

      this.settleTimeoutId = window.setTimeout(() => {
        this.settleTimeoutId = 0;
        this.scheduleTileRender("settled");
      }, this.settleDelayMs);
    }

    getLevelByIndex(levelIndex) {
      return this.levelMap.get(levelIndex) ?? null;
    }

    getLevelScore(level) {
      const factor = this.manifest.width / level.width;
      const screenPixelsPerLevelPixel = this.viewState.scale * factor;
      const clamped = Math.max(screenPixelsPerLevelPixel, 0.0001);

      return Math.abs(Math.log2(clamped));
    }

    pickLevel(mode = "settled") {
      if (!this.manifest) {
        return null;
      }

      let bestLevel = this.manifest.levels[0];
      let bestScore = Number.POSITIVE_INFINITY;

      for (const level of this.manifest.levels) {
        const score = this.getLevelScore(level);

        if (score < bestScore) {
          bestScore = score;
          bestLevel = level;
        }
      }

      const currentLevel = this.getLevelByIndex(this.currentLevelIndex);

      if (!currentLevel) {
        return bestLevel;
      }

      if (mode === "interactive" && this.keepCurrentLevelWhileInteracting) {
        return currentLevel;
      }

      if (bestLevel.index === currentLevel.index) {
        return currentLevel;
      }

      const currentScore = this.getLevelScore(currentLevel);

      if (currentScore <= bestScore + this.levelSwitchHysteresis) {
        return currentLevel;
      }

      return bestLevel;
    }

    renderTiles(mode = "settled") {
      if (!this.manifest || !this.surface) {
        return;
      }

      const level = this.pickLevel(mode);

      if (!level) {
        return;
      }

      const tileBuffer = mode === "interactive" ? this.interactiveTileBuffer : this.tileBuffer;
      const factor = this.manifest.width / level.width;
      const tileWorldSize = this.manifest.tileSize * factor;
      const viewportLeft = (-this.viewState.offsetX) / this.viewState.scale;
      const viewportTop = (-this.viewState.offsetY) / this.viewState.scale;
      const viewportRight = (this.viewState.viewportWidth - this.viewState.offsetX) / this.viewState.scale;
      const viewportBottom = (this.viewState.viewportHeight - this.viewState.offsetY) / this.viewState.scale;

      const startColumn = Math.max(0, Math.floor(viewportLeft / tileWorldSize) - tileBuffer);
      const endColumn = Math.min(level.columns - 1, Math.floor(viewportRight / tileWorldSize) + tileBuffer);
      const startRow = Math.max(0, Math.floor(viewportTop / tileWorldSize) - tileBuffer);
      const endRow = Math.min(level.rows - 1, Math.floor(viewportBottom / tileWorldSize) + tileBuffer);

      const nextKeys = new Set();

      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) {
          const key = `${level.index}:${column}:${row}`;
          nextKeys.add(key);
          this.ensureTile(level, factor, column, row, key);
        }
      }

      const visibleKeys =
        mode === "interactive" && this.currentLevelIndex === level.index
          ? new Set([...this.currentKeys, ...nextKeys])
          : nextKeys;
      const previousLevelIndex = this.currentLevelIndex;

      for (const [key, element] of this.tileElements) {
        if (visibleKeys.has(key)) {
          element.hidden = false;
          continue;
        }

        element.hidden = true;
      }

      for (const [key, pendingTile] of this.pendingTiles) {
        pendingTile.hidden = !visibleKeys.has(key);
      }

      this.pruneTiles(visibleKeys, level.index);

      this.currentKeys = nextKeys;
      this.currentLevelIndex = level.index;

      if (previousLevelIndex !== -1 && previousLevelIndex !== level.index) {
        this.recordLevelSwitch(previousLevelIndex, level.index, mode);
      }
    }

    ensureTile(level, factor, column, row, key) {
      if (!this.surface || !this.manifest) {
        return;
      }

      const originX = column * this.manifest.tileSize;
      const originY = row * this.manifest.tileSize;
      const tilePixelWidth = Math.min(this.manifest.tileSize, level.width - originX);
      const tilePixelHeight = Math.min(this.manifest.tileSize, level.height - originY);
      const layout = {
        left: originX * factor,
        top: originY * factor,
        width: tilePixelWidth * factor,
        height: tilePixelHeight * factor,
      };
      const existingTile = this.tileElements.get(key);
      const pendingTile = this.pendingTiles.get(key);

      if (existingTile) {
        this.applyTileLayout(existingTile, layout);
        this.touchTileElement(existingTile);
        existingTile.hidden = false;
        return;
      }

      if (pendingTile) {
        pendingTile.layout = layout;
        pendingTile.hidden = false;
        pendingTile.lastUsedAt = this.nextTileUsage();
        return;
      }

      if (this.tileAttachMode === "attach-before-load") {
        const tile = this.createTileElement(key, level.index);

        this.applyTileLayout(tile, layout);
        tile.hidden = false;
        this.touchTileElement(tile);
        this.tileElements.set(key, tile);
        this.diagnostics.createdTiles += 1;
        this.surface.appendChild(tile);
        tile.src = this.getTileUrl(level.index, column, row);
        return;
      }

      const nextPendingTile = {
        key,
        levelIndex: level.index,
        column,
        row,
        hidden: false,
        layout,
        lastUsedAt: this.nextTileUsage(),
        url: this.getTileUrl(level.index, column, row),
      };

      this.pendingTiles.set(key, nextPendingTile);
      this.loadTile(nextPendingTile);
    }

    createTileElement(key, levelIndex) {
      const tile = document.createElement("img");

      tile.className = "design-world-tile";
      tile.decoding = "async";
      tile.loading = this.tileLoading;
      tile.draggable = false;
      tile.alt = "";
      tile.dataset.tileKey = key;
      tile.dataset.tileLevelIndex = String(levelIndex);
      tile.addEventListener("error", () => {
        this.recordTileError(tile.currentSrc || tile.src || key, "Image element failed to load");
      });

      return tile;
    }

    recordLevelSwitch(fromLevel, toLevel, mode) {
      this.diagnostics.levelSwitches += 1;
      this.diagnostics.recentLevelSwitches.push({
        fromLevel,
        toLevel,
        mode,
        at: Date.now(),
      });

      if (this.diagnostics.recentLevelSwitches.length > 12) {
        this.diagnostics.recentLevelSwitches.shift();
      }
    }

    recordTileError(url, message) {
      this.diagnostics.failedTiles += 1;
      this.diagnostics.recentTileErrors.push({
        url,
        message,
        at: Date.now(),
      });

      if (this.diagnostics.recentTileErrors.length > 12) {
        this.diagnostics.recentTileErrors.shift();
      }
    }

    getTileUrl(levelIndex, column, row) {
      return `${this.baseUrl}/level-${levelIndex}/${column}-${row}.${this.tileExtension}`;
    }

    nextTileUsage() {
      this.tileUsageClock += 1;
      return this.tileUsageClock;
    }

    touchTileElement(element, lastUsedAt = this.nextTileUsage()) {
      element.dataset.tileUsage = String(lastUsedAt);
    }

    getTileUsage(element) {
      const lastUsedAt = Number.parseInt(element?.dataset?.tileUsage ?? "0", 10);
      return Number.isFinite(lastUsedAt) ? lastUsedAt : 0;
    }

    applyTileLayout(element, layout) {
      element.style.left = `${layout.left}px`;
      element.style.top = `${layout.top}px`;
      element.style.width = `${layout.width}px`;
      element.style.height = `${layout.height}px`;
    }

    async loadTile(pendingTile) {
      const tile = this.createTileElement(pendingTile.key, pendingTile.levelIndex);

      try {
        await this.loadAndDecodeTile(tile, pendingTile.url);
      } catch (error) {
        if (this.pendingTiles.get(pendingTile.key) === pendingTile) {
          this.pendingTiles.delete(pendingTile.key);
        }

        this.recordTileError(pendingTile.url, error?.message ?? "Unable to load tile");
        console.warn("Failed to load design world tile", error);
        return;
      }

      if (this.pendingTiles.get(pendingTile.key) !== pendingTile || !this.surface) {
        return;
      }

      this.applyTileLayout(tile, pendingTile.layout);
      tile.hidden = pendingTile.hidden;
      this.touchTileElement(tile, pendingTile.lastUsedAt);
      this.tileElements.set(pendingTile.key, tile);
      this.diagnostics.createdTiles += 1;
      this.pendingTiles.delete(pendingTile.key);
      this.surface.appendChild(tile);
      this.pruneTiles(this.currentKeys, this.currentLevelIndex);
    }

    loadAndDecodeTile(tile, url) {
      return new Promise((resolve, reject) => {
        const handleLoad = async () => {
          if (this.tileAttachMode === "decode-before-attach" && typeof tile.decode === "function") {
            try {
              await tile.decode();
            } catch (error) {
              // Browsers can reject decode for already-complete images; display is still safe.
            }
          }

          resolve();
        };
        const handleError = () => {
          reject(new Error(`Unable to load tile: ${url}`));
        };

        tile.addEventListener("load", handleLoad, { once: true });
        tile.addEventListener("error", handleError, { once: true });
        tile.src = url;
      });
    }

    pruneTiles(nextKeys, levelIndex) {
      for (const key of this.pendingTiles.keys()) {
        if (nextKeys.has(key)) {
          continue;
        }

        this.pendingTiles.delete(key);
      }

      if (this.tileEvictionPolicy === "visible-only") {
        for (const [key, element] of this.tileElements) {
          if (nextKeys.has(key)) {
            continue;
          }

          this.removeTileElement(key, element);
        }

        return;
      }

      if (!Number.isFinite(this.maxRetainedTiles) || this.tileElements.size <= this.maxRetainedTiles) {
        return;
      }

      const evictionCandidates = [];

      for (const [key, element] of this.tileElements) {
        if (nextKeys.has(key)) {
          continue;
        }

        const tileLevelIndex = Number.parseInt(element.dataset.tileLevelIndex ?? "-1", 10);

        evictionCandidates.push({
          key,
          element,
          lastUsedAt: this.getTileUsage(element),
          priority: tileLevelIndex === levelIndex ? 1 : 0,
        });
      }

      evictionCandidates.sort((left, right) => {
        if (left.lastUsedAt !== right.lastUsedAt) {
          return left.lastUsedAt - right.lastUsedAt;
        }

        return left.priority - right.priority;
      });

      for (const candidate of evictionCandidates) {
        if (this.tileElements.size <= this.maxRetainedTiles) {
          break;
        }

        this.removeTileElement(candidate.key, candidate.element);
      }
    }

    removeTileElement(key, element) {
      this.pendingTiles.delete(key);

      if (element instanceof HTMLImageElement) {
        element.removeAttribute("src");
      }

      element?.remove();
      this.tileElements.delete(key);
      this.diagnostics.removedTiles += 1;
    }

    clearTiles() {
      if (this.rafId) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }

      if (this.settleTimeoutId) {
        window.clearTimeout(this.settleTimeoutId);
        this.settleTimeoutId = 0;
      }

      for (const [key, element] of this.tileElements) {
        this.removeTileElement(key, element);
      }

      this.pendingTiles.clear();
      this.currentKeys.clear();
      this.currentLevelIndex = -1;
      this.pendingRenderMode = "settled";
    }

    getEstimatedDecodedTileBytes() {
      let totalBytes = 0;

      for (const element of this.tileElements.values()) {
        const width = element.naturalWidth || Number.parseFloat(element.getAttribute("width") || "0");
        const height = element.naturalHeight || Number.parseFloat(element.getAttribute("height") || "0");

        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          continue;
        }

        totalBytes += Math.round(width * height * 4);
      }

      return totalBytes;
    }

    getDiagnostics() {
      const estimatedDecodedTileBytes = this.getEstimatedDecodedTileBytes();

      return {
        modeName: this.modeName,
        manifestUrl: this.manifestUrl,
        tileExtension: this.tileExtension,
        tileAttachMode: this.tileAttachMode,
        tileLoading: this.tileLoading,
        tileEvictionPolicy: this.tileEvictionPolicy,
        maxRetainedTiles: this.maxRetainedTiles,
        keepCurrentLevelWhileInteracting: this.keepCurrentLevelWhileInteracting,
        levelSwitchHysteresis: this.levelSwitchHysteresis,
        settleDelayMs: this.settleDelayMs,
        currentLevelIndex: this.currentLevelIndex,
        visibleTileCount: this.currentKeys.size,
        retainedTileCount: this.tileElements.size,
        pendingTileCount: this.pendingTiles.size,
        estimatedDecodedTileBytes,
        estimatedDecodedTileMiB: Math.round((estimatedDecodedTileBytes / 1024 / 1024) * 100) / 100,
        createdTiles: this.diagnostics.createdTiles,
        removedTiles: this.diagnostics.removedTiles,
        failedTiles: this.diagnostics.failedTiles,
        levelSwitches: this.diagnostics.levelSwitches,
        recentLevelSwitches: [...this.diagnostics.recentLevelSwitches],
        recentTileErrors: [...this.diagnostics.recentTileErrors],
      };
    }
  }

  window.DesignWorldLayer = DesignWorldLayer;
})();
