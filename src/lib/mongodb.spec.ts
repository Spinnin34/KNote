import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabase } from '../../server/mongodb';

const mongo = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  createIndex: vi.fn(),
}));

vi.mock('mongodb', async (importOriginal) => ({
  ...await importOriginal<typeof import('mongodb')>(),
  MongoClient: class {
    connect = mongo.connect;
    close = mongo.close;
  },
}));

const db = {
  collection: () => ({ createIndex: mongo.createIndex }),
};

describe('MongoDB initialization', () => {
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'knoteMongoClient');
    Reflect.deleteProperty(globalThis, 'knoteMongoIndexes');
    vi.stubEnv('KNOTE_MONGODB_URI', 'mongodb://localhost:27017');
    vi.stubEnv('KNOTE_MONGODB_DB', 'knote_test');
    mongo.connect.mockReset().mockResolvedValue({ db: () => db });
    mongo.close.mockReset().mockResolvedValue(undefined);
    mongo.createIndex.mockReset().mockResolvedValue('index');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('shares a connection between requests and retries after a failed connection', async () => {
    const networkError = new Error('Temporary error');
    mongo.connect.mockRejectedValueOnce(networkError);

    const results = await Promise.allSettled([getDatabase(), getDatabase()]);
    expect(results).toEqual([
      { status: 'rejected', reason: networkError },
      { status: 'rejected', reason: networkError },
    ]);
    expect(mongo.connect).toHaveBeenCalledTimes(1);
    expect(mongo.close).toHaveBeenCalledOnce();

    await expect(getDatabase()).resolves.toBe(db);
    await expect(getDatabase()).resolves.toBe(db);
    expect(mongo.connect).toHaveBeenCalledTimes(2);
    expect(mongo.createIndex).toHaveBeenCalledTimes(7);
  });

  it('retries index setup without replacing an established connection', async () => {
    const indexError = new Error('Temporary initialization error');
    mongo.createIndex.mockRejectedValueOnce(indexError);

    await expect(getDatabase()).rejects.toBe(indexError);
    await Promise.all([getDatabase(), getDatabase()]);

    expect(mongo.connect).toHaveBeenCalledOnce();
    expect(mongo.createIndex).toHaveBeenCalledTimes(14);
    expect(mongo.close).not.toHaveBeenCalled();
  });
});
