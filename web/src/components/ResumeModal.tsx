/**
 * Modal shown when the app reloads with saved NL history.
 * Lets the user choose to resume or start fresh.
 */

import type { PendingRestore } from '../hooks/useNlHistory';
import { useGraph } from '../providers/GraphProvider';
import './ResumeModal.css';

interface ResumeModalProps {
  pending: PendingRestore;
}

export function ResumeModal({ pending }: ResumeModalProps) {
  const { getNode } = useGraph();

  const focusTitle = pending.focusNodeId
    ? (getNode(pending.focusNodeId)?.title ?? pending.focusNodeId)
    : null;

  return (
    <div className="resume-modal-overlay">
      <div className="resume-modal">
        <div className="resume-modal-title">Resume previous session?</div>
        <div className="resume-modal-info">
          {focusTitle ? (
            <div className="resume-modal-focus">
              Focus: <strong>{focusTitle}</strong>
            </div>
          ) : (
            <div className="resume-modal-focus">Previous session</div>
          )}
          <div className="resume-modal-stats">
            {pending.snapshotCount} undo step{pending.snapshotCount === 1 ? '' : 's'}
          </div>
        </div>
        <div className="resume-modal-actions">
          <button className="resume-modal-btn resume-btn" onClick={pending.resume}>
            Resume
          </button>
          <button className="resume-modal-btn fresh-btn" onClick={pending.startFresh}>
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}
