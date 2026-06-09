interface ColorFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  const normalizedValue = normalizeHex(value) ?? '#000000'

  return (
    <label className="color-field">
      <span>{label}</span>
      <div className="color-field-controls">
        <input
          key={normalizedValue}
          type="text"
          defaultValue={normalizedValue}
          aria-label={`${label} hex color`}
          spellCheck={false}
          onBlur={(event) => {
            const normalized = normalizeHex(event.currentTarget.value)
            if (normalized) {
              onChange(normalized)
            } else {
              event.currentTarget.value = normalizedValue
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          }}
        />
        <input
          type="color"
          value={normalizedValue}
          aria-label={`${label} color picker`}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  )
}

function normalizeHex(value: string) {
  const candidate = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(candidate)) {
    return candidate
  }
  if (/^#[0-9a-f]{3}$/.test(candidate)) {
    return `#${candidate
      .slice(1)
      .split('')
      .map((character) => character.repeat(2))
      .join('')}`
  }
  return null
}

export default ColorField
