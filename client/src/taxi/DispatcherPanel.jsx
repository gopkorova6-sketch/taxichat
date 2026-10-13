import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch } from "./api";
import useSocket from "../hooks/useSocket";
import OrderChat from "./OrderChat";

// Dispatcher panel: city order queue, manual assignment, driver applications
// review and the region admin sections (concept 1.3 / 1.9)
const DispatcherPanel = ({ cityId, role, me }) => {
  const { socketListen, socket } = useSocket();
  const [orders, setOrders] = useState([]);
  const [pending, setPending] = useState([]);
  const [activeDrivers, setActiveDrivers] = useState([]);
  const [error, setError] = useState(null);
  const [sos, setSos] = useState(null);
  const [view, setView] = useState(null);
  const [adminTab, setAdminTab] = useState(null);
  const [applications, setApplications] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [audit, setAudit] = useState([]);

  const isRegionAdmin = role === "region_admin";

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

  const loadAdmin = async (tab) => {
    try {
      if (tab === "applications") {
        const res = await apiGet("/api/admin/applications?type=dispatcher");
        setApplications(res.data.applications);
      }
      if (tab === "complaints") {
        const res = await apiGet("/api/admin/complaints?status=OPEN");
        setComplaints(res.data.complaints);
      }
      if (tab === "audit") {
        const res = await apiGet("/api/admin/audit?limit=50");
        setAudit(res.data.entries);
      }
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

  useEffect(() => {
    if (adminTab) loadAdmin(adminTab);
  }, [adminTab]);

  if (view) {
    return <OrderChat orderId={view} me={me} onBack={() => setView(null)} startCall={() => {}} />;
  }

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

  const reviewApplication = async (applicationId, decision) => {
    try {
      let reason;
      if (decision === "reject") {
        reason = window.prompt("Причина отказа:");
        if (!reason) return;
      }
      await apiPatch(`/api/admin/applications/${applicationId}`, { decision, reason });
      loadAdmin("applications");
    } catch (err) {
      setError(err.message);
    }
  };

  const resolveComplaint = async (complaintId, status) => {
    try {
      const resolution = window.prompt("Решение:");
      await apiPatch(`/api/admin/complaints/${complaintId}`, { status, resolution });
      loadAdmin("complaints");
    } catch (err) {
      setError(err.message);
    }
  };

  const OPEN = ["PUBLISHED", "ASSIGNED", "ARRIVING", "WAITING", "IN_RIDE", "DISPUTE"];

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {sos && (
        <div className="bg-danger text-white rounded p-3 text-sm flex items-center gap-3">
          <span>SOS в заказе! Подключитесь к чату.</span>
          <button
            className="bg-white text-danger px-3 py-1 rounded font-semibold"
            onClick={() => setView(sos.orderId)}
          >
            Открыть чат
          </button>
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
                <div className="flex items-center gap-2">
                  <div className="font-semibold">
                    {order.from?.text} → {order.to?.text}
                  </div>
                  {order.unreadCount > 0 && (
                    <span className="ml-auto bg-danger text-white rounded-full px-2 text-xs">
                      {order.unreadCount}
                    </span>
                  )}
                </div>
                <div className="text-secondary-text">
                  {statusLabel(order.status)} · {order.exactFrom ?? "адрес скрыт"} · {order.pax} пасс.
                </div>
                <div className="flex gap-2 mt-2">
                  {order.status === "PUBLISHED" && (
                    <select
                      className="bg-primary p-2 rounded text-sm"
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
                  <button className="underline" onClick={() => setView(order._id)}>
                    Чат заказа
                  </button>
                </div>
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

      {isRegionAdmin && (
        <div>
          <h3 className="font-semibold mb-2">Админ региона</h3>
          <div className="flex gap-2 text-sm mb-2">
            {[
              ["applications", "Заявки на диспетчера"],
              ["complaints", "Жалобы и SOS"],
              ["audit", "Журнал"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`px-2 py-1 rounded ${adminTab === key ? "bg-accent text-black" : "bg-secondary"}`}
                onClick={() => setAdminTab(adminTab === key ? null : key)}
              >
                {label}
              </button>
            ))}
          </div>

          {adminTab === "applications" && (
            <div className="space-y-2 max-w-lg">
              {applications.length === 0 && (
                <div className="text-sm text-secondary-text">Заявок нет</div>
              )}
              {applications.map((application) => (
                <div key={application._id} className="bg-secondary rounded p-3 text-sm">
                  <div className="font-semibold">
                    {application.userId?.name} → {application.cityId?.name}
                  </div>
                  {application.note && (
                    <div className="text-secondary-text">{application.note}</div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      className="bg-success text-white px-3 py-1 rounded"
                      onClick={() => reviewApplication(application._id, "approve")}
                    >
                      Одобрить
                    </button>
                    <button
                      className="bg-danger text-white px-3 py-1 rounded"
                      onClick={() => reviewApplication(application._id, "reject")}
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === "complaints" && (
            <div className="space-y-2 max-w-lg">
              {complaints.length === 0 && (
                <div className="text-sm text-secondary-text">Открытых жалоб нет</div>
              )}
              {complaints.map((complaint) => (
                <div key={complaint._id} className="bg-secondary rounded p-3 text-sm">
                  <div className="font-semibold">
                    {complaint.type === "sos" ? "SOS" : "Жалоба"} ·{" "}
                    {complaint.reporterId?.name}
                  </div>
                  <div>{complaint.text}</div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="bg-success text-white px-3 py-1 rounded"
                      onClick={() => resolveComplaint(complaint._id, "RESOLVED")}
                    >
                      Решено
                    </button>
                    <button
                      className="underline"
                      onClick={() => resolveComplaint(complaint._id, "DISMISSED")}
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminTab === "audit" && (
            <div className="space-y-1 max-w-lg text-sm">
              {audit.map((entry) => (
                <div key={entry._id} className="text-secondary-text">
                  {new Date(entry.at).toLocaleString()} · {entry.action} ·{" "}
                  {entry.actorId?.name ?? "система"}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DispatcherPanel;
