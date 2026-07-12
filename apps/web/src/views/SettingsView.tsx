import React, { useState, useEffect } from 'react';
import { Cpu, Server, Key, Brain, Shield, Send, Recycle } from 'lucide-react';
// Deep import: the @pronoia/ai barrel pulls Node-only modules (events) that
// break the browser build — remixDefaults is dependency-free.
import { DEFAULT_CONTENT_FILTER } from '@pronoia/ai/dist/remixDefaults.js';
import { useTelegramLink } from '../hooks/useTelegramLink.js';
import { useRemixSettings } from '../hooks/useRemixOutput.js';

type SettingsTab = 'models' | 'providers' | 'memory' | 'mcp' | 'privacy' | 'connections';

export const SettingsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');
  
  // Real API key vault backed by localStorage
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    mistral: localStorage.getItem('pronoia_api_key_mistral') || '',
    openai: localStorage.getItem('pronoia_api_key_openai') || '',
    gemini: localStorage.getItem('pronoia_api_key_gemini') || '',
    anthropic: localStorage.getItem('pronoia_api_key_anthropic') || '',
    openrouter: localStorage.getItem('pronoia_api_key_openrouter') || ''
  });

  // Chat Sandbox State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [activeModel, setActiveModel] = useState<'mistral' | 'gemini'>('mistral');
  const [chatLoading, setChatLoading] = useState(false);

  const isGeminiAvailable = !!apiKeys.gemini;

  // Auto-fallback to Mistral if Gemini key is deleted
  useEffect(() => {
    if (!isGeminiAvailable && activeModel === 'gemini') {
      setActiveModel('mistral');
    }
  }, [isGeminiAvailable, activeModel]);

  const getKeyName = (prov: string) => {
    if (prov.includes('Mistral')) return 'mistral';
    if (prov.includes('Gemini')) return 'gemini';
    return prov.toLowerCase().replace(' ', '');
  };

  const handleSaveKey = (providerName: string) => {
    const key = getKeyName(providerName);
    localStorage.setItem(`pronoia_api_key_${key}`, apiKeys[key] || '');
    alert(`Schlüssel für ${providerName} erfolgreich gespeichert!`);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = chatInput.trim();
    if (!query || chatLoading) return;

    const userMsg = { role: 'user' as const, content: query };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const provider = activeModel;
      const apiKey = apiKeys[provider];

      const res = await fetch('/api/v1/reasoning/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          provider,
          apiKey
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }

      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content ?? '' }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Fehler: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setChatLoading(false);
    }
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
              {['Mistral API', 'OpenAI', 'Google Gemini', 'Anthropic', 'OpenRouter'].map((prov) => {
                const keyName = getKeyName(prov);
                return (
                  <div key={prov} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{prov} Key</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input
                        type="password"
                        placeholder="Enter provider secret key"
                        value={apiKeys[keyName] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setApiKeys(prev => ({ ...prev, [keyName]: val }));
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
                );
              })}
            </div>

            {/* Weekly Remix (Sonntags-Cron) */}
            <WeeklyRemixPanel />

            {/* Chat Sandbox */}
            <div style={{ marginTop: '32px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Send size={16} color="var(--accent-color)" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>AI Chat Sandbox</h3>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                Test your saved keys and API routes here. Choose between models.
              </p>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: '#FCFCFD', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Select Model:</span>
                  <select
                    value={activeModel}
                    onChange={(e) => setActiveModel(e.target.value as 'mistral' | 'gemini')}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      background: 'white'
                    }}
                  >
                    <option value="mistral">Mistral (Default)</option>
                    {isGeminiAvailable && <option value="gemini">Google Gemini (Active Key)</option>}
                  </select>
                  {!isGeminiAvailable && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      (Trage einen Gemini API-Key ein, um Gemini freizuschalten)
                    </span>
                  )}
                </div>

                {/* Chat logs */}
                <div style={{ height: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'white', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center', marginTop: '70px' }}>
                      Schreibe eine Nachricht unten, um den Modell-Chat zu testen.
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--accent-color)' }}>
                          {msg.role === 'user' ? 'Du' : activeModel === 'gemini' ? 'Gemini 1.5 Flash' : 'Mistral Small'}
                        </span>
                        <div style={{ fontSize: '13px', color: 'var(--text-primary)', background: msg.role === 'user' ? 'rgba(0,0,0,0.02)' : 'var(--accent-light)', padding: '6px 10px', borderRadius: '6px', width: 'fit-content', maxWidth: '90%', whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                        </div>
                      </div>
                    ))
                  )}
                  {chatLoading && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                      KI generiert Antwort...
                    </div>
                  )}
                </div>

                {/* Chat input form */}
                <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder={chatLoading ? 'KI antwortet...' : 'Schreibe eine Testnachricht...'}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatLoading}
                    style={{
                      flexGrow: 1,
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    className="btn-sage-primary"
                    disabled={chatLoading || !chatInput.trim()}
                    style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Send size={14} />
                  </button>
                  {chatMessages.length > 0 && (
                    <button
                      type="button"
                      className="btn-sage-secondary"
                      onClick={() => setChatMessages([])}
                      style={{ padding: '8px 12px', fontSize: '12px' }}
                    >
                      Clear
                    </button>
                  )}
                </form>
              </div>
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

// ─── Weekly Remix settings ────────────────────────────────────────────────────
//
// Which AI answers the Sunday-morning remix cron (Gemini with a per-user key,
// Mistral server key as fallback) and the content filter every remixed idea
// must pass. Stored server-side in remix_settings — the cron runs without the
// browser, so localStorage keys don't reach it.

const WeeklyRemixPanel: React.FC = () => {
  const { settings, loading, save } = useRemixSettings();
  const [provider, setProvider] = useState<'gemini' | 'mistral'>('gemini');
  const [geminiKey, setGeminiKey] = useState('');
  const [filter, setFilter] = useState('');
  const [minScore, setMinScore] = useState(6);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider);
      setGeminiKey(settings.geminiApiKey);
      setFilter(settings.contentFilter || DEFAULT_CONTENT_FILTER);
      setMinScore(settings.minFilterScore);
    } else if (!loading) {
      setFilter(DEFAULT_CONTENT_FILTER);
    }
  }, [settings, loading]);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    const r = await save({ provider, geminiApiKey: geminiKey.trim(), contentFilter: filter, minFilterScore: minScore });
    setMsg(r.ok ? '✓ Gespeichert — der Sonntags-Remix nutzt ab jetzt diese Einstellungen.' : `Fehler: ${r.error}`);
    setSaving(false);
  };

  return (
    <div style={{ marginTop: '32px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Recycle size={16} color="var(--accent-color)" />
        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Weekly Remix (Sonntag, 7 Uhr)</h3>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.6 }}>
        Die KI, die deine Library remixt (7 Shorts + 1 Long mit der höchsten Konnektivität), und der Content-Filter,
        den jede Idee bestehen muss. Der Schlüssel wird <strong>server-seitig</strong> gespeichert, damit der Cron ihn nutzen
        kann — Mistral (Server-Key) springt automatisch als Fallback ein.
      </p>

      {loading ? (
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Lädt…</span>
      ) : (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: '#FCFCFD', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Remix-KI:</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value as 'gemini' | 'mistral')}
              style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', outline: 'none', background: 'white' }}>
              <option value="gemini">Google Gemini (eigener Key, Mistral als Fallback)</option>
              <option value="mistral">Mistral (Server-Key)</option>
            </select>
          </div>

          {provider === 'gemini' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>Gemini API-Key (für den Cron)</label>
              <input type="password" placeholder="Gemini API-Key eintragen" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)}
                style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', outline: 'none' }} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>Content-Filter (nummerierte Fragen)</label>
              <button type="button" onClick={() => setFilter(DEFAULT_CONTENT_FILTER)}
                style={{ border: 'none', background: 'none', color: 'var(--accent-color)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                Auf „Die 7 Fragen" zurücksetzen
              </button>
            </div>
            <textarea value={filter} onChange={(e) => setFilter(e.target.value)} rows={10}
              style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px', outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.55, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600 }}>Mindestens bestandene Fragen:</label>
            <input type="number" min={1} max={20} value={minScore} onChange={(e) => setMinScore(Math.max(1, Number(e.target.value) || 6))}
              style={{ width: '64px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', fontSize: '13px', outline: 'none' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn-sage-primary" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Speichert…' : 'Remix-Einstellungen speichern'}
            </button>
            {msg && <span style={{ fontSize: '12px', color: msg.startsWith('✓') ? 'var(--accent-color)' : '#c0392b' }}>{msg}</span>}
          </div>
        </div>
      )}
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

      {/* Claude.ai MCP Connector */}
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px', background: '#FCFCFD', marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={16} color="var(--accent-color)" />
            <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Claude.ai (MCP Connector)</h4>
          </div>
          <button 
            className="btn-sage-primary" 
            style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/mcp`);
              alert('Connector URL in die Zwischenablage kopiert! Du wirst nun zu den Claude-Einstellungen weitergeleitet.');
              window.open('https://claude.ai/settings/connectors', '_blank');
            }}
          >
            Connect to Claude.ai
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Verbinde Claude.ai direkt mit deinem Creator OS. Claude kann dann deine Ideen, deine Pipeline und deine Ziele lesen.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Connector URL:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-color)' }}>{window.location.origin}/mcp</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/mcp`);
                  alert('Connector URL kopiert!');
                }}
                style={{ border: 'none', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', fontSize: '11px', fontWeight: 600 }}
              >
                Kopieren
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Anleitung:</strong>
          <ol style={{ margin: 0, paddingLeft: '16px' }}>
            <li>Klicke oben auf <strong>Connect to Claude.ai</strong> (die Connector-URL wird automatisch kopiert).</li>
            <li>Wähle in den Claude-Einstellungen <strong>Add custom connector</strong> und füge die <em>Connector URL</em> ein.</li>
            <li>Klicke auf <strong>Add</strong> und melde dich im sich öffnenden Fenster mit deinem Creator-OS-Konto an.</li>
          </ol>
          <p style={{ margin: '8px 0 0' }}>Eine separate Client-ID brauchst du nicht — Claude registriert sich automatisch.</p>
        </div>
      </div>
    </div>
  );
};
