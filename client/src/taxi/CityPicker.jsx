import { useMemo, useState } from "react";
import { cityStatusEmoji } from "./statusLabels";

// Выбор города: крупная кнопка с текущим городом, по нажатию открывается
// алфавитный список с поиском. Крупные строки — удобно для любого возраста.
const CityPicker = ({ cities, cityId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const choose = (item) => {
    onSelect(String(item._id));
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        className="press w-full flex items-center justify-between gap-3 glass rounded-2xl px-4 py-3 text-[1.4rem]"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden>📍</span>
          <span className="font-display font-extrabold truncate text-cta-icon">
            {current ? current.name : "Выберите город"}
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0 text-secondary-text text-[1.4rem]">
          {current && <span aria-hidden>{cityStatusEmoji(current.status)}</span>}
          <span aria-hidden>🔽</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 pb-[6.5rem] px-2" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-[42rem] glass-strong rounded-3xl p-4 h-[62vh] max-h-[62vh] flex flex-col gap-3 anim-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-display font-extrabold text-[1.7rem]">🏙️ Город</div>
              <button className="btn-back" onClick={() => setOpen(false)}>✖️ Закрыть</button>
            </div>

            <input
              className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-2xl px-4 py-3 text-[1.5rem] focus:border-accent focus:outline-none"
              placeholder="🔍 Поиск города"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <div className="overflow-y-auto flex-1 min-h-0 space-y-3 pr-1">
              {groups.length === 0 && (
                <div className="text-center text-[1.5rem] text-secondary-text py-6">😕 Ничего не найдено</div>
              )}
              {groups.map(([letter, items]) => (
                <div key={letter}>
                  <div className="sticky top-0 font-display font-bold text-cta-icon text-[1.5rem] px-2 py-1 bg-[#161616]/90 rounded-lg">
                    {letter}
                  </div>
                  <div className="mt-1 space-y-2">
                    {items.map((item) => {
                      const selected = String(item._id) === String(cityId);
                      return (
                        <button
                          key={item._id}
                          onClick={() => choose(item)}
                          className={`press w-full min-h-[4.2rem] flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-[1.5rem] text-left ${
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
        </div>
      )}
    </>
  );
};

export default CityPicker;
