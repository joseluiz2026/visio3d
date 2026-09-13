// app.js — VISIO 3D
// Ponto de entrada. Faz o roteamento entre telas e liga o DOM ao
// estado central (state.js), delegando regras de domínio aos módulos
// especializados (floorplan.js, camera.js, generator.js, gallery.js,
// settings.js). Não guarda estado de negócio próprio.

import { store } from './state.js';
import { FloorplanCanvas } from './floorplan.js';
import { CAMERA_LIMITS, directionLabel, DEFAULT_ENVIRONMENTS } from './camera.js';
import { PROVIDERS, GENERATION_STEPS, generateImage, analyzeFloorplan } from './generator.js';
import { buildPrompt } from './promptBuilder.js';
import { filterGalleryEntries, buildFilterList, formatGeneratedAt } from './gallery.js';
import { STYLE_OPTIONS, LIGHTING_OPTIONS, FURNITURE_OPTIONS, findOption } from './settings.js';
import { toFriendlyMessage, AppError } from './errors.js';

// ---------------------------------------------------------------------
// Referências de DOM
// ---------------------------------------------------------------------
const el = (id) => document.getElementById(id);

const views = document.querySelectorAll('.view');
const railItems = document.querySelectorAll('.rail__item');
const breadcrumb = el('breadcrumb');

const projectGrid = el('project-grid');
const modalNewProject = el('modal-new-project');

const canvasWrap = el('canvas-wrap');
const canvasEl = el('floorplan-canvas');
const dropzone = el('dropzone');
const fileInput = el('file-input');
const canvasControls = el('canvas-controls');
const canvasHint = el('canvas-hint');
const zoomLabel = el('zoom-label');
const inspector = el('inspector');

const galleryFilterState = { current: 'all' };
let generationTimer = null;

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
let toastTimer = null;
function toast(message) {
  const t = el('toast');
  t.textContent = message;
  t.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-visible'), 2400);
}

// ---------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------
const BREADCRUMBS = {
  home: 'Início',
  floorplan: 'Planta',
  'image-config': 'Configuração da imagem',
  engine: 'Motor de IA',
  generation: 'Geração',
  result: 'Resultado',
  gallery: 'Galeria',
  settings: 'Configurações',
};

function goTo(view) {
  store.setView(view);
}

function renderRouting() {
  const { view } = store.get();
  views.forEach((v) => {
    v.hidden = v.dataset.view !== view;
  });
  railItems.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.nav === view);
  });

  const project = store.getActiveProject();
  const parts = ['<span>VISIO 3D</span>'];
  if (project && view !== 'home') {
    parts.push(`<span class="sep">/</span><span>${escapeHtml(project.name)}</span>`);
  }
  parts.push(`<span class="sep">/</span><span class="current">${BREADCRUMBS[view] || ''}</span>`);
  breadcrumb.innerHTML = parts.join('');

  if (view === 'floorplan') mountFloorplanView();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// TELA 1 — Início
// ---------------------------------------------------------------------
function renderHome() {
  const { projects } = store.get();
  const cards = projects.map((p) => {
    const thumb = p.floorplan
      ? `<img src="${p.floorplan.dataUrl}" alt="">`
      : `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16"/></svg>`;
    const count = p.viewpoints.length;
    return `
      <div class="project-card" data-open-project="${p.id}">
        <div class="project-card__thumb">${thumb}</div>
        <div class="project-card__body">
          <div class="project-card__name">${escapeHtml(p.name)}</div>
          <div class="project-card__meta">${count} ${count === 1 ? 'ponto de visão' : 'pontos de visão'}</div>
        </div>
      </div>`;
  }).join('');

  projectGrid.innerHTML = cards + `
    <button class="project-card project-card--new" data-action="open-new-project">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v14M5 12h14"/></svg>
      <span>Novo projeto</span>
    </button>`;
}

// ---------------------------------------------------------------------
// TELA 3/4 — Planta + Ponto de visão
// ---------------------------------------------------------------------
let floorplanCanvas = null;
// Assinatura do que já está carregado no canvas. Evita recarregar a
// imagem (e resetar zoom/pan) a cada re-render disparado pelo próprio
// arraste de um marcador — só recarrega quando o projeto ou a planta
// realmente mudam.
let mountedFloorplanSignature = null;

function mountFloorplanView() {
  const project = store.getActiveProject();
  if (!project) { goTo('home'); return; }

  if (!floorplanCanvas) {
    floorplanCanvas = new FloorplanCanvas(canvasEl, canvasWrap, {
      onCreatePoint: (norm) => {
        const vp = store.addViewpoint(project.id, norm);
        toast(`${vp.name} criado`);
      },
      onSelectPoint: (id) => store.setActiveViewpoint(id),
      onMovePoint: (id, norm) => store.updateViewpoint(project.id, id, { x: norm.x, y: norm.y }),
      onRotatePoint: (id, deg) => store.updateViewpoint(project.id, id, { direction: deg }),
      onZoomChange: (scale) => { zoomLabel.textContent = Math.round(scale * 100) + '%'; },
    });
  }

  const signature = `${project.id}::${project.floorplan ? project.floorplan.name + project.floorplan.dataUrl.length : 'none'}`;
  if (signature !== mountedFloorplanSignature) {
    mountedFloorplanSignature = signature;
    if (project.floorplan) {
      dropzone.style.display = 'none';
      canvasEl.hidden = false;
      canvasControls.style.display = 'flex';
      canvasHint.style.display = 'block';
      floorplanCanvas.loadImage(project.floorplan.dataUrl);
    } else {
      dropzone.style.display = 'flex';
      canvasEl.hidden = true;
      canvasControls.style.display = 'none';
      canvasHint.style.display = 'none';
    }
  }

  renderFloorplanMarkers();
  renderInspector();
}

function renderFloorplanMarkers() {
  const project = store.getActiveProject();
  if (!project || !floorplanCanvas) return;
  const { activeViewpointId } = store.get();
  floorplanCanvas.setViewpoints(project.viewpoints, activeViewpointId);
}

function renderInspector() {
  const project = store.getActiveProject();
  if (!project) return;
  const vp = store.getActiveViewpoint();
  const environments = project.floorplanAnalysis?.suggestedEnvironments?.length
    ? project.floorplanAnalysis.suggestedEnvironments
    : DEFAULT_ENVIRONMENTS;

  if (!vp) {
    if (!project.viewpoints.length) {
      inspector.innerHTML = `
        <div class="empty-state" style="padding: var(--space-6) var(--space-2);">
          <p class="h3">Nenhum ponto de visão</p>
          <p style="font-size: var(--text-sm);">Clique sobre a planta para posicionar a primeira câmera.</p>
        </div>`;
    } else {
      inspector.innerHTML = pointListHtml(project);
      bindPointListEvents(project);
    }
    return;
  }

  inspector.innerHTML = `
    <button class="btn btn--ghost btn--sm" data-action="deselect-point" style="margin-bottom: var(--space-4);">← Todos os pontos</button>
    <p class="eyebrow" style="margin-bottom: var(--space-1);">PONTO DE VISÃO</p>
    <div class="field">
      <input class="input" id="vp-name" value="${escapeHtml(vp.name)}">
    </div>

    <div class="field">
      <label class="field__label">Ambiente associado</label>
      <select class="select" id="vp-environment">
        <option value="">Selecionar...</option>
        ${environments.map((e) => `<option value="${e}" ${vp.environment === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
    </div>

    <div class="field-row">
      <div class="field">
        <label class="field__label">Posição X <span class="field__value mono">${vp.x.toFixed(2)}</span></label>
      </div>
      <div class="field">
        <label class="field__label">Posição Y <span class="field__value mono">${vp.y.toFixed(2)}</span></label>
      </div>
    </div>
    <p class="text-faint" style="font-size: var(--text-xs); margin-top: -12px; margin-bottom: var(--space-4);">Arraste o marcador na planta para reposicionar.</p>

    <div class="field">
      <label class="field__label">Direção <span class="field__value mono" id="vp-direction-value">${vp.direction}° · ${directionLabel(vp.direction)}</span></label>
      <input type="range" class="range" id="vp-direction" min="${CAMERA_LIMITS.direction.min}" max="${CAMERA_LIMITS.direction.max}" value="${vp.direction}">
    </div>

    <div class="field">
      <label class="field__label">Altura da câmera <span class="field__value mono" id="vp-height-value">${vp.height.toFixed(2)}m</span></label>
      <input type="range" class="range" id="vp-height" min="${CAMERA_LIMITS.height.min}" max="${CAMERA_LIMITS.height.max}" step="${CAMERA_LIMITS.height.step}" value="${vp.height}">
    </div>

    <div class="field">
      <label class="field__label">Campo de visão <span class="field__value mono" id="vp-fov-value">${vp.fov}°</span></label>
      <input type="range" class="range" id="vp-fov" min="${CAMERA_LIMITS.fov.min}" max="${CAMERA_LIMITS.fov.max}" value="${vp.fov}">
    </div>

    <div class="divider"></div>

    <button class="btn btn--primary btn--block" data-action="go-to-image-config" style="margin-bottom: var(--space-3);">Configurar imagem →</button>
    <button class="btn btn--danger btn--block" data-action="delete-point">Excluir ponto</button>
  `;
  bindInspectorFieldEvents(project, vp);
}

function pointListHtml(project) {
  const rows = project.viewpoints.map((vp) => `
    <div class="option-card" data-select-point="${vp.id}" style="padding: var(--space-3);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="option-card__title" style="font-size: var(--text-base);">${escapeHtml(vp.name)}</span>
        <span class="badge">${vp.result ? 'pronto' : vp.style ? 'configurado' : 'novo'}</span>
      </div>
      <span class="option-card__meta mono">${directionLabel(vp.direction)} · FOV ${vp.fov}°</span>
    </div>`).join('');

  return `
    <p class="eyebrow" style="margin-bottom: var(--space-4);">${project.viewpoints.length} PONTO(S) DE VISÃO</p>
    <div style="display:flex; flex-direction:column; gap: var(--space-2);">${rows}</div>
    <p class="text-faint" style="font-size: var(--text-xs); margin-top: var(--space-5);">Clique na planta para adicionar outro ponto.</p>
  `;
}

function bindPointListEvents(project) {
  inspector.querySelectorAll('[data-select-point]').forEach((elm) => {
    elm.addEventListener('click', () => store.setActiveViewpoint(elm.dataset.selectPoint));
  });
}

function bindInspectorFieldEvents(project, vp) {
  el('vp-name').addEventListener('change', (e) => store.updateViewpoint(project.id, vp.id, { name: e.target.value || vp.name }));
  el('vp-environment').addEventListener('change', (e) => store.updateViewpoint(project.id, vp.id, { environment: e.target.value }));

  // Sliders nativos: reconstruir o painel inteiro a cada 'input' (via
  // store.updateViewpoint -> emit -> render) derrubaria o próprio
  // elemento <input> do DOM em pleno arraste. Por isso, durante o
  // arraste ('input') só mutamos o objeto em memória e atualizamos o
  // rótulo + o canvas diretamente; a persistência e o re-render
  // completo do painel só acontecem ao soltar ('change').
  bindLiveRange('vp-direction', 'vp-direction-value', vp, project, 'direction',
    (v) => `${v}° · ${directionLabel(v)}`, Number);
  bindLiveRange('vp-height', 'vp-height-value', vp, project, 'height',
    (v) => `${v.toFixed(2)}m`, Number);
  bindLiveRange('vp-fov', 'vp-fov-value', vp, project, 'fov',
    (v) => `${v}°`, Number);
}

function bindLiveRange(inputId, labelId, vp, project, field, formatLabel, parse) {
  const input = el(inputId);
  const label = el(labelId);
  input.addEventListener('input', (e) => {
    const value = parse(e.target.value);
    vp[field] = value; // mesma referência do objeto em store — mutação direta
    label.textContent = formatLabel(value);
    renderFloorplanMarkers();
  });
  input.addEventListener('change', (e) => {
    store.updateViewpoint(project.id, vp.id, { [field]: parse(e.target.value) });
  });
}

// ---------------------------------------------------------------------
// TELA 5 — Configuração da imagem
// ---------------------------------------------------------------------
function renderImageConfig() {
  const project = store.getActiveProject();
  const vp = store.getActiveViewpoint();
  if (!project || !vp) { goTo('floorplan'); return; }

  el('config-subtitle').textContent = `${vp.name}${vp.environment ? ' · ' + vp.environment : ''}`;

  renderOptionGrid(el('style-grid'), STYLE_OPTIONS, vp.style, (id) => {
    store.updateViewpoint(project.id, vp.id, { style: id });
    renderImageConfig();
  });
  renderOptionGrid(el('lighting-grid'), LIGHTING_OPTIONS, vp.lighting, (id) => {
    store.updateViewpoint(project.id, vp.id, { lighting: id });
    renderImageConfig();
  });
  renderOptionGrid(el('furniture-grid'), FURNITURE_OPTIONS, vp.furniture, (id) => {
    store.updateViewpoint(project.id, vp.id, { furniture: id });
    renderImageConfig();
  });
}

function renderOptionGrid(container, options, selectedId, onSelect) {
  container.innerHTML = options.map((opt) => `
    <button class="option-card ${opt.id === selectedId ? 'is-selected' : ''}" data-option="${opt.id}">
      <div class="option-card__swatch" style="background:${opt.swatch}"></div>
      <span class="option-card__title">${opt.label}</span>
    </button>`).join('');
  container.querySelectorAll('[data-option]').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(btn.dataset.option));
  });
}

// ---------------------------------------------------------------------
// TELA 6 — Motor de IA
// ---------------------------------------------------------------------
function renderEngineView() {
  const project = store.getActiveProject();
  const vp = store.getActiveViewpoint();
  if (!project || !vp) { goTo('floorplan'); return; }
  const { settings } = store.get();

  const grid = el('engine-grid');
  grid.innerHTML = Object.values(PROVIDERS).map((p) => {
    const mock = settings.forceMock || !p.available;
    return `
      <button class="option-card ${vp.engine === p.id ? 'is-selected' : ''}" data-engine="${p.id}">
        <span class="option-card__title">${p.label}</span>
        <span class="option-card__meta">${p.vendor} · ${p.speedHint} · custo ${p.costHint}</span>
        <span class="badge ${mock ? 'badge--mock' : 'badge--online'}">${mock ? 'modo simulado' : 'API conectada'}</span>
      </button>`;
  }).join('');

  grid.querySelectorAll('[data-engine]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updateViewpoint(project.id, vp.id, { engine: btn.dataset.engine });
      renderEngineView();
    });
  });
}

// ---------------------------------------------------------------------
// TELA 7 — Geração
// ---------------------------------------------------------------------
function renderGenerationSteps(activeIndex, doneUpTo) {
  const container = el('gen-steps');
  container.innerHTML = GENERATION_STEPS.map((label, i) => {
    const state = i < doneUpTo ? 'is-done' : i === activeIndex ? 'is-active' : 'is-pending';
    const mark = i < doneUpTo
      ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#5FAE79" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>'
      : '';
    return `<div class="step-item ${state}"><div class="step-item__marker">${mark}</div><div class="step-item__label">${label}</div></div>`;
  }).join('');
}

async function runGeneration() {
  const project = store.getActiveProject();
  const vp = store.getActiveViewpoint();
  if (!project || !vp || !vp.engine) { goTo('floorplan'); return; }

  const { settings } = store.get();
  const useMock = settings.forceMock || !PROVIDERS[vp.engine]?.available;

  el('gen-engine-name').textContent = PROVIDERS[vp.engine].label;
  renderGenerationSteps(0, 0);
  el('gen-progress-fill').style.width = '0%';
  store.updateViewpoint(project.id, vp.id, { status: 'generating' });

  const prompt = buildPrompt(vp, project);

  try {
    const result = await generateImage({
      providerId: vp.engine,
      prompt,
      floorplanDataUrl: project.floorplan?.dataUrl,
      useMock,
      onStep: (index) => {
        renderGenerationSteps(index, index);
        el('gen-progress-fill').style.width = `${((index) / GENERATION_STEPS.length) * 100}%`;
      },
      onFallback: () => toast('Motor ainda não conectado — gerando em modo demonstração.'),
    });

    renderGenerationSteps(-1, GENERATION_STEPS.length);
    el('gen-progress-fill').style.width = '100%';

    store.updateViewpoint(project.id, vp.id, {
      status: 'ready',
      result: { dataUrl: result.dataUrl, generatedAt: Date.now(), engine: result.providerId },
    });

    setTimeout(() => goTo('result'), 400);
  } catch (err) {
    store.updateViewpoint(project.id, vp.id, { status: 'error' });
    toast(toFriendlyMessage(err));
    goTo('image-config');
  }
}

// ---------------------------------------------------------------------
// TELA 8 — Resultado
// ---------------------------------------------------------------------
function renderResultView() {
  const project = store.getActiveProject();
  const vp = store.getActiveViewpoint();
  if (!project || !vp || !vp.result) { goTo('floorplan'); return; }

  const isMock = vp.result.engine === 'mock';
  const engineLabel = isMock ? 'simulado' : (PROVIDERS[vp.result.engine]?.label || vp.result.engine);
  el('result-meta').textContent = `${project.name} · ${vp.name} · ${engineLabel}`;

  el('result-output-label').textContent = isMock ? 'VISUALIZAÇÃO GERADA (SIMULADA)' : 'VISUALIZAÇÃO GERADA';
  el('result-disclaimer').textContent = isMock
    ? 'Esta imagem é uma simulação local. Nenhuma API de geração foi chamada — a arquitetura já está preparada para receber o retorno real de um provedor.'
    : `Imagem gerada por IA (${engineLabel}) a partir da planta enviada — pode não preservar a geometria com perfeição.`;

  const sourcePane = el('result-source');
  sourcePane.style.backgroundImage = project.floorplan ? `url(${project.floorplan.dataUrl})` : 'none';
  sourcePane.style.backgroundSize = 'cover';
  sourcePane.style.backgroundPosition = 'center';

  const outputPane = el('result-output');
  outputPane.style.backgroundImage = `url(${vp.result.dataUrl})`;
  outputPane.style.backgroundSize = 'cover';
  outputPane.style.backgroundPosition = 'center';
}

// ---------------------------------------------------------------------
// TELA 9 — Galeria
// ---------------------------------------------------------------------
function renderGalleryView() {
  const entries = store.allViewpointsWithResults();
  const filters = buildFilterList(entries);
  const filtered = filterGalleryEntries(entries, galleryFilterState.current);

  el('gallery-filters').innerHTML = filters.map((f) => `
    <button class="chip ${galleryFilterState.current === f.id ? 'is-active' : ''}" data-filter="${f.id}">${escapeHtml(f.name)}</button>
  `).join('');
  el('gallery-filters').querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => { galleryFilterState.current = btn.dataset.filter; renderGalleryView(); });
  });

  el('gallery-empty').hidden = filtered.length > 0;
  el('gallery-grid').innerHTML = filtered.map(({ project, viewpoint }) => `
    <div class="gallery-item" data-open-result="${project.id}:${viewpoint.id}">
      <div class="gallery-item__image" style="background-image:url(${viewpoint.result.dataUrl}); background-size:cover; background-position:center;"></div>
      <div class="gallery-item__meta">
        <div class="gallery-item__title">${escapeHtml(viewpoint.name)}</div>
        <div class="gallery-item__sub">${escapeHtml(project.name)} · ${formatGeneratedAt(viewpoint.result.generatedAt)}</div>
      </div>
    </div>`).join('');

  el('gallery-grid').querySelectorAll('[data-open-result]').forEach((elm) => {
    elm.addEventListener('click', () => {
      const [projectId, viewpointId] = elm.dataset.openResult.split(':');
      store.setActiveProject(projectId);
      store.setActiveViewpoint(viewpointId);
      goTo('result');
    });
  });
}

// ---------------------------------------------------------------------
// TELA 10 — Configurações
// ---------------------------------------------------------------------
function renderSettingsView() {
  const { settings } = store.get();
  el('force-mock').checked = settings.forceMock;

  el('provider-settings').innerHTML = Object.entries(settings.providers).map(([id, p]) => {
    const online = PROVIDERS[id]?.available;
    return `
    <div class="field" style="border:1px solid var(--color-line); border-radius: var(--radius-md); padding: var(--space-4);">
      <label class="field__label">${p.label} <span class="badge ${online ? 'badge--online' : 'badge--offline'}">${online ? 'conectado' : 'não implementado'}</span></label>
      <p class="text-faint" style="font-size: var(--text-xs); margin-top: var(--space-2);">${p.endpointHint}</p>
    </div>
  `;
  }).join('');
}

// ---------------------------------------------------------------------
// Render geral — reage a qualquer mudança de estado
// ---------------------------------------------------------------------
function renderAll() {
  renderRouting();
  const { view } = store.get();
  if (view === 'home') renderHome();
  if (view === 'floorplan') { renderFloorplanMarkers(); renderInspector(); }
  if (view === 'image-config') renderImageConfig();
  if (view === 'engine') renderEngineView();
  if (view === 'result') renderResultView();
  if (view === 'gallery') renderGalleryView();
  if (view === 'settings') renderSettingsView();
}

store.subscribe(renderAll);

// ---------------------------------------------------------------------
// Wiring global de ações (delegação de eventos)
// ---------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) { goTo(navBtn.dataset.nav); return; }

  const openProject = e.target.closest('[data-open-project]');
  if (openProject) { store.setActiveProject(openProject.dataset.openProject); goTo('floorplan'); return; }

  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  switch (action) {
    case 'open-new-project':
      modalNewProject.hidden = false;
      el('new-project-name').focus();
      break;
    case 'close-new-project':
      modalNewProject.hidden = true;
      break;
    case 'create-project': {
      const name = el('new-project-name').value;
      const description = el('new-project-desc').value;
      if (!name.trim()) { toast('Dê um nome ao projeto.'); return; }
      store.createProject({ name, description });
      el('new-project-name').value = '';
      el('new-project-desc').value = '';
      modalNewProject.hidden = true;
      goTo('floorplan');
      break;
    }
    case 'zoom-in': floorplanCanvas?.zoomBy(1.2); break;
    case 'zoom-out': floorplanCanvas?.zoomBy(0.8); break;
    case 'zoom-reset': floorplanCanvas?.fitToView(); break;
    case 'deselect-point': store.setActiveViewpoint(null); break;
    case 'delete-point': {
      const project = store.getActiveProject();
      const vp = store.getActiveViewpoint();
      if (project && vp) store.deleteViewpoint(project.id, vp.id);
      break;
    }
    case 'go-to-image-config': goTo('image-config'); break;
    case 'back-to-floorplan': goTo('floorplan'); break;
    case 'go-to-engine': {
      const vp = store.getActiveViewpoint();
      if (!vp?.style || !vp?.lighting || !vp?.furniture) { toast('Escolha estilo, iluminação e mobiliário.'); return; }
      goTo('engine');
      break;
    }
    case 'back-to-config': goTo('image-config'); break;
    case 'start-generation': {
      const vp = store.getActiveViewpoint();
      if (!vp?.engine) { toast('Escolha um motor de geração.'); return; }
      goTo('generation');
      runGeneration();
      break;
    }
    case 'cancel-generation':
      clearTimeout(generationTimer);
      goTo('engine');
      break;
    case 'regenerate': goTo('engine'); break;
    case 'save-to-gallery':
      toast('Imagem salva na galeria.');
      goTo('gallery');
      break;
    case 'back-to-floorplan-from-result': goTo('floorplan'); break;
    case 'reset-app':
      if (confirm('Isto apaga todos os projetos, plantas e imagens salvos neste navegador. Continuar?')) {
        store.resetAll();
        goTo('home');
      }
      break;
  }
});

el('force-mock').addEventListener('change', (e) => store.updateSettings({ forceMock: e.target.checked }));

// ---------- Upload de planta ----------
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFloorplanFile(e.target.files?.[0]));

['dragover', 'dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.toggle('is-dragover', evt === 'dragover');
  });
});
dropzone.addEventListener('drop', (e) => handleFloorplanFile(e.dataTransfer.files?.[0]));

function handleFloorplanFile(file) {
  if (!file) return;
  const project = store.getActiveProject();
  if (!project) return;
  if (!file.type.startsWith('image/')) { toast(toFriendlyMessage(new AppError('INVALID_FILE'))); return; }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      store.setFloorplan(project.id, { dataUrl: reader.result, width: img.width, height: img.height, name: file.name });
      toast('Planta carregada.');
      analyzeCurrentFloorplan(project.id, reader.result);
    };
    img.onerror = () => toast(toFriendlyMessage(new AppError('FLOORPLAN_UNREADABLE')));
    img.src = reader.result;
  };
  reader.onerror = () => toast(toFriendlyMessage(new AppError('FLOORPLAN_UNREADABLE')));
  reader.readAsDataURL(file);
}

// ANALISAR PLANTA — dispara em segundo plano assim que a planta é
// carregada, para sugerir os ambientes usados no inspetor. Hoje via
// mock; ETAPA 10 troca por análise real do Gemini sem mudar nada aqui.
async function analyzeCurrentFloorplan(projectId, floorplanDataUrl) {
  const { settings } = store.get();
  try {
    const analysis = await analyzeFloorplan(floorplanDataUrl, {
      providerId: 'gemini',
      useMock: settings.forceMock,
      onFallback: () => {},
    });
    store.setFloorplanAnalysis(projectId, analysis);
    if (analysis.suggestedEnvironments?.length) {
      toast(`Planta analisada · ${analysis.suggestedEnvironments.length} ambientes sugeridos`);
    }
  } catch (err) {
    // Análise é um auxílio, não um bloqueio: falhar aqui não deve
    // impedir o usuário de continuar posicionando câmeras manualmente.
    console.warn('[app] análise da planta falhou, seguindo sem sugestões', err);
  }
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
renderAll();
