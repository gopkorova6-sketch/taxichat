import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import { useReactMediaRecorder } from "react-media-recorder";
import { apiGet, apiPost, apiUpload } from "./api";
import useSocket from "../hooks/useSocket";
import { statusBadge, formatWhen } from "./statusLabels";
import Marquee from "./Marquee";

// Chat of a single order: bot card, system messages, quick action buttons,
// offers, SOS and the trip rating (concept 1.7)
const OrderChat = ({ orderId, me, onBack, startCall }) => {
  const dispatch = useDispatch();
  const { socketListen, socketEmit, socket } = useSocket();
  const [order, setOrder] = useState(null);
  const [messages, setMessages] = useState([]);
  const [offers, setOffers] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);

  // Все хуки объявляются до ранних return, иначе число хуков меняется при загрузке заказа
  const fileInputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef();

  const { startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    blobPropertyBag: { type: "audio/mp3" },
    onStop: async (_, blob) => {
      try {
        setUploading(true);
        const uploadData = await apiUpload(blob, "audio");
        await apiPost(`/api/orders/${orderId}/messages`, {
          kind: "voice",
          voiceNoteUrl: uploadData.secure_url,
          voiceNoteDuration: Math.max(1, recordSeconds),
        });
        load();
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading(false);
        setRecording(false);
        setRecordSeconds(0);
      }
    },
  });

  const isParticipant =
    String(order?.passengerId) === String(me?.user?._id) ||
    (order?.driverId && String(order.driverId) === String(me?.user?._id));
  const myRole = !isParticipant
    ? "dispatcher"
    : String(order?.driverId) === String(me?.user?._id)
      ? "driver"
      : "passenger";
  const otherId =
    myRole === "driver"
      ? order?.passengerId
      : order?.driverId;

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
    // Mark the chat as read while it is open
    apiPost(`/api/orders/${orderId}/read`, {}).catch(() => {});
    const onChanged = () => {
      load();
      apiPost(`/api/orders/${orderId}/read`, {}).catch(() => {});
    };
    socketListen("chat:message", onChanged);
    socketListen("order:status", onChanged);
    socketListen("order:offer", onChanged);

    // Join the live order room. The server refuses non-participants, so the
    // join is retried after the driver is assigned (order:status) and after
    // every reconnect (rooms are per connection).
    const joinRoom = () => socket.emit("order:join", { orderId });
    joinRoom();
    socket.on("connect", joinRoom);
    socket.on("order:status", joinRoom);
    return () => {
      socket.off("chat:message", onChanged);
      socket.off("order:status", onChanged);
      socket.off("order:offer", onChanged);
      socket.off("connect", joinRoom);
      socket.off("order:status", joinRoom);
      socket.emit("order:leave", { orderId });
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
      dispatch(
        notificationActions.addNotification({
          message: "Отклик принят — водитель назначен",
          type: "success",
        })
      );
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const runAction = async (button) => {
    const action = typeof button === "string" ? button : button.action;
    try {
      if (action === "offer") {
        const priceText = window.prompt("Цена поездки:");
        if (!priceText) return;
        const etaMin = parseInt(window.prompt("Время подачи, минут:") ?? "10", 10);
        await apiPost(`/api/orders/${orderId}/offers`, { priceText, etaMin });
        dispatch(
          notificationActions.addNotification({
            message: "Отклик отправлен пассажиру",
            type: "success",
          })
        );
      } else if (action === "cancel") {
        const reason = window.prompt("Причина отмены:");
        if (!reason) return;
        await apiPost(`/api/orders/${orderId}/cancel`, { reason });
        dispatch(
          notificationActions.addNotification({
            message: "Заказ отменён",
            type: "info",
          })
        );
      } else if (action === "dispute") {
        const reason = window.prompt("Опишите проблему:");
        if (!reason) return;
        await apiPost(`/api/orders/${orderId}/dispute`, { reason });
        dispatch(
          notificationActions.addNotification({
            message: "Спор открыт, диспетчер подключится",
            type: "info",
          })
        );
      } else if (action === "text") {
        // Quick replies from the bot ("Опаздываю на 5 минут" etc.)
        await send(button.text ?? button.label);
        return;
      } else {
        // Lifecycle actions: arrive/wait/start/finish etc., plus booking
        const endpoint =
          action === "book" ? "book" : action === "activate" ? "activate" : "action";
        await apiPost(
          `/api/orders/${orderId}/${endpoint}`,
          endpoint === "action" ? { action } : {}
        );
        const labels = {
          arrive: "Отмечено: выехал",
          wait: "Отмечено: на месте",
          start: "Поездка началась",
          finish: "Поездка завершена ✅",
          no_show: "Отмечена неявка",
          undo_start: "Начало поездки отменено",
          book: "🔖 Заказ забронирован — вы свободны до времени",
          activate: "🚕 Бронь активирована — вы назначены",
        };
        dispatch(
          notificationActions.addNotification({
            message: labels[action] ?? "Готово",
            type: "success",
          })
        );
      }
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleRecording = () => {
    if (recording) {
      clearInterval(recordTimerRef.current);
      stopRecording();
    } else {
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(
        () => setRecordSeconds((seconds) => seconds + 1),
        1000
      );
      setRecording(true);
      startRecording();
    }
  };

  const onPickPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      const uploadData = await apiUpload(file, "image");
      await apiPost(`/api/orders/${orderId}/messages`, {
        kind: "photo",
        imageUrl: uploadData.secure_url,
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const sos = async () => {
    try {
      await apiPost(`/api/orders/${orderId}/sos`, {});
      dispatch(
        notificationActions.addNotification({
          message: "SOS отправлен — диспетчеры оповещены",
          type: "error",
        })
      );
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

  const blockPeer = async () => {
    if (!window.confirm("Заблокировать участника? Звонки и диалоги станут недоступны.")) return;
    try {
      await apiPost("/api/blocks", { userId: String(otherId) });
      dispatch(
        notificationActions.addNotification({
          message: "Участник заблокирован",
          type: "info",
        })
      );
      setError("Участник заблокирован");
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
      <div className="p-2 border-b border-secondary-text/20">
          <div className="flex items-center gap-2 min-w-0">
            <button
              className="shrink-0 px-2 py-1 rounded-lg text-[1.2rem] bg-white/10 border border-white/10"
              onClick={onBack}
              aria-label="Назад"
            >
              ⬅️
            </button>
            <Marquee
              text={order.to?.text ? `${order.from?.text} → ${order.to?.text}` : order.from?.text}
              className="flex-1 min-w-0 text-[1.3rem] font-semibold"
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[1.1rem] text-secondary-text min-w-0">
            <span className="truncate">{statusBadge(order.status)} · {formatWhen(order.when)}</span>
            <span className="shrink-0 truncate max-w-[45%]">
              {myRole === "passenger" && order.driver
                ? `🧑‍✈️ ${order.driver.displayName}${order.driver.carCaption ? ` · ${order.driver.carCaption}` : ""}`
                : myRole === "driver" && order.passenger?.name
                ? `🧍 ${order.passenger.name}`
                : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 justify-center">
          {isParticipant && CALLABLE.includes(order.status) && otherId && (
            <button
              className="bg-success text-white px-3 py-1.5 rounded-lg text-sm"
              onClick={() =>
                startCall({
                  kind: "order",
                  orderId,
                  target: String(otherId),
                  name: myRole === "driver" ? "Пассажир" : "Водитель",
                })
              }
            >
              📞 Позвонить
            </button>
          )}
          {isParticipant && (
            <button className="border border-secondary-text/40 px-3 py-1.5 rounded-lg text-sm" onClick={share}>
              🔗 Поделиться
            </button>
          )}
          {isParticipant &&
            ["ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE", "PUBLISHED"].includes(order.status) && (
              <button className="bg-danger text-white px-3 py-1.5 rounded-lg text-sm" onClick={sos}>
                SOS
              </button>
            )}
          {isParticipant && otherId && (
            <button className="underline text-secondary-text text-sm" onClick={blockPeer}>
              Блок
            </button>
          )}
        </div>

      {error && <div className="text-danger text-sm px-3 py-1">{error}</div>}

      {order.status === "PUBLISHED" && offers.length > 0 && (
        <div className="p-3 border-b border-secondary-text/20 space-y-2 text-center">
          <div className="text-xs text-secondary-text">Отклики водителей</div>
          {offers.map((offer) => (
            <div
              key={offer._id}
              className="flex items-center gap-3 bg-secondary rounded p-2 text-sm"
            >
              <div>
                <div className="font-semibold text-center">{offer.driverName}</div>
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
                <div className="font-semibold text-center">Заказ</div>
                <div>Статус: {statusBadge(message.meta?.status)}</div>
                <div>{message.meta?.to ? `${message.meta?.from} → ${message.meta?.to}` : message.meta?.from}</div>
                <div>Когда: {formatWhen(message.meta?.when)}</div>
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
                      className="btn-accent press px-3 py-1 rounded-xl text-sm font-semibold"
                      onClick={() => runAction(button)}
                    >
                      {button.label}
                    </button>
                  ))}
              </div>
            );
          }
          if (message.kind === "photo") {
            return (
              <div
                key={message._id}
                className={`anim-rise max-w-[78%] rounded-2xl p-2.5 text-sm ${message.mine ? "btn-accent ml-auto text-[#111]" : "glass"}`}
              >
                {message.senderName && <div className="text-xs text-secondary-text">{message.senderName}</div>}
                <img
                  src={message.meta?.imageUrl}
                  alt="Фото"
                  className="rounded max-h-[16rem]"
                />
              </div>
            );
          }
          if (message.kind === "voice") {
            return (
              <div
                key={message._id}
                className={`anim-rise max-w-[78%] rounded-2xl p-2.5 text-sm ${message.mine ? "btn-accent ml-auto text-[#111]" : "glass"}`}
              >
                {message.senderName && <div className="text-xs text-secondary-text">{message.senderName}</div>}
                <div className="flex items-center gap-2">
                  <span>🎤</span>
                  <audio controls src={message.meta?.voiceNoteUrl} />
                  {message.meta?.voiceNoteDuration && (
                    <span className="text-xs text-secondary-text">
                      {message.meta.voiceNoteDuration} с
                    </span>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div
              key={message._id}
              className={`anim-rise max-w-[78%] rounded-2xl p-2.5 text-sm ${message.mine ? "btn-accent ml-auto text-[#111]" : "glass"}`}
            >
              {message.senderName && <div className="text-xs text-secondary-text">{message.senderName}</div>}
              {message.body}
            </div>
          );
        })}
      </div>

      {isParticipant && canRate && (
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
        className="flex gap-2 p-3 glass-strong rounded-t-3xl safe-area-bottom"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPickPhoto}
        />
        <button
          type="button"
          className="px-2 text-lg"
          title="Фото"
          onClick={() => fileInputRef.current?.click()}
        >
          📷
        </button>
        <button
          type="button"
          className={`px-2 text-lg ${recording ? "text-danger animate-pulse" : ""}`}
          title="Голосовое сообщение"
          onClick={toggleRecording}
        >
          {recording ? `⏺ ${recordSeconds}с` : "🎤"}
        </button>
        <input
          className="flex-1 bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-2xl px-4 py-2.5 text-[1.5rem] focus:border-accent focus:outline-none transition-colors"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={uploading ? "Загрузка..." : "Сообщение..."}
          disabled={uploading || recording}
        />
        <button className="press btn-accent px-4 rounded-2xl font-display font-bold" type="submit">➤</button>
      </form>
    </div>
  );
};

export default OrderChat;


