export const entertainmentPeriodRanges: Record<'morning' | 'afternoon' | 'evening', { start: number; end: number }>;
export function scheduleDay<T extends { durationMinutes?: number; period?: 'morning' | 'afternoon' | 'evening'; routeMeters?: number | null }>(attractions: T[], entertainment: T[]): T[];
