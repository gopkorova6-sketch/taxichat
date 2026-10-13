const {
  addMessageToChatRoom,
  checkMembersOffUndeliveredListInMessage,
  addMessageAsUndeliveredToUser,
  addMessageAsUnreadToUser,
  markMessageAsReadByUser,
} = require("../controllers/chatRoomController");

// Sliding-window flood guard: max 30 message packets per minute per socket
const MESSAGE_RATE_LIMIT = 30;
const messageBuckets = new Map();

const allowMessage = (socket) => {
  const now = Date.now();
  const bucket = (messageBuckets.get(socket.id) ?? []).filter(
    (time) => now - time < 60 * 1000
  );
  if (bucket.length >= MESSAGE_RATE_LIMIT) {
    messageBuckets.set(socket.id, bucket);
    return false;
  }
  bucket.push(now);
  messageBuckets.set(socket.id, bucket);
  return true;
};

exports.messagingController = (io, socket) => {
  socket.on("user:message", async ({ chatRoomId, message }) => {
    if (!socket.userId) return;

    if (!allowMessage(socket)) {
      socket.emit("chat:error", {
        error: "Слишком много сообщений, подождите минуту",
      });
      return;
    }

    // The sender is always the verified socket identity
    message.sender = socket.userId;

    // Save message to database
    const { messageObj, day } = await addMessageToChatRoom(chatRoomId, message);

    // Broadcast message to room
    io.timeout(180000)
      .to(chatRoomId)
      .emit(
        "user:message",
        {
          chatRoomId,
          message: messageObj,
          day,
          userId: socket.userId,
        },
        async (error, membersId) => {
          if (error || !Array.isArray(membersId)) {
            // The receiving client left before acknowledging; the message
            // is already stored and marked undelivered
            if (error) console.log("message ack error:", error.message ?? error);
            return;
          }

          // Unique identifier of a message in chatRoom
          const uniqueMessageDetails = {
            chatRoomId,
            day,
            messageId: messageObj._id,
          };

          // Remove members from undelivered list
          const { undeliveredMembers } =
            await checkMembersOffUndeliveredListInMessage({
              ...uniqueMessageDetails,
              membersId: membersId.map((id) => id.toString()),
              io,
            });

          // Add message as undelivered to members that aren't currently online
          await addMessageAsUndeliveredToUser({
            ...uniqueMessageDetails,
            undeliveredMembers,
          });

          // Add message as unread to all members of the room except sender of the messagee
          await addMessageAsUnreadToUser({
            ...uniqueMessageDetails,
            unreadMembers: messageObj.unreadMembers.filter(
              (memberId) =>
                memberId.toString() !== messageObj.sender.toString()
            ),
          });

          // Emit to all users that message can be read
          io.to(chatRoomId).emit("user:messageCanBeRead", {
            ...uniqueMessageDetails,
            message: messageObj,
          });
        }
      );
  });
};

exports.markMessageReadController = (io, socket) => {
  socket.on(
    "user:messageRead",
    async ({ messageId, chatRoomId, day }) => {
      if (!socket.userId) return;
      await markMessageAsReadByUser({
        messageId,
        chatRoomId,
        day,
        userId: socket.userId,
        io,
      });
    }
  );

  socket.on(
    "user:markMessagesAsRead",
    async ({ messages, chatRoomId }) => {
      if (!socket.userId) return;
      for (let { messageId, day } of messages) {
        await markMessageAsReadByUser({
          messageId,
          chatRoomId,
          day,
          userId: socket.userId,
          io,
        });
      }
    }
  );
};
