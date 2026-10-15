import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import STREETS from "./streetsData";

// Поле адреса с текстовыми подсказками: чисто по названию, без координат и
// геокодинга. Панель раскрывается ВВЕРХ и прокручивается, поверх всех слоёв.
// Кроме улиц подсказываются слова-связки маршрута: от/с в начале,
// до/на для конца и «с заездом на» в любой точке маршрута, плюс туда-обратно.
const normalize = (text) => String(text ?? "").toLowerCase().replace(/ё/g, "е").replace(/\./g, "").trim();

// Сокращение типов улиц для отображения и вставки
// \b не работает с кириллицей, поэтому тип слова ловим по границам строки/пробелов
const SHORT = [
  [/(^|\s)улица(\s|$)/gi, "$1ул.$2"],
  [/(^|\s)переулок(\s|$)/gi, "$1пер.$2"],
  [/(^|\s)проспект(\s|$)/gi, "$1просп.$2"],
  [/(^|\s)площадь(\s|$)/gi, "$1пл.$2"],
  [/(^|\s)бульвар(\s|$)/gi, "$1б-р$2"],
  [/(^|\s)шоссе(\s|$)/gi, "$1ш.$2"],
  [/(^|\s)тракт(\s|$)/gi, "$1тр.$2"],
  [/(^|\s)микрорайон(\s|$)/gi, "$1мкр$2"],
  [/(^|\s)проезд(\s|$)/gi, "$1пр-д$2"],
];
const shorten = (name) => SHORT.reduce((acc, [re, to]) => acc.replace(re, to), String(name ?? "")).trim();

const matchStreets = (query, limit = 8) => {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(/[\s,]+/).filter(Boolean);
  const tail = words[words.length - 1] ?? q;
  const starts = [];
  const contains = [];
  for (const street of STREETS) {
    const short = shorten(street.n);
    const full = normalize(street.n);
    const shortN = normalize(short);
    if (shortN.startsWith(tail) || full.startsWith(tail)) starts.push({ ...street, short });
    else if (shortN.includes(tail) || full.includes(tail)) contains.push({ ...street, short });
  }
  return [...starts, ...contains].slice(0, limit);
};

// Слова-связки: заезд доступен в любой точке маршрута
const routeChips = (text) => {
  const t = String(text ?? "");
  const hasOrigin = /^\s*(от|с)\s/i.test(t);
  const chips = [];
  if (!hasOrigin) chips.push("от", "с");
  else chips.push("до", "на", "с заездом на");
  chips.push("туда-обратно");
  return chips;
};

const chipText = (chip) => {
  if (chip === "от" || chip === "с") return `${chip} `;
  if (chip === "до" || chip === "на") return `, ${chip} `;
  if (chip === "заезд на") return `, заезд на `;
  if (chip === "с заездом на") return `, с заездом на `;
  if (chip === "туда-обратно") return ", туда-обратно";
  return `${chip} `;
};

const AddressInput = ({ value, onChange, onEnter, placeholder, cityName }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const [rect, setRect] = useState(null);

  // Позиция панели считается от поля: панель выносится в портал, поверх
  // всех слоёв, поэтому не уходит под шапку и не обрезается родителем
  const measure = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, width: r.width, top: r.top });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    measure();
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.visualViewport?.addEventListener("resize", onChange);
    window.visualViewport?.addEventListener("scroll", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.visualViewport?.removeEventListener("resize", onChange);
      window.visualViewport?.removeEventListener("scroll", onChange);
    };
  }, [open]);

  const suggestions = useMemo(() => matchStreets(value), [value]);
  const chips = useMemo(() => routeChips(value), [value]);

  useEffect(() => {
    const onOutside = (event) => {
      const inside = (wrapRef.current && wrapRef.current.contains(event.target)) || (panelRef.current && panelRef.current.contains(event.target));
      if (!inside) setOpen(false);
    };
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, []);

  const insert = (text) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? String(value ?? "").length;
    const end = el?.selectionEnd ?? start;
    const current = String(value ?? "");
    const next = current.slice(0, start) + text + current.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  const applyStreet = (street) => {
    const name = street.short ?? shorten(street.n);
    const current = String(value ?? "");
    const trailing = current.match(/[^\s,]*$/);
    if (trailing && trailing[0]) {
      const head = current.slice(0, current.length - trailing[0].length);
      onChange(`${head}${name}, `);
    } else {
      insert(`${name}, `);
    }
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
        applyStreet(suggestions[active]);
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
        ref={inputRef}
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

{open && rect && createPortal(
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            bottom: Math.max(window.innerHeight - rect.top + 4, 4),
            maxHeight: "46dvh",
          }}
          className="z-[100000] glass-strong rounded-2xl overflow-hidden flex flex-col shadow-2xl"
        >
          <div className="flex flex-wrap gap-1.5 p-2 border-b border-white/10 shrink-0">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => insert(chipText(chip))}
                className="press px-2.5 py-1 rounded-xl text-[1.2rem] glass text-cta-icon font-semibold"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto overscroll-contain">
            {cityName && (
              <div className="px-3 py-1.5 text-[1.1rem] text-secondary-text">
                🛣 Улицы · {cityName} и район
              </div>
            )}
            {suggestions.length === 0 && (
              <div className="px-3 py-2 text-[1.2rem] text-secondary-text">
                Продолжайте вводить название улицы
              </div>
            )}
            {suggestions.map((street, index) => (
              <button
                key={`${street.l}-${street.n}-${index}`}
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => applyStreet(street)}
                className={`w-full text-left px-3 py-2 text-[1.4rem] flex items-center justify-between gap-2 ${
                  index === active ? "bg-white/15" : ""
                }`}
              >
                <span className="truncate">{street.short}</span>
                <span className="shrink-0 text-[1.1rem] text-secondary-text">{street.l}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AddressInput;