# Google Sites Dashboard Reuse Pattern

Use this pattern for future secure client dashboards built from Google Sites,
Google Apps Script, Google Sheets, and Drive-hosted assets.

## Recommended Architecture

- Google Sites owns the portal shell: access control, page navigation, site header,
  page titles, and top-level branding.
- Apps Script renders embedded widgets only: directory, schedule, document index,
  status dashboards, and other project-specific views.
- Google Sheets stores structured dashboard content and branding settings.
- Drive stores approved client-facing source documents and assets.
- The Apps Script codebase should remain reusable across clients. For a normal new
  deployment, change the `SHEET_ID` and client data, not the core widget code.

## Header And Branding Pattern

- Do not duplicate the Google Sites header inside embedded Apps Script widgets.
- Hide Apps Script widget headers/navigation when the app is embedded in Google
  Sites, but keep them available when the Apps Script URL is opened directly.
- Use a common brand-only header image in Sites when a client/co-brand lockup is
  needed.
- Prefer a transparent common header image placed on top of a Google Sites dark
  section/header background. This lets Sites own the background color and avoids
  mismatched baked-in banner colors.
- Insert the header image as a normal Google Sites image. Do not use it as the
  native page header background, because Google Sites crops header backgrounds and
  can cut off edge logos.
- Keep program names and page titles as Google Sites text/page-header content so
  they remain editable per page and per client.
- If Google Sites still shows a top bar logo or stale text, remove or clear the
  native Sites brand image and site name in the Sites settings. That bar is
  separate from the Apps Script embed.

## Current Beale Reference Assets

- Transparent Sites header:
  `assets/google-sites-header-beale-floyd-transparent.png`
- Dark fallback Sites header:
  `assets/google-sites-header-beale-floyd.png`
- Beale dark-header logo:
  `assets/beale-logo-dark-header.png`
- Beale editable dark-header logo:
  `assets/beale-logo-dark-header.svg`

The Beale windmill green is `#BCF100`. Preserve it on dark backgrounds by making
the Beale wordmark white while leaving the green windmill unchanged.

## Document Rendering Pattern

Future document pages should render only approved, published content.

- Do not render documents by crawling an entire Drive folder.
- Use an explicit document registry, preferably in a Sheet tab or controlled data
  source.
- Recommended registry fields: `title`, `slug`, `source_file_id`, `status`,
  `audience`, `published_at`, `sort_order`, `client`, and `project`.
- Only render records where `status` is `Published` and `audience` is approved for
  the current portal.
- Keep draft and internal-review files outside the client-facing published folder
  whenever possible.
- If Apps Script runs as the deployer, remember that it may be able to read files
  the end user cannot directly access in Drive. The app must enforce the published
  allowlist itself.
- When rendering Markdown, disable or sanitize raw HTML and use controlled CSS so
  formatting is consistent and untrusted content cannot inject scripts.

## New Client Checklist

1. Copy or reuse the Apps Script project structure.
2. Create a client/project Google Sheet with the expected tabs and Settings keys.
3. Set only `SHEET_ID` in `apps-script/AppCode.gs` for the new deployment.
4. Build or generate client-specific transparent header/logo assets.
5. Configure Google Sites theme, access, page navigation, and page titles.
6. Embed Apps Script widgets into the relevant Google Sites pages.
7. Confirm embedded mode hides widget-level header/navigation.
8. Confirm direct Apps Script mode still works for troubleshooting.
9. Confirm the document registry exposes only published client-approved content.
