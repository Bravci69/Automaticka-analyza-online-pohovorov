// =============================================================================
// Videokonferenčná miestnosť – Jadro (Lobby, Kamera, Jitsi SDK)
// Bakalárska práca - FIIT STU Bratislava | Jakub Chmura
// =============================================================================

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

window.addEventListener('DOMContentLoaded', initLobby);
