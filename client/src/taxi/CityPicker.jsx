import { useEffect, useMemo, useRef, useState } from "react";
import { cityStatusEmoji } from "./statusLabels";

// Выбор города: кнопка с текущим городом; список раскрывается ВНИЗ под кнопкой,
// с поиском вверху и прокруткой внутри. Клавиатура открывается только по нажатию
// на поле поиска. Закрывается выбором города или нажатием вне списка.
const CityPicker = ({ cities, cityId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const current = cities.find((item) => String(item._id) === String(cityId));

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = [...cities]
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const map = new Map();
    for (const item of filtered) {
      const letter = item.name.charAt(0).toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter).push(item);
    }
    return [...map.entries()];
  }, [cities, query]);

  // Close when tapping outside the picker
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (item) => {
    onSelect(String(item._id));
    setOpen(false);
    setQuery("");
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
          <input
            className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-xl px-3 py-2 text-[1.4rem] focus:border-accent focus:outline-none"
            placeholder="🔍 Поиск города"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-[40dvh] overflow-y-auto pr-1 space-y-2">
            {groups.length === 0 && (
              <div className="text-center text-[1.4rem] text-secondary-text py-4">😕 Ничего не найдено</div>
            )}
            {groups.map(([letter, items]) => (
              <div key={letter}>
                <div className="font-display font-bold text-cta-icon text-[1.3rem] px-2 py-0.5">{letter}</div>
                <div className="space-y-1.5">
                  {items.map((item) => {
                    const selected = String(item._id) === String(cityId);
                    return (
                      <button
                        key={item._id}
                        onClick={() => choose(item)}
                        className={`press w-full min-h-[3.8rem] flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[1.4rem] text-left ${
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CityPicker;
