import { useState } from 'react';
import { t } from './i18n';

/** Color choices for the back office and the web till. The choice is kept on this device. */
export const ACCENTS: Record<string, { label: string; main: string; deep: string; accent: string; side: string }> = {
  green: { label: 'Green', main: '#0E5A48', deep: '#0B4A3B', accent: '#F0A500', side: '#0F1B18' },
  blue: { label: 'Blue', main: '#1D5FD1', deep: '#174BA8', accent: '#FF8A00', side: '#0E1B33' },
  red: { label: 'Red', main: '#C62839', deep: '#A01F2E', accent: '#FFB400', side: '#2A0E12' },
  purple: { label: 'Purple', main: '#6B3FC2', deep: '#55309C', accent: '#F2B705', side: '#1A1030' }
};
const KEY = 'nabd.accent';

export function currentAccent(): string {
  try { const v = localStorage.getItem(KEY); if (v && ACCENTS[v]) return v; } catch { /* storage blocked */ }
  return 'green';
}

export function applyAccent(id: string): void {
  const a = ACCENTS[id] ?? ACCENTS.green!;
  const s = document.documentElement.style;
  s.setProperty('--cedar', a.main); s.setProperty('--cedar-deep', a.deep); s.setProperty('--saffron', a.accent); s.setProperty('--side', a.side);
  try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
}

export function AccentPicker({ light }: { light?: boolean }) {
  const [now, setNow] = useState(currentAccent());
  return (
    <div role="group" aria-label={t('Color')} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {Object.entries(ACCENTS).map(([id, a]) => (
        <button key={id} type="button" aria-label={t(a.label)} aria-pressed={now === id} title={t(a.label)}
          onClick={() => { applyAccent(id); setNow(id); }}
          style={{ width: 26, height: 26, borderRadius: '50%', border: now === id ? `3px solid ${light ? '#fff' : '#12201C'}` : '2px solid rgba(128,128,128,.5)', background: `linear-gradient(135deg, ${a.main} 55%, ${a.accent} 55%)`, padding: 0 }} />
      ))}
    </div>
  );
}
