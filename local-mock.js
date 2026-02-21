/**
 * LOCAL MOCK FOR GOOGLE APPS SCRIPT
 * This file simulates the google.script.run environment.
 * It is only loaded when running locally (outside of Apps Script).
 */

console.log("%c LOADED LOCAL MOCK ENVIRONMENT ", "background: #FAB600; color: #000; font-weight: bold; padding: 4px;");

// Mock Data
const MOCK_USER = {
    email: "test.user@claremontschool.co.uk",
    dept: "IT",
    depts: ["IT", "Science"],
    role: "Admin", // Change to 'Staff' to test staff view
    realRole: "Admin",
    defaultSite: "Senior",
    isSimulated: false
};

const MOCK_BUDGETS = {
    "IT": { total: 15000, spent: 5000, remaining: 10000 },
    "Science": { total: 10000, spent: 2000, remaining: 8000 }
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
        finalPrice: "",
        notes: "",
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
    window.google = {
        script: {
            run: {
                withSuccessHandler: function (successCallback) {
                    return {
                        withFailureHandler: function (failureCallback) {
                            return this.createProxy(successCallback, failureCallback);
                        },
                        ...this.createProxy(successCallback, null)
                    };
                },
                withFailureHandler: function (failureCallback) {
                    return {
                        withSuccessHandler: function (successCallback) {
                            return this.createProxy(successCallback, failureCallback);
                        },
                        ...this.createProxy(null, failureCallback)
                    };
                },
                createProxy: function (success, failure) {
                    const proxy = {};

                    // --- MOCKED SERVER FUNCTIONS ---

                    proxy.getDashboardData = function () {
                        console.log("Mock Call: getDashboardData");
                        setTimeout(() => {
                            const response = JSON.stringify({
                                success: true,
                                user: MOCK_USER,
                                orders: MOCK_ORDERS,
                                budgets: MOCK_BUDGETS
                            });
                            if (success) success(response);
                        }, 500);
                    };

                    proxy.submitOrder = function (orderObj) {
                        console.log("Mock Call: submitOrder", orderObj);
                        setTimeout(() => {
                            if (success) success("Success");
                        }, 800);
                    };

                    proxy.logInvoice = function (data) {
                        console.log("Mock Call: logInvoice", data);
                        setTimeout(() => {
                            if (success) success("Invoice Logged");
                        }, 800);
                    };

                    proxy.bulkUpdateOrders = function (ids, date) {
                        console.log("Mock Call: bulkUpdateOrders", ids, date);
                        setTimeout(() => {
                            if (success) success(`Updated ${ids.length} orders (Mock)`);
                        }, 600);
                    };

                    proxy.updateOrder = function (id, date, price, msg, cat) {
                        console.log("Mock Call: updateOrder", { id, date, price, msg, cat });
                        setTimeout(() => {
                            if (success) success("Updated");
                        }, 600);
                    };

                    proxy.userCancelOrder = function (id) {
                        console.log("Mock Call: userCancelOrder", id);
                        setTimeout(() => {
                            if (success) success("Success");
                        }, 400);
                    };

                    proxy.addNote = function (id, txt) {
                        console.log("Mock Call: addNote", { id, txt });
                        setTimeout(() => {
                            if (success) success("Note Added");
                        }, 400);
                    };

                    proxy.getSimulationTargets = function () {
                        console.log("Mock Call: getSimulationTargets");
                        setTimeout(() => {
                            if (success) success(["staff1@test.com", "staff2@test.com"]);
                        }, 300);
                    };

                    proxy.setSimulation = function (target) {
                        console.log("Mock Call: setSimulation", target);
                        if (target) {
                            MOCK_USER.isSimulated = true;
                            MOCK_USER.email = target;
                        } else {
                            MOCK_USER.isSimulated = false;
                            MOCK_USER.email = "test.user@claremontschool.co.uk";
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
