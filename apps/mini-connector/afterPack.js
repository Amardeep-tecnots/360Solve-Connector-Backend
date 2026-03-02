const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  
  // For Windows, skip code signing
  if (process.platform === 'win32') {
    console.log('Skipping code signing for Windows build...');
  }
  
  // Clean up any cached winCodeSign files to avoid issues
  const cacheDir = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  if (fs.existsSync(cacheDir)) {
    try {
      // Try to clean up the cache but don't fail if it doesn't work
      console.log('Code signing skipped - using local Electron distribution');
    } catch (e) {
      // Ignore errors
    }
  }
};
