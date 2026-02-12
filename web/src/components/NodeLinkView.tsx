import { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import ELK from 'elkjs/lib/elk.bundled.js';
import { type ConceptNode, useGraph } from '../providers/GraphProvider';
import { renderBadgeHTML } from './Badge';
import './Badge.css';
import './NodeLinkView.css';

/**
 * Node-Link Diagram (Secondary View)
 *
 * D3-based DAG visualization of local neighborhood around the selected node.
 * Features:
 * - Ancestor chain to root (not just 1-hop parents)
 * - Collapsible clusters for high-degree nodes
 * - Hierarchical elkjs layout (RIGHT direction)
 * - Native scroll for overflow
 * - Click to navigate
 */

/** Real concept node in the layout */
interface RealLayoutNode {
  kind: 'node';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: ConceptNode;
}

/** Cluster pseudo-node representing grouped children */
interface ClusterLayoutNode {
  kind: 'cluster';
  id: string;          // e.g. "cluster:parentId"
  parentId: string;    // the parent whose children are clustered
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;       // how many children are hidden
  childIds: string[];  // the hidden child IDs (for expanding)
  totalDescendants: number;
}

type LayoutNode = RealLayoutNode | ClusterLayoutNode;

interface LayoutEdge {
  source: string;
  target: string;
  sections?: Array<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }>;
}

const elk = new ELK();

const NODE_WIDTH = 180;
const NODE_HEIGHT = 40;
const CLUSTER_WIDTH = 140;
const CLUSTER_HEIGHT = 36;
const MAX_VISIBLE_CHILDREN = 2;
const SVG_PADDING = 80; // Extra room for hover expansion (scale + wider rect)

const ANCESTOR_MIN_DEPTH = 2; // don't show root (0) or its direct children (1)

/**
 * BFS upward through ALL parents from focusId, building a full ancestor DAG.
 * Stops at ANCESTOR_MIN_DEPTH (excludes root and top-level chapters).
 * Returns Set of ancestor node IDs (does not include focusId itself).
 */
function getAncestorDAG(
  focusId: string,
  getParents: (id: string) => ConceptNode[],
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [focusId];
  const visited = new Set<string>([focusId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const parent of getParents(currentId)) {
      if (parent.depth < ANCESTOR_MIN_DEPTH) continue;
      if (visited.has(parent.id)) continue;
      visited.add(parent.id);
      ancestors.add(parent.id);
      queue.push(parent.id);
    }
  }

  if (ancestors.size > 100) {
    console.warn(`Large ancestor DAG: ${ancestors.size} nodes for ${focusId}`);
  }

  return ancestors;
}

/**
 * Build the neighborhood: ancestor chain + focus + children (with clustering).
 * Returns { nodeIds, clusterNodes, edges }.
 */
interface ClusterInfo {
  id: string;
  parentId: string;
  count: number;
  childIds: string[];
  totalDescendants: number;
}

interface Neighborhood {
  /** Ordered: ancestors (root→down), parents, focus, visible children */
  orderedIds: string[];
  /** All real node IDs (for edge filtering) */
  nodeIds: Set<string>;
  clusterNodes: ClusterInfo[];
  /** IDs of ancestor nodes (not including focus or direct children) */
  ancestorIds: Set<string>;
}

function buildNeighborhood(
  focusId: string,
  getParents: (id: string) => ConceptNode[],
  getChildren: (id: string) => ConceptNode[],
  getNode: (id: string) => ConceptNode | null,
  expandedClusters: Set<string>,
): Neighborhood {
  const orderedIds: string[] = [];
  const nodeIds = new Set<string>();
  const clusterNodes: ClusterInfo[] = [];

  function add(id: string) {
    if (!nodeIds.has(id)) {
      nodeIds.add(id);
      orderedIds.push(id);
    }
  }

  // 1. Full ancestor DAG (BFS through all parents, stops at ANCESTOR_MIN_DEPTH)
  const ancestorIds = getAncestorDAG(focusId, getParents);

  // 2. Add ancestors sorted by depth ascending (shallowest first), then id for stability
  const sortedAncestors = [...ancestorIds].sort((a, b) => {
    const nodeA = getNode(a);
    const nodeB = getNode(b);
    const depthDiff = (nodeA?.depth ?? 0) - (nodeB?.depth ?? 0);
    if (depthDiff !== 0) return depthDiff;
    return a.localeCompare(b);
  });
  for (const id of sortedAncestors) add(id);

  // 3. Direct parents of focus (defensive — should already be in DAG)
  for (const p of getParents(focusId)) {
    if (p.depth >= ANCESTOR_MIN_DEPTH) add(p.id);
  }

  // 4. Focus node
  add(focusId);

  // 5. Children of focus — cluster if too many
  const focusChildren = getChildren(focusId);
  const clusterId = `cluster:${focusId}`;
  const clusterExpanded = expandedClusters.has(clusterId);

  if (focusChildren.length > MAX_VISIBLE_CHILDREN && !clusterExpanded) {
    const visible = focusChildren.slice(0, MAX_VISIBLE_CHILDREN);
    const hidden = focusChildren.slice(MAX_VISIBLE_CHILDREN);

    for (const c of visible) add(c.id);

    clusterNodes.push({
      id: clusterId,
      parentId: focusId,
      count: hidden.length,
      childIds: hidden.map(c => c.id),
      totalDescendants: hidden.reduce((sum, c) => sum + c.descendantCount, 0),
    });
  } else {
    for (const c of focusChildren) add(c.id);
  }

  return { orderedIds, nodeIds, clusterNodes, ancestorIds };
}

const HOVER_MAX_WIDTH = 220;

/**
 * Word-wrap text into SVG <tspan> elements that fit within maxWidth.
 * Returns the number of lines created for rect height calculation.
 */
function wrapText(
  textEl: SVGTextElement,
  text: string,
  maxWidth: number,
): number {
  const x = textEl.getAttribute('x') ?? '0';
  const sel = d3.select(textEl);
  sel.text(null); // clear existing content

  const words = text.split(/\s+/);
  let line: string[] = [];
  let lineCount = 0;

  let tspan = sel.append('tspan')
    .attr('x', x)
    .attr('dy', lineCount === 0 ? '0' : '1.2em');

  for (const word of words) {
    line.push(word);
    tspan.text(line.join(' '));
    if (tspan.node()!.getComputedTextLength() > maxWidth && line.length > 1) {
      line.pop();
      tspan.text(line.join(' '));
      line = [word];
      lineCount++;
      tspan = sel.append('tspan')
        .attr('x', x)
        .attr('dy', '1.2em')
        .text(word);
    }
  }

  return lineCount + 1;
}

export function NodeLinkView() {
  const { selectedNodeId, selectNode, setHoveredNodeId, getNode, getParents, getChildren, getGraph } = useGraph();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<LayoutEdge[]>([]);
  const [ancestorNodeIds, setAncestorNodeIds] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoomLevel;
  // SVG-space position of focus node center (set during D3 rendering)
  const focusPosRef = useRef<{ x: number; y: number } | null>(null);
  // SVG natural dimensions (before zoom)
  const svgDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Scroll container so the focus node is visible (not force-centered)
  const scrollToFocus = useCallback((zoom: number) => {
    const pos = focusPosRef.current;
    const container = containerRef.current;
    if (!pos || !container) return;
    // Focus node position in zoomed pixel space
    const fx = pos.x * zoom;
    const fy = pos.y * zoom;
    const margin = 40; // px margin from edge
    const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
    // Only scroll if focus is outside visible area (with margin)
    let newLeft = scrollLeft;
    let newTop = scrollTop;
    if (fx < scrollLeft + margin) newLeft = fx - margin;
    else if (fx > scrollLeft + clientWidth - margin) newLeft = fx - clientWidth + margin;
    if (fy < scrollTop + margin) newTop = fy - margin;
    else if (fy > scrollTop + clientHeight - margin) newTop = fy - clientHeight + margin;
    if (newLeft !== scrollLeft || newTop !== scrollTop) {
      container.scrollLeft = newLeft;
      container.scrollTop = newTop;
    }
  }, []);

  // Center the focus node (used on initial layout)
  const centerOnFocus = useCallback((zoom: number) => {
    const pos = focusPosRef.current;
    const container = containerRef.current;
    if (!pos || !container) return;
    container.scrollLeft = pos.x * zoom - container.clientWidth / 2;
    container.scrollTop = pos.y * zoom - container.clientHeight / 2;
  }, []);

  const zoomToFit = useCallback(() => {
    const container = containerRef.current;
    const dims = svgDimsRef.current;
    if (!container || !dims.width) return;
    const fitZoom = Math.min(
      container.clientWidth / dims.width,
      container.clientHeight / dims.height,
      1,
    );
    setZoomLevel(fitZoom);
    // Scroll to top-left since entire graph fits
    requestAnimationFrame(() => {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    });
  }, []);

  // Reset expanded clusters and zoom when selection changes
  useEffect(() => {
    setExpandedClusters(new Set());
    setZoomLevel(1);
  }, [selectedNodeId]);

  // After zoom changes, resize SVG and keep focus node visible
  useEffect(() => {
    const svg = svgRef.current;
    const dims = svgDimsRef.current;
    if (svg && dims.width) {
      svg.setAttribute('width', String(dims.width * zoomLevel));
      svg.setAttribute('height', String(dims.height * zoomLevel));
    }
    scrollToFocus(zoomLevel);
  }, [zoomLevel, scrollToFocus]);

  // Ctrl+wheel zoom (no pan — native scroll handles that)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoomLevel(prev => {
        const next = prev * (1 - e.deltaY * 0.005);
        return Math.min(2, Math.max(0.2, next));
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const toggleCluster = useCallback((clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  }, []);

  // Build neighborhood and compute layout
  useEffect(() => {
    if (!selectedNodeId) {
      setLayoutNodes([]);
      setLayoutEdges([]);
      return;
    }

    const nodeData = getNode(selectedNodeId);
    if (!nodeData) {
      setLayoutNodes([]);
      setLayoutEdges([]);
      return;
    }

    async function computeLayout() {
      const graph = getGraph();
      const { orderedIds, nodeIds, clusterNodes, ancestorIds } = buildNeighborhood(
        selectedNodeId!, getParents, getChildren, getNode, expandedClusters,
      );

      // Build ELK graph — order matters for NODES_AND_EDGES model order
      const elkNodes = [
        ...orderedIds.map(id => ({
          id,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        })),
        ...clusterNodes.map(c => ({
          id: c.id,
          width: CLUSTER_WIDTH,
          height: CLUSTER_HEIGHT,
        })),
      ];

      const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];

      // Real edges between real nodes in the neighborhood
      for (const id of nodeIds) {
        for (const childId of graph.outNeighbors(id)) {
          if (nodeIds.has(childId)) {
            elkEdges.push({
              id: `${id}->${childId}`,
              sources: [id],
              targets: [childId],
            });
          }
        }
      }

      // Edges from parent to cluster pseudo-node
      for (const c of clusterNodes) {
        elkEdges.push({
          id: `${c.parentId}->${c.id}`,
          sources: [c.parentId],
          targets: [c.id],
        });
      }

      try {
        const elkGraph = await elk.layout({
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.spacing.nodeNode': '40',
            'elk.layered.spacing.nodeNodeBetweenLayers': '60',
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          },
          children: elkNodes,
          edges: elkEdges,
        });

        const clusterMap = new Map(clusterNodes.map(c => [c.id, c]));

        const nodes: LayoutNode[] = (elkGraph.children ?? []).map(elkNode => {
          const cluster = clusterMap.get(elkNode.id);
          if (cluster) {
            return {
              kind: 'cluster' as const,
              id: elkNode.id,
              parentId: cluster.parentId,
              x: elkNode.x ?? 0,
              y: elkNode.y ?? 0,
              width: elkNode.width ?? CLUSTER_WIDTH,
              height: elkNode.height ?? CLUSTER_HEIGHT,
              count: cluster.count,
              childIds: cluster.childIds,
              totalDescendants: cluster.totalDescendants,
            };
          }
          return {
            kind: 'node' as const,
            id: elkNode.id,
            x: elkNode.x ?? 0,
            y: elkNode.y ?? 0,
            width: elkNode.width ?? NODE_WIDTH,
            height: elkNode.height ?? NODE_HEIGHT,
            data: getNode(elkNode.id)!,
          };
        });

        const edges: LayoutEdge[] = (elkGraph.edges ?? []).map(elkEdge => {
          const sections = (elkEdge as { sections?: LayoutEdge['sections'] }).sections;
          return {
            source: elkEdge.sources[0],
            target: elkEdge.targets[0],
            sections,
          };
        });

        setLayoutNodes(nodes);
        setLayoutEdges(edges);
        setAncestorNodeIds(ancestorIds);
      } catch (error) {
        console.error('ELK layout error:', error);
      }
    }

    computeLayout();
  }, [selectedNodeId, getNode, getParents, getChildren, getGraph, expandedClusters]);

  // D3 rendering — native scroll, no zoom
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (layoutNodes.length === 0) return;

    // Clear hover state when layout changes (old nodes destroyed)
    setHoveredNodeId(null);

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Calculate bounds and size the SVG to fit content
    const bounds = {
      minX: Math.min(...layoutNodes.map(n => n.x)),
      maxX: Math.max(...layoutNodes.map(n => n.x + n.width)),
      minY: Math.min(...layoutNodes.map(n => n.y)),
      maxY: Math.max(...layoutNodes.map(n => n.y + n.height)),
    };

    const svgWidth = bounds.maxX - bounds.minX + SVG_PADDING * 2;
    const svgHeight = bounds.maxY - bounds.minY + SVG_PADDING * 2;

    // Use viewBox for natural content; width/height will be set by zoomLevel
    svg
      .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`)
      .attr('width', svgWidth * zoomRef.current)
      .attr('height', svgHeight * zoomRef.current);

    // Offset all content so it starts at SVG_PADDING
    const g = svg.append('g')
      .attr('transform', `translate(${SVG_PADDING - bounds.minX}, ${SVG_PADDING - bounds.minY})`);

    // Draw edges
    const edgesG = g.append('g').attr('class', 'edges');

    layoutEdges.forEach(edge => {
      if (edge.sections && edge.sections.length > 0) {
        const section = edge.sections[0];
        const points: Array<{ x: number; y: number }> = [section.startPoint];
        if (section.bendPoints) {
          points.push(...section.bendPoints);
        }
        points.push(section.endPoint);

        const lineGenerator = d3.line<{ x: number; y: number }>()
          .x(d => d.x)
          .y(d => d.y);

        // Cluster edges get dashed style
        const isClusterEdge = edge.target.startsWith('cluster:');

        edgesG.append('path')
          .attr('class', `node-link-edge${isClusterEdge ? ' cluster-edge' : ''}`)
          .attr('d', lineGenerator(points));
      }
    });

    // Draw nodes
    const nodesG = g.append('g').attr('class', 'nodes');

    layoutNodes.forEach(node => {
      if (node.kind === 'cluster') {
        // Cluster pseudo-node
        const clusterG = nodesG.append('g')
          .attr('class', 'node-link-cluster')
          .attr('transform', `translate(${node.x}, ${node.y})`)
          .style('cursor', 'pointer')
          .on('click', () => toggleCluster(node.id));

        clusterG.append('rect')
          .attr('width', node.width)
          .attr('height', node.height)
          .attr('rx', 12);

        clusterG.append('text')
          .attr('x', node.width / 2)
          .attr('y', 15)
          .attr('text-anchor', 'middle')
          .attr('class', 'cluster-label')
          .text(`${node.count} more children`);

        clusterG.append('text')
          .attr('x', node.width / 2)
          .attr('y', 28)
          .attr('text-anchor', 'middle')
          .attr('class', 'cluster-sublabel')
          .text(`${node.totalDescendants.toLocaleString()} descendants`);

        return;
      }

      // Real node
      const isFocus = node.id === selectedNodeId;
      const isAncestorNode = ancestorNodeIds.has(node.id);

      const fullTitle = node.data.title;
      const truncatedTitle = fullTitle.length > 22
        ? fullTitle.substring(0, 20) + '...'
        : fullTitle;

      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const baseTransform = `translate(${node.x}, ${node.y})`;

      const nodeG = nodesG.append('g')
        .attr('class', `node-link-node${isFocus ? ' focus' : ''}${isAncestorNode ? ' ancestor' : ''}`)
        .attr('transform', baseTransform)
        .style('cursor', 'pointer')
        .on('click', () => selectNode(node.id))
        .on('mouseenter', function () {
          const gEl = d3.select(this);
          gEl.raise();

          // Hide badges during hover expansion (rect grows over them)
          gEl.select('foreignObject').attr('visibility', 'hidden');

          // Wrap the full title into multi-line tspans
          const textEl = gEl.select<SVGTextElement>('.node-title').node()!;
          const lineCount = wrapText(textEl, fullTitle, HOVER_MAX_WIDTH);
          const lineHeight = 13;
          const expandedWidth = Math.min(
            Math.max(node.width, textEl.getBBox().width + 16),
            HOVER_MAX_WIDTH + 16,
          );
          const expandedHeight = Math.max(node.height, 20 + lineCount * lineHeight);

          gEl.select('rect')
            .attr('width', expandedWidth)
            .attr('height', expandedHeight);

          // Scale so the hovered node's text is readable regardless of zoom level.
          // At zoom 1, a mild 1.3x bump. When zoomed out, compensate so the
          // rendered font size stays close to the app's base font.
          const currentZoom = zoomRef.current;
          const renderedFontPx = 11 * currentZoom;
          const targetFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
          const hoverScale = Math.max(1.3, targetFontPx / renderedFontPx);
          gEl.attr('transform',
            `translate(${cx}, ${cy}) scale(${hoverScale}) translate(${-cx}, ${-cy}) translate(${node.x}, ${node.y})`
          );
          setHoveredNodeId(node.id);
        })
        .on('mouseleave', function () {
          const gEl = d3.select(this);
          gEl.select('.node-title').text(null);
          gEl.select('.node-title').text(truncatedTitle);
          gEl.select('rect')
            .attr('width', node.width)
            .attr('height', node.height);
          gEl.select('foreignObject').attr('visibility', 'visible');
          gEl.attr('transform', baseTransform);
          setHoveredNodeId(null);
        });

      nodeG.append('rect')
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('rx', 4);

      nodeG.append('text')
        .attr('x', 8)
        .attr('y', 16)
        .attr('class', 'node-title')
        .text(truncatedTitle);

      // Badges — rendered as HTML inside foreignObject, below the title
      const badgeParts: string[] = [];
      if (node.data.parentCount > 1) {
        badgeParts.push(renderBadgeHTML('parents', node.data.parentCount));
      }
      if (node.data.childCount > 0) {
        badgeParts.push(renderBadgeHTML('children', node.data.childCount));
      }
      if (node.data.descendantCount > node.data.childCount) {
        badgeParts.push(renderBadgeHTML('descendants', node.data.descendantCount));
      }

      if (badgeParts.length > 0) {
        nodeG.append('foreignObject')
          .attr('x', 4)
          .attr('y', 20)
          .attr('width', NODE_WIDTH - 8)
          .attr('height', 18)
          .append('xhtml:div')
          .style('display', 'flex')
          .style('gap', '3px')
          .style('align-items', 'center')
          .style('font-size', '10px')
          .html(badgeParts.join(''));
      }
    });

    // Store SVG dims and focus node position for zoom/scroll helpers
    svgDimsRef.current = { width: svgWidth, height: svgHeight };
    const focusNode = layoutNodes.find(n => n.id === selectedNodeId);
    if (focusNode) {
      focusPosRef.current = {
        x: focusNode.x + focusNode.width / 2 - bounds.minX + SVG_PADDING,
        y: focusNode.y + focusNode.height / 2 - bounds.minY + SVG_PADDING,
      };
    }
    // Center focus node on initial layout
    centerOnFocus(zoomRef.current);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- setHoveredNodeId is a stable useState setter
  }, [layoutNodes, layoutEdges, selectedNodeId, selectNode, toggleCluster, ancestorNodeIds]);

  return (
    <>
      <div className="panel-header">
        Node-Link View -- <span className="header-hint">
          {selectedNodeId ? `${layoutNodes.length} nodes` : 'Select a node'}
        </span>
      </div>
      <div className="node-link-wrapper">
        <div className="panel-content node-link-content" ref={containerRef}>
          {selectedNodeId ? (
            layoutNodes.length > 0 ? (
              <svg ref={svgRef} className="node-link-svg" />
            ) : (
              <div className="placeholder">Computing layout...</div>
            )
          ) : (
            <div className="placeholder">
              Select a concept in the tree to see its neighborhood
            </div>
          )}
        </div>
        {selectedNodeId && layoutNodes.length > 0 && (
          <div className="node-link-controls">
            <button className="zoom-btn" onClick={() => setZoomLevel(z => Math.min(2, z * 1.3))} title="Zoom in">+</button>
            <button className="zoom-btn" onClick={() => setZoomLevel(z => Math.max(0.2, z / 1.3))} title="Zoom out">−</button>
            <button className="zoom-btn" onClick={() => setZoomLevel(1)} title="Reset zoom">↺</button>
            <button className="zoom-btn" onClick={zoomToFit} title="Fit to view">⊡</button>
          </div>
        )}
      </div>
    </>
  );
}
