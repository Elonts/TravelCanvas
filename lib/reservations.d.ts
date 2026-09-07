import type { Day } from './fixtures';
export function reservationEvidence(name: string, results: unknown[], queriedAt?: string): import('./fixtures').ReservationInfo;
export function verifyDayReservations(day: Day, env?: NodeJS.ProcessEnv, fetcher?: typeof fetch): Promise<Day>;
