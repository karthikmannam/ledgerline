export function parsePaise(value: unknown): bigint | null {
  if (typeof value !== 'string') {
    if (typeof value === 'number' && Number.isSafeInteger(value)) {
      return BigInt(value);
    }
    return null;
  }
  const trimmed = value.trim();
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    return null;
  }
  try {
    const n = BigInt(trimmed);
    return n > BigInt(0) ? n : null;
  } catch {
    return null;
  }
}

export function toMoneyString(value: bigint | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value.toString();
}
