import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import useSocket from "./useSocket";
import { orderStatusNotice, newOrderNotice, newOfferNotice } from "../taxi/orderNotices";

// Live notices for the current role only:
//  - driver/dispatcher: new orders in the city
//  - passenger: offers and status of own orders
//  - participant (passenger or assigned driver): status of own order
// The server sends each status change twice: to the order room (scope "order")
// and to the city feed (scope "city"). Only the order-room copy shows a notice;
// the city copy just refreshes lists, so nothing is shown twice.
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
    const onOffer = (payload) => {
      if (roleRef.current === "passenger") show(newOfferNotice(payload));
    };
    const onStatus = (payload) => {
      if (payload?.scope !== "order") return;
      const me = String(userRef.current ?? "");
      const isParticipant =
        String(payload?.passengerId) === me || String(payload?.driverId) === me;
      if (isParticipant) show(orderStatusNotice(payload));
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
