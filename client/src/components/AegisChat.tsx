import { FormEvent, useEffect, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';

type Props = { repositoryId?: number };
export default function AegisChat({ repositoryId }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const history = trpc.chat.history.useQuery({ repositoryId }, { enabled: open });
  const ask = trpc.chat.ask.useMutation({ onSuccess: () => history.refetch(), onError: (e) => toast.error('Copilot unavailable', { description: e.message }) });
  useEffect(() => { if (repositoryId && open) history.refetch(); }, [repositoryId, open]);
  const send = (event: FormEvent) => { event.preventDefault(); const question = draft.trim(); if (!question || ask.isPending) return; ask.mutate({ repositoryId, question }); setDraft(''); };
  return <>{open ? <div className="fixed bottom-6 right-6 z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-card shadow-2xl"><div className="flex items-center justify-between border-b p-4"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10"><Bot size={18} /></div><div><div className="font-semibold">Aegis Copilot</div><div className="text-xs text-muted-foreground">Grounded in current scan data</div></div></div><button onClick={() => setOpen(false)}><X size={17} /></button></div><div className="max-h-[55vh] overflow-auto p-4 space-y-3">{history.data?.length ? history.data.map((message) => <div key={message.id} className={`rounded-xl p-3 text-sm ${message.role === 'user' ? 'ml-8 bg-primary/10' : 'mr-4 bg-muted'}`}><div className="mb-1 text-xs text-muted-foreground">{message.role}</div><div className="whitespace-pre-wrap">{message.content}</div></div>) : <div className="py-10 text-center text-sm text-muted-foreground">Ask why a finding matters, how to remediate it, or what the latest scan means.</div>}{ask.isPending ? <div className="rounded-xl bg-muted p-3 text-sm text-muted-foreground"><Sparkles className="mr-2 inline-block animate-pulse" size={15} />Analyzing workspace context…</div> : null}</div><form onSubmit={send} className="flex gap-2 border-t p-3"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about the scan…" className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none" /><button disabled={!draft.trim() || ask.isPending} className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"><Send size={15} /></button></form></div> : <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-3 text-sm font-medium shadow-xl"><Sparkles size={16} /> Aegis Copilot</button>}</>;
}
