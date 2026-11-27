// =============================================================================
// HR Admin Konzola – Interaktívny 24-hodinový výber času
// =============================================================================

// -------------------------------------------------------------
// INTERAKTÍVNE 24-HODINOVÉ HODINY NA VÝBER ČASU
// -------------------------------------------------------------
let clockState = {
    target: 'create', // 'create' alebo 'reschedule'
    mode: 'hour',     // 'hour' alebo 'minute'
    hour: 10,
    minute: 0,
    isDragging: false,
    moved: false
};

function setTimePickerValues(target, hour, minute) {
    const hStr = String(hour).padStart(2, '0');
    const mStr = String(minute).padStart(2, '0');

    if (target === 'create') {
        const hEl = document.getElementById('intTimeHour');
        const mEl = document.getElementById('intTimeMinute');
        const disp = document.getElementById('intTimeDisplay');
        if (hEl) hEl.value = hStr;
        if (mEl) mEl.value = mStr;
        if (disp) disp.textContent = `${hStr}:${mStr}`;
        syncCreateInterviewDatum();
    } else if (target === 'reschedule') {
        const hEl = document.getElementById('rescheduleHour');
        const mEl = document.getElementById('rescheduleMinute');
        const disp = document.getElementById('rescheduleTimeDisplay');
        if (hEl) hEl.value = hStr;
        if (mEl) mEl.value = mStr;
        if (disp) disp.textContent = `${hStr}:${mStr}`;
    }
}

function openClockTimePicker(target) {
    clockState.target = target;
    clockState.mode = 'hour';

    const hEl = document.getElementById(target === 'create' ? 'intTimeHour' : 'rescheduleHour');
    const mEl = document.getElementById(target === 'create' ? 'intTimeMinute' : 'rescheduleMinute');
    clockState.hour = parseInt(hEl?.value || '10', 10) || 0;
    clockState.minute = parseInt(mEl?.value || '0', 10) || 0;

    renderClockFace();
    document.getElementById('clockPickerModal').classList.add('active');
}

function closeClockTimePicker() {
    document.getElementById('clockPickerModal').classList.remove('active');
}

function confirmClockTimePicker() {
    setTimePickerValues(clockState.target, clockState.hour, clockState.minute);
    closeClockTimePicker();
}

function applyClockPreset(hour, minute) {
    clockState.hour = hour;
    clockState.minute = minute;
    setTimePickerValues(clockState.target, hour, minute);
    closeClockTimePicker();
}

function setClockMode(mode) {
    clockState.mode = mode;
    renderClockFace();
}

function renderClockFace() {
    const hBtn = document.getElementById('clockDigitHour');
    const mBtn = document.getElementById('clockDigitMinute');
    const modeLbl = document.getElementById('clockModeLabel');
    const hand = document.getElementById('clockHand');
    const layer = document.getElementById('clockNumbersLayer');
    if (!hBtn || !mBtn || !hand || !layer) return;

    hBtn.textContent = String(clockState.hour).padStart(2, '0');
    mBtn.textContent = String(clockState.minute).padStart(2, '0');
    hBtn.classList.toggle('active', clockState.mode === 'hour');
    mBtn.classList.toggle('active', clockState.mode === 'minute');

    let html = '';
    if (clockState.mode === 'hour') {
        if (modeLbl) modeLbl.textContent = 'Vyberte hodinu (vonkajší okruh 01–12 · vnútorný 13–00)';

        // Vonkajší okruh: 12, 01..11 (radius 102px)
        for (let i = 0; i < 12; i++) {
            const val = i === 0 ? 12 : i;
            const rad = (i * 30 * Math.PI) / 180;
            const x = Math.sin(rad) * 102;
            const y = -Math.cos(rad) * 102;
            const sel = clockState.hour === val ? 'selected' : '';
            html += `<div class="clock-number ${sel}" style="left: calc(50% + ${x.toFixed(1)}px); top: calc(50% + ${y.toFixed(1)}px);">${String(val).padStart(2, '0')}</div>`;
        }

        // Vnútorný okruh: 00, 13..23 (radius 66px)
        for (let i = 0; i < 12; i++) {
            const val = i === 0 ? 0 : i + 12;
            const rad = (i * 30 * Math.PI) / 180;
            const x = Math.sin(rad) * 66;
            const y = -Math.cos(rad) * 66;
            const sel = clockState.hour === val ? 'selected' : '';
            html += `<div class="clock-number inner ${sel}" style="left: calc(50% + ${x.toFixed(1)}px); top: calc(50% + ${y.toFixed(1)}px);">${String(val).padStart(2, '0')}</div>`;
        }

        const isInnerSelected = clockState.hour === 0 || clockState.hour > 12;
        const deg = (clockState.hour % 12) * 30;
        hand.style.height = isInnerSelected ? '66px' : '102px';
        hand.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    } else {
        if (modeLbl) modeLbl.textContent = 'Vyberte minúty (kliknutím alebo ťahaním ručičky)';

        for (let i = 0; i < 12; i++) {
            const val = i * 5;
            const rad = (i * 30 * Math.PI) / 180;
            const x = Math.sin(rad) * 102;
            const y = -Math.cos(rad) * 102;
            const sel = clockState.minute === val ? 'selected' : '';
            html += `<div class="clock-number ${sel}" style="left: calc(50% + ${x.toFixed(1)}px); top: calc(50% + ${y.toFixed(1)}px);">${String(val).padStart(2, '0')}</div>`;
        }

        const deg = clockState.minute * 6;
        hand.style.height = '102px';
        hand.style.transform = `translateX(-50%) rotate(${deg}deg)`;
    }

    layer.innerHTML = html;
}

function updateClockFromPointer(e, snapClick) {
    const face = document.getElementById('clockFace');
    if (!face) return;
    const rect = face.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    const angleDeg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;

    if (clockState.mode === 'hour') {
        const pos12 = Math.round(angleDeg / 30) % 12;
        const isInner = dist < 84;
        clockState.hour = isInner ? (pos12 === 0 ? 0 : pos12 + 12) : (pos12 === 0 ? 12 : pos12);
    } else {
        let min = Math.round(angleDeg / 6) % 60;
        if (snapClick) {
            const nearest5 = Math.round(min / 5) * 5;
            if (Math.abs(min - nearest5) <= 2) {
                min = nearest5 % 60;
            }
        }
        clockState.minute = min;
    }
    renderClockFace();
}

function initClockFaceInteraction() {
    const face = document.getElementById('clockFace');
    const hand = document.getElementById('clockHand');
    if (!face || !hand) return;

    face.addEventListener('pointerdown', (e) => {
        clockState.isDragging = true;
        clockState.moved = false;
        hand.classList.add('dragging');
        face.setPointerCapture(e.pointerId);
        updateClockFromPointer(e, false);
    });

    face.addEventListener('pointermove', (e) => {
        if (!clockState.isDragging) return;
        clockState.moved = true;
        updateClockFromPointer(e, false);
    });

    face.addEventListener('pointerup', (e) => {
        if (!clockState.isDragging) return;
        clockState.isDragging = false;
        hand.classList.remove('dragging');
        updateClockFromPointer(e, !clockState.moved);

        if (clockState.mode === 'hour') {
            setTimeout(() => {
                clockState.mode = 'minute';
                renderClockFace();
            }, 120);
        }
    });

    face.addEventListener('pointercancel', () => {
        clockState.isDragging = false;
        hand.classList.remove('dragging');
    });
}

function syncCreateInterviewDatum() {
    const dateInput = document.getElementById('intDate');
    const hourSelect = document.getElementById('intTimeHour');
    const minSelect = document.getElementById('intTimeMinute');
    const hidden = document.getElementById('intDatum');
    if (dateInput && hourSelect && minSelect && hidden) {
        hidden.value = `${dateInput.value}T${hourSelect.value}:${minSelect.value}`;
    }
}

