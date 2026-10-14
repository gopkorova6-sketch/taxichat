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
import RolesSection from "./RolesSection";
import { apiPost } from "./api";
import { cityStatusLabel } from "./statusLabels";

// Main Бомбила workspace: city and role switcher, role panels, order chats
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
  // Superadmin manages any city without memberships
  if (user?.isSuperadmin && !availableRoles.includes("dispatcher")) {
    availableRoles.push("dispatcher");
  }

  const logout = async () => {
    await fetch("/api/user/logout", { method: "POST", credentials: "include" });
    dispatch(authActions.logout());
    window.location.reload();
  };

  return (
    <div className="w-full h-full flex flex-col">
      <header className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 border-b border-secondary-text/20 bg-secondary">
        <div className="flex items-center gap-3">
          <span className="font-bold uppercase tracking-wide text-cta-icon">Бомбила</span>
          <select
            className="bg-primary rounded-lg p-1.5 text-sm flex-1 sm:flex-none"
            value={cityId ?? ""}
            onChange={(event) => setCityId(event.target.value)}
          >
            <option value="" disabled>Город</option>
            {cities.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} ({cityStatusLabel(item.status)})
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 flex-wrap">
          {availableRoles.map((r) => (
            <button
              key={r}
              className={`px-3 py-1.5 rounded-full text-sm ${
                role === r ? "bg-accent text-black font-semibold" : "bg-primary text-secondary-text"
              }`}
              onClick={() => setRole(r)}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto flex items-center justify-between sm:justify-end gap-3 text-sm">
          <span>{user?.name}</span>
          <button className="underline" onClick={() => setTab(tab === "taxi" ? "chats" : "taxi")}>
            {tab === "taxi" ? "Чаты" : "Заказы"}
          </button>
          <button className="underline" onClick={() => setTab("roles")}>Роли</button>
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
        ) : tab === "roles" ? (
          <RolesSection me={me} cityId={cityId} cities={cities} refreshMe={refreshMe} />
        ) : !cityId ? (
          <div className="p-6 text-secondary-text">Выберите город</div>
        ) : availableRoles.length === 0 ? (
          <div className="p-6 space-y-2">
            <div className="text-secondary-text">
              В городе {city?.name ?? ""} у вас пока нет активной роли.
              Статус города: {cityStatusLabel(city?.status)}.
            </div>
            <button
              className="bg-accent text-black px-4 py-2 rounded text-sm"
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
            <button
              className="underline text-sm"
              onClick={() => setTab("roles")}
            >
              Или оформите роль водителя / диспетчера
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
          <DispatcherPanel cityId={cityId} role={role} me={me} />
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
