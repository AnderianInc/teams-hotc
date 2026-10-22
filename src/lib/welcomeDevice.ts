export const WELCOME_DEVICE_KEY = 'hotc_visitor_identity';

export function forgetWelcomeDevice(storage: Pick<Storage, 'removeItem'> = localStorage) {
  storage.removeItem(WELCOME_DEVICE_KEY);
}