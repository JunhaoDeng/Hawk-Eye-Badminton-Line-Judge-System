/**
 * ProcessPoolManager — manages concurrent Python analysis processes.
 *
 * Limits the number of simultaneously running analysis child processes
 * to avoid resource contention (GPU, memory, CPU). When a slot opens,
 * the next queued task is automatically started.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ProcessPoolManager {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 2;
    this.activeProcesses = new Map();  // id → { child, startTime, args, recordId }
    this.waitingQueue = [];            // [{ recordId, args, projectRoot, pythonPath, onComplete, onError }]
    this._pythonPath = null;
    this._projectRoot = null;
  }

  /**
   * Configure defaults that will be used if not provided per-task.
   */
  configure(pythonPath, projectRoot) {
    this._pythonPath = pythonPath;
    this._projectRoot = projectRoot;
  }

  /**
   * Get the number of currently running processes.
   */
  getActiveCount() {
    return this.activeProcesses.size;
  }

  /**
   * Get the number of queued (waiting) tasks.
   */
  getQueueSize() {
    return this.waitingQueue.length;
  }

  /**
   * Spawn an analysis process, or queue it if all slots are busy.
   *
   * @param {string} recordId - MongoDB record _id
   * @param {object} options
   *   - args: string[] — Python script arguments
   *   - pythonPath: string — path to python binary
   *   - projectRoot: string — cwd for the child process
   *   - onComplete: function(code) — called when process exits with code
   *   - onError: function(err) — called on spawn error
   * @returns {string} 'started' or 'queued'
   */
  spawnAnalysis(recordId, options = {}) {
    const args = options.args || [];
    const pythonPath = options.pythonPath || this._pythonPath;
    const projectRoot = options.projectRoot || this._projectRoot;
    const onComplete = options.onComplete || (() => {});
    const onError = options.onError || (() => {});

    // Deduplication: reject if this recordId is already running or queued
    if (this.activeProcesses.has(recordId)) {
      console.log(`[ProcessPool] Rejecting duplicate spawn for record ${recordId} (already running)`);
      return 'duplicate';
    }
    if (this.waitingQueue.some(t => t.recordId === recordId)) {
      console.log(`[ProcessPool] Rejecting duplicate spawn for record ${recordId} (already queued)`);
      return 'duplicate';
    }

    if (this.activeProcesses.size < this.maxConcurrent) {
      this._startProcess(recordId, args, pythonPath, projectRoot, onComplete, onError);
      return 'started';
    } else {
      this.waitingQueue.push({
        recordId, args, pythonPath, projectRoot, onComplete, onError
      });
      console.log(`[ProcessPool] Queued task for record ${recordId}, queue size: ${this.waitingQueue.length}`);
      return 'queued';
    }
  }

  /**
   * Kill a running process by recordId.
   */
  kill(recordId) {
    const entry = this.activeProcesses.get(recordId);
    if (entry) {
      entry.child.kill('SIGTERM');
      this.activeProcesses.delete(recordId);
      this._processNext();
    }
  }

  /**
   * Internal: start a child process.
   */
  _startProcess(recordId, args, pythonPath, projectRoot, onComplete, onError) {
    console.log(`[ProcessPool] Starting analysis for record ${recordId}, active: ${this.activeProcesses.size + 1}/${this.maxConcurrent}`);

    const child = spawn(pythonPath, args, {
      cwd: projectRoot,
      env: { ...process.env, PYTHONPATH: projectRoot },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderrOutput = '';

    child.stdout.on('data', (data) => {
      console.log(`[Analysis ${recordId}] stdout: ${data}`);
    });

    child.stderr.on('data', (data) => {
      stderrOutput += data.toString();
      console.error(`[Analysis ${recordId}] stderr: ${data}`);
    });

    child.on('close', (code) => {
      console.log(`[Analysis ${recordId}] exited with code ${code}`);
      this.activeProcesses.delete(recordId);
      onComplete(code, stderrOutput);
      this._processNext();
    });

    child.on('error', (err) => {
      console.error(`[Analysis ${recordId}] process error:`, err);
      this.activeProcesses.delete(recordId);
      onError(err);
      this._processNext();
    });

    this.activeProcesses.set(recordId, {
      child,
      startTime: Date.now(),
      args,
      recordId
    });
  }

  /**
   * Internal: start the next queued task if a slot is available.
   */
  _processNext() {
    if (this.waitingQueue.length > 0 && this.activeProcesses.size < this.maxConcurrent) {
      const task = this.waitingQueue.shift();
      this._startProcess(
        task.recordId,
        task.args,
        task.pythonPath,
        task.projectRoot,
        task.onComplete,
        task.onError
      );
    }
  }
}

// Create a global singleton
const processPool = new ProcessPoolManager();

module.exports = { ProcessPoolManager, processPool };
