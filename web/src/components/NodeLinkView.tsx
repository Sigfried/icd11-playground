import { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import ELK from 'elkjs/lib/elk-api';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { type ConceptNode, useGraph } from '../providers/GraphProvider';
import { buildNlSubgraph } from '../state/nlSubgraph';
import { computeDescendantLevels } from '../utils/descendantLevels';
import { renderBadgeHTML } from './Badge';
import { ResumeModal } from './ResumeModal';
import './Badge.css';
import './NodeLinkView.css';

/**
 * Node-Link Diagram (Secondary View)
 *
 * D3-based DAG visualization of local neighborhood around the selected node.
 * Reads `displayedNodeIds` from context (snapshot-based) instead of
 * computing neighborhood per render. Undo/redo via history.
 */

const isMac = navigator.platform.toUpperCase().includes('MAC');

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
  id: string;
  source: string;
  target: string;
  sections?: Array<{
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    bendPoints?: Array<{ x: number; y: number }>;
  }>;
}

function createElk() {
  return new ELK({ workerUrl: elkWorkerUrl });
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 40;
const CLUSTER_WIDTH = 140;
const CLUSTER_HEIGHT = 36;
const SVG_PADDING = 30;
const TRANSITION_DURATION = 400;

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

/**
 * Compute the hidden children for a cluster pseudo-node.
 * Hidden = all children of parentId that are NOT individually in displayedNodeIds.
 */
function computeClusterInfo(
  parentId: string,
  getChildrenFn: (id: string) => ConceptNode[],
  displayedNodeIds: Set<string>,
): { count: number; childIds: string[]; totalDescendants: number } {
  const allChildren = getChildrenFn(parentId);
  const hiddenChildren = allChildren.filter(c => !displayedNodeIds.has(c.id));
  return {
    count: hiddenChildren.length,
    childIds: hiddenChildren.map(c => c.id),
    totalDescendants: hiddenChildren.reduce((sum, c) => sum + c.descendantCount, 0),
  };
}

export function NodeLinkView() {
  const {
    selectedNodeId, selectNode, setHoveredNodeId,
    getNode, getParents, getChildren, getGraph,
    displayedNodeIds, expandNodes, removeNode, removeNodes, resetNeighborhood,
    historyBack, historyForward, canUndo, canRedo,
    highlightedNodeIds, setHighlightedNodeIds,
    pendingRestore,
  } = useGraph();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomWrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<LayoutEdge[]>([]);
  // Tooltip for badge hover overlay (interactive)
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Non-interactive info tooltip for node body hover
  const infoTooltipRef = useRef<HTMLDivElement | null>(null);
  const infoTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppress tooltip re-creation after ESC (cleared on next mouseleave)
  const tooltipSuppressedRef = useRef(false);
  const zoomRef = useRef(1);
  // Position cache for animation: node ID -> last known {x, y}
  const positionCacheRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // SVG-space position of focus node center (set during D3 rendering)
  const focusPosRef = useRef<{ x: number; y: number } | null>(null);
  // SVG natural dimensions (before zoom)
  const svgDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  // Track whether this is the initial render (no animation)
  const isInitialRenderRef = useRef(true);
  // Track offset for viewBox -> SVG coordinate mapping
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // ELK Web Worker instance (replaceable for cancellation)
  const elkRef = useRef(createElk());
  // Layout progress state for overlay
  const [layoutInProgress, setLayoutInProgress] = useState(false);
  // Suppress tooltips during pinch zoom (cleared after a short delay)
  const zoomingRef = useRef(false);
  const zoomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Apply zoom level directly to DOM — bypasses React to avoid re-render storms during pinch */
  const applyZoom = useCallback((level: number) => {
    const clamped = Math.min(2, Math.max(0.2, level));
    zoomRef.current = clamped;
    const wrapper = zoomWrapperRef.current;
    const container = containerRef.current;
    const dims = svgDimsRef.current;
    if (wrapper && dims.width) {
      wrapper.style.transform = `scale(${clamped})`;
    }
    if (container && dims.width) {
      container.style.setProperty('--zoom-w', `${dims.width * clamped}px`);
      container.style.setProperty('--zoom-h', `${dims.height * clamped}px`);
    }
  }, []);

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
    applyZoom(fitZoom);
    requestAnimationFrame(() => {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    });
  }, [applyZoom]);

  // Reset tooltip and zoom when selection changes
  useEffect(() => {
    applyZoom(1);
    isInitialRenderRef.current = true;
    positionCacheRef.current.clear();
    cancelHideTimer();
    if (tooltipRef.current) {
      tooltipRef.current.remove();
      tooltipRef.current = null;
    }
    if (infoTooltipRef.current) {
      infoTooltipRef.current.remove();
      infoTooltipRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cancelHideTimer is stable
  }, [selectedNodeId]);

  // (Zoom is applied directly via applyZoom() — no React state involved)

  // Ctrl+wheel zoom (no pan — native scroll handles that)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Suppress tooltips during pinch zoom
      hideInfoTooltip();
      hideTooltip(true);
      zoomingRef.current = true;
      if (zoomingTimerRef.current) clearTimeout(zoomingTimerRef.current);
      zoomingTimerRef.current = setTimeout(() => { zoomingRef.current = false; }, 200);
      const next = zoomRef.current * (1 - e.deltaY * 0.005);
      applyZoom(next);
      scrollToFocus(zoomRef.current);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- applyZoom/scrollToFocus are stable refs
  }, []);

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z = redo, Escape = reset
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        historyBack();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        historyForward();
      } else if (e.key === 'Escape') {
        hideTooltip(true);
        hideInfoTooltip();
        tooltipSuppressedRef.current = true;
        setHighlightedNodeIds(new Set());
        resetNeighborhood();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyBack, historyForward, resetNeighborhood, setHighlightedNodeIds]);

  /** Expand a cluster: replace cluster ID with its hidden child IDs */
  const expandCluster = useCallback((clusterId: string) => {
    const parentId = clusterId.slice('cluster:'.length);
    const { childIds } = computeClusterInfo(parentId, getChildren, displayedNodeIds);
    // Remove cluster ID and add all hidden children
    const idsToAdd = childIds.filter(id => !displayedNodeIds.has(id));
    // We also need to remove the cluster — build the new set explicitly
    const next = new Set(displayedNodeIds);
    next.delete(clusterId);
    for (const id of idsToAdd) next.add(id);
    // Use expandNodes to push as new snapshot (pass the full replacement set)
    // But expandNodes only adds — we need a different approach for cluster expansion
    // since it removes the cluster ID. Push via expandNodes with a small wrapper.
    expandNodes(
      // We pass the child IDs; the cluster ID removal happens by building a new set.
      // Actually, let's use the context's expandNodes which only adds IDs to the set.
      // For cluster expansion we need to both add children and remove cluster.
      // Solution: just add the children, keep the cluster. The cluster's hidden count
      // will drop to 0 and it'll be filtered out of the layout.
      childIds,
      `Expanded ${childIds.length} children of ${getNode(parentId)?.title ?? parentId}`,
    );
  }, [displayedNodeIds, getChildren, getNode, expandNodes]);

  // Compute layout from displayedNodeIds (runs ELK in Web Worker)
  useEffect(() => {
    if (!selectedNodeId || displayedNodeIds.size === 0) {
      setLayoutNodes([]);
      setLayoutEdges([]);
      setLayoutInProgress(false);
      return;
    }

    const nodeData = getNode(selectedNodeId);
    if (!nodeData) {
      setLayoutNodes([]);
      setLayoutEdges([]);
      setLayoutInProgress(false);
      return;
    }

    let cancelled = false;
    setLayoutInProgress(true);

    async function computeLayout() {
      const graph = getGraph();
      const nlSubgraph = buildNlSubgraph(graph, displayedNodeIds);

      // Collect cluster info for cluster pseudo-nodes in displayedNodeIds
      const clusterInfos: Array<{
        id: string; parentId: string;
        count: number; childIds: string[]; totalDescendants: number;
      }> = [];

      for (const id of displayedNodeIds) {
        if (!id.startsWith('cluster:')) continue;
        const parentId = id.slice('cluster:'.length);
        const info = computeClusterInfo(parentId, getChildren, displayedNodeIds);
        if (info.count === 0) continue;
        clusterInfos.push({ id, parentId, ...info });
      }

      // Build ordered list of real node IDs (sorted by depth for stable ELK ordering)
      const realNodeIds = [...displayedNodeIds].filter(id => !id.startsWith('cluster:'));
      realNodeIds.sort((a, b) => {
        const nodeA = getNode(a);
        const nodeB = getNode(b);
        const depthDiff = (nodeA?.depth ?? 0) - (nodeB?.depth ?? 0);
        if (depthDiff !== 0) return depthDiff;
        return a.localeCompare(b);
      });

      const elkNodes = [
        ...realNodeIds.map(id => ({
          id, width: NODE_WIDTH, height: NODE_HEIGHT,
        })),
        ...clusterInfos.map(c => ({
          id: c.id, width: CLUSTER_WIDTH, height: CLUSTER_HEIGHT,
        })),
      ];

      const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];

      nlSubgraph.forEachEdge((_edge, _attrs, source, target) => {
        if (source.startsWith('cluster:') || target.startsWith('cluster:')) return;
        elkEdges.push({
          id: `${source}->${target}`,
          sources: [source],
          targets: [target],
        });
      });

      for (const c of clusterInfos) {
        elkEdges.push({
          id: `${c.parentId}->${c.id}`,
          sources: [c.parentId],
          targets: [c.id],
        });
      }

      try {
        const elkGraph = await elkRef.current.layout({
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

        if (cancelled) return;

        const clusterMap = new Map(clusterInfos.map(c => [c.id, c]));

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
            id: `${elkEdge.sources[0]}->${elkEdge.targets[0]}`,
            source: elkEdge.sources[0],
            target: elkEdge.targets[0],
            sections,
          };
        });

        setLayoutNodes(nodes);
        setLayoutEdges(edges);
        setLayoutInProgress(false);
      } catch (error) {
        if (cancelled) return;
        console.error('ELK layout error:', error);
        setLayoutInProgress(false);
      }
    }

    computeLayout();

    return () => {
      cancelled = true;
      // Kill the worker and replace with a fresh instance
      elkRef.current.terminateWorker();
      elkRef.current = createElk();
    };
  }, [selectedNodeId, displayedNodeIds, getNode, getChildren, getGraph]);

  // D3 rendering with data-join (enter/update/exit animation)
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (layoutNodes.length === 0) {
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
      .attr('width', svgWidth)
      .attr('height', svgHeight);

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

    edgeSelection.exit<LayoutEdge>()
      .transition().duration(dur).ease(d3.easeCubicOut)
      .attr('opacity', 0)
      .remove();

    const edgeEnter = edgeSelection.enter()
      .append('path')
      .attr('class', d => `node-link-edge${d.target.startsWith('cluster:') ? ' cluster-edge' : ''}`)
      .attr('d', d => edgePath(d))
      .attr('opacity', isInitial ? 1 : 0);

    edgeEnter.merge(edgeSelection)
      .transition().duration(dur).ease(d3.easeCubicOut)
      .attr('d', d => edgePath(d))
      .attr('opacity', 1);

    // --- NODE DATA-JOIN ---
    const nodeSelection = nodesG
      .selectAll<SVGGElement, LayoutNode>('g.nl-item')
      .data(layoutNodes, d => d.id);

    nodeSelection.exit<LayoutNode>()
      .each(function (d) {
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

    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'nl-item')
      .attr('transform', d => {
        if (isInitial) return `translate(${d.x}, ${d.y})`;
        const cached = posCache.get(d.id);
        if (cached) return `translate(${cached.x}, ${cached.y})`;
        const cx = d.x + d.width / 2;
        const cy = d.y + d.height / 2;
        return `translate(${cx}, ${cy}) scale(0)`;
      })
      .attr('opacity', d => {
        if (isInitial) return 1;
        return posCache.has(d.id) ? 1 : 0;
      });

    const allNodes = nodeEnter.merge(nodeSelection);

    allNodes.each(function (node) {
      const gEl = d3.select<SVGGElement, LayoutNode>(this);
      gEl.selectAll('*').remove();

      if (node.kind === 'cluster') {
        renderClusterContents(gEl, node);
      } else {
        renderNodeContents(gEl, node);
      }
    });

    allNodes
      .transition().duration(dur).ease(d3.easeCubicOut)
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .attr('opacity', 1);

    for (const node of layoutNodes) {
      posCache.set(node.id, { x: node.x, y: node.y });
    }

    svgDimsRef.current = { width: svgWidth, height: svgHeight };

    // Set zoom wrapper dimensions and scroll area
    const wrapper = zoomWrapperRef.current;
    const container = containerRef.current;
    if (wrapper) {
      wrapper.style.width = `${svgWidth}px`;
      wrapper.style.height = `${svgHeight}px`;
      wrapper.style.transform = `scale(${zoomRef.current})`;
    }
    if (container) {
      container.style.setProperty('--zoom-w', `${svgWidth * zoomRef.current}px`);
      container.style.setProperty('--zoom-h', `${svgHeight * zoomRef.current}px`);
    }

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
      setTimeout(() => scrollToFocus(zoomRef.current), TRANSITION_DURATION + 50);
    }

    isInitialRenderRef.current = false;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- setHoveredNodeId, setHighlightedNodeIds are stable useState setters
  }, [layoutNodes, layoutEdges, selectedNodeId, selectNode, expandCluster]);

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
      .on('click', () => expandCluster(node.id))
      .on('mouseenter', function () {
        if (tooltipSuppressedRef.current || zoomingRef.current) return;
        cancelHideTimer();
        setHighlightedNodeIds(new Set(node.childIds));
        const childNodes = node.childIds
          .map(id => getNode(id))
          .filter((n): n is ConceptNode => n !== null);
        if (childNodes.length > 0) {
          const rectEl = (this as SVGGElement).querySelector('rect');
          showTooltip(
            rectEl ?? this as SVGGElement,
            node.parentId,
            `${node.count} clustered children`,
            childNodes, 0,
            (id) => expandNodes([id], `Added ${getNode(id)?.title ?? id}`),
            () => expandCluster(node.id),
          );
        }
      })
      .on('mouseleave', () => {
        tooltipSuppressedRef.current = false;
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

  /** Build a common tooltip header with title and stats */
  function buildTooltipHeader(nodeId: string): HTMLDivElement {
    const node = getNode(nodeId);
    const header = document.createElement('div');
    header.className = 'tooltip-node-header';

    const title = document.createElement('div');
    title.className = 'tooltip-node-title';
    title.textContent = node?.title ?? nodeId;
    header.appendChild(title);

    if (node) {
      const parents = getParents(nodeId);
      const children = getChildren(nodeId);
      const parentsShown = parents.filter(p => displayedNodeIds.has(p.id)).length;
      const childrenShown = children.filter(c => displayedNodeIds.has(c.id)).length;

      const parts: string[] = [];
      if (node.parentCount > 0) {
        parts.push(`${node.parentCount} parents (${parentsShown} shown)`);
      }
      if (node.childCount > 0) {
        parts.push(`${node.childCount} children (${childrenShown} shown)`);
      }
      if (node.descendantCount > node.childCount) {
        parts.push(`${node.descendantCount.toLocaleString()} descendants`);
      }

      if (parts.length > 0) {
        const stats = document.createElement('div');
        stats.className = 'tooltip-node-stats';
        stats.textContent = parts.join(' · ');
        header.appendChild(stats);
      }
    }

    return header;
  }

  /** Show a non-interactive info tooltip on node body hover */
  function showInfoTooltip(anchorEl: SVGGElement, nodeId: string) {
    hideInfoTooltip();
    const container = containerRef.current;
    if (!container) return;

    const tip = document.createElement('div');
    tip.className = 'badge-tooltip node-info-tooltip';
    tip.style.pointerEvents = 'none';
    tip.appendChild(buildTooltipHeader(nodeId));

    container.appendChild(tip);
    positionTooltip(tip, anchorEl, container);
    infoTooltipRef.current = tip;
  }

  function hideInfoTooltip() {
    if (infoTooltipTimerRef.current) {
      clearTimeout(infoTooltipTimerRef.current);
      infoTooltipTimerRef.current = null;
    }
    if (infoTooltipRef.current) {
      infoTooltipRef.current.remove();
      infoTooltipRef.current = null;
    }
  }

  /**
   * Position a tooltip relative to an anchor element within the scroll container.
   */
  function positionTooltip(
    tip: HTMLElement,
    anchorEl: HTMLElement | SVGElement,
    container: HTMLElement,
  ) {
    const anchorRect = anchorEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    let left = anchorRect.right - containerRect.left + container.scrollLeft + 8;
    if (anchorRect.right + tipRect.width + 12 > containerRect.right) {
      left = anchorRect.left - containerRect.left + container.scrollLeft - tipRect.width - 8;
    }

    const anchorCenterY = (anchorRect.top + anchorRect.bottom) / 2;
    const panelRelative = (anchorCenterY - containerRect.top) / containerRect.height;

    let top: number;
    if (panelRelative < 0.35) {
      top = anchorRect.top - containerRect.top + container.scrollTop;
    } else if (panelRelative > 0.65) {
      top = anchorRect.bottom - containerRect.top + container.scrollTop - tipRect.height;
    } else {
      top = anchorCenterY - containerRect.top + container.scrollTop - tipRect.height / 2;
    }

    const minTop = container.scrollTop;
    const maxTop = container.scrollTop + containerRect.height - tipRect.height;
    top = Math.max(minTop, Math.min(maxTop, top));

    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${Math.max(0, top)}px`;
  }

  /** Show descendant overlay with level-by-level breakdown */
  function showDescendantTooltip(
    anchorEl: HTMLElement,
    nodeId: string,
    totalDescendants: number,
    levels: Array<{ label: string; nodes: ConceptNode[]; ids: string[]; cumulative: number }>,
    visibleIds: Set<string>,
  ) {
    hideTooltip(true);
    const container = containerRef.current;
    if (!container) return;

    const tip = document.createElement('div');
    tip.className = 'badge-tooltip';
    tip.addEventListener('mouseenter', () => cancelHideTimer());
    tip.addEventListener('mouseleave', () => scheduleHide());

    tip.appendChild(buildTooltipHeader(nodeId));

    const header = document.createElement('div');
    header.className = 'badge-tooltip-header';
    header.textContent = `Descendants (${totalDescendants.toLocaleString()} total)`;
    tip.appendChild(header);

    for (const level of levels) {
      const section = document.createElement('div');
      section.className = 'badge-tooltip-level';

      const levelHeader = document.createElement('div');
      levelHeader.className = 'badge-tooltip-level-header';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = `${level.label} (${level.nodes.length.toLocaleString()})`;
      levelHeader.appendChild(labelSpan);

      const addBtn = document.createElement('button');
      addBtn.className = 'badge-tooltip-level-btn';
      const notVisibleIds = level.ids.filter(id => !visibleIds.has(id));
      addBtn.textContent = `+${notVisibleIds.length.toLocaleString()}`;
      addBtn.title = `Add ${notVisibleIds.length.toLocaleString()} ${level.label.toLowerCase()} (${level.cumulative.toLocaleString()} cumulative)`;
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Include all preceding levels so added nodes have edges to their parents
        const levelIdx = levels.indexOf(level);
        const throughLevel = levels.slice(0, levelIdx + 1).flatMap(l => l.ids).filter(id => !visibleIds.has(id));
        expandNodes(throughLevel, `Added ${level.label.toLowerCase()} (${throughLevel.length} nodes through depth ${levelIdx + 1})`);
        hideTooltip(true);
      });
      levelHeader.appendChild(addBtn);

      section.appendChild(levelHeader);
      tip.appendChild(section);
    }

    if (levels.length > 0) {
      const allIds = levels.flatMap(l => l.ids).filter(id => !visibleIds.has(id));
      if (allIds.length > 0) {
        const addAllBtn = document.createElement('button');
        addAllBtn.className = 'badge-tooltip-add-all';
        addAllBtn.textContent = `Add all ${allIds.length.toLocaleString()} through depth ${levels.length}`;
        addAllBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          expandNodes(allIds, `Added all ${allIds.length} descendants through depth ${levels.length}`);
          hideTooltip(true);
        });
        tip.appendChild(addAllBtn);
      }
    }

    container.appendChild(tip);
    positionTooltip(tip, anchorEl, container);
    tooltipRef.current = tip;
  }

  /** Show interactive overlay near an element listing related nodes */
  function showTooltip(
    anchorEl: HTMLElement | SVGElement,
    nodeId: string,
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

    tip.addEventListener('mouseenter', () => cancelHideTimer());
    tip.addEventListener('mouseleave', () => scheduleHide());

    tip.appendChild(buildTooltipHeader(nodeId));

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

    const list = document.createElement('ul');
    list.className = 'badge-tooltip-list';
    for (const node of nodes) {
      const li = document.createElement('li');
      li.textContent = node.title;
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        onAddNode(node.id);
        li.remove();
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

    container.appendChild(tip);
    positionTooltip(tip, anchorEl, container);
    tooltipRef.current = tip;
  }

  function scheduleHide() {
    cancelHideTimer();
    tooltipTimerRef.current = setTimeout(() => {
      hideTooltip(true);
      setHighlightedNodeIds(new Set());
    }, 150);
  }

  function cancelHideTimer() {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }

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

    const fullTitle = node.data.title;
    const truncatedTitle = fullTitle.length > 22
      ? fullTitle.substring(0, 20) + '...'
      : fullTitle;

    const classes = [
      'nl-item',
      'node-link-node',
      isFocus && 'focus',
    ].filter(Boolean).join(' ');

    gEl
      .attr('class', classes)
      .style('cursor', 'pointer')
      .on('click', () => selectNode(node.id))
      .on('mouseenter', function () {
        d3.select(this).raise();
        setHoveredNodeId(node.id);
        if (!tooltipSuppressedRef.current && !zoomingRef.current) {
          infoTooltipTimerRef.current = setTimeout(() => {
            if (!zoomingRef.current) showInfoTooltip(this as SVGGElement, node.id);
          }, 300);
        }
      })
      .on('mouseleave', function () {
        setHoveredNodeId(null);
        hideInfoTooltip();
      });

    gEl.append('rect')
      .attr('width', node.width)
      .attr('height', node.height)
      .attr('rx', 4);

    gEl.append('text')
      .attr('x', 8)
      .attr('y', 16)
      .attr('class', 'node-title')
      .text(truncatedTitle);

    // Close button (top-right, visible on hover via CSS)
    const closeG = gEl.append('g')
      .attr('class', 'nl-close-btn')
      .attr('transform', `translate(${node.width - 16}, 2)`)
      .style('cursor', 'pointer')
      .on('click', (e: MouseEvent) => {
        e.stopPropagation();
        removeNode(node.id);
      });

    closeG.append('rect')
      .attr('width', 14)
      .attr('height', 14)
      .attr('rx', 2)
      .attr('fill', 'transparent');

    closeG.append('text')
      .attr('x', 7)
      .attr('y', 11)
      .attr('text-anchor', 'middle')
      .attr('class', 'nl-close-icon')
      .text('\u00D7');

    // Badges — mark as "expanded" (red) if all related nodes are already displayed
    const parentIds = node.data.parentCount > 1 ? getParents(node.id).map(p => p.id) : [];
    const childIds = node.data.childCount > 0 ? getChildren(node.id).map(c => c.id) : [];
    const allParentsDisplayed = parentIds.length > 0 && parentIds.every(id => displayedNodeIds.has(id));
    const allChildrenDisplayed = childIds.length > 0 && childIds.every(id => displayedNodeIds.has(id));

    const badgeParts: string[] = [];
    if (node.data.parentCount > 1) {
      badgeParts.push(renderBadgeHTML('parents', node.data.parentCount, allParentsDisplayed ? 'count-badge-expanded' : undefined));
    }
    if (node.data.childCount > 0) {
      badgeParts.push(renderBadgeHTML('children', node.data.childCount, allChildrenDisplayed ? 'count-badge-expanded' : undefined));
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

      badgeDiv.selectAll('.count-badge').each(function () {
        const badgeEl = this as HTMLElement;
        const isParentBadge = badgeEl.classList.contains('count-badge-parents');
        const isChildBadge = badgeEl.classList.contains('count-badge-children');
        const isDescBadge = badgeEl.classList.contains('count-badge-descendants');

        badgeEl.style.cursor = 'pointer';

        badgeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isParentBadge) {
            if (allParentsDisplayed) {
              removeNodes(parentIds, `Removed ${parentIds.length} parents of ${node.data.title}`);
            } else {
              expandNodes(parentIds, `Added ${parentIds.length} parents of ${node.data.title}`);
            }
          } else if (isChildBadge) {
            if (allChildrenDisplayed) {
              removeNodes(childIds, `Removed ${childIds.length} children of ${node.data.title}`);
            } else {
              expandNodes(childIds, `Added ${childIds.length} children of ${node.data.title}`);
            }
          } else if (isDescBadge) {
            const descChildIds = getChildren(node.id).map(c => c.id);
            const grandchildIds = descChildIds.flatMap(cId => getChildren(cId).map(gc => gc.id));
            expandNodes([...descChildIds, ...grandchildIds], `Added descendants of ${node.data.title}`);
          }
          hideTooltip(true);
        });

        badgeEl.addEventListener('mouseenter', () => {
          hideInfoTooltip();
          if (tooltipSuppressedRef.current || zoomingRef.current) return;
          cancelHideTimer();

          if (isDescBadge) {
            const levels = computeDescendantLevels(node.id, getChildren);
            const allIds = levels.flatMap(l => l.ids);
            setHighlightedNodeIds(new Set(allIds));
            showDescendantTooltip(
              badgeEl, node.id, node.data.descendantCount, levels,
              displayedNodeIds,
            );
            return;
          }

          let relatedNodes: ConceptNode[] = [];
          let tooltipLabel = '';
          if (isParentBadge) {
            relatedNodes = getParents(node.id);
            tooltipLabel = 'Parents';
          } else if (isChildBadge) {
            relatedNodes = getChildren(node.id);
            tooltipLabel = 'Children';
          }

          setHighlightedNodeIds(new Set(relatedNodes.map(n => n.id)));

          const notVisible = relatedNodes.filter(n => !displayedNodeIds.has(n.id));
          if (notVisible.length > 0) {
            showTooltip(
              badgeEl, node.id, tooltipLabel, notVisible,
              relatedNodes.length - notVisible.length,
              (id) => expandNodes([id], `Added ${getNode(id)?.title ?? id}`),
              (ids) => expandNodes(ids, `Added ${ids.length} ${tooltipLabel.toLowerCase()}`),
            );
          }
        });

        badgeEl.addEventListener('mouseleave', () => {
          tooltipSuppressedRef.current = false;
          scheduleHide();
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
              <div className="node-link-zoom-spacer">
                <div className="node-link-zoom-wrapper" ref={zoomWrapperRef}>
                  <svg ref={svgRef} className="node-link-svg" />
                </div>
              </div>
            ) : !layoutInProgress ? (
              <div className="placeholder">Computing layout...</div>
            ) : null
          ) : (
            <div className="placeholder">
              Select a concept in the tree to see its neighborhood
            </div>
          )}
          {layoutInProgress && (
            <div className="layout-progress-overlay">
              <div className="layout-progress-content">
                <span>Computing layout ({displayedNodeIds.size} nodes)...</span>
                {canUndo && (
                  <button className="layout-cancel-btn" onClick={historyBack}>Cancel</button>
                )}
              </div>
            </div>
          )}
          {pendingRestore && (
            <ResumeModal pending={pendingRestore} />
          )}
        </div>
        {selectedNodeId && layoutNodes.length > 0 && (
          <div className="node-link-controls">
            <button className="zoom-btn" onClick={() => { applyZoom(zoomRef.current * 1.3); scrollToFocus(zoomRef.current); }} title="Zoom in">+</button>
            <button className="zoom-btn" onClick={() => { applyZoom(zoomRef.current / 1.3); scrollToFocus(zoomRef.current); }} title="Zoom out">-</button>
            <button className="zoom-btn" onClick={() => { applyZoom(1); scrollToFocus(1); }} title="Reset zoom">&#8634;</button>
            <button className="zoom-btn" onClick={zoomToFit} title="Fit to view">&#8865;</button>
            <button className="zoom-btn" onClick={historyBack} disabled={!canUndo} title={`Undo (${isMac ? '⌘' : 'Ctrl'}+Z)`}>&#8630;</button>
            <button className="zoom-btn" onClick={historyForward} disabled={!canRedo} title={`Redo (${isMac ? '⌘' : 'Ctrl'}+Shift+Z)`}>&#8631;</button>
            {canUndo && (
              <button className="zoom-btn reset-btn" onClick={resetNeighborhood} title="Reset neighborhood">&#10005;</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
