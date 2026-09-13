// generator.js — VISIO 3D
// Fachada pública da geração de IA. app.js só conhece este módulo —
// nunca importa um provedor diretamente. A escolha de qual provedor
// realmente executa (mock ou real) e o fallback automático em caso de
// falha ficam em providers/registry.js.

import { GENERATION_STEPS as MOCK_STEPS } from './providers/mockProvider.js';
import * as registry from './providers/registry.js';

export const PROVIDERS = {
  kie: { id: 'kie', label: 'KIE (Nano Banana)', vendor: 'KIE', speedHint: '~20s', costHint: 'baixo', available: true },
  gemini: { id: 'gemini', label: 'Gemini', vendor: 'Google', speedHint: '~15s', costHint: 'médio', available: false },
  nanobanana: { id: 'nanobanana', label: 'Nano Banana', vendor: 'Nano Banana', speedHint: '~10s', costHint: 'baixo', available: false },
  gptimage: { id: 'gptimage', label: 'GPT Image', vendor: 'OpenAI', speedHint: '~25s', costHint: 'alto', available: false },
};

// Etapas exibidas na tela de geração. Hoje refletem o mock; quando um
// provedor real reportar suas próprias etapas via onStep, isto pode
// virar dinâmico por provedor.
export const GENERATION_STEPS = MOCK_STEPS;

/**
 * @param {{providerId: string, prompt: object, floorplanDataUrl: string, useMock: boolean, onStep?: (i:number)=>void, onFallback?: (msg:string)=>void}} params
 * @returns {Promise<{dataUrl: string, providerId: string, status: string}>}
 */
export async function generateImage(params) {
  return registry.generateImage(params);
}

/** Análise da planta (ambientes, paredes, portas, janelas) — hoje via mock; ETAPA 10 conecta o Gemini. */
export async function analyzeFloorplan(floorplanDataUrl, options) {
  return registry.analyzeFloorplan(floorplanDataUrl, options);
}

/** Melhorias pós-geração (upscale, correção). Ponto de extensão futuro. */
export async function improveImage(dataUrl, options, providerOptions) {
  return registry.improveImage(dataUrl, options, providerOptions);
}

/** Status de um job assíncrono — relevante para provedores reais baseados em polling. */
export async function getGenerationStatus(jobId, providerOptions) {
  return registry.getGenerationStatus(jobId, providerOptions);
}
