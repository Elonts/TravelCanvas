export type ImageAttribution = { label: string; sourceUrl: string | null; queriedAt: string; kind: 'amap' | 'web' };
export function fillMissingWebImages<T extends { city: string; name: string; imageUrl?: string | null }>(items: T[], env?: NodeJS.ProcessEnv, fetcher?: typeof fetch): Promise<(T & { imageAttribution?: ImageAttribution | null })[]>;
export function amapImageAttribution(imageUrl: string | null | undefined, queriedAt: string): ImageAttribution | null;
