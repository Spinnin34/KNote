export function refreshDocumentOutline(root: HTMLElement | DocumentFragment, prefix: string): void {
  const outlines = root.querySelectorAll<HTMLElement>('.knote-toc');
  if (!outlines.length) return;
  const headings = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4')).filter((heading) => heading.textContent?.trim());
  headings.forEach((heading, index) => { heading.id = `outline-${prefix}-${index + 1}`; });
  const signature = JSON.stringify(headings.map((heading) => [heading.id, heading.tagName, heading.textContent]));
  for (const outline of outlines) {
    if (outline.dataset.outline === signature) continue;
    outline.dataset.outline = signature;
    const title = document.createElement('strong');
    title.textContent = 'Índice de contenidos';
    outline.replaceChildren(title);
    if (!headings.length) {
      outline.append(Object.assign(document.createElement('p'), { textContent: 'Los encabezados de este documento aparecerán aquí.' }));
      continue;
    }
    const list = document.createElement('ul');
    for (const heading of headings) {
      const link = document.createElement('a');
      link.setAttribute('href', '#' + heading.id);
      link.textContent = heading.textContent;
      const item = document.createElement('li');
      item.dataset.level = heading.tagName;
      item.append(link);
      list.append(item);
    }
    outline.append(list);
  }
}
