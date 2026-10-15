import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { notificationActions } from "../store/notificationSlice";
import useSocket from "./useSocket";
import { orderStatusNotice, newOrderNotice, newOfferNotice } from "../taxi/orderNotices";

// Global live notices for every role: order status changes, new orders in the
// city and new driver offers. Mounted once for the whole taxi workspace.
const useOrderNotices = () => {
  const dispatch = useDispatch();
  const { socketListen, socket } = useSocket();

  useEffect(() => {
    const onStatus = (payload) => dispatch(notificationActions.addNotification(orderStatusNotice(payload)));
    const onNew = () => dispatch(notificationActions.addNotification(newOrderNotice()));
    const onOffer = () => dispatch(notificationActions.addNotification(newOfferNotice()));
    socketListen("order:status", onStatus);
    socketListen("order:new", onNew);
    socketListen("order:offer", onOffer);
    return () => {
      socket.off("order:status", onStatus);
      socket.off("order:new", onNew);
      socket.off("order:offer", onOffer);
    };
  }, []);
};

export default useOrderNotices;
