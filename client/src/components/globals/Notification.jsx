import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { notificationActions } from "../../store/notificationSlice";
import { motion, AnimatePresence } from "framer-motion";

// Auto-dismiss: every notification leaves on its own after this delay
const LIFETIME_MS = 60 * 1000;

// Voice: notifications marked speak=true are read aloud (Russian)
const speak = (text) => {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
};

function NotificationItem({ item, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [item.id]);

  useEffect(() => {
    if (item.speak) speak(item.speakText || item.message);
  }, [item.id]);

  return (
    <motion.div
      initial={{ translateX: "100%", opacity: 0 }}
      animate={{ translateX: 0, opacity: 1 }}
      exit={{ translateX: "100%", opacity: 0 }}
      className={`glass-strong w-full min-w-0 flex items-center gap-2 rounded-2xl px-3 py-2 text-[1.4rem] border-l-[3px] ${
        item.type === "error" ? "border-l-danger" : "border-l-cta-icon"
      }`}
    >
      <span className="flex-1 min-w-0 break-words">{item.message}</span>
      <button
        onClick={() => onDismiss(item.id)}
        className="shrink-0 w-[3rem] h-[3rem] flex items-center justify-center rounded-full text-secondary-text"
        aria-label="Закрыть"
      >
        ✖️
      </button>
    </motion.div>
  );
}

function Notification() {
  const notifications = useSelector((state) => state.notificationReducer);
  const dispatch = useDispatch();
  const dismiss = (id) => dispatch(notificationActions.removeNotification(id));

  return (
    <div className="fixed top-[6rem] left-2 right-2 sm:left-auto sm:right-3 sm:w-[34rem] max-w-[calc(100vw-1rem)] z-[10000] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map((item) => (
          <div key={item.id} className="pointer-events-auto w-full min-w-0">
            <NotificationItem item={item} onDismiss={dismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default Notification;
