const path = require('node:path');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { saveAdmin } = require('../src/store');
const { MIN_PASSWORD_LENGTH } = require('../src/passwords');

function hiddenQuestion(prompt) {
  return new Promise((resolve, reject) => {
    // Readline retains normal editing, while its echo/cursor output is discarded.
    const silent = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    });
    const input = readline.createInterface({
      input: process.stdin,
      output: silent,
      terminal: true,
    });
    let answered = false;
    process.stdout.write(prompt);
    input.once('SIGINT', () => input.close());
    input.once('close', () => {
      process.stdout.write('\n');
      if (!answered) reject(new Error('Invoer afgebroken; er is niets gewijzigd.'));
    });
    input.question('', (value) => {
      answered = true;
      input.close();
      resolve(value);
    });
  });
}
async function stdinPassword() {
  process.stdin.setEncoding('utf8');
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk;
    if (Buffer.byteLength(value) > 8192) throw new Error('Wachtwoordinvoer is te groot.');
  }
  return value.replace(/\r?\n$/, '');
}
async function main() {
  const [rawUsername, option, ...extra] = process.argv.slice(2);
  const username = rawUsername?.trim();
  if (
    !username ||
    username.length > 200 ||
    (option && option !== '--password-stdin') ||
    extra.length
  ) {
    throw new Error(
      'Gebruik: npm run create-admin -- <gebruikersnaam> [--password-stdin]. Geef het wachtwoord niet als argument mee.',
    );
  }
  let password;
  if (option === '--password-stdin') password = await stdinPassword();
  else {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
      throw new Error(
        'Gebruik een interactieve terminal, of --password-stdin met veilige standaardinvoer.',
      );
    password = await hiddenQuestion('Nieuw wachtwoord (minimaal 16 tekens, invoer verborgen): ');
    const confirmation = await hiddenQuestion('Herhaal het wachtwoord: ');
    if (password !== confirmation)
      throw new Error('De wachtwoorden komen niet overeen; er is niets gewijzigd.');
  }
  if (
    Array.from(password).length < MIN_PASSWORD_LENGTH ||
    Buffer.byteLength(password) > 1024 ||
    /[\r\n\0]/.test(password)
  ) {
    throw new Error('Gebruik minimaal 16 tekens en maximaal 1024 bytes, zonder regeleinden.');
  }
  saveAdmin(username, password);
  console.log(
    `Admin opgeslagen in ${path.join(process.env.DATA_DIR || '/data', 'hyperpedia-admin.json')}.`,
  );
  console.log('Het wachtwoord staat alleen als PBKDF2-SHA256-hash in de data-mount.');
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
