// providers/geminiProvider.js — VISIO 3D
//
// Papel do Gemini no VISIO 3D: geração da visualização fotorrealista
// (via Nano Banana Pro, modelo gemini-3-pro-image) a partir da planta
// + prompt técnico. A análise estrutural da planta (rooms/walls/
// doors/windows) continua não implementada — usa o mock por enquanto.
//
// DECISÃO DE SEGURANÇA (2026-09-12, a pedido do usuário): a chave é
// digitada em Configurações e fica salva SOMENTE no localStorage deste
// navegador — a chamada à API do Gemini sai DIRETO do navegador,
// sem passar por servidor. Isso é aceitável porque, hoje, só o próprio
// usuário acessa este app. RISCO: como o site é público, qualquer
// pessoa com acesso às ferramentas de desenvolvedor do navegador
// enquanto o app está aberto pode ler essa chave. Se o app passar a
// ter outros usuários, migrar para uma função de servidor que leia a
// chave de uma variável de ambiente (nunca no cliente) — ver histórico
// do projeto para o desenho dessa função serverless.

import { createUnimplementedProvider } from './unimplemented.js';
import { ProviderUnavailableError, AppError } from '../errors.js';

const fallback = createUnimplementedProvider('gemini');
const MODEL = 'gemini-3-pro-image';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export const geminiProvider = {
  id: 'gemini',
  analyzeFloorplan: fallback.analyzeFloorplan,
  improveImage: fallback.improveImage,
  getGenerationStatus: fallback.getGenerationStatus,

  async generateImage({ prompt, floorplanDataUrl, apiKey }) {
    if (!apiKey) {
      throw new ProviderUnavailableError('gemini', { cause: 'chave não configurada em Configurações' });
    }
    if (!floorplanDataUrl) {
      throw new ProviderUnavailableError('gemini', { cause: 'sem planta carregada para usar como referência' });
    }

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(floorplanDataUrl);
    if (!match) {
      throw new Error('gemini: planta em formato de imagem inesperado');
    }
    const [, mimeType, base64Data] = match;
    const instruction = buildTextInstruction(prompt);

    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          input: [
            { type: 'text', text: instruction },
            { type: 'image', mime_type: mimeType, data: base64Data },
          ],
        }),
      });
    } catch (err) {
      throw new Error(`gemini: falha de rede (${err.message})`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[gemini] resposta de erro', response.status, errText.slice(0, 1000));
      if (response.status === 429) {
        throw new AppError('PROVIDER_RATE_LIMIT', { cause: errText.slice(0, 500) });
      }
      throw new Error(`gemini: HTTP ${response.status}`);
    }

    const data = await response.json();
    const image = extractImage(data);
    if (!image) {
      console.error('[gemini] resposta sem imagem', JSON.stringify(data).slice(0, 2000));
      throw new Error('gemini: resposta sem imagem gerada');
    }

    return {
      dataUrl: `data:${image.mime_type || 'image/png'};base64,${image.data}`,
      providerId: 'gemini',
      status: 'completed',
    };
  },
};

function extractImage(data) {
  if (data.output_image?.data) return data.output_image;
  const steps = Array.isArray(data.steps) ? data.steps : [];
  for (const step of steps) {
    const content = Array.isArray(step.content) ? step.content : [];
    const imagePart = content.find((c) => c.type === 'image' && c.data);
    if (imagePart) return imagePart;
  }
  return null;
}

/** Achata o prompt técnico estruturado (promptBuilder.js) em instrução textual para o Gemini. */
function buildTextInstruction(prompt) {
  const lines = [];
  lines.push('Você é um renderizador de visualização arquitetônica. Gere uma imagem fotorrealista, em alta qualidade, do ambiente descrito abaixo, usando a planta baixa fornecida como referência geométrica exata.');
  lines.push('');
  lines.push('REGRA ABSOLUTA: preserve exatamente a geometria da planta — ' + (prompt.preserve || []).join(', ') + '.');
  lines.push('');
  if (Array.isArray(prompt.negativeInstructions) && prompt.negativeInstructions.length) {
    lines.push('NUNCA faça o seguinte:');
    prompt.negativeInstructions.forEach((rule) => lines.push('- ' + rule));
    lines.push('');
  }
  if (prompt.viewpoint) {
    const vp = prompt.viewpoint;
    lines.push(`Ponto de vista: ambiente "${vp.environment || 'não especificado'}", direção ${vp.direction_deg}°, altura da câmera ${vp.height_m}m, campo de visão ${vp.fov_deg}°, perspectiva fotográfica em ponto de vista humano.`);
  }
  if (prompt.style) lines.push(`Estilo arquitetônico: ${prompt.style}.`);
  if (prompt.lighting) lines.push(`Iluminação: ${prompt.lighting}.`);
  if (prompt.furniture) lines.push(`Mobiliário: ${prompt.furniture}.`);
  lines.push('');
  lines.push("Gere uma única imagem final, realista, sem marca d'água e sem texto sobreposto.");
  return lines.join('\n');
}
