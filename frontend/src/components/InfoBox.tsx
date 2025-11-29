export default function InfoBox({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      {title && <p className="mb-1 font-semibold text-slate-700">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

