function $27f2343d58c77bab$var$getJSZip() {
    // Prefer UMD global (when jszip.min.js is loaded via manifest before index.js)
    if (typeof globalThis !== 'undefined' && globalThis.JSZip) return globalThis.JSZip;
    // If not present, log a helpful error. We avoid importing/require at runtime because Thunderbird doesn't provide require().
    console.error('export-to-zip: JSZip not found. Make sure jszip.min.js is loaded before index.js (manifest background.scripts) or rebuild to bundle JSZip.');
    return null;
}
async function $27f2343d58c77bab$var$downloadMailAndZip(msg, initialFolder, zip) {
    const mailRaw = await messenger.messages.getRaw(msg.id);
    // Compute a relative folder path inside the zip.
    // Only strip the provided initialFolder if it's a true prefix of the folder path.
    let folderPath = `${msg.folder.path}/`;
    if (initialFolder && folderPath.startsWith(initialFolder)) folderPath = folderPath.slice(initialFolder.length);
    // Remove any leading slashes to avoid absolute paths inside the zip
    folderPath = folderPath.replace(/^\/+/, '');
    // FIX: Replace all forbidden filesystem/ZIP characters, not just '/'
    const safeSubject = (msg.subject || '').replace(/[/\\?%*:|"<>]/g, '_');
    zip.file(`${folderPath}${msg.id}_${safeSubject}.eml`, mailRaw.toString());
}
async function $27f2343d58c77bab$var$scanFolder(folder) {
    const JSZipImpl = $27f2343d58c77bab$var$getJSZip();
    if (!JSZipImpl) return;
    const zip = new JSZipImpl();
    const mailListGenerator = $27f2343d58c77bab$var$listMessages(folder);
    const initialFolder = folder.path + '/';
    // FIX: Process sequentially to prevent memory overflow on large folders
    for await (const msg of mailListGenerator)await $27f2343d58c77bab$var$downloadMailAndZip(msg, initialFolder, zip);
    const zipBlob = await zip.generateAsync({
        type: 'blob'
    });
    const url = URL.createObjectURL(zipBlob);
    const downloadId = await messenger.downloads.download({
        filename: `${folder.name}.zip`,
        saveAs: true,
        url: url
    });
    // FIX: Wait for download completion before revoking the object URL
    messenger.downloads.onChanged.addListener(function listen(delta) {
        if (delta.id === downloadId && delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
            messenger.downloads.onChanged.removeListener(listen);
            URL.revokeObjectURL(url);
        }
    });
}
async function $27f2343d58c77bab$var$exportMessages(messages) {
    const JSZipImpl = $27f2343d58c77bab$var$getJSZip();
    if (!JSZipImpl) return;
    const zip = new JSZipImpl();
    // Do not pass '/' as initialFolder — that would remove the first slash found inside folder paths
    // which can corrupt folder names (e.g. "INBOX/Sub" => "INBOXSub"). Use empty string to keep full folder structure.
    // FIX: Process sequentially to avoid memory spikes
    for (const msg of messages)await $27f2343d58c77bab$var$downloadMailAndZip(msg, '', zip);
    const zipBlob = await zip.generateAsync({
        type: 'blob'
    });
    const url = URL.createObjectURL(zipBlob);
    const downloadId = await messenger.downloads.download({
        filename: 'mails.zip',
        saveAs: true,
        url: url
    });
    // FIX: Wait for download completion before revoking the object URL
    messenger.downloads.onChanged.addListener(function listen(delta) {
        if (delta.id === downloadId && delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
            messenger.downloads.onChanged.removeListener(listen);
            URL.revokeObjectURL(url);
        }
    });
}
function $27f2343d58c77bab$var$handleClick(clickData) {
    if ('selectedMessages' in clickData) $27f2343d58c77bab$var$exportMessages(clickData.selectedMessages.messages).catch(console.error);
    else if ('selectedFolder' in clickData) $27f2343d58c77bab$var$scanFolder(clickData.selectedFolder).catch(console.error);
    else if ('folder' in clickData) $27f2343d58c77bab$var$scanFolder(clickData.folder).catch(console.error);
    else console.warn('export-to-zip: handleClick called with unexpected data', clickData);
}
async function* $27f2343d58c77bab$var$listMessages(folder) {
    let page = await messenger.messages.list(folder);
    for (const message of page.messages)yield message;
    while(page.id){
        page = await messenger.messages.continueList(page.id);
        for (const message of page.messages)yield message;
    }
    for (const subFolder of folder.subFolders || [])yield* $27f2343d58c77bab$var$listMessages(subFolder);
}
function $27f2343d58c77bab$var$createContextMenus() {
    try {
        // Remove existing menus prior to creation to prevent ID conflicts
        messenger.menus.removeAll().then(()=>{
            messenger.menus.create({
                id: 'export-to-zip-messages',
                title: messenger.i18n.getMessage('menuTitle'),
                contexts: [
                    'message_list'
                ]
            });
            messenger.menus.create({
                id: 'export-to-zip-folder',
                title: messenger.i18n.getMessage('menuTitle'),
                contexts: [
                    'folder_pane'
                ]
            });
            console.log('export-to-zip: created message and folder context menus');
        });
    } catch (e) {
        console.error('export-to-zip: createContextMenus failed:', e);
    }
}
if (messenger.runtime && messenger.runtime.onInstalled) messenger.runtime.onInstalled.addListener(()=>{
    console.log("export-to-zip: runtime.onInstalled \u2014 (re)creating menus");
    $27f2343d58c77bab$var$createContextMenus();
});
if (messenger.runtime && messenger.runtime.onStartup) messenger.runtime.onStartup.addListener(()=>{
    console.log("export-to-zip: runtime.onStartup \u2014 (re)creating menus");
    $27f2343d58c77bab$var$createContextMenus();
});
messenger.menus.onClicked.addListener((info, tab)=>{
    console.log('export-to-zip: menus.onClicked info=', info);
    if (info.menuItemId === 'export-to-zip-messages') {
        if (info.selectedMessages && info.selectedMessages.messages) $27f2343d58c77bab$var$handleClick({
            selectedMessages: info.selectedMessages
        });
        else $27f2343d58c77bab$var$handleClick({
            selectedMessages: {
                messages: []
            }
        });
    } else if (info.menuItemId === 'export-to-zip-folder') {
        if (info.selectedFolder) $27f2343d58c77bab$var$handleClick({
            selectedFolder: info.selectedFolder
        });
        else if (info.folder) $27f2343d58c77bab$var$handleClick({
            selectedFolder: info.folder
        });
        else console.warn('export-to-zip: folder menu clicked but no folder info in event', info);
    } else console.warn('export-to-zip: unknown menuItemId', info.menuItemId);
});




