import JSZip from 'jszip';

async function downloadMailAndZip(msg, initialFolder, zip) {
  const mailRaw = await messenger.messages.getRaw(msg.id);
  const folder = `${msg.folder.path}/`.replace(initialFolder, '');
  const safeSubject = (msg.subject || '').replace(/\//g, '_');
  zip.file(`${folder}${msg.id}_${safeSubject}.eml`, mailRaw.toString());
}

async function scanFolder(folder) {
  const zip = new JSZip();
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
  const zip = new JSZip();
  const pending = messages.map(msg => downloadMailAndZip(msg, '/', zip));
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

try {
  messenger.menus.create({
    title: messenger.i18n.getMessage('menuTitle'),
    contexts: ['message_list', 'folder_pane'],
    onclick: handleClick
  });
} catch (e) {
  console.warn('menus.create failed (might already exist):', e);
}
