/** Weekly finance reporting. Development previews read production data but cannot send to production recipients. */
const WEEKLY_REPORT_DEFAULT_CC_ = ['catherine.hayes@claremontschool.co.uk', 'ryan.bradford@claremontschool.co.uk', 'it@claremontschool.co.uk'];
const WEEKLY_REPORT_TEST_TO_ = 'it@claremontschool.co.uk';
const WEEKLY_REPORT_TZ_ = 'Europe/London';

function reportPropertyKey_(suffix) { return portalStateKey_('WEEKLY_FINANCE_' + suffix); }
function reportProperties_() { return PropertiesService.getScriptProperties(); }
function reportExecutionOwnerMatches_(ss) {
  const stored = reportStoredSettings_(ss);
  const owner = String((stored ? stored.owner : reportProperties_().getProperty('WEEKLY_FINANCE_OWNER')) || '').trim().toLowerCase();
  return !!owner && owner === String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
}
function reportAdmin_() {
  const user = getAuthorizedUserContext_();
  requireLiveConfigurationAdmin_(user);
  return user;
}
function reportCc_(value, to) {
  const addresses = (Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/))
    .map(v => String(v).trim().toLowerCase()).filter(Boolean);
  if (addresses.length > 30 || addresses.some(v => !isValidConfigurationEmail_(v))) {
    throw new Error('Enter valid CC email addresses (one per line; maximum 30).');
  }
  return [...new Set(addresses)].filter(v => v !== String(to || '').trim().toLowerCase());
}
function reportStoredSettings_(ss) {
  const sheet = ss.getSheetByName('Config');
  const rows = sheet ? sheet.getDataRange().getValues() : [];
  const record = rows.find(row => row[0] === 'Weekly Finance Settings');
  return record && record[1] ? JSON.parse(record[1]) : null;
}
function reportSettings_() {
  const p = reportProperties_();
  const stored = reportStoredSettings_(getPortalSpreadsheet_());
  const saved = stored ? stored.cc.join('\n') : p.getProperty(reportPropertyKey_('CC'));
  return {
    cc: saved === null ? WEEKLY_REPORT_DEFAULT_CC_.slice() : reportCc_(saved),
    enabled: !isDevelopmentRuntime_() && (stored ? stored.enabled : p.getProperty('WEEKLY_FINANCE_ENABLED') === 'true'),
    development: isDevelopmentRuntime_(),
    last: p.getProperty(reportPropertyKey_('LAST')) || 'No report has been sent.',
    schedule: 'Monday shortly after 07:00 (UK time)',
    to: String(getConfig_().financeEmail || '').trim()
  };
}
function getWeeklyFinanceSettings() { reportAdmin_(); return Object.assign(reportSettings_(), { configurationRevision: configurationRevision_(getPortalSpreadsheet_()) }); }

function saveWeeklyFinanceSettings(input) {
  return configurationWriteResponse_('saveWeeklyFinanceSettings', (ss, user) => {
    const cc = reportCc_(input && input.cc);
    const enabled = !!(input && input.enabled);
    if (enabled && isDevelopmentRuntime_()) throw new Error('Scheduling can only be enabled after the live release.');
    const p = reportProperties_();
    const old = reportSettings_();
    const stored = reportStoredSettings_(ss);
    const owner = String(Session.getEffectiveUser().getEmail()).toLowerCase();
    const existingOwner = stored ? stored.owner : p.getProperty('WEEKLY_FINANCE_OWNER');
    if (!isDevelopmentRuntime_() && enabled) {
      if (!isValidConfigurationEmail_(getConfig_(ss).financeEmail)) throw createConfigurationValidationError_('Set a valid Finance notification email first.');
      if (old.enabled && existingOwner && existingOwner !== owner) throw createConfigurationValidationError_('The schedule is managed by ' + existingOwner + '. They must disable it before another administrator enables it.');
    }
    const config = ss.getSheetByName('Config');
    const rows = config.getDataRange().getValues();
    const index = rows.findIndex(row => row[0] === 'Weekly Finance Settings');
    config.getRange(index < 0 ? config.getLastRow() + 1 : index + 1, 1, 1, 2)
      .setValues([['Weekly Finance Settings', JSON.stringify({ cc, enabled: !isDevelopmentRuntime_() && enabled, owner })]]);
    appendConfigurationAudit_(ss, user, 'Weekly report settings changed', 'Weekly finance report',
      'CC: ' + cc.join(', ') + '; scheduled: ' + enabled);
    return { message: 'Weekly finance report settings saved.' };
  }, input && input.expectedConfigurationRevision);
}

// Calendar-day arithmetic uses UTC ordinals after formatting in UK time, avoiding DST drift.
function reportDay_(value) {
  if (value instanceof Date && !isNaN(value)) return Utilities.formatDate(value, WEEKLY_REPORT_TZ_, 'yyyy-MM-dd');
  const raw = String(value || '').trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (m) return reportValidDay_(+m[1], +m[2], +m[3]);
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/);
  return m ? reportValidDay_(+m[3], +m[2], +m[1]) : '';
}
function reportValidDay_(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : '';
}
function reportShift_(day, offset) { return new Date(Date.parse(day + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10); }
function reportPeriod_(now) {
  const today = reportDay_(now);
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
  const monday = reportShift_(today, -((weekday + 6) % 7));
  const start = reportShift_(monday, -7), end = reportShift_(monday, -1);
  const label = d => Utilities.formatDate(new Date(d + 'T12:00:00Z'), WEEKLY_REPORT_TZ_, 'd MMMM yyyy');
  return { today, monday, start, end, label: label(start) + ' - ' + label(end),
    generated: Utilities.formatDate(now, WEEKLY_REPORT_TZ_, 'EEEE d MMMM yyyy, HH:mm'),
    weekKey: start };
}
function reportMoney_(v) { return (v < 0 ? '-' : '') + '\u00a3' + Math.abs(Number(v)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function reportNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}

function buildWeeklyFinanceData_(ss, now) {
  const period = reportPeriod_(now);
  const sheet = ss.getSheetByName('Orders');
  if (!sheet) throw new Error('Orders data is unavailable; no report was sent.');
  const columns = getOrdersMetadataColumnsForRead_(sheet);
  const rows = sheet.getDataRange().getValues().slice(1);
  const buckets = [
    { label: 'Since reporting week ended', count: 0, value: 0 },
    { label: 'Submitted during reporting week', count: 0, value: 0 },
    { label: 'Previous week', count: 0, value: 0 },
    { label: '2-4 weeks earlier', count: 0, value: 0 },
    { label: 'Older', count: 0, value: 0 },
    { label: 'Date unavailable', count: 0, value: 0 }
  ];
  const result = { period, pending: [], signoff: [], overdue: [], returns: [], adjustments: [], buckets, newOrders: 0, newValue: 0,
    ordered: 0, orderedValue: 0, invoices: 0, invoiceValue: 0, credits: 0, creditValue: 0,
    reversals: 0, reversalValue: 0, invalidValues: 0, invalidDates: 0, futureDates: 0 };
  rows.forEach(row => {
    if (!row[0] || isOrderCancelled_(row, columns)) return;
    const type = getOrderRecordType_(row, columns.recordTypeIndex);
    if (type !== 'Order' && type !== 'Invoice') return;
    const day = reportDay_(row[2]);
    // Match the dashboard/export reporting date; historical credits may be logged later.
    const reportingDay = reportDay_(isOrderCompleted_(row) ? row[13] || row[2] : row[2]);
    const raw = row[15] === '' || row[15] === null || row[15] === undefined ? row[10] : row[15];
    const amount = reportNumber_(raw);
    if (amount === null) result.invalidValues++;
    if (!day || !reportingDay) result.invalidDates++;
    if (day > period.today || reportingDay > period.today) result.futureDates++;
    const value = amount === null ? 0 : amount;
    const inWeek = day >= period.start && day <= period.end;
    const order = { id: String(row[0]), dept: String(row[1] || ''), supplier: String(row[4] || ''),
      type, day, reportingDay, value, amountValid: amount !== null, due: reportDay_(row[12]),
      age: day ? Math.floor((Date.parse(period.today) - Date.parse(day)) / 86400000) : null };
    const returnInfo = getOrderReturnInfo_(row, columns);
    if (!returnInfo.parentId && returnInfo.pending) {
      result.returns.push(Object.assign({}, order, { original: amount, refunded: returnInfo.refunded,
        remaining: amount === null ? null : returnInfo.remaining }));
    }
    const approval = getOrderApprovalStatus_(row, columns);
    if ([APPROVAL_AWAITING_, APPROVAL_QUERY_].includes(approval)) {
      result.signoff.push(Object.assign({}, order, { status: approval === APPROVAL_QUERY_ ? 'Query raised' : 'Awaiting sign-off' }));
    }
    if (type === 'Invoice') {
      if (reportingDay >= period.start && reportingDay <= period.end) {
        if (returnInfo.adjustmentKind === 'reversal') {
          result.reversals++; result.reversalValue += value;
        } else if (returnInfo.parentId || (amount !== null && amount < 0)) {
          result.credits++; result.creditValue += value;
        } else { result.invoices++; result.invoiceValue += value; }
        if (returnInfo.parentId || (amount !== null && amount < 0)) result.adjustments.push(Object.assign({}, order, {
          kind: returnInfo.adjustmentKind === 'reversal' ? 'Reversal' : returnInfo.parentId ? 'Refund' : 'Credit',
          parentId: returnInfo.parentId, creditId: returnInfo.creditId
        }));
      }
      return;
    }
    if (inWeek) { result.newOrders++; result.newValue += value; }
    const orderedDay = reportDay_(row[13]);
    if (orderedDay >= period.start && orderedDay <= period.end) { result.ordered++; result.orderedValue += value; }
    if (isOrderCompleted_(row)) return;
    result.pending.push(order);
    if (order.due && order.due < period.today) result.overdue.push(order);
    const index = !day ? 5 : day >= period.monday ? 0 : day >= period.start ? 1 : day >= reportShift_(period.start, -7) ? 2 : day >= reportShift_(period.start, -28) ? 3 : 4;
    buckets[index].count++; buckets[index].value += value;
  });
  result.pending.sort((a,b) => (a.day || '0000').localeCompare(b.day || '0000') || b.value-a.value);
  result.signoff.sort((a,b) => b.value-a.value);
  result.returns.sort((a,b) => (a.day || '').localeCompare(b.day || '') || a.id.localeCompare(b.id));
  result.adjustments.sort((a,b) => a.reportingDay.localeCompare(b.reportingDay) || a.id.localeCompare(b.id));
  result.returnRemaining = result.returns.reduce((sum,r) => sum + (r.remaining === null ? 0 : r.remaining), 0);
  result.returnMissingValues = result.returns.filter(r => r.remaining === null).length;
  const budgets = filterVisibleBudgets_(getBudgetSnapshot_(ss));
  result.budgets = Object.keys(budgets).sort().map(dept => Object.assign({ dept }, budgets[dept]));
  if (!ss.getSheetByName('Budgets')) throw new Error('Budget data is unavailable; no report was sent.');
  result.budgetErrors = result.budgets.filter(b => b.hasCalculationError).length;
  result.totals = result.budgets.filter(b => !b.hasCalculationError).reduce((a,b) => ({total:a.total+b.total, spent:a.spent+b.spent, remaining:a.remaining+b.remaining}), {total:0,spent:0,remaining:0});
  result.pendingValue = result.pending.reduce((n,r) => n+r.value,0);
  return result;
}

function reportTable_(headers, rows, numeric, widths) {
  const esc = escapeEmailHtml_;
  return '<table class="data">'+(widths?'<colgroup>'+widths.map(w=>'<col style="width:'+w+'%">').join('')+'</colgroup>':'')+'<thead><tr>' + headers.map((h,i) => '<th'+((numeric||[]).includes(i)?' class="num"':'')+'>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map(row => '<tr>' + row.map((v,i) => '<td' + ((numeric || []).includes(i) ? ' class="num"' : '') + '><div class="cell">' + esc(String(v)) + '</div></td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '">No items in this category.</td></tr>') + '</tbody></table>';
}

function buildWeeklyFinanceHtml_(d, test) {
  const esc=escapeEmailHtml_, money=reportMoney_;
  const sum=rows=>rows.reduce((n,r)=>n+r.value,0);
  const valid=d.budgets.filter(b=>!b.hasCalculationError);
  const noAllocation=valid.filter(b=>b.total<=0 && b.spent>0);
  const pressure=valid.filter(b=>b.remaining<0 || (b.total>0 && b.spent/b.total>=.9));
  const issues=d.invalidValues+d.invalidDates+d.budgetErrors+d.futureDates;
  const label=d.period.label.replace(/(\d+) ([A-Za-z]+) (\d{4}) - (\d+) \2 \3/,'$1-$4 $2 $3');
  const header=(title,kicker)=>'<header><div class="brand">CLAREMONT SCHOOL <span>FINANCE / WEEKLY BRIEFING</span></div><h1>'+title+'</h1><div class="subhead">'+kicker+'<b>'+esc(label)+'</b></div></header>';
  const footer=n=>'<footer><span>Position as at '+esc(d.period.generated)+' UK time</span><span>'+(test?'TEST / PREVIEW COPY':'CLAREMONT ORDER PORTAL')+' &nbsp; '+n+' / 4</span></footer>';
  const card=(name,val,note,tone)=>'<div class="metric '+(tone||'')+'"><div class="eyebrow">'+name+'</div><strong>'+val+'</strong><p>'+note+'</p></div>';
  const banner=(title,body)=>'<div class="callout"><strong>'+title+'</strong><span>'+body+'</span></div>';
  const row=(name,count,value,tone)=>'<div class="attention"><div class="dot '+tone+'"></div><div><b>'+name+'</b><small>'+count+' item'+(count===1?'':'s')+'</small></div><strong>'+money(value)+'</strong></div>';
  const bars=d.buckets.filter((b,i)=>b.count || (i>0&&i<5));
  const max=Math.max(1,...bars.map(b=>b.count));
  const colors=['#697d94','#2665ad','#008c91','#c79228','#c45151','#697d94'];
  const ageing=bars.map(b=>{const i=d.buckets.indexOf(b);return '<div class="age-row"><div class="age-label"><b>'+esc(b.label)+'</b><span>'+b.count+' orders <em>'+money(b.value)+'</em></span></div><div class="track"><div style="width:'+Math.round(b.count/max*100)+'%;background:'+colors[i]+'"></div></div></div>';}).join('');
  const p1=header('Weekly finance snapshot','Last week\'s activity. Today\'s position.')+
    '<div class="metrics">'+card('Pending orders',d.pending.length,'Not yet placed','blue')+card('Pending value',money(d.pendingValue),'Current outstanding estimate','teal')+card('Budget used',money(d.totals.spent),'Spending and commitments','navy')+card('Budget remaining',money(d.totals.remaining),'Of '+money(d.totals.total)+' allocated','amber')+'</div>'+
    '<div class="columns"><div class="panel ageing"><h2>Pending order ageing</h2><p class="caption">Grouped by submission week; current pending orders only</p>'+ageing+'</div><div class="panel"><h2>Finance attention</h2><p class="caption">Priority checks for the week ahead</p>'+row('Past required-by date',d.overdue.length,sum(d.overdue),'red')+row('Awaiting sign-off / query',d.signoff.length,sum(d.signoff),'amber')+row('Pending over 30 days',d.pending.filter(r=>r.age>30).length,sum(d.pending.filter(r=>r.age>30)),'blue')+'<div class="mini-note">'+pressure.length+' departments need a budget review.<br>'+noAllocation.length+' have commitment with no positive allocation.</div></div></div>'+
    '<h2 class="activity-title">Activity during '+esc(label)+'</h2><div class="activity-grid">'+card('Orders submitted',d.newOrders,money(d.newValue)+' recorded value')+card('Orders placed',d.ordered,money(d.orderedValue)+' by order date')+card('Invoices / direct spend',d.invoices,money(d.invoiceValue)+' by reporting date')+'</div>'+
    '<p class="note">Credits/refunds: '+d.credits+' ('+money(d.creditValue)+'). Refund reversals: '+d.reversals+' ('+money(d.reversalValue)+'). These are separate from invoices/direct spend; details on page 3.</p>'+
    '<p class="note">'+(issues?'Data checks: '+d.invalidValues+' unavailable value(s), '+d.invalidDates+' missing date(s), '+d.futureDates+' future date(s), '+d.budgetErrors+' budget error(s). Totals exclude unavailable amounts. ':'')+'Order submissions and placed orders overlap; do not add the activity counts together. All amounts reflect current records. Review queues include orders and invoices.</p>'+footer(1);
  const oldest=d.pending.slice(0,8);
  const p2=header('Purchases needing attention','A practical follow-up list for Finance.')+
    '<div class="section-heading"><h2>Oldest pending orders</h2><span>Showing '+oldest.length+' of '+d.pending.length+'</span></div>'+
    reportTable_(['Order reference','Department','Supplier','Age','Estimate'],oldest.map(r=>[r.id,r.dept,r.supplier,r.age===null?'Unknown':r.age+' days',r.amountValid?money(r.value):'Unavailable']),[3,4],[16,33,29,9,13])+
    '<div class="section-heading"><h2>Highest-value sign-off items</h2><span>Showing '+Math.min(5,d.signoff.length)+' of '+d.signoff.length+'</span></div>'+
    reportTable_(['Reference','Type','Department','Review status','Value'],d.signoff.slice(0,5).map(r=>[r.id,r.type,r.dept,r.status,r.amountValid?money(r.value):'Unavailable']),[4],[18,10,33,24,15])+
    banner('Next actions','Resolve past-required-date requests, clear outstanding sign-off, and confirm the position of the oldest pending orders.')+
    '<p class="note">Age means calendar days since submission. Past-required-date requests are not confirmed late deliveries. Review can remain outstanding after an order is placed or an invoice is processed. Full details and notes are available in the portal.</p>'+footer(2);
  const pReturns=header('Returns, credits and refunds','Follow up refunds and reconcile signed adjustments.')+
    '<div class="metrics">'+card('Returns awaiting refund',d.returns.length,'Current open returns','amber')+
    card('Remaining purchase cost',money(d.returnRemaining),d.returnMissingValues?'Known values only; '+d.returnMissingValues+' unavailable':'For purchases awaiting refund','navy')+
    card('Credits / refunds',money(d.creditValue),d.credits+' entries in reporting week','teal')+
    card('Refund reversals',money(d.reversalValue),d.reversals+' entries in reporting week','blue')+'</div>'+
    '<div class="section-heading"><h2>Returns awaiting refund</h2><span>Showing '+Math.min(5,d.returns.length)+' of '+d.returns.length+'</span></div>'+
    reportTable_(['Purchase reference','Department','Original cost','Refunded','Remaining'],d.returns.slice(0,5).map(r=>[r.id,r.dept,r.original===null?'Unavailable':money(r.original),money(r.refunded),r.remaining===null?'Unavailable':money(r.remaining)]),[2,3,4],[23,32,15,15,15])+
    '<p class="note">Remaining purchase cost is not a promised refund: partial returns may recover less. Refunded totals exclude reversed credits. These figures describe the original purchases and are not additional ledger entries.</p>'+
    '<div class="section-heading"><h2>Adjustments during the reporting week</h2><span>Showing '+Math.min(5,d.adjustments.length)+' of '+d.adjustments.length+'</span></div>'+
    reportTable_(['Reference','Kind','Reporting date','Original purchase / credit','Signed value'],d.adjustments.slice(0,5).map(r=>[r.id,r.kind,r.reportingDay,r.creditId || r.parentId || 'Unlinked credit',r.amountValid?money(r.value):'Unavailable']),[4],[23,12,16,34,15])+
    '<p class="note">Credits/refunds reduce spending; reversals add it back. Net adjustment this week: '+money(d.creditValue+d.reversalValue)+'. Each signed entry is counted once, using the same effective reporting date as the dashboard and exports. Original entries stay in their original reporting weeks.</p>'+footer(3);
  const ranked=d.budgets.slice().sort((a,b)=>Number(b.hasCalculationError)-Number(a.hasCalculationError) || a.remaining-b.remaining || b.spent-a.spent);
  const selected=ranked.filter(b=>b.hasCalculationError || b.spent!==0 || b.total!==0).slice(0,9);
  const p3=header('Budget position and priorities','Focus on departments requiring review.')+
    '<div class="budget-summary">'+card('Allocated',money(d.totals.total),'Across '+d.budgets.length+' active departments')+card('Used without allocation',money(noAllocation.reduce((n,b)=>n+b.spent,0)),noAllocation.length+' departments; allocation is zero or negative','amber')+card('Departments under pressure',pressure.length,'Negative balance or at least 90% used','amber')+'</div>'+
    '<div class="section-heading"><h2>Priority budget review</h2><span>'+selected.length+' departments shown / ranked by remaining balance</span></div>'+
    reportTable_(['Department','Allocated','Used','Remaining','Position'],selected.map(b=>[b.dept,money(b.total),b.hasCalculationError?'Unavailable':money(b.spent),b.hasCalculationError?'Unavailable':money(b.remaining),b.hasCalculationError?'Check calculation':b.total<=0&&b.spent>0?'No allocation':b.remaining<0?'Over budget':b.total>0?Math.round(b.spent/b.total*100)+'% used':'-']),[1,2,3],[38,14,15,15,18])+
    banner(d.budgetErrors?'Known totals (incomplete)':'Whole-portal budget position',money(d.totals.total)+' allocated / '+money(d.totals.spent)+' used / '+money(d.totals.remaining)+' remaining. Totals include all active visible departments, not just those listed above.')+
    '<div class="definitions"><div><h3>What budget used means</h3><p>The authoritative budget ledger includes spending, open commitments and signed adjustments. It is not a cash-paid total and is not limited to the reporting week.</p></div><div><h3>What Finance should review</h3><p>Confirm allocation for spending with no budget recorded. Review negative balances and departments near their limit before approving further spend.</p></div></div>'+
    '<p class="note">Budget figures retain existing allocation and rollover rules, including older commitments. Open Configuration for all departments. Cancelled, voided and removed records and budget transfers are excluded from order activity counts.</p>'+footer(4);
  return '<!doctype html><html><head><meta charset="UTF-8"><title>Claremont Weekly Finance Report</title><style>'+weeklyFinanceCss_()+'</style></head><body>'+[p1,p2,pReturns,p3].map(p=>'<section>'+p+'</section>').join('')+'</body></html>';
}
function weeklyFinanceCss_() {
  return `@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#20364b}section{position:relative;height:189mm;page-break-after:always;padding-bottom:10mm}section:last-child{page-break-after:auto}header{height:29mm;background:#14354b;color:white;padding:4mm 6mm;border-radius:2mm;margin-bottom:5mm}.brand{font-size:8pt;font-weight:bold;letter-spacing:.8pt;color:#b7d6e6}.brand span{float:right;font-size:7pt;font-weight:normal}h1{font-size:22pt;line-height:1;margin:3mm 0}header .subhead{font-size:8pt;color:#d0e2ec}.subhead b{float:right;color:white;font-size:10pt}h2{font-size:11pt;line-height:1.2;margin:0;color:#193d56}h3{font-size:9pt;margin:0 0 2mm}.metrics{display:flex;gap:4mm;margin-bottom:5mm}.metric{flex:1;min-width:0;background:#f1f5f8;border:1px solid #dce6ec;border-top:3px solid #58798e;border-radius:1.5mm;padding:3mm 4mm}.metric.blue{border-top-color:#2665ad}.metric.teal{border-top-color:#008c91}.metric.navy{border-top-color:#14354b}.metric.amber{border-top-color:#c79228}.eyebrow{font-size:7pt;letter-spacing:.3pt;text-transform:uppercase;color:#536b7d;font-weight:bold}.metric strong{display:block;font-size:21pt;line-height:1.15;margin:2mm 0;color:#17384e}.metric p{font-size:7pt;color:#536b7d;margin:0;line-height:1.25}.columns{display:flex;gap:5mm}.panel{border:1px solid #dce6ec;border-radius:2mm;padding:4mm 5mm;flex:1}.panel.ageing{flex:1.55}.caption{font-size:7.5pt;color:#627887;margin:1.5mm 0 4mm}.age-row{margin:0 0 1.5mm}.age-row:last-child{margin:0}.age-label{display:flex;justify-content:space-between;align-items:baseline;font-size:8pt;margin-bottom:1.5mm}.age-label span{font-size:7.5pt;color:#536b7d}.age-label em{font-style:normal;display:inline-block;width:25mm;text-align:right;font-weight:bold;color:#20364b}.track{height:2.5mm;background:#e9eff3;border-radius:2mm}.track>div{height:100%;border-radius:2mm}.attention{display:flex;align-items:center;padding:3mm 0;border-bottom:1px solid #e1e8ed;gap:2.5mm}.attention b{font-size:8pt}.attention small{display:block;font-size:7.5pt;color:#61798c;margin-top:1mm}.attention>strong{font-size:10pt;margin-left:auto;white-space:nowrap}.dot{width:2mm;height:2mm;flex-shrink:0;border-radius:50%;background:#2665ad}.dot.red{background:#bf5050}.dot.amber{background:#c79228}.mini-note{font-size:7.5pt;line-height:1.5;padding-top:3mm;color:#627887}.activity-title{margin:4mm 0 2mm}.activity-grid,.budget-summary{display:flex;gap:4mm}.activity-grid .metric{padding:2.5mm 4mm;position:relative;border-top:0}.activity-grid .metric strong{font-size:17pt;margin:1mm 0}.activity-grid .metric p{position:absolute;right:4mm;bottom:4mm;font-size:8pt}.note{font-size:7pt;line-height:1.4;color:#627887;margin:2.5mm 0}.section-heading{display:flex;justify-content:space-between;align-items:center;margin:4mm 0 2mm}.section-heading span{font-size:7pt;color:#627887}.data{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}.data th{background:#e6eef4;color:#264b64;text-align:left;padding:2.5mm 3mm;font-size:7pt;font-weight:bold}.data td{padding:1.4mm 3mm;border-bottom:1px solid #dce6ec;vertical-align:middle}.data .num{text-align:right}.data tr{page-break-inside:avoid}.data tr:nth-child(even){background:#f4f7f9}.cell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}.callout{display:flex;gap:4mm;background:#eaf1f6;border-left:3px solid #008c91;padding:3mm 4mm;margin-top:4mm;font-size:8pt;line-height:1.35}.callout>strong{min-width:35mm;color:#173d55}.callout>span{color:#456174}.budget-summary{margin-bottom:4mm}.budget-summary .metric{padding:3mm 4mm}.budget-summary .metric strong{font-size:19pt}.definitions{display:flex;gap:8mm;margin-top:4mm}.definitions>div{flex:1}.definitions p{font-size:7.5pt;color:#627887;line-height:1.5;margin:0}footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #dce6ec;padding-top:2.5mm;display:flex;justify-content:space-between;color:#657f91;font-size:6.5pt}`;
}

function weeklyFinancePdf_(ss, test) {
  const data = buildWeeklyFinanceData_(ss, new Date());
  const html = buildWeeklyFinanceHtml_(data,test);
  const name = 'Claremont-finance-'+data.period.start+'-to-'+data.period.end+(test?'-TEST':'')+'.pdf';
  const pdf = Utilities.newBlob(html, 'text/html', 'report.html').getAs(MimeType.PDF).setName(name);
  return { data, pdf, name };
}
function getWeeklyFinancePreview() {
  reportAdmin_();
  // Explicit production read for a real-data preview. Never write to this spreadsheet here.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('The production spreadsheet is unavailable.');
  const report = weeklyFinancePdf_(ss, true);
  return { name:report.name, base64:Utilities.base64Encode(report.pdf.getBytes()), period:report.data.period.label,
    summary:{pending:report.data.pending.length, pendingValue:report.data.pendingValue, commitment:report.data.totals.spent, remaining:report.data.totals.remaining} };
}
function sendWeeklyFinanceTest() {
  reportAdmin_();
  return sendWeeklyFinance_(SpreadsheetApp.getActiveSpreadsheet(), 'test');
}
function sendWeeklyFinanceNow() {
  reportAdmin_();
  if (isDevelopmentRuntime_()) throw new Error('Live reports cannot be sent from development. Use Send test to IT.');
  return sendWeeklyFinance_(getPortalSpreadsheet_(), 'manual');
}
function sendWeeklyFinance_(ss, mode) {
  if (isDevelopmentRuntime_() && mode !== 'test') return {success:true,skipped:true,message:'DEV scheduled and live report deliveries are suppressed.'};
  const lock = LockService.getScriptLock();
  if(!lock.tryLock(1000)) throw new Error('A report is already being prepared. Please wait.');
  const p = reportProperties_();
  const scheduled = mode === 'scheduled', test = mode === 'test';
  const statusKey = scheduled ? 'WEEKLY_FINANCE_LAST' : reportPropertyKey_('LAST');
  let key = '', startedSending = false, lockHeld = true, reserved = false, reservation = '';
  const token = Utilities.getUuid();
  try {
    portalAssertExecutionAccount_();
    if (!ss) throw new Error('The report spreadsheet is unavailable.');
    if (scheduled && !reportExecutionOwnerMatches_(ss)) return { success: true, skipped: true, message: 'The report belongs to another operating account.' };
    if (!test && isDevelopmentRuntime_()) throw new Error('Development can only send to IT.');
    const period = reportPeriod_(new Date());
    key = scheduled ? 'WEEKLY_FINANCE_DELIVERY_'+period.weekKey : reportPropertyKey_('RECENT_'+mode.toUpperCase());
    const previous = p.getProperty(key);
    const preparingAt = previous && previous.startsWith('PREPARING ') ? Date.parse(previous.split(' ')[1]) : NaN;
    const abandonedPreparation = Number.isFinite(preparingAt) && Date.now() - preparingAt > 30 * 60 * 1000;
    if (previous && /^(SENDING|UNCERTAIN)/.test(previous)) {
      throw new Error('Delivery of the previous report is unconfirmed. Ask IT to check sent mail before allowing another delivery.');
    }
    if (previous && previous.startsWith('PREPARING') && !abandonedPreparation) throw new Error('A report is being prepared. If preparation stops, recovery becomes available after 30 minutes.');
    if (scheduled && previous && previous.startsWith('SENT')) return {success:true,message:'This reporting week has already been handled; no duplicate email was sent.'};
    if (!scheduled && previous && Date.now()-Number(previous)<120000) throw new Error('A report was recently sent. Wait two minutes before sending another.');
    const to = test ? WEEKLY_REPORT_TEST_TO_ : String(getConfig_(ss).financeEmail || '').trim();
    if(!isValidConfigurationEmail_(to)) throw new Error('The Finance notification email is invalid.');
    const stored = reportStoredSettings_(ss);
    const savedCc = stored ? stored.cc.join('\n') : p.getProperty('WEEKLY_FINANCE_CC');
    const cc = test ? [] : reportCc_(savedCc === null ? WEEKLY_REPORT_DEFAULT_CC_ : savedCc, to);
    reservation = 'PREPARING ' + new Date().toISOString() + ' ' + token;
    p.setProperty(key, reservation);
    reserved = true;
    lock.releaseLock(); lockHeld = false;
    const report = weeklyFinancePdf_(ss,test);
    if(MailApp.getRemainingDailyQuota() < 1+cc.length) throw new Error('Email quota is too low; report was not sent.');
    const subject = (test?'[DEV TEST - IT ONLY] ':'')+'Weekly Finance Report | '+report.data.period.label;
    const body = (test?'Test report using real production data. Delivered only to IT.\n\n':'')+
      'Please find attached the weekly finance report for '+report.data.period.label+'.\n\n'+
      'Current position as at '+report.data.period.generated+' UK time.\n'+
      report.data.pending.length+' pending orders; '+reportMoney_(report.data.pendingValue)+' estimated outstanding value.\n\nOpen the portal: '+getPortalPublicUrl_();
    const email = {to,subject,body,attachments:[report.pdf],name:'Claremont Order Portal',replyTo:'noreply@claremontschool.co.uk'};
    if(cc.length) email.cc=cc.join(',');
    if (!lock.tryLock(1000)) throw new Error('Report preparation finished but the system is busy. No report was sent.');
    lockHeld = true;
    portalAssertExecutionAccount_();
    if (scheduled) {
      const latest = reportStoredSettings_(ss);
      if (!reportExecutionOwnerMatches_(ss) || (latest ? !latest.enabled : p.getProperty('WEEKLY_FINANCE_ENABLED') !== 'true')) {
        throw new Error('Reporting was disabled or its operating account changed during preparation. No report was sent.');
      }
    }
    if (p.getProperty(key) !== reservation) { reserved = false; throw new Error('A newer report preparation has replaced this attempt. No report was sent by this attempt.'); }
    p.setProperty(key,'SENDING '+new Date().toISOString()+' '+token);
    // Hold the same lock as takeover until delivery is recorded. PDF generation
    // above remains outside the lock, so normal order saves are not blocked.
    startedSending=true;
    sendPortalServiceEmail_(email);
    p.setProperty(key,scheduled?'SENT '+new Date().toISOString():String(Date.now()));
    const message=(test?'Test sent':'Report sent')+' to '+to+(cc.length?' (CC: '+cc.join(', ')+')':' (no CC)')+' at '+report.data.period.generated+' UK time.';
    p.setProperty(statusKey,message);
    return {success:true,message,period:report.data.period.label};
  } catch(error) {
    const message=(startedSending?'Delivery could not be confirmed. Check mail before retrying. ':'Report failed before sending: ')+String(error.message || error);
    if (reserved && key && (lockHeld || (lockHeld = lock.tryLock(1000)))) {
      const current = p.getProperty(key);
      if (current === reservation || (startedSending && current && current.endsWith(' '+token))) {
        p.setProperty(key,(startedSending?'UNCERTAIN ':'FAILED ')+new Date().toISOString());
        p.setProperty(statusKey,message);
      }
    }
    throw new Error(message);
  } finally { if (lockHeld) lock.releaseLock(); }
}
function weeklyFinanceDue_(now) {
  const today=reportDay_(now);
  return new Date(today+'T12:00:00Z').getUTCDay()===1 && +Utilities.formatDate(now,WEEKLY_REPORT_TZ_,'H')>=7;
}
function weeklyFinanceSchedule() {
  const p = reportProperties_();
  if(!weeklyFinanceDue_(new Date())) return;
  const id=p.getProperty('WEEKLY_FINANCE_SPREADSHEET');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Weekly report spreadsheet is not configured.');
  const stored = reportStoredSettings_(ss);
  if (stored ? !stored.enabled : p.getProperty('WEEKLY_FINANCE_ENABLED') !== 'true') return;
  if (!reportExecutionOwnerMatches_(ss)) return;
  sendWeeklyFinance_(ss,'scheduled');
}
