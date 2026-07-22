import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Parse numbers in Brazilian format (e.g., "1.234,56", "R$ 54,00") safely to Number
export function parseBRNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const str = String(value).trim();
  if (!str) return 0;

  // Remove currency symbols and any non-digit separators except . , -
  const onlySymbols = str.replace(/[^[0-9.,-]]/g, "");

  // If has comma, treat as decimal comma and remove thousand dots
  if (onlySymbols.includes(",")) {
    // Remove all dots (thousands) then replace last comma with dot
    const noThousands = onlySymbols.replace(/\./g, "");
    const normalized = noThousands.replace(/,/g, ".");
    const n = Number(normalized);
    return isNaN(n) ? 0 : n;
  }

  // Otherwise, assume dot as decimal separator and comma as thousands
  const normalized = onlySymbols.replace(/,/g, "");
  const n = Number(normalized);
  return isNaN(n) ? 0 : n;
}
