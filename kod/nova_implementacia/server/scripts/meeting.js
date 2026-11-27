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

            // Umožnenie rýchleho skopírovania odkazu na meeting
            const lobbyChip = document.getElementById('roomChip');
            if (lobbyChip) {
                lobbyChip.style.cursor = 'pointer';
                lobbyChip.title = 'Kliknutím skopírujete priamy odkaz na meeting';
                lobbyChip.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(window.location.href);
                        const lbl = document.getElementById('roomNameLabel');
                        const orig = lbl.textContent;
                        lbl.textContent = '✓ Odkaz skopírovaný!';
                        setTimeout(() => lbl.textContent = orig, 2000);
                    } catch (e) {}
                };
            }

            const headerChip = document.getElementById('callSessionLabel');
            if (headerChip) {
                headerChip.style.cursor = 'pointer';
                headerChip.title = 'Kliknutím skopírujete priamy odkaz na meeting';
                headerChip.onclick = async () => {
                    try {
                        await navigator.clipboard.writeText(window.location.href);
                        const orig = headerChip.textContent;
                        headerChip.textContent = '✓ Odkaz skopírovaný!';
                        setTimeout(() => headerChip.textContent = orig, 2000);
                    } catch (e) {}
                };
            }

            const nameInput = document.getElementById('candidateName');
            nameInput.focus();
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') enterRoom();
            });

            // Overenie zabezpečeného kontextu (HTTPS)
            checkSecureContext();

            // Spustenie kamery pre náhľad v lobby s detekciou natívneho rozlíšenia senzora
            await initLocalCameraStream();
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
            if (!name) {
                const el = document.getElementById('candidateName');
                el.focus();
                el.style.borderColor = 'var(--accent-red)';
                setTimeout(() => el.style.borderColor = '', 1500);
                return;
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

            // Štart Jitsi videohovoru
            startJitsi(name);

            // Štart MediaPipe Eye-Trackingu
            initRealEyeTracking();
        }

        function startJitsi(userName) {
            const container = document.getElementById('jitsi-mount');

            const options = {
                roomName: activeRoom,
                parentNode: container,
                width: '100%',
                height: '100%',
                lang: 'sk',
                userInfo: { displayName: userName },
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

        function leaveSession() {
            if (isLeavingSession) return;
            isLeavingSession = true;
            stopEyeTracking();
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
                try { cameraTracker.stop(); } catch(e){}
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
            const leftEyeWidth  = Math.hypot(lm[133].x - lm[33].x,  lm[133].y - lm[33].y);
            const leftEAR = leftEyeHeight / (leftEyeWidth || 1);

            const rightEyeHeight = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y);
            const rightEyeWidth  = Math.hypot(lm[263].x - lm[362].x, lm[263].y - lm[362].y);
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
            [ [33, 159, 133, 145], [362, 386, 263, 374] ].forEach(ring => {
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
