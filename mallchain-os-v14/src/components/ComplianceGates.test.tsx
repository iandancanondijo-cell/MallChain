import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, cleanup } from '@testing-library/react';
import { KYCStatusAlert } from './ComplianceGates';
import { kycApi } from '../services/kycApi';
import type { ApiResult, KycStatusResponse } from '../services/kycApi';
import { store } from '../store/store';

const getStatus = vi.mocked(kycApi.getStatus);

vi.mock('./ComplianceGates.css', () => ({}));
vi.mock('../services/kycApi', () => ({
  kycApi: { getStatus: vi.fn() },
}));

function verdict(over: Partial<KycStatusResponse>): ApiResult<KycStatusResponse> {
  return { ok: true, data: { status: 'not_submitted', ...over } as KycStatusResponse };
}

/**
 * App mounts this banner only for a signed-in non-admin once the compliance
 * sequence finishes; none of that is the component's business, so each case
 * sets the store and renders it directly, then flushes the verdict read.
 */
async function mount(user: { id?: string; kycLevel?: number; role?: string } = {}) {
  Object.assign(store.state.user, { id: 'stub-user', role: 'user', kycLevel: 1 }, user);
  const view = render(<KYCStatusAlert />);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

beforeEach(() => {
  cleanup();
  getStatus.mockReset();
});

describe('KYCStatusAlert follows the servers verdict, not kycLevel', () => {
  test('an approved submission silences the banner even at kycLevel 1', async () => {
    getStatus.mockResolvedValue(verdict({ status: 'approved' }));
    const view = await mount();
    expect(view.container.firstChild).toBeNull();
    expect(screen.queryByText('Complete KYC Verification')).toBeNull();
  });

  test('kycLevel 2 settles the question without a read', async () => {
    const view = await mount({ kycLevel: 2 });
    expect(view.container.firstChild).toBeNull();
    expect(getStatus).not.toHaveBeenCalled();
  });

  test('a failed read asserts nothing', async () => {
    getStatus.mockResolvedValue({ ok: false, error: 'kyc status unavailable' } as never);
    const view = await mount();
    expect(view.container.firstChild).toBeNull();
  });

  test('only saved wizard progress still asks for verification', async () => {
    getStatus.mockResolvedValue(verdict({ status: 'draft' }));
    await mount();
    expect(await screen.findByText('Complete KYC Verification')).toBeTruthy();
  });

  test('a submission under review says so instead of asking again', async () => {
    getStatus.mockResolvedValue(verdict({ status: 'pending', submittedAt: '2026-11-08T10:00:00.000Z' }));
    await mount();
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toContain('Verification under review');
    expect(banner.textContent).toContain('View status');
    expect(banner.textContent).not.toContain('Complete KYC Verification');
  });

  test('a rejection quotes the reviewers reason', async () => {
    getStatus.mockResolvedValue(
      verdict({ status: 'rejected', notes: 'The name on the ID does not match the proof of address.' })
    );
    await mount();
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('The name on the ID does not match the proof of address.');
    expect(banner.textContent).toContain('Review and resubmit');
  });

  test('a rejection with no recorded reason says that instead of inventing one', async () => {
    getStatus.mockResolvedValue(verdict({ status: 'rejected', notes: '' }));
    await mount();
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('recorded no reason');
  });

  test('admins are never shown a KYC nag', async () => {
    getStatus.mockResolvedValue(verdict({ status: 'not_submitted' }));
    const view = await mount({ role: 'admin', kycLevel: 1 });
    expect(view.container.firstChild).toBeNull();
    expect(getStatus).not.toHaveBeenCalled();
  });

  test('a rejected answer for one account does not carry into the next', async () => {
    getStatus.mockResolvedValue(verdict({ status: 'rejected', notes: 'Blurry document.' }));
    const view = await mount({ id: 'account-a' });
    await screen.findByRole('alert');

    getStatus.mockResolvedValue(verdict({ status: 'approved' }));
    Object.assign(store.state.user, { id: 'account-b' });
    await act(async () => {
      view.rerender(<KYCStatusAlert />);
      await Promise.resolve();
    });
    await waitFor(() => expect(view.container.firstChild).toBeNull());
  });

  test('returning from the wizard re-reads the verdict', async () => {
    getStatus.mockResolvedValueOnce(verdict({ status: 'not_submitted' }));
    const view = await mount();
    expect(await screen.findByText('Complete KYC Verification')).toBeTruthy();

    getStatus.mockResolvedValueOnce(verdict({ status: 'approved' }));
    await act(async () => {
      window.dispatchEvent(new Event('hashchange'));
      await Promise.resolve();
    });
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(view.container.firstChild).toBeNull();
  });
});
