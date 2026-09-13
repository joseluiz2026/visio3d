// providers/geminiProvider.js — VISIO 3D
//
// Papel do Gemini no VISIO 3D (planejado): análise estrutural da planta
// (rooms/walls/doors/windows) para sugerir ambientes no inspetor.
//
// Removida em 2026-09-13 a implementação anterior que gerava imagem via
// Gemini com a chave digitada em Configurações e chamada direta do
// navegador — ver providers/kieProvider.js para o motor de geração real
// atual (chave só no servidor, nunca no navegador). Se/quando a análise
// de planta por Gemini for implementada, ela também deve passar por um
// endpoint de servidor (ex.: POST /api/analyze-floorplan), nunca expor
// a chave no cliente.
//
// Ainda não implementado: toda chamada cai em ProviderUnavailableError
// e o registry.js volta automaticamente para o mock.

import { createUnimplementedProvider } from './unimplemented.js';

export const geminiProvider = createUnimplementedProvider('gemini');
