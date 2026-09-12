// providers/kieProvider.js — VISIO 3D
//
// Motor de geração de imagem (KIE). Recebe o prompt técnico já pronto
// (ver promptBuilder.js) e devolve a visualização gerada.
//
// SEGURANÇA: a chave da API da KIE nunca deve sair do navegador. A
// implementação real deve chamar um endpoint de servidor próprio
// (ex.: POST /api/generate) que guarda a chave no backend/serverless.
//
// APIs de geração de imagem costumam ser assíncronas (submete um job e
// consulta status depois) — por isso getGenerationStatus() existe na
// interface desde já, mesmo que o mock não precise dele.
//
// Ainda não implementado: toda chamada cai em ProviderUnavailableError
// e o registry.js volta automaticamente para o mock.

import { createUnimplementedProvider } from './unimplemented.js';

export const kieProvider = createUnimplementedProvider('kie');

// Referência para a implementação real (ETAPA 11):
//
// export async function generateImage({ prompt, floorplanDataUrl, onStep }) {
//   const submit = await fetch('/api/generate', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ provider: 'kie', prompt, floorplanDataUrl }),
//   });
//   const { jobId } = await submit.json();
//   onStep?.(0);
//   // poll até status === 'completed' | 'failed', chamando
//   // getGenerationStatus(jobId) em intervalos curtos.
//   return { dataUrl: '...', providerId: 'kie', status: 'completed' };
// }
//
// export async function getGenerationStatus(jobId) {
//   const res = await fetch(`/api/generate/${jobId}`);
//   return res.json(); // { status: 'pending'|'completed'|'failed', progress }
// }
