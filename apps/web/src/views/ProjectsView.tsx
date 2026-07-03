import React, { useState } from 'react';
import { Target, FileText, BarChart2, MessageSquare } from 'lucide-react';

interface ProjectItem {
  id: string;
  name: string;
  goals: string[];
  documentsCount: number;
  assetsCount: number;
  tasksCount: number;
}

export const ProjectsView: React.FC = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('1');
  const [activeTab, setActiveTab] = useState<'goals' | 'documents' | 'chat' | 'analytics'>('goals');

  const projects: ProjectItem[] = [
    {
      id: '1',
      name: 'Launch Pronoia Creator OS',
      goals: ['Implement CRDT sync layer', 'Design high-fidelity Today dashboard', 'Setup Secret key encryption vault'],
      documentsCount: 14,
      assetsCount: 8,
      tasksCount: 22
    },
    {
      id: '2',
      name: 'Autumn Video Course Production',
      goals: ['Draft 12 video course scripts', 'Design YouTube Course thumbnails', 'Structure course marketing funnel'],
      documentsCount: 6,
      assetsCount: 18,
      tasksCount: 9
    }
  ];

  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  return (
    <div className="view-body" style={{ display: 'flex', gap: '32px' }}>
      {/* Sidebar List of Projects */}
      <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 className="bento-title">Active Projects</h3>
        {projects.map((p) => (
          <div
            key={p.id}
            onClick={() => setSelectedProjectId(p.id)}
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              background: p.id === selectedProjectId ? 'var(--accent-light)' : '#FFFFFF',
              cursor: 'pointer',
              borderColor: p.id === selectedProjectId ? 'var(--accent-color)' : 'var(--border-color)',
              transition: 'var(--transition-smooth)'
            }}
          >
            <h4 style={{ fontSize: '15px', fontWeight: 600, color: p.id === selectedProjectId ? 'var(--accent-color)' : 'var(--text-primary)' }}>
              {p.name}
            </h4>
            <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px', fontFamily: 'var(--font-mono)' }}>
              <span>DOCS: {p.documentsCount}</span>
              <span>TASKS: {p.tasksCount}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Board Detail Workspace */}
      <div style={{ flexGrow: 1, background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700 }}>{activeProject.name}</h2>
          <span className="ai-status-chip">Linear Flow</span>
        </div>

        {/* Workspace Tab Bar */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', paddingBottom: '8px' }}>
          {(['goals', 'documents', 'chat', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 600,
                color: activeTab === tab ? 'var(--accent-color)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab ? '2px solid var(--accent-color)' : 'none',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content viewports */}
        <div style={{ flexGrow: 1 }}>
          {activeTab === 'goals' && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Target size={18} /> Target Milestones
              </h3>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeProject.goals.map((goal, idx) => (
                  <li key={idx} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '14px', background: '#FCFCFD', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent-color)', borderRadius: '50%' }}></div>
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeTab === 'documents' && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} /> Linked Documents
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                This project contains {activeProject.documentsCount} documents referencing project parameters.
              </p>
            </div>
          )}

          {activeTab === 'chat' && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} /> Project AI Chat Session
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Start a dialog contextually aware of goals and connected research references.
              </p>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={18} /> Analytics Feed
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Track performance metrics specific to this project output.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
