import { useEffect, useRef, useState } from "react";
import { startRingtone, stopRingtone, playDialTone } from "./ringtone";

// Full-screen call UI in the Android style.
// Incoming: accept / decline. Outgoing: "Вызов...". Active: duration, mute,
// speaker and a dialpad, no recording (as requested).
const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const CallModal = ({ call, acceptCall, endCall }) => {
  const audioRef = useRef();
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [dialOpen, setDialOpen] = useState(false);
  const [digits, setDigits] = useState("");

  useEffect(() => {
    if (call.remoteStream && audioRef.current) {
      audioRef.current.srcObject = call.remoteStream;
      audioRef.current.play().catch(() => {});
    }
  }, [call.remoteStream]);

  // Ring while incoming; dial tone while the other side is being called
  useEffect(() => {
    if (call.status === "incoming") startRingtone(call.whoLabel);
    else if (call.status === "calling" || call.status === "ringing") {
      playDialTone();
      const id = setInterval(playDialTone, 3200);
      return () => clearInterval(id);
    } else stopRingtone();
    return () => stopRingtone();
  }, [call.status, call.whoLabel]);

  // Talk timer once the line is active
  useEffect(() => {
    if (call.status !== "active") { setSeconds(0); return undefined; }
    const id = setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [call.status]);

  // Mute / speaker on the live audio tracks
  useEffect(() => { if (call.audioTracks) call.audioTracks.forEach((t) => { t.enabled = !muted; }); }, [muted, call.audioTracks]);
  useEffect(() => { if (call.speakerSink) call.speakerSink(speaker); }, [speaker, call.speakerSink]);

  if (call.status === "idle") return null;

  const incoming = call.status === "incoming";
  const active = call.status === "active";
  const outgoing = call.status === "calling" || call.status === "ringing" || call.status === "connecting";

  const statusText = incoming
    ? `Входящий звонок · ${call.peerRoleLabel ?? "участник"}`
    : outgoing
      ? `Вызов... · ${call.peerRoleLabel ?? "участник"}`
      : active
        ? formatDuration(seconds)
        : call.error ?? "Звонок не состоялся";

  return (
    <div className="fixed inset-0 z-[12000] flex flex-col bg-[#0b0f14] text-white">
      <audio ref={audioRef} data-call-audio autoPlay />

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-[9rem] h-[9rem] rounded-full bg-white/10 flex items-center justify-center text-[3.4rem]">
          {call.peerEmoji ?? "👤"}
        </div>
        <div className="font-display font-extrabold text-[2rem] break-words">
          {call.peerName ?? "Участник"}
        </div>
        <div className={`text-[1.5rem] ${active ? "text-success" : "text-white/70"}`}>
          {statusText}
        </div>
        {call.error && <div className="text-danger text-[1.4rem]">{call.error}</div>}
      </div>

      {dialOpen && active && (
        <div className="px-6 pb-4">
          <div className="text-center text-[1.8rem] min-h-[2.2rem] mb-2">{digits}</div>
          <div className="grid grid-cols-3 gap-2">
            {["1","2","3","4","5","6","7","8","9","*","0","#"].map((d) => (
              <button
                key={d}
                onClick={() => setDigits((v) => v + d)}
                className="py-3 rounded-xl bg-white/10 text-[1.6rem] font-semibold"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-6 pt-2">
        {incoming ? (
          <div className="flex items-center justify-around">
            <button
              className="w-[7rem] h-[7rem] rounded-full bg-danger flex items-center justify-center text-[2.4rem]"
              onClick={() => endCall("decline")}
              aria-label="Отклонить"
            >
              📵
            </button>
            <button
              className="w-[7rem] h-[7rem] rounded-full bg-success flex items-center justify-center text-[2.4rem] animate-pulse"
              onClick={acceptCall}
              aria-label="Ответить"
            >
              📞
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-4 mb-5">
              <button
                onClick={() => setMuted((v) => !v)}
                className={`w-[6rem] h-[6rem] rounded-full flex flex-col items-center justify-center text-[1.1rem] ${muted ? "bg-white text-black" : "bg-white/10"}`}
              >
                <span className="text-[1.8rem]">{muted ? "🔇" : "🎙"}</span>
                Микро
              </button>
              <button
                onClick={() => setSpeaker((v) => !v)}
                className={`w-[6rem] h-[6rem] rounded-full flex flex-col items-center justify-center text-[1.1rem] ${speaker ? "bg-white text-black" : "bg-white/10"}`}
              >
                <span className="text-[1.8rem]">🔊</span>
                Громко
              </button>
              <button
                onClick={() => setDialOpen((v) => !v)}
                className={`w-[6rem] h-[6rem] rounded-full flex flex-col items-center justify-center text-[1.1rem] ${dialOpen ? "bg-white text-black" : "bg-white/10"}`}
              >
                <span className="text-[1.8rem]">🔢</span>
                Клавиши
              </button>
            </div>
            <div className="flex justify-center">
              <button
                className="w-[7rem] h-[7rem] rounded-full bg-danger flex items-center justify-center text-[2.4rem]"
                onClick={() => endCall("hangup")}
                aria-label="Завершить"
              >
                📵
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CallModal;
