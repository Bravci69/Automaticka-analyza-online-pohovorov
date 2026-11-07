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

        // Eye-tracking & MediaPipe stav
        let faceMesh = null;
        let cameraTracker = null;
        let isEyeTrackingRunning = false;
        let isPipOpen = false;

        // Časovač odvrátenia pohľadu
        let isGazeAway = false;
        let gazeAwayStartTime = null;
        let awayAlertTriggered = false;
        const AWAY_ALERT_THRESHOLD_MS = 2500; // Po 2.5 sekundách odvrátenia pohľadu sa zobrazí varovanie

        // Buffer na vyhladenie (zamedzenie falošným poplachom)
        let consecutiveAwayFrames = 0;
        let consecutiveNormalFrames = 0;

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

            // Spustenie kamery pre náhľad v lobby s polyfillom
            const getMedia = (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
                ? (c) => navigator.mediaDevices.getUserMedia(c)
                : (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia)
                    ? (c) => new Promise((res, rej) => (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia).call(navigator, c, res, rej))
                    : null;

            if (!getMedia) {
                console.warn('getUserMedia nie je v tomto prehliadači / kontexte dostupné.');
                renderCamError(true);
            } else {
                try {
                    localStream = await getMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                        audio: true
                    });
                    const videoEl = document.getElementById('previewVideo');
                    videoEl.srcObject = localStream;
                    document.getElementById('previewPlaceholder').style.display = 'none';
                } catch (err) {
                    console.warn('Kamera v lobby nedostupná:', err);
                    renderCamError(false, err.message);
                }
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
                    resolution: 720,
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
                    DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
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
        // 4. ALGORITMUS HODNOTENIA POZORNOSTI A DÚHOVIEK
        // =================================================================
        function onFaceMeshResults(results) {
            const canvas = document.getElementById('diagnosticCanvas');
            const ctx = canvas.getContext('2d');

            // 1. Ak vôbec nie je detekovaná tvár (uchádzač odišiel, odvrátil sa úplne)
            if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
                consecutiveAwayFrames++;
                consecutiveNormalFrames = 0;
                if (consecutiveAwayFrames > 5) {
                    handleGazeAssessment(true, 'Tvár nezistená v zornom poli', 0, 0, 0.5);
                }
                if (isPipOpen) {
                    ctx.fillStyle = '#090b10';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#ef4444';
                    ctx.font = '12px "Plus Jakarta Sans"';
                    ctx.textAlign = 'center';
                    ctx.fillText('Tvár nezistená', canvas.width / 2, canvas.height / 2);
                }
                return;
            }

            const lm = results.multiFaceLandmarks[0];

            // 2. Kontrola žmurknutia (EAR - Eye Aspect Ratio)
            const leftEyeHeight = Math.hypot(lm[159].x - lm[145].x, lm[159].y - lm[145].y);
            const leftEyeWidth  = Math.hypot(lm[133].x - lm[33].x,  lm[133].y - lm[33].y);
            const leftEAR = leftEyeHeight / (leftEyeWidth || 1);

            const rightEyeHeight = Math.hypot(lm[386].x - lm[374].x, lm[386].y - lm[374].y);
            const rightEyeWidth  = Math.hypot(lm[263].x - lm[362].x, lm[263].y - lm[362].y);
            const rightEAR = rightEyeHeight / (rightEyeWidth || 1);

            const isBlinking = (leftEAR < 0.16 && rightEAR < 0.16);
            if (isBlinking) {
                // Počas žmurknutia neaktualizujeme stav odvrátenia
                return;
            }

            // 3. Head Yaw (otočenie doľava / doprava)
            // Nos (bod 1), ľavá tvár (bod 234), pravá tvár (bod 454)
            const cheekDist = Math.abs(lm[454].x - lm[234].x);
            const noseFromLeft = Math.abs(lm[1].x - lm[234].x);
            const yawRatio = cheekDist > 0 ? (noseFromLeft / cheekDist) : 0.5;
            const yawDegrees = Math.round((yawRatio - 0.5) * 120);

            // 4. Head Pitch (predklon / záklon)
            // Čelo (bod 10), brada (bod 152), nos (bod 1)
            const faceHeight = Math.abs(lm[152].y - lm[10].y);
            const noseFromTop = Math.abs(lm[1].y - lm[10].y);
            const pitchRatio = faceHeight > 0 ? (noseFromTop / faceHeight) : 0.5;
            const pitchDegrees = Math.round((pitchRatio - 0.5) * 100);

            // 5. Horizontálna pozícia dúhovky (Iris tracking)
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

            // 6. Vyhodnotenie:
            // Tolerancie pre prirodzený očný kontakt voči webkamere:
            const isHeadTurned = (yawRatio < 0.34 || yawRatio > 0.66);
            const isHeadTilted = (pitchRatio < 0.36 || pitchRatio > 0.68);
            const isEyesAside = (avgIrisX < 0.28 || avgIrisX > 0.72);

            const lookingAway = isHeadTurned || isHeadTilted || isEyesAside;

            let reason = 'Očný kontakt v poriadku';
            if (isHeadTurned) reason = yawRatio < 0.34 ? 'Hlava otočená doprava' : 'Hlava otočená doľava';
            else if (isHeadTilted) reason = pitchRatio > 0.68 ? 'Pohľad sklopený nadol' : 'Hlava zaklonená nahor';
            else if (isEyesAside) reason = 'Pohľad očí smeruje do strany';

            // Vyhladzovací filter proti chveniu
            if (lookingAway) {
                consecutiveAwayFrames++;
                consecutiveNormalFrames = 0;
            } else {
                consecutiveNormalFrames++;
                consecutiveAwayFrames = 0;
            }

            if (consecutiveAwayFrames >= 4) {
                handleGazeAssessment(true, reason, yawDegrees, pitchDegrees, avgIrisX);
            } else if (consecutiveNormalFrames >= 3) {
                handleGazeAssessment(false, 'Očný kontakt v norme', yawDegrees, pitchDegrees, avgIrisX);
            }

            // 7. Vykreslenie do diagnostického PiP plátna (ak je otvorené)
            if (isPipOpen) {
                drawDiagnosticFrame(ctx, canvas, results.image, lm, lookingAway);
            }
        }

        // Obsluha stavu a varovného HUD
        function handleGazeAssessment(away, reason, yaw, pitch, iris) {
            // Aktualizácia hodnôt v diagnostickom paneli
            document.getElementById('metricYaw').textContent = `${yaw}°`;
            document.getElementById('metricPitch').textContent = `${pitch}°`;
            document.getElementById('metricIris').textContent = iris.toFixed(2);

            const statusVal = document.getElementById('metricStatus');

            if (away) {
                statusVal.textContent = 'Odvrátený pohľad';
                statusVal.className = 'metric-val warn';

                if (!isGazeAway) {
                    isGazeAway = true;
                    gazeAwayStartTime = Date.now();
                }

                const elapsed = Date.now() - gazeAwayStartTime;
                const elapsedSec = Math.floor(elapsed / 1000);

                if (elapsed >= AWAY_ALERT_THRESHOLD_MS && !awayAlertTriggered) {
                    // Spustenie grafického varovania
                    awayAlertTriggered = true;
                    showVisualAlert(reason, elapsedSec);
                } else if (awayAlertTriggered) {
                    updateAlertTimer(elapsedSec);
                }

            } else {
                // Návrat do normy
                statusVal.textContent = 'Priamy kontakt';
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

        function showVisualAlert(reason, sec) {
            const overlay = document.getElementById('hudOverlay');
            const toast = document.getElementById('alertToast');
            const pill = document.getElementById('hudPill');
            const txt = document.getElementById('hudStatusText');
            const reasonTxt = document.getElementById('alertReasonText');

            overlay.classList.add('warning');
            toast.classList.add('visible');

            pill.className = 'gaze-hud-pill warning';
            txt.textContent = 'Pozornosť: Odvrátený pohľad';
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
            txt.textContent = 'Očný kontakt: v poriadku';
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

        function drawDiagnosticFrame(ctx, canvas, img, lm, isAway) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Zrkadlený obraz
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(img, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();

            // Kreslenie bodov očných dúhoviek
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
                    showVisualAlert('Simulované odvrátenie pozornosti (kláves W)', 3);
                }
                if (e.key === 'e' || e.key === 'E') {
                    hideVisualAlert();
                }
            });
        }

        window.addEventListener('DOMContentLoaded', initLobby);
