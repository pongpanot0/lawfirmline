import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx';

const FONT = 'TH Sarabun New';
const SIZE = 32; // half-points → 16pt

/** Renders rendered template text into a .docx buffer: bold centered title, one paragraph per line. */
export async function buildDocx(title: string, body: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: title, bold: true, font: FONT, size: SIZE })],
          }),
          new Paragraph({ text: '' }),
          ...body
            .split('\n')
            .map((line) => new Paragraph({ children: [new TextRun({ text: line, font: FONT, size: SIZE })] })),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
