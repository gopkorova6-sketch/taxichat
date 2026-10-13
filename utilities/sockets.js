// Registry for the Socket.io server instance so REST controllers can emit
// the same events as the socket layer
let ioInstance = null;

const setIo = (io) => {
  ioInstance = io;
};

const getIo = () => ioInstance;

// Emits the side effects returned by the order state machine
const emitOrderEvents = (sideEffects = []) => {
  const io = getIo();
  if (!io) return;
  for (const effect of sideEffects) {
    io.to(effect.room).emit(effect.event, effect.payload);
  }
};

module.exports = { setIo, getIo, emitOrderEvents };
