# PRD: One-To-One BlenderHunt Marketplace Reproduction

## Problem Statement

We need a stable benchmark product that can measure `/kanban` workflow efficiency and delivery quality across repeated runs. The previous approval-platform benchmark was too small and too abstract. It did not expose enough product, visual, and interaction complexity to reveal whether vNext improves real agent collaboration.

Replica BlenderHunt provides a better benchmark because it combines marketplace information architecture, one-to-one visual reproduction, product detail browsing, API/data modeling, and cart state. Each run should build the same product from the same requirements, record process timing, and leave a runnable artifact for review.

## Solution

Build a runnable one-to-one reproduction of BlenderHunt's public marketplace experience. The product should reproduce the visible public shopping path: homepage, product detail, and add-to-cart flow with cart state.

The reproduction must be a real implementation, not a screenshot or static mockup. Users should be able to browse products, open details, add products to a cart, adjust the cart, and inspect enough product information to understand the purchase decision. The implementation may use local APIs, fixture data, and local state. It must not call real BlenderHunt APIs, real payment providers, or real user accounts at runtime.

Design resources may be collected from the public original site during the benchmark setup phase. Assets, screenshots, layout observations, product metadata, and visual references must be saved into the run artifact. Code must be written by the benchmark agents. The final app must run from local files and local code without depending on the original site.

The visual target is one-to-one practical reproduction of the observed site: black terminal-like surfaces, orange signal accents, compact marketplace density, system-style labels, real product imagery where captured, and matching page composition for the selected scope.

## Benchmark Scope

Each run must cover the same public product path:

- Homepage.
- Product listing/catalog modules visible on the homepage.
- At least one product detail page.
- Add-to-cart interaction from homepage or detail.
- Cart or shopping list view.
- Cart item quantity or removal controls.
- Disabled or simulated checkout state.

The scope is limited to the public buyer experience. Seller tools, authentication, real checkout, and production backend systems are outside this PRD.

## User Stories

1. As a marketplace visitor, I want to see a homepage that reproduces the original BlenderHunt homepage, so that the benchmark can evaluate real visual reproduction quality.
2. As a marketplace visitor, I want to see navigation matching the original public site structure, so that I can move between the homepage, product browsing, detail, and cart.
3. As a marketplace visitor, I want to see a live marketplace feed, so that the page feels active and commerce-oriented.
4. As a marketplace visitor, I want to see product categories, so that I can understand the range of assets.
5. As a marketplace visitor, I want to see product cards matching the original site's visible product card structure, so that I can compare products quickly.
6. As a marketplace visitor, I want to open a product detail page that matches the original detail page structure, so that I can inspect a product before adding it to my cart.
7. As a marketplace visitor, I want product detail pages to show the visible purchase decision fields from the original site, so that I can make a purchase decision.
8. As a marketplace visitor, I want free and paid products to be visually distinguishable, so that I understand what requires checkout.
9. As a marketplace visitor, I want to add a product to a cart from the homepage or detail page, so that I can collect products before checkout.
10. As a marketplace visitor, I want cart state to persist while navigating inside the app, so that I do not lose selected products.
11. As a marketplace visitor, I want to see the cart item count in navigation, so that I know whether the cart contains products.
12. As a marketplace visitor, I want to open the cart, so that I can review selected products.
13. As a marketplace visitor, I want to change item quantity where quantity makes sense, so that the cart behaves like a real commerce product.
14. As a marketplace visitor, I want to remove items from the cart, so that I can correct mistakes.
15. As a marketplace visitor, I want to see cart subtotal and final total, so that I understand the purchase amount.
16. As a marketplace visitor, I want an empty cart state, so that the app handles the first visit clearly.
17. As a marketplace visitor, I want duplicate add-to-cart actions to update the existing cart line, so that the cart does not create confusing duplicate rows.
18. As a marketplace visitor, I want disabled or unavailable checkout copy, so that I understand this benchmark does not process real payments.
19. As a marketplace visitor, I want search or filter controls to affect visible products, so that catalog browsing feels functional.
20. As a marketplace visitor, I want active category states, so that I understand the current catalog view.
21. As a marketplace visitor, I want responsive layout behavior, so that the product can be evaluated on a desktop viewport and not collapse on smaller screens.
22. As an asset developer, I want to capture approved reference screenshots and public visual assets from the original site, so that implementation agents work from the same reference material.
23. As an API developer, I want stable local endpoints or data access modules, so that frontend and cart work can proceed without calling the original site.
24. As a frontend developer, I want page and component boundaries for homepage, detail, and cart, so that I can implement the visible site structure in parallel with API/cart work.
25. As a cart developer, I want cart state isolated behind a small interface, so that add, update, remove, subtotal, and empty state can be tested independently.
26. As a tester, I want stable fixture data and saved visual references, so that different benchmark runs are comparable.
27. As a tester, I want a documented start command, so that I can run the app from the artifact without guessing.
28. As a tester, I want a documented smoke path, so that I can verify homepage, detail, and cart behavior consistently.
29. As a tester, I want side-by-side screenshots of original and reproduction, so that one-to-one reproduction can be assessed.
30. As an owner, I want final screenshots and verification output, so that I can compare quality across runs.
31. As an owner, I want known limitations recorded, so that incomplete product areas are not hidden.
32. As a developer, I want clear product scope, so that I do not spend benchmark time building unrelated backend or authentication features.
33. As a developer, I want clear visual requirements, so that the result is judged as a BlenderHunt reproduction rather than a generic shop.
34. As a developer, I want clear cart behavior, so that the core interaction can be implemented and tested in isolation.
35. As a reviewer, I want product requirements separated from benchmark process rules, so that I can judge implementation against product scope.

## Implementation Decisions

- Build a runnable web application with local implementation code. The app may expose local API routes, local service modules, or a local mock API layer, but it must not depend on real BlenderHunt runtime APIs.
- Use a stable captured product catalog fixture with products, categories, creators, product types, prices, and saved media references.
- Capture and save design resources from the original public site before implementation. These may include screenshots, public images, typography observations, color tokens, spacing observations, and DOM/content notes.
- Use application routing or equivalent view state for at least three surfaces: homepage, product detail, and cart.
- Let the `/kanban` run decide task decomposition. The product naturally contains source capture, local data/API contract, homepage/detail UI, cart state, and verification work, but this PRD does not prescribe seat names or task split.
- Treat cart behavior as a deep module: product lookup, add item, update quantity, remove item, subtotal, and empty state should be testable without reading UI internals.
- Treat catalog and product APIs as a bounded module: homepage and detail should consume the same data contract.
- Treat visual reproduction as a product requirement. The app should consume or mirror the provided token and theme references and the newly captured original-site references.
- Keep checkout as a disabled or simulated pre-checkout state. Do not implement payment.
- Store cart state locally in memory or browser storage. It only needs to persist within the benchmark app session unless the implementation chooses local persistence.
- Product detail pages should be generated from the same catalog data used by the homepage.
- Use deterministic data and deterministic UI copy where possible, so screenshots and benchmark results can be compared across runs.
- Include a clear start command and verification command or smoke procedure in the final artifact.

## Testing Decisions

- Tests should verify external behavior, not component internals.
- Asset capture should be verified by checking that original-site screenshots and source notes were saved in the run artifact.
- Local API/service behavior should be tested through public contracts: product list, product detail, price fields, category fields, and missing product handling.
- Cart logic should be tested directly: adding an item, adding the same item again, updating quantity, removing an item, subtotal calculation, and empty cart state.
- Catalog behavior should be tested through visible results: filtering by category and searching by text should update product visibility.
- Routing or navigation should be smoke-tested: homepage to detail, detail to cart, and cart back to browsing.
- UI verification should include side-by-side original and reproduction screenshots for the homepage, detail page, and cart flow.
- Visual tests do not need automated pixel-perfect comparison, but the tester must check that page composition, color, typography, density, and core components closely match the captured reference.
- A good benchmark test record includes the command run, the observed result, and the saved evidence location.

## Out of Scope

- Real authentication.
- Real user accounts.
- Real checkout or payment.
- Real Stripe integration.
- Real BlenderHunt API integration.
- Runtime dependence on BlenderHunt's live site.
- Seller dashboard.
- Product upload.
- User library or purchased downloads.
- Blog.
- Legal pages.
- Production deployment.
- Full mobile parity, unless the benchmark run explicitly chooses to include it.
- Copying proprietary source code from the original site.
- Pixel-perfect cloning of private implementation details that are not observable from the public site.

## Further Notes

- Public BlenderHunt references observed during PRD creation include the homepage positioning as an indie marketplace for Blender artists, a dark terminal-style marketplace feed, 19 indexed assets, creator revenue messaging, product categories, product list entries, and pricing cues.
- The benchmark should compare process efficiency and product quality, not prove legal or production readiness.
- The reproduction should avoid runtime dependence on live network content. Screenshots, fixture data, and local images are acceptable as benchmark assets when they are checked into the run artifact.
- The final result must be runnable and reviewable after the conversation ends.
