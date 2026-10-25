export function Titlebar({ name }: { name: string }) {
  return (
    <header className="titlebar">
      <span className="brand-mark" aria-hidden>
        {name[0]}
      </span>
      <span className="brand-name">{name}</span>
    </header>
  );
}
