import { useEffect, useState } from "react";

// Public read-only trip status page for /share/:token links (concept 1.10):
// route, status and car caption only — no exact addresses or phone numbers
const STATUS_LABELS = {
  PUBLISHED: "Ожидает водителя",
  ASSIGNED: "Водитель назначен",
  ARRIVING: "Водитель в пути к вам",
  WAITING: "Водитель на месте",
  IN_RIDE: "Идёт поездка",
  COMPLETED: "Поездка завершена",
  CANCELLED: "Поездка отменена",
  NO_SHOW: "Пассажир не вышел",
  EXPIRED: "Время заказа истекло",
  DISPUTE: "Открыт спор",
};

const ShareView = () => {
  const token = window.location.pathname.split("/").pop();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Ссылка не найдена");
        setTrip(body.data);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="bg-secondary text-primary-text rounded-lg p-6 w-full max-w-sm">
        <div className="font-bold uppercase tracking-wide mb-1">TaxiChat</div>
        <div className="text-xs text-secondary-text mb-4">
          Поездка близкого человека — только статус, без личных данных
        </div>

        {error && <div className="text-danger text-sm">{error}</div>}
        {!trip && !error && <div className="text-secondary-text text-sm">Загрузка...</div>}

        {trip && (
          <div className="space-y-2 text-sm">
            <div className="text-lg font-semibold">
              {STATUS_LABELS[trip.status] ?? trip.status}
            </div>
            <div>
              Маршрут: {trip.from ?? "—"} → {trip.to ?? "—"}
            </div>
            <div>Пассажиров: {trip.pax}</div>
            {trip.priceAgreed && <div>Договорённость о цене: {trip.priceAgreed}</div>}
            {trip.driver ? (
              <div>
                Водитель: {trip.driver.displayName} ({trip.driver.carCaption})
              </div>
            ) : (
              <div className="text-secondary-text">Водитель ещё не назначен</div>
            )}
            <div className="text-xs text-secondary-text">
              Обновлено: {new Date(trip.updatedAt).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShareView;
