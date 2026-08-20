function getJSZip() {
  // Prefer UMD global (when jszip.min.js is loaded via manifest before index.js)
  if (typeof globalThis !== 'undefined' && globalThis.JSZip) return globalThis.JSZip;
  // If not present, log a helpful error. We avoid importing/require at runtime because Thunderbird doesn't provide require().
  console.error('export-to-zip: JSZip not found. Make sure jszip.min.js is loaded before index.js (manifest background.scripts) or rebuild to bundle JSZip.');
  return null;
}

async function downloadMailAndZip(msg, initialFolder, zip) {
  const mailRaw = await messenger.messages.getRaw(msg.id);

  // Compute a relative folder path inside the zip.
  // Only strip the provided initialFolder if it's a true prefix of the folder path.
  let folderPath = `${msg.folder.path}/`;
  if (initialFolder && folderPath.startsWith(initialFolder)) {
    folderPath = folderPath.slice(initialFolder.length);
  }
  // Remove any leading slashes to avoid absolute paths inside the zip
  folderPath = folderPath.replace(/^\/+/, '');

  const safeSubject = (msg.subject || '').replace(/\//g, '_');
  zip.file(`${folderPath}${msg.id}_${safeSubject}.eml`, mailRaw.toString());
}

async function scanFolder(folder) {
  const JSZipImpl = getJSZip();
  if (!JSZipImpl) return;
  const zip = new JSZipImpl();
  const mailListGenerator = listMessages(folder);
  const initialFolder = folder.path + '/';

  const pending = [];
  for await (const msg of mailListGenerator) {
    pending.push(downloadMailAndZip(msg, initialFolder, zip));
  }
  await Promise.all(pending);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  await messenger.downloads.download({ filename: `${folder.name}.zip`, saveAs: true, url });
  URL.revokeObjectURL(url);
}

async function exportMessages(messages) {
  const JSZipImpl = getJSZip();
  if (!JSZipImpl) return;
  const zip = new JSZipImpl();
  // Do not pass '/' as initialFolder — that would remove the first slash found inside folder paths
  // which can corrupt folder names (e.g. "INBOX/Sub" => "INBOXSub"). Use empty string to keep full folder structure.
  const pending = messages.map(msg => downloadMailAndZip(msg, '', zip));
  await Promise.all(pending);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  await messenger.downloads.download({ filename: 'mails.zip', saveAs: true, url });
  URL.revokeObjectURL(url);
}

function handleClick(clickData) {
  if ('selectedMessages' in clickData) {
    exportMessages(clickData.selectedMessages.messages).catch(console.error);
  } else if ('selectedFolder' in clickData) {
    scanFolder(clickData.selectedFolder).catch(console.error);
  } else if ('folder' in clickData) {
    scanFolder(clickData.folder).catch(console.error);
  } else {
    console.warn('export-to-zip: handleClick called with unexpected data', clickData);
  }
}

async function* listMessages(folder) {
  let page = await messenger.messages.list(folder);
  for (const message of page.messages) yield message;

  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    for (const message of page.messages) yield message;
  }

  for (const subFolder of folder.subFolders || []) {
    yield* listMessages(subFolder);
  }
}

function createContextMenus() {
  try {
    messenger.menus.create({
      id: 'export-to-zip-messages',
      title: messenger.i18n.getMessage('menuTitle'),
      contexts: ['message_list']
    });
    messenger.menus.create({
      id: 'export-to-zip-folder',
      title: messenger.i18n.getMessage('menuTitle'),
      contexts: ['folder_pane']
    });
    console.log('export-to-zip: created message and folder context menus');
  } catch (e) {
    console.error('export-to-zip: createContextMenus failed:', e);
  }
}

try {
  createContextMenus();
} catch (e) {
  console.warn('export-to-zip: initial createContextMenus failed', e);
}

if (messenger.runtime && messenger.runtime.onInstalled) {
  messenger.runtime.onInstalled.addListener(() => {
    console.log('export-to-zip: runtime.onInstalled — (re)creating menus');
    createContextMenus();
  });
}
if (messenger.runtime && messenger.runtime.onStartup) {
  messenger.runtime.onStartup.addListener(() => {
    console.log('export-to-zip: runtime.onStartup — (re)creating menus');
    createContextMenus();
  });
}

messenger.menus.onClicked.addListener((info, tab) => {
  console.log('export-to-zip: menus.onClicked info=', info);
  if (info.menuItemId === 'export-to-zip-messages') {
    if (info.selectedMessages && info.selectedMessages.messages) {
      handleClick({ selectedMessages: info.selectedMessages });
    } else {
      handleClick({ selectedMessages: { messages: [] } });
    }
  } else if (info.menuItemId === 'export-to-zip-folder') {
    if (info.selectedFolder) {
      handleClick({ selectedFolder: info.selectedFolder });
    } else if (info.folder) {
      handleClick({ selectedFolder: info.folder });
    } else {
      console.warn('export-to-zip: folder menu clicked but no folder info in event', info);
    }
  } else {
    console.warn('export-to-zip: unknown menuItemId', info.menuItemId);
  }
});
