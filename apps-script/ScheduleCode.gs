/**
 * Floyd KC Program Schedule - Google Apps Script Backend
 */

const SCHEDULE_SHEET_ID = '15x6yMBbSBWyrW8-L4PRWjFNfczlqXjwtOttG6dogcRg';

function doGet() {
  const template = HtmlService.createTemplateFromFile('Schedule');
  template.data = JSON.stringify(getScheduleData());
  return template.evaluate()
    .setTitle('Floyd KC - Program Schedule')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getScheduleData() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  return {
    pgcisSchedule: readScheduleTab(ss, 'PGCIS Schedule'),
    constructionSchedule: readScheduleTab(ss, 'Construction Schedule')
  };
}

function readScheduleTab(ss, tabName) {
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
