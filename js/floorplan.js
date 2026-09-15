// floorplan.js — VISIO 3D
// Controla o canvas da planta: carregamento de imagem, pan, zoom,
// renderização dos marcadores de câmera e captura de cliques para
// criação/seleção/edição de pontos de visão. Não conhece o estado
// global — recebe dados e emite eventos via callbacks.

const MARKER_RADIUS = 8;
const CONE_LENGTH = 46;
const CONE_HALF_ANGLE = 28; // graus, metade do campo de visão desenhado

const DESC_MARKER_SIZE = 7;
const DESC_TICK_LENGTH = 22;

export class FloorplanCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} wrap
   * @param {{
   *   onCreatePoint: (norm:{x:number,y:number}) => void,
   *   onSelectPoint: (id:string|null) => void,
   *   onMovePoint: (id:string, norm:{x:number,y:number}) => void,
   *   onRotatePoint: (id:string, degrees:number) => void,
   *   onCreateDescriptionPoint: (norm:{x:number,y:number}) => void,
   *   onSelectDescriptionPoint: (id:string|null) => void,
   *   onMoveDescriptionPoint: (id:string, norm:{x:number,y:number}) => void,
   * }} handlers
   */
  constructor(canvas, wrap, handlers) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.ctx = canvas.getContext('2d');
    this.handlers = handlers;

    this.image = null;
    this.viewpoints = [];
    this.selectedId = null;
    this.descriptionPoints = [];
    this.selectedDescriptionId = null;
    this.activeTool = 'viewpoint'; // 'viewpoint' | 'description' — o que um clique simples cria

    this.scale = 1;
    this.minScale = 0.1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.dragMode = null; // null | 'pan' | 'move-point' | 'rotate-point' | 'move-description-point'
    this.dragTarget = null;
    this.lastPointer = null;
    this.didDrag = false;

    this._bindEvents();
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(wrap);
  }

  destroy() {
    this._resizeObserver.disconnect();
  }

  loadImage(dataUrl) {
    const img = new Image();
    img.onload = () => {
      this.image = img;
      this._resizeCanvas();
      this.fitToView();
    };
    img.src = dataUrl;
  }

  setViewpoints(viewpoints, selectedId) {
    this.viewpoints = viewpoints;
    this.selectedId = selectedId;
    this.render();
  }

  setDescriptionPoints(points, selectedId) {
    this.descriptionPoints = points;
    this.selectedDescriptionId = selectedId;
    this.render();
  }

  setActiveTool(tool) {
    this.activeTool = tool;
  }

  fitToView() {
    if (!this.image) return;
    const wrapRect = this.wrap.getBoundingClientRect();
    const scaleX = (wrapRect.width - 96) / this.image.width;
    const scaleY = (wrapRect.height - 96) / this.image.height;
    this.scale = Math.min(scaleX, scaleY, 1.4);
    this.minScale = this.scale * 0.3;
    this.offsetX = (wrapRect.width - this.image.width * this.scale) / 2;
    this.offsetY = (wrapRect.height - this.image.height * this.scale) / 2;
    this.render();
    this._reportZoom();
  }

  zoomBy(factor) {
    const wrapRect = this.wrap.getBoundingClientRect();
    const cx = wrapRect.width / 2;
    const cy = wrapRect.height / 2;
    this._zoomAt(cx, cy, factor);
  }

  _zoomAt(px, py, factor) {
    const newScale = Math.min(Math.max(this.scale * factor, this.minScale), 6);
    const worldX = (px - this.offsetX) / this.scale;
    const worldY = (py - this.offsetY) / this.scale;
    this.scale = newScale;
    this.offsetX = px - worldX * this.scale;
    this.offsetY = py - worldY * this.scale;
    this.render();
    this._reportZoom();
  }

  _reportZoom() {
    this.handlers.onZoomChange?.(this.scale);
  }

  _resizeCanvas() {
    const rect = this.wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  // ---------- coordenadas ----------
  _toScreen(normX, normY) {
    if (!this.image) return { x: 0, y: 0 };
    return {
      x: this.offsetX + normX * this.image.width * this.scale,
      y: this.offsetY + normY * this.image.height * this.scale,
    };
  }

  _toNorm(screenX, screenY) {
    if (!this.image) return { x: 0, y: 0 };
    return {
      x: (screenX - this.offsetX) / (this.image.width * this.scale),
      y: (screenY - this.offsetY) / (this.image.height * this.scale),
    };
  }

  // ---------- render ----------
  render() {
    const rect = this.wrap.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    if (!this.image) return;

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(
      this.image, 0, 0, this.image.width, this.image.height,
      this.offsetX, this.offsetY, this.image.width * this.scale, this.image.height * this.scale
    );

    this.viewpoints.forEach((vp) => this._drawMarker(vp, vp.id === this.selectedId));
    this.descriptionPoints.forEach((dp) => this._drawDescriptionMarker(dp, dp.id === this.selectedDescriptionId));
  }

  _drawMarker(vp, isSelected) {
    const { x, y } = this._toScreen(vp.x, vp.y);
    const ctx = this.ctx;
    const dirRad = (vp.direction - 90) * (Math.PI / 180);

    // cone de campo de visão
    const halfFov = (vp.fov / 2) * (Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, CONE_LENGTH, dirRad - halfFov, dirRad + halfFov);
    ctx.closePath();
    ctx.fillStyle = isSelected ? 'rgba(91,141,239,0.22)' : 'rgba(91,141,239,0.10)';
    ctx.fill();
    ctx.strokeStyle = isSelected ? 'rgba(91,141,239,0.55)' : 'rgba(91,141,239,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // alça de direção
    const handleX = x + Math.cos(dirRad) * CONE_LENGTH;
    const handleY = y + Math.sin(dirRad) * CONE_LENGTH;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(handleX, handleY);
    ctx.strokeStyle = '#5B8DEF';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(handleX, handleY, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#5B8DEF';
    ctx.fill();

    // marcador (latão)
    ctx.beginPath();
    ctx.arc(x, y, MARKER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#C9A15B' : '#8A6F3F';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#12151A';
    ctx.stroke();

    // rótulo
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(237,239,242,0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText(vp.name, x + MARKER_RADIUS + 8, y);
  }

  _drawDescriptionMarker(dp, isSelected) {
    const { x, y } = this._toScreen(dp.position.x, dp.position.y);
    const ctx = this.ctx;
    const fixed = dp.status === 'fixed';
    const suggested = dp.status === 'suggested';

    // tick de orientação
    const dirRad = ((dp.rotation || 0) - 90) * (Math.PI / 180);
    const tx = x + Math.cos(dirRad) * DESC_TICK_LENGTH;
    const ty = y + Math.sin(dirRad) * DESC_TICK_LENGTH;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.strokeStyle = 'rgba(79, 184, 168, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // marcador em losango
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    const s = DESC_MARKER_SIZE;
    ctx.beginPath();
    ctx.rect(-s, -s, s * 2, s * 2);
    ctx.fillStyle = isSelected ? '#4FB8A8' : fixed ? '#D9A441' : suggested ? 'rgba(79,184,168,0.35)' : '#2F7A70';
    ctx.fill();
    ctx.lineWidth = fixed ? 2 : 1.5;
    ctx.strokeStyle = fixed ? '#D9A441' : '#12151A';
    ctx.setLineDash(suggested ? [2, 2] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // rótulo
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(237,239,242,0.9)';
    ctx.textBaseline = 'middle';
    const label = (fixed ? '🔒 ' : '') + dp.id;
    ctx.fillText(label, x + s + 8, y);
  }

  _hitTestDescriptionMarker(screenX, screenY) {
    for (let i = this.descriptionPoints.length - 1; i >= 0; i--) {
      const dp = this.descriptionPoints[i];
      const { x, y } = this._toScreen(dp.position.x, dp.position.y);
      if (Math.hypot(screenX - x, screenY - y) <= DESC_MARKER_SIZE + 6) {
        return dp;
      }
    }
    return null;
  }

  _hitTestMarker(screenX, screenY) {
    for (let i = this.viewpoints.length - 1; i >= 0; i--) {
      const vp = this.viewpoints[i];
      const { x, y } = this._toScreen(vp.x, vp.y);
      if (Math.hypot(screenX - x, screenY - y) <= MARKER_RADIUS + 4) {
        return vp;
      }
    }
    return null;
  }

  _hitTestRotateHandle(screenX, screenY) {
    for (let i = this.viewpoints.length - 1; i >= 0; i--) {
      const vp = this.viewpoints[i];
      const { x, y } = this._toScreen(vp.x, vp.y);
      const dirRad = (vp.direction - 90) * (Math.PI / 180);
      const hx = x + Math.cos(dirRad) * CONE_LENGTH;
      const hy = y + Math.sin(dirRad) * CONE_LENGTH;
      if (Math.hypot(screenX - hx, screenY - hy) <= 8) {
        return vp;
      }
    }
    return null;
  }

  // ---------- eventos ----------
  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      this.lastPointer = { x: px, y: py };
      this.didDrag = false;

      const rotateHit = this._hitTestRotateHandle(px, py);
      const markerHit = !rotateHit && this._hitTestMarker(px, py);
      const descHit = !rotateHit && !markerHit && this._hitTestDescriptionMarker(px, py);

      if (rotateHit) {
        this.dragMode = 'rotate-point';
        this.dragTarget = rotateHit;
      } else if (markerHit) {
        this.dragMode = 'move-point';
        this.dragTarget = markerHit;
        this.handlers.onSelectPoint?.(markerHit.id);
      } else if (descHit) {
        this.dragMode = 'move-description-point';
        this.dragTarget = descHit;
        this.handlers.onSelectDescriptionPoint?.(descHit.id);
      } else if (this.image) {
        this.dragMode = 'pan';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.dragMode || !this.lastPointer) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = px - this.lastPointer.x;
      const dy = py - this.lastPointer.y;

      if (Math.hypot(dx, dy) > 2) this.didDrag = true;

      if (this.dragMode === 'pan') {
        this.offsetX += dx;
        this.offsetY += dy;
        this.render();
      } else if (this.dragMode === 'move-point' && this.dragTarget) {
        const norm = this._toNorm(px, py);
        norm.x = Math.min(Math.max(norm.x, 0), 1);
        norm.y = Math.min(Math.max(norm.y, 0), 1);
        this.dragTarget.x = norm.x;
        this.dragTarget.y = norm.y;
        this.render();
        this.handlers.onMovePoint?.(this.dragTarget.id, norm);
      } else if (this.dragMode === 'rotate-point' && this.dragTarget) {
        const center = this._toScreen(this.dragTarget.x, this.dragTarget.y);
        const angle = Math.atan2(py - center.y, px - center.x) * (180 / Math.PI) + 90;
        const normalized = ((angle % 360) + 360) % 360;
        this.dragTarget.direction = Math.round(normalized);
        this.render();
        this.handlers.onRotatePoint?.(this.dragTarget.id, this.dragTarget.direction);
      } else if (this.dragMode === 'move-description-point' && this.dragTarget) {
        const norm = this._toNorm(px, py);
        norm.x = Math.min(Math.max(norm.x, 0), 1);
        norm.y = Math.min(Math.max(norm.y, 0), 1);
        this.dragTarget.position.x = norm.x;
        this.dragTarget.position.y = norm.y;
        this.render();
        this.handlers.onMoveDescriptionPoint?.(this.dragTarget.id, norm);
      }

      this.lastPointer = { x: px, y: py };
    });

    window.addEventListener('mouseup', (e) => {
      if (this.dragMode === 'pan' && !this.didDrag && this.image) {
        // clique simples (sem arraste) sobre a planta → cria ponto
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const norm = this._toNorm(px, py);
        if (norm.x >= 0 && norm.x <= 1 && norm.y >= 0 && norm.y <= 1) {
          if (this.activeTool === 'description') {
            this.handlers.onCreateDescriptionPoint?.(norm);
          } else {
            this.handlers.onCreatePoint?.(norm);
          }
        }
      }
      this.dragMode = null;
      this.dragTarget = null;
      this.lastPointer = null;
    });

    canvas.addEventListener('wheel', (e) => {
      if (!this.image) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this._zoomAt(px, py, factor);
    }, { passive: false });
  }
}
