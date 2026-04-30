# Beale Floyd Google Sites Theme Kit

Use this as the source configuration for the Google Sites custom theme. Google
Sites imports custom themes from another Google Site, not from a standalone theme
file, so create or update one source/template Site with these settings and import
that theme into future client Sites.

## Brand Assets

- Logo for dark header: `assets/beale-logo-dark-header.png`
- Editable logo source: `assets/beale-logo-dark-header.svg`
- Logo treatment: white Beale wordmark, Beale green windmill
- Beale green: `#BCF100`

## Theme

- Theme name: `PGCIS Client Portal - Beale`
- Navigation mode: `Top`
- Site width: `Wide`
- Header type: `Title only` or the smallest available header that keeps the portal compact
- Logo/navigation background: `Black` or the darkest available Sites option

## Colors

- Primary dark: `#1A2332`
- Secondary dark: `#2C3E50`
- Beale accent green: `#BCF100`
- PGCIS green: `#2E7D32`
- Page background: `#F5F5F5`
- Surface/card background: `#FFFFFF`
- Border: `#E8ECF0`
- Body text: `#333333`
- Muted text: `#667788`

## Typography

- Titles/headings: use the closest Google Sites system/sans option available.
- Body: use the closest Google Sites system/sans option available.
- Keep page titles short and operational, for example `Program Directory` and
  `Program Schedule`.

## Page Structure

- Home: embed Apps Script URL without a page parameter, or with `?page=directory`
- Program Schedule: embed Apps Script URL with `?page=schedule`
- Future pages: add Sites-level navigation pages first, then embed purpose-built
  Apps Script widgets or published document views.

## Security Pattern

- Google Sites owns portal access, header, logo, and navigation.
- Apps Script embeds render content only.
- Do not publish documents by crawling an entire Drive folder.
- Use an explicit registry for rendered documents with status values like:
  `Draft`, `Internal Review`, `Client Review`, `Published`, `Archived`.
- Only `Published` items with an approved audience should render in the client portal.
