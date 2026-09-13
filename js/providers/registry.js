// providers/registry.js — VISIO 3D
//
// Ponto único que sabe quais provedores de IA existem e decide qual
// usar. app.js (a interface) NUNCA importa um provedor diretamente —
// só chama as funções abstratas exportadas por generator.js, que por
// sua vez delega para cá. Isso é o que permite trocar/adicionar um
// provedor sem tocar em nenhuma tela.
//
// Contrato que todo provedor deve implementar:
//   analyzeFloorplan(floorplanDataUrl) -> Promise<FloorplanAnalysis>
//   generateImage({ prompt, floorplanDataUrl, onStep }) -> Promise<{dataUrl, providerId, status}>
//   improveImage(dataUrl, options) -> Promise<{dataUrl, applied}>
//   getGenerationStatus(jobId) -> Promise<{status, progress}>
//
// Fallback automático: se o provedor real não estiver implementado ou
// configurado (ProviderUnavailableError), o registry cai para o mock
// silenciosamente e avisa a UI via toFriendlyMessage — o app nunca
// trava por falta de API.

import * as mock from './mockProvider.js';
import { geminiProvider } from './geminiProvider.js';
import { kieProvider } from './kieProvider.js';
import { openaiProvider } from './openaiProvider.js';
import { nanoBananaProvider } from './nanoBananaProvider.js';
import { ProviderUnavailableError, withTimeout } from '../errors.js';

const mockProvider = { id: mock.id, analyzeFloorplan: mock.analyzeFloorplan, generateImage: mock.generateImage, improveImage: mock.improveImage, getGenerationStatus: mock.getGenerationStatus };

const REAL_PROVIDERS = {
  gemini: geminiProvider,
  kie: kieProvider,
  gptimage: openaiProvider,
  nanobanana: nanoBananaProvider,
};

const GENERATION_TIMEOUT_MS = 60_000;
const ANALYSIS_TIMEOUT_MS = 30_000;

function resolve(providerId, useMock) {
  if (useMock) return mockProvider;
  return REAL_PROVIDERS[providerId] || mockProvider;
}

/**
 * @param {object} params
 * @param {string} params.providerId
 * @param {boolean} params.useMock - true força mock mesmo com provedor "configurado"
 * @param {(warning:string)=>void} [params.onFallback] - chamado quando um provedor real falhou e caiu para mock
 */
export async function generateImage({ providerId, prompt, floorplanDataUrl, onStep, useMock, onFallback, apiKey }) {
  const provider = resolve(providerId, useMock);
  try {
    return await withTimeout(provider.generateImage({ prompt, floorplanDataUrl, onStep, providerId, apiKey }), GENERATION_TIMEOUT_MS, providerId);
  } catch (err) {
    if (err instanceof ProviderUnavailableError && provider !== mockProvider) {
      onFallback?.(err.message);
      return withTimeout(mockProvider.generateImage({ prompt, floorplanDataUrl, onStep, providerId }), GENERATION_TIMEOUT_MS, 'mock');
    }
    throw err;
  }
}

export async function analyzeFloorplan(floorplanDataUrl, { providerId = 'gemini', useMock, onFallback } = {}) {
  const provider = resolve(providerId, useMock);
  try {
    return await withTimeout(provider.analyzeFloorplan(floorplanDataUrl), ANALYSIS_TIMEOUT_MS, providerId);
  } catch (err) {
    if (err instanceof ProviderUnavailableError && provider !== mockProvider) {
      onFallback?.(err.message);
      return withTimeout(mockProvider.analyzeFloorplan(floorplanDataUrl), ANALYSIS_TIMEOUT_MS, 'mock');
    }
    throw err;
  }
}

export async function improveImage(dataUrl, options, { providerId, useMock } = {}) {
  const provider = resolve(providerId, useMock);
  try {
    return await provider.improveImage(dataUrl, options);
  } catch (err) {
    if (err instanceof ProviderUnavailableError && provider !== mockProvider) {
      return mockProvider.improveImage(dataUrl, options);
    }
    throw err;
  }
}

export async function getGenerationStatus(jobId, { providerId, useMock } = {}) {
  const provider = resolve(providerId, useMock);
  try {
    return await provider.getGenerationStatus(jobId);
  } catch (err) {
    if (err instanceof ProviderUnavailableError && provider !== mockProvider) {
      return mockProvider.getGenerationStatus(jobId);
    }
    throw err;
  }
}
