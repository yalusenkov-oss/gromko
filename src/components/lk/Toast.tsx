import { CheckCircle, Info } from "lucide-react";

export interface ToastItem {
  id: number;
  message: string;
  type: "success" | "info";
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-container fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-gromq-card border border-gromq-border rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl shadow-black/50 animate-toast-in min-w-[220px] sm:min-w-[260px] max-w-[90vw]"
        >
          {toast.type === "success" ? (
            <CheckCircle size={18} className="text-gromq-green shrink-0" />
          ) : (
            <Info size={18} className="text-gromq-red shrink-0" />
          )}
          <span className="text-sm text-gromq-text">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
