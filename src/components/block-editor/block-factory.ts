import { calloutGlyph, EMPTY_TABLE } from '@/components/block-editor/content';

export function blankElement(tag: string): HTMLElement {
  const element = document.createElement(tag);
  element.append(document.createElement('br'));
  return element;
}

export function createBlock(id: string): HTMLElement {
  const heading = /^block:heading([1-4])$/.exec(id);
  if (heading) return blankElement(`h${heading[1]}`);
  if (id === 'block:bullet' || id === 'block:numbered' || id === 'block:task') {
    const list = document.createElement(id === 'block:numbered' ? 'ol' : 'ul');
    const item = document.createElement('li');
    if (id === 'block:task') {
      item.dataset.task = 'false';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('contenteditable', 'false');
      item.append(checkbox);
    }
    item.append(document.createElement('br'));
    list.append(item);
    return list;
  }
  if (id === 'block:quote') return blankElement('blockquote');
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
    block.append(document.createElement('code'), document.createElement('br'));
    return block;
  }
  if (id === 'block:divider') return document.createElement('hr');
  if (id === 'block:toggle') {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Mostrar contenido';
    const body = blankElement('div');
    details.append(summary, body);
    return details;
  }
  if (id === 'block:equation') return Object.assign(blankElement('div'), { className: 'knote-equation' });
  const columnsMatch = /^block:columns:([2-5])$/.exec(id);
  if (columnsMatch) {
    const count = Number(columnsMatch[1]);
    const columns = document.createElement('div');
    columns.className = 'knote-preview-columns';
    columns.dataset.columns = String(count);
    columns.style.setProperty('--knote-columns', String(count));
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
