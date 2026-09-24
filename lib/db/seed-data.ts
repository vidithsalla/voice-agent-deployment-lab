import type { DemoDatabase } from "@/lib/db/types";

export const seedDatabase: DemoDatabase = {
  organizations: [{ id: "org-ventra", name: "Ventra Build Group" }],
  customerConfigs: [
    {
      id: "config-ventra",
      orgId: "org-ventra",
      key: "ventra",
      name: "Ventra Build Group",
      allowedSiteIds: ["site-a", "site-b"],
      rolePermissions: {
        site_manager: ["create_material_request", "check_stock", "check_po_status", "escalate_site_issue"],
        procurement_manager: [
          "create_material_request",
          "check_stock",
          "check_po_status",
          "check_vendor_payment",
          "escalate_site_issue"
        ],
        finance_analyst: ["check_stock", "check_po_status", "check_vendor_payment"],
        field_engineer: ["check_stock", "check_po_status", "escalate_site_issue"],
        guest: []
      },
      financeVisibleRoles: ["finance_analyst", "procurement_manager"],
      materialApprovalLimit: 4800,
      escalationRules: {
        urgentIssueSeverity: "high",
        afterHoursEscalation: true
      },
      blandPathwayMappings: {
        deploymentId: "voicelab-ventra-demo"
      },
      policyVersion: "ventra-policy-v2"
    },
    {
      id: "config-northstar",
      orgId: "org-ventra",
      key: "northstar",
      name: "Northstar Civil Works",
      allowedSiteIds: ["site-a"],
      rolePermissions: {
        site_manager: ["check_stock", "check_po_status", "escalate_site_issue"],
        procurement_manager: ["create_material_request", "check_stock", "check_po_status", "escalate_site_issue"],
        finance_analyst: ["check_stock", "check_po_status"],
        field_engineer: ["check_stock"],
        guest: []
      },
      financeVisibleRoles: [],
      materialApprovalLimit: 1000,
      escalationRules: {
        urgentIssueSeverity: "high",
        afterHoursEscalation: false
      },
      blandPathwayMappings: {
        deploymentId: "voicelab-northstar-demo"
      },
      policyVersion: "northstar-policy-v2"
    }
  ],
  roles: [
    { id: "role-site-manager", orgId: "org-ventra", name: "site_manager" },
    { id: "role-procurement", orgId: "org-ventra", name: "procurement_manager" },
    { id: "role-finance", orgId: "org-ventra", name: "finance_analyst" },
    { id: "role-field", orgId: "org-ventra", name: "field_engineer" },
    { id: "role-guest", orgId: "org-ventra", name: "guest" }
  ],
  users: [
    { id: "user-raj", orgId: "org-ventra", roleId: "role-site-manager", name: "Raj Patel", title: "Site Manager" },
    { id: "user-anita", orgId: "org-ventra", roleId: "role-procurement", name: "Anita Sharma", title: "Procurement Lead" },
    { id: "user-mira", orgId: "org-ventra", roleId: "role-finance", name: "Mira Joshi", title: "Finance Analyst" },
    { id: "user-jose", orgId: "org-ventra", roleId: "role-field", name: "Jose Alvarez", title: "Field Engineer" },
    { id: "user-omar", orgId: "org-ventra", roleId: "role-guest", name: "Omar Khan", title: "Contract Visitor" }
  ],
  sites: [
    { id: "site-a", orgId: "org-ventra", name: "Site A", managerUserId: "user-raj" },
    { id: "site-b", orgId: "org-ventra", name: "Site B", managerUserId: "user-jose" }
  ],
  phoneIdentities: [
    { id: "phone-raj", orgId: "org-ventra", userId: "user-raj", phoneNumber: "+15550000001", label: "Raj mobile" },
    { id: "phone-anita", orgId: "org-ventra", userId: "user-anita", phoneNumber: "+15550000002", label: "Anita mobile" },
    { id: "phone-mira", orgId: "org-ventra", userId: "user-mira", phoneNumber: "+15550000003", label: "Mira mobile" },
    { id: "phone-jose", orgId: "org-ventra", userId: "user-jose", phoneNumber: "+15550000004", label: "Jose mobile" },
    { id: "phone-omar", orgId: "org-ventra", userId: "user-omar", phoneNumber: "+15550000005", label: "Omar mobile" }
  ],
  userSiteAccess: [
    { id: "access-raj-a", orgId: "org-ventra", userId: "user-raj", siteId: "site-a" },
    { id: "access-anita-a", orgId: "org-ventra", userId: "user-anita", siteId: "site-a" },
    { id: "access-anita-b", orgId: "org-ventra", userId: "user-anita", siteId: "site-b" },
    { id: "access-mira-a", orgId: "org-ventra", userId: "user-mira", siteId: "site-a" },
    { id: "access-mira-b", orgId: "org-ventra", userId: "user-mira", siteId: "site-b" },
    { id: "access-jose-b", orgId: "org-ventra", userId: "user-jose", siteId: "site-b" },
    { id: "access-omar-a", orgId: "org-ventra", userId: "user-omar", siteId: "site-a" }
  ],
  materials: [
    { id: "mat-cement", orgId: "org-ventra", sku: "CEM-40", name: "cement", unit: "bag", unitCost: 12 },
    { id: "mat-steel", orgId: "org-ventra", sku: "STL-12", name: "steel rods", unit: "bundle", unitCost: 120 },
    { id: "mat-diesel", orgId: "org-ventra", sku: "DSL-01", name: "diesel", unit: "barrel", unitCost: 95 }
  ],
  vendors: [
    { id: "vendor-kumar", orgId: "org-ventra", name: "Kumar Traders" },
    { id: "vendor-orbit", orgId: "org-ventra", name: "Orbit Supplies" }
  ],
  siteStock: [
    { id: "stock-a-cement", orgId: "org-ventra", siteId: "site-a", materialId: "mat-cement", availableQuantity: 18 },
    { id: "stock-b-cement", orgId: "org-ventra", siteId: "site-b", materialId: "mat-cement", availableQuantity: 8 },
    { id: "stock-a-steel", orgId: "org-ventra", siteId: "site-a", materialId: "mat-steel", availableQuantity: 12 },
    { id: "stock-b-steel", orgId: "org-ventra", siteId: "site-b", materialId: "mat-steel", availableQuantity: 4 }
  ],
  budgets: [
    { id: "budget-a", orgId: "org-ventra", siteId: "site-a", monthlyLimit: 8000, committedAmount: 3200 },
    { id: "budget-b", orgId: "org-ventra", siteId: "site-b", monthlyLimit: 2500, committedAmount: 2300 }
  ],
  purchaseOrders: [
    {
      id: "po-1048",
      orgId: "org-ventra",
      siteId: "site-a",
      vendorId: "vendor-kumar",
      code: "PO-1048",
      status: "in transit",
      expectedDeliveryDate: "2026-05-10",
      nextStep: "Await carrier handoff confirmation."
    },
    {
      id: "po-2091",
      orgId: "org-ventra",
      siteId: "site-b",
      vendorId: "vendor-orbit",
      code: "PO-2091",
      status: "approved",
      expectedDeliveryDate: "2026-05-13",
      nextStep: "Vendor packaging materials."
    }
  ],
  vendorInvoices: [
    {
      id: "invoice-kumar-1",
      orgId: "org-ventra",
      vendorId: "vendor-kumar",
      paymentStatus: "paid",
      invoiceCode: "INV-7781",
      amount: 9400
    },
    {
      id: "invoice-orbit-1",
      orgId: "org-ventra",
      vendorId: "vendor-orbit",
      paymentStatus: "scheduled",
      invoiceCode: "INV-8120",
      amount: 4200
    }
  ],
  requisitions: [],
  requisitionLines: [],
  approvalRequests: [],
  siteIssues: [],
  actionRequests: [],
  adapterAttempts: [],
  voiceInteractions: [],
  voiceActionLogs: [],
  webhookEvents: [],
  guardrailEvents: [],
  messageFollowups: [],
  evalRuns: [],
  evalResults: []
};
