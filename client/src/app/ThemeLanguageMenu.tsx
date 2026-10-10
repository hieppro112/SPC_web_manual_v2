// Menu chọn giao diện sáng/tối + ngôn ngữ (góc phải header).
import { useTranslation } from 'react-i18next';
import { Languages, Monitor, Moon, Sun } from 'lucide-react';
import Button from '../components/ui/Button.tsx';
import MenuItem from '../components/ui/MenuItem.tsx';
import Popover from '../components/ui/Popover.tsx';
import { LANGUAGES } from '../i18n/index.ts';
import { useTheme, type ThemeChoice } from '../theme/useTheme.ts';

const THEMES: { value: ThemeChoice; icon: typeof Sun; key: 'nav.themeLight' | 'nav.themeDark' | 'nav.themeSystem' }[] = [
  { value: 'light', icon: Sun, key: 'nav.themeLight' },
  { value: 'dark', icon: Moon, key: 'nav.themeDark' },
  { value: 'system', icon: Monitor, key: 'nav.themeSystem' },
];

export default function ThemeLanguageMenu() {
  const { t, i18n } = useTranslation();
  const { choice, resolved, setTheme } = useTheme();
  const CurrentIcon = resolved === 'dark' ? Moon : Sun;

  return (
    <Popover
      align="right"
      trigger={(toggle) => (
        <Button variant="ghost" size="icon" onClick={toggle} title={`${t('nav.theme')} / ${t('nav.language')}`}>
          <CurrentIcon className="h-4 w-4" />
        </Button>
      )}
    >
      {(close) => (
        <div className="w-52">
          <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted">{t('nav.theme')}</p>
          {THEMES.map((theme) => (
            <MenuItem key={theme.value} icon={theme.icon} selected={choice === theme.value} onClick={() => setTheme(theme.value)}>
              {t(theme.key)}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-border" />
          <p className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted">
            <Languages className="h-3.5 w-3.5" /> {t('nav.language')}
          </p>
          {LANGUAGES.map((lang) => (
            <MenuItem
              key={lang.code}
              selected={i18n.language === lang.code}
              onClick={() => {
                void i18n.changeLanguage(lang.code);
                close();
              }}
            >
              {lang.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}
