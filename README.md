# Floyd KC Program Dashboard

Secure Apps Script dashboard for the Beale Infrastructure Floyd KC engagement.

The dashboard is deployed as a Google Apps Script web app and embedded into Google
Sites pages. GitHub Pages is intentionally disabled because this repository contains
client-facing portal code and contact rendering logic.

## Pages

- Program Directory: default route, or `?page=directory`
- Program Schedule: `?page=schedule`

When the Apps Script page is loaded directly, the widget-level header/navigation uses
the `?page=` routes above. When the widget is embedded inside Google Sites, the
Apps Script header and internal navigation are hidden so Google Sites owns the portal
header, logo, and page navigation.

## Active Apps Script Files

- `apps-script/AppCode.gs` - unified backend router; copy into Apps Script as `Code.gs`
- `apps-script/Directory.html` - directory page
- `apps-script/Schedule.html` - schedule page

The older `Code.gs`, `ScheduleCode.gs`, and `Index.html` files are retained only as
reference material. Do not deploy them with the unified web app.

## Data Source

All dashboard content is read from the configured Google Sheet. Branding, logos,
colors, and footer text are driven by the Sheet's `Settings` tab.

For a new client deployment, change only `SHEET_ID` in
`apps-script/AppCode.gs` and provide the expected tabs in the Sheet.

## Confidential

This widget renders team contact information. Access is controlled by the Apps Script
web app deployment and Google Sites sharing settings, not by static hosting.
