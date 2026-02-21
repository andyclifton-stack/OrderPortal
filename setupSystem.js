function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Create specific tabs
  createSheetIfNeeded(ss, "Orders");
  createSheetIfNeeded(ss, "Budgets");
  createSheetIfNeeded(ss, "Users");
  
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
    "Budget left to spend", "Comments"
  ];
  
  ordersSheet.getRange(1, 1, 1, orderHeaders.length).setValues([orderHeaders]);
  
  // Formatting
  ordersSheet.getRange(1, 1, 1, orderHeaders.length)
    .setFontWeight("bold")
    .setBackground("#d9ead3")
    .setBorder(true, true, true, true, true, true);
  ordersSheet.setFrozenRows(1);
  
  // Helper to highlight Finance section
  ordersSheet.getRange(1, 14, 1, 5).setBackground("#fff2cc"); // Yellow for Finance columns

  // --- SETUP BUDGETS TAB ---
  const budgetSheet = ss.getSheetByName("Budgets");
  budgetSheet.clear();
  const budgetHeaders = ["Department", "TotalAllocation", "Spent", "Remaining"];
  budgetSheet.getRange(1, 1, 1, budgetHeaders.length).setValues([budgetHeaders]);
  budgetSheet.getRange(1, 1, 1, budgetHeaders.length).setFontWeight("bold").setBackground("#cfe2f3");
  
  // Add Formulas (Updated to look at Column P for Final Price, or K for Est Price)
  // Logic: Sum "Updated total price" (Col 16/P). If empty, use "Total Price Est" (Col 11/K)
  const budgetData = [
    ["Science", 10000, "=SUMPRODUCT((Orders!B:B=A2) * (IF(Orders!P:P<>\"\", Orders!P:P, Orders!K:K)))", "=B2-C2"],
    ["IT", 15000, "=SUMPRODUCT((Orders!B:B=A3) * (IF(Orders!P:P<>\"\", Orders!P:P, Orders!K:K)))", "=B3-C3"],
    ["English", 5000, "=SUMPRODUCT((Orders!B:B=A4) * (IF(Orders!P:P<>\"\", Orders!P:P, Orders!K:K)))", "=B4-C4"]
  ];
  budgetSheet.getRange(2, 1, 3, 4).setValues(budgetData);

  // --- SETUP USERS TAB ---
  const userSheet = ss.getSheetByName("Users");
  userSheet.clear();
  const userHeaders = ["Email", "Department", "Role"];
  userSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
  // Add you as Admin
  userSheet.getRange(2, 1, 1, 3).setValues([[Session.getActiveUser().getEmail(), "IT", "Admin"]]);

  SpreadsheetApp.getUi().alert("System Updated! \nNew columns added for Supplier, Qty, Codes, etc.");
}

function createSheetIfNeeded(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) ss.insertSheet(name);
}