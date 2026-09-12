// providers/unimplemented.js — VISIO 3D
// Fábrica compartilhada para provedores reais que ainda não têm
// integração implementada. Toda chamada lança ProviderUnavailableError
// — quem consome (registry.js) captura isso e cai para o mock
// automaticamente, mantendo o app funcional em "modo demonstração".
// Quando uma integração real for implementada, o módulo do provedor
// para de usar esta fábrica e passa a ter sua própria lógica.

import { ProviderUnavailableError } from '../errors.js';

export function createUnimplementedProvider(providerId) {
  const fail = () => { throw new ProviderUnavailableError(providerId); };
  return {
    id: providerId,
    analyzeFloorplan: fail,
    generateImage: fail,
    improveImage: fail,
    getGenerationStatus: fail,
  };
}
