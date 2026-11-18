export default function PageHeader({ title, children }) {
  return (
    <header className="mb-8">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
      {children && <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">{children}</p>}
    </header>
  );
}
