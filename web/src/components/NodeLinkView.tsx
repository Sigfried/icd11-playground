import { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import ELK from 'elkjs/lib/elk.bundled.js';
import { type ConceptNode, useGraph } from '../providers/GraphProvider';
import './NodeLinkView.css';

/**
 * Node-Link Diagram (Secondary View)
 *
 * D3-based DAG visualization of local neighborhood around the selected node.
 * Features:
 * - Ancestor chain to root (not just 1-hop parents)
 * - Collapsible clusters for high-degree nodes
 * - Hierarchical elkjs layout
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

const ANCESTOR_MIN_DEPTH = 2; // don't show root (0) or its direct children (1)

/**
 * Walk ancestors from focusId toward root, following the first parent at each level.
 * Stops at ANCESTOR_MIN_DEPTH (excludes root and top-level chapters).
 * Returns array of ancestor IDs in order from highest → ... → focusId's immediate parent.
 */
function getAncestorChain(
  focusId: string,
  getParents: (id: string) => ConceptNode[],
): string[] {
  const chain: string[] = [];
  let currentId = focusId;
  const maxIter = 30;
  const visited = new Set<string>([focusId]);

  for (let i = 0; i < maxIter; i++) {
    const parents = getParents(currentId);
    if (parents.length === 0) break;
    const firstParent = parents[0];
    if (visited.has(firstParent.id)) break;
    if (firstParent.depth < ANCESTOR_MIN_DEPTH) break;
    visited.add(firstParent.id);
    chain.unshift(firstParent.id);
    currentId = firstParent.id;
  }

  return chain;
}

/**
 * Build the neighborhood: ancestor chain + focus + children (with clustering).
 * Returns { nodeIds, clusterNodes, edges }.
 */
function buildNeighborhood(
  focusId: string,
  getParents: (id: string) => ConceptNode[],
  getChildren: (id: string) => ConceptNode[],
  expandedClusters: Set<string>,
) {
  const nodeIds = new Set<string>();
  const clusterNodes: Array<{
    id: string;
    parentId: string;
    count: number;
    childIds: string[];
    totalDescendants: number;
  }> = [];

  // 1. Ancestor chain (first-parent path, stops at ANCESTOR_MIN_DEPTH)
  const ancestorChain = getAncestorChain(focusId, getParents);
  for (const id of ancestorChain) nodeIds.add(id);

  // 2. Focus node
  nodeIds.add(focusId);

  // 3. All parents of focus (not just the first-parent chain)
  for (const p of getParents(focusId)) nodeIds.add(p.id);

  // 4. Children of focus — cluster if too many
  const focusChildren = getChildren(focusId);
  const clusterId = `cluster:${focusId}`;
  const clusterExpanded = expandedClusters.has(clusterId);

  if (focusChildren.length > MAX_VISIBLE_CHILDREN && !clusterExpanded) {
    // Show first N, cluster the rest
    const visible = focusChildren.slice(0, MAX_VISIBLE_CHILDREN);
    const hidden = focusChildren.slice(MAX_VISIBLE_CHILDREN);

    for (const c of visible) nodeIds.add(c.id);

    const totalDescendants = hidden.reduce((sum, c) => sum + c.descendantCount, 0);
    clusterNodes.push({
      id: clusterId,
      parentId: focusId,
      count: hidden.length,
      childIds: hidden.map(c => c.id),
      totalDescendants,
    });
  } else {
    // Show all children
    for (const c of focusChildren) nodeIds.add(c.id);
  }

  return { nodeIds, clusterNodes };
}

export function NodeLinkView() {
  const { selectedNodeId, selectNode, getNode, getParents, getChildren, getGraph } = useGraph();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<LayoutEdge[]>([]);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  // Reset expanded clusters when selection changes
  useEffect(() => {
    setExpandedClusters(new Set());
  }, [selectedNodeId]);

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
      const { nodeIds, clusterNodes } = buildNeighborhood(
        selectedNodeId!, getParents, getChildren, expandedClusters,
      );

      // Build ELK graph
      const elkNodes = [
        ...Array.from(nodeIds).map(id => ({
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
            'elk.direction': 'DOWN',
            'elk.spacing.nodeNode': '40',
            'elk.layered.spacing.nodeNodeBetweenLayers': '60',
            'elk.edgeRouting': 'ORTHOGONAL',
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
      } catch (error) {
        console.error('ELK layout error:', error);
      }
    }

    computeLayout();
  }, [selectedNodeId, getNode, getParents, getChildren, getGraph, expandedClusters]);

  // D3 rendering with zoom
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (layoutNodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerRect = containerRef.current.getBoundingClientRect();

    // Calculate bounds
    const bounds = {
      minX: Math.min(...layoutNodes.map(n => n.x)),
      maxX: Math.max(...layoutNodes.map(n => n.x + n.width)),
      minY: Math.min(...layoutNodes.map(n => n.y)),
      maxY: Math.max(...layoutNodes.map(n => n.y + n.height)),
    };

    const contentWidth = bounds.maxX - bounds.minX + 60;
    const contentHeight = bounds.maxY - bounds.minY + 60;

    // Calculate initial transform to fit content
    const fitScale = Math.min(
      containerRect.width / contentWidth,
      containerRect.height / contentHeight,
      1
    );
    const MIN_SCALE = 0.4;
    const initialScale = Math.max(fitScale, MIN_SCALE);

    const contentCenterX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
    const contentCenterY = bounds.minY + (bounds.maxY - bounds.minY) / 2;
    const initialX = containerRect.width / 2 - contentCenterX * initialScale;
    const initialY = containerRect.height / 2 - contentCenterY * initialScale;

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    const initialTransform = d3.zoomIdentity
      .translate(initialX, initialY)
      .scale(initialScale);
    svg.call(zoom.transform, initialTransform);

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

    // Pre-compute focus neighbor sets for ancestor detection
    const focusParentIds = selectedNodeId
      ? new Set(getParents(selectedNodeId).map(p => p.id))
      : new Set<string>();
    const focusChildIds = selectedNodeId
      ? new Set(getChildren(selectedNodeId).map(c => c.id))
      : new Set<string>();

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
      const isAncestorNode = !isFocus && !focusParentIds.has(node.id) && !focusChildIds.has(node.id);

      const nodeG = nodesG.append('g')
        .attr('class', `node-link-node${isFocus ? ' focus' : ''}${isAncestorNode ? ' ancestor' : ''}`)
        .attr('transform', `translate(${node.x}, ${node.y})`)
        .style('cursor', 'pointer')
        .on('click', () => selectNode(node.id));

      nodeG.append('rect')
        .attr('width', node.width)
        .attr('height', node.height)
        .attr('rx', 4);

      // Title (truncated)
      const titleText = node.data.title.length > 22
        ? node.data.title.substring(0, 20) + '...'
        : node.data.title;

      nodeG.append('text')
        .attr('x', 8)
        .attr('y', 16)
        .attr('class', 'node-title')
        .text(titleText);

      // Badges
      let badgeX = 8;
      const badgeY = 30;

      if (node.data.parentCount > 1) {
        nodeG.append('text')
          .attr('x', badgeX)
          .attr('y', badgeY)
          .attr('class', 'node-badge parents')
          .text(`${node.data.parentCount}↑`);
        badgeX += 25;
      }

      if (node.data.childCount > 0) {
        nodeG.append('text')
          .attr('x', badgeX)
          .attr('y', badgeY)
          .attr('class', 'node-badge children')
          .text(`${node.data.childCount}↓`);
      }
    });

  }, [layoutNodes, layoutEdges, selectedNodeId, selectNode, toggleCluster, getParents, getChildren]);

  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1.5);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 0.67);
    }
  }, []);

  const handleFitToView = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current || layoutNodes.length === 0) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const bounds = {
      minX: Math.min(...layoutNodes.map(n => n.x)),
      maxX: Math.max(...layoutNodes.map(n => n.x + n.width)),
      minY: Math.min(...layoutNodes.map(n => n.y)),
      maxY: Math.max(...layoutNodes.map(n => n.y + n.height)),
    };

    const contentWidth = bounds.maxX - bounds.minX + 60;
    const contentHeight = bounds.maxY - bounds.minY + 60;

    const scale = Math.min(
      containerRect.width / contentWidth,
      containerRect.height / contentHeight,
      1
    );

    const contentCenterX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
    const contentCenterY = bounds.minY + (bounds.maxY - bounds.minY) / 2;
    const x = containerRect.width / 2 - contentCenterX * scale;
    const y = containerRect.height / 2 - contentCenterY * scale;

    const transform = d3.zoomIdentity.translate(x, y).scale(scale);
    d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.transform, transform);
  }, [layoutNodes]);

  return (
    <>
      <div className="panel-header">
        Node-Link View -- <span className="header-hint">
          {selectedNodeId ? `${layoutNodes.length} nodes` : 'Select a node'}
        </span>
      </div>
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
        {selectedNodeId && layoutNodes.length > 0 && (
          <div className="node-link-controls">
            <button className="zoom-btn" onClick={handleZoomIn} title="Zoom in">+</button>
            <button className="zoom-btn" onClick={handleZoomOut} title="Zoom out">−</button>
            <button className="zoom-btn" onClick={handleFitToView} title="Fit to view">⊡</button>
          </div>
        )}
      </div>
    </>
  );
}
