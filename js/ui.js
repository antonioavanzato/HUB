// Рендер из состояния в DOM. Сети здесь нет: действия уходят в обработчики.
import { STATUSES, labelForStatus } from './status.js';
import { filterOrders, groupByDate, countsByStatus, subtitleText } from './store.js';

const el = (id) => document.getElementById(id);

export function showAuthScreen() {
  el('auth-screen').hidden = false;
  el('list-screen').hidden = true;
}

export function showListScreen() {
  el('auth-screen').hidden = true;
  el('list-screen').hidden = false;
}

export function setAuthError(text) {
  const node = el('auth-error');
  node.textContent = text || '';
  node.hidden = !text;
}

export function setBanner(text) {
  const node = el('banner');
  node.textContent = text || '';
  node.hidden = !text;
}

function filterButton(label, isActive, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button filter';
  button.textContent = label;
  button.setAttribute('aria-pressed', String(isActive));
  button.addEventListener('click', onClick);
  return button;
}

export function renderFilters(all, state, onSelect) {
  const container = el('filters');
  container.replaceChildren();
  const counts = countsByStatus(all);

  container.append(
    filterButton('Все', !state.archive && state.statusId === null, () =>
      onSelect({ archive: false, statusId: null })
    )
  );

  // В фильтрах только рабочие статусы: завершённые и отказы живут в архиве.
  for (const status of STATUSES) {
    if (status.id === 'completed' || status.id === 'cancelled') continue;
    const count = counts[status.id] || 0;
    const label = count > 0 ? `${status.label} · ${count}` : status.label;
    container.append(
      filterButton(label, !state.archive && state.statusId === status.id, () =>
        onSelect({ archive: false, statusId: status.id })
      )
    );
  }

  container.append(
    filterButton('Архив', state.archive, () => onSelect({ archive: true, statusId: null }))
  );
}

function metaLine(order) {
  const parts = [order.type, order.city, order.date].filter(
    (value) => value && value !== '—'
  );
  return parts.join(' · ');
}

function actionLink(label, href) {
  const link = document.createElement('a');
  link.className = 'button';
  link.textContent = label;
  link.href = href;
  link.rel = 'noopener';
  return link;
}

function statusSelect(order, onStatusChange) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Статус заявки');
  for (const status of STATUSES) {
    const option = document.createElement('option');
    option.value = status.id;
    option.textContent = status.label;
    option.selected = status.id === order.status;
    select.append(option);
  }
  select.addEventListener('change', () => onStatusChange(order.id, select.value));
  return select;
}

function card(order, handlers) {
  const node = document.createElement('article');
  node.className = 'card';

  const top = document.createElement('div');
  top.className = 'card-top';
  const name = document.createElement('h2');
  name.className = 'card-name';
  name.textContent = order.name || 'Без имени';
  const status = document.createElement('span');
  status.className = 'card-status';
  status.textContent = labelForStatus(order.status);
  top.append(name, status);
  node.append(top);

  const meta = metaLine(order);
  if (meta) {
    const metaNode = document.createElement('p');
    metaNode.className = 'card-meta';
    metaNode.textContent = meta;
    node.append(metaNode);
  }

  if (order.msg && order.msg !== '—') {
    const msg = document.createElement('p');
    msg.className = 'card-msg';
    msg.textContent = order.msg;
    node.append(msg);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  if (order.phone && order.phone !== '—') {
    actions.append(actionLink('Позвонить', `tel:${order.phone.replace(/\s/g, '')}`));
  }
  if (order.tg && order.tg !== '—') {
    const handle = order.tg.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
    actions.append(actionLink('Telegram', `https://t.me/${handle}`));
  }

  actions.append(statusSelect(order, handlers.onStatusChange));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button';
  remove.textContent = 'Удалить';
  remove.addEventListener('click', () => handlers.onDelete(order.id));
  actions.append(remove);

  node.append(actions);
  return node;
}

export function renderList(all, state, handlers) {
  el('subtitle').textContent = subtitleText(all);

  const container = el('list');
  container.replaceChildren();

  const visible = filterOrders(all, state);
  if (visible.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Заявок нет';
    container.append(empty);
    return;
  }

  for (const group of groupByDate(visible, new Date())) {
    const title = document.createElement('h3');
    title.className = 'group-title';
    title.textContent = group.title;
    container.append(title);
    for (const order of group.items) {
      container.append(card(order, handlers));
    }
  }
}

// Обновление потягиванием вниз. Кнопки «Обновить» нет: жест заменил её.
export function enablePullToRefresh(onRefresh) {
  const indicator = el('pull');
  const THRESHOLD = 70;      // сколько нужно протянуть, чтобы обновить
  const MAX_PULL = 110;      // дальше индикатор не растёт
  const SLOP = 8;            // на этом расстоянии решаем, куда ведут палец

  let startY = null;
  let startX = 0;
  let distance = 0;
  let axis = null;           // null — ещё не решили, 'y' — наш жест, 'x' — чужой
  let refreshing = false;

  const atTop = () => (window.scrollY || document.documentElement.scrollTop) === 0;

  function reset() {
    startY = null;
    distance = 0;
    axis = null;
    indicator.hidden = true;
    indicator.style.height = '';
  }

  document.addEventListener('touchstart', (event) => {
    // Лента статусов прокручивается вбок — там жест обновления не нужен.
    if (event.target.closest('#filters')) {
      startY = null;
      return;
    }
    if (refreshing || event.touches.length !== 1 || !atTop()) {
      startY = null;
      return;
    }
    startY = event.touches[0].clientY;
    startX = event.touches[0].clientX;
    distance = 0;
    axis = null;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (startY === null || axis === 'x') return;

    const dy = event.touches[0].clientY - startY;
    const dx = event.touches[0].clientX - startX;

    // Направление определяем один раз, по первому заметному движению.
    if (axis === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      if (axis === 'x') {
        indicator.hidden = true;
        return;
      }
    }

    distance = dy;
    if (distance <= 0) {
      indicator.hidden = true;
      return;
    }
    // Гасим родной отскок страницы, иначе жест конфликтует с прокруткой.
    event.preventDefault();
    indicator.hidden = false;
    indicator.textContent =
      distance >= THRESHOLD ? 'Отпустите для обновления' : 'Потяните вниз';
    indicator.style.height = `${Math.min(distance, MAX_PULL)}px`;
  }, { passive: false });

  document.addEventListener('touchend', async () => {
    if (startY === null) return;
    if (axis !== 'y' || distance < THRESHOLD) {
      reset();
      return;
    }
    refreshing = true;
    startY = null;
    indicator.textContent = 'Обновление…';
    indicator.style.height = `${THRESHOLD}px`;
    try {
      await onRefresh();
    } finally {
      refreshing = false;
      reset();
    }
  });
}
