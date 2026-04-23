import { copy } from '../lib/copy.js';

interface Props {
  message?: string;
}

export function ErrorState({ message }: Props) {
  return (
    <div className="card state-box state-box--error" role="alert">
      <div>{copy.errors.generic}</div>
      {message ? (
        <div style={{ marginTop: 8, fontSize: '0.85rem', opacity: 0.7 }}>{message}</div>
      ) : null}
    </div>
  );
}
