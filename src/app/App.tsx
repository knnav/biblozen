import { useEffect, useState, type ReactNode } from 'react';
import {
  createKeyDispatcher,
  registerCommands,
  setCommandContextProvider,
  setCommandHooks,
} from '../commands/registry';
import { getPlatform, errorMessage } from '../platform';
import { applyState, bindAppState, getAppState, patchRecentCommand } from '../settings/appState';
import { bindSettings } from '../settings/persistence';
import { useSettings } from '../settings/store';
import { fileCommands } from '../tree/commands';
import { Sidebar } from '../tree/Sidebar';
import { useTree } from '../tree/store';
import { countFiles } from '../tree/model';
import { isInside, isMarkdown, join } from '../platform/path';
import '../ui/Button.css';
import { openFile, openFolder, openPath } from './actions';
import { appCommands } from './appCommands';
import { commandContext } from './context';
import { useDocument } from './document';
import { DocError, DocLoading, NoFile, NoFolder } from './EmptyStates';
import { LivePreview } from '../render/LivePreview';
import { Editor } from '../editor/Editor';
import { bindEditor } from '../editor/controller';
import { ConflictBanner } from './ConflictBanner';
import { QuickOpen } from '../search/QuickOpen';
import { SearchPanel } from '../search/SearchPanel';
import { searchCommands } from '../search/commands';
import { exportCommands } from '../export/commands';
import { SettingsScreen } from '../settings/SettingsScreen';
import { bindEditing, editingCommands } from './editing';
import { importImagePaths } from '../editor/images';
import { getView } from '../editor/controller';
import { ensureWelcomeFolder } from '../welcome';
import { RecentFoldersPicker } from './RecentFolders';
import { bindMouseHistory, readerCommands } from '../reader/commands';
import { ProgressBar } from '../reader/ProgressBar';
import { SidePanels } from '../reader/SidePanels';
import { paneLayout } from './modes';
import { themeCommands } from '../themes/commands';
import { bindThemes } from '../themes/engine';
import { ReadingStylePicker, ThemePicker } from '../themes/Pickers';
import { readingStyleName } from '../themes/readingStyles';
import { useTheme } from '../themes/store';
import { Shell } from './Shell';
import { toast, toastError } from './toastStore';
import { useWorkspace } from './workspace';

/**
 * What this window opens at launch: the folder/file the shell assigned (CLI, routing,
 * session restore); otherwise, on first run, the Welcome folder.
 */
async function openInitialFolder() {
  const platform = getPlatform();
  const init = await platform.windowInit();
  if (init.root) {
    await openFolder(init.root, { file: init.file, restoreLastFile: !init.file });
    return;
  }
  const skipWelcome = new URLSearchParams(window.location.search).has('nowelcome');
  if (!getAppState().notices.welcomeOpened && !skipWelcome) {
    applyState((s) => ({ ...s, notices: { ...s.notices, welcomeOpened: true } }));
    const root = await ensureWelcomeFolder();
    await openFolder(root, { file: join(root, 'Welcome.md') });
  }
}

/** Keeps the shell's session record in step with this window. */
function bindSessionReporting(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  const report = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const root = useWorkspace.getState().root;
      const file = useDocument.getState().path;
      const key = `${root}\u0000${file}`;
      if (key === last) return;
      last = key;
      void getPlatform()
        .reportSession(root, file)
        .catch(() => {});
    }, 250);
  };
  const a = useWorkspace.subscribe((s, p) => s.root !== p.root && report());
  const b = useDocument.subscribe((s, p) => s.path !== p.path && report());
  return () => {
    clearTimeout(timer);
    a();
    b();
  };
}

function useDragDrop(): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void getPlatform()
      .onDragDrop((e) => {
        if (e.type === 'enter' || e.type === 'over') setOver(true);
        else if (e.type === 'leave') setOver(false);
        else {
          setOver(false);
          void (async () => {
            const view = getView();
            const scale = window.devicePixelRatio || 1;
            const el = document.elementFromPoint(e.position.x / scale, e.position.y / scale);
            if (view && el?.closest('[data-pane="editor"]')) {
              const pos = view.posAtCoords({ x: e.position.x / scale, y: e.position.y / scale });
              if (await importImagePaths(view, e.paths, pos)) return;
            }
            const first = e.paths[0];
            if (!first) return;
            const root = useWorkspace.getState().root;
            if (root && isInside(root, first) && !(await getPlatform().isDir(first)))
              await openFile(first);
            else await openPath(first);
          })().catch((err) => toastError(err));
        }
      })
      .then((u) => (cancelled ? u() : (off = u)));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);
  return over;
}

function Main() {
  const root = useWorkspace((s) => s.root);
  const overlay = useWorkspace((s) => s.overlay);
  const closeOverlay = useWorkspace((s) => s.closeOverlay);
  const overlayArg = useWorkspace((s) => s.overlayArg);
  const status = useDocument((s) => s.status);
  const listing = useTree((s) => s.listing);
  const dragOver = useDragDrop();
  const themeName = useTheme((s) => s.name);
  const readingStyle = useSettings((s) => s.settings.readingStyle);
  const layout = useWorkspace(paneLayout);

  let main: ReactNode | undefined;
  if (!root) main = <NoFolder />;
  else if (status === 'empty')
    main = listing ? <NoFile hasFiles={countFiles(listing, isMarkdown) > 0} /> : <DocLoading />;
  else if (status === 'loading') main = <DocLoading />;
  else if (status === 'error') main = <DocError />;

  return (
    <>
      <Shell
        sidebar={<Sidebar />}
        sidebarAvailable={root !== null}
        main={main}
        progress={<ProgressBar visible={!main && layout !== 'editor'} />}
        aside={<SidePanels />}
        editor={<Editor />}
        preview={<LivePreview />}
        banner={<ConflictBanner />}
        overlays={{
          recentFolders: overlay === 'recentFolders' && (
            <RecentFoldersPicker onClose={closeOverlay} />
          ),
          theme: overlay === 'theme' && <ThemePicker onClose={closeOverlay} />,
          quickOpen: overlay === 'quickOpen' && (
            <QuickOpen onClose={closeOverlay} initial={overlayArg} />
          ),
          search: overlay === 'search' && <SearchPanel onClose={closeOverlay} />,
          settings: overlay === 'settings' && <SettingsScreen onClose={closeOverlay} />,
          readingStyle: overlay === 'readingStyle' && <ReadingStylePicker onClose={closeOverlay} />,
        }}
        themeName={themeName}
        readingStyleName={readingStyleName(readingStyle)}
      />
      {dragOver && <div className="drop-overlay">Drop to open</div>}
    </>
  );
}

export function App() {
  const loaded = useSettings((s) => s.loaded);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const platform = getPlatform();
    const disposers: (() => void)[] = [];
    let cancelled = false;

    setCommandContextProvider(commandContext);
    setCommandHooks({
      onRun: (id) => applyState(patchRecentCommand(id)),
      onError: (e) => toastError(e),
    });
    disposers.push(
      registerCommands([
        ...appCommands(),
        ...fileCommands(),
        ...themeCommands(),
        ...readerCommands(),
        ...editingCommands(),
        ...searchCommands(),
        ...exportCommands(),
      ]),
    );
    disposers.push(bindMouseHistory());
    disposers.push(bindEditor());
    disposers.push(bindEditing());
    disposers.push(bindSessionReporting());
    let unlistenOpen: (() => void) | undefined;
    void platform
      .onOpenFile((path) => {
        const root = useWorkspace.getState().root;
        if (root && isInside(root, path)) void openFile(path);
        else void openPath(path);
      })
      .then((u) => (unlistenOpen = u));
    disposers.push(() => unlistenOpen?.());

    const onKey = createKeyDispatcher(platform.os);
    window.addEventListener('keydown', onKey);
    disposers.push(() => window.removeEventListener('keydown', onKey));

    (async () => {
      const onError = (m: string) => toast(m, 'error');
      disposers.push(await bindSettings(platform, onError));
      await bindAppState(platform, onError);
      disposers.push(await bindThemes(onError));
      const dataDir = await platform.getDataDir();
      if (cancelled) return;
      useWorkspace.getState().restoreLayout();
      if (dataDir.fellBack && !getAppState().notices.dataDirFallback) {
        applyState((s) => ({ ...s, notices: { ...s.notices, dataDirFallback: true } }));
        toast(
          'The app folder is read-only, so settings are stored in your user profile instead.',
          'info',
          {
            detail: dataDir.path,
            timeout: 12000,
          },
        );
      }
      setReady(true);
      await openInitialFolder();
    })().catch((e) => toast(errorMessage(e), 'error'));

    return () => {
      cancelled = true;
      disposers.forEach((d) => d());
    };
  }, []);

  return (
    <div className="app" data-loaded={loaded && ready}>
      {ready && <Main />}
    </div>
  );
}
