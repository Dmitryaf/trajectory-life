// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { observePublicPageUpdates } from '../publicUpdates';

afterEach(() => vi.unstubAllGlobals());

function workerFixture(controlled: boolean) {
  const worker = Object.assign(new EventTarget(), {
    controller: controlled ? {} : null,
    getRegistration: vi.fn().mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) }),
  });
  vi.stubGlobal('navigator', { serviceWorker: worker });
  return worker;
}

describe('updates of an existing public page', () => {
  it('does not register a worker or inspect registrations for a new visitor', () => {
    const worker = workerFixture(false);
    const reload = vi.fn();
    const observer = observePublicPageUpdates(() => true, reload);
    observer.check();
    worker.controller = {};
    worker.dispatchEvent(new Event('controllerchange'));
    expect(worker.getRegistration).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    observer.stop();
  });

  it('reloads a public page once after activation, including duplicate workbox notification', () => {
    const worker = workerFixture(true);
    const reload = vi.fn();
    const observer = observePublicPageUpdates(() => true, reload);
    worker.dispatchEvent(new Event('controllerchange'));
    observer.onUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
    observer.stop();
  });

  it('preserves a working page and only refreshes after leaving for a public page', () => {
    const worker = workerFixture(true);
    let publicPage = false;
    const reload = vi.fn();
    const observer = observePublicPageUpdates(() => publicPage, reload);
    worker.dispatchEvent(new Event('controllerchange'));
    observer.onUpdate();
    expect(reload).not.toHaveBeenCalled();
    publicPage = true;
    observer.check();
    expect(reload).toHaveBeenCalledTimes(1);
    observer.stop();
  });

  it('bounds update checks and tolerates an offline check', async () => {
    const worker = workerFixture(true);
    worker.getRegistration.mockRejectedValue(new TypeError('offline'));
    const reload = vi.fn();
    const observer = observePublicPageUpdates(() => true, reload);
    observer.check();
    observer.check();
    await vi.waitFor(() => expect(worker.getRegistration).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
    observer.stop();
  });
});
