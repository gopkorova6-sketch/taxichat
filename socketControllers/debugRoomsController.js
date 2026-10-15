// Diagnostic: returns the rooms of the calling socket (only for the socket owner)
exports.debugRoomsController = (io, socket) => {
  socket.on("debug:rooms", (ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    reply({
      userId: socket.userId ?? null,
      rooms: [...socket.rooms].filter((room) => room !== socket.id),
    });
  });
};
