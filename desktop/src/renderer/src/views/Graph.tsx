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
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const badFiles = useMemo(() => new Set(result.violations.map((v) => v.file)), [result]);
  const edgeSet = useMemo(() => new Set(edges), [edges]);

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
    const radius = (d: Node) => 4 + Math.min(10, Math.sqrt(d.degree) * 1.8);

    const defs = svg.append('defs');
    for (const [id, color] of [['arrow', 'var(--rule-strong)'], ['arrow-v', 'var(--eosin)']]) {
      defs.append('marker').attr('id', id).attr('viewBox', '0 -4 8 8').attr('refX', 8).attr('markerWidth', 6).attr('markerHeight', 6)
        .attr('orient', 'auto').append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', color);
    }

    const stage = svg.append('g');
    const linkSel = stage.append('g').selectAll<SVGLineElement, Link>('line').data(links).join('line')
      .attr('stroke', (d) => (d.violation ? 'var(--eosin)' : 'var(--rule-strong)'))
      .attr('stroke-width', (d) => (d.violation ? 2 : 1))
      .attr('marker-end', (d) => `url(#${d.violation ? 'arrow-v' : 'arrow'})`)
      .attr('class', 'g-link');
    const nodeSel = stage.append('g').selectAll<SVGCircleElement, Node>('circle').data(nodes).join('circle')
      .attr('r', radius)
      .attr('fill', (d) => layerColor(layers, d.layer))
      .attr('stroke', (d) => (d.bad ? 'var(--eosin)' : 'var(--glass)'))
      .attr('stroke-width', (d) => (d.bad ? 2.5 : 1.5))
      .attr('class', 'g-node')
      .style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); setSelected(d.id); });
    nodeSel.append('title').text((d) => d.id);
    const labelSel = stage.append('g').selectAll<SVGTextElement, Node>('text').data(nodes).join('text')
      .attr('class', 'node-label g-label').attr('dy', -10).attr('text-anchor', 'middle')
      .text((d) => basename(d.id));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id((d) => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<Node>().radius((d) => radius(d) + 4))
      // Gravedad suave: mantiene juntos los componentes desconectados
      .force('x', d3.forceX(width / 2).strength(0.07))
      .force('y', d3.forceY(height / 2).strength(0.07))
      .stop();
    // Precalcula el layout para que el grafo aparezca ya asentado
    for (let i = 0; i < 300; i++) sim.tick();

    nodeSel.call(d3.drag<SVGCircleElement, Node>()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    const draw = () => {
      linkSel.each(function (d) {
        const s = d.source as Node, tg = d.target as Node;
        const dx = tg.x! - s.x!, dy = tg.y! - s.y!;
        const len = Math.hypot(dx, dy) || 1;
        const r = radius(tg) + 2;
        d3.select(this).attr('x1', s.x!).attr('y1', s.y!).attr('x2', tg.x! - (dx / len) * r).attr('y2', tg.y! - (dy / len) * r);
      });
      nodeSel.attr('cx', (d) => d.x!).attr('cy', (d) => d.y!);
      labelSel.attr('x', (d) => d.x!).attr('y', (d) => d.y! - radius(d) + 2);
    };
    sim.on('tick', draw);
    draw();

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4]).on('zoom', (e) => {
      stage.attr('transform', e.transform.toString());
      labelSel.style('display', (d) => (e.transform.k > 1.15 || nodes.length < 40 || d.bad ? null : 'none'));
    });
    svg.call(zoom).on('dblclick.zoom', null).on('click', () => setSelected(null));
    labelSel.style('display', (d) => (nodes.length < 40 || d.bad ? null : 'none'));

    // Encaja el grafo dejando libres los controles (arriba) y la leyenda (abajo)
    const fit = (animate = true) => {
      const xs = nodes.map((n) => n.x ?? 0), ys = nodes.map((n) => n.y ?? 0);
      if (!xs.length) return;
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const top = 64, bottom = 52, side = 48;
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
    const visible = (d: Node) => !hidden.has(d.layer ?? '∅');
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
    svg.selectAll<SVGLineElement, Link>('.g-link')
      .style('display', (d) => (visible(d.source as Node) && visible(d.target as Node) ? null : 'none'))
      .attr('opacity', (d) => {
        const s = (d.source as Node).id, tg = (d.target as Node).id;
        if (selected) return s === selected || tg === selected ? 1 : 0.1;
        return q && dim(d.source as Node) && dim(d.target as Node) ? 0.1 : 1;
      });
  }, [hidden, query, selected, result]);

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
