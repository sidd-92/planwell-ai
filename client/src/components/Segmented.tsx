import type { CSSProperties } from 'react';

interface Props<T extends string> {
  name: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  style?: CSSProperties;
}

export function Segmented<T extends string>({ name, options, value, onChange, style }: Props<T>) {
  return (
    <div className="seg" role="radiogroup" style={style}>
      {options.map((o) => (
        <label key={o} className="seg-opt">
          <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}
