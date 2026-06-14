// Modal.jsx — a minimal dialog used for forms (theme-aware glass).
export default function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/70" onClick={onClose} />
      <div className={`card relative z-10 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] animate-fadeUp overflow-y-auto p-6 shadow-lift`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-fg">{title}</h3>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-line/10 hover:text-fg" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
