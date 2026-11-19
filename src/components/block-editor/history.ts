interface CaretPoint { path: number[]; offset: number }
export interface DocumentSelection { anchor: CaretPoint; focus: CaretPoint }
interface DocumentVersion { value: string; selection: DocumentSelection | null }

function capturePoint(root: HTMLElement, node: Node, offset: number): CaretPoint {
  const element = node instanceof HTMLElement ? node : node.parentElement ?? root;
  const path: number[] = [];
  for (let current = element; current !== root && current.parentElement; current = current.parentElement) {
    path.unshift(Array.from(current.parentElement.children).indexOf(current));
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  range.setEnd(node, offset);
  return { path, offset: range.toString().length };
}

export function captureDocumentSelection(root: HTMLElement): DocumentSelection | null {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  return {
    anchor: capturePoint(root, selection.anchorNode, selection.anchorOffset),
    focus: capturePoint(root, selection.focusNode, selection.focusOffset),
  };
}

function resolvePoint(root: HTMLElement, point: CaretPoint): [Node, number] {
  let element = root;
  for (const index of point.path) {
    const child = element.children[index];
    if (!(child instanceof HTMLElement)) break;
    element = child;
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = point.offset;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (remaining <= node.length) return [node, remaining];
    remaining -= node.length;
  }
  return [element, 0];
}

export function restoreDocumentSelection(root: HTMLElement, value: DocumentSelection): void {
  const anchor = resolvePoint(root, value.anchor);
  const focus = resolvePoint(root, value.focus);
  const cell = anchor[0].parentElement?.closest<HTMLElement>('[contenteditable="plaintext-only"]');
  (cell ?? root).focus({ preventScroll: true });
  window.getSelection()?.setBaseAndExtent(...anchor, ...focus);
}

const historyLimit = 60;
const historyCharacterBudget = 8 * 1024 * 1024;
const typingInterval = 700;

export function createDocumentHistory(initial: string) {
  let current: DocumentVersion = { value: initial, selection: null };
  const undo: DocumentVersion[] = [];
  const redo: DocumentVersion[] = [];
  let undoCharacters = 0;
  let lastEdit: { group: string; time: number } | null = null;

  function remember(selection: DocumentSelection | null): void {
    if (!selection) return;
    if (JSON.stringify(current.selection) !== JSON.stringify(selection)) lastEdit = null;
    current.selection = selection;
  }

  function record(value: string, selection: DocumentSelection | null, group = ''): void {
    if (value === current.value) return;
    const time = Date.now();
    if (!group || lastEdit?.group !== group || time - lastEdit.time > typingInterval) {
      undo.push(current);
      undoCharacters += current.value.length;
      while (undo.length > 1 && (undo.length > historyLimit || undoCharacters > historyCharacterBudget)) {
        undoCharacters -= undo.shift()!.value.length;
      }
    }
    current = { value, selection };
    lastEdit = group ? { group, time } : null;
    redo.length = 0;
  }

  function step(direction: 'undo' | 'redo'): DocumentVersion | undefined {
    const from = direction === 'undo' ? undo : redo;
    const to = direction === 'undo' ? redo : undo;
    const version = from.pop();
    if (!version) return;
    undoCharacters += direction === 'undo' ? -version.value.length : current.value.length;
    to.push(current);
    current = version;
    lastEdit = null;
    return version;
  }

  return { remember, record, step, canUndo: () => undo.length > 0, canRedo: () => redo.length > 0 };
}
