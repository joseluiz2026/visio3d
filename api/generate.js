// api/generate.js — VISIO 3D
//
// Função serverless (Vercel). Recebe o prompt técnico + a planta (base64)
// direto do navegador, sobe a planta pro Vercel Blob (a KIE só aceita
// URL pública de imagem, não base64), aciona a geração na KIE e devolve
// { taskId } — o navegador faz o polling em /api/generate-status.
//
// A chave da KIE (KIE_API_KEY) só existe aqui, como variável de
// ambiente no servidor. Nunca é enviada ao navegador.

const { put } = require('@vercel/blob');

const KIE_CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'KIE_API_KEY não configurada no servidor' });
    return;
  }

  const { prompt, floorplanDataUrl } = req.body || {};
  if (!floorplanDataUrl) {
    res.status(400).json({ error: 'floorplanDataUrl obrigatório' });
    return;
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(floorplanDataUrl);
  if (!match) {
    res.status(400).json({ error: 'floorplanDataUrl em formato inesperado' });
    return;
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');
  const ext = mimeType.split('/')[1] || 'png';

  let blob;
  try {
    blob = await put(`visio3d/floorplan-${Date.now()}.${ext}`, buffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: true,
    });
  } catch (err) {
    console.error('[api/generate] falha ao subir planta no Blob', err);
    res.status(500).json({ error: 'falha ao preparar a planta para envio' });
    return;
  }

  const instruction = buildTextInstruction(prompt || {});

  let kieRes;
  try {
    kieRes = await fetch(KIE_CREATE_TASK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nano-banana-pro',
        input: {
          prompt: instruction,
          image_input: [blob.url],
          aspect_ratio: 'auto',
          resolution: '2K',
          output_format: 'png',
        },
      }),
    });
  } catch (err) {
    res.status(502).json({ error: `falha de rede ao chamar a KIE (${err.message})` });
    return;
  }

  const kieBody = await kieRes.json().catch(() => null);
  if (!kieRes.ok || !kieBody || kieBody.code !== 200 || !kieBody.data?.taskId) {
    console.error('[api/generate] resposta de erro da KIE', kieRes.status, kieBody);
    res.status(kieRes.status === 429 ? 429 : 502).json({ error: kieBody?.msg || `KIE HTTP ${kieRes.status}` });
    return;
  }

  res.status(200).json({ taskId: kieBody.data.taskId });
};

/** Achata o prompt técnico estruturado (promptBuilder.js) em instrução textual para a KIE/Nano Banana Pro. */
function buildTextInstruction(prompt) {
  const lines = [];
  lines.push('Você é um renderizador de visualização arquitetônica. Antes de gerar, analise cuidadosamente a planta baixa de referência e identifique CADA elemento nela desenhado: paredes, portas, janelas, móveis (tipo, posição e orientação de cada um) e objetos de decoração (tapetes, quadros, plantas, luminárias etc.). Gere uma imagem fotorrealista, em alta qualidade, do ambiente descrito abaixo, reproduzindo esses elementos na mesma posição relativa observada na planta — a planta é a referência geométrica exata, não uma sugestão livre.');
  lines.push('');
  lines.push('REGRA ABSOLUTA: preserve exatamente a geometria da planta — ' + (prompt.preserve || []).join(', ') + '.');
  lines.push('');
  lines.push('FIDELIDADE DE DETALHES (prioridade máxima): a posição de cada móvel, o lado de abertura de cada porta e janela, e cada objeto de decoração visível na planta devem aparecer no mesmo lugar relativo na imagem gerada. Não é permitido reposicionar, substituir, adicionar ou remover nenhum desses elementos.');
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
