import React from 'react';
import { Calendar, GitBranch, Brain, LayoutGrid, FileText, Package, Users, Target, Search, ChevronLeft, Fingerprint, Lightbulb, LogOut, Menu, GraduationCap, Library } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useGoals } from '../hooks/useGoals.js';
import { userInitial } from '../lib/user.js';

export type WorkspaceTab = 'morning' | 'pipeline' | 'brain';
export type ResourceView = 'ideation' | 'moodboards' | 'identity' | 'documents' | 'assets' | 'people' | 'goals' | 'courses' | 'library';

export const SIDEBAR_W = 224;
export const TOPBAR_H = 52;

const WORKSPACE: { tab: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { tab: 'morning', label: 'Today', icon: <Calendar size={15} /> },
  { tab: 'pipeline', label: 'Pipeline', icon: <GitBranch size={15} /> },
  { tab: 'brain', label: 'Brain', icon: <Brain size={15} /> }
];

const RESOURCES: { res: ResourceView; label: string; icon: React.ReactNode }[] = [
  { res: 'ideation', label: 'Ideation', icon: <Lightbulb size={15} /> },
  { res: 'library', label: 'Library', icon: <Library size={15} /> },
  { res: 'documents', label: 'Documents', icon: <FileText size={15} /> },
  { res: 'moodboards', label: 'Moodboards', icon: <LayoutGrid size={15} /> },
  { res: 'identity', label: 'Identity', icon: <Fingerprint size={15} /> },
  { res: 'assets', label: 'Assets', icon: <Package size={15} /> },
  { res: 'people', label: 'People', icon: <Users size={15} /> },
  { res: 'goals', label: 'Goals', icon: <Target size={15} /> },
  { res: 'courses', label: 'Course Maker', icon: <GraduationCap size={15} /> }
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
  isMobile?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, resource, projectName, onExitProject, onWorkspace, onResource, isMobile = false, open = false, onClose }) => {
  // On mobile the sidebar is an off-canvas drawer: hidden by default, slid in
  // over a backdrop. On desktop it's the fixed rail. Navigating closes the drawer.
  const go = (fn: () => void) => () => { fn(); if (isMobile) onClose?.(); };

  return (
    <>
      {isMobile && open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 895 }} />
      )}
      <aside style={{
        position: 'fixed', top: 0, left: 0, width: `${SIDEBAR_W}px`, height: '100vh', zIndex: 900,
        background: 'rgba(250, 249, 246, 0.98)', backdropFilter: 'blur(10px)',
        borderRight: '1px solid var(--border-color)', padding: '22px 14px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        transform: isMobile && !open ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.25s ease',
        boxShadow: isMobile && open ? '0 0 40px rgba(0,0,0,0.18)' : 'none',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', marginBottom: '12px' }}>
          <img src="/logo.png" alt="Pronoia" style={{ height: '22px', mixBlendMode: 'multiply', objectFit: 'contain' }} />
        </div>

        <div style={groupLabel}>WORKSPACE</div>
        {WORKSPACE.map(w => (
          <div key={w.tab} style={navItemStyle(resource === null && activeTab === w.tab)} onClick={go(() => onWorkspace(w.tab))}>
            {w.icon} {w.label}
          </div>
        ))}

        {/* Back to the projects gateway */}
        <div
          onClick={go(onExitProject)}
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
          onClick={go(onExitProject)}
          title="Switch project"
          style={{ padding: '0 10px', cursor: 'pointer' }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>{projectName}</div>
          <ProjectProgress />
        </div>

        <div style={groupLabel}>RESOURCES</div>
        {RESOURCES.map(r => (
          <div key={r.res} style={navItemStyle(resource === r.res)} onClick={go(() => onResource(r.res))}>
            {r.icon} {r.label}
          </div>
        ))}

        <SidebarFooter />
      </aside>
    </>
  );
};

// Real project progress = average completion of the active goals (no longer a
// hardcoded 68%). With no goals set yet, it invites the creator to add one.
const ProjectProgress: React.FC = () => {
  const { goals } = useGoals();
  const active = goals.filter(g => g.status === 'active');
  if (active.length === 0) {
    return (
      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
        Noch keine Ziele
      </div>
    );
  }
  const pct = Math.round((active.reduce((sum, g) => sum + (g.progress ?? 0), 0) / active.length) * 100);
  return (
    <>
      <div style={{ height: '3px', background: 'rgba(0,0,0,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-color)' }} />
      </div>
      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>{pct}%</div>
    </>
  );
};

const SidebarFooter: React.FC = () => {
  const { user, signOut } = useAuth();
  return (
    <div style={{ marginTop: 'auto', paddingTop: '18px' }}>
      {user?.email && (
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', padding: '0 10px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={user.email}>
          {user.email}
        </div>
      )}
      <div
        onClick={() => signOut()}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-light)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <LogOut size={14} /> Sign out
      </div>
    </div>
  );
};

interface TopBarProps {
  crumbs: string[];
  onSearch: () => void;
  onHome?: () => void;
  isMobile?: boolean;
  onMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ crumbs, onSearch, onHome, isMobile = false, onMenu }) => {
  const { user } = useAuth();
  // On mobile the bar spans the full width (no fixed rail beside it) and leads
  // with a hamburger that opens the sidebar drawer.
  return (
  <div style={{
    position: 'fixed', top: 0, left: isMobile ? 0 : `${SIDEBAR_W}px`, right: 0, height: `${TOPBAR_H}px`, zIndex: 880,
    background: 'rgba(250, 249, 246, 0.8)', backdropFilter: 'blur(10px)',
    borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: isMobile ? '0 14px' : '0 28px', boxSizing: 'border-box'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', minWidth: 0, overflow: 'hidden' }}>
      {isMobile && (
        <button onClick={onMenu} aria-label="Menü" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', flexShrink: 0 }}>
          <Menu size={16} />
        </button>
      )}
      {(isMobile ? crumbs.slice(-1) : crumbs).map((c, i, arr) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
          <span
            onClick={!isMobile && i === 0 ? onHome : undefined}
            style={{ color: i === arr.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: i === arr.length - 1 ? 600 : 400, cursor: !isMobile && i === 0 && onHome ? 'pointer' : 'default', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >{c}</span>
        </React.Fragment>
      ))}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '14px', flexShrink: 0 }}>
      <button onClick={onSearch} aria-label="Suche" style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '7px' : '6px 12px', fontSize: '11px',
        color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)',
        borderRadius: '99px', cursor: 'pointer'
      }}>
        <Search size={12} /> {!isMobile && <span style={{ fontFamily: 'var(--font-mono)' }}>⌘K</span>}
      </button>
      <div title={user?.email ?? undefined} style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600 }}>{userInitial(user)}</div>
    </div>
  </div>
  );
};

export const ResourcePlaceholder: React.FC<{ name: ResourceView }> = ({ name }) => (
  <div className="view-body" style={{ padding: '80px 40px', textAlign: 'center' }}>
    <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '10px' }}>RESOURCES / {name.toUpperCase()}</div>
    <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', textTransform: 'capitalize', marginBottom: '10px' }}>{name}</h1>
    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto', lineHeight: 1.6 }}>
      Dieser Bereich ist als nächstes dran. Moodboards sind bereits live — der Rest folgt demselben Muster (an Pipeline-Karten &amp; Wissensgraph gekoppelt).
    </p>
  </div>
);
