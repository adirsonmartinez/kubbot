// Intel HEX (what arduino-cli writes: <sketch>.ino.hex) -> the flash bytes. Checks every record's
// checksum and the size, so a broken or foreign file fails clearly instead of running garbage.
export const FLASH_328P = 0x8000; // 32 KB

export function parseIntelHex(text, size = FLASH_328P) {
  const bytes = new Uint8Array(size);
  let base = 0, used = 0, ended = false;
  const lines = String(text ?? '').split(/\r?\n/);
  for (let n = 0; n < lines.length && !ended; n++) {
    const line = lines[n].trim();
    if (!line) continue;
    if (!/^:([0-9A-Fa-f]{2})+$/.test(line)) throw new Error(`hex: line ${n + 1} is not a record`);
    const rec = line.slice(1).match(/../g).map((h) => parseInt(h, 16));
    const count = rec[0], addr = (rec[1] << 8) | rec[2], type = rec[3];
    if (rec.length !== count + 5) throw new Error(`hex: line ${n + 1} has the wrong length`);
    if (rec.reduce((s, b) => s + b, 0) & 0xff) throw new Error(`hex: line ${n + 1} checksum`);
    const data = rec.slice(4, 4 + count);
    if (type === 0x00) {
      const at = base + addr;
      if (at + count > size) throw new Error('hex: the program does not fit');
      bytes.set(data, at);
      used = Math.max(used, at + count);
    } else if (type === 0x01) ended = true;
    else if (type === 0x02) base = ((data[0] << 8) | data[1]) << 4;
    else if (type === 0x04) base = ((data[0] << 8) | data[1]) << 16;
    // 0x03 / 0x05 (start address) do not matter to an AVR
  }
  if (!used) throw new Error('hex: empty');
  return { bytes, used };
}

// The CPU reads the flash as 16-bit words
export const toProgram = (bytes) => new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
