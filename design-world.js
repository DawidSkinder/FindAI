(function () {
  class DesignWorldLayer {
    constructor(root, options = {}) {
      this.root = root;
      this.surface = root?.querySelector("[data-design-world-surface]") ?? null;
      this.manifestUrl = options.manifestUrl ?? "";
      this.baseUrl = options.baseUrl ?? "";
      this.onReady = options.onReady ?? null;
      this.tileElements = new Map();
      this.loadedTiles = new Set();
      this.currentLevelIndex = -1;
      this.currentKeys = new Set();
      this.viewState = {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        viewportWidth: 0,
        viewportHeight: 0,
      };
      this.manifest = null;
      this.overviewImage = null;
      this.isMounted = false;
      this.useOverview = options.useOverview ?? true;
      this.tileLoading = options.tileLoading ?? "eager";
      this.tileBuffer = Number.isFinite(options.tileBuffer) ? Math.max(0, options.tileBuffer) : 1;
      this.tileEvictionPolicy = options.tileEvictionPolicy ?? "none";
      this.maxRetainedTiles = Number.isFinite(options.maxRetainedTiles) ? Math.max(0, options.maxRetainedTiles) : Number.POSITIVE_INFINITY;
      this.rafId = 0;
    }

    async mount() {
      if (this.isMounted || !this.root || !this.surface) {
        return;
      }

      this.isMounted = true;
      this.root.dataset.worldState = "loading";

      try {
        this.manifest = await this.loadManifest();
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
      this.loadedTiles.clear();
      this.currentKeys.clear();
      this.currentLevelIndex = -1;
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
      overview.src = `${this.baseUrl}/${this.manifest.overview}`;
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
      this.viewState = {
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        scale: state.scale,
        viewportWidth: state.viewportWidth ?? this.root.clientWidth,
        viewportHeight: state.viewportHeight ?? this.root.clientHeight,
      };

      this.applyTransform();
      this.scheduleTileRender();
    }

    applyTransform() {
      if (!this.surface) {
        return;
      }

      this.surface.style.transform = `translate(${this.viewState.offsetX}px, ${this.viewState.offsetY}px) scale(${this.viewState.scale})`;
    }

    scheduleTileRender() {
      if (this.rafId || !this.isReady()) {
        return;
      }

      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = 0;
        this.renderTiles();
      });
    }

    pickLevel() {
      if (!this.manifest) {
        return null;
      }

      let bestLevel = this.manifest.levels[0];
      let bestScore = Number.POSITIVE_INFINITY;

      for (const level of this.manifest.levels) {
        const factor = this.manifest.width / level.width;
        const screenPixelsPerLevelPixel = this.viewState.scale * factor;
        const clamped = Math.max(screenPixelsPerLevelPixel, 0.0001);
        const score = Math.abs(Math.log2(clamped));

        if (score < bestScore) {
          bestScore = score;
          bestLevel = level;
        }
      }

      return bestLevel;
    }

    renderTiles() {
      if (!this.manifest || !this.surface) {
        return;
      }

      const level = this.pickLevel();

      if (!level) {
        return;
      }

      const factor = this.manifest.width / level.width;
      const tileWorldSize = this.manifest.tileSize * factor;
      const viewportLeft = (-this.viewState.offsetX) / this.viewState.scale;
      const viewportTop = (-this.viewState.offsetY) / this.viewState.scale;
      const viewportRight = (this.viewState.viewportWidth - this.viewState.offsetX) / this.viewState.scale;
      const viewportBottom = (this.viewState.viewportHeight - this.viewState.offsetY) / this.viewState.scale;

      const startColumn = Math.max(0, Math.floor(viewportLeft / tileWorldSize) - this.tileBuffer);
      const endColumn = Math.min(level.columns - 1, Math.floor(viewportRight / tileWorldSize) + this.tileBuffer);
      const startRow = Math.max(0, Math.floor(viewportTop / tileWorldSize) - this.tileBuffer);
      const endRow = Math.min(level.rows - 1, Math.floor(viewportBottom / tileWorldSize) + this.tileBuffer);

      const nextKeys = new Set();

      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) {
          const key = `${level.index}:${column}:${row}`;
          nextKeys.add(key);
          this.ensureTile(level, factor, column, row, key);
        }
      }

      for (const [key, element] of this.tileElements) {
        if (nextKeys.has(key)) {
          element.hidden = false;
          continue;
        }

        element.hidden = true;
      }

      this.pruneTiles(nextKeys, level.index);

      this.currentKeys = nextKeys;
      this.currentLevelIndex = level.index;
    }

    ensureTile(level, factor, column, row, key) {
      if (!this.surface || !this.manifest) {
        return;
      }

      let tile = this.tileElements.get(key);
      const originX = column * this.manifest.tileSize;
      const originY = row * this.manifest.tileSize;
      const tilePixelWidth = Math.min(this.manifest.tileSize, level.width - originX);
      const tilePixelHeight = Math.min(this.manifest.tileSize, level.height - originY);
      const worldX = originX * factor;
      const worldY = originY * factor;
      const worldWidth = tilePixelWidth * factor;
      const worldHeight = tilePixelHeight * factor;

      if (!tile) {
        tile = document.createElement("img");
        tile.className = "design-world-tile";
        tile.decoding = "async";
        tile.loading = this.tileLoading;
        tile.draggable = false;
        tile.alt = "";
        tile.dataset.tileKey = key;
        tile.src = `${this.baseUrl}/level-${level.index}/${column}-${row}.png`;
        this.tileElements.set(key, tile);
        this.surface.appendChild(tile);
      }

      tile.style.left = `${worldX}px`;
      tile.style.top = `${worldY}px`;
      tile.style.width = `${worldWidth}px`;
      tile.style.height = `${worldHeight}px`;
      tile.hidden = false;
    }

    pruneTiles(nextKeys, levelIndex) {
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

        const [tileLevelIndexValue = "-1"] = key.split(":");
        const tileLevelIndex = Number.parseInt(tileLevelIndexValue, 10);

        evictionCandidates.push({
          key,
          element,
          priority: tileLevelIndex === levelIndex ? 1 : 0,
        });
      }

      evictionCandidates.sort((left, right) => left.priority - right.priority);

      for (const candidate of evictionCandidates) {
        if (this.tileElements.size <= this.maxRetainedTiles) {
          break;
        }

        this.removeTileElement(candidate.key, candidate.element);
      }
    }

    removeTileElement(key, element) {
      if (element instanceof HTMLImageElement) {
        element.removeAttribute("src");
      }

      element?.remove();
      this.tileElements.delete(key);
    }
  }

  window.DesignWorldLayer = DesignWorldLayer;
})();
