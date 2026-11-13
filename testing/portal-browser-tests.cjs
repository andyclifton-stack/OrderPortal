const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {createPreviewServer} = require('./error-ui-server.cjs');
const assets = require('./vendor/assets.json');
(async()=>{
  const server = createPreviewServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try { browser = await chromium.launch({headless:true}); }
  catch (error) { server.close(); throw error; }
  const output = path.join(__dirname,'../output/browser');
  fs.mkdirSync(output,{recursive:true});
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.route('**/*',async route=>{
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      const entry = Object.entries(assets).find(([,meta])=>url === meta.url);
      if (entry) return route.fulfill({path:path.join(__dirname,'vendor',entry[0]),contentType:entry[0].endsWith('.js')?'application/javascript':'text/css'});
      return route.abort();
    });
    await page.goto(base);
    await page.waitForFunction(()=>document.querySelector('#mainApp').style.display !== 'none');
    await page.waitForFunction(()=>document.querySelectorAll('#orderTable tbody tr').length>0);
    await page.evaluate(()=>{const order=globalData.orders.find(o=>o.recordType==='Order');if(order){order.totalPrice=1234567.89;order.finalPrice=1234568.89;order.status='Ordered';renderApp(true);}});
    for (const width of [320,390,768,769,1024,1366]) {
      await page.setViewportSize({width,height:1000});
      const dimensions = await page.evaluate(()=>{
        const cost = document.querySelector('#orderTable tbody tr .order-cost-column');
        return {cost:cost?.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert(!dimensions.overflow,`Page overflow at ${width}`);
      if (width<=768) assert(dimensions.cost>105,`Cost remains fixed width at ${width}`);
      const marker = page.locator('.cost-difference-value').first();
      assert(await marker.isVisible(),`Price-difference marker missing at ${width}`);
      const markerFits = await marker.evaluate(el => {
        const r=el.getBoundingClientRect(), cell=el.closest('td').getBoundingClientRect();
        const style=getComputedStyle(el);
        return style.textDecorationLine.includes('underline') && style.textDecorationStyle==='dotted' && r.width>0 && r.left>=cell.left && r.right<=cell.right+1 && r.right<=innerWidth;
      });
      assert(markerFits,`Price-difference marker clipped at ${width}`);
      await page.screenshot({path:path.join(output,`portal-${width}.png`),fullPage:true});
    }
    const unnamed = await page.evaluate(()=>Array.from(document.querySelectorAll('[id^="correction"],#transferAmount,#transferFromDept,#transferToDept'))
      .filter(el=>el.matches('input,select,textarea') && !el.labels?.length && !el.getAttribute('aria-label')).map(el=>el.id));
    assert.deepEqual(unnamed,[]);
    await page.evaluate(async()=>{await rememberCreate_('order','synthetic-recovery');orderSubmitBusy=false;updateCreateRecoveryNotice_();});
    assert.equal(await page.locator('#submitBtn').textContent(),'Check previous submission');
    await page.evaluate(()=>guardPendingCreate_('order'));
    await page.waitForFunction(()=>document.documentElement.dataset.mockStatusCalls==='1');
    await page.waitForFunction(()=>!pendingCreate_('order'));
    await page.evaluate(async()=>{await rememberCreate_('invoice','synthetic-invoice');invoiceSubmitBusy=false;resetInvoiceButtons();});
    assert.equal(await page.locator('#btnInvoiceSaveClose').textContent(),'Check previous submission');
    assert(await page.locator('#btnInvoiceAddAnother').isDisabled());
    await page.evaluate(()=>{window.portalRun={withSuccessHandler(){throw Error('Synthetic recovery failure');}};guardPendingCreate_('invoice');});
    assert.match(await page.locator('#msgBody').textContent(),/could not be checked/);
    assert.equal(await page.evaluate(()=>createRecoveryBusy_),false);
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#mainApp').style.display !== 'none');
    await page.evaluate(()=>{
      const original = pendingCreate_;
      pendingCreate_ = ()=>{throw Error('Storage blocked');};
      guardPendingCreate_('order');
      pendingCreate_ = original;
    });
    assert.match(await page.locator('#msgBody').textContent(),/browser storage/);
    // Drive a real form submission through its timeout and recovery entry points.
    await page.goto(base+'/?mockSubmit=timeout&mockSaveState=PENDING');
    await page.waitForFunction(()=>document.querySelector('#mainApp').style.display !== 'none');
    await page.locator('#btnTabNew').click();
    await page.locator('#formSupplier').fill('Synthetic timeout supplier');
    await page.locator('#formDesc').fill('Synthetic timeout recovery test');
    await page.locator('#formUnit').fill('1.23');
    await page.locator('#submitBtn').click();
    await page.waitForFunction(()=>document.querySelector('#submitBtn').textContent==='Check previous submission');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.mockSubmitCalls),'1');
    await page.locator('#msgModal [data-bs-dismiss]').click();
    await page.locator('#submitBtn').click();
    await page.waitForFunction(()=>document.documentElement.dataset.mockStatusCalls==='1');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.mockSubmitCalls),'1');
    assert(await page.evaluate(()=>!!pendingCreate_('order')));
    // Reload recovery must preserve new work and never turn a check into a save.
    for (const kind of ['order','invoice']) {
      for (const state of ['PENDING','DONE','CANCELLED']) {
        await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
        await page.goto(base+'/?mockSaveState='+state);
        await page.waitForFunction(()=>document.querySelector('#mainApp').style.display !== 'none');
        await page.evaluate(kind=>rememberCreate_(kind,'reload-'+kind),kind);
        await page.reload();
        await page.waitForFunction(()=>document.querySelector('#mainApp').style.display !== 'none');
        assert(await page.locator('#saveRecoveryNotice').isVisible());
        await page.locator(kind==='order' ? '#btnTabNew' : '#mainTabs [data-bs-target="#tabLogInvoice"]').click();
        const button=page.locator(kind==='order' ? '#submitBtn' : '#btnInvoiceSaveClose');
        assert.equal(await button.textContent(),'Check previous submission');
        if(kind==='invoice') assert(await page.locator('#btnInvoiceAddAnother').isDisabled());
        const description=page.locator(kind==='order' ? '#formDesc' : '#invDesc');
        await description.fill('New work after reload '+kind);
        if(kind==='invoice') await page.locator('#invFiles').setInputFiles({name:'new-invoice.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic attachment')});
        else await page.evaluate(()=>pendingOrderFiles.push(new File(['synthetic'],'new-order.txt',{type:'text/plain'})));
        await button.click();
        await page.waitForFunction(()=>document.documentElement.dataset.mockStatusCalls==='1');
        await page.waitForFunction(()=>!createRecoveryBusy_);
        await page.waitForFunction(()=>!refreshInFlight);
        assert.equal(await description.inputValue(),'New work after reload '+kind);
        assert.equal(await page.evaluate(()=>Number(document.documentElement.dataset.mockSubmitCalls||0)),0);
        assert.equal(await page.evaluate(()=>Number(document.documentElement.dataset.mockInvoiceCalls||0)),0);
        assert.equal(await page.evaluate(kind=>kind==='order'?pendingOrderFiles.length:document.querySelector('#invFiles').files.length,kind),1);
        if(state==='PENDING') {
          assert.equal(await button.textContent(),'Check previous submission');
          assert(await page.locator('#saveRecoveryNotice').isVisible());
        } else {
          assert.equal(await button.textContent(),kind==='order'?'Submit request':'Save & Close');
          assert.equal(await page.evaluate(kind=>!!pendingCreate_(kind),kind),false);
          assert(!(await page.locator('#saveRecoveryNotice').isVisible()));
          if(kind==='invoice') assert(await page.locator('#btnInvoiceAddAnother').isEnabled());
          if(state==='DONE') assert.match(await page.locator('#msgBody').textContent(),/current entries.*kept.*not been submitted/);
        }
      }
    }
    // Full real-submit timeout lifecycle, including the click AFTER recovery.
    for(const kind of ['order','invoice']) for(const variant of ['unchanged','changed','legacy','unavailable']) {
      await page.evaluate(()=>{resetOrderForm_();prepLogInvoiceTab(true);localStorage.clear();sessionStorage.clear();persistPortalDraft_();});
      await page.goto(base+'/?mockSubmit=timeout&mockSaveState=DONE');
      await page.waitForFunction(()=>portalDraftReady_ && !portalDraftRestoring_ && !refreshInFlight);
      const tab=kind==='order'?'#btnTabNew':'#mainTabs [data-bs-target="#tabLogInvoice"]';
      const desc=kind==='order'?'#formDesc':'#invDesc';
      const button=kind==='order'?'#submitBtn':'#btnInvoiceSaveClose';
      const counter=kind==='order'?'mockSubmitCalls':'mockInvoiceCalls';
      await page.locator(tab).click();
      await page.locator(kind==='order'?'#formSupplier':'#invSupplier').fill('Synthetic next-click supplier');
      await page.locator(desc).fill('Original next-click purchase');
      await page.locator(kind==='order'?'#formUnit':'#invCost').fill('1.23');
      if(kind==='invoice') {
        await page.locator('#invPaymentMethod').selectOption('Invoice / on account');
        await page.locator('#invReportingSite').selectOption('Senior');
      }
      if(variant==='unavailable') await page.evaluate(()=>{createFormFingerprint_=async()=>null;});
      await page.locator(button).click();
      await page.waitForFunction(counter=>document.documentElement.dataset[counter]==='1',counter);
      await page.waitForFunction(kind=>!(kind==='order'?orderSubmitBusy:invoiceSubmitBusy),kind);
      const pending=await page.evaluate(kind=>pendingCreate_(kind),kind);
      if(variant==='unavailable') assert.equal(pending.fingerprint,null);
      else assert.match(pending.fingerprint,/^sha256-v1:[a-f0-9]{64}$/);
      assert(!JSON.stringify(pending).includes('Original next-click purchase'),'Recovery storage contains hashes, not form text');
      if(variant==='legacy') await page.evaluate(kind=>{
        const record=pendingCreate_(kind);delete record.fingerprint;localStorage.setItem(createRecoveryKey_(kind),JSON.stringify(record));
      },kind);
      await page.evaluate(()=>persistPortalDraft_());
      await page.reload();
      await page.waitForFunction(()=>portalDraftReady_ && !portalDraftRestoring_ && !refreshInFlight);
      await page.locator(tab).click();
      assert.equal(await page.locator(desc).inputValue(),'Original next-click purchase','Original draft must actually be restored for this test');
      if(variant==='changed') await page.locator(desc).fill('Different new purchase');
      await page.locator(button).click();
      await page.waitForFunction(kind=>!pendingCreate_(kind) && !refreshInFlight && !createRecoveryBusy_,kind);
      assert.equal(await page.evaluate(counter=>Number(document.documentElement.dataset[counter]||0),counter),0);
      await page.locator('#msgModal [data-bs-dismiss]').click();
      if(variant==='unchanged') {
        assert.equal(await page.locator(desc).inputValue(),'');
        await page.locator(button).click();
        assert.equal(await page.evaluate(counter=>Number(document.documentElement.dataset[counter]||0),counter),0,'Next click on the cleared form must not resubmit');
      } else {
        assert.equal(await page.locator(desc).inputValue(),variant==='changed'?'Different new purchase':'Original next-click purchase');
        // A legacy/retained draft requires explicit consent, including after another reload.
        await page.evaluate(()=>persistPortalDraft_());
        await page.reload();
        await page.waitForFunction(()=>portalDraftReady_ && !portalDraftRestoring_ && !refreshInFlight);
        await page.locator(tab).click();
        await page.locator(button).click();
        await page.locator('#confirmModal').waitFor({state:'visible'});
        assert.match(await page.locator('#confirmModal').textContent(),/confirmed as saved.*separate new purchase/);
        assert.equal(await page.evaluate(counter=>Number(document.documentElement.dataset[counter]||0),counter),0);
        await page.locator('#confirmModal [data-bs-dismiss]').first().click();
        assert.equal(await page.evaluate(counter=>Number(document.documentElement.dataset[counter]||0),counter),0,'Cancel never submits');
        await page.locator(button).click();
        await page.locator('#confirmBtnAction').click();
        await page.waitForFunction(counter=>document.documentElement.dataset[counter]==='1',counter);
        await page.waitForFunction(kind=>!(kind==='order'?orderSubmitBusy:invoiceSubmitBusy),kind);
      }
    }
    // A known, unchanged form in this session can still be cleared on confirmation.
    for(const kind of ['order','invoice']) {
      await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
      await page.goto(base+'/?mockSaveState=DONE');
      await page.waitForFunction(()=>document.querySelector('#mainApp').style.display !== 'none');
      await page.evaluate(async kind=>{
        document.getElementById(kind==='order'?'formDesc':'invDesc').value='Original unchanged';
        await rememberCreate_(kind,'unchanged-'+kind);recoverPortalCreate_(kind);
      },kind);
      await page.waitForFunction(kind=>!pendingCreate_(kind),kind);
      assert.equal(await page.locator(kind==='order'?'#formDesc':'#invDesc').inputValue(),'');
    }
    await page.evaluate(()=>{
      currentUser.isPreview=true;updateCreateRecoveryNotice_();
    });
    for(const id of ['submitBtn','btnInvoiceSaveClose','btnInvoiceAddAnother']) assert(await page.locator('#'+id).isDisabled(),'Preview must remain read-only');
    await page.evaluate(()=>{
      currentUser.isPreview=false;orderSubmitBusy=true;invoiceSubmitBusy=true;
      for(const id of ['submitBtn','btnInvoiceSaveClose','btnInvoiceAddAnother']) {const b=document.getElementById(id);b.textContent='Saving...';b.disabled=true;}
      updateCreateRecoveryNotice_();
    });
    for(const id of ['submitBtn','btnInvoiceSaveClose','btnInvoiceAddAnother']) {
      assert(await page.locator('#'+id).isDisabled());
      assert.equal(await page.locator('#'+id).textContent(),'Saving...');
    }
    // SRI failures must take the existing component failure path.
    await page.route(base+'/',async route=>{
      const response = await route.fetch();
      const body = (await response.text()).replace(/integrity="sha384-[^"]+"/, 'integrity="sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"');
      await route.fulfill({response,body});
    });
    await page.goto(base);
    await page.locator('#errorBox').waitFor({state:'visible'});
    assert.match(await page.locator('#errorBox').textContent(),/component|load|reload/i);
    await page.unroute(base+'/');
    for (const name of ['configuration.html','dashboard.html']) {
      await page.goto(base+'/'+name);
      await page.waitForTimeout(1200);
      const errors = await page.locator('body').textContent();
      assert(!errors.includes('SyntaxError'));
      await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
    }
    for (const [name,asset,selector] of [
      ['configuration.html','bootstrap.bundle.min.js','#errorMessage'],
      ['dashboard.html','chart.umd.min.js','#chart-warning']
    ]) {
      await page.route(base+'/'+name,async route=>{
        const response=await route.fetch();
        const body=(await response.text()).replaceAll(assets[asset].integrity,'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        await route.fulfill({response,body});
      });
      await page.goto(base+'/'+name);
      await page.locator(selector).waitFor({state:'visible'});
      assert.match(await page.locator(selector).textContent(),/could not load|unavailable/i);
      await page.unroute(base+'/'+name);
    }
    await page.goto(base);
    await page.waitForFunction(()=>document.querySelector('#mainApp').style.display !== 'none');
    await page.route(assets['xlsx.full.min.js'].url,route=>route.fulfill({body:'/* altered asset */',contentType:'application/javascript'}));
    const exportError=await page.evaluate(()=>ensureXlsxLoaded_().then(()=>'',error=>error.message));
    assert.equal(exportError,'Failed to load export library.');
    await page.unroute(assets['xlsx.full.min.js'].url);
    assert.deepEqual(pageErrors,[],'Unexpected page errors');
    console.log('Browser layout, labels and order/invoice recovery checks passed.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
