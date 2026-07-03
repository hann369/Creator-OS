import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface InsightItem {
  id: string;
  category: string;
  message: string;
  reasoning: string;
  actionLabel: string;
}

export const ThinkingView: React.FC = () => {
  const insights: InsightItem[] = [
    {
      id: '1',
      category: 'Cross-Project Connection',
      message: 'I found 3 connections between your last projects.',
      reasoning: 'Your recent documents on "AI Agents" and "Task Automation" share overlapping concepts with your "SaaS Marketing Plan". Adding a bridging concept node would clarify this structure.',
      actionLabel: 'Merge Concepts'
    },
    {
      id: '2',
      category: 'Content Strategy Recommendation',
      message: 'A new content series emerges from your last 20 videos.',
      reasoning: 'Videos discussing "Local LLMs" and "Ollama Integration" received 3.8x higher engagement. Creating a 3-part sequel series is highly recommended.',
      actionLabel: 'Create Pipeline Draft'
    },
    {
      id: '3',
      category: 'Market Trend Shift',
      message: 'Your community is moving towards AI Agents.',
      reasoning: 'X replies and YouTube comments show a 65% surge in queries asking about "Multi-agent frameworks" over the last 7 days.',
      actionLabel: 'Create Video Outline'
    },
    {
      id: '4',
      category: 'Knowledge Extraction opportunity',
      message: 'From your uploaded PDF, two newsletters can be generated.',
      reasoning: 'The document "Autonomous Systems.pdf" contains detailed sections on deployment hurdles that match your newsletter audience interest profile.',
      actionLabel: 'Generate Drafts'
    }
  ];

  return (
    <div className="view-body" style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 className="view-title-serif" style={{ fontSize: '36px', marginBottom: '8px' }}>
          Thinking Engine
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
          Continuous reasoning running in the background, discovering patterns and suggestions from your workspace.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {insights.map((insight) => (
          <div key={insight.id} className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="ai-status-chip" style={{ fontSize: '11px', padding: '3px 10px' }}>
                {insight.category}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Just now</span>
            </div>

            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                {insight.message}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                {insight.reasoning}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '4px' }}>
              <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px' }}>
                <Sparkles size={14} />
                {insight.actionLabel}
              </button>
              <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 16px' }}>
                Explain Reasoning
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
