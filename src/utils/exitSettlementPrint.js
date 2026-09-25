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

function arrangeEmployeeDetails(clone) {
  const meta = clone.querySelector(".exit-settlement-print-meta");
  if (!meta) return;
  const fields = Array.from(meta.children);
  meta.replaceChildren();
  const table = document.createElement("table");
  table.className = "exit-settlement-print-meta-table";
  for (let index = 0; index < fields.length; index += 2) {
    const row = document.createElement("tr");
    if (fields[index].classList.contains("exit-settlement-print-meta-wide")) {
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.appendChild(fields[index]);
      row.appendChild(cell);
      index -= 1;
    } else {
      fields.slice(index, index + 2).forEach((field) => {
        const cell = document.createElement("td");
        cell.appendChild(field);
        row.appendChild(cell);
      });
    }
    table.appendChild(row);
  }
  meta.appendChild(table);
}

function compactLowerApprovals(clone) {
  const calculation = clone.querySelector(".exit-settlement-print-calculation-note");
  const headHr = clone.querySelector(".exit-settlement-headhr-approval");
  const external = clone.querySelector(".exit-settlement-external-workflow");
  // The audit calculation remains in CHRiS; the employee copy follows the payslip.
  calculation?.remove();
  if (headHr) headHr.querySelectorAll(".exit-settlement-headhr-signature-grid > div:first-child").forEach((node) => node.remove());

  if (external) {
    external.innerHTML = [
      '<div class="exit-settlement-external-title">',
      '<h3>Approval Record</h3>',
      '</div>',
      '<table class="exit-settlement-external-approval-table">',
      '<thead><tr>',
      '<th>Approval Stage</th>',
      '<th>Name</th>',
      '<th>Signature</th>',
      '<th>Date</th>',
      '</tr></thead>',
      '<tbody>',
      '<tr><td>Auditor Review</td><td></td><td></td><td></td></tr>',
      '<tr><td>GM Payout Approval</td><td></td><td></td><td></td></tr>',
      '<tr><td>Accounts Payout Processing</td><td></td><td></td><td></td></tr>',
      '</tbody>',
      '</table>',
    ].join("");
  }
}

const PRINT_CSS = String.raw`
  @page { size: A4 portrait; margin: 12mm 14mm; }

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

  .exit-settlement-print-document {
    position: relative !important;
    display: block !important;
    width: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #f7f3e8 !important;
    color: #17211c !important;
    font-size: 10pt !important;
    line-height: 1.35 !important;
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
    max-width: 92px !important;
    max-height: 48px !important;
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
    font-size: 15pt !important;
    font-weight: 900 !important;
    line-height: 1.05 !important;
    text-transform: uppercase !important;
    letter-spacing: .02em !important;
  }

  .chris-print-report-heading h1 {
    margin: 2px 0 0 !important;
    color: #9a7410 !important;
    font-size: 11pt !important;
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
    display: block !important;
    padding: 1px 0 3px !important;
    margin: 0 0 4px !important;
    border: 0 !important;
    border-bottom: 1px solid #c7cec9 !important;
    border-radius: 0 !important;
  }

  .exit-settlement-print-meta-table {
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
  }

  .exit-settlement-print-meta-table td {
    width: 50% !important;
    padding: 0 5px 0 0 !important;
    vertical-align: top !important;
  }

  .exit-settlement-print-meta-table td > div {
    display: block !important;
    min-width: 0 !important;
    padding: 1px 0 !important;
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

  .exit-settlement-print-meta span {
    display: block !important;
  }

  .exit-settlement-print-meta strong,
  .exit-settlement-headhr-signature-grid strong {
    color: #17211c !important;
    font-size: 12pt !important;
    font-weight: 700 !important;
    line-height: 1.02 !important;
    overflow-wrap: anywhere !important;
  }

  .exit-settlement-print-meta strong {
    display: block !important;
    min-width: 0 !important;
  }

  .exit-settlement-print-meta-wide {
    width: 100% !important;
  }

  .exit-settlement-print-account {
    position: relative !important;
    z-index: 3 !important;
    display: block !important;
    width: 100% !important;
    direction: ltr !important;
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
    display: block !important;
    padding: 1px 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
  }

  .exit-settlement-print-totals .net {
    border-bottom: 2px solid #064e3b !important;
  }

  .exit-settlement-print-totals .net span {
    color: #064e3b !important;
  }

  .exit-settlement-print-totals strong {
    display: block !important;
    color: #064e3b !important;
    font-size: 13pt !important;
    font-weight: 900 !important;
    font-variant-numeric: tabular-nums !important;
  }

  .exit-settlement-print-totals .net strong {
    font-size: 15pt !important;
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
    height: 30px !important;
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
    height: 38px !important;
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
    white-space: nowrap !important;
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

  /* The same quiet identity / ledger / total rhythm used by the payslip. */
  .exit-settlement-print-meta { margin: 10px 0 16px !important; padding: 0 0 10px !important; }
  .exit-settlement-print-meta-table td { padding: 0 14px 0 0 !important; }
  .exit-settlement-print-meta-table td > div { padding: 4px 0 !important; border: 0 !important; }
  .exit-settlement-print-meta span,
  .exit-settlement-print-totals span,
  .exit-settlement-headhr-signature-grid span { font-size: 9pt !important; letter-spacing: .03em !important; }
  .exit-settlement-print-meta strong,
  .exit-settlement-headhr-signature-grid strong { font-size: 10pt !important; line-height: 1.3 !important; }
  .exit-settlement-print-meta-table td > .exit-settlement-print-meta-wide { margin-top: 5px !important; padding-top: 7px !important; border-top: 1px solid #c7cec9 !important; }
  .exit-settlement-print-meta-wide strong { color: #064e3b !important; font-size: 11pt !important; }
  .exit-settlement-print-account { display: block !important; }
  .exit-settlement-print-account > section + section { margin-top: 14px !important; }
  .exit-settlement-print-table-section h3 { padding: 0 0 5px !important; margin-bottom: 6px !important; font-size: 11pt !important; }
  .exit-settlement-print-table-section th,
  .exit-settlement-print-table-section td { padding: 5px 2px !important; font-size: 9pt !important; line-height: 1.25 !important; }
  .exit-settlement-print-table-section th:last-child,
  .exit-settlement-print-table-section td:last-child { width: 25% !important; }
  .exit-settlement-print-totals { margin: 14px 0 18px !important; padding-top: 10px !important; gap: 18px !important; }
  .exit-settlement-print-totals strong { font-size: 11pt !important; }
  .exit-settlement-print-totals .net strong { font-size: 14pt !important; }
  .exit-settlement-headhr-approval { padding: 8px 0 !important; border: 0 !important; border-top: 1px solid #c7cec9 !important; }
  .exit-settlement-headhr-signature-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 18px !important; }
  .exit-settlement-headhr-signature-line { height: 22px !important; }
  .exit-settlement-external-workflow { margin-top: 10px !important; padding-top: 10px !important; }
  .exit-settlement-external-approval-table th,
  .exit-settlement-external-approval-table td { height: 28px !important; padding: 4px 5px !important; font-size: 9pt !important; }
  .exit-settlement-external-approval-table th:nth-child(1) { width: 36% !important; }
  .exit-settlement-external-approval-table th:nth-child(2) { width: 24% !important; }
  .exit-settlement-external-approval-table th:nth-child(3) { width: 24% !important; }
  .exit-settlement-external-approval-table th:nth-child(4) { width: 16% !important; }
  .chris-print-report-footer { margin-top: 14px !important; font-size: 9pt !important; }

  @media print {
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

export default async function openExitSettlementPrint() {
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

  const generated = clone.querySelector(".chris-print-report-footer > span:first-child");
  if (generated) generated.textContent = `Generated ${new Date().toLocaleString("en-NG")}`;

  removeNilLedgerRows(clone);
  arrangeEmployeeDetails(clone);
  compactLowerApprovals(clone);

  const baseHref = window.location.origin + "/";

  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Employee Exit Settlement print document");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;";
  document.body.appendChild(frame);

  const printDocument = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!printDocument || !printWindow) {
    frame.remove();
    throw new Error("The settlement print frame could not be created.");
  }

  printDocument.open();
  printDocument.write(
    '<!doctype html><html><head><meta charset="utf-8"><base href="' +
      baseHref +
      '"><title>Employee Exit Settlement Account</title><style>' +
      PRINT_CSS +
      '</style></head><body>' +
      clone.outerHTML +
      '</body></html>'
  );
  printDocument.close();

  try {
    await Promise.all(Array.from(printDocument.images, (img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }));
    if (printDocument.fonts?.ready) await printDocument.fonts.ready;
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
