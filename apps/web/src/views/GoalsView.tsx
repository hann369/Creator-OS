import React, { useState } from 'react';
import { Target, Plus, Trash2, Check, Archive, RotateCcw } from 'lucide-react';
import { useGoals, type Goal, type GoalStatus } from '../hooks/useGoals.js';

const inputStyle: React.CSSProperties = { fontSize: '13px', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };

const fmtDate = (d?: Date) => d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

const GoalCard: React.FC<{
  goal: Goal;
  onUpdate: (patch: Partial<Goal>) => void;
  onDelete: () => void;
}> = ({ goal, onUpdate, onDelete }) => {
  const pct = Math.round(goal.progress * 100);
  const achieved = goal.status === 'achieved';
  return (
    <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px 22px', marginBottom: '14px', opacity: goal.status === 'archived' ? 0.55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="title-serif" style={{ fontSize: '21px', color: 'var(--text-primary)', margin: 0, textDecoration: achieved ? 'line-through' : 'none' }}>{goal.title}</h3>
          {goal.description && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.6 }}>{goal.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {goal.status !== 'achieved' ? (
            <button title="Mark achieved" onClick={() => onUpdate({ status: 'achieved', progress: 1 })} style={iconBtn}><Check size={14} /></button>
          ) : (
            <button title="Reopen" onClick={() => onUpdate({ status: 'active' })} style={iconBtn}><RotateCcw size={14} /></button>
          )}
          {goal.status !== 'archived' ? (
            <button title="Archive" onClick={() => onUpdate({ status: 'archived' })} style={iconBtn}><Archive size={14} /></button>
          ) : (
            <button title="Restore" onClick={() => onUpdate({ status: 'active' })} style={iconBtn}><RotateCcw size={14} /></button>
          )}
          <button title="Delete" onClick={onDelete} style={iconBtn}><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginTop: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '0.06em' }}>
          <span>PROGRESS · {pct}%</span>
          {goal.targetDate && <span>TARGET · {fmtDate(goal.targetDate)}</span>}
        </div>
        <input
          type="range" min={0} max={100} value={pct}
          onChange={(e) => onUpdate({ progress: Number(e.target.value) / 100, ...(Number(e.target.value) >= 100 ? { status: 'achieved' as GoalStatus } : {}) })}
          style={{ width: '100%', accentColor: 'var(--accent-color)' }}
        />
      </div>
    </div>
  );
};

const iconBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' };

export const GoalsView: React.FC = () => {
  const { goals, addGoal, updateGoal, deleteGoal } = useGoals();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const submit = () => { if (!title.trim()) return; addGoal(title, desc.trim()); setTitle(''); setDesc(''); };

  const active = goals.filter(g => g.status !== 'archived');
  const archived = goals.filter(g => g.status === 'archived');
  const shown = showArchived ? archived : active;

  return (
    <div className="view-body" style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 24px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Target size={20} color="var(--accent-color)" />
        <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', margin: 0 }}>Goals</h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Die Ziele, gegen die Pronoia jeden Morgen deine nächste Handlung priorisiert.
      </p>

      {/* Capture */}
      <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', marginBottom: '28px' }}>
        <input style={inputStyle} placeholder="Neues Ziel — z. B. Reach 100k Subscribers" value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <div style={{ height: '8px' }} />
        <input style={inputStyle} placeholder="Beschreibung (optional)" value={desc}
          onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <button className="btn-sage-primary" onClick={submit} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '12px' }}>
            <Plus size={14} /> Ziel hinzufügen
          </button>
        </div>
      </div>

      {/* Toggle active / archived */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '18px', fontSize: '11px', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
        <span onClick={() => setShowArchived(false)} style={{ cursor: 'pointer', color: !showArchived ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: !showArchived ? 700 : 400 }}>AKTIV ({active.length})</span>
        <span onClick={() => setShowArchived(true)} style={{ cursor: 'pointer', color: showArchived ? 'var(--accent-color)' : 'var(--text-secondary)', fontWeight: showArchived ? 700 : 400 }}>ARCHIV ({archived.length})</span>
      </div>

      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
          {showArchived ? 'Kein archiviertes Ziel.' : 'Noch kein Ziel gesetzt. Beginne mit einem klaren Nordstern.'}
        </div>
      ) : (
        shown.map(g => (
          <GoalCard key={g.id} goal={g} onUpdate={(patch) => updateGoal(g.id, patch)} onDelete={() => deleteGoal(g.id)} />
        ))
      )}
    </div>
  );
};
