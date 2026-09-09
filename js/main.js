import { listOrders, setOrderStatus, deleteOrder, UnauthorizedError } from './api.js';
import { loadKey, saveKey, clearKey, verifyKey } from './auth.js';
import {
  showAuthScreen,
  showListScreen,
  setAuthError,
  setBanner,
  renderFilters,
  renderList,
} from './ui.js';

// Тот же интервал, что у приложения: BookingRequestsSyncService.pollInterval.
const POLL_INTERVAL_MS = 20000;

// Заявки живут только здесь, в памяти вкладки. На диск не попадают.
let orders = [];
let filterState = { archive: false, statusId: null };
let pollTimer = null;

function render() {
  renderFilters(orders, filterState, (next) => {
    filterState = next;
    render();
  });
  renderList(orders, filterState, { onStatusChange, onDelete });
}

function logout() {
  stopPolling();
  clearKey();
  orders = [];
  filterState = { archive: false, statusId: null };
  setBanner(null);
  showAuthScreen();
}

function handleError(error) {
  if (error instanceof UnauthorizedError) {
    logout();
    setAuthError('Ключ недействителен');
    return true;
  }
  return false;
}

async function poll() {
  const key = loadKey();
  if (!key) return;
  try {
    orders = await listOrders(key);
    setBanner(null);
    render();
  } catch (error) {
    if (handleError(error)) return;
    setBanner('Нет связи. Показаны последние загруженные заявки.');
  }
}

function startPolling() {
  stopPolling();
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function onStatusChange(id, statusId) {
  const key = loadKey();
  if (!key) return;
  const order = orders.find((o) => o.id === id);
  if (!order) return;

  const previous = order.status;
  order.status = statusId; // применяем сразу
  render();

  try {
    await setOrderStatus(key, id, statusId);
  } catch (error) {
    order.status = previous; // откат
    render();
    if (handleError(error)) return;
    setBanner('Не удалось сменить статус. Попробуйте ещё раз.');
  }
}

async function onDelete(id) {
  const key = loadKey();
  if (!key) return;
  if (!confirm('Удалить заявку?')) return;

  const previous = orders;
  orders = orders.filter((o) => o.id !== id);
  render();

  try {
    await deleteOrder(key, id);
  } catch (error) {
    orders = previous; // откат
    render();
    if (handleError(error)) return;
    setBanner('Не удалось удалить заявку. Попробуйте ещё раз.');
  }
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('auth-key');
  const submit = document.getElementById('auth-submit');
  const key = input.value.trim();
  if (!key) return;

  submit.disabled = true;
  setAuthError(null);
  try {
    if (await verifyKey(key)) {
      saveKey(key);
      input.value = '';
      showListScreen();
      startPolling();
    } else {
      setAuthError('Ключ недействителен');
    }
  } catch {
    setAuthError('Нет связи. Проверьте интернет и попробуйте снова.');
  } finally {
    submit.disabled = false;
  }
}

document.getElementById('auth-form').addEventListener('submit', onAuthSubmit);
document.getElementById('logout').addEventListener('click', logout);
document.getElementById('refresh').addEventListener('click', poll);

// В фоне не опрашиваем: бережём бесплатный лимит Cloud Function.
document.addEventListener('visibilitychange', () => {
  if (document.getElementById('list-screen').hidden) return;
  if (document.hidden) stopPolling();
  else startPolling();
});

if (loadKey()) {
  showListScreen();
  startPolling();
} else {
  showAuthScreen();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
