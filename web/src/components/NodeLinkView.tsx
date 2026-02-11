import { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import ELK from 'elkjs/lib/elk.bundled.js';
import { type ConceptNode, useGraph } from '../providers/GraphProvider';
import './NodeLinkView.css';

/**
 * Node-Link Diagram (Secondary View)
 *
 * D3-based DAG visualization of local neighborhood around the selected node.
 * Shows N hops of parents and children.
 *
 * Layout options (per spec):
 * - elkjs: Current implementation (Eclipse Layout Kernel)
 * - d3-dag: Alternative, but limited forced vertical layering
 * - dagre: Simpler, may struggle with complex graphs
 *
 * TODO: May switch to Python/igraph backend for layout calculation.
 * igraph supports forced vertical layering which is better for our use case.
 * See icd11-visual-interface-spec.md.
 *
 * Key features:
 * - Hierarchical (not force-directed) layout
 * - Focus + context: center on selected, show neighborhood
 * - Click to navigate (updates TreeView and this view)
 * - Same [N↑] [N↓] badges as TreeView
 */

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: ConceptNode;
}

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

export function NodeLinkView() {
  const { selectedNodeId, selectNode, getNode, getParents, getChildren, getGraph } = useGraph();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<LayoutEdge[]>([]);

  // Extract 1-hop neighborhood and compute layout
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

      // Collect neighborhood: selected node + parents + children
      const neighborhoodIds = new Set<string>();
      neighborhoodIds.add(selectedNodeId!);

      // Parents
      for (const p of getParents(selectedNodeId!)) {
        neighborhoodIds.add(p.id);
      }

      // Children
      for (const c of getChildren(selectedNodeId!)) {
        neighborhoodIds.add(c.id);
      }

      // Build ELK graph
      const elkNodes = Array.from(neighborhoodIds).map(id => ({
        id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }));

      const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];

      // Add edges within neighborhood
      for (const id of neighborhoodIds) {
        for (const childId of graph.outNeighbors(id)) {
          if (neighborhoodIds.has(childId)) {
            elkEdges.push({
              id: `${id}->${childId}`,
              sources: [id],
              targets: [childId],
            });
          }
        }
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

        const nodes: LayoutNode[] = (elkGraph.children ?? []).map(elkNode => ({
          id: elkNode.id,
          x: elkNode.x ?? 0,
          y: elkNode.y ?? 0,
          width: elkNode.width ?? NODE_WIDTH,
          height: elkNode.height ?? NODE_HEIGHT,
          data: getNode(elkNode.id)!,
        }));

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
  }, [selectedNodeId, getNode, getParents, getChildren, getGraph]);

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

    // Calculate initial transform to fit content, with minimum scale for readability
    const fitScale = Math.min(
      containerRect.width / contentWidth,
      containerRect.height / contentHeight,
      1 // Don't scale up
    );
    const MIN_SCALE = 0.4;
    const initialScale = Math.max(fitScale, MIN_SCALE);

    const contentCenterX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
    const contentCenterY = bounds.minY + (bounds.maxY - bounds.minY) / 2;
    const initialX = containerRect.width / 2 - contentCenterX * initialScale;
    const initialY = containerRect.height / 2 - contentCenterY * initialScale;

    // Create container group first (referenced by zoom callback)
    const g = svg.append('g');

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    zoomRef.current = zoom;

    svg.call(zoom);

    // Set initial transform
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

        edgesG.append('path')
          .attr('class', 'node-link-edge')
          .attr('d', lineGenerator(points));
      }
    });

    // Draw nodes
    const nodesG = g.append('g').attr('class', 'nodes');

    layoutNodes.forEach(node => {
      const isFocus = node.id === selectedNodeId;

      const nodeG = nodesG.append('g')
        .attr('class', `node-link-node ${isFocus ? 'focus' : ''}`)
        .attr('transform', `translate(${node.x}, ${node.y})`)
        .style('cursor', 'pointer')
        .on('click', () => {
          selectNode(node.id);
        });

      // Node rectangle
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

  }, [layoutNodes, layoutEdges, selectedNodeId, selectNode]);

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
