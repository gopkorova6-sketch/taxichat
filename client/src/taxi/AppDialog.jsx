import { createContext, useCallback, useContext, useRef, useState } from "react";

// Styled replacement for window.prompt / window.confirm.
// Usage: const { ask, confirm } = useDialog();
//   const text = await ask({ title, placeholder, initial });   // string | null
//   const ok   = await confirm({ title, text, danger });       // boolean
const DialogContext = createContext(null);

export const DialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState("");
  const resolver = useRef(null);
  const boxRef = useRef(null);


  const open = useCallback((config) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setValue(config.initial ?? "");
      setDialog(config);
    });
  }, []);

  const finish = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  };

  const ask = useCallback((config) => open({ ...config, kind: "ask" }), [open]);
  const confirm = useCallback((config) => open({ ...config, kind: "confirm" }), [open]);

  return (
    <DialogContext.Provider value={{ ask, confirm }}>
      {children}
      {dialog && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 anim-fade">
          <div ref={boxRef} className="glass-strong w-full max-w-[32rem] rounded-3xl p-4 space-y-3 anim-rise max-h-[90dvh] overflow-y-auto">
            <div className="font-display font-bold text-[1.5rem] text-center">{dialog.title}</div>
            {dialog.text && <div className="text-[1.3rem] text-secondary-text text-center">{dialog.text}</div>}
            {dialog.kind === "ask" && (
              <input
                autoFocus
                type={dialog.inputType ?? "text"}
                inputMode={dialog.inputMode}
                className="w-full bg-[#0d0d0d] text-white placeholder:text-secondary-text border border-secondary-text/30 rounded-xl px-3 py-2 text-[1.4rem] focus:border-accent focus:outline-none"
                placeholder={dialog.placeholder}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onFocus={() => setTimeout(() => boxRef.current?.scrollIntoView({ block: "center" }), 300)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") finish(value.trim() || null);
                  if (event.key === "Escape") finish(null);
                }}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl py-2 text-[1.3rem] bg-white/10 border border-white/10"
                onClick={() => finish(dialog.kind === "ask" ? null : false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`rounded-xl py-2 text-[1.3rem] font-bold ${dialog.danger ? "bg-danger text-white" : "btn-accent"}`}
                onClick={() =>
                  finish(dialog.kind === "ask" ? value.trim() || null : true)
                }
              >
                {dialog.okText ?? "Готово"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside DialogProvider");
  return ctx;
};
