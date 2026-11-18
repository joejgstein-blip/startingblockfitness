# Starting Block Fitness

Production website for [startingblockfitness.com](https://startingblockfitness.com).

Static site — no build step, no framework. Deployed on Vercel from this repo.

## Files

- `index.html` — homepage: services, how testing works, who it's for, about, FAQ, contact
- `styles.css` — all styling, responsive
- `script.js` — mobile nav toggle only
- `admin.html` + `admin.css` + `admin.js` — admin-only force-plate report viewer (see below)

## Deploy

Vercel project linked to this GitHub repo. Pushes to `main` auto-deploy to production.

Custom domain: `startingblockfitness.com` (added in Vercel → Project → Settings → Domains, with DNS pointed to Vercel).

## Admin report viewer (`/admin.html`)

Client-side only: an admin uploads a Vald ForceDecks CSV, then sees a
formatted table in the browser with filters for testing-date window,
exercise, and athletes (multi-select). Export to PDF is via the print
stylesheet + `window.print()` — choose “Save as PDF” in the print dialog.
No spreadsheet is generated and no file leaves the browser.

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
  averaging (currently averaged), roster/DNT handling (tested athletes
  only for now), and group filtering (the export has no group column).

## Content still to confirm

- Trainer name / bio photo
- Location / service area
- Contact email — currently `hello@startingblockfitness.com` (placeholder to confirm)
- Pricing / session lengths for testing and training
- Booking link, if a scheduler is added later
