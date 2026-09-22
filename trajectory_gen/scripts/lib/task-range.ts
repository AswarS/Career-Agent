// Selection of synthetic tasks by their 1-based sort ordinal, so callers can
// ask for "1-100" or "101-" instead of pasting 171 scenario hashes.
//
// Grammar (comma separated, whitespace tolerated):
//   all       every task
//   7         the single task at ordinal 7
//   1-100     ordinals 1 through 100
//   101-      ordinal 101 through the last task
//   -50       ordinals 1 through 50
export const ALL_TASKS = 'all';

export class TaskRangeError extends Error {}

function parseOrdinal(value: string, label: string): number {
  if (!/^\d+$/.test(value)) throw new TaskRangeError(`${label} must be a positive integer, received "${value}"`);
  const ordinal = Number(value);
  if (ordinal < 1) throw new TaskRangeError(`${label} must be >= 1, received "${value}"`);
  return ordinal;
}

export function ordinalNumbers(spec: string, total: number): number[] {
  const trimmed = spec.trim();
  if (!trimmed) throw new TaskRangeError('range must not be empty');
  if (trimmed.toLowerCase() === ALL_TASKS) return Array.from({ length: total }, (_, index) => index + 1);
  if (total < 1) throw new TaskRangeError('no tasks are available to select from');

  const selected: number[] = [];
  const seen = new Set<number>();
  const push = (ordinal: number) => {
    if (ordinal > total) throw new TaskRangeError(`ordinal ${ordinal} is out of range`);
    if (seen.has(ordinal)) return;
    seen.add(ordinal);
    selected.push(ordinal);
  };

  for (const rawToken of trimmed.split(',')) {
    const token = rawToken.trim();
    if (!token) continue;
    const range = /^(\d*)\s*-\s*(\d*)$/.exec(token);
    if (range) {
      const [, rawStart, rawEnd] = range;
      if (!rawStart && !rawEnd) throw new TaskRangeError(`"${token}" is not a valid range`);
      const start = rawStart ? parseOrdinal(rawStart, 'range start') : 1;
      const end = rawEnd ? parseOrdinal(rawEnd, 'range end') : total;
      if (end < start) throw new TaskRangeError(`range "${token}" ends before it starts`);
      for (let ordinal = start; ordinal <= end; ordinal += 1) push(ordinal);
      continue;
    }
    push(parseOrdinal(token, 'ordinal'));
  }
  if (!selected.length) throw new TaskRangeError(`range "${spec}" selects no tasks`);
  return selected.sort((left, right) => left - right);
}

/** Maps a range spec onto `items`, preserving the caller's item order. */
export function selectByRange<T>(items: T[], spec: string): { ordinal: number; item: T }[] {
  return ordinalNumbers(spec, items.length).map((ordinal) => ({ ordinal, item: items[ordinal - 1] }));
}
