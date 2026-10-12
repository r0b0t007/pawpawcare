# PawPawCare redesign prompt — "Lively & Light"

> Paste everything below the line into the design tool (DesignCraft, Claude Design, Stitch, …).
> The DesignCraft-specific build notes are in section 11; drop that section for other tools.

---

## 1. Role and mission

You are a senior mobile product designer who specialises in consumer health apps and behavioural design. Redesign **PawPawCare**, a pet-health app for iOS and Android. Make it **lively and full of real cat and dog photography**. Lower the user's **cognitive load**. Apply proven UI/UX and psychology principles, and name the principle behind each major decision in an annotation.

The app manages health data, so it must feel **warm, playful and trustworthy at the same time**. A worried owner opening it at 11 pm should feel calmer, not more stressed.

## 2. Product context

- **Users:** pet owners, often with several pets, and families who share care for one pet (owner + invited caretakers). Mostly non-technical. They open the app in short bursts: "what do I need to do?" or "log this quickly".
- **Navigation:** 5 bottom tabs. Keep them (Jakob's law):
  - **Home:** status summary, "Up Next" task, pets row, this week.
  - **Pets:** pet list → Pet profile (feeding, daily routine, medications, weight, expenses, milestones, caretaker notes, emergency contact, family sharing) → Add / Edit pet.
  - **Health:** health records, vaccination tracker, medical vault (documents), reminders.
  - **Community:** feed of pet moments, groups, lost-pet reports ("I've seen them", "Mark as found").
  - **Profile:** account, invites, support.
- **Gamification already exists:** care streak card, milestones, monthly recap card.
- **Tech:** React Native (Expo) with StyleSheet tokens. Design with buildable components only: no web-only effects, no heavy blur stacks.

## 3. Goals, in priority order

1. **Answer each screen's one question in under 3 seconds.** Home: "Is everyone OK, and what do I do next?" Pet profile: "How is this pet doing today?"
2. **Feel alive.** Real cat and dog faces, warm colour and personality in the microcopy.
3. **Stay calm and credible.** Use urgency colour only for genuinely urgent items. Never use guilt, fake urgency or dark patterns.

## 4. Brand constants (do not change)

- **Logo:** the existing brown paw with a white dog and a peach cat on cream. Use the supplied asset; never redraw it.
- **Typeface:** Plus Jakarta Sans (400 / 600 / 700 / 800).
- **Primary action colour:** `#8a5300` (warm brown). Only this colour is used for buttons, links and the active tab, so the action is always the one thing that pops (Von Restorff effect).
- **Background:** cream `#fffaf6`. **Surface:** `#ffffff`. **Ink:** `#241a0e`. **Secondary text:** `#6f604c`.
- **Status colours:**

  | Status | Colour | Tint | Text on tint |
  |---|---|---|---|
  | Overdue | `#ba1a1a` | `#ffdad6` | `#93000a` |
  | Due soon | `#d4a000` | `#fff3d0` | `#7a5c00` |
  | All good | `#1a6b3a` | `#e6f4ea` | |

  Show each status **exactly once** per item, always as **icon + word**, never as colour alone.

## 5. What changes from the current design ("Direction 1g")

The current design is calm but flat: one accent, 1px borders, no shadows, almost no imagery. Relax it like this:

- **Add a playful secondary palette for identity and categories only, never for actions.** Use these bg/fg pairs:

  | Name | Background | Foreground |
  |---|---|---|
  | Peach | `#ffddb8` | `#8a5300` |
  | Sky | `#c5e7ff` | `#004c6a` |
  | Leaf | `#d0f0c0` | `#1a6b3a` |
  | Rose | `#ffd6e7` | `#96375c` |
  | Lavender | `#e9e2f4` | `#5c4a82` |

  Each pet owns one pair. Its colour tints that pet's header, avatar ring background and the chips in its reminders, so users recognise the pet before they read its name.
- **Photography becomes a first-class element** (section 6).
- **Depth:** photo cards and the single hero card on each screen may use one soft shadow (y 4, blur 16, 8% warm-brown). Everything else keeps 1px `#eee2d3` borders.
- **Radii:** cards 20, photo heroes 24, controls 14, sheets 28, avatars full circle.
- **Type:** keep the scale (screen title 26/800, card title 19/700, body 14/400, secondary 12/400, section label 11/700 caps). Add a **display style 32/800** for pet names on photo heroes.

## 6. Cat and dog photography

**Casting.** Use a roughly 50/50 mix of cats and dogs across diverse breeds, sizes and coat colours. Sample pets for every mockup:

| Pet | Description | Colour pair |
|---|---|---|
| **Biscuit** | golden retriever, 4 y | Peach |
| **Miso** | orange tabby cat, 2 y | Rose |
| **Luna** | black cat, 7 y | Lavender |
| **Pepper** | beagle puppy, 6 mo | Leaf |

**Style.**
- Natural daylight with a warm grade, shot at eye level.
- Candid and happy moments: no studio cut-outs and no costumes.
- Where possible the pet **looks toward the headline or the primary button**. Gaze cueing pulls the user's eye to the action.
- Consistent crops: avatars 1:1 circle, profile hero 4:5 full-bleed, cards 16:9, empty states 1:1 inside a soft rounded blob.

**Where photos go:**

| Screen | Photo |
|---|---|
| Welcome | Hero of a cat and a dog together |
| Add pet, step 1 | Two big species cards (Dog / Cat photo) |
| Pet profile | Full-bleed header photo with name + age overlay on a bottom gradient scrim |
| Home | Pet avatars row, plus the pet's face on the Up Next card |
| Every reminder / record row | Small pet face on the left, so users recognise rather than recall which pet it's for |
| Every empty state | Pet photo + one sentence + one button |
| Community and Lost pets | User photos; warm placeholder when missing |

**Where photos never go:** behind dense text without a scrim, inside data tables or medical-record rows, or as decoration that pushes the primary action below the fold.

**Rules.**
- A user's own pet photo always replaces stock imagery.
- Never present a stock animal as the user's pet outside onboarding samples.
- Every photo needs alt text, e.g. "Orange tabby cat stretching in sunlight".
- Source photos only under a free commercial licence (Unsplash or Pexels) or as AI-generated images, and keep a credits list.

## 7. Cognitive-load rules (apply on every screen)

1. **One primary action per screen.** Brown, full-width or FAB, in the bottom thumb zone (Fitts's law). Secondary actions are ghost buttons or live in an overflow menu.
2. **At most 3 content sections above the fold**, and **at most 5 items per group** (Hick's law; Miller's chunking). Anything more goes behind "See all".
3. **Group by time, not by data type:** Today / This week / Later. Users think "what's next", not "which table".
4. **Progressive disclosure on Pet profile.** The current screen stacks about 10 sections in one long scroll. Replace it with:
   - photo hero
   - a **"Today" card** (feeding + meds due today, each with a one-tap "Done")
   - a **2×2 tile grid**: Health, Routine, Weight, Notes. Each tile shows one summary number or line and opens its detail screen.
   - **Expenses, Milestones, Emergency contact and Family sharing** in a "More" list
   - **Leave pet, Revoke links and Report lost** in the overflow menu, behind a confirm dialog
5. **Recognition over recall.** Label every icon. Put the pet's face beside every task. Show the last-used pet and values as defaults.
6. **Plain-language status.** Write "Rabies booster due in 3 days", not "Vaccination: due_soon". Prefer relative dates, with the exact date in secondary text.
7. **Smart defaults and fewer fields.**
   - Pre-fill today's date, the last-used pet and common frequencies.
   - Make **Add pet** a 3-step flow with one question per screen (species → name + photo → birthday), with "Add more details later".
   - Make logging weight or a dose a single bottom sheet that needs at most 2 taps.
8. **Consistency.** Use the same card, row, chip and sheet patterns everywhere. A tap on a pet face always opens that pet.
9. **Visual hierarchy test.** Blur the mockup. The pet photo, the one status sentence and the primary button should still be the three things you see first.

## 8. Behavioural psychology (ethical only)

| Principle | Apply it as |
|---|---|
| **Goal-gradient + Zeigarnik effect** | Home shows a daily ring "3 of 4 care tasks done". The open task is visibly the next step. |
| **Positive reinforcement** | Completing a task shows a check-mark morph, the pet's photo and warm copy ("Miso's all set for today"). No confetti. |
| **Peak-end rule** | Every flow (add pet, log record, finish today's tasks) ends on a happy pet photo and a one-line summary, never a bare form. |
| **Gentle streaks** | Show the care streak as encouragement, with a "rest day" grace. No loss-aversion copy like "You'll lose your streak!". |
| **No-shame framing** | For overdue items write "Let's get Biscuit's booster booked", with a one-tap "Book / Mark done". Never "You missed…". |
| **Personalisation** | Time-of-day greeting with the user's and pets' names ("Good morning, Ahmed. Biscuit and Miso are all good."). |
| **Aesthetic-usability effect** | Polish photo crops, spacing and alignment. A beautiful app is perceived as easier and more trustworthy. |
| **Social proof** | Use it only in Community (likes, "3 neighbours saw this pet"), never to pressure health decisions. |
| **Autonomy** | Notifications are opt-in with a clear preview of what will be sent. Snooze is always one tap away. |

**Forbidden:** fake urgency, guilt copy, hidden costs, confirm-shaming ("No, I don't love my pet"), pre-checked upsells, intrusive modals on launch.

## 9. Accessibility (non-negotiable)

- **Contrast:** WCAG 2.2 AA, 4.5:1 for text and 3:1 for UI. Check every tint/text pair, especially the green chips and white text on photos (use a scrim of at least 40%).
- **Touch targets:** at least 44×44 pt.
- **Status:** never shown by colour alone.
- **Dynamic Type:** layouts survive 200% text size.
- **Screen readers:** every photo has alt text. Reading order is photo → status sentence → action.
- **Motion:** every motion note has a reduced-motion fallback (cross-fade or none).

## 10. Motion intent (annotate only; don't prototype)

- Everything takes **≤300 ms**.
- Use springs for anything a finger touched (press scale 0.97).
- Sheets slide up. The task-done check morphs. Photo heroes do a subtle parallax on scroll, removed under reduced motion.
- Haptics only on segmented change, toast, sheet snap and destructive confirm.
- No tab-switch animations, no entrance staggers, no confetti.

## 11. Deliverables

**Screens**, light mode, iPhone 390×844 pt, real sample data. Priority order:

1. **Welcome:** cat + dog hero, one-line value prop, "Get started", and "I already have an account".
2. **Add pet, 3 steps:** species photo cards → name + photo → birthday, then a success screen with the pet's photo.
3. **Home, 3 states:**
   - (a) all good, 2 pets
   - (b) one item due soon + one overdue, 4 pets
   - (c) brand-new user with no pets (empty state)
4. **Pets list:** photo cards in a grid, with status shown once per pet.
5. **Pet profile overview:** hero, Today card, 2×2 tiles, More list.
6. **Health hub:** Today / This week / Later, with a pet-face filter row.
7. **Reminders:** an empty state, plus the log-dose bottom sheet.
8. **Community feed:** includes one Lost-pet card.
9. **Component sheet:** palette, type scale, buttons, chips, status pill, list row, photo hero card, pet avatar with species badge, care tile, daily progress ring, empty state, bottom sheet.

**Annotations** (separate layer):
- For each screen, give 3–5 callouts naming the principle used (e.g. "Hick's law: 3 sections max").
- State the one question the screen answers.

**DesignCraft build notes:**
- Create a document of **390×844 pt pages** with intent `mobile` and no facing pages. Put one screen per page, with page 1 = cover and page 2 = component sheet.
- Add swatches named after the tokens above (`accent`, `ink`, `peach-bg`, `peach-fg`, …) and paragraph styles named after the type scale (`screenTitle`, `cardTitle`, `display`, …). Every object must use a swatch or style, with no unnamed colours.
- Layers: `Photos`, `UI`, `Annotations` (non-printing).
- Use `object.cornerOptions` for radii, `object.dropShadow` only on hero/photo cards, and `object.gradient` for the photo scrims.
- Place photos into graphic frames with `fillProportionally`.
- Save as `design/pawpawcare-lively.designcraft`. Export each page as PNG at 3× into `design/exports/`, plus one PDF of all pages.

## 12. Acceptance checklist

- [ ] Every screen answers one question; its primary action is the only brown filled button.
- [ ] At most 3 sections above the fold and at most 5 items per group.
- [ ] Cat and dog photos appear on Welcome, Add pet, Home, Pet profile and every empty state, each with alt text.
- [ ] Each pet is recognisable by its photo and colour pair wherever it appears.
- [ ] Status is shown once, as icon + word, and AA contrast passes everywhere.
- [ ] No guilt copy, fake urgency or confetti. Motion notes are ≤300 ms with reduced-motion fallbacks.
- [ ] All colours and type come from named swatches and styles that map 1:1 to code tokens.
