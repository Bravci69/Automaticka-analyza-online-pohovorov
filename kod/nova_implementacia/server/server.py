import os
import re
from urllib.parse import unquote
from flask import Flask, request, Response, send_file
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

SESSION = requests.Session()

# Hlavičky, ktoré nesmú byť preposlané klientovi, inak prehliadač zablokuje iframe
BLOCKED_HEADERS = {
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'frame-options',
    'content-encoding',
    'content-length',
    'transfer-encoding',
    'strict-transport-security',
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

INDEX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'index.html')


@app.route('/')
def index():
    return send_file(INDEX_PATH)


@app.route('/proxy', methods=['GET', 'POST'])
def proxy():
    # Získanie celej URL vrátane parametrov
    raw_query = request.full_path.split('?url=', 1)
    if len(raw_query) > 1:
        target_url = raw_query[1].rstrip('?')
    else:
        target_url = request.args.get('url', '')

    target_url = unquote(target_url).strip()
    if not target_url:
        return Response("Chyba: Nie je zadaná žiadna URL adresa.", status=400)

    # Automatické pridanie schémy, ak chýba
    if not target_url.startswith(('http://', 'https://')):
        target_url = 'https://' + target_url

    req_headers = {
        'User-Agent': USER_AGENT,
        'Accept': request.headers.get('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
        'Accept-Language': request.headers.get('Accept-Language', 'sk,cs,en-US;q=0.7,en;q=0.3'),
    }

    try:
        if request.method == 'POST':
            resp = SESSION.post(
                target_url,
                headers=req_headers,
                data=request.get_data(),
                allow_redirects=True,
                timeout=15
            )
        else:
            resp = SESSION.get(
                target_url,
                headers=req_headers,
                allow_redirects=True,
                timeout=15
            )
    except Exception as e:
        error_html = f"""
        <!DOCTYPE html>
        <html lang="sk">
        <head><meta charset="utf-8"><title>Chyba načítania</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; color: #333;">
            <h2 style="color: #e74c3c;">Nepodarilo sa načítať stránku</h2>
            <p><strong>Cieľ:</strong> <a href="{target_url}" target="_blank">{target_url}</a></p>
            <p style="color: #7f8c8d; background: #f8f9fa; padding: 10px; border-radius: 4px; display: inline-block;">
                {str(e)}
            </p>
        </body>
        </html>
        """
        return Response(error_html, status=502, mimetype='text/html')

    content_type = resp.headers.get('Content-Type', '')

    # Odstránenie reštriktívnych hlavičiek (X-Frame-Options, CSP, atď.)
    resp_headers = {}
    for k, v in resp.headers.items():
        if k.lower() not in BLOCKED_HEADERS:
            resp_headers[k] = v

    resp_headers['Access-Control-Allow-Origin'] = '*'

    # Pre HTML obsah upravíme kód a vložíme podporné skripty
    if 'text/html' in content_type.lower():
        # Správne dekódovanie kódovania znakov
        if resp.encoding:
            resp.encoding = resp.apparent_encoding or 'utf-8'

        html = resp.text
        final_url = resp.url

        injection = f"""
        <base href="{final_url}">
        <script>
        (function() {{
            var PROXY_PREFIX = '/proxy?url=';

            // Informovanie nadradeného okna o aktuálnej načítanej URL
            try {{
                if (window.parent && window.parent !== window) {{
                    window.parent.postMessage({{ type: 'PROXY_URL_CHANGE', url: "{final_url}" }}, '*');
                }}
            }} catch(err) {{}}

            // Presmerovanie window.open do aktuálneho iframe
            window.open = function(url) {{
                if (url) window.location.href = PROXY_PREFIX + encodeURIComponent(url);
                return null;
            }};

            // Presmerovanie kliknutí na odkazy cez proxy
            document.addEventListener('click', function(e) {{
                var link = e.target.closest('a');
                if (!link || !link.href) return;
                
                var rawHref = link.getAttribute('href');
                if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) return;
                
                e.preventDefault();
                link.removeAttribute('target');
                window.location.href = PROXY_PREFIX + encodeURIComponent(link.href);
            }}, true);

            // Presmerovanie odoslaní formulárov (napr. vyhľadávania)
            document.addEventListener('submit', function(e) {{
                var form = e.target;
                if (!form) return;
                var method = (form.method || 'GET').toUpperCase();
                var action = form.action || window.location.href;

                if (method === 'GET') {{
                    e.preventDefault();
                    var formData = new FormData(form);
                    var params = new URLSearchParams(formData).toString();
                    var sep = action.indexOf('?') !== -1 ? '&' : '?';
                    var fullUrl = params ? (action + sep + params) : action;
                    window.location.href = PROXY_PREFIX + encodeURIComponent(fullUrl);
                }}
            }}, true);
        }})();
        </script>
        """

        if re.search(r'<head[^>]*>', html, flags=re.IGNORECASE):
            modified_html = re.sub(r'(<head[^>]*>)', r'\1' + injection, html, count=1, flags=re.IGNORECASE)
        else:
            modified_html = injection + html

        return Response(modified_html, status=resp.status_code, headers=resp_headers, mimetype='text/html')

    # Statické súbory a médiá (obrázky, CSS, JS, fonty)
    return Response(resp.content, status=resp.status_code, headers=resp_headers, mimetype=content_type)


if __name__ == '__main__':
    port = 45681
    print(f"\n=======================================================")
    print(f" Proxy Server spustený na: http://0.0.0.0:{port}")
    print(f"=======================================================\n")
    app.run(host='0.0.0.0', port=port, debug=False)
