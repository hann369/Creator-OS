import React, { useState, useRef } from 'react';
import { Youtube, FileText, Target, TrendingUp, Zap, X, BookOpen, Compass, Award, Activity } from 'lucide-react';

interface CanvasObject {
  id: string;
  type: 'card' | 'concept' | 'goal' | 'pdf' | 'youtube';
  name: string;
  x: number;
  y: number;
  status?: string;
  notes?: string;
  metrics?: string;
  trend?: number;
  priority?: number;
  checklist?: { id: string; text: string; checked: boolean }[];
}

interface CanvasLink {
  id: string;
  sourceId: string;
  targetId: string;
  relationship: string;
}

const INITIAL_OBJECTS: CanvasObject[] = [
  // Kanban Cards (Mini-documents)
  { 
    id: 'o_c1', 
    type: 'card', 
    name: 'Why Multi-Agent Systems Will Replace Solo AI', 
    x: 80, 
    y: 80, 
    status: 'Scripting', 
    notes: 'Detailing local llama.cpp setups and coordination layers.', 
    trend: 8.7, 
    priority: 9.1,
    checklist: [
      { id: '1', text: 'Write introduction hook', checked: true },
      { id: '2', text: 'Calibrate probability weights', checked: false }
    ]
  },
  { 
    id: 'o_c2', 
    type: 'card', 
    name: 'The Cognitive OS I Built to Think', 
    x: 80, 
    y: 330, 
    status: 'Outline', 
    notes: 'Explain utility formula and invisible UX states.', 
    trend: 9.2, 
    priority: 8.6,
    checklist: [
      { id: '1', text: 'Detail 7-dimension formula', checked: true }
    ]
  },
  
  // Concept Graph Nodes (Knowledge Landscape)
  { id: 'o_n1', type: 'concept', name: 'Multi-Agent Workspaces', x: 420, y: 130 },
  { id: 'o_n2', type: 'concept', name: 'Cognitive OS Architecture', x: 420, y: 290 },
  
  // Goals
  { id: 'o_g1', type: 'goal', name: 'Goal: Reach 100k Subscribers', x: 420, y: 460, metrics: '65% completed' },
  
  // Ingested Resources
  { id: 'o_r1', type: 'youtube', name: 'Ali Abdaal: Future of AI Workflows', x: 720, y: 100 },
  { id: 'o_r2', type: 'pdf', name: 'Paper: Prompt Routing Protocols', x: 720, y: 300 }
];

const INITIAL_LINKS: CanvasLink[] = [
  { id: 'l1', sourceId: 'o_r1', targetId: 'o_n1', relationship: 'ingested_from' },
  { id: 'l2', sourceId: 'o_r2', targetId: 'o_n1', relationship: 'enables' },
  { id: 'l3', sourceId: 'o_n1', targetId: 'o_c1', relationship: 'supports' },
  { id: 'l4', sourceId: 'o_n1', targetId: 'o_n2', relationship: 'causes' },
  { id: 'l5', sourceId: 'o_n2', targetId: 'o_c2', relationship: 'enables' },
  { id: 'l6', sourceId: 'o_n2', targetId: 'o_g1', relationship: 'goal_supports' }
];

export const WorkspaceCanvas: React.FC = () => {
  const [objects, setObjects] = useState<CanvasObject[]>(INITIAL_OBJECTS);
  const [links] = useState<CanvasLink[]>(INITIAL_LINKS);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Dragging node state
  const [draggedObjectId, setDraggedObjectId] = useState<string | null>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedObject = objects.find(o => o.id === selectedObjectId);

  // ─── Drag & Pan Events ──────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('canvas-backdrop')) {
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
    } else if (draggedObjectId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const svgX = (e.clientX - rect.left - pan.x) / zoom;
      const svgY = (e.clientY - rect.top - pan.y) / zoom;
      
      setObjects(prev => prev.map(o => o.id === draggedObjectId ? {
        ...o,
        x: svgX - dragStartOffset.current.x,
        y: svgY - dragStartOffset.current.y
      } : o));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedObjectId(null);
  };

  const handleObjectMouseDown = (e: React.MouseEvent, obj: CanvasObject) => {
    e.stopPropagation();
    setSelectedObjectId(obj.id);
    setDraggedObjectId(obj.id);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const svgX = (e.clientX - rect.left - pan.x) / zoom;
      const svgY = (e.clientY - rect.top - pan.y) / zoom;
      dragStartOffset.current = {
        x: svgX - obj.x,
        y: svgY - obj.y
      };
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.4, Math.min(2.0, newZoom)));
  };

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="canvas-backdrop"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : 'grab'
      }}
    >
      {/* Inline CSS style tag to animate flowing neural lines */}
      <style>{`
        @keyframes pathFlow {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        .neural-pathway {
          stroke-dasharray: 6, 6;
          animation: pathFlow 1.2s linear infinite;
        }
      `}</style>

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
        {/* SVG layer for relationship curves */}
        <svg style={{ position: 'absolute', width: '3000px', height: '2000px', top: 0, left: 0, zIndex: 0 }}>
          {links.map(link => {
            const s = objects.find(o => o.id === link.sourceId);
            const t = objects.find(o => o.id === link.targetId);
            if (!s || !t) return null;

            // Anchor points centered on coordinates
            const sx = s.x + 125;
            const sy = s.y + (s.type === 'card' ? 70 : 35);
            const tx = t.x + 125;
            const ty = t.y + (t.type === 'card' ? 70 : 35);

            const midX = (sx + tx) / 2;
            const midY = (sy + ty) / 2;

            return (
              <g key={link.id}>
                {/* Curved Bezier Edge - Dotted flowing pathway */}
                <path
                  d={`M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`}
                  fill="none"
                  stroke="rgba(15, 90, 71, 0.15)"
                  strokeWidth={2}
                  className="neural-pathway"
                />
                <circle cx={midX} cy={midY} r={3} fill="var(--accent-color)" opacity={0.8} />
              </g>
            );
          })}
        </svg>

        {/* Spatial Cards & Nodes */}
        {objects.map(obj => {
          const isSelected = selectedObjectId === obj.id;
          
          let icon = <FileText size={13} color="var(--accent-color)" />;
          let headerColor = 'var(--accent-color)';
          let bgStyle = {};

          if (obj.type === 'goal') {
            icon = <Target size={13} color="#6366f1" />;
            headerColor = '#6366f1';
          } else if (obj.type === 'youtube') {
            icon = <Youtube size={13} color="#ef4444" />;
            headerColor = '#ef4444';
          } else if (obj.type === 'pdf') {
            icon = <BookOpen size={13} color="#f59e0b" />;
            headerColor = '#f59e0b';
          } else if (obj.type === 'card') {
            icon = <Zap size={13} color="var(--accent-color)" />;
            headerColor = 'var(--accent-color)';
            bgStyle = { borderTop: `2.5px solid var(--accent-color)` };
          }

          return (
            <div
              key={obj.id}
              onMouseDown={(e) => handleObjectMouseDown(e, obj)}
              className={`spatial-object-card ${obj.type !== 'card' ? 'glowing-node' : ''}`}
              style={{
                left: `${obj.x}px`,
                top: `${obj.y}px`,
                width: '250px',
                pointerEvents: 'auto',
                border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                zIndex: isSelected ? 50 : 20,
                opacity: 0.95,
                ...bgStyle
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {icon}
                  <span style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: headerColor }}>
                    {obj.type}
                  </span>
                </div>
                {obj.trend && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--accent-color)' }}>
                    <TrendingUp size={8} /> {obj.trend.toFixed(1)}
                  </div>
                )}
              </div>

              {/* Title */}
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.4', marginBottom: '8px' }}>
                {obj.name}
              </div>

              {/* Card Checklist Summaries */}
              {obj.checklist && obj.checklist.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '10px 0', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                  {obj.checklist.map(chk => (
                    <div key={chk.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--accent-color)', fontWeight: 800 }}>{chk.checked ? '✓' : '⚬'}</span>
                      <span style={{ textDecoration: chk.checked ? 'line-through' : 'none' }}>{chk.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Description/Context details */}
              {obj.status && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '10px', color: 'var(--text-secondary)', borderTop: obj.checklist ? 'none' : '1px solid var(--border-color)', paddingTop: obj.checklist ? 0 : '8px' }}>
                  <span>Status: <strong>{obj.status}</strong></span>
                  {obj.priority && (
                    <span style={{ background: 'var(--accent-light)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, color: 'var(--accent-color)' }}>
                      P={obj.priority.toFixed(1)}
                    </span>
                  )}
                </div>
              )}

              {obj.metrics && (
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                  {obj.metrics}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── SIDE-PEEK DETAILS DRAWER (Slide-out) ─── */}
      <div className={`side-peek-panel ${selectedObject ? 'open' : ''}`} style={{ width: '340px', zIndex: 120 }}>
        {selectedObject && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label-mono">{selectedObject.type} node details</span>
              <button onClick={() => setSelectedObjectId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div>
              <h3 className="title-serif" style={{ fontSize: '24px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                {selectedObject.name}
              </h3>
              <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                ID: {selectedObject.id} • Coordinate: ({Math.round(selectedObject.x)}, {Math.round(selectedObject.y)})
              </p>
            </div>

            {/* Custom metadata inputs */}
            {selectedObject.type === 'card' && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Pipeline Status</h4>
                <div style={{ fontSize: '13px', background: 'rgba(0,0,0,0.02)', padding: '8px 12px', borderRadius: '4px' }}>
                  Status: <strong>{selectedObject.status}</strong>
                </div>
              </div>
            )}

            {/* Related connections */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Compass size={14} color="var(--accent-color)" /> Semantic Connections
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {links.filter(l => l.sourceId === selectedObject.id || l.targetId === selectedObject.id).map(link => {
                  const targetObj = objects.find(o => o.id === (link.sourceId === selectedObject.id ? link.targetId : link.sourceId));
                  return (
                    <div key={link.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '6px 10px', background: 'rgba(0,0,0,0.02)', borderRadius: '4px' }}>
                      <span style={{ fontWeight: 600 }}>{link.relationship.toUpperCase()}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{targetObj?.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quality Calibration */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Award size={14} color="var(--accent-color)" /> Confidence Decomposition
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Extraction', val: 92 },
                  { label: 'Causal Correlation', val: 86 }
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

            {/* Activity */}
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: 'auto' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={14} color="var(--accent-color)" /> Activity
              </h4>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Modified 2 minutes ago. Automatically synchronized to central SQLite World Graph repository.
              </p>
            </div>

          </div>
        )}
      </div>

    </div>
  );
};
export default WorkspaceCanvas;
