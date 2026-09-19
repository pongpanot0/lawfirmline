import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  const service = new ChunkingService();

  it('keeps page ranges from [หน้า N] markers', () => {
    const text = `[หน้า 1]\nข้อความหน้าแรก\n\n[หน้า 2]\nผลตรวจเลือดแฝงในอุจจาระเป็นบวก`;
    const chunks = service.chunk(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[0].pageEnd).toBe(2);
    expect(chunks[0].content).toContain('ผลตรวจเลือดแฝง');
    expect(chunks[0].content).not.toContain('[หน้า');
  });

  it('splits long text into overlapping chunks with sequential indexes', () => {
    const line = 'บรรทัดยาวพอสมควรสำหรับการทดสอบการแบ่ง '.repeat(5);
    const text = `[หน้า 1]\n${Array.from({ length: 60 }, () => line).join('\n')}`;
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(c.content.length).toBeLessThanOrEqual(4600);
    });
    // overlap: start of chunk 2 repeats the tail of chunk 1
    expect(chunks[1].content.slice(0, 100)).toBe(chunks[0].content.slice(-400).slice(0, 100));
  });

  it('handles text without page markers', () => {
    const chunks = service.chunk('ไฟล์ txt ธรรมดา ไม่มีเลขหน้า');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBeNull();
  });
});
