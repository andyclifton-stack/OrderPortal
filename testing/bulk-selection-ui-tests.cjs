const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname,'../Index.html'),'utf8');
const source = (start,end) => html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const elements = {};
const element = id => elements[id] ||= {
  value:'',style:{},options:[],getAttribute(){},
  classes:new Set(),classList:{
    add(name){ elements[id].classes.add(name); },
    remove(name){ elements[id].classes.delete(name); }
  }
};
const finance = {
  email:'finance@example.test',realEmail:'admin@example.test',role:'Wipro',isDevTest:true,
  depts:['Finance','Science'],processingDepartments:[],
  capabilities:{canBulkUpdateOrders:true,canViewAllFinanceData:true}
};
const renderRows = rows => rows.map(order => ({value:order.id,checked:context.selectedOrderIds.has(order.id)}));
const order = n => ({id:'order-' + n,version:'v1',totalPrice:10});
const pageTwo = [order(11),order(12)];
const pageOne = Array.from({length:10},(_,index) => order(index+1));
let boxes = [];
const context = {
  document:{getElementById:element,querySelector:()=>null,querySelectorAll:()=>boxes},
  selectedOrderIds:new Set(),selectedOrderRecords_:new Map(),currentPage:2,rowsPerPage:10,currentSort:{field:'dateReq',dir:'desc'},
  currentUser:finance,globalData:{orders:pageTwo,paging:{page:2}},lastConfigurationVersion:'1',
  updateCreateRecoveryNotice_(){},buildDerivedData_(){},derivedData:{suppliers:[]},setupDropdowns(){},
  captureDraftRouting_:()=>null,restoreDraftRouting_(){},startAutoRefreshIfNeeded_(){},openApprovalDeepLink_(){},
  setRowsPerPagePreference_(){},getStoredRowsPerPage_:()=>10,canDo:()=>true,showMsg(){},
  parseOrderMoney:Number,formatCurrency:value=>'£'+Number(value).toFixed(2),
  renderApp(){
    boxes = context.currentUser.capabilities.canBulkUpdateOrders ? renderRows(context.globalData.orders) : [];
    context.updateBulkSelectionHeader_();
    context.updateBulkBar();
  }
};
vm.createContext(context);
vm.runInContext(source('function bulkPageCheckboxes_()', 'function formatCompactExpectedDate_('),context);
vm.runInContext(source('function captureUiState_()', 'function hasOrderDraft_()'),context);
vm.runInContext(source('function bulkAccessScope_(', 'let lastSuccessfulRefresh_'),context);
element('bulkActionBar').classes.add('d-none');
boxes = renderRows(pageTwo);
context.toggleSelectAll(true);
assert.equal(element('bulkCount').innerText,2);
assert.equal(element('bulkPredictedCost').innerText,'£20.00');
assert(boxes.every(box => box.checked));

const serializedFinance = {...finance,depts:['Science','Finance'],capabilities:{canViewAllFinanceData:true,canBulkUpdateOrders:true}};
assert.notEqual(JSON.stringify(finance.capabilities),JSON.stringify(serializedFinance.capabilities));
context.applyDashboardData_({orders:pageOne,user:serializedFinance,paging:{page:1},meta:{configurationVersion:'1'}},{pageOnly:true,preserveState:true});
assert.equal(element('bulkCount').innerText,2,'A server page transition must retain both selected records');
assert.equal(element('bulkPageSelection').textContent,' · 0 on this page, 2 elsewhere');
assert(!element('bulkActionBar').classes.has('d-none'));
assert(!element('selectAllBox').checked);
context.toggleSelectAll(true);
assert.equal(element('bulkCount').innerText,12);
assert.equal(element('bulkReviewBtn').innerText,'Review 12 selected records');
assert.equal(element('bulkPageSelection').textContent,' · 10 on this page, 2 elsewhere');

context.applyDashboardData_({orders:pageTwo,user:finance,paging:{page:2},meta:{configurationVersion:'1'}},{pageOnly:true,preserveState:true});
assert(boxes.every(box => box.checked));
context.toggleSelectAll(false);
assert.equal(element('bulkCount').innerText,10,'Clearing the page checkbox leaves selection elsewhere');
context.clearBulkSelection_();
assert.equal(element('bulkCount').innerText,0);
assert.equal(context.selectedOrderRecords_.size,0);
assert(element('bulkActionBar').classes.has('d-none'));

context.toggleSelectAll(true);
context.applyDashboardData_({
  orders:pageOne,user:{...finance,capabilities:{...finance.capabilities,canBulkUpdateOrders:false}},paging:{page:1},meta:{configurationVersion:'2'}
},{pageOnly:true,preserveState:true});
assert.equal(context.selectedOrderIds.size,0,'A genuine permission change clears the selection');
assert.equal(context.selectedOrderRecords_.size,0);
console.log('Bulk selection passed: page transition, serialized key order, cross-page count, page-only deselection, Clear selection, and permission revocation.');
