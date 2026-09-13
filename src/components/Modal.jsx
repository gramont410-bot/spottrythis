export default function Modal({ open, onClose, title, description, eyebrow = 'Transaction', children, footer, size = 'lg' }) {
  if (!open) return null;

  const sizes = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`transaction-enter max-h-[92vh] w-full ${sizes[size] || sizes.lg} overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-slate-950/60 backdrop-blur-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-1">
          <span className="flex-1 bg-cyan-400" />
          <span className="w-16 bg-emerald-400" />
          <span className="w-10 bg-amber-300" />
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-slate-800/55 px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-semibold uppercase text-cyan-300">{eyebrow}</div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-400 transition-colors hover:border-cyan-400/40 hover:bg-slate-700 hover:text-white"
            aria-label="Close modal"
          >
            x
          </button>
        </div>

        <div className="scroll-invisible max-h-[62vh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-white/10 bg-slate-800/40 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
