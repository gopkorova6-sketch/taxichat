import { useSelector } from "react-redux";
import { io } from "socket.io-client";

const socket = io();

// Rejoin the membership rooms on every (re)connection: after a sleep or a
// network switch the server forgets the room membership, and without
// user:online the phone silently stops receiving order:new / order:status.
socket.on("connect", () => {
  socket.emit("user:online");
  window.__bombilaSocket = { ...(window.__bombilaSocket || {}), online: (window.__bombilaSocket?.online || 0) + 1, id: socket.id };
});

// Debug trace of every order event received by this device
socket.onAny((event) => {
  if (event.startsWith("order")) {
    window.__bombilaSocket = { ...(window.__bombilaSocket || {}), lastOrderEvent: event, lastOrderAt: new Date().toLocaleTimeString("ru-RU") };
  }
});

const useSocket = () => {
  const userId = useSelector((state) => state.userReducer.user._id);

  const socketEmit = (action, payload, fn) => {
    socket.emit(action, payload, fn);
  };

  const socketListen = (action, fn) => {
    socket.on(action, fn);
  };

  return { socketEmit, socketListen, userId, socket };
};

export default useSocket;
