const { app } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../utils/logger');

const MAX_BUFFER_LINES = 8000;

const state = {
  active: false,
  startedAt: null,
  sessionId: null,
  sessionFilePath: '',
  lines: []
};

function getLogsDirectory() {
  return path.join(app.getPath('appData'), 'Hytale', 'logs');
}

function buildSessionId(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function normalizeChunk(chunk) {
  if (chunk === undefined || chunk === null) return [];
  return String(chunk)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);
}

function formatLogLine(level, message) {
  const ts = new Date().toISOString();
  return `[${ts}] [${String(level || 'info').toUpperCase()}] ${message}`;
}

function pushToBuffer(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  state.lines.push(...lines);
  if (state.lines.length > MAX_BUFFER_LINES) {
    state.lines.splice(0, state.lines.length - MAX_BUFFER_LINES);
  }
}

async function ensureSession(context = {}) {
  if (state.active && state.sessionFilePath) return;

  const now = new Date();
  const sessionId = buildSessionId(now);
  const logDir = getLogsDirectory();
  const logFilePath = path.join(logDir, `game-${sessionId}.log`);

  await fs.ensureDir(logDir);
  state.active = true;
  state.startedAt = now;
  state.sessionId = sessionId;
  state.sessionFilePath = logFilePath;
  state.lines = [];

  const header = [];
  header.push('=== Battly Game Session Log ===');
  header.push(`Started: ${now.toISOString()}`);
  if (context.username) header.push(`Username: ${context.username}`);
  if (context.versionId) header.push(`Version: ${context.versionId}`);
  if (context.patchFile) header.push(`Patch: ${context.patchFile}`);
  header.push('================================');

  const headerLines = header.map(line => formatLogLine('system', line));
  pushToBuffer(headerLines);
  await fs.writeFile(logFilePath, `${headerLines.join('\n')}\n`, 'utf8');
}

async function startGameLogSession(context = {}) {
  try {
    await ensureSession(context);
  } catch (error) {
    logger.error('Failed to start game log session:', error);
  }
}

async function appendGameLog(level, chunk) {
  try {
    await ensureSession();
    const messages = normalizeChunk(chunk);
    if (messages.length === 0) return;

    const lines = messages.map(msg => formatLogLine(level, msg));
    pushToBuffer(lines);
    await fs.appendFile(state.sessionFilePath, `${lines.join('\n')}\n`, 'utf8');
  } catch (error) {
    logger.error('Failed to append game log:', error);
  }
}

async function endGameLogSession(reason = 'session-ended') {
  if (!state.active) return;
  await appendGameLog('system', `Session finished: ${reason}`);
  state.active = false;
}

function getTailLines(limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 5000));
  if (state.lines.length <= safeLimit) return [...state.lines];
  return state.lines.slice(state.lines.length - safeLimit);
}

function splitLines(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);
}

async function getFileLines() {
  const sessionFilePath = await resolveSessionFilePath();
  if (!sessionFilePath) return [];
  const exists = await fs.pathExists(sessionFilePath);
  if (!exists) return [];
  const content = await fs.readFile(sessionFilePath, 'utf8');
  return splitLines(content);
}

async function getLatestLogFilePath() {
  const logDir = getLogsDirectory();
  const exists = await fs.pathExists(logDir);
  if (!exists) return '';

  const entries = await fs.readdir(logDir);
  const candidates = [];

  for (const fileName of entries) {
    if (!/^game-.*\.log$/i.test(fileName)) continue;
    const fullPath = path.join(logDir, fileName);
    try {
      const stats = await fs.stat(fullPath);
      candidates.push({ fullPath, mtimeMs: stats.mtimeMs });
    } catch (error) {
      logger.warn('Unable to stat log file:', fullPath, error.message);
    }
  }

  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].fullPath;
}

async function resolveSessionFilePath() {
  if (state.sessionFilePath) {
    const exists = await fs.pathExists(state.sessionFilePath);
    if (exists) return state.sessionFilePath;
  }

  const latestFilePath = await getLatestLogFilePath();
  if (latestFilePath) {
    state.sessionFilePath = latestFilePath;
  }
  return latestFilePath;
}

async function getGameLogs(options = {}) {
  const mode = options.mode === 'all' ? 'all' : 'tail';
  const limit = Math.max(1, Math.min(Number(options.limit) || 100, 5000));
  const resolvedFilePath = await resolveSessionFilePath();

  let lines = [];
  let source = 'buffer';

  if (mode === 'all') {
    lines = await getFileLines();
    source = 'file';
  } else {
    lines = getTailLines(limit);
    if (lines.length === 0) {
      const fileLines = await getFileLines();
      lines = fileLines.slice(Math.max(0, fileLines.length - limit));
      source = 'file';
    }
  }

  return {
    success: true,
    mode,
    count: lines.length,
    lines,
    source,
    sessionActive: state.active,
    sessionId: state.sessionId,
    logFilePath: resolvedFilePath || state.sessionFilePath,
    warning: mode === 'all' ? 'all_logs_can_be_slow' : ''
  };
}

module.exports = {
  startGameLogSession,
  appendGameLog,
  endGameLogSession,
  getGameLogs
};
