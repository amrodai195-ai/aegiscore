import { trpc } from '../lib/trpc';

export function useAuth() {
  const query = trpc.auth.me.useQuery(undefined, { retry: false });
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: () => query.refetch() });
  return { user: query.data ?? null, loading: query.isLoading, logout: () => logoutMutation.mutate() };
}
