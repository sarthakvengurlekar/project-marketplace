export const COUNTRIES: Record<string, { name: string; currency: string; symbol: string; currencyCode: string }> = {
  IN: { name: 'India', currency: 'INR', symbol: '₹', currencyCode: 'INR' },
  UAE: { name: 'UAE', currency: 'AED', symbol: 'AED', currencyCode: 'AED' },
};

// Approximate fixed rates: 1 USD → local currency
const USD_TO: Record<string, number> = {
  IN: 83.5,
  UAE: 3.67,
};

export function convertFromUSD(usdAmount: number, countryCode: string): number {
  return Math.round(usdAmount * (USD_TO[countryCode] ?? 1));
}

export function formatPriceFromUSD(usdAmount: number, countryCode: string): string {
  return formatPrice(convertFromUSD(usdAmount, countryCode), countryCode);
}

export function formatPrice(amount: number, countryCode: string): string {
  const country = COUNTRIES[countryCode];
  if (!country) return String(amount);

  const formatted = amount.toLocaleString('en-IN');

  if (country.symbol === '₹') {
    return `₹${formatted}`;
  }
  return `${country.symbol} ${formatted}`;
}
