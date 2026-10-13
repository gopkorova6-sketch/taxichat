import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "./api";
import useSocket from "../hooks/useSocket";

// Dispatcher panel: city order queue, manual assignment and driver
// applications review (concept 1.3)
const DispatcherPanel = ({ cityId }) => {
  const { socketListen, socket } = useSocket();
  const [orders, setOrders] = useState([]);
  const [pending, setPending] = useState([]);
  const [activeDrivers, setActiveDrivers] = useState([]);
  const [error, setError] = useState(null);
  const [sos, setSos] = useState(null);

  const load = async () => {
    try {
      const [ordersRes, pendingRes, driversRes] = await Promise.all([
        apiGet(`/api/orders?cityId=${cityId}`),
        apiGet(`/api/dispatch/${cityId}/drivers?status=PENDING`),
        apiGet(`/api/dispatch/${cityId}/drivers?status=ACTIVE`),
      ]);
      setOrders(ordersRes.data.orders);
      setPending(pendingRes.data.drivers);
      setActiveDrivers(driversRes.data.drivers);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
    const onChanged = () => load();
    const onSos = (payload) => {
      setSos(payload);
      setTimeout(() => setSos(null), 15000);
    };
    socketListen("order:new", onChanged);
    socketListen("order:status", onChanged);
    socketListen("sos:raised", onSos);
    return () => {
      socket.off("order:new", onChanged);
      socket.off("order:status", onChanged);
      socket.off("sos:raised", onSos);
    };
  }, [cityId]);

  const assign = async (orderId, membershipId) => {
    try {
      await apiPost(`/api/orders/${orderId}/assign`, { membershipId });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const review = async (membershipId, decision) => {
    try {
      let reason;
      if (decision === "reject") {
        reason = window.prompt("Причина отказа:");
        if (!reason) return;
      }
      await apiPatch(`/api/dispatch/drivers/${membershipId}`, { decision, reason });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const OPEN = ["PUBLISHED", "ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE", "DISPUTE"];

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {sos && (
        <div className="bg-danger text-white rounded p-3 text-sm">
          SOS в заказе! Откройте очередь и подключитесь к чату.
        </div>
      )}
      {error && <div className="text-danger text-sm">{error}</div>}

      <div>
        <h3 className="font-semibold mb-2">Очередь города</h3>
        <div className="space-y-2 max-w-lg">
          {orders.filter((order) => OPEN.includes(order.status)).length === 0 && (
            <div className="text-sm text-secondary-text">Активных заказов нет</div>
          )}
          {orders
            .filter((order) => OPEN.includes(order.status))
            .map((order) => (
              <div key={order._id} className="bg-secondary rounded p-3 text-sm">
                <div className="font-semibold">
                  {order.from?.text} → {order.to?.text}
                </div>
                <div className="text-secondary-text">
                  {order.status} · {order.exactFrom ?? "адрес скрыт"} · {order.pax} пасс.
                </div>
                {order.status === "PUBLISHED" && (
                  <select
                    className="mt-2 bg-primary p-2 rounded text-sm"
                    defaultValue=""
                    onChange={(event) =>
                      event.target.value && assign(order._id, event.target.value)
                    }
                  >
                    <option value="">Назначить водителя...</option>
                    {activeDrivers.map((driver) => (
                      <option key={driver._id} value={driver._id}>
                        {driver.displayName} ({driver.carCaption})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Анкеты водителей</h3>
        <div className="space-y-2 max-w-lg">
          {pending.length === 0 && (
            <div className="text-sm text-secondary-text">Новых анкет нет</div>
          )}
          {pending.map((driver) => (
            <div key={driver._id} className="bg-secondary rounded p-3 text-sm">
              <div className="font-semibold">{driver.displayName}</div>
              <div className="text-secondary-text">
                {driver.carCaption} · {driver.user?.name}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="bg-success text-white px-3 py-1 rounded"
                  onClick={() => review(driver._id, "approve")}
                >
                  Одобрить
                </button>
                <button
                  className="bg-danger text-white px-3 py-1 rounded"
                  onClick={() => review(driver._id, "reject")}
                >
                  Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DispatcherPanel;
