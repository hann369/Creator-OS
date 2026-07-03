import React, { useState, useRef, useEffect } from 'react';
import { Compass, Award, X, Activity, Link as LinkIcon, FileText, Target, ArrowRight, ArrowLeft } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext.js';
import type { WorldNode } from '@pronoia/domain';

interface CognitionViewProps {
  onOpenCard?: (id: string, name: string) => void;
}

export const CognitionView: React.FC<CognitionViewProps> = ({ onOpenCard }) => {
  const {
    nodes,
    edges,
    createNode,
    updateNode,
    deleteNode,
    createEdge,
    deleteEdge
  } = useWorkspace();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Local drag nodes cache to ensure smooth mouse dragging (without context lag)
  const [localNodes, setLocalNodes] = useState<WorldNode[]>([]);
  
  useEffect(() => {
    setLocalNodes(nodes);
  }, [nodes]);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Dragging node state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  // Drag-to-connect edge state
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Modals for inline creation and connection
  const [newNodePos, setNewNodePos] = useState<{ x: number; y: number } | null>(null);
  const [newNodeName, setNewNodeName] = useState('');
  const [newEdgeData, setNewEdgeData] = useState<{ sourceId: string; targetId: string } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedNode = localNodes.find(n => n.id === selectedNodeId);

  // ─── Living relationships for the selected node ────────────────────────────
  const relNode = (id: string) => localNodes.find(n => n.id === id);
  const incoming = selectedNode ? edges.filter(e => e.targetId === selectedNode.id) : [];
  const outgoing = selectedNode ? edges.filter(e => e.sourceId === selectedNode.id) : [];
  const connectedNodes: WorldNode[] = selectedNode
    ? [...incoming.map(e => e.sourceId), ...outgoing.map(e => e.targetId)]
        .map(relNode)
        .filter((n): n is WorldNode => !!n)
    : [];
  const contentUsing = connectedNodes.filter(n => n.metadata?.isContentMirror);
  const goalsDependent = connectedNodes.filter(n => n.type === 'goal' && n.id !== selectedNode?.id);

  const renderRelRow = (edge: typeof edges[number], node: WorldNode, dir: 'in' | 'out') => (
    <div key={edge.id} onClick={() => setSelectedNodeId(node.id)}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: '4px', cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-light)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {dir === 'in' ? <ArrowLeft size={11} color="var(--accent-color)" /> : <ArrowRight size={11} color="var(--accent-color)" />}
        <span style={{ fontWeight: 600, color: 'var(--accent-color)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>{edge.relationshipType.toUpperCase()}</span>
        <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      </div>
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '10px', flexShrink: 0 }}
        onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}>×</button>
    </div>
  );

  // Helper coordinate getters
  const getCoordinates = (node: WorldNode) => {
    return {
      x: node.metadata?.x ?? 300,
      y: node.metadata?.y ?? 300
    };
  };

  // ─── Drag & Pan Events ──────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('canvas-backdrop') || target.tagName === 'svg') {
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
      });
    } else if (draggedNodeId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const svgX = (e.clientX - rect.left - pan.x) / zoom;
      const svgY = (e.clientY - rect.top - pan.y) / zoom;
      
      setLocalNodes(prev => prev.map(n => n.id === draggedNodeId ? {
        ...n,
        metadata: {
          ...n.metadata,
          x: svgX - dragStartOffset.current.x,
          y: svgY - dragStartOffset.current.y
        }
      } : n));
    } else if (connectingSourceId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const svgX = (e.clientX - rect.left - pan.x) / zoom;
      const svgY = (e.clientY - rect.top - pan.y) / zoom;
      setMouseCoords({ x: svgX, y: svgY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    
    // Persist new coordinates to WorkspaceContext
    if (draggedNodeId) {
      const draggedNode = localNodes.find(n => n.id === draggedNodeId);
      if (draggedNode) {
        const coords = getCoordinates(draggedNode);
        updateNode(draggedNode.id, { metadata: { ...draggedNode.metadata, x: coords.x, y: coords.y } });
      }
      setDraggedNodeId(null);
    }

    setConnectingSourceId(null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: WorldNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setDraggedNodeId(node.id);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const svgX = (e.clientX - rect.left - pan.x) / zoom;
      const svgY = (e.clientY - rect.top - pan.y) / zoom;
      const coords = getCoordinates(node);
      dragStartOffset.current = {
        x: svgX - coords.x,
        y: svgY - coords.y
      };
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (containerRef.current && (e.target as HTMLElement).classList.contains('canvas-backdrop')) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setNewNodePos({ x, y });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.5, Math.min(2.0, newZoom)));
  };

  const getLifecycleColor = (state: string) => {
    if (state === 'core_knowledge' || state === 'stable') return 'var(--accent-color)';
    if (state === 'growing') return '#10b981';
    if (state === 'created') return '#3b82f6';
    if (state === 'aging' || state === 'dormant') return '#98a2b3';
    return '#d0d5dd';
  };

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
      className="canvas-backdrop"
      style={{
        width: '100vw',
        height: '100vh',
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : 'grab',
        background: '#F5F4EF',
        backgroundImage: 'radial-gradient(rgba(15, 90, 71, 0.05) 1.5px, transparent 1.5px)',
        backgroundSize: '24px 24px'
      }}
    >
      
      {/* Title Header overlay */}
      <div style={{ position: 'absolute', top: '40px', left: '40px', zIndex: 100, pointerEvents: 'none' }}>
        <span className="label-mono">World Graph representation</span>
        <h1 className="title-serif" style={{ fontSize: '36px', color: 'var(--text-primary)', marginTop: '4px' }}>
          Knowledge Landscape
        </h1>
        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
          Double-click empty canvas to think new nodes • Drag link handle to connect nodes.
        </p>
      </div>

      {/* ─── Infinite Zoomable Surface ─── */}
      <div 
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none'
        }}
      >
        <svg style={{ position: 'absolute', width: '3000px', height: '2000px', top: 0, left: 0, zIndex: 0 }}>
          {/* Edge Curves */}
          {edges.map(edge => {
            const s = localNodes.find(n => n.id === edge.sourceId);
            const t = localNodes.find(n => n.id === edge.targetId);
            if (!s || !t) return null;

            const sc = getCoordinates(s);
            const tc = getCoordinates(t);

            const midX = (sc.x + tc.x) / 2;
            const midY = (sc.y + tc.y) / 2;

            return (
              <g key={edge.id}>
                <path
                  d={`M ${sc.x} ${sc.y} C ${midX} ${sc.y}, ${midX} ${tc.y}, ${tc.x} ${tc.y}`}
                  fill="none"
                  stroke="rgba(15, 90, 71, 0.16)"
                  strokeWidth={2}
                  className="neural-pathway"
                />
                <circle cx={midX} cy={midY} r={3.5} fill="var(--accent-color)" opacity={0.7} />
                {/* Edge Delete Trigger on Hover */}
                <g 
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                >
                  <circle cx={midX} cy={midY} r={10} fill="transparent" />
                  <title>Click to delete relationship</title>
                </g>
              </g>
            );
          })}

          {/* Live Edge Draw connection preview */}
          {connectingSourceId && (() => {
            const s = localNodes.find(n => n.id === connectingSourceId);
            if (!s) return null;
            const sc = getCoordinates(s);
            return (
              <line 
                x1={sc.x} 
                y1={sc.y} 
                x2={mouseCoords.x} 
                y2={mouseCoords.y} 
                stroke="var(--accent-color)" 
                strokeWidth={2} 
                strokeDasharray="4,4" 
              />
            );
          })()}

        {/* Nodes Layer — must live INSIDE the <svg> so transforms/positioning apply */}
        {localNodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          const nodeColor = getLifecycleColor(node.lifecycleState);
          const coords = getCoordinates(node);
          
          let radius = 24;
          if (node.lifecycleState === 'core_knowledge' || node.lifecycleState === 'stable') radius = 32;
          if (node.lifecycleState === 'growing') radius = 28;
          if (node.lifecycleState === 'aging' || node.lifecycleState === 'dormant') radius = 22;

          let lifeClass = 'node-created';
          if (node.lifecycleState === 'core_knowledge' || node.lifecycleState === 'stable') lifeClass = 'node-core';
          if (node.lifecycleState === 'growing') lifeClass = 'node-growing';
          if (node.lifecycleState === 'aging' || node.lifecycleState === 'dormant') lifeClass = 'node-aging';

          return (
            <g
              key={node.id}
              transform={`translate(${coords.x}, ${coords.y})`}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onMouseUp={() => {
                if (connectingSourceId && connectingSourceId !== node.id) {
                  setNewEdgeData({ sourceId: connectingSourceId, targetId: node.id });
                }
              }}
              style={{ pointerEvents: 'auto', cursor: 'grab' }}
            >
              {/* Circles scale on hover via .glowing-node. This inner group has no
                  translate, so the hover scale can't clobber node positioning. */}
              <g className="glowing-node">
                {/* Outer pulsing ring */}
                <circle
                  r={radius + (isSelected ? 6 : 4)}
                  fill="none"
                  stroke={nodeColor}
                  strokeWidth={1}
                  opacity={0.3}
                  style={{ transition: 'r 0.3s ease' }}
                />

                {/* Core Node circle */}
                <circle
                  r={radius}
                  className={lifeClass}
                  strokeWidth={2.5}
                  style={{ filter: isSelected ? 'drop-shadow(0 0 12px rgba(15,90,71,0.25))' : 'none' }}
                />
              </g>

              {/* Link Handle for Drag-to-Connect edge */}
              <g 
                transform={`translate(${radius - 6}, ${-radius + 6})`}
                style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setConnectingSourceId(node.id);
                  setMouseCoords(coords);
                }}
              >
                <circle r={8} fill="white" stroke="var(--border-color)" strokeWidth={1} />
                <LinkIcon size={9} color="var(--text-secondary)" style={{ transform: 'translate(-4.5px, -4.5px)', position: 'absolute' }} />
              </g>

              {/* Typographic Label */}
              <text
                y={radius + 20}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  fill: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                  userSelect: 'none',
                  filter: 'drop-shadow(0px 1px 2px white)'
                }}
              >
                {node.name}
              </text>
            </g>
          );
        })}
        </svg>

      </div>

      {/* ─── CUSTOM MODAL: ADD NODE ─── */}
      {newNodePos && (
        <div className="command-palette-overlay" onClick={() => setNewNodePos(null)}>
          <div className="command-palette-window" style={{ maxWidth: '400px', width: '100%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="title-serif" style={{ fontSize: '20px', marginBottom: '12px', margin: 0 }}>Neuer Gedanke</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Erfassen Sie ein neues Konzept im Knowledge Landscape.</p>
            <input 
              type="text" 
              placeholder="Name des Knotens..." 
              value={newNodeName} 
              onChange={e => setNewNodeName(e.target.value)} 
              style={{ border: '1px solid var(--border-color)', padding: '10px 14px', fontSize: '13px', borderRadius: 'var(--radius-sm)', outline: 'none', width: '100%', marginBottom: '20px', background: 'transparent' }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newNodeName.trim()) {
                  createNode(newNodeName.trim(), 'concept', newNodePos.x, newNodePos.y);
                  setNewNodePos(null);
                  setNewNodeName('');
                }
              }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn-sage-secondary" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={() => setNewNodePos(null)}>Abbrechen</button>
              <button className="btn-sage-primary" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={() => {
                if (newNodeName.trim()) {
                  createNode(newNodeName.trim(), 'concept', newNodePos.x, newNodePos.y);
                  setNewNodePos(null);
                  setNewNodeName('');
                }
              }}>Erstellen</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CUSTOM MODAL: RELATION SELECTOR ─── */}
      {newEdgeData && (
        <div className="command-palette-overlay" onClick={() => setNewEdgeData(null)}>
          <div className="command-palette-window" style={{ maxWidth: '420px', width: '100%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="title-serif" style={{ fontSize: '20px', marginBottom: '8px', margin: 0 }}>Beziehung definieren</h3>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Wie hängen diese Gedanken zusammen?</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              {([
                { key: 'supports', desc: 'stützt / beweist' },
                { key: 'contradicts', desc: 'widerspricht / blockiert' },
                { key: 'causes', desc: 'verursacht / führt zu' },
                { key: 'requires', desc: 'benötigt / setzt voraus' }
              ] as const).map(type => (
                <button
                  key={type.key}
                  className="btn-sage-secondary"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', width: '100%', fontSize: '12px' }}
                  onClick={() => {
                    createEdge(newEdgeData.sourceId, newEdgeData.targetId, type.key);
                    setNewEdgeData(null);
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{type.key.toUpperCase()}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{type.desc}</span>
                </button>
              ))}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-sage-secondary" style={{ fontSize: '11px', padding: '6px 12px' }} onClick={() => setNewEdgeData(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SIDE-PEEK DETAILS DRAWER (Slide-out) ─── */}
      <div className={`side-peek-panel ${selectedNode ? 'open' : ''}`}>
        {selectedNode && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label-mono">Concept node details</span>
              <button onClick={() => setSelectedNodeId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div>
              <h3 className="title-serif" style={{ fontSize: '28px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                {selectedNode.name}
              </h3>
              <span className="label-mono" style={{ fontSize: '10px' }}>
                {selectedNode.metadata?.isContentMirror ? 'CONTENT' : selectedNode.type.toUpperCase()} • Lifecycle: {selectedNode.lifecycleState.toUpperCase()}
              </span>
            </div>

            {/* Single source of truth: this node IS a pipeline card — jump to its workspace */}
            {selectedNode.metadata?.cardId && onOpenCard && (
              <button
                className="btn-sage-primary"
                onClick={() => onOpenCard(selectedNode.metadata!.cardId as string, selectedNode.name)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', fontSize: '12px' }}
              >
                <FileText size={13} /> Open workspace
              </button>
            )}

            {/* Description details */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Description</h4>
              <textarea 
                value={selectedNode.description ?? ''}
                onChange={(e) => updateNode(selectedNode.id, { description: e.target.value })}
                style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', width: '100%', border: '1px solid var(--border-color)', background: 'transparent', padding: '8px', borderRadius: '4px', outline: 'none', resize: 'vertical', minHeight: '80px' }}
              />
            </div>

            {/* Why does this node exist */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Compass size={13} color="var(--accent-color)" /> Warum existiert dieser Knoten?
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {selectedNode.metadata?.isContentMirror
                  ? 'Ein Content-Stück aus der Pipeline, das im Wissensgraph lebt. '
                  : `Erfasst als ${selectedNode.type}. `}
                {selectedNode.sourceCount > 0 && `Gestützt von ${selectedNode.sourceCount} Quelle(n). `}
                {incoming.length + outgoing.length > 0
                  ? `${incoming.length + outgoing.length} Verbindung(en) im Graph.`
                  : 'Noch keine Verbindungen — verbinde ihn mit anderen Gedanken.'}
              </p>
            </div>

            {/* Referenced by (incoming) */}
            {incoming.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>Wird referenziert von ({incoming.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {incoming.map(edge => { const n = relNode(edge.sourceId); return n ? renderRelRow(edge, n, 'in') : null; })}
                </div>
              </div>
            )}

            {/* Leads to (outgoing) */}
            {outgoing.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>Führt zu / referenziert ({outgoing.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {outgoing.map(edge => { const n = relNode(edge.targetId); return n ? renderRelRow(edge, n, 'out') : null; })}
                </div>
              </div>
            )}

            {/* Content using this node */}
            {contentUsing.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={13} color="var(--accent-color)" /> Content, der dies nutzt ({contentUsing.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {contentUsing.map(n => (
                    <div key={n.id}
                      onClick={() => onOpenCard && n.metadata?.cardId ? onOpenCard(n.metadata.cardId as string, n.name) : setSelectedNodeId(n.id)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '8px 12px', background: 'rgba(15,90,71,0.05)', borderRadius: '4px', cursor: 'pointer' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{n.name}</span>
                      <span style={{ fontSize: '9px', color: 'var(--accent-color)', fontFamily: 'var(--font-mono)' }}>öffnen →</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Goals depending on this node */}
            {goalsDependent.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Target size={13} color="var(--accent-color)" /> Ziele, die daran hängen ({goalsDependent.length})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {goalsDependent.map(n => (
                    <div key={n.id} onClick={() => setSelectedNodeId(n.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', padding: '8px 12px', background: 'rgba(0,0,0,0.02)', borderRadius: '4px', cursor: 'pointer' }}>
                      <Target size={11} color="var(--accent-color)" />
                      <span style={{ color: 'var(--text-primary)' }}>{n.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality Calibration */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Award size={13} color="var(--accent-color)" /> Confidence Matrix
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Extraction Confidence', val: Math.round((selectedNode.confidence?.extractionConfidence ?? 0.8) * 100) },
                  { label: 'Reasoning Confidence', val: Math.round((selectedNode.confidence?.reasoningConfidence ?? 0.8) * 100) },
                  { label: 'Relationship Confidence', val: Math.round((selectedNode.confidence?.relationshipConfidence ?? 0.8) * 100) }
                ].map(item => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ fontWeight: 600 }}>{item.val}%</span>
                    </div>
                    <div style={{ height: '2px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px' }}>
                      <div style={{ width: `${item.val}%`, height: '100%', background: 'var(--accent-color)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Node delete override button */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Calibrate Node Lifecycle</h4>
                <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>Override prefrontal parameters</p>
              </div>
              <button 
                className="btn-sage-secondary"
                style={{ padding: '6px 12px', fontSize: '10px', color: '#B42318', borderColor: '#FECDCA' }}
                onClick={() => { deleteNode(selectedNode.id); setSelectedNodeId(null); }}
              >
                Delete Concept
              </button>
            </div>

            {/* Activity */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: 'auto' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={13} color="var(--accent-color)" /> Activity
              </h4>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Last activity: {selectedNode.lastActivityAt ? new Date(selectedNode.lastActivityAt).toLocaleDateString() : 'Just now'} • Active core parameter index.
              </p>
            </div>

          </div>
        )}
      </div>

    </div>
  );
};
export default CognitionView;
