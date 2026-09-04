export const flows = [
  { id: "probe", name: "probe-payment-methods", steps: ["fill|Staff name|Mia Villanueva", "fill|Staff PIN|1234", "click|button|Sign in", "expect|Courts right now", "goto|?view=Settings", "wait|600", "clickin|Settings sections|button|Payments", "wait|400", "aria|payments-tab.aria.txt", "shot|payments-tab.png"] },
];
