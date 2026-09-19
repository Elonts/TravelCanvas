---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/globals.css","app/features.css","app/route-map.tsx"]
---

Scope: root homepage and its complete demand, candidate, and itinerary states. Mode: Operate.

Audience and job: China domestic independent travelers who want to begin planning immediately, then verify places and routes without switching tools. The primary action is starting discovery with origin, destination, date, days, and travelers; budget, preferences, constraints, transport, food, and public-note evidence remain available through progressive disclosure.

Chosen direction: Immersive Aurora Route-first Canvas. Approved visual refinement: `.impeccable/mocks/aurora-immersive-homepage.png`, extending the approved structure comp `.impeccable/mocks/decision/route-first-canvas.png`. Desktop uses an asymmetric planning column and persistent route canvas over a deep pine night landscape with a mint aurora and a low photographic mountain-lake horizon; mobile orders planning, map, then stage content over a controlled crop. The memorable moment is the map progressing honestly from unqueried destination overview, to verified candidate points, to Provider-backed numbered routes while the atmospheric background remains decorative and non-geographic.

Proof and constraints: preserve the two-stage workflow, selected-place intent, source/query-time/pending states, AMap navigation, and all current adjustment features. The initial canvas must not imply a real route before querying. The aurora mountain-lake image is an explicitly decorative, non-specific travel atmosphere and must never be presented as a queried destination or Provider result. Keep tea green for action, pottery orange for direction, precise compact controls, keyboard focus, reduced motion, and no enterprise-dashboard composition.

Content ranges and states: first-run, loading, empty/offline, multi-city long candidates, success, errors, and local replanning; 1-10 days, 1-8 travelers, up to 10 destinations. No double-scroll desktop regions. Route map failure retains an explicit, usable sequence fallback.
