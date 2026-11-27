// =============================================================================
// HR Admin Konzola – Modály pozvánok, SMTP, presunu, zrušenia a tímu
// =============================================================================

// -------------------------------------------------------------
// POZVÁNKY A ICALENDAR (.ICS)
// -------------------------------------------------------------

async function openInvitationModal(interviewId) {
    currentModalInterviewId = interviewId;
    try {
        const res = await fetch(`/api/interviews/${interviewId}/invitation`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) {
            alert('Nepodarilo sa načítať pozvánku');
            return;
        }
        const data = await res.json();
        const inv = data.invitation;

        document.getElementById('invModalRecipient').textContent = `${inv.recipientName} (${inv.recipientEmail})`;
        document.getElementById('invModalDatum').textContent = inv.formattedDatum || inv.datum;
        document.getElementById('invModalHr').textContent = inv.hrName;

        // Nastavenie HTML obsahu v iframe
        const iframe = document.getElementById('invModalIframe');
        iframe.srcdoc = inv.html;

        document.getElementById('invitationModal').classList.add('active');
    } catch (e) {
        alert('Chyba načítania pozvánky: ' + e.message);
    }
}

function closeInvitationModal() {
    document.getElementById('invitationModal').classList.remove('active');
    currentModalInterviewId = null;
}

function viewLastInvitation() {
    if (lastCreatedInterview && lastCreatedInterview.id) {
        openInvitationModal(lastCreatedInterview.id);
    }
}

function downloadLastIcs() {
    if (lastCreatedInterview && lastCreatedInterview.id) {
        downloadInterviewIcs(lastCreatedInterview.id);
    }
}

function downloadInterviewIcs(interviewId) {
    window.open(`/api/interviews/${interviewId}/ics`, '_blank');
}

function downloadModalIcs() {
    if (currentModalInterviewId) {
        downloadInterviewIcs(currentModalInterviewId);
    }
}

async function resendModalInvitation() {
    if (!currentModalInterviewId) return;
    try {
        const res = await fetch(`/api/interviews/${currentModalInterviewId}/resend-invitation`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            alert('✅ ' + (data.message || 'Pozvánka na pohovor bola úspešne opätovne odoslaná uchádzačovi!'));
        } else {
            alert('Chyba pri odosielaní: ' + (data.error || 'Neznáma chyba'));
        }
    } catch (e) {
        alert('Chyba komunikácie: ' + e.message);
    }
}

async function sendModalReminder() {
    if (!currentModalInterviewId) return;
    await sendInterviewReminder(currentModalInterviewId);
}

async function sendInterviewReminder(interviewId) {
    try {
        const res = await fetch(`/api/interviews/${interviewId}/send-reminder`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            alert('🔔 ' + (data.message || 'Pripomienka na online pohovor bola úspešne odoslaná!'));
            if (typeof loadDatabaseLive === 'function') {
                loadDatabaseLive();
            }
        } else {
            const err = data.error || 'Neznáma chyba';
            if (err.includes('BadCredentials') || err.includes('Heslo aplikácie') || err.includes('535')) {
                openEmailConfigModal(err, interviewId);
            } else {
                alert('Chyba pri odosielaní pripomienky: ' + err);
            }
        }
    } catch (e) {
        alert('Chyba komunikácie: ' + e.message);
    }
}

let pendingRetryInterviewId = null;

async function openEmailConfigModal(errorNotice, retryInterviewId) {
    pendingRetryInterviewId = retryInterviewId || null;
    const modal = document.getElementById('emailConfigModal');
    const statusBox = document.getElementById('smtpStatusBox');
    if (!modal) return;

    if (errorNotice && statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        statusBox.style.color = '#f87171';
        statusBox.innerHTML = `<strong>⚠️ Google odmietol prihlásenie (BadCredentials):</strong><br>Google pre účet oncall.noreply@gmail.com vyžaduje namiesto bežného hesla 16-miestne <strong>Heslo aplikácie (App Password)</strong>. Získate ho na <a href="https://myaccount.google.com/apppasswords" target="_blank" style="color: #38bdf8; text-decoration: underline;">myaccount.google.com/apppasswords</a>.`;
    } else if (statusBox) {
        statusBox.style.display = 'none';
    }

    try {
        const res = await fetch('/api/email/status');
        const data = await res.json();
        if (data.ok) {
            if (document.getElementById('smtpEmailInput')) {
                document.getElementById('smtpEmailInput').value = data.user || 'oncall.noreply@gmail.com';
            }
        }
    } catch (_) {}

    modal.classList.add('active');
}

function closeEmailConfigModal() {
    const modal = document.getElementById('emailConfigModal');
    if (modal) modal.classList.remove('active');
    pendingRetryInterviewId = null;
}

async function testSmtpConnection() {
    const statusBox = document.getElementById('smtpStatusBox');
    if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(56, 189, 248, 0.1)';
        statusBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
        statusBox.style.color = '#38bdf8';
        statusBox.innerHTML = '⏳ Overujem spojenie so serverom smtp.gmail.com...';
    }

    try {
        const res = await fetch('/api/email/status');
        const data = await res.json();
        if (data.smtp && data.smtp.ok) {
            statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            statusBox.style.color = '#34d399';
            statusBox.innerHTML = '✅ SMTP spojenie a prihlasovacie údaje sú 100% overené a funkčné!';
        } else {
            statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            statusBox.style.color = '#f87171';
            statusBox.innerHTML = `❌ Overenie zlyhalo: ${data.smtp?.error || 'Neznáma chyba'}`;
        }
    } catch (e) {
        if (statusBox) {
            statusBox.style.color = '#f87171';
            statusBox.innerHTML = '❌ Chyba komunikácie so serverom: ' + e.message;
        }
    }
}

async function saveEmailConfig() {
    const email = document.getElementById('smtpEmailInput')?.value?.trim();
    const pass = document.getElementById('smtpPasswordInput')?.value?.trim();

    if (!pass && !email) {
        alert('Zadajte Heslo aplikácie alebo e-mail.');
        return;
    }

    try {
        const res = await fetch('/api/email/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ user: email, pass: pass })
        });
        const data = await res.json();

        if (res.ok) {
            if (data.smtp && data.smtp.ok) {
                alert('✅ ' + data.message);
                closeEmailConfigModal();
                if (pendingRetryInterviewId) {
                    const retryId = pendingRetryInterviewId;
                    pendingRetryInterviewId = null;
                    sendInterviewReminder(retryId);
                }
            } else {
                alert('⚠️ ' + data.message);
                testSmtpConnection();
            }
        } else {
            alert('Chyba: ' + (data.error || 'Nepodarilo sa uložiť konfiguráciu'));
        }
    } catch (e) {
        alert('Chyba spojenia: ' + e.message);
    }
}


// -------------------------------------------------------------
// PRESUNUTIE A ZRUŠENIE POHOVORU (Reschedule & Cancel Modals)
// -------------------------------------------------------------

function findInterviewById(id) {
    if (!lastSnapshot?.tables?.interview) return null;
    return lastSnapshot.tables.interview.find(i => i.id === id);
}

function openRescheduleModal(id) {
    const item = findInterviewById(id);
    if (!item) {
        alert('Pohovor nebol nájdený.');
        return;
    }

    document.getElementById('rescheduleInterviewId').value = item.id;
    document.getElementById('rescheduleModalJob').textContent = item.titul_pozicia || 'Pohovor';
    document.getElementById('rescheduleModalCandidate').textContent = `${item.meno_respondenta} (${item.mail_respondenta})`;
    document.getElementById('rescheduleModalCurrentDate').textContent = item.datum;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const parts = (item.datum || '').split(' ');
    const dPart = parts[0] || todayStr;
    const tPart = parts[1] || '10:00';
    const [hPart, mPart] = tPart.split(':');

    const dateInput = document.getElementById('rescheduleDate');
    if (dateInput) {
        dateInput.min = todayStr; // Fyzický zákaz výberu minulých dní
        dateInput.value = dPart >= todayStr ? dPart : todayStr;
    }

    setTimePickerValues('reschedule', parseInt(hPart || '10', 10) || 0, parseInt(mPart || '0', 10) || 0);

    document.getElementById('rescheduleReasonInput').value = '';
    document.getElementById('rescheduleNotifyCandidate').checked = true;

    const statusBox = document.getElementById('rescheduleStatusBox');
    statusBox.style.display = 'none';
    statusBox.textContent = '';

    document.getElementById('rescheduleModal').classList.add('active');
}

function closeRescheduleModal() {
    document.getElementById('rescheduleModal').classList.remove('active');
}

async function submitRescheduleInterview() {
    const id = document.getElementById('rescheduleInterviewId').value;
    const dateInput = document.getElementById('rescheduleDate');
    const hourInput = document.getElementById('rescheduleHour');
    const minInput = document.getElementById('rescheduleMinute');

    const dateVal = dateInput ? dateInput.value : '';
    const hourVal = hourInput ? hourInput.value : '10';
    const minVal = minInput ? minInput.value : '00';
    const reason = document.getElementById('rescheduleReasonInput').value.trim();
    const notifyCandidate = document.getElementById('rescheduleNotifyCandidate').checked;

    if (!dateVal) {
        alert('Zadajte prosím nový dátum pohovoru.');
        return;
    }

    const cleanDatum = `${dateVal} ${hourVal}:${minVal}`;
    const targetDate = new Date(`${dateVal}T${hourVal}:${minVal}`);
    const now = new Date();

    const statusBox = document.getElementById('rescheduleStatusBox');
    const btn = document.getElementById('btnConfirmReschedule');

    if (targetDate.getTime() < now.getTime() - 30000) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.color = '#f87171';
        statusBox.textContent = '❌ Nový termín pohovoru nemôže byť v minulosti! Vyberte prosím budúci dátum a čas (24-hodinový formát).';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Presúvam...';

    statusBox.style.display = 'block';
    statusBox.style.background = 'rgba(56, 189, 248, 0.15)';
    statusBox.style.color = '#38bdf8';
    statusBox.textContent = 'Aktualizujem termín pohovoru v databáze a generujem aktualizáciu...';

    try {
        const res = await fetch(`/api/interviews/${id}/reschedule`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                datum: cleanDatum,
                reason: reason,
                notifyCandidate: notifyCandidate,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Zlyhal presun pohovoru.');

        statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBox.style.color = '#34d399';
        statusBox.textContent = '✅ ' + (data.message || 'Pohovor bol úspešne presunutý!');

        loadLiveDb();

        setTimeout(() => {
            closeRescheduleModal();
            btn.disabled = false;
            btn.textContent = 'Potvrdiť nový termín';
        }, 1200);
    } catch (err) {
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.color = '#f87171';
        statusBox.textContent = '❌ Chyba: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'Potvrdiť nový termín';
    }
}

function openCancelInterviewModal(id) {
    const item = findInterviewById(id);
    if (!item) {
        alert('Pohovor nebol nájdený.');
        return;
    }

    document.getElementById('cancelInterviewId').value = item.id;
    document.getElementById('cancelModalJob').textContent = item.titul_pozicia || 'Pohovor';
    document.getElementById('cancelModalCandidate').textContent = `${item.meno_respondenta} (${item.mail_respondenta})`;
    document.getElementById('cancelModalDate').textContent = item.datum;
    document.getElementById('cancelReasonInput').value = '';
    document.getElementById('cancelNotifyCandidate').checked = true;

    const statusBox = document.getElementById('cancelStatusBox');
    statusBox.style.display = 'none';
    statusBox.textContent = '';

    document.getElementById('cancelInterviewModal').classList.add('active');
}

function closeCancelInterviewModal() {
    document.getElementById('cancelInterviewModal').classList.remove('active');
}

async function submitCancelInterview() {
    const id = document.getElementById('cancelInterviewId').value;
    const reason = document.getElementById('cancelReasonInput').value.trim();
    const notifyCandidate = document.getElementById('cancelNotifyCandidate').checked;

    const statusBox = document.getElementById('cancelStatusBox');
    const btn = document.getElementById('btnConfirmCancel');
    btn.disabled = true;
    btn.textContent = 'Ruším pohovor...';

    statusBox.style.display = 'block';
    statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
    statusBox.style.color = '#f87171';
    statusBox.textContent = 'Ruším pohovor v databáze a odosielam storno e-mail...';

    try {
        const res = await fetch(`/api/interviews/${id}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                reason: reason,
                notifyCandidate: notifyCandidate,
            }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Zlyhalo zrušenie pohovoru.');

        statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBox.style.color = '#34d399';
        statusBox.textContent = '✅ ' + (data.message || 'Pohovor bol úspešne zrušený!');

        loadLiveDb();

        setTimeout(() => {
            closeCancelInterviewModal();
            btn.disabled = false;
            btn.textContent = 'Potvrdiť zrušenie pohovoru';
        }, 1200);
    } catch (err) {
        statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.color = '#f87171';
        statusBox.textContent = '❌ Chyba: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'Potvrdiť zrušenie pohovoru';
    }
}

// -------------------------------------------------------------
// LOGIKA MODALU: Pozvať kolegu / teamleadera na pohovor
// -------------------------------------------------------------

let currentColleagueInterviewId = null;

function toggleColleagueTargetType(type) {
    const isHr = type === 'hr';
    const optHr = document.getElementById('optColleagueHr');
    const optCustom = document.getElementById('optColleagueCustom');
    if (optHr) optHr.checked = isHr;
    if (optCustom) optCustom.checked = !isHr;

    const secHr = document.getElementById('sectionColleagueHr');
    const secCustom = document.getElementById('sectionColleagueCustom');
    if (secHr) secHr.style.display = isHr ? 'block' : 'none';
    if (secCustom) secCustom.style.display = isHr ? 'none' : 'block';

    const hrLabel = document.getElementById('optColleagueHrLabel');
    const customLabel = document.getElementById('optColleagueCustomLabel');

    if (hrLabel && customLabel) {
        if (isHr) {
            hrLabel.style.background = 'rgba(124, 58, 237, 0.15)';
            hrLabel.style.border = '2px solid #7c3aed';
            customLabel.style.background = 'var(--bg-surface)';
            customLabel.style.border = '1px solid var(--border-subtle)';
        } else {
            customLabel.style.background = 'rgba(124, 58, 237, 0.15)';
            customLabel.style.border = '2px solid #7c3aed';
            hrLabel.style.background = 'var(--bg-surface)';
            hrLabel.style.border = '1px solid var(--border-subtle)';
        }
    }
}

function populateColleagueSelect() {
    const select = document.getElementById('colleagueSelectUser');
    if (!select) return;

    const users = (lastSnapshot && lastSnapshot.tables && lastSnapshot.tables.users) ? lastSnapshot.tables.users : [];
    const curVal = select.value;
    const validUsers = users.filter(u => {
        if (!u.mail) return false;
        if (!((u.meno && u.meno.trim()) || (u.priezvisko && u.priezvisko.trim()))) return false;
        // Vylúčiť aktuálne prihláseného používateľa (nemôže pozvať samého seba)
        if (currentUser) {
            if (currentUser.id && u.id === currentUser.id) return false;
            if (currentUser.username && u.username === currentUser.username) return false;
            if (currentUser.mail && u.mail.trim().toLowerCase() === currentUser.mail.trim().toLowerCase()) return false;
        }
        return true;
    });

    let html = '<option value="">-- Vyberte člena tímu --</option>';
    html += validUsers.map(u => {
        const fullName = `${(u.meno || '').trim()} ${(u.priezvisko || '').trim()}`.trim() || (u.username || 'Používateľ');
        return `<option value="${escapeHtml(u.mail || '')}" data-name="${escapeHtml(fullName)}" data-role="${escapeHtml(u.ures_tag || '')}" data-username="${escapeHtml(u.username || '')}">${escapeHtml(fullName)}</option>`;
    }).join('');

    select.innerHTML = html;
    if (curVal && select.querySelector(`option[value="${curVal}"]`)) {
        select.value = curVal;
    } else {
        select.value = '';
    }
}

function checkColleagueSelfEmail() {
    const input = document.getElementById('colleagueEmailInput');
    const warning = document.getElementById('colleagueSelfEmailWarning');
    if (!input || !warning) return false;

    if (!currentUser || !currentUser.mail) {
        warning.style.display = 'none';
        return false;
    }

    const myMail = currentUser.mail.trim().toLowerCase();
    const rawVal = input.value || '';
    const typedEmails = rawVal.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean);

    if (typedEmails.includes(myMail)) {
        warning.style.display = 'block';
        return true;
    } else {
        warning.style.display = 'none';
        return false;
    }
}

function onColleagueUserSelected(email) {
    const box = document.getElementById('colleagueUserPreviewBox');
    if (!box) return;
    const select = document.getElementById('colleagueSelectUser');
    const selectedOpt = select.options[select.selectedIndex];
    if (!email || !selectedOpt || !selectedOpt.value) {
        box.style.display = 'none';
        return;
    }
    const name = selectedOpt.getAttribute('data-name') || '';
    const role = selectedOpt.getAttribute('data-role') || '';
    const username = selectedOpt.getAttribute('data-username') || '';

    box.style.display = 'block';
    box.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div>
                <strong style="color: #fff;">${name}</strong> 
                <span style="color: var(--text-dim); font-size: 0.75rem;">(@${username})</span>
            </div>
            <span class="badge-role-tag" style="background: rgba(124, 58, 237, 0.2); color: #c4b5fd;">${role}</span>
        </div>
        <div style="margin-top: 4px; color: #38bdf8; font-size: 0.76rem;">✉️ ${escapeHtml(email)}</div>
    `;
}

function openInviteColleagueModal(interviewId) {
    const item = findInterviewById(interviewId);
    if (!item) {
        alert('Pohovor nebol nájdený.');
        return;
    }
    currentColleagueInterviewId = interviewId;

    document.getElementById('colleagueModalJob').textContent = item.titul_pozicia || 'Pohovor';
    document.getElementById('colleagueModalCandidate').textContent = `${item.meno_respondenta} (${item.mail_respondenta})`;
    document.getElementById('colleagueModalDate').textContent = item.datum;
    document.getElementById('colleagueModalCurrentList').textContent = item.dalsie_maily || 'Zatiaľ žiadni';

    populateColleagueSelect();
    toggleColleagueTargetType('hr');

    const userSelect = document.getElementById('colleagueSelectUser');
    if (userSelect) userSelect.value = '';

    const previewBox = document.getElementById('colleagueUserPreviewBox');
    if (previewBox) {
        previewBox.style.display = 'none';
        previewBox.innerHTML = '';
    }

    const emailInput = document.getElementById('colleagueEmailInput');
    if (emailInput) emailInput.value = '';

    const selfWarn = document.getElementById('colleagueSelfEmailWarning');
    if (selfWarn) selfWarn.style.display = 'none';

    const noteInput = document.getElementById('colleagueNoteInput');
    if (noteInput) noteInput.value = 'Pozorovateľ / Team Leader – účasť na technickom pohovore a počúvanie';

    const statusBox = document.getElementById('colleagueStatusBox');
    if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.textContent = '';
    }

    const btnConfirm = document.getElementById('btnConfirmSendColleague');
    if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Odoslať pozvánku e-mailom
        `;
    }

    document.getElementById('inviteColleagueModal').classList.add('active');
}

function closeInviteColleagueModal() {
    document.getElementById('inviteColleagueModal').classList.remove('active');
    currentColleagueInterviewId = null;
}

function openInviteColleagueFromModal() {
    if (currentModalInterviewId) {
        const id = currentModalInterviewId;
        closeInvitationModal();
        openInviteColleagueModal(id);
    }
}

async function submitInviteColleague() {
    if (!currentColleagueInterviewId) return;

    const isHrTarget = document.getElementById('optColleagueHr')?.checked;
    let emails = '';
    let role = 'Pozorovateľ / Člen tímu';

    if (isHrTarget) {
        const userSelect = document.getElementById('colleagueSelectUser');
        const selectedOpt = userSelect?.options[userSelect.selectedIndex];
        emails = userSelect ? userSelect.value.trim() : '';
        if (!emails) {
            alert('Vyberte prosím člena z HR adminov alebo Superadminov zo zoznamu.');
            if (userSelect) userSelect.focus();
            return;
        }
        const chosenRole = selectedOpt?.getAttribute('data-role');
        if (chosenRole) role = chosenRole === 'SUPERADMIN' ? 'Superadmin / Pozorovateľ' : 'HR Konzultant / Pozorovateľ';
    } else {
        const emailInput = document.getElementById('colleagueEmailInput');
        emails = emailInput ? emailInput.value.trim() : '';
        if (!emails) {
            alert('Zadajte prosím e-mailovú adresu zamestnanca alebo teamleadera.');
            if (emailInput) emailInput.focus();
            return;
        }
        role = 'Team Leader / Pozorovateľ';
    }

    // Kontrola: používateľ nemôže pozvať samého seba
    if (currentUser && currentUser.mail) {
        const myMail = currentUser.mail.trim().toLowerCase();
        const inputEmails = emails.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
        if (inputEmails.includes(myMail)) {
            alert('Nemôžete pozvať samého seba na pohovor!');
            if (!isHrTarget) {
                const emailInput = document.getElementById('colleagueEmailInput');
                if (emailInput) emailInput.focus();
                const warning = document.getElementById('colleagueSelfEmailWarning');
                if (warning) warning.style.display = 'block';
            }
            if (statusBox) {
                statusBox.style.display = 'block';
                statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
                statusBox.style.color = '#f87171';
                statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                statusBox.textContent = '❌ Nemôžete pozvať samého seba na pohovor (zadaná vaša vlastná e-mailová adresa).';
            }
            return;
        }
    }

    const noteInput = document.getElementById('colleagueNoteInput');
    const note = noteInput ? noteInput.value.trim() : '';
    const saveToDb = document.getElementById('colleagueSaveToDb') ? document.getElementById('colleagueSaveToDb').checked : true;

    const statusBox = document.getElementById('colleagueStatusBox');
    const btnConfirm = document.getElementById('btnConfirmSendColleague');

    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '⏳ Odosielam pozvánku...';
    }

    if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(56, 189, 248, 0.15)';
        statusBox.style.color = '#38bdf8';
        statusBox.style.border = '1px solid rgba(56, 189, 248, 0.3)';
        statusBox.textContent = 'Odosielam e-mail cez SMTP server na zadané adresy...';
    }

    try {
        const res = await fetch(`/api/interviews/${currentColleagueInterviewId}/invite-colleague`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                emails: emails,
                note: note,
                role: role,
                saveToInterview: saveToDb
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Zlyhalo odoslanie pozvánky.');
        }

        if (statusBox) {
            statusBox.style.background = 'rgba(16, 185, 129, 0.15)';
            statusBox.style.color = '#34d399';
            statusBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            statusBox.textContent = `✅ ${data.message || 'Pozvánka úspešne odoslaná!'}`;
        }

        alert(`✅ Pozvánka na online pohovor bola úspešne odoslaná zamestnancovi:\n${data.sentTo.join(', ')}`);
        setTimeout(() => {
            closeInviteColleagueModal();
            loadLiveDb();
        }, 1000);
    } catch (err) {
        if (statusBox) {
            statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
            statusBox.style.color = '#f87171';
            statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            statusBox.textContent = `Chyba: ${err.message}`;
        }
        alert(`Chyba pri odosielaní pozvánky: ${err.message}`);
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Odoslať pozvánku e-mailom
            `;
        }
    }
}

