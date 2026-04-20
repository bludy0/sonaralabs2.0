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
        style={{ color: "#484848" }}
      >
        {label}
      </label>
      <select
        id={id}
        data-testid={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2.5 text-xs font-medium capitalize outline-none transition-all duration-100"
        style={{ background: "#1f2937", color: "#ffffff", border: "none" }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#131313] capitalize">{o.label}</option>
        ))}
      </select>
    </div>
  );
}
