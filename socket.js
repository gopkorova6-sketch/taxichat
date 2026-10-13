const socketIO = require("socket.io");
const { setIo } = require("./utilities/sockets");

const {
  callRequestController,
  callAcceptedController,
  endCallController,
  callDeniedController,
} = require("./socketControllers/callController");

const {
  onlineController,
  offlineController,
  disconnectingController,
  joinRoomController,
} = require("./socketControllers/connectionController");
const {
  messagingController,
  markMessageReadController,
} = require("./socketControllers/messageController");

const {
  typingController,
  recordingcontroller,
  clearChatRoomController,
} = require("./socketControllers/userActionController");

const { registerOrderCallHandlers } = require("./socketControllers/orderCallController");
const callService = require("./services/callService");

// Attaches Socket.io to an http server; exported as a factory so tests can
// run it on an ephemeral port
const initSocket = (httpServer) => {
  const io = socketIO(httpServer);
  setIo(io);

  io.on("connection", async (socket) => {
    // -------------Connection controls -------------- //
    // socket come online
    onlineController(io, socket);

    // socket goes offline
    offlineController(io, socket);

    // socket disconnecting
    disconnectingController(io, socket);

    // socket joins new room
    joinRoomController(io, socket);
    //--------------------------------------------------//

    // -------------User Action controls -------------- //
    // User typing
    typingController(io, socket);

    // User recording
    recordingcontroller(io, socket);

    // User clears chat room
    clearChatRoomController(io, socket);
    //--------------------------------------------------//

    // -------------Message controls -------------- //
    // User sends message
    messagingController(io, socket);

    // User reads message
    markMessageReadController(io, socket);

    //--------------------------------------------------//

    // ----------------- Legacy call controls --------------- //
    // User makes call request
    callRequestController(io, socket);

    // User accepts call
    callAcceptedController(io, socket);

    // User ends call
    endCallController(io, socket);

    // User denies call
    callDeniedController(io, socket);
    //--------------------------------------------------//

    // ----------- Order voice call signaling ------------ //
    registerOrderCallHandlers(io, socket);
    //--------------------------------------------------//

    socket.on("disconnect", async () => {
      if (socket.userId) {
        await callService.handleDisconnect(io, socket.userId);
      }
    });
  });

  return io;
};

module.exports = initSocket;
