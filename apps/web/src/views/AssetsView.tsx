import React, { useState } from 'react';
import { Package, Plus, Trash2, Film, Music, FileText, File as FileIcon, ExternalLink } from 'lucide-react';
import { useAssets, guessKind, type AssetItem, type AssetKind } from '../hooks/useAssets.js';

const inputStyle: React.CSSProperties = { fontSize: '13px', border: '1px solid var(--border-color)', padding: '9px 12px', borderRadius: '8px', outline: 'none', background: 'transparent', width: '100%', boxSizing: 'border-box' };

const KIND_ICON: Record<AssetKind, React.ReactNode> = {
  image: <FileIcon size={16} />, video: <Film size={16} />, audio: <Music size={16} />, pdf: <FileText size={16} />, other: <FileIcon size={16} />,
};

const AssetCard: React.FC<{ asset: AssetItem; onDelete: () => void }> = ({ asset, onDelete }) => (
  <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.015)', display: 'flex', flexDirection: 'column' }}>
    <div style={{ aspectRatio: '16 / 10', background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {asset.kind === 'image' && asset.url
        ? <img src={asset.url} alt={asset.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget.style.display = 'none'); }} />
        : <span style={{ color: 'var(--text-secondary)' }}>{KIND_ICON[asset.kind]}</span>}
    </div>
    <div style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.title}</span>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {asset.url && <a href={asset.url} target="_blank" rel="noreferrer" title="Öffnen" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}><ExternalLink size={13} /></a>}
          <button title="Löschen" onClick={onDelete} style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{asset.kind}</div>
    </div>
  </div>
);

export const AssetsView: React.FC = () => {
  const { assets, addAsset, deleteAsset } = useAssets();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<AssetKind | 'auto'>('auto');

  const submit = () => {
    if (!url.trim() && !title.trim()) return;
    addAsset({ title: title || url, url, kind: kind === 'auto' ? undefined : kind });
    setTitle(''); setUrl(''); setKind('auto');
  };

  const effectiveKind = kind === 'auto' ? (url ? guessKind(url) : 'other') : kind;

  return (
    <div className="view-body" style={{ maxWidth: '980px', margin: '0 auto', padding: '40px 24px 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Package size={20} color="var(--accent-color)" />
        <h1 className="title-serif" style={{ fontSize: '34px', color: 'var(--text-primary)', margin: 0 }}>Assets</h1>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Bilder, Videos, Audio und PDFs für deine Produktion — referenziert per URL.
      </p>

      {/* Capture */}
      <div style={{ background: 'rgba(0,0,0,0.015)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '18px 20px', marginBottom: '28px' }}>
        <input style={inputStyle} placeholder="Asset-URL (https://…)" value={url}
          onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <div style={{ height: '8px' }} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <input style={inputStyle} placeholder="Label (optional)" value={title}
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind | 'auto')} style={{ ...inputStyle, width: 'auto' }}>
            <option value="auto">Auto ({effectiveKind})</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="pdf">PDF</option>
            <option value="other">Other</option>
          </select>
          <button className="btn-sage-primary" onClick={submit} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', fontSize: '12px', flexShrink: 0 }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.7 }}>
          Noch keine Assets. Füge deine erste Datei per URL hinzu.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
          {assets.map(a => <AssetCard key={a.id} asset={a} onDelete={() => deleteAsset(a.id)} />)}
        </div>
      )}
    </div>
  );
};
