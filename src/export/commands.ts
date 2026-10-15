import { toast, toastError } from '../app/toastStore';
import type { Command, CommandContext } from '../commands/registry';
import { getPlatform } from '../platform';
import { useDocument } from '../app/document';
import { buildClipboardHtml, buildExportHtml } from './html';
import { printDocument } from './print';

const hasDoc = (c: CommandContext) => c.mode !== 'none';

export function exportCommands(): Command[] {
  return [
    {
      id: 'export.html',
      title: 'Export as HTML…',
      category: 'File',
      when: hasDoc,
      run: async () => {
        try {
          const { html, fileName } = await buildExportHtml();
          const path = await getPlatform().saveExport(fileName, html, 'HTML', 'html');
          if (path) toast('Exported HTML', 'success', { detail: path });
        } catch (e) {
          toastError(e, 'Export failed');
        }
      },
    },
    {
      id: 'export.pdf',
      title: 'Print / Export as PDF…',
      category: 'File',
      when: hasDoc,
      run: async () => {
        await printDocument().catch((e) => void toastError(e, 'Couldn’t print'));
      },
    },
    {
      id: 'export.copyHtml',
      title: 'Copy as HTML',
      category: 'File',
      when: hasDoc,
      run: async () => {
        try {
          await getPlatform().copyHtml(await buildClipboardHtml(), useDocument.getState().text);
          toast('Copied as HTML', 'success', { timeout: 2000 });
        } catch (e) {
          toastError(e, 'Couldn’t copy');
        }
      },
    },
  ];
}
