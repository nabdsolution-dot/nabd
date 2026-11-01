import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LangProvider, LangSwitch, t } from './i18n';

afterEach(() => { localStorage.clear(); });

describe('language', () => {
  it('translates known phrases, fills variables and leaves unknown text alone', async () => {
    function Probe() { return <><LangSwitch /><p>{t('{n} not reporting', { n: 2 })}</p><p>{t('Totally new phrase')}</p></>; }
    render(<LangProvider><Probe /></LangProvider>);
    expect(screen.getByText('2 not reporting')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(screen.getByText('2 غير متصل')).toBeInTheDocument();
    expect(screen.getByText('Totally new phrase')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
  });
});
