---
target: frontend/src/app/landing/page.tsx
total_score: 28
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 3
timestamp: 2026-08-20T13-02-24Z
slug: frontend-src-app-landing-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Calculator and FAQ update live; no async states exist on a static page to test further |
| 2 | Match System / Real World | 4 | Real Spanish forwarding code, euro formatting, sector vocabulary matching PRODUCT.md's "vender una recepcionista, no una IA" |
| 3 | User Control and Freedom | 3 | Skip link, Escape/outside-click on mobile menu with focus restore, independent FAQ toggles |
| 4 | Consistency and Standards | 3 | Icon tiles/radii/shadows disciplined; undercut by two off-system CTA buttons and a third undocumented muted-text hex |
| 5 | Error Prevention | 3 | Sliders clamped; FAQ pre-empts billing-overage anxiety |
| 6 | Recognition Rather Than Recall | 3 | Sticky nav, full plan details visible without cross-referencing |
| 7 | Flexibility and Efficiency of Use | 3 | Calculator inputs persist and propagate into /planes via activateRoiContext |
| 8 | Aesthetic and Minimalist Design | 3 | Strong tonal discipline per-section, but 11 sequential badge+H2+description sections read as dense/templated at page level |
| 9 | Error Recovery | n/a | No form submission or error-producing input exists on this static page |
| 10 | Help and Documentation | 3 | 8-item FAQ genuinely functions as embedded help |
| **Total** | | **28** | **/36 — Good (78%)** |

## Design Specificity Verdict

**LLM assessment**: This page is genuinely grounded in BotBook, not a reskinned template. Strongest evidence: the masked Spanish call-forwarding code in the "how it works" mockup, a bilingual mid-call demo snippet, a WhatsApp+calendar handoff naming a real staff member, and sourced sector-stat cards citing external sources rather than fabricated testimonials — correctly honoring PRODUCT.md's hard "no fake social proof pre-launch" constraint. The revenue calculator operationalizes the product's own stated success metric rather than decorating the page. Where it slips toward generic-SaaS instinct: repeated eyebrow-badge-above-headline pattern and two CTAs breaking into an off-palette "bright" treatment — both template reflexes the rest of the page otherwise avoids.

**Deterministic scan**: Static scan of the six source files (`page.tsx`, `site-landing.tsx`, `landing-hero.tsx`, `mobile-nav.tsx`, `sector-data-section.tsx`, `revenue-loss-calculator.tsx`) was clean — 0 findings. Scanning the *live rendered DOM* instead (via injected detector script) found 35 anti-patterns: `nested-cards` ×26, `icon-tile-stack` ×3, `clipped-overflow-container` ×2, `cramped-padding` ×2, `radial-spotlight-glow` ×1, `line-length` ×1. This source-vs-DOM gap is itself informative: issues that only emerge from component composition (cards nested inside cards inside cards) are invisible scanning files in isolation.

The `nested-cards` cluster (26 of 35 findings) concentrates in exactly the areas the qualitative review flagged as dense: the FAQ grid (9 of its `<details>` panels), the 3 niche-sector cards, and the chat/demo message bubbles in the "how it works" mockup — the detector puts a number on the "11 sections, template-feeling density" impression, rather than just asserting it.

Three of the six rule types look like false positives *for this specific design system*, not universal ones: `icon-tile-stack` flags the icon-above-heading pattern on the 3 niche cards, but DESIGN.md explicitly names icon-in-tile as "la firma más reconocible del sistema" — a deliberate signature, not templated slop (and the qualitative review independently rated this the one pattern with zero drift across all five files). `radial-spotlight-glow` flags the hero's background halo, but DESIGN.md documents that exact halo ("halo de Brote Claro arriba a la izquierda") as an intentional, named brand element. `cramped-padding` flags 0px vertical padding on two secondary buttons, but those buttons are `h-11`/`h-12` fixed-height flex containers with `items-center` — vertically centered by flexbox, not by padding, so the rule's padding-based heuristic doesn't apply to this button system. The remaining two — `clipped-overflow-container` (2, worth a spot-check for visual clipping at unusual viewport sizes) and `line-length` (1, ~96 chars/line vs. DESIGN.md's own readability intent) — read as real, minor findings.

**Visual overlays**: Browser evidence was gathered through a scripted, headless session rather than a tab you can see — it's already closed, so there's no live overlay open in your browser right now. The findings above are the full structured output from that session.

## Overall Impression

The page's content strategy is the strongest thing about it: it tells the truth about a pre-launch product without inventing social proof, and it makes the actual mechanism (call diversion → verified booking) tangible rather than promised. The gap is execution discipline against the design system BotBook already wrote for itself — eyebrow badges the system's own docs predict nobody reads, two CTAs drifting toward a named-and-banned color, a hardcoded hex standing in for the muted-text token in 33 places, and one reproducible mobile bug at the very first interaction Casey (the primary persona) would have. The single biggest opportunity: bring the page back into alignment with its own DESIGN.md before adding anything new — the rules that would fix most of this are already written down.

## What's Working

1. **The "de llamada perdida a cita confirmada" 3-step explainer** — the masked forwarding code, live bilingual snippet, and WhatsApp+calendar handoff make the mechanism tangible instead of promised. This is the section doing the most real persuasion work, and it executes PRODUCT.md's "vender una recepcionista, no una IA" principle in visual form.
2. **Sourced, honestly-labeled sector data** — every stat carries a citation, and press quotes about the sector problem are never framed as BotBook testimonials. This is a real, correctly-applied discipline given PRODUCT.md's explicit prohibition on fabricating social proof pre-launch.
3. **The revenue calculator's persistence and hand-off** — slider state survives via storage and the exact number shown flows into `/planes` via `activateRoiContext`, so the CTA isn't a broken promise once clicked. This matches the interruption-tolerant usage pattern PRODUCT.md describes.

## Priority Issues

**[P1] Eyebrow badges violate the page's own documented rule**
*Why it matters*: DESIGN.md's "Regla del Titular Solo" explicitly bans a small-caps label above a headline that only announces the section, naming this exact pattern and predicting nobody reads it. Three badges do exactly this: the hero's "Tu recepción, siempre disponible," the sector-data section's "El coste de no contestar," and the calculator's "Calcula el coste de no responder" — the last a near-verbatim restatement of the headline directly below it.
*Fix*: Delete these three badges, or replace with a label that adds information the headline lacks (the one legitimate example already in the system is the "Google Calendar" badge). Keep the "Recomendado" plan badge — that one is legitimate.
*Suggested command*: `/impeccable distill`

**[P1] Two CTAs use an undocumented color bordering the explicitly-banned neon lime**
*Why it matters*: DESIGN.md defines exactly two button treatments and reserves Brote Claro (`#b8d96e`) for focus rings and subtle highlights, not button fills. The calculator's "Recuperar mis X€ al mes" and the closing band's "Empezar ahora" both use `bg-[#b8d96e] hover:bg-[#e3ff9e]` — `#e3ff9e` isn't in the token table and sits close to the by-name-banned `#d6ff72` neon lime. These are also the two highest-commitment CTAs on the page (post-ROI-reveal and final close), exactly where the "confianza tranquila" tone matters most.
*Fix*: Convert both to standard `button-primary`, or if a bright high-intent variant is intentional, formalize it as a documented token instead of an ad hoc hex.
*Suggested command*: `/impeccable colorize`

**[P1] Mobile menu has no opaque fallback and is illegible when open**
*Why it matters*: Screenshot-verified: opening the mobile hamburger menu renders nav links directly over the hero headline, which shows through at low opacity but full sharpness despite `backdrop-filter: blur(24px)` being present in computed styles. This persisted after a 2-second wait, ruling out an animation-timing artifact. This is Casey's (the primary persona's) very first interaction on mobile.
*Fix*: Raise the panel to a fully opaque background (drop the `/95`), or add a solid-color fallback that doesn't depend on `backdrop-filter` rendering correctly.
*Suggested command*: `/impeccable harden`

**[P2] Structural density: 26 nested-card instances concentrated in three areas**
*Why it matters*: The detector's live-DOM scan found 26 card-inside-card nestings, 9 of them in the FAQ grid alone, plus the 3 niche-sector cards and the chat/demo message bubbles. This corroborates and quantifies the qualitative review's separate observation that 11 sequential badge+H2+description sections read as dense and templated at the page level — and lines up with a cognitive-load finding that the FAQ shows 8 accordions and the header shows 6 actions simultaneously, both over the ≤4-at-a-decision-point guideline.
*Fix*: Flatten redundant nesting in the FAQ and chat-bubble markup where a border/shadow is applied to both a wrapper and its child; consider collapsing the FAQ to fewer default-visible items.
*Suggested command*: `/impeccable layout`

**[P2] Revenue calculator has no plausibility ceiling**
*Why it matters*: Pushing both sliders to their documented max (in-range values, not an exploit) produces "192.000 € al año" — implausible for the stated 1–20 employee audience, and it directly contradicts PRODUCT.md's "sin alarmismo" brand commitment. A skeptical first-time owner hitting this number, even by accident, will distrust every other number on the page.
*Fix*: Cap the combination of ticket size × missed appointments to sector-plausible ranges, or add a soft reassurance/re-anchor note at extreme values.
*Suggested command*: `/impeccable clarify`

## Persona Red Flags

**Jordan (confused first-timer, non-technical Spanish small-business owner)**
- "Hablar con la demo" doesn't itself signal it's a live voice-AI call needing a microphone — that context is only in small print below, which a skimming first-timer may not read before clicking.
- The masked forwarding code in the how-it-works mockup uses dots with no inline note that it's illustrative — could read as "there's a secret code I need and don't have," the opposite of the section's reassurance intent.
- The eyebrow badges are exactly the low-contrast text DESIGN.md predicts nobody reads — Jordan, described in PRODUCT.md as reading "de pie y con prisa," will skip all three.
- "Servicios por profesional" (Pro tier) isn't explained relative to Inicio's flatter model — a first-timer has to infer the operational difference unaided.

**Riley (deliberate stress tester)**
- Confirmed via direct test: max-value sliders produce "192.000 € al año" — the layout doesn't break, but the number is the failure (see Priority Issues).
- The calculator's persisted state silently restores prior values on refresh with no visible confirmation anything was restored.
- FAQ, niche pills, and header nav all exceed 4 simultaneous choices — not a crash, but exactly the "too many things at once" pattern Riley is tasked to flag.

**Casey (distracted, mobile, thumb-only, standing between clients)**
- The mobile menu overlap bug hits Casey at the very first interaction.
- Reaching "Precios" by scroll (since the menu is broken) requires passing 6 full sections — a lot of one-handed scrolling for someone with "tiempo disponible corto e interrumpible" per PRODUCT.md.
- The calculator's slider thumbs are visually 24px against DESIGN.md's own 44px "Regla del Pulgar" for interactive targets — the surrounding track likely extends the real hit area, but the visual affordance for a precise drag is fiddly one-handed and standing.
- Positive note specific to Casey: the calculator's persistence (state survives if she's pulled away mid-adjustment) is a genuine accommodation for her actual usage pattern, worth preserving.

## Minor Observations

- A hardcoded `text-[#54634b]` appears 33 times across the five component files versus only 4 uses of the documented `.text-muted` token (and `#54634b` isn't the documented token value either — a third undocumented value competing with the system's single source of truth, though it does pass AA contrast).
- Translucent-white opacity values on dark surfaces are ad hoc and ungoverned: `/55`, `/65`, `/70`, `/75`, `/80`, `/90` all appear with no apparent system.
- The detector's `icon-tile-stack` and `radial-spotlight-glow` findings are worth knowing about for future audits, but don't need action here — both flag patterns DESIGN.md names as deliberate signature elements of this system.
- Two `clipped-overflow-container` findings (`#main-content` and one inner section) are worth a quick spot-check at unusual viewport sizes for visual clipping.
- The hero's animated demo panel and the separate microphone "Hablar con la demo" button sit side-by-side without explaining why there are two demos or which to try first.

## Questions to Consider

1. What if the 3-step explainer opened the page instead of sitting 4 sections deep — would mechanism-first framing convert a skeptical, non-technical audience better than a benefit headline does?
2. What if the revenue calculator capped its output at a sector-plausible ceiling — is an unbelievable number actively working against conversion right now?
3. What if the mobile hamburger menu were cut entirely in favor of just the two persistent CTAs — does Casey ever really need four nav destinations, or is this desktop IA carried over unexamined?
4. What if the two off-palette CTAs were swapped to the standard dark button — would the closing moment read as more trustworthy, or is the brighter button deliberately reserved for peak-intent moments and worth formalizing rather than removing?
