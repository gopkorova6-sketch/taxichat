import { useEffect, useMemo, useRef, useState } from "react";
import STREETS from "./streetsData";
import { cityStatusEmoji } from "./statusLabels";

// Поле адреса с текстовыми подсказками улиц: чисто по названию, без координат
// и геокодинга. Подсказки фильтруются по последнему слову ввода, поэтому
// работают и внутри строки вида «от ЖД до Центра».
const normalize = (text) => String(text ?? "").toLowerCase().replace(/ё/g, "е").trim();

// Совпадения по последнему слову (или по всей строке, если слово одно)
const matchStreets = (query, limit = 6) => {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(/[\s,]+/).filter(Boolean);
  const tail = words[words.length - 1] ?? q;
  const starts = [];
  const contains = [];
  for (const street of STREETS) {
    const name = normalize(street.n);
    if (name.startsWith(tail)) starts.push(street);
    else if (name.includes(tail)) contains.push(street);
  }
  return [...starts, ...contains].slice(0, limit);
};

const AddressInput = ({ value, onChange, onEnter, placeholder, cityName, listId }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const wrapRef = useRef(null);

  const suggestions = useMemo(() => matchStreets(value), [value]);

  useEffect(() => {
    const onOutside = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, []);

  const apply = (street) => {
    // Дописываем выбранную улицу вместо последнего слова и ставим запятую
    const text = String(value ?? "");
    const words = text.split(/(\s|,)/);
    let cut = text.length;
    const trailing = text.match(/[^\s,]*$/);
    if (trailing) cut = text.length - trailing[0].length;
    const head = text.slice(0, cut);
    onChange(`${head}${street.n}, `);
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (event) => {
    if (open && suggestions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" && suggestions[active]) {
        event.preventDefault();
        apply(suggestions[active]);
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    if (event.key === "Enter") onEnter?.(event);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-2xl p-3 focus:border-accent focus:outline-none transition-colors text-[1.4rem] text-primary-text"
        required
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div
          ref={boxRef}
          id={listId}
          className="absolute left-0 right-0 top-full mt-1 z-50 glass-strong rounded-2xl overflow-hidden max-h-[40dvh] overflow-y-auto"
        >
          {cityName && (
            <div className="px-3 py-1.5 text-[1.1rem] text-secondary-text border-b border-white/10">
              🛣 Улицы · {cityName} и район
            </div>
          )}
          {suggestions.map((street, index) => (
            <button
              key={`${street.l}-${street.n}-${index}`}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => apply(street)}
              className={`w-full text-left px-3 py-2 text-[1.4rem] flex items-center justify-between gap-2 ${
                index === active ? "bg-white/15" : ""
              }`}
            >
              <span className="truncate">{street.n}</span>
              <span className="shrink-0 text-[1.1rem] text-secondary-text">
                {street.l}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressInput;