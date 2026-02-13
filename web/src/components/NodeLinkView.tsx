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
 * - D3 data-join with enter/update/exit animation
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
  manual?: boolean;
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
  id: string;
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
const SVG_PADDING = 30;
const TRANSITION_DURATION = 400;

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
 * Build the neighborhood: ancestor chain + focus + children (with clustering)
 * + manually added nodes.
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
  /** IDs of manually added nodes */
  manualIds: Set<string>;
}

function buildNeighborhood(
  focusId: string,
  getParents: (id: string) => ConceptNode[],
  getChildren: (id: string) => ConceptNode[],
  getNode: (id: string) => ConceptNode | null,
  expandedClusters: Set<string>,
  manualNodeIds: Set<string>,
): Neighborhood {
  const orderedIds: string[] = [];
  const nodeIds = new Set<string>();
  const clusterNodes: ClusterInfo[] = [];
  const manualIds = new Set<string>();

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

  // 6. Manually added nodes — add them plus edges to/from existing nodes
  for (const manualId of manualNodeIds) {
    if (!nodeIds.has(manualId) && getNode(manualId)) {
      add(manualId);
      manualIds.add(manualId);
    }
  }

  return { orderedIds, nodeIds, clusterNodes, ancestorIds, manualIds };
}

/** Build an SVG path string from ELK edge sections */
function edgePath(edge: LayoutEdge): string {
  if (!edge.sections?.length) return '';
  const section = edge.sections[0];
  const points: Array<{ x: number; y: number }> = [section.startPoint];
  if (section.bendPoints) points.push(...section.bendPoints);
  points.push(section.endPoint);
  return d3.line<{ x: number; y: number }>()
    .x(d => d.x)
    .y(d => d.y)(points) ?? '';
}

export function NodeLinkView() {
  const {
    selectedNodeId, selectNode, setHoveredNodeId,
    getNode, getParents, getChildren, getGraph,
    manualNodeIds, addManualNodes, undoManualNodes, resetManualNodes,
    highlightedNodeIds, setHighlightedNodeIds,
  } = useGraph();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<LayoutEdge[]>([]);
  const [ancestorNodeIds, setAncestorNodeIds] = useState<Set<string>>(new Set());
  const [manualLayoutIds, setManualLayoutIds] = useState<Set<string>>(new Set());
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  // Tooltip for badge hover overlay (fallback model: no layout on hover)
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoomLevel;
  // Position cache for animation: node ID → last known {x, y}
  const positionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // SVG-space position of focus node center (set during D3 rendering)
  const focusPosRef = useRef<{ x: number; y: number } | null>(null);
  // SVG natural dimensions (before zoom)
  const svgDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  // Track whether this is the initial render (no animation)
  const isInitialRenderRef = useRef(true);
  // Track offset for viewBox → SVG coordinate mapping
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Scroll container so the focus node is visible (not force-centered)
  const scrollToFocus = useCallback((zoom: number) => {
    const pos = focusPosRef.current;
    const container = containerRef.current;
    if (!pos || !container) return;
    const fx = pos.x * zoom;
    const fy = pos.y * zoom;
    const margin = 40;
    const { scrollLeft, scrollTop, clientWidth, clientHeight } = container;
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
    requestAnimationFrame(() => {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    });
  }, []);

  // Reset expanded clusters, tooltip, and zoom when selection changes
  useEffect(() => {
    setExpandedClusters(new Set());
    setZoomLevel(1);
    isInitialRenderRef.current = true;
    positionCacheRef.current.clear();
    cancelHideTimer();
    if (tooltipRef.current) {
      tooltipRef.current.remove();
      tooltipRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cancelHideTimer is stable
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

  // Keyboard shortcuts: Ctrl+Z = undo expansion, Escape = reset
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undoManualNodes();
      } else if (e.key === 'Escape') {
        resetManualNodes();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoManualNodes, resetManualNodes]);

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
      const { orderedIds, nodeIds, clusterNodes, ancestorIds, manualIds } = buildNeighborhood(
        selectedNodeId!, getParents, getChildren, getNode, expandedClusters, manualNodeIds,
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
            manual: manualIds.has(elkNode.id),
          };
        });

        const edges: LayoutEdge[] = (elkGraph.edges ?? []).map(elkEdge => {
          const sections = (elkEdge as { sections?: LayoutEdge['sections'] }).sections;
          return {
            id: `${elkEdge.sources[0]}->${elkEdge.targets[0]}`,
            source: elkEdge.sources[0],
            target: elkEdge.targets[0],
            sections,
          };
        });

        setLayoutNodes(nodes);
        setLayoutEdges(edges);
        setAncestorNodeIds(ancestorIds);
        setManualLayoutIds(manualIds);
      } catch (error) {
        console.error('ELK layout error:', error);
      }
    }

    computeLayout();
  }, [selectedNodeId, getNode, getParents, getChildren, getGraph, expandedClusters, manualNodeIds]);

  // D3 rendering with data-join (enter/update/exit animation)
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (layoutNodes.length === 0) {
      // Clear SVG if no nodes
      d3.select(svgRef.current).selectAll('*').remove();
      return;
    }

    setHoveredNodeId(null);

    const svg = d3.select(svgRef.current);
    const isInitial = isInitialRenderRef.current;

    // Calculate bounds and size the SVG to fit content
    const bounds = {
      minX: Math.min(...layoutNodes.map(n => n.x)),
      maxX: Math.max(...layoutNodes.map(n => n.x + n.width)),
      minY: Math.min(...layoutNodes.map(n => n.y)),
      maxY: Math.max(...layoutNodes.map(n => n.y + n.height)),
    };

    const svgWidth = bounds.maxX - bounds.minX + SVG_PADDING * 2;
    const svgHeight = bounds.maxY - bounds.minY + SVG_PADDING * 2;
    const offsetX = SVG_PADDING - bounds.minX;
    const offsetY = SVG_PADDING - bounds.minY;
    offsetRef.current = { x: offsetX, y: offsetY };

    svg
      .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`)
      .attr('width', svgWidth * zoomRef.current)
      .attr('height', svgHeight * zoomRef.current);

    // Ensure top-level groups exist (create once, reuse)
    let g = svg.select<SVGGElement>('g.root-group');
    if (g.empty()) {
      g = svg.append('g').attr('class', 'root-group');
      g.append('g').attr('class', 'edges');
      g.append('g').attr('class', 'nodes');
    }
    g.attr('transform', `translate(${offsetX}, ${offsetY})`);

    const edgesG = g.select<SVGGElement>('g.edges');
    const nodesG = g.select<SVGGElement>('g.nodes');

    const posCache = positionCacheRef.current;
    const dur = isInitial ? 0 : TRANSITION_DURATION;

    // --- EDGE DATA-JOIN ---
    const edgeSelection = edgesG
      .selectAll<SVGPathElement, LayoutEdge>('path.node-link-edge')
      .data(layoutEdges, d => d.id);

    // Exit edges: fade out
    edgeSelection.exit<LayoutEdge>()
      .transition().duration(dur).ease(d3.easeCubicOut)
      .attr('opacity', 0)
      .remove();

    // Enter edges: start invisible, animate in
    const edgeEnter = edgeSelection.enter()
      .append('path')
      .attr('class', d => `node-link-edge${d.target.startsWith('cluster:') ? ' cluster-edge' : ''}`)
      .attr('d', d => edgePath(d))
      .attr('opacity', isInitial ? 1 : 0);

    // Update + Enter: animate to final path and opacity
    edgeEnter.merge(edgeSelection)
      .transition().duration(dur).ease(d3.easeCubicOut)
      .attr('d', d => edgePath(d))
      .attr('opacity', 1);

    // --- NODE DATA-JOIN ---
    const nodeSelection = nodesG
      .selectAll<SVGGElement, LayoutNode>('g.nl-item')
      .data(layoutNodes, d => d.id);

    // Exit nodes: scale down and remove
    nodeSelection.exit<LayoutNode>()
      .each(function (d) {
        // Save last position before removal
        posCache.set(d.id, { x: d.x, y: d.y });
      })
      .transition().duration(dur).ease(d3.easeCubicOut)
      .attr('transform', d => {
        const cx = d.x + d.width / 2;
        const cy = d.y + d.height / 2;
        return `translate(${cx}, ${cy}) scale(0)`;
      })
      .attr('opacity', 0)
      .remove();

    // Enter nodes
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'nl-item')
      .attr('transform', d => {
        if (isInitial) {
          return `translate(${d.x}, ${d.y})`;
        }
        // Start from cached position or target center (scale 0)
        const cached = posCache.get(d.id);
        if (cached) {
          return `translate(${cached.x}, ${cached.y})`;
        }
        const cx = d.x + d.width / 2;
        const cy = d.y + d.height / 2;
        return `translate(${cx}, ${cy}) scale(0)`;
      })
      .attr('opacity', d => {
        if (isInitial) return 1;
        return posCache.has(d.id) ? 1 : 0;
      });

    // Merge enter + update, render contents, then animate
    const allNodes = nodeEnter.merge(nodeSelection);

    // Re-render inner contents for all nodes (pragmatic: recreate cheap inner elements)
    allNodes.each(function (node) {
      const gEl = d3.select<SVGGElement, LayoutNode>(this);
      gEl.selectAll('*').remove();

      if (node.kind === 'cluster') {
        renderClusterContents(gEl, node);
      } else {
        renderNodeContents(gEl, node);
      }
    });

    // Animate to final positions
    allNodes
      .transition().duration(dur).ease(d3.easeCubicOut)
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .attr('opacity', 1);

    // Update position cache with new positions
    for (const node of layoutNodes) {
      posCache.set(node.id, { x: node.x, y: node.y });
    }

    // Store SVG dims and focus node position for zoom/scroll helpers
    svgDimsRef.current = { width: svgWidth, height: svgHeight };
    const focusNode = layoutNodes.find(n => n.id === selectedNodeId);
    if (focusNode) {
      focusPosRef.current = {
        x: focusNode.x + focusNode.width / 2 + offsetX,
        y: focusNode.y + focusNode.height / 2 + offsetY,
      };
    }

    if (isInitial) {
      centerOnFocus(zoomRef.current);
    } else {
      // After animation completes, ensure focus is visible
      setTimeout(() => scrollToFocus(zoomRef.current), TRANSITION_DURATION + 50);
    }

    isInitialRenderRef.current = false;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- setHoveredNodeId, setHighlightedNodeIds are stable useState setters
  }, [layoutNodes, layoutEdges, selectedNodeId, selectNode, toggleCluster, ancestorNodeIds, manualLayoutIds]);

  // Lightweight highlight effect — toggles CSS class without re-rendering
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGGElement, LayoutNode>('g.node-link-node').each(function (d) {
      d3.select(this).classed('highlighted', highlightedNodeIds.has(d.id));
    });
  }, [highlightedNodeIds]);

  /** Render cluster pseudo-node inner contents */
  function renderClusterContents(
    gEl: d3.Selection<SVGGElement, LayoutNode, null, undefined>,
    node: ClusterLayoutNode,
  ) {
    gEl
      .attr('class', 'nl-item node-link-cluster')
      .style('cursor', 'pointer')
      .on('click', () => toggleCluster(node.id))
      .on('mouseenter', function () {
        cancelHideTimer();
        // Cross-panel highlighting for cluster children
        setHighlightedNodeIds(new Set(node.childIds));
        // Show interactive overlay listing hidden children
        const childNodes = node.childIds
          .map(id => getNode(id))
          .filter((n): n is ConceptNode => n !== null);
        if (childNodes.length > 0) {
          const rectEl = (this as SVGGElement).querySelector('rect');
          showTooltip(
            rectEl ?? this as SVGGElement,
            `${node.count} clustered children`,
            childNodes, 0,
            (id) => addManualNodes([id]),
            () => toggleCluster(node.id),
          );
        }
      })
      .on('mouseleave', () => {
        scheduleHide();
        if (!tooltipRef.current) {
          setHighlightedNodeIds(new Set());
        }
      });

    gEl.append('rect')
      .attr('width', node.width)
      .attr('height', node.height)
      .attr('rx', 12);

    gEl.append('text')
      .attr('x', node.width / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .attr('class', 'cluster-label')
      .text(`${node.count} more children`);

    gEl.append('text')
      .attr('x', node.width / 2)
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('class', 'cluster-sublabel')
      .text(`${node.totalDescendants.toLocaleString()} descendants`);
  }

  /** Show interactive overlay near an element listing related nodes */
  function showTooltip(
    anchorEl: HTMLElement | SVGElement,
    label: string,
    nodes: ConceptNode[],
    alreadyVisibleCount: number,
    onAddNode: (id: string) => void,
    onAddAll: (ids: string[]) => void,
  ) {
    hideTooltip(true);
    const container = containerRef.current;
    if (!container) return;

    const tip = document.createElement('div');
    tip.className = 'badge-tooltip';

    // Keep tooltip alive when mouse enters it
    tip.addEventListener('mouseenter', () => cancelHideTimer());
    tip.addEventListener('mouseleave', () => scheduleHide());

    // Header
    const header = document.createElement('div');
    header.className = 'badge-tooltip-header';
    header.textContent = label;
    tip.appendChild(header);

    if (alreadyVisibleCount > 0) {
      const vis = document.createElement('div');
      vis.className = 'badge-tooltip-visible';
      vis.textContent = `${alreadyVisibleCount} already visible`;
      tip.appendChild(vis);
    }

    // "Add all" button
    const allIds = nodes.map(n => n.id);
    const addAllBtn = document.createElement('button');
    addAllBtn.className = 'badge-tooltip-add-all';
    addAllBtn.textContent = `Add all ${nodes.length}`;
    addAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onAddAll(allIds);
      hideTooltip(true);
    });
    tip.appendChild(addAllBtn);

    // Scrollable list
    const list = document.createElement('ul');
    list.className = 'badge-tooltip-list';
    for (const node of nodes) {
      const li = document.createElement('li');
      li.textContent = node.title;
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        onAddNode(node.id);
        li.remove();
        // Update "Add all" count and close if empty
        const remaining = list.querySelectorAll('li');
        if (remaining.length === 0) {
          hideTooltip(true);
        } else {
          addAllBtn.textContent = `Add all ${remaining.length}`;
        }
      });
      list.appendChild(li);
    }
    tip.appendChild(list);

    // Position near the anchor element
    const anchorRect = anchorEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    tip.style.left = `${anchorRect.right - containerRect.left + container.scrollLeft + 8}px`;
    tip.style.top = `${anchorRect.top - containerRect.top + container.scrollTop - 4}px`;

    container.appendChild(tip);
    tooltipRef.current = tip;
  }

  /** Schedule tooltip hide after a delay (hover-intent) */
  function scheduleHide() {
    cancelHideTimer();
    tooltipTimerRef.current = setTimeout(() => {
      hideTooltip(true);
      setHighlightedNodeIds(new Set());
    }, 150);
  }

  /** Cancel a pending tooltip hide */
  function cancelHideTimer() {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }

  /** Hide the badge tooltip */
  function hideTooltip(immediate?: boolean) {
    if (!immediate) {
      scheduleHide();
      return;
    }
    cancelHideTimer();
    if (tooltipRef.current) {
      tooltipRef.current.remove();
      tooltipRef.current = null;
    }
  }

  /** Render real node inner contents */
  function renderNodeContents(
    gEl: d3.Selection<SVGGElement, LayoutNode, null, undefined>,
    node: RealLayoutNode,
  ) {
    const isFocus = node.id === selectedNodeId;
    const isAncestorNode = ancestorNodeIds.has(node.id);
    const isManual = node.manual;

    const fullTitle = node.data.title;
    const truncatedTitle = fullTitle.length > 22
      ? fullTitle.substring(0, 20) + '...'
      : fullTitle;

    const classes = [
      'nl-item',
      'node-link-node',
      isFocus && 'focus',
      isAncestorNode && 'ancestor',
      isManual && 'manual',
    ].filter(Boolean).join(' ');

    gEl
      .attr('class', classes)
      .style('cursor', 'pointer')
      .on('click', () => selectNode(node.id))
      .on('mouseenter', function () {
        d3.select(this).raise();
        if (isAncestorNode) {
          d3.select(this).select('rect').style('opacity', '1');
          d3.select(this).select('.node-title').style('opacity', '1');
        }
        setHoveredNodeId(node.id);
      })
      .on('mouseleave', function () {
        if (isAncestorNode) {
          d3.select(this).select('rect').style('opacity', null);
          d3.select(this).select('.node-title').style('opacity', null);
        }
        setHoveredNodeId(null);
      });

    gEl.append('rect')
      .attr('width', node.width)
      .attr('height', node.height)
      .attr('rx', 4);

    // SVG title element for native tooltip on hover
    gEl.append('title').text(fullTitle);

    gEl.append('text')
      .attr('x', 8)
      .attr('y', 16)
      .attr('class', 'node-title')
      .text(truncatedTitle);

    // Badges — rendered as HTML inside foreignObject
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
      const fo = gEl.append('foreignObject')
        .attr('x', 4)
        .attr('y', 20)
        .attr('width', NODE_WIDTH - 8)
        .attr('height', 18);

      const badgeDiv = fo.append('xhtml:div')
        .style('display', 'flex')
        .style('gap', '3px')
        .style('align-items', 'center')
        .style('font-size', '10px')
        .html(badgeParts.join(''));

      // Attach click and hover handlers to badge spans
      badgeDiv.selectAll('.count-badge').each(function () {
        const badgeEl = this as HTMLElement;
        const isParentBadge = badgeEl.classList.contains('count-badge-parents');
        const isChildBadge = badgeEl.classList.contains('count-badge-children');
        const isDescBadge = badgeEl.classList.contains('count-badge-descendants');

        badgeEl.style.cursor = 'pointer';

        badgeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          // If tooltip is showing, let users interact with it; badge click adds all
          if (isParentBadge) {
            addManualNodes(getParents(node.id).map(p => p.id));
          } else if (isChildBadge) {
            const clusterId = `cluster:${node.id}`;
            if (expandedClusters.has(clusterId) || node.data.childCount <= MAX_VISIBLE_CHILDREN) {
              addManualNodes(getChildren(node.id).map(c => c.id));
            } else {
              toggleCluster(clusterId);
            }
          } else if (isDescBadge) {
            const childIds = getChildren(node.id).map(c => c.id);
            const grandchildIds = childIds.flatMap(cId => getChildren(cId).map(gc => gc.id));
            addManualNodes([...childIds, ...grandchildIds]);
          }
          hideTooltip(true);
        });

        badgeEl.addEventListener('mouseenter', () => {
          cancelHideTimer();
          // Compute related nodes for highlighting and tooltip
          let relatedNodes: ConceptNode[] = [];
          let tooltipLabel = '';
          if (isParentBadge) {
            relatedNodes = getParents(node.id);
            tooltipLabel = 'Parents';
          } else if (isChildBadge) {
            relatedNodes = getChildren(node.id);
            tooltipLabel = 'Children';
          } else if (isDescBadge) {
            const children = getChildren(node.id);
            const grandchildren = children.flatMap(c => getChildren(c.id));
            relatedNodes = [...children, ...grandchildren];
            tooltipLabel = `Descendants (${node.data.descendantCount} total)`;
          }

          // Cross-panel highlighting
          setHighlightedNodeIds(new Set(relatedNodes.map(n => n.id)));

          // Show interactive overlay for nodes not yet visible
          const visibleIds = new Set(layoutNodes.map(n => n.id));
          const notVisible = relatedNodes.filter(n => !visibleIds.has(n.id));
          if (notVisible.length > 0) {
            showTooltip(
              badgeEl, tooltipLabel, notVisible,
              relatedNodes.length - notVisible.length,
              (id) => addManualNodes([id]),
              (ids) => addManualNodes(ids),
            );
          }
        });

        badgeEl.addEventListener('mouseleave', () => {
          scheduleHide();
          // Delay highlight clear too — tooltip might keep them alive
          if (!tooltipRef.current) {
            setHighlightedNodeIds(new Set());
          }
        });
      });
    }
  }

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
            {manualNodeIds.size > 0 && (
              <button className="zoom-btn reset-btn" onClick={resetManualNodes} title="Reset neighborhood">✕</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
