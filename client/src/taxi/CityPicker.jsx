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
        className="press w-full flex items-center justify-between gap-3 glass rounded-2xl px-4 py-3 text-[2rem]"
        onClick={() => setOpen(true)}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden>📍</span>
          <span className="font-display font-extrabold truncate text-cta-icon">
            {current ? current.name : "Выберите город"}
          </span>
        </span>
        <span className="flex items-center gap-1 shrink-0 text-secondary-text text-[1.6rem]">
          {current && <span aria-hidden>{cityStatusEmoji(current.status)}</span>}
          <span aria-hidden>🔽</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm anim-fade" onClick={() => setOpen(false)}>
          <div
            className="mt-auto glass-strong rounded-t-3xl p-4 pb-6 max-h-[88vh] flex flex-col gap-3 anim-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-display font-extrabold text-[2.2rem]">🏙️ Город</div>
              <button className="btn-back" onClick={() => setOpen(false)}>✖️ Закрыть</button>
            </div>

            <input
              className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-2xl px-4 py-3 text-[1.8rem] focus:border-accent focus:outline-none"
              placeholder="🔍 Поиск города"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {groups.length === 0 && (
                <div className="text-center text-[1.8rem] text-secondary-text py-6">😕 Ничего не найдено</div>
              )}
              {groups.map(([letter, items]) => (
                <div key={letter}>
                  <div className="sticky top-0 font-display font-bold text-cta-icon text-[1.8rem] px-2 py-1 bg-[#161616]/90 rounded-lg">
                    {letter}
                  </div>
                  <div className="mt-1 space-y-2">
                    {items.map((item) => {
                      const selected = String(item._id) === String(cityId);
                      return (
                        <button
                          key={item._id}
                          onClick={() => choose(item)}
                          className={`press w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-4 text-[1.9rem] text-left ${
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
