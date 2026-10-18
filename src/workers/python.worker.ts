import { loadPyodide } from 'pyodide';

type InitializeMessage = {
  type: 'initialize';
  inputControl: SharedArrayBuffer;
  inputData: SharedArrayBuffer;
  interruptBuffer: SharedArrayBuffer;
};
type RunMessage = { type: 'run'; id: number; code: string };
type AnalyzeMessage = { type: 'analyze'; id: number; code: string; line: number; column: number; mode: 'complete' | 'signature' | 'hover' | 'syntax' | 'lint' | 'types' };
type WorkerMessage = InitializeMessage | RunMessage | AnalyzeMessage;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let runtime: Awaited<ReturnType<typeof loadPyodide>> | null = null;
let pythonInputAdapter: ReturnType<NonNullable<typeof runtime>['runPython']> | null = null;
let inputControl: Int32Array | null = null;
let inputData: Uint8Array | null = null;
let interruptView: Int32Array | null = null;
let inputOffset = 0;
let inputLength = 0;
let running = false;
let stopRequested = false;
let taskQueue = Promise.resolve();
let mypyReady = false;
let mypyLoadError = '';
let mypyLoadPromise: Promise<void> | null = null;
let jediReady = false;
let jediLoadError = '';
let jediLoadPromise: Promise<void> | null = null;
let pyflakesReady = false;
let pyflakesLoadError = '';
let pyflakesLoadPromise: Promise<void> | null = null;

function send(message: Record<string, unknown>): void {
  workerScope.postMessage(message);
}

function readInput(target: Uint8Array): number {
  if (!inputControl || !inputData) return 0;

  while (Atomics.load(inputControl, 0) !== 1 && Atomics.load(inputControl, 0) !== 3) {
    if (Atomics.load(inputControl, 0) !== 2) {
      Atomics.store(inputControl, 0, 2);
      send({ type: 'input-needed' });
    }
    Atomics.wait(inputControl, 0, 2, 1000);
  }

  if (Atomics.load(inputControl, 0) === 3) return 0;
  if (inputOffset === 0) inputLength = Atomics.load(inputControl, 1);

  const count = Math.min(target.length, Math.max(0, inputLength - inputOffset));
  if (count) target.set(inputData.subarray(inputOffset, inputOffset + count));
  inputOffset += count;

  if (inputOffset >= inputLength) {
    inputOffset = 0;
    inputLength = 0;
    Atomics.store(inputControl, 1, 0);
    Atomics.store(inputControl, 0, 0);
  }
  return count;
}

async function initialize(message: InitializeMessage): Promise<void> {
  inputControl = new Int32Array(message.inputControl);
  inputData = new Uint8Array(message.inputData);
  interruptView = new Int32Array(message.interruptBuffer);

  send({ type: 'stage', stage: 'runtime' });
  runtime = await loadPyodide({ indexURL: new URL('/pyodide/', workerScope.location.href).href });
  runtime.setStdout({ batched: (text) => send({ type: 'output', channel: 'stdout', text }) });
  runtime.setStderr({ batched: (text) => send({ type: 'output', channel: 'stderr', text }) });
  runtime.setStdin({ isatty: true, read: readInput });
  runtime.runPython(`
import builtins as _knote_builtins
def _knote_input(prompt=""):
    if prompt:
        print(prompt, flush=True)
    return _knote_builtins.input()
`);
  pythonInputAdapter = runtime.globals.get('_knote_input');

  const pythonVersion = runtime.runPython('import sys; sys.version.split()[0]') as string;
  send({ type: 'ready', version: pythonVersion, jediReady: false, mypyReady: false, mypyPending: true });
}

async function ensureJedi(): Promise<void> {
  if (jediReady) return;
  if (jediLoadError) throw new Error(jediLoadError);
  if (!jediLoadPromise) {
    jediLoadPromise = (async () => {
      const activeRuntime = runtime;
      if (!activeRuntime) throw new Error('El runtime de Python todavía no está preparado.');
      const quietPackageLoad = { messageCallback: () => undefined };
      await activeRuntime.loadPackage('jedi', quietPackageLoad);
      activeRuntime.runPython('import jedi');
      jediReady = true;
      send({ type: 'jedi-ready' });
    })().catch((error: unknown) => {
      jediLoadError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  }
  await jediLoadPromise;
}

async function ensureMypy(): Promise<void> {
  if (mypyReady) return;
  if (mypyLoadError) throw new Error(mypyLoadError);
  if (!mypyLoadPromise) {
    mypyLoadPromise = (async () => {
      const activeRuntime = runtime;
      if (!activeRuntime) throw new Error('El runtime de Python todavía no está preparado.');
      const quietPackageLoad = { messageCallback: () => undefined };
      await activeRuntime.loadPackage(['typing-extensions', 'mypy'], quietPackageLoad);
      const extraMypyWheels = [
        'mypy_extensions-1.1.0-py3-none-any.whl',
        'pathspec-1.1.1-py3-none-any.whl',
      ];
      const localWheelPaths: string[] = [];
      for (const wheel of extraMypyWheels) {
        const response = await fetch(new URL(`/pyodide/${wheel}`, workerScope.location.href));
        if (!response.ok) throw new Error(`${wheel}: HTTP ${response.status}`);
        const wheelPath = `/tmp/${wheel}`;
        activeRuntime.FS.writeFile(wheelPath, new Uint8Array(await response.arrayBuffer()));
        localWheelPaths.push(wheelPath);
      }
      activeRuntime.runPython(`
import sys
sys.path[:0] = ${JSON.stringify(localWheelPaths)}
import mypy.api
`);
      mypyReady = true;
      send({ type: 'mypy-ready' });
    })().catch((error: unknown) => {
      mypyLoadError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  }
  await mypyLoadPromise;
}

async function ensurePyflakes(): Promise<void> {
  if (pyflakesReady) return;
  if (pyflakesLoadError) throw new Error(pyflakesLoadError);
  if (!pyflakesLoadPromise) {
    pyflakesLoadPromise = (async () => {
      const activeRuntime = runtime;
      if (!activeRuntime) throw new Error('El runtime de Python todavía no está preparado.');
      const filename = 'pyflakes-4.0.3-py2.py3-none-any.whl';
      const response = await fetch(new URL(`/pyodide/${filename}`, workerScope.location.href));
      if (!response.ok) throw new Error(`${filename}: HTTP ${response.status}`);
      const wheelPath = `/tmp/${filename}`;
      activeRuntime.FS.writeFile(wheelPath, new Uint8Array(await response.arrayBuffer()));
      activeRuntime.runPython(`
import sys
sys.path.insert(0, ${JSON.stringify(wheelPath)})
import pyflakes.api
import pyflakes.reporter
`);
      pyflakesReady = true;
    })().catch((error: unknown) => {
      pyflakesLoadError = error instanceof Error ? error.message : String(error);
      throw error;
    });
  }
  await pyflakesLoadPromise;
}

async function runCode(message: RunMessage): Promise<void> {
  if (!runtime) throw new Error('El runtime de Python todavía no está preparado.');
  if (running) return;
  running = true;
  stopRequested = false;
  inputOffset = 0;
  inputLength = 0;
  if (inputControl) {
    Atomics.store(inputControl, 0, 0);
    Atomics.store(inputControl, 1, 0);
    Atomics.store(inputControl, 2, 0);
  }
  if (interruptView) {
    Atomics.store(interruptView, 0, 0);
    runtime.setInterruptBuffer(interruptView);
  }
  send({ type: 'run-started', id: message.id });

  const globals = runtime.runPython('dict()');
  try {
    globals.set('__name__', '__main__');
    if (pythonInputAdapter) globals.set('input', pythonInputAdapter);
    await runtime.runPythonAsync(message.code, { globals, filename: 'main.py' });
    if (stopRequested || Atomics.load(inputControl!, 2) === 1) send({ type: 'run-stopped', id: message.id });
    else send({ type: 'run-finished', id: message.id });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const interrupted = stopRequested || Atomics.load(inputControl!, 2) === 1 || /KeyboardInterrupt|Interrupted/i.test(detail);
    if (interrupted) send({ type: 'run-stopped', id: message.id });
    else send({ type: 'run-error', id: message.id, message: detail });
  } finally {
    globals.destroy();
    running = false;
    if (inputControl) {
      Atomics.store(inputControl, 0, 0);
      Atomics.store(inputControl, 1, 0);
    }
  }
}

async function analyze(message: AnalyzeMessage): Promise<void> {
  if (!runtime) return send({ type: 'analysis-result', id: message.id, result: null });

  if (message.mode === 'complete' || message.mode === 'signature' || message.mode === 'hover') {
    try {
      await ensureJedi();
    } catch (error) {
      send({ type: 'analysis-warning', message: `La ayuda contextual de Jedi no está disponible: ${String(error)}` });
      send({ type: 'analysis-result', id: message.id, result: { jediError: error instanceof Error ? error.message : String(error) } });
      return;
    }
  }

  if (message.mode === 'lint') {
    try {
      await ensurePyflakes();
    } catch (error) {
      send({ type: 'analysis-result', id: message.id, result: { pyflakesError: error instanceof Error ? error.message : String(error) } });
      return;
    }
  } else if (message.mode === 'types') {
    try {
      await ensureMypy();
    } catch (error) {
      send({ type: 'analysis-result', id: message.id, result: { mypyError: error instanceof Error ? error.message : String(error) } });
      return;
    }
  }

  const source = runtime.globals.get('__knote_editor_source');
  const line = runtime.globals.get('__knote_editor_line');
  const column = runtime.globals.get('__knote_editor_column');
  const mode = runtime.globals.get('__knote_editor_mode');
  try {
    runtime.globals.set('__knote_editor_source', message.code);
    runtime.globals.set('__knote_editor_line', message.line);
    runtime.globals.set('__knote_editor_column', message.column);
    runtime.globals.set('__knote_editor_mode', message.mode);
    const result = runtime.runPython(`
import ast
import json

_source = __knote_editor_source
_line = __knote_editor_line
_column = __knote_editor_column
_mode = __knote_editor_mode
_result = {}

if _mode in ("syntax", "lint", "types"):
    try:
        ast.parse(_source, filename="main.py")
    except SyntaxError as _error:
        _result["syntax"] = [{
            "message": _error.msg,
            "line": _error.lineno or 1,
            "column": max(0, (_error.offset or 1) - 1),
            "endLine": _error.end_lineno or _error.lineno or 1,
            "endColumn": max(0, (_error.end_offset or _error.offset or 2) - 1),
        }]
    except Exception as _error:
        _result["error"] = str(_error)

    # Type checking an incomplete or syntactically invalid buffer is slow and
    # produces noisy secondary errors. Syntax issues above are more useful.
    if _mode == "lint" and not _result.get("syntax") and not _result.get("error"):
        try:
            from io import StringIO
            import pyflakes.api
            import pyflakes.reporter
            _output = StringIO()
            _reporter = pyflakes.reporter.Reporter(_output, _output)
            pyflakes.api.check(_source, "main.py", _reporter)
            _result["pyflakes"] = _output.getvalue()
        except Exception as _error:
            _result["pyflakesError"] = str(_error)

    if _mode == "types" and not _result.get("syntax") and not _result.get("error"):
        try:
            import mypy.api
            _path = "/tmp/knote_editor.py"
            with open(_path, "w", encoding="utf-8") as _file:
                _file.write(_source)
            _stdout, _stderr, _status = mypy.api.run([
                "--show-error-codes", "--no-color-output", "--ignore-missing-imports",
                "--follow-imports=skip", "--cache-dir=/tmp/knote_mypy_cache", _path
            ])
            _result["mypy"] = _stdout + _stderr
        except Exception as _error:
            _result["mypyError"] = str(_error)
else:
    try:
        import jedi
        _script = jedi.Script(code=_source, path="main.py")
        if _mode == "complete":
            _items = _script.complete(line=_line, column=_column)
            _result["fromOffset"] = max(0, _column - (_items[0].get_completion_prefix_length() if _items else 0))
            _result["completions"] = [
                {"label": item.name, "apply": item.name, "type": item.type, "detail": item.description}
                for item in _items[:60]
            ]
        elif _mode == "signature":
            _signatures = _script.get_signatures(line=_line, column=_column)
            if _signatures:
                _signature = _signatures[0]
                _result["signature"] = _signature.to_string()
                _result["documentation"] = _signature.docstring(raw=True)[:1400]
        elif _mode == "hover":
            _definitions = _script.infer(line=_line, column=_column)
            if _definitions:
                _definition = _definitions[0]
                _result["title"] = _definition.description
                _result["documentation"] = _definition.docstring(raw=True)[:1800]
    except Exception as _error:
        _result["jediError"] = str(_error)

json.dumps(_result, ensure_ascii=False)
`);
    const json = typeof result === 'string' ? result : String(result);
    result?.destroy?.();
    send({ type: 'analysis-result', id: message.id, result: JSON.parse(json) });
  } catch (error) {
    send({ type: 'analysis-result', id: message.id, result: { error: error instanceof Error ? error.message : String(error) } });
  } finally {
    source?.destroy?.();
    line?.destroy?.();
    column?.destroy?.();
    mode?.destroy?.();
  }
}

async function handleMessage(message: WorkerMessage): Promise<void> {
  if (message.type === 'initialize') return initialize(message);
  if (message.type === 'run') return await runCode(message);
  if (message.type === 'analyze') return await analyze(message);
}

workerScope.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  taskQueue = taskQueue.then(() => handleMessage(event.data)).catch((error: unknown) => {
    send({ type: 'fatal', message: error instanceof Error ? error.message : String(error) });
  });
});
