import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { getSessionUser } from './auth';

export async function createContext({ req, res }: CreateExpressContextOptions) {
  return { req, res, user: await getSessionUser(req) };
}

export type AppContext = Awaited<ReturnType<typeof createContext>>;
