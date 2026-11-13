const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "Index.html"), "utf8").replace(/\r\n/g, "\n");
const serverSource = fs.readFileSync(path.join(root, "Code.js"), "utf8").replace(/\r\n/g, "\n");
const mockSource = fs.readFileSync(path.join(root, "local-mock.js"), "utf8").replace(/\r\n/g, "\n");

assert.ok(
  indexHtml.includes('id="btnTabNew" onclick="prepareNewOrderForm()"'),
  "New Request must explicitly reset the order form before it opens"
);
assert.ok(
  indexHtml.includes('id="formFile" multiple') &&
  indexHtml.includes('onchange="queueOrderAttachments(this)"'),
  "The order form must support an explicit per-order attachment queue"
);
assert.ok(indexHtml.includes('id="existingOrderAttachmentList"'));
assert.ok(indexHtml.includes('id="pendingOrderAttachmentList"'));
assert.ok(indexHtml.includes("function resetOrderAttachmentState_()"));
assert.ok(indexHtml.includes("function resetOrderForm_()"));
assert.ok(indexHtml.includes("newOrderTabButton.addEventListener('show.bs.tab'"));
assert.ok(indexHtml.includes("removedAttachments: Array.from(removedOrderAttachments)"));
assert.ok(indexHtml.includes("files: fileObjs"));

assert.ok(
  serverSource.includes("sheet.getRange(row, 2).setValue(deptToLog);"),
  "Editing an order must persist its department"
);
assert.ok(
  serverSource.includes("sheet.getRange(row, orderColumns.glCodeColumn).setValue(orderGlCode);"),
  "Editing an order department must refresh the stored GL code"
);
assert.ok(
  serverSource.includes("sheet.getRange(row, 20).setValue(finalAttachmentString);"),
  "Editing an order must persist attachment additions and removals"
);
assert.ok(
  serverSource.includes("if (currentAttachmentMap[normalized]) removalMap[normalized] = true;"),
  "The server must only remove attachment URLs already stored on that order"
);
assert.ok(
  serverSource.includes('if (!orderFound) throw new Error("This order could not be found.'),
  "An edit must not report success when the order row is missing"
);

assert.ok(
  mockSource.includes("existingOrder.dept = orderObj.selectedDept;"),
  "The local mock must persist department edits for browser testing"
);
assert.ok(
  mockSource.includes("existingOrder.attachment = keptAttachments.concat(mockNewAttachments).join"),
  "The local mock must persist attachment changes for browser testing"
);

assert.ok(indexHtml.includes('id="finAttachments" multiple'), "Manage must allow authorised users to add attachments retrospectively");
assert.ok(indexHtml.includes('onclick="saveFinance(true)"'), "Manage must offer an attachment-only save that does not process the invoice");
assert.ok(indexHtml.includes("evidence,attachmentOnly === true"), "Manage must send newly selected attachments and the save mode to the server");
assert.ok(serverSource.includes("existingAttachmentUrls.concat(newAttachmentUrls).join"), "Manage must retain existing attachments when adding new ones");
assert.ok(serverSource.includes("if (!saved && uploadedFileIds.length) trashUploadedFiles_(uploadedFileIds);"), "Failed Manage updates must clean up uploaded files");
assert.ok(serverSource.includes("if (!attachmentOnly && !wasCompleted && !invoiceCorrection)"), "Attachment-only saves must not change pending status");

console.log("Order edit and attachment tests passed.");
