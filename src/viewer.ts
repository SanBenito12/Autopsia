import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { ScanResult } from './types';

/**
 * Visor HTML interactivo del grafo de dependencias.
 * Genera un archivo autocontenido (d3 v7 vía CDN, datos embebidos) con:
 * grafo force-directed coloreado por capa, aristas rojas para imports que
 * violan reglas, tooltip por archivo, panel de violaciones y salud por capa.
 */

/**
 * Deriva el conjunto de aristas (source→target) que corresponden a
 * violaciones, cruzando violations con el grafo:
 * - dependency-direction: detail = "importa <target>"
 * - circular-deps: detail = "a → b → ... → a" (cada par consecutivo)
 * Las reglas sobre imports externos no generan aristas internas.
 */
function violationEdges(result: ScanResult): string[] {
  const edges = new Set<string>();
  for (const v of result.violations) {
    if (!v.detail) continue;
    if (v.rule === 'dependency-direction' && v.detail.startsWith('importa ')) {
      edges.add(`${v.file}|${v.detail.slice('importa '.length)}`);
    } else if (v.rule === 'circular-deps') {
      const chain = v.detail.split(' → ');
      for (let i = 0; i < chain.length - 1; i++) {
        edges.add(`${chain[i]}|${chain[i + 1]}`);
      }
    }
  }
  return [...edges];
}

export function generateHtml(result: ScanResult): string {
  const payload = JSON.stringify({ result, violationEdges: violationEdges(result) })
    // Evita cerrar el <script> si alguna ruta contiene "</script>"
    .replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Autopsia — ${escapeHtml(path.basename(result.root))}</title>
<style>
  :root {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface: #1a1a19;
    --surface-2: #222220;
    --ink: #ffffff;
    --ink-2: #c3c2b7;
    --muted: #898781;
    --hairline: rgba(255, 255, 255, 0.10);
    --edge: #4a4a46;
    --violation: #e34948;
    --good: #0ca30c;
    --warning: #fab219;
    --critical: #d03b3b;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: var(--page);
    color: var(--ink-2);
    font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--hairline);
    background: var(--surface);
    flex-wrap: wrap;
  }
  header h1 { font-size: 16px; color: var(--ink); font-weight: 650; white-space: nowrap; }
  header .meta { color: var(--muted); font-size: 12px; }
  .health { display: flex; gap: 20px; flex-wrap: wrap; margin-left: auto; }
  .health .item { min-width: 130px; }
  .health .label {
    display: flex; justify-content: space-between; gap: 8px;
    font-size: 11px; color: var(--ink-2); margin-bottom: 3px;
  }
  .health .label .pct { color: var(--muted); font-variant-numeric: tabular-nums; }
  .health .bar { height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .health .bar span { display: block; height: 100%; border-radius: 3px; }

  main { flex: 1; display: flex; min-height: 0; }
  #graph { flex: 1; position: relative; }
  #graph svg { display: block; width: 100%; height: 100%; cursor: grab; }
  #graph svg:active { cursor: grabbing; }

  .legend {
    position: absolute; top: 12px; left: 12px;
    background: color-mix(in srgb, var(--surface) 88%, transparent);
    border: 1px solid var(--hairline);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    display: grid; gap: 6px;
  }
  .legend .row { display: flex; align-items: center; gap: 8px; }
  .legend .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .legend .line { width: 16px; height: 0; border-top: 2.5px solid var(--violation); flex: none; }

  #tooltip {
    position: fixed;
    pointer-events: none;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 12px;
    max-width: 340px;
    opacity: 0;
    transition: opacity 0.1s;
    z-index: 10;
  }
  #tooltip .path { color: var(--ink); font-weight: 600; word-break: break-all; }
  #tooltip .sub { color: var(--muted); margin-top: 3px; display: flex; gap: 10px; }
  #tooltip .viol { color: var(--violation); }

  aside {
    width: 340px;
    flex: none;
    border-left: 1px solid var(--hairline);
    background: var(--surface);
    overflow-y: auto;
    padding: 14px;
  }
  aside h2 {
    font-size: 12px; font-weight: 650; color: var(--ink);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 10px;
  }
  aside .clean { color: var(--good); font-size: 13px; }
  .rule-group { margin-bottom: 16px; }
  .rule-group .rule-name {
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 650; color: var(--violation);
    margin-bottom: 6px;
  }
  .rule-group .count {
    background: var(--surface-2); color: var(--ink-2);
    border-radius: 10px; padding: 0 7px; font-size: 11px; font-weight: 500;
  }
  .violation-item {
    border: 1px solid var(--hairline);
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 6px;
    cursor: pointer;
    font-size: 12px;
  }
  .violation-item:hover { background: var(--surface-2); }
  .violation-item.active { border-color: var(--violation); background: var(--surface-2); }
  .violation-item .file { color: var(--ink); word-break: break-all; }
  .violation-item .msg { color: var(--ink-2); margin-top: 2px; }
  .violation-item .detail { color: var(--muted); margin-top: 2px; word-break: break-all; }
</style>
</head>
<body>
<header>
  <div>
    <h1>🔬 Autopsia</h1>
    <div class="meta" id="meta"></div>
  </div>
  <div class="health" id="health"></div>
</header>
<main>
  <div id="graph">
    <div class="legend" id="legend"></div>
  </div>
  <aside>
    <h2 id="panel-title">Violaciones</h2>
    <div id="violations"></div>
  </aside>
</main>
<div id="tooltip"></div>
<script id="autopsia-data" type="application/json">${payload}</script>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<script>
const { result, violationEdges } = JSON.parse(document.getElementById('autopsia-data').textContent);

// ---- Colores por capa (paleta categórica para superficie oscura; el rojo
// queda reservado para violaciones) ----
const PALETTE = ['#3987e5', '#199e70', '#c98500', '#9085e9', '#d55181', '#008300', '#d95926', '#8aa0b8'];
const UNLAYERED = '#898781';
const layers = Object.keys(result.filesByLayer);
const layerColor = new Map(layers.map((l, i) => [l, PALETTE[i % PALETTE.length]]));
const colorOf = (node) => node.layer ? layerColor.get(node.layer) : UNLAYERED;

// ---- Datos derivados ----
const paths = new Set(result.graph.map((n) => n.path));
const violEdgeSet = new Set(violationEdges);
const violationsByFile = new Map();
for (const v of result.violations) {
  violationsByFile.set(v.file, (violationsByFile.get(v.file) ?? 0) + 1);
}

const nodes = result.graph.map((n) => ({ ...n }));
const links = [];
for (const n of result.graph) {
  for (const target of n.internalImports) {
    if (!paths.has(target)) continue;
    links.push({ source: n.path, target, violation: violEdgeSet.has(n.path + '|' + target) });
  }
}
const degree = new Map();
for (const l of links) {
  degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
  degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
}
const radiusOf = (n) => 5 + Math.min(6, Math.sqrt(degree.get(n.path) ?? 0) * 2);

// ---- Header: meta + salud por capa ----
document.getElementById('meta').textContent =
  result.root + ' · ' + result.totalFiles + ' archivos · ' + new Date(result.scannedAt).toLocaleString();

const healthColor = (pct) => pct >= 90 ? 'var(--good)' : pct >= 70 ? 'var(--warning)' : 'var(--critical)';
const healthEl = document.getElementById('health');
for (const [layer, pct] of Object.entries(result.healthByLayer)) {
  const item = document.createElement('div');
  item.className = 'item';
  const label = document.createElement('div');
  label.className = 'label';
  const name = document.createElement('span');
  name.textContent = layer + ' (' + (result.filesByLayer[layer] ?? 0) + ')';
  const val = document.createElement('span');
  val.className = 'pct';
  val.textContent = pct + '%';
  label.append(name, val);
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('span');
  fill.style.width = pct + '%';
  fill.style.background = healthColor(pct);
  bar.append(fill);
  item.append(label, bar);
  healthEl.append(item);
}

// ---- Leyenda ----
const legendEl = document.getElementById('legend');
const legendRow = (swatch, text) => {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.textContent = text;
  row.append(swatch, label);
  legendEl.append(row);
};
for (const layer of layers) {
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = layerColor.get(layer);
  legendRow(dot, layer);
}
if (nodes.some((n) => !n.layer)) {
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = UNLAYERED;
  legendRow(dot, 'sin capa');
}
const line = document.createElement('span');
line.className = 'line';
legendRow(line, 'import con violación');

// ---- Grafo force-directed ----
const graphEl = document.getElementById('graph');
const svg = d3.select(graphEl).append('svg');
const zoomLayer = svg.append('g');

const defs = svg.append('defs');
for (const [id, color] of [['arrow', 'var(--edge)'], ['arrow-violation', 'var(--violation)']]) {
  defs.append('marker')
    .attr('id', id)
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 8)
    .attr('markerWidth', 7)
    .attr('markerHeight', 7)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', color);
}

const link = zoomLayer.append('g')
  .selectAll('line')
  .data(links)
  .join('line')
  .attr('stroke', (d) => d.violation ? 'var(--violation)' : 'var(--edge)')
  .attr('stroke-width', (d) => d.violation ? 2.5 : 1.2)
  .attr('stroke-opacity', (d) => d.violation ? 0.95 : 0.65)
  .attr('marker-end', (d) => d.violation ? 'url(#arrow-violation)' : 'url(#arrow)');

const node = zoomLayer.append('g')
  .selectAll('circle')
  .data(nodes)
  .join('circle')
  .attr('r', radiusOf)
  .attr('fill', colorOf)
  .attr('stroke', (d) => violationsByFile.has(d.path) ? 'var(--violation)' : 'var(--page)')
  .attr('stroke-width', (d) => violationsByFile.has(d.path) ? 2 : 1.5);

const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id((d) => d.path).distance(70))
  .force('charge', d3.forceManyBody().strength(-220))
  .force('center', d3.forceCenter())
  .force('collide', d3.forceCollide().radius((d) => radiusOf(d) + 4));

simulation.on('tick', () => {
  // La arista termina en el borde del nodo destino, para que la flecha se vea
  link.each(function (d) {
    const dx = d.target.x - d.source.x;
    const dy = d.target.y - d.source.y;
    const dist = Math.hypot(dx, dy) || 1;
    const pad = radiusOf(d.target) + 3;
    d3.select(this)
      .attr('x1', d.source.x)
      .attr('y1', d.source.y)
      .attr('x2', d.target.x - (dx / dist) * pad)
      .attr('y2', d.target.y - (dy / dist) * pad);
  });
  node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);
});

function resize() {
  const { width, height } = graphEl.getBoundingClientRect();
  svg.attr('viewBox', [-width / 2, -height / 2, width, height]);
}
resize();
window.addEventListener('resize', resize);

svg.call(d3.zoom().scaleExtent([0.3, 5]).on('zoom', (e) => zoomLayer.attr('transform', e.transform)));

node.call(d3.drag()
  .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
  .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
  .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

// ---- Tooltip ----
const tooltip = document.getElementById('tooltip');
node
  .on('mouseenter', (e, d) => {
    tooltip.replaceChildren();
    const p = document.createElement('div');
    p.className = 'path';
    p.textContent = d.path;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const layer = document.createElement('span');
    layer.textContent = d.layer ?? 'sin capa';
    layer.style.color = colorOf(d);
    const viols = violationsByFile.get(d.path) ?? 0;
    const v = document.createElement('span');
    v.textContent = viols === 1 ? '1 violación' : viols + ' violaciones';
    if (viols > 0) v.className = 'viol';
    sub.append(layer, v);
    tooltip.append(p, sub);
    tooltip.style.opacity = '1';
  })
  .on('mousemove', (e) => {
    const pad = 14;
    const { innerWidth: w, innerHeight: h } = window;
    const r = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.min(e.clientX + pad, w - r.width - 8) + 'px';
    tooltip.style.top = Math.min(e.clientY + pad, h - r.height - 8) + 'px';
  })
  .on('mouseleave', () => { tooltip.style.opacity = '0'; });

// ---- Panel de violaciones agrupadas por regla ----
function highlightNode(filePath) {
  node
    .attr('opacity', (d) => d.path === filePath ? 1 : 0.25)
    .attr('stroke', (d) => d.path === filePath
      ? 'var(--ink)'
      : violationsByFile.has(d.path) ? 'var(--violation)' : 'var(--page)')
    .attr('stroke-width', (d) => d.path === filePath ? 3 : violationsByFile.has(d.path) ? 2 : 1.5)
    .attr('r', (d) => d.path === filePath ? radiusOf(d) * 1.6 : radiusOf(d));
  link.attr('opacity', (d) => d.source.path === filePath || d.target.path === filePath ? 1 : 0.15);
}
function clearHighlight() {
  node
    .attr('opacity', 1)
    .attr('stroke', (d) => violationsByFile.has(d.path) ? 'var(--violation)' : 'var(--page)')
    .attr('stroke-width', (d) => violationsByFile.has(d.path) ? 2 : 1.5)
    .attr('r', radiusOf);
  link.attr('opacity', 1);
}
svg.on('click', () => {
  clearHighlight();
  document.querySelectorAll('.violation-item.active').forEach((el) => el.classList.remove('active'));
});

const panel = document.getElementById('violations');
document.getElementById('panel-title').textContent = 'Violaciones (' + result.violations.length + ')';
if (result.violations.length === 0) {
  const ok = document.createElement('div');
  ok.className = 'clean';
  ok.textContent = '✔ Sin violaciones. Arquitectura sana.';
  panel.append(ok);
}
const byRule = new Map();
for (const v of result.violations) {
  if (!byRule.has(v.rule)) byRule.set(v.rule, []);
  byRule.get(v.rule).push(v);
}
for (const [rule, violations] of byRule) {
  const group = document.createElement('div');
  group.className = 'rule-group';
  const name = document.createElement('div');
  name.className = 'rule-name';
  const title = document.createElement('span');
  title.textContent = '✖ ' + rule;
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = violations.length;
  name.append(title, count);
  group.append(name);

  for (const v of violations) {
    const item = document.createElement('div');
    item.className = 'violation-item';
    const file = document.createElement('div');
    file.className = 'file';
    file.textContent = v.file;
    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = v.message;
    item.append(file, msg);
    if (v.detail) {
      const detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = '↳ ' + v.detail;
      item.append(detail);
    }
    item.addEventListener('click', () => {
      document.querySelectorAll('.violation-item.active').forEach((el) => el.classList.remove('active'));
      item.classList.add('active');
      highlightNode(v.file);
    });
    group.append(item);
  }
  panel.append(group);
}
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function writeHtml(result: ScanResult, outPath: string): void {
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, generateHtml(result), 'utf-8');
  console.log(chalk.gray(`  Visor HTML guardado en ${outPath}`));
  console.log('');
}
