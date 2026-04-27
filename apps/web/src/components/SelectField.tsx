interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export function SelectField({ id, label, value, onChange, options }: SelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-[9px] font-bold tracking-[0.2em] uppercase"
        style={{ color: "var(--text-3)" }}
      >
        {label}
      </label>
      <select
        id={id}
        data-testid={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2.5 text-xs font-medium capitalize outline-none transition-all duration-100"
        style={{ background: "var(--bg-input)", color: "var(--text-1)", border: "none" }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="capitalize">{o.label}</option>
        ))}
      </select>
    </div>
  );
}
