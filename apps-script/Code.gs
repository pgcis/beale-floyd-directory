/**
 * Floyd KC Program Directory - Google Apps Script Backend
 *
 * This script reads from the Floyd KC Program Directory Google Sheet
 * and serves the interactive directory widget as a web app.
 *
 * Sheet ID: 15x6yMBbSBWyrW8-L4PRWjFNfczlqXjwtOttG6dogcRg
 */

const SHEET_ID = '15x6yMBbSBWyrW8-L4PRWjFNfczlqXjwtOttG6dogcRg';

/**
 * Serve the web app HTML
 */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.data = JSON.stringify(getAllData());
  return template.evaluate()
    .setTitle('Floyd KC - Program Directory')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Read all 4 tabs from the Sheet and return structured data
 */
function getAllData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  return {
    workstreams: readTab(ss, 'Workstreams'),
    team: readTab(ss, 'Team'),
    assignments: readTab(ss, 'Assignments'),
    deliverables: readTab(ss, 'Deliverables')
  };
}

/**
 * Read a single tab and return array of objects with header keys
 */
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
      obj[header] = data[i][j] !== null && data[i][j] !== undefined ? String(data[i][j]) : '';
    });
    rows.push(obj);
  }

  return rows;
}
