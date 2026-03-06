/**
 * Post-reload modal shown when a crash checkpoint exists in sessionStorage.
 * Reuses ResumeModal.css styles.
 */

import type { CrashCheckpointData } from '../utils/crashCheckpoint';
import { useAppStore } from '../store/appStore';
import './ResumeModal.css';

interface CrashRecoveryModalProps {
  checkpoint: CrashCheckpointData;
  crashLoop: boolean;
  onRestore: () => void;
  onStartFresh: () => void;
}

export function CrashRecoveryModal({ checkpoint, crashLoop, onRestore, onStartFresh }: CrashRecoveryModalProps) {
  const getNode = useAppStore(s => s.getNode);

  const focusTitle = checkpoint.selectedNodeId
    ? (getNode(checkpoint.selectedNodeId)?.title ?? checkpoint.selectedNodeId)
    : null;

  return (
    <div className="resume-modal-overlay">
      <div className="resume-modal">
        <div className="resume-modal-title">
          {crashLoop ? 'Repeated crashes detected' : 'Recovered from a crash'}
        </div>
        <div className="resume-modal-info">
          <div className="resume-modal-focus" style={{ color: '#e8a838' }}>
            The app became unresponsive and was automatically reloaded.
          </div>
          {!crashLoop && focusTitle && (
            <div className="resume-modal-focus" style={{ marginTop: '8px' }}>
              Focus: <strong>{focusTitle}</strong>
            </div>
          )}
          {!crashLoop && (
            <div className="resume-modal-stats">
              {checkpoint.displayedNodeIds.length} node{checkpoint.displayedNodeIds.length === 1 ? '' : 's'} displayed
            </div>
          )}
          {crashLoop && (
            <div className="resume-modal-stats" style={{ marginTop: '4px' }}>
              Starting fresh to avoid further crashes.
            </div>
          )}
        </div>
        <div className="resume-modal-actions">
          {!crashLoop && (
            <button className="resume-modal-btn resume-btn" onClick={onRestore}>
              Restore
            </button>
          )}
          <button className="resume-modal-btn fresh-btn" onClick={onStartFresh}>
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}
