/**
 * Floyd KC Program Dashboard - Unified Apps Script Backend
 *
 * Routes to different pages based on ?page= parameter.
 * All data comes from one Google Sheet. Branding comes from Settings tab.
 *
 * To deploy for a new client: change SHEET_ID to point to their Sheet.
 */

const SHEET_ID = '15x6yMBbSBWyrW8-L4PRWjFNfczlqXjwtOttG6dogcRg';
const ISSUE_WEB_APP_BASE_URL = 'https://script.google.com/macros/s/AKfycbycspz-i5W2koGZBlI8eSQy3ay55kgtz3VEu74bERLIDLhJ4Zmw8PNMEPm0UlqybdJytA/exec';
const ISSUE_REGISTER_URL = ISSUE_WEB_APP_BASE_URL + '?page=issues';
const ISSUE_SUPPORT_EMAIL = 'beale.support@pgcis.com';
const SETUP_NOTIFICATIONS_KEY = '4C7E175A-8307-4C41-9288-37A5E0C20335';
const ISSUE_STATUS_VALUES = [
  'open',
  'in progress',
  'stalled',
  'complete',
  'cancelled'
];

function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'directory';

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const settings = readSettings(ss);

  if (page === 'setup-notifications') {
    const viewer = getViewerContext();
    const setupKey = String(e && e.parameter && e.parameter.key || '').trim();
    if (!viewer.isPgcis && setupKey !== SETUP_NOTIFICATIONS_KEY) {
      return HtmlService.createHtmlOutput('PGCIS account or setup key required to set up issue notifications.');
    }
    const result = setupIssueNotificationTrigger();
    return HtmlService.createHtmlOutput('Issue notification trigger setup complete: ' + JSON.stringify(result));
  }

  if (page === 'confirm-status') {
    const token = String(e && e.parameter && e.parameter.token || '').trim();
    try {
      const result = confirmIssueStatusUpdate(token);
      return HtmlService.createHtmlOutput(
        '<script>' +
        'try {' +
        'localStorage.setItem("floydIssueStatusAuthToken", ' + JSON.stringify(result.authToken || '') + ');' +
        'localStorage.setItem("floydIssueStatusAuthEmail", ' + JSON.stringify(result.authEmail || '') + ');' +
        '} catch (err) {}' +
        '</script>' +
        '<p>Issue status update complete.</p>' +
        '<p>' + escapeHtmlForOutput(result.issueId) + ' is now ' + escapeHtmlForOutput(result.status) + '.</p>' +
        '<p>This browser is now verified for future authorized status changes as ' + escapeHtmlForOutput(result.authEmail || '') + '.</p>' +
        '<p><a href="' + getIssueLink(result.issueId) + '">Open issue record</a></p>'
      );
    } catch (err) {
      return HtmlService.createHtmlOutput(
        '<p>Issue status update was not completed.</p>' +
        '<p>' + escapeHtmlForOutput(err && err.message ? err.message : 'Unknown error') + '</p>'
      );
    }
  }

  let template;
  let title;

  if (page === 'schedule') {
    template = HtmlService.createTemplateFromFile('Schedule');
    template.pageData = JSON.stringify({
      pgcisSchedule: readTab(ss, 'PGCIS Schedule'),
      constructionSchedule: readTab(ss, 'Construction Schedule')
    });
    title = 'Program Schedule';
  } else if (page === 'issues' || page === 'issue-register') {
    template = HtmlService.createTemplateFromFile('Issues');
    const viewer = getViewerContext();
    ensureIssueSourceColumns(ss);
    const rawIssues = filterIssuesForViewer(readTab(ss, 'Issues'), viewer);
    const risksAsIssues = mapRisksToIssuesShape(filterRisksForViewer(readTab(ss, 'Risks'), viewer));
    const issues = rawIssues.concat(risksAsIssues);
    template.pageData = JSON.stringify({
      issues: issues,
      sources: readTab(ss, 'Issue Sources'),
      comments: filterCommentsForIssues(readTab(ss, 'Issue Comments'), issues),
      subscriptions: filterSubscriptionsForIssues(readTab(ss, 'Issue Subscriptions'), issues),
      viewer: viewer
    });
    title = 'Issue Register';
  } else if (page === 'risks' || page === 'risk-register') {
    template = HtmlService.createTemplateFromFile('Risks');
    const viewer = getViewerContext();
    const risks = filterRisksForViewer(readTab(ss, 'Risks'), viewer);
    template.pageData = JSON.stringify({
      risks: risks,
      viewer: viewer
    });
    title = 'Risk Register';
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

function getViewerContext() {
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  return {
    email: email,
    isPgcis: email.endsWith('@pgcis.com')
  };
}

function escapeHtmlForOutput(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function filterIssuesForViewer(rows, viewer) {
  if (viewer.isPgcis) return rows;
  return rows.filter(row => {
    const visibility = String(row.Visibility || row['Client Visibility'] || '').toLowerCase().trim();
    return visibility === 'client_visible';
  });
}

function filterRisksForViewer(rows, viewer) {
  if (viewer.isPgcis) return rows;
  return rows.filter(row => {
    const visibility = String(row.Visibility || row['Client Visibility'] || '').toLowerCase().trim();
    return visibility === 'client_visible';
  });
}

function mapRisksToIssuesShape(risks) {
  return risks.map(r => {
    const id = String(r['Risk ID'] || '').trim();
    if (!id) return null;
    const exposure = String(r['Exposure Priority'] || '').toLowerCase();
    let priority = 'Advisory / Optimization';
    if (exposure.indexOf('very high') !== -1) priority = 'Critical Path';
    else if (exposure.indexOf('high') !== -1) priority = 'Required Resolution';
    else if (exposure.indexOf('medium') !== -1) priority = 'Required Resolution';
    const action = String(r['Action Status'] || '').toLowerCase().trim();
    let status = 'open';
    if (action === 'in progress') status = 'in progress';
    else if (action === 'complete' || action === 'closed') status = 'complete';
    else if (action === 'cancelled') status = 'cancelled';
    else if (action === 'stalled' || action === 'blocked') status = 'stalled';
    const cxFlag = String(r['Cx Impact Flag'] || '').toUpperCase() === 'YES' ? 'YES' : 'NO';
    const score = r['Risk Score (P x I)'] || '';
    const probRating = r['Probability Rating'] || '';
    const impactRating = r['Impact Rating'] || '';
    const name = String(r['Risk Name'] || '').trim();
    const desc = String(r['Description'] || '').trim();
    return {
      ID: id,
      Visibility: r.Visibility || 'pgcis_only',
      Status: status,
      Priority: priority,
      Type: 'Risk / Exposure',
      'Discipline / System': r['Risk Area (Category)'] || '',
      'Finding / Question': name + (desc ? ' — ' + desc : ''),
      'Decision Needed': '',
      'Recommended Action': r['Mitigation Steps'] || '',
      Owner: r['Risk Owner'] || '',
      IDR: r['Mitigation Owner'] || '',
      'Needed By': r['Mitigation Due Date'] || '',
      'Last Updated': r['Identified Date'] || '',
      'Source ID': 'SRC-RR-001',
      'Source Link': 'https://docs.google.com/spreadsheets/d/15x6yMBbSBWyrW8-L4PRWjFNfczlqXjwtOttG6dogcRg/edit#gid=782079852',
      'Source Reference': 'Risks tab row ' + id,
      'Evidence / Notes': 'Score: ' + score + ' (' + probRating + ' x ' + impactRating + '). Cx Impact: ' + cxFlag + '. Mirror of Risks tab row; edits must be made there.',
      'Closure Criteria': '',
      'Original Source Title': 'Risk Register (Beale Floyd KC)',
      'Original Source Link': '',
      'Original Source Reference': r['Building / Scope'] || '',
      'Original Source Type': 'Risk Register'
    };
  }).filter(Boolean);
}

function filterCommentsForIssues(comments, issues) {
  const visibleIssueIds = {};
  issues.forEach(issue => {
    const id = String(issue.ID || issue['Issue ID'] || '').trim();
    if (id) visibleIssueIds[id] = true;
  });
  return comments.filter(comment => {
    const id = String(comment['Issue ID'] || '').trim();
    return visibleIssueIds[id];
  });
}

function filterSubscriptionsForIssues(subscriptions, issues) {
  const visibleIssueIds = {};
  issues.forEach(issue => {
    const id = String(issue.ID || issue['Issue ID'] || '').trim();
    if (id) visibleIssueIds[id] = true;
  });
  return subscriptions.filter(subscription => {
    const id = String(subscription['Issue ID'] || '').trim();
    const status = String(subscription.Status || '').toLowerCase().trim();
    return visibleIssueIds[id] && status === 'active';
  });
}

function submitIssueComment(payload) {
  const viewer = getViewerContext();
  const issueId = String(payload && payload.issueId || '').trim();
  const comment = String(payload && payload.comment || '').trim();
  const referenceLink = String(payload && payload.referenceLink || '').trim();
  const referenceTitle = String(payload && payload.referenceTitle || '').trim();

  if (!issueId) throw new Error('Issue ID is required.');
  if (!comment && !referenceLink) throw new Error('Enter a comment or a reference link before submitting.');

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const allowedIssues = filterIssuesForViewer(readTab(ss, 'Issues'), viewer);
  const issueAllowed = allowedIssues.some(row => String(row.ID || row['Issue ID'] || '').trim() === issueId);
  if (!issueAllowed) throw new Error('You do not have access to submit a comment for this issue.');

  const sheet = ensureIssueCommentsSheet(ss);
  const submittedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    submittedAt,
    issueId,
    viewer.email || 'unknown',
    viewer.isPgcis ? 'pgcis' : 'external',
    comment,
    referenceLink,
    referenceTitle,
    'new',
    ''
  ]);

  notifyIssueSubscribers(ss, issueId, {
    eventType: 'New comment or reference',
    eventSummary: comment || 'A reference link was submitted.',
    actorEmail: viewer.email || 'unknown',
    timestamp: submittedAt,
    referenceLink: referenceLink,
    referenceTitle: referenceTitle
  });

  return {
    ok: true,
    submittedAt: submittedAt,
    issueId: issueId
  };
}

function submitIssueSubscription(payload) {
  const viewer = getViewerContext();
  const issueId = String(payload && payload.issueId || '').trim();
  const subscriberEmail = String(payload && payload.email || viewer.email || '').toLowerCase().trim();
  const subscriberName = String(payload && payload.name || '').trim();

  if (!issueId) throw new Error('Issue ID is required.');
  if (!subscriberEmail || !subscriberEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    throw new Error('Enter a valid email address for notifications.');
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const allowedIssues = filterIssuesForViewer(readTab(ss, 'Issues'), viewer);
  const issueAllowed = allowedIssues.some(row => String(row.ID || row['Issue ID'] || '').trim() === issueId);
  if (!issueAllowed) throw new Error('You do not have access to subscribe to this issue.');

  const sheet = ensureIssueSubscriptionsSheet(ss);
  const submittedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const existing = findSubscriptionRow(sheet, issueId, subscriberEmail);
  if (existing > 1) {
    sheet.getRange(existing, 1, 1, 10).setValues([[
      submittedAt,
      issueId,
      subscriberEmail,
      subscriberName,
      viewer.isPgcis ? 'pgcis' : 'external',
      'active',
      '',
      sheet.getRange(existing, 8).getValue() || Utilities.getUuid(),
      'portal',
      ''
    ]]);
  } else {
    sheet.appendRow([
      submittedAt,
      issueId,
      subscriberEmail,
      subscriberName,
      viewer.isPgcis ? 'pgcis' : 'external',
      'active',
      '',
      Utilities.getUuid(),
      'portal',
      ''
    ]);
  }

  return {
    ok: true,
    issueId: issueId,
    email: subscriberEmail
  };
}

function submitIssueStatusUpdate(payload) {
  const viewer = getViewerContext();
  const issueId = String(payload && payload.issueId || '').trim();
  const newStatus = normalizeIssueStatus(payload && payload.status);
  const note = String(payload && payload.note || '').trim();
  const requestedEmail = String(payload && payload.email || '').toLowerCase().trim();
  const authToken = String(payload && payload.authToken || '').trim();

  if (!issueId) throw new Error('Issue ID is required.');
  if (!newStatus) throw new Error('Select a valid status.');

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const record = findIssueRecordById(ss, issueId);
  if (!record) throw new Error('Issue was not found.');

  const authorization = authorizeIssueStatusEditor(viewer.email, record.issue);
  if (!authorization.ok) {
    const tokenAuthorization = authorizeIssueStatusToken(ss, authToken, requestedEmail, record.issue);
    if (tokenAuthorization.ok) {
      return applyIssueStatusChange(ss, record, {
        changedBy: tokenAuthorization.email,
        newStatus: newStatus,
        note: note,
        viewerType: 'verified_session',
        authorizedAs: tokenAuthorization.role
      });
    }

    if (!requestedEmail || !requestedEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error('Enter your IDR or authorized PGCIS support email so the status change can be verified.');
    }

    const requestedAuthorization = authorizeIssueStatusEditor(requestedEmail, record.issue);
    if (!requestedAuthorization.ok) throw new Error(requestedAuthorization.reason);
    const request = createIssueStatusVerificationRequest(ss, record, {
      requestedEmail: requestedEmail,
      newStatus: newStatus,
      note: note,
      authorizedAs: requestedAuthorization.role
    });
    sendIssueStatusVerificationEmail(record.issue, request);
    return {
      ok: true,
      pendingVerification: true,
      issueId: issueId,
      email: requestedEmail
    };
  }

  return applyIssueStatusChange(ss, record, {
    changedBy: viewer.email,
    newStatus: newStatus,
    note: note,
    viewerType: viewer.isPgcis ? 'pgcis' : 'external',
    authorizedAs: authorization.role
  });
}

function applyIssueStatusChange(ss, record, change) {
  const issueId = String(record.issue.ID || record.issue['Issue ID'] || '').trim();

  const statusColumn = getHeaderIndex(record.headers, ['Status', 'Portal Status']);
  if (statusColumn < 0) throw new Error('The Issues tab does not include a Status column.');

  const previousStatus = String(record.row[statusColumn] || '').trim();
  const changedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  record.sheet.getRange(record.rowNumber, statusColumn + 1).setValue(change.newStatus);
  stampIssueLastUpdated(record.sheet, record.headers, record.rowNumber);

  appendIssueStatusHistory(ss, {
    changedAt: changedAt,
    issueId: issueId,
    changedBy: change.changedBy || 'unknown',
    previousStatus: previousStatus,
    newStatus: change.newStatus,
    note: change.note || '',
    viewerType: change.viewerType || '',
    authorizedAs: change.authorizedAs || ''
  });

  notifyIssueSubscribers(ss, issueId, {
    eventType: 'Status changed',
    eventSummary: buildStatusChangeSummary(previousStatus, change.newStatus, change.note || ''),
    actorEmail: change.changedBy || 'unknown',
    timestamp: changedAt,
    referenceLink: '',
    referenceTitle: ''
  });

  return {
    ok: true,
    issueId: issueId,
    status: change.newStatus,
    changedAt: changedAt
  };
}

function findSubscriptionRow(sheet, issueId, email) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]).trim() === issueId && String(values[i][2]).toLowerCase().trim() === email) {
      return i + 1;
    }
  }
  return -1;
}

function ensureIssueCommentsSheet(ss) {
  const headers = [
    'Submitted At',
    'Issue ID',
    'Submitted By',
    'Viewer Type',
    'Comment',
    'Reference Link',
    'Reference Title',
    'Review Status',
    'PGCIS Response'
  ];
  let sheet = ss.getSheetByName('Issue Comments');
  if (!sheet) {
    sheet = ss.insertSheet('Issue Comments');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureIssueSubscriptionsSheet(ss) {
  const headers = [
    'Subscribed At',
    'Issue ID',
    'Subscriber Email',
    'Subscriber Name',
    'Viewer Type',
    'Status',
    'Last Notified At',
    'Unsubscribe Token',
    'Source',
    'Notes'
  ];
  let sheet = ss.getSheetByName('Issue Subscriptions');
  if (!sheet) {
    sheet = ss.insertSheet('Issue Subscriptions');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureIssueStatusHistorySheet(ss) {
  const headers = [
    'Changed At',
    'Issue ID',
    'Changed By',
    'Previous Status',
    'New Status',
    'Note',
    'Viewer Type',
    'Authorized As'
  ];
  let sheet = ss.getSheetByName('Issue Status History');
  if (!sheet) {
    sheet = ss.insertSheet('Issue Status History');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureIssueStatusRequestsSheet(ss) {
  const headers = [
    'Requested At',
    'Token',
    'Issue ID',
    'Requested By',
    'New Status',
    'Note',
    'Previous Status At Request',
    'Viewer Type',
    'Authorized As',
    'Request Status',
    'Confirmed At',
    'Error'
  ];
  let sheet = ss.getSheetByName('Issue Status Requests');
  if (!sheet) {
    sheet = ss.insertSheet('Issue Status Requests');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureIssueStatusAuthSheet(ss) {
  const headers = [
    'Created At',
    'Token',
    'Email',
    'Authorized As',
    'Status',
    'Last Used At',
    'Expires At'
  ];
  let sheet = ss.getSheetByName('Issue Status Auth');
  if (!sheet) {
    sheet = ss.insertSheet('Issue Status Auth');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureIssueSourceColumns(ss) {
  const sheet = ss.getSheetByName('Issues');
  if (!sheet) return;
  const requiredHeaders = [
    'Original Source Title',
    'Original Source Link',
    'Original Source Reference',
    'Original Source Type'
  ];
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return;
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(header => String(header || '').trim());
  const missing = requiredHeaders.filter(header => headers.indexOf(header) < 0);
  if (missing.length === 0) return;
  sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
}

function appendIssueStatusHistory(ss, change) {
  const sheet = ensureIssueStatusHistorySheet(ss);
  sheet.appendRow([
    change.changedAt,
    change.issueId,
    change.changedBy,
    change.previousStatus,
    change.newStatus,
    change.note,
    change.viewerType,
    change.authorizedAs
  ]);
}

function createIssueStatusAuthSession(ss, email, authorizedAs) {
  const sheet = ensureIssueStatusAuthSheet(ss);
  const now = new Date();
  const createdAt = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiresAt = Utilities.formatDate(expires, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const token = Utilities.getUuid();
  sheet.appendRow([
    createdAt,
    token,
    String(email || '').toLowerCase().trim(),
    authorizedAs || '',
    'active',
    '',
    expiresAt
  ]);
  return {
    token: token,
    email: String(email || '').toLowerCase().trim(),
    expiresAt: expiresAt
  };
}

function authorizeIssueStatusToken(ss, token, requestedEmail, issue) {
  if (!token) return { ok: false, reason: 'No status authorization token was provided.' };

  const sheet = ensureIssueStatusAuthSheet(ss);
  const values = sheet.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < values.length; i++) {
    const rowToken = String(values[i][1] || '').trim();
    if (rowToken !== token) continue;

    const email = String(values[i][2] || '').toLowerCase().trim();
    const status = String(values[i][4] || '').toLowerCase().trim();
    const expiresAt = values[i][6] instanceof Date ? values[i][6] : new Date(String(values[i][6] || ''));

    if (status !== 'active') return { ok: false, reason: 'Status authorization token is not active.' };
    if (requestedEmail && requestedEmail !== email) return { ok: false, reason: 'Status authorization token does not match the entered email.' };
    if (expiresAt.toString() === 'Invalid Date' || expiresAt < now) return { ok: false, reason: 'Status authorization token has expired.' };

    const authorization = authorizeIssueStatusEditor(email, issue);
    if (!authorization.ok) return authorization;

    sheet.getRange(i + 1, 6).setValue(Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'));
    return {
      ok: true,
      email: email,
      role: 'verified_' + authorization.role
    };
  }

  return { ok: false, reason: 'Status authorization token was not found.' };
}

function createIssueStatusVerificationRequest(ss, record, request) {
  const sheet = ensureIssueStatusRequestsSheet(ss);
  const statusColumn = getHeaderIndex(record.headers, ['Status', 'Portal Status']);
  const requestedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const token = Utilities.getUuid();
  const issueId = String(record.issue.ID || record.issue['Issue ID'] || '').trim();
  const previousStatus = statusColumn >= 0 ? String(record.row[statusColumn] || '').trim() : '';

  sheet.appendRow([
    requestedAt,
    token,
    issueId,
    request.requestedEmail,
    request.newStatus,
    request.note || '',
    previousStatus,
    request.requestedEmail.endsWith('@pgcis.com') ? 'pgcis_email_verification' : 'external_email_verification',
    request.authorizedAs,
    'pending',
    '',
    ''
  ]);

  return {
    requestedAt: requestedAt,
    token: token,
    issueId: issueId,
    requestedEmail: request.requestedEmail,
    newStatus: request.newStatus,
    note: request.note || '',
    previousStatus: previousStatus,
    authorizedAs: request.authorizedAs
  };
}

function sendIssueStatusVerificationEmail(issue, request) {
  const title = issue ? String(issue['Finding / Question'] || issue.Title || request.issueId) : request.issueId;
  const link = ISSUE_WEB_APP_BASE_URL + '?page=confirm-status&token=' + encodeURIComponent(request.token);
  MailApp.sendEmail({
    to: request.requestedEmail,
    subject: '[Floyd Issue Register] Confirm status change for ' + request.issueId,
    body: [
      'A status change was requested for issue ' + request.issueId + '.',
      '',
      title,
      '',
      'Requested status: ' + request.newStatus,
      'Requested by / confirm as: ' + request.requestedEmail,
      'Requested at: ' + request.requestedAt,
      request.note ? 'Note: ' + request.note : '',
      '',
      'Confirm this status change:',
      link,
      '',
      'If you did not request this change, ignore this email. The issue will not be updated unless this confirmation link is opened.'
    ].filter(line => line !== '').join('\n')
  });
}

function confirmIssueStatusUpdate(token) {
  if (!token) throw new Error('Missing status confirmation token.');

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ensureIssueStatusRequestsSheet(ss);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowToken = String(data[i][1] || '').trim();
    const requestStatus = String(data[i][9] || '').toLowerCase().trim();
    if (rowToken !== token) continue;
    if (requestStatus !== 'pending') {
      throw new Error('This status confirmation link has already been used or closed.');
    }

    const issueId = String(data[i][2] || '').trim();
    const requestedBy = String(data[i][3] || '').toLowerCase().trim();
    const newStatus = normalizeIssueStatus(data[i][4]);
    const note = String(data[i][5] || '').trim();
    const authorizedAs = String(data[i][8] || '').trim();
    const confirmedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    try {
      if (!newStatus) throw new Error('Requested status is no longer valid.');
      const record = findIssueRecordById(ss, issueId);
      if (!record) throw new Error('Issue was not found.');
      const authorization = authorizeIssueStatusEditor(requestedBy, record.issue);
      if (!authorization.ok) throw new Error(authorization.reason);
      const result = applyIssueStatusChange(ss, record, {
        changedBy: requestedBy,
        newStatus: newStatus,
        note: note,
        viewerType: requestedBy.endsWith('@pgcis.com') ? 'pgcis_email_verification' : 'external_email_verification',
        authorizedAs: authorizedAs || authorization.role
      });
      const session = createIssueStatusAuthSession(ss, requestedBy, authorizedAs || authorization.role);
      sheet.getRange(i + 1, 10, 1, 3).setValues([['confirmed', confirmedAt, '']]);
      result.authToken = session.token;
      result.authEmail = session.email;
      return result;
    } catch (err) {
      sheet.getRange(i + 1, 10, 1, 3).setValues([['rejected', confirmedAt, err && err.message ? err.message : 'Unknown error']]);
      throw err;
    }
  }

  throw new Error('Status confirmation token was not found.');
}

function notifyIssueSubscribers(ss, issueId, event) {
  const sheet = ensureIssueSubscriptionsSheet(ss);
  const values = sheet.getDataRange().getValues();
  const now = event.timestamp || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const issue = findIssueById(ss, issueId);
  const issueTitle = issue ? String(issue['Finding / Question'] || issue.Title || issueId) : issueId;
  const issueLink = getIssueLink(issueId);
  const idr = getIssueIdrNotification(issue);
  const recipients = {};
  let sent = 0;

  if (idr.email) {
    recipients[idr.email] = {
      type: 'idr',
      missingIdr: false
    };
  } else {
    recipients[ISSUE_SUPPORT_EMAIL] = {
      type: 'support',
      missingIdr: true,
      missingIdrReason: idr.reason
    };
  }

  if (values.length >= 2) {
    for (let i = 1; i < values.length; i++) {
      const rowIssueId = String(values[i][1] || '').trim();
      const email = String(values[i][2] || '').toLowerCase().trim();
      const status = String(values[i][5] || '').toLowerCase().trim();
      if (rowIssueId !== issueId || status !== 'active' || !email) continue;
      if (!recipients[email]) recipients[email] = { type: 'subscriber', missingIdr: false };
    }
  }

  Object.keys(recipients).forEach(email => {
    const recipient = recipients[email];
    const referenceText = event.referenceLink
      ? '\nReference: ' + (event.referenceTitle || event.referenceLink) + '\n' + event.referenceLink
      : '';
    const missingIdrText = recipient.missingIdr
      ? 'IDR ALERT: This issue does not have exactly one valid IDR email assigned. Reason: ' + recipient.missingIdrReason + '\n\n'
      : '';
    const body = [
      missingIdrText + 'An update occurred for issue ' + issueId + ':',
      '',
      issueTitle,
      '',
      'Update type: ' + event.eventType,
      'Author: ' + (event.actorEmail || 'unknown'),
      'Time: ' + now,
      '',
      event.eventSummary || '',
      referenceText,
      '',
      'Open this issue:',
      issueLink,
      '',
      recipient.type === 'subscriber'
        ? 'To stop subscription notifications, ask PGCIS to mark your Issue Subscriptions row inactive.'
        : 'This message was sent based on the current IDR/support notification rules.'
    ].join('\n');

    MailApp.sendEmail({
      to: email,
      subject: recipient.missingIdr
        ? '[Floyd Issue Register] ' + issueId + ' updated - IDR needed'
        : '[Floyd Issue Register] ' + issueId + ' updated',
      body: body
    });
    sent++;
  });

  updateSubscriberNotificationTimestamps(sheet, values, issueId, recipients, now);

  return sent;
}

function updateSubscriberNotificationTimestamps(sheet, values, issueId, recipients, now) {
  if (values.length < 2) return;
  for (let i = 1; i < values.length; i++) {
    const rowIssueId = String(values[i][1] || '').trim();
    const email = String(values[i][2] || '').toLowerCase().trim();
    const status = String(values[i][5] || '').toLowerCase().trim();
    if (rowIssueId === issueId && status === 'active' && recipients[email]) {
      sheet.getRange(i + 1, 7).setValue(now);
    }
  }
}

function getIssueIdrNotification(issue) {
  if (!issue) return { email: '', reason: 'Issue row not found.' };
  const raw = String(issue.IDR || issue['Individual Directly Responsible'] || '').trim();
  const emails = extractEmails(raw);
  if (emails.length === 1) return { email: emails[0], reason: '' };
  if (!raw || emails.length === 0) return { email: '', reason: 'No IDR email is assigned in the IDR column.' };
  return { email: '', reason: 'The IDR column must contain exactly one email address; found ' + emails.length + '.' };
}

function extractEmails(value) {
  const matches = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig);
  if (!matches) return [];
  const seen = {};
  return matches.map(email => email.toLowerCase()).filter(email => {
    if (seen[email]) return false;
    seen[email] = true;
    return true;
  });
}

function getIssueLink(issueId) {
  return ISSUE_REGISTER_URL + '&issue=' + encodeURIComponent(issueId);
}

function findIssueById(ss, issueId) {
  const rows = readTab(ss, 'Issues');
  return rows.find(row => String(row.ID || row['Issue ID'] || '').trim() === issueId) || null;
}

function findIssueRecordById(ss, issueId) {
  const sheet = ss.getSheetByName('Issues');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  const headers = data[0];
  const issueIdColumn = getHeaderIndex(headers, ['ID', 'Issue ID']);
  if (issueIdColumn < 0) return null;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][issueIdColumn] || '').trim() === issueId) {
      return {
        sheet: sheet,
        headers: headers,
        row: data[i],
        rowNumber: i + 1,
        issue: rowToObject(headers, data[i])
      };
    }
  }
  return null;
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index] !== null && row[index] !== undefined ? String(row[index]) : '';
  });
  return obj;
}

function getHeaderIndex(headers, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const index = headers.indexOf(candidates[i]);
    if (index >= 0) return index;
  }
  return -1;
}

function normalizeIssueStatus(value) {
  const normalized = String(value || '').toLowerCase().trim();
  return ISSUE_STATUS_VALUES.indexOf(normalized) >= 0 ? normalized : '';
}

function authorizeIssueStatusEditor(email, issue) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) {
    return {
      ok: false,
      reason: 'Could not verify your signed-in Google email. Status changes require the issue IDR or an authorized PGCIS support user.'
    };
  }

  const idr = getIssueIdrNotification(issue);
  if (idr.email && idr.email === normalized) {
    return {
      ok: true,
      role: 'idr'
    };
  }

  if (isAuthorizedIdrEditor(normalized)) {
    return {
      ok: true,
      role: 'pgcis_support'
    };
  }

  return {
    ok: false,
    reason: 'Status changes are limited to the assigned IDR or an authorized @pgcis.com member of beale.support@pgcis.com.'
  };
}

function buildStatusChangeSummary(previousStatus, newStatus, note) {
  const summary = 'Status changed from ' + (previousStatus || 'blank') + ' to ' + newStatus + '.';
  return note ? summary + '\n\nNote: ' + note : summary;
}

function stampIssueLastUpdated(sheet, headers, rowNumber) {
  const updatedColumn = getHeaderIndex(headers, ['Last Updated', 'Updated']);
  if (updatedColumn < 0) return;
  sheet.getRange(rowNumber, updatedColumn + 1)
    .setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
}

function handleIssueEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'Issues' || e.range.getRow() <= 1) return;

  const ss = e.source || SpreadsheetApp.openById(SHEET_ID);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!enforceIdrEditPolicy(e, sheet, headers)) return;
  if (!enforceStatusEditPolicy(e, sheet, headers)) return;

  const row = sheet.getRange(e.range.getRow(), 1, 1, sheet.getLastColumn()).getValues()[0];
  const issueIdIndex = headers.indexOf('ID');
  if (issueIdIndex < 0) return;

  const issueId = String(row[issueIdIndex] || '').trim();
  if (!issueId) return;

  const editedHeaders = headers.slice(e.range.getColumn() - 1, e.range.getColumn() - 1 + e.range.getNumColumns());
  const statusColumn = getHeaderIndex(headers, ['Status', 'Portal Status']) + 1;
  const statusEdited = statusColumn > 0 &&
    e.range.getColumn() <= statusColumn &&
    e.range.getColumn() + e.range.getNumColumns() - 1 >= statusColumn;
  if (statusEdited) {
    stampIssueLastUpdated(sheet, headers, e.range.getRow());
    appendIssueStatusHistory(ss, {
      changedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      issueId: issueId,
      changedBy: getEditorEmail(e) || 'sheet edit',
      previousStatus: e.oldValue !== undefined ? e.oldValue : '',
      newStatus: String(row[statusColumn - 1] || '').trim(),
      note: 'Changed directly in the Issues sheet.',
      viewerType: 'sheet',
      authorizedAs: 'sheet_edit'
    });
  }
  const eventSummary = statusEdited && e.range.getNumRows() === 1
    ? buildStatusChangeSummary(e.oldValue !== undefined ? e.oldValue : '', String(row[statusColumn - 1] || '').trim(), 'Changed directly in the Issues sheet.')
    : 'Updated field(s): ' + editedHeaders.filter(Boolean).join(', ');
  notifyIssueSubscribers(ss, issueId, {
    eventType: statusEdited ? 'Status changed' : 'Issue row updated',
    eventSummary: eventSummary,
    actorEmail: getEditorEmail(e) || getViewerContext().email || 'sheet edit',
    timestamp: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
    referenceLink: '',
    referenceTitle: ''
  });
}

function enforceIdrEditPolicy(e, sheet, headers) {
  const idrColumn = headers.indexOf('IDR') + 1;
  if (!idrColumn) return true;

  const editFirstColumn = e.range.getColumn();
  const editLastColumn = editFirstColumn + e.range.getNumColumns() - 1;
  const idrEdited = editFirstColumn <= idrColumn && editLastColumn >= idrColumn;
  if (!idrEdited) return true;

  const editorEmail = getEditorEmail(e);
  const authorized = isAuthorizedIdrEditor(editorEmail);
  const idrOffset = idrColumn - editFirstColumn;
  const editedValues = e.range.getValues();
  const invalidRows = [];

  for (let r = 0; r < editedValues.length; r++) {
    const value = String(editedValues[r][idrOffset] || '').trim();
    const emails = extractEmails(value);
    if (value && emails.length !== 1) invalidRows.push(e.range.getRow() + r);
  }

  if (!authorized || invalidRows.length > 0) {
    rejectIdrEdit(e, sheet, idrColumn, editorEmail, authorized, invalidRows);
    return false;
  }

  return true;
}

function enforceStatusEditPolicy(e, sheet, headers) {
  const statusColumn = getHeaderIndex(headers, ['Status', 'Portal Status']) + 1;
  if (!statusColumn) return true;

  const editFirstColumn = e.range.getColumn();
  const editLastColumn = editFirstColumn + e.range.getNumColumns() - 1;
  const statusEdited = editFirstColumn <= statusColumn && editLastColumn >= statusColumn;
  if (!statusEdited) return true;

  const editorEmail = getEditorEmail(e);
  const statusOffset = statusColumn - editFirstColumn;
  const editedValues = e.range.getValues();
  const invalidRows = [];
  const unauthorizedRows = [];

  for (let r = 0; r < editedValues.length; r++) {
    const rowNumber = e.range.getRow() + r;
    const status = normalizeIssueStatus(editedValues[r][statusOffset]);
    if (!status) invalidRows.push(rowNumber);

    const rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    const issue = rowToObject(headers, rowValues);
    const authorization = authorizeIssueStatusEditor(editorEmail, issue);
    if (!authorization.ok) unauthorizedRows.push(rowNumber);
  }

  if (invalidRows.length > 0 || unauthorizedRows.length > 0) {
    rejectStatusEdit(e, sheet, statusColumn, editorEmail, invalidRows, unauthorizedRows);
    return false;
  }

  return true;
}

function getEditorEmail(e) {
  try {
    if (e && e.user && e.user.getEmail) return String(e.user.getEmail() || '').toLowerCase();
  } catch (err) {}
  return (Session.getActiveUser().getEmail() || '').toLowerCase();
}

function isAuthorizedIdrEditor(email) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized.endsWith('@pgcis.com')) return false;
  try {
    const group = GroupsApp.getGroupByEmail(ISSUE_SUPPORT_EMAIL);
    try {
      const role = String(group.getRole(normalized) || '').toUpperCase();
      if (['OWNER', 'MANAGER', 'MEMBER'].indexOf(role) >= 0) return true;
    } catch (err) {}
    try {
      if (group.hasUser(normalized)) return true;
    } catch (err) {}
    try {
      return group.getUsers().some(user => String(user.getEmail() || '').toLowerCase() === normalized);
    } catch (err) {}
    return false;
  } catch (err) {
    return false;
  }
}

function rejectIdrEdit(e, sheet, idrColumn, editorEmail, authorized, invalidRows) {
  const rows = e.range.getNumRows();
  for (let r = 0; r < rows; r++) {
    const cell = sheet.getRange(e.range.getRow() + r, idrColumn);
    if (rows === 1 && e.range.getNumColumns() === 1 && e.oldValue !== undefined) {
      cell.setValue(e.oldValue);
    } else {
      cell.clearContent();
    }
    cell.setNote('IDR edits require one valid email address and must be made by an authorized PGCIS beale.support group member.');
  }

  MailApp.sendEmail({
    to: ISSUE_SUPPORT_EMAIL,
    subject: '[Floyd Issue Register] Rejected IDR edit',
    body: [
      'An IDR edit was rejected.',
      '',
      'Editor: ' + (editorEmail || 'unknown'),
      'Authorized: ' + (authorized ? 'yes' : 'no'),
      'Invalid rows: ' + (invalidRows.length ? invalidRows.join(', ') : 'none'),
      'Time: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      '',
      'Rule: Only an authorized @pgcis.com member of beale.support@pgcis.com may assign IDR, and each IDR cell may contain only one referenced email address.'
    ].join('\n')
  });
}

function rejectStatusEdit(e, sheet, statusColumn, editorEmail, invalidRows, unauthorizedRows) {
  const rows = e.range.getNumRows();
  for (let r = 0; r < rows; r++) {
    const cell = sheet.getRange(e.range.getRow() + r, statusColumn);
    if (rows === 1 && e.range.getNumColumns() === 1 && e.oldValue !== undefined) {
      cell.setValue(e.oldValue);
    } else {
      cell.clearContent();
    }
    cell.setNote('Status changes require a valid status and must be made by the assigned IDR or an authorized PGCIS beale.support group member.');
  }

  MailApp.sendEmail({
    to: ISSUE_SUPPORT_EMAIL,
    subject: '[Floyd Issue Register] Rejected status edit',
    body: [
      'A status edit was rejected.',
      '',
      'Editor: ' + (editorEmail || 'unknown'),
      'Invalid status rows: ' + (invalidRows.length ? invalidRows.join(', ') : 'none'),
      'Unauthorized rows: ' + (unauthorizedRows.length ? unauthorizedRows.join(', ') : 'none'),
      'Allowed statuses: ' + ISSUE_STATUS_VALUES.join(', '),
      'Time: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      '',
      'Rule: Status may be changed only by the assigned IDR or an authorized @pgcis.com member of beale.support@pgcis.com.'
    ].join('\n')
  });
}

function setupIssueNotificationTrigger() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ensureIssueSubscriptionsSheet(ss);
  ensureIssueStatusHistorySheet(ss);
  ensureIssueStatusRequestsSheet(ss);
  ensureIssueStatusAuthSheet(ss);
  ensureIssueSourceColumns(ss);
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'handleIssueEdit') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  ScriptApp.newTrigger('handleIssueEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  return {
    trigger: 'handleIssueEdit',
    removedExisting: removed,
    installed: true
  };
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

/**
 * Enumerate every protected range in the workbook and write a readable audit
 * to a "Protections Audit" tab. Manual utility - not exposed via a route.
 *
 * Run from the Apps Script editor: function dropdown -> auditProtections ->
 * Run. The Audit tab is cleared and rewritten on each run, so it always
 * reflects current state. Editor emails are the canonical record of who can
 * write to each protected sheet or range.
 *
 * Columns: Sheet | Type | Range | Description | Mode | Editors | Open cells
 * within sheet protection. "Mode" is `strict` (only listed editors can write)
 * or `warning only` (anyone can write but sees a warning). "Open cells within
 * sheet protection" lists the exception ranges inside a SHEET-level protection
 * that anyone can still edit.
 */
function auditProtections() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const auditSheetName = 'Protections Audit';
  let auditSheet = ss.getSheetByName(auditSheetName);
  if (auditSheet) {
    auditSheet.clear();
    auditSheet.clearFormats();
  } else {
    auditSheet = ss.insertSheet(auditSheetName);
  }

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss z');
  const headerRow = ['Sheet', 'Type', 'Range', 'Description', 'Mode', 'Editors', 'Open cells within sheet protection'];
  const rows = [];
  rows.push(['Workbook protections audit', '', '', '', '', '', '']);
  rows.push(['Generated', timestamp, '', '', '', '', '']);
  rows.push(['', '', '', '', '', '', '']);
  rows.push(headerRow);

  let count = 0;
  ss.getSheets().forEach(sheet => {
    if (sheet.getName() === auditSheetName) return;
    const sheetName = sheet.getName();

    const sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    sheetProtections.forEach(p => {
      const editorEmails = p.getEditors().map(u => u.getEmail()).filter(e => e);
      const editors = editorEmails.length > 0 ? editorEmails.join('; ') : '(none listed; check editor membership directly)';
      const description = p.getDescription() || '';
      const mode = p.isWarningOnly() ? 'warning only' : 'strict';
      const openRanges = p.getUnprotectedRanges().map(r => r.getA1Notation()).join('; ');
      rows.push([sheetName, 'SHEET', '(entire sheet)', description, mode, editors, openRanges || '(none; entire sheet locked)']);
      count++;
    });

    const rangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    rangeProtections.forEach(p => {
      const editorEmails = p.getEditors().map(u => u.getEmail()).filter(e => e);
      const editors = editorEmails.length > 0 ? editorEmails.join('; ') : '(none listed; check editor membership directly)';
      const description = p.getDescription() || '';
      const mode = p.isWarningOnly() ? 'warning only' : 'strict';
      const range = p.getRange() ? p.getRange().getA1Notation() : '';
      rows.push([sheetName, 'RANGE', range, description, mode, editors, '']);
      count++;
    });
  });

  if (count === 0) {
    rows.push(['(no protections found in any sheet)', '', '', '', '', '', '']);
  }

  auditSheet.getRange(1, 1, rows.length, headerRow.length).setValues(rows);
  auditSheet.getRange(1, 1).setFontWeight('bold');
  auditSheet.getRange(2, 1).setFontWeight('bold');
  auditSheet.getRange(4, 1, 1, headerRow.length).setFontWeight('bold').setBackground('#1a2332').setFontColor('#ffffff');
  auditSheet.autoResizeColumns(1, headerRow.length);

  Logger.log('Protections audit complete: ' + count + ' protections found. See "' + auditSheetName + '" tab.');
  return count;
}
