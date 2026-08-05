import { describe, expect, it, vi } from 'vitest';
import {
  createPraxisSsoEntryController,
} from './praxisSsoEntry';
import { praxisSsoErrorMessage } from './praxisSsoClient';

describe('Praxis SSO entry controller', () => {
  it('automatically launches only once across repeated mount signals', async () => {
    const launch = vi.fn().mockResolvedValue(undefined);
    const controller = createPraxisSsoEntryController(launch);

    await controller.startAutomatically();
    await controller.startAutomatically();

    expect(launch).toHaveBeenCalledOnce();
    expect(controller.state).toMatchObject({
      status: 'launching',
      errorMessage: null,
    });
  });

  it('deduplicates concurrent automatic launch signals', async () => {
    let resolveLaunch!: () => void;
    const launch = vi.fn(() => new Promise<void>((resolve) => {
      resolveLaunch = resolve;
    }));
    const controller = createPraxisSsoEntryController(launch);

    const first = controller.startAutomatically();
    const second = controller.startAutomatically();

    expect(first).toBe(second);
    expect(launch).toHaveBeenCalledOnce();
    resolveLaunch();
    await first;
  });

  it('shows a safe failure and allows an explicit retry', async () => {
    const launch = vi.fn()
      .mockRejectedValueOnce(new Error('Praxis integration is unavailable.'))
      .mockResolvedValueOnce(undefined);
    const controller = createPraxisSsoEntryController(launch);

    await controller.startAutomatically();
    expect(controller.state).toMatchObject({
      status: 'error',
      errorMessage: 'Praxis integration is unavailable.',
    });

    await controller.retry();
    expect(launch).toHaveBeenCalledTimes(2);
    expect(controller.state).toMatchObject({
      status: 'launching',
      errorMessage: null,
    });
  });

  it('does not expose arbitrary non-error values in the UI', () => {
    expect(praxisSsoErrorMessage({ ticket: 'must-not-leak' }))
      .toBe('无法进入 Praxis，请稍后重试。');
  });
});
