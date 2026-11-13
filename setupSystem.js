function setupSystem_() {
  const ss = getPortalSpreadsheet_();
  // Installation is editor-only and must never reset an existing installation.
  if (!isDevelopmentRuntime_()) throw new Error('Setup is disabled outside isolated development.');
  ['Orders', 'Budgets', 'Users', 'Configuration Audit'].forEach(name => {
    const existing = ss.getSheetByName(name);
    if (existing && existing.getLastRow() > 0) throw new Error('Setup stopped: existing data must be preserved.');
  });
  
  // 1. Create specific tabs
  createSheetIfNeeded_(ss, "Orders");
  createSheetIfNeeded_(ss, "Budgets");
  createSheetIfNeeded_(ss, "Users");
  
  // --- SETUP ORDERS TAB (New Column Structure) ---
  const ordersSheet = ss.getSheetByName("Orders");
  ordersSheet.clear(); 
  
  // Exact Columns requested + System ID/Dept columns
  const orderHeaders = [
    // SYSTEM COLUMNS (Hidden/Auto)
    "ID", "Department", 
    // DEPT HEAD INPUTS
    "Date of request", "Requester", "Supplier", "Website link", 
    "Description", "Product code", "Quantity", "Unit Price", 
    "Total Price (Est)", "Delivery location", "Date required by",
    // FINANCE INPUTS
    "Date ordered", "Expected delivery date", "Updated total price", 
    "Budget left to spend", "Comments",
    // SYSTEM METADATA
    "Invoice Number", "Attachment URL", "Record Type", "GL Code",
    "Processed By", "Approval Status", "Approval Revision", "Approved By", "Approved At", "Submitted By", "Payment Method"
  ];
  
  ordersSheet.getRange(1, 1, 1, orderHeaders.length).setValues([orderHeaders]);
  
  // Formatting
  ordersSheet.getRange(1, 1, 1, orderHeaders.length)
    .setFontWeight("bold")
    .setBackground("#d9ead3")
    .setBorder(true, true, true, true, true, true);
  ordersSheet.setFrozenRows(1);
  
  // Helper to highlight Finance section
  ordersSheet.getRange(1, 14, 1, 6).setBackground("#fff2cc"); // Yellow for Finance columns
  ordersSheet.getRange(1, 21, 1, 1).setBackground("#f4cccc"); // Hidden Record Type column
  ordersSheet.getRange(1, 22, 1, 1).setBackground("#d9ead3"); // GL Code snapshot column
  ordersSheet.hideColumns(21);
  ordersSheet.hideColumns(23, 5);

  // --- SETUP BUDGETS TAB ---
  const budgetSheet = ss.getSheetByName("Budgets");
  budgetSheet.clear();
  const budgetHeaders = ["Department", "TotalAllocation", "Spent", "Remaining", "GL Code", "Active"];
  budgetSheet.getRange(1, 1, 1, budgetHeaders.length).setValues([budgetHeaders]);
  budgetSheet.getRange(1, 1, 1, budgetHeaders.length).setFontWeight("bold").setBackground("#cfe2f3");
  
  // Add Formulas (Updated to look at Column P for Final Price, or K for Est Price)
  // Logic: Sum "Updated total price" (Col 16/P). If empty, use "Total Price Est" (Col 11/K)
  const budgetData = [
    ["Science", 10000, "=SUMPRODUCT((Orders!B:B=A2) * (IF(Orders!P:P<>\"\", Orders!P:P, Orders!K:K)))", "=B2-C2", "", true],
    ["IT", 15000, "=SUMPRODUCT((Orders!B:B=A3) * (IF(Orders!P:P<>\"\", Orders!P:P, Orders!K:K)))", "=B3-C3", "", true],
    ["English", 5000, "=SUMPRODUCT((Orders!B:B=A4) * (IF(Orders!P:P<>\"\", Orders!P:P, Orders!K:K)))", "=B4-C4", "", true]
  ];
  budgetSheet.getRange(2, 1, 3, budgetHeaders.length).setValues(budgetData);

  // --- SETUP USERS TAB ---
  const userSheet = ss.getSheetByName("Users");
  userSheet.clear();
  const userHeaders = ["Email", "Department", "Role", "Default Site", "Simulation Email", "Active", "Can Process Orders", "Can Log Invoices"];
  userSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
  // Add you as Admin
  userSheet.getRange(2, 1, 1, userHeaders.length)
    .setValues([[Session.getActiveUser().getEmail(), "IT", "Admin", "Senior", "", true, false, false]]);

  const auditSheet = createSheetIfNeeded_(ss, "Configuration Audit");
  auditSheet.clear();
  const auditHeaders = ["Timestamp", "Actor Email", "Action", "Target", "Details"];
  auditSheet.getRange(1, 1, 1, auditHeaders.length).setValues([auditHeaders]);
  auditSheet.getRange(1, 1, 1, auditHeaders.length).setFontWeight("bold").setBackground("#fce5cd");

  SpreadsheetApp.getUi().alert("System Updated! \nNew columns added for Supplier, Qty, Codes, etc.");
}

function createSheetIfNeeded_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}
