import { describe, expect, it } from 'vitest';
import { formatMessageFileSize, formatMessageFileType } from './attachmentPresentation';

describe('formatMessageFileType', () => {
  it('compacts common office mime types into short labels', () => {
    expect(formatMessageFileType('application/msword')).toBe('DOC');
    expect(formatMessageFileType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('DOCX');
    expect(formatMessageFileType('application/vnd.ms-excel')).toBe('XLS');
    expect(formatMessageFileType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('XLSX');
  });

  it('falls back to a readable subtype token for unknown mime types', () => {
    expect(formatMessageFileType('application/x-custom-binary')).toBe('BINARY');
    expect(formatMessageFileType(undefined)).toBe('文件');
  });
});

describe('formatMessageFileSize', () => {
  it('formats missing and numeric byte sizes safely', () => {
    expect(formatMessageFileSize(undefined)).toBe('未知大小');
    expect(formatMessageFileSize(512)).toBe('512 B');
    expect(formatMessageFileSize(2048)).toBe('2.0 KB');
  });
});
