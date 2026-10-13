import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "./api";
import useSocket from "../hooks/useSocket";

// Core state of the taxi workspace: the user, his memberships, the selected
// city and role, zones of the city and live presence
const useTaxi = () => {
  const { socketEmit, socketListen, socket } = useSocket();
  const [me, setMe] = useState(null);
  const [cities, setCities] = useState([]);
  const [cityId, setCityId] = useState(null);
  const [role, setRole] = useState(null);
  const [error, setError] = useState(null);

  const refreshMe = async () => {
    const res = await apiGet("/api/user/me");
    setMe(res.data);
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
        setCityId((prev) => prev ?? res.data.cities[0]?._id ?? null);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Auto-select the role for the chosen city
  const memberships = me?.memberships ?? [];
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

  const userRole = cityMembership(role) ? role : "passenger";

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
