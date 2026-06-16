# PRD: Replica BlenderHunt Marketplace

## Problem Statement

We need a stable benchmark product that can measure `/kanban` workflow efficiency and delivery quality across repeated runs. The previous approval-platform benchmark was too small and too abstract. It did not expose enough product, visual, and interaction complexity to reveal whether vNext improves real agent collaboration.

Replica BlenderHunt provides a better benchmark because it combines marketplace information architecture, visual replication, product detail browsing, and cart state. Each run should build the same product from the same requirements, record process timing, and leave a runnable artifact for review.

## Solution

Build a runnable front-end marketplace replica inspired by BlenderHunt. The product should reproduce the core public shopping experience: a dense marketplace homepage, product detail pages, and an add-to-cart flow with cart state.

The replica must feel like a real product, not a static mockup. Users should be able to browse products, open details, add products to a cart, adjust the cart, and inspect enough product information to understand the purchase decision. The implementation can use local fixture data and local state. It must not use real BlenderHunt accounts, payment, checkout, or APIs.

The visual direction follows the existing design reference: black terminal-like surfaces, orange signal accents, compact marketplace density, and system-style labels. Product content can be local fixture content derived from observed public page structure, but the app must not depend on live network data.

## User Stories

1. As a marketplace visitor, I want to see a strong homepage hero, so that I understand the site is an indie marketplace for Blender creators.
2. As a marketplace visitor, I want to see clear navigation, so that I can move between the homepage, product browsing, and cart.
3. As a marketplace visitor, I want to see a live marketplace feed, so that the page feels active and commerce-oriented.
4. As a marketplace visitor, I want to see product categories, so that I can understand the range of assets.
5. As a marketplace visitor, I want to see product cards with title, category, creator, type, and price, so that I can compare products quickly.
6. As a marketplace visitor, I want to open a product detail page, so that I can inspect a product before adding it to my cart.
7. As a marketplace visitor, I want product detail pages to show price, category, creator, type, compatibility, and license cues, so that I can make a purchase decision.
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
22. As a tester, I want stable fixture data, so that different benchmark runs are comparable.
23. As a tester, I want a documented start command, so that I can run the app from the artifact without guessing.
24. As a tester, I want a documented smoke path, so that I can verify homepage, detail, and cart behavior consistently.
25. As an owner, I want final screenshots and verification output, so that I can compare quality across runs.
26. As an owner, I want known limitations recorded, so that incomplete product areas are not hidden.
27. As a developer, I want clear product scope, so that I do not spend benchmark time building unrelated backend or authentication features.
28. As a developer, I want clear visual requirements, so that the result is judged as a BlenderHunt replica rather than a generic shop.
29. As a developer, I want clear cart behavior, so that the core interaction can be implemented and tested in isolation.
30. As a reviewer, I want product requirements separated from benchmark process rules, so that I can judge implementation against product scope.

## Implementation Decisions

- Build a front-end application with local fixture data. The benchmark product does not need a real backend.
- Use a small product catalog fixture with stable products, categories, creators, product types, prices, and media placeholders.
- Use application routing or equivalent view state for at least three surfaces: homepage, product detail, and cart.
- Treat cart behavior as a deep module: product lookup, add item, update quantity, remove item, subtotal, and empty state should be testable without reading UI internals.
- Treat catalog filtering as a separate module or clearly bounded function: category filtering and search should use stable fixture data.
- Treat visual system usage as a product requirement. The app should consume or mirror the provided token and theme references instead of inventing an unrelated style.
- Keep checkout as a disabled or simulated pre-checkout state. Do not implement payment.
- Store cart state locally in memory or browser storage. It only needs to persist within the benchmark app session unless the implementation chooses local persistence.
- Product detail pages should be generated from the same catalog data used by the homepage.
- Use deterministic data and deterministic UI copy where possible, so screenshots and benchmark results can be compared across runs.
- Include a clear start command and verification command or smoke procedure in the final artifact.

## Testing Decisions

- Tests should verify external behavior, not component internals.
- Cart logic should be tested directly: adding an item, adding the same item again, updating quantity, removing an item, subtotal calculation, and empty cart state.
- Catalog behavior should be tested through visible results: filtering by category and searching by text should update product visibility.
- Routing or navigation should be smoke-tested: homepage to detail, detail to cart, and cart back to browsing.
- UI verification should include at least one desktop screenshot or browser smoke record.
- Visual tests do not need pixel-perfect comparison, but the tester must check that the result follows the dark terminal marketplace direction from the design reference.
- A good benchmark test record includes the command run, the observed result, and the saved evidence location.

## Out of Scope

- Real authentication.
- Real user accounts.
- Real checkout or payment.
- Real Stripe integration.
- Real BlenderHunt API integration.
- Seller dashboard.
- Product upload.
- User library or purchased downloads.
- Blog.
- Legal pages.
- Production deployment.
- Full mobile parity, unless the benchmark run explicitly chooses to include it.
- Pixel-perfect cloning of private implementation details.

## Further Notes

- Public BlenderHunt references observed during PRD creation include the homepage positioning as an indie marketplace for Blender artists, a dark terminal-style marketplace feed, 19 indexed assets, creator revenue messaging, product categories, product list entries, and pricing cues.
- The benchmark should compare process efficiency and product quality, not prove legal or production readiness.
- The replica should avoid dependence on live network content. Screenshots, fixture data, and local images are acceptable as benchmark assets when they are checked into the run artifact.
- The final result must be runnable and reviewable after the conversation ends.
