import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import { apiGet, apiPost, apiDelete } from "./api";
import useSocket from "../hooks/useSocket";
import OrderChat from "./OrderChat";
import DirectChat from "./DirectChat";
import ChatList from "./ChatList";
import { statusLabel } from "./statusLabels";

// Passenger panel: one-line order form, my orders, free drivers with direct
// calls (mobile-first)
const PassengerPanel = ({ me, cityId, refreshMe, startCall }) => {
  const dispatch = useDispatch();
  const { socketListen, socket } = useSocket();
  const [view, setView] = useState(null); // { type: "order" | "direct", id }
  const [orders, setOrders] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState("active");
  const [drivers, setDrivers] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [tab, setTab] = useState("new");
  const [error, setError] = useState(null);
  const [directTarget, setDirectTarget] = useState(null);

  const [route, setRoute] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    try {
      const ordersRes = await apiGet(`/api/orders?cityId=${cityId}`);
      setOrders(ordersRes.data.orders);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const res = await apiPost("/api/orders", {
        cityId,
        route,
        ...(notes && { notes }),
        ...(directTarget && {
          targetDriverId: directTarget.driverId,
          chatId: directTarget.chatId,
        }),
      });
      setDirectTarget(null);
      setRoute("");
      setNotes("");
      setTab("orders");
      setView({ type: "order", id: res.data.order._id });
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
    <div key={driver.driverId} className="bg-secondary rounded-xl p-3 text-sm">
      <div className="font-semibold">{driver.displayName}</div>
      <div className="text-secondary-text">{driver.carCaption}</div>
      {driver.rating != null && <div>★ {driver.rating}</div>}
      {extra.children}
    </div>
  );

  const routeTitle = (order) =>
    order.to?.text ? `${order.from?.text} → ${order.to?.text}` : order.from?.text;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full max-w-[42rem] mx-auto w-full">
      <div className="flex gap-2 text-sm flex-wrap justify-center">
        {[
          ["new", "Заказ"],
          ["orders", "Мои заказы"],
          ["drivers", "Водители"],
          ["favorites", "Избранные"],
          ["dialogs", "Диалоги"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`px-3 py-1.5 rounded-full ${
              tab === key ? "bg-accent text-black font-semibold" : "bg-secondary text-secondary-text"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="text-danger text-sm text-center">{error}</div>}

      {tab === "new" && (
        <form
          className="space-y-3 bg-secondary p-4 rounded-2xl"
          onSubmit={submit}
        >
          {directTarget && (
            <div className="text-xs text-secondary-text text-center bg-primary rounded-lg p-2">
              Прямой заказ водителю {directTarget.driverName ?? directTarget.driverId}
            </div>
          )}
          <label className="block text-sm text-secondary-text">Куда едем?</label>
          <textarea
            className="w-full bg-primary border border-secondary-text/40 rounded-xl p-3 text-[1.6rem] text-primary-text resize-none"
            rows={2}
            required
            autoFocus
            placeholder="Например: от ЖД вокзала до Центра"
            value={route}
            onChange={(event) => setRoute(event.target.value)}
          />
          <textarea
            className="w-full bg-primary border border-secondary-text/40 rounded-xl p-3 text-[1.5rem] text-primary-text resize-none"
            rows={2}
            placeholder="Комментарий (необязательно)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <button
            className="bg-accent text-black font-semibold p-[1.2rem] rounded-xl w-full"
            type="submit"
            disabled={!route.trim()}
          >
            {directTarget ? "Оформить заказ водителю" : "Заказать такси"}
          </button>
        </form>
      )}

      {tab === "orders" && (
        <div className="space-y-2">
          <div className="flex gap-2 text-sm justify-center">
            {[
              ["active", "Активные"],
              ["all", "Все"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`px-3 py-1.5 rounded-full ${
                  ordersFilter === key
                    ? "bg-accent text-black font-semibold"
                    : "bg-secondary text-secondary-text"
                }`}
                onClick={() => setOrdersFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {orders.filter((order) => ordersFilter === "all" ||
            !["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"].includes(order.status)).length === 0 && (
            <div className="text-secondary-text text-sm text-center">Заказов пока нет</div>
          )}
          {orders
            .filter((order) => ordersFilter === "all" ||
              !["COMPLETED", "CANCELLED", "NO_SHOW", "EXPIRED"].includes(order.status))
            .map((order) => (
            <button
              key={order._id}
              className="w-full text-left bg-secondary rounded-xl p-3 text-sm"
              onClick={() => setView({ type: "order", id: order._id })}
            >
              <div className="flex items-center gap-2">
                <div className="font-semibold">{routeTitle(order)}</div>
                {order.unreadCount > 0 && (
                  <span className="ml-auto bg-danger text-white rounded-full px-2 text-xs">
                    {order.unreadCount}
                  </span>
                )}
              </div>
              <div className="text-secondary-text">{statusLabel(order.status)}</div>
            </button>
          ))}
        </div>
      )}

      {tab === "drivers" && (
        <div className="space-y-2 max-w-[42rem]">
          {drivers.length === 0 && (
            <div className="text-secondary-text text-sm text-center">
              Сейчас все водители заняты или не на линии
            </div>
          )}
          {drivers.map((driver) =>
            driverCard(driver, {
              children: (
                <div className="flex gap-2 mt-2">
                  <button
                    className="bg-success text-white px-3 py-1.5 rounded-lg flex-1"
                    onClick={() => callDriver(driver)}
                  >
                    Позвонить
                  </button>
                  <button
                    className="border border-secondary-text/40 px-3 py-1.5 rounded-lg"
                    onClick={() => toggleFavorite(driver)}
                  >
                    {driver.isFavorite ? "★ В избранных" : "☆ В избранные"}
                  </button>
                </div>
              ),
            })
          )}
        </div>
      )}

      {tab === "favorites" && (
        <div className="space-y-2 max-w-[42rem]">
          {favorites.length === 0 && (
            <div className="text-secondary-text text-sm text-center">Список пуст</div>
          )}
          {favorites.map((driver) =>
            driverCard(driver, {
              children: (
                <button
                  className="bg-success text-white px-3 py-1.5 rounded-lg mt-2 w-full"
                  onClick={() => callDriver(driver)}
                >
                  Позвонить
                </button>
              ),
            })
          )}
        </div>
      )}

      {tab === "dialogs" && (
        <ChatList onOpen={(chatId) => setView({ type: "direct", id: chatId })} />
      )}
    </div>
  );
};

export default PassengerPanel;
