import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AvatarPicker } from './AvatarUpload';
import { api } from '../../services/api';

// The picker posts the file with fetch — a FormData request the app's JSON
// helper cannot build — and then re-reads the account through the normal api
// client, so both halves are driven from here.
vi.mock('../../services/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const readMe = vi.mocked(api.get);

const UPLOAD = '/api/upload/avatar';
const STORED = '/uploads/avatars/abc-1700000000000-me.png';

let fetchMock: ReturnType<typeof vi.fn>;
let previewCount = 0;
const revoked: string[] = [];

function makeFile(name: string, type: string, bytes = 64) {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** The hidden input the picture button opens. */
function fileInput(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('no file input rendered');
  return input;
}

function pick(container: HTMLElement, file: File) {
  const input = fileInput(container);
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  fireEvent.change(input);
}

const shownImage = () => document.querySelector<HTMLImageElement>('.ps-avatar-stage img');

/** The picker's own contract, exercised the way the page uses it: it reports
 *  the stored path upward and renders whatever it is given back. */
function Harness() {
  const [stored, setStored] = useState<string | null>(null);
  return (
    <div>
      <AvatarPicker storedUrl={stored} name="Ada" initial="A" onStored={setStored} />
      <span data-testid="kept">{stored ?? 'none'}</span>
    </div>
  );
}

const releaseInto = (fn: () => void) => act(async () => { fn(); });

/** Picking a file starts a promise chain that updates state when it settles;
 *  doing it inside act keeps the whole chain — not just the click — in scope. */
const pickAndSettle = async (container: HTMLElement, file: File) => {
  await act(async () => { pick(container, file); });
};

async function respondOk(url = STORED) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, url, filename: url.split('/').pop(), size: 64 }),
  } as never);
}

function meAnswers(avatarUrl: string | null, ok = true) {
  readMe.mockResolvedValue(ok
    ? { ok: true, data: { user: { avatarUrl } } } as never
    : { ok: false, error: 'session expired' } as never);
}

const alertText = () => screen.getByRole('alert').textContent ?? '';

// happy-dom does not necessarily define these on URL, so they are installed by
// descriptor and put back exactly as they were rather than through a spy that
// would have to assume they exist first.
const blobFns = ['createObjectURL', 'revokeObjectURL'] as const;
let savedDescriptors: Array<[typeof blobFns[number], PropertyDescriptor | undefined]> = [];

function installBlobUrls() {
  savedDescriptors = blobFns.map(
    (k) => [k, Object.getOwnPropertyDescriptor(URL, k)] as [typeof blobFns[number], PropertyDescriptor | undefined],
  );
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true, writable: true,
    value: () => `blob:preview-${++previewCount}`,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true, writable: true,
    value: (u?: string | URL) => { revoked.push(String(u)); },
  });
}

function restoreBlobUrls() {
  for (const [k, d] of savedDescriptors) {
    if (d) Object.defineProperty(URL, k, d);
    else delete (URL as unknown as Record<string, unknown>)[k];
  }
}

describe('AvatarPicker', () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    previewCount = 0;
    revoked.length = 0;
    installBlobUrls();
    meAnswers(STORED);
  });

  afterEach(() => {
    cleanup();
    restoreBlobUrls();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  test('with no picture on the account it shows initials, not a broken image', () => {
    render(<AvatarPicker storedUrl={null} name="Ada Omollo" initial="A" onStored={vi.fn()} />);
    expect(shownImage()).toBeNull();
    expect(screen.getByText('AO')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload a profile picture' })).toBeTruthy();
  });

  test('a stored path is rendered through the api prefix, not against the page origin', () => {
    render(<AvatarPicker storedUrl={STORED} name="Ada" initial="A" onStored={vi.fn()} />);
    expect(shownImage()?.getAttribute('src')).toBe(`/api${STORED}`);
  });

  test('a stored path whose bytes do not load shows initials and admits it', () => {
    render(<AvatarPicker storedUrl={STORED} name="Ada" initial="A" onStored={vi.fn()} />);
    const img = shownImage();
    if (!img) throw new Error('no stored picture rendered');
    fireEvent.error(img);

    expect(shownImage()).toBeNull();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/could not be loaded/);
  });

  test('the picked file previews locally and only then posts', async () => {
    let release: (() => void) | null = null;
    fetchMock.mockReturnValue(new Promise((r) => {
      release = () => r({ ok: true, status: 200, json: async () => ({ ok: true, url: STORED }) });
    }));
    // Controlled the way ProfileCard has it: the picker never keeps the stored
    // path itself, it hands it up and renders whatever comes back down.
    const { container } = render(<Harness />);

    pick(container, makeFile('me.png', 'image/png'));

    // While the upload is in flight what is on screen is the local blob, and
    // the control says so instead of pretending the picture is already saved.
    await vi.waitFor(() => expect(shownImage()?.getAttribute('src')).toBe('blob:preview-1'));
    expect(screen.getAllByText('Uploading…').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(UPLOAD);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.body).toBeInstanceOf(FormData);

    await releaseInto(() => { release?.(); });
    await vi.waitFor(() => expect(screen.getByText('Your picture is up. It shows in the menu bar and on your profile.')).toBeTruthy());
    // The blob is given back; what renders now is the path the page was told.
    expect(revoked).toContain('blob:preview-1');
    expect(screen.getByTestId('kept').textContent).toBe(STORED);
    expect(shownImage()?.getAttribute('src')).toBe(`/api${STORED}`);
  });

  test('the file is only called saved once the account record shows it', async () => {
    const onStored = vi.fn();
    await respondOk();
    meAnswers(STORED);
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={onStored} />);

    await pickAndSettle(container, makeFile('me.png', 'image/png'));

    await vi.waitFor(() => expect(readMe).toHaveBeenCalledWith('/api/auth/me'));
    expect(onStored).toHaveBeenCalledWith(STORED);
    expect(screen.getByRole('status').textContent).toMatch(/picture is up/);
  });

  test('a file that uploads but never lands on the account is a failure, not a picture', async () => {
    const onStored = vi.fn();
    await respondOk('/uploads/avatars/abc-1-me.png');
    meAnswers(null);
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={onStored} />);

    await pickAndSettle(container, makeFile('me.png', 'image/png'));

    await vi.waitFor(() => expect(alertText()).toMatch(/still shows no picture/));
    expect(onStored).not.toHaveBeenCalled();
    // and the local preview does not stay behind posing as the account's picture
    expect(revoked).toContain('blob:preview-1');
    expect(shownImage()).toBeNull();
  });

  test('the server’s own reason is shown when it refuses the file', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => ({ error: 'Avatar image must be 2MB or smaller' }),
    } as never);
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={vi.fn()} />);

    await pickAndSettle(container, makeFile('big.png', 'image/png', 1024));

    await vi.waitFor(() => expect(alertText()).toBe('Avatar image must be 2MB or smaller'));
    expect(readMe).not.toHaveBeenCalled();
  });

  test('an oversized or wrongly-typed file never reaches the server, and gives its preview back', async () => {
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={vi.fn()} />);

    pick(container, makeFile('huge.png', 'image/png', 2 * 1024 * 1024 + 1));
    await vi.waitFor(() => expect(alertText()).toMatch(/Too large/));
    expect(shownImage()).toBeNull();

    pick(container, makeFile('sticker.gif', 'image/gif'));
    await vi.waitFor(() => expect(alertText()).toMatch(/not accepted/));
    expect(shownImage()).toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(revoked).toEqual(['blob:preview-1', 'blob:preview-2']);
  });

  test('a dropped file takes the same path as a picked one', async () => {
    await respondOk();
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={vi.fn()} />);
    const stage = container.querySelector<HTMLElement>('.ps-avatar-stage');
    if (!stage) throw new Error('no drop stage rendered');

    await act(async () => {
      fireEvent.drop(stage, { dataTransfer: { files: [makeFile('drop.png', 'image/png')] } });
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect((form.get('file') as File).name).toBe('drop.png');
  });

  test('leaving the page while a preview is pending gives the blob back', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const { container, unmount } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={vi.fn()} />);
    pick(container, makeFile('me.png', 'image/png'));
    unmount();
    expect(revoked).toContain('blob:preview-1');
  });

  test('no answer at all says nothing was saved', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={vi.fn()} />);

    await pickAndSettle(container, makeFile('me.png', 'image/png'));

    await vi.waitFor(() => expect(alertText()).toMatch(/Could not reach the server, so nothing was saved/));
  });

  test('when the account cannot be re-read the upload response is what shows', async () => {
    const onStored = vi.fn();
    await respondOk();
    readMe.mockResolvedValue({ ok: false, error: 'session expired' } as never);
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={onStored} />);

    await pickAndSettle(container, makeFile('me.png', 'image/png'));

    await vi.waitFor(() => expect(onStored).toHaveBeenCalledWith(STORED));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a picture the account stored under another name is reported, not hidden', async () => {
    const onStored = vi.fn();
    await respondOk('/uploads/avatars/abc-1-new.png');
    meAnswers('/uploads/avatars/abc-0-older.png');
    const { container } = render(<AvatarPicker storedUrl={null} name="Ada" initial="A" onStored={onStored} />);

    await pickAndSettle(container, makeFile('me.png', 'image/png'));

    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Saved as/));
    // what the page is told is the value the record holds, not the one just sent
    expect(onStored).toHaveBeenCalledWith('/uploads/avatars/abc-0-older.png');
  });
});
