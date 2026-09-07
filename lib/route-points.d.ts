import type { Day } from './fixtures';
import type { FoodPlan } from './food-types';
import type { RoutePoint, TripRequest } from './plan';
export function createRoutePoints(origin: { lng: number; lat: number; verified: boolean } | null, request: TripRequest, days: Day[], food: FoodPlan): RoutePoint[];
