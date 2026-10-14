import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import { apiGet, apiPost, apiDelete } from "./api";
import useSocket from "../hooks/useSocket";
import OrderChat from "./OrderChat";
import DirectChat from "./DirectChat";
import ChatList from "./ChatList";
import { statusBadge, formatWhen, defaultScheduledAt } from "./statusLabels";

// Passenger panel, mobile-first: the order composer sits at the BOTTOM of the
// screen like a messenger input; recent orders fill the scrollable area above.
const ACTIVE_STATUSES = ["DRAFT", "PUBLISHED", "ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE", "DISPUTE"];

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

  // Композер заказа: маршрут одной строкой, сейчас или на время
  const [route, setRoute] = useState("");
  const [notes, setNotes] = useState("");
  const [whenType, setWhenType] = useState("now");
  const [whenAt, setWhenAt] = useState(defaultScheduledAt());
  const [sending, setSending] = useState(false);

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
      if (orders.some((order) => order._id === payload.orderId)) {
        dispatch(
          notificationActions.addNotification({
            message: `Заказ: ${statusBadge(payload.status)}`,
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
    if (!route.trim() || sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await apiPost("/api/orders", {
        cityId,
        route: route.trim(),
        ...(notes.trim() && { notes: notes.trim() }),
        ...(whenType === "scheduled" && {
          whenType: "scheduled",
          whenAt: new Date(whenAt).toISOString(),
        }),
        ...(directTarget && {
          targetDriverId: directTarget.driverId,
          chatId: directTarget.chatId,
        }),
      });
      setDirectTarget(null);
      setRoute("");
      setNotes("");
      setWhenType("now");
      setWhenAt(defaultScheduledAt());
      setTab("orders");
      dispatch(
        notificationActions.addNotification({
          message:
            whenType === "scheduled"
              ? "Заказ на время создан и виден водителям"
              : "Заказ создан, ищем водителя",
          type: "success",
        })
      );
      setView({ type: "order", id: res.data.order._id });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
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
    <div key={driver.driverId} className="glass anim-rise rounded-2xl p-3 text-sm text-center">
      <div className="font-semibold text-center">{driver.displayName}</div>
      <div className="text-secondary-text">{driver.carCaption}</div>
      {driver.rating != null && <div>★ {driver.rating}</div>}
      {extra.children}
    </div>
  );

  const routeTitle = (order) =>
    order.to?.text ? `${order.from?.text} → ${order.to?.text}` : order.from?.text;

  const orderCard = (order) => (
    <button
      key={order._id}
      className="press anim-rise w-full text-center glass rounded-2xl p-4 text-[1.8rem]"
      onClick={() => setView({ type: "order", id: order._id })}
    >
      <div className="flex items-center gap-2 justify-center">
        <div className="order-card-title min-w-0 text-center">{routeTitle(order)}</div>
        {order.unreadCount > 0 && (
          <span className="ml-auto bg-danger text-white rounded-full px-2 text-xs shrink-0">
            {order.unreadCount}
          </span>
        )}
      </div>
      <div className="text-secondary-text">
        {statusBadge(order.status)} · {formatWhen(order.when)}
      </div>
    </button>
  );

  const activeOrders = orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
  const shownOrders = ordersFilter === "all" ? orders : activeOrders;

  return (
    <div className="flex flex-col h-full max-w-[42rem] mx-auto w-full">
      {/* Табы */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex gap-2 text-sm flex-wrap justify-center">
        {[
          ["new", "🚕 Заказ"],
          ["orders", "📋 Мои заказы"],
          ["drivers", "🧑‍✈️ Водители"],
          ["favorites", "⭐ Избранные"],
          ["dialogs", "💬 Диалоги"],
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

      {error && <div className="shrink-0 text-danger text-sm text-center px-4">{error}</div>}

      {/* Прокручиваемая область */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {tab === "new" && (
          <>
            {activeOrders.length > 0 ? (
              <>
                <div className="text-xs text-secondary-text text-center">Ваши активные заказы</div>
                {activeOrders.map(orderCard)}
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
                <div className="text-[3rem]">🚕</div>
                <div className="text-secondary-text text-sm">
                  Напишите маршрут ниже — водители города получат заказ
                </div>
              </div>
            )}
          </>
        )}

        {tab === "orders" && (
          <>
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
            {shownOrders.length === 0 && (
              <div className="text-secondary-text text-sm text-center">Заказов пока нет</div>
            )}
            {shownOrders.map(orderCard)}
          </>
        )}

        {tab === "drivers" && (
          <>
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
                      className="bg-success text-white px-3 py-2 rounded-xl press font-semibold flex-1"
                      onClick={() => callDriver(driver)}
                    >
                      Позвонить
                    </button>
                    <button
                      className="border border-secondary-text/40 px-3 py-2 rounded-lg"
                      onClick={() => toggleFavorite(driver)}
                    >
                      {driver.isFavorite ? "★ В избранных" : "☆ В избранные"}
                    </button>
                  </div>
                ),
              })
            )}
          </>
        )}

        {tab === "favorites" && (
          <>
            {favorites.length === 0 && (
              <div className="text-secondary-text text-sm text-center">Список пуст</div>
            )}
            {favorites.map((driver) =>
              driverCard(driver, {
                children: (
                  <button
                    className="bg-success text-white px-3 py-2 rounded-xl press font-semibold mt-2 w-full"
                    onClick={() => callDriver(driver)}
                  >
                    Позвонить
                  </button>
                ),
              })
            )}
          </>
        )}

        {tab === "dialogs" && (
          <ChatList onOpen={(chatId) => setView({ type: "direct", id: chatId })} />
        )}
      </div>

      {/* Нижний композер заказа */}
      {tab === "new" && (
        <form
          className="shrink-0 glass-strong rounded-t-3xl p-3 space-y-2.5 safe-area-bottom anim-sheet"
          onSubmit={submit}
        >
          {directTarget && (
            <div className="text-xs text-secondary-text text-center bg-primary rounded-lg p-2">
              Прямой заказ водителю {directTarget.driverName ?? directTarget.driverId}
            </div>
          )}

          <div className="relative flex p-1 rounded-2xl bg-[#0d0d0d]">
            {[
              ["now", "⚡ Сейчас"],
              ["scheduled", "🕓 На время"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`press relative z-10 flex-1 py-2 rounded-xl text-[1.3rem] transition-all duration-300 ${
                  whenType === key ? "btn-accent font-bold" : "text-secondary-text"
                }`}
                onClick={() => setWhenType(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {whenType === "scheduled" && (
            <input
              className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-2xl p-3 focus:border-accent focus:outline-none transition-colors text-[1.6rem] text-primary-text"
              type="datetime-local"
              required
              min={defaultScheduledAt()}
              value={whenAt}
              onChange={(event) => setWhenAt(event.target.value)}
            />
          )}

          <input
            className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-2xl p-3 focus:border-accent focus:outline-none transition-colors text-[1.6rem] text-primary-text"
            required
            autoFocus
            placeholder="Куда едем? Например: от ЖД до Центра"
            value={route}
            onChange={(event) => setRoute(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit(event);
            }}
          />

          <input
            className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-2xl p-2.5 focus:border-accent focus:outline-none transition-colors text-[1.5rem] text-primary-text"
            placeholder="Комментарий (необязательно)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          <button
            className={`press btn-accent font-display font-extrabold tracking-wide p-[1.3rem] rounded-2xl w-full text-[1.6rem] ${
              !route.trim() || sending ? "opacity-50" : "opacity-100 anim-pulse-ring"
            }`}
            type="submit"
            disabled={!route.trim() || sending}
          >
            {sending
              ? "Отправляем..."
              : whenType === "scheduled"
                ? "Заказать на время"
                : directTarget
                  ? "Оформить заказ водителю"
                  : "Заказать такси"}
          </button>
        </form>
      )}
    </div>
  );
};

export default PassengerPanel;
