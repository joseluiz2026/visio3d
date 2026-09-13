// api/generate-status.js — VISIO 3D
//
// Função serverless (Vercel). Consulta o andamento de uma tarefa de
// geração na KIE (kieProvider.js faz polling aqui a cada 3s). A chave
// da KIE nunca sai do servidor.

const KIE_RECORD_INFO_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'KIE_API_KEY não configurada no servidor' });
    return;
  }

  const { taskId } = req.query || {};
  if (!taskId) {
    res.status(400).json({ error: 'taskId obrigatório' });
    return;
  }

  let kieRes;
  try {
    kieRes = await fetch(`${KIE_RECORD_INFO_URL}?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (err) {
    res.status(502).json({ error: `falha de rede ao consultar a KIE (${err.message})` });
    return;
  }

  const body = await kieRes.json().catch(() => null);
  if (!kieRes.ok || !body || !body.data) {
    console.error('[api/generate-status] resposta de erro da KIE', kieRes.status, body);
    res.status(502).json({ error: body?.msg || `KIE HTTP ${kieRes.status}` });
    return;
  }

  const { state, failMsg, progress, resultJson } = body.data;
  let resultUrl = null;
  if (state === 'success' && resultJson) {
    try {
      const parsed = JSON.parse(resultJson);
      resultUrl = Array.isArray(parsed.resultUrls) ? parsed.resultUrls[0] || null : null;
    } catch (err) {
      console.error('[api/generate-status] resultJson malformado', err, resultJson);
    }
  }

  res.status(200).json({ state, progress, failMsg, resultUrl });
};
