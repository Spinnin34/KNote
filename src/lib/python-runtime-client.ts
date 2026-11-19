import { inputSlot, inputState } from './python-input';

export type PythonRuntimeMessage = {
  type: string;
  id?: number;
  stage?: 'runtime' | 'analysis';
  version?: string;
  jediReady?: boolean;
  message?: string;
  channel?: 'stdout' | 'stderr';
  text?: string;
  result?: unknown;
};

type RuntimeListener = (message: PythonRuntimeMessage) => void;
export type PythonRuntimeConnection = {
  worker: Worker;
  run: (code: string) => number | null;
  stop: (id: number) => boolean;
  submitInput: (id: number, value: string) => 'sent' | 'too-long' | 'unavailable';
  subscribe: (listener: RuntimeListener) => () => void;
};

let connection: PythonRuntimeConnection | null = null;
let messageSequence = 0;

export function nextPythonMessageId(): number {
  messageSequence += 1;
  return messageSequence;
}

function createSharedRuntime(): PythonRuntimeConnection {
  const inputControlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3);
  const inputDataBuffer = new SharedArrayBuffer(64 * 1024);
  const interruptBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const inputControl = new Int32Array(inputControlBuffer);
  const inputData = new Uint8Array(inputDataBuffer);
  const interrupt = new Int32Array(interruptBuffer);
  const listeners = new Set<RuntimeListener>();
  let latestLifecycleMessage: PythonRuntimeMessage | null = null;
  let jediReady = false;
  let activeRunId: number | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;

  function broadcast(message: PythonRuntimeMessage): void {
    if (message.type === 'stage' || message.type === 'ready' || message.type === 'fatal') {
      latestLifecycleMessage = message;
    }
    if (message.type === 'jedi-ready') jediReady = true;
    if (message.type === 'fatal' || (
      activeRunId === message.id && ['run-finished', 'run-stopped', 'run-error'].includes(message.type)
    )) {
      activeRunId = null;
      clearTimeout(stopTimer);
    }
    for (const listener of listeners) listener(message);
  }

  function startWorker(): Worker {
    const nextWorker = new Worker(new URL('../workers/python.worker.ts', import.meta.url), { type: 'module', name: 'knote-python' });
    nextWorker.addEventListener('message', (event: MessageEvent<PythonRuntimeMessage>) => {
      if (worker === nextWorker) broadcast(event.data);
    });
    nextWorker.addEventListener('error', (event) => {
      if (worker === nextWorker) broadcast({ type: 'fatal', message: event.message || 'El trabajador de Python encontró un error.' });
    });
    nextWorker.postMessage({ type: 'initialize', inputControl: inputControlBuffer, inputData: inputDataBuffer, interruptBuffer });
    return nextWorker;
  }

  let worker = startWorker();

  function restartAfterStop(id: number): void {
    if (activeRunId !== id) return;
    worker.terminate();
    jediReady = false;
    broadcast({ type: 'stage', stage: 'runtime' });
    broadcast({ type: 'run-stopped', id });
    try {
      worker = startWorker();
    } catch {
      broadcast({ type: 'fatal', message: 'No se pudo reiniciar Python.' });
    }
  }

  return {
    get worker() { return worker; },
    run(code) {
      if (activeRunId !== null) return null;
      activeRunId = nextPythonMessageId();
      Atomics.store(inputControl, inputSlot.state, inputState.idle);
      Atomics.store(inputControl, inputSlot.length, 0);
      Atomics.store(inputControl, inputSlot.stopped, 0);
      Atomics.store(interrupt, 0, 0);
      worker.postMessage({ type: 'run', id: activeRunId, code });
      return activeRunId;
    },
    stop(id) {
      if (activeRunId !== id || Atomics.exchange(inputControl, inputSlot.stopped, 1) === 1) return false;
      Atomics.store(interrupt, 0, 2);
      Atomics.store(inputControl, inputSlot.state, inputState.stopped);
      Atomics.notify(inputControl, inputSlot.state);
      // A script or library can ignore SIGINT. Reset the interpreter if it does not exit.
      stopTimer = setTimeout(() => restartAfterStop(id), 1500);
      return true;
    },
    submitInput(id, value) {
      if (activeRunId !== id || Atomics.load(inputControl, inputSlot.state) !== inputState.waiting) return 'unavailable';
      const bytes = new TextEncoder().encode(value + '\n');
      if (bytes.length > inputData.length) return 'too-long';
      inputData.set(bytes);
      Atomics.store(inputControl, inputSlot.length, bytes.length);
      Atomics.store(inputControl, inputSlot.state, inputState.submitted);
      Atomics.notify(inputControl, inputSlot.state);
      return 'sent';
    },
    subscribe(listener) {
      listeners.add(listener);
      if (latestLifecycleMessage) listener(latestLifecycleMessage);
      if (latestLifecycleMessage?.type === 'ready' && jediReady) listener({ type: 'jedi-ready' });
      return () => listeners.delete(listener);
    },
  };
}

export function getPythonRuntimeConnection(): PythonRuntimeConnection | null {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') return null;
  connection ??= createSharedRuntime();
  return connection;
}
