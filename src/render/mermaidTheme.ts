import type { ActiveTheme } from '../themes/store';
import type { MermaidTheme } from './mermaid';

/** Maps color tokens onto Mermaid's base-theme variables. */
export function mermaidThemeFrom(t: ActiveTheme): MermaidTheme {
  const v = (name: string, fallback: string) => t.vars[name] || fallback;
  const bg = v('--bg-base', t.type === 'dark' ? '#1e1e2e' : '#ffffff');
  const fg = v('--fg-base', t.type === 'dark' ? '#cdd6f4' : '#1f2328');
  const accent = v('--accent', '#8250df');
  const elevated = v('--bg-elevated', bg);
  const border = v('--border-strong', fg);
  return {
    key: `${t.id}:${t.version}`,
    dark: t.type === 'dark',
    vars: {
      background: bg,
      primaryColor: elevated,
      primaryTextColor: fg,
      primaryBorderColor: accent,
      secondaryColor: v('--bg-hover', elevated),
      tertiaryColor: v('--bg-codeblock', bg),
      lineColor: v('--fg-muted', fg),
      textColor: fg,
      mainBkg: elevated,
      nodeBorder: accent,
      clusterBkg: v('--bg-callout', elevated),
      clusterBorder: border,
      titleColor: v('--fg-heading', fg),
      edgeLabelBackground: bg,
      noteBkgColor: v('--bg-callout', elevated),
      noteTextColor: fg,
      noteBorderColor: v('--callout-note', accent),
      actorBkg: elevated,
      actorBorder: accent,
      actorTextColor: fg,
      signalColor: fg,
      signalTextColor: fg,
      labelBoxBkgColor: elevated,
      labelTextColor: fg,
      fontSize: '14px',
    },
  };
}
