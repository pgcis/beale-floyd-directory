/**
 * Floyd KC Program Dashboard - Unified Apps Script Backend
 *
 * Routes to different pages based on ?page= parameter.
 * All data comes from one Google Sheet. Branding comes from Settings tab.
 *
 * To deploy for a new client: change SHEET_ID to point to their Sheet.
 */

const SHEET_ID = '15x6yMBbSBWyrW8-L4PRWjFNfczlqXjwtOttG6dogcRg';

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'directory';

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const settings = readSettings(ss);

  let template;
  let title;

  if (page === 'schedule') {
    template = HtmlService.createTemplateFromFile('Schedule');
    template.pageData = JSON.stringify({
      pgcisSchedule: readTab(ss, 'PGCIS Schedule'),
      constructionSchedule: readTab(ss, 'Construction Schedule')
    });
    title = 'Program Schedule';
  } else {
    template = HtmlService.createTemplateFromFile('Directory');
    template.pageData = JSON.stringify({
      workstreams: readTab(ss, 'Workstreams'),
      team: readTab(ss, 'Team'),
      assignments: readTab(ss, 'Assignments'),
      deliverables: readTab(ss, 'Deliverables')
    });
    title = 'Program Directory';
  }

  template.settings = JSON.stringify(settings);
  template.currentPage = page;

  return template.evaluate()
    .setTitle(settings.program_name + ' - ' + title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function readSettings(ss) {
  const sheet = ss.getSheetByName('Settings');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) settings[data[i][0]] = data[i][1] !== null && data[i][1] !== undefined ? String(data[i][1]) : '';
  }
  return settings;
}

function readTab(ss, tabName) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((header, j) => {
      const val = data[i][j];
      if (val instanceof Date) {
        obj[header] = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        obj[header] = val !== null && val !== undefined ? String(val) : '';
      }
    });
    rows.push(obj);
  }
  return rows;
}
