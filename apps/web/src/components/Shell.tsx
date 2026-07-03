import React from 'react';
import { Calendar, GitBranch, Brain, LayoutGrid, FileText, Package, Users, Target, Search, ChevronLeft, Fingerprint, Lightbulb } from 'lucide-react';

export type WorkspaceTab = 'morning' | 'pipeline' | 'brain';
export type ResourceView = 'ideation' | 'moodboards' | 'identity' | 'documents' | 'assets' | 'people' | 'goals';

export const SIDEBAR_W = 224;
export const TOPBAR_H = 52;

const WORKSPACE: { tab: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'morning', label: 'Today', icon: <Calendar size={15} /> },
  { tab: 'pipeline', label: 'Pipeline', icon: <GitBranch size={15} /> },
  { tab: 'brain', label: 'Brain', icon: <Brain size={15} /> }
];

const RESOURCES: { res: ResourceView; label: string; icon: React.ReactNode }[] = [
  { res: 'ideation', label: 'Ideation', icon: <Lightbulb size={15} /> },
  { res: 'documents', label: 'Documents', icon: <FileText size={15} /> },
  { res: 'moodboards', label: 'Moodboards', icon: <LayoutGrid size={15} /> },
  { res: 'identity', label: 'Identity', icon: <Fingerprint size={15} /> },
  { res: 'assets', label: 'Assets', icon: <Package size={15} /> },
  { res: 'people', label: 'People', icon: <Users size={15} /> },
  { res: 'goals', label: 'Goals', icon: <Target size={15} /> }
];

const navItemStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '8px',
  cursor: 'pointer', fontSize: '13px', fontWeight: active ? 600 : 500,
  color: active ? 'var(--accent-color)' : 'var(--text-secondary)',
  background: active ? 'var(--accent-light)' : 'transparent', transition: 'background 0.15s, color 0.15s'
});

const groupLabel: React.CSSProperties = {
  fontSize: '9px', letterSpacing: '0.12em', color: 'var(--text-secondary)', opacity: 0.6,
  fontFamily: 'var(--font-mono)', margin: '18px 0 8px 10px'
};

interface SidebarProps {
  activeTab: WorkspaceTab;
  resource: ResourceView | null;
  projectName: string;
  onExitProject: () => void;
  onWorkspace: (t: WorkspaceTab) => void;
  onResource: (r: ResourceView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, resource, projectName, onExitProject, onWorkspace, onResource }) => (
  <aside style={{
    position: 'fixed', top: 0, left: 0, width: `${SIDEBAR_W}px`, height: '100vh', zIndex: 900,
    background: 'rgba(250, 249, 246, 0.9)', backdropFilter: 'blur(10px)',
    borderRight: '1px solid var(--border-color)', padding: '22px 14px', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', overflowY: 'auto'
  }}>
    {/* Logo */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px', marginBottom: '8px' }}>
      <span style={{ width: '14px', height: '14px', background: 'var(--accent-color)', transform: 'rotate(45deg)', borderRadius: '2px', display: 'inline-block' }} />
      <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>PRONOIA</span>
    </div>

    <div style={groupLabel}>WORKSPACE</div>
    {WORKSPACE.map(w => (
      <div key={w.tab} style={navItemStyle(resource === null && activeTab === w.tab)} onClick={() => onWorkspace(w.tab)}>
        {w.icon} {w.label}
      </div>
    ))}

    {/* Back to the projects gateway */}
    <div
      onClick={onExitProject}
      title="Back to projects"
      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', marginTop: '4px', cursor: 'pointer',
        fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-color)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
    >
      <ChevronLeft size={12} /> PROJECTS
    </div>

    <div style={groupLabel}>ACTIVE PROJECT</div>
    <div
      onClick={onExitProject}
      title="Switch project"
      style={{ padding: '0 10px', cursor: 'pointer' }}
    >
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>{projectName}</div>
      <div style={{ height: '3px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: '68%', height: '100%', background: 'var(--accent-color)' }} />
      </div>
      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>68%</div>
    </div>

    <div style={groupLabel}>RESOURCES</div>
    {RESOURCES.map(r => (
      <div key={r.res} style={navItemStyle(resource === r.res)} onClick={() => onResource(r.res)}>
        {r.icon} {r.label}
      </div>
    ))}
  </aside>
);

interface TopBarProps {
  crumbs: string[];
  onSearch: () => void;
  onHome?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ crumbs, onSearch, onHome }) => (
  <div style={{
    position: 'fixed', top: 0, left: `${SIDEBAR_W}px`, right: 0, height: `${TOPBAR_H}px`, zIndex: 880,
    background: 'rgba(250, 249, 246, 0.8)', backdropFilter: 'blur(10px)',
    borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '0 28px', boxSizing: 'border-box'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
          <span
            onClick={i === 0 ? onHome : undefined}
            style={{ color: i === crumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === crumbs.length - 1 ? 600 : 400, cursor: i === 0 && onHome ? 'pointer' : 'default' }}
          >{c}</span>
        </React.Fragment>
      ))}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <button onClick={onSearch} style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', fontSize: '11px',
        color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)',
        borderRadius: '99px', cursor: 'pointer'
      }}>
        <Search size={12} /> <span style={{ fontFamily: 'var(--font-mono)' }}>⌘K</span>
      </button>
      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600 }}>H</div>
    </div>
  </div>
);

export const ResourcePlaceholder: React.FC<{ name: ResourceView }> = ({ name }) => (
  <div className="view-body" style={{ padding: '80px 40px', textAlign: 'center' }}>
    <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '10px' }}>RESOURCES / {name.toUpperCase()}</div>
    <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', textTransform: 'capitalize', marginBottom: '10px' }}>{name}</h1>
    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto', lineHeight: 1.6 }}>
      Dieser Bereich ist als nächstes dran. Moodboards sind bereits live — der Rest folgt demselben Muster (an Pipeline-Karten &amp; Wissensgraph gekoppelt).
    </p>
  </div>
);
