function removeNilLedgerRows(clone) {
  clone.querySelectorAll(".exit-settlement-print-table-section").forEach((section) => {
    const body = section.querySelector("tbody");
    if (!body) return;

    let retained = 0;
    Array.from(body.querySelectorAll("tr")).forEach((row) => {
      const amountText = String(row.querySelector("td:last-child")?.textContent || "");
      const numeric = Number(amountText.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(numeric) && Math.abs(numeric) < 0.005) {
        row.remove();
      } else {
        retained += 1;
      }
    });

    if (!retained) {
      const row = document.createElement("tr");
      row.className = "exit-settlement-print-empty-row";
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.textContent = "No applicable settlement entries";
      row.appendChild(cell);
      body.appendChild(row);
    }
  });
}

function compactCalculationBasis(clone) {
  const pre = clone.querySelector(".exit-settlement-print-calculation-note pre");
  if (!pre) return;

  const lines = String(pre.textContent || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "CHRiS Exit Settlement Calculation Basis")
    .filter((line) => !line.startsWith("Total Credits:"));

  const grid = document.createElement("div");
  grid.className = "exit-settlement-print-calculation-grid";

  if (!lines.length) {
    const empty = document.createElement("div");
    empty.textContent = "No additional calculation lines.";
    grid.appendChild(empty);
  } else {
    lines.forEach((line) => {
      const item = document.createElement("div");
      item.textContent = line.replace(/^\d+\.\s*/, "");
      grid.appendChild(item);
    });
  }

  pre.replaceWith(grid);
}

function compactLowerApprovals(clone) {
  const calculation = clone.querySelector(".exit-settlement-print-calculation-note");
  const headHr = clone.querySelector(".exit-settlement-headhr-approval");
  const external = clone.querySelector(".exit-settlement-external-workflow");

  if (calculation && headHr) {
    const lowerGrid = document.createElement("div");
    lowerGrid.className = "exit-settlement-print-lower-grid";
    calculation.parentNode.insertBefore(lowerGrid, calculation);
    lowerGrid.appendChild(calculation);
    lowerGrid.appendChild(headHr);
  }

  if (external) {
    external.innerHTML = [
      '<div class="exit-settlement-external-title">',
      '<h3>External Signatory Workflow</h3>',
      '</div>',
      '<table class="exit-settlement-external-approval-table">',
      '<thead><tr>',
      '<th>Approval Stage</th>',
      '<th>Name / Processed By</th>',
      '<th>Signature</th>',
      '<th>Date</th>',
      '<th>Remarks / Reference</th>',
      '</tr></thead>',
      '<tbody>',
      '<tr><td>1. Auditor Review</td><td></td><td></td><td></td><td></td></tr>',
      '<tr><td>2. GM Payout Approval</td><td></td><td></td><td></td><td></td></tr>',
      '<tr><td>3. Accounts Payout Processing</td><td></td><td></td><td></td><td></td></tr>',
      '</tbody>',
      '</table>',
    ].join("");
  }
}

const PRINT_CSS = String.raw`
  @page { size: A4 landscape; margin: 7mm; }

  * { box-sizing: border-box; }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #f7f3e8 !important;
    color: #17211c;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .print-toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 11px 16px;
    background: #fffdf7 !important;
    border-bottom: 1px solid #d8c788;
    box-shadow: 0 2px 10px rgba(0, 0, 0, .08);
  }

  .print-toolbar button {
    border: 1px solid #064e3b;
    border-radius: 8px;
    padding: 9px 16px;
    background: #064e3b !important;
    color: #fffdf7 !important;
    font: 700 13px Arial, Helvetica, sans-serif;
    cursor: pointer;
  }

  .print-toolbar button.secondary {
    background: #fffdf7 !important;
    color: #064e3b !important;
  }

  .exit-settlement-print-document {
    position: relative !important;
    display: block !important;
    width: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 0 10mm !important;
    overflow: visible !important;
    background: #f7f3e8 !important;
    color: #17211c !important;
    font-size: 12pt !important;
    line-height: 1.08 !important;
  }

  .exit-settlement-print-document * {
    background-color: #f7f3e8 !important;
    background-image: none !important;
    box-shadow: none !important;
  }

  .chris-print-report-header {
    position: relative !important;
    z-index: 3 !important;
    display: block !important;
    padding: 0 0 5px !important;
    margin: 0 0 5px !important;
    border-bottom: 2px solid #064e3b !important;
    text-align: center !important;
  }

  .chris-print-report-logo {
    display: block !important;
    width: auto !important;
    height: auto !important;
    max-width: 72px !important;
    max-height: 38px !important;
    margin: 0 auto 2px !important;
    object-fit: contain !important;
  }

  .chris-print-report-heading {
    position: relative !important;
    z-index: 3 !important;
    text-align: center !important;
  }

  .chris-print-report-owner {
    margin: 0 !important;
    color: #064e3b !important;
    font-size: 14pt !important;
    font-weight: 900 !important;
    line-height: 1.05 !important;
    text-transform: uppercase !important;
    letter-spacing: .02em !important;
  }

  .chris-print-report-heading h1 {
    margin: 2px 0 0 !important;
    color: #9a7410 !important;
    font-size: 13pt !important;
    font-weight: 900 !important;
    line-height: 1.05 !important;
    text-transform: uppercase !important;
    letter-spacing: .045em !important;
  }

  .chris-print-report-scope {
    margin-top: 2px !important;
    color: #64748b !important;
    font-size: 12pt !important;
    font-weight: 700 !important;
    line-height: 1.02 !important;
  }

  .chris-print-document-watermark {
    position: fixed !important;
    z-index: 1 !important;
    top: 52% !important;
    left: 50% !important;
    width: 30% !important;
    max-width: 285px !important;
    max-height: 285px !important;
    transform: translate(-50%, -50%) !important;
    object-fit: contain !important;
    opacity: .05 !important;
    filter: grayscale(100%) !important;
    mix-blend-mode: multiply !important;
    pointer-events: none !important;
    background: transparent !important;
  }

  .chris-print-document-watermark-text {
    position: fixed !important;
    z-index: 1 !important;
    top: 52% !important;
    left: 50% !important;
    width: 60% !important;
    transform: translate(-50%, -50%) rotate(-24deg) !important;
    color: #064e3b !important;
    opacity: .045 !important;
    font-size: 34pt !important;
    font-weight: 900 !important;
    text-align: center !important;
    pointer-events: none !important;
    background: transparent !important;
  }

  .exit-settlement-print-meta {
    position: relative !important;
    z-index: 3 !important;
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    column-gap: 16px !important;
    row-gap: 0 !important;
    padding: 1px 0 3px !important;
    margin: 0 0 4px !important;
    border: 0 !important;
    border-bottom: 1px solid #c7cec9 !important;
    border-radius: 0 !important;
  }

  .exit-settlement-print-meta > div {
    display: grid !important;
    grid-template-columns: 165px minmax(0, 1fr) !important;
    gap: 5px !important;
    align-items: baseline !important;
    min-width: 0 !important;
    padding: 0 0 1px !important;
    border-bottom: 1px solid #e0ddd2 !important;
  }

  .exit-settlement-print-meta span,
  .exit-settlement-print-totals span,
  .exit-settlement-headhr-signature-grid span {
    color: #64748b !important;
    font-size: 12pt !important;
    font-weight: 700 !important;
    line-height: 1.02 !important;
    white-space: nowrap !important;
    text-transform: uppercase !important;
    letter-spacing: 0 !important;
  }

  .exit-settlement-print-meta strong,
  .exit-settlement-headhr-signature-grid strong {
    color: #17211c !important;
    font-size: 12pt !important;
    font-weight: 700 !important;
    line-height: 1.02 !important;
    overflow-wrap: anywhere !important;
  }

  .exit-settlement-print-meta-wide {
    grid-column: 1 / -1 !important;
  }

  .exit-settlement-print-account {
    position: relative !important;
    z-index: 3 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
    grid-template-rows: auto !important;
    gap: 18px !important;
    align-items: start !important;
    width: 100% !important;
    margin: 0 !important;
    direction: ltr !important;
  }

  .exit-settlement-print-account > :first-child {
    grid-column: 1 !important;
    grid-row: 1 !important;
  }

  .exit-settlement-print-account > :nth-child(2) {
    grid-column: 2 !important;
    grid-row: 1 !important;
  }

  .exit-settlement-print-table-section {
    min-width: 0 !important;
  }

  .exit-settlement-print-table-section h3 {
    margin: 0 0 2px !important;
    padding: 0 0 3px !important;
    color: #064e3b !important;
    border: 0 !important;
    border-bottom: 2px solid #064e3b !important;
    font-size: 13pt !important;
    font-weight: 900 !important;
    line-height: 1.05 !important;
    text-transform: uppercase !important;
    letter-spacing: .02em !important;
  }

  .exit-settlement-print-table-section table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    border: 0 !important;
  }

  .exit-settlement-print-table-section th,
  .exit-settlement-print-table-section td {
    padding: 1px 4px !important;
    border: 0 !important;
    border-bottom: 1px solid #d6d8d5 !important;
    color: #17211c !important;
    font-size: 12pt !important;
    line-height: 1.05 !important;
    overflow-wrap: anywhere !important;
  }

  .exit-settlement-print-table-section th {
    color: #064e3b !important;
    font-weight: 900 !important;
    text-align: left !important;
    text-transform: uppercase !important;
    letter-spacing: .015em !important;
    border-bottom: 1px solid #8fa79a !important;
  }

  .exit-settlement-print-table-section th:last-child,
  .exit-settlement-print-table-section td:last-child {
    width: 29% !important;
    text-align: right !important;
    white-space: nowrap !important;
    font-variant-numeric: tabular-nums !important;
  }

  .exit-settlement-print-table-section tbody tr {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .exit-settlement-print-empty-row td {
    color: #64748b !important;
    font-style: italic !important;
    text-align: left !important;
  }

  .exit-settlement-print-totals {
    position: relative !important;
    z-index: 3 !important;
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 12px !important;
    margin: 4px 0 0 !important;
    padding: 4px 0 0 !important;
    border-top: 2px solid #9a7410 !important;
    break-inside: avoid !important;
  }

  .exit-settlement-print-totals > div {
    display: grid !important;
    grid-template-columns: 1fr auto !important;
    gap: 8px !important;
    align-items: baseline !important;
    padding: 1px 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
  }

  .exit-settlement-print-totals .net {
    border: 0 !important;
  }

  .exit-settlement-print-totals strong {
    color: #064e3b !important;
    font-size: 13pt !important;
    font-weight: 900 !important;
    font-variant-numeric: tabular-nums !important;
  }

  .exit-settlement-print-nil-note {
    position: relative !important;
    z-index: 3 !important;
    margin: 1px 0 0 !important;
    color: #64748b !important;
    font-size: 12pt !important;
    line-height: 1.02 !important;
    font-style: italic !important;
  }

  .exit-settlement-print-lower-grid {
    position: relative !important;
    z-index: 3 !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr) !important;
    gap: 18px !important;
    align-items: start !important;
    margin-top: 4px !important;
    padding-top: 4px !important;
    border-top: 1px solid #c7cec9 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .exit-settlement-print-calculation-note,
  .exit-settlement-headhr-approval {
    position: relative !important;
    z-index: 3 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
  }

  .exit-settlement-headhr-approval {
    padding-left: 12px !important;
    border-left: 2px solid #064e3b !important;
  }

  .exit-settlement-print-calculation-note h3,
  .exit-settlement-headhr-approval h3,
  .exit-settlement-external-title h3 {
    margin: 0 0 3px !important;
    color: #064e3b !important;
    font-size: 13pt !important;
    font-weight: 900 !important;
    line-height: 1.05 !important;
  }

  .exit-settlement-print-calculation-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    column-gap: 14px !important;
    row-gap: 0 !important;
    color: #17211c !important;
    font-size: 12pt !important;
    line-height: 1.05 !important;
  }

  .exit-settlement-print-calculation-grid > div {
    padding: 0 !important;
    border-bottom: 1px dotted #d6d8d5 !important;
  }

  .exit-settlement-print-hr-note {
    margin-top: 2px !important;
    padding-top: 2px !important;
    border-top: 1px solid #d6d8d5 !important;
    color: #475569 !important;
    font-size: 12pt !important;
    line-height: 1.05 !important;
  }

  .exit-settlement-headhr-signature-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 2px 10px !important;
    align-items: end !important;
  }

  .exit-settlement-headhr-signature-grid > div {
    display: grid !important;
    gap: 1px !important;
    min-height: 20px !important;
    padding: 0 !important;
    border: 0 !important;
  }

  .exit-settlement-headhr-signature-line {
    height: 8px !important;
    border-bottom: 1px solid #475569 !important;
  }

  .exit-settlement-external-workflow {
    position: relative !important;
    z-index: 3 !important;
    margin-top: 4px !important;
    padding-top: 3px !important;
    border-top: 1px solid #c7cec9 !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .exit-settlement-external-title {
    margin-bottom: 2px !important;
  }

  .exit-settlement-external-approval-table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    font-size: 12pt !important;
  }

  .exit-settlement-external-approval-table th,
  .exit-settlement-external-approval-table td {
    height: 18px !important;
    padding: 1px 4px !important;
    border: 1px solid #c7cec9 !important;
    color: #17211c !important;
    background: #f7f3e8 !important;
    line-height: 1 !important;
  }

  .exit-settlement-external-approval-table th {
    color: #064e3b !important;
    font-weight: 900 !important;
    text-align: left !important;
  }

  .exit-settlement-external-approval-table th:nth-child(1) { width: 23% !important; }
  .exit-settlement-external-approval-table th:nth-child(2) { width: 22% !important; }
  .exit-settlement-external-approval-table th:nth-child(3) { width: 17% !important; }
  .exit-settlement-external-approval-table th:nth-child(4) { width: 13% !important; }
  .exit-settlement-external-approval-table th:nth-child(5) { width: 25% !important; }

  .chris-print-report-footer {
    position: relative !important;
    z-index: 3 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 10px !important;
    margin-top: 4px !important;
    padding-top: 3px !important;
    border-top: 1px solid #94a3b8 !important;
    color: #64748b !important;
    font-size: 12pt !important;
    line-height: 1 !important;
  }

  .chris-print-report-powered {
    display: inline-flex !important;
    align-items: center !important;
    gap: 5px !important;
    color: #64748b !important;
  }

  .chris-print-report-powered img {
    width: 28px !important;
    height: 28px !important;
    object-fit: contain !important;
    background: transparent !important;
  }

  .chris-print-report-powered strong {
    display: none !important;
  }

  @media print {
    .print-toolbar { display: none !important; }

    html,
    body {
      background: #f7f3e8 !important;
    }

    .chris-print-report-header,
    .exit-settlement-print-meta,
    .exit-settlement-print-totals,
    .exit-settlement-print-lower-grid,
    .exit-settlement-external-workflow,
    .chris-print-report-footer {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  }
`;

export default function openExitSettlementPrint() {
  const printNodes = Array.from(
    document.querySelectorAll(
      ".employee-exit-settlement-page .exit-settlement-print-document"
    )
  );

  const source =
    printNodes.find((node) => node.dataset.settlementPrintState === "record") ||
    printNodes.find((node) => node.dataset.settlementPrintState === "preview") ||
    null;

  if (!source) {
    window.alert(
      "The Employee Exit Settlement Account is still loading or has no calculated preview yet. Please wait for the settlement data to load before printing."
    );
    return;
  }

  const clone = source.cloneNode(true);

  clone
    .querySelectorAll(".chris-print-report-powered strong")
    .forEach((node) => node.remove());

  removeNilLedgerRows(clone);
  compactCalculationBasis(clone);
  compactLowerApprovals(clone);

  const nilNote = document.createElement("div");
  nilNote.className = "exit-settlement-print-nil-note";
  nilNote.textContent =
    "Nil-value settlement items are omitted from the formal printed statement.";
  const totals = clone.querySelector(".exit-settlement-print-totals");
  if (totals) totals.insertAdjacentElement("afterend", nilNote);

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Allow pop-ups to print or download the Employee Exit Settlement Account.");
    return;
  }

  const baseHref = window.location.origin + "/";

  printWindow.document.open();
  printWindow.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><base href="' +
      baseHref +
      '"><title></title><style>' +
      PRINT_CSS +
      '</style></head><body>' +
      '<div class="print-toolbar" role="toolbar" aria-label="Settlement print controls">' +
      '<button id="printSettlementDocument" type="button">Print / Download PDF</button>' +
      '<button id="closeSettlementDocument" class="secondary" type="button">Close</button>' +
      '</div>' +
      clone.outerHTML +
      '</body></html>'
  );
  printWindow.document.close();
  printWindow.opener = null;

  const printButton = printWindow.document.getElementById("printSettlementDocument");
  const closeButton = printWindow.document.getElementById("closeSettlementDocument");

  printButton?.addEventListener("click", () => {
    printWindow.focus();
    printWindow.print();
  });

  closeButton?.addEventListener("click", () => printWindow.close());

  const images = Array.from(printWindow.document.images);
  Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    })
  ).then(() => {
    printWindow.focus();
  });
}
