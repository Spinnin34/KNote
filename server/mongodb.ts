import { MongoClient, type Db } from 'mongodb';

const runtime = globalThis as typeof globalThis & {
  knoteMongoClient?: Promise<MongoClient>;
  knoteMongoIndexes?: Promise<void>;
};

function configuration(): { uri: string; database: string } {
  const uri = process.env.KNOTE_MONGODB_URI?.trim() ?? '';
  const database = process.env.KNOTE_MONGODB_DB?.trim() || 'knote';
  if (!uri) throw new Error('KNOTE_MONGODB_URI is not configured.');
  return { uri, database };
}

export async function getDatabase(): Promise<Db> {
  const { uri, database } = configuration();
  runtime.knoteMongoClient ??= (async () => {
    const client = new MongoClient(uri, {
      appName: 'KNote',
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      retryWrites: true,
      ...(process.env.VERCEL === '1' ? { tls: true } : {}),
    });
    return client.connect();
  })();
  const client = await runtime.knoteMongoClient;
  runtime.knoteMongoIndexes ??= (async () => {
    const db = client.db(database);
    await Promise.all([
      db.collection('pages').createIndex({ owner: 1, pageId: 1 }, { unique: true }),
      db.collection('user_state').createIndex({ owner: 1 }, { unique: true }),
      db.collection('conflicts').createIndex({ owner: 1, resolvedAt: 1, createdAt: -1 }),
      db.collection('conflicts').createIndex({ fingerprint: 1 }, { unique: true, partialFilterExpression: { fingerprint: { $type: 'string' } } }),
      db.collection('shares').createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection('shares').createIndex({ owner: 1, pageId: 1 }, { unique: true }),
      db.collection('assets').createIndex({ owner: 1, assetId: 1 }, { unique: true }),
    ]);
  })();
  await runtime.knoteMongoIndexes;
  return client.db(database);
}

export function hasMongoConfiguration(): boolean {
  return Boolean(process.env.KNOTE_MONGODB_URI?.trim());
}
