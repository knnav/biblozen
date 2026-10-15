# Third-party assets

All fonts are bundled locally (no runtime downloads). They come from the `@fontsource*` npm packages, which ship the upstream font files unchanged.

## Fonts

| Font                      | Used for                         | License                   | Source                                                                            |
| ------------------------- | -------------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| Inter (variable)          | UI, GitHub reading style         | SIL Open Font License 1.1 | `@fontsource-variable/inter`, https://github.com/rsms/inter                       |
| JetBrains Mono (variable) | Code, editor, Mono reading style | SIL Open Font License 1.1 | `@fontsource-variable/jetbrains-mono`, https://github.com/JetBrains/JetBrainsMono |

| Literata (variable, opsz) | Book reading style | SIL Open Font License 1.1 | `@fontsource-variable/literata`, https://github.com/googlefonts/literata |
| Source Serif 4 (variable, opsz) | Academic reading style | SIL Open Font License 1.1 | `@fontsource-variable/source-serif-4`, https://github.com/adobe-fonts/source-serif |
| KaTeX fonts (KaTeX_*) | Math rendering | MIT (KaTeX) | `katex`, https://github.com/KaTeX/KaTeX |

## Icons

| Library | License | Source                             |
| ------- | ------- | ---------------------------------- |
| Lucide  | ISC     | `lucide-react`, https://lucide.dev |

## Rendering libraries

| Library                                                                          | License              |
| -------------------------------------------------------------------------------- | -------------------- |
| markdown-it, markdown-it-footnote, markdown-it-front-matter                      | MIT                  |
| DOMPurify                                                                        | Apache-2.0 / MPL-2.0 |
| Shiki (grammars and themes from VS Code / TextMate, various permissive licenses) | MIT                  |
| KaTeX                                                                            | MIT                  |
| Mermaid                                                                          | MIT                  |
| yaml                                                                             | ISC                  |

GitHub alert icons are from GitHub's Octicons (MIT).

## Color themes

The built-in catalog (`src/themes/builtin.json`) is generated from the VS Code themes bundled with Shiki (`shiki/themes`). Each theme keeps its original license (MIT for nearly all, e.g. GitHub, Catppuccin, Dracula, Nord, One Dark Pro, Rosé Pine, Tokyo Night, Solarized); see https://github.com/shikijs/textmate-grammars-themes for per-theme sources and licenses.
