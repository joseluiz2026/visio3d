// providers/nanoBananaProvider.js — VISIO 3D
//
// Motor de geração de imagem (Nano Banana / Nano Banana Pro). Mesma
// interface e mesmas regras de segurança de kieProvider.js.
//
// Ainda não implementado: toda chamada cai em ProviderUnavailableError
// e o registry.js volta automaticamente para o mock.

import { createUnimplementedProvider } from './unimplemented.js';

export const nanoBananaProvider = createUnimplementedProvider('nanobanana');
