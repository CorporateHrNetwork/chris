export default function openExitSettlementPrint() {
  const source = document.querySelector(
    ".employee-exit-settlement-page .exit-settlement-print-document"
  );

  if (!source) {
    window.alert("The Employee Exit Settlement Account is not available for printing.");
    return;
  }

  const clone = source.cloneNode(true);
  clone.querySelectorAll(".chris-print-report-powered strong").forEach((node) => node.remove());

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("Allow pop-ups to print or download the Employee Exit Settlement Account.");
    return;
  }

  const baseHref = window.location.origin + "/";
  const printCss = [
    "@page{size:A4 landscape;margin:0}",
    "*{box-sizing:border-box}",
    "html,body{margin:0;padding:0;background:#f7f3e8!important;color:#17211c;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}",
    ".print-toolbar{position:sticky;top:0;z-index:50;display:flex;justify-content:center;gap:12px;padding:12px 16px;background:#fffdf7!important;border-bottom:1px solid #d8c788!important;box-shadow:0 2px 10px rgba(0,0,0,.08)!important}",
    ".print-toolbar button{border:1px solid #064e3b;border-radius:8px;padding:9px 16px;background:#064e3b!important;color:#fffdf7!important;font:700 13px Arial,Helvetica,sans-serif;cursor:pointer}",
    ".print-toolbar button.secondary{background:#fffdf7!important;color:#064e3b!important}",
    ".exit-settlement-print-document{display:block!important;position:relative!important;width:297mm!important;min-height:210mm!important;margin:0 auto!important;padding:10mm 14mm 9mm!important;overflow:visible!important;background:#f7f3e8!important;color:#17211c!important;font-size:12pt!important;line-height:1.38!important}",
    ".exit-settlement-print-document *{background-color:#f7f3e8!important;background-image:none!important;box-shadow:none!important}",
    ".chris-print-report-header{position:relative;display:block!important;text-align:center!important;padding:0 0 8px!important;margin:0 0 10px!important;border-bottom:2px solid #064e3b!important}",
    ".chris-print-report-logo{display:block!important;width:auto!important;height:auto!important;max-width:92px!important;max-height:44px!important;margin:0 auto 5px!important;object-fit:contain!important}",
    ".chris-print-report-heading{position:relative!important;z-index:3!important;text-align:center!important}",
    ".chris-print-report-owner{margin:0!important;color:#064e3b!important;font-size:15pt!important;font-weight:900!important;line-height:1.15!important;text-transform:uppercase!important;letter-spacing:.025em!important}",
    ".chris-print-report-heading h1{margin:4px 0 0!important;color:#9a7410!important;font-size:14pt!important;font-weight:900!important;letter-spacing:.075em!important;text-transform:uppercase!important;line-height:1.15!important}",
    ".chris-print-report-scope{margin-top:4px!important;color:#64748b!important;font-size:12pt!important;font-weight:700!important}",
    ".chris-print-document-watermark{position:fixed!important;z-index:1!important;top:53%!important;left:50%!important;width:31%!important;max-width:300px!important;max-height:300px!important;transform:translate(-50%,-50%)!important;object-fit:contain!important;opacity:.055!important;filter:grayscale(100%)!important;mix-blend-mode:multiply!important;pointer-events:none!important;background:transparent!important}",
    ".chris-print-document-watermark-text{position:fixed!important;z-index:1!important;top:53%!important;left:50%!important;transform:translate(-50%,-50%) rotate(-24deg)!important;width:62%!important;text-align:center!important;color:#064e3b!important;opacity:.05!important;font-size:34pt!important;font-weight:900!important;letter-spacing:.08em!important;pointer-events:none!important;background:transparent!important}",
    ".exit-settlement-print-meta{position:relative;z-index:3;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;column-gap:24px!important;row-gap:9px!important;padding:11px 4px 12px!important;margin-bottom:14px!important;border:0!important;border-bottom:1px solid #c7cec9!important;border-radius:0!important;break-inside:avoid!important}",
    ".exit-settlement-print-meta>div{display:grid!important;grid-template-columns:minmax(115px,.78fr) minmax(0,1.22fr)!important;gap:8px!important;align-items:baseline!important;min-width:0!important;padding:0 2px 5px!important;border-bottom:1px solid #e0ddd2!important}",
    ".exit-settlement-print-meta span,.exit-settlement-print-totals span,.exit-settlement-headhr-signature-grid span,.exit-settlement-sign-line span{color:#64748b!important;font-size:12pt!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.02em!important}",
    ".exit-settlement-print-meta strong,.exit-settlement-headhr-signature-grid strong{color:#17211c!important;font-size:12pt!important;font-weight:700!important;line-height:1.3!important;overflow-wrap:anywhere!important}",
    ".exit-settlement-print-meta-wide{grid-column:1/-1!important}",
    ".exit-settlement-print-account{position:relative;z-index:3;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-rows:auto!important;gap:24px!important;align-items:start!important;width:100%!important;direction:ltr!important;margin-top:2px!important}",
    ".exit-settlement-print-account>:first-child{grid-column:1!important;grid-row:1!important}",
    ".exit-settlement-print-account>:nth-child(2){grid-column:2!important;grid-row:1!important}",
    ".exit-settlement-print-table-section{min-width:0!important;break-inside:avoid!important}",
    ".exit-settlement-print-table-section h3{margin:0 0 6px!important;padding:0 0 6px!important;color:#064e3b!important;border:0!important;border-bottom:2px solid #064e3b!important;font-size:13pt!important;font-weight:900!important;letter-spacing:.04em!important;text-transform:uppercase!important;line-height:1.2!important}",
    ".exit-settlement-print-table-section table{width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;border:0!important}",
    ".exit-settlement-print-table-section th,.exit-settlement-print-table-section td{padding:7px 6px!important;border:0!important;border-bottom:1px solid #d6d8d5!important;color:#17211c!important;font-size:12pt!important;line-height:1.32!important;overflow-wrap:anywhere!important}",
    ".exit-settlement-print-table-section th{padding-top:4px!important;color:#064e3b!important;font-weight:900!important;text-align:left!important;text-transform:uppercase!important;letter-spacing:.025em!important;border-bottom:1px solid #8fa79a!important}",
    ".exit-settlement-print-table-section th:last-child,.exit-settlement-print-table-section td:last-child{width:30%!important;text-align:right!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}",
    ".exit-settlement-print-table-section tbody tr:last-child td{border-bottom:0!important}",
    ".exit-settlement-print-totals{position:relative;z-index:3;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:16px!important;margin:14px 0 0!important;padding:12px 0 0!important;border-top:2px solid #9a7410!important;break-inside:avoid!important}",
    ".exit-settlement-print-totals>div{display:grid!important;grid-template-columns:1fr auto!important;align-items:baseline!important;gap:12px!important;padding:7px 2px!important;border:0!important;border-radius:0!important}",
    ".exit-settlement-print-totals .net{border:0!important}",
    ".exit-settlement-print-totals strong{color:#064e3b!important;font-size:13pt!important;font-weight:900!important;font-variant-numeric:tabular-nums!important}",
    ".exit-settlement-print-calculation-note,.exit-settlement-headhr-approval,.exit-settlement-external-workflow{position:relative;z-index:3;margin-top:15px!important}",
    ".exit-settlement-print-calculation-note{padding:12px 0 0!important;border:0!important;border-top:1px solid #c7cec9!important;border-radius:0!important;break-inside:auto!important}",
    ".exit-settlement-print-calculation-note h3,.exit-settlement-headhr-approval h3,.exit-settlement-external-title h3{margin:0 0 8px!important;color:#064e3b!important;font-size:13pt!important;font-weight:900!important;letter-spacing:.02em!important}",
    ".exit-settlement-print-calculation-note pre{margin:0!important;color:#17211c!important;background:transparent!important;font:12pt/1.45 Arial,Helvetica,sans-serif!important;white-space:pre-wrap!important;word-break:normal!important;overflow-wrap:anywhere!important}",
    ".exit-settlement-print-hr-note{margin-top:9px!important;padding-top:9px!important;border-top:1px solid #d6d8d5!important;color:#475569!important;font-size:12pt!important;line-height:1.4!important}",
    ".exit-settlement-headhr-approval{padding-top:12px!important;border-top:2px solid #064e3b!important;break-inside:avoid!important}",
    ".exit-settlement-headhr-signature-grid{display:grid!important;grid-template-columns:1.25fr 1.3fr 1.3fr .8fr!important;gap:18px!important;align-items:end!important}",
    ".exit-settlement-headhr-signature-grid>div{display:grid!important;gap:7px!important;padding:4px 0!important;border:0!important;min-height:54px!important}",
    ".exit-settlement-headhr-signature-line{height:24px!important;border-bottom:1px solid #475569!important}",
    ".exit-settlement-external-workflow{padding-top:12px!important;border-top:1px solid #c7cec9!important;break-inside:avoid!important}",
    ".exit-settlement-external-title{margin-bottom:10px!important}",
    ".exit-settlement-external-title p{margin:0!important;color:#64748b!important;font-size:12pt!important;line-height:1.4!important}",
    ".exit-settlement-signatory-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:22px!important;align-items:stretch!important}",
    ".exit-settlement-signatory-block{min-height:120px!important;padding:0!important;border:0!important;border-top:2px solid #d8c788!important;border-radius:0!important;break-inside:avoid!important}",
    ".exit-settlement-signatory-heading{display:flex!important;align-items:center!important;gap:8px!important;margin:10px 0 8px!important}",
    ".exit-settlement-signatory-heading>span{display:inline-grid!important;place-items:center!important;width:24px!important;height:24px!important;border:1px solid #064e3b!important;border-radius:50%!important;color:#064e3b!important;font-size:12pt!important;font-weight:900!important}",
    ".exit-settlement-signatory-heading strong{color:#064e3b!important;font-size:12pt!important;font-weight:900!important}",
    ".exit-settlement-sign-line{margin-top:8px!important}",
    ".exit-settlement-sign-line div{height:20px!important;border-bottom:1px solid #94a3b8!important}",
    ".chris-print-report-footer{position:relative;z-index:3;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;margin-top:16px!important;padding-top:8px!important;border-top:1px solid #94a3b8!important;color:#64748b!important;font-size:12pt!important;break-before:avoid!important}",
    ".chris-print-report-powered{display:inline-flex!important;align-items:center!important;gap:6px!important;color:#64748b!important}",
    ".chris-print-report-powered img{width:22px!important;height:22px!important;object-fit:contain!important;background:transparent!important}",
    ".chris-print-report-powered strong{display:none!important}",
    "@media print{.print-toolbar{display:none!important}html,body{width:297mm!important;min-height:210mm!important;background:#f7f3e8!important}.exit-settlement-print-document{margin:0!important}}"
  ].join("\n");

  printWindow.document.open();
  printWindow.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><base href="' +
      baseHref +
      '"><title></title><style>' +
      printCss +
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

