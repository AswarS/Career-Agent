const KNOWN_FILE_TYPE_LABELS: Record<string, string> = {
  'application/msword': 'DOC',
  'application/pdf': 'PDF',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/octet-stream': '本地文件',
  'text/plain': 'TXT',
};

function normalizeMimeSubtypeToken(value: string | undefined) {
  const tokens = value?.trim().split(/[.+-]/) ?? [];
  const token = tokens[tokens.length - 1];

  if (!token || !/^[a-z0-9]+$/i.test(token)) {
    return null;
  }

  return token.toUpperCase();
}

export function formatMessageFileType(mimeType: string | undefined) {
  if (!mimeType) {
    return '文件';
  }

  const normalizedMimeType = mimeType.trim().toLowerCase();
  const knownLabel = KNOWN_FILE_TYPE_LABELS[normalizedMimeType];

  if (knownLabel) {
    return knownLabel;
  }

  const [, subtype] = normalizedMimeType.split('/');
  const token = normalizeMimeSubtypeToken(subtype);
  return token ?? '文件';
}

export function formatMessageFileSize(sizeBytes: number | undefined) {
  if (sizeBytes === undefined) {
    return '未知大小';
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
