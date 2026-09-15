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
        kie: { label: 'KIE (Nano Banana Pro)', endpointHint: 'chave gerenciada no servidor — geração real' },
        gemini: { label: 'Gemini', endpointHint: 'ainda não implementado' },
        nanobanana: { label: 'Nano Banana', endpointHint: 'ainda não implementado' },
        gptimage: { label: 'GPT Image', endpointHint: 'ainda não implementado' },
      },
    },
    view: 'home',
    activeDescriptionPointId: null,
    activeTool: 'viewpoint', // 'viewpoint' | 'description' — o que um clique na planta cria
  };
}

class Store {
  constructor() {
    const persisted = loadFromStorage();
    this.state = persisted ? { ...defaultState(), ...persisted } : defaultState();
    // Migração leve: projetos salvos antes deste recurso não têm
    // descriptionPoints/realWidthMeters — preenche sem exigir um
    // sistema de migração formal.
    this.state.projects = (this.state.projects || []).map((p) => ({
      ...p,
      descriptionPoints: p.descriptionPoints || [],
      floorplan: p.floorplan ? { realWidthMeters: null, ...p.floorplan } : p.floorplan,
    }));
    if (this.state.activeDescriptionPointId === undefined) this.state.activeDescriptionPointId = null;
    if (!this.state.activeTool) this.state.activeTool = 'viewpoint';
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
      descriptionPoints: [],
    };
    this.state.projects.unshift(project);
    this.state.activeProjectId = project.id;
    this.state.activeViewpointId = null;
    this.state.activeDescriptionPointId = null;
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
    this.state.activeDescriptionPointId = null;
    this._emit();
  }

  deleteProject(id) {
    this.state.projects = this.state.projects.filter((p) => p.id !== id);
    if (this.state.activeProjectId === id) {
      this.state.activeProjectId = null;
      this.state.activeViewpointId = null;
      this.state.activeDescriptionPointId = null;
    }
    this._emit();
  }

  // ---------- Planta ----------
  setFloorplan(projectId, floorplan) {
    const project = this.getProject(projectId);
    if (!project) return;
    project.floorplan = { realWidthMeters: null, ...floorplan }; // { dataUrl, width, height, name, realWidthMeters }
    project.floorplanAnalysis = null; // planta nova invalida a análise anterior
    this._emit();
  }

  /** Largura real da planta em metros — calibração opcional usada pelos Pontos de Descrição (ver geometry.js). Nunca inventada: fica null até o usuário informar. */
  setFloorplanScale(projectId, realWidthMeters) {
    const project = this.getProject(projectId);
    if (!project || !project.floorplan) return;
    project.floorplan.realWidthMeters = realWidthMeters;
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
    this.state.activeDescriptionPointId = null;
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
    if (id) this.state.activeDescriptionPointId = null;
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

  // ---------- Pontos de Descrição ----------
  // Camada adicional de informação espacial sobre a planta ("o que existe
  // aqui?"), separada dos Pontos de Visão ("de onde estou olhando?"). Nunca
  // substitui a planta — só ajuda a IA a interpretá-la com mais fidelidade.
  addDescriptionPoint(projectId, { x, y }) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const index = project.descriptionPoints.length + 1;
    const point = {
      id: `PD-${String(index).padStart(3, '0')}`,
      type: 'other',
      typeCustom: '',
      definition: '',
      position: { x, y },            // coordenadas normalizadas (0–1), igual aos pontos de visão
      dimensions: { width: null, depth: null, height: null }, // metros; null = não informado (nunca inventado)
      floorHeight: null,             // metros; null = não informado
      rotation: 0,                   // graus
      observation: '',
      status: 'defined',             // suggested | defined | fixed
      createdAt: Date.now(),
    };
    project.descriptionPoints.push(point);
    this.state.activeDescriptionPointId = point.id;
    this.state.activeViewpointId = null;
    this._emit();
    return point;
  }

  getDescriptionPoint(projectId, id) {
    const project = this.getProject(projectId);
    if (!project) return null;
    return project.descriptionPoints.find((p) => p.id === id) || null;
  }

  getActiveDescriptionPoint() {
    const project = this.getActiveProject();
    if (!project) return null;
    return project.descriptionPoints.find((p) => p.id === this.state.activeDescriptionPointId) || null;
  }

  setActiveDescriptionPoint(id) {
    this.state.activeDescriptionPointId = id;
    if (id) this.state.activeViewpointId = null;
    this._emit();
  }

  updateDescriptionPoint(projectId, id, patch) {
    const point = this.getDescriptionPoint(projectId, id);
    if (!point) return;
    Object.assign(point, patch);
    this._emit();
  }

  deleteDescriptionPoint(projectId, id) {
    const project = this.getProject(projectId);
    if (!project) return;
    project.descriptionPoints = project.descriptionPoints.filter((p) => p.id !== id);
    if (this.state.activeDescriptionPointId === id) {
      this.state.activeDescriptionPointId = null;
    }
    this._emit();
  }

  setActiveTool(tool) {
    this.state.activeTool = tool;
    this._emit();
  }

  // ---------- Configurações ----------
  updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
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
