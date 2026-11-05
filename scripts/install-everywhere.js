const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const extFolderName = `${pkg.publisher || 'chirpai'}.${pkg.name}-${pkg.version}`;

const ideTargets = [
  { name: 'VS Code', dir: path.join(os.homedir(), '.vscode', 'extensions') },
  { name: 'Cursor', dir: path.join(os.homedir(), '.cursor', 'extensions') },
  { name: 'Antigravity', dir: path.join(os.homedir(), '.antigravity', 'extensions') },
  { name: 'Antigravity IDE', dir: path.join(os.homedir(), '.antigravity-ide', 'extensions') }
];

const isUninstall = process.argv.includes('--uninstall');

console.log('==========================================================');
console.log(`🐾 DevPets — Multi-IDE Installer (${extFolderName})`);
console.log('==========================================================\n');

for (const ide of ideTargets) {
  if (!fs.existsSync(ide.dir)) {
    continue;
  }

  const destPath = path.join(ide.dir, extFolderName);

  if (isUninstall) {
    if (fs.existsSync(destPath)) {
      try {
        fs.rmSync(destPath, { recursive: true, force: true });
        console.log(`🗑️  Removed from ${ide.name}: ${destPath}`);
      } catch (err) {
        console.error(`⚠️  Failed to remove from ${ide.name}:`, err.message);
      }
    }
    continue;
  }

  try {
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    // Use a Windows directory junction ('junction') so it requires no admin rights
    // and automatically stays in sync whenever you run `npm run compile`!
    fs.symlinkSync(projectRoot, destPath, 'junction');
    console.log(`✅ Installed into ${ide.name}:`);
    console.log(`   -> ${destPath}`);
  } catch (err) {
    console.error(`⚠️  Could not link into ${ide.name} (${destPath}):`, err.message);
  }
}

if (!isUninstall) {
  console.log('\n🎉 Done! Restart or Reload Window (Ctrl+Shift+P -> "Developer: Reload Window") in VS Code, Cursor, or Antigravity to activate Pip!');
}

