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
import { cityStatusEmoji } from "./statusLabels";
import ErrorBoundary from "./ErrorBoundary";
import CityPicker from "./CityPicker";

// Main Бомбила workspace: city and role switcher, role panels, order chats
// and voice calls. The legacy contact chats stay available in the "Чаты" tab.
const ROLE_LABELS = {
  passenger: "🧍 Пассажир",
  driver: "🚕 Водитель",
  dispatcher: "🎧 Диспетчер",
  region_admin: "🗺️ Админ региона",
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
      <header className="glass-strong sticky top-0 z-30 flex flex-col gap-2 px-3 pt-3 pb-2 rounded-b-3xl anim-fade">
        <div className="flex flex-col items-center gap-1">
          <span className="brand-title brand-gradient">Бомбила</span>
          <span className="text-[1.1rem] text-secondary-text tracking-wide">такси без посредников</span>
        </div>
        <CityPicker cities={cities} cityId={cityId} onSelect={setCityId} />
        {/* Роли в шапке — только на десктопе; на мобильных нижняя навигация */}
        <div className="sm:hidden flex gap-1 flex-wrap justify-center">
          {availableRoles.map((r) => (
            <button
              key={r}
              className={`press px-3 py-1.5 rounded-full text-sm ${
                role === r ? "btn-accent font-semibold" : "glass text-secondary-text"
              }`}
              onClick={() => setRole(r)}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        {/* Роли в шапке — только на десктопе; на мобильных нижняя навигация */}
        <div className="sm:hidden flex gap-1 flex-wrap justify-center">
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
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm min-w-0 text-center">
          <span className="truncate">{user?.name}</span>
          <div className="flex items-center justify-center gap-3 shrink-0">
            <button className="underline" onClick={() => setTab(tab === "taxi" ? "chats" : "taxi")}>
              {tab === "taxi" ? "💬 Чаты" : "🚕 Заказы"}
            </button>
            <button className="underline" onClick={() => setTab("roles")}>👥 Роли</button>
            <button className="underline text-danger" onClick={logout}>🚪 Выйти</button>
          </div>
        </div>
      </header>

      {error && <div className="text-danger text-sm px-4 py-1">{error}</div>}

      <div className="flex-1 overflow-hidden pb-[7.5rem] sm:pb-0 anim-rise">
        <ErrorBoundary>
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
              Статус города: {cityStatusEmoji(city?.status)}.
            </div>
            <button
              className="btn-accent press px-4 py-2 rounded-2xl text-sm font-bold"
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
          <ErrorBoundary key={cityId + role}>
            <PassengerPanel
              me={me}
              cityId={cityId}
              refreshMe={refreshMe}
              startCall={startCall}
            />
          </ErrorBoundary>
        )}
        </ErrorBoundary>
      </div>

      {/* Мобильная нижняя навигация по ролям — под большим пальцем */}
      <nav className="fixed bottom-3 left-3 right-3 z-30 flex sm:hidden glass-strong rounded-3xl p-1.5 safe-area-bottom">
        {availableRoles.map((r) => {
          const active = role === r;
          return (
            <button
              key={r}
              className={`press relative flex-1 py-2.5 rounded-2xl text-[1.2rem] flex flex-col items-center gap-0.5 transition-all duration-300 ${
                active ? "btn-accent font-bold" : "text-secondary-text"
              }`}
              onClick={() => setRole(r)}
            >
              <span className={`text-[2rem] leading-none ${active ? "anim-float" : ""}`}>
                {r === "driver" ? "🚕" : r === "dispatcher" || r === "region_admin" ? "🎧" : "🧍"}
              </span>
              {ROLE_LABELS[r]}
            </button>
          );
        })}
      </nav>
      {/* Десктопная навигация по ролям — в шапке уже есть, нижняя панель скрыта */}


      <CallModal call={call} acceptCall={acceptCall} endCall={endCall} />
    </div>
  );
};

export default TaxiApp;

