// errors.js — VISIO 3D
// Ponto único de tradução de falhas técnicas em mensagens amigáveis.
// Nenhum outro módulo deve construir uma string de erro para o usuário
// final diretamente — sempre lance/retorne um AppError (ou deixe o
// erro subir) e use toFriendlyMessage() na borda da UI (app.js).

export class AppError extends Error {
  constructor(code, { cause } = {}) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

/** Lançado por um provedor real quando ainda não está implementado/configurado. */
export class ProviderUnavailableError extends AppError {
  constructor(providerId, { cause } = {}) {
    super('PROVIDER_NOT_CONFIGURED', { cause });
    this.providerId = providerId;
  }
}

export class TimeoutError extends AppError {
  constructor({ cause } = {}) {
    super('TIMEOUT', { cause });
  }
}

export const ERROR_MESSAGES = {
  INVALID_FILE: 'Este arquivo não parece ser uma imagem válida. Envie um PNG ou JPG.',
  FLOORPLAN_UNREADABLE: 'Não foi possível abrir esta planta. Tente uma imagem mais nítida ou outro arquivo.',
  PROVIDER_NOT_CONFIGURED: 'Este motor de IA ainda não está conectado. Gerando em modo demonstração.',
  PROVIDER_RATE_LIMIT: 'Limite de uso da API foi atingido. Tente novamente em alguns minutos.',
  NETWORK_ERROR: 'Falha de conexão. Verifique sua internet e tente novamente.',
  GENERATION_FAILED: 'Não foi possível gerar a imagem agora. Tente novamente.',
  TIMEOUT: 'A geração demorou mais que o esperado e foi cancelada.',
  STORAGE_FULL: 'O armazenamento local está cheio. Exclua projetos ou imagens antigas para liberar espaço.',
  UNKNOWN: 'Algo deu errado. Tente novamente.',
};

/**
 * Converte qualquer erro em uma mensagem segura para exibir ao usuário.
 * O detalhe técnico é sempre registrado no console, nunca exposto na UI.
 */
export function toFriendlyMessage(err) {
  if (err instanceof AppError) {
    console.warn(`[app] ${err.code}`, err.cause || err);
    return err.message;
  }
  console.error('[app] erro não tratado', err);
  return ERROR_MESSAGES.UNKNOWN;
}

/** Envolve uma promise e rejeita com TimeoutError caso demore demais. */
export function withTimeout(promise, ms, providerId) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError({ cause: `timeout após ${ms}ms (${providerId || '—'})` })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
