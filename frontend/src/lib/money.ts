/**
 * Financial precision library for LedgerLine.
 *
 * CRITICAL RULE:
 * NEVER use floating-point numbers (Math, parseFloat, Number multiplication) for financial operations.
 * All monetary amounts are integer paise (1/100 of a Rupee) represented as decimal strings or BigInt.
 */

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

/**
 * Formats a paise value string into a human-readable INR display string (e.g. "₹1,00,000.50").
 */
export function formatPaise(
  paise: string | bigint | number | null | undefined,
  options: {
    showCurrency?: boolean;
    showSign?: boolean;
  } = {}
): string {
  if (paise === null || paise === undefined || paise === '') {
    return '₹0.00';
  }

  const { showCurrency = true, showSign = false } = options;

  try {
    const rawStr = String(paise).trim();
    const isNegative = rawStr.startsWith('-');
    const cleanStr = isNegative ? rawStr.slice(1) : rawStr;

    // Validate integer paise format
    if (!/^\d+$/.test(cleanStr)) {
      return '₹0.00';
    }

    const totalPaise = BigInt(cleanStr);
    const rupees = totalPaise / 100n;
    const remainderPaise = totalPaise % 100n;

    const formattedRupees = RUPEE_FORMATTER.format(rupees);
    const formattedPaise = remainderPaise.toString().padStart(2, '0');

    const prefix = showSign ? (isNegative ? '- ' : '+ ') : (isNegative ? '-' : '');
    const currencySymbol = showCurrency ? '₹' : '';

    return `${prefix}${currencySymbol}${formattedRupees}.${formattedPaise}`;
  } catch {
    return '₹0.00';
  }
}

/**
 * Validates and converts a user-entered Rupee decimal string (e.g. "1000.50", "250", "0.75")
 * into exact integer paise string (e.g. "100050", "25000", "75").
 *
 * Rejects negative numbers, multiple decimal points, more than 2 decimal digits, or non-numeric characters.
 */
export function rupeesToPaise(input: string): { success: true; paise: string } | { success: false; error: string } {
  if (!input || typeof input !== 'string') {
    return { success: false, error: 'Amount is required' };
  }

  const trimmed = input.trim();

  if (trimmed === '') {
    return { success: false, error: 'Amount is required' };
  }

  // Must match integer or up to 2 decimal places (e.g., "120", "120.5", "120.50", "0.75")
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(trimmed)) {
    return { success: false, error: 'Please enter a valid amount (e.g. 1000 or 1000.50)' };
  }

  const [rupeesPart, decimalPart = ''] = trimmed.split('.');

  try {
    const rupeesBig = BigInt(rupeesPart || '0');
    // Pad decimal part to 2 digits: "5" -> "50", "05" -> "05", "" -> "00"
    const paisePart = decimalPart.padEnd(2, '0');
    const paiseBig = BigInt(paisePart);

    const totalPaise = rupeesBig * 100n + paiseBig;

    if (totalPaise <= 0n) {
      return { success: false, error: 'Amount must be greater than zero' };
    }

    return { success: true, paise: totalPaise.toString() };
  } catch {
    return { success: false, error: 'Invalid monetary input' };
  }
}

/**
 * Converts a paise string back to a decimal string for input form fields (e.g. "100050" -> "1000.50").
 */
export function paiseToDecimalInput(paiseStr: string): string {
  try {
    const total = BigInt(paiseStr.trim());
    const r = total / 100n;
    const p = total % 100n;
    if (p === 0n) return r.toString();
    return `${r.toString()}.${p.toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}
