// Numbers as the person reads them: Spanish decimal comma ("3,3 V"), at most one decimal by default.
export const formatNumber = (n: number, maxDecimals = 1): string => n.toLocaleString("es", { maximumFractionDigits: maxDecimals });
