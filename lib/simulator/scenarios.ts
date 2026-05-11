export const demoScenarios = [
  {
    id: "material-valid",
    label: "Valid material request",
    callerPhone: "+15550000001",
    transcript: "This is Raj from Site A. We need 20 bags of cement tomorrow morning."
  },
  {
    id: "material-over-budget",
    label: "Over-budget material request",
    callerPhone: "+15550000004",
    transcript: "This is Jose from Site B. We need 5 bundles of steel rods tomorrow morning."
  },
  {
    id: "vendor-restricted",
    label: "Unauthorized vendor payment request",
    callerPhone: "+15550000001",
    transcript: "Has Kumar Traders been paid?"
  },
  {
    id: "duplicate-request",
    label: "Duplicate material request",
    callerPhone: "+15550000001",
    transcript: "This is Raj from Site A. We need 40 bags of cement 2026-05-09."
  },
  {
    id: "urgent-escalation",
    label: "Urgent site issue",
    callerPhone: "+15550000004",
    transcript: "The generator failed at Site B and work is blocked."
  }
] as const;
