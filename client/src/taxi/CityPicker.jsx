import { useEffect, useMemo, useRef, useState } from "react";
import { cityStatusEmoji } from "./statusLabels";

// Выбор города: кнопка с текущим городом. По нажатию раскрывается список вниз.
// Города группируются по первой букве; вверху кнопки букв — нажал букву,
// видишь только её города. Без прокрутки: все строки помещаются целиком.
const CityPicker = ({ cities, cityId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [letter, setLetter] = useState(null);
  const rootRef = useRef(null);
  const current = cities.find((item) => String(item._id) === String(cityId));

  const sorted = useMemo(
    () => [...cities].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [cities]
  );
  const letters = useMemo(
    () => [...new Set(sorted.map((item) => item.name.charAt(0).toUpperCase()))],
    [sorted]
  );
  const shown = useMemo(
    () => (letter ? sorted.filter((item) => item.name.charAt(0).toUpperCase() === letter) : sorted),
    [sorted, letter]
  );

  // Close on a click outside the picker
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const choose = (item) => {
    onSelect(String(item._id));
    setOpen(false);
    setLetter(null);
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        className="press w-full flex items-center justify-between gap-3 glass rounded-2xl px-4 py-3 text-[1.4rem]"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden>📍</span>
          <span className="font-display font-extrabold truncate text-cta-icon">
            {current ? current.name : "Выберите город"}
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0 text-secondary-text text-[1.4rem]">
          {current && <span aria-hidden>{cityStatusEmoji(current.status)}</span>}
          <span aria-hidden>{open ? "🔼" : "🔽"}</span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 glass-strong rounded-2xl p-3 space-y-2 shadow-2xl">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {letters.map((item) => (
              <button
                key={item}
                onClick={() => setLetter(letter === item ? null : item)}
                className={`w-[3.4rem] h-[3.4rem] rounded-lg text-[1.4rem] font-bold ${
                  letter === item ? "btn-accent" : "glass"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {shown.map((item) => {
              const selected = String(item._id) === String(cityId);
              return (
                <button
                  key={item._id}
                  onClick={() => choose(item)}
                  className={`w-full h-[4.2rem] flex items-center justify-between gap-3 rounded-xl px-3 text-[1.4rem] text-left ${
                    selected ? "btn-accent font-extrabold" : "glass"
                  }`}
                >
                  <span className="truncate">{item.name}</span>
                  <span className="shrink-0" aria-hidden>{cityStatusEmoji(item.status)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CityPicker;
