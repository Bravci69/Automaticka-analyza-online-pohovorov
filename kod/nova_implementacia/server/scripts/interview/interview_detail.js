// =============================================================================
// Podstránka detailu pohovoru & prehrávania nahrávok (/interview/:id)
// Bakalárska práca - FIIT STU Bratislava
// =============================================================================

let detailAuthToken = localStorage.getItem('bp_token') || '';
let detailInterviewId = null;
let detailData = null;
let detailEventSource = null;
let lastRecordingRenderSig = null;

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

function formatBytes(bytes) {
    const b = Number(bytes || 0);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(sec) {
    if (sec === null || sec === undefined || isNaN(sec)) return 'neuvedená';
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(r).padStart(2, '0')}s`;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatRoleLabel(roleTag) {
    if (roleTag === 'kandidat') return 'Uchádzač';
    if (roleTag === 'hr') return 'HR / Vykonávateľ';
    if (roleTag === 'kolega') return 'Pozvaný kolega';
    return 'Účastník';
}

function showDetailGuard(title, desc, showLoginBtn = true) {
    const guard = document.getElementById('detailGuardCard');
    const content = document.getElementById('detailContent');
    const spinner = document.getElementById('detailSpinner');
    const titleEl = document.getElementById('detailGuardTitle');
    const descEl = document.getElementById('detailGuardDesc');
    const btnEl = document.getElementById('detailGuardBtn');

    if (content) content.style.display = 'none';
    if (guard) guard.style.display = 'flex';
    if (spinner) spinner.style.display = 'none';
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    if (btnEl) btnEl.style.display = showLoginBtn ? 'inline-flex' : 'none';
}

async function initInterviewDetail() {
    const match = window.location.pathname.match(/\/interview\/(\d+)/);
    detailInterviewId = match ? parseInt(match[1], 10) : null;

    if (!detailInterviewId) {
        showDetailGuard('Neplatný identifikátor pohovoru', 'V adrese URL chýba platné číslo pohovoru.');
        return;
    }

    if (!detailAuthToken) {
        showDetailGuard(
            'Vyžaduje sa prihlásenie',
            'Detail pohovoru a nahrávky sú prístupné iba pre prihláseného HR personalistu alebo Superadmina.'
        );
        return;
    }

    try {
        const authRes = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${detailAuthToken}` }
        });
        if (!authRes.ok) {
            localStorage.removeItem('bp_token');
            showDetailGuard(
                'Prihlasovacia relácia vypršala',
                'Prihláste sa prosím znova v HR konzole.'
            );
            return;
        }
        const authData = await authRes.json();
        renderUserBadge(authData.user);
    } catch (_) {
        showDetailGuard('Chyba spojenia so serverom', 'Nepodarilo sa overiť prihlásenie.');
        return;
    }

    await loadInterviewDetail();
    setupDetailRealtimeSync();
}

function renderUserBadge(user) {
    const el = document.getElementById('detailUserBadge');
    if (!el || !user) return;
    el.innerHTML = `
        <div class="auth-user-pill">
            <span class="badge-role-tag">${escapeHtml(user.ures_tag)}</span>
            <span style="font-weight: 600;">${escapeHtml(user.meno)} ${escapeHtml(user.priezvisko)}</span>
        </div>
    `;
}

async function loadInterviewDetail() {
    try {
        const res = await fetch(`/api/interviews/${detailInterviewId}/detail`, {
            headers: { 'Authorization': `Bearer ${detailAuthToken}` }
        });
        const data = await res.json();
        if (!res.ok) {
            showDetailGuard(
                res.status === 403 ? 'Prístup zamietnutý' : 'Pohovor nebol nájdený',
                data.error || 'Nepodarilo sa načítať detail pohovoru.'
            );
            return;
        }

        detailData = data;
        renderInterviewDetail(data);
    } catch (err) {
        showDetailGuard('Chyba načítania dát', err.message);
    }
}

function renderInterviewDetail(data) {
    const { interview, analysis, recordings, auditLogs, vyhodnotenia } = data;
    document.getElementById('detailGuardCard').style.display = 'none';
    document.getElementById('detailContent').style.display = 'block';

    document.title = `${interview.meno_respondenta} · ${interview.titul_pozicia || 'Pohovor'} | Detail`;

    // 1. Hero sekcia
    document.getElementById('detailIdBadge').textContent = `ID #${interview.id}`;
    document.getElementById('detailRoomBadge').textContent = interview.room_id;
    document.getElementById('detailJobTitle').textContent = interview.titul_pozicia || 'Online pohovor';
    document.getElementById('detailCandidateName').textContent = interview.meno_respondenta;

    const emailEl = document.getElementById('detailCandidateEmail');
    emailEl.textContent = interview.mail_respondenta;
    emailEl.href = `mailto:${interview.mail_respondenta}`;

    document.getElementById('detailDatumBadge').textContent = `📅 ${interview.datum}`;

    const statusBadge = document.getElementById('detailStatusBadge');
    statusBadge.textContent = interview.vyhodnotenie_nazov || interview.vyhodnotenie;
    statusBadge.className = `status-badge-enum status-${interview.vyhodnotenie}`;

    const evalSelect = document.getElementById('detailEvalSelect');
    evalSelect.className = `select-enum-inline status-${interview.vyhodnotenie}`;
    evalSelect.innerHTML = (vyhodnotenia || []).map(ev => `
        <option value="${escapeHtml(ev.kod)}" ${ev.kod === interview.vyhodnotenie ? 'selected' : ''}>
            ${escapeHtml(ev.nazov)}
        </option>
    `).join('');

    // 2. Sekcia nahrávky
    renderRecordingSection(interview, recordings);

    // 3. Informácie o uchádzačovi a pohovore
    renderInfoSection(interview, analysis);

    // 4. Multimodálna analýza & Audit logy
    renderAnalysisSection(analysis, recordings);
    renderAuditLogs(auditLogs);
}

function renderRecordingSection(interview, recordings) {
    const container = document.getElementById('recordingContainer');
    const folderBadge = document.getElementById('recordingFolderBadge');
    const subtitle = document.getElementById('recordingSectionSubtitle');

    if (recordings?.folderPath && folderBadge) {
        folderBadge.style.display = 'inline-block';
        folderBadge.textContent = `📁 ${recordings.folderPath}`;
    }

    const renderSig = JSON.stringify({
        status: recordings?.status || '',
        isBeforeScheduled: !!recordings?.isBeforeScheduled,
        vyhodnotenie: interview.vyhodnotenie,
        datum: interview.datum,
        files: (recordings?.files || []).map(f => [f.fileName, f.size, f.completed]),
    });
    if (renderSig === lastRecordingRenderSig) {
        return;
    }
    lastRecordingRenderSig = renderSig;

    if (recordings && recordings.hasRecordings && recordings.files.length > 0) {
        if (subtitle) {
            subtitle.textContent = `Dostupných ${recordings.files.length} súbor(y/ov) záznamu pre tento pohovor.`;
        }

        container.innerHTML = `
            <div class="recording-grid">
                ${recordings.files.map(file => {
                    const streamUrl = `/api/interviews/${interview.id}/recordings/${encodeURIComponent(file.fileName)}?token=${encodeURIComponent(detailAuthToken)}`;
                    const downloadUrl = `${streamUrl}&download=1`;
                    const playerHtml = file.isAudioOnly
                        ? `<audio class="recording-audio-player" controls preload="metadata" src="${streamUrl}"></audio>`
                        : `<video class="recording-video-player" controls preload="metadata" playsinline src="${streamUrl}"></video>`;
                    const triggerLabel = file.trigger === 'auto' ? 'Automatické' : (file.trigger === 'manual' ? 'Manuálne (HR)' : 'Záznam');

                    return `
                        <div class="recording-item-card">
                            <div class="recording-item-header">
                                <div>
                                    <span class="recording-role-badge ${escapeHtml(file.roleTag)}">${formatRoleLabel(file.roleTag)}</span>
                                    <div style="font-weight: 700; color: #fff; font-size: 0.95rem; margin-top: 6px;">
                                        ${escapeHtml(file.participantName || file.fileName)}
                                    </div>
                                    ${file.participantEmail ? `<div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(file.participantEmail)}</div>` : ''}
                                </div>
                                <a href="${downloadUrl}" class="btn-secondary" style="text-decoration: none; padding: 6px 10px; font-size: 0.78rem;">
                                    ⬇ Stiahnuť
                                </a>
                            </div>

                            ${playerHtml}

                            <div class="recording-item-footer">
                                <span>📦 Veľkosť: <strong>${formatBytes(file.size)}</strong></span>
                                <span>⏱️ Dĺžka: <strong>${formatDuration(file.durationSeconds)}</strong></span>
                                <span>⚙️ Spôsob: <strong>${triggerLabel}</strong></span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        return;
    }

    if (recordings && recordings.isBeforeScheduled) {
        if (subtitle) subtitle.textContent = `Naplánovaný termín: ${interview.datum}`;
        container.innerHTML = `
            <div class="recording-empty-banner pending">
                <div class="recording-empty-icon">⏳</div>
                <h3>Pohovor ešte neprebehol</h3>
                <p>
                    Termín pohovoru je naplánovaný na <strong>${escapeHtml(interview.datum)}</strong>.
                    Po pripojení pozvaných účastníkov v určenom čase sa videozáznam automaticky uloží do priečinka nahrávok.
                </p>
            </div>
        `;
        return;
    }

    if (subtitle) subtitle.textContent = `Termín pohovoru: ${interview.datum}`;
    const cancelNote = interview.vyhodnotenie === 'zruseny'
        ? 'Tento pohovor bol zrušený a nebol pri ňom vyhotovený žiadny záznam.'
        : `Pre termín pohovoru (${escapeHtml(interview.datum)}) zatiaľ nie je v priečinku nahrávok uložené žiadne video ani audio.`;

    container.innerHTML = `
        <div class="recording-empty-banner missing">
            <div class="recording-empty-icon">🎞️</div>
            <h3>Nahrávka nebola spravená</h3>
            <p>${cancelNote}</p>
        </div>
    `;
}

function renderInfoSection(interview, analysis) {
    const grid = document.getElementById('detailInfoGrid');
    const reminderText = interview.reminder_sent
        ? `✅ Odoslaná${interview.reminder_sent_at ? ' (' + escapeHtml(interview.reminder_sent_at) + ')' : ''}`
        : '⏳ Čaká na odoslanie (1 deň vopred)';

    grid.innerHTML = `
        <div class="detail-info-item">
            <div class="detail-info-label">Uchádzač</div>
            <div class="detail-info-val"><strong>${escapeHtml(interview.meno_respondenta)}</strong></div>
        </div>
        <div class="detail-info-item">
            <div class="detail-info-label">E-mail uchádzača</div>
            <div class="detail-info-val"><a href="mailto:${escapeHtml(interview.mail_respondenta)}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(interview.mail_respondenta)}</a></div>
        </div>
        <div class="detail-info-item">
            <div class="detail-info-label">Dátum a čas pohovoru</div>
            <div class="detail-info-val" style="color: #c4b5fd; font-family: 'JetBrains Mono', monospace;">${escapeHtml(interview.datum)}</div>
        </div>
        <div class="detail-info-item">
            <div class="detail-info-label">Priradený HR personalista</div>
            <div class="detail-info-val">${escapeHtml(interview.meno_hr)}${interview.hr_mail ? ` <span style="color: var(--text-muted); font-size: 0.78rem;">(${escapeHtml(interview.hr_mail)})</span>` : ''}</div>
        </div>
        <div class="detail-info-item full-width">
            <div class="detail-info-label">Ďalší pozvaní zamestnanci / Team Leader</div>
            <div class="detail-info-val">${interview.dalsie_maily ? escapeHtml(interview.dalsie_maily) : '<span style="color: var(--text-dim);">Žiadni ďalší účastníci</span>'}</div>
        </div>
        <div class="detail-info-item">
            <div class="detail-info-label">Stav pripomienky</div>
            <div class="detail-info-val">${reminderText}</div>
        </div>
        <div class="detail-info-item">
            <div class="detail-info-label">Vytvorené v systéme</div>
            <div class="detail-info-val">${escapeHtml(interview.created_at || 'neuvedené')}</div>
        </div>
    `;

    const notesEl = document.getElementById('detailNotesInput');
    if (notesEl && document.activeElement !== notesEl) {
        notesEl.value = interview.poznamky || '';
    }
}

function renderAnalysisSection(analysis, recordings) {
    const metricsEl = document.getElementById('detailAnalysisMetrics');
    const score = analysis ? Number(analysis.skore_pozornosti || 0).toFixed(1) : '0.0';
    const emotion = analysis?.dominantna_emocia || 'čaká na vyhodnotenie';
    const fillerCount = analysis ? (analysis.pocet_vyplnovych_slov ?? 0) : 0;
    const statusText = analysis?.stav_analyzy || 'cakajuce';
    const pathText = analysis?.zaznam_cesta || recordings?.folderPath || 'zatiaľ prázdna';

    metricsEl.innerHTML = `
        <div class="detail-metric-box">
            <div class="detail-metric-label">Skóre pozornosti</div>
            <div class="detail-metric-value" style="color: #34d399;">${score} %</div>
        </div>
        <div class="detail-metric-box">
            <div class="detail-metric-label">Dominantná emócia</div>
            <div class="detail-metric-value" style="font-size: 1.05rem; color: #c4b5fd;">${escapeHtml(emotion)}</div>
        </div>
        <div class="detail-metric-box">
            <div class="detail-metric-label">Výplňové slová</div>
            <div class="detail-metric-value">${fillerCount}</div>
        </div>
        <div class="detail-metric-box">
            <div class="detail-metric-label">Stav analýzy</div>
            <div class="detail-metric-value" style="font-size: 1rem;">${escapeHtml(statusText)}</div>
        </div>
        <div class="detail-info-item full-width">
            <div class="detail-info-label">Cesta k nahrávke v úložisku</div>
            <div class="detail-info-val" style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">${escapeHtml(pathText)}</div>
        </div>
    `;
}

function renderAuditLogs(logs) {
    const listEl = document.getElementById('detailAuditList');
    if (!logs || logs.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-dim); font-size: 0.82rem; padding: 12px;">Zatiaľ žiadne zaznamenané udalosti pre tento pohovor.</div>';
        return;
    }

    listEl.innerHTML = logs.map(log => `
        <div class="detail-audit-row">
            <div class="detail-audit-top">
                <span class="code-pill" style="font-size: 0.7rem;">${escapeHtml(log.akcia)}</span>
                <span style="color: var(--text-dim); font-size: 0.72rem; font-family: 'JetBrains Mono', monospace;">${escapeHtml(log.cas)} · ${escapeHtml(log.autor)}</span>
            </div>
            <div style="color: var(--text-muted);">${escapeHtml(log.detaily)}</div>
        </div>
    `).join('');
}

// Akcie priamo z podstránky detailu
function joinInterviewAsStaff() {
    if (!detailData?.interview?.room_id) return;
    const url = `${window.location.origin}/meeting/${encodeURIComponent(detailData.interview.room_id)}?autojoin=1`;
    window.open(url, '_blank');
}

async function copyDetailMeetingLink() {
    if (!detailData?.interview?.room_id) return;
    const url = `${window.location.origin}/meeting/${encodeURIComponent(detailData.interview.room_id)}`;
    try {
        await navigator.clipboard.writeText(url);
        alert('Odkaz na stretnutie pre uchádzača bol skopírovaný do schránky.');
    } catch (_) {
        prompt('Skopírujte odkaz ručne:', url);
    }
}

function downloadDetailIcs() {
    if (!detailInterviewId) return;
    window.location.href = `/api/interviews/${detailInterviewId}/ics`;
}

async function onDetailEvaluationChange(newStatus) {
    try {
        const res = await fetch(`/api/interviews/${detailInterviewId}/vyhodnotenie`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${detailAuthToken}`
            },
            body: JSON.stringify({ vyhodnotenie: newStatus })
        });
        if (!res.ok) {
            const d = await res.json();
            alert(d.error || 'Nepodarilo sa zmeniť vyhodnotenie.');
            return;
        }
        await loadInterviewDetail();
    } catch (err) {
        alert('Chyba spojenia: ' + err.message);
    }
}

async function saveDetailNotes() {
    const notesEl = document.getElementById('detailNotesInput');
    const hint = document.getElementById('detailNotesSavedHint');
    if (!notesEl) return;

    try {
        const res = await fetch(`/api/interviews/${detailInterviewId}/notes`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${detailAuthToken}`
            },
            body: JSON.stringify({ poznamky: notesEl.value })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'Nepodarilo sa uložiť poznámky.');
            return;
        }
        if (hint) {
            hint.textContent = '✓ Poznámky uložené';
            setTimeout(() => { hint.textContent = ''; }, 2500);
        }
        await loadInterviewDetail();
    } catch (err) {
        alert('Chyba uloženia poznámok: ' + err.message);
    }
}

async function resendDetailInvitation() {
    try {
        const res = await fetch(`/api/interviews/${detailInterviewId}/resend-invitation`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${detailAuthToken}` }
        });
        const data = await res.json();
        alert(data.message || data.error || 'Hotovo');
        await loadInterviewDetail();
    } catch (err) {
        alert('Chyba: ' + err.message);
    }
}

async function sendDetailReminder() {
    try {
        const res = await fetch(`/api/interviews/${detailInterviewId}/send-reminder`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${detailAuthToken}` }
        });
        const data = await res.json();
        alert(data.message || data.error || 'Hotovo');
        await loadInterviewDetail();
    } catch (err) {
        alert('Chyba: ' + err.message);
    }
}

function setupDetailRealtimeSync() {
    if (detailEventSource) {
        try { detailEventSource.close(); } catch (_) {}
    }
    detailEventSource = new EventSource('/api/db/stream');
    detailEventSource.onmessage = () => {
        loadInterviewDetail();
    };
}

window.addEventListener('DOMContentLoaded', initInterviewDetail);
