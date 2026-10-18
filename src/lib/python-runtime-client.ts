export type PythonRuntimeMessage = {
  type: string;
  id?: number;
  stage?: 'runtime' | 'analysis';
  version?: string;
  jediReady?: boolean;
  mypyReady?: boolean;
  message?: string;
  channel?: 'stdout' | 'stderr';
  text?: string;
  result?: unknown;
};

type RuntimeListener = (message: PythonRuntimeMessage) => void;
type RuntimeConnection = {
  worker: Worker;
  inputControl: Int32Array;
  inputData: Uint8Array;
  interruptView: Int32Array;
  subscribe: (listener: RuntimeListener) => () => void;
};

let sharedWorker: Worker | null = null;
let sharedInputControl: Int32Array | null = null;
let sharedInputData: Uint8Array | null = null;
let sharedInterruptView: Int32Array | null = null;
let latestLifecycleMessage: PythonRuntimeMessage | null = null;
let messageSequence = 0;
const listeners = new Set<RuntimeListener>();

export function nextPythonMessageId(): number {
  messageSequence += 1;
  return messageSequence;
}

function broadcast(message: PythonRuntimeMessage): void {
  if (message.type === 'stage' || message.type === 'ready' || message.type === 'fatal') {
    latestLifecycleMessage = message;
  }
  for (const listener of listeners) listener(message);
}

function createSharedRuntime(): void {
  if (sharedWorker || !globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') return;

  const inputControlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3);
  const inputDataBuffer = new SharedArrayBuffer(64 * 1024);
  const interruptBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  sharedInputControl = new Int32Array(inputControlBuffer);
  sharedInputData = new Uint8Array(inputDataBuffer);
  sharedInterruptView = new Int32Array(interruptBuffer);

  const runtimeWorker = new Worker(new URL('../workers/python.worker.ts', import.meta.url), { type: 'module', name: 'knote-python' });
  sharedWorker = runtimeWorker;
  runtimeWorker.addEventListener('message', (event: MessageEvent<PythonRuntimeMessage>) => broadcast(event.data));
  runtimeWorker.addEventListener('error', (event) => broadcast({ type: 'fatal', message: event.message || 'El trabajador de Python encontró un error.' }));
  runtimeWorker.postMessage({ type: 'initialize', inputControl: inputControlBuffer, inputData: inputDataBuffer, interruptBuffer });
}

export function getPythonRuntimeConnection(): RuntimeConnection | null {
  createSharedRuntime();
  if (!sharedWorker || !sharedInputControl || !sharedInputData || !sharedInterruptView) return null;

  return {
    worker: sharedWorker,
    inputControl: sharedInputControl,
    inputData: sharedInputData,
    interruptView: sharedInterruptView,
    subscribe(listener) {
      listeners.add(listener);
      if (latestLifecycleMessage) listener(latestLifecycleMessage);
      return () => listeners.delete(listener);
    },
  };
}
