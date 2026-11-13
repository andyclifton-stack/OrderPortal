/**
 * LOCAL MOCK FOR GOOGLE APPS SCRIPT
 * This file simulates the google.script.run environment.
 * It is only loaded when running locally (outside of Apps Script).
 */

const MOCK_ROLE_ADMIN = "Admin";
const MOCK_ROLE_STAFF = "Staff";
const MOCK_ROLE_WIPRO = "Wipro";
const MOCK_ROLE_HEAD = "Head";

function getMockDefaultDepartmentView(user, capabilities) {
    const departments = (user && user.depts || []).filter(department => department && String(department).trim().toLowerCase() !== "wipro");
    if (!departments.length) return "All";
    const normalizedDepartments = departments.map(department => String(department).trim().toLowerCase());
    const isFinanceUser = String(user && user.role || "").trim().toLowerCase() === "wipro" || normalizedDepartments.includes("finance");
    if (capabilities && capabilities.canUseAllDepartmentView && isFinanceUser) return "All";
    return departments[0];
}

function buildMockCapabilities(user) {
    const role = String(user.role || "").trim();
    const realRole = String(user.realRole || "").trim();
    const isSimulated = !!user.isSimulated;
    const isAdmin = role === MOCK_ROLE_ADMIN;
    const isStaff = role === MOCK_ROLE_STAFF;
    const isWipro = role === MOCK_ROLE_WIPRO;
    const isHead = role === MOCK_ROLE_HEAD;
    const isStaffLike = isStaff || isHead;
    const isFinanceOperator = isAdmin || isWipro;
    const hasOrderProcessingPermission = isStaffLike && !!user.canProcessOrders;
    const hasInvoiceLoggingPermission = isStaffLike && !!user.canLogInvoices;
    const isKnownRole = isAdmin || isStaff || isWipro || isHead;
    const isRealAdminLive = realRole === MOCK_ROLE_ADMIN && !isSimulated;

    return {
        isKnownRole,
        canViewAllFinanceData: isFinanceOperator,
        canViewAllOrderData: isFinanceOperator || hasOrderProcessingPermission,
        canViewDepartmentData: isStaffLike || isFinanceOperator,
        canUseAllDepartmentView: isFinanceOperator,
        canAccessFinanceDashboard: isFinanceOperator || isHead,
        canManageOrders: isFinanceOperator || hasOrderProcessingPermission,
        canEditExistingOrders: isFinanceOperator || hasOrderProcessingPermission,
        canBulkUpdateOrders: isFinanceOperator || hasOrderProcessingPermission,
        canLogInvoice: isFinanceOperator || hasInvoiceLoggingPermission,
        canApproveOrders: isAdmin || hasOrderProcessingPermission,
        hasExplicitOrderProcessingPermission: hasOrderProcessingPermission,
        hasExplicitInvoiceLoggingPermission: hasInvoiceLoggingPermission,
        canAddNotes: isKnownRole,
        canAddFinanceNotes: isFinanceOperator,
        canCreateRequests: isAdmin || isStaffLike,
        canDuplicateRequests: isAdmin || isStaffLike,
        canCancelOrders: isAdmin || isStaffLike,
        canExportCurrentView: isKnownRole,
        canExportFullReport: isRealAdminLive,
        canUseBudgetTransfer: isRealAdminLive,
        canOpenMasterSheet: isRealAdminLive,
        canManageConfiguration: isRealAdminLive,
        canUseSimulation: isRealAdminLive,
        canAutoRefreshFinance: isFinanceOperator && !isSimulated
    };
}

// Mock Data
const MOCK_USER = {
    email: "test.user@claremontschool.co.uk",
    dept: "IT",
    depts: ["IT", "Science"],
    role: "Admin", // Change to 'Staff' to test staff view
    realRole: "Admin",
    defaultSite: "Senior",
    isSimulated: false,
    canProcessOrders: false,
    canLogInvoices: false
};

function decorateMockOrders(user) {
    const capabilities = buildMockCapabilities(user);
    const actor = String(user.email || "").toLowerCase();
    return MOCK_ORDERS.map(order => {
        order.recordType = order.recordType || "Order";
        order.approvalStatus = order.approvalStatus || "NOT_REQUIRED";
        order.approvalRevision = Number(order.approvalRevision || 0);
        order.processedBy = order.processedBy || "";
        const pending = order.status === "Pending" && !String(order.desc || "").includes("CANCELLED");
        const canProcessRecord = order.recordType === "Order"
            ? (capabilities.canViewAllFinanceData || capabilities.hasExplicitOrderProcessingPermission)
            : capabilities.canViewAllFinanceData;
        const requester = String(order.requester || "").toLowerCase();
        const processor = String(order.processedBy || "").toLowerCase();
        const reviewOpen = ["AWAITING_SIGNOFF", "QUERY_RAISED"].includes(order.approvalStatus);
        order.actions = {
            canEdit: pending && order.recordType === "Order" && canProcessRecord,
            canProcess: pending && canProcessRecord,
            canCorrect: !pending && order.recordType === "Order" && canProcessRecord,
            canApprove: reviewOpen && capabilities.canApproveOrders && actor !== requester && actor !== processor,
            canRaiseQuery: reviewOpen && capabilities.canApproveOrders && actor !== requester && actor !== processor,
            canResubmit: order.approvalStatus === "QUERY_RAISED" && (actor === processor || user.realRole === "Admin")
        };
        return order;
    });
}

const MOCK_BUDGETS = {
    "IT": { total: 15000, spent: 5000, remaining: 10000, hasCalculationError: false, calculationError: "" },
    "Science": { total: 10000, spent: 2000, remaining: 8000, hasCalculationError: false, calculationError: "" },
    "Wipro": { total: 0, spent: 0, remaining: 0, hasCalculationError: false, calculationError: "" }
};

const MOCK_ORDERS = [
    {
        id: "10001",
        dept: "IT",
        dateReq: "28/01/2026",
        requester: "test.user@claremontschool.co.uk",
        supplier: "Amazon",
        link: "https://amazon.co.uk",
        desc: "HDMI Cables 2m",
        code: "B000001",
        qty: 5,
        unitPrice: 5.99,
        totalPrice: 29.95,
        location: "Senior",
        dateNeeded: "30/01/2026",
        dateOrdered: "29/01/2026",
        expectedDate: "",
        finalPrice: 29.95,
        invoiceNumber: "INV-10001",
        notes: "[28/01 10:00 Test]: Please order ASAP",
        status: "Ordered"
    },
    {
        id: "10002",
        dept: "Science",
        dateReq: "29/01/2026",
        requester: "science.teacher@claremontschool.co.uk",
        supplier: "Science Supplies Ltd",
        link: "",
        desc: "Bunsen Burner",
        code: "SCI-999",
        qty: 2,
        unitPrice: 15.00,
        totalPrice: 30.00,
        location: "Prep",
        dateNeeded: "05/02/2026",
        dateOrdered: "",
        expectedDate: "",
        finalPrice: 27.50,
        invoiceNumber: "",
        notes: "",
        attachment: "https://drive.google.com/file/d/mock-existing-attachment/view",
        status: "Pending"
    },
    {
        id: "10003",
        dept: "IT",
        dateReq: "20/01/2026",
        requester: "test.user@claremontschool.co.uk",
        supplier: "Dell",
        link: "",
        desc: "Latitude 5440 Laptop",
        code: "DELL-LAT-5440",
        qty: 1,
        unitPrice: 850.00,
        totalPrice: 850.00,
        location: "Senior",
        dateNeeded: "01/02/2026",
        dateOrdered: "21/01/2026",
        expectedDate: "",
        finalPrice: 850.00,
        notes: "",
        status: "Ordered"
    },
    {
        id: "10004",
        dept: "English",
        dateReq: "15/01/2026",
        requester: "english.hod@claremontschool.co.uk",
        supplier: "Amazon",
        link: "",
        desc: "Shakespeare Box Set",
        code: "B00ABC123",
        qty: 10,
        unitPrice: 25.00,
        totalPrice: 250.00,
        location: "Senior",
        dateNeeded: "01/02/2026",
        dateOrdered: "",
        expectedDate: "",
        finalPrice: "",
        notes: "",
        status: "Pending"
    },
    {
        id: "10005",
        dept: "IT",
        dateReq: "10/01/2026",
        requester: "test.user@claremontschool.co.uk",
        supplier: "Apple",
        link: "",
        desc: "iPad Air 64GB - CANCELLED",
        code: "IPAD-AIR",
        qty: 1,
        unitPrice: 599.00,
        totalPrice: 599.00,
        location: "Prep",
        dateNeeded: "15/01/2026",
        dateOrdered: "",
        expectedDate: "",
        finalPrice: "",
        notes: "Budget constraints",
        status: "Pending" // Cancelled status is derived from desc in the logic
    },
    {
        id: "10006",
        dept: "Science",
        dateReq: "03/02/2026",
        requester: "science.teacher@claremontschool.co.uk",
        supplier: "BetterEquipped",
        link: "",
        desc: "Glass Beakers 250ml (Pack of 10)",
        code: "BE-GLS-250",
        qty: 4,
        unitPrice: 22.50,
        totalPrice: 90.00,
        location: "Senior",
        dateNeeded: "10/02/2026",
        dateOrdered: "",
        expectedDate: "",
        finalPrice: "",
        notes: "",
        status: "Pending"
    },
    {
        id: "10007",
        dept: "IT",
        dateReq: "04/02/2026",
        requester: "test.user@claremontschool.co.uk",
        supplier: "Insight",
        link: "",
        desc: "Adobe Creative Cloud License Renewal",
        code: "ADOBE-CC-EDU",
        qty: 50,
        unitPrice: 120.00,
        totalPrice: 6000.00,
        location: "Senior",
        dateNeeded: "28/02/2026",
        dateOrdered: "",
        expectedDate: "",
        finalPrice: "",
        notes: "Annual renewal for Art dept machines",
        status: "Pending"
    },
    {
        id: "10008",
        dept: "Maths",
        dateReq: "01/02/2026",
        requester: "maths.hod@claremontschool.co.uk",
        supplier: "Amazon",
        link: "",
        desc: "Casio FX-83GTX Calculators (Class Set)",
        code: "B07L5",
        qty: 30,
        unitPrice: 12.99,
        totalPrice: 389.70,
        location: "Prep",
        dateNeeded: "20/02/2026",
        dateOrdered: "02/02/2026",
        expectedDate: "",
        finalPrice: 389.70,
        notes: "",
        status: "Ordered"
    },
    {
        id: "10009",
        dept: "Sports",
        dateReq: "25/01/2026",
        requester: "sports.admin@claremontschool.co.uk",
        supplier: "Decathlon",
        link: "",
        desc: "Football Bibs (Bibs - Red/Blue/Green)",
        code: "DEC-BIB-MIX",
        qty: 1,
        unitPrice: 45.00,
        totalPrice: 45.00,
        location: "Senior",
        dateNeeded: "01/02/2026",
        dateOrdered: "26/01/2026",
        expectedDate: "",
        finalPrice: 45.00,
        notes: "",
        status: "Ordered"
    },
    {
        id: "10010",
        dept: "Facilities",
        dateReq: "05/02/2026",
        requester: "caretaker@claremontschool.co.uk",
        supplier: "Screwfix",
        link: "",
        desc: "LED Light Bulbs GU10 (Box of 50)",
        code: "GU10-LED-50",
        qty: 2,
        unitPrice: 75.00,
        totalPrice: 150.00,
        location: "Prep",
        dateNeeded: "06/02/2026",
        dateOrdered: "",
        expectedDate: "",
        finalPrice: "",
        notes: "Urgent replacement needed for Hall",
        status: "Pending"
    },
    {
        id: "10011",
        dept: "Art",
        dateReq: "28/01/2026",
        requester: "art.teacher@claremontschool.co.uk",
        supplier: "Specialist Crafts",
        link: "",
        desc: "Acrylic Paint Set (Primary Colours)",
        code: "ACR-PAINT-PRI",
        qty: 10,
        unitPrice: 18.50,
        totalPrice: 185.00,
        location: "Senior",
        dateNeeded: "15/02/2026",
        dateOrdered: "",
        expectedDate: "",
        finalPrice: "",
        notes: "",
        status: "Pending"
    }
];

// Mock Implementation
if (typeof window !== 'undefined') {
    console.log("%c LOADED LOCAL MOCK ENVIRONMENT ", "background: #FAB600; color: #000; font-weight: bold; padding: 4px;");

    const MOCK_QUERY = new URLSearchParams(window.location.search);
    if (MOCK_QUERY.get("mockPortalRole")) {
        MOCK_USER.role = MOCK_QUERY.get("mockPortalRole");
        MOCK_USER.realRole = MOCK_QUERY.get("mockRealRole") || MOCK_USER.role;
    }
    MOCK_USER.canProcessOrders = MOCK_QUERY.get("mockCanProcessOrders") === "1";
    MOCK_USER.canLogInvoices = MOCK_QUERY.get("mockCanLogInvoices") === "1";
    MOCK_USER.isSimulated = MOCK_QUERY.get("mockPortalSimulated") === "1";
    const MOCK_LOAD_MODE = MOCK_QUERY.get("mockLoad") || "success";
    const MOCK_SUBMIT_MODE = MOCK_QUERY.get("mockSubmit") || "success";
    const MOCK_CONFIG_MODE = MOCK_QUERY.get("mockConfig") || "success";
    const MOCK_CONFIG_ROLE = MOCK_QUERY.get("mockRole") || MOCK_ROLE_ADMIN;
    const MOCK_CONFIG_SIMULATED = MOCK_QUERY.get("mockSimulated") === "1";
    let MOCK_DASHBOARD_CALL_COUNT = 0;
    let MOCK_SUBMIT_CALL_COUNT = 0;
    let MOCK_CONFIGURATION_VERSION = 1;
    let MOCK_APPROVAL_HISTORY = [];
    let MOCK_CONFIG_USERS = [
        {
            email: "test.user@claremontschool.co.uk",
            departments: ["IT", "Science"],
            role: "Admin",
            defaultSite: "Senior",
            status: "Active",
            isActive: true,
            isCurrentUser: true,
            canDeactivate: false,
            canReactivate: false,
            deactivationReason: "You cannot deactivate your own account.",
            canProcessOrders: false,
            canLogInvoices: false
        },
        {
            email: "lea.owen@claremontschool.co.uk",
            departments: ["Science", "English"],
            role: "Head",
            defaultSite: "Senior",
            status: "Active",
            isActive: true,
            isCurrentUser: false,
            canDeactivate: true,
            canReactivate: false,
            deactivationReason: "",
            canProcessOrders: true,
            canLogInvoices: false
        },
        {
            email: "staff.member@claremontschool.co.uk",
            departments: ["IT"],
            role: "Staff",
            defaultSite: "Prep",
            status: "Active",
            isActive: true,
            isCurrentUser: false,
            canDeactivate: true,
            canReactivate: false,
            deactivationReason: "",
            canProcessOrders: false,
            canLogInvoices: true
        },
        {
            email: "service.wipro@claremontschool.co.uk",
            departments: ["Wipro"],
            role: "Wipro",
            defaultSite: "Prep",
            status: "Active",
            isActive: true,
            isCurrentUser: false,
            canDeactivate: true,
            canReactivate: false,
            deactivationReason: "",
            canProcessOrders: false,
            canLogInvoices: false
        }
    ];
    let MOCK_CONFIG_BUDGETS = [
        {
            department: "IT",
            totalAllocation: 15000,
            spent: 5000,
            remaining: 10000,
            glCode: "6100-IT",
            status: "Active",
            isActive: true,
            isSystemDepartment: false,
            hasCalculationError: false,
            calculationError: "",
            dependencies: { userCount: 2, orderCount: 4, pendingOrderCount: 0 }
        },
        {
            department: "Science",
            totalAllocation: 10000,
            spent: 2000,
            remaining: 8000,
            glCode: "6200-SCI",
            status: "Active",
            isActive: true,
            isSystemDepartment: false,
            hasCalculationError: false,
            calculationError: "",
            dependencies: { userCount: 2, orderCount: 3, pendingOrderCount: 0 }
        },
        {
            department: "English",
            totalAllocation: 5000,
            spent: 5750,
            remaining: -750,
            glCode: "",
            status: "Active",
            isActive: true,
            isSystemDepartment: false,
            hasCalculationError: false,
            calculationError: "",
            dependencies: { userCount: 1, orderCount: 2, pendingOrderCount: 0 }
        },
        {
            department: "Wipro",
            totalAllocation: 0,
            spent: 0,
            remaining: 0,
            glCode: "",
            status: "Active",
            isActive: true,
            isSystemDepartment: true,
            hasCalculationError: false,
            calculationError: "",
            dependencies: { userCount: 1, orderCount: 0, pendingOrderCount: 0 }
        }
    ];
    let MOCK_CONFIG_SETTINGS = {
        financeEmail: "finance@claremontschool.co.uk",
        senderAlias: "service.orders@claremontschool.co.uk"
    };
    let MOCK_CONFIG_AUDIT = [
        {
            timestamp: "2026-07-22T14:32:00.000Z",
            actorEmail: "test.user@claremontschool.co.uk",
            action: "User added",
            target: "new.user@claremontschool.co.uk",
            details: "Staff · IT · Prep"
        },
        {
            timestamp: "2026-07-22T11:08:00.000Z",
            actorEmail: "test.user@claremontschool.co.uk",
            action: "Department removed from user",
            target: "staff.member@claremontschool.co.uk",
            details: "Removed Science"
        }
    ];

    function completeMockConfigurationRequest(success, payload) {
        setTimeout(() => {
            if (success) success(JSON.stringify(payload));
        }, 180);
    }

    function recordMockConfigurationChange(action, target, details) {
        MOCK_CONFIGURATION_VERSION += 1;
        document.documentElement.dataset.mockConfigurationVersion = String(MOCK_CONFIGURATION_VERSION);
        MOCK_CONFIG_AUDIT.unshift({
            timestamp: new Date().toISOString(),
            actorEmail: "test.user@claremontschool.co.uk",
            action,
            target,
            details: details || ""
        });
    }

    function mockConfigurationFailure(success, error) {
        completeMockConfigurationRequest(success, {
            success: false,
            errorCode: "CONFIGURATION_VALIDATION",
            error
        });
    }

    window.__PORTAL_LOCAL_MOCK = true;
    window.__PORTAL_LOCAL_MOCK_TIMEOUT_MS = ["timeout-once", "permanent-timeout"].includes(MOCK_LOAD_MODE) ? 700 : 30000;
    window.__PORTAL_LOCAL_MOCK_RETRY_MS = 100;
    window.__PORTAL_LOCAL_MOCK_SUBMIT_TIMEOUT_MS = MOCK_SUBMIT_MODE === "timeout" ? 700 : 60000;
    window.__PORTAL_MOCK_STATE = {
        getDashboardCallCount: () => MOCK_DASHBOARD_CALL_COUNT,
        getConfigurationVersion: () => MOCK_CONFIGURATION_VERSION
    };

    window.google = {
        script: {
            run: {
                withSuccessHandler: function (successCallback) {
                    return {
                        withFailureHandler: function (failureCallback) {
                            return google.script.run.createProxy(successCallback, failureCallback);
                        },
                        ...google.script.run.createProxy(successCallback, null)
                    };
                },
                withFailureHandler: function (failureCallback) {
                    return {
                        withSuccessHandler: function (successCallback) {
                            return google.script.run.createProxy(successCallback, failureCallback);
                        },
                        ...google.script.run.createProxy(null, failureCallback)
                    };
                },
                createProxy: function (success, failure) {
                    const proxy = {};

                    // --- MOCKED SERVER FUNCTIONS ---

                    proxy.getDashboardData = function (loadContext) {
                        MOCK_DASHBOARD_CALL_COUNT += 1;
                        document.documentElement.dataset.mockDashboardCalls = String(MOCK_DASHBOARD_CALL_COUNT);
                        const callNumber = MOCK_DASHBOARD_CALL_COUNT;
                        console.log("Mock Call: getDashboardData", MOCK_LOAD_MODE, callNumber, loadContext || {});

                        if (MOCK_LOAD_MODE === "refresh-failure" && callNumber > 1) {
                            setTimeout(() => success && success({
                                success: false, errorCode: "SERVER_ERROR", retryable: false,
                                error: "Synthetic technical stack trace - must not be displayed"
                            }), 400);
                            return;
                        }
                        if (MOCK_LOAD_MODE === "permanent-timeout") return;
                        if (MOCK_LOAD_MODE === "transport-failure" || (MOCK_LOAD_MODE === "failure-until-manual" && callNumber <= 2)) {
                            setTimeout(() => {
                                if (failure) failure({ message: "Mock transport failure" });
                            }, 100);
                            return;
                        }
                        if (MOCK_LOAD_MODE === "auth-denied") {
                            setTimeout(() => {
                                if (success) success(JSON.stringify({
                                    success: false,
                                    error: "Access denied. Your account is not authorized for this portal. Please contact IT.",
                                    errorCode: "AUTH_UNAUTHORIZED",
                                    meta: { requestId: loadContext && loadContext.requestId }
                                }));
                            }, 100);
                            return;
                        }
                        if (MOCK_LOAD_MODE === "malformed") {
                            setTimeout(() => { if (success) success("not-json"); }, 100);
                            return;
                        }

                        let delay = MOCK_LOAD_MODE === "delayed-success" ? 2500 : 500;
                        if (MOCK_LOAD_MODE === "timeout-once") delay = callNumber === 1 ? 1400 : 100;
                        setTimeout(() => {
                            const response = JSON.stringify({
                                success: true,
                                user: { ...MOCK_USER, capabilities: buildMockCapabilities(MOCK_USER) },
                                orders: decorateMockOrders(MOCK_USER),
                                budgets: MOCK_BUDGETS,
                                budgetErrors: Object.keys(MOCK_BUDGETS)
                                    .filter(dept => MOCK_BUDGETS[dept].hasCalculationError)
                                    .map(dept => ({ department: dept, message: MOCK_BUDGETS[dept].calculationError })),
                                meta: {
                                    dataVersion: "mock-1",
                                    configurationVersion: MOCK_CONFIGURATION_VERSION,
                                    generatedAt: new Date().toISOString(),
                                    requestId: loadContext && loadContext.requestId
                                }
                            });
                            if (success) success(response);
                        }, delay);
                    };

                    proxy.getOverviewDashboardData = function () {
                        console.log("Mock Call: getOverviewDashboardData");
                        setTimeout(() => {
                            const user = { ...MOCK_USER, capabilities: buildMockCapabilities(MOCK_USER) };
                            const scopedOrders = user.role === MOCK_ROLE_HEAD
                                ? MOCK_ORDERS.filter(o => String(o.location || "").toLowerCase() === String(user.defaultSite || "").toLowerCase())
                                : MOCK_ORDERS.slice();
                            const scopedDepts = new Set(scopedOrders.map(o => o.dept).filter(Boolean));
                            const scopedBudgets = {};
                            Object.entries(MOCK_BUDGETS).forEach(([dept, budget]) => {
                                if (user.role !== MOCK_ROLE_HEAD || scopedDepts.has(dept)) scopedBudgets[dept] = budget;
                            });
                            const response = JSON.stringify({
                                success: user.capabilities.canAccessFinanceDashboard,
                                user: user,
                                orders: scopedOrders,
                                budgets: scopedBudgets,
                                error: user.capabilities.canAccessFinanceDashboard ? "" : "Access denied. Please contact IT.",
                                errorCode: user.capabilities.canAccessFinanceDashboard ? "" : "AUTH_UNAUTHORIZED"
                            });
                            if (success) success(response);
                        }, 500);
                    };

                    proxy.getAdminConfigurationPreview = function () {
                        console.log("Mock Call: getAdminConfigurationPreview", MOCK_CONFIG_MODE, MOCK_CONFIG_ROLE, MOCK_CONFIG_SIMULATED);
                        if (MOCK_CONFIG_MODE === "transport-failure") {
                            setTimeout(() => {
                                if (failure) failure({ message: "Mock configuration transport failure" });
                            }, 100);
                            return;
                        }
                        if (MOCK_CONFIG_MODE === "malformed") {
                            setTimeout(() => { if (success) success("not-json"); }, 100);
                            return;
                        }

                        const previewUser = {
                            ...MOCK_USER,
                            role: MOCK_CONFIG_ROLE,
                            realRole: MOCK_CONFIG_ROLE,
                            isSimulated: MOCK_CONFIG_SIMULATED
                        };
                        previewUser.capabilities = buildMockCapabilities(previewUser);
                        if (!previewUser.capabilities.canManageConfiguration || MOCK_CONFIG_MODE === "auth-denied") {
                            setTimeout(() => {
                                if (success) success(JSON.stringify({
                                    success: false,
                                    previewOnly: false,
                                    errorCode: "AUTH_UNAUTHORIZED",
                                    error: "Access denied. Configuration is available to live Admin users only."
                                }));
                            }, 150);
                            return;
                        }
                        if (MOCK_CONFIG_MODE === "missing-sheet") {
                            setTimeout(() => {
                                if (success) success(JSON.stringify({
                                    success: false,
                                    previewOnly: false,
                                    errorCode: "CONFIGURATION_PREVIEW_UNAVAILABLE",
                                    error: "Configuration could not be loaded. Please check the Master Sheet structure or contact IT."
                                }));
                            }, 150);
                            return;
                        }

                        setTimeout(() => {
                            const activeUsers = MOCK_CONFIG_USERS.filter(item => item.isActive);
                            const activeBudgets = MOCK_CONFIG_BUDGETS.filter(item => item.isActive && !item.isSystemDepartment);
                            if (success) success(JSON.stringify({
                                success: true,
                                previewOnly: false,
                                configurationVersion: MOCK_CONFIGURATION_VERSION,
                                user: { email: previewUser.email, role: previewUser.realRole },
                                budgets: MOCK_CONFIG_BUDGETS,
                                users: MOCK_CONFIG_USERS,
                                systemSettings: MOCK_CONFIG_SETTINGS,
                                audit: {
                                    available: true,
                                    message: "Showing saved changes made through the Configuration workspace.",
                                    records: MOCK_CONFIG_AUDIT,
                                    _legacyRecords: [
                                        {
                                            timestamp: "2026-07-22T14:32:00.000Z",
                                            actorEmail: "test.user@claremontschool.co.uk",
                                            action: "User added",
                                            target: "new.user@claremontschool.co.uk",
                                            details: "Staff · IT · Prep"
                                        },
                                        {
                                            timestamp: "2026-07-22T11:08:00.000Z",
                                            actorEmail: "test.user@claremontschool.co.uk",
                                            action: "Department removed from user",
                                            target: "staff.member@claremontschool.co.uk",
                                            details: "Removed Science"
                                        },
                                        {
                                            timestamp: "2026-07-21T15:46:00.000Z",
                                            actorEmail: "test.user@claremontschool.co.uk",
                                            action: "Department edited",
                                            target: "IT",
                                            details: "Allocation changed from £14,000.00 to £15,000.00"
                                        },
                                        {
                                            timestamp: "2026-07-21T09:20:00.000Z",
                                            actorEmail: "test.user@claremontschool.co.uk",
                                            action: "Department added",
                                            target: "English",
                                            details: "Allocation £5,000.00 · GL code not set"
                                        }
                                    ]
                                },
                                roles: [
                                    { value: "Admin", label: "Admin", description: "Full portal and configuration access." },
                                    { value: "Staff", label: "Staff", description: "Normal ordering access for assigned departments." },
                                    { value: "Head", label: "Head", description: "Department access plus a site-level overview." },
                                    { value: "Wipro", label: "Wipro", description: "Finance operations and order processing access." }
                                ],
                                sites: ["Prep", "Senior"],
                                schoolDomain: "claremontschool.co.uk",
                                summary: {
                                    departmentCount: activeBudgets.length,
                                    userCount: activeUsers.length,
                                    adminCount: activeUsers.filter(item => item.role === "Admin").length
                                }
                            }));
                        }, 350);
                    };

                    proxy.getConfigurationChangeVersion = function () {
                        completeMockConfigurationRequest(success, {
                            success: true,
                            configurationVersion: MOCK_CONFIGURATION_VERSION
                        });
                    };

                    proxy.saveAdminBudgetConfiguration = function (payload) {
                        const originalName = String((payload && payload.originalName) || "").trim();
                        const department = String((payload && payload.department) || "").trim();
                        const allocation = Number(payload && payload.totalAllocation);
                        const glCode = String((payload && payload.glCode) || "").trim();
                        if (!department || !Number.isFinite(allocation) || allocation < 0) {
                            mockConfigurationFailure(success, "Enter a valid department and a non-negative allocation.");
                            return;
                        }
                        const duplicate = MOCK_CONFIG_BUDGETS.find(item =>
                            item.department.toLowerCase() === department.toLowerCase() &&
                            item.department.toLowerCase() !== originalName.toLowerCase()
                        );
                        if (duplicate) {
                            mockConfigurationFailure(success, "That department name already exists.");
                            return;
                        }
                        const existing = originalName
                            ? MOCK_CONFIG_BUDGETS.find(item => item.department.toLowerCase() === originalName.toLowerCase())
                            : null;
                        if (existing && existing.isSystemDepartment) {
                            mockConfigurationFailure(success, "The Wipro system department is protected.");
                            return;
                        }
                        if (existing) {
                            const oldName = existing.department;
                            existing.department = department;
                            existing.glCode = glCode;
                            existing.totalAllocation = allocation;
                            existing.remaining = allocation - existing.spent;
                            if (oldName.toLowerCase() !== department.toLowerCase()) {
                                MOCK_CONFIG_USERS.forEach(user => {
                                    user.departments = user.departments.map(item =>
                                        item.toLowerCase() === oldName.toLowerCase() ? department : item
                                    );
                                });
                                MOCK_ORDERS.forEach(order => {
                                    if (String(order.dept || "").toLowerCase() === oldName.toLowerCase()) order.dept = department;
                                });
                            }
                            recordMockConfigurationChange(
                                "Department edited",
                                department,
                                oldName === department
                                    ? `Allocation set to £${allocation.toFixed(2)}`
                                    : `Renamed from ${oldName}; linked users and orders updated`
                            );
                        } else {
                            MOCK_CONFIG_BUDGETS.push({
                                department,
                                totalAllocation: allocation,
                                spent: 0,
                                remaining: allocation,
                                glCode,
                                status: "Active",
                                isActive: true,
                                isSystemDepartment: false,
                                dependencies: { userCount: 0, orderCount: 0, pendingOrderCount: 0 }
                            });
                            recordMockConfigurationChange("Department added", department, `Allocation £${allocation.toFixed(2)}`);
                        }
                        completeMockConfigurationRequest(success, {
                            success: true,
                            changed: true,
                            configurationVersion: MOCK_CONFIGURATION_VERSION,
                            message: "Department saved."
                        });
                    };

                    proxy.setAdminBudgetActive = function (department, shouldBeActive) {
                        const budget = MOCK_CONFIG_BUDGETS.find(item =>
                            item.department.toLowerCase() === String(department || "").trim().toLowerCase()
                        );
                        if (!budget || budget.isSystemDepartment) {
                            mockConfigurationFailure(success, "This department cannot be changed.");
                            return;
                        }
                        const active = shouldBeActive === true;
                        if (!active && (budget.dependencies.userCount > 0 || budget.dependencies.pendingOrderCount > 0)) {
                            mockConfigurationFailure(success, "Remove active users and complete pending orders before deactivating this department.");
                            return;
                        }
                        if (budget.isActive === active) {
                            completeMockConfigurationRequest(success, { success: true, changed: false, message: "No change was needed." });
                            return;
                        }
                        budget.isActive = active;
                        budget.status = active ? "Active" : "Inactive";
                        recordMockConfigurationChange(
                            active ? "Department reactivated" : "Department deactivated",
                            budget.department,
                            active ? "Available for user assignments and orders" : "Historical orders retained"
                        );
                        completeMockConfigurationRequest(success, {
                            success: true,
                            changed: true,
                            configurationVersion: MOCK_CONFIGURATION_VERSION,
                            message: active ? "Department reactivated." : "Department deactivated."
                        });
                    };

                    proxy.saveAdminUserConfiguration = function (payload) {
                        const originalEmail = String((payload && payload.originalEmail) || "").trim().toLowerCase();
                        const email = String((payload && payload.email) || "").trim().toLowerCase();
                        const role = String((payload && payload.role) || "").trim();
                        const canUseAddOns = role === "Staff" || role === "Head";
                        const canProcessOrders = canUseAddOns && payload && payload.canProcessOrders === true;
                        const canLogInvoices = canUseAddOns && payload && payload.canLogInvoices === true;
                        const site = String((payload && payload.defaultSite) || "").trim();
                        const departments = Array.isArray(payload && payload.departments)
                            ? payload.departments.map(item => String(item || "").trim()).filter(Boolean)
                            : [];
                        const validRoles = ["Admin", "Staff", "Head", "Wipro"];
                        const validSites = ["Prep", "Senior"];
                        const activeDepartments = new Set(
                            MOCK_CONFIG_BUDGETS.filter(item => item.isActive).map(item => item.department.toLowerCase())
                        );
                        if (!email.endsWith("@claremontschool.co.uk") || !validRoles.includes(role) ||
                            !validSites.includes(site) || !departments.length ||
                            departments.some(item => !activeDepartments.has(item.toLowerCase()))) {
                            mockConfigurationFailure(success, "Every user needs a school email, valid role, at least one active department, and a default site.");
                            return;
                        }
                        if (MOCK_CONFIG_USERS.some(item =>
                            item.email.toLowerCase() === email && item.email.toLowerCase() !== originalEmail
                        )) {
                            mockConfigurationFailure(success, "That user already exists.");
                            return;
                        }
                        const existing = originalEmail
                            ? MOCK_CONFIG_USERS.find(item => item.email.toLowerCase() === originalEmail)
                            : null;
                        if (existing && email !== originalEmail) {
                            mockConfigurationFailure(success, "Existing email addresses cannot be renamed.");
                            return;
                        }
                        const assignedDepartments = role === "Wipro" ? ["Wipro"] : departments.filter(item => item !== "Wipro");
                        if (existing) {
                            const oldDepartments = existing.departments.slice();
                            const oldRole = existing.role;
                            const oldSite = existing.defaultSite;
                            existing.departments = assignedDepartments;
                            existing.role = role;
                            existing.defaultSite = site;
                            existing.canProcessOrders = canProcessOrders;
                            existing.canLogInvoices = canLogInvoices;
                            recordMockConfigurationChange(
                                "User edited",
                                existing.email,
                                `${oldRole} → ${role}; ${oldSite} → ${site}; departments ${oldDepartments.join(", ")} → ${assignedDepartments.join(", ")}`
                            );
                        } else {
                            MOCK_CONFIG_USERS.push({
                                email,
                                departments: assignedDepartments,
                                role,
                                defaultSite: site,
                                status: "Active",
                                isActive: true,
                                isCurrentUser: false,
                                canDeactivate: true,
                                canReactivate: false,
                                deactivationReason: "",
                                canProcessOrders,
                                canLogInvoices
                            });
                            recordMockConfigurationChange("User added", email, `${role} · ${assignedDepartments.join(", ")} · ${site}`);
                        }
                        completeMockConfigurationRequest(success, {
                            success: true,
                            changed: true,
                            configurationVersion: MOCK_CONFIGURATION_VERSION,
                            message: "User saved."
                        });
                    };

                    proxy.setAdminUserActive = function (email, shouldBeActive) {
                        const user = MOCK_CONFIG_USERS.find(item =>
                            item.email.toLowerCase() === String(email || "").trim().toLowerCase()
                        );
                        if (!user) {
                            mockConfigurationFailure(success, "That user could not be found.");
                            return;
                        }
                        const active = shouldBeActive === true;
                        const activeAdminCount = MOCK_CONFIG_USERS.filter(item => item.isActive && item.role === "Admin").length;
                        if (!active && (user.isCurrentUser || (user.role === "Admin" && activeAdminCount <= 1))) {
                            mockConfigurationFailure(success, user.isCurrentUser
                                ? "You cannot deactivate your own account."
                                : "The final active Admin cannot be deactivated.");
                            return;
                        }
                        user.isActive = active;
                        user.status = active ? "Active" : "Inactive";
                        user.canDeactivate = active && !user.isCurrentUser;
                        user.canReactivate = !active;
                        recordMockConfigurationChange(
                            active ? "User reactivated" : "User deactivated",
                            user.email,
                            active ? "Portal access restored" : "Portal access removed; row retained"
                        );
                        completeMockConfigurationRequest(success, {
                            success: true,
                            changed: true,
                            configurationVersion: MOCK_CONFIGURATION_VERSION,
                            message: active ? "User reactivated." : "User deactivated."
                        });
                    };

                    proxy.saveAdminSystemSettings = function (payload) {
                        const financeEmail = String((payload && payload.financeEmail) || "").trim().toLowerCase();
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(financeEmail)) {
                            mockConfigurationFailure(success, "Enter a valid finance email address.");
                            return;
                        }
                        if (financeEmail === MOCK_CONFIG_SETTINGS.financeEmail.toLowerCase()) {
                            completeMockConfigurationRequest(success, { success: true, changed: false, message: "No change was needed." });
                            return;
                        }
                        const previous = MOCK_CONFIG_SETTINGS.financeEmail;
                        MOCK_CONFIG_SETTINGS.financeEmail = financeEmail;
                        recordMockConfigurationChange("Finance email changed", financeEmail, `Changed from ${previous}`);
                        completeMockConfigurationRequest(success, {
                            success: true,
                            changed: true,
                            configurationVersion: MOCK_CONFIGURATION_VERSION,
                            message: "Finance email saved."
                        });
                    };

                    proxy.submitOrder = function (orderObj) {
                        MOCK_SUBMIT_CALL_COUNT += 1;
                        console.log("Mock Call: submitOrder", MOCK_SUBMIT_MODE, MOCK_SUBMIT_CALL_COUNT, orderObj);
                        if (MOCK_SUBMIT_MODE === "timeout") return;
                        if (MOCK_SUBMIT_MODE === "failure") {
                            setTimeout(() => {
                                if (failure) failure({ message: "Mock submit failure" });
                            }, 100);
                            return;
                        }
                        if (MOCK_SUBMIT_MODE === "rejected") {
                            setTimeout(() => {
                                if (success) success("Error: Mock submission rejected");
                            }, 100);
                            return;
                        }
                        const mockNewAttachments = (Array.isArray(orderObj && orderObj.files) ? orderObj.files : [])
                            .map((file, index) => `https://drive.google.com/file/d/mock-upload-${MOCK_SUBMIT_CALL_COUNT}-${index + 1}/view`);
                        const mockRemovedAttachments = new Set(
                            (Array.isArray(orderObj && orderObj.removedAttachments) ? orderObj.removedAttachments : [])
                                .map(value => String(value || "").trim())
                        );
                        const existingOrder = MOCK_ORDERS.find(item => String(item.id) === String((orderObj && orderObj.id) || ""));
                        if (existingOrder) {
                            const keptAttachments = String(existingOrder.attachment || "")
                                .split(/\s*,\s*/)
                                .map(value => value.trim())
                                .filter(value => value && !mockRemovedAttachments.has(value));
                            existingOrder.dept = orderObj.selectedDept;
                            existingOrder.supplier = orderObj.supplier;
                            existingOrder.link = orderObj.link;
                            existingOrder.desc = orderObj.desc;
                            existingOrder.code = orderObj.code;
                            existingOrder.qty = orderObj.qty;
                            existingOrder.unitPrice = orderObj.unitPrice;
                            existingOrder.totalPrice = orderObj.totalPrice;
                            existingOrder.location = orderObj.location;
                            existingOrder.dateNeeded = orderObj.dateNeeded;
                            existingOrder.attachment = keptAttachments.concat(mockNewAttachments).join(", ");
                        } else {
                            MOCK_ORDERS.unshift({
                                id: String(11000 + MOCK_SUBMIT_CALL_COUNT),
                                dept: orderObj.selectedDept,
                                dateReq: new Date().toLocaleDateString("en-GB"),
                                requester: MOCK_USER.email,
                                supplier: orderObj.supplier,
                                link: orderObj.link,
                                desc: orderObj.desc,
                                code: orderObj.code,
                                qty: orderObj.qty,
                                unitPrice: orderObj.unitPrice,
                                totalPrice: orderObj.totalPrice,
                                location: orderObj.location,
                                dateNeeded: orderObj.dateNeeded,
                                dateOrdered: "",
                                expectedDate: "",
                                finalPrice: "",
                                invoiceNumber: "",
                                notes: orderObj.userNote || "",
                                attachment: mockNewAttachments.join(", "),
                                status: "Pending"
                            });
                        }
                        setTimeout(() => {
                            if (success) success({ success: true, saved: true, message: existingOrder ? "Order updated successfully." : "Order submitted successfully." });
                        }, 300);
                    };

                    proxy.logInvoice = function (data) {
                        console.log("Mock Call: logInvoice", JSON.stringify(data));
                        setTimeout(() => {
                            if (success) success({ success: true, saved: true, message: "Invoice logged successfully." });
                        }, 800);
                    };

                    proxy.bulkFinalizeOrders = function (items) {
                        console.log("Mock Call: bulkFinalizeOrders", JSON.stringify(items));
                        const submittedItems = Array.isArray(items) ? items : [];
                        const seenIds = new Set();
                        let validationError = "";
                        const matchedItems = submittedItems.map(item => {
                            const id = String((item && item.id) || "");
                            const order = MOCK_ORDERS.find(candidate => String(candidate.id) === id);
                            const quantity = Number(item && item.quantity);
                            const finalPrice = Number(item && item.finalPrice);
                            const costNote = String((item && item.costNote) || "").trim();
                            if (!id || seenIds.has(id)) validationError = "The selected orders contain a missing or duplicate reference.";
                            seenIds.add(id);
                            if (!order) validationError = `Order ${id || "unknown"} could not be found.`;
                            if (order && (order.status !== "Pending" || String(order.desc || "").includes("CANCELLED") || order.recordType === "Transfer")) {
                                validationError = `Order ${id} is no longer pending.`;
                            }
                            if (!Number.isInteger(quantity) || quantity < 1) validationError = `Order ${id} has an invalid quantity.`;
                            if (!Number.isFinite(finalPrice) || finalPrice < 0) validationError = `Order ${id} has an invalid final cost.`;
                            if (costNote.length > 300) validationError = `Order ${id} has a cost note longer than 300 characters.`;
                            if (order && (order.recordType || 'Order') === 'Order' && !['Credit card', 'Invoice / on account'].includes(item.paymentMethod)) validationError = 'Choose a payment method for every order.';
                            return { item, order, quantity, finalPrice, costNote: costNote.replace(/[<>]/g, "") };
                        });

                        if (!submittedItems.length) validationError = "No orders were supplied.";
                        if (validationError) {
                            setTimeout(() => {
                                if (success) success({ success: false, error: validationError });
                            }, 250);
                            return;
                        }

                        const requesterGroups = {};
                        matchedItems.forEach(entry => {
                            const rawDate = String(entry.item.expectedDate || "");
                            const dateParts = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                            entry.order.expectedDate = dateParts ? `${dateParts[3]}/${dateParts[2]}/${dateParts[1]}` : "";
                            entry.order.qty = entry.quantity;
                            entry.order.finalPrice = Math.round(entry.finalPrice * 100) / 100;
                            entry.order.dateOrdered = new Date().toLocaleDateString("en-GB");
                            entry.order.status = entry.order.recordType === "Invoice" ? "Processed" : "Ordered";
                            entry.order.isCompleted = true;
                            entry.order.processedBy = MOCK_USER.email;
                            if ((entry.order.recordType || 'Order') === 'Order') entry.order.paymentMethod = entry.item.paymentMethod;
                            if (buildMockCapabilities(MOCK_USER).hasExplicitOrderProcessingPermission &&
                                String(entry.order.requester || "").toLowerCase() === String(MOCK_USER.email || "").toLowerCase()) {
                                entry.order.approvalStatus = "AWAITING_SIGNOFF";
                                entry.order.approvalRevision = Number(entry.order.approvalRevision || 0) + 1;
                                MOCK_APPROVAL_HISTORY.push({
                                    orderId: entry.order.id,
                                    timestamp: new Date().toISOString(),
                                    revision: entry.order.approvalRevision,
                                    action: "SIGNOFF_REQUIRED",
                                    actor: MOCK_USER.email,
                                    note: ""
                                });
                            } else {
                                entry.order.approvalStatus = "NOT_REQUIRED";
                            }
                            if (entry.costNote) {
                                entry.order.notes = `${entry.order.notes || ""}[Mock Finance]: Cost note: ${entry.costNote}\n`;
                            }
                            const requester = entry.order.requester || "";
                            if (requester && !requester.includes("Finance (Direct)")) {
                                if (!requesterGroups[requester]) requesterGroups[requester] = [];
                                requesterGroups[requester].push({
                                    id: entry.order.id,
                                    desc: entry.order.desc,
                                    qty: entry.order.qty,
                                    finalPrice: entry.order.finalPrice,
                                    expectedDate: entry.order.expectedDate,
                                    costNote: entry.costNote
                                });
                            }
                        });
                        console.log("Mock Bulk Requester Email Groups", JSON.stringify(requesterGroups));
                        const emailGroupCount = Object.keys(requesterGroups).length;
                        setTimeout(() => {
                            if (success) success({
                                success: true,
                                saved: true,
                                updatedCount: matchedItems.length,
                                emailGroupCount,
                                message: `Updated ${matchedItems.length} ${matchedItems.length === 1 ? "order" : "orders"}. Processed ${emailGroupCount} grouped requester ${emailGroupCount === 1 ? "email" : "emails"}.`
                            });
                        }, 600);
                    };

                    proxy.updateOrder = function (id, date, price, msg, invoiceNumber, correction, expectedVersion, attachmentFiles, attachmentOnly, paymentMethod) {
                        console.log("Mock Call: updateOrder", JSON.stringify({ id, date, price, msg, invoiceNumber, correction }));
                        const order = MOCK_ORDERS.find(item => String(item.id) === String(id));
                        if (order && !attachmentOnly && (order.recordType || 'Order') === 'Order') {
                            if ((paymentMethod || order.status === 'Pending' || order.paymentMethod) && !['Credit card', 'Invoice / on account'].includes(paymentMethod)) {
                                if (success) success({success:false,saved:false,message:'Choose a payment method.'});
                                return;
                            }
                            order.paymentMethod = paymentMethod || '';
                        }
                        if (order) {
                            if (date) order.expectedDate = date;
                            if (price !== "") order.finalPrice = price;
                            order.invoiceNumber = invoiceNumber || "";
                            const addedAttachments = (Array.isArray(attachmentFiles) ? attachmentFiles : [])
                                .map((file, index) => `https://drive.google.com/file/d/mock-finance-upload-${index + 1}/view`);
                            order.attachment = String(order.attachment || "").split(/\s*,\s*/).filter(Boolean).concat(addedAttachments).join(", ");
                            order.dateOrdered = order.dateOrdered || new Date().toLocaleDateString("en-GB");
                            order.status = "Ordered";
                            if (correction) {
                                order.dept = correction.department;
                                order.supplier = correction.supplier;
                                order.link = correction.link;
                                order.desc = correction.description;
                                order.code = correction.code;
                                order.qty = Number(correction.quantity);
                                order.unitPrice = Number(correction.unitPrice);
                                order.totalPrice = order.qty * order.unitPrice;
                                order.dateNeeded = correction.dateNeeded;
                                order.location = correction.location;
                            }
                            order.processedBy = order.processedBy || MOCK_USER.email;
                            if (buildMockCapabilities(MOCK_USER).hasExplicitOrderProcessingPermission &&
                                String(order.requester || "").toLowerCase() === String(MOCK_USER.email || "").toLowerCase()) {
                                order.approvalStatus = "AWAITING_SIGNOFF";
                                order.approvalRevision = Number(order.approvalRevision || 0) + 1;
                            }
                        }
                        setTimeout(() => {
                            if (success) success({ success: true, saved: true, message: "Order updated successfully." });
                        }, 600);
                    };

                    proxy.userCancelOrder = function (id) {
                        console.log("Mock Call: userCancelOrder", id);
                        setTimeout(() => {
                            if (success) success({ success: true, saved: true, message: "Order cancelled successfully." });
                        }, 400);
                    };

                    proxy.addNote = function (id, txt) {
                        console.log("Mock Call: addNote", { id, txt });
                        setTimeout(() => {
                            if (success) success({ success: true, saved: true, message: "Note added successfully." });
                        }, 400);
                    };

                    proxy.getOrderApprovalHistory = function (id) {
                        setTimeout(() => {
                            if (success) success(MOCK_APPROVAL_HISTORY.filter(item => String(item.orderId) === String(id)));
                        }, 150);
                    };

                    proxy.reviewOrderApproval = function (id, decision, note) {
                        const order = MOCK_ORDERS.find(item => String(item.id) === String(id));
                        if (!order) {
                            setTimeout(() => { if (success) success({ success: false, error: "Order not found." }); }, 100);
                            return;
                        }
                        const actor = String(MOCK_USER.email || "").toLowerCase();
                        if (actor === String(order.requester || "").toLowerCase() || actor === String(order.processedBy || "").toLowerCase()) {
                            setTimeout(() => { if (success) success({ success: false, error: "You cannot review your own purchase." }); }, 100);
                            return;
                        }
                        order.approvalStatus = decision === "APPROVE" ? "APPROVED" : "QUERY_RAISED";
                        order.approvedBy = decision === "APPROVE" ? MOCK_USER.email : "";
                        order.approvedAt = decision === "APPROVE" ? new Date().toISOString() : "";
                        MOCK_APPROVAL_HISTORY.push({ orderId: id, timestamp: new Date().toISOString(), revision: order.approvalRevision || 0, action: decision === "APPROVE" ? "APPROVED" : "QUERY_RAISED", actor: MOCK_USER.email, note: note || "" });
                        setTimeout(() => { if (success) success({ success: true, saved: true, message: decision === "APPROVE" ? "Order sign-off approved." : "Review query raised." }); }, 250);
                    };

                    proxy.resubmitOrderApproval = function (id, note) {
                        const order = MOCK_ORDERS.find(item => String(item.id) === String(id));
                        if (!order || order.approvalStatus !== "QUERY_RAISED") {
                            setTimeout(() => { if (success) success({ success: false, error: "This order does not have an open review query." }); }, 100);
                            return;
                        }
                        order.approvalStatus = "AWAITING_SIGNOFF";
                        order.approvalRevision = Number(order.approvalRevision || 0) + 1;
                        MOCK_APPROVAL_HISTORY.push({ orderId: id, timestamp: new Date().toISOString(), revision: order.approvalRevision, action: "RESUBMITTED", actor: MOCK_USER.email, note: note || "" });
                        setTimeout(() => { if (success) success({ success: true, saved: true, message: "Order resubmitted for independent sign-off." }); }, 250);
                    };

                    proxy.createBudgetTransfer = function (transfer) {
                        console.log("Mock Call: createBudgetTransfer", JSON.stringify(transfer));
                        setTimeout(() => {
                            if (success) success({ success: true, saved: true, message: "Budget transfer applied (Mock)" });
                        }, 700);
                    };

                    proxy.getSimulationTargets = function () {
                        console.log("Mock Call: getSimulationTargets");
                        setTimeout(() => {
                            if (success) success(["staff1@test.com", "staff2@test.com", "Lea.Owen@claremontschool.co.uk", "service.wipro@claremontschool.co.uk"]);
                        }, 300);
                    };

                    proxy.setSimulation = function (target) {
                        console.log("Mock Call: setSimulation", target);
                        if (target) {
                            MOCK_USER.isSimulated = true;
                            MOCK_USER.email = target;
                            MOCK_USER.depts = target === "service.wipro@claremontschool.co.uk" ? ["Wipro"] : target === "Lea.Owen@claremontschool.co.uk" ? ["Science"] : ["IT"];
                            MOCK_USER.dept = MOCK_USER.depts[0];
                            MOCK_USER.role = target === "service.wipro@claremontschool.co.uk" ? MOCK_ROLE_WIPRO : target === "Lea.Owen@claremontschool.co.uk" ? MOCK_ROLE_HEAD : MOCK_ROLE_STAFF;
                            MOCK_USER.defaultSite = target === "service.wipro@claremontschool.co.uk" ? "Prep" : "Senior";
                        } else {
                            MOCK_USER.isSimulated = false;
                            MOCK_USER.email = "test.user@claremontschool.co.uk";
                            MOCK_USER.depts = ["IT", "Science"];
                            MOCK_USER.dept = "IT";
                            MOCK_USER.role = MOCK_ROLE_ADMIN;
                            MOCK_USER.defaultSite = "Senior";
                        }
                        setTimeout(() => {
                            if (success) success("Success");
                        }, 300);
                    };

                    // Catch-all for other functions if needed, or define specific ones above
                    return proxy;
                }
            }
        }
    };
}
