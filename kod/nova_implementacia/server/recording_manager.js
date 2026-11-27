// =============================================================================
// Manažér nahrávania online pohovorov
// Bakalárska práca - FIIT STU Bratislava
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_RECORDING_DIR = path.join(__dirname, 'recording');
const PRESENCE_TTL_MS = 12000;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeSegment(value, fallback = 'item') {
  const ascii = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return ascii || fallback;
}

function parseInterviewDatumMs(datumStr) {
  if (!datumStr) return NaN;
  const normalized = String(datumStr).trim().replace(' ', 'T');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return new Date(
      parseInt(match[1], 10),
      parseInt(match[2], 10) - 1,
      parseInt(match[3], 10),
      parseInt(match[4], 10),
      parseInt(match[5], 10),
      match[6] ? parseInt(match[6], 10) : 0,
      0
    ).getTime();
  }
  return new Date(normalized).getTime();
}

function formatSessionTimestamp(nowMs) {
  const d = new Date(nowMs);
  const pad = n => String(n).padStart(2, '0');
  const suffix = crypto.randomBytes(2).toString('hex');
  return `rec_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${suffix}`;
}

function extensionFromMimeType(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

function isStaffUser(user) {
  return !!(user && (user.ures_tag === 'SUPERADMIN' || user.ures_tag === 'HR_ADMIN'));
}

function createRecordingManager({
  dbModule,
  recordingDir = DEFAULT_RECORDING_DIR,
  nowFn = () => Date.now(),
} = {}) {
  if (!dbModule) {
    throw new Error('createRecordingManager vyžaduje dbModule');
  }

  fs.mkdirSync(recordingDir, { recursive: true });
  const rooms = new Map();

  function getOrCreateRoom(roomId) {
    const cleanRoom = String(roomId || '').trim();
    if (!rooms.has(cleanRoom)) {
      rooms.set(cleanRoom, {
        roomId: cleanRoom,
        participants: new Map(),
        sseClients: new Set(),
        recordingState: 'waiting', // 'waiting' | 'recording' | 'paused' | 'stopped'
        manualMode: null,          // null | 'started' | 'paused' | 'stopped'
        sessionId: null,
        trigger: null,             // 'auto' | 'manual'
        startedAt: null,
        startedAtMs: null,
        pausedAt: null,
        stoppedAt: null,
        stoppedBy: null,
        startedBy: null,
        accumulatedPauseMs: 0,
        pauseSegmentStartedAtMs: null,
        finalDurationSeconds: 0,
        files: new Map(),
      });
    }
    return rooms.get(cleanRoom);
  }

  function classifyParticipant(interview, { authUser = null, name = '', email = '', inviteeEmail = '' } = {}) {
    const cleanInvitee = normalizeEmail(inviteeEmail);
    const cleanEmail = normalizeEmail(email);
    const effectiveEmail = cleanInvitee || cleanEmail;
    const staffAuth = isStaffUser(authUser);
    const authMail = staffAuth ? normalizeEmail(authUser.mail) : '';

    const candEmail = interview ? normalizeEmail(interview.mail_respondenta) : '';
    const hrEmail = interview ? normalizeEmail(interview.hr_mail) : '';
    const isPlaceholder = !interview
      || !interview.meno_respondenta
      || interview.meno_respondenta === 'Kandidát'
      || interview.poznamky === 'Vytvorené priamym vstupom cez link';

    const colleagueEmails = interview
      ? dbModule.parseEmailList(interview.dalsie_maily).filter(e => e && e !== candEmail)
      : [];

    if (!isPlaceholder && candEmail && effectiveEmail === candEmail) {
      return {
        roleTag: 'kandidat',
        isInterviewer: false,
        isCandidate: true,
        isColleague: false,
        matchedEmail: candEmail,
        canControlRecording: false,
        displayName: String(name || interview.meno_respondenta || 'Kandidát').trim(),
      };
    }

    if (
      effectiveEmail
      && colleagueEmails.includes(effectiveEmail)
      && (!staffAuth || (cleanInvitee && cleanInvitee === effectiveEmail && effectiveEmail !== hrEmail))
    ) {
      return {
        roleTag: 'kolega',
        isInterviewer: false,
        isCandidate: false,
        isColleague: true,
        matchedEmail: effectiveEmail,
        canControlRecording: !!(staffAuth && authMail === effectiveEmail),
        displayName: String(name || effectiveEmail).trim(),
      };
    }

    if (staffAuth) {
      const fullName = `${authUser.meno || ''} ${authUser.priezvisko || ''}`.trim() || authUser.username || name || 'HR';
      return {
        roleTag: 'hr',
        isInterviewer: true,
        isCandidate: false,
        isColleague: !!(authMail && colleagueEmails.includes(authMail)),
        matchedEmail: authMail || effectiveEmail,
        canControlRecording: true,
        displayName: String(name || fullName).trim(),
      };
    }

    if (effectiveEmail && colleagueEmails.includes(effectiveEmail)) {
      return {
        roleTag: 'kolega',
        isInterviewer: false,
        isCandidate: false,
        isColleague: true,
        matchedEmail: effectiveEmail,
        canControlRecording: false,
        displayName: String(name || effectiveEmail).trim(),
      };
    }

    if (!isPlaceholder && !candEmail && !cleanInvitee) {
      return {
        roleTag: 'kandidat',
        isInterviewer: false,
        isCandidate: true,
        isColleague: false,
        matchedEmail: '',
        canControlRecording: false,
        displayName: String(name || interview.meno_respondenta || 'Kandidát').trim(),
      };
    }

    return {
      roleTag: 'ucastnik',
      isInterviewer: false,
      isCandidate: false,
      isColleague: false,
      matchedEmail: effectiveEmail,
      canControlRecording: false,
      displayName: String(name || effectiveEmail || 'Účastník').trim(),
    };
  }

  function pruneStaleParticipants(roomState, nowMs) {
    for (const [clientId, p] of roomState.participants.entries()) {
      if (nowMs - p.lastSeen > PRESENCE_TTL_MS) {
        roomState.participants.delete(clientId);
      }
    }
  }

  function writeSessionMeta(roomState, interview) {
    if (!roomState.sessionId) return;
    const safeRoom = sanitizeSegment(roomState.roomId, 'room');
    const roomDir = path.join(recordingDir, safeRoom);
    fs.mkdirSync(roomDir, { recursive: true });

    const metaPath = path.join(roomDir, `${roomState.sessionId}_meta.json`);
    const filesList = Array.from(roomState.files.values()).filter(f => f.sessionId === roomState.sessionId);

    const payload = {
      sessionId: roomState.sessionId,
      roomId: roomState.roomId,
      interviewId: interview ? interview.id : null,
      titulPozicia: interview ? interview.titul_pozicia : null,
      scheduledAt: interview ? interview.datum : null,
      state: roomState.recordingState,
      trigger: roomState.trigger,
      startedAt: roomState.startedAt,
      pausedAt: roomState.pausedAt,
      stoppedAt: roomState.stoppedAt,
      startedBy: roomState.startedBy,
      stoppedBy: roomState.stoppedBy,
      activeParticipants: Array.from(roomState.participants.values()).map(p => ({
        name: p.name,
        email: p.matchedEmail,
        roleTag: p.roleTag,
      })),
      files: filesList.map(f => ({
        fileName: f.fileName,
        roleTag: f.roleTag,
        participantName: f.participantName,
        participantEmail: f.participantEmail,
        mimeType: f.mimeType,
        bytes: f.bytes,
        chunks: f.chunks,
        completed: f.completed,
        updatedAt: f.updatedAt,
      })),
    };

    fs.writeFileSync(metaPath, JSON.stringify(payload, null, 2), 'utf8');

    if (interview && interview.id) {
      dbModule.setInterviewRecordingPath(interview.id, `recording/${safeRoom}`);
    }
  }

  function computeElapsedSeconds(roomState, nowMs) {
    if (roomState.recordingState === 'waiting') return 0;
    if (roomState.recordingState === 'stopped') return roomState.finalDurationSeconds || 0;
    if (!roomState.startedAtMs) return 0;
    const refMs = roomState.recordingState === 'paused' && roomState.pauseSegmentStartedAtMs
      ? roomState.pauseSegmentStartedAtMs
      : nowMs;
    return Math.max(0, Math.floor((refMs - roomState.startedAtMs - roomState.accumulatedPauseMs) / 1000));
  }

  function startSessionInternal(roomState, interview, nowMs, trigger, actorUser = null) {
    const actorName = actorUser
      ? (`${actorUser.meno || ''} ${actorUser.priezvisko || ''}`.trim() || actorUser.username)
      : 'SYSTEM';

    roomState.sessionId = formatSessionTimestamp(nowMs);
    roomState.recordingState = 'recording';
    roomState.trigger = trigger;
    roomState.startedAt = new Date(nowMs).toISOString();
    roomState.startedAtMs = nowMs;
    roomState.pausedAt = null;
    roomState.stoppedAt = null;
    roomState.stoppedBy = null;
    roomState.startedBy = actorName;
    roomState.accumulatedPauseMs = 0;
    roomState.pauseSegmentStartedAtMs = null;
    roomState.finalDurationSeconds = 0;

    writeSessionMeta(roomState, interview);

    if (dbModule.logAudit) {
      dbModule.logAudit(
        'NAHRÁVANIE_SPUSTENÉ',
        actorName,
        `Spustené nahrávanie pohovoru "${roomState.roomId}" (${trigger === 'auto' ? 'automaticky po splnení podmienok' : 'manuálne HR/Admin'}), relácia: ${roomState.sessionId}`
      );
    }
  }

  function stopSessionInternal(roomState, interview, nowMs, trigger, actorUser = null) {
    if (roomState.recordingState === 'paused' && roomState.pauseSegmentStartedAtMs) {
      roomState.accumulatedPauseMs += Math.max(0, nowMs - roomState.pauseSegmentStartedAtMs);
      roomState.pauseSegmentStartedAtMs = null;
    }
    roomState.finalDurationSeconds = roomState.startedAtMs
      ? Math.max(0, Math.floor((nowMs - roomState.startedAtMs - roomState.accumulatedPauseMs) / 1000))
      : 0;

    const actorName = actorUser
      ? (`${actorUser.meno || ''} ${actorUser.priezvisko || ''}`.trim() || actorUser.username)
      : 'SYSTEM';

    roomState.recordingState = 'stopped';
    roomState.stoppedAt = new Date(nowMs).toISOString();
    roomState.stoppedBy = actorName;

    writeSessionMeta(roomState, interview);

    if (roomState.sessionId && dbModule.logAudit) {
      dbModule.logAudit(
        'NAHRÁVANIE_ZASTAVENÉ',
        actorName,
        `Zastavené nahrávanie pohovoru "${roomState.roomId}" (${trigger}), trvanie: ${roomState.finalDurationSeconds}s, relácia: ${roomState.sessionId}`
      );
    }
  }

  function buildPublicSnapshot(roomState, interview, evalResult, nowMs) {
    const safeRoom = sanitizeSegment(roomState.roomId, 'room');
    const filesList = Array.from(roomState.files.values()).map(f => ({
      fileName: f.fileName,
      roleTag: f.roleTag,
      participantName: f.participantName,
      bytes: f.bytes,
      completed: f.completed,
    }));

    return {
      roomId: roomState.roomId,
      recordingDir: `recording/${safeRoom}`,
      state: roomState.recordingState,
      manualMode: roomState.manualMode,
      sessionId: roomState.sessionId,
      trigger: roomState.trigger,
      startedAt: roomState.startedAt,
      pausedAt: roomState.pausedAt,
      stoppedAt: roomState.stoppedAt,
      elapsedSeconds: computeElapsedSeconds(roomState, nowMs),
      scheduledAt: interview ? interview.datum : null,
      attendance: {
        activeCount: evalResult.activeParticipants.length,
        interviewerPresent: evalResult.interviewerPresent,
        candidatePresent: evalResult.candidatePresent,
        requiredColleagues: evalResult.requiredColleagues,
        missingColleagues: evalResult.missingColleagues,
        timeReached: evalResult.timeReached,
        autoConditionsMet: evalResult.autoConditionsMet,
        waitingFor: evalResult.waitingFor,
        participants: evalResult.activeParticipants.map(p => ({
          name: p.name,
          email: p.matchedEmail,
          roleTag: p.roleTag,
        })),
      },
      files: filesList,
    };
  }

  function evaluateRoom(roomId) {
    const nowMs = nowFn();
    const roomState = getOrCreateRoom(roomId);
    pruneStaleParticipants(roomState, nowMs);

    const interview = dbModule.getInterviewByRoomId(roomState.roomId);
    const active = Array.from(roomState.participants.values());

    const candEmail = interview ? normalizeEmail(interview.mail_respondenta) : '';
    const isPlaceholder = !interview
      || !interview.meno_respondenta
      || interview.meno_respondenta === 'Kandidát'
      || interview.poznamky === 'Vytvorené priamym vstupom cez link';

    const requiredColleagues = interview
      ? dbModule.parseEmailList(interview.dalsie_maily).filter(e => e && e !== candEmail)
      : [];

    const activeEmails = new Set(
      active.map(p => normalizeEmail(p.matchedEmail || p.email)).filter(Boolean)
    );

    const interviewerPresent = active.some(p => p.isInterviewer);
    const candidatePresent = active.some(
      p => p.isCandidate || (!!candEmail && normalizeEmail(p.matchedEmail || p.email) === candEmail)
    );
    const missingColleagues = requiredColleagues.filter(cMail => !activeEmails.has(cMail));

    const scheduledMs = interview ? parseInterviewDatumMs(interview.datum) : NaN;
    const isCancelled = !!(interview && interview.vyhodnotenie === 'zruseny');
    const timeReached = !isPlaceholder && !isCancelled && !isNaN(scheduledMs) && nowMs >= scheduledMs;

    const waitingFor = [];
    if (isCancelled) {
      waitingFor.push('Pohovor bol zrušený');
    } else if (isPlaceholder) {
      waitingFor.push('Pohovor nemá naplánovaný termín (HR môže spustiť nahrávanie manuálne)');
    } else {
      if (!timeReached && !isNaN(scheduledMs)) {
        waitingFor.push(`Termín pohovoru (${interview.datum})`);
      }
      if (!interviewerPresent) {
        waitingFor.push('HR / vykonávateľ pohovoru');
      }
      if (!candidatePresent) {
        waitingFor.push(`Pozvaný kandidát (${interview.meno_respondenta || interview.mail_respondenta})`);
      }
      if (missingColleagues.length > 0) {
        waitingFor.push(`Ďalší pozvaní účastníci (${missingColleagues.join(', ')})`);
      }
    }

    const autoConditionsMet = !isPlaceholder
      && !isCancelled
      && timeReached
      && interviewerPresent
      && candidatePresent
      && missingColleagues.length === 0;

    const prevState = roomState.recordingState;
    const prevSession = roomState.sessionId;

    if (active.length === 0) {
      if (roomState.recordingState === 'recording' || roomState.recordingState === 'paused') {
        stopSessionInternal(roomState, interview, nowMs, 'all_left');
      }
      if (roomState.manualMode === null) {
        roomState.recordingState = 'waiting';
      }
    } else if (roomState.recordingState === 'waiting' && roomState.manualMode === null && autoConditionsMet) {
      startSessionInternal(roomState, interview, nowMs, 'auto');
    }

    const snapshot = buildPublicSnapshot(roomState, interview, {
      activeParticipants: active,
      interviewerPresent,
      candidatePresent,
      requiredColleagues,
      missingColleagues,
      timeReached,
      autoConditionsMet,
      waitingFor,
    }, nowMs);

    if (prevState !== roomState.recordingState || prevSession !== roomState.sessionId) {
      broadcastSse(roomState, snapshot);
    }

    return snapshot;
  }

  function broadcastSse(roomState, snapshot) {
    const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
    for (const res of roomState.sseClients) {
      try {
        res.write(payload);
      } catch (_) {
        roomState.sseClients.delete(res);
      }
    }
  }

  function registerPresence(roomId, { clientId, authUser = null, name = '', email = '', inviteeEmail = '' } = {}) {
    if (!clientId) {
      throw Object.assign(new Error('Chýba clientId účastníka.'), { statusCode: 400 });
    }
    const nowMs = nowFn();
    const roomState = getOrCreateRoom(roomId);
    const interview = dbModule.getInterviewByRoomId(roomState.roomId);
    const info = classifyParticipant(interview, { authUser, name, email, inviteeEmail });

    const existing = roomState.participants.get(clientId);
    roomState.participants.set(clientId, {
      clientId,
      name: info.displayName,
      email: normalizeEmail(email || inviteeEmail),
      matchedEmail: info.matchedEmail,
      roleTag: info.roleTag,
      isInterviewer: info.isInterviewer,
      isCandidate: info.isCandidate,
      isColleague: info.isColleague,
      joinedAt: existing ? existing.joinedAt : nowMs,
      lastSeen: nowMs,
    });

    const snapshot = evaluateRoom(roomId);
    return {
      ...snapshot,
      participant: {
        clientId,
        roleTag: info.roleTag,
        canControlRecording: info.canControlRecording,
        displayName: info.displayName,
        email: info.matchedEmail,
      },
    };
  }

  function unregisterPresence(roomId, clientId) {
    const roomState = getOrCreateRoom(roomId);
    if (clientId) {
      roomState.participants.delete(clientId);
    }
    return evaluateRoom(roomId);
  }

  function controlRecording(roomId, { authUser = null, action = '' } = {}) {
    if (!isStaffUser(authUser)) {
      throw Object.assign(
        new Error('Manuálne ovládanie nahrávania je povolené iba pre HR admina alebo Superadmina.'),
        { statusCode: 403 }
      );
    }

    const validActions = new Set(['start', 'pause', 'resume', 'stop']);
    if (!validActions.has(action)) {
      throw Object.assign(new Error(`Neznáma akcia nahrávania: ${action}`), { statusCode: 400 });
    }

    const nowMs = nowFn();
    const roomState = getOrCreateRoom(roomId);
    const interview = dbModule.getInterviewByRoomId(roomState.roomId);

    if (action === 'start') {
      if (roomState.recordingState === 'paused') {
        roomState.accumulatedPauseMs += roomState.pauseSegmentStartedAtMs
          ? Math.max(0, nowMs - roomState.pauseSegmentStartedAtMs)
          : 0;
        roomState.pauseSegmentStartedAtMs = null;
        roomState.recordingState = 'recording';
        roomState.manualMode = 'started';
        roomState.pausedAt = null;
        writeSessionMeta(roomState, interview);
      } else if (roomState.recordingState !== 'recording') {
        roomState.manualMode = 'started';
        startSessionInternal(roomState, interview, nowMs, 'manual', authUser);
      }
    } else if (action === 'pause') {
      if (roomState.recordingState !== 'recording') {
        throw Object.assign(new Error('Nahrávanie momentálne nebeží.'), { statusCode: 400 });
      }
      roomState.recordingState = 'paused';
      roomState.manualMode = 'paused';
      roomState.pausedAt = new Date(nowMs).toISOString();
      roomState.pauseSegmentStartedAtMs = nowMs;
      writeSessionMeta(roomState, interview);
    } else if (action === 'resume') {
      if (roomState.recordingState === 'paused') {
        roomState.accumulatedPauseMs += roomState.pauseSegmentStartedAtMs
          ? Math.max(0, nowMs - roomState.pauseSegmentStartedAtMs)
          : 0;
        roomState.pauseSegmentStartedAtMs = null;
        roomState.recordingState = 'recording';
        roomState.manualMode = 'started';
        roomState.pausedAt = null;
        writeSessionMeta(roomState, interview);
      } else if (roomState.recordingState === 'waiting' || roomState.recordingState === 'stopped') {
        roomState.manualMode = 'started';
        startSessionInternal(roomState, interview, nowMs, 'manual', authUser);
      }
    } else if (action === 'stop') {
      if (roomState.recordingState === 'recording' || roomState.recordingState === 'paused') {
        roomState.manualMode = 'stopped';
        stopSessionInternal(roomState, interview, nowMs, 'manual', authUser);
      } else {
        roomState.manualMode = 'stopped';
        roomState.recordingState = 'stopped';
      }
    }

    const snapshot = evaluateRoom(roomId);
    broadcastSse(roomState, snapshot);
    return snapshot;
  }

  function appendChunk(roomId, {
    sessionId,
    clientId,
    roleTag = 'ucastnik',
    name = 'ucastnik',
    email = '',
    mimeType = 'video/webm',
    isFinal = false,
  } = {}, buffer = Buffer.alloc(0)) {
    if (!sessionId || !clientId) {
      throw Object.assign(new Error('Chýba sessionId alebo clientId.'), { statusCode: 400 });
    }
    const nowMs = nowFn();
    const roomState = getOrCreateRoom(roomId);
    const interview = dbModule.getInterviewByRoomId(roomState.roomId);

    const safeRoom = sanitizeSegment(roomId, 'room');
    const safeSession = sanitizeSegment(sessionId, 'rec');
    const safeRole = sanitizeSegment(roleTag, 'ucastnik');
    const safeName = sanitizeSegment(name, 'ucastnik');
    const safeClient = sanitizeSegment(clientId, 'c').slice(-6);
    const ext = extensionFromMimeType(mimeType);

    const fileKey = `${safeSession}:${clientId}`;
    let fileEntry = roomState.files.get(fileKey);

    if (!fileEntry) {
      const fileName = `${safeSession}_${safeRole}_${safeName}_${safeClient}.${ext}`;
      fileEntry = {
        sessionId,
        fileName,
        roleTag: safeRole,
        participantName: String(name || '').trim(),
        participantEmail: normalizeEmail(email),
        mimeType,
        bytes: 0,
        chunks: 0,
        completed: false,
        updatedAt: new Date(nowMs).toISOString(),
      };
      roomState.files.set(fileKey, fileEntry);
    }

    const roomDir = path.join(recordingDir, safeRoom);
    fs.mkdirSync(roomDir, { recursive: true });
    const fullPath = path.join(roomDir, fileEntry.fileName);

    if (Buffer.isBuffer(buffer) && buffer.length > 0) {
      fs.appendFileSync(fullPath, buffer);
      fileEntry.bytes += buffer.length;
      fileEntry.chunks += 1;
    }

    if (isFinal) {
      fileEntry.completed = true;
    }
    fileEntry.updatedAt = new Date(nowMs).toISOString();

    if (!roomState.sessionId) {
      roomState.sessionId = sessionId;
    }
    writeSessionMeta(roomState, interview);

    return {
      ok: true,
      fileName: fileEntry.fileName,
      bytes: fileEntry.bytes,
      chunks: fileEntry.chunks,
      completed: fileEntry.completed,
      relativePath: `recording/${safeRoom}/${fileEntry.fileName}`,
    };
  }

  function addSseClient(roomId, res) {
    const roomState = getOrCreateRoom(roomId);
    roomState.sseClients.add(res);
    return roomState;
  }

  function removeSseClient(roomId, res) {
    const roomState = rooms.get(String(roomId || '').trim());
    if (roomState) {
      roomState.sseClients.delete(res);
    }
  }

  function tickAllRooms() {
    for (const roomId of rooms.keys()) {
      try {
        evaluateRoom(roomId);
      } catch (err) {
        console.warn(`[Recording] Chyba v tick pre ${roomId}:`, err.message);
      }
    }
  }

  function listRoomRecordings(roomId) {
    const safeRoom = sanitizeSegment(roomId, 'room');
    const roomDir = path.join(recordingDir, safeRoom);
    if (!fs.existsSync(roomDir)) return [];
    return fs.readdirSync(roomDir)
      .filter(f => f !== '.gitkeep')
      .map(name => {
        const full = path.join(roomDir, name);
        const stat = fs.statSync(full);
        return {
          fileName: name,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        };
      });
  }

  return {
    recordingDir,
    parseInterviewDatumMs,
    getStatus: evaluateRoom,
    registerPresence,
    unregisterPresence,
    controlRecording,
    appendChunk,
    addSseClient,
    removeSseClient,
    tickAllRooms,
    listRoomRecordings,
  };
}

module.exports = {
  createRecordingManager,
  parseInterviewDatumMs,
  DEFAULT_RECORDING_DIR,
};
