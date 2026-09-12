// providers/mockProvider.js — VISIO 3D
// Implementação simulada da interface de provedor de IA. Não faz
// nenhuma chamada de rede — gera tudo localmente. É o provedor padrão
// (usado sempre que nenhum outro está configurado) e também o
// fallback automático quando um provedor real falha ou ainda não está
// implementado, para que o aplicativo nunca fique travado sem imagem.

export const id = 'mock';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const GENERATION_STEPS = [
  'Lendo geometria da planta',
  'Localizando ponto de visão',
  'Preservando paredes e aberturas',
  'Aplicando estilo e iluminação',
  'Renderizando visualização',
  'Finalizando imagem',
];

/** Interface: leitura da planta (ambientes, paredes, portas, janelas). */
export async function analyzeFloorplan(_floorplanDataUrl) {
  await wait(400);
  return {
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    cameraPoints: [],
    // Convenience apenas do mock — um provedor real de visão
    // preencheria rooms[].name em vez desta lista solta.
    suggestedEnvironments: ['Sala de estar', 'Cozinha', 'Quarto 1', 'Quarto 2', 'Banheiro', 'Varanda'],
    source: 'mock',
    analyzedAt: Date.now(),
  };
}

/** Interface: geração da imagem a partir do prompt técnico. */
export async function generateImage({ prompt, providerId, onStep }) {
  for (let i = 0; i < GENERATION_STEPS.length; i++) {
    onStep?.(i);
    await wait(450 + Math.random() * 350);
  }
  const dataUrl = renderPlaceholderImage(prompt, providerId || id);
  return { dataUrl, providerId: providerId || id, status: 'completed' };
}

/** Interface: melhoria pós-geração (upscale, correção). Ponto de extensão futuro. */
export async function improveImage(dataUrl, options = {}) {
  await wait(300);
  return { dataUrl, applied: options };
}

/**
 * Interface: consulta de status de um job assíncrono. O mock nunca
 * tem fila real (generateImage já resolve com o resultado final), mas
 * a função existe para que provedores reais baseados em polling
 * (comuns em geração de imagem/vídeo) sigam a mesma assinatura.
 */
export async function getGenerationStatus(jobId) {
  return { jobId, status: 'completed', progress: 100 };
}

/**
 * Gera uma imagem de demonstração local via canvas — evita depender de
 * assets externos ou de imagens de terceiros. Representa visualmente
 * o resultado como um estudo volumétrico simples e claramente rotulado
 * como simulação, nunca como um render real.
 */
function renderPlaceholderImage(prompt, providerId) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');

  const palettes = {
    contemporaneo: ['#1B1F26', '#3A4250', '#C9A15B'],
    minimalista: ['#20242B', '#454C57', '#5B8DEF'],
    classico: ['#211C17', '#5A4A34', '#C9A15B'],
    industrial: ['#1A1A1C', '#4A4A4E', '#8A6F3F'],
  };
  const key = (prompt.style || 'contemporaneo').toLowerCase();
  const [bg, mid, accent] = palettes[key] || palettes.contemporaneo;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#0D0F13');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height * 0.62);
  const angle = ((prompt.viewpoint?.direction_deg || 0) % 360) * (Math.PI / 180);
  ctx.rotate(angle * 0.05);

  ctx.fillStyle = mid;
  ctx.fillRect(-260, -120, 220, 160);
  ctx.fillRect(-30, -180, 260, 220);
  ctx.fillRect(240, -90, 140, 130);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = -300; i < 320; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, -220);
    ctx.lineTo(i, 160);
    ctx.stroke();
  }

  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(-10, -140, 60, 90);
  ctx.globalAlpha = 1;

  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(0, canvas.height * 0.78, canvas.width, canvas.height * 0.22);

  ctx.fillStyle = 'rgba(237,239,242,0.55)';
  ctx.font = '500 13px monospace';
  ctx.fillText('VISIO 3D · IMAGEM SIMULADA', 24, canvas.height - 44);
  ctx.fillStyle = 'rgba(237,239,242,0.35)';
  ctx.font = '400 12px monospace';
  ctx.fillText(`motor: ${providerId}  ·  estilo: ${prompt.style || '—'}  ·  luz: ${prompt.lighting || '—'}`, 24, canvas.height - 24);

  return canvas.toDataURL('image/png');
}
