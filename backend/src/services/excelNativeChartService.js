const CFB = require("cfb");

const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DRAWING_MAIN_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cfbEntry(cfb, path) {
  return CFB.find(cfb, path) || CFB.find(cfb, "/" + path) || null;
}

function readXml(cfb, path) {
  const entry = cfbEntry(cfb, path);
  if (!entry) return "";
  return Buffer.from(entry.content || []).toString("utf8");
}

function writeXml(cfb, path, xml) {
  const absolute = path.startsWith("/") ? path : "/" + path;
  const current = cfbEntry(cfb, path);
  if (current) {
    CFB.utils.cfb_del(cfb, path);
    CFB.utils.cfb_del(cfb, absolute);
  }
  CFB.utils.cfb_add(cfb, absolute, Buffer.from(xml, "utf8"));
}

function appendBeforeClosing(xml, closingTag, fragment) {
  if (!xml.includes(closingTag)) return xml;
  return xml.replace(closingTag, fragment + closingTag);
}

function nextRelationshipId(xml) {
  let max = 0;
  for (const match of xml.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, Number(match[1] || 0));
  }
  return "rId" + (max + 1);
}

function normalizeRange(range) {
  return String(range || "").replace(/^=/, "");
}

function stringCache(values) {
  const rows = Array.isArray(values) ? values : [];
  return (
    '<c:strCache><c:ptCount val="' + rows.length + '"/>' +
    rows.map((value, index) =>
      '<c:pt idx="' + index + '"><c:v>' + xmlEscape(value) + '</c:v></c:pt>'
    ).join("") +
    "</c:strCache>"
  );
}

function numberCache(values) {
  const rows = Array.isArray(values) ? values : [];
  return (
    '<c:numCache><c:formatCode>#,##0.00</c:formatCode><c:ptCount val="' + rows.length + '"/>' +
    rows.map((value, index) =>
      '<c:pt idx="' + index + '"><c:v>' + Number(value || 0) + '</c:v></c:pt>'
    ).join("") +
    "</c:numCache>"
  );
}

function chartTitleXml(title) {
  return (
    "<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r>" +
    '<a:rPr lang="en-US" sz="1400" b="1"><a:solidFill><a:srgbClr val="F2CF57"/></a:solidFill></a:rPr>' +
    "<a:t>" + xmlEscape(title) + "</a:t></a:r></a:p></c:rich></c:tx><c:layout/></c:title>"
  );
}

function seriesXml(series, index, { varyColors = false } = {}) {
  const color = String(series.color || "2EE98B").replace(/^#/, "").toUpperCase();
  const points = varyColors && Array.isArray(series.pointColors)
    ? series.pointColors.map((pointColor, pointIndex) =>
      '<c:dPt><c:idx val="' + pointIndex + '"/><c:spPr><a:solidFill><a:srgbClr val="' +
      String(pointColor || color).replace(/^#/, "").toUpperCase() +
      '"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>'
    ).join("")
    : "";

  return (
    "<c:ser>" +
    '<c:idx val="' + index + '"/><c:order val="' + index + '"/>' +
    "<c:tx><c:v>" + xmlEscape(series.name || ("Series " + (index + 1))) + "</c:v></c:tx>" +
    points +
    '<c:spPr><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:ln></c:spPr>' +
    "<c:cat><c:strRef><c:f>" + xmlEscape(normalizeRange(series.categoriesRange)) + "</c:f>" +
    stringCache(series.categories || []) +
    "</c:strRef></c:cat>" +
    "<c:val><c:numRef><c:f>" + xmlEscape(normalizeRange(series.valuesRange)) + "</c:f>" +
    numberCache(series.values || []) +
    "</c:numRef></c:val>" +
    "</c:ser>"
  );
}

function axisXml(catAxId, valAxId, horizontal = false) {
  return (
    '<c:catAx><c:axId val="' + catAxId + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
    '<c:delete val="0"/><c:axPos val="' + (horizontal ? "l" : "b") + '"/>' +
    '<c:tickLblPos val="nextTo"/><c:crossAx val="' + valAxId + '"/><c:crosses val="autoZero"/>' +
    '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>' +
    '<c:valAx><c:axId val="' + valAxId + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
    '<c:delete val="0"/><c:axPos val="' + (horizontal ? "b" : "l") + '"/>' +
    '<c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/>' +
    '<c:crossAx val="' + catAxId + '"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>'
  );
}

function cartesianChartXml(chart, chartIndex) {
  const horizontal = chart.type === "bar";
  const tag = chart.type === "line" ? "lineChart" : "barChart";
  const catAxId = 700000 + chartIndex * 10 + 1;
  const valAxId = 700000 + chartIndex * 10 + 2;
  const varyColors = chart.series?.length === 1 && Array.isArray(chart.series?.[0]?.pointColors);

  const typeHeader = chart.type === "line"
    ? '<c:grouping val="standard"/><c:varyColors val="' + (varyColors ? 1 : 0) + '"/>'
    : '<c:barDir val="' + (horizontal ? "bar" : "col") + '"/><c:grouping val="clustered"/><c:varyColors val="' + (varyColors ? 1 : 0) + '"/>';

  const marker = chart.type === "line" ? '<c:marker val="1"/><c:smooth val="0"/>' : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<c:chartSpace xmlns:c="' + CHART_NS + '" xmlns:a="' + DRAWING_MAIN_NS + '" xmlns:r="' + OFFICE_REL_NS + '">' +
    '<c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="1"/>' +
    "<c:chart>" + chartTitleXml(chart.title) + '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' +
    "<c:" + tag + ">" + typeHeader +
    (chart.series || []).map((series, index) => seriesXml(series, index, { varyColors })).join("") +
    '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/></c:dLbls>' +
    marker +
    '<c:axId val="' + catAxId + '"/><c:axId val="' + valAxId + '"/></c:' + tag + ">" +
    axisXml(catAxId, valAxId, horizontal) +
    "</c:plotArea>" +
    '<c:legend><c:legendPos val="b"/><c:layout/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    "</c:chart>" +
    '<c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>' +
    "</c:chartSpace>"
  );
}

function pieChartXml(chart, chartIndex) {
  const series = chart.series?.[0] || {};
  const colors = series.pointColors || ["2EE98B", "F2CF57", "60A5FA", "FB7185", "A78BFA", "34D399", "F59E0B", "22D3EE"];
  const pointXml = (series.values || []).map((_, index) =>
    '<c:dPt><c:idx val="' + index + '"/><c:spPr><a:solidFill><a:srgbClr val="' +
    colors[index % colors.length] +
    '"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>'
  ).join("");

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<c:chartSpace xmlns:c="' + CHART_NS + '" xmlns:a="' + DRAWING_MAIN_NS + '" xmlns:r="' + OFFICE_REL_NS + '">' +
    '<c:lang val="en-US"/><c:roundedCorners val="1"/><c:chart>' + chartTitleXml(chart.title) +
    '<c:plotArea><c:layout/><c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>' +
    "<c:tx><c:v>" + xmlEscape(series.name || "Value") + "</c:v></c:tx>" + pointXml +
    "<c:cat><c:strRef><c:f>" + xmlEscape(normalizeRange(series.categoriesRange)) + "</c:f>" + stringCache(series.categories || []) + "</c:strRef></c:cat>" +
    "<c:val><c:numRef><c:f>" + xmlEscape(normalizeRange(series.valuesRange)) + "</c:f>" + numberCache(series.values || []) + "</c:numRef></c:val>" +
    '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showLeaderLines val="1"/></c:dLbls>' +
    "</c:ser></c:pieChart></c:plotArea>" +
    '<c:legend><c:legendPos val="r"/><c:layout/></c:legend><c:plotVisOnly val="1"/>' +
    "</c:chart>" +
    '<c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>' +
    "</c:chartSpace>"
  );
}

function drawingAnchor(chart, index) {
  const from = chart.position?.from || { col: 10, row: 1 };
  const to = chart.position?.to || { col: 18, row: 15 };
  return (
    "<xdr:twoCellAnchor>" +
    "<xdr:from><xdr:col>" + Number(from.col || 0) + "</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>" + Number(from.row || 0) + "</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>" +
    "<xdr:to><xdr:col>" + Number(to.col || 0) + "</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>" + Number(to.row || 0) + "</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>" +
    '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (index + 2) + '" name="' + xmlEscape(chart.title || ("Chart " + (index + 1))) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
    '<xdr:xfrm/><a:graphic><a:graphicData uri="' + CHART_NS + '"><c:chart xmlns:c="' + CHART_NS + '" xmlns:r="' + OFFICE_REL_NS + '" r:id="rId' + (index + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame>' +
    "<xdr:clientData/></xdr:twoCellAnchor>"
  );
}

function addNativeExcelCharts(buffer, charts = [], { sheetPath = "xl/worksheets/sheet1.xml" } = {}) {
  const validCharts = (charts || []).filter((chart) => chart?.series?.length);
  if (!validCharts.length) return buffer;

  const cfb = CFB.read(buffer, { type: "buffer" });
  let sheetXml = readXml(cfb, sheetPath);
  if (!sheetXml) return buffer;

  if (!/xmlns:r=/.test(sheetXml)) {
    sheetXml = sheetXml.replace(
      /<worksheet\b/,
      '<worksheet xmlns:r="' + OFFICE_REL_NS + '"'
    );
  }

  const relPath = sheetPath.replace("worksheets/", "worksheets/_rels/") + ".rels";
  let sheetRels = readXml(cfb, relPath);
  if (!sheetRels) {
    sheetRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + REL_NS + '"></Relationships>';
  }
  const drawingRelId = nextRelationshipId(sheetRels);
  sheetRels = appendBeforeClosing(
    sheetRels,
    "</Relationships>",
    '<Relationship Id="' + drawingRelId + '" Type="' + OFFICE_REL_NS + '/drawing" Target="../drawings/drawing1.xml"/>'
  );
  writeXml(cfb, relPath, sheetRels);

  sheetXml = sheetXml.replace(/<drawing\b[^>]*\/>/g, "");
  sheetXml = appendBeforeClosing(sheetXml, "</worksheet>", '<drawing r:id="' + drawingRelId + '"/>');
  writeXml(cfb, sheetPath, sheetXml);

  const drawingXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="' + DRAWING_NS + '" xmlns:a="' + DRAWING_MAIN_NS + '" xmlns:c="' + CHART_NS + '" xmlns:r="' + OFFICE_REL_NS + '">' +
    validCharts.map(drawingAnchor).join("") +
    "</xdr:wsDr>";
  writeXml(cfb, "xl/drawings/drawing1.xml", drawingXml);

  const drawingRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="' + REL_NS + '">' +
    validCharts.map((_, index) =>
      '<Relationship Id="rId' + (index + 1) + '" Type="' + OFFICE_REL_NS + '/chart" Target="../charts/chart' + (index + 1) + '.xml"/>'
    ).join("") +
    "</Relationships>";
  writeXml(cfb, "xl/drawings/_rels/drawing1.xml.rels", drawingRels);

  validCharts.forEach((chart, index) => {
    const xml = chart.type === "pie"
      ? pieChartXml(chart, index + 1)
      : cartesianChartXml(chart, index + 1);
    writeXml(cfb, "xl/charts/chart" + (index + 1) + ".xml", xml);
  });

  let contentTypes = readXml(cfb, "[Content_Types].xml");
  if (contentTypes) {
    if (!contentTypes.includes('PartName="/xl/drawings/drawing1.xml"')) {
      contentTypes = appendBeforeClosing(
        contentTypes,
        "</Types>",
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
      );
    }
    validCharts.forEach((_, index) => {
      const partName = "/xl/charts/chart" + (index + 1) + ".xml";
      if (!contentTypes.includes('PartName="' + partName + '"')) {
        contentTypes = appendBeforeClosing(
          contentTypes,
          "</Types>",
          '<Override PartName="' + partName + '" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'
        );
      }
    });
    writeXml(cfb, "[Content_Types].xml", contentTypes);
  }

  return CFB.write(cfb, {
    type: "buffer",
    fileType: "zip",
    compression: true,
  });
}

module.exports = {
  addNativeExcelCharts,
};
