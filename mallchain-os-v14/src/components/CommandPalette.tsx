/**
 * CommandPalette — Ctrl/Cmd+K global palette. Commands cover every route
 * plus actions: New transaction, Create campaign, Deploy contract,
 * Switch currency, Toggle demo mode.
 */
import { useEffect, useMemo, useState } from 'react';
import { store } from '../store/store';
import { toast } from './ui';

interface Cmd { label: string; icon?: string; hint?: string; run: () => void }

export default function CommandPalette({ navigate }: { navigate: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQ('');
        setSel(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (p: string) => () => { navigate(p); setOpen(false); };
    return [
      { label: 'Go to Dashboard', icon: '⌂', run: go('/') },
      { label: 'Go to Wallet', icon: '◈', run: go('/wallet') },
      { label: 'Send MALL', icon: '➤', run: go('/wallet/send') },
      { label: 'Receive MALL', icon: '⬇', run: go('/wallet/receive') },
      { label: 'Swap tokens', icon: '⇄', run: go('/wallet/swap') },
      { label: 'Go to Marketplace', icon: '🛍', run: go('/marketplace') },
      { label: 'Go to Staking', icon: '⛁', run: go('/staking') },
      { label: 'Go to Governance', icon: '⚖', run: go('/governance') },
      { label: 'Mines Command Center', icon: '🎛', run: go('/mines') },
      { label: 'Discover Campaigns', icon: '🧭', run: go('/mines/discover') },
      { label: 'My Campaigns', icon: '📣', run: go('/mines/my-campaigns') },
      { label: 'Validator Queue', icon: '🛂', run: go('/mines/validator-queue') },
      { label: 'Become a Validator', icon: '🛡', run: go('/validators') },
      { label: 'Rewards Calculator', icon: '🧮', run: go('/validators/calculator') },
      { label: 'Rewards Leaderboard', icon: '🏅', run: go('/validators/rewards-leaderboard') },
      { label: 'Explorer', icon: '🔎', run: go('/explorer') },
      { label: 'Messaging', icon: '💬', run: go('/messaging') },
      { label: 'Referrals', icon: '🔗', run: go('/referrals') },
      { label: 'Smart Contracts', icon: '📜', run: go('/contracts') },
      { label: 'Developer Hub', icon: '⚙', run: go('/devhub') },
      { label: 'Admin', icon: '🛠', run: go('/admin') },
      { label: 'Settings', icon: '⚙', run: go('/settings') },
      { label: 'Profile', icon: '👤', run: go('/profile') },
      { label: 'New transaction', icon: '💸', run: go('/wallet/send') },
      { label: 'Create campaign', icon: '➕', run: go('/mines/my-campaigns') },
      { label: 'Deploy contract', icon: '🚀', run: go('/contracts') },
      {
        label: 'Switch currency', icon: '💱', run: () => {
          const next = { USD: 'KES', KES: 'EUR', EUR: 'GBP', GBP: 'USD' };
          store.state.prefs.currency = next[store.state.prefs.currency] as never;
          store.commit();
          toast('Currency → ' + store.state.prefs.currency);
          setOpen(false);
        },
      },
      {
        label: 'Toggle demo mode', icon: '🎛', run: () => {
          const next = !store.state.settings.demoMode;
          store.state.settings.demoMode = next;
          store.commit();
          toast(next ? 'Demo mode ON' : 'Demo mode OFF (store stays)');
          setOpen(false);
        },
      },
    ];
  }, [navigate]);

  const filtered = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Type a command or search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && filtered[sel]) { filtered[sel].run(); }
          }}
        />
        <div className="palette-list">
          {filtered.length === 0 && <div style={{ padding: 16, color: 'var(--txt-3)', fontSize: 13 }}>No matching commands.</div>}
          {filtered.map((c, i) => (
            <div key={c.label} className={'palette-item' + (i === sel ? ' sel' : '')} onClick={c.run} onMouseEnter={() => setSel(i)}>
              <span>{c.icon}</span>
              <span>{c.label}</span>
              {c.hint && <span className="k">{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
