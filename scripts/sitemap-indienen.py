"""Dient de sitemap van beste-kattenvoer.nl (opnieuw) in bij Google Search Console.

Draait automatisch na elke push naar main (zie .github/workflows/sitemap-indienen.yml),
of handmatig. Nodig: secret GSC_CREDENTIALS (JSON van een serviceaccount dat in Search
Console de rol 'Volledig' of 'Eigenaar' heeft op de property hieronder).
"""
import json
import os
import re
import sys
import urllib.request

SITE = os.environ.get("GSC_SITE", "sc-domain:beste-kattenvoer.nl")
SITEMAP = "https://beste-kattenvoer.nl/sitemap.xml"


def main() -> None:
    creds_json = os.environ.get("GSC_CREDENTIALS", "").strip()
    if not creds_json:
        print("Geen GSC_CREDENTIALS ingesteld: sitemap niet ingediend. Voeg het secret toe om dit automatisch te laten gebeuren.")
        return
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    live = urllib.request.urlopen(SITEMAP, timeout=30).read().decode()
    print(f"Live sitemap: {len(re.findall(r'<loc>', live))} URL's")
    creds = service_account.Credentials.from_service_account_info(
        json.loads(creds_json), scopes=["https://www.googleapis.com/auth/webmasters"])
    svc = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    svc.sitemaps().submit(siteUrl=SITE, feedpath=SITEMAP).execute()
    print("Ingediend:", SITEMAP)
    for s in svc.sitemaps().list(siteUrl=SITE).execute().get("sitemap", []):
        print(s["path"], "laatst ingediend:", s.get("lastSubmitted"), "fouten:", s.get("errors"), "waarschuwingen:", s.get("warnings"))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # nooit de hele pipeline laten falen op Search Console
        print("Indienen mislukt:", e, file=sys.stderr)
        sys.exit(1)
