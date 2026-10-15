import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "./api";
import useSocket from "../hooks/useSocket";

const LAST_CITY_KEY = "bombila.lastCityId";

// Initial city: a city where the user has an active role, then the last
// city the user picked, and only then the first city of the list.
const pickInitialCity = (cities, memberships) => {
  const active = (memberships ?? []).find((m) => m.status === "ACTIVE" && m.cityId?._id);
  const withRole = active && cities.find((c) => String(c._id) === String(active.cityId._id));
  if (withRole) return String(withRole._id);
  const last = localStorage.getItem(LAST_CITY_KEY);
  if (last && cities.some((c) => String(c._id) === last)) return last;
  return cities[0]?._id ? String(cities[0]._id) : null;
};

// Core state of the taxi workspace: the user, his memberships, the selected
// city and role, zones of the city and live presence
const useTaxi = () => {
  const { socketEmit, socketListen, socket } = useSocket();
  const [me, setMe] = useState(null);
  const [cities, setCities] = useState([]);
  const [cityId, setCityIdState] = useState(null);
  const [role, setRole] = useState(null);
  const [error, setError] = useState(null);
  const cachedMemberships = useRef(null);

  // Remember the city the user picked manually
  const setCityId = (id) => {
    if (id) localStorage.setItem(LAST_CITY_KEY, String(id));
    setCityIdState(id);
  };

  const refreshMe = async () => {
    const res = await apiGet("/api/user/me");
    setMe(res.data);
    cachedMemberships.current = res.data.memberships ?? [];
    return res.data;
  };

  useEffect(() => {
    refreshMe()
      .then((data) => {
        if (data.user._id) {
          socketEmit("user:online", data.user._id);
        }
      })
      .catch((err) => setError(err.message));

    apiGet("/api/geo/cities")
      .then((res) => {
        setCities(res.data.cities);
        setCityId((prev) => prev ?? pickInitialCity(res.data.cities, cachedMemberships.current));
      })
      .catch((err) => setError(err.message));

    // Roles change live: driver application review, waitlist activation
    const onMembershipUpdated = () => refreshMe();
    socketListen("membership:updated", onMembershipUpdated);
    return () => {
      socket.off("membership:updated", onMembershipUpdated);
    };
  }, []);

  // Re-pick the initial city once both cities and memberships are known,
  // unless the user already chose one in this session
  const memberships = me?.memberships ?? [];
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || !cities.length || !me) return;
    const hasManualChoice = !!localStorage.getItem(LAST_CITY_KEY);
    const withRole = memberships.some((m) => m.status === "ACTIVE" && m.cityId?._id);
    if (!withRole && hasManualChoice) {
      autoPicked.current = true;
      return;
    }
    autoPicked.current = true;
    setCityIdState(pickInitialCity(cities, memberships));
  }, [cities, me]);

  // Auto-select the role for the chosen city
  const cityMembership = (r) =>
    memberships.find(
      (m) =>
        m.role === r && m.status === "ACTIVE" && String(m.cityId?._id) === String(cityId)
    );

  useEffect(() => {
    if (!cityId) return;
    const nextRole =
      ["driver", "dispatcher", "region_admin"].find((r) => cityMembership(r)) ?? "passenger";
    setRole(nextRole);
  }, [cityId, memberships.length]);

  const userRole =
    cityMembership(role) || (me?.user?.isSuperadmin && role === "dispatcher")
      ? role
      : "passenger";

  return {
    me,
    refreshMe,
    user: me?.user,
    memberships,
    cities,
    cityId,
    setCityId,
    role: userRole,
    setRole,
    membership: cityMembership(userRole),
    driverProfile:
      me?.driverProfiles?.find(
        (profile) =>
          String(profile.membershipId) === String(cityMembership("driver")?._id)
      ) ?? null,
    error,
  };
};

export default useTaxi;
