// settings.js — VISIO 3D
// Catálogos de opções (estilo, iluminação, mobiliário) e helpers para
// a tela de Configurações. Mantido separado de state.js porque estes
// dados são catálogo estático da aplicação, não estado do usuário.

export const STYLE_OPTIONS = [
  { id: 'contemporaneo', label: 'Contemporâneo', swatch: 'linear-gradient(135deg,#3A4250,#C9A15B)' },
  { id: 'minimalista', label: 'Minimalista', swatch: 'linear-gradient(135deg,#454C57,#5B8DEF)' },
  { id: 'classico', label: 'Clássico', swatch: 'linear-gradient(135deg,#5A4A34,#C9A15B)' },
  { id: 'industrial', label: 'Industrial', swatch: 'linear-gradient(135deg,#4A4A4E,#8A6F3F)' },
];

export const LIGHTING_OPTIONS = [
  { id: 'dia_natural', label: 'Dia — luz natural', swatch: 'linear-gradient(135deg,#E8EAED,#5B8DEF)' },
  { id: 'entardecer', label: 'Entardecer', swatch: 'linear-gradient(135deg,#C9A15B,#8A4A3F)' },
  { id: 'noturna_quente', label: 'Noturna — quente', swatch: 'linear-gradient(135deg,#3A2E1F,#C9A15B)' },
  { id: 'noturna_fria', label: 'Noturna — fria', swatch: 'linear-gradient(135deg,#12151A,#345A9E)' },
];

export const FURNITURE_OPTIONS = [
  { id: 'nenhum', label: 'Sem mobiliário', swatch: 'linear-gradient(135deg,#1E232B,#262B33)' },
  { id: 'minimo', label: 'Mínimo', swatch: 'linear-gradient(135deg,#262B33,#454C57)' },
  { id: 'residencial', label: 'Residencial completo', swatch: 'linear-gradient(135deg,#3A4250,#5B8DEF)' },
  { id: 'corporativo', label: 'Corporativo', swatch: 'linear-gradient(135deg,#20242B,#8A6F3F)' },
];

export function findOption(list, id) {
  return list.find((o) => o.id === id) || null;
}
