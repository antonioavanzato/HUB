// Рендер из состояния в DOM. Сети здесь нет: действия уходят в обработчики.
import { STATUSES, labelForStatus } from './status.js';
import {
  filterOrders,
  groupByDate,
  countsByStatus,
  subtitleText,
  activeOrders,
  archivedOrders,
} from './store.js';

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

// Иконки фильтров — статические SVG, соответствуют SF Symbols из приложения.
const ICONS = {
  all: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  new: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  contacted: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  booked: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
};

function iconNode(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  // Разметка здесь постоянная, пользовательских данных в ней нет.
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

// Кнопка фильтра. Как в приложении: у невыбранной видны иконка и счётчик,
// подпись раскрывается только у активной — поэтому все пять умещаются в строку.
function filterButton({ label, icon, count, isSelected, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter';
  button.setAttribute('aria-pressed', String(isSelected));
  button.setAttribute('aria-label', label);
  button.append(iconNode(icon));

  if (isSelected) {
    const text = document.createElement('span');
    text.className = 'filter-label';
    text.textContent = label;
    button.append(text);
  }

  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'filter-count';
    badge.textContent = String(count);
    button.append(badge);
  }

  button.addEventListener('click', onClick);
  return button;
}

// Подпись активного фильтра ужимается по размеру, а не обрезается многоточием.
// Повторяет minimumScaleFactor(0.75) из BookingRequestsScreen.swift.
function fitFilterLabel(label) {
  const BASE = 13;
  const MIN = Math.round(BASE * 0.75); // 10 px
  label.style.fontSize = `${BASE}px`;
  for (let size = BASE; size > MIN && label.scrollWidth > label.clientWidth; size -= 1) {
    label.style.fontSize = `${size - 1}px`;
  }
}

const FILTER_ICONS = { new: 'new', contacted: 'contacted', booked: 'booked' };

export function renderFilters(all, state, onSelect) {
  const container = el('filters');
  container.replaceChildren();
  const counts = countsByStatus(all);

  container.append(
    filterButton({
      label: 'Все',
      icon: 'all',
      count: activeOrders(all).length,
      isSelected: !state.archive && state.statusId === null,
      onClick: () => onSelect({ archive: false, statusId: null }),
    })
  );

  // В фильтрах только рабочие статусы: завершённые и отказы живут в архиве.
  for (const status of STATUSES) {
    if (status.id === 'completed' || status.id === 'cancelled') continue;
    const isSelected = !state.archive && state.statusId === status.id;
    container.append(
      filterButton({
        label: status.label,
        icon: FILTER_ICONS[status.id],
        count: counts[status.id] || 0,
        isSelected,
        // Повторное нажатие снимает фильтр — как в приложении.
        onClick: () =>
          onSelect({ archive: false, statusId: isSelected ? null : status.id }),
      })
    );
  }

  container.append(
    filterButton({
      label: 'Архив',
      icon: 'archive',
      count: archivedOrders(all).length,
      isSelected: state.archive,
      onClick: () => onSelect({ archive: !state.archive, statusId: null }),
    })
  );

  // Размеры доступны только после вставки в документ.
  const activeLabel = container.querySelector('.filter[aria-pressed="true"] .filter-label');
  if (activeLabel) fitFilterLabel(activeLabel);
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
