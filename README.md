# Starting Block Fitness

Production website for [startingblockfitness.com](https://startingblockfitness.com).

Static site — no build step, no framework. Deployed on Vercel from this repo.

## Files

- `index.html` — homepage: services, how testing works, who it's for, about, FAQ, contact
- `styles.css` — all styling, responsive
- `script.js` — mobile nav toggle only
- `sbf_logo.webp` — the real Starting Block Fitness badge (circular, “STARTING BLOCK FITNESS / EST. 2022”, black SBF monogram with barbell, deep-red B). Used as the header logo, hero badge, footer logo, and favicon on both pages. Do not replace it with a redrawn or AI-generated mark.
- `admin.html` + `admin.css` + `admin.js` — admin-only force-plate report viewer (see below)

## Brand / palette

Colours are sampled from `sbf_logo.webp` — nothing else:

- Black `#000000` — headings, hero and CTA backgrounds, team-average chart lines
- White `#FFFFFF` — page background, text on black
- Deep red `#700310` — accent only: primary buttons, eyebrows, rules, links, focus states. Hover shade `#57020c`. Never a large red field.
- Warm neutrals — body text `#1c1c1c`, secondary text `#5c5c5c`, hairlines `#e5e5e5`, alt-section background `#f6f5f3`
- Radius `8px`; flat cards with thin borders, no heavy shadows, no gradients

Design notes (to keep the site from reading as AI-generated): the palette
and logo come from the real brand, not defaults; copy sticks to specifics
already on the site (Est. 2022, NFL / college / elite high schools,
48-hour reports) with no superlatives like “unlock your potential”;
sections are not all the same weight — the hero and final CTA are black,
services are plain cards, and the trust row is a plain divided list, not
pill badges; chart team colours stay distinguishable (red, blue, amber,
grey, green, brown, slate, orange) and are data colours, not brand colours.

## Deploy

Vercel project linked to this GitHub repo. Pushes to `main` auto-deploy to production.

Custom domain: `startingblockfitness.com` (added in Vercel → Project → Settings → Domains, with DNS pointed to Vercel).

## Admin report viewer (`/admin.html`)

Client-side only: an admin uploads a Vald ForceDecks CSV, then sees a
formatted table in the browser with filters for testing-date window,
exercise, and athletes (multi-select). Export to PDF is via the print
stylesheet + `window.print()` — choose “Save as PDF” in the print dialog.
No spreadsheet is generated and no file leaves the browser.

- **Athlete roster (optional but recommended):** upload the Vald athlete
  roster CSV in the “Athlete roster” section. It adds Org (Category 1)
  and Team (Group 1) filters — team options narrow to the selected org —
  and roster athletes with no tests in the selected window show as DNT
  (toggle “Show athletes with no tests (DNT)”, on by default once a
  roster is loaded). **Refresh roster** re-opens the file picker to
  upload a newer export; it replaces the roster in the browser session
  and repopulates all filters. The roster is in-memory only: it is never
  sent to a server, never saved on the site, and must be re-uploaded each
  time the page is opened.
- **Privacy:** only given-name, family-name, Category 1 and Group 1 are
  read from the roster. Date of birth, email, vald-id, weight/height and
  all other roster columns are never read or stored, and the roster CSV
  must never be committed to the repo. The sample data uses de-identified
  Demo A–E athletes only.
- **Team averages:** the header Team Avg always reflects the currently
  filtered set (dates + exercise + org/team + selected athletes) and says
  so in its label. “Show team average row” (on by default) adds a Team
  Avg row at the bottom of the table — mean per date column plus the
  overall personal-average mean. “Show one average row per team” adds a
  separate average row per roster team in the filtered org (one row when
  a single team is selected). Averages count only athletes with a value
  on that date; DNT is never counted as zero. Average rows are included
  in the PDF/print output.
- **Analytics view:** a Table | Analytics toggle above the report. Both
  views use the same uploaded test CSV + roster + current filters.
  Analytics has four inline-SVG charts (no chart library, no CDN):
  (1) trend over time — team average per test date, with up to 5
  selected athletes overlaid; (2) athlete vs team — each athlete’s
  personal average against the team average, with the difference shown;
  (3) distribution / ranking — athletes ranked by personal average with
  the team average marked as a dashed reference line; (4) suggested
  scatterplots — one point per athlete (personal average for each
  metric over the selected dates), coloured by team with a legend and
  dashed team-average reference lines on both axes. A “Suggested plot”
  dropdown offers Jump Height vs Relative Power, Explosiveness (RSI)
  vs Jump Height, Asymmetry vs Relative Power, Countermovement Depth
  vs Jump Height, and Relative Power vs Bodyweight; custom X and Y
  pickers allow any two available metrics (the four report exercises
  plus Countermovement Depth, Bodyweight, Eccentric Peak Velocity and
  Imp-Mom Jump Height). Athletes missing either metric are excluded —
  never plotted as zero. Every chart is labelled with the exercise,
  dates and what “team” means (filtered org/team). Export to PDF prints
  whichever view is active.

- **Set the passcode first:** edit `ADMIN_PASSCODE` in `admin.js`
  (currently the placeholder `SET-YOUR-PASSCODE-HERE`). Until it is set,
  the gate shows a setup warning and will not unlock.
- **Security:** this is a client-side gate on a static site — obscured,
  not secured. Anyone who can read `admin.js` can read the passcode.
  Real per-admin auth needs a server (Vercel serverless + Google OAuth
  allowlist, per the investigation plan).
- **Exercises:** Relative Power, Explosiveness, Jump Height (in) and
  Asymmetry are available. Squat to Jump Transition and Peak Force are
  shown as unavailable — the ForceDecks export has no matching columns,
  so no values are invented.
- **Sample data:** the “Load sample September data” button uses 5
  de-identified demo athletes (values from the September export, names
  removed). The full athlete CSV is never bundled with the site.
- **Known open questions:** asymmetry sign convention (“L” read as
  negative), Jump Height Flight Time vs Imp-Mom, duplicate-trial
  averaging (currently averaged). Roster/DNT handling is now implemented
  via the roster upload; Category 2 / Group 2 are almost entirely blank
  in the 9/30 export and are not used, and the test export itself has no
  group column, so the roster is the only source of org/team.

## Content still to confirm

- Trainer name / bio photo
- Location / service area
- Contact email — currently `hello@startingblockfitness.com` (placeholder to confirm)
- Pricing / session lengths for testing and training
- Booking link, if a scheduler is added later
