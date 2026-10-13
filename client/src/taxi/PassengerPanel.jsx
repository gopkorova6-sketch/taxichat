import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import { apiGet, apiPost, apiDelete } from "./api";
import useSocket from "../hooks/useSocket";
import OrderChat from "./OrderChat";
import DirectChat from "./DirectChat";
import ChatList from "./ChatList";
import { statusLabel } from "./statusLabels";
// Passenger panel: order form, my orders, free drivers with direct calls
const PassengerPanel = ({ me, cityId, refreshMe, startCall }) => {
  const dispatch = useDispatch();
  const { socketListen, socket } = useSocket();
  const [view, setView] = useState(null); // { type: "order" | "direct", id }
  const [orders, setOrders] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState("active");
  const [zones, setZones] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [tab, setTab] = useState("new");
  const [error, setError] = useState(null);
  const [directTarget, setDirectTarget] = useState(null);

  const [form, setForm] = useState({
    fromZoneId: "",
    toZoneId: "",
    fromText: "",
    toText: "",
    exactFrom: "",
    exactTo: "",
    pax: 1,
    notes: "",
    whenType: "now",
  });

  // Landmark autocomplete: "от ЖД" resolves via the server text index
  const [suggestFor, setSuggestFor] = useState(null); // "from" | "to"
  const [suggestions, setSuggestions] = useState([]);
  const suggestTimerRef = useRef();

  const queryLandmarks = (value, field) => {
    setForm((prev) => ({ ...prev, [`${field}Text`]: value, [`${field}LandmarkId`]: undefined }));
    setSuggestFor(field);
    clearTimeout(suggestTimerRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiGet(
          `/api/geo/cities/${cityId}/landmarks?query=${encodeURIComponent(value)}`
        );
        setSuggestions(res.data.landmarks);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const pickLandmark = (field, landmark) => {
    setForm((prev) => ({
      ...prev,
      [`${field}Text`]: landmark.name,
      [`${field}LandmarkId`]: landmark._id,
    }));
    setSuggestions([]);
    setSuggestFor(null);
  };

  const load = async () => {
    try {
      const [ordersRes, zonesRes] = await Promise.all([
        apiGet(`/api/orders?cityId=${cityId}`),
        apiGet(`/api/geo/cities/${cityId}/zones`),
      ]);
      setOrders(ordersRes.data.orders);
      setZones(zonesRes.data.zones);
      const driversRes = await apiGet(`/api/cities/${cityId}/free-drivers`);
      setDrivers(driversRes.data.drivers);
      const favoritesRes = await apiGet("/api/favorites");
      setFavorites(favoritesRes.data.favorites);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    const onStatusChanged = (payload) => {
      // Toast for own orders even when the chat is closed
      if (orders.some((order) => order._id === payload.orderId)) {
        dispatch(
          notificationActions.addNotification({
            message: `Заказ: ${statusLabel(payload.status)}`,
            type: payload.status === "DISPUTE" ? "error" : "info",
          })
        );
      }
      load();
    };
    const onMembershipUpdated = () => refreshMe();
    socketListen("order:status", onStatusChanged);
    socketListen("membership:updated", onMembershipUpdated);
    return () => {
      socket.off("order:status", onStatusChanged);
      socket.off("membership:updated", onMembershipUpdated);
    };
  }, [cityId]);

  if (view?.type === "order") {
    return <OrderChat orderId={view.id} me={me} onBack={() => setView(null)} startCall={startCall} />;
  }
  if (view?.type === "direct") {
    return <DirectChat chatId={view.id} me={me} onBack={() => setView(null)} />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const body = {
        cityId,
        fromZoneId: form.fromZoneId,
        fromText: form.fromText,
        toText: form.toText,
        pax: Number(form.pax),
        whenType: form.whenType,
      };
      if (form.toZoneId) body.toZoneId = form.toZoneId;
      if (form.fromLandmarkId) body.fromLandmarkId = form.fromLandmarkId;
      if (form.toLandmarkId) body.toLandmarkId = form.toLandmarkId;
      if (form.exactFrom) body.exactFrom = form.exactFrom;
      if (form.exactTo) body.exactTo = form.exactTo;
      if (form.notes) body.notes = form.notes;
      if (form.whenType === "scheduled") {
        body.whenAt = new Date(form.whenAt ?? Date.now() + 3600000).toISOString();
      }
      if (directTarget) {
        body.targetDriverId = directTarget.driverId;
        body.chatId = directTarget.chatId;
      }

      const res = await apiPost("/api/orders", body);
      setDirectTarget(null);
      setView(res.data.order._id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const callDriver = async (driver) => {
    startCall({
      kind: "direct",
      target: String(driver.driverId),
      cityId,
      name: driver.displayName,
      onAck: ({ chatId }) =>
        setDirectTarget({
          driverId: String(driver.driverId),
          driverName: driver.displayName,
          chatId,
        }),
    });
  };

  const toggleFavorite = async (driver) => {
    try {
      if (driver.isFavorite) {
        await apiDelete(`/api/favorites/${driver.driverId}`);
      } else {
        await apiPost("/api/favorites", { driverId: driver.driverId });
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const driverCard = (driver, extra = {}) => (
    <div key={driver.driverId} className="bg-secondary rounded p-3 text-sm">
      <div className="font-semibold">{driver.displayName}</div>
      <div className="text-secondary-text">{driver.carCaption}</div>
      {driver.rating != null && <div>★ {driver.rating}</div>}
      {extra.children}
    </div>
  );

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex gap-3 text-sm flex-wrap">
        {[
          ["new", directTarget ? `Заказ ${directTarget.driverName ?? ""}` : "Новый заказ"],
          ["orders", "Мои заказы"],
          ["drivers", "Свободные водители"],
          ["favorites", "Избранные"],
          ["dialogs", "Диалоги"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`px-2 py-1 rounded ${tab === key ? "bg-accent text-white" : "bg-secondary"}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="text-danger text-sm">{error}</div>}

      {tab === "new" && (
        <form className="space-y-2 max-w-md bg-secondary p-4 rounded" onSubmit={submit}>
          <select
            className="w-full bg-primary p-2 rounded text-sm"
            required
            value={form.fromZoneId}
            onChange={(event) => setForm({ ...form, fromZoneId: event.target.value })}
          >
            <option value="">Зона отправления</option>
            {zones.map((zone) => (
              <option key={zone._id} value={zone._id}>{zone.name}</option>
            ))}
          </select>
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Откуда (текст или ориентир)"
            required
            value={form.fromText}
            onChange={(event) => queryLandmarks(event.target.value, "from")}
          />
          {suggestFor === "from" && suggestions.length > 0 && (
            <div className="border border-secondary-text/30 rounded text-sm divide-y">
              {suggestions.map((landmark) => (
                <button
                  type="button"
                  key={landmark._id}
                  className="w-full text-left px-2 py-1 hover:bg-secondary"
                  onClick={() => pickLandmark("from", landmark)}
                >
                  📍 {landmark.name}
                </button>
              ))}
            </div>
          )}
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Точный адрес (виден водителю после назначения)"
            value={form.exactFrom}
            onChange={(event) => setForm({ ...form, exactFrom: event.target.value })}
          />
          <select
            className="w-full bg-primary p-2 rounded text-sm"
            value={form.toZoneId}
            onChange={(event) => setForm({ ...form, toZoneId: event.target.value })}
          >
            <option value="">Зона назначения</option>
            {zones.map((zone) => (
              <option key={zone._id} value={zone._id}>{zone.name}</option>
            ))}
          </select>
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Куда (текст или ориентир)"
            required
            value={form.toText}
            onChange={(event) => queryLandmarks(event.target.value, "to")}
          />
          {suggestFor === "to" && suggestions.length > 0 && (
            <div className="border border-secondary-text/30 rounded text-sm divide-y">
              {suggestions.map((landmark) => (
                <button
                  type="button"
                  key={landmark._id}
                  className="w-full text-left px-2 py-1 hover:bg-secondary"
                  onClick={() => pickLandmark("to", landmark)}
                >
                  📍 {landmark.name}
                </button>
              ))}
            </div>
          )}
          <input
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Точный адрес назначения"
            value={form.exactTo}
            onChange={(event) => setForm({ ...form, exactTo: event.target.value })}
          />
          <div className="flex gap-2">
            <input
              className="w-24 bg-primary p-2 rounded text-sm"
              type="number"
              min="1"
              max="8"
              value={form.pax}
              onChange={(event) => setForm({ ...form, pax: event.target.value })}
            />
            <select
              className="flex-1 bg-primary p-2 rounded text-sm"
              value={form.whenType}
              onChange={(event) => setForm({ ...form, whenType: event.target.value })}
            >
              <option value="now">Сейчас</option>
              <option value="scheduled">К определённому времени</option>
            </select>
          </div>
          {form.whenType === "scheduled" && (
            <input
              className="w-full bg-primary p-2 rounded text-sm"
              type="datetime-local"
              onChange={(event) => setForm({ ...form, whenAt: event.target.value })}
            />
          )}
          <textarea
            className="w-full bg-primary p-2 rounded text-sm"
            placeholder="Комментарий"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
          {directTarget && (
            <div className="text-xs text-secondary-text">
              Прямой заказ водителю {directTarget.driverName ?? directTarget.driverId}
            </div>
          )}
          <button className="bg-accent text-white px-4 py-2 rounded w-full" type="submit">
            {directTarget ? "Оформить заказ водителю" : "Опубликовать заказ"}
          </button>
        </form>
      )}

      {tab === "orders" && (
        <div className="space-y-2">
          <div className="flex gap-2 text-sm">
            {[
              ["active", "Активные"],
              ["all", "Все"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`px-2 py-1 rounded ${ordersFilter === key ? "bg-accent text-white" : "bg-secondary"}`}
                onClick={() => setOrdersFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {orders.filter((order) => ordersFilter === "all" ||
            !["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"].includes(order.status)).length === 0 && (
            <div className="text-secondary-text text-sm">Заказов пока нет</div>
          )}
          {orders
            .filter((order) => ordersFilter === "all" ||
              !["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"].includes(order.status))
            .map((order) => (
            <button
              key={order._id}
              className="w-full text-left bg-secondary rounded p-3 text-sm"
              onClick={() => setView({ type: "order", id: order._id })}
            >
              <div className="flex items-center gap-2">
                <div className="font-semibold">{order.from?.text} → {order.to?.text}</div>
                {order.unreadCount > 0 && (
                  <span className="ml-auto bg-danger text-white rounded-full px-2 text-xs">
                    {order.unreadCount}
                  </span>
                )}
              </div>
              <div className="text-secondary-text">{statusLabel(order.status)} · {order.pax} пасс.</div>
            </button>
          ))}
        </div>
      )}

      {tab === "drivers" && (
        <div className="space-y-2 max-w-md">
          {drivers.length === 0 && (
            <div className="text-secondary-text text-sm">Сейчас все водители заняты или не на линии</div>
          )}
          {drivers.map((driver) =>
            driverCard(driver, {
              children: (
                <div className="flex gap-2 mt-2">
                  <button
                    className="bg-success text-white px-3 py-1 rounded"
                    onClick={() => callDriver(driver)}
                  >
                    Позвонить
                  </button>
                  <button className="underline" onClick={() => toggleFavorite(driver)}>
                    {driver.isFavorite ? "Убрать из избранных" : "В избранные"}
                  </button>
                </div>
              ),
            })
          )}
        </div>
      )}

      {tab === "favorites" && (
        <div className="space-y-2 max-w-md">
          {favorites.length === 0 && <div className="text-secondary-text text-sm">Список пуст</div>}
          {favorites.map((driver) =>
            driverCard(driver, {
              children: (
                <button
                  className="bg-success text-white px-3 py-1 rounded mt-2"
                  onClick={() => callDriver(driver)}
                >
                  Позвонить
                </button>
              ),
            })
          )}
        </div>
      )}
      {tab === "dialogs" && <ChatList onOpen={(chatId) => setView({ type: "direct", id: chatId })} />}
    </div>
  );
};

export default PassengerPanel;
