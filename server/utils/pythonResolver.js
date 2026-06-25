/**
 * Cross-platform Python path resolver.
 *
 * The config file may contain a Windows-style path (e.g. .venv/Scripts/python.exe)
 * that doesn't exist on macOS/Linux. This module builds a prioritized list of
 * fallback paths so the server works on all platforms without manual config.
 */

const path = require('path');

/**
 * @param {string} configuredPath — value from global.config.get('pythonPath')
 * @returns {string[]} — ordered list of python paths to try
 */
function getPythonPaths(configuredPath) {
  const paths = [];

  // 1. The configured path (always tried first)
  if (configuredPath) {
    paths.push(configuredPath);

    // 2. Platform-aware .venv variant — if config says "Scripts/python.exe" (Windows),
    //    also try "bin/python" (macOS/Linux)
    if (configuredPath.includes('Scripts')) {
      paths.push(configuredPath.replace(/Scripts[/\\]python(3)?\.exe$/, 'bin/python'));
      paths.push(configuredPath.replace(/Scripts[/\\]python(3)?\.exe$/, 'bin/python3'));
    }
    if (configuredPath.includes('bin')) {
      paths.push(configuredPath.replace(/bin\/python(3)?$/, 'Scripts/python.exe'));
    }
  }

  // 3. System python
  paths.push('python3', 'python');

  return [...new Set(paths)]; // deduplicate
}

module.exports = { getPythonPaths };
