import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshSnapshot } from '../lib/api.js';
import { copy } from '../lib/copy.js';

interface Props {
  /** Called after a successful refresh (201 or 200). */
  onSuccess?: () => void;
}

type Status = 'idle' | 'busy' | 'error';

export function RefreshButton({ onSuccess }: Props) {
  const client = useQueryClient();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    if (status === 'busy') return;
    setStatus('busy');
    setErrorMsg(null);
    try {
      await refreshSnapshot();
      await client.invalidateQueries({ queryKey: ['latest-snapshot'] });
      setStatus('idle');
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  const label = status === 'busy' ? copy.refresh.busy : copy.refresh.idle;

  return (
    <div className="refresh">
      <button
        type="button"
        className="refresh__button"
        onClick={() => {
          void handleClick();
        }}
        disabled={status === 'busy'}
        aria-label={copy.refresh.ariaLabel}
        aria-busy={status === 'busy'}
        data-status={status}
      >
        {label}
      </button>
      {status === 'error' && errorMsg ? (
        <span
          className="refresh__error"
          role="alert"
          title={errorMsg}
          aria-label={copy.refresh.errorLabel}
        >
          {copy.refresh.errorGeneric}
        </span>
      ) : null}
    </div>
  );
}
