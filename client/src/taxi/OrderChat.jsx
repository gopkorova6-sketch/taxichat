import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "./api";
import useSocket from "../hooks/useSocket";

// Chat of a single order: bot card, system messages, quick action buttons,
// offers, SOS and the trip rating (concept 1.7)
const OrderChat = ({ orderId, me, onBack, startCall }) => {
  const { socketListen, socketEmit, socket } = useSocket();
  const [order, setOrder] = useState(null);
  const [messages, setMessages] = useState([]);
  const [offers, setOffers] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);

  const myRole = order?.driverId && String(order.driverId) === String(me.user._id)
    ? "driver"
    : "passenger";
  const otherId = myRole === "driver" ? order?.passengerId : order?.driverId;

  const load = async () => {
    try {
      const res = await apiGet(`/api/orders/${orderId}`);
      setOrder(res.data.order);
      const history = await apiGet(`/api/orders/${orderId}/messages`);
      setMessages(history.data.messages);
      const offersRes = await apiGet(`/api/orders/${orderId}/offers`);
      setOffers(offersRes.data.offers);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    const onChanged = () => load();
    socketListen("chat:message", onChanged);
    socketListen("order:status", onChanged);
    socketListen("order:offer", onChanged);
    return () => {
      socket.off("chat:message", onChanged);
      socket.off("order:status", onChanged);
      socket.off("order:offer", onChanged);
    };
  }, [orderId]);

  const send = async (body) => {
    if (!body.trim()) return;
    try {
      await apiPost(`/api/orders/${orderId}/messages`, { body });
      setText("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const acceptOffer = async (offerId) => {
    try {
      await apiPost(`/api/orders/${orderId}/accept`, { offerId });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const runAction = async (action) => {
    try {
      if (action === "offer") {
        const priceText = window.prompt("Цена поездки:");
        if (!priceText) return;
        const etaMin = parseInt(window.prompt("Время подачи, минут:") ?? "10", 10);
        await apiPost(`/api/orders/${orderId}/offers`, { priceText, etaMin });
      } else if (action === "cancel") {
        const reason = window.prompt("Причина отмены:");
        if (!reason) return;
        await apiPost(`/api/orders/${orderId}/cancel`, { reason });
      } else if (action === "dispute") {
        const reason = window.prompt("Опишите проблему:");
        if (!reason) return;
        await apiPost(`/api/orders/${orderId}/dispute`, { reason });
      } else {
        await apiPost(`/api/orders/${orderId}/action`, { action });
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const sos = async () => {
    try {
      await apiPost(`/api/orders/${orderId}/sos`, {});
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const rate = async (value) => {
    try {
      await apiPost(`/api/orders/${orderId}/rating`, { stars: value });
      setStars(value);
      setRated(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const share = async () => {
    try {
      const res = await apiGet(`/api/orders/${orderId}/share`);
      window.prompt("Ссылка для близких:", res.data.url);
    } catch (err) {
      setError(err.message);
    }
  };

  if (error && !order) {
    return (
      <div className="p-6 text-danger">
        {error}
        <button className="underline ml-2" onClick={onBack}>Назад</button>
      </div>
    );
  }
  if (!order) return <div className="p-6">Загрузка...</div>;

  const CALLABLE = ["ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE"];
  const canRate = order.status === "COMPLETED" && !rated;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 border-b border-secondary-text/20">
        <button className="underline" onClick={onBack}>← Назад</button>
        <div className="font-semibold">
          Заказ {order.from?.text} → {order.to?.text}
        </div>
        <div className="text-sm text-secondary-text">{order.status}</div>
        <div className="ml-auto flex gap-2">
          {CALLABLE.includes(order.status) && otherId && (
            <button
              className="bg-success text-white px-3 py-1 rounded"
              onClick={() =>
                startCall({
                  kind: "order",
                  orderId,
                  target: String(otherId),
                  name: myRole === "driver" ? "Пассажир" : "Водитель",
                })
              }
            >
              Позвонить
            </button>
          )}
          <button className="underline" onClick={share}>Поделиться</button>
          {["ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE", "PUBLISHED"].includes(order.status) && (
            <button className="text-danger underline" onClick={sos}>SOS</button>
          )}
        </div>
      </div>

      {error && <div className="text-danger text-sm px-3 py-1">{error}</div>}

      {order.status === "PUBLISHED" && offers.length > 0 && (
        <div className="p-3 border-b border-secondary-text/20 space-y-2">
          <div className="text-xs text-secondary-text">Отклики водителей</div>
          {offers.map((offer) => (
            <div
              key={offer._id}
              className="flex items-center gap-3 bg-secondary rounded p-2 text-sm"
            >
              <div>
                <div className="font-semibold">{offer.driverName}</div>
                <div className="text-secondary-text">
                  {offer.priceText} · подача {offer.etaMin} мин · {offer.carCaption}
                </div>
              </div>
              {myRole === "passenger" && offer.status === "PENDING" && (
                <button
                  className="ml-auto bg-success text-white px-3 py-1 rounded"
                  onClick={() => acceptOffer(offer._id)}
                >
                  Принять
                </button>
              )}
              {offer.status === "ACCEPTED" && (
                <span className="ml-auto text-success text-xs">Принят</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((message) => {
          if (message.kind === "system") {
            return (
              <div key={message._id} className="text-center text-xs text-secondary-text py-1">
                {message.body}
              </div>
            );
          }
          if (message.kind === "order_card") {
            return (
              <div key={message._id} className="border border-secondary-text/30 rounded p-3 text-sm">
                <div className="font-semibold">Заказ</div>
                <div>Статус: {message.meta?.status}</div>
                <div>{message.meta?.from} → {message.meta?.to}</div>
                <div>Пассажиров: {message.meta?.pax}{message.meta?.priceAgreed ? `, цена: ${message.meta.priceAgreed}` : ""}</div>
              </div>
            );
          }
          if (message.kind === "action") {
            return (
              <div key={message._id} className="flex flex-wrap gap-2">
                {(message.meta?.buttons ?? [])
                  .filter((button) => button.roles.includes(myRole))
                  .map((button) => (
                    <button
                      key={button.action + button.label}
                      className="bg-accent text-white px-3 py-1 rounded text-sm"
                      onClick={() => runAction(button.action)}
                    >
                      {button.label}
                    </button>
                  ))}
              </div>
            );
          }
          return (
            <div
              key={message._id}
              className={`max-w-[70%] rounded p-2 text-sm ${message.mine ? "bg-accent/20 ml-auto" : "bg-secondary"}`}
            >
              {message.senderName && <div className="text-xs text-secondary-text">{message.senderName}</div>}
              {message.body}
            </div>
          );
        })}
      </div>

      {canRate && (
        <div className="p-3 border-t border-secondary-text/20">
          <div className="text-sm mb-1">Оцените поездку:</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                className={`text-xl ${value <= stars ? "text-warning" : "text-secondary-text"}`}
                onClick={() => rate(value)}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="flex gap-2 p-3 border-t border-secondary-text/20"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <input
          className="flex-1 bg-secondary rounded px-3 py-2 text-sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Сообщение..."
        />
        <button className="bg-accent text-white px-4 rounded" type="submit">➤</button>
      </form>
    </div>
  );
};

export default OrderChat;
