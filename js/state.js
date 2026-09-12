// state.js — VISIO 3D
// Estado central da aplicação. Nenhum outro módulo deve manter cópias
// próprias de dados de projeto: eles leem e escrevem através daqui,
// e são notificados via subscribe().

const STORAGE_KEY = 'visio3d.v1';

/** @typedef {'idle'|'floorplan_loaded'|'point_created'|'generating'|'ready'|'error'} ViewpointStatus */

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[state] falha ao ler localStorage, iniciando estado vazio.', e);
    return null;
  }
}

function defaultState() {
  return {
    projects: [],          // { id, name, description, createdAt, floorplan: {dataUrl,width,height} | null, viewpoints: [] }
    activeProjectId: null,
    activeViewpointId: null,
    settings: {
      forceMock: true,
      providers: {
        gemini: { label: 'Gemini', apiKeyConfigured: false, endpointHint: 'via servidor proxy — nunca no cliente' },
        nanobanana: { label: 'Nano Banana', apiKeyConfigured: false, endpointHint: 'via servidor proxy — nunca no cliente' },
        kie: { label: 'KIE', apiKeyConfigured: false, endpointHint: 'via servidor proxy — nunca no cliente' },
        gptimage: { label: 'GPT Image', apiKeyConfigured: false, endpointHint: 'via servidor proxy — nunca no cliente' },
      },
    },
    view: 'home',
  };
}

class Store {
  constructor() {
    const persisted = loadFromStorage();
    this.state = persisted ? { ...defaultState(), ...persisted } : defaultState();
    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    this.persist();
    this.listeners.forEach((fn) => fn(this.state));
  }

  persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[state] falha ao gravar localStorage.', e);
    }
  }

  // ---------- Navegação ----------
  setView(view) {
    this.state.view = view;
    this._emit();
  }

  // ---------- Projetos ----------
  createProject({ name, description }) {
    const project = {
      id: uid('proj'),
      name: name?.trim() || 'Projeto sem nome',
      description: description?.trim() || '',
      createdAt: Date.now(),
      floorplan: null,
      floorplanAnalysis: null, // { rooms, walls, doors, windows, cameraPoints, suggestedEnvironments, source, analyzedAt }
      viewpoints: [],
    };
    this.state.projects.unshift(project);
    this.state.activeProjectId = project.id;
    this.state.activeViewpointId = null;
    this._emit();
    return project;
  }

  getProject(id) {
    return this.state.projects.find((p) => p.id === id) || null;
  }

  getActiveProject() {
    return this.getProject(this.state.activeProjectId);
  }

  setActiveProject(id) {
    this.state.activeProjectId = id;
    this.state.activeViewpointId = null;
    this._emit();
  }

  deleteProject(id) {
    this.state.projects = this.state.projects.filter((p) => p.id !== id);
    if (this.state.activeProjectId === id) {
      this.state.activeProjectId = null;
      this.state.activeViewpointId = null;
    }
    this._emit();
  }

  // ---------- Planta ----------
  setFloorplan(projectId, floorplan) {
    const project = this.getProject(projectId);
    if (!project) return;
    project.floorplan = floorplan; // { dataUrl, width, height, name }
    project.floorplanAnalysis = null; // planta nova invalida a análise anterior
    this._emit();
  }

  setFloorplanAnalysis(projectId, analysis) {
    const project = this.getProject(projectId);
    if (!project) return;
    project.floorplanAnalysis = analysis;
    this._emit();
  }

  // ---------- Pontos de visão (câmeras) ----------
  addViewpoint(projectId, { x, y }) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const index = project.viewpoints.length + 1;
    const viewpoint = {
      id: uid('vp'),
      name: `Ponto ${index}`,
      environment: '',
      x, y,               // coordenadas normalizadas (0–1) relativas à planta
      direction: 0,        // graus, 0 = norte da imagem
      height: 1.6,         // metros
      fov: 70,             // graus
      style: null,
      lighting: null,
      furniture: null,
      engine: null,
      status: 'point_created',
      result: null,         // { dataUrl, generatedAt, engine }
      createdAt: Date.now(),
    };
    project.viewpoints.push(viewpoint);
    this.state.activeViewpointId = viewpoint.id;
    this._emit();
    return viewpoint;
  }

  getViewpoint(projectId, viewpointId) {
    const project = this.getProject(projectId);
    if (!project) return null;
    return project.viewpoints.find((v) => v.id === viewpointId) || null;
  }

  getActiveViewpoint() {
    const project = this.getActiveProject();
    if (!project) return null;
    return project.viewpoints.find((v) => v.id === this.state.activeViewpointId) || null;
  }

  setActiveViewpoint(id) {
    this.state.activeViewpointId = id;
    this._emit();
  }

  updateViewpoint(projectId, viewpointId, patch) {
    const vp = this.getViewpoint(projectId, viewpointId);
    if (!vp) return;
    Object.assign(vp, patch);
    this._emit();
  }

  deleteViewpoint(projectId, viewpointId) {
    const project = this.getProject(projectId);
    if (!project) return;
    project.viewpoints = project.viewpoints.filter((v) => v.id !== viewpointId);
    if (this.state.activeViewpointId === viewpointId) {
      this.state.activeViewpointId = null;
    }
    this._emit();
  }

  // ---------- Configurações ----------
  updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    this._emit();
  }

  updateProviderSetting(providerId, patch) {
    const provider = this.state.settings.providers[providerId];
    if (!provider) return;
    Object.assign(provider, patch);
    this._emit();
  }

  resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    this.state = defaultState();
    this._emit();
  }

  // ---------- Utilidades ----------
  allViewpointsWithResults() {
    const out = [];
    this.state.projects.forEach((project) => {
      project.viewpoints
        .filter((v) => v.result)
        .forEach((v) => out.push({ project, viewpoint: v }));
    });
    return out.sort((a, b) => (b.viewpoint.result.generatedAt || 0) - (a.viewpoint.result.generatedAt || 0));
  }
}

export const store = new Store();
export { uid };
