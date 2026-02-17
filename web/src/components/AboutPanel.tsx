/**
 * About panel — in-app welcome/overview modal.
 * Auto-shown on first visit; reopenable via the ⓘ header button.
 */

import { useEffect } from 'react';
import type { HelpContent } from '../utils/parseHelpContent';
import './AboutPanel.css';

const COMING_SOON = [
  'Shareable URLs for specific neighborhoods',
  'Guided tour for new users',
  'Polyhierarchy occurrence navigation (jump between a concept\'s multiple locations)',
  'Relationship type labels on edges',
  'Proposal authoring support',
];

interface AboutPanelProps {
  helpContent: HelpContent;
  onDismiss: () => void;
  onHideOnStartup: (hide: boolean) => void;
  hideOnStartup: boolean;
}

export function AboutPanel({ helpContent, onDismiss, onHideOnStartup, hideOnStartup }: AboutPanelProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <div className="about-overlay" onClick={onDismiss}>
      <div className="about-panel" onClick={e => e.stopPropagation()}>
        <div className="about-header">
          <h2>ICD-11 Foundation Explorer</h2>
          <span className="about-subtitle">Visual Maintenance Tool Prototype</span>
        </div>

        <div className="about-body">
          {helpContent.sections.map(section => (
            <div key={section.id}>
              <h3>{section.title}</h3>
              {section.body.split(/\n\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ))}

          <div className="about-coming-soon">
            <h3>Coming Soon</h3>
            <ul>
              {COMING_SOON.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="about-footer">
          <label>
            <input
              type="checkbox"
              checked={hideOnStartup}
              onChange={e => onHideOnStartup(e.target.checked)}
            />
            Don&apos;t show on startup
          </label>
          <button className="about-close-btn" onClick={onDismiss}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
