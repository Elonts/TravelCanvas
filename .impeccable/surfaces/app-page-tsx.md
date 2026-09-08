---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/globals.css","app/features.css","app/route-map.tsx"]
---

Scope: root homepage and its complete demand, candidate, and itinerary states. Mode: Operate.

Audience and job: China domestic independent travelers who want to begin planning immediately, then verify places and routes without switching tools. The primary action is starting discovery with origin, destination, date, days, and travelers; budget, preferences, constraints, transport, food, and public-note evidence remain available through progressive disclosure.

Chosen direction: Route-first Canvas. Approved comp: `.impeccable/mocks/decision/route-first-canvas.png`. Desktop uses an asymmetric planning column and persistent route canvas; mobile orders planning, map, then stage content. The memorable moment is the map progressing honestly from unqueried destination overview, to verified candidate points, to Provider-backed numbered routes.

Proof and constraints: preserve the two-stage workflow, selected-place intent, source/query-time/pending states, AMap navigation, and all current adjustment features. The initial canvas must not imply a real route before querying. Keep the City Exploration Compass identity, tea-mountain green and pottery orange roles, precise compact controls, keyboard focus, reduced motion, and no enterprise-dashboard composition.

Content ranges and states: first-run, loading, empty/offline, multi-city long candidates, success, errors, and local replanning; 1-10 days, 1-8 travelers, up to 10 destinations. No double-scroll desktop regions. Route map failure retains an explicit, usable sequence fallback.
