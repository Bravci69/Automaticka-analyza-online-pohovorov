// =============================================================================
// Eye-tracking modul (MediaPipe FaceMesh, očný kontakt, viditeľnosť očí a tváre)
// Bakalárska práca - FIIT STU Bratislava
// =============================================================================

let frameAnimationId = null;

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

