export const CURRENCIES = [
  "INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "CHF", "CNY", "HKD",
  "IDR", "JPY", "KRW", "LKR", "MYR", "NPR", "NZD", "PHP", "QAR", "SAR",
  "SEK", "SGD", "THB", "TRY", "VND", "ZAR", "BDT", "MXN", "BRL", "DKK",
  "NOK", "PLN", "CZK", "HUF", "ILS", "EGP", "KES", "TWD", "OMR", "KWD",
] as const;

export function isSupportedCurrency(code: string): boolean {
  return (CURRENCIES as readonly string[]).includes(code);
}

export function currencyDecimals(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;
}

export function parseAmountToMinor(input: string, currency: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const decimals = currencyDecimals(currency);
  const [whole, fraction = ""] = cleaned.split(".");
  if (fraction.length > decimals) return null;
  const minor = Number(whole + fraction.padEnd(decimals, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function convertMinor(
  amountMinor: number,
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): number {
  const scale = 10 ** (currencyDecimals(toCurrency) - currencyDecimals(fromCurrency));
  return Math.round(amountMinor * rate * scale);
}

export function formatMinor(amountMinor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amountMinor / 10 ** decimals);
}

export function minorToInput(amountMinor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  return (amountMinor / 10 ** decimals).toFixed(decimals);
}
