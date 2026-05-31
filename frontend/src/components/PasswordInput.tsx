import { InputHTMLAttributes, useState } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Password field with a show/hide toggle. */
export function PasswordInput({ id, className, ...props }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`password-input${className ? ` ${className}` : ''}`}>
      <input id={id} type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
