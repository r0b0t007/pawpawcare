# Cinematic Hero Lab

Standalone test bench for the GSAP "CinematicHero" landing component
(21st.dev-style drop-in), themed with PawPawCare copy and brand tokens.
It is **not** wired into `website/` — the marketing site is plain
HTML/CSS and this component needs React + Tailwind + GSAP.

## Run

```bash
cd experiments/cinematic-hero
npm install
npm run dev        # http://localhost:5173
```

Scroll slowly: the whole experience is one pinned 7000px scroll timeline
(intro text → navy card flies in → iPhone mockup + metrics → pullback →
store-badge CTA).

## Structure

shadcn conventions without the CLI (no components.json needed for one
component): `src/components/ui/` for the component, `src/lib/utils.ts`
for `cn()`, Tailwind v4 via `@tailwindcss/vite` with the shadcn semantic
tokens (`--color-background`, `--color-foreground`,
`--color-muted-foreground`) mapped to PawPawCare cream/bark in
`src/index.css`.

## Verdict / caveats

- Works: TS-clean, no console errors, all scroll stages render. Tested
  by driving the GSAP timelines directly (`window.gsap` debug handle).
- The card interior is hardcoded **navy** (`#162C6D`) with blue accents
  and silver text — off-brand next to the cream/bark site. Reskinning
  means editing `INJECTED_STYLES` (premium-depth-card, progress ring,
  widget accents), not just props.
- Hardcoded strings remain inside the phone mockup and badges ("Journey",
  "JS", "1 Year Streak", "Sponsor Update") — props don't cover them.
- Accessibility: no `prefers-reduced-motion` handling; a 7000px scroll
  hijack is hostile to keyboard/AT users as a real landing page.
- Emoji used as badge icons (against our icon rules) — swap for
  lucide-react if this ever ships.
