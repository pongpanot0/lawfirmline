import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('keeps paragraphs and line breaks, drops tags, styles and scripts', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><p>เรียน ทนาย</p><p>บรรทัด 1<br>บรรทัด 2</p><script>x()</script></body></html>';
    expect(htmlToText(html)).toBe('เรียน ทนาย\n\nบรรทัด 1\nบรรทัด 2');
  });
  it('decodes common entities', () => {
    expect(htmlToText('A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f')).toBe(`A & B <c> "d" 'e' f`);
  });
  it('collapses runs of blank lines', () => {
    expect(htmlToText('<div>a</div><div></div><div></div><div>b</div>')).toBe('a\n\nb');
  });
});
