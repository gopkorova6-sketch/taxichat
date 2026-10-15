import { useState } from "react";
import { apiGet, apiPost } from "./api";
import { cityStatusEmoji } from "./statusLabels";
import useSocket from "../hooks/useSocket";

const ROLE_LABELS = {
  passenger: "🧍 Пассажир",
  driver: "🚕 Водитель",
  dispatcher: "🎧 Диспетчер",
  region_admin: "🗺️ Админ региона",
};

const STATUS_LABELS = {
  WAITLIST: "⏳ в очереди",
  PENDING: "🕓 на проверке",
  ACTIVE: "✅ работает",
  REJECTED: "❌ отклонено",
  SUSPENDED: "⛔ приостановлено",
};

// "Кабинет": the taxi profile — who the user is in the city, how to become a
// driver or a dispatcher (concept 1.5)
const RolesSection = ({ me, cityId, cities, refreshMe }) => {
  const { socketEmit } = useSocket();
  const [zones, setZones] = useState([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [driverForm, setDriverForm] = useState({
    displayName: "",
    phone: "",
    color: "",
    plate: "",
    brand: "",
    zones: [],
  });
  const [dispatcherNote, setDispatcherNote] = useState("");

  const city = cities.find((item) => String(item._id) === String(cityId));
  const memberships = (me?.memberships ?? []).filter(
    (membership) => String(membership.cityId?._id) === String(cityId)
  );
  const driverProfile = me?.driverProfiles?.[0];

  const loadZones = async () => {
    try {
      const res = await apiGet(`/api/geo/cities/${cityId}/zones`);
      setZones(res.data.zones);
      setZonesLoaded(true);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!zonesLoaded && zones.length === 0) {
    loadZones();
  }

  const becomePassenger = async () => {
    try {
      await apiPost("/api/memberships", { cityId, role: "passenger" });
      setNotice("Вы записаны пассажиром. Статус зависит от города.");
      await refreshMe();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitDriver = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/memberships", {
        cityId,
        role: "driver",
        displayName: driverForm.displayName,
        phone: driverForm.phone,
        car: {
          color: driverForm.color,
          plate: driverForm.plate,
          ...(driverForm.brand && { brand: driverForm.brand }),
        },
        zones: driverForm.zones,
      });
      setNotice("📨 Анкета отправлена. Диспетчер проверит её и даст ответ.");
      await refreshMe();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitDispatcher = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/applications", {
        cityId,
        type: "dispatcher",
        ...(dispatcherNote && { note: dispatcherNote }),
      });
      setNotice("📨 Заявка отправлена. Её рассмотрит админ региона.");
      setDispatcherNote("");
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleZone = (zoneId) => {
    setDriverForm((prev) => ({
      ...prev,
      zones: prev.zones.includes(zoneId)
        ? prev.zones.filter((id) => id !== zoneId)
        : [...prev.zones, zoneId],
    }));
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full max-w-lg">
      {error && <div className="text-danger text-sm">{error}</div>}
      {notice && <div className="text-success text-sm">{notice}</div>}

      <div className="glass rounded-2xl p-3">
        <div className="font-semibold mb-1 text-center">
          📍 {city?.name ?? "—"} {cityStatusEmoji(city?.status)}
        </div>
        <div className="text-sm text-secondary-text">
          Заказать такси можно в городах со статусом ✅ или 🟢.
        </div>
      </div>

      <div className="glass rounded-2xl p-3">
        <h3 className="font-display font-bold mb-2 text-center tracking-wide">🪪 Мой кабинет</h3>
        {memberships.length === 0 && (
          <div className="text-sm text-secondary-text mb-2">Пока вы не в такси этого города</div>
        )}
        {memberships.map((membership) => (
          <div key={membership._id} className="text-sm py-1">
            {ROLE_LABELS[membership.role]} — {STATUS_LABELS[membership.status]}
            {membership.status === "REJECTED" && membership.reason
              ? ` (${membership.reason})`
              : ""}
          </div>
        ))}
        {!memberships.some((membership) => membership.role === "passenger") && (
          <button
            className="btn-accent press px-3 py-1 rounded-xl text-sm font-semibold mt-2"
            onClick={becomePassenger}
          >
            🧍 Заказывать такси
          </button>
        )}
        {driverProfile && (
          <div className="text-sm text-secondary-text mt-2">
            🚗 {driverProfile.carCaption} · 📞 {driverProfile.phone}
          </div>
        )}
      </div>

      {!memberships.some((membership) => membership.role === "driver") && (
        <form className="glass rounded-2xl p-3 space-y-2" onSubmit={submitDriver}>
          <h3 className="font-display font-bold text-center tracking-wide">🚕 Стать водителем</h3>
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="👤 Имя для пассажиров"
            required
            value={driverForm.displayName}
            onChange={(event) => setDriverForm({ ...driverForm, displayName: event.target.value })}
          />
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="📞 Телефон +7XXXXXXXXXX"
            required
            value={driverForm.phone}
            onChange={(event) => setDriverForm({ ...driverForm, phone: event.target.value })}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 bg-primary p-2 rounded text-sm"
              placeholder="🎨 Цвет"
              required
              value={driverForm.color}
              onChange={(event) => setDriverForm({ ...driverForm, color: event.target.value })}
            />
            <input
              className="w-28 bg-primary p-2 rounded text-sm"
              placeholder="🔢 Номер"
              required
              value={driverForm.plate}
              onChange={(event) => setDriverForm({ ...driverForm, plate: event.target.value })}
            />
            <input
              className="w-28 bg-primary p-2 rounded text-sm"
              placeholder="🚗 Марка"
              value={driverForm.brand}
              onChange={(event) => setDriverForm({ ...driverForm, brand: event.target.value })}
            />
          </div>
          
          <div className="flex flex-wrap gap-1">
            {zones.map((zone) => (
              <button
                type="button"
                key={zone._id}
                className={`px-2 py-1 rounded text-xs ${
                  driverForm.zones.includes(zone._id) ? "bg-accent text-black" : "bg-primary"
                }`}
                onClick={() => toggleZone(zone._id)}
              >
                {zone.name}
              </button>
            ))}
          </div>
          <button className="btn-accent press px-4 py-2.5 rounded-2xl text-sm font-bold w-full" type="submit">
            📨 Отправить анкету
          </button>
        </form>
      )}

      {!memberships.some((membership) => membership.role === "dispatcher") && (
        <form className="glass rounded-2xl p-3 space-y-2" onSubmit={submitDispatcher}>
          <h3 className="font-display font-bold text-center tracking-wide">🎧 Стать диспетчером</h3>
          <textarea
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="💬 Коротко о себе (необязательно)"
            value={dispatcherNote}
            onChange={(event) => setDispatcherNote(event.target.value)}
          />
          <button className="btn-accent press px-4 py-2.5 rounded-2xl text-sm font-bold w-full" type="submit">
            📨 Подать заявку
          </button>
        </form>
      )}
    </div>
  );
};

export default RolesSection;

