import React, { useState } from 'react';
import { Users, Plus, Trash2, Mail, AtSign } from 'lucide-react';
import { usePeople, type Person } from '../hooks/usePeople.js';

const inputStyle: React.CSSProperties = { fontSize: '13px', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };
const iconBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', border: '1px solid var(--border-color)', borderRadius: '7px', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' };

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';

const PersonCard: React.FC<{
  person: Person;
  onUpdate: (patch: Partial<Person>) => void;
  onDelete: () => void;
}> = ({ person, onUpdate, onDelete }) => (
  <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px' }}>
    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
      <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 600, flexShrink: 0 }}>{initials(person.name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input value={person.name} onChange={(e) => onUpdate({ name: e.target.value })}
          style={{ ...inputStyle, border: 'none', padding: 0, fontSize: '16px', fontWeight: 600 }} />
        <input value={person.role} onChange={(e) => onUpdate({ role: e.target.value })} placeholder="Rolle (z. B. Editor, Guest, Sponsor)"
          style={{ ...inputStyle, border: 'none', padding: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }} />
      </div>
      <button title="Löschen" onClick={onDelete} style={iconBtn}><Trash2 size={14} /></button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Mail size={13} color="var(--text-secondary)" />
        <input value={person.email ?? ''} onChange={(e) => onUpdate({ email: e.target.value || undefined })} placeholder="E-Mail" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <AtSign size={13} color="var(--text-secondary)" />
        <input value={person.handle ?? ''} onChange={(e) => onUpdate({ handle: e.target.value || undefined })} placeholder="Handle" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }} />
      </div>
    </div>

    <textarea value={person.notes} onChange={(e) => onUpdate({ notes: e.target.value })} placeholder="Notizen…"
      style={{ ...inputStyle, marginTop: '10px', minHeight: '48px', resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }} />
  </div>
);

export const PeopleView: React.FC = () => {
  const { people, addPerson, updatePerson, deletePerson } = usePeople();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  const submit = () => { if (!name.trim()) return; addPerson({ name, role }); setName(''); setRole(''); };

  return (
    <div className="view-body" style={{ maxWidth: '860px', margin: '0 auto', padding: '40px 24px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Users size={20} color="var(--accent-color)" />
        <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', margin: 0 }}>People</h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Kollaborateure, Gäste und Kontakte rund um deine Arbeit.
      </p>

      {/* Capture */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '28px' }}>
        <input style={inputStyle} placeholder="Name" value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <input style={{ ...inputStyle, maxWidth: '220px' }} placeholder="Rolle (optional)" value={role}
          onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <button className="btn-sage-primary" onClick={submit} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '12px', flexShrink: 0 }}>
          <Plus size={14} /> Add
        </button>
      </div>

      {people.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
          Noch niemand erfasst. Füge deinen ersten Kontakt hinzu.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {people.map(p => (
            <PersonCard key={p.id} person={p} onUpdate={(patch) => updatePerson(p.id, patch)} onDelete={() => deletePerson(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
};
