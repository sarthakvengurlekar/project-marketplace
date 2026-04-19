export const COUNTRIES: Record<string, { name: string; currency: string; symbol: string; currencyCode: string }> = {
  IN: { name: 'India', currency: 'INR', symbol: '₹', currencyCode: 'INR' },
  UAE: { name: 'UAE', currency: 'AED', symbol: 'AED', currencyCode: 'AED' },
};

export function formatPrice(amount: number, countryCode: string): string {
  const country = COUNTRIES[countryCode];
  if (!country) return String(amount);

  const formatted = amount.toLocaleString('en-IN');

  if (country.symbol === '₹') {
    return `₹${formatted}`;
  }
  return `${country.symbol} ${formatted}`;
}
