import { calloutGlyph, columnLayout, EMPTY_TABLE } from '@/components/block-editor/content';

export function isColumnBlockId(id: string): boolean {
  return /^block:columns:(?:[2-5]|wide-left|wide-right)$/.test(id);
}

export function blankElement(tag: 'p'): HTMLParagraphElement;
export function blankElement(tag: string): HTMLElement;
export function blankElement(tag: string): HTMLElement {
  const element = document.createElement(tag);
  element.append(document.createElement('br'));
  return element;
}

export function createTaskCheckbox(checked = false): HTMLInputElement {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.toggleAttribute('checked', checked);
  checkbox.setAttribute('contenteditable', 'false');
  checkbox.setAttribute('aria-label', 'Tarea completada');
  return checkbox;
}

export function createBlock(id: string): HTMLElement {
  const heading = /^block:heading([1-4])$/.exec(id);
  if (heading) return blankElement(`h${heading[1]}`);
  if (id === 'block:bullet' || id === 'block:numbered' || id === 'block:task') {
    const list = document.createElement(id === 'block:numbered' ? 'ol' : 'ul');
    const item = document.createElement('li');
    if (id === 'block:task') {
      item.dataset.task = 'false';
      item.append(createTaskCheckbox());
    }
    item.append(document.createElement('br'));
    list.append(item);
    return list;
  }
  if (id === 'block:quote') return blankElement('blockquote');
  if (id === 'block:highlight') {
    const paragraph = document.createElement('p');
    paragraph.append(blankElement('mark'));
    return paragraph;
  }
  if (id === 'block:table') {
    const block = document.createElement('div');
    block.className = 'knote-table-block';
    block.dataset.knoteTable = JSON.stringify(EMPTY_TABLE);
    return block;
  }
  if (id === 'block:callout-icon' || id === 'block:callout-plain') {
    const isIcon = id === 'block:callout-icon';
    const color = '#cbd5e1';
    const callout = document.createElement('div');
    callout.className = `knote-callout knote-callout-${isIcon ? 'icon' : 'plain'}`;
    callout.dataset.knoteCallout = isIcon ? 'icon' : 'plain';
    callout.dataset.knoteColor = color;
    callout.style.setProperty('--knote-callout-color', color);
    if (isIcon) {
      callout.dataset.knoteIcon = 'archive';
      const icon = document.createElement('span');
      icon.className = 'knote-callout-icon';
      icon.dataset.knoteIcon = 'archive';
      icon.contentEditable = 'false';
      icon.innerHTML = calloutGlyph('archive');
      callout.append(icon);
    }
    callout.append(blankElement('p'));
    return callout;
  }
  if (id === 'block:code') {
    const block = document.createElement('pre');
    block.dataset.language = 'plaintext';
    block.append(blankElement('code'));
    return block;
  }
  if (id === 'block:page-break') return Object.assign(document.createElement('hr'), { className: 'knote-page-break' });
  if (id === 'block:definition') {
    const definition = document.createElement('dl');
    definition.append(Object.assign(document.createElement('dt'), { textContent: 'Término' }), blankElement('dd'));
    return definition;
  }
  if (id === 'block:toc') {
    const toc = document.createElement('div');
    toc.className = 'knote-toc';
    toc.contentEditable = 'false';
    return toc;
  }
  if (id === 'block:divider') return document.createElement('hr');
  if (id === 'block:toggle') {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Mostrar contenido';
    const body = document.createElement('div');
    body.append(blankElement('p'));
    details.append(summary, body);
    return details;
  }
  if (id === 'block:equation') return Object.assign(blankElement('div'), { className: 'knote-equation' });
  if (isColumnBlockId(id)) {
    const count = Number(id.split(':').at(-1)) || 2;
    const width = id.endsWith('wide-left') ? [2, 1] : id.endsWith('wide-right') ? [1, 2] : undefined;
    const template = document.createElement('template');
    template.innerHTML = `<div ${columnLayout(count, width)}></div>`;
    const columns = template.content.firstElementChild as HTMLElement;
    for (let index = 0; index < count; index += 1) {
      const column = document.createElement('div');
      column.className = 'knote-preview-column';
      column.append(blankElement('p'));
      columns.append(column);
    }
    return columns;
  }
  return blankElement('p');
}
