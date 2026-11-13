// DEV-only synthetic rollout fixtures. Never reads or writes live data.
function returnDevelopmentPage_() {
  const c=amazonDevelopmentContext_();
  return HtmlService.createHtmlOutput('<h1>Returns DEV verification</h1><p>Isolated DEV spreadsheet. Notifications suppressed. No live writes.</p><button onclick="this.disabled=true;google.script.run.withSuccessHandler(r=>document.getElementById(\'result\').textContent=JSON.stringify(r,null,2)).withFailureHandler(e=>document.getElementById(\'result\').textContent=e.message).seedReturnDevelopmentFixtures()">Prepare synthetic return tests</button><pre id="result"></pre>');
}
function seedReturnDevelopmentFixtures() {
  const c=amazonDevelopmentContext_();
  if(c.user.isSimulated)throw new Error('Exit simulation first.');
  return withWriteLock_('seedReturnDevelopmentFixtures',()=>{
    const sheet=c.ss.getSheetByName('Orders'),existing=sheet.getDataRange().getValues();
    const ids=[];
    ['FULL','PARTIAL','CANCEL','LEAD'].forEach(kind=>{
      const id='DEV-RETURN-20261104-'+kind;ids.push(id);
      if(existing.some(row=>row[0]===id))return;
      appendOrderRow_(sheet,[id,kind==='LEAD'?'Prep Art':'Computing & IT - Hardware',new Date('2026-11-01T12:00:00Z'),c.user.email,'DEV ONLY Amazon','','Synthetic return test '+kind,'',1,24,24,'Prep','',new Date('2026-11-01T12:00:00Z'),'',24,'','','',''],'Order','SYNTHETIC','',c.user.email,'Credit card');
    });
    markDataChanged_();return {environment:'DEV',liveWrites:false,ids};
  });
}
function invoiceEditingDevEvidencePage_() {
  const c = amazonDevelopmentContext_();
  const values = c.ss.getSheetByName('Orders').getDataRange().getValues();
  const invoice = values.find(row => String(row[0]) === 'DEV-26090700022');
  const auditSheet = c.ss.getSheetByName('Order Change Audit');
  const audit = auditSheet ? auditSheet.getDataRange().getValues().filter(row => String(row[1]) === 'DEV-26090700022') : [];
  const evidence = {
    environment:'DEV', notifications:'SUPPRESSED', liveWrites:false,
    checks:{
      originalAmountAudited:audit.some(row => row[3] === 'Total' && row[4] === 95263246 && row[5] === 2176.77),
      correctionReasonAudited:audit.some(row => row[3] === 'Correction reason' && row[5] === 'DEV verification: invoice number entered as amount'),
      requesterPreserved:!!invoice && invoice[3] === 'andy.clifton@claremontschool.co.uk',
      pendingPreserved:!!invoice && !isOrderCompleted_(invoice),
      referencePreserved:!!invoice && String(invoice[18]) === '95263246'
    }
  };
  return HtmlService.createHtmlOutput('<h1>Invoice editor DEV evidence</h1><pre>' + escapeEmailHtml_(JSON.stringify(evidence,null,2)) + '</pre>');
}
function amazonDevelopmentContext_() {
  if (!isDevelopmentRuntime_()) throw new Error('DEV only.');
  const user = getAuthorizedUserContext_();
  if (user.realRole !== ROLE_ADMIN_) throw new Error('Admin required.');
  const ss = getPortalSpreadsheet_();
  const folder = getPortalAttachmentFolder_();
  if (ss.getId() === '1nUhtnywmnibXPmQNBM78aYVf03BHj3trw-pIHe3ZO34') throw new Error('Live source prohibited.');
  if (!developmentNotificationsSuppressed_()) throw new Error('Mail must be suppressed.');
  return {ss, folder, user};
}

function orderPortalUsabilityDevelopmentPage_() {
  const context = amazonDevelopmentContext_();
  if (context.user.isSimulated) throw new Error('Exit preview or DEV test mode before preparing fixtures.');
  const url = escapeEmailHtml_(ScriptApp.getService().getUrl());
  return HtmlService.createHtmlOutput(`<!doctype html><html lang="en-GB"><meta charset="utf-8">
    <title>Order Portal usability tests</title>
    <body><h1>Order Portal usability tests</h1>
      <p>Isolated DEV workbook. Notifications are suppressed. Preparing fixtures keeps any existing test changes.</p>
      <button id="prepare" type="button">Prepare synthetic DEV fixtures</button>
      <a href="${url}" target="_top">Open DEV Order Portal</a>
      <pre id="result" role="status"></pre>
      <script>
        document.getElementById('prepare').onclick = function () {
          const button = this, result = document.getElementById('result');
          button.disabled = true;
          result.textContent = 'Preparing fixtures…';
          google.script.run.withSuccessHandler(value => {
            result.textContent = JSON.stringify(value,null,2);
            button.disabled = false;
          }).withFailureHandler(error => {
            result.textContent = error.message || String(error);
            button.disabled = false;
          }).seedOrderPortalUsabilityDevelopmentFixtures();
        };
      </script>
    </body></html>`);
}

function seedOrderPortalUsabilityDevelopmentFixtures() {
  const context = amazonDevelopmentContext_();
  if (context.user.isSimulated) throw new Error('Exit preview or DEV test mode before preparing fixtures.');
  const prep = 'DEV UX Prep', senior = 'DEV UX Senior';
  const email = role => 'dev-ux-' + role + '@claremontschool.co.uk';
  const budgets = [
    {name:prep, allocation:4500, gl:'DEV-UX-PREP'},
    {name:senior, allocation:6200, gl:'DEV-UX-SENIOR'}
  ];
  const accounts = [
    {email:email('admin'),role:ROLE_ADMIN_,departments:[prep,senior],site:'Prep'},
    {email:email('finance'),role:ROLE_WIPRO_,departments:[prep,senior],site:'Senior'},
    {email:email('staff'),role:ROLE_STAFF_,departments:[prep,senior],site:'Prep'},
    {email:email('lead'),role:ROLE_HEAD_,departments:[prep,senior],site:'Prep'},
    {email:email('buyer'),role:ROLE_STAFF_,departments:[prep,senior],site:'Prep',processingDepartments:[prep]},
    {email:email('processor'),role:ROLE_STAFF_,departments:[senior],site:'Senior',canProcess:true}
  ];
  const now = new Date(), twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
  const academicStart = now.getUTCFullYear() - (now.getUTCMonth() < 8 ? 1 : 0);
  const priorYear = new Date(Date.UTC(academicStart,7,30,12));
  const fixtures = [
    {id:'DEV-UX-REQ-OWN',dept:prep,desc:'Own pending request',requester:'staff',cost:36,site:'Prep'},
    {id:'DEV-UX-REQ-FOR',dept:prep,desc:'Pending request made on behalf of the department lead',requester:'lead',submittedBy:'staff',cost:47.50,site:'Prep'},
    {id:'DEV-UX-REQ-NO-CHARGE',dept:senior,desc:'Warranty replacement pending no-charge processing',requester:'staff',cost:22,site:'Senior'},
    {id:'DEV-UX-INV-LOGGED',dept:prep,desc:'Invoice awaiting Finance processing',requester:'finance',cost:58.95,site:'Prep',type:'Invoice',reference:'DEV-UX-INV-01',payment:'Invoice / on account'},
    {id:'DEV-UX-INV-WARNING',dept:senior,desc:'Invoice total that matches its reference',requester:'finance',cost:1234,site:'Unassigned',type:'Invoice',reference:'1234',payment:'Credit card'},
    {id:'DEV-UX-INV-REVIEW',dept:prep,desc:'Department buyer invoice awaiting independent sign-off',requester:'buyer',cost:18.50,site:'Whole school',type:'Invoice',reference:'DEV-UX-INV-02',payment:'Credit card',review:true},
    {id:'DEV-UX-ORDER-EVIDENCE',dept:prep,desc:'Ordered purchase with invoice evidence',requester:'staff',cost:84,site:'Prep',ordered:true,reference:'DEV-UX-DUPLICATE',attachment:'https://example.com/dev-only-invoice-evidence.pdf'},
    {id:'DEV-UX-RETURN-BASE',dept:prep,desc:'Ordered purchase for refund and reversal',requester:'staff',cost:60,site:'Prep',ordered:true},
    {id:'DEV-UX-RETURN-QUEUE',dept:prep,desc:'Ordered purchase already awaiting a refund',requester:'staff',cost:38.50,site:'Prep',ordered:true,returnPending:true},
    {id:'DEV-UX-PRIOR-YEAR',dept:prep,desc:'Prior academic year purchase for scope checks',requester:'staff',cost:199,site:'Prep',ordered:true,date:priorYear},
    {id:'DEV-UX-PRIOR-COMMITMENT',dept:prep,desc:'Prior academic year request still pending for carry-over checks',requester:'staff',cost:55,site:'Prep',date:priorYear}
  ];
  for (let i = 1; i <= 12; i++) fixtures.push({
    id:'DEV-UX-BATCH-'+String(i).padStart(2,'0'),dept:prep,desc:'Batch test: identical stationery request',
    requester:'staff',cost:10+i,site:'Prep'
  });
  return withWriteLock_('seedOrderPortalUsabilityDevelopmentFixtures',() => {
    const ss = getPortalSpreadsheet_();
    const orderSheet = ss.getSheetByName('Orders'), userSheet = ss.getSheetByName('Users'), budgetSheet = ss.getSheetByName('Budgets');
    if (!orderSheet || !userSheet || !budgetSheet) throw new Error('DEV Users, Budgets and Orders must be available.');
    const budgetSchema = getBudgetConfigurationSchema_(budgetSheet,false);
    const userSchema = getUserConfigurationSchema_(userSheet,false);
    const ensureHeader = (sheet,schema,field,name) => {
      if (schema[field] < 0) schema[field] = ensureConfigurationColumn_(sheet,schema.headers,name);
    };
    ensureHeader(budgetSheet,budgetSchema,'glCodeIndex','GL Code');
    ensureHeader(budgetSheet,budgetSchema,'activeIndex','Active');
    ensureHeader(userSheet,userSchema,'defaultSiteIndex','Default Site');
    ensureHeader(userSheet,userSchema,'activeIndex','Active');
    ensureHeader(userSheet,userSchema,'canProcessOrdersIndex','Can Process Orders');
    ensureHeader(userSheet,userSchema,'processingDepartmentsIndex','Processing Departments');
    ensureHeader(userSheet,userSchema,'canLogInvoicesIndex','Can Log Invoices');

    const budgetRows = budgetSheet.getRange(1,1,budgetSheet.getLastRow(),budgetSheet.getLastColumn()).getValues().slice(1);
    const userRows = userSheet.getRange(1,1,userSheet.getLastRow(),userSheet.getLastColumn()).getValues().slice(1);
    const orderIds = new Set(orderSheet.getDataRange().getValues().slice(1).map(row=>String(row[0])));
    const created = {budgets:0,users:0,orders:0};
    for (const budget of budgets) {
      const matches = budgetRows.filter(row=>normalizeConfigurationKey_(row[budgetSchema.departmentIndex])===normalizeConfigurationKey_(budget.name));
      if (matches.length) {
        if (matches.length !== 1 || matches[0][budgetSchema.glCodeIndex] !== budget.gl) {
          throw new Error('A reserved DEV budget name is already in use. No fixtures were changed.');
        }
        continue;
      }
      const row = Array(budgetSheet.getLastColumn()).fill('');
      row[budgetSchema.departmentIndex] = budget.name;
      row[budgetSchema.totalIndex] = budget.allocation;
      row[budgetSchema.glCodeIndex] = budget.gl;
      row[budgetSchema.activeIndex] = true;
      budgetSheet.appendRow(row);
      setNewBudgetFormulas_(ss,budgetSheet,budgetSchema,budgetSheet.getLastRow());
      created.budgets++;
    }
    for (const account of accounts) {
      if (userRows.some(row=>normalizeConfigurationKey_(row[userSchema.emailIndex])===account.email)) continue;
      const row = Array(userSheet.getLastColumn()).fill('');
      row[userSchema.emailIndex] = account.email;
      row[userSchema.departmentIndex] = account.departments.join(', ');
      row[userSchema.roleIndex] = account.role;
      row[userSchema.defaultSiteIndex] = account.site;
      row[userSchema.activeIndex] = true;
      row[userSchema.canProcessOrdersIndex] = account.canProcess === true;
      row[userSchema.canLogInvoicesIndex] = false;
      row[userSchema.processingDepartmentsIndex] = (account.processingDepartments || []).join(', ');
      userSheet.appendRow(row);
      created.users++;
    }
    for (const fixture of fixtures) {
      if (orderIds.has(fixture.id)) continue;
      const type = fixture.type || 'Order', date = fixture.date || twoDaysAgo;
      const requester = email(fixture.requester), submittedBy = email(fixture.submittedBy || fixture.requester);
      const payment = fixture.payment || (fixture.ordered ? 'Credit card' : '');
      const location = type === 'Invoice' ? 'Finance' : fixture.site;
      const entry = appendOrderRow_(orderSheet,[
        fixture.id,fixture.dept,date,requester,'DEV UX Synthetic supplier','','DEV UX: '+fixture.desc,'',
        1,fixture.cost,fixture.cost,location,'',fixture.ordered ? date : '','',fixture.ordered ? fixture.cost : '',
        '','Synthetic usability fixture. No external purchase was placed.','',fixture.attachment || ''
      ],type,budgets.find(budget=>budget.name===fixture.dept).gl,fixture.reference || '',submittedBy,payment,fixture.site);
      if (fixture.ordered || fixture.review) {
        const actor = fixture.review ? requester : email('processor');
        orderSheet.getRange(entry.rowNumber,entry.columns.processedByColumn).setValue(actor);
      }
      if (fixture.review) {
        orderSheet.getRange(entry.rowNumber,entry.columns.approvalStatusColumn).setValue(APPROVAL_AWAITING_);
        orderSheet.getRange(entry.rowNumber,entry.columns.approvalRevisionColumn).setValue(1);
      }
      if (fixture.returnPending) {
        const column = ensureOrdersColumn_(orderSheet,'Return and refund history',{hidden:true});
        const history = [{action:'mark',by:requester,at:now.toISOString(),note:'Synthetic pending return'}];
        orderSheet.getRange(entry.rowNumber,column).setValue(JSON.stringify({pending:true,refunds:[],history}));
      }
      created.orders++;
    }
    if (created.users || created.budgets) markConfigurationChanged_();
    else if (created.orders) markDataChanged_();
    return {environment:'DEV',notifications:'SUPPRESSED',liveWrites:false,created,
      accounts:accounts.map(account=>account.email),departments:budgets.map(budget=>budget.name),orderIds:fixtures.map(fixture=>fixture.id)};
  });
}

function getAmazonDevelopmentDiagnostics() {
  const c = amazonDevelopmentContext_();
  return {environment:'DEV', spreadsheetId:c.ss.getId(), attachmentFolderId:c.folder.id, notifications:'SUPPRESSED', liveWrites:false};
}
function amazonDevelopmentPage_() {
  const d = getAmazonDevelopmentDiagnostics();
  return HtmlService.createHtmlOutput(`<h1>Amazon DEV verification</h1><pre>${escapeEmailHtml_(JSON.stringify(d,null,2))}</pre><button onclick="this.disabled=true;google.script.run.withSuccessHandler(r=>document.getElementById('result').textContent=JSON.stringify(r,null,2)).withFailureHandler(e=>document.getElementById('result').textContent=e.message).seedAmazonDevelopmentFixtures()">Prepare synthetic DEV fixtures</button><button onclick="this.disabled=true;google.script.run.withSuccessHandler(r=>document.getElementById('result').textContent=JSON.stringify(r,null,2)).withFailureHandler(e=>document.getElementById('result').textContent=e.message).seedAdminSignoffDevelopmentFixture()">Prepare synthetic Admin cleanup test</button><pre id="result"></pre>`);
}
function seedAdminSignoffDevelopmentFixture() {
  const c=amazonDevelopmentContext_();
  if(c.user.isSimulated)throw new Error('Exit simulation first.');
  return withWriteLock_('seedAdminSignoffDevelopmentFixture',()=>{
    const sheet=c.ss.getSheetByName('Orders'),id='DEV-ADMIN-CLEANUP-20261019';
    if(sheet.getDataRange().getValues().some(row=>row[0]===id))return {id,existing:true};
    const actor=c.user.email;
    const saved=appendOrderRow_(sheet,[id,'Computing & IT - Hardware',new Date(),actor,'DEV ONLY Admin cleanup','','Synthetic obsolete Admin sign-off','',1,1.23,1.23,'Finance','','','','','','','',''],'Invoice','SYNTHETIC','DEV-ADMIN-CLEANUP',actor,'Invoice / on account');
    writeAdjacentOrderCells_(sheet,saved.rowNumber,[[saved.columns.processedByColumn,actor],[saved.columns.approvalStatusColumn,APPROVAL_AWAITING_],[saved.columns.approvalRevisionColumn,1]]);
    markDataChanged_();return {id,environment:'DEV',notifications:'SUPPRESSED'};
  });
}
function seedAmazonDevelopmentFixtures() {
  const c = amazonDevelopmentContext_();
  if (c.user.isSimulated) throw new Error('Exit simulation before preparing fixtures.');
  const people = [{"name": "Lorraine Kasztura", "email": "lorraine.kasztura@claremontschool.co.uk", "processingDepartments": ["Whole School Learning Support"], "role": "Staff", "departments": ["Whole School Learning Support", "Whole School Learning Support - Recharge"], "canLogInvoices": true, "canProcessOrders": false}, {"name": "Claire Martin", "email": "claire.martin@claremontschool.co.uk", "processingDepartments": ["Whole School GL Assessments"], "role": "Staff", "departments": ["Whole School GL Assessments"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Miranda Booth", "email": "miranda.booth@claremontschool.co.uk", "processingDepartments": ["Whole School Medical"], "role": "Staff", "departments": ["Whole School Medical"], "canLogInvoices": true, "canProcessOrders": false}, {"name": "Michael Cook", "email": "michael.cook@claremontschool.co.uk", "processingDepartments": ["Whole School Sports"], "role": "Staff", "departments": ["Whole School Sports"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Sarah Cakebread", "email": "sarah.cakebread@claremontschool.co.uk", "processingDepartments": ["Whole School Performing Arts"], "role": "Staff", "departments": ["Whole School Performing Arts", "Prep Drama Academic", "Prep Where Confidence Grows / LEP"], "canLogInvoices": true, "canProcessOrders": false}, {"name": "James Sheriff", "email": "james.sheriff@claremontschool.co.uk", "processingDepartments": ["Whole School Futures", "Prep Humanities"], "role": "Staff", "departments": ["Whole School Futures", "Prep Humanities"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Natasha Smith", "email": "natasha.smith@claremontschool.co.uk", "processingDepartments": ["Senior Creative (Non PA)", "Prep Music"], "role": "Staff", "departments": ["Whole School Performing Arts", "Senior Creative (Non PA)", "Prep Music"], "canLogInvoices": true, "canProcessOrders": false}, {"name": "Mark Wood", "email": "mark.wood@claremontschool.co.uk", "processingDepartments": ["Senior Enterprise", "Prep Maths"], "role": "Staff", "departments": ["Senior Enterprise", "DofE", "Prep Maths"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Jon Underwood", "email": "jon.underwood@claremontschool.co.uk", "processingDepartments": ["Senior Science  PE & Psychology"], "role": "Staff", "departments": ["Senior Science  PE & Psychology"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Lea Owen", "email": "lea.owen@claremontschool.co.uk", "processingDepartments": ["Senior Transition Events", "Senior Head's Pot"], "role": "Head", "departments": ["Senior Transition Events", "Senior Head's Pot", "CPD - Senior"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Victoria Liggett", "email": "victoria.liggett@claremontschool.co.uk", "processingDepartments": ["Senior Sixth Form Centre"], "role": "Staff", "departments": ["Senior Sixth Form Centre"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "William Fry", "email": "william.fry@claremontschool.co.uk", "processingDepartments": ["Senior Lexis"], "role": "Staff", "departments": ["Senior Lexis"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Faye Eddicott", "email": "faye.eddicott@claremontschool.co.uk", "processingDepartments": ["Prep Art"], "role": "Staff", "departments": ["Prep Art"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Stuart Ware", "email": "stuart.ware@claremontschool.co.uk", "processingDepartments": ["Prep Art", "Prep Digital Literacy", "Prep Maths", "Prep Science", "Prep Library", "Prep DT"], "role": "Staff", "departments": ["Prep Art", "Prep Literacy", "Prep Digital Literacy", "Prep Maths", "Prep Music", "Prep Science", "Prep Language & Communication", "Prep Humanities", "Prep Global Perspectives", "Prep PSHE", "Prep Drama Academic", "Prep Library", "Prep Year 3", "Prep Year 4", "Prep DT"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Melissa Woods-Holder", "email": "melissa.woods-holder@claremontschool.co.uk", "processingDepartments": ["Prep Literacy"], "role": "Staff", "departments": ["Prep Literacy"], "canLogInvoices": true, "canProcessOrders": false}, {"name": "Michelle Fong", "email": "michelle.fong@claremontschool.co.uk", "processingDepartments": ["Prep Digital Literacy"], "role": "Staff", "departments": ["Prep Digital Literacy"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Rebecca Foster", "email": "rebecca.foster@claremontschool.co.uk", "processingDepartments": ["Prep Music"], "role": "Staff", "departments": ["Prep Music"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "John Jenkins", "email": "john.jenkins@claremontschool.co.uk", "processingDepartments": ["Prep Science"], "role": "Staff", "departments": ["Prep Science"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Lucie Scott", "email": "lucie.scott@claremontschool.co.uk", "processingDepartments": ["Prep Science"], "role": "Staff", "departments": ["Prep Science"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Max Menolfi", "email": "max.menolfi@claremontschool.co.uk", "processingDepartments": ["Prep Language & Communication"], "role": "Staff", "departments": ["Prep Language & Communication"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Catherine Mower", "email": "catherine.mower@claremontschool.co.uk", "processingDepartments": ["Prep Language & Communication"], "role": "Staff", "departments": ["Prep Language & Communication"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Marie Lefranc", "email": "marie.lefranc@claremontschool.co.uk", "processingDepartments": ["Prep Humanities"], "role": "Staff", "departments": ["Prep Humanities"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Ben Moir", "email": "ben.moir@claremontschool.co.uk", "processingDepartments": ["Prep PSHE", "Prep House Budgets", "Prep Transition Events", "Prep Where Confidence Grows / LEP", "Prep Head's Pot"], "role": "Head", "departments": ["Prep PSHE", "Prep House Budgets", "Prep Transition Events", "Prep Where Confidence Grows / LEP", "Prep Head's Pot", "CPD - Prep"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Lucy Skinner", "email": "lucy.skinner@claremontschool.co.uk", "processingDepartments": ["Prep Drama Academic"], "role": "Staff", "departments": ["Prep Drama Academic"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Charlotte Thornely", "email": "charlotte.thornely@claremontschool.co.uk", "processingDepartments": ["Prep Zoology - Animal Food"], "role": "Staff", "departments": ["Prep Zoology - Animal Food"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Jo Rainsbury", "email": "jo.rainsbury@claremontschool.co.uk", "processingDepartments": ["Prep Forest School"], "role": "Staff", "departments": ["Prep Forest School"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Louisa Dale", "email": "louisa.dale@claremontschool.co.uk", "processingDepartments": ["Prep Year 3"], "role": "Staff", "departments": ["Prep Year 3"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Michelle Bartley", "email": "michelle.bartley@claremontschool.co.uk", "processingDepartments": ["Prep Year 4"], "role": "Staff", "departments": ["Prep Year 4"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Andy Clifton", "email": "andy.clifton@claremontschool.co.uk", "processingDepartments": ["Computing & IT - Hardware"], "role": "Admin", "departments": ["Computing & IT - Hardware"], "canLogInvoices": false, "canProcessOrders": false}, {"name": "Jordan Whitefoot", "email": "jordan.whitefoot@claremontschool.co.uk", "processingDepartments": ["Marketing Online", "Marketing Offline", "Advertising & Promotions", "PR & Communications"], "role": "Staff", "departments": ["Marketing Online", "Marketing Offline", "Advertising & Promotions", "PR & Communications"], "canLogInvoices": true, "canProcessOrders": false}, {"name": "George Driver", "email": "george.driver@claremontschool.co.uk", "processingDepartments": ["Maintenance & Repairs - Buildings", "Maintenance & Repairs - Sports Facilities", "Maintenance & Repairs - Ground & Gardens", "Maintenance & Repairs - Motor Vehicles", "Maintenance & Repairs - Other", "Pest Control", "Health & Safety", "Equipment Rental (Non IT)", "Outsourced Cleaning Services"], "role": "Staff", "departments": ["Maintenance & Repairs - Buildings", "Maintenance & Repairs - Sports Facilities", "Maintenance & Repairs - Ground & Gardens", "Maintenance & Repairs - Motor Vehicles", "Maintenance & Repairs - Other", "Pest Control", "Health & Safety", "Equipment Rental (Non IT)", "Outsourced Cleaning Services"], "canLogInvoices": true, "canProcessOrders": false}, {"name": "Francoise Armstrong", "email": "francoise.armstrong@claremontschool.co.uk", "processingDepartments": ["Boarding"], "role": "Staff", "departments": ["Boarding"], "canLogInvoices": true, "canProcessOrders": false}];
  const ss=c.ss, budgets=ss.getSheetByName('Budgets');
  const existing=new Set(budgets.getDataRange().getValues().slice(1).map(r=>r[0]));
  people.forEach(p=>p.departments.concat(p.processingDepartments).forEach(name=>{
    if(existing.has(name))return;
    budgets.appendRow([name,10000,0,10000,'SYNTHETIC',true]);
    setNewBudgetFormulas_(ss,budgets,getBudgetConfigurationSchema_(budgets,true),budgets.getLastRow());
    existing.add(name);
  }));
  const users=ss.getSheetByName('Users'),schema=getUserConfigurationSchema_(users,true);
  people.push({email:'amazon.cover@claremontschool.co.uk',role:'Admin',departments:['Science'],processingDepartments:[]});
  people.push({email:'amazon.requester@claremontschool.co.uk',role:'Staff',departments:['Prep Art','Computing & IT - Hardware'],processingDepartments:[]});
  people.forEach(p=>{
    const rows=users.getDataRange().getValues();
    const index=rows.findIndex(r=>String(r[schema.emailIndex]).toLowerCase()===p.email);
    const row=index>0?rows[index].slice():new Array(users.getLastColumn()).fill('');
    row[schema.emailIndex]=p.email;
    row[schema.departmentIndex]=p.departments.join(', ');
    row[schema.roleIndex]=p.role; row[schema.defaultSiteIndex]='Senior';row[schema.activeIndex]=true;
    row[schema.canProcessOrdersIndex]=!!p.canProcessOrders;row[schema.canLogInvoicesIndex]=!!p.canLogInvoices;
    row[schema.processingDepartmentsIndex]=p.processingDepartments.join(', ');
    users.getRange(index>0?index+1:users.getLastRow()+1,1,1,row.length).setValues([row]);
  });
  bumpDataVersion_();
  return {namedBuyers:32,budgets:48,syntheticAccounts:2,environment:getAmazonDevelopmentDiagnostics()};
}
