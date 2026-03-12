export function Equalizer({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-end gap-[3px] h-5 ${className}`}>
      <div className="w-[3px] bg-gromq-red rounded-full animate-eq-1" />
      <div className="w-[3px] bg-gromq-red rounded-full animate-eq-2" />
      <div className="w-[3px] bg-gromq-red rounded-full animate-eq-3" />
      <div className="w-[3px] bg-gromq-red rounded-full animate-eq-4" />
    </div>
  );
}
