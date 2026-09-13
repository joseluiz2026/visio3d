// providers/kieProvider.js — VISIO 3D
//
// Motor de geração de imagem real (KIE, modelo google/nano-banana-edit —
// trocado de nano-banana-pro em 2026-09-13 por ser ~8x mais barato,
// mesma capacidade de imagem-referência). Recebe
// o prompt técnico já pronto (ver promptBuilder.js) e devolve a
// visualização gerada.
//
// SEGURANÇA: a chave da API da KIE nunca sai do navegador — fica só em
// variável de ambiente no servidor (Vercel). Este módulo chama dois
// endpoints próprios:
//   POST /api/generate         -> sobe a planta, aciona a KIE, devolve { taskId }
//   GET  /api/generate-status  -> consulta o andamento de um taskId
// e faz o polling aqui no navegador, escondendo esse detalhe do resto
// do app (generator.js/app.js só veem generateImage devolver o
// resultado final, como qualquer outro provedor).
//
// Se KIE_API_KEY não estiver configurada no servidor, /api/generate
// responde 503 e isso vira ProviderUnavailableError — o registry.js
// cai para o mock automaticamente, sem travar o app.

import { createUnimplementedProvider } from './unimplemented.js';
import { ProviderUnavailableError, AppError } from '../errors.js';
import { GENERATION_STEPS } from './mockProvider.js';

const fallback = createUnimplementedProvider('kie');
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 55_000; // margem sob o timeout de 60s do registry.js

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const kieProvider = {
  id: 'kie',
  analyzeFloorplan: fallback.analyzeFloorplan,
  improveImage: fallback.improveImage,

  async generateImage({ prompt, floorplanDataUrl, onStep }) {
    if (!floorplanDataUrl) {
      throw new ProviderUnavailableError('kie', { cause: 'sem planta carregada para usar como referência' });
    }

    let submitRes;
    try {
      submitRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, floorplanDataUrl }),
      });
    } catch (err) {
      throw new Error(`kie: falha de rede (${err.message})`);
    }

    if (submitRes.status === 503) {
      throw new ProviderUnavailableError('kie', { cause: 'chave da KIE não configurada no servidor' });
    }
    if (!submitRes.ok) {
      const body = await submitRes.json().catch(() => ({}));
      if (submitRes.status === 429) throw new AppError('PROVIDER_RATE_LIMIT', { cause: body.error });
      throw new Error(`kie: HTTP ${submitRes.status} ${body.error || ''}`);
    }

    const { taskId } = await submitRes.json();
    const startedAt = Date.now();
    let stepIndex = 0;

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await wait(POLL_INTERVAL_MS);
      onStep?.(Math.min(stepIndex++, GENERATION_STEPS.length - 1));

      let statusRes;
      try {
        statusRes = await fetch(`/api/generate-status?taskId=${encodeURIComponent(taskId)}`);
      } catch {
        continue; // falha de rede pontual no polling — tenta de novo até o timeout
      }
      if (!statusRes.ok) continue;

      const status = await statusRes.json();
      if (status.state === 'success' && status.resultUrl) {
        return { dataUrl: status.resultUrl, providerId: 'kie', status: 'completed' };
      }
      if (status.state === 'fail') {
        throw new Error(`kie: geração falhou (${status.failMsg || 'sem detalhes'})`);
      }
    }

    throw new Error('kie: tempo esgotado aguardando a geração');
  },

  getGenerationStatus: fallback.getGenerationStatus,
};
