// descriptionPointTypes.js — VISIO 3D
// Lista única de tipos de elemento e de estados do Ponto de Descrição.
// Usada tanto pelo formulário (app.js) quanto pelo texto técnico enviado
// à IA (promptBuilder.js), para os dois lugares nunca divergirem.

export const DESCRIPTION_POINT_TYPES = [
  { id: 'architecture', label: 'Arquitetura' },
  { id: 'door', label: 'Porta' },
  { id: 'window', label: 'Janela' },
  { id: 'furniture', label: 'Mobiliário' },
  { id: 'equipment', label: 'Equipamento' },
  { id: 'finish', label: 'Acabamento' },
  { id: 'lighting', label: 'Iluminação' },
  { id: 'decoration', label: 'Decoração' },
  { id: 'camera', label: 'Câmera' },
  { id: 'other', label: 'Outro' },
];

export function typeLabel(dp) {
  if (dp.type === 'other') return dp.typeCustom?.trim() || 'Outro';
  return DESCRIPTION_POINT_TYPES.find((t) => t.id === dp.type)?.label || dp.type;
}

export const STATUS_META = {
  suggested: { label: 'SUGERIDO', icon: '💡' },
  defined: { label: 'DEFINIDO', icon: '📌' },
  fixed: { label: 'FIXADO', icon: '🔒' },
};
