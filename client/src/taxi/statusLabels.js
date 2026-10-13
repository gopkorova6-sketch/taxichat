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
