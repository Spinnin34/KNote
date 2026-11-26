import { describe, expect, it } from 'vitest';
import { RICH_PREFIX, tableBlockHtml } from '@/components/block-editor/content';
import { richPdfContent } from './pdf-export';

describe('PDF export formatting', () => {
  it('passes complete inline styles to pdfmake for headings, paragraphs and table cells', async () => {
    const table = tableBlockHtml({
      caption: '', headers: ['', ''], headerless: true,
      columnWidths: [1, 2], widthPercent: 70, offsetPercent: 20,
      rows: [['Importe', '25 €']], rowHtml: [['', '<em><span style="font-size:14pt">25 €</span></em>']],
    });
    const content = await richPdfContent(RICH_PREFIX
      + '<h1><span style="font-size:27pt"><strong>Título</strong></span></h1>'
      + '<p style="text-align:right"><span style="font-size:11pt;font-weight:normal">Normal </span><strong>Fuerte</strong></p>'
      + table);
    expect(content[0]).toMatchObject({ text: [{ text: 'Título', fontSize: 27, bold: true }] });
    expect(content[1]).toMatchObject({ alignment: 'right', text: [{ text: 'Normal ', fontSize: 11, bold: false }, { text: 'Fuerte', bold: true }] });
    expect(content[2]).toMatchObject({
      margin: [99, 5, 49.5, 10],
      stack: [{ table: { headerRows: 0, body: [[{ text: 'Importe' }, { text: [{ text: '25 €', fontSize: 14, italics: true }] }]] } }],
    });
  });
});
