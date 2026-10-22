import { expect, it } from 'vitest';
import { forgetWelcomeDevice, WELCOME_DEVICE_KEY } from './welcomeDevice';

it('clears only welcome recognition, not the signed-in account', () => {
  localStorage.setItem(WELCOME_DEVICE_KEY, 'opaque-test-token');
  localStorage.setItem('account-session', 'keep');
  forgetWelcomeDevice();
  expect(localStorage.getItem(WELCOME_DEVICE_KEY)).toBeNull();
  expect(localStorage.getItem('account-session')).toBe('keep');
  localStorage.clear();
});