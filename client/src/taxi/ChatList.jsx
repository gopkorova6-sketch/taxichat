import { useEffect, useState } from "react";
import { apiGet } from "./api";
import DirectChat from "./DirectChat";

// List of dialogs from direct calls with the peer name, car caption and
// the last message preview (concept 1.6)
const ChatList = ({ onOpen }) => {
  const [chats, setChats] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet("/api/chats/my")
      .then((res) => setChats(res.data.chats))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="text-danger text-sm">{error}</div>;

  if (chats.length === 0) {
    return (
      <div className="text-secondary-text text-sm">
        Диалогов пока нет. Позвоните свободному водителю — диалог появится здесь.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-w-md">
      {chats.map((chat) => (
        <button
          key={chat._id}
          className="w-full text-left bg-secondary rounded p-3 text-sm"
          onClick={() => onOpen(chat._id)}
        >
          <div className="font-semibold">{chat.peer?.name}</div>
          {chat.carCaption && <div className="text-secondary-text">{chat.carCaption}</div>}
          {chat.lastMessage && (
            <div className="text-secondary-text truncate">
              {chat.lastMessage.kind === "photo"
                ? "📷 Фото"
                : chat.lastMessage.kind === "voice"
                  ? "🎤 Голосовое"
                  : chat.lastMessage.body}
            </div>
          )}
        </button>
      ))}
    </div>
  );
};

export default ChatList;
