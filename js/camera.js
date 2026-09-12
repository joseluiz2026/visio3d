// camera.js — VISIO 3D
// Regras de domínio do "ponto de visão" (câmera sobre a planta).
// Não desenha nada — floorplan.js cuida do canvas. Este módulo apenas
// valida, normaliza e descreve os parâmetros da câmera, para que a UI
// (inspetor) e o construtor de prompt (generator.js) usem a mesma
// fonte de verdade.

export const CAMERA_LIMITS = {
  direction: { min: 0, max: 359, step: 1, unit: '°' },
  height: { min: 0.4, max: 3.0, step: 0.05, unit: 'm' },
  fov: { min: 30, max: 110, step: 1, unit: '°' },
};

export const DEFAULT_ENVIRONMENTS = [
  'Sala de estar', 'Cozinha', 'Quarto', 'Banheiro', 'Varanda',
  'Escritório', 'Hall de entrada', 'Área de serviço', 'Área externa',
];

export function clamp(value, { min, max }) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeDirection(deg) {
  return ((Math.round(deg) % 360) + 360) % 360;
}

/** Rótulo cardeal aproximado — só para leitura humana no inspetor. */
export function directionLabel(deg) {
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(normalizeDirection(deg) / 45) % 8;
  return dirs[index];
}

export function validateViewpoint(vp) {
  const errors = [];
  if (!vp.name || !vp.name.trim()) errors.push('Nome é obrigatório.');
  if (vp.height < CAMERA_LIMITS.height.min || vp.height > CAMERA_LIMITS.height.max) {
    errors.push(`Altura deve estar entre ${CAMERA_LIMITS.height.min}m e ${CAMERA_LIMITS.height.max}m.`);
  }
  if (vp.fov < CAMERA_LIMITS.fov.min || vp.fov > CAMERA_LIMITS.fov.max) {
    errors.push(`Campo de visão deve estar entre ${CAMERA_LIMITS.fov.min}° e ${CAMERA_LIMITS.fov.max}°.`);
  }
  return errors;
}

/** Estágio do ponto de visão dentro do fluxo — usado para decidir navegação. */
export function viewpointStage(vp) {
  if (!vp) return 'none';
  if (vp.result) return 'ready';
  if (vp.style && vp.lighting && vp.furniture && vp.engine) return 'configured';
  if (vp.style || vp.lighting || vp.furniture) return 'configuring';
  return 'created';
}
