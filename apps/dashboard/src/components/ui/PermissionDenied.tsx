import React from 'react';
import { EmptyState } from './EmptyState.js';
import { ShieldAlert } from 'lucide-react';

export interface PermissionDeniedProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const PermissionDenied: React.FC<PermissionDeniedProps> = ({
  title = 'Administrator Access Required',
  description = 'You do not have permission to access this section. This area requires elevated cluster administrator credentials.',
  actionLabel = 'Return to Overview',
  onAction
}) => {
  return (
    <div
      style={{
        padding: '60px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px'
      }}
      role="region"
      aria-label="Permission Denied"
    >
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <EmptyState
          icon={<ShieldAlert size={32} style={{ color: 'var(--color-danger)' }} />}
          title={title}
          description={description}
          actionLabel={actionLabel}
          onAction={onAction}
        />
      </div>
    </div>
  );
};
