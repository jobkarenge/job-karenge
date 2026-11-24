import mongoose from 'mongoose';
import { env } from './env.ts';

let mongoConnected = false;

export async function connectDatabase(): Promise<boolean> {
  if (!env.mongodbUri) {
    console.warn('[Job Karenge] MONGODB_URI is not set. Running with local server-side persistent store (.data/store.json).');
    return false;
  }
  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 6000,
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
