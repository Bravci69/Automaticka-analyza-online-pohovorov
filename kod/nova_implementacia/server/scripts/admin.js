let currentUser = null;
        let authToken = localStorage.getItem('bp_token') || '';
        let lastSnapshot = null;
        let eventSource = null;

        // Stav kalendára
        const now = new Date();
        let calendarYear = now.getFullYear();
        let calendarMonth = now.getMonth(); // 0 - 11
        const pad = n => String(n).padStart(2, '0');
        let selectedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        let calendarFilter = 'all'; // 'all' alebo 'mine'
        let calendarView = 'month'; // 'month' alebo 'agenda'
        let lastCreatedInterview = null;
        let currentModalInterviewId = null;

        const MONTH_NAMES_SK = [
            'Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún',
            'Júl', 'August', 'September', 'Október', 'November', 'December'
        ];

        // Inicializácia formulára s predvoleným dátumom (zajtra o 10:00)
        window.addEventListener('DOMContentLoaded', () => {
            const tmr = new Date(Date.now() + 24 * 3600 * 1000);
            tmr.setHours(10, 0, 0, 0);
            const dateStr = `${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}T${pad(tmr.getHours())}:${pad(tmr.getMinutes())}`;
            const dtInput = document.getElementById('intDatum');
            if (dtInput) dtInput.value = dateStr;

            initAuth();
            setupRealtimeSync();
        });

        // -------------------------------------------------------------
        // AUTENTIFIKÁCIA A ROLY (SUPERADMIN vs HR_ADMIN)
        // -------------------------------------------------------------

        async function initAuth() {
            if (authToken) {
                try {
                    const res = await fetch('/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${authToken}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        currentUser = data.user;
                        renderAuthHeader();
                        applyRolePermissions();
                        loadLiveDb();
                        return;
                    } else {
                        // Relácia po 30 dňoch vypršala
                        authToken = '';
                        localStorage.removeItem('bp_token');
                        currentUser = null;
                    }
                } catch (e) {
                    console.warn('Overenie zlyhalo:', e);
                }
            }
            renderAuthHeader();
            applyRolePermissions();
            openLoginModal();
            loadLiveDb();
        }

        function renderAuthHeader() {
            const container = document.getElementById('authContainer');
            if (currentUser) {
                const initials = (currentUser.meno[0] || 'A') + (currentUser.priezvisko[0] || 'D');
                const isSuper = currentUser.ures_tag === 'SUPERADMIN';
                const roleColor = isSuper ? '#818cf8' : '#34d399';
                container.innerHTML = `
                    <div class="user-pill">
                        <div class="user-avatar" style="background: ${isSuper ? 'linear-gradient(135deg, #6366f1, #a855f7)' : 'linear-gradient(135deg, #10b981, #06b6d4)'}">${escapeHtml(initials)}</div>
                        <div class="user-details">
                            <span class="user-name">${escapeHtml(currentUser.meno)} ${escapeHtml(currentUser.priezvisko)}</span>
                            <span class="user-role-badge" style="color: ${roleColor};">${escapeHtml(currentUser.ures_tag)}</span>
                        </div>
                        <button class="btn-logout" onclick="doLogout()" title="Odhlásiť sa">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                <polyline points="16 17 21 12 16 7"/>
                                <line x1="21" y1="12" x2="9" y2="12"/>
                            </svg>
                        </button>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <button class="btn-primary" onclick="openLoginModal()" style="padding: 7px 14px; font-size: 0.82rem;">
                        Prihlásiť sa
                    </button>
                `;
            }
        }

        // KĽÚČOVÁ FUNKCIA: Dynamické riadenie prístupu podľa roly
        function applyRolePermissions() {
            const isSuper = currentUser && currentUser.ures_tag === 'SUPERADMIN';
            const isHr = currentUser && currentUser.ures_tag !== 'SUPERADMIN';

            // 1. Zobrazenie / Skrytie sekcie 2: Vytvorenie používateľov
            const userCard = document.getElementById('userAdminCard');
            if (userCard) {
                userCard.style.display = isSuper ? 'block' : 'none';
            }

            // 2. Zobrazenie / Skrytie sekcie 3: Real-Time DB Explorer
            const dbCard = document.getElementById('dbExplorerCard');
            if (dbCard) {
                dbCard.style.display = isSuper ? 'block' : 'none';
            }

            // 3. Export JSON v hlavičke (len pre Superadmina)
            const exportBtn = document.getElementById('btnExportDbJson');
            if (exportBtn) {
                exportBtn.style.display = isSuper ? 'inline-flex' : 'none';
            }

            // 4. Titulky a popis stránky
            const pageTitle = document.getElementById('pageHeaderTitle');
            const pageDesc = document.getElementById('pageHeaderDesc');
            if (isHr) {
                if (pageTitle) pageTitle.textContent = 'HR Portál · Moje pohovory a kalendár';
                if (pageDesc) pageDesc.textContent = 'Prehľad naplánovaných pohovorov, interaktívny kalendár termínov a odosielanie pozvánok.';
            } else {
                if (pageTitle) pageTitle.textContent = 'Správa pohovorov a administrácia';
                if (pageDesc) pageDesc.textContent = 'Real-time prístup k SQLite databáze, registrácia kandidátov a správa HR rolí.';
            }

            // 5. Priradenie HR vo formulári na vytvorenie pohovoru:
            // - SUPERADMIN: vidí rozbaľovací zoznam a môže zvoliť kohokoľvek
            // - HR_ADMIN: pole je zamknuté na prihláseného HR, nemôže ho zmeniť!
            const selectHr = document.getElementById('intHrSelect');
            const lockedHr = document.getElementById('hrLockedDisplay');
            const lockedName = document.getElementById('hrLockedName');

            if (isSuper) {
                if (selectHr) selectHr.style.display = 'block';
                if (lockedHr) lockedHr.style.display = 'none';
            } else if (currentUser) {
                if (selectHr) selectHr.style.display = 'none';
                if (lockedHr) lockedHr.style.display = 'block';
                if (lockedName) lockedName.textContent = `${currentUser.meno} ${currentUser.priezvisko} (@${currentUser.username})`;
            }

            // 6. Kalendárový filter pre Superadmina (Všetky pohovory vs Moje pohovory)
            const superFilter = document.getElementById('calendarSuperadminFilter');
            if (superFilter) {
                superFilter.style.display = isSuper ? 'flex' : 'none';
            }

            const calTitle = document.getElementById('calendarCardTitle');
            if (calTitle) {
                calTitle.textContent = isHr ? 'Môj interaktívny kalendár pohovorov' : 'Interaktívny kalendár pohovorov';
            }
        }

        function openLoginModal() {
            document.getElementById('loginModal').classList.add('active');
        }

        function closeLoginModal() {
            document.getElementById('loginModal').classList.remove('active');
        }

        async function doLogin() {
            const u = document.getElementById('loginUser').value.trim();
            const p = document.getElementById('loginPass').value;
            const errDiv = document.getElementById('loginError');
            errDiv.style.display = 'none';

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });

                const data = await res.json();
                if (!res.ok) {
                    errDiv.textContent = data.error || 'Prihlásenie zlyhalo';
                    errDiv.style.display = 'block';
                    return;
                }

                authToken = data.token;
                localStorage.setItem('bp_token', authToken);
                currentUser = data.user;
                document.getElementById('loginPass').value = '';
                closeLoginModal();
                renderAuthHeader();
                applyRolePermissions();
                loadLiveDb();
            } catch (err) {
                errDiv.textContent = 'Chyba servera: ' + err.message;
                errDiv.style.display = 'block';
            }
        }

        async function doLogout() {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
            } catch (e) {}

            authToken = '';
            localStorage.removeItem('bp_token');
            currentUser = null;
            renderAuthHeader();
            applyRolePermissions();
            openLoginModal();
        }

        // -------------------------------------------------------------
        // REAL-TIME SYNCHRONIZÁCIA (SSE + Polling)
        // -------------------------------------------------------------

        function setupRealtimeSync() {
            if (window.EventSource) {
                try {
                    eventSource = new EventSource('/api/db/stream');
                    eventSource.onopen = () => {
                        updateLiveStatus(true, 'Živá synchronizácia: Pripojené');
                    };
                    eventSource.onmessage = (e) => {
                        loadLiveDb();
                    };
                    eventSource.onerror = () => {
                        updateLiveStatus(false, 'SSE odpájané, beží interval polling');
                    };
                } catch (e) {
                    console.warn('SSE nie je podporované:', e);
                }
            }

            setInterval(loadLiveDb, 3000);
        }

        function updateLiveStatus(active, text) {
            const dot = document.getElementById('liveDot');
            const txt = document.getElementById('liveText');
            if (dot) dot.style.background = active ? 'var(--accent-green)' : 'var(--accent-amber)';
            if (dot) dot.style.boxShadow = active ? '0 0 10px var(--accent-green)' : 'none';
            if (txt) txt.textContent = text;
        }

        function forceSync() {
            loadLiveDb();
        }

        // -------------------------------------------------------------
        // NAČÍTANIE A VYKRESLENIE ŽIVEJ DATABÁZY
        // -------------------------------------------------------------

        async function loadLiveDb() {
            try {
                const res = await fetch('/api/db/live');
                if (!res.ok) return;
                const data = await res.json();
                lastSnapshot = data;
                renderDatabase(data);
            } catch (e) {
                console.error('Chyba načítania live DB:', e);
            }
        }

        function renderDatabase(snapshot) {
            const { tables, stats } = snapshot;
            const isSuper = currentUser && currentUser.ures_tag === 'SUPERADMIN';
            const isHr = currentUser && currentUser.ures_tag !== 'SUPERADMIN';

            // Zabezpečenie správneho zobrazenia prvkov podľa roly
            applyRolePermissions();

            // 1. Štatistiky prispôsobené podľa roly
            if (isHr && currentUser) {
                // Pre HR personalistu zobrazujeme jeho vlastné štatistiky
                const myInterviews = tables.interview.filter(i => i.hr_id === currentUser.id);
                const todayStr = new Date().toISOString().substring(0, 10);
                const myToday = myInterviews.filter(i => i.datum && i.datum.startsWith(todayStr)).length;
                const myPostupili = myInterviews.filter(i => i.vyhodnotenie === 'postupil').length;
                const myNepostupili = myInterviews.filter(i => i.vyhodnotenie === 'nepostupil').length;

                document.getElementById('statUsers').textContent = myInterviews.length;
                document.getElementById('statLabelUsers').textContent = 'Moje pohovory';

                document.getElementById('statHr').textContent = myToday;
                document.getElementById('statLabelHr').textContent = 'Dnes naplánované';

                document.getElementById('statInterviews').textContent = myInterviews.length;
                document.getElementById('statLabelInterviews').textContent = 'Celkovo';

                document.getElementById('statPostupili').textContent = myPostupili;
                document.getElementById('statNepostupili').textContent = myNepostupili;
            } else {
                // Pre Superadmina zobrazujeme kompletné štatistiky celého systému
                document.getElementById('statUsers').textContent = stats.totalUsers;
                document.getElementById('statLabelUsers').textContent = 'Používatelia';

                document.getElementById('statHr').textContent = stats.totalHrAdmins;
                document.getElementById('statLabelHr').textContent = 'HR Administrátori';

                document.getElementById('statInterviews').textContent = stats.totalInterviews;
                document.getElementById('statLabelInterviews').textContent = 'Pohovory celkovo';

                document.getElementById('statPostupili').textContent = stats.postupili;
                document.getElementById('statNepostupili').textContent = stats.nepostupili;
            }

            const dbMeta = document.getElementById('dbStatsMeta');
            if (dbMeta) {
                dbMeta.textContent = `DB: ${stats.dbSize} · Aktualizované: ${new Date().toLocaleTimeString('sk-SK')}`;
            }

            // 2. Naplnenie výberu HR personalistov pre Superadmina
            populateHrSelect(tables.users);

            // 3. Vykreslenie INTERAKTÍVNEHO KALENDÁRA
            renderCalendar();

            // 4. Vykreslenie DB Explorera (len ak je prihlásený Superadmin)
            if (isSuper) {
                document.getElementById('cntInterview').textContent = tables.interview.length;
                document.getElementById('cntUsers').textContent = tables.users.length;
                document.getElementById('cntHrAdmin').textContent = tables.hr_admin.length;
                document.getElementById('cntVyhodnotenie').textContent = tables.vyhodnotenie.length;
                document.getElementById('cntAnalyza').textContent = tables.interview_analyza.length;
                document.getElementById('cntLogs').textContent = tables.audit_logs.length;

                renderInterviewTable(tables.interview, tables.vyhodnotenie);
                renderUsersTable(tables.users);
                renderSuperadminUsers(tables.users);
                renderHrAdminTable(tables.hr_admin);
                renderVyhodnotenieTable(tables.vyhodnotenie);
                renderAnalyzaTable(tables.interview_analyza);
                renderAuditLogsTable(tables.audit_logs);
            }
        }

        function populateHrSelect(users) {
            const select = document.getElementById('intHrSelect');
            if (!select) return;
            const currentVal = select.value;

            // Zoznam používateľov s rolou HR_ADMIN alebo SUPERADMIN
            const hrUsers = users.filter(u => u.ures_tag.includes('HR') || u.ures_tag.includes('ADMIN'));
            select.innerHTML = hrUsers.map(u => `
                <option value="${u.id}">${escapeHtml(u.meno)} ${escapeHtml(u.priezvisko)} (${escapeHtml(u.ures_tag)})</option>
            `).join('');

            if (currentVal) select.value = currentVal;
            else if (currentUser && select.querySelector(`option[value="${currentUser.id}"]`)) {
                select.value = currentUser.id;
            }
        }

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
                        chipsHtml += `<div style="font-size: 0.65rem; color: #a5b4fc; font-weight: 700; text-align: right;">+${dayInterviews.length - 3} ďalšie</div>`;
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
                                <span>🔑 Miestnosť: <code class="code-pill">${escapeHtml(item.room_id)}</code></span>
                                <span style="display: flex; align-items: center; gap: 4px;">
                                    <span>Hodnotenie:</span>
                                    <select class="select-enum-inline ${badgeClass}" onchange="changeEvaluation(${item.id}, this.value)">
                                        ${enumOptions}
                                    </select>
                                </span>
                            </div>
                        </div>

                        <div class="schedule-actions">
                            <button type="button" class="btn-primary" style="padding: 7px 14px; font-size: 0.82rem;" onclick="window.open('${item.link_meeting}', '_blank')" title="Otvoriť videohovor">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/>
                                    <line x1="10" x2="21" y1="14" y2="3"/>
                                </svg>
                                Vstúpiť
                            </button>

                            <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem;" onclick="copyAnyLink('${item.link_meeting}')" title="Kopírovať odkaz pre uchádzača">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                                </svg>
                                Link
                            </button>

                            <button type="button" class="btn-secondary" style="padding: 7px 10px; font-size: 0.82rem; color: #34d399;" onclick="openInvitationModal(${item.id})" title="Zobraziť odoslanú e-mailovú pozvánku a termín">
                                ✉️ Pozvánka
                            </button>

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
                            <span class="schedule-date-val" style="color: #a5b4fc; font-weight: 700; font-size: 0.82rem;">⏰ ${timeVal}</span>
                        </div>

                        <div class="schedule-details">
                            <div class="schedule-job-title">${escapeHtml(item.titul_pozicia || 'Pohovor')}</div>
                            <div class="schedule-candidate-name">
                                <strong>${escapeHtml(item.meno_respondenta)}</strong> · ${escapeHtml(item.mail_respondenta)}
                            </div>
                            <div class="schedule-meta-row">
                                <span>👔 HR: <strong>${escapeHtml(item.meno_hr)}</strong></span>
                                <span class="status-badge-enum ${badgeClass}">${escapeHtml(item.vyhodnotenie)}</span>
                            </div>
                        </div>

                        <div class="schedule-actions">
                            <button type="button" class="btn-primary" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.open('${item.link_meeting}', '_blank')">
                                Vstúpiť
                            </button>
                            <button type="button" class="btn-secondary" style="padding: 6px 10px; font-size: 0.8rem;" onclick="openInvitationModal(${item.id})">
                                ✉️ Pozvánka
                            </button>
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
            const dtInput = document.getElementById('intDatum');
            if (dtInput) {
                dtInput.value = `${selectedDate}T10:00`;
            }
            const createCard = document.getElementById('createInterviewCard');
            if (createCard) {
                createCard.scrollIntoView({ behavior: 'smooth' });
                document.getElementById('intTitle').focus();
            }
        }

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
                    alert('✅ Pozvánka na pohovor bola úspešne opätovne odoslaná uchádzačovi!');
                } else {
                    alert('Chyba pri odosielaní: ' + (data.error || 'Neznáma chyba'));
                }
            } catch (e) {
                alert('Chyba komunikácie: ' + e.message);
            }
        }

        // -------------------------------------------------------------
        // VYKRESLENIE TABULIEK (PRE SUPERADMINA)
        // -------------------------------------------------------------

        // Vykreslenie tabuľky interview v DB Exploreri
        function renderInterviewTable(list, enumList) {
            const tbody = document.getElementById('tbodyInterview');
            if (!tbody) return;
            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="9" class="empty-view">Žiadne pohovory v databáze.</td></tr>`;
                return;
            }

            tbody.innerHTML = list.map(item => {
                const enumOptions = enumList.map(ev => `
                    <option value="${ev.kod}" ${ev.kod === item.vyhodnotenie ? 'selected' : ''}>
                        ${ev.nazov}
                    </option>
                `).join('');

                const badgeClass = `status-${item.vyhodnotenie}`;

                return `
                    <tr>
                        <td><span class="code-pill">#${item.id}</span></td>
                        <td style="font-weight: 700; color: #fff;">${escapeHtml(item.titul_pozicia || 'Pohovor')}</td>
                        <td>
                            <div style="font-weight: 600;">${escapeHtml(item.meno_respondenta)}</div>
                        </td>
                        <td><span style="color: var(--text-muted); font-size: 0.8rem;">${escapeHtml(item.mail_respondenta)}</span></td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span class="badge-role-tag" style="font-size: 0.65rem;">ID:${item.hr_id}</span>
                                <span>${escapeHtml(item.meno_hr)}</span>
                            </div>
                        </td>
                        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #a5b4fc;">${escapeHtml(item.datum)}</td>
                        <td><span class="code-pill">${escapeHtml(item.room_id)}</span></td>
                        <td>
                            <select class="select-enum-inline ${badgeClass}" onchange="changeEvaluation(${item.id}, this.value)">
                                ${enumOptions}
                            </select>
                        </td>
                        <td style="text-align: right; white-space: nowrap;">
                            <button class="btn-secondary" style="padding: 5px 8px;" onclick="copyAnyLink('${item.link_meeting}')" title="Kopírovať odkaz pre uchádzača">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                                </svg>
                                Link
                            </button>
                            <button class="btn-secondary" style="padding: 5px 8px;" onclick="window.open('${item.link_meeting}', '_blank')" title="Vstúpiť do videohovoru">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/>
                                    <line x1="10" x2="21" y1="14" y2="3"/>
                                </svg>
                                Vstúpiť
                            </button>
                            <button class="btn-secondary" style="padding: 5px 8px; color: #34d399;" onclick="openInvitationModal(${item.id})" title="Pozvánka">
                                ✉️
                            </button>
                            <button class="btn-secondary" style="padding: 5px 8px; color: var(--accent-red);" onclick="deleteInterview(${item.id})" title="Zmazať pohovor">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M3 6h18"/>
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                </svg>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Vykreslenie tabuľky users (DB Explorer záložka)
        function renderUsersTable(list) {
            const tbody = document.getElementById('tbodyUsers');
            if (!tbody) return;
            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="empty-view">Žiadni používatelia v databáze.</td></tr>`;
                return;
            }

            const isSuperAdmin = currentUser && currentUser.ures_tag === 'SUPERADMIN';
            const superadminCount = list.filter(x => x.ures_tag === 'SUPERADMIN').length;

            tbody.innerHTML = list.map(u => {
                const isTargetSuper = u.ures_tag === 'SUPERADMIN';
                const roleBadge = isTargetSuper 
                    ? `<span class="badge-role-tag" style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border-color: rgba(99, 102, 241, 0.4);">${u.ures_tag}</span>`
                    : `<span class="badge-role-tag" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.4);">${u.ures_tag}</span>`;

                const shortHash = u.password_hash.substring(0, 16) + '...';

                let actionHtml = '';
                if (currentUser && (currentUser.id === u.id || currentUser.username === u.username)) {
                    actionHtml = `<span style="font-size: 0.74rem; color: #a5b4fc; font-weight: 600;">Váš účet</span>`;
                } else if (isTargetSuper && superadminCount <= 1) {
                    actionHtml = `<span style="font-size: 0.74rem; color: var(--text-dim); font-weight: 600;">Posledný Superadmin</span>`;
                } else if (isSuperAdmin) {
                    const btnLabel = isTargetSuper ? 'Zmazať Superadmina' : 'Zmazať';
                    actionHtml = `<button class="btn-secondary" style="padding: 4px 8px; color: var(--accent-red); border-color: rgba(239, 68, 68, 0.4);" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(u.ures_tag)}')">${btnLabel}</button>`;
                } else {
                    actionHtml = `<span style="font-size: 0.74rem; color: var(--text-dim);">-</span>`;
                }

                return `
                    <tr>
                        <td><span class="code-pill">#${u.id}</span></td>
                        <td style="font-weight: 700; color: #fff;">${escapeHtml(u.username)}</td>
                        <td>${escapeHtml(u.meno)} ${escapeHtml(u.priezvisko)}</td>
                        <td style="color: var(--text-muted); font-size: 0.82rem;">${escapeHtml(u.mail)}</td>
                        <td>${roleBadge}</td>
                        <td>
                            <button class="hash-pill" onclick="showHashModal('${u.password_hash}', '${u.password_salt}')" title="Kliknite pre zobrazenie plného scrypt hashu a soli">
                                🔒 scrypt: ${shortHash}
                            </button>
                        </td>
                        <td style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(u.created_at)}</td>
                        <td style="text-align: right;">${actionHtml}</td>
                    </tr>
                `;
            }).join('');
        }

        // Vykreslenie zoznamu pre správu a odstraňovanie používateľov (pre Superadmina)
        function renderSuperadminUsers(users) {
            const tbody = document.getElementById('tbodySuperadminUsers');
            if (!tbody) return;

            const isSuperAdmin = currentUser && currentUser.ures_tag === 'SUPERADMIN';
            const superSection = document.getElementById('superadminUsersSection');

            if (!isSuperAdmin) {
                if (superSection) superSection.style.display = 'none';
                return;
            } else {
                if (superSection) superSection.style.display = 'block';
            }

            if (!users || users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="empty-view">Žiadni používatelia v databáze.</td></tr>`;
                return;
            }

            const superadminCount = users.filter(x => x.ures_tag === 'SUPERADMIN').length;

            tbody.innerHTML = users.map(u => {
                const isTargetSuper = u.ures_tag === 'SUPERADMIN';
                const isSelf = currentUser && (currentUser.id === u.id || currentUser.username === u.username);

                const roleBadge = isTargetSuper 
                    ? `<span class="badge-role-tag" style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border-color: rgba(99, 102, 241, 0.4);">${escapeHtml(u.ures_tag)}</span>`
                    : `<span class="badge-role-tag" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.4);">${escapeHtml(u.ures_tag)}</span>`;

                let actionCell = '';
                if (isSelf) {
                    actionCell = `<span style="font-size: 0.74rem; color: #a5b4fc; font-weight: 600;">👤 Váš prihlásený účet</span>`;
                } else if (isTargetSuper && superadminCount <= 1) {
                    actionCell = `<span style="font-size: 0.74rem; color: var(--text-dim); font-weight: 600;" title="V systéme musí zostať aspoň 1 Superadmin">🔒 Posledný Superadmin</span>`;
                } else {
                    const btnLabel = isTargetSuper ? 'Odstrániť Superadmina' : 'Odstrániť z DB';
                    const btnBg = isTargetSuper ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)';
                    actionCell = `
                        <button class="btn-secondary" style="color: var(--accent-red); border-color: rgba(239, 68, 68, 0.45); padding: 5px 12px; font-size: 0.8rem; background: ${btnBg};" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(u.ures_tag)}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                            ${btnLabel}
                        </button>
                    `;
                }

                return `
                    <tr>
                        <td><span class="code-pill">#${u.id}</span></td>
                        <td style="font-weight: 700; color: #fff;">${escapeHtml(u.username)}</td>
                        <td>${escapeHtml(u.meno)} ${escapeHtml(u.priezvisko)}</td>
                        <td style="color: var(--text-muted); font-size: 0.82rem;">${escapeHtml(u.mail)}</td>
                        <td>${roleBadge}</td>
                        <td><span class="code-pill" style="color: #38bdf8;">${u.pocet_interviews || 0}</span></td>
                        <td style="text-align: right;">${actionCell}</td>
                    </tr>
                `;
            }).join('');
        }

        // Vykreslenie tabuľky hr_admin
        function renderHrAdminTable(list) {
            const tbody = document.getElementById('tbodyHrAdmin');
            if (!tbody) return;
            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="empty-view">Žiadne záznamy v tabuľke hr_admin.</td></tr>`;
                return;
            }

            tbody.innerHTML = list.map(item => `
                <tr>
                    <td><span class="code-pill">#${item.id}</span></td>
                    <td><span class="code-pill" style="color: #38bdf8;">FK: users(#${item.user_id})</span></td>
                    <td style="font-weight: 700; color: #fff;">${escapeHtml(item.meno)} ${escapeHtml(item.priezvisko)}</td>
                    <td><span style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; color: #a5b4fc;">@${escapeHtml(item.username)}</span></td>
                    <td><span class="badge-role-tag">${escapeHtml(item.ures_tag)}</span></td>
                    <td>
                        <span style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: rgba(99, 102, 241, 0.15); color: #818cf8; font-weight: 700; font-size: 0.82rem;">
                            ${item.pocet_interviews}
                        </span>
                    </td>
                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: ${item.datum_interview ? '#34d399' : 'var(--text-dim)'};">
                        ${item.datum_interview ? escapeHtml(item.datum_interview) : 'Žiadny naplánovaný'}
                    </td>
                    <td style="font-size: 0.76rem; color: var(--text-dim);">${escapeHtml(item.updated_at)}</td>
                </tr>
            `).join('');
        }

        // Vykreslenie enum vyhodnotenia
        function renderVyhodnotenieTable(list) {
            const tbody = document.getElementById('tbodyVyhodnotenie');
            if (!tbody) return;
            tbody.innerHTML = list.map(item => `
                <tr>
                    <td><span class="code-pill" style="color: #fff; font-weight: 700;">'${escapeHtml(item.kod)}'</span></td>
                    <td style="font-weight: 600;">${escapeHtml(item.nazov)}</td>
                    <td>
                        <span class="status-badge-enum status-${item.kod}">
                            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${item.farba};"></span>
                            ${item.nazov}
                        </span>
                    </td>
                    <td style="color: var(--text-muted); font-size: 0.84rem;">${escapeHtml(item.popis)}</td>
                </tr>
            `).join('');
        }

        // Vykreslenie interview_analyza
        function renderAnalyzaTable(list) {
            const tbody = document.getElementById('tbodyAnalyza');
            if (!tbody) return;
            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="empty-view">Zatiaľ žiadne dáta multimodálnej analýzy.</td></tr>`;
                return;
            }

            tbody.innerHTML = list.map(item => `
                <tr>
                    <td><span class="code-pill">#${item.id}</span></td>
                    <td><span class="code-pill" style="color: #38bdf8;">FK: interview(#${item.interview_id})</span></td>
                    <td style="font-weight: 700; color: #34d399;">${item.skore_pozornosti ? item.skore_pozornosti.toFixed(1) + '%' : '0.0%'}</td>
                    <td><span class="badge-role-tag" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">${escapeHtml(item.dominantna_emocia || 'neutrálna')}</span></td>
                    <td>${item.pocet_vyplnovych_slov || 0}</td>
                    <td><span class="status-badge-enum status-rozpracovane">${escapeHtml(item.stav_analyzy)}</span></td>
                    <td style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(item.vytvorene)}</td>
                </tr>
            `).join('');
        }

        // Vykreslenie audit_logs
        function renderAuditLogsTable(list) {
            const tbody = document.getElementById('tbodyAuditLogs');
            if (!tbody) return;
            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-view">Audit log je prázdny.</td></tr>`;
                return;
            }

            tbody.innerHTML = list.map(item => `
                <tr>
                    <td><span class="code-pill">#${item.id}</span></td>
                    <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(item.cas)}</td>
                    <td><span class="badge-role-tag" style="font-size: 0.7rem;">${escapeHtml(item.akcia)}</span></td>
                    <td style="font-weight: 600; color: #a5b4fc;">${escapeHtml(item.autor)}</td>
                    <td style="color: var(--text-muted); font-size: 0.82rem;">${escapeHtml(item.detaily)}</td>
                </tr>
            `).join('');
        }

        // -------------------------------------------------------------
        // AKCIE: Vytvorenie pohovoru, vytvorenie usera, zmena vyhodnotenia
        // -------------------------------------------------------------

        async function createInterview() {
            const title = document.getElementById('intTitle').value.trim();
            const respondentName = document.getElementById('intRespondentName').value.trim();
            const respondentEmail = document.getElementById('intRespondentEmail').value.trim();
            const datum = document.getElementById('intDatum').value.replace('T', ' ');
            const vyhodnotenie = document.getElementById('intVyhodnotenie').value;
            const poznamky = document.getElementById('intPoznamky').value.trim();
            let customRoom = document.getElementById('intCustomRoom').value.trim();

            const isSuper = currentUser && currentUser.ures_tag === 'SUPERADMIN';
            let hrId;
            if (isSuper) {
                hrId = parseInt(document.getElementById('intHrSelect').value);
            } else if (currentUser) {
                hrId = currentUser.id; // Pre HR sa automaticky nastavuje jeho vlastné ID
            }

            if (customRoom) {
                customRoom = customRoom.toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-');
            }

            try {
                const res = await fetch('/api/interviews', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        titul_pozicia: title,
                        meno_respondenta: respondentName,
                        mail_respondenta: respondentEmail,
                        hr_id: hrId,
                        datum: datum,
                        vyhodnotenie: vyhodnotenie,
                        poznamky: poznamky,
                        roomId: customRoom || undefined
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    alert('Chyba: ' + (data.error || 'Nepodarilo sa vytvoriť pohovor'));
                    return;
                }

                lastCreatedInterview = data;

                // Zobrazenie výsledkového panelu
                const panel = document.getElementById('resultPanel');
                const urlInput = document.getElementById('resultUrl');
                const meta = document.getElementById('resultMeta');
                const alertText = document.getElementById('invitationAlertText');

                panel.classList.add('active');
                urlInput.value = data.meetingUrl;
                meta.textContent = `Miestnosť: ${data.room_id} · Respondent: ${respondentName} · HR: ${data.hrName || ''}`;
                document.getElementById('copyBtnText').textContent = 'Kopírovať odkaz';

                if (alertText) {
                    alertText.innerHTML = `✉️ Automatická pozvánka s presným časom (<strong>${data.datum}</strong>) bola odoslaná na e-mail: <strong>${escapeHtml(respondentEmail)}</strong>.`;
                }

                // Reset formulára
                document.getElementById('intTitle').value = '';
                document.getElementById('intRespondentName').value = '';
                document.getElementById('intRespondentEmail').value = '';
                document.getElementById('intPoznamky').value = '';
                document.getElementById('intCustomRoom').value = '';

                // Aktualizácia dát a kalendára
                loadLiveDb();
            } catch (err) {
                alert('Chyba pri ukladaní do DB: ' + err.message);
            }
        }

        async function createNewUser() {
            const role = document.getElementById('usrRole').value;
            const username = document.getElementById('usrUsername').value.trim();
            const password = document.getElementById('usrPassword').value;
            const meno = document.getElementById('usrMeno').value.trim();
            const priezvisko = document.getElementById('usrPriezvisko').value.trim();
            const mail = document.getElementById('usrMail').value.trim();

            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        username,
                        password,
                        meno,
                        priezvisko,
                        mail,
                        ures_tag: role
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    alert('Chyba: ' + (data.error || 'Nepodarilo sa vytvoriť používateľa'));
                    return;
                }

                alert(`✅ Používateľ "${username}" (${role}) bol úspešne vytvorený a heslo zahashované v DB!`);

                document.getElementById('usrUsername').value = '';
                document.getElementById('usrPassword').value = '';
                document.getElementById('usrMeno').value = '';
                document.getElementById('usrPriezvisko').value = '';
                document.getElementById('usrMail').value = '';

                loadLiveDb();
            } catch (err) {
                alert('Chyba servera: ' + err.message);
            }
        }

        async function changeEvaluation(interviewId, newStatus) {
            try {
                const res = await fetch(`/api/interviews/${interviewId}/vyhodnotenie`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ vyhodnotenie: newStatus })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert('Chyba pri zmene vyhodnotenia: ' + (err.error || 'Neznáma chyba'));
                }
                loadLiveDb();
            } catch (e) {
                alert('Chyba komunikácie: ' + e.message);
            }
        }

        async function deleteInterview(id) {
            if (!confirm(`Naozaj chcete natrvalo zmazať pohovor #${id} z databázy?`)) return;
            try {
                await fetch(`/api/interviews/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                loadLiveDb();
            } catch (e) {
                alert('Chyba: ' + e.message);
            }
        }

        async function deleteUser(userId, username, role) {
            const isSuper = role === 'SUPERADMIN';
            const warningMsg = isSuper 
                ? `⚠️ POZOR: Používateľ "${username}" (ID: #${userId}) má rolu SUPERADMIN!\n\nNaozaj chcete tohto Superadmina natrvalo odstrániť z databázy?\n(Prípadné dohodnuté pohovory budú bezpečne prevedené pod vašu správu.)`
                : `Naozaj chcete ako SUPERADMIN natrvalo odstrániť používateľa "${username}" (ID: #${userId}) z databázy?\n\n(Prípadné dohodnuté pohovory tohto používateľa budú automaticky prevedené pod vašu správu.)`;

            if (!confirm(warningMsg)) return;

            try {
                const res = await fetch(`/api/users/${userId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const data = await res.json();
                if (!res.ok) {
                    alert('Chyba pri odstraňovaní: ' + (data.error || 'Nepodarilo sa odstrániť používateľa'));
                    return;
                }
                loadLiveDb();
            } catch (e) {
                alert('Chyba komunikácie so serverom: ' + e.message);
            }
        }

        // -------------------------------------------------------------
        // POMOCNÉ FUNKCIE (UI, Tabs, Modals, Clipboard)
        // -------------------------------------------------------------

        function switchDbTab(tabName) {
            const tabs = document.querySelectorAll('.tab-btn');
            const panes = document.querySelectorAll('.tab-pane');

            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            const targetPane = document.getElementById(`pane-${tabName}`);
            if (targetPane) targetPane.classList.add('active');

            const activeBtn = Array.from(tabs).find(b => b.getAttribute('onclick')?.includes(tabName));
            if (activeBtn) activeBtn.classList.add('active');
        }

        function showHashModal(hash, salt) {
            document.getElementById('modalHashVal').textContent = hash;
            document.getElementById('modalSaltVal').textContent = salt;
            document.getElementById('hashModal').classList.add('active');
        }

        function closeHashModal() {
            document.getElementById('hashModal').classList.remove('active');
        }

        async function copyInterviewLink() {
            const input = document.getElementById('resultUrl');
            try {
                await navigator.clipboard.writeText(input.value);
                const txt = document.getElementById('copyBtnText');
                txt.textContent = 'Skopírované do schránky!';
                setTimeout(() => txt.textContent = 'Kopírovať odkaz', 2000);
            } catch (e) {
                input.select();
                document.execCommand('copy');
            }
        }

        function openDirectMeeting() {
            const url = document.getElementById('resultUrl').value;
            if (url) window.open(url, '_blank');
        }

        async function copyAnyLink(link) {
            try {
                await navigator.clipboard.writeText(link);
                alert('Odkaz na stretnutie bol skopírovaný do schránky.');
            } catch (e) {
                prompt('Skopírujte odkaz ručne:', link);
            }
        }

        function exportDbJson() {
            if (!lastSnapshot) {
                alert('Dáta databázy sa ešte nenačítali.');
                return;
            }
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lastSnapshot, null, 2));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", `pohovory_db_dump_${new Date().toISOString().slice(0, 10)}.json`);
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();
        }

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }
