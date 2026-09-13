// promptBuilder.js — VISIO 3D
// Transforma dados da planta + do ponto de visão num prompt técnico
// estruturado. Isolado da UI e de qualquer provedor específico: tanto
// o modo mock quanto um provedor real (Gemini, KIE, GPT Image...)
// recebem exatamente o mesmo objeto.
//
// Regra central do produto: "visualizar a arquitetura sem alterar a
// arquitetura". Por isso este módulo sempre acompanha o pedido de uma
// lista de preservação e de instruções negativas explícitas — a
// geração de imagem nunca deve ser livre para reinventar a planta.

export const PRESERVE_LIST = [
  'paredes', 'portas', 'janelas', 'proporções dos ambientes',
  'circulação entre os cômodos', 'aberturas', 'geometria arquitetônica geral',
  'posição, tipo e orientação exatos de cada móvel indicado na planta',
  'posição e lado de abertura exatos de cada porta e janela',
  'objetos de decoração indicados na planta (tapetes, quadros, plantas, luminárias etc.)',
];

export const NEGATIVE_INSTRUCTIONS = [
  'Não mover paredes de lugar.',
  'Não criar portas que não existem na planta original.',
  'Não remover portas existentes.',
  'Não criar janelas que não existem na planta original.',
  'Não remover janelas existentes.',
  'Não alterar as dimensões ou proporções dos ambientes.',
  'Não trocar a função/ambiente de um cômodo por outro.',
  'Não modificar a circulação entre os cômodos.',
  'Não criar cômodos que não existem na planta original.',
  'Não mover, adicionar ou remover móveis em relação ao que está desenhado na planta.',
  'Não inventar objetos de decoração que não estão indicados na planta.',
  'Não alterar a posição ou o lado de abertura de portas e janelas.',
];

/**
 * @param {object} viewpoint - ponto de visão (ver state.js)
 * @param {object} project - projeto ativo (ver state.js)
 * @returns {object} prompt técnico estruturado
 */
export function buildPrompt(viewpoint, project) {
  return {
    principle: 'Visualizar a arquitetura sem alterar a arquitetura.',
    preserve: PRESERVE_LIST,
    negativeInstructions: NEGATIVE_INSTRUCTIONS,
    project: project?.name || null,
    floorplanAnalysis: project?.floorplanAnalysis || null,
    viewpoint: {
      name: viewpoint.name,
      environment: viewpoint.environment || null,
      position: { x: viewpoint.x, y: viewpoint.y },
      direction_deg: viewpoint.direction,
      height_m: viewpoint.height,
      fov_deg: viewpoint.fov,
      perspective: 'fotografia arquitetônica, ponto de vista humano, lente correspondente ao campo de visão informado',
    },
    style: viewpoint.style,
    lighting: viewpoint.lighting,
    furniture: viewpoint.furniture,
    realism: 'realismo fotográfico, iluminação fisicamente coerente com o horário/estilo escolhido',
  };
}
