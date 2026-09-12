// providers/openaiProvider.js — VISIO 3D
//
// Motor de geração de imagem (GPT Image / OpenAI). Mesma interface e
// mesmas regras de segurança de kieProvider.js — chave só no backend,
// nunca no navegador.
//
// Ainda não implementado: toda chamada cai em ProviderUnavailableError
// e o registry.js volta automaticamente para o mock.

import { createUnimplementedProvider } from './unimplemented.js';

export const openaiProvider = createUnimplementedProvider('gptimage');
