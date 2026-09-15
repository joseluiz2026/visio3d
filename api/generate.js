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

/** Rótulo cardeal aproximado — só para leitura humana no texto enviado à IA. Duplicado de camera.js (ESM) porque este arquivo roda como função serverless CommonJS. */
function directionLabel(deg) {
  const dirs = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
  const normalized = ((Math.round(deg) % 360) + 360) % 360;
  return dirs[Math.round(normalized / 45) % 8];
}

/** Achata o prompt técnico estruturado (promptBuilder.js) em instrução textual para a KIE/Nano Banana. */
function buildTextInstruction(prompt) {
  const lines = [];
  lines.push('Você é um renderizador de visualização arquitetônica. Antes de gerar, analise cuidadosamente a planta baixa de referência inteira, para entender a geometria de TODOS os ambientes: paredes, portas, janelas, móveis (tipo, posição e orientação de cada um) e objetos de decoração (tapetes, quadros, plantas, luminárias etc.). Mas a imagem final deve mostrar APENAS o que é visto a partir de um único ponto de vista dentro dessa planta — o ponto de vista especificado mais abaixo — e não a planta inteira nem vários ambientes combinados. Gere uma imagem fotorrealista, em alta qualidade, em primeira pessoa, reproduzindo os elementos da planta na mesma posição relativa observada nela — a planta é a referência geométrica exata, não uma sugestão livre, mas só o que está dentro do campo de visão da câmera pode aparecer na imagem final.');
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
  if (Array.isArray(prompt.descriptionPoints) && prompt.descriptionPoints.length) {
    lines.push('PONTOS DE DESCRIÇÃO (informações adicionais fornecidas pelo autor do projeto sobre elementos específicos — complementam a planta, nunca a substituem; listados por prioridade, do mais rígido ao mais aberto):');
    prompt.descriptionPoints.forEach((p) => {
      lines.push(`- ${p.id} [${p.status}] — ${p.type}${p.definition ? ': ' + p.definition : ''}`);
      const pos = p.position_m
        ? `X=${p.position_m.x.toFixed(2)}m Y=${p.position_m.y.toFixed(2)}m`
        : `posição relativa na planta X=${(p.position_norm.x * 100).toFixed(1)}% Y=${(p.position_norm.y * 100).toFixed(1)}%`;
      lines.push(`  Posição: ${pos}`);
      const dims = p.dimensions_m || {};
      const dimParts = [];
      if (dims.width != null) dimParts.push(`largura ${dims.width}m`);
      if (dims.depth != null) dimParts.push(`profundidade ${dims.depth}m`);
      if (dims.height != null) dimParts.push(`altura ${dims.height}m`);
      if (dimParts.length) lines.push(`  Dimensões: ${dimParts.join(', ')}`);
      if (p.floorHeight_m != null) lines.push(`  Altura do solo: ${p.floorHeight_m}m`);
      if (p.rotation_deg != null) lines.push(`  Orientação: ${p.rotation_deg}°`);
      if (p.observation) lines.push(`  Observação: ${p.observation}`);
    });
    lines.push('');
    lines.push('REGRA DOS PONTOS FIXADOS: todo Ponto de Descrição marcado como [FIXADO] é uma restrição rígida do projeto — é PROIBIDO mover, remover, redimensionar, girar ou reinterpretar esse elemento, mesmo que pareça esteticamente melhor de outro jeito. Pontos [DEFINIDO] devem ser respeitados fielmente. Pontos [SUGERIDO] servem de apoio à interpretação, mas permitem ajuste se necessário. Em caso de conflito entre estética e o que o projeto informa, o projeto sempre vence.');
    lines.push('');
  }
  if (prompt.viewpoint) {
    const vp = prompt.viewpoint;
    const pos = vp.position_m
      ? `X=${vp.position_m.x.toFixed(2)}m Y=${vp.position_m.y.toFixed(2)}m`
      : `posição relativa na planta X=${(vp.position_norm.x * 100).toFixed(1)}% Y=${(vp.position_norm.y * 100).toFixed(1)}%`;
    lines.push(`PONTO DE VISTA (posição exata da câmera dentro da planta): ambiente "${vp.environment || 'não especificado'}", localizado em ${pos} da planta de referência. A câmera está PARADA NESSE PONTO EXATO, na altura dos olhos de ${vp.height_m}m, olhando na direção ${vp.direction_deg}° (${directionLabel(vp.direction_deg)}), com campo de visão de ${vp.fov_deg}°.`);
    lines.push('');
    lines.push('REGRA DE ENQUADRAMENTO (MUITO IMPORTANTE): esta é uma fotografia em primeira pessoa tirada de UM ÚNICO ponto da planta, olhando em UMA ÚNICA direção — NÃO é uma vista aérea, NÃO é uma planta em estilo "casa de bonecas" com o teto removido, e NÃO deve mostrar a planta inteira nem vários ambientes ao mesmo tempo. Mostre exatamente o que uma pessoa veria parada nesse ponto, olhando para essa direção, dentro do campo de visão informado: apenas o ambiente onde a câmera está (e o que for visível através de uma porta ou abertura alinhada com a direção do olhar). As paredes bloqueiam a visão de ambientes fora do campo de visão — não inclua móveis, cômodos ou elementos de outras partes da planta que a câmera, nessa posição e direção, não conseguiria enxergar.');
    lines.push('');
  }
  if (prompt.style) lines.push(`Estilo arquitetônico: ${prompt.style}.`);
  if (prompt.lighting) lines.push(`Iluminação: ${prompt.lighting}.`);
  if (prompt.furniture) lines.push(`Mobiliário: ${prompt.furniture}.`);
  lines.push('');
  lines.push("Gere uma única imagem final, realista, sem marca d'água e sem texto sobreposto.");
  return lines.join('\n');
}
