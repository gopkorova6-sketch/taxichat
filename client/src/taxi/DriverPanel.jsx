import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import { apiGet, apiPost, apiPatch } from "./api";
import useSocket from "../hooks/useSocket";
import OrderChat from "./OrderChat";
import DirectChat from "./DirectChat";
import ChatList from "./ChatList";
import { statusBadge, formatWhen } from "./statusLabels";

// Driver panel: shift toggle, live feed of published orders, assigned orders
const DriverPanel = ({ me, cityId, driverProfile, refreshMe, startCall }) => {
  const dispatch = useDispatch();
  const { socketListen, socketEmit, socket } = useSocket();
  const [view, setView] = useState(null); // { type, id }
  const [orders, setOrders] = useState([]);
  const [online, setOnline] = useState(driverProfile?.shift === "online");
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const res = await apiGet(`/api/orders?cityId=${cityId}`);
      setOrders(res.data.orders);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    const onNew = () => {
      dispatch(
        notificationActions.addNotification({
          message: "Новый заказ в ленте",
          type: "info",
        })
      );
      load();
    };
    const onTaken = () => {
      dispatch(
        notificationActions.addNotification({
          message: "Один из заказов уже взят",
          type: "info",
        })
      );
      load();
    };
    const onChanged = () => load();
    socketListen("order:new", onNew);
    socketListen("order:taken", onTaken);
    socketListen("order:status", onChanged);
    socketListen("driver:presence", onChanged);
    return () => {
      socket.off("order:new", onNew);
      socket.off("order:taken", onTaken);
      socket.off("order:status", onChanged);
      socket.off("driver:presence", onChanged);
    };
  }, [cityId]);

  // 90 seconds of silence takes the driver offline (concept 1.8)
  useEffect(() => {
    if (!online) return undefined;
    const beat = () => socketEmit("driver:heartbeat");
    beat();
    const timer = setInterval(beat, 30 * 1000);
    return () => clearInterval(timer);
  }, [online]);

  const toggleShift = async () => {
    const next = online ? "offline" : "online";
    socketEmit("driver:shift", { shift: next });
    setOnline(!online);
    await refreshMe();
  };

  // Sync the shift toggle with the server state (busy while assigned)
  useEffect(() => {
    if (driverProfile) setOnline(driverProfile.shift !== "offline");
  }, [driverProfile?.shift]);

  if (view?.type === "order") {
    return <OrderChat orderId={view.id} me={me} onBack={() => setView(null)} startCall={startCall} />;
  }
  if (view?.type === "direct") {
    return <DirectChat chatId={view.id} me={me} onBack={() => setView(null)} />;
  }

  const accept = async (order) => {
    try {
      await apiPost(`/api/orders/${order._id}/accept`, {});
      dispatch(
        notificationActions.addNotification({
          message: "Заказ принят — открываю чат",
          type: "success",
        })
      );
      setView({ type: "order", id: order._id });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const book = async (order) => {
    try {
      await apiPost(`/api/orders/${order._id}/book`, {});
      dispatch(
        notificationActions.addNotification({
          message: "Заказ забронирован. Вы остаётесь свободны до времени поездки",
          type: "success",
        })
      );
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const activateBooking = async (order) => {
    try {
      await apiPost(`/api/orders/${order._id}/activate`, {});
      dispatch(
        notificationActions.addNotification({
          message: "Бронь активирована — вы назначены на заказ",
          type: "success",
        })
      );
      setView({ type: "order", id: order._id });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const sendOffer = async (order) => {
    try {
      const priceText = window.prompt("Цена поездки:");
      if (!priceText) return;
      const etaMin = parseInt(window.prompt("Время подачи, минут:") ?? "10", 10);
      await apiPost(`/api/orders/${order._id}/offers`, { priceText, etaMin });
      dispatch(
        notificationActions.addNotification({
          message: "Отклик отправлен пассажиру",
          type: "info",
        })
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const myAction = async (order, action) => {
    try {
      await apiPost(`/api/orders/${order._id}/action`, { action });
      const labels = {
        arrive: "Отмечено: выехал",
        wait: "Отмечено: на месте",
        start: "Поездка началась",
        finish: "Поездка завершена ✅",
        no_show: "Отмечена неявка пассажира",
        undo_start: "Начало поездки отменено",
      };
      dispatch(
        notificationActions.addNotification({
          message: labels[action] ?? "Готово",
          type: "success",
        })
      );
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const feed = orders.filter(
    (order) =>
      order.status === "PUBLISHED" &&
      (order.isTarget || order.mode !== "direct")
  );
  const mine = orders.filter(
    (order) => !["PUBLISHED", "DRAFT"].includes(order.status)
  );

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full max-w-[42rem] mx-auto w-full anim-rise">
      <div className="flex items-center gap-3">
        <button
          className={`press px-6 py-3 rounded-2xl text-white font-display font-bold tracking-wide ${online ? "bg-success shadow-[0_0_24px_rgba(46,160,67,0.45)]" : "bg-danger"}`}
          onClick={toggleShift}
        >
          {online ? "На линии" : "Не на линии"}
        </button>
        {driverProfile && (
          <div className="text-sm text-secondary-text">
            {driverProfile.carCaption}
            {driverProfile.rating != null && ` · ★ ${driverProfile.rating}`}
          </div>
        )}
      </div>

      {error && <div className="text-danger text-sm">{error}</div>}

      {!online && (
        <div className="text-sm text-secondary-text">
          😴 Выйдите на линию, чтобы получать заказы
        </div>
      )}

      <div>
        <h3 className="font-display font-bold mb-2 text-center tracking-wide">📢 Лента заказов</h3>
          <div className="space-y-2">
          {feed.length === 0 && <div className="text-sm text-secondary-text">📭 Пока нет заказов</div>}
          {feed.map((order) => (
            <div key={order._id} className="anim-rise glass rounded-2xl p-4 text-[1.8rem] text-center">
                <div className="font-semibold text-center">
                  {order.to?.text ? `${order.from?.text} → ${order.to?.text}` : order.from?.text}
                </div>
              <div className="text-secondary-text text-center">
                {formatWhen(order.when)} · {order.pax} пасс.
                {order.notes ? ` · ${order.notes}` : ""}
              </div>
              <div className="flex gap-2 mt-2 justify-center flex-wrap">
                {order.isTarget || order.matchMode === "first_take" ? (
                  <button className="bg-success text-white px-3 py-1.5 rounded-lg" onClick={() => accept(order)}>
                    Принять
                  </button>
                ) : (
                  <button className="btn-accent press px-3 py-1.5 rounded-xl font-semibold" onClick={() => sendOffer(order)}>
                    Прислать отклик
                  </button>
                )}
                {order.when?.type === "scheduled" && (
                  <button
                    className="border border-accent text-cta-icon px-3 py-1.5 rounded-lg"
                    onClick={() => book(order)}
                  >
                    🔖 Забронировать
                  </button>
                )}
                <button className="underline" onClick={() => setView({ type: "order", id: order._id })}>Чат</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display font-bold mb-2 text-center tracking-wide">📋 Мои заказы</h3>
          <div className="space-y-2">
          {mine.length === 0 && <div className="text-sm text-secondary-text">📭 Нет активных заказов</div>}
          {mine.map((order) => (
            <div key={order._id} className="anim-rise glass rounded-2xl p-4 text-[1.8rem] text-center">
              <div className="flex items-center gap-2 justify-center">
              <div className="font-semibold text-center">
                {order.to?.text ? `${order.from?.text} → ${order.to?.text}` : order.from?.text}
              </div>
                {order.unreadCount > 0 && (
                  <span className="ml-auto bg-danger text-white rounded-full px-2 text-xs">
                    {order.unreadCount}
                  </span>
                )}
              </div>
              <div className="text-secondary-text text-center">{statusBadge(order.status)} · {formatWhen(order.when)}</div>
              <div className="flex gap-2 mt-2 justify-center flex-wrap">
                {order.status === "BOOKED" && (
                  <button
                    className="btn-accent press px-3 py-1.5 rounded-xl font-semibold"
                    onClick={() => activateBooking(order)}
                  >
                    🚕 Приступить к брони
                  </button>
                )}
                {order.status === "ASSIGNED" && (
                  <button className="btn-accent press px-3 py-1.5 rounded-xl font-semibold" onClick={() => myAction(order, "arrive")}>Выехал</button>
                )}
                {order.status === "ARRIVING" && (
                  <button className="btn-accent press px-3 py-1 rounded-xl font-semibold" onClick={() => myAction(order, "wait")}>Я на месте</button>
                )}
                {order.status === "WAITING" && (
                  <>
                    <button className="bg-success text-white px-3 py-1 rounded" onClick={() => myAction(order, "start")}>Поехали</button>
                    <button className="bg-danger text-white px-3 py-1 rounded" onClick={() => myAction(order, "no_show")}>Не вышел</button>
                  </>
                )}
                {order.status === "IN_RIDE" && (
                  <>
                    <button className="bg-success text-white px-3 py-1 rounded" onClick={() => myAction(order, "finish")}>Завершить</button>
                    <button className="underline" onClick={() => myAction(order, "undo_start")}>Отменить начало</button>
                  </>
                )}
                <button className="underline" onClick={() => setView({ type: "order", id: order._id })}>Чат</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display font-bold mb-2 text-center tracking-wide">💬 Диалоги</h3>
        <ChatList onOpen={(chatId) => setView({ type: "direct", id: chatId })} />
      </div>
    </div>
  );
};

export default DriverPanel;


