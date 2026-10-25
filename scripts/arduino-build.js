// Compiles the Arduino lab's examples (examples/arduino/<id>/sketch.ino -> sketch.hex) with arduino-cli,
// so the app and the demo run them without the CLI or the network. Commit the .hex files.
// Needs: arduino-cli and its AVR core (arduino-cli core install arduino:avr). `npm run arduino:build`
const fs = require('node:fs');
const path = require('node:path');
const { findArduinoCli, compileSketch } = require('../electron/arduino.js');

const root = path.join(__dirname, '..', 'examples', 'arduino');

(async () => {
  const cli = findArduinoCli();
  if (!cli) {
    console.error('arduino-cli not found. Install it (brew install arduino-cli) and run: arduino-cli core install arduino:avr');
    process.exit(1);
  }
  let failed = 0;
  for (const id of fs.readdirSync(root)) {
    const dir = path.join(root, id);
    const sketch = path.join(dir, 'sketch.ino');
    if (!fs.existsSync(sketch)) continue;
    const diagram = JSON.parse(fs.readFileSync(path.join(dir, 'diagram.json'), 'utf8'));
    const board = diagram.parts.find((p) => /^wokwi-arduino-/.test(p.type))?.type ?? 'wokwi-arduino-uno';
    const fqbn = { 'wokwi-arduino-uno': 'arduino:avr:uno', 'wokwi-arduino-nano': 'arduino:avr:nano', 'wokwi-arduino-mega': 'arduino:avr:mega' }[board];
    const result = await compileSketch({ cli, source: fs.readFileSync(sketch, 'utf8'), fqbn });
    if (result.ok) {
      fs.writeFileSync(path.join(dir, 'sketch.hex'), result.hex);
      console.log(`${id}: sketch.hex (${result.bytes} bytes, ${fqbn})`);
    } else {
      failed++;
      console.error(`${id}: ${result.error}\n  ${result.lines.join('\n  ')}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
