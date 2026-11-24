import { initialHtml, RICH_PREFIX } from './content';

function body(content: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = initialHtml(content);
  return template.content;
}

function editableParagraph(documentBody: DocumentFragment): Element | undefined {
  const first = documentBody.firstElementChild;
  if (first?.tagName === 'P' && Array.from(first.children).every((child) => child.tagName === 'BR')) return first;
  return undefined;
}

function readParagraph(paragraph: Element | undefined): string {
  return Array.from(paragraph?.childNodes ?? [], (node) => node.nodeName === 'BR' ? '\n' : node.textContent ?? '').join('').trim();
}

export function taskDescription(content: string): string {
  return readParagraph(editableParagraph(body(content)));
}

export function replaceTaskDescription(content: string, previous: string, value: string): string | null {
  const documentBody = body(content);
  const paragraph = editableParagraph(documentBody);
  if (readParagraph(paragraph) !== previous) return null;
  if (paragraph && !value) paragraph.remove();
  else if (value) {
    const summary = paragraph ?? document.createElement('p');
    summary.replaceChildren();
    value.split('\n').forEach((line, index) => {
      if (index) summary.append(document.createElement('br'));
      summary.append(line);
    });
    if (!paragraph) documentBody.prepend(summary);
  }
  const template = document.createElement('template');
  template.content.append(documentBody);
  return RICH_PREFIX + template.innerHTML;
}
