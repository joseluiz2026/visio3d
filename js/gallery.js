// gallery.js — VISIO 3D
// Lógica de agregação da galeria. O estado bruto (resultados por
// ponto de visão) vive em state.js; este módulo só organiza e filtra
// os dados para exibição — a renderização de DOM fica em app.js.

/**
 * @param {ReturnType<import('./state.js').store.allViewpointsWithResults>} entries
 * @param {string} activeFilter - id de projeto, ou 'all'
 */
export function filterGalleryEntries(entries, activeFilter) {
  if (!activeFilter || activeFilter === 'all') return entries;
  return entries.filter((e) => e.project.id === activeFilter);
}

export function buildFilterList(entries) {
  const seen = new Map();
  entries.forEach(({ project }) => {
    if (!seen.has(project.id)) seen.set(project.id, project.name);
  });
  return [{ id: 'all', name: 'Todos os projetos' }, ...[...seen.entries()].map(([id, name]) => ({ id, name }))];
}

export function formatGeneratedAt(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
