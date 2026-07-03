import React from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { BriefingGenerator } from '@pronoia/cognition';

export const TodayView: React.FC = () => {
  // Generate daily brief using packages/cognition
  const brief = BriefingGenerator.generateBrief('Hannes', [
    {
      id: '1',
      type: 'content_gap',
      description: 'High search volume detected for "Multi-Agent Systems". Your workspace has 6 documents matching this theme but no social media outline.',
      nicheRelevance: 92,
      opportunityScore: 1.56
    }
  ]);

  return (
    <div className="view-body">
      <div style={{ marginBottom: '40px' }}>
        <h1 className="view-title-serif" style={{ fontSize: '36px', marginBottom: '8px' }}>
          {brief.greeting}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
          Here is your creative overview for today.
        </p>
      </div>

      {/* Bento Grid */}
      <div className="bento-grid">
        {/* Core Briefing Card */}
        <div className="bento-card" style={{ gridColumn: 'span 8', minHeight: '260px' }}>
          <div className="bento-title">Daily Intelligence Briefing</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            {brief.bulletPoints.map((point, index) => (
              <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '15px' }}>
                <span className="ai-status-chip" style={{ padding: '2px 8px', fontSize: '11px' }}>
                  Insight {index + 1}
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Niche Recommendation Card */}
        <div className="bento-card" style={{ gridColumn: 'span 4' }}>
          <div className="bento-title">Opportunity Focus</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', justifyContent: 'space-between', paddingBottom: '8px' }}>
            <div>
              <p style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 500, lineHeight: '1.5', marginTop: '8px' }}>
                {brief.recommendedAction}
              </p>
            </div>
            <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
              <Sparkles size={16} />
              Expand Idea
            </button>
          </div>
        </div>

        {/* Social Metrics Summary */}
        <div className="bento-card" style={{ gridColumn: 'span 4' }}>
          <div className="bento-title">Social Performance</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700 }}>+12.4%</span>
            <span style={{ color: '#0F5A47', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '2px' }}>
              <TrendingUp size={14} /> views
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>
            Growth is driven by "AI Automation" videos.
          </p>
        </div>

        {/* System Health */}
        <div className="bento-card" style={{ gridColumn: 'span 4' }}>
          <div className="bento-title">Model Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Mistral (Fallback):</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>Active</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Nous Hermes:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>Active</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Google Pomelli:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-color)' }}>Active</span>
            </div>
          </div>
        </div>

        {/* Budget limit */}
        <div className="bento-card" style={{ gridColumn: 'span 4' }}>
          <div className="bento-title">Token Budget</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700 }}>$4.82</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>/ $30.00</span>
          </div>
          <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: '16%', height: '100%', backgroundColor: 'var(--accent-color)' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};
