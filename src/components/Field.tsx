import { useState, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] text-surface-500">{hint}</p>}
    </div>
  )
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string
  hint?: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <Field label={label} hint={hint}>
      <input className={`input ${mono ? 'font-mono text-[13px]' : ''}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

/** Password-style input with a show/hide toggle, for keys and connection strings. */
export function SecretField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string
  hint?: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          className="input font-mono text-[13px] pr-10"
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-surface-500 hover:text-surface-200"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? t('settings.secretHide') : t('settings.secretShow')}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </Field>
  )
}
