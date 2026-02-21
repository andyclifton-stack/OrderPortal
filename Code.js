/**
 * CLAREMONT PURCHASING PORTAL - SERVER V26 (Fixed Dark Mode + LockService)
 */

function doGet(e) {
  if (e.parameter && e.parameter.page === 'dashboard') {
    const template = HtmlService.createTemplateFromFile('dashboard');
    template.appUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
      .setTitle('Claremont Order Portal - Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  const template = HtmlService.createTemplateFromFile('Index');
  template.appUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle('Claremont Order Portal')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// --- UTILS & CONFIG ---
function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Config");
  if (!sheet) return { financeEmail: "it@claremontschool.co.uk", senderAlias: "service.orders@claremontschool.co.uk" };
  const email = sheet.getRange("B2").getValue();
  let alias = sheet.getRange("B3").getValue(); // Send-As Alias
  if (!alias || alias.toString().trim() === "") alias = "service.orders@claremontschool.co.uk";
  return { financeEmail: email, senderAlias: alias };
}

function logError(e, context) {
  console.error("Error in " + context + ": " + e.toString());
  try {
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: "🚨 Portal Error: " + context,
      body: "Error Details:\n" + e.stack
    });
  } catch (err) { console.log("Failed to email error"); }
}

function sendEmailAlert(to, subject, body, options) {
  try {
    const emailData = {
      to: to,
      subject: "📦 Purchasing Alert: " + subject,
      htmlBody: `<div style="font-family:sans-serif; color:#333;">
                   <div style="background:#fff3cd; color:#856404; padding:10px; text-align:center; font-size:12px; border-bottom:1px solid #ffeeba;">
                     <strong>⚠️ DO NOT REPLY TO THIS EMAIL</strong><br>
                     Please add any messages or notes directly in the <a href="https://orders.gbclm.co.uk" style="color:#856404;">Purchasing Portal</a>.
                   </div>
                   <h3 style="color:#283583; margin-top:15px;">Claremont Purchasing Portal</h3>
                   ${body}
                   <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">
                   <small><a href="https://orders.gbclm.co.uk" style="color:#283583; text-decoration:none;">Open Portal</a></small>
                 </div>`
    };

    // Force Reply-To to noreply to discourage email responses
    emailData.replyTo = "noreply@claremontschool.co.uk";

    // Force Sender Name to be professional
    emailData.name = "Claremont Order Portal";

    // MailApp often ignores 'from' aliases, so we rely on the Reply-To and Banner
    MailApp.sendEmail(emailData);
  } catch (e) { logError(e, "sendEmailAlert"); }
}

function uploadFileToDrive(data, filename, type) {
  try {
    const parentFolder = DriveApp.getRootFolder();
    const folders = parentFolder.getFoldersByName("Order Attachments");
    let folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = parentFolder.createFolder("Order Attachments");
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(data), type, filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    logError(e, "uploadFileToDrive");
    return "";
  }
}

// --- USER CONTEXT ---
function getUserContext() {
  const realEmail = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const data = userSheet.getDataRange().getValues();

  let user = {
    email: realEmail, dept: "Unknown", depts: [], role: "None",
    realRole: "None", defaultSite: "", isSimulated: false
  };
  let simulationEmail = "";

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase() === realEmail.toLowerCase()) {
      const rawDept = data[i][1].toString();
      user.depts = rawDept.split(',').map(d => d.trim());
      user.dept = user.depts[0];
      user.role = data[i][2];
      user.defaultSite = data[i][3];
      user.realRole = data[i][2];
      if (data[i].length > 4) simulationEmail = data[i][4];
      break;
    }
  }

  if (user.realRole === "Admin" && simulationEmail) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === simulationEmail.toLowerCase()) {
        user.email = simulationEmail;
        const rawDept = data[i][1].toString();
        user.depts = rawDept.split(',').map(d => d.trim());
        user.dept = user.depts[0];
        user.role = data[i][2];
        user.defaultSite = data[i][3];
        user.isSimulated = true;
        break;
      }
    }
  }
  return user;
}

// --- SIMULATION TARGETS ---
function getSimulationTargets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const data = userSheet.getDataRange().getValues();
  const targets = [];
  const currentUserEmail = Session.getActiveUser().getEmail().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const email = data[i][0] ? data[i][0].toString() : "";
    const role = data[i][2] ? data[i][2].toString() : "";
    if (email && email.toLowerCase() !== currentUserEmail && role === 'Staff') {
      targets.push(email);
    }
  }
  return targets;
}

function setSimulation(targetEmail) {
  const realEmail = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const data = userSheet.getDataRange().getValues();

  let isAdmin = false;
  let adminRowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === realEmail.toLowerCase()) {
      if (data[i][2] === "Admin") {
        isAdmin = true;
        adminRowIndex = i + 1;
      }
      break;
    }
  }

  if (!isAdmin) throw new Error("Unauthorized");
  userSheet.getRange(adminRowIndex, 5).setValue(targetEmail || "");
  return "Success";
}

// --- DATA FETCHING ---
function getDashboardData() {
  try {
    const user = getUserContext();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const cache = CacheService.getScriptCache();
    let cachedBudgets = cache.get("budgets_data");
    let budgets = {};

    if (cachedBudgets) {
      budgets = JSON.parse(cachedBudgets);
    } else {
      const budgetSheet = ss.getSheetByName("Budgets");
      if (budgetSheet) {
        const bData = budgetSheet.getDataRange().getValues();
        for (let i = 1; i < bData.length; i++) {
          if (bData[i][0]) {
            budgets[bData[i][0]] = {
              total: Number(bData[i][1]) || 0,
              spent: Number(bData[i][2]) || 0,
              remaining: Number(bData[i][3]) || 0
            };
          }
        }
        cache.put("budgets_data", JSON.stringify(budgets), 600);
      }
    }

    const orderSheet = ss.getSheetByName("Orders");
    const visibleOrders = [];
    if (orderSheet) {
      const lastRow = orderSheet.getLastRow();
      if (lastRow > 1) {
        const allOrders = orderSheet.getRange(2, 1, lastRow - 1, 20).getValues();

        const parseUKDate = (d) => {
          if (!d) return "";
          if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
          return d.toString();
        };

        for (let i = 0; i < allOrders.length; i++) {
          const row = allOrders[i];
          if (!row[0] && !row[2]) continue;

          // Access Logic: Admin OR User's Department matches Order's Department
          const hasAccess = (user.role === "Admin") || (user.depts.includes(row[1]));

          if (hasAccess) {
            visibleOrders.push({
              id: row[0],
              dept: row[1],
              dateReq: parseUKDate(row[2]),
              requester: row[3],
              supplier: row[4],
              link: row[5],
              desc: row[6],
              code: row[7],
              qty: row[8],
              unitPrice: row[9],
              totalPrice: row[10],
              location: row[11],
              dateNeeded: parseUKDate(row[12]),
              dateOrdered: parseUKDate(row[13]),
              expectedDate: parseUKDate(row[14]),
              finalPrice: row[15],
              notes: row[17] || "",
              category: row[18] || "",
              attachment: row[19] || "",
              status: (row[15] || row[13] || row[14]) ? "Ordered" : "Pending"
            });
          }
        }
      }
    }

    visibleOrders.reverse();
    return JSON.stringify({ success: true, user: user, orders: visibleOrders, budgets: budgets });

  } catch (e) {
    logError(e, "getDashboardData");
    return JSON.stringify({ success: false, error: e.toString() });
  }
}

// --- EMAIL HELPERS ---
function extractOrderData(row) {
  const formatDate = (d) => {
    if (!d) return "";
    try {
      return (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy") : d.toString();
    } catch (e) { return d; }
  };

  return {
    id: row[0],
    dept: row[1],
    date: formatDate(row[2]),
    requester: row[3],
    supplier: row[4],
    link: row[5],
    desc: row[6],
    code: row[7],
    qty: row[8],
    unitPrice: row[9],
    totalPrice: row[10],
    location: row[11],
    dateNeeded: formatDate(row[12]),
    finalPrice: row[15],
    status: (row[15] || row[13] || row[14]) ? "Ordered" : "Pending",
    notes: row[17],
    category: row[18],
    attachment: row[19]
  };
}


function formatEmailBody(title, introMsg, order) {
  const styleTh = 'text-align:left; padding:8px; border-bottom:1px solid #ddd; color:#666; font-size:12px; width:30%;';
  const styleTd = 'text-align:left; padding:8px; border-bottom:1px solid #eee; color:#333; font-weight:bold;';

  const displayCost = (order.finalPrice !== "" && order.finalPrice != null) ? order.finalPrice : order.totalPrice;
  const safeLink = (order.link && order.link.length > 3) ? `<a href="${order.link}">Open Link</a>` : '-';
  const safeAtt = (order.attachment && order.attachment.length > 3) ? `<a href="${order.attachment}">View File</a>` : '-';

  return `
    <h3 style="margin-top:0;">${title}</h3>
    <p style="font-size:14px; margin-bottom:20px;">${introMsg}</p>
    
    <table style="width:100%; border-collapse:collapse; background:#fff; border:1px solid #eee;">
      <tr><th style="${styleTh}">Order ID</th><td style="${styleTd}">${order.id}</td></tr>
      <tr><th style="${styleTh}">Status</th><td style="${styleTd}">${order.status}</td></tr>
      <tr><th style="${styleTh}">Item</th><td style="${styleTd}">${order.desc}</td></tr>
      <tr><th style="${styleTh}">Cost</th><td style="${styleTd}">£${displayCost}</td></tr>
      <tr><th style="${styleTh}">Supplier</th><td style="${styleTd}">${order.supplier}</td></tr>
      <tr><th style="${styleTh}">Department</th><td style="${styleTd}">${order.dept}</td></tr>
      <tr><th style="${styleTh}">Requester</th><td style="${styleTd}">${order.requester.split('@')[0]}</td></tr>
      <tr><th style="${styleTh}">Request Date</th><td style="${styleTd}">${order.date}</td></tr>
      <tr><th style="${styleTh}">Needed By</th><td style="${styleTd}">${order.dateNeeded}</td></tr>
      <tr><th style="${styleTh}">Link</th><td style="${styleTd}">${safeLink}</td></tr>
      <tr><th style="${styleTh}">Attachment</th><td style="${styleTd}">${safeAtt}</td></tr>
    </table>

    ${order.notes ? `<div style="margin-top:20px; background:#f9f9f9; padding:10px; border-left:4px solid #283583; font-size:13px;"><strong>Notes History:</strong><br>${order.notes.replace(/\n/g, "<br>")}</div>` : ''}
  `;
}

// --- SUBMIT ORDER (WITH LOCKSERVICE) ---
function submitOrder(form) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    return "Error: System busy. Please try again.";
  }

  try {
    const user = getUserContext();
    const config = getConfig();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Orders");
    const sanitize = (str) => str ? str.toString().replace(/[<>]/g, "") : "";

    let id = form.id || Math.floor(Math.random() * 900000) + 100000;
    let isEdit = !!form.id;

    let deptToLog = form.selectedDept;
    if (user.role !== "Admin" && !user.depts.includes(deptToLog)) deptToLog = user.depts[0];

    let isOverBudget = false;
    let remainingBudget = 0;
    const cache = CacheService.getScriptCache();
    let cachedBudgets = cache.get("budgets_data");

    if (cachedBudgets) {
      const bObj = JSON.parse(cachedBudgets);
      if (bObj[deptToLog]) remainingBudget = bObj[deptToLog].remaining;
    } else {
      const bSheet = ss.getSheetByName("Budgets");
      const bData = bSheet.getDataRange().getValues();
      for (let i = 1; i < bData.length; i++) { if (bData[i][0] === deptToLog) { remainingBudget = bData[i][3]; break; } }
    }
    if (parseFloat(form.totalPrice) > remainingBudget) isOverBudget = true;

    let attachmentUrl = "";
    if (form.fileData && form.fileName) {
      attachmentUrl = uploadFileToDrive(form.fileData, form.fileName, form.mimeType);
    }

    let initialNote = "";
    if (form.userNote && form.userNote.trim() !== "") {
      const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
      const senderName = user.email.split('@')[0];
      initialNote = `[${timestamp} ${senderName}]: ${sanitize(form.userNote)}\n`;
    }

    if (isEdit) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString() == id.toString()) {
          const row = i + 1;
          const orderDept = data[i][1];
          const hasAccess = user.depts.includes(orderDept);
          const isAdmin = user.role === "Admin" || user.realRole === "Admin";

          if (!isAdmin) return "Unauthorized: Requesters cannot edit submitted orders.";

          sheet.getRange(row, 5).setValue(sanitize(form.supplier));
          sheet.getRange(row, 6).setValue(sanitize(form.link));
          sheet.getRange(row, 7).setValue(sanitize(form.desc));
          sheet.getRange(row, 8).setValue(sanitize(form.code));
          sheet.getRange(row, 9).setValue(form.qty);
          sheet.getRange(row, 10).setValue(form.unitPrice);
          sheet.getRange(row, 11).setValue(form.totalPrice);
          sheet.getRange(row, 12).setValue(form.location);
          sheet.getRange(row, 13).setValue(form.dateNeeded);
          if (attachmentUrl) sheet.getRange(row, 20).setValue(attachmentUrl);
          if (initialNote) {
            const currentNotes = sheet.getRange(row, 18).getValue();
            sheet.getRange(row, 18).setValue(currentNotes + initialNote);
          }
          break;
        }
      }
    } else {
      sheet.appendRow([
        id, deptToLog, new Date(), user.email,
        sanitize(form.supplier), sanitize(form.link), sanitize(form.desc), sanitize(form.code),
        form.qty, form.unitPrice, form.totalPrice,
        form.location, form.dateNeeded,
        "", "", "", "", initialNote,
        "", attachmentUrl
      ]);
    }

    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove("budgets_data");

    // --- CONSTRUCT EMAIL FROM FORM DATA ---
    // We mock the 'order' object structure expected by formatEmailBody
    const orderObj = {
      id: id,
      dept: deptToLog,
      date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy"),
      requester: user.email,
      supplier: sanitize(form.supplier),
      link: sanitize(form.link),
      desc: sanitize(form.desc),
      totalPrice: form.totalPrice,
      finalPrice: "",
      status: "Pending",
      notes: initialNote,
      dateNeeded: form.dateNeeded,
      attachment: attachmentUrl
    };

    const subject = (isOverBudget ? "[OVER BUDGET] " : "") + "Order Request: " + sanitize(form.desc);
    const bodyArgs = isOverBudget ? "<strong style='color:red;'>⚠️ OVER BUDGET WARNING</strong><br>A new order request has been submitted." : "A new order request has been submitted.";

    sendEmailAlert(config.financeEmail, subject, formatEmailBody("New Order Request", bodyArgs, orderObj), {
      replyTo: user.email,
      name: user.email.split('@')[0] + " (via Portal)"
    });

    return "Success";
  } catch (e) {
    logError(e, "submitOrder");
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function logInvoice(form) {
  try {
    const user = getUserContext();
    if (user.role !== "Admin" && !user.isSimulated) return "Unauthorized";

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Orders");
    const sanitize = (str) => str ? str.toString().replace(/[<>]/g, "") : "";

    const id = Math.floor(Math.random() * 900000) + 100000;
    const now = new Date();

    let attachmentUrls = [];
    if (form.files && form.files.length > 0) {
      form.files.forEach(f => {
        let url = uploadFileToDrive(f.data, f.name, f.type);
        if (url) attachmentUrls.push(url);
      });
    }
    const finalAttachmentString = attachmentUrls.join(", ");

    sheet.appendRow([
      id, form.dept, now, "Finance (Direct)", sanitize(form.supplier), "", sanitize(form.desc), form.invoiceRef || "",
      1, form.cost, form.cost, "Finance", now, now, "", form.cost, "Ordered", "", "", finalAttachmentString
    ]);

    CacheService.getScriptCache().remove("budgets_data");
    return "Invoice Logged";
  } catch (e) {
    logError(e, "logInvoice");
    throw e;
  }
}

function bulkUpdateOrders(ids, deliveryDate) {
  try {
    const user = getUserContext();
    if (user.role !== "Admin" && !user.isSimulated) return "Unauthorized";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Orders");
    const data = sheet.getDataRange().getValues();
    const now = new Date();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      if (ids.includes(data[i][0].toString())) {
        const row = i + 1;
        if (!data[i][13] && !data[i][15]) {
          sheet.getRange(row, 14).setValue(now);
          if (deliveryDate) sheet.getRange(row, 15).setValue(deliveryDate);
          count++;
        }
      }
    }
    CacheService.getScriptCache().remove("budgets_data");
    return `Updated ${count} orders.`;
  } catch (e) { logError(e, "bulkUpdate"); throw e; }
}

function updateOrder(id, deliveryDate, finalPrice, message, category) {
  try {
    const user = getUserContext();
    if (user.role !== "Admin" && !user.isSimulated) return "Unauthorized";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Orders");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() == id.toString()) {
        const row = i + 1;
        sheet.getRange(row, 14).setValue(new Date());
        if (deliveryDate) sheet.getRange(row, 15).setValue(deliveryDate);
        if (finalPrice !== "") sheet.getRange(row, 16).setValue(finalPrice);
        if (category) sheet.getRange(row, 19).setValue(category);

        let newNoteStr = "";
        if (message && message.trim() !== "") {
          const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
          newNoteStr = `[${timestamp} Finance]: ${message}\n`;
          const currentNotes = sheet.getRange(row, 18).getValue();
          sheet.getRange(row, 18).setValue(currentNotes + newNoteStr);
          // Refetch for email
          data[i][17] = currentNotes + newNoteStr;
        }

        // Update local data to reflect changes for the email
        if (finalPrice !== "") data[i][15] = finalPrice;

        CacheService.getScriptCache().remove("budgets_data");
        const requester = data[i][3];
        if (!requester.includes("Finance (Direct)")) {
          const orderObj = extractOrderData(data[i]);
          const emailMsg = message ? `The status of your order has been updated.<br><strong>Message from Finance:</strong> "${message}"` : "The status of your order has been updated.";
          sendEmailAlert(requester, "Order Update: " + orderObj.desc, formatEmailBody("Order Updated", emailMsg, orderObj));
        }
        return "Updated";
      }
    }
    return "Order Not Found";
  } catch (e) { logError(e, "updateOrder"); throw e; }
}

function userCancelOrder(id, reason) {
  const user = getUserContext();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() == id.toString()) {
      const orderDept = data[i][1];
      const hasAccess = user.depts.includes(orderDept);
      const isAdmin = user.realRole === "Admin" || user.role === "Admin";

      if (!isAdmin && !hasAccess) return "Error: Unauthorized";

      sheet.getRange(i + 1, 7).setValue("CANCELLED - " + data[i][6]);
      sheet.getRange(i + 1, 16).setValue(0);

      if (reason) {
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
        const cancelNote = `[${timestamp} ${user.email.split('@')[0]}]: Cancelled. Reason: ${reason}\n`;
        const currentNotes = sheet.getRange(i + 1, 18).getValue();
        sheet.getRange(i + 1, 18).setValue(currentNotes + cancelNote);
      }

      SpreadsheetApp.flush();
      CacheService.getScriptCache().remove("budgets_data");
      return "Success";
    }
  }
  return "Error: Order not found";
}

function addNote(id, noteText) {
  const user = getUserContext();
  const config = getConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Orders");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString() == id.toString()) {
      const row = i + 1;
      const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
      const senderName = (user.role === "Admin" && !user.isSimulated) ? "Finance" : user.email.split('@')[0];
      const newEntry = `[${timestamp} ${senderName}]: ${noteText}\n`;
      const currentNotes = sheet.getRange(row, 18).getValue();
      sheet.getRange(row, 18).setValue(currentNotes + newEntry);

      // Update local data for email
      data[i][17] = currentNotes + newEntry;

      const orderRequester = data[i][3].toString();
      const isRequester = user.email.toLowerCase() === orderRequester.toLowerCase();

      // If the person adding the note IS the requester, email Finance.
      // Otherwise (Finance/Admin adding note), email the requester.
      const target = isRequester ? config.financeEmail : orderRequester;

      if (!target.includes("Finance (Direct)")) {
        const orderObj = extractOrderData(data[i]);
        const msg = `New note added by <strong>${senderName}</strong>:<br>"${noteText}"`;
        sendEmailAlert(target, "New Note: " + orderObj.desc, formatEmailBody("New Note Added", msg, orderObj));
      }
      return "Note Added";
    }
  }
}

function reportMissingBudget(deptName) {
  const user = getUserContext();
  const config = getConfig();
  sendEmailAlert(config.financeEmail, "Config Error", `User ${user.email} tried accessing dept "${deptName}" which has no budget set.`);
}