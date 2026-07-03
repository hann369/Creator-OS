import React, { useState } from 'react';
import { Download, ToggleLeft, ToggleRight } from 'lucide-react';

interface PluginItem {
  id: string;
  name: string;
  author: string;
  version: string;
  type: 'official' | 'community';
  installed: boolean;
  active: boolean;
  requiredPermissions: string[];
}

export const MarketplaceView: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginItem[]>([
    {
      id: 'com.pronoia.youtube-importer',
      name: 'YouTube Ingestion Client',
      author: 'Pronoia Official',
      version: '1.0.2',
      type: 'official',
      installed: true,
      active: true,
      requiredPermissions: ['internet:connect', 'social:post']
    },
    {
      id: 'com.pronoia.postgres-connector',
      name: 'PostgreSQL Knowledge Exporter',
      author: 'Pronoia Official',
      version: '1.1.0',
      type: 'official',
      installed: true,
      active: false,
      requiredPermissions: ['filesystem:write', 'filesystem:read']
    },
    {
      id: 'com.community.framer-sync',
      name: 'Framer Canvas Node Syncer',
      author: 'Framer Devs',
      version: '0.9.1',
      type: 'community',
      installed: false,
      active: false,
      requiredPermissions: ['internet:connect', 'filesystem:write']
    }
  ]);

  const handleToggleActive = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p))
    );
  };

  const handleInstall = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, installed: true, active: true } : p))
    );
  };

  return (
    <div className="view-body" style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 className="view-title-serif" style={{ fontSize: '36px', marginBottom: '8px' }}>
          Marketplace (MCP Store)
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
          Browse, install, and manage signed Model Context Protocol (MCP) server plugins in a secure sandbox.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {plugins.map((plugin) => (
          <div key={plugin.id} className="bento-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 600 }}>{plugin.name}</h3>
                <span className="ai-status-chip" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                  {plugin.type}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>v{plugin.version}</span>
              </div>

              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                ID: {plugin.id}
              </span>

              {/* Permissions list */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {plugin.requiredPermissions.map((scope) => (
                  <span key={scope} style={{ fontSize: '11px', background: '#F2F4F7', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                    {scope}
                  </span>
                ))}
              </div>
            </div>

            {/* Install/Active Controls */}
            <div>
              {plugin.installed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => handleToggleActive(plugin.id)}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {plugin.active ? 'Active' : 'Disabled'}
                    </span>
                    {plugin.active ? (
                      <ToggleRight size={28} color="var(--accent-color)" />
                    ) : (
                      <ToggleLeft size={28} color="var(--text-secondary)" />
                    )}
                  </div>
                </div>
              ) : (
                <button className="btn-primary" onClick={() => handleInstall(plugin.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <Download size={14} /> Install Extensions
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
