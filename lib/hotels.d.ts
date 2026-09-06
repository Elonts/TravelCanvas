export type HotelRecommendation = { id: string; title: string; area: string; rationale: string; filters: string; priceGuide: string; ctripUrl: string; query: string };
export function recommendHotels(input: { destination: string; days: number; budget: number; travelers: number; preferences?: string; stops: { name: string }[] }): HotelRecommendation[];
