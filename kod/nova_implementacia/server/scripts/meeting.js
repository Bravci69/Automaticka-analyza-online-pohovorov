// =============================================================================
// Klientský skript pre Videokonferenčnú Miestnosť & Eye-tracking
// Bakalárska práca - FIIT STU Bratislava | Jakub Chmura
// =============================================================================

let frameAnimationId = null;

function checkSecureContext() {
    const isHttp = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    if (isHttp) {
        const httpsUrl = 'https://' + window.location.host + window.location.pathname + window.location.search;
        let banner = document.getElementById('httpsWarnBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'httpsWarnBanner';
            banner.className = 'https-warning-banner';
            banner.innerHTML = `
                <div class="https-warning-inner">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <span><strong>Upozornenie prehliadača:</strong> Webkamera a mikrofón vyžadujú zabezpečené pripojenie HTTPS. Prehliadače Chrome, Edge aj Firefox blokujú mediálne zariadenia cez obyčajné HTTP.</span>
                    <a href="${httpsUrl}" class="https-btn-link">Prepnúť na HTTPS &rarr;</a>
                </div>
            `;
            document.body.prepend(banner);
        }
    }
}

function renderCamError(isSecureIssue, errMsg) {
    const placeholder = document.getElementById('previewPlaceholder');
    if (!placeholder) return;
    const isHttp = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const httpsUrl = 'https://' + window.location.host + window.location.pathname + window.location.search;

    placeholder.style.display = 'flex';
    placeholder.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="2" y1="2" x2="22" y2="22"/>
            <path d="M10.41 10.41a2 2 0 1 0 2.83 2.83"/>
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
            <rect x="2" y="6" width="14" height="12" rx="2"/>
        </svg>
        <span style="font-weight:600; color:#f8fafc; margin-top:6px;">Kamera nebola spustená</span>
        ${isHttp ? `
            <span style="font-size:0.75rem; color:#94a3b8; text-align:center; max-width:240px; margin-top:4px;">
                Prehliadač vyžaduje HTTPS na prístup ku kamere.
            </span>
            <a href="${httpsUrl}" style="margin-top:10px; display:inline-flex; align-items:center; gap:6px; background:#4f46e5; color:#fff; text-decoration:none; padding:6px 14px; border-radius:8px; font-size:0.78rem; font-weight:600;">
                Prejsť na HTTPS
            </a>
        ` : `
            <span style="font-size:0.75rem; color:#ef4444; text-align:center; max-width:240px; margin-top:4px;">
                ${errMsg || 'Povoľte prosím prístup ku kamere v nastaveniach prehliadača.'}
            </span>
        `}
    `;
}

const urlParams = new URLSearchParams(window.location.search);
const JITSI_SERVER = urlParams.get('server') || 'jitsi.riot.im';
let jitsiClient = null;
let activeRoom = '';
let localStream = null;
let isCamOn = true;
let isMicOn = true;
let isLeavingSession = false;

// Natívne parametre kamery (zistené v lobby pre zamedzenie zoomu/orezania v Jitsi)
let camConfig = {
    width: 1280,
    height: 720,
    aspectRatio: 16 / 9
};

// Eye-tracking & MediaPipe stav
let faceMesh = null;
let cameraTracker = null;
let isEyeTrackingRunning = false;
let isPipOpen = false;

// Časovač upozornení (očný kontakt, celá tvár v obraze, viditeľnosť očí)
let isGazeAway = false;
let gazeAwayStartTime = null;
let awayAlertTriggered = false;
const AWAY_ALERT_THRESHOLD_MS = 2000; // Po 2 sekundách problému sa zobrazí HUD varovanie

// Časovače pre dlhšie zatvorené / zakryté oči (odlíšenie bežného žmurknutia)
let eyesClosedStartTime = null;
let oneEyeClosedStartTime = null;

// Buffer na vyhladenie (zamedzenie falošným poplachom)
let consecutiveAwayFrames = 0;
let consecutiveNormalFrames = 0;

// Body obrysu tváre (MediaPipe FaceMesh oval) pre kontrolu celej tváre v obraze
const FACE_OVAL_INDICES = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];
const EYE_KEY_INDICES = [33, 133, 159, 145, 362, 263, 386, 374];

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
// 1. INICIALIZÁCIA LOBBY
// =================================================================
async function initLobby() {
    const parts = window.location.pathname.split('/meeting/');
    activeRoom = (parts[1] || '').trim();

    if (!activeRoom) {
        alert('Chýbajúci identifikátor stretnutia.');
        window.location.href = '/';
        return;
    }

    document.getElementById('roomNameLabel').textContent = activeRoom;
    document.getElementById('callSessionLabel').textContent = activeRoom;
    document.title = `${activeRoom} · Analýza Pohovorov`;

    // Umožnenie rýchleho skopírovania čistého odkazu na meeting
    const cleanShareUrl = `${window.location.origin}${window.location.pathname}`;
    const lobbyChip = document.getElementById('roomChip');
    if (lobbyChip) {
        lobbyChip.style.cursor = 'pointer';
        lobbyChip.title = 'Kliknutím skopírujete priamy odkaz na meeting';
        lobbyChip.onclick = async () => {
            try {
                await navigator.clipboard.writeText(cleanShareUrl);
                const lbl = document.getElementById('roomNameLabel');
                const orig = lbl.textContent;
                lbl.textContent = '✓ Odkaz skopírovaný!';
                setTimeout(() => lbl.textContent = orig, 2000);
            } catch (e) { }
        };
    }

    const headerChip = document.getElementById('callSessionLabel');
    if (headerChip) {
        headerChip.style.cursor = 'pointer';
        headerChip.title = 'Kliknutím skopírujete priamy odkaz na meeting';
        headerChip.onclick = async () => {
            try {
                await navigator.clipboard.writeText(cleanShareUrl);
                const orig = headerChip.textContent;
                headerChip.textContent = '✓ Odkaz skopírovaný!';
                setTimeout(() => headerChip.textContent = orig, 2000);
            } catch (e) { }
        };
    }

    const nameInput = document.getElementById('candidateName');
    const emailInput = document.getElementById('candidateEmail');
    nameInput.focus();
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') enterRoom();
    });
    if (emailInput) {
        emailInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') enterRoom();
        });
    }

    // Overenie zabezpečeného kontextu (HTTPS)
    checkSecureContext();

    // Paralelne zistíme identitu účastníka (HR/Superadmin relácia alebo ?invitee= z e-mailu) a spustíme kameru
    const identityPromise = resolveParticipantIdentity();
    const cameraPromise = initLocalCameraStream();

    const resolved = await identityPromise;
    if (resolved) {
        canControlRecording = !!resolved.canControlRecording;
        if (resolved.name && !nameInput.value.trim()) {
            nameInput.value = resolved.name;
        }
        if (emailInput && resolved.email && !emailInput.value.trim()) {
            emailInput.value = resolved.email;
        }
        if (nameInput.value.trim() && emailInput && !emailInput.value.trim()) {
            emailInput.focus();
        }
    }

    await cameraPromise;

    // Ak vstúpil HR alebo Superadmin tlačidlom "Vstúpiť" (?autojoin=1), pripojíme ho rovno do Jitsi
    if (resolved && resolved.autoJoin && resolved.name) {
        await enterRoom();
    }
}

async function resolveParticipantIdentity() {
    const token = localStorage.getItem('bp_token');
    const invitee = (urlParams.get('invitee') || '').trim();
    const autojoin = urlParams.get('autojoin') === '1';

    const query = new URLSearchParams();
    if (invitee) query.set('invitee', invitee);
    if (autojoin) query.set('autojoin', '1');

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
        const qs = query.toString();
        const res = await fetch(`/api/meetings/${encodeURIComponent(activeRoom)}/participant${qs ? '?' + qs : ''}`, {
            headers
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.warn('Nepodarilo sa načítať identitu účastníka:', err);
        return null;
    }
}

async function initLocalCameraStream() {
    const getMedia = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        ? (c) => navigator.mediaDevices.getUserMedia(c)
        : (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia)
            ? (c) => new Promise((res, rej) => (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia).call(navigator, c, res, rej))
            : null;

    if (!getMedia) {
        console.warn('getUserMedia nie je v tomto prehliadači / kontexte dostupné.');
        renderCamError(true);
        return;
    }

    try {
        // Najprv otvoríme kameru bez tvrdého vynútenia 4:3 orezu, aby sme zistili natívny pomer strán senzora
        localStream = await getMedia({
            video: { facingMode: 'user' },
            audio: true
        });

        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            const caps = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : null;
            if (caps && caps.width?.max && caps.height?.max) {
                const sensorRatio = caps.width.max / caps.height.max;
                const isWidescreen = sensorRatio >= 1.55;
                const targetW = isWidescreen ? Math.min(1280, caps.width.max) : Math.min(640, caps.width.max);
                const targetH = isWidescreen ? Math.min(720, caps.height.max) : Math.min(480, caps.height.max);
                try {
                    await videoTrack.applyConstraints({
                        width: { ideal: targetW },
                        height: { ideal: targetH },
                        aspectRatio: targetW / targetH
                    });
                } catch (constraintErr) {
                    console.warn('Nepodarilo sa aplikovať natívne rozlíšenie kamery:', constraintErr);
                }
            }

            const settings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};
            if (settings.width && settings.height) {
                camConfig = {
                    width: settings.width,
                    height: settings.height,
                    aspectRatio: settings.width / settings.height
                };
            }
        }

        const videoEl = document.getElementById('previewVideo');
        videoEl.srcObject = localStream;
        document.getElementById('previewPlaceholder').style.display = 'none';
    } catch (err) {
        console.warn('Kamera v lobby nedostupná:', err);
        try {
            localStream = await getMedia({ video: false, audio: true });
            console.info('Použitý aspoň mikrofónový stream pre záznam zvuku.');
        } catch (audioErr) {
            console.warn('Ani mikrofón nie je dostupný:', audioErr);
        }
        renderCamError(false, err.message);
    }
}

function toggleLocalCam() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        isCamOn = !isCamOn;
        videoTrack.enabled = isCamOn;
        document.getElementById('btnToggleCam').classList.toggle('off', !isCamOn);
    }
}

function toggleLocalMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        isMicOn = !isMicOn;
        audioTrack.enabled = isMicOn;
        document.getElementById('btnToggleMic').classList.toggle('off', !isMicOn);
    }
}

// =================================================================
// 2. VSTUP DO MIESTNOSTI A ŠTART
// =================================================================
async function enterRoom() {
    const name = document.getElementById('candidateName').value.trim();
    const emailEl = document.getElementById('candidateEmail');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!name) {
        const el = document.getElementById('candidateName');
        el.focus();
        el.style.borderColor = 'var(--accent-red)';
        setTimeout(() => el.style.borderColor = '', 1500);
        return;
    }

    participantJoinedName = name;
    participantJoinedEmail = email;

    const recControlsEl = document.getElementById('hrRecordingControls');
    if (recControlsEl) {
        recControlsEl.style.display = canControlRecording ? 'flex' : 'none';
    }

    document.getElementById('lobbyView').classList.add('hidden');
    document.getElementById('callView').classList.add('active');

    // Odovzdáme náhľadový stream nášmu tracking videu
    const trackerVideo = document.getElementById('trackerVideo');
    if (localStream) {
        trackerVideo.srcObject = localStream;
        try {
            await trackerVideo.play();
        } catch (e) {
            console.log('Video play catch:', e);
        }
    }

    // Štart prezenčnej synchronizácie a nahrávania pohovoru
    initRecordingSync(name, email);

    // Štart Jitsi videohovoru s menom a e-mailom účastníka
    startJitsi(name, email);

    // Štart MediaPipe Eye-Trackingu
    initRealEyeTracking();
}

function startJitsi(userName, userEmail = '') {
    const container = document.getElementById('jitsi-mount');
    const userInfo = { displayName: userName };
    if (userEmail) userInfo.email = userEmail;

    const options = {
        roomName: activeRoom,
        parentNode: container,
        width: '100%',
        height: '100%',
        lang: 'sk',
        userInfo,
        // HTML5 sandbox bráni nechcenému presmerovaniu top okna
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-presentation',
        configOverwrite: {
            startWithAudioMuted: !isMicOn,
            startWithVideoMuted: !isCamOn,
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            disableInviteFunctions: true,
            hideConferenceSubject: true,
            enableWelcomePage: false,
            enableClosePage: false,
            doNotStoreRoom: true,
            disableThirdPartyRequests: false,
            // Zabránenie neželanému orezaniu/zoomu videa v Jitsi vynútením natívnych parametrov kamery
            resolution: camConfig.height >= 720 ? 720 : 480,
            constraints: {
                video: {
                    aspectRatio: camConfig.aspectRatio,
                    width: { ideal: camConfig.width, max: Math.max(camConfig.width, 1280), min: 320 },
                    height: { ideal: camConfig.height, max: Math.max(camConfig.height, 720), min: 240 }
                }
            },
            disableTileEnlargement: true,
            notifications: [],
            toolbarButtons: [
                'microphone', 'camera', 'desktop',
                'chat', 'raisehand', 'tileview',
                'settings', 'hangup'
            ]
        },
        interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'desktop',
                'chat', 'raisehand', 'tileview',
                'settings', 'hangup'
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: '#08060c',
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            // Zákaz zoomovania a orezávania obrazu ('both' -> 'nocrop')
            VIDEO_LAYOUT_FIT: 'nocrop',
            MAXIMUM_ZOOMING_COEFFICIENT: 1,
            LOCAL_THUMBNAIL_RATIO: camConfig.aspectRatio,
            REMOTE_THUMBNAIL_RATIO: camConfig.aspectRatio
        }
    };

    try {
        jitsiClient = new JitsiMeetExternalAPI(JITSI_SERVER, options);

        jitsiClient.addEventListener('videoConferenceJoined', () => {
            document.getElementById('stageLoader').classList.add('hidden');
            try {
                if (userName) jitsiClient.executeCommand('displayName', userName);
                if (userEmail) jitsiClient.executeCommand('email', userEmail);
            } catch (cmdErr) {
                console.warn('Nepodarilo sa nastaviť identitu v Jitsi:', cmdErr);
            }
        });

        jitsiClient.addEventListener('videoConferenceLeft', () => {
            leaveSession();
        });

        jitsiClient.addEventListener('readyToClose', () => {
            leaveSession();
        });

        setTimeout(() => {
            document.getElementById('stageLoader').classList.add('hidden');
        }, 2500);

    } catch (err) {
        console.error('Jitsi error:', err);
        document.getElementById('stageLoader').innerHTML = `
                    <p style="color: var(--accent-red); font-size: 0.95rem;">Chyba pripojenia videohovoru</p>
                    <button onclick="window.location.reload()" style="padding: 8px 16px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px;">Skúsiť znova</button>
                `;
    }
}

        async function leaveSession() {
            if (isLeavingSession) return;
            isLeavingSession = true;
            stopEyeTracking();

            try {
                await Promise.race([
                    shutdownRecordingOnLeave(),
                    new Promise(res => setTimeout(res, 1500))
                ]);
            } catch (e) {}

            if (jitsiClient) {
                try { jitsiClient.dispose(); } catch (e) {}
                jitsiClient = null;
            }
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
            }
            window.location.href = '/';
        }

// =================================================================
// 3. REÁLNY EYE-TRACKING (MediaPipe FaceMesh + Iris Detection)
// =================================================================
async function initRealEyeTracking() {
    if (typeof FaceMesh === 'undefined') {
        console.warn('MediaPipe FaceMesh sa nenačítal, prepínam do simulácie');
        enableManualShortcuts();
        return;
    }

    try {
        faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true, // KĽÚČOVÉ: vracia body dúhoviek (468–477)
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        faceMesh.onResults(onFaceMeshResults);

        const trackerVideo = document.getElementById('trackerVideo');
        let isFrameProcessing = false;

        async function renderFrameLoop() {
            if (!isEyeTrackingRunning) return;
            if (trackerVideo && trackerVideo.readyState >= 2 && !trackerVideo.paused && !trackerVideo.ended && !isFrameProcessing) {
                isFrameProcessing = true;
                try {
                    await faceMesh.send({ image: trackerVideo });
                } catch (frameErr) {
                    // Tichý error z rámca
                } finally {
                    isFrameProcessing = false;
                }
            }
            frameAnimationId = requestAnimationFrame(renderFrameLoop);
        }

        isEyeTrackingRunning = true;
        frameAnimationId = requestAnimationFrame(renderFrameLoop);
        console.log('✅ Reálny eye-tracking úspešne inicializovaný cez MediaPipe FaceMesh (requestAnimationFrame)');

    } catch (err) {
        console.error('Chyba štartu MediaPipe:', err);
        enableManualShortcuts();
    }

    // Ponecháme klávesové skratky W / E ako voliteľný demo override
    enableManualShortcuts();
}

function stopEyeTracking() {
    isEyeTrackingRunning = false;
    if (typeof frameAnimationId !== 'undefined' && frameAnimationId) {
        cancelAnimationFrame(frameAnimationId);
        frameAnimationId = null;
    }
    if (cameraTracker) {
        try { cameraTracker.stop(); } catch (e) { }
    }
}

// =================================================================
// 4. ALGORITMUS HODNOTENIA POZORNOSTI, OČÍ A CELEJ TVÁRE V OBRAZE
// =================================================================
function evaluateFaceFraming(lm) {
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const idx of FACE_OVAL_INDICES) {
        const p = lm[idx];
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }

    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;

    const topCut = minY < 0.03;
    const bottomCut = maxY > 0.975;
    const leftCut = minX < 0.02;
    const rightCut = maxX > 0.98;
    const tooClose = faceHeight > 0.88 || faceWidth > 0.80;
    const tooFar = faceHeight < 0.12;

    const inFrame = !(topCut || bottomCut || leftCut || rightCut || tooClose || tooFar);

    let reason = 'Celá tvár je v obraze';
    let label = 'V poriadku';

    if (tooClose || (topCut && bottomCut) || (leftCut && rightCut)) {
        reason = 'Nie ste celou tvárou v obraze – oddiaľte sa prosím trochu od kamery';
        label = 'Príliš blízko';
    } else if (tooFar) {
        reason = 'Tvár je príliš ďaleko od kamery – posuňte sa prosím bližšie';
        label = 'Príliš ďaleko';
    } else if (topCut) {
        reason = 'Nie ste celou tvárou v obraze – horná časť tváre presahuje okraj (posuňte sa nižšie)';
        label = 'Orezané čelo';
    } else if (bottomCut) {
        reason = 'Nie ste celou tvárou v obraze – brada presahuje spodný okraj (posuňte sa vyššie)';
        label = 'Orezaná brada';
    } else if (leftCut || rightCut) {
        reason = 'Nie ste celou tvárou v obraze – vycentrujte sa prosím do stredu kamery';
        label = 'Mimo stredu';
    }

    return {
        inFrame,
        reason,
        label,
        bbox: { minX, maxX, minY, maxY }
    };
}

function evaluateEyeVisibility(lm, now) {
    const leftEyeHeight = Math.hypot(lm[159].x - lm[145].x, lm[159].y - lm[145].y);
    const leftEyeWidth = Math.hypot(lm[133].x - lm[33].x, lm[133].y - lm[33].y);
    const leftEAR = leftEyeHeight / (leftEyeWidth || 1);

    const rightEyeHeight = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y);
    const rightEyeWidth = Math.hypot(lm[263].x - lm[362].x, lm[263].y - lm[362].y);
    const rightEAR = rightEyeHeight / (rightEyeWidth || 1);

    // Kontrola, či sú obidve oči vôbec vo vnútri zorného poľa kamery
    let eyesOutOfFrame = leftEyeWidth < 0.012 || rightEyeWidth < 0.012;
    if (!eyesOutOfFrame) {
        const checkPoints = lm.length >= 478 ? [...EYE_KEY_INDICES, 468, 473] : EYE_KEY_INDICES;
        for (const idx of checkPoints) {
            const p = lm[idx];
            if (!p || p.x < 0.015 || p.x > 0.985 || p.y < 0.015 || p.y > 0.985) {
                eyesOutOfFrame = true;
                break;
            }
        }
    }

    if (eyesOutOfFrame) {
        eyesClosedStartTime = null;
        oneEyeClosedStartTime = null;
        return {
            visible: false,
            isMomentaryBlink: false,
            reason: 'Oči respondenta nie sú v zábere kamery',
            label: 'Mimo záberu'
        };
    }

    // Kontrola zatvorených / zakrytých očí (bežné rýchle žmurknutie < 900 ms ignorujeme)
    const bothClosed = (leftEAR < 0.15 && rightEAR < 0.15);
    const oneClosed = (leftEAR < 0.10 || rightEAR < 0.10);

    if (bothClosed) {
        oneEyeClosedStartTime = null;
        if (!eyesClosedStartTime) eyesClosedStartTime = now;
        if (now - eyesClosedStartTime < 900) {
            return { visible: true, isMomentaryBlink: true, reason: '', label: 'Žmurknutie' };
        }
        return {
            visible: false,
            isMomentaryBlink: false,
            reason: 'Respondentovi nie sú vidno otvorené oči (otvorte oči alebo odstráňte prekážku)',
            label: 'Zatvorené / zakryté'
        };
    }

    eyesClosedStartTime = null;

    if (oneClosed) {
        if (!oneEyeClosedStartTime) oneEyeClosedStartTime = now;
        if (now - oneEyeClosedStartTime >= 1800) {
            return {
                visible: false,
                isMomentaryBlink: false,
                reason: 'Jedno z očí respondenta nie je zreteľne viditeľné',
                label: 'Čiastočne zakryté'
            };
        }
    } else {
        oneEyeClosedStartTime = null;
    }

    return { visible: true, isMomentaryBlink: false, reason: '', label: 'Viditeľné' };
}

function evaluateGazeDirection(lm) {
    // Head Yaw (otočenie doľava / doprava): nos (1), ľavá tvár (234), pravá tvár (454)
    const cheekDist = Math.abs(lm[454].x - lm[234].x);
    const noseFromLeft = Math.abs(lm[1].x - lm[234].x);
    const yawRatio = cheekDist > 0 ? (noseFromLeft / cheekDist) : 0.5;
    const yawDegrees = Math.round((yawRatio - 0.5) * 120);

    // Head Pitch (predklon / záklon): čelo (10), brada (152), nos (1)
    const faceHeight = Math.abs(lm[152].y - lm[10].y);
    const noseFromTop = Math.abs(lm[1].y - lm[10].y);
    const pitchRatio = faceHeight > 0 ? (noseFromTop / faceHeight) : 0.5;
    const pitchDegrees = Math.round((pitchRatio - 0.5) * 100);

    // Horizontálna pozícia dúhovky (Iris tracking)
    let avgIrisX = 0.5;
    if (lm.length >= 478) {
        const leftIris = lm[468];
        const leftInner = lm[133];
        const leftOuter = lm[33];
        const leftSpan = Math.abs(leftInner.x - leftOuter.x);
        const leftRatio = leftSpan > 0 ? (Math.abs(leftIris.x - leftOuter.x) / leftSpan) : 0.5;

        const rightIris = lm[473];
        const rightInner = lm[362];
        const rightOuter = lm[263];
        const rightSpan = Math.abs(rightOuter.x - rightInner.x);
        const rightRatio = rightSpan > 0 ? (Math.abs(rightIris.x - rightInner.x) / rightSpan) : 0.5;

        avgIrisX = (leftRatio + rightRatio) / 2;
    }

    const isHeadTurned = (yawRatio < 0.34 || yawRatio > 0.66);
    const isHeadTilted = (pitchRatio < 0.36 || pitchRatio > 0.68);
    const isEyesAside = (avgIrisX < 0.28 || avgIrisX > 0.72);
    const lookingAway = isHeadTurned || isHeadTilted || isEyesAside;

    let reason = 'Očný kontakt v poriadku';
    if (isHeadTurned) reason = yawRatio < 0.34 ? 'Hlava otočená doprava' : 'Hlava otočená doľava';
    else if (isHeadTilted) reason = pitchRatio > 0.68 ? 'Pohľad sklopený nadol' : 'Hlava zaklonená nahor';
    else if (isEyesAside) reason = 'Pohľad očí smeruje do strany';

    return { lookingAway, reason, yawDegrees, pitchDegrees, avgIrisX };
}

function onFaceMeshResults(results) {
    const canvas = document.getElementById('diagnosticCanvas');
    const ctx = canvas.getContext('2d');
    const now = Date.now();

    // 1. Ak vôbec nie je detekovaná tvár (uchádzač odišiel alebo je mimo kamery)
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        eyesClosedStartTime = null;
        oneEyeClosedStartTime = null;
        consecutiveAwayFrames++;
        consecutiveNormalFrames = 0;

        if (consecutiveAwayFrames > 5) {
            handleVisionAssessment({
                hasIssue: true,
                title: 'Upravte svoju polohu pred kamerou',
                reason: 'Tvár nezistená v zornom poli kamery',
                pillText: 'Upozornenie: Tvár mimo záberu',
                statusText: 'Tvár nezistená',
                yaw: 0,
                pitch: 0,
                iris: 0.5,
                faceText: 'Chýba v obraze',
                faceOk: false,
                eyesText: 'Neviditeľné',
                eyesOk: false
            });
        }
        if (isPipOpen) {
            syncDiagnosticCanvasSize(canvas, results.image);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (results.image) {
                ctx.save();
                ctx.scale(-1, 1);
                ctx.drawImage(results.image, -canvas.width, 0, canvas.width, canvas.height);
                ctx.restore();
                ctx.fillStyle = 'rgba(9, 11, 16, 0.55)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else {
                ctx.fillStyle = '#090b10';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.fillStyle = '#ef4444';
            ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Tvár nezistená v obraze', canvas.width / 2, canvas.height / 2);
        }
        return;
    }

    const lm = results.multiFaceLandmarks[0];

    // 2. Kontrola celej tváre v obraze (čelo, brada, ľavý/pravý okraj, vzdialenosť)
    const framing = evaluateFaceFraming(lm);

    // 3. Kontrola viditeľnosti očí (v obraze + otvorené mimo bežného žmurknutia)
    const eyes = evaluateEyeVisibility(lm, now);
    if (eyes.isMomentaryBlink && framing.inFrame) {
        // Počas krátkeho žmurknutia nemeníme vyhodnotenie smeru pohľadu
        if (isPipOpen) {
            drawDiagnosticFrame(ctx, canvas, results.image, lm, {
                isAway: isGazeAway,
                inFrame: framing.inFrame,
                bbox: framing.bbox
            });
        }
        return;
    }

    // 4. Smer pohľadu (Head Yaw, Pitch, Iris tracking)
    const gaze = evaluateGazeDirection(lm);

    // 5. Kombinované vyhodnotenie podľa priority: Celá tvár -> Viditeľnosť očí -> Očný kontakt
    let hasIssue = false;
    let title = 'Udržujte očný kontakt s kamerou';
    let reason = 'Kamera a očný kontakt v poriadku';
    let pillText = 'Kamera a očný kontakt: v poriadku';
    let statusText = 'Priamy kontakt';

    if (!framing.inFrame) {
        hasIssue = true;
        title = 'Upravte svoju polohu pred kamerou';
        reason = framing.reason;
        pillText = 'Upozornenie: Tvár nie je celá v obraze';
        statusText = framing.label;
    } else if (!eyes.visible) {
        hasIssue = true;
        title = 'Oči musia byť viditeľné pre kameru';
        reason = eyes.reason;
        pillText = 'Upozornenie: Nie je vidno oči';
        statusText = eyes.label;
    } else if (gaze.lookingAway) {
        hasIssue = true;
        title = 'Udržujte očný kontakt s kamerou';
        reason = gaze.reason;
        pillText = 'Pozornosť: Odvrátený pohľad';
        statusText = 'Odvrátený pohľad';
    }

    // Vyhladzovací filter proti chveniu
    if (hasIssue) {
        consecutiveAwayFrames++;
        consecutiveNormalFrames = 0;
    } else {
        consecutiveNormalFrames++;
        consecutiveAwayFrames = 0;
    }

    if (consecutiveAwayFrames >= 4) {
        handleVisionAssessment({
            hasIssue: true,
            title,
            reason,
            pillText,
            statusText,
            yaw: gaze.yawDegrees,
            pitch: gaze.pitchDegrees,
            iris: gaze.avgIrisX,
            faceText: framing.label,
            faceOk: framing.inFrame,
            eyesText: eyes.label,
            eyesOk: eyes.visible
        });
    } else if (consecutiveNormalFrames >= 3) {
        handleVisionAssessment({
            hasIssue: false,
            title,
            reason,
            pillText,
            statusText,
            yaw: gaze.yawDegrees,
            pitch: gaze.pitchDegrees,
            iris: gaze.avgIrisX,
            faceText: framing.label,
            faceOk: framing.inFrame,
            eyesText: eyes.label,
            eyesOk: eyes.visible
        });
    }

    // 6. Vykreslenie do diagnostického PiP plátna (ak je otvorené)
    if (isPipOpen) {
        drawDiagnosticFrame(ctx, canvas, results.image, lm, {
            isAway: hasIssue,
            inFrame: framing.inFrame,
            bbox: framing.bbox
        });
    }
}

// Obsluha stavu, metrík a varovného HUD
function handleVisionAssessment(state) {
    document.getElementById('metricYaw').textContent = `${state.yaw}°`;
    document.getElementById('metricPitch').textContent = `${state.pitch}°`;
    document.getElementById('metricIris').textContent = state.iris.toFixed(2);

    const faceEl = document.getElementById('metricFaceFrame');
    if (faceEl) {
        faceEl.textContent = state.faceText;
        faceEl.className = state.faceOk ? 'metric-val ok' : 'metric-val warn';
    }

    const eyesEl = document.getElementById('metricEyesVisible');
    if (eyesEl) {
        eyesEl.textContent = state.eyesText;
        eyesEl.className = state.eyesOk ? 'metric-val ok' : 'metric-val warn';
    }

    const statusVal = document.getElementById('metricStatus');

    if (state.hasIssue) {
        statusVal.textContent = state.statusText;
        statusVal.className = 'metric-val warn';

        if (!isGazeAway) {
            isGazeAway = true;
            gazeAwayStartTime = Date.now();
        }

        const elapsed = Date.now() - gazeAwayStartTime;
        const elapsedSec = Math.floor(elapsed / 1000);

        if (elapsed >= AWAY_ALERT_THRESHOLD_MS) {
            awayAlertTriggered = true;
            showVisualAlert(state.title, state.reason, state.pillText, elapsedSec);
        }
    } else {
        statusVal.textContent = state.statusText;
        statusVal.className = 'metric-val ok';

        if (isGazeAway) {
            isGazeAway = false;
            gazeAwayStartTime = null;
            if (awayAlertTriggered) {
                awayAlertTriggered = false;
                hideVisualAlert();
            }
        }
    }
}

function showVisualAlert(title, reason, pillText, sec) {
    const overlay = document.getElementById('hudOverlay');
    const toast = document.getElementById('alertToast');
    const pill = document.getElementById('hudPill');
    const txt = document.getElementById('hudStatusText');
    const titleTxt = document.getElementById('alertTitleText');
    const reasonTxt = document.getElementById('alertReasonText');

    overlay.classList.add('warning');
    toast.classList.add('visible');

    pill.className = 'gaze-hud-pill warning';
    txt.textContent = pillText || 'Pozornosť: Odvrátený pohľad';
    if (titleTxt) titleTxt.textContent = title || 'Udržujte očný kontakt s kamerou';
    if (reasonTxt) reasonTxt.textContent = reason;

    updateAlertTimer(sec);
}

function updateAlertTimer(sec) {
    const badge = document.getElementById('awayTimerBadge');
    if (badge) badge.textContent = `${sec}s`;
}

function hideVisualAlert() {
    const overlay = document.getElementById('hudOverlay');
    const toast = document.getElementById('alertToast');
    const pill = document.getElementById('hudPill');
    const txt = document.getElementById('hudStatusText');

    overlay.classList.remove('warning');
    toast.classList.remove('visible');

    pill.className = 'gaze-hud-pill active';
    txt.textContent = 'Kamera a očný kontakt: v poriadku';
}

// =================================================================
// 5. DIAGNOSTICKÉ KRESLENIE (PiP okno)
// =================================================================
function toggleDiagnosticPip(forced) {
    isPipOpen = (typeof forced === 'boolean') ? forced : !isPipOpen;
    const pip = document.getElementById('diagnosticPip');
    const btn = document.getElementById('btnTogglePip');
    pip.classList.toggle('active', isPipOpen);
    btn.classList.toggle('active', isPipOpen);
}

function syncDiagnosticCanvasSize(canvas, img) {
    if (!canvas || !img) return;
    const srcW = img.videoWidth || img.width || 0;
    const srcH = img.videoHeight || img.height || 0;
    if (srcW > 0 && srcH > 0) {
        const targetW = 320;
        const targetH = Math.round(targetW * (srcH / srcW));
        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }
    }
}

function drawDiagnosticFrame(ctx, canvas, img, lm, diagState) {
    syncDiagnosticCanvasSize(canvas, img);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Zrkadlený obraz bez deformácie a zoomu
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // Rám celej tváre v obraze (zrkadlené x)
    if (diagState && diagState.bbox) {
        const b = diagState.bbox;
        const bx = (1 - b.maxX) * canvas.width;
        const by = b.minY * canvas.height;
        const bw = (b.maxX - b.minX) * canvas.width;
        const bh = (b.maxY - b.minY) * canvas.height;
        ctx.save();
        ctx.strokeStyle = diagState.inFrame ? 'rgba(16, 185, 129, 0.75)' : '#ef4444';
        ctx.lineWidth = diagState.inFrame ? 1.5 : 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();
    }

    // Kreslenie bodov očných dúhoviek a očí
    const isAway = diagState ? diagState.isAway : false;
    const color = isAway ? '#ef4444' : '#10b981';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    // Zrkadlené x-ové súradnice: (1 - x) * width
    function pt(idx) {
        return {
            x: (1 - lm[idx].x) * canvas.width,
            y: lm[idx].y * canvas.height
        };
    }

    // Dúhovky (468 ľavá, 473 pravá)
    if (lm.length >= 478) {
        [468, 473].forEach(idx => {
            const p = pt(idx);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    // Očné kontúry (ľavé oko: 33, 159, 133, 145; pravé oko: 362, 386, 263, 374)
    [[33, 159, 133, 145], [362, 386, 263, 374]].forEach(ring => {
        ctx.beginPath();
        const p0 = pt(ring[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < ring.length; i++) {
            const p = pt(ring[i]);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.stroke();
    });

    // Nos
    const pNose = pt(1);
    ctx.beginPath();
    ctx.arc(pNose.x, pNose.y, 3, 0, 2 * Math.PI);
    ctx.fill();
}

// =================================================================
// 6. MANUÁLNE DEMO SKRATKY (W / E)
// =================================================================
function enableManualShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'w' || e.key === 'W') {
            showVisualAlert(
                'Udržujte očný kontakt s kamerou',
                'Simulované odvrátenie pozornosti (kláves W)',
                'Pozornosť: Odvrátený pohľad',
                3
            );
        }
        if (e.key === 'e' || e.key === 'E') {
            hideVisualAlert();
        }
    });
}

window.addEventListener('DOMContentLoaded', initLobby);

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
                        inviteeEmail
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
