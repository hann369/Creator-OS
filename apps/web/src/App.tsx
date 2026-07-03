import React, { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { KnowledgeEvaluator, UserBehaviorLearner, ExecutiveFunctionEngine } from '@pronoia/cognition';
import type { ReasoningResult } from '@pronoia/ai';

import { EditorView } from './views/EditorView.js';
import { ContentPipelineView } from './views/ContentPipelineView.js';
import { CognitionView } from './views/CognitionView.js';
import { SettingsView } from './views/SettingsView.js';
import { MoodboardsView } from './views/MoodboardsView.js';
import { IdentityView } from './views/IdentityView.js';
import { IdeationView } from './views/IdeationView.js';
import { Sidebar, TopBar, ResourcePlaceholder, SIDEBAR_W, TOPBAR_H, type ResourceView } from './components/Shell.js';
import { useWorkspace } from './context/WorkspaceContext.js';
import { reason, aiConfigured } from './lib/reasoning.js';
import type { ProjectItem } from './hooks/useProjects.js';

interface AppProps {
  project: ProjectItem;
  onExitProject: () => void;
}

export const App: React.FC<AppProps> = ({ project, onExitProject }) => {
  const {
    nodes,
    edges,
    pipelineCards,
    activityLogs,
    addActivityLog,
    startSession,
    endSession
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<'morning' | 'pipeline' | 'brain'>('morning');
  const [resource, setResource] = useState<ResourceView | null>(null);
  const [activeModal, setActiveModal] = useState<'settings' | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [showMorningBanner, setShowMorningBanner] = useState(true);
  const [showReflectionClosure, setShowReflectionClosure] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commandResponse, setCommandResponse] = useState<string | null>(null);

  // ─── Background reasoning ("die KI denkt zuerst") ───
  const [isThinking, setIsThinking] = useState(false);
  const [reasoning, setReasoning] = useState<{ result: ReasoningResult; used: string[] } | null>(null);
  
  // Full-screen focused writing mode state
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [focusedCardTitle, setFocusedCardTitle] = useState('');
  const [selectedMoodboardId, setSelectedMoodboardId] = useState<string | null>(null);

  const qualityMetrics = useMemo(() => KnowledgeEvaluator.evaluate(nodes, edges), [nodes, edges]);

  // ─── Real strategic opportunities, derived from the actual content pipeline ───
  // Every unpublished card is a candidate action. This is the single source of
  // truth: Today reasons over the same entities the user sees in Pipeline/Brain.
  const opportunities = useMemo(() =>
    pipelineCards
      .filter(c => c.status !== 'published')
      .map(c => ({
        id: c.id,
        type: 'content_gap' as const,
        description: c.title,
        nicheRelevance: Math.round(Math.min((c.trendScore ?? 5) / 10, 1) * 100),
        opportunityScore: c.trendScore ?? 5,
        metadata: { trendScore: c.trendScore ?? 5, requiredTimeMinutes: 90 }
      })),
    [pipelineCards]
  );

  const executiveContext = useMemo(() => ({
    energyLevel: 'high' as const,
    availableTimeMinutes: 90,
    expectedROI: Object.fromEntries(pipelineCards.map(c => [c.id, c.executivePriority ?? 5])),
    riskFactors: Object.fromEntries(pipelineCards.map(c => [c.id, 1.0])),
    deadlinePressure: Object.fromEntries(pipelineCards.map(c => [
      c.id,
      c.status === 'production' ? 0.8 : c.status === 'script' ? 0.6 : 0.4
    ])),
    workspaceId: 'main-space'
  }), [pipelineCards]);

  // Display path is PURE: evaluateMultiObjective has no side effects, so simply
  // viewing Today never mutates decision memory. We derive the best action here;
  // the logging variant (prioritize) is reserved for the commit in handleStartFocus.
  const executiveDecision = useMemo(() => {
    if (opportunities.length === 0) {
      return {
        opportunityId: 'default',
        actionDescription: 'Workspace im Gleichgewicht. Erfasse neue Gedanken oder Notizen.',
        priorityScore: 1.0,
        explanation: 'Keine aktiven Handlungsschwerpunkte identifiziert.',
        decisionVector: undefined as ReturnType<typeof ExecutiveFunctionEngine.evaluateMultiObjective>[number] | undefined
      };
    }
    const vectors = ExecutiveFunctionEngine.evaluateMultiObjective(opportunities, executiveContext, nodes, edges);
    const best = [...vectors].sort((a, b) => b.compositeUtility - a.compositeUtility)[0];
    return {
      opportunityId: best.opportunityId,
      actionDescription: best.description,
      priorityScore: parseFloat((best.compositeUtility * 10).toFixed(2)),
      explanation: best.executiveSummary,
      decisionVector: best
    };
  }, [opportunities, executiveContext, nodes, edges]);

  const metaCognition = useMemo(() => UserBehaviorLearner.getMetaCognition(), [executiveDecision]);

  // The card the executive engine actually chose (drives the morning headline).
  const chosenCard = useMemo(
    () => pipelineCards.find(c => c.id === executiveDecision.opportunityId),
    [pipelineCards, executiveDecision]
  );

  // ─── "Heute entdeckt" — real signals from the living knowledge graph ───
  // Count only genuine knowledge concepts, not the content-card mirror nodes.
  const discovery = useMemo(() => {
    const concepts = nodes.filter(n => !n.metadata?.isContentMirror);
    return {
      maturedConcepts: concepts.filter(n => n.lifecycleState === 'growing').length,
      newThoughts: concepts.filter(n => n.lifecycleState === 'created').length,
      contradictions: edges.filter(e => e.relationshipType === 'contradicts').length,
      openOpportunities: concepts.filter(n => n.type === 'opportunity').length
    };
  }, [nodes, edges]);

  // Subscribe to Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandResponse(null);
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const commandItems = [
    {
      title: 'Advanced Settings & Keys',
      desc: 'Configure API Provider credentials (Gemini, Mistral, OpenAI) and active models routing',
      action: () => { setActiveModal('settings'); setIsCommandPaletteOpen(false); }
    },
    {
      title: 'Model Context Protocol (MCP) Servers',
      desc: 'Register and manage external stdio/WS server tool connections',
      action: () => { setActiveModal('settings'); setIsCommandPaletteOpen(false); }
    }
  ];

  const filteredCommands = commandItems.filter(cmd =>
    cmd.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cmd.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartFocus = () => {
    // Commit: this is the moment a decision is actually made, so log it to
    // Executive Memory (the side-effecting path) exactly once.
    if (opportunities.length > 0) {
      ExecutiveFunctionEngine.prioritize(opportunities, executiveContext, nodes, edges);
    }

    // Focus the card the executive engine actually chose as today's priority.
    const cardId = chosenCard?.id ?? pipelineCards[0]?.id ?? 'c1';
    const cardTitle = chosenCard?.title ?? pipelineCards[0]?.title ?? executiveDecision.actionDescription;

    startSession(cardTitle, 'Reach 100k Subscribers');
    setShowMorningBanner(false);
    setFocusedCardId(cardId);
    setFocusedCardTitle(cardTitle);
  };

  const handleEndSession = () => {
    endSession();
    setShowReflectionClosure(true);
    setFocusedCardId(null);
  };

  // Command Brain: the AI never answers directly — it reasons over the
  // knowledge graph first (query → graph → reasoning → grounded answer).
  const executeCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    if (!aiConfigured()) {
      setCommandResponse('Kein Mistral API Key konfiguriert (VITE_MISTRAL_API_KEY in apps/web/.env).');
      return;
    }

    setReasoning(null);
    setCommandResponse(null);
    setIsThinking(true);
    addActivityLog(`Reasoning: ${query}`);
    try {
      const res = await reason(query, { nodes, edges, cards: pipelineCards });
      setReasoning(res);
    } catch (err) {
      setCommandResponse(`Reasoning fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsThinking(false);
      setSearchQuery('');
    }
  };

  const handleOpenCardEditor = (id: string, name: string) => {
    setFocusedCardId(id);
    setFocusedCardTitle(name);
    addActivityLog(`Opened Focus view: ${name}`);
  };

  return (
    <div className="workspace-wrapper" style={{ minHeight: '100vh', position: 'relative' }}>
      
      {/* ─── App shell: left sidebar + top bar ─── */}
      <Sidebar
        activeTab={activeTab}
        resource={resource}
        projectName={project.name}
        onExitProject={onExitProject}
        onWorkspace={(t) => { setActiveTab(t); setResource(null); }}
        onResource={(r) => setResource(r)}
      />
      {!focusedCardId && (
        <TopBar
          crumbs={[project.name, resource
            ? resource.charAt(0).toUpperCase() + resource.slice(1)
            : activeTab === 'morning' ? 'Today' : activeTab === 'pipeline' ? 'Pipeline' : 'Brain']}
          onHome={onExitProject}
          onSearch={() => { setIsCommandPaletteOpen(true); setSearchQuery(''); }}
        />
      )}

      {/* ─── MAIN CONTENT (offset by sidebar + top bar) ─── */}
      {!focusedCardId && (
        <div style={{ paddingLeft: `${SIDEBAR_W}px`, paddingTop: `${TOPBAR_H}px`, minHeight: '100vh', boxSizing: 'border-box' }}>
          {resource === 'moodboards' ? (
            <MoodboardsView activeBoardId={selectedMoodboardId} onActiveBoardChange={setSelectedMoodboardId} />
          ) : resource === 'identity' ? (
            <IdentityView />
          ) : resource === 'ideation' ? (
            <IdeationView />
          ) : resource ? (
            <ResourcePlaceholder name={resource} />
          ) : (
          <>
          {activeTab === 'morning' && (
            <div className="view-body">
              {showMorningBanner ? (
                <div style={{ maxWidth: '800px', margin: '40px auto 0 auto', paddingBottom: '40px', borderBottom: '1px solid var(--border-color)' }}>
                  <h1 className="title-serif" style={{ fontSize: '48px', color: 'var(--text-primary)', marginBottom: '8px' }}>Good morning, Hannes.</h1>
                  <p className="title-serif" style={{ fontStyle: 'italic', fontSize: '18px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
                    Heute würde ich <strong>"{executiveDecision.actionDescription}"</strong> machen.
                  </p>
                  <div style={{ display: 'flex', gap: '28px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
                    <span>✦ Priorität {executiveDecision.priorityScore.toFixed(1)}/10</span>
                    <span>✦ Hauptfaktor: {executiveDecision.decisionVector?.primaryDimension ?? 'Goals'}</span>
                    {chosenCard?.trendScore != null && <span>✦ Trend {chosenCard.trendScore.toFixed(1)}</span>}
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: '1.7', maxWidth: '620px', fontFamily: 'var(--font-mono)' }}>
                    {executiveDecision.explanation}
                  </p>
                  <button className="btn-sage-primary" onClick={handleStartFocus} style={{ padding: '10px 24px' }}>
                    Start writing
                  </button>

                  {/* Heute entdeckt — real signals from the living knowledge graph */}
                  <div style={{ marginTop: '48px' }}>
                    <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.1em', marginBottom: '14px' }}>HEUTE ENTDECKT</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {discovery.maturedConcepts > 0 && <span>✦ {discovery.maturedConcepts} {discovery.maturedConcepts === 1 ? 'Konzept ist' : 'Konzepte sind'} gereift</span>}
                      {discovery.contradictions > 0 && <span>✦ {discovery.contradictions} {discovery.contradictions === 1 ? 'Widerspruch' : 'Widersprüche'} im Wissensgraph</span>}
                      {discovery.newThoughts > 0 && <span>✦ {discovery.newThoughts} neue {discovery.newThoughts === 1 ? 'Gedanke' : 'Gedanken'} erfasst</span>}
                      {discovery.openOpportunities > 0 && <span>✦ {discovery.openOpportunities} offene {discovery.openOpportunities === 1 ? 'Opportunity' : 'Opportunities'}</span>}
                      {discovery.maturedConcepts + discovery.contradictions + discovery.newThoughts + discovery.openOpportunities === 0 &&
                        <span style={{ opacity: 0.6 }}>Ruhiger Tag. Der Graph ist im Gleichgewicht.</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ maxWidth: '800px', margin: '80px auto', textAlign: 'center' }}>
                  <h2 className="title-serif" style={{ fontSize: '32px', color: 'var(--text-primary)', marginBottom: '16px' }}>Ready to write?</h2>
                  <button className="btn-sage-primary" onClick={() => handleOpenCardEditor('o_c1', 'Why Multi-Agent Systems Will Replace Solo AI')} style={{ padding: '10px 24px' }}>
                    Re-open Focus workspace
                  </button>
                </div>
              )}

              {/* Git-Style log visible on Morning Dashboard */}
              <div className="git-activity-log">
                <div style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'rgba(92,103,95,0.4)', marginBottom: '4px', letterSpacing: '0.1em' }}>ACTIVITY STREAM</div>
                {activityLogs.map((log, idx) => (
                  <div key={idx} className="git-log-item">
                    <span style={{ color: 'var(--accent-color)', fontWeight: 600 }}>⚬</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'pipeline' && (
            <ContentPipelineView 
              onOpenEditor={handleOpenCardEditor} 
              onOpenMoodboard={(mbId) => {
                setResource('moodboards');
                setSelectedMoodboardId(mbId);
              }}
            />
          )}

          {activeTab === 'brain' && (
            <CognitionView onOpenCard={handleOpenCardEditor} />
          )}
          </>
          )}

          {/* Bottom center Floating Navigation Dock */}
          <div className="floating-dock">
            <button className={`floating-dock-btn ${!resource && activeTab === 'morning' ? 'active' : ''}`} onClick={() => { setActiveTab('morning'); setResource(null); }}>Today</button>
            <button className={`floating-dock-btn ${!resource && activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => { setActiveTab('pipeline'); setResource(null); }}>Pipeline</button>
            <button className={`floating-dock-btn ${!resource && activeTab === 'brain' ? 'active' : ''}`} onClick={() => { setActiveTab('brain'); setResource(null); }}>Brain</button>
          </div>
        </div>
      )}

      {/* ─── FULLSCREEN focused writing workspace (Focus Mode) ─── */}
      {focusedCardId && (
        <div className="workspace-fullscreen">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '850px', width: '100%', margin: '0 auto 40px auto' }}>
            <span className="label-mono">Focus workspace</span>
            <button 
              onClick={() => { setFocusedCardId(null); addActivityLog('Closed Focus view'); }}
              className="btn-sage-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '11px' }}
            >
              <X size={12} /> Save & Exit Focus
            </button>
          </div>

          <div className="editor-paper-shell focus-view">
            {/* Display active card title as big Playfair heading */}
            <h1 className="title-serif" style={{ fontSize: '42px', color: 'var(--text-primary)', marginBottom: '32px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              {focusedCardTitle}
            </h1>
            <EditorView cardId={focusedCardId} />
            
            <div style={{ marginTop: '60px', padding: '24px 0', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label-mono" style={{ fontSize: '10px' }}>Active focus: {project.name}</span>
              <button className="btn-sage-secondary" style={{ padding: '8px 20px', fontSize: '12px' }} onClick={handleEndSession}>
                Complete Day & Reflect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ⌘K COMMAND BRAIN ACTION BAR OVERLAY ─── */}
      {isCommandPaletteOpen && (
        <div className="command-palette-overlay" onClick={() => setIsCommandPaletteOpen(false)}>
          <div className="command-palette-window" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={executeCommand}>
              <input
                type="text"
                autoFocus
                className="command-palette-input"
                placeholder="Frag deinen Wissensgraph… (die KI denkt zuerst)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isThinking}
              />
            </form>
            
            {/* Filtered preset commands list */}
            <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', maxHeight: '200px', overflowY: 'auto' }}>
              {filteredCommands.length > 0 ? (
                filteredCommands.map((cmd, idx) => (
                  <div 
                    key={idx} 
                    onClick={cmd.action}
                    className="command-palette-item"
                    style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-light)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{cmd.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{cmd.desc}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '12px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  No matching preset commands. Press Enter to ask custom query.
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,0.01)', fontSize: '11px', maxHeight: '340px', overflowY: 'auto' }}>
              {isThinking ? (
                <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
                  <span className="thinking-pulse" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-color)', display: 'inline-block' }} />
                  Denkt über den Wissensgraph nach…
                </div>
              ) : reasoning ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', lineHeight: '1.6' }}>
                  {reasoning.result.observation && (
                    <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{reasoning.result.observation}</div>
                  )}
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px' }}>{reasoning.result.conclusion}</div>
                  {reasoning.result.recommendations.length > 0 && (
                    <div>
                      <div className="label-mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: '6px' }}>NÄCHSTE SCHRITTE</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-primary)' }}>
                        {reasoning.result.recommendations.map((r, i) => <li key={i} style={{ marginBottom: '4px' }}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-secondary)' }}>
                    <span>Gedacht über: {reasoning.used.slice(0, 4).join(' · ') || 'Graph-Spine'}</span>
                    <span>Konfidenz {Math.round(reasoning.result.confidence * 100)}%</span>
                  </div>
                </div>
              ) : commandResponse ? (
                <div style={{ color: 'var(--accent-color)', lineHeight: '1.6', fontWeight: 500 }}>{commandResponse}</div>
              ) : (
                <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span><kbd style={{ padding: '2px 4px', background: 'white', border: '1px solid #D0D5DD', borderRadius: '3px', fontSize: '10px' }}>Enter</kbd> — die KI denkt erst über deinen Graph nach, dann antwortet sie.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODULAR SETTINGS OVERLAY ─── */}
      {activeModal === 'settings' && (
        <div className="command-palette-overlay" onClick={() => setActiveModal(null)}>
          <div className="command-palette-window" style={{ width: '800px', height: '600px', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="title-serif" style={{ fontSize: '24px', margin: 0 }}>Advanced Settings</h2>
              <button className="btn-sage-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setActiveModal(null)}>Close</button>
            </div>
            <div style={{ flexGrow: 1, overflowY: 'auto', padding: '24px' }}>
              <SettingsView />
            </div>
          </div>
        </div>
      )}

      {/* ─── 30-SECOND REFLECTION CLOSURE OVERLAY ─── */}
      {showReflectionClosure && (
        <div className="reflection-closure-overlay">
          <div className="reflection-closure-card">
            <h2 className="title-serif" style={{ fontSize: '32px', marginBottom: '8px' }}>Session Complete.</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '28px' }}>Pronoia calibrated decision memory weights and updated meta-cognitive corrector parameters.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
              <div style={{ background: 'var(--accent-light)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(15,90,71,0.06)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Consistency</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-color)', marginTop: '4px' }}>
                  {(qualityMetrics.consistencyScore * 100).toFixed(0)}%
                </div>
              </div>
              <div style={{ background: 'var(--accent-light)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(15,90,71,0.06)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Confidence Correction</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-color)', marginTop: '4px' }}>
                  x{metaCognition.confidenceBiasCorrection.toFixed(2)}
                </div>
              </div>
            </div>
            
            <button className="btn-sage-primary" style={{ width: '100%', padding: '14px' }} onClick={() => { setShowReflectionClosure(false); setActiveTab('morning'); }}>
              Complete Day & Close Workspace
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
