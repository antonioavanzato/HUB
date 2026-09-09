// Ключ доступа хранится только на этом устройстве.
// В репозитории его нет и быть не должно.
import { listOrders, UnauthorizedError } from './api.js';

const STORAGE_KEY = 'hub.bookings.apiKey';

export function loadKey() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveKey(key) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Приватный режим: ключ проживёт до закрытия вкладки, это допустимо.
  }
}

export function clearKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Нечего стирать.
  }
}

export async function verifyKey(key) {
  try {
    await listOrders(key);
    return true;
  } catch (error) {
    if (error instanceof UnauthorizedError) return false;
    throw error;
  }
}
