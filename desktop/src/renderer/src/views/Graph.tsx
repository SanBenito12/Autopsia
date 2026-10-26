import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { ScanOk } from '@shared/types';
import type { T } from '../lib/i18n';
import { basename, layerColor } from '../lib/layers';
import { api } from '../lib/api';

interface Node extends d3.SimulationNodeDatum { id: string; layer: string | null; degree: number; bad: boolean }
interface Link extends d3.SimulationLinkDatum<Node> { violation: boolean }

export function Graph({ t, data, root }: { t: T; data: ScanOk; root: string }) {
  const { result, edges } = data;
  const layers = Object.keys(result.filesByLayer);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<{ reset: () => void; focus: (id: string) => void } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [onlyViolations, setOnlyViolations] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const badFiles = useMemo(() => new Set(result.violations.map((v) => v.file)), [result]);
  const edgeSet = useMemo(() => new Set(edges), [edges]);
  const involvedInViolation = useMemo(() => {
    const set = new Set<string>(badFiles);
    for (const edge of edges) {
      const [s, tg] = edge.split('|');
      if (s) set.add(s);
      if (tg) set.add(tg);
    }
    return set;
  }, [badFiles, edges]);

  // Construye la simulación una vez por escaneo
  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    svg.selectAll('*').remove();
    const { width, height } = svgRef.current!.getBoundingClientRect();

    const nodes: Node[] = result.graph.map((n) => ({ id: n.path, layer: n.layer, degree: 0, bad: badFiles.has(n.path) }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: Link[] = [];
    for (const n of result.graph) {
      for (const target of n.internalImports) {
        if (!byId.has(target)) continue;
        links.push({ source: n.path, target, violation: edgeSet.has(`${n.path}|${target}`) });
        byId.get(n.path)!.degree++;
        byId.get(target)!.degree++;
      }
    }
    const radius = (d: Node) => 3.5 + Math.min(9, Math.sqrt(d.degree) * 1.6);

    // Cada capa tiene su "isla": centros repartidos en una elipse; lo sin capa va al centro.
    const groups = [...layers, ...(nodes.some((n) => !n.layer) ? [null] : [])];
    const ring = groups.filter((g) => g !== null);
    const centers = new Map<string | null, { x: number; y: number }>();
    ring.forEach((g, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(ring.length, 1);
      const spread = ring.length > 1 ? 1 : 0;
      centers.set(g, { x: width / 2 + Math.cos(a) * width * 0.48 * spread, y: height / 2 + Math.sin(a) * height * 0.48 * spread });
    });
    centers.set(null, { x: width / 2, y: height / 2 });
    const centerOf = (d: Node) => centers.get(d.layer) ?? centers.get(null)!;

    const defs = svg.append('defs');
    for (const [id, color] of [['arrow', 'var(--rule-strong)'], ['arrow-v', 'var(--eosin)']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 -4 8 8').attr('refX', 7).attr('markerWidth', 5).attr('markerHeight', 5)
        .attr('orient', 'auto').append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', color);
    }
    const glow = defs.append('filter').attr('id', 'glow').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
    glow.append('feGaussianBlur').attr('stdDeviation', 3.5).attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    const stage = svg.append('g');
    const haloLayer = stage.append('g');
    const haloSel = haloLayer.selectAll<SVGCircleElement, string>('circle').data(ring).join('circle')
      .attr('class', 'cluster-halo')
      .attr('fill', (g) => layerColor(layers, g)).attr('fill-opacity', 0.05)
      .attr('stroke', (g) => layerColor(layers, g)).attr('stroke-opacity', 0.3).attr('stroke-dasharray', '2 5');
    // Las etiquetas de capa viven fuera del zoom para leerse siempre al mismo tamaño
    const labelLayer = svg.append('g');
    let view = d3.zoomIdentity;
    const haloLabelSel = labelLayer.selectAll<SVGTextElement, string>('text').data(ring).join('text')
      .attr('class', 'cluster-label').attr('text-anchor', 'middle').attr('fill', (g) => layerColor(layers, g));
    haloLabelSel.append('tspan').text((g) => g);
    haloLabelSel.append('tspan').attr('class', 'cluster-count').attr('dx', 6)
      .text((g) => String(nodes.filter((n) => n.layer === g).length));

    const linkSel = stage.append('g').selectAll<SVGPathElement, Link>('path').data(links).join('path')
      .attr('fill', 'none')
      .attr('stroke', (d) => (d.violation ? 'var(--eosin)' : 'var(--rule-strong)'))
      .attr('stroke-width', (d) => (d.violation ? 1.8 : 0.8))
      .attr('marker-end', (d) => `url(#${d.violation ? 'arrow-v' : 'arrow'})`)
      .attr('class', (d) => `g-link ${d.violation ? 'violation' : ''}`);
    // Las violaciones van encima del resto de aristas
    linkSel.filter((d) => d.violation).raise();
    const ringSel = stage.append('g').selectAll<SVGCircleElement, Node>('circle').data(nodes.filter((n) => n.bad)).join('circle')
      .attr('class', 'g-ring').attr('r', radius);
    const nodeSel = stage.append('g').selectAll<SVGCircleElement, Node>('circle').data(nodes).join('circle')
      .attr('r', radius)
      .attr('fill', (d) => (d.bad ? 'var(--eosin)' : layerColor(layers, d.layer)))
      .attr('stroke', 'var(--glass)')
      .attr('stroke-width', 1.5)
      .attr('filter', (d) => (d.bad ? 'url(#glow)' : null))
      .attr('class', 'g-node')
      .style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); setSelected(d.id); });
    nodeSel.append('title').text((d) => d.id);
    const labelSel = stage.append('g').selectAll<SVGTextElement, Node>('text').data(nodes).join('text')
      .attr('class', (d) => `node-label g-label ${d.bad ? 'bad' : ''}`).attr('text-anchor', 'middle')
      .text((d) => basename(d.id));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id((d) => d.id).distance(42)
        .strength((l) => ((l.source as Node).layer === (l.target as Node).layer ? 0.35 : 0.02)))
      .force('charge', d3.forceManyBody().strength(-90))
      .force('collide', d3.forceCollide<Node>().radius((d) => radius(d) + 3))
      .force('x', d3.forceX<Node>((d) => centerOf(d).x).strength(0.2))
      .force('y', d3.forceY<Node>((d) => centerOf(d).y).strength(0.2))
      .stop();
    // Precalcula el layout para que el grafo aparezca ya asentado
    for (let i = 0; i < 320; i++) sim.tick();

    nodeSel.call(d3.drag<SVGCircleElement, Node>()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    let hulls = new Map<string, { x: number; y: number; r: number }>();
    const placeLabels = () => haloLabelSel
      .attr('x', (g) => view.applyX(hulls.get(g)?.x ?? 0))
      .attr('y', (g) => view.applyY((hulls.get(g)?.y ?? 0) - (hulls.get(g)?.r ?? 0)) - 8);
    const draw = () => {
      linkSel.attr('d', (d) => {
        const s = d.source as Node, tg = d.target as Node;
        const dx = tg.x! - s.x!, dy = tg.y! - s.y!;
        const len = Math.hypot(dx, dy) || 1;
        // Curva suave: el punto de control se separa en perpendicular
        const cx = (s.x! + tg.x!) / 2 - (dy / len) * len * 0.12, cy = (s.y! + tg.y!) / 2 + (dx / len) * len * 0.12;
        const ex = tg.x! - cx, ey = tg.y! - cy, el = Math.hypot(ex, ey) || 1;
        const r = radius(tg) + 2;
        return `M${s.x},${s.y}Q${cx},${cy} ${tg.x! - (ex / el) * r},${tg.y! - (ey / el) * r}`;
      });
      nodeSel.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!);
      ringSel.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!);
      labelSel.attr('x', (d) => d.x!).attr('y', (d) => d.y! - radius(d) - 4);
      const hull = new Map<string, { x: number; y: number; r: number }>();
      for (const g of ring) {
        const members = nodes.filter((n) => n.layer === g);
        if (!members.length) continue;
        const x = d3.mean(members, (n) => n.x!)!, y = d3.mean(members, (n) => n.y!)!;
        const r = (d3.max(members, (n) => Math.hypot(n.x! - x, n.y! - y) + radius(n)) ?? 0) + 18;
        hull.set(g, { x, y, r });
      }
      haloSel.attr('cx', (g) => hull.get(g)?.x ?? 0).attr('cy', (g) => hull.get(g)?.y ?? 0).attr('r', (g) => hull.get(g)?.r ?? 0);
      hulls = hull;
      placeLabels();
    };
    sim.on('tick', draw);
    draw();

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on('zoom', (e) => {
      stage.attr('transform', e.transform.toString());
      view = e.transform;
      placeLabels();
      labelSel.style('display', (d) => (e.transform.k > 1.15 || nodes.length < 40 || (d.bad && e.transform.k > 0.6) ? null : 'none'));
    });
    svg.call(zoom).on('dblclick.zoom', null).on('click', () => setSelected(null));
    labelSel.style('display', (d) => (nodes.length < 40 || d.bad ? null : 'none'));

    // Encaja el grafo dejando libres los controles (arriba) y la leyenda (abajo)
    const fit = (animate = true) => {
      const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
      if (!xs.length) return;
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const top = 96, bottom = 64, side = 72; // deja aire para las etiquetas de cada capa
      const k = Math.max(0.2, Math.min(1.6, Math.min((width - side * 2) / Math.max(x1 - x0, 1), (height - top - bottom) / Math.max(y1 - y0, 1))));
      const transform = d3.zoomIdentity.translate(width / 2, top + (height - top - bottom) / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      if (animate) svg.transition().duration(450).call(zoom.transform, transform);
      else svg.call(zoom.transform, transform);
    };
    fit(false);
    zoomRef.current = {
      reset: fit,
      focus: (id) => {
        const n = byId.get(id);
        if (n?.x === undefined) return;
        svg.transition().duration(450).call(zoom.transform,
          d3.zoomIdentity.translate(width / 2 - 150, height / 2).scale(1.6).translate(-n.x!, -n.y!));
      },
    };
    return () => { sim.stop(); };
  }, [result, edgeSet, badFiles]);

  // Filtros de capa, búsqueda y selección sin reiniciar la simulación
  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    const q = query.trim().toLowerCase();
    const visible = (d: Node) => !hidden.has(d.layer ?? '∅') && (!onlyViolations || involvedInViolation.has(d.id));
    const neighbors = new Set<string>();
    if (selected) {
      neighbors.add(selected);
      const node = result.graph.find((n) => n.path === selected);
      node?.internalImports.forEach((p) => neighbors.add(p));
      result.graph.filter((n) => n.internalImports.includes(selected)).forEach((n) => neighbors.add(n.path));
    }
    const dim = (d: Node) => (q ? !d.id.toLowerCase().includes(q) : selected ? !neighbors.has(d.id) : false);
    svg.selectAll<SVGCircleElement, Node>('.g-node')
      .style('display', (d) => (visible(d) ? null : 'none'))
      .attr('opacity', (d) => (dim(d) ? 0.18 : 1));
    svg.selectAll<SVGTextElement, Node>('.g-label')
      .style('visibility', (d) => (visible(d) ? null : 'hidden'))
      .attr('opacity', (d) => (dim(d) ? 0.15 : 1));
    svg.selectAll<SVGCircleElement, Node>('.g-ring')
      .style('display', (d) => (visible(d) && !dim(d) ? null : 'none'));
    svg.selectAll<SVGElement, string>('.cluster-halo, .cluster-label')
      .style('display', (g) => (hidden.has(g) ? 'none' : null))
      .attr('opacity', selected || q ? 0.35 : 1);
    svg.selectAll<SVGPathElement, Link>('.g-link')
      .style('display', (d) => (visible(d.source as Node) && visible(d.target as Node) ? null : 'none'))
      .attr('opacity', (d) => {
        const s = (d.source as Node).id, tg = (d.target as Node).id;
        if (selected) return s === selected || tg === selected ? 1 : 0.1;
        return q && dim(d.source as Node) && dim(d.target as Node) ? 0.1 : 1;
      });
  }, [hidden, onlyViolations, involvedInViolation, query, selected, result]);

  const toggle = (layer: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    return next;
  });

  const node = selected ? result.graph.find((n) => n.path === selected) : null;
  const importedBy = node ? result.graph.filter((n) => n.internalImports.includes(node.path)).map((n) => n.path) : [];
  const fileViolations = node ? result.violations.filter((v) => v.file === node.path) : [];
  const hasUnclassified = result.graph.some((n) => !n.layer);
  const pick = (id: string) => { setSelected(id); zoomRef.current?.focus(id); };

  return (
    <div className="graph-view">
      <svg ref={svgRef} role="img" aria-label={t('tabGraph')} />
      <div className="graph-controls">
        <div className="chips">
          {layers.map((layer) => (
            <button key={layer} className="chip" aria-pressed={!hidden.has(layer)} onClick={() => toggle(layer)}>
              <i style={{ background: layerColor(layers, layer) }} />{layer}
            </button>
          ))}
          {hasUnclassified && (
            <button className="chip" aria-pressed={!hidden.has('∅')} onClick={() => toggle('∅')}>
              <i style={{ background: 'var(--layer-none)' }} />{t('graphUnclassified')}
            </button>
          )}
          <button
            className="chip"
            aria-pressed={onlyViolations}
            onClick={() => setOnlyViolations((v) => !v)}
          >
            <i style={{ background: 'var(--eosin)' }} />{t('onlyViolations')}
          </button>
        </div>
        <input className="search" placeholder={t('graphSearch')} value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const hit = result.graph.find((n) => n.path.toLowerCase().includes(query.trim().toLowerCase()));
            if (hit) pick(hit.path);
          }} />
        <button className="btn" style={{ height: 26 }} onClick={() => zoomRef.current?.reset()}>{t('graphReset')}</button>
      </div>
      <div className="legend">
        <span><i className="v" />{t('graphLegendViolation')}</span>
        <span><i />{t('graphLegendImport')}</span>
      </div>
      {node && (
        <aside className="node-card selectable">
          <button className="btn quiet close" onClick={() => setSelected(null)} aria-label={t('dismiss')}>×</button>
          <span className="tag" style={{ color: layerColor(layers, node.layer) }}>{node.layer ?? t('graphUnclassified')}</span>
          <h3>{basename(node.path)}</h3>
          <p className="mono" style={{ color: 'var(--muted)' }}>{node.path}</p>
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => api.openInEditor(root, node.path)}>{t('openInEditor')}</button>
          </div>
          <h4>{t('violationsHere')}</h4>
          {fileViolations.length === 0 ? <p className="v" style={{ color: 'var(--muted)' }}>{t('noneHere')}</p>
            : fileViolations.map((v, i) => <p key={i} className="v">{v.message}</p>)}
          <h4>{t('imports', node.internalImports.length)}</h4>
          <ul>{node.internalImports.map((p) => (
            <li key={p}><button className="mono" style={edgeSet.has(`${node.path}|${p}`) ? { color: 'var(--eosin)' } : undefined}
              onClick={() => pick(p)}>{p}</button></li>
          ))}</ul>
          <h4>{t('importedBy', importedBy.length)}</h4>
          <ul>{importedBy.map((p) => <li key={p}><button className="mono" onClick={() => pick(p)}>{p}</button></li>)}</ul>
        </aside>
      )}
    </div>
  );
}
