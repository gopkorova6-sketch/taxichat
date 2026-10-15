import { useSelector } from "react-redux";
import { io } from "socket.io-client";

const socket = io();

// Rejoin the membership rooms on every (re)connection: after a sleep or a
// network switch the server forgets the room membership, and without
// user:online the phone silently stops receiving order:new / order:status.
socket.on("connect", () => {
  socket.emit("user:online");
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
