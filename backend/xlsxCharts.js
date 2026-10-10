// ExcelJS cannot create charts. This module post-processes the .xlsx (a zip of XML files) and adds
// real, editable Excel charts (bar / column / stacked / line / pie / doughnut) that point at worksheet cells.
const JSZip = require('jszip');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const PALETTE = ['2ECC71', '0F1B2D', 'F59E0B', '6C63FF', 'EF4444', '06B6D4', 'EC4899', '84CC16', '8B5CF6', '14B8A6', 'F97316', '64748B'];

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';

const colLetter = (n) => { // 1-based
  let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};
// Build an absolute range reference like 'Sheet Name'!$B$3:$B$9 (1-based col/row)
function ref(sheet, c1, r1, c2 = c1, r2 = r1) {
  const q = `'${String(sheet).replace(/'/g, "''")}'`;
  const a = `$${colLetter(c1)}$${r1}`;
  const b = `$${colLetter(c2)}$${r2}`;
  return `${q}!${a}${a === b ? '' : ':' + b}`;
}

const txPr = (sz, bold = false, color = '5B6577') =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;

function titleXml(text) {
  if (!text) return '<c:autoTitleDeleted val="1"/>';
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"><a:solidFill><a:srgbClr val="0F1B2D"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US" sz="1300" b="1"><a:solidFill><a:srgbClr val="0F1B2D"/></a:solidFill></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
}

function strCache(values) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
}
function numCache(values, fmt = 'General') {
  return `<c:numCache><c:formatCode>${esc(fmt)}</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => (v === null || v === undefined || Number.isNaN(v) ? '' : `<c:pt idx="${i}"><c:v>${Number(v)}</c:v></c:pt>`)).join('')}</c:numCache>`;
}
const fill = (hex) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;

function serXml(chart, s, i, kind) {
  const color = s.color || PALETTE[i % PALETTE.length];
  const tx = s.nameRef
    ? `<c:tx><c:strRef><c:f>${esc(s.nameRef)}</c:f>${strCache([s.name || ''])}</c:strRef></c:tx>`
    : `<c:tx><c:v>${esc(s.name || `Series ${i + 1}`)}</c:v></c:tx>`;
  const cat = chart.categories
    ? `<c:cat><c:strRef><c:f>${esc(chart.categories.ref)}</c:f>${strCache(chart.categories.values)}</c:strRef></c:cat>` : '';
  const val = `<c:val><c:numRef><c:f>${esc(s.ref)}</c:f>${numCache(s.values, chart.numFmt || 'General')}</c:numRef></c:val>`;
  const labels = chart.labels
    ? `<c:dLbls><c:numFmt formatCode="${esc(chart.numFmt || 'General')}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(800, false, '0F1B2D')}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` : '';

  if (kind === 'bar') {
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr>${fill(color)}</c:spPr><c:invertIfNegative val="0"/>${labels}${cat}${val}</c:ser>`;
  }
  if (kind === 'line') {
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}<c:spPr><a:ln w="28575" cap="rnd">${fill(color)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(color)}<a:ln w="9525">${fill(color)}</a:ln></c:spPr></c:marker>${labels}${cat}${val}<c:smooth val="0"/></c:ser>`;
  }
  // pie / doughnut: one series, each slice its own colour
  const n = s.values.length;
  const dpts = Array.from({ length: n }, (_, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr>${fill(PALETTE[k % PALETTE.length])}<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
  const plabels = `<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900, true, 'FFFFFF')}<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`;
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${dpts}${plabels}${cat}${val}</c:ser>`;
}

function axesXml(chart, kind) {
  const horizontal = kind === 'bar' && chart.horizontal;
  const catPos = horizontal ? 'l' : 'b';
  const valPos = horizontal ? 'b' : 'l';
  const fmt = esc(chart.numFmt || 'General');
  const grid = '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E8EAED"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
  const line = '<c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="C9CED6"/></a:solidFill></a:ln></c:spPr>';
  return `<c:catAx><c:axId val="50010"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${line}${txPr(900)}<c:crossAx val="50020"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="50020"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/>${grid}<c:numFmt formatCode="${fmt}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="${horizontal ? 'high' : 'nextTo'}"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}<c:crossAx val="50010"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
}

function chartXml(chart) {
  const type = chart.type;
  let plot = '';
  if (type === 'bar' || type === 'column') {
    const sers = chart.series.map((s, i) => serXml(chart, s, i, 'bar')).join('');
    const grouping = chart.stacked ? 'stacked' : 'clustered';
    plot = `<c:barChart><c:barDir val="${chart.horizontal ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="${chart.stacked ? 60 : 80}"/>${chart.stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="50010"/><c:axId val="50020"/></c:barChart>${axesXml(chart, 'bar')}`;
  } else if (type === 'line') {
    const sers = chart.series.map((s, i) => serXml(chart, s, i, 'line')).join('');
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="50010"/><c:axId val="50020"/></c:lineChart>${axesXml(chart, 'line')}`;
  } else if (type === 'pie') {
    plot = `<c:pieChart><c:varyColors val="1"/>${serXml(chart, chart.series[0], 0, 'pie')}<c:firstSliceAng val="0"/></c:pieChart>`;
  } else if (type === 'doughnut') {
    plot = `<c:doughnutChart><c:varyColors val="1"/>${serXml(chart, chart.series[0], 0, 'pie')}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  } else {
    throw new Error(`Unsupported chart type: ${type}`);
  }
  const multi = type === 'pie' || type === 'doughnut' || chart.series.length > 1;
  const legend = multi ? `<c:legend><c:legendPos val="${type === 'pie' || type === 'doughnut' ? 'r' : 'b'}"/><c:overlay val="0"/>${txPr(900)}</c:legend>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>${titleXml(chart.title)}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E3E6EB"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:chartSpace>`;
}

function anchorXml(a, rid, id, name) {
  // a: { col, row, cols, rows } zero-based top-left cell + size in cells
  const c1 = a.col, r1 = a.row, c2 = a.col + a.cols, r2 = a.row + a.rows;
  return `<xdr:twoCellAnchor><xdr:from><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${esc(name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

async function injectCharts(buffer, charts) {
  if (!charts || !charts.length) return buffer;
  const zip = await JSZip.loadAsync(buffer);

  // sheet name -> worksheet part path
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const relTarget = {};
  (wbRels.match(/<Relationship\b[^>]*>/g) || []).forEach(tag => {
    const id = /\bId="([^"]+)"/.exec(tag), tg = /\bTarget="([^"]+)"/.exec(tag);
    if (id && tg) relTarget[id[1]] = tg[1];
  });
  const sheetPath = {};
  (wbXml.match(/<sheet\b[^>]*>/g) || []).forEach(tag => {
    const nm = /\bname="([^"]*)"/.exec(tag), rid = /\br:id="([^"]+)"/.exec(tag);
    if (nm && rid && relTarget[rid[1]]) {
      let t = relTarget[rid[1]].replace(/^\/?(xl\/)?/, '');
      sheetPath[unesc(nm[1])] = `xl/${t}`;
    }
  });

  let ct = await zip.file('[Content_Types].xml').async('string');
  const addOverride = (part, type) => {
    if (!ct.includes(`PartName="${part}"`)) ct = ct.replace('</Types>', `<Override PartName="${part}" ContentType="${type}"/></Types>`);
  };

  const bySheet = new Map();
  charts.forEach(c => { if (!bySheet.has(c.sheet)) bySheet.set(c.sheet, []); bySheet.get(c.sheet).push(c); });

  let chartNo = 0, drawNo = 0;
  for (const [sheet, list] of bySheet) {
    const path = sheetPath[sheet];
    if (!path) throw new Error(`injectCharts: sheet "${sheet}" not found`);
    drawNo++;
    const relsPath = path.replace('worksheets/', 'worksheets/_rels/') + '.rels';
    let anchors = '', dRels = '';
    list.forEach((chart, i) => {
      chartNo++;
      zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(chart));
      addOverride(`/xl/charts/chart${chartNo}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml');
      dRels += `<Relationship Id="rId${i + 1}" Type="${NS_R}/chart" Target="../charts/chart${chartNo}.xml"/>`;
      anchors += anchorXml(chart.anchor, `rId${i + 1}`, i + 2, chart.title || `Chart ${chartNo}`);
    });
    zip.file(`xl/drawings/drawing${drawNo}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${anchors}</xdr:wsDr>`);
    zip.file(`xl/drawings/_rels/drawing${drawNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${dRels}</Relationships>`);
    addOverride(`/xl/drawings/drawing${drawNo}.xml`, 'application/vnd.openxmlformats-officedocument.drawing+xml');

    // sheet -> drawing relationship
    const rid = `rIdChartDrw${drawNo}`;
    const relXml = `<Relationship Id="${rid}" Type="${NS_R}/drawing" Target="../drawings/drawing${drawNo}.xml"/>`;
    if (zip.file(relsPath)) {
      let r = await zip.file(relsPath).async('string');
      r = r.replace('</Relationships>', `${relXml}</Relationships>`);
      zip.file(relsPath, r);
    } else {
      zip.file(relsPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relXml}</Relationships>`);
    }

    // <drawing r:id=".."/> must sit before legacyDrawing / tableParts / extLst
    let sx = await zip.file(path).async('string');
    const tag = `<drawing r:id="${rid}"/>`;
    const m = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sx);
    sx = m ? sx.slice(0, m.index) + tag + sx.slice(m.index) : sx.replace('</worksheet>', `${tag}</worksheet>`);
    zip.file(path, sx);
  }
  zip.file('[Content_Types].xml', ct);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { injectCharts, ref, colLetter, PALETTE };
