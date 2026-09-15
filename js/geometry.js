// geometry.js — VISIO 3D
// Conversão entre coordenadas normalizadas (0-1, usadas internamente por
// todos os marcadores da planta) e metros reais. Só existe conversão para
// metros quando o usuário informou a largura real da planta
// (project.floorplan.realWidthMeters) — sem essa calibração, nunca se
// inventa uma escala.

export function hasScale(project) {
  return !!(project?.floorplan?.realWidthMeters && project.floorplan.width && project.floorplan.height);
}

/** Metros correspondentes a 1.0 normalizado, em X e Y (Y usa a proporção da imagem). */
export function metersPerNorm(project) {
  const { floorplan } = project;
  const realWidthMeters = floorplan.realWidthMeters;
  const realHeightMeters = realWidthMeters * (floorplan.height / floorplan.width);
  return { x: realWidthMeters, y: realHeightMeters };
}

export function normToMeters(project, norm) {
  if (!hasScale(project)) return null;
  const per = metersPerNorm(project);
  return { x: norm.x * per.x, y: norm.y * per.y };
}

export function metersToNorm(project, meters) {
  if (!hasScale(project)) return null;
  const per = metersPerNorm(project);
  return {
    x: Math.min(Math.max(meters.x / per.x, 0), 1),
    y: Math.min(Math.max(meters.y / per.y, 0), 1),
  };
}
