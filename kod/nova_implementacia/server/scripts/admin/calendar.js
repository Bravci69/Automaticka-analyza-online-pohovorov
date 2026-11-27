// =============================================================================
// HR Admin Konzola – Kalendár, denný rozvrh a nadchádzajúce pohovory
// =============================================================================

// -------------------------------------------------------------
// LOGIKA INTERAKTÍVNEHO KALENDÁRA POHOVOROV
// -------------------------------------------------------------

function prevMonth() {
    calendarMonth--;
    if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
    }
    renderCalendar();
}

function nextMonth() {
    calendarMonth++;
    if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
    }
    renderCalendar();
}

function goToToday() {
    const d = new Date();
    calendarYear = d.getFullYear();
    calendarMonth = d.getMonth();
    selectedDate = `${calendarYear}-${pad(calendarMonth + 1)}-${pad(d.getDate())}`;
    renderCalendar();
}

function onCalendarFilterChange() {
    const sel = document.getElementById('calFilterHr');
    if (sel) calendarFilter = sel.value;
    renderCalendar();
}

function setCalendarView(view) {
    calendarView = view;
    const btnMonth = document.getElementById('btnViewMonth');
    const btnAgenda = document.getElementById('btnViewAgenda');
    const monthToolbar = document.getElementById('calMonthToolbar');
    const monthCont = document.getElementById('calMonthContainer');
    const dayBox = document.getElementById('dayAgendaBox');
    const agendaCont = document.getElementById('calAgendaContainer');

    if (view === 'month') {
        btnMonth.classList.add('active');
        btnAgenda.classList.remove('active');
        monthToolbar.style.display = 'flex';
        monthCont.style.display = 'block';
        dayBox.style.display = 'block';
        agendaCont.style.display = 'none';
    } else {
        btnMonth.classList.remove('active');
        btnAgenda.classList.add('active');
        monthToolbar.style.display = 'none';
        monthCont.style.display = 'none';
        dayBox.style.display = 'none';
        agendaCont.style.display = 'block';
    }
    renderCalendar();
}

function selectCalendarDay(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    // Plynulý posun na denný rozvrh
    const dayBox = document.getElementById('dayAgendaBox');
    if (dayBox) {
        dayBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function getFilteredInterviews() {
    if (!lastSnapshot || !lastSnapshot.tables || !lastSnapshot.tables.interview) return [];
    const all = lastSnapshot.tables.interview;
    const isSuper = currentUser && currentUser.ures_tag === 'SUPERADMIN';

    if (!isSuper && currentUser) {
        // HR_ADMIN vidí VÝLUČNE svoje pohovory
        return all.filter(i => i.hr_id === currentUser.id);
    }

    if (isSuper && calendarFilter === 'mine' && currentUser) {
        return all.filter(i => i.hr_id === currentUser.id);
    }

    return all;
}

function renderCalendar() {
    const interviews = getFilteredInterviews();

    // Nastavenie nadpisu mesiaca
    const monthTitleEl = document.getElementById('calMonthTitle');
    if (monthTitleEl) {
        monthTitleEl.textContent = `${MONTH_NAMES_SK[calendarMonth]} ${calendarYear}`;
    }

    // Počet nadchádzajúcich pohovorov
    const todayIso = new Date().toISOString().substring(0, 10);
    const upcomingCount = interviews.filter(i => i.datum && i.datum >= todayIso).length;
    const cntUpEl = document.getElementById('cntUpcoming');
    if (cntUpEl) cntUpEl.textContent = upcomingCount;

    // 1. Vykreslenie buniek mesiaca
    const grid = document.getElementById('calendarDaysGrid');
    if (grid) {
        grid.innerHTML = '';

        // Prvý deň v mesiaci
        const firstDay = new Date(calendarYear, calendarMonth, 1);
        // Posun na pondelok ako 0 (v JS: 0=nedeľa, 1=pondelok ... 6=sobota)
        let startWeekday = (firstDay.getDay() + 6) % 7;

        // Počet dní v aktuálnom mesiaci
        const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
        // Počet dní v predchádzajúcom mesiaci pre doplnenie mriežky
        const daysInPrevMonth = new Date(calendarYear, calendarMonth, 0).getDate();

        const todayObj = new Date();
        const todayFormatted = `${todayObj.getFullYear()}-${pad(todayObj.getMonth() + 1)}-${pad(todayObj.getDate())}`;

        // Predchádzajúci mesiac (sivé dni)
        for (let i = startWeekday - 1; i >= 0; i--) {
            const prevD = daysInPrevMonth - i;
            const prevMonthNum = calendarMonth === 0 ? 12 : calendarMonth;
            const prevYearNum = calendarMonth === 0 ? calendarYear - 1 : calendarYear;
            const prevDateIso = `${prevYearNum}-${pad(prevMonthNum)}-${pad(prevD)}`;

            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell other-month';
            cell.innerHTML = `
                <div class="day-header-line">
                    <span class="day-number">${prevD}</span>
                </div>
            `;
            cell.onclick = () => {
                calendarMonth--;
                if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
                selectCalendarDay(prevDateIso);
            };
            grid.appendChild(cell);
        }

        // Dni aktuálneho mesiaca
        for (let day = 1; day <= daysInMonth; day++) {
            const dayDateIso = `${calendarYear}-${pad(calendarMonth + 1)}-${pad(day)}`;
            const isToday = dayDateIso === todayFormatted;
            const isSelected = dayDateIso === selectedDate;

            // Pohovory pre tento deň
            const dayInterviews = interviews.filter(i => i.datum && i.datum.startsWith(dayDateIso));

            const cell = document.createElement('div');
            cell.className = `calendar-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
            cell.onclick = () => selectCalendarDay(dayDateIso);

            let chipsHtml = '';
            dayInterviews.slice(0, 3).forEach(it => {
                const timeStr = it.datum.split(' ')[1] ? it.datum.split(' ')[1].substring(0, 5) : '00:00';
                const statusClass = `chip-${it.vyhodnotenie}`;
                chipsHtml += `
                    <div class="event-chip ${statusClass}" title="${escapeHtml(it.titul_pozicia)}: ${escapeHtml(it.meno_respondenta)} (${timeStr})">
                        <span>⏰ ${timeStr}</span>
                        <span>${escapeHtml(it.meno_respondenta.split(' ')[0])}</span>
                    </div>
                `;
            });

            if (dayInterviews.length > 3) {
                chipsHtml += `<div style="font-size: 0.65rem; color: #c4b5fd; font-weight: 700; text-align: right;">+${dayInterviews.length - 3} ďalšie</div>`;
            }

            cell.innerHTML = `
                <div class="day-header-line">
                    <span class="day-number">${day}</span>
                    ${isToday ? '<span class="day-badge-today">Dnes</span>' : ''}
                </div>
                <div class="day-events-list">
                    ${chipsHtml}
                </div>
            `;
            grid.appendChild(cell);
        }

        // Doplnenie dní nasledujúceho mesiaca pre ucelenú mriežku
        const totalCells = startWeekday + daysInMonth;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let nextD = 1; nextD <= remainingCells; nextD++) {
            const nextMonthNum = calendarMonth === 11 ? 1 : calendarMonth + 2;
            const nextYearNum = calendarMonth === 11 ? calendarYear + 1 : calendarYear;
            const nextDateIso = `${nextYearNum}-${pad(nextMonthNum)}-${pad(nextD)}`;

            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell other-month';
            cell.innerHTML = `
                <div class="day-header-line">
                    <span class="day-number">${nextD}</span>
                </div>
            `;
            cell.onclick = () => {
                calendarMonth++;
                if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
                selectCalendarDay(nextDateIso);
            };
            grid.appendChild(cell);
        }
    }

    // 2. Vykreslenie Denného rozvrhu pre vybraný deň
    renderDayAgenda(selectedDate, interviews);

    // 3. Vykreslenie Zoznamu nadchádzajúcich pohovorov (agenda view)
    renderUpcomingInterviews(interviews);
}

// Vykreslenie položiek pre konkrétny vybraný deň
function renderDayAgenda(dateStr, allInterviews) {
    const interviews = allInterviews || getFilteredInterviews();
    const dayInterviews = interviews.filter(i => i.datum && i.datum.startsWith(dateStr));

    // Formátovanie dátumu
    const parts = dateStr.split('-');
    const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const daysSk = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
    const formattedHeaderDate = `${parseInt(parts[2])}. ${MONTH_NAMES_SK[parseInt(parts[1]) - 1]} ${parts[0]} (${daysSk[dObj.getDay()]})`;

    const titleEl = document.getElementById('agendaDayTitle');
    if (titleEl) {
        titleEl.textContent = `Rozvrh pohovorov na: ${formattedHeaderDate}`;
    }

    const listEl = document.getElementById('agendaItemsList');
    if (!listEl) return;

    if (dayInterviews.length === 0) {
        listEl.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--text-dim);">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px; opacity: 0.5;">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <p style="font-size: 0.9rem; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
                    Na tento deň nie je naplánovaný žiadny pohovor.
                </p>
                <p style="font-size: 0.78rem;">Kliknite na tlačidlo vyššie pre naplánovanie nového termínu na tento dátum.</p>
            </div>
        `;
        return;
    }

    // Zoradenie podľa času
    dayInterviews.sort((a, b) => a.datum.localeCompare(b.datum));

    listEl.innerHTML = dayInterviews.map(item => {
        const time = item.datum.split(' ')[1] ? item.datum.split(' ')[1].substring(0, 5) : '10:00';
        const enumOptions = (lastSnapshot?.tables?.vyhodnotenie || [
            { kod: 'neprebehlo', nazov: 'Neprebehlo' },
            { kod: 'rozpracovane', nazov: 'Rozpracované' },
            { kod: 'postupil', nazov: 'Postúpil' },
            { kod: 'nepostupil', nazov: 'Nepostúpil' }
        ]).map(ev => `
            <option value="${ev.kod}" ${ev.kod === item.vyhodnotenie ? 'selected' : ''}>
                ${ev.nazov}
            </option>
        `).join('');

        const badgeClass = `status-${item.vyhodnotenie}`;

        return `
            <div class="interview-schedule-item">
                <div class="schedule-time-box">
                    <span class="schedule-time-val">${time}</span>
                    <span class="schedule-date-val">45 min</span>
                </div>

                <div class="schedule-details">
                    <div class="schedule-job-title">${escapeHtml(item.titul_pozicia || 'Pohovor')}</div>
                    <div class="schedule-candidate-name">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #38bdf8;">
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                        <strong>${escapeHtml(item.meno_respondenta)}</strong>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">(${escapeHtml(item.mail_respondenta)})</span>
                    </div>
                    <div class="schedule-meta-row">
                        <span>👔 HR: <strong>${escapeHtml(item.meno_hr)}</strong></span>
                        <span style="display: flex; align-items: center; gap: 4px;">
                            <span>Hodnotenie:</span>
                            <select class="select-enum-inline ${badgeClass}" onchange="changeEvaluation(${item.id}, this.value)">
                                ${enumOptions}
                            </select>
                        </span>
                    </div>
                    ${item.dalsie_maily ? `
                    <div style="margin-top: 6px; font-size: 0.76rem; color: #c4b5fd; display: flex; align-items: center; gap: 5px;">
                        <span>👥 <strong>Pozvaní kolegovia:</strong></span>
                        <span>${escapeHtml(item.dalsie_maily)}</span>
                    </div>` : ''}
                </div>

                <div class="schedule-actions">
                    <button type="button" class="btn-primary" style="padding: 7px 14px; font-size: 0.82rem;" onclick="window.open('${getMeetingUrl(item, { autoJoin: true })}', '_blank')" title="Otvoriť videohovor">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" x2="21" y1="14" y2="3"/>
                        </svg>
                        Vstúpiť
                    </button>

                    <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem;" onclick="copyAnyLink('${getMeetingUrl(item)}')" title="Kopírovať odkaz pre uchádzača">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                        </svg>
                        Link
                    </button>

                    <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem; color: #a78bfa;" onclick="openInviteColleagueModal(${item.id})" title="Poslať pozvánku ďalším zamestnancom / teamleaderovi">
                        👥 Pozvať kolegu
                    </button>

                    <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem; color: #34d399;" onclick="openInvitationModal(${item.id})" title="Zobraziť odoslanú e-mailovú pozvánku a termín">
                        ✉️ Pozvánka
                    </button>

                    <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem; color: #38bdf8;" onclick="openRescheduleModal(${item.id})" title="Presunúť pohovor na iný dátum alebo čas">
                        🗓️ Presunúť
                    </button>
                    ${item.vyhodnotenie !== 'zruseny' ? `
                    <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem; color: #f87171;" onclick="openCancelInterviewModal(${item.id})" title="Zrušiť tento pohovor">
                        ❌ Zrušiť
                    </button>` : ''}

                    <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem;" onclick="downloadInterviewIcs(${item.id})" title="Stiahnuť .ics do kalendára">
                        📅 .ics
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Vykreslenie všetkých nadchádzajúcich pohovorov (agenda view)
function renderUpcomingInterviews(allInterviews) {
    const interviews = allInterviews || getFilteredInterviews();
    const listEl = document.getElementById('upcomingInterviewsList');
    if (!listEl) return;

    const todayStr = new Date().toISOString().substring(0, 10);
    const upcoming = interviews.filter(i => i.datum && i.datum >= todayStr);
    upcoming.sort((a, b) => a.datum.localeCompare(b.datum));

    if (upcoming.length === 0) {
        listEl.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-dim); background: var(--bg-base); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <p style="font-size: 0.92rem; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">
                    Nemáte žiadne nadchádzajúce pohovory.
                </p>
                <p style="font-size: 0.8rem;">Vytvorte nový pohovor v sekcii 1 pre naplánovanie termínu.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = upcoming.map(item => {
        const dateParts = item.datum.split(' ');
        const dateVal = dateParts[0];
        const timeVal = dateParts[1] ? dateParts[1].substring(0, 5) : '10:00';
        const badgeClass = `status-${item.vyhodnotenie}`;

        return `
            <div class="interview-schedule-item">
                <div class="schedule-time-box" style="min-width: 110px;">
                    <span class="schedule-time-val" style="font-size: 1.05rem;">${dateVal}</span>
                    <span class="schedule-date-val" style="color: #c4b5fd; font-weight: 700; font-size: 0.82rem;">⏰ ${timeVal}</span>
                </div>

                <div class="schedule-details">
                    <div class="schedule-job-title">${escapeHtml(item.titul_pozicia || 'Pohovor')}</div>
                    <div class="schedule-candidate-name">
                        <strong>${escapeHtml(item.meno_respondenta)}</strong> · ${escapeHtml(item.mail_respondenta)}
                    </div>
                    <div class="schedule-meta-row">
                        <span>👔 HR: <strong>${escapeHtml(item.meno_hr)}</strong></span>
                        <span class="status-badge-enum ${badgeClass}">${escapeHtml(item.vyhodnotenie)}</span>
                        ${item.reminder_sent 
                            ? `<span style="font-size: 0.72rem; color: #10b981; background: rgba(16, 185, 129, 0.15); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3);">🔔 Pripomienka odoslaná</span>` 
                            : `<span style="font-size: 0.72rem; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(56, 189, 248, 0.25);">⏳ Pripomienka čaká (1 deň vopred)</span>`}
                    </div>
                    ${item.dalsie_maily ? `
                    <div style="margin-top: 6px; font-size: 0.76rem; color: #c4b5fd; display: flex; align-items: center; gap: 5px;">
                        <span>👥 <strong>Pozvaní kolegovia:</strong></span>
                        <span>${escapeHtml(item.dalsie_maily)}</span>
                    </div>` : ''}
                </div>

                <div class="schedule-actions">
                    <button type="button" class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.open('${getMeetingUrl(item, { autoJoin: true })}', '_blank')">
                        Vstúpiť
                    </button>
                    <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem; color: #a78bfa;" onclick="openInviteColleagueModal(${item.id})" title="Poslať pozvánku ďalším zamestnancom / teamleaderovi">
                        👥 Pozvať kolegu
                    </button>
                    <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem;" onclick="openInvitationModal(${item.id})">
                        ✉️ Pozvánka
                    </button>
                    <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem; color: #38bdf8;" onclick="sendInterviewReminder(${item.id})" title="Odoslať pripomienku 1 deň pred pohovorom">
                        🔔 Pripomienka
                    </button>
                    <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem; color: #38bdf8;" onclick="openRescheduleModal(${item.id})" title="Presunúť pohovor na iný dátum alebo čas">
                        🗓️ Presunúť
                    </button>
                    ${item.vyhodnotenie !== 'zruseny' ? `
                    <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem; color: #f87171;" onclick="openCancelInterviewModal(${item.id})" title="Zrušiť tento pohovor">
                        ❌ Zrušiť
                    </button>` : ''}
                    <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem;" onclick="downloadInterviewIcs(${item.id})">
                        📅 .ics
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Tlačidlo "+ Naplánovať pohovor na tento deň"
function scheduleForSelectedDay() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (selectedDate < todayStr) {
        alert('Pohovor nie je možné naplánovať do minulosti.\nZvoľte prosím dnešný alebo budúci deň v kalendári.');
        return;
    }

    const dateInput = document.getElementById('intDate');
    if (dateInput) {
        dateInput.value = selectedDate;
    }
    setTimePickerValues('create', 10, 0);

    const createCard = document.getElementById('createInterviewCard');
    if (createCard) {
        createCard.scrollIntoView({ behavior: 'smooth' });
        document.getElementById('intTitle').focus();
    }
}

