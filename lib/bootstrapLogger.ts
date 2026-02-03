type BootstrapPayload = Record<string, unknown>;

type BootstrapStatus = {
  status: 'started' | 'succeeded' | 'failed';
  startedAt: number;
  finishedAt?: number;
  payload?: BootstrapPayload;
  error?: { message?: string; stack?: string };
};

const steps = new Map<string, BootstrapStatus>();

function serializePayload(payload?: BootstrapPayload): string {
  if (!payload || Object.keys(payload).length === 0) return '';
  try {
    return JSON.stringify(payload);
  } catch {
    return '[unserializable]';
  }
}

function formatError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: typeof err === 'string' ? err : 'Unknown error' };
}

export function logStart(tag: string, payload?: BootstrapPayload) {
  if (!__DEV__) return;
  steps.set(tag, { status: 'started', startedAt: Date.now(), payload });
  const serialized = serializePayload(payload);
  console.log(`[BOOT] start tag=${tag}${serialized ? ` payload=${serialized}` : ''}`);
}

export function logSuccess(tag: string, payload?: BootstrapPayload) {
  if (!__DEV__) return;
  const existing = steps.get(tag);
  steps.set(tag, {
    status: 'succeeded',
    startedAt: existing?.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    payload,
  });
  const serialized = serializePayload(payload);
  console.log(`[BOOT] success tag=${tag}${serialized ? ` payload=${serialized}` : ''}`);
}

export function logFailure(tag: string, error: unknown, payload?: BootstrapPayload) {
  if (!__DEV__) return;
  const existing = steps.get(tag);
  const err = formatError(error);
  steps.set(tag, {
    status: 'failed',
    startedAt: existing?.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    payload,
    error: err,
  });
  const serialized = serializePayload(payload);
  console.log(
    `[BOOT] failure tag=${tag} error=${err.message ?? 'Unknown error'}${
      err.stack ? ` stack=${err.stack}` : ''
    }${serialized ? ` payload=${serialized}` : ''}`
  );
}

export function logSummary() {
  if (!__DEV__) return;
  const parts = Array.from(steps.entries()).map(([tag, info]) => {
    const payload = serializePayload(info.payload);
    const err = info.error?.message ? ` error=${info.error.message}` : '';
    return `${tag}:${info.status}${payload ? ` payload=${payload}` : ''}${err}`;
  });
  console.log(`[BOOTSTRAP_SUMMARY] ${parts.join(' | ')}`);
}
