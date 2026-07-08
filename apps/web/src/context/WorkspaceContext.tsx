import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { PipelineStatus, WorldNode, WorldEdge, CognitiveSession } from '@pronoia/domain';
import { pipelineCardToNode, nodeToWorldNode, contentMirrorNodeId } from '@pronoia/domain';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { runIdentityLearning } from '../lib/identityLearning.js';
import {
  entityStore,
  rowToNode,
  rowToEdge,
  rowToCard,
  type ExtendedContentPipeline
} from '../lib/entityStore.js';

export type { ExtendedContentPipeline };

export interface WorkspaceContextType {
  nodes: WorldNode[];
  edges: WorldEdge[];
  pipelineCards: ExtendedContentPipeline[];
  activeSession: CognitiveSession | null;
  activityLogs: string[];
  isLoading: boolean;
  addActivityLog: (msg: string) => void;
  
  // Graph actions
  createNode: (name: string, type: string, x: number, y: number) => void;
  updateNode: (id: string, updates: Partial<WorldNode>) => void;
  deleteNode: (id: string) => void;
  createEdge: (sourceId: string, targetId: string, relationshipType: string) => void;
  updateEdge: (id: string, updates: Partial<WorldEdge>) => void;
  deleteEdge: (id: string) => void;

  // Pipeline actions
  createCard: (title: string, status: PipelineStatus) => string;
  updateCard: (id: string, updates: Partial<ExtendedContentPipeline>) => void;
  deleteCard: (id: string) => void;
  duplicateCard: (id: string) => void;
  // Promote a card into a linked knowledge node (Convert to Goal/Concept/…)
  promoteCardToNode: (cardId: string, type: string) => void;
  // Deterministic id of a card's mirror node (single source of truth helper)
  cardNodeId: (cardId: string) => string;

  // Session actions
  startSession: (projectName: string, goalTitle: string) => void;
  endSession: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);


// ─── Single Source of Truth: card ⇄ node mirror ─────────────────────────────
// Every pipeline card owns a deterministic "mirror" node in the World Model, so
// a card IS a graph node (and a document, and an executive candidate). The id is
// derivable from the card id, so we never need a foreign-key column.
const mirrorNodeId = contentMirrorNodeId;

// Deterministic placement from the card id keeps mirror nodes stable across loads
// and clustered in a "content lane" beneath the concept cloud. The projection now
// lives once in the tested domain layer (pipelineCardToNode); we re-shape it to the
// legacy WorldNode via nodeToWorldNode.
function buildMirrorNode(card: { id: string; title: string; hook?: string; status: string; attachments?: unknown[] }): WorldNode {
  return nodeToWorldNode(pipelineCardToNode(card, getActiveWorkspaceId()));
}

// ─── Supabase Row ↔ Domain Model mappers moved to entityStore ───────────────────

// ─── Provider ────────────────────────────────────────────────────────────────

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [nodes, setNodes] = useState<WorldNode[]>([]);
  const [edges, setEdges] = useState<WorldEdge[]>([]);
  const [pipelineCards, setPipelineCards] = useState<ExtendedContentPipeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<CognitiveSession | null>(() => {
    const saved = localStorage.getItem('pronoia_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [activityLogs, setActivityLogs] = useState<string[]>(() => {
    const saved = localStorage.getItem('pronoia_logs');
    return saved ? JSON.parse(saved) : [];
  });

  const addActivityLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActivityLogs(prev => {
      const updated = [`${time} ${msg}`, ...prev.slice(0, 5)];
      localStorage.setItem('pronoia_logs', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ─── Initial Supabase fetch ────────────────────────────────────────────────
  useEffect(() => {
    const loadFromSupabase = async () => {
      setIsLoading(true);
      try {
        const [nodesData, edgesData, cardsData] = await Promise.all([
          entityStore.loadNodes(getActiveWorkspaceId()),
          entityStore.loadEdges(getActiveWorkspaceId()),
          entityStore.loadCards(getActiveWorkspaceId())
        ]);

        // Every workspace starts empty — the UI carries its own empty states. No
        // demo/seed content is injected.
        setNodes(nodesData);
        setEdges(edgesData);
        setPipelineCards(cardsData);
      } catch (err) {
        console.warn('entityStore load failed — falling back to local state', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadFromSupabase();
  }, []);

  // ─── Supabase Realtime subscriptions ──────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('workspace-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'world_nodes' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;   // ignore other projects
        setNodes(prev => prev.some(n => n.id === payload.new.id) ? prev : [...prev, rowToNode(payload.new)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'world_nodes' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        setNodes(prev => prev.map(n => n.id === payload.new.id ? rowToNode(payload.new) : n));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'world_nodes' }, payload => {
        setNodes(prev => prev.filter(n => n.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'world_edges' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        setEdges(prev => prev.some(e => e.id === payload.new.id) ? prev : [...prev, rowToEdge(payload.new)]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'world_edges' }, payload => {
        setEdges(prev => prev.filter(e => e.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pipeline_cards' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        setPipelineCards(prev => prev.some(c => c.id === payload.new.id) ? prev : [...prev, rowToCard(payload.new)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pipeline_cards' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        setPipelineCards(prev => prev.map(c => c.id === payload.new.id ? rowToCard(payload.new) : c));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pipeline_cards' }, payload => {
        setPipelineCards(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ─── Mirror-node backfill (single source of truth) ─────────────────────────
  // Any card without a graph node gets one, so existing/legacy cards also live in
  // the World Model. Runs after load; self-terminates once every card is mirrored.
  useEffect(() => {
    if (isLoading) return;
    const missing = pipelineCards.filter(c => !nodes.some(n => n.id === mirrorNodeId(c.id)));
    if (missing.length === 0) return;
    const mNodes = missing.map(buildMirrorNode);
    setNodes(prev => [...prev, ...mNodes.filter(mn => !prev.some(n => n.id === mn.id))]);
    // upsert + ignoreDuplicates: idempotent, so re-runs never error on existing rows.
    Promise.all(mNodes.map(mn => entityStore.upsert(mn as any)))
      .catch(err => console.warn('Mirror-node backfill skipped:', err));
  }, [isLoading, pipelineCards, nodes]);

  // ─── Session persistence (stays local) ────────────────────────────────────
  useEffect(() => {
    if (activeSession) localStorage.setItem('pronoia_session', JSON.stringify(activeSession));
    else localStorage.removeItem('pronoia_session');
  }, [activeSession]);

  // ─── Learning loop trigger ─────────────────────────────────────────────────
  // Whenever a card's performance metrics change, re-run identity learning so
  // hooks get re-ranked by what actually performs. Debounced on a metrics
  // signature so ordinary card edits don't fire it.
  const lastMetricsSig = useRef('');
  useEffect(() => {
    if (isLoading) return;
    const withMetrics = pipelineCards.filter(c => c.metrics);
    if (withMetrics.length === 0) return;
    const sig = withMetrics
      .map(c => `${c.id}:${c.metrics!.viralScore ?? 0}:${c.metrics!.clickThroughRate ?? 0}:${c.metrics!.subscriberGain ?? 0}`)
      .join('|');
    if (sig === lastMetricsSig.current) return;
    lastMetricsSig.current = sig;
    runIdentityLearning(pipelineCards)
      .then(updated => { if (updated.length) addActivityLog(`Identity learning: re-ranked hooks (${updated.length})`); })
      .catch(() => { /* learning is best-effort */ });
  }, [isLoading, pipelineCards, addActivityLog]);

  // ─── Graph Actions ─────────────────────────────────────────────────────────
  const createNode = useCallback((name: string, type: string, x: number, y: number) => {
    const newNode: WorldNode = {
      id: `node-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId: getActiveWorkspaceId(),
      name,
      type: type as any,
      description: 'Custom created concept node.',
      metadata: { x, y },
      confidence: { extractionConfidence: 1.0, reasoningConfidence: 1.0, relationshipConfidence: 1.0, verificationConfidence: 1.0 },
      sourceCount: 1,
      lastVerified: new Date(),
      derivedFrom: [],
      lifecycleState: 'created',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    // Optimistic UI
    setNodes(prev => [...prev, newNode]);
    entityStore.upsert(newNode as any).catch(err => console.error('Failed to save node:', err));
    addActivityLog(`Created concept: ${name}`);
  }, [addActivityLog]);

  const updateNode = useCallback((id: string, updates: Partial<WorldNode>) => {
    setNodes(prev => {
      const node = prev.find(n => n.id === id);
      if (node) {
        const updated = { ...node, ...updates, updatedAt: new Date() };
        entityStore.upsert(updated as any).catch(err => console.error('Failed to update node in entityStore:', err));
      }
      return prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date() } : n);
    });
  }, []);

  const deleteNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.sourceId !== id && e.targetId !== id));
    entityStore.remove(id).catch(err => console.error('Failed to delete node:', err));
    addActivityLog(`Deleted node: ${id}`);
  }, [addActivityLog]);

  const createEdge = useCallback((sourceId: string, targetId: string, relationshipType: string) => {
    const newEdge: WorldEdge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId: getActiveWorkspaceId(),
      sourceId,
      targetId,
      weight: 1.0,
      relationshipType: relationshipType as any,
      confidence: { extractionConfidence: 1.0, reasoningConfidence: 1.0, relationshipConfidence: 1.0, verificationConfidence: 1.0 },
      createdAt: new Date()
    };
    setEdges(prev => [...prev, newEdge]);
    entityStore.saveEdge(newEdge).catch(err => console.error('Failed to save edge:', err));
    addActivityLog(`Linked: ${sourceId} → ${targetId} (${relationshipType})`);
  }, [addActivityLog]);

  const updateEdge = useCallback((id: string, updates: Partial<WorldEdge>) => {
    setEdges(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  const deleteEdge = useCallback((id: string) => {
    setEdges(prev => prev.filter(e => e.id !== id));
    entityStore.deleteEdge(id).catch(err => console.error('Failed to delete edge:', err));
  }, []);

  // ─── Pipeline Actions ──────────────────────────────────────────────────────
  const createCard = useCallback((title: string, status: PipelineStatus): string => {
    const newCard: ExtendedContentPipeline = {
      id: `card-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId: getActiveWorkspaceId(),
      title,
      hook: '',
      format: 'longform',
      status,
      platforms: ['youtube'],
      trendScore: 5.0,
      executivePriority: 5.0,
      linkedNodeIds: [],
      markdown: `# ${title}\n\nStart writing outline here...`,
      checklists: [],
      attachments: [],
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setPipelineCards(prev => [...prev, newCard]);
    entityStore.upsert({ ...newCard, type: 'pipeline_card' } as any).catch(err => console.error('Failed to create card:', err));

    // Single source of truth: the card also enters the World Model as a node.
    const mNode = buildMirrorNode(newCard);
    setNodes(prev => prev.some(n => n.id === mNode.id) ? prev : [...prev, mNode]);
    entityStore.upsert(mNode as any).catch(err => console.warn('Failed to mirror card as node:', err));

    addActivityLog(`Created draft: ${title}`);
    return newCard.id;
  }, [addActivityLog]);

  const updateCard = useCallback((id: string, updates: Partial<ExtendedContentPipeline>) => {
    setPipelineCards(prev => {
      const card = prev.find(c => c.id === id);
      if (card) {
        const updated = { ...card, ...updates, type: 'pipeline_card' as const, updatedAt: new Date() };
        entityStore.upsert(updated as any).catch(err => console.error('Failed to update card in entityStore:', err));
      }
      return prev.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date() } : c);
    });

    // Keep the mirror node in sync (title → node name).
    if (updates.title !== undefined) {
      const mId = mirrorNodeId(id);
      setNodes(prev => {
        const node = prev.find(n => n.id === mId);
        if (node) {
          const updated = { ...node, name: updates.title!, updatedAt: new Date() };
          entityStore.upsert(updated as any).catch(err => console.error('Failed to update mirror node in entityStore:', err));
        }
        return prev.map(n => n.id === mId ? { ...n, name: updates.title!, updatedAt: new Date() } : n);
      });
    }
  }, []);

  const deleteCard = useCallback((id: string) => {
    setPipelineCards(prev => prev.filter(c => c.id !== id));
    entityStore.remove(id).catch(err => console.error('Failed to delete card:', err));

    // Remove the mirror node and any edges touching it.
    const mId = mirrorNodeId(id);
    setNodes(prev => prev.filter(n => n.id !== mId));
    setEdges(prev => prev.filter(e => e.sourceId !== mId && e.targetId !== mId));
    entityStore.remove(mId).catch(err => console.warn('Failed to delete mirror node:', err));

    addActivityLog(`Archived card: ${id}`);
  }, [addActivityLog]);

  const duplicateCard = useCallback((id: string) => {
    const card = pipelineCards.find(c => c.id === id);
    if (!card) return;
    const duplicated: ExtendedContentPipeline = {
      ...card,
      id: `card-${crypto.randomUUID().slice(0, 8)}`,
      title: `${card.title} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setPipelineCards(prev => [...prev, duplicated]);
    entityStore.upsert({ ...duplicated, type: 'pipeline_card' } as any).catch(err => console.error('Failed to duplicate card:', err));
    addActivityLog(`Cloned draft: ${duplicated.title}`);
  }, [pipelineCards, addActivityLog]);

  const cardNodeId = useCallback((cardId: string) => mirrorNodeId(cardId), []);

  // Promote a card into the knowledge graph as a new typed node, linked to the
  // card's mirror node — this is how a content idea becomes a Goal/Concept and
  // the projektgraph grows.
  const promoteCardToNode = useCallback((cardId: string, type: string) => {
    const card = pipelineCards.find(c => c.id === cardId);
    if (!card) return;
    const mId = mirrorNodeId(cardId);
    const mirror = nodes.find(n => n.id === mId);
    const baseX = (mirror?.metadata?.x as number) ?? 400;
    const baseY = ((mirror?.metadata?.y as number) ?? 400) - 180;

    const newId = `node-${crypto.randomUUID().slice(0, 8)}`;
    const newNode: WorldNode = {
      id: newId,
      workspaceId: getActiveWorkspaceId(),
      name: card.title,
      type: type as WorldNode['type'],
      description: card.hook || `Promoted from content card.`,
      metadata: { x: baseX + 60, y: baseY },
      confidence: { extractionConfidence: 1, reasoningConfidence: 1, relationshipConfidence: 1, verificationConfidence: 1 },
      sourceCount: 1,
      lastVerified: new Date(),
      derivedFrom: [mId],
      lifecycleState: 'created',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setNodes(prev => [...prev, newNode]);
    entityStore.upsert(newNode as any).catch(err => console.warn('Failed to persist promoted node:', err));

    const relationshipType = type === 'goal' ? 'goal_supports' : 'references';
    const newEdge: WorldEdge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId: getActiveWorkspaceId(),
      sourceId: mId,
      targetId: newId,
      weight: 1.0,
      relationshipType: relationshipType as WorldEdge['relationshipType'],
      confidence: { extractionConfidence: 1, reasoningConfidence: 1, relationshipConfidence: 1, verificationConfidence: 1 },
      createdAt: new Date()
    };
    setEdges(prev => [...prev, newEdge]);
    entityStore.saveEdge(newEdge).catch(err => console.warn('Failed to persist promotion edge:', err));

    addActivityLog(`Promoted "${card.title}" → ${type}`);
  }, [pipelineCards, nodes, addActivityLog]);

  // ─── Session Actions ───────────────────────────────────────────────────────
  const startSession = useCallback((projectName: string, goalTitle: string) => {
    const newSession: CognitiveSession = {
      id: crypto.randomUUID(),
      workspaceId: getActiveWorkspaceId(),
      startedAt: new Date(),
      state: 'focus',
      primaryGoalId: goalTitle,
      triggeredEvents: [],
      generatedInsights: [],
      decisions: [],
      recommendations: []
    };
    setActiveSession(newSession);
    addActivityLog(`Started Focus Session: ${projectName}`);
  }, [addActivityLog]);

  const endSession = useCallback(() => {
    setActiveSession(null);
    addActivityLog('Focus Session Completed');
  }, [addActivityLog]);

  return (
    <WorkspaceContext.Provider value={{
      nodes, edges, pipelineCards, activeSession, activityLogs, isLoading,
      addActivityLog,
      createNode, updateNode, deleteNode, createEdge, updateEdge, deleteEdge,
      createCard, updateCard, deleteCard, duplicateCard, promoteCardToNode, cardNodeId,
      startSession, endSession
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
};
