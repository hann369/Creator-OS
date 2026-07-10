import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { PipelineStatus, CognitiveSession, Node, Edge, WorldNodeType, WorldEdgeType } from '@pronoia/domain';
import { pipelineCardToNode, contentMirrorNodeId } from '@pronoia/domain';
import { supabase } from '../lib/supabase.js';
import { getActiveWorkspaceId } from '../lib/workspace.js';
import { runIdentityLearning } from '../lib/identityLearning.js';
import {
  nodes as nodeStore,
  edges as edgeStore,
  cards as cardStore,
  edgesTouching,
  rowToNode,
  rowToEdge,
  rowToCard,
  type ExtendedContentPipeline
} from '../store/graph.js';

export type { ExtendedContentPipeline };

export interface WorkspaceContextType {
  nodes: Node[];
  edges: Edge[];
  pipelineCards: ExtendedContentPipeline[];
  activeSession: CognitiveSession | null;
  activityLogs: string[];
  isLoading: boolean;
  addActivityLog: (msg: string) => void;
  
  // Graph actions
  createNode: (name: string, type: string, x: number, y: number) => void;
  updateNode: (id: string, updates: Partial<Node>) => void;
  deleteNode: (id: string) => void;
  createEdge: (sourceId: string, targetId: string, relationshipType: string) => void;
  updateEdge: (id: string, updates: Partial<Edge>) => void;
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

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Graph and pipeline state live in the shared collections (Roadmap Phase B):
  // module-level, project-scoped, offline-mirrored, and loaded on first read.
  // This provider owns the realtime subscriptions and the domain actions.
  const rawNodes = nodeStore.useItems();
  const edges = edgeStore.useItems();
  const pipelineCards = cardStore.useItems();

  // 1. Filter out any legacy 'card:*' nodes from rawNodes
  // 2. Derive mirror nodes from pipelineCards in-memory
  const nodes = useMemo(() => {
    const conceptNodes = rawNodes.filter(n => !n.id.startsWith('card:'));
    const mirrorNodes = pipelineCards.map(c => {
      const unifiedNode = pipelineCardToNode(c, getActiveWorkspaceId());
      // Override deterministic positions with card's actual positions if present
      if (c.x != null && c.y != null) {
        unifiedNode.metadata = {
          ...unifiedNode.metadata,
          x: c.x,
          y: c.y
        };
      }
      return unifiedNode;
    });
    return [...conceptNodes, ...mirrorNodes];
  }, [rawNodes, pipelineCards]);

  // Each useLoaded() is a hook — read all three before combining them, or `&&`
  // short-circuits and the hook order changes between renders.
  const nodesLoaded = nodeStore.useLoaded();
  const edgesLoaded = edgeStore.useLoaded();
  const cardsLoaded = cardStore.useLoaded();
  const isLoading = !(nodesLoaded && edgesLoaded && cardsLoaded);

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

  // ─── Supabase Realtime subscriptions ──────────────────────────────────────
  // The subscriptions stay here; they feed the collections through the *Remote
  // methods, which touch state and the offline mirror but never write back.
  useEffect(() => {
    const channel = supabase
      .channel('workspace-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'world_nodes' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;   // ignore other projects
        nodeStore.insertRemote(rowToNode(payload.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'world_nodes' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        nodeStore.replaceRemote(rowToNode(payload.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'world_nodes' }, payload => {
        nodeStore.dropRemote(payload.old.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'world_edges' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        edgeStore.insertRemote(rowToEdge(payload.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'world_edges' }, payload => {
        edgeStore.dropRemote(payload.old.id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pipeline_cards' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        cardStore.insertRemote(rowToCard(payload.new));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pipeline_cards' }, payload => {
        if (payload.new.workspace_id !== getActiveWorkspaceId()) return;
        cardStore.replaceRemote(rowToCard(payload.new));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pipeline_cards' }, payload => {
        cardStore.dropRemote(payload.old.id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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
    const newNode: Node = {
      id: `node-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId: getActiveWorkspaceId(),
      type: type as WorldNodeType,
      label: name,
      description: 'Custom created concept node.',
      metadata: { x, y },
      confidence: { extractionConfidence: 1.0, reasoningConfidence: 1.0, relationshipConfidence: 1.0, verificationConfidence: 1.0 },
      sourceCount: 1,
      derivedFrom: [],
      lifecycleState: 'created',
      origin: 'world',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    nodeStore.add(newNode);
    addActivityLog(`Created concept: ${name}`);
  }, [addActivityLog]);

  const updateNode = useCallback((id: string, updates: Partial<Node>) => {
    if (id.startsWith('card:')) {
      const cardId = id.substring(5);
      if (updates.metadata && (updates.metadata.x !== undefined || updates.metadata.y !== undefined)) {
        cardStore.update(cardId, {
          x: updates.metadata.x !== undefined ? Number(updates.metadata.x) : undefined,
          y: updates.metadata.y !== undefined ? Number(updates.metadata.y) : undefined
        });
      }
    } else {
      nodeStore.update(id, updates);
    }
  }, []);

  const deleteNode = useCallback((id: string) => {
    if (id.startsWith('card:')) {
      const cardId = id.substring(5);
      cardStore.remove(cardId);
      addActivityLog(`Deleted card: ${cardId}`);
    } else {
      nodeStore.remove(id);
      addActivityLog(`Deleted node: ${id}`);
    }
    edgesTouching(id).forEach(e => edgeStore.remove(e.id));
  }, [addActivityLog]);

  const createEdge = useCallback((sourceId: string, targetId: string, relationshipType: string) => {
    const newEdge: Edge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId: getActiveWorkspaceId(),
      sourceId,
      targetId,
      type: relationshipType as WorldEdgeType,
      origin: 'world',
      createdAt: new Date()
    };
    edgeStore.add(newEdge);
    addActivityLog(`Linked: ${sourceId} → ${targetId} (${relationshipType})`);
  }, [addActivityLog]);

  const updateEdge = useCallback((id: string, updates: Partial<Edge>) => {
    edgeStore.update(id, updates);
  }, []);

  const deleteEdge = useCallback((id: string) => {
    edgeStore.remove(id);
    addActivityLog(`Deleted connection: ${id}`);
  }, [addActivityLog]);

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
    cardStore.add(newCard);
    addActivityLog(`Created draft: ${title}`);
    return newCard.id;
  }, [addActivityLog]);

  const updateCard = useCallback((id: string, updates: Partial<ExtendedContentPipeline>) => {
    cardStore.update(id, updates);
  }, []);

  const deleteCard = useCallback((id: string) => {
    cardStore.remove(id);
    const mId = mirrorNodeId(id);
    edgesTouching(mId).forEach(e => edgeStore.remove(e.id));
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
    cardStore.add(duplicated);
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
    const newNode: Node = {
      id: newId,
      workspaceId: getActiveWorkspaceId(),
      type: type as WorldNodeType,
      label: card.title,
      description: card.hook || `Promoted from content card.`,
      metadata: { x: baseX + 60, y: baseY },
      confidence: { extractionConfidence: 1, reasoningConfidence: 1, relationshipConfidence: 1, verificationConfidence: 1 },
      sourceCount: 1,
      derivedFrom: [mId],
      lifecycleState: 'created',
      origin: 'world',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    nodeStore.add(newNode);

    const relationshipType = type === 'goal' ? 'goal_supports' : 'references';
    const newEdge: Edge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      workspaceId: getActiveWorkspaceId(),
      sourceId: mId,
      targetId: newId,
      type: relationshipType as WorldEdgeType,
      origin: 'world',
      createdAt: new Date()
    };
    edgeStore.add(newEdge);

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
