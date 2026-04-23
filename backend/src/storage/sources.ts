import { sourceMetadata } from './schema.js';
import type { DB } from './client.js';

export async function listSources(db: DB) {
  return db.select().from(sourceMetadata).orderBy(sourceMetadata.sourceId);
}
