export type EvidenceSource = {
  id: string; title: string; url: string | null; content: string;
  kind: 'search' | 'pasted'; publishedAt: string | null; queriedAt: string;
};
export type EvidenceTip = {
  id: string; sourceId: string; placeName: string; text: string; quote: string;
  category: 'food' | 'travel' | 'ranking'; state: 'pending';
};
export type Restaurant = {
  id: string; name: string; address: string; lng: number; lat: number;
  category: string; price: { low: number; high: number } | null;
  hours: string; hoursDate?: string | null; source: string; queriedAt: string; tips: EvidenceTip[];
};
export type RouteLeg = {
  from: string; to: string; minutes: number | null; meters: number | null;
  fare: number | null; state: 'live' | 'pending'; queriedAt: string;
};
export type MealSlot = {
  id: string; dayIndex: number; city: string; label: string; date: string;
  previous: import('./fixtures').Stop; next: import('./fixtures').Stop | null;
  earliest: number; latest: number; depart: number; nextDeadline: number;
  foodLimit: number; transportLimit: number;
};
export type MealOption = {
  restaurant: Restaurant; route: RouteLeg[]; direct: RouteLeg | null;
  extraMinutes: number | null; extraFare: number | null;
  totalLow: number | null; totalHigh: number | null; arrival: number | null;
  finish: number | null; eligible: boolean; reasons: string[]; pending: string[];
  score: number; explanation: string;
};
export type Meal = {
  slot: MealSlot; options: MealOption[]; selectedId: string | null; locked: boolean;
};
export type FoodPlan = {
  meals: Meal[]; sources: EvidenceSource[]; tips: EvidenceTip[]; warnings: string[];
  searchState: 'live' | 'pending'; queriedAt: string;
  summary: { allocated: number; breakfastReserve: number; selectedLow: number;
    selectedHigh: number; extraTransport: number; unresolved: number; remaining: number };
};
