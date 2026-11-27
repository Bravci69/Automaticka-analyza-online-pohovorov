// =============================================================================
// Klientský modul nahrávania pohovorov & prezenčnej synchronizácie
// Bakalárska práca - FIIT STU Bratislava
// =============================================================================

// Stav nahrávania pohovoru (automatické spustenie + ovládanie len pre HR/Superadmina)
let canControlRecording = false;
let participantRoleTag = 'ucastnik';
let participantJoinedName = '';
let participantJoinedEmail = '';
let recordingClientId = '';
let latestRecordingSnapshot = null;
let recEventSource = null;
let presenceIntervalId = null;
let recTimerIntervalId = null;
let activeRecorder = null;
let activeRecorderSessionId = null;
let recStartInFlightSessionId = null;
let recStopResolver = null;
let recUploadQueue = Promise.resolve();

// =================================================================
// 7. NAHRÁVANIE POHOVORU & SYNCHRONIZÁCIA ÚČASTNÍKOV
// =================================================================
function formatRecDuration(totalSec) {
    const s = Math.max(0, Math.floor(totalSec || 0));
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
}

function pickSupportedRecordingMimeType(hasVideo, hasAudio) {
    if (typeof MediaRecorder === 'undefined') return '';
    let candidates = [];
    if (hasVideo && hasAudio) {
        candidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
    } else if (hasVideo) {
        candidates = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
    } else if (hasAudio) {
        candidates = [
            'audio/webm;codecs=opus',
            'audio/webm'
        ];
    }

    for (const m of candidates) {
        try {
            if (MediaRecorder.isTypeSupported(m)) return m;
        } catch (_) {}
    }
    return '';
}

async function initRecordingSync(userName, userEmail) {
    recordingClientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await sendPresenceHeartbeat(userName, userEmail);

    if (recEventSource) {
        try { recEventSource.close(); } catch (_) {}
    }
    recEventSource = new EventSource(`/api/meetings/${encodeURIComponent(activeRoom)}/recording/events`);
    recEventSource.onmessage = (ev) => {
        try {
            const snapshot = JSON.parse(ev.data);
            applyRecordingSnapshot(snapshot);
        } catch (_) {}
    };

    if (presenceIntervalId) clearInterval(presenceIntervalId);
    presenceIntervalId = setInterval(() => {
        sendPresenceHeartbeat(participantJoinedName, participantJoinedEmail);
    }, 3000);

    if (recTimerIntervalId) clearInterval(recTimerIntervalId);
    recTimerIntervalId = setInterval(() => {
        if (latestRecordingSnapshot && latestRecordingSnapshot.state === 'recording') {
            latestRecordingSnapshot.elapsedSeconds = (latestRecordingSnapshot.elapsedSeconds || 0) + 1;
            renderRecordingUI(latestRecordingSnapshot);
        }
    }, 1000);

    window.addEventListener('pagehide', sendLeaveBeacon);
    window.addEventListener('beforeunload', sendLeaveBeacon);
}

function sendLeaveBeacon() {
    if (!recordingClientId || !activeRoom) return;
    try {
        const payload = new Blob([JSON.stringify({ clientId: recordingClientId })], { type: 'application/json' });
        navigator.sendBeacon(`/api/meetings/${encodeURIComponent(activeRoom)}/presence/leave`, payload);
    } catch (_) {}
}

async function sendPresenceHeartbeat(userName, userEmail) {
    if (!recordingClientId || !activeRoom || isLeavingSession) return;
    const token = localStorage.getItem('bp_token');
    const inviteeEmail = (urlParams.get('invitee') || '').trim();
    const autoJoin = urlParams.get('autojoin') === '1';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const res = await fetch(`/api/meetings/${encodeURIComponent(activeRoom)}/presence`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                clientId: recordingClientId,
                name: userName,
                email: userEmail,
                inviteeEmail,
                autoJoin
            })
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.participant) {
            participantRoleTag = data.participant.roleTag || participantRoleTag;
            const serverCanControl = !!data.participant.canControlRecording;
            if (serverCanControl !== canControlRecording) {
                canControlRecording = serverCanControl;
            }
            const el = document.getElementById('hrRecordingControls');
            if (el) {
                el.style.display = canControlRecording ? 'flex' : 'none';
            }
        }
        applyRecordingSnapshot(data);
    } catch (err) {
        console.warn('Chyba prezenčného heartbeatu:', err);
    }
}

function applyRecordingSnapshot(snapshot) {
    if (!snapshot) return;
    latestRecordingSnapshot = snapshot;
    renderRecordingUI(snapshot);

    if (snapshot.state === 'recording') {
        if (!activeRecorder || activeRecorderSessionId !== snapshot.sessionId) {
            if (activeRecorder && activeRecorder.state !== 'inactive') {
                stopLocalMediaRecorder().then(() => {
                    if (latestRecordingSnapshot && latestRecordingSnapshot.state === 'recording') {
                        startLocalMediaRecorder(snapshot.sessionId);
                    }
                });
            } else {
                startLocalMediaRecorder(snapshot.sessionId);
            }
        } else if (activeRecorder.state === 'paused') {
            try {
                activeRecorder.resume();
            } catch (e) {
                console.warn('Nepodarilo sa pokračovať v MediaRecorder:', e);
            }
        }
    } else if (snapshot.state === 'paused') {
        if (activeRecorder && activeRecorder.state === 'recording') {
            try {
                activeRecorder.pause();
            } catch (e) {
                console.warn('Nepodarilo sa pozastaviť MediaRecorder:', e);
            }
        }
    } else {
        if (activeRecorder && activeRecorder.state !== 'inactive') {
            stopLocalMediaRecorder();
        }
    }
}

function renderRecordingUI(snapshot) {
    const pill = document.getElementById('recordingStatusPill');
    const pillText = document.getElementById('recPillText');
    const state = snapshot.state || 'waiting';
    const dur = formatRecDuration(snapshot.elapsedSeconds || 0);
    const waitingFor = snapshot.attendance?.waitingFor || [];

    if (pill && pillText) {
        pill.className = `rec-status-pill ${state}`;
        if (state === 'recording') {
            pillText.textContent = `REC · ${dur}`;
            pill.title = 'Pohovor sa práve nahráva do server/recording';
        } else if (state === 'paused') {
            pillText.textContent = `PAUSED · ${dur}`;
            pill.title = 'Nahrávanie pohovoru je pozastavené';
        } else if (state === 'stopped') {
            pillText.textContent = `Záznam uložený (${dur})`;
            pill.title = 'Nahrávanie bolo ukončené a uložené';
        } else {
            if (canControlRecording && waitingFor.length > 0) {
                pillText.textContent = `Čaká sa: ${waitingFor[0]}`;
                pill.title = `Automatické nahrávanie čaká na: ${waitingFor.join(' + ')}`;
            } else {
                pillText.textContent = 'Nahrávanie: čaká sa';
                pill.title = 'Nahrávanie sa spustí automaticky po pripojení pozvaných v termíne pohovoru';
            }
        }
    }

    const controlsEl = document.getElementById('hrRecordingControls');
    if (!canControlRecording) {
        if (controlsEl) controlsEl.style.display = 'none';
        return;
    }
    if (controlsEl) controlsEl.style.display = 'flex';

    const btnStart = document.getElementById('btnRecStart');
    const btnStartLbl = document.getElementById('btnRecStartLabel');
    const btnPause = document.getElementById('btnRecPause');
    const btnPauseLbl = document.getElementById('btnRecPauseLabel');
    const btnStop = document.getElementById('btnRecStop');
    if (!btnStart || !btnPause || !btnStop) return;

    if (state === 'recording') {
        btnStart.style.display = 'none';
        btnPause.style.display = 'inline-flex';
        btnStop.style.display = 'inline-flex';
        if (btnPauseLbl) btnPauseLbl.textContent = 'Pozastaviť';
    } else if (state === 'paused') {
        btnStart.style.display = 'none';
        btnPause.style.display = 'inline-flex';
        btnStop.style.display = 'inline-flex';
        if (btnPauseLbl) btnPauseLbl.textContent = 'Pokračovať';
    } else {
        btnStart.style.display = 'inline-flex';
        btnPause.style.display = 'none';
        btnStop.style.display = 'none';
        if (btnStartLbl) {
            btnStartLbl.textContent = state === 'stopped' ? 'Nahrávať znova' : 'Nahrávať';
        }
    }
}

async function startLocalMediaRecorder(sessionId) {
    if (!sessionId || typeof MediaRecorder === 'undefined') {
        console.warn('MediaRecorder nie je v tomto prehliadači dostupný.');
        return;
    }
    if (recStartInFlightSessionId === sessionId || activeRecorderSessionId === sessionId) {
        return;
    }
    recStartInFlightSessionId = sessionId;

    try {
        let liveTracks = localStream
            ? localStream.getTracks().filter(t => t.readyState === 'live')
            : [];

        if (liveTracks.length === 0 && navigator.mediaDevices?.getUserMedia) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                liveTracks = localStream.getTracks().filter(t => t.readyState === 'live');
            } catch (micErr) {
                console.warn('Pre nahrávanie sa nepodarilo získať lokálny audio/video stream:', micErr);
            }
        }

        if (liveTracks.length === 0) {
            console.warn('Žiadny živý lokálny stream na záznam (beží len serverová relácia pre ostatných účastníkov).');
            return;
        }

        const recStream = new MediaStream(liveTracks);
        const hasVideo = recStream.getVideoTracks().length > 0;
        const hasAudio = recStream.getAudioTracks().length > 0;
        const mimeType = pickSupportedRecordingMimeType(hasVideo, hasAudio);

        let recorder;
        try {
            const recorderOptions = mimeType ? { mimeType } : {};
            if (hasVideo) recorderOptions.videoBitsPerSecond = 1200000;
            recorder = new MediaRecorder(recStream, recorderOptions);
        } catch (_) {
            recorder = new MediaRecorder(recStream);
        }

        const resolvedMime = mimeType || recorder.mimeType || (hasVideo ? 'video/webm' : 'audio/webm');

        activeRecorder = recorder;
        activeRecorderSessionId = sessionId;

        recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
                enqueueChunkUpload(sessionId, resolvedMime, ev.data, false);
            }
        };

        recorder.onstop = () => {
            enqueueChunkUpload(sessionId, resolvedMime, new Blob([]), true).finally(() => {
                if (activeRecorder === recorder) {
                    activeRecorder = null;
                    activeRecorderSessionId = null;
                }
                if (recStopResolver) {
                    const done = recStopResolver;
                    recStopResolver = null;
                    done();
                }
            });
        };

        recorder.start(2000);
        console.log(`🎥 Nahrávanie spustené (${resolvedMime}, relácia: ${sessionId})`);
    } catch (err) {
        console.error('Nepodarilo sa spustiť MediaRecorder:', err);
    } finally {
        if (recStartInFlightSessionId === sessionId) {
            recStartInFlightSessionId = null;
        }
    }
}

function stopLocalMediaRecorder() {
    return new Promise((resolve) => {
        if (!activeRecorder || activeRecorder.state === 'inactive') {
            resolve();
            return;
        }
        recStopResolver = resolve;
        try {
            activeRecorder.stop();
        } catch (_) {
            recStopResolver = null;
            activeRecorder = null;
            activeRecorderSessionId = null;
            resolve();
        }
    });
}

function enqueueChunkUpload(sessionId, mimeType, blob, isFinal) {
    recUploadQueue = recUploadQueue.then(async () => {
        if (!activeRoom || !sessionId || !recordingClientId) return;
        const params = new URLSearchParams({
            sessionId,
            clientId: recordingClientId,
            role: participantRoleTag || 'ucastnik',
            name: participantJoinedName || 'ucastnik',
            email: participantJoinedEmail || '',
            mimeType: mimeType || 'video/webm',
            final: isFinal ? '1' : '0'
        });
        try {
            await fetch(`/api/meetings/${encodeURIComponent(activeRoom)}/recording/chunk?${params.toString()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: blob,
                keepalive: !!isFinal
            });
        } catch (err) {
            console.warn('Chyba odosielania bloku nahrávky:', err);
        }
    });
    return recUploadQueue;
}

async function controlRecording(action) {
    if (!canControlRecording) return;
    const token = localStorage.getItem('bp_token');
    if (!token) {
        alert('Pre ovládanie nahrávania musíte byť prihlásený ako HR alebo Superadmin.');
        return;
    }
    try {
        const res = await fetch(`/api/meetings/${encodeURIComponent(activeRoom)}/recording/control`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Akcia nahrávania zlyhala.');
            return;
        }
        applyRecordingSnapshot(data);
    } catch (err) {
        console.error('Chyba ovládania nahrávania:', err);
    }
}

function togglePauseRecording() {
    if (!latestRecordingSnapshot) return;
    if (latestRecordingSnapshot.state === 'paused') {
        controlRecording('resume');
    } else if (latestRecordingSnapshot.state === 'recording') {
        controlRecording('pause');
    }
}

async function shutdownRecordingOnLeave() {
    if (presenceIntervalId) {
        clearInterval(presenceIntervalId);
        presenceIntervalId = null;
    }
    if (recTimerIntervalId) {
        clearInterval(recTimerIntervalId);
        recTimerIntervalId = null;
    }
    if (recEventSource) {
        try { recEventSource.close(); } catch (_) {}
        recEventSource = null;
    }
    await stopLocalMediaRecorder();
    await recUploadQueue;
    if (recordingClientId && activeRoom) {
        try {
            await fetch(`/api/meetings/${encodeURIComponent(activeRoom)}/presence/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: recordingClientId }),
                keepalive: true
            });
        } catch (_) {}
    }
}

