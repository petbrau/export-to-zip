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

  // Debug logging to help diagnose missing subfolders in ZIP
  console.log('export: msg.folder.path=', msg.folder.path, 'initial=', initialFolder, 'folderPath=', folderPath, 'id=', msg.id);

  if (folderPath) {
    zip.folder(folderPath).file(`${msg.id}_${safeSubject}.eml`, mailRaw.toString());
  } else {
    zip.file(`${msg.id}_${safeSubject}.eml`, mailRaw.toString());
  }
}
