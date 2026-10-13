import { useEffect, useRef } from "react";

// Full-screen voice call modal: incoming, ringing and active states
const CallModal = ({ call, acceptCall, endCall }) => {
  const audioRef = useRef();
  useEffect(() => {
    if (call.remoteStream && audioRef.current) {
      audioRef.current.srcObject = call.remoteStream;
      audioRef.current.play().catch(() => {});
    }
  }, [call.remoteStream]);

  if (call.status === "idle") return null;

  const title =
    call.status === "incoming"
      ? `Входящий звонок: ${call.peerName ?? "участник"}`
      : call.status === "calling" || call.status === "ringing"
        ? `Вызов: ${call.peerName ?? "участник"}`
        : call.status === "connecting"
          ? "Соединение..."
          : call.status === "active"
            ? `Разговор: ${call.peerName ?? "участник"}`
            : call.error ?? "Звонок не состоялся";

  return (
    <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div className="bg-secondary text-primary-text rounded-lg p-6 w-[20rem] text-center">
        <div className="text-lg font-semibold mb-2">{title}</div>
        {call.error && (
          <div className="text-danger text-sm mb-4">{call.error}</div>
        )}
        <audio ref={audioRef} autoPlay />

        {call.status === "incoming" && (
          <div className="flex justify-center gap-4 mt-4">
            <button
              className="bg-danger text-white px-4 py-2 rounded"
              onClick={() => endCall("decline")}
            >
              Отклонить
            </button>
            <button
              className="bg-success text-white px-4 py-2 rounded"
              onClick={acceptCall}
            >
              Ответить
            </button>
          </div>
        )}

        {["calling", "ringing", "connecting", "active"].includes(call.status) && (
          <button
            className="bg-danger text-white px-4 py-2 rounded mt-4"
            onClick={() => endCall("hangup")}
          >
            Завершить
          </button>
        )}
      </div>
    </div>
  );
};

export default CallModal;
