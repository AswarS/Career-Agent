import { describe, expect, it } from 'vitest';
import {
  createDownloadBlob,
  isUtf8TextLikeMimeType,
  parseContentDispositionFilename,
  resolveDownloadUrl,
  shouldUseControlledDownload,
} from './messageFileDownloads';

describe('messageFileDownloads', () => {
  it('parses RFC 5987 filenames from content disposition headers', () => {
    expect(parseContentDispositionFilename(
      "attachment; filename*=UTF-8''%E6%B5%8B%E8%AF%95%EF%BC%88%E7%BB%88%E7%89%88%EF%BC%89%2Bv1.md",
    )).toBe('测试（终版）+v1.md');
  });

  it('recognizes utf-8 text mime types', () => {
    expect(isUtf8TextLikeMimeType('text/markdown')).toBe(true);
    expect(isUtf8TextLikeMimeType('application/json; charset=utf-8')).toBe(true);
    expect(isUtf8TextLikeMimeType('application/pdf')).toBe(false);
  });

  it('rejects protocol-relative download urls', () => {
    expect(resolveDownloadUrl('//example.com/file.md')).toBeNull();
  });

  it('uses controlled download only for text-like attachments', () => {
    expect(shouldUseControlledDownload({
      id: '1',
      name: 'notes.md',
      url: '/files/notes.md',
      mimeType: 'text/markdown',
    })).toBe(true);

    expect(shouldUseControlledDownload({
      id: '2',
      name: 'slides.pptx',
      url: '/files/slides.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })).toBe(false);
  });

  it('rebuilds markdown downloads as utf-8 text with BOM', async () => {
    const bytes = new TextEncoder().encode('中文内容');
    const blob = createDownloadBlob(bytes.buffer, 'text/markdown');
    const blobBytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(Array.from(blobBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });
});
