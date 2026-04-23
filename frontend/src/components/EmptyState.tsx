import { copy } from '../lib/copy.js';

export function EmptyState() {
  return (
    <div className="card state-box" role="status">
      {copy.errors.none}
    </div>
  );
}
