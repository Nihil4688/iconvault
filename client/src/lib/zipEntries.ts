// Lists the file names in a ZIP from its central directory, without unpacking anything.
// Throws when the bytes are not a ZIP this reader understands.

function findEndOfCentralDirectory(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - (22 + 0xffff));
  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("Not a ZIP archive.");
}

export function listZipEntryNames(data: Uint8Array): string[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  let count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  // A full-size field means the real value lives in the ZIP64 end record, just before this one.
  if (count === 0xffff || offset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || view.getUint32(locator, true) !== 0x07064b50) throw new Error("Not a ZIP archive.");
    const record = Number(view.getBigUint64(locator + 8, true));
    if (view.getUint32(record, true) !== 0x06064b50) throw new Error("Not a ZIP archive.");
    count = Number(view.getBigUint64(record + 32, true));
    offset = Number(view.getBigUint64(record + 48, true));
  }

  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Not a ZIP archive.");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    if (nameStart + nameLength > view.byteLength) throw new Error("Not a ZIP archive.");
    names.push(new TextDecoder().decode(data.subarray(nameStart, nameStart + nameLength)));
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return names;
}
