import { hasCidRefs, inlineCidImages } from './inline-cid-images';
import { GraphAttachment } from '../outlook-graph.client';

const att = (over: Partial<GraphAttachment>): GraphAttachment => ({
  id: 'a', name: 'image001.png', contentType: 'image/png', size: 10, contentBytes: 'AAAA', contentId: 'image001.png@01DB.5678', isInline: true, ...over,
});

describe('inlineCidImages', () => {
  it('replaces cid references with data URIs of the matching inline attachment', () => {
    const html = '<img src="cid:image001.png@01DB.5678"><div style="background:url(cid:IMAGE001.PNG@01db.5678)"></div>';
    expect(inlineCidImages(html, [att({})])).toBe(
      '<img src="data:image/png;base64,AAAA"><div style="background:url(data:image/png;base64,AAAA)"></div>',
    );
  });

  it('matches contentIds wrapped in <> and url-encoded references', () => {
    expect(inlineCidImages("<img src='cid:logo%40x'>", [att({ contentId: '<logo@x>', contentType: 'image/JPEG' })])).toBe(
      "<img src='data:image/jpeg;base64,AAAA'>",
    );
  });

  it('blanks references with no usable attachment: missing, not an image, too large, no bytes', () => {
    const html = '<img src="cid:a"><img src="cid:b"><img src="cid:c"><img src="cid:d">';
    const result = inlineCidImages(html, [
      att({ contentId: 'b', contentType: 'text/html' }),
      att({ contentId: 'c', size: 3 * 1024 * 1024 }),
      att({ contentId: 'd', contentBytes: undefined }),
    ]);
    expect(result).toBe('<img src="data:,"><img src="data:,"><img src="data:,"><img src="data:,">');
    expect(hasCidRefs(result)).toBe(false);
  });

  it('hasCidRefs detects references', () => {
    expect(hasCidRefs('<img SRC="CID:x">')).toBe(true);
    expect(hasCidRefs('<p>no images</p>')).toBe(false);
    expect(hasCidRefs(null)).toBe(false);
  });
});
