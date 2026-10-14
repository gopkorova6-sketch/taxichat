// Shared Russian labels for order statuses (concept 1.6)
export const STATUS_LABELS = {
  DRAFT: "Запланирован (ждёт активации)",
  PUBLISHED: "Ожидает водителя",
  ASSIGNED: "Водитель назначен",
  ARRIVING: "Водитель выехал",
  WAITING: "Водитель на месте",
  IN_RIDE: "Идёт поездка",
  COMPLETED: "Завершён",
  EXPIRED: "Истёк",
  CANCELLED: "Отменён",
  NO_SHOW: "Неявка",
  DISPUTE: "Спор",
};

export const statusLabel = (status) => STATUS_LABELS[status] ?? status;

// Shared Russian labels for city statuses (concept 1.4)
export const CITY_STATUS_LABELS = {
  DORMANT: "Не запущен",
  WAITLIST: "Список ожидания",
  PILOT: "Активен",
  ACTIVE: "Полностью активен",
  SUSPENDED: "Приостановлен",
};

export const cityStatusLabel = (status) =>
  CITY_STATUS_LABELS[status] ?? status;
