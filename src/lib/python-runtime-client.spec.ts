import { afterEach, describe, expect, it, vi } from 'vitest';
import { inputSlot, inputState } from './python-input';

class TestWorker extends EventTarget {
  static last: TestWorker;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    super();
    TestWorker.last = this;
  }

  receive(type: string, id?: number) {
    this.dispatchEvent(new MessageEvent('message', { data: { type, id } }));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shared Python runtime', () => {
  it('keeps stdin owned by one execution until its terminal message', async () => {
    vi.resetModules();
    vi.stubGlobal('Worker', TestWorker);
    vi.stubGlobal('crossOriginIsolated', true);
    const { getPythonRuntimeConnection } = await import('./python-runtime-client');
    const first = getPythonRuntimeConnection()!;
    const second = getPythonRuntimeConnection()!;
    const worker = TestWorker.last;
    const buffers = worker.postMessage.mock.calls[0][0];
    const control = new Int32Array(buffers.inputControl);
    const data = new Uint8Array(buffers.inputData);
    const interrupt = new Int32Array(buffers.interruptBuffer);

    const firstId = first.run('input()')!;
    expect(second.run('print(2)')).toBeNull();
    expect(first.submitInput(firstId, 'early')).toBe('unavailable');

    Atomics.store(control, inputSlot.state, inputState.waiting);
    expect(first.submitInput(firstId + 1, 'wrong run')).toBe('unavailable');
    expect(first.submitInput(firstId, 'a'.repeat(data.length))).toBe('too-long');
    expect(first.submitInput(firstId, 'ñ🐍')).toBe('sent');
    expect(Atomics.load(control, inputSlot.state)).toBe(inputState.submitted);
    expect(new TextDecoder().decode(data.subarray(0, control[inputSlot.length]))).toBe('ñ🐍\n');
    expect(first.submitInput(firstId, 'duplicate')).toBe('unavailable');

    expect(second.stop(firstId + 1)).toBe(false);
    expect(first.stop(firstId)).toBe(true);
    expect(first.stop(firstId)).toBe(false);
    expect(control[inputSlot.state]).toBe(inputState.stopped);
    expect(interrupt[0]).toBe(2);
    worker.receive('run-stopped', firstId + 1);
    expect(second.run('print(2)')).toBeNull();
    worker.receive('run-stopped', firstId);

    const secondId = second.run('print(2)');
    expect(secondId).not.toBeNull();
    expect(secondId).not.toBe(firstId);
    expect(control[inputSlot.state]).toBe(inputState.idle);
    expect(control[inputSlot.stopped]).toBe(0);
    expect(interrupt[0]).toBe(0);
  });

  it('replaces a worker that does not acknowledge a stop', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('Worker', TestWorker);
    vi.stubGlobal('crossOriginIsolated', true);
    const { getPythonRuntimeConnection } = await import('./python-runtime-client');
    const runtime = getPythonRuntimeConnection()!;
    const initialWorker = TestWorker.last;
    const listener = vi.fn();
    runtime.subscribe(listener);

    const id = runtime.run('while True: pass')!;
    runtime.stop(id);
    await vi.runAllTimersAsync();

    expect(initialWorker.terminate).toHaveBeenCalledOnce();
    expect(runtime.worker).toBe(TestWorker.last);
    expect(runtime.worker).not.toBe(initialWorker);
    expect(listener).toHaveBeenCalledWith({ type: 'run-stopped', id });
    const calls = listener.mock.calls.length;
    initialWorker.receive('run-error', id);
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
