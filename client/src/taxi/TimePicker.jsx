import { useEffect, useMemo, useState } from "react";

// Выбор времени «на время» вместо системного поля: стеклянная панель в стиле
// Бомбилы с прокруткой часов и минут, быстрыми вариантами и суммой «через N».
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
  if (diff < 60) return `через ${diff} ${diff === 1 ? "минуту" : diff < 5 ? "минуты" : "минут"}`;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  return `через ${hours} ч${minutes ? ` ${minutes} мин` : ""}`;
};

const addressDate = (date) =>
  date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });

const TimePicker = ({ value, onChange, open, onClose, title }) => {
  const [cursor, setCursor] = useState(() => parseValue(value));
  const [unit, setUnit] = useState("hours");

  useEffect(() => {
    if (open) setCursor(parseValue(value));
  }, [open, value]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const quick = useMemo(
    () => [
      ["+15 мин", 15],
      ["+30 мин", 30],
      ["+1 час", 60],
      ["+2 часа", 120],
      ["Утро 8:00", null],
      ["Вечер 19:00", null],
    ],
    []
  );

  if (!open) return null;

  const apply = (date) => {
    setCursor(date);
  };

  const commit = () => {
    onChange(toLocalValue(cursor));
    onClose();
  };

  const setPart = (part, amount) => {
    const next = new Date(cursor);
    if (part === "hour") next.setHours(amount);
    else next.setMinutes(amount);
    setCursor(next);
  };

  const shift = (minutes) => {
    const next = new Date(Date.now() + minutes * 60000);
    next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5, 0, 0);
    setCursor(next);
  };

  const setQuick = (label) => {
    const next = new Date(cursor);
    if (label.startsWith("Утро")) next.setHours(8, 0, 0, 0);
    else if (label.startsWith("Вечер")) next.setHours(19, 0, 0, 0);
    setCursor(next);
  };

  return (
    <div className="fixed inset-0 z-[12000] flex items-end sm:items-center justify-center bg-black/70 px-2 pb-2 sm:pb-0 anim-fade" onClick={onClose}>
      <div
        className="w-full max-w-[36rem] glass-strong rounded-3xl p-4 space-y-3 anim-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-display font-extrabold text-[1.7rem]">🕓 {title ?? "Когда подать машину"}</div>
          <button className="btn-back" onClick={onClose} aria-label="Закрыть">✖️</button>
        </div>

        <div className="text-center text-[1.3rem] text-secondary-text">
          {addressDate(cursor)} · <span className="text-cta-icon font-semibold">{relativeLabel(cursor)}</span>
        </div>

        <div className="flex flex-wrap gap-1.5 justify-center">
          {quick.map(([label, minutes]) => (
            <button
              key={label}
              className="press px-3 py-1.5 rounded-xl text-[1.2rem] glass text-cta-icon font-semibold"
              onClick={() => {
                if (minutes == null) setQuick(label);
                else if (typeof minutes === "number") shift(minutes);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex rounded-2xl overflow-hidden">
          {[
            ["hours", "Часы"],
            ["minutes", "Минуты"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`press flex-1 py-2 text-[1.3rem] ${unit === key ? "btn-accent font-bold" : "glass text-secondary-text"}`}
              onClick={() => setUnit(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-[#0d0d0d] border border-secondary-text/25 p-3">
          <div className="text-center font-display font-extrabold text-[3rem] leading-none tracking-wide">
            <span className={unit === "hours" ? "text-cta-icon" : ""}>{pad(cursor.getHours())}</span>
            <span className="text-secondary-text">:</span>
            <span className={unit === "minutes" ? "text-cta-icon" : ""}>{pad(cursor.getMinutes())}</span>
          </div>

          <div className="mt-2 grid grid-cols-6 gap-1.5 max-h-[30dvh] overflow-y-auto">
            {(unit === "hours" ? hours : minutes).map((n) => {
              const selected =
                unit === "hours" ? cursor.getHours() === n : cursor.getMinutes() === n;
              return (
                <button
                  key={n}
                  className={`press py-2 rounded-xl text-[1.3rem] ${
                    selected ? "btn-accent font-bold" : "glass text-primary-text"
                  }`}
                  onClick={() => setPart(unit === "hours" ? "hour" : "minute", n)}
                >
                  {pad(n)}
                </button>
              );
            })}
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