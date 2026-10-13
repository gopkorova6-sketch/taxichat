import { useState } from "react";
import { apiGet, apiPost } from "./api";
import useSocket from "../hooks/useSocket";

const ROLE_LABELS = {
  passenger: "Пассажир",
  driver: "Водитель",
  dispatcher: "Диспетчер",
  region_admin: "Админ региона",
};

const STATUS_LABELS = {
  WAITLIST: "список ожидания",
  PENDING: "на проверке",
  ACTIVE: "активна",
  REJECTED: "отклонена",
  SUSPENDED: "приостановлена",
};

// Role management: current memberships, driver questionnaire and dispatcher
// application (concept 1.5)
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
      setNotice("Анкета водителя отправлена на проверку диспетчеру.");
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
      setNotice("Заявка на диспетчера подана. Её рассмотрит админ региона.");
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

      <div className="bg-secondary rounded p-3">
        <div className="font-semibold mb-1">
          Город: {city?.name ?? "—"} · статус: {city?.status ?? "—"}
        </div>
        <div className="text-sm text-secondary-text">
          Пассажиры могут создавать заказы в городах PILOT и ACTIVE.
        </div>
      </div>

      <div className="bg-secondary rounded p-3">
        <h3 className="font-semibold mb-2">Мои роли в этом городе</h3>
        {memberships.length === 0 && (
          <div className="text-sm text-secondary-text mb-2">Ролей пока нет</div>
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
            className="bg-accent text-black px-3 py-1 rounded text-sm mt-2"
            onClick={becomePassenger}
          >
            Стать пассажиром
          </button>
        )}
        {driverProfile && (
          <div className="text-sm text-secondary-text mt-2">
            Анкета: {driverProfile.carCaption}, {driverProfile.phone}
          </div>
        )}
      </div>

      {!memberships.some((membership) => membership.role === "driver") && (
        <form className="bg-secondary rounded p-3 space-y-2" onSubmit={submitDriver}>
          <h3 className="font-semibold">Анкета водителя</h3>
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Имя для пассажиров"
            required
            value={driverForm.displayName}
            onChange={(event) => setDriverForm({ ...driverForm, displayName: event.target.value })}
          />
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Телефон +7XXXXXXXXXX"
            required
            value={driverForm.phone}
            onChange={(event) => setDriverForm({ ...driverForm, phone: event.target.value })}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 bg-primary p-2 rounded text-sm"
              placeholder="Цвет"
              required
              value={driverForm.color}
              onChange={(event) => setDriverForm({ ...driverForm, color: event.target.value })}
            />
            <input
              className="w-28 bg-primary p-2 rounded text-sm"
              placeholder="Номер"
              required
              value={driverForm.plate}
              onChange={(event) => setDriverForm({ ...driverForm, plate: event.target.value })}
            />
            <input
              className="w-28 bg-primary p-2 rounded text-sm"
              placeholder="Марка"
              value={driverForm.brand}
              onChange={(event) => setDriverForm({ ...driverForm, brand: event.target.value })}
            />
          </div>
          <div className="text-sm">Рабочие зоны (1–5):</div>
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
          <button className="bg-accent text-black px-4 py-2 rounded text-sm w-full" type="submit">
            Отправить анкету
          </button>
        </form>
      )}

      {!memberships.some((membership) => membership.role === "dispatcher") && (
        <form className="bg-secondary rounded p-3 space-y-2" onSubmit={submitDispatcher}>
          <h3 className="font-semibold">Заявка на диспетчера</h3>
          <textarea
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Коротко о себе (необязательно)"
            value={dispatcherNote}
            onChange={(event) => setDispatcherNote(event.target.value)}
          />
          <button className="bg-accent text-black px-4 py-2 rounded text-sm w-full" type="submit">
            Подать заявку
          </button>
        </form>
      )}
    </div>
  );
};

export default RolesSection;
