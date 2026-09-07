export function orderStops<T extends { lng: number; lat: number }>(stops: T[], origin?: { lng: number; lat: number } | null): T[];
