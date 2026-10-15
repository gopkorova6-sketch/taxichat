import { useEffect, useState } from "react";

// Простой выбор времени «на время»: без сеток цифр. День — «Сегодня/Завтра»,
// время — крупное табло с шаговыми кнопками «−/+» для часа и минуты.
// Значение отдаётся в формате datetime-local (YYYY-MM-DDTHH:mm).
const pad = (v) => String(v).padStart(2, "0");

const toLocalValue = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;

const parseValue = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(Date.now() + 3600000) : date;
};

const relativeLabel = (date) => {
  const diff = Math.round((date.getTime() - Date.now()) / 60000);
  if (diff <= 0) return "сейчас";
  if (diff < 60) return `через ${diff} мин`;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  return `через ${hours} ч${minutes ? ` ${minutes} мин` : ""}`;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const TimePicker = ({ value, onChange, open, onClose, title }) => {
  const [cursor, setCursor] = useState(() => parseValue(value));

  useEffect(() => {
    if (open) setCursor(parseValue(value));
  }, [open, value]);

  if (!open) return null;

  const step = (part, delta) => {
    const next = new Date(cursor);
    if (part === "hour") next.setHours(next.getHours() + delta);
    else next.setMinutes(next.getMinutes() + delta * 5);
    setCursor(next);
  };

  const setDay = (offset) => {
    const next = new Date(cursor);
    const today = new Date();
    next.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    setCursor(next);
  };

  const commit = () => {
    onChange(toLocalValue(cursor));
    onClose();
  };

  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400000);

  return (
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 px-3 py-4 anim-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[32rem] glass-strong rounded-3xl p-4 space-y-4 anim-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-display font-extrabold text-[1.7rem]">🕓 {title ?? "Когда подать"}</div>
          <button className="btn-back" onClick={onClose} aria-label="Закрыть">✖️</button>
        </div>

        <div className="flex rounded-2xl overflow-hidden">
          {[
            ["Сегодня", today],
            ["Завтра", tomorrow],
          ].map(([label, day]) => {
            const selected = isSameDay(cursor, day);
            return (
              <button
                key={label}
                className={`press flex-1 py-2.5 text-[1.4rem] ${selected ? "btn-accent font-bold" : "glass text-secondary-text"}`}
                onClick={() => setDay(label === "Завтра" ? 1 : 0)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl bg-[#0d0d0d] border border-secondary-text/25 py-4 text-center">
          <div className="font-display font-extrabold text-[4.5rem] leading-none tracking-wide">
            {pad(cursor.getHours())}
            <span className="text-secondary-text">:</span>
            {pad(cursor.getMinutes())}
          </div>
          <div className="mt-2 text-[1.3rem] text-cta-icon font-semibold">{relativeLabel(cursor)}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl glass p-2 flex items-center justify-between">
            <button
              className="press w-[3.6rem] h-[3.6rem] rounded-full bg-white/10 text-[2rem] font-bold"
              onClick={() => step("hour", -1)}
              aria-label="Минус час"
            >
              −
            </button>
            <span className="text-[1.3rem] text-secondary-text">час</span>
            <button
              className="press w-[3.6rem] h-[3.6rem] rounded-full btn-accent text-[2rem] font-bold"
              onClick={() => step("hour", 1)}
              aria-label="Плюс час"
            >
              +
            </button>
          </div>

          <div className="rounded-2xl glass p-2 flex items-center justify-between">
            <button
              className="press w-[3.6rem] h-[3.6rem] rounded-full bg-white/10 text-[2rem] font-bold"
              onClick={() => step("minute", -1)}
              aria-label="Минус пять минут"
            >
              −
            </button>
            <span className="text-[1.3rem] text-secondary-text">5 мин</span>
            <button
              className="press w-[3.6rem] h-[3.6rem] rounded-full btn-accent text-[2rem] font-bold"
              onClick={() => step("minute", 1)}
              aria-label="Плюс пять минут"
            >
              +
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="press rounded-2xl py-3 text-[1.4rem] glass" onClick={onClose}>
            Отмена
          </button>
          <button className="press rounded-2xl py-3 text-[1.4rem] btn-accent font-bold" onClick={commit}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimePicker;