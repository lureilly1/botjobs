import * as React from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The one hydrated component on the site.
 *
 * It earns it: drafting takes ten to twenty seconds, so the page has to poll
 * rather than block. Everything else on Bot Jobs ships zero JavaScript.
 *
 * `fallbackHref` is the GitHub issue route. If this island fails to hydrate —
 * or JavaScript is off entirely — the surrounding markup still offers a working
 * way in, so nobody is stranded.
 */
type Status = 'idle' | 'sending' | 'working' | 'opened' | 'rejected' | 'failed';

interface Props {
  fallbackHref: string;
}

export default function SubmitForm({ fallbackHref }: Props) {
  const [status, setStatus] = React.useState<Status>('idle');
  const [message, setMessage] = React.useState<string | null>(null);
  const [prUrl, setPrUrl] = React.useState<string | null>(null);

  const poll = React.useCallback(async (id: string) => {
    // Give up after two minutes rather than polling a dead job forever.
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/submit?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.status === 'opened') {
          setPrUrl(data.prUrl);
          setStatus('opened');
          return;
        }
        if (data.status === 'rejected' || data.status === 'failed') {
          setMessage(data.message ?? 'That did not work.');
          setStatus(data.status);
          return;
        }
      } catch {
        /* transient — keep polling */
      }
    }
    setMessage('This is taking longer than expected. It may still land.');
    setStatus('failed');
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('sending');
    setMessage(null);

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: form.get('url'),
          note: form.get('note'),
          submitter: form.get('submitter'),
          website: form.get('website'), // honeypot
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? 'That did not work.');
        setStatus('rejected');
        return;
      }
      setStatus('working');
      void poll(data.id);
    } catch {
      setMessage('Could not reach the server.');
      setStatus('failed');
    }
  }

  if (status === 'opened') {
    return (
      <div className="border-ink bg-hi-vis/15 rounded-lg border-[1.5px] p-5">
        <h3 className="text-lg font-bold">Drafted — it is in the queue</h3>
        <p className="text-muted-foreground mt-2 text-sm/relaxed">
          We wrote a listing from the official x.ai page and opened a pull request. A human reads
          it before it goes live, usually the same day.
        </p>
        {prUrl && (
          <a href={prUrl} rel="noopener" className={buttonVariants({ size: 'sm', className: 'mt-4' })}>
            See the pull request
          </a>
        )}
      </div>
    );
  }

  if (status === 'rejected' || status === 'failed') {
    return (
      <div className="border-border rounded-lg border border-dashed p-5">
        <h3 className="font-bold">That did not go through</h3>
        <p className="text-muted-foreground mt-2 text-sm/relaxed">{message}</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => setStatus('idle')}>
            Try again
          </Button>
          <a
            href={fallbackHref}
            rel="noopener"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Submit it by hand instead
          </a>
        </div>
      </div>
    );
  }

  const busy = status === 'sending' || status === 'working';

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div>
        <label htmlFor="url" className="mb-1.5 block text-sm font-medium">
          Official share link
        </label>
        <Input
          id="url"
          name="url"
          type="url"
          required
          disabled={busy}
          placeholder="https://x.ai/bot/…"
          className="border-ink h-11 border-[1.5px] font-mono text-[13px]"
        />
        <p className="text-muted-foreground mt-1.5 text-xs">
          Open the bot in Grok and copy its share link. We check it resolves before drafting.
        </p>
      </div>

      <div>
        <label htmlFor="note" className="mb-1.5 block text-sm font-medium">
          What does it actually do?
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          disabled={busy}
          placeholder="Sweeps my Gmail every weekday and only leaves things that need a reply."
          className="border-ink bg-background focus-visible:ring-ring w-full rounded-md border-[1.5px] px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
        />
      </div>

      <div>
        <label htmlFor="submitter" className="mb-1.5 block text-sm font-medium">
          Your name or handle <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Input
          id="submitter"
          name="submitter"
          disabled={busy}
          placeholder="@you"
          className="border-ink h-11 border-[1.5px]"
        />
      </div>

      {/* Honeypot. Hidden from people, filled in by naive bots. */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" variant="hivis" disabled={busy}>
          {status === 'sending' ? 'Sending…' : status === 'working' ? 'Drafting…' : 'Submit a bot'}
        </Button>
        {status === 'working' && (
          <span className="text-muted-foreground text-sm">
            Reading the official listing and writing it up — about twenty seconds.
          </span>
        )}
      </div>
    </form>
  );
}
