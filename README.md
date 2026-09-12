# VISIO 3D

> Visualizar a arquitetura sem alterar a arquitetura.

Protótipo navegável (etapas 1–3 do plano de evolução: UX/UI, protótipo
navegável, funcionamento local). HTML5 + CSS3 + JavaScript puro, sem
frameworks e sem dependências de build — abra `index.html` direto no
navegador ou sirva a pasta com qualquer servidor estático.

## Como rodar

Qualquer servidor estático funciona (é necessário por causa dos módulos
ES e do `localStorage`; `file://` direto pode ter restrições no Chrome):

```bash
cd visio3d
python3 -m http.server 8080
# abrir http://localhost:8080
```

## Estrutura

```
/visio3d
  index.html            todas as 10 telas, ocultas/exibidas via [hidden]
  /css
    reset.css           reset mínimo
    tokens.css          cores, tipografia, espaçamento — design tokens
    layout.css           estrutura (trilho, topo, workspace, responsivo)
    components.css       botões, campos, cartões, galeria, modal, toast
  /js
    state.js            estado central único + persistência (localStorage) + pub/sub
    floorplan.js         canvas: carregar imagem, pan/zoom, desenhar marcadores, capturar cliques
    camera.js            regras de domínio do ponto de visão (limites, validação, rótulos)
    promptBuilder.js      transforma planta + câmera em prompt técnico (preservação + instruções negativas)
    generator.js          fachada pública de IA (generateImage / analyzeFloorplan / improveImage / getGenerationStatus)
    errors.js             erros tipados + tradução para mensagens amigáveis
    gallery.js            agregação/filtro dos resultados para a tela de galeria
    settings.js           catálogos de estilo / iluminação / mobiliário
    app.js                roteamento entre telas + wiring de eventos + renderização
    /providers
      registry.js          decide qual provedor usar e faz fallback automático para o mock
      mockProvider.js       implementação simulada (padrão — nenhuma chamada de rede)
      geminiProvider.js     análise da planta (ETAPA 10 — hoje só a interface, lança "não implementado")
      kieProvider.js        motor de geração de imagem (ETAPA 11 — idem)
      openaiProvider.js     motor de geração de imagem GPT Image (idem)
      nanoBananaProvider.js motor de geração de imagem Nano Banana (idem)
      unimplemented.js      fábrica compartilhada pelos provedores reais ainda não implementados
```

Nenhum módulo de domínio (`state`, `floorplan`, `camera`, `generator`,
`gallery`, `settings`) manipula o DOM diretamente fora do que lhe compete
— `app.js` é o único orquestrador. Isso permite trocar a camada visual
no futuro (ex.: reescrever `app.js` com um framework) sem tocar nas
regras de negócio.

## Telas

As 10 telas do briefing existem, mas "Criar ponto de visão" (tela 4) foi
integrada ao inspetor lateral da tela "Planta" (tela 3), como um painel
contextual que aparece ao clicar num marcador — em vez de uma tela cheia
separada. Isso segue o modelo de ferramentas profissionais (Figma,
Rhino): editar um objeto no mesmo lugar onde ele existe, sem trocar de
contexto. Se preferir uma tela dedicada e separada, é uma mudança
localizada em `app.js` (função `renderInspector`) e no HTML.

1. **Início** — lista de projetos, criar novo projeto.
2. **Novo projeto** — modal (nome + descrição).
3. **Planta** — canvas com pan/zoom, upload de planta (dispara análise
   automática em segundo plano — hoje via mock, ETAPA 10 conecta o
   Gemini — que sugere os ambientes usados no inspetor), clique cria
   câmera.
4. **Ponto de visão** — painel do inspetor: posição, direção (arraste a
   alça azul no canvas ou o slider), altura, campo de visão, ambiente.
5. **Configuração da imagem** — estilo, iluminação, mobiliário.
6. **Motor de IA** — Gemini / Nano Banana / KIE / GPT Image, todos
   simulados até uma chave real ser conectada.
7. **Geração** — etapas simuladas + barra de progresso.
8. **Resultado** — comparação planta/ponto × imagem gerada.
9. **Galeria** — todas as imagens geradas, filtráveis por projeto.
10. **Configurações** — modo mock, campos de chave por provedor (nunca
    persistidos de verdade neste protótipo — ver `app.js`,
    `renderSettingsView`).

## Modo mock, provedores de IA e integração futura

`generator.js` é a única porta de entrada que `app.js` conhece — expõe
quatro funções abstratas e nunca revela qual provedor está por trás:

```js
generateImage({ providerId, prompt, floorplanDataUrl, useMock, onStep, onFallback })
analyzeFloorplan(floorplanDataUrl, { providerId, useMock, onFallback })
improveImage(dataUrl, options, { providerId, useMock })
getGenerationStatus(jobId, { providerId, useMock })   // para provedores reais baseados em fila/polling
```

Por trás dessa fachada, `providers/registry.js` decide qual provedor
efetivamente executa (`providers/mockProvider.js`, `geminiProvider.js`,
`kieProvider.js`, `openaiProvider.js`, `nanoBananaProvider.js`) e aplica
timeout + fallback automático: se um provedor real ainda não estiver
implementado/configurado, ou falhar, o registry cai para o mock sem
travar o app — só avisa a UI via `onFallback`. Isso é o que garante o
"modo demonstração" mesmo com uma chave real cadastrada, mas cuja
integração ainda não foi implementada.

Hoje **todo** provedor real (`gemini`, `kie`, `gptimage`, `nanobanana`)
lança `ProviderUnavailableError` para qualquer chamada — são só a
"forma" da interface, documentada com o código de exemplo de como a
chamada real ficaria (comentário em cada arquivo). Só `mockProvider.js`
tem lógica de verdade: desenha uma imagem de demonstração em `<canvas>`
(nenhum asset externo, nenhuma imagem de terceiro) e resolve depois de
um atraso artificial com etapas, para que a experiência completa
(progresso, resultado, galeria) seja testável sem qualquer API.

Para conectar um provedor real (ex.: Gemini, ETAPA 10):

1. Implementar a mesma assinatura de função dentro do arquivo do
   provedor (ex.: `providers/geminiProvider.js`), substituindo o
   `createUnimplementedProvider(...)` pela lógica real.
2. **A chamada real nunca deve sair direto do navegador com a chave
   de API.** Ela deve ir a um endpoint de servidor próprio (ex.:
   `/api/generate`, `/api/analyze-floorplan`), que guarda a chave como
   variável de ambiente no backend/serverless e repassa a chamada ao
   provedor. Nada muda em `generator.js` nem em `app.js` — só a
   implementação dentro do arquivo do provedor.

O campo de chave em Configurações é só um indicador de UI
(`apiKeyConfigured: true/false`); o valor digitado nunca é gravado em
`localStorage` ou em qualquer lugar do código — isso é proposital.

## Tratamento de erros

`errors.js` centraliza toda mensagem exibida ao usuário
(`ERROR_MESSAGES`) e nunca deixa um erro técnico bruto chegar à UI —
`toFriendlyMessage(err)` traduz qualquer exceção para uma mensagem
segura e registra o detalhe técnico no console. Cobre hoje: arquivo
inválido, planta ilegível, provedor não configurado (fallback
silencioso), timeout de geração (60s) e falha genérica de geração.

## Preservação da arquitetura

O princípio "visualizar sem alterar" está refletido em `buildPrompt()`
(`promptBuilder.js`), que sempre inclui a lista de elementos a
preservar (paredes, portas, janelas, proporções, circulação, aberturas,
geometria) **e** uma lista de instruções negativas explícitas (não
mover paredes, não criar/remover portas ou janelas, não alterar
dimensões, não trocar ambiente, não modificar circulação, não criar
cômodos inexistentes) junto com os parâmetros do ponto de visão e o
resultado da análise da planta (`project.floorplanAnalysis`) — isso é o
que seria enviado a qualquer provedor real de geração de imagem.

## Próximas etapas sugeridas (do plano original)

4. Gerenciamento de plantas — múltiplas plantas por projeto, páginas de PDF.
5. Refinar câmeras — arraste de cone de FOV, snapping a paredes.
6. Prompt técnico mais completo (dimensões reais, escala da planta).
9. ✅ Abstração de provedores pronta (`providers/registry.js`) — falta
   só a lógica real dentro de cada arquivo de provedor.
10. Integração real com Gemini (análise) e KIE/GPT Image/Nano Banana
    (geração) — requer um endpoint de servidor/serverless para nunca
    expor as chaves no navegador. **Decisão pendente:** onde hospedar
    esse endpoint (ex.: Vercel Functions) — nenhuma API real foi
    conectada ainda.
11. Armazenamento: hoje é só `localStorage` por projeto/navegador —
    imagens em base64 podem esbarrar no limite de ~5-10MB do navegador
    com poucos projetos reais. Migrar imagens para IndexedDB (mantendo
    metadados em `localStorage`) antes de usar com plantas/galerias
    grandes; Supabase é a opção de nuvem já usada em outros projetos.
12. Testes automatizados de interação (hoje o teste é manual/navegável).
13. Publicação.
