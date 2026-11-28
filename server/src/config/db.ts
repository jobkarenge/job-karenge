import mongoose from 'mongoose';
import { env } from './env.ts';

let mongoConnected = false;

export async function connectDatabase(): Promise<boolean> {
  if (isMongoConnected()) {
    return true;
  }
  if (!env.mongodbUri) {
    console.warn('[Job Karenge] MONGODB_URI is not set. Running with local server-side persistent store (.data/store.json).');
    return false;
  }
  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 30000,
      maxPoolSize: 20,
      minPoolSize: 2,
    });
    mongoConnected = true;
    console.log('[Job Karenge] Connected to MongoDB Atlas successfully.');
    return true;
  } catch (err) {
    console.error('[Job Karenge] MongoDB connection error, falling back to local persistent store:', err);
    return false;
  }
}

export function isMongoConnected(): boolean {
  return mongoConnected && mongoose.connection.readyState === 1;
}

export async function syncDatabaseIndexes(): Promise<void> {
  if (!isMongoConnected()) return;
  try {
    await Promise.all(
      mongoose.modelNames().map((name) =>
        mongoose.model(name).syncIndexes().catch((err) => {
          console.warn(`[Job Karenge] Index sync warning for ${name}:`, err instanceof Error ? err.message : err);
        })
      )
    );
  } catch (err) {
    console.warn('[Job Karenge] Index sync skipped:', err instanceof Error ? err.message : err);
  }
}
