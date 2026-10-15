import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import useSocket from "./useSocket";
import { orderStatusNotice, newOrderNotice, newOfferNotice } from "../taxi/orderNotices";

// Live notices for the current role only:
//  - driver/dispatcher: new orders in the city
//  - passenger: offers and status of own orders
//  - everyone who is a participant (passenger or assigned driver): status
const useOrderNotices = ({ role, userId }) => {
  const dispatch = useDispatch();
  const { socketListen, socket } = useSocket();
  const roleRef = useRef(role);
  const userRef = useRef(userId);
  roleRef.current = role;
  userRef.current = userId;

  useEffect(() => {
    const show = (notice) => dispatch(notificationActions.addNotification(notice));

    const onNew = () => {
      if (["driver", "dispatcher", "region_admin"].includes(roleRef.current)) show(newOrderNotice());
    };
    const onOffer = () => {
      if (roleRef.current === "passenger") show(newOfferNotice());
    };
    const onStatus = (payload) => {
      const me = String(userRef.current ?? "");
      const isParticipant =
        String(payload?.passengerId) === me || String(payload?.driverId) === me;
      // Room-scoped copy: only participants receive it. City-scoped copy is for
      // drivers/dispatchers watching the feed, and never for the passenger.
      if (payload?.scope === "order" && isParticipant) show(orderStatusNotice(payload));
      if (payload?.scope === "city" && roleRef.current !== "passenger" && String(payload?.driverId) === me) {
        show(orderStatusNotice(payload));
      }
    };

    socketListen("order:new", onNew);
    socketListen("order:offer", onOffer);
    socketListen("order:status", onStatus);
    return () => {
      socket.off("order:new", onNew);
      socket.off("order:offer", onOffer);
      socket.off("order:status", onStatus);
    };
  }, []);
};

export default useOrderNotices;
