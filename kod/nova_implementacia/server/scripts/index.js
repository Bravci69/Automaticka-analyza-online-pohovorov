const input = document.getElementById('meetingCodeInput');

        function joinMeeting() {
            let val = input.value.trim();
            if (!val) {
                input.focus();
                input.style.borderColor = '#ef4444';
                setTimeout(() => input.style.borderColor = '', 1500);
                return;
            }

            if (val.includes('/meeting/')) {
                val = val.split('/meeting/').pop();
            }

            val = val.replace(/[^a-zA-Z0-9\-]/g, '');
            window.location.href = '/meeting/' + encodeURIComponent(val);
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') joinMeeting();
        });

        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code') || urlParams.get('meeting');
        if (code) {
            input.value = code;
        }
