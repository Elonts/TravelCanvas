export function foodPreferenceTerms(value: string): string[];
export function attractionPreferenceFit(place: { name: string; category?: string }, request: { preferences?: string; constraints?: string }): { score: number; excluded: boolean; note: string; caution: string };
