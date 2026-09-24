export type EvidenceSource = {
  id: string; title: string; url: string | null; content: string;
  kind: 'search' | 'pasted'; publishedAt: string | null; queriedAt: string;
  sourceKind?: 'tavily_public' | 'xhs_session'; query?: string;
};
export type EvidenceTip = {
  id: string; sourceId: string; placeName: string; text: string; quote: string;
  category: 'food' | 'travel' | 'ranking'; state: 'pending';
  sourceKind?: 'tavily_public' | 'xhs_session'; searchRank?: number; visibleLikes?: number | null;
  dishes?: string[];
};
export type Restaurant = {
  id: string; name: string; address: string; lng: number; lat: number;
  category: string; price: { low: number; high: number } | null;
  hours: string; hoursDate?: string | null; source: string; queriedAt: string; tips: EvidenceTip[];
  city?: string; preferred?: boolean; imageUrl?: string | null; navigationUrl?: string | null;
  preferredMealId?: string;
  imageAttribution?: import('./web-images.mjs').ImageAttribution | null;
  featuredDishes?: string[];
};
export type RouteLeg = {
  from: string; to: string; minutes: number | null; meters: number | null;
  fare: number | null; state: 'live' | 'pending'; queriedAt: string;
  polyline?: [number, number][]; error?: string | null;
  transitSteps?: TransitStep[];
};
export type TransitStep = { kind: 'walk' | 'bus' | 'subway'; instruction: string; lineName?: string; fromStop?: string; toStop?: string; viaStops?: number; minutes?: number | null; meters?: number | null; firstTime?: string; lastTime?: string };
export type MealSlot = {
  id: string; dayIndex: number; city: string; label: string; date: string;
  previous: import('./fixtures').Stop; next: import('./fixtures').Stop | null;
  earliest: number; latest: number; depart: number; nextDeadline: number;
  foodLimit: number; transportLimit: number;
};
export type MealOption = {
  restaurant: Restaurant; route: RouteLeg[]; direct: RouteLeg | null;
  extraMinutes: number | null; extraMeters: number | null; extraFare: number | null;
  totalLow: number | null; totalHigh: number | null; arrival: number | null;
  finish: number | null; eligible: boolean; reasons: string[]; pending: string[];
  canAcceptPending: boolean; hardBlocked: boolean;
  score: number; explanation: string;
};
export type Meal = {
  slot: MealSlot; options: MealOption[]; selectedId: string | null; draftSelectedId?: string | null; locked: boolean;
};
export type ManualRestaurantDecision = {
  input: string;
  status: 'needs_branch' | 'scheduled_draft' | 'needs_risk_confirmation' | 'unassigned' | 'explicitly_skipped' | 'finalized';
  restaurantId?: string; matchedName?: string; address?: string;
  candidates?: {
    restaurantId: string; name: string; address: string; restaurant: Restaurant;
    mealId: string | null; mealLabel: string | null; dayIndex: number | null;
    routeMeters: number | null; extraMeters: number | null; extraMinutes: number | null; extraFare: number | null;
    reasons: string[]; pending: string[]; hardBlocked: boolean; replacesRestaurantName: string | null; recommended: boolean;
  }[];
  mealId?: string; mealLabel?: string; dayIndex?: number; extraMinutes?: number | null;
  reasons: string[];
};
export type FoodPlan = {
  meals: Meal[]; sources: EvidenceSource[]; tips: EvidenceTip[]; warnings: string[];
  manualRestaurants: ManualRestaurantDecision[];
  searchState: 'live' | 'pending'; queriedAt: string;
  summary: { allocated: number; breakfastReserve: number; selectedLow: number;
    selectedHigh: number; selectedCostPending: number; extraTransport: number; unresolved: number; remaining: number };
};
