import { MongoClient, MongoError, type Db } from 'mongodb';

const runtime = globalThis as typeof globalThis & {
  knoteMongoClient?: Promise<MongoClient>;
  knoteMongoIndexes?: Promise<void>;
};

function configuration(): { uri: string; database: string } {
  const uri = process.env.KNOTE_MONGODB_URI?.trim() ?? '';
  const database = process.env.KNOTE_MONGODB_DB?.trim() || 'knote';
  if (!uri) {
    console.error('[KNote mongo] Database unavailable', { stage: 'configuration', missing: 'KNOTE_MONGODB_URI' });
    throw new Error('KNOTE_MONGODB_URI is not configured.');
  }
  return { uri, database };
}

function logMongoFailure(stage: 'connection' | 'indexes', error: unknown): void {
  // Driver messages can contain connection details. Log the phase and machine codes only.
  const code = error instanceof MongoError ? error.code : undefined;
  const cause = error instanceof Error ? error.cause : undefined;
  const systemCode = cause instanceof Error && 'code' in cause ? cause.code : undefined;
  console.error('[KNote mongo] Database unavailable', {
    stage,
    errorType: error instanceof Error ? error.name : 'UnknownError',
    ...(typeof code === 'number' ? { mongoCode: code } : {}),
    ...(typeof systemCode === 'string' && /^[A-Z][A-Z0-9_]{1,48}$/.test(systemCode) ? { systemCode } : {}),
  });
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
    try {
      return await client.connect();
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  })().catch((error: unknown) => {
    runtime.knoteMongoClient = undefined;
    logMongoFailure('connection', error);
    throw error;
  });
  const client = await runtime.knoteMongoClient;
  const db = client.db(database);
  runtime.knoteMongoIndexes ??= (async () => {
    const results = await Promise.allSettled([
      db.collection('pages').createIndex({ owner: 1, pageId: 1 }, { unique: true }),
      db.collection('user_state').createIndex({ owner: 1 }, { unique: true }),
      db.collection('conflicts').createIndex({ owner: 1, resolvedAt: 1, createdAt: -1 }),
      db.collection('conflicts').createIndex({ fingerprint: 1 }, { unique: true, partialFilterExpression: { fingerprint: { $type: 'string' } } }),
      db.collection('shares').createIndex({ tokenHash: 1 }, { unique: true }),
      db.collection('shares').createIndex({ owner: 1, pageId: 1 }, { unique: true }),
      db.collection('assets').createIndex({ owner: 1, assetId: 1 }, { unique: true }),
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  })().catch((error: unknown) => {
    runtime.knoteMongoIndexes = undefined;
    logMongoFailure('indexes', error);
    throw error;
  });
  await runtime.knoteMongoIndexes;
  return db;
}

export function hasMongoConfiguration(): boolean {
  return Boolean(process.env.KNOTE_MONGODB_URI?.trim());
}
