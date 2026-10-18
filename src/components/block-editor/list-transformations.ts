import { blankElement, createBlock } from '@/components/block-editor/block-factory';

export function listItemContent(item: HTMLLIElement): { content: Node[]; nestedLists: HTMLElement[]; checkbox: HTMLInputElement | null } {
  const content: Node[] = [];
  const nestedLists: HTMLElement[] = [];
  let checkbox: HTMLInputElement | null = null;
  Array.from(item.childNodes).forEach((child) => {
    if (child instanceof HTMLInputElement && child.type === 'checkbox') checkbox = child;
    else if (child instanceof HTMLElement && ['UL', 'OL'].includes(child.tagName)) nestedLists.push(child);
    else content.push(child);
  });
  return { content, nestedLists, checkbox };
}

function listSegment(source: HTMLOListElement | HTMLUListElement, items: HTMLLIElement[], offset: number): HTMLOListElement | HTMLUListElement | null {
  if (!items.length) return null;
  const segment = source.cloneNode(false) as HTMLOListElement | HTMLUListElement;
  if (source.tagName === 'OL' && offset) {
    const ordered = source as HTMLOListElement;
    segment.start = ordered.reversed ? ordered.start - offset : ordered.start + offset;
  }
  items.forEach((item) => segment.append(item));
  return segment;
}

export function replaceSelectedListItems(items: HTMLLIElement[], build: (selected: HTMLLIElement[]) => HTMLElement[]): HTMLElement | null {
  const list = items[0]?.parentElement;
  if (!(list instanceof HTMLOListElement || list instanceof HTMLUListElement) || !items.every((item) => item.parentElement === list) || !list.parentNode) return null;
  const directItems = Array.from(list.children).filter((child): child is HTMLLIElement => child instanceof HTMLLIElement);
  const indexes = items.map((item) => directItems.indexOf(item)).filter((index) => index >= 0);
  if (!indexes.length) return null;
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  const selected = directItems.slice(first, last + 1);
  const replacement = build(selected);
  if (!replacement.length) return null;
  const before = listSegment(list, directItems.slice(0, first), 0);
  const after = listSegment(list, directItems.slice(last + 1), last + 1);
  if (before) list.parentNode.insertBefore(before, list);
  replacement.forEach((block) => list.parentNode?.insertBefore(block, list));
  if (after) list.parentNode.insertBefore(after, list);
  list.remove();
  return replacement[0];
}

export function mergeAdjacentLists(block: HTMLElement): HTMLElement {
  let merged = block;
  const previous = merged.previousElementSibling;
  if (previous?.tagName === merged.tagName && ['UL', 'OL'].includes(merged.tagName)) {
    previous.append(...Array.from(merged.children));
    merged.remove();
    merged = previous as HTMLElement;
  }
  const next = merged.nextElementSibling;
  if (next?.tagName === merged.tagName && ['UL', 'OL'].includes(merged.tagName)) {
    merged.append(...Array.from(next.children));
    next.remove();
  }
  return merged;
}

export function blockFromListItem(id: string, item: HTMLLIElement): HTMLElement[] {
  const { content, nestedLists } = listItemContent(item);
  const cloneContent = (): Node[] => content.map((node) => node.cloneNode(true));
  const heading = /^block:heading([1-4])$/.exec(id);
  if (id === 'block:paragraph' || heading) {
    const block = document.createElement(heading ? `h${heading[1]}` : 'p');
    cloneContent().forEach((node) => block.append(node));
    return [block, ...nestedLists.map((list) => list.cloneNode(true) as HTMLElement)];
  }
  if (id === 'block:quote') {
    const quote = document.createElement('blockquote');
    cloneContent().forEach((node) => quote.append(node));
    nestedLists.forEach((list) => quote.append(list.cloneNode(true)));
    return [quote];
  }
  if (id === 'block:callout-icon' || id === 'block:callout-plain') {
    const callout = createBlock(id);
    const contentBlock = callout.querySelector('p');
    if (contentBlock) cloneContent().forEach((node) => contentBlock.append(node));
    nestedLists.forEach((list) => callout.append(list.cloneNode(true)));
    return [callout];
  }
  if (id === 'block:code') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = content.map((node) => node.textContent || '').join('');
    pre.append(code);
    return [pre, ...nestedLists.map((list) => list.cloneNode(true) as HTMLElement)];
  }
  if (id === 'block:toggle') {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const body = document.createElement('div');
    summary.textContent = 'Mostrar contenido';
    const paragraph = document.createElement('p');
    cloneContent().forEach((node) => paragraph.append(node));
    body.append(paragraph, ...nestedLists.map((list) => list.cloneNode(true)));
    details.append(summary, body);
    return [details];
  }
  if (id === 'block:equation') {
    const equation = blankElement('div');
    equation.className = 'knote-equation';
    equation.textContent = content.map((node) => node.textContent || '').join('');
    return [equation, ...nestedLists.map((list) => list.cloneNode(true) as HTMLElement)];
  }
  const columnsMatch = /^block:columns:([2-5])$/.exec(id);
  if (columnsMatch) {
    const columns = createBlock(id);
    const firstColumn = columns.querySelector('.knote-preview-column');
    if (firstColumn) firstColumn.replaceChildren(...cloneContent(), ...nestedLists.map((list) => list.cloneNode(true)));
    return [columns];
  }
  return [];
}

export function convertListItemsToList(items: HTMLLIElement[], id: string): HTMLElement | null {
  const listTag = id === 'block:numbered' ? 'ol' : 'ul';
  const converted = replaceSelectedListItems(items, (selected) => {
    const list = document.createElement(listTag);
    selected.forEach((item) => {
      const { content, nestedLists, checkbox } = listItemContent(item);
      const next = document.createElement('li');
      if (id === 'block:task') {
        const checked = checkbox?.checked || item.dataset.task === 'true';
        next.dataset.task = String(checked);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.setAttribute('contenteditable', 'false');
        next.append(input);
      }
      content.forEach((node) => next.append(node.cloneNode(true)));
      nestedLists.forEach((nested) => next.append(nested.cloneNode(true)));
      if (!next.childNodes.length || (id === 'block:task' && next.childNodes.length === 1)) next.append(document.createElement('br'));
      list.append(next);
    });
    return [list];
  });
  if (!(converted instanceof HTMLOListElement || converted instanceof HTMLUListElement)) return converted;
  return mergeAdjacentLists(converted);
}
