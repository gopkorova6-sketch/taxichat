import { useEffect, useRef, useState } from "react";
import { useReactMediaRecorder } from "react-media-recorder";
import { apiGet, apiPost, apiUpload } from "./api";
import useSocket from "../hooks/useSocket";

// Direct dialog between a passenger and a driver after a call (concept 1.6)
const DirectChat = ({ chatId, me, onBack }) => {
  const { socketListen, socket } = useSocket();
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const load = async () => {
    try {
      const history = await apiGet(`/api/chats/${chatId}/messages`);
      setMessages(history.data.messages);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    apiGet("/api/chats/my")
      .then((res) => {
        const found = res.data.chats.find((item) => String(item._id) === String(chatId));
        setChat(found ?? { peer: { name: "Диалог" } });
      })
      .catch((err) => setError(err.message));
    load();
    // Mark the dialog as read while it is open
    apiPost(`/api/chats/${chatId}/read`, {}).catch(() => {});
    const onChanged = () => {
      load();
      apiPost(`/api/chats/${chatId}/read`, {}).catch(() => {});
    };
    socketListen("chat:message", onChanged);
    return () => {
      socket.off("chat:message", onChanged);
    };
  }, [chatId]);

  const send = async (payload) => {
    try {
      await apiPost(`/api/chats/${chatId}/messages`, payload);
      setText("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const blockPeer = async () => {
    if (!chat?.peer?._id) return;
    if (!window.confirm("Заблокировать собеседника? Звонки и диалоги станут недоступны.")) return;
    try {
      await apiPost("/api/blocks", { userId: String(chat.peer._id) });
      setError("Собеседник заблокирован");
    } catch (err) {
      setError(err.message);
    }
  };

  const fileInputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef();

  const { startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    blobPropertyBag: { type: "audio/mp3" },
    onStop: async (_, blob) => {
      try {
        setUploading(true);
        const uploadData = await apiUpload(blob, "audio");
        await send({
          kind: "voice",
          voiceNoteUrl: uploadData.secure_url,
          voiceNoteDuration: Math.max(1, recordSeconds),
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading(false);
        setRecording(false);
        setRecordSeconds(0);
      }
    },
  });

  const toggleRecording = () => {
    if (recording) {
      clearInterval(recordTimerRef.current);
      stopRecording();
    } else {
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(
        () => setRecordSeconds((seconds) => seconds + 1),
        1000
      );
      setRecording(true);
      startRecording();
    }
  };

  const onPickPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setUploading(true);
      const uploadData = await apiUpload(file, "image");
      await send({ kind: "photo", imageUrl: uploadData.secure_url });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const renderMessage = (message) => {
    if (message.kind === "photo") {
      return (
        <div
          key={message._id}
          className={`anim-rise max-w-[78%] rounded-2xl p-2.5 text-sm ${message.mine ? "btn-accent ml-auto" : "glass"}`}
        >
          {message.senderName && <div className="text-xs text-secondary-text">{message.senderName}</div>}
          <img src={message.meta?.imageUrl} alt="Фото" className="rounded max-h-[16rem]" />
        </div>
      );
    }
    if (message.kind === "voice") {
      return (
        <div
          key={message._id}
          className={`anim-rise max-w-[78%] rounded-2xl p-2.5 text-sm ${message.mine ? "btn-accent ml-auto" : "glass"}`}
        >
          {message.senderName && <div className="text-xs text-secondary-text">{message.senderName}</div>}
          <div className="flex items-center gap-2">
            <span>🎤</span>
            <audio controls src={message.meta?.voiceNoteUrl} />
          </div>
        </div>
      );
    }
    return (
      <div
        key={message._id}
        className={`anim-rise max-w-[78%] rounded-2xl p-2.5 text-sm ${message.mine ? "btn-accent ml-auto" : "glass"}`}
      >
        {message.senderName && <div className="text-xs text-secondary-text">{message.senderName}</div>}
        {message.body}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="relative p-3 border-b border-secondary-text/20">
        <button className="underline absolute left-3 top-3 text-sm" onClick={onBack}>← Назад</button>
        <div className="text-center px-16 font-semibold truncate">
          Диалог: {chat?.peer?.name ?? "..."}
        </div>
        {chat?.peer?._id && (
          <button
            className="absolute right-3 top-3 underline text-secondary-text text-sm"
            onClick={blockPeer}
          >
            Блок
          </button>
        )}
      </div>

      {error && <div className="text-danger text-sm px-3 py-1">{error}</div>}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-secondary-text text-sm">
            Сообщений пока нет. Диалог появился после звонка.
          </div>
        )}
        {messages.map(renderMessage)}
      </div>

      <form
        className="flex gap-2 p-3 border-t border-secondary-text/20"
        onSubmit={(event) => {
          event.preventDefault();
          send({ body: text });
        }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
        <button type="button" className="px-2 text-lg" onClick={() => fileInputRef.current?.click()}>
          📷
        </button>
        <button
          type="button"
          className={`px-2 text-lg ${recording ? "text-danger animate-pulse" : ""}`}
          onClick={toggleRecording}
        >
          {recording ? `⏺ ${recordSeconds}с` : "🎤"}
        </button>
        <input
          className="flex-1 bg-primary/70 border border-secondary-text/20 rounded-2xl px-4 py-2.5 text-[1.5rem] focus:border-accent focus:outline-none transition-colors"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={uploading ? "Загрузка..." : "Сообщение..."}
          disabled={uploading || recording}
        />
        <button className="press btn-accent px-4 rounded-2xl font-display font-bold" type="submit">➤</button>
      </form>
    </div>
  );
};

export default DirectChat;

