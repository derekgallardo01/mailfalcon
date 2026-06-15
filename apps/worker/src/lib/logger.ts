type Level = 'info' | 'warn' | 'error'

export interface LogEnv {
  ENVIRONMENT: string
  AXIOM_TOKEN?: string
  AXIOM_DATASET?: string
}

export interface LogMeta {
  [key: string]: unknown
}

interface LogRecord {
  _time: string
  level: Level
  msg: string
  env: string
  meta?: LogMeta
}

function emitStdout(rec: LogRecord): void {
  const line = JSON.stringify(rec)
  if (rec.level === 'error') console.error(line)
  else if (rec.level === 'warn') console.warn(line)
  else console.log(line)
}

async function forwardToAxiom(env: LogEnv, rec: LogRecord): Promise<void> {
  if (!env.AXIOM_TOKEN || !env.AXIOM_DATASET) return
  try {
    await fetch(
      `https://api.axiom.co/v1/datasets/${encodeURIComponent(env.AXIOM_DATASET)}/ingest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.AXIOM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([rec]),
      },
    )
  } catch {
    // Swallow — never let logging crash the request.
  }
}

function record(
  level: Level,
  env: LogEnv,
  msg: string,
  meta?: LogMeta,
): LogRecord {
  return {
    _time: new Date().toISOString(),
    level,
    msg,
    env: env.ENVIRONMENT,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  }
}

export interface Logger {
  info(msg: string, meta?: LogMeta): void
  warn(msg: string, meta?: LogMeta): void
  error(msg: string, meta?: LogMeta): void
}

export interface LoggerCtx {
  env: LogEnv
  waitUntil?: (p: Promise<unknown>) => void
}

export function createLogger(ctx: LoggerCtx): Logger {
  const emit = (level: Level, msg: string, meta?: LogMeta): void => {
    const rec = record(level, ctx.env, msg, meta)
    emitStdout(rec)
    // Only ship warn + error to Axiom — keeps free-tier ingest small.
    if (level === 'info') return
    const p = forwardToAxiom(ctx.env, rec)
    if (ctx.waitUntil) ctx.waitUntil(p)
    else void p
  }
  return {
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
  }
}

export function errorMeta(err: unknown): LogMeta {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  return { value: String(err) }
}
