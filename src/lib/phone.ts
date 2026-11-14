/**
 * Normalizes Thai domestic phone inputs (e.g. "081-234-5678", "0812345678")
 * into E.164 format ("+66812345678"). Returns null when input is blank.
 */
export function normalizeThaiPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) return null;
  if (/^0[689]\d{8}$/.test(cleaned) || /^0[2-7]\d{7,8}$/.test(cleaned)) {
    return `+66${cleaned.slice(1)}`;
  }
  if (/^66\d{8,9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  return cleaned;
}
