import { useState } from "react";
import { useDispatch } from "react-redux";
import { authActions } from "../store/authSlice";
import Sidebar from "../components/globals/Sidebar";
import Chat from "../pages/Chat";
import useTaxi from "./useTaxi";
import useCall from "./useCall";
import CallModal from "./CallModal";
import PassengerPanel from "./PassengerPanel";
import DriverPanel from "./DriverPanel";
import DispatcherPanel from "./DispatcherPanel";
import { apiPost } from "./api";

// Main TaxiChat workspace: city and role switcher, role panels, order chats
// and voice calls. The legacy contact chats stay available in the "Чаты" tab.
const ROLE_LABELS = {
  passenger: "Пассажир",
  driver: "Водитель",
  dispatcher: "Диспетчер",
  region_admin: "Админ региона",
};

const TaxiApp = () => {
  const dispatch = useDispatch();
  const { me, user, memberships, cities, cityId, setCityId, role, setRole, driverProfile, error, refreshMe } = useTaxi();
  const { call, startCall, acceptCall, endCall } = useCall();
  const [tab, setTab] = useState("taxi");

  const city = cities.find((item) => String(item._id) === String(cityId));
  const availableRoles = ["passenger", "driver", "dispatcher", "region_admin"].filter(
    (r) =>
      memberships.some(
        (m) => m.role === r && m.status === "ACTIVE" && String(m.cityId?._id) === String(cityId)
      )
  );

  const logout = async () => {
    await fetch("/api/user/logout", { method: "POST", credentials: "include" });
    dispatch(authActions.logout());
    window.location.reload();
  };

  return (
    <div className="w-full h-full flex flex-col">
      <header className="flex items-center gap-3 p-2 border-b border-secondary-text/20 bg-secondary">
        <span className="font-bold uppercase tracking-wide">TaxiChat</span>
        <select
          className="bg-primary rounded p-1 text-sm"
          value={cityId ?? ""}
          onChange={(event) => setCityId(event.target.value)}
        >
          <option value="" disabled>Город</option>
          {cities.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name} ({item.status})
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          {availableRoles.map((r) => (
            <button
              key={r}
              className={`px-2 py-1 rounded text-sm ${role === r ? "bg-accent text-white" : "bg-primary"}`}
              onClick={() => setRole(r)}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span>{user?.name}</span>
          <button className="underline" onClick={() => setTab(tab === "taxi" ? "chats" : "taxi")}>
            {tab === "taxi" ? "Чаты" : "Заказы"}
          </button>
          <button className="underline text-danger" onClick={logout}>Выйти</button>
        </div>
      </header>

      {error && <div className="text-danger text-sm px-4 py-1">{error}</div>}

      <div className="flex-1 overflow-hidden">
        {tab === "chats" ? (
          <div className="flex w-full h-full">
            <Sidebar />
            <Chat />
          </div>
        ) : !cityId ? (
          <div className="p-6 text-secondary-text">Выберите город</div>
        ) : availableRoles.length === 0 ? (
          <div className="p-6 space-y-2">
            <div className="text-secondary-text">
              В городе {city?.name ?? ""} у вас пока нет активной роли.
              Статус города: {city?.status}.
            </div>
            <button
              className="bg-accent text-white px-4 py-2 rounded text-sm"
              onClick={async () => {
                try {
                  await apiPost("/api/memberships", { cityId, role: "passenger" });
                  await refreshMe();
                } catch (err) {
                  // Passenger may already exist; ignore duplicate errors
                }
              }}
            >
              Стать пассажиром в этом городе
            </button>
          </div>
        ) : role === "driver" ? (
          <DriverPanel
            me={me}
            cityId={cityId}
            driverProfile={driverProfile}
            refreshMe={refreshMe}
            startCall={startCall}
          />
        ) : role === "dispatcher" || role === "region_admin" ? (
          <DispatcherPanel cityId={cityId} />
        ) : (
          <PassengerPanel
            me={me}
            cityId={cityId}
            refreshMe={refreshMe}
            startCall={startCall}
          />
        )}
      </div>

      <CallModal call={call} acceptCall={acceptCall} endCall={endCall} />
    </div>
  );
};

export default TaxiApp;
