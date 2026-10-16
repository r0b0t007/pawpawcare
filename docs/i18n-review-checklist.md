# i18n review checklist (native speakers)

All French and Spanish text in PawPawCare was AI-drafted. Many files say "pending review by a native speaker" in their header. This checklist is for that review. There is **one reviewer per language**: one native French speaker from France for `fr`, and one native Spanish speaker from Spain for `es`.

Read [`i18n-glossary.md`](i18n-glossary.md) first. It fixes the wording for recurring terms, the typography rules and the list of known variants to replace. If you disagree with a glossary choice, say so in your report and do not silently use a different word. The glossary is changed first, and then every string is changed to match.

**Owner decisions (2026-10-15). These are not up for review:**

- French uses formal address everywhere: *vous*, never *tu*.
- Spanish uses formal address everywhere: *usted*, never *tú* or *vosotros*.
- Spanish is es-ES (Spain): Spain's vocabulary and Spain's date and number conventions.

---

## 1. What to review

| Area | File(s) | Where it shows up | Size |
|---|---|---|---|
| App UI | `frontend/src/i18n/fr.json` / `es.json` (source: `en.json`) | Every screen of the mobile app | about 1,390 strings |
| API messages, push, email | `backend/lang/fr.json` / `es.json` (keys are the English text) | Error toasts from the server, reminder and engagement pushes, password-reset and verification emails | 88 strings |
| Vet share page | `backend/lang/{fr,es}/share.php` | Public web page a vet opens from "Share with vet" | about 60 |
| Caretaker page | `backend/lang/{fr,es}/care.php` | Public web page from "Caretaker handoff" | about 15 |
| Records export | `backend/lang/{fr,es}/export.php` | PDF and CSV from Profile → Export health records | about 130 |
| Weight trend | `backend/lang/{fr,es}/weight.php` | Weight sentence on the share page | about 10 |
| Community groups | `backend/lang/{fr,es}/groups.php` | Names and descriptions of the seeded groups | 10 |
| Auth, passwords, pagination, validation | `backend/lang/{fr,es}/{auth,passwords,pagination,validation}.php` | Form errors returned by the API | about 300 (mostly validation; skim it) |

The English file is the source of meaning. For the frontend, compare `en.json` and the target file key by key. For the backend JSON, the key itself is the English text.

**Do not touch:**

- Keys. Only the value on the right of `:` or `=>` changes.
- Placeholders: `{{name}}`, `{{count}}`, `:name`, `:Name`, `:count`, and so on.
- `trans_choice` pipes: `{0} …|{1} …|[2,*] …`.
- Plural key suffixes: `_one`, `_many`, `_other`.
- Pet names, breeds typed by users, notes, posts, and medication or vaccine names entered by users. These are never translated.
- Product names: PawPawCare, PawPawCare Plus, Plus.
- The language names in the picker (English / Français / Español).

## 2. How to see the strings in context

Reading the files alone misses context such as truncation, tone and plurals. Look at every screen at least once in your language.

### The app
1. Start the backend locally with `cd backend && composer dev`. Start the app with `cd frontend && npm start` and open it on an Android emulator or a dev build. For Android, see `docs/android-e2e-testing.md`.
2. Sign up with a test account, or ask the owner for one.
3. Switch the language: **Profile → Language → App language → Français / Español**. The change applies immediately, without a restart (iOS restarts the app). "Device default" follows the phone's language, so you can also set the emulator's system language to fr-FR or es-ES. The app sends that language to the API (`Accept-Language`), so server error messages switch too.
4. Go through every tab: **Home, Pets, Health, Community, Profile**. Then go through the flows in [section 4](#4-screen-walk-through).

### Server-generated text
- **Vet share page.** Open a pet, then **Share with vet → Create & share**, and open the link in a browser. The page is in the language of the person who created the link. The **English / Français / Español** switch at the top of the page changes the display language (`hl` parameter).
- **Caretaker page.** Open a pet, then **Overview → Caretaker handoff → Create & share**.
- **Export.** Go to **Profile → Export health records**, then **PDF** and **CSV**. Open the CSV in a spreadsheet as well.
- **Emails.** Locally, `MAIL_MAILER=log` writes emails to `backend/storage/logs/laravel.log`. Trigger them with **Forgot password** (reset code) and **Profile → Pet sharing & invites → Confirm your email** (verification code).
- **Push text.** Add a vaccine due today and run `php artisan reminders:send`. The weekly recap and celebrations come from `php artisan engagement:send`. The same reminder text also appears in the app's **Notifications** inbox, which is easier to read than a push.

## 3. Checks for every string

Tick each item for every string you review. Most strings pass on a quick read, so concentrate on the ones that do not.

### Meaning
- [ ] The string says what the English says. Nothing is added, dropped or softened, especially in legal and billing text (`paywall.legal.*`, `subscription.*`, `account.delete*`, `export.php` promises).
- [ ] The string fits the screen it appears on. Check this in the app; do not guess from the key name.
- [ ] Short English words that have several meanings are translated for this context. Examples: *Done* (button "Terminé" / "Hecho" vs state "Fait" / "Hecho"), *Remove* vs *Delete*, *Report* (a post vs a lost pet), *Due*, *Log*.
- [ ] English idioms are rewritten, not translated literally. Examples: "The pack missed you", "All quiet on the health front", "Every wag and whisker", "say something nice".

### Tone
- [ ] French: *vous* and Spanish: *usted* everywhere, including imperatives ("Ajoutez", "Añada"), possessives ("votre", "su") and object pronouns ("vous", "le").
- [ ] The register is warm but not familiar, and the same across the app. Spanish has no Latin-American words: *celular*, *computadora*, *durazno*, *alimento balanceado*, *Listo* as a button, and so on.
- [ ] Spanish uses es-ES tenses: "No se **ha** podido…", not "No se pudo…".
- [ ] Gender. The pet agrees with *animal* (fr, masculine) or *mascota* (es, feminine). The user gets the generic masculine. Flag any sentence that would read badly for a female user and suggest a neutral rephrasing.

### Medical accuracy
- [ ] Veterinary terms are what a vet in France or Spain would write. Check vaccine, booster, deworming, flea and tick, heartworm, microchip, spay/neuter, dosage, prescription, lab results and imaging against the glossary.
- [ ] "Dosage" (amount and regimen) is fr *posologie*, not *dosage*. "Dose" is one administration.
- [ ] Vaccine statuses mean the right thing:
  - **due**: a date in the future;
  - **due soon**: within days;
  - **overdue**: the date has passed;
  - **completed / administered**: given.
- [ ] Health warnings stay advice, not diagnosis. Example: "Notable change — worth a vet check" must not become alarming or prescriptive.

### Glossary terms
- [ ] Every recurring term uses the glossary wording: Medical vault, Care team, Caretaker, co-owner, Plus, free plan, share link, gotcha day, streak, milestone, and the rest.
- [ ] No variant from the glossary's "Variants to replace" list is left in a string you have signed off.
- [ ] The same English string gets the same translation everywhere. Examples: "Try again", "Couldn't … Try again.", "Delete X?".

### Plurals
i18next selects `_one`, `_other` and (for fr and es) `_many`. Laravel selects pipe variants.

- [ ] Check every plural key with the counts **0, 1, 2 and 5**. In the app, create those situations: 0, 1 or 2 pets; 1 or 3 overdue vaccines; and so on.
- [ ] French uses the **singular for 0 and 1** ("0 animal", "1 animal", "2 animaux"). Spanish uses the singular for **1 only** ("0 mascotas").
- [ ] French ages below 2 stay singular: **"1,5 an"**, then "2 ans" (`share.php` `age_value`). Spanish: "1 año", "1,5 años".
- [ ] `_many` forms (fr and es) are only used for very large round numbers ("1 000 000 de jours" / "1.000.000 de días"). Phones running Hermes do not ship `Intl.PluralRules` and fall back to one/other, so you will rarely see `_many` in the app. Still read each one for correctness.
- [ ] Laravel `trans_choice` strings. Examples: `weight.php` `days`/`weeks`/`months`, `":pet turns :count today."` and the gotcha-day message in `backend/lang/*.json`. Every range reads correctly, including `{0}`.
- [ ] Agreement inside plurals. Examples: "{{count}} vaccin**s** enregistré**s**", "{{count}} nouvelle**s**", "{{count}} atrasada**s**".

### Placeholders
- [ ] Every placeholder in English is in the translation, spelled the same (`{{petName}}` is not `{{name}}`), and none has been added. `src/__tests__/i18n.guard.test.js` checks this for the frontend. For the backend, check by eye: `:pet`, `:count`, `:date`, `:attribute`, `:values`, and so on.
- [ ] The word order around placeholders works for every likely value: a long pet name, a vaccine name typed in English, a date such as "14 oct. 2026".
- [ ] Articles and prepositions before placeholders work with any name. Examples: French "de {{name}}" (elision: "de Oscar" or "d'Oscar"; keep "de"), Spanish "a {{name}}".

### Typography and formatting
- [ ] **French.** U+00A0 before `: ; ? ! %` and inside `« »`. Straight apostrophe `'`. Abbreviation "ex.". No English " — " separators in sentences; use a colon.
- [ ] **Spanish.** `¿…?` and `¡…!`. Guillemets `«…»` with no inner spaces. U+00A0 before `%`. Abbreviation "p. ej.". No " — " separators; use a colon.
- [ ] Sentence case for buttons, titles, tabs, pills and headers. Months and weekdays are lowercase.
- [ ] Dates, times and numbers follow the glossary's Dates and units table: 24-hour time, "14 oct. 2026" / "14 oct 2026", decimal comma in prose. **Do not change numeric examples in input placeholders** ("ex. 22.5"). The app cannot parse "22,5" yet, so report it as a code bug instead.

### Fit (truncation)
Check these in the app at the default font size, then again at the largest system font size.

- [ ] **Buttons**, especially side-by-side pairs in ConfirmDialog and Sheet (Cancel / Delete), and the Paywall buttons.
- [ ] **Pills and status chips**: Overdue / Due soon / Scheduled, document categories, "{{count}} overdue".
- [ ] **Tab labels**: Home, Pets, Health, Community, Profile. Also segmented controls such as Overview / Health / Notes and Feed / Lost pets / Groups.
- [ ] **Toasts** (one or two lines), the **Home status headline**, which has a deliberate line break (`\n`, kept in the translation), and the **UpNext card**.
- [ ] If a string truncates, first suggest a shorter wording that still matches the glossary. If nothing short enough works, report it as a layout bug.
- [ ] Accessibility labels (`…A11y` keys) are read aloud, not shown. Check that they sound natural; their length does not matter.

## 4. Screen walk-through

Tick each one off as you go:

- [ ] Welcome, Log in, Sign up, Forgot password (code, new password, errors), Reconnect screen (stop the backend to see it), Google / Apple sign-in errors.
- [ ] Home: greetings at three times of day, status headline (all good / due soon / overdue), Today list, UpNext card, celebrations (birthday, gotcha day), empty state with no pets.
- [ ] Add pet (all three steps and the success screen), Edit pet, Remove pet confirm.
- [ ] Pet profile: Overview, Health and Notes segments, every sheet (medication, weight, expense, food, activity, lost, care team, share with vet, caretaker notes), every ConfirmDialog.
- [ ] Health: list, filters, New record sheet, Vaccines (add, mark done, delete), Reminders, Notifications inbox (snooze, dismiss).
- [ ] Medical vault: documents, visits, clinics, upload, Read with AI review sheet, empty and error states.
- [ ] Community: feed, composer, comments, report flow, groups (join / leave), lost pets (report, mark found, card share text).
- [ ] Profile: account details, delete account, language, notifications, privacy, export (PDF and CSV), invites, support form, subscription, Paywall (all states, legal text).
- [ ] Admin only: moderation (ask the owner for an admin account, or run `php artisan user:make-admin <email>` locally).
- [ ] Server text: share page, caretaker page, export files, both emails, reminder push, weekly recap push.

## 5. Reporting and applying fixes

**Report.** Use one list per language, in a Linear issue under the PawPawCare project or a shared spreadsheet. Give each finding these fields:

| File | Key (or English text for `backend/lang/*.json`) | Current | Proposed | Reason (meaning / tone / medical / glossary / plural / placeholder / typography / truncation) | Severity (blocker / should / nit) |
|---|---|---|---|---|---|

- Use **blocker** for wrong meaning, wrong medical information, informal tone, a broken placeholder, or legal or billing text that is inaccurate.
- If a finding challenges the glossary itself, mark it **glossary** and propose the new term. The term is changed in `docs/i18n-glossary.md` first.
- Screenshots help for truncation and context problems. Do not edit the files yourself unless you have agreed that with the owner.

**Apply** (developer, one PR per language):

- Change values only. Keep the JSON valid and keep the PHP quoting intact. A PHP string that contains `\u{00A0}` must be **double-quoted**.
- Run the tests, then update every test that pins a string you changed:
  - Frontend: `cd frontend && npm test`. This runs `src/__tests__/i18n.guard.test.js` (same keys and plural forms as `en`, same `{{placeholders}}`, no hard-coded English) and the screen `*.i18n.test.js` files.
  - Backend: `cd backend && php artisan test`. This runs `tests/Feature/MessageLocaleTest.php`, `ExportRecordsLocaleTest.php`, `GroupLocaleTest.php` and `LocaleTest.php`, which pin exact email, push, export and group strings.
- Text changes in the app ship over the air with EAS Update and need no new store build. Backend text ships with the backend deploy.
- When a file is fully reviewed, update its header comment: replace "AI-drafted, pending review by a native speaker" with "Reviewed by <name>, <date>".

## 6. Sign-off

A row is signed off only when every item in sections 3 and 4 is ticked and every finding marked blocker or should has been applied and re-checked in the app.

| Language | Reviewer | Date | Scope (files / screens) | App build or commit reviewed | Open nits | Signed off |
|---|---|---|---|---|---|---|
| fr (France) | | | `frontend/src/i18n/fr.json` | | | ☐ |
| fr (France) | | | `backend/lang/fr.json` + `backend/lang/fr/*.php` | | | ☐ |
| es (es-ES) | | | `frontend/src/i18n/es.json` | | | ☐ |
| es (es-ES) | | | `backend/lang/es.json` + `backend/lang/es/*.php` | | | ☐ |
