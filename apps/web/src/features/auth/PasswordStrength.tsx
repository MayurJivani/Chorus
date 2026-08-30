/**
 * Live guidance while someone types a password.
 *
 * Deliberately *guidance*, not a gate. The rule lives on the server (`utils/passwordPolicy.ts`)
 * and is enforced there; this only tries to save a round trip and stop people discovering the
 * requirements by being rejected. Because it is advisory, it does not need to mirror the server
 * exactly — and it is written to under-warn rather than over-warn, so the only possible
 * disagreement is the harmless direction: the client stays quiet and the server still refuses.
 *
 * There is no shared package between the two apps, so a full mirror would be a copy that drifts.
 * Keeping this to the cheap, obvious checks is the deliberate alternative.
 */

interface PasswordStrengthProps {
  password: string;
  email?: string;
  displayName?: string;
}

const MIN_LENGTH = 8;

/** The subset of the server's checks that are cheap and unambiguous. */
function advisoryProblems(password: string, email?: string, displayName?: string): string[] {
  if (!password) return [];
  const problems: string[] = [];
  const lower = password.toLowerCase();

  if (password.length < MIN_LENGTH) problems.push(`At least ${MIN_LENGTH} characters`);
  if (password !== password.trim()) problems.push('No space at the start or end');
  if (password.length >= MIN_LENGTH && /^(.)\1+$/.test(password)) {
    problems.push('Not one character repeated');
  }

  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) {
    problems.push('Not based on your email');
  }
  const name = displayName?.toLowerCase().replace(/\s+/g, '');
  if (name && name.length >= 3 && lower.replace(/\s+/g, '').includes(name)) {
    problems.push('Not based on your display name');
  }
  return problems;
}

/**
 * A rough strength read, used only to colour the bar.
 *
 * Length does most of the work here on purpose: it is the property that actually resists
 * guessing, whereas counting character classes rewards "Password1!" — which is short, obvious,
 * and scores well on exactly that kind of meter.
 */
function strength(password: string): { score: 0 | 1 | 2 | 3; label: string; colour: string } {
  const problems = advisoryProblems(password);
  if (password.length < MIN_LENGTH || problems.length > 0) {
    return { score: 1, label: 'Too weak', colour: 'bg-chorusify-danger' };
  }
  const varied = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(password)).length;
  if (password.length >= 16 || (password.length >= 12 && varied >= 2)) {
    return { score: 3, label: 'Strong', colour: 'bg-emerald-500' };
  }
  return { score: 2, label: 'Okay', colour: 'bg-amber-500' };
}

export function PasswordStrength({ password, email, displayName }: PasswordStrengthProps) {
  if (!password) return null;

  const { score, label, colour } = strength(password);
  const problems = advisoryProblems(password, email, displayName);

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                step <= score ? colour : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <span className="w-16 text-right text-[11px] font-medium text-slate-400">{label}</span>
      </div>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {problems.map((problem) => (
            <li key={problem} className="text-[11px] text-slate-400">
              · {problem}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
