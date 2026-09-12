// providers/geminiProvider.js — VISIO 3D
//
// Papel do Gemini no VISIO 3D: análise da planta (ambientes, paredes,
// portas, janelas) e preparação do prompt técnico — não a geração da
// imagem final em si (isso fica a cargo de um motor de imagem, ex.:
// Nano Banana / GPT Image, ver kieProvider.js / openaiProvider.js).
//
// SEGURANÇA: a chave da API do Gemini NUNCA deve ser usada direto do
// navegador. A implementação real deste módulo deve chamar um
// endpoint de servidor próprio (ex.: POST /api/analyze-floorplan), que
// guarda a chave como variável de ambiente no backend/serverless e
// repassa a chamada à API do Gemini. Nada na assinatura das funções
// abaixo muda quando isso for implementado — só o corpo delas.
//
// Ainda não implementado: toda chamada cai em ProviderUnavailableError
// e o registry.js volta automaticamente para o mock.

import { createUnimplementedProvider } from './unimplemented.js';

export const geminiProvider = createUnimplementedProvider('gemini');

// Referência para a implementação real (ETAPA 10):
//
// export async function analyzeFloorplan(floorplanDataUrl) {
//   const res = await fetch('/api/analyze-floorplan', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ floorplanDataUrl }),
//   });
//   if (!res.ok) throw new Error(`gemini analyze-floorplan: HTTP ${res.status}`);
//   // Espera-se um JSON estruturado no formato:
//   // { rooms: [], walls: [], doors: [], windows: [], cameraPoints: [] }
//   return res.json();
// }
