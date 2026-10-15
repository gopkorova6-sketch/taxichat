import { useSelector } from "react-redux";
import { io } from "socket.io-client";

const socket = io();

// Rejoin the membership rooms on every (re)connection: after a sleep or a
// network switch the server forgets the room membership, and without
// user:online the phone silently stops receiving order:new / order:status.
socket.on("connect", () => {
  socket.emit("user:online");
  const transport = socket.io?.engine?.transport?.name ?? "?";
  window.__bombilaSocket = { ...(window.__bombilaSocket || {}), online: (window.__bombilaSocket?.online || 0) + 1, id: socket.id, transport };
  // Upgrade from polling to websocket happens after connect; record the final transport
  socket.io.engine.on("upgrade", (t) => {
    window.__bombilaSocket = { ...(window.__bombilaSocket || {}), transport: t.name };
  });
  // Ask the server which rooms this socket is in (diagnostic)
  setTimeout(() => {
    socket.emit("debug:rooms", (res) => {
      const cityRoom = (res?.rooms || []).find((r) => r.startsWith("city:")) ?? "NONE";
      window.__bombilaSocket = { ...(window.__bombilaSocket || {}), cityRoom, rooms: (res?.rooms || []).length };
    });
  }, 1500);
});

// Debug trace of every order event received by this device
socket.onAny((event) => {
  if (event.startsWith("order")) {
    window.__bombilaSocket = { ...(window.__bombilaSocket || {}), lastOrderEvent: event, lastOrderAt: new Date().toLocaleTimeString("ru-RU") };
  }
});

// After a successful login the cookie exists, but the socket may have connected
// anonymously before it. Reconnect so the handshake carries the cookie and the
// server binds the user and joins the membership rooms.
export const reconnectSocket = () => {
  if (socket.connected) socket.disconnect();
  socket.connect();
};

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
