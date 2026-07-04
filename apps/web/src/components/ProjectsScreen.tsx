import React, { useState } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { userInitial } from '../lib/user.js';
import type { ProjectItem } from '../hooks/useProjects.js';

interface ProjectsScreenProps {
  projects: ProjectItem[];
  onOpen: (project: ProjectItem) => void;
  onCreate: (name: string) => ProjectItem;
}

// The gateway shown before the workspace: only whitespace, the projects, and the
// top-right bar. Pick a project to enter its pages (Today / Pipeline / Brain / …).
export const ProjectsScreen: React.FC<ProjectsScreenProps> = ({ projects, onOpen, onCreate }) => {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) { setCreating(false); return; }
    const p = onCreate(name);
    setName('');
    setCreating(false);
    onOpen(p);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-color, #FAF9F6)', position: 'relative' }}>
      {/* ─── top-right bar only ─── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '52px', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '14px', height: '14px', background: 'var(--accent-color)', transform: 'rotate(45deg)', borderRadius: '2px', display: 'inline-block' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>PRONOIA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', fontSize: '11px',
            color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border-color)',
            borderRadius: '99px', cursor: 'pointer',
          }}>
            <Search size={12} /> <span style={{ fontFamily: 'var(--font-mono)' }}>⌘K</span>
          </button>
          <div title={user?.email ?? undefined} style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600 }}>{userInitial(user)}</div>
        </div>
      </div>

      {/* ─── whitespace canvas with the projects ─── */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '140px 40px 80px' }}>
        <div className="label-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.12em', marginBottom: '10px' }}>
          PROJECTS
        </div>
        <h1 className="title-serif" style={{ fontSize: '40px', color: 'var(--text-primary)', marginBottom: '40px' }}>
          Choose a project
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '18px' }}>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => onOpen(p)}
              className="project-tile"
              style={{
                textAlign: 'left', cursor: 'pointer', background: '#fff',
                border: '1px solid var(--border-color)', borderRadius: '14px',
                padding: '22px', minHeight: '132px', display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: p.accent ?? 'var(--accent-color)', display: 'inline-block' }} />
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{p.name}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>
            </button>
          ))}

          {/* New project tile */}
          {creating ? (
            <div style={{
              background: '#fff', border: '1px dashed var(--accent-color)', borderRadius: '14px',
              padding: '22px', minHeight: '132px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px',
            }}>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setCreating(false); setName(''); } }}
                placeholder="Project name…"
                style={{ fontSize: '14px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px', outline: 'none', background: 'transparent' }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-sage-primary" style={{ flex: 1, padding: '6px', fontSize: '11px' }} onClick={submit}>Create</button>
                <button className="btn-sage-secondary" style={{ padding: '6px 10px', fontSize: '11px' }} onClick={() => { setCreating(false); setName(''); }}><X size={12} /></button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="project-tile"
              style={{
                cursor: 'pointer', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '14px',
                padding: '22px', minHeight: '132px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; e.currentTarget.style.color = 'var(--accent-color)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <Plus size={20} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>New Project</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
