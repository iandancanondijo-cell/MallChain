import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SocialAccounts } from './SocialAccounts';
import { settingsApi } from '../../../services/settingsApi';
import { toastBus, type ToastItem } from '../../../components/ui';

// The panel's whole job is to show what the server keeps, so the server is the
// only thing mocked here — no stubbed platform list, no pre-attached account.
vi.mock('../../../services/settingsApi', () => ({
  settingsApi: {
    getSocialAccounts: vi.fn(),
    updateSocialAccount: vi.fn(),
    removeSocialAccount: vi.fn(),
  },
}));

const read = vi.mocked(settingsApi.getSocialAccounts);
const save = vi.mocked(settingsApi.updateSocialAccount);
const remove = vi.mocked(settingsApi.removeSocialAccount);

const toasts: ToastItem[] = [];
const text = () => toasts.map((t) => t.text);

const ok = <T,>(data: T) => ({ ok: true as const, data });
const err = (error: string) => ({ ok: false as const, error });

const card = (name: string) => {
  const el = [...document.querySelectorAll('.social-card')]
    .find((c) => c.querySelector('.social-name')?.textContent === name);
  if (!el) throw new Error(`no ${name} card rendered`);
  return el as HTMLElement;
};

const status = (name: string) => card(name).querySelector('.social-status')?.textContent?.trim();
const storedHandle = (name: string) => card(name).querySelector('.handle-value')?.textContent;

function typeHandle(name: string, value: string) {
  const input = card(name).querySelector('input');
  if (!input) throw new Error(`${name} is not in edit mode`);
  fireEvent.change(input, { target: { value } });
  return input;
}

beforeEach(() => {
  toasts.length = 0;
  toastBus.listeners.add((t) => toasts.push(t));
  // mockReset also drops any once-value a failed test left in the queue.
  read.mockReset(); save.mockReset(); remove.mockReset();
  read.mockResolvedValue(ok([]));
  save.mockResolvedValue(ok({ platform: 'twitter', handle: 'ada', connected: true }));
  remove.mockResolvedValue(ok({ removed: true }));
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  toastBus.listeners.clear();
  cleanup();
  vi.unstubAllGlobals();
});

describe('Social Accounts panel', () => {
  test('an account with nothing saved is ten "Not saved" cards, not ten lies', async () => {
    render(<SocialAccounts />);
    await waitFor(() => expect(screen.queryAllByText('Not saved')).toHaveLength(10));
    expect(screen.queryByText('Saved')).toBeNull();
    expect(text()).toEqual([]);
  });

  test('nothing claims a handle before the server has answered', () => {
    read.mockReturnValue(new Promise(() => {}));
    render(<SocialAccounts />);
    expect(screen.getByText(/Loading social accounts/i)).toBeTruthy();
    expect(document.querySelectorAll('.social-card')).toHaveLength(0);
  });

  test('a handle the server reports is shown exactly as the server reports it', async () => {
    read.mockResolvedValue(ok([{ platform: 'github', handle: 'ada-o', connected: true }]));
    render(<SocialAccounts />);
    await waitFor(() => expect(status('GitHub')).toBe('Saved'));
    expect(storedHandle('GitHub')).toBe('ada-o');
    expect(status('Twitter/X')).toBe('Not saved');
  });

  test('saving sends the trimmed handle and the card shows the re-read value', async () => {
    // The server strips a pasted "@"; the client sends it. The card must end up
    // showing the server's answer, not the string the user typed.
    read
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ platform: 'twitter', handle: 'ada_test', connected: true }]));
    render(<SocialAccounts />);
    await waitFor(() => expect(status('Twitter/X')).toBe('Not saved'));

    fireEvent.click(card('Twitter/X').querySelector('button')!);
    typeHandle('Twitter/X', '  @ada_test  ');
    fireEvent.click([...card('Twitter/X').querySelectorAll('button')].find((b) => b.textContent === 'Save')!);

    await waitFor(() => expect(save).toHaveBeenCalledWith('twitter', '@ada_test'));
    await waitFor(() => expect(storedHandle('Twitter/X')).toBe('ada_test'));
    expect(status('Twitter/X')).toBe('Saved');
    expect(text()).toContain('Twitter/X handle saved');
  });

  test('the cards stay on screen while the panel re-reads after a save', async () => {
    read
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ platform: 'twitter', handle: 'ada', connected: true }]));
    render(<SocialAccounts />);
    await waitFor(() => expect(screen.queryAllByText('Not saved')).toHaveLength(10));

    // Held open so the grid can be inspected while the save is still in flight.
    let releaseSave!: (v: unknown) => void;
    save.mockReturnValue(new Promise((resolve) => { releaseSave = resolve; }) as never);
    fireEvent.click(card('Twitter/X').querySelector('button')!);
    typeHandle('Twitter/X', 'ada');
    fireEvent.click([...card('Twitter/X').querySelectorAll('button')].find((b) => b.textContent === 'Save')!);

    releaseSave(ok({ platform: 'twitter', handle: 'ada', connected: true }));
    await waitFor(() => expect(read.mock.calls.length).toBe(2));
    // A second "Loading social accounts…" here would mean the grid vanished
    // mid-save — the flash that reads as "your handle is gone".
    expect(screen.queryByText(/Loading social accounts/i)).toBeNull();
    expect(document.querySelectorAll('.social-card')).toHaveLength(10);
  });

  test('a blank handle is refused without asking the server', async () => {
    render(<SocialAccounts />);
    await waitFor(() => expect(screen.queryAllByText('Not saved')).toHaveLength(10));

    fireEvent.click(card('Telegram').querySelector('button')!);
    typeHandle('Telegram', '   ');
    fireEvent.click([...card('Telegram').querySelectorAll('button')].find((b) => b.textContent === 'Save')!);

    expect(save).not.toHaveBeenCalled();
    expect(text()).toContain('Please enter a valid handle');
  });

  test('a refused save keeps the card "Not saved" and says the server\'s reason', async () => {
    save.mockResolvedValue(err('handle is required and must be a non-empty string of at most 100 characters'));
    render(<SocialAccounts />);
    await waitFor(() => expect(screen.queryAllByText('Not saved')).toHaveLength(10));

    fireEvent.click(card('Reddit').querySelector('button')!);
    typeHandle('Reddit', 'x'.repeat(200));
    fireEvent.click([...card('Reddit').querySelectorAll('button')].find((b) => b.textContent === 'Save')!);

    await waitFor(() => expect(text()).toContain('handle is required and must be a non-empty string of at most 100 characters'));
    expect(status('Reddit')).toBe('Not saved');
    expect(read.mock.calls.length).toBe(1);
  });

  test('Edit prefills the handle the server holds, not what was typed last time', async () => {
    read.mockResolvedValue(ok([{ platform: 'discord', handle: 'ada', connected: true }]));
    render(<SocialAccounts />);
    await waitFor(() => expect(status('Discord')).toBe('Saved'));

    fireEvent.click([...card('Discord').querySelectorAll('button')].find((b) => b.textContent === 'Edit')!);
    expect(card('Discord').querySelector('input')?.value).toBe('ada');
  });

  test('removing asks first, then deletes on the server and re-reads', async () => {
    read
      .mockResolvedValueOnce(ok([{ platform: 'youtube', handle: 'ada', connected: true }]))
      .mockResolvedValueOnce(ok([]));
    render(<SocialAccounts />);
    await waitFor(() => expect(status('YouTube')).toBe('Saved'));

    fireEvent.click([...card('YouTube').querySelectorAll('button')].find((b) => b.textContent === 'Remove')!);
    await waitFor(() => expect(remove).toHaveBeenCalledWith('youtube'));
    await waitFor(() => expect(status('YouTube')).toBe('Not saved'));
    expect(storedHandle('YouTube')).toBeUndefined();
  });

  test('declining the confirmation sends no delete', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    read.mockResolvedValue(ok([{ platform: 'twitch', handle: 'ada', connected: true }]));
    render(<SocialAccounts />);
    await waitFor(() => expect(status('Twitch')).toBe('Saved'));

    fireEvent.click([...card('Twitch').querySelectorAll('button')].find((b) => b.textContent === 'Remove')!);
    expect(remove).not.toHaveBeenCalled();
    expect(status('Twitch')).toBe('Saved');
  });

  test('a read that fails leaves every card honest instead of half-filled', async () => {
    read.mockResolvedValue(err('Saved social handles could not be loaded.'));
    render(<SocialAccounts />);
    await waitFor(() => expect(screen.queryAllByText('Not saved')).toHaveLength(10));
    expect(text()).toContain('Saved social handles could not be loaded.');
    expect(screen.queryByText('Saved')).toBeNull();
  });

  test('a payload that is not the list the route promises is refused, not rendered', async () => {
    read.mockResolvedValue({ ok: true, data: { twitter: 'ada' } } as never);
    render(<SocialAccounts />);
    // accounts.find() on a plain object would throw during render and blank the
    // page; the panel has to survive it and say the read failed.
    await waitFor(() => expect(screen.queryAllByText('Not saved')).toHaveLength(10));
    expect(text()).toContain('Saved social handles could not be loaded.');
  });
});
