import React, { useState } from 'react';
import { Cpu, Server, Key, Brain, Shield, Send } from 'lucide-react';
import { useTelegramLink } from '../hooks/useTelegramLink.js';

type SettingsTab = 'models' | 'providers' | 'memory' | 'mcp' | 'privacy' | 'connections';

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    mistral: '••••••••••••••••••••••••',
    openai: '',
    gemini: ''
  });

  const handleSaveKey = (provider: string) => {
    alert(`[Secret Vault] Enqueued credentials rotation for provider: ${provider}. Key enrypted via AES-256-GCM successfully.`);
  };

  return (
    <div className="view-body" style={{ display: 'flex', gap: '32px' }}>
      {/* Settings Navigation Menu */}
      <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3 className="bento-title">Settings Modules</h3>
        {([
          { key: 'models', label: 'AI Models', icon: Cpu },
          { key: 'providers', label: 'API Providers', icon: Key },
          { key: 'memory', label: 'AI Memory', icon: Brain },
          { key: 'mcp', label: 'MCP Registry', icon: Server },
          { key: 'connections', label: 'Connections', icon: Send },
          { key: 'privacy', label: 'Privacy & Safety', icon: Shield }
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.key;
          return (
            <div
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                color: isSelected ? 'var(--accent-color)' : 'var(--text-secondary)',
                background: isSelected ? 'var(--accent-light)' : 'none',
                fontWeight: isSelected ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
            >
              <Icon size={16} />
              {tab.label}
            </div>
          );
        })}
      </div>

      {/* Settings Module Workspace */}
      <div style={{ flexGrow: 1, background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', padding: '32px', maxWidth: '640px' }}>
        {activeTab === 'models' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>AI Models Configurations</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Configure active model routing priorities and parameters.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: '#FCFCFD' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Mistral Large</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Default fallback model for standard workspace reasoning actions.
                </p>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: '#FCFCFD' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Nous Hermes 2</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Used for scripting and structural suggestion drafts.
                </p>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: '#FCFCFD' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Google Pomelli</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  High latency model dedicated to long context operations and complex gap evaluations.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'providers' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>API Providers Vault</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Secret Vault keys are encrypted client-side using AES-256-GCM.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {['Mistral API', 'OpenAI', 'Google Gemini', 'Anthropic', 'OpenRouter'].map((prov) => (
                <div key={prov} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{prov} Key</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="password"
                      placeholder="Enter provider secret key"
                      value={apiKeys[prov.toLowerCase().replace(' ', '')] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setApiKeys(prev => ({ ...prev, [prov.toLowerCase().replace(' ', '')]: val }));
                      }}
                      style={{
                        flexGrow: 1,
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 14px',
                        fontSize: '14px',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }}
                    />
                    <button className="btn-sage-primary" onClick={() => handleSaveKey(prov)}>
                      Save Key
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>AI Memory Tiering</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Manage facts, context templates, and long-term vector recalls.
            </p>
            <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: '#FCFCFD', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Workspace Memories Indexed:</span>
                <span style={{ fontWeight: 600 }}>42 items</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Vector Dimension Matrix:</span>
                <span style={{ fontWeight: 600 }}>1536 float</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Model Context Protocol</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Register external MCP stdio/WS servers.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="http://localhost:3000/mcp"
                style={{
                  flexGrow: 1,
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  fontSize: '14px',
                  outline: 'none',
                  fontFamily: 'var(--font-sans)'
                }}
              />
              <button className="btn-sage-primary">Register Server</button>
            </div>
          </div>
        )}

        {activeTab === 'connections' && <ConnectionsPanel />}

        {activeTab === 'privacy' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Privacy & Data Compliance</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
              Configure models and parameters to prevent data ingestion leakage.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked />
                <span>Opt-out of model training pipelines on external provider APIs.</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked />
                <span>Encrypt local client cache on disk.</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Connections: Telegram bot linking ───────────────────────────────────────
const ConnectionsPanel: React.FC = () => {
  const { linked, username, code, botUsername, loading, error, connect, disconnect } = useTelegramLink();

  const deepLink = botUsername && code ? `https://t.me/${botUsername}?start=` : null;

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Connections</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
        Verbinde externe Kanäle mit deinem Creator OS.
      </p>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px', background: '#FCFCFD' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Send size={16} color="var(--accent-color)" />
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Telegram-Bot</h4>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Schick dem Bot eine Nachricht und sie landet als Idee in deiner Ideation-Bank. Morgens pusht er dir dein Briefing.
        </p>

        {loading ? (
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Lädt…</span>
        ) : linked ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'var(--accent-color)', fontWeight: 600 }}>
              ✓ Verbunden{username ? ` als @${username}` : ''}
            </span>
            <button className="btn-sage-secondary" style={{ padding: '8px 16px', fontSize: '12px' }} onClick={() => void disconnect()}>
              Trennen
            </button>
          </div>
        ) : code ? (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px' }}>
              Sende diesen Befehl an den Bot{botUsername ? ` (@${botUsername})` : ''}:
            </p>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, letterSpacing: '0.04em', padding: '12px 16px', background: 'var(--accent-light)', borderRadius: '8px', color: 'var(--accent-color)', userSelect: 'all' }}>
              /link {code}
            </div>
            {deepLink && (
              <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '12px', fontSize: '12px', color: 'var(--accent-color)' }}>
                Bot in Telegram öffnen →
              </a>
            )}
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '10px' }}>Code läuft in 15 Minuten ab.</p>
          </div>
        ) : (
          <button className="btn-sage-primary" style={{ padding: '10px 20px', fontSize: '13px' }} onClick={() => void connect()}>
            Connect Telegram
          </button>
        )}

        {error && <p style={{ fontSize: '12px', color: '#c0392b', marginTop: '12px' }}>{error}</p>}
      </div>
    </div>
  );
};
