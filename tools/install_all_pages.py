#!/usr/bin/env python3
"""Bright Light Church sitewide CMS installer.
Run in a LOCAL COPY of your GitHub repo: python tools/install_all_pages.py
Does not modify membership tools or forms. Makes .bak backups and is repeatable.
"""
import html
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEMBERSHIP = ROOT / 'membership'
PAGE_LABELS = {
    'index':'Home', 'about':'Our Story', 'leadership':'Leadership',
    'ministries':'Ministries', 'watch':'Bright Light TV', 'events':'Events',
    'visit':'Plan a Visit', 'giving':'Giving', 'contact':'Contact & Prayer',
    'services':'Church Services', 'prayer':'Prayer', 'beliefs':'Our Beliefs',
}
EXCLUDE = {'404.html','robots.html','sitemap.html'}
# Run only on public, top-level HTML pages that have an actual main element.
SUPABASE = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>'
CONFIG   = '<script src="membership/config.js"></script>'
MARKERS  = '<script src="membership/blc-auto-markers.js" defer></script>'
LOADER   = '<script src="membership/blc-public-content.js" defer></script>'


def insert_before_body(source, tags):
    return re.sub(r'</body\s*>', tags + '\n</body>', source, count=1, flags=re.I)


def page_key_from_name(stem):
    return 'home' if stem == 'index' else stem.lower()


def title_from_html(source, stem):
    match = re.search(r'<title[^>]*>(.*?)</title>',source,re.I | re.S)
    raw = re.sub('<[^>]+>', ' ',match.group(1)).strip() if match else ''
    raw = html.unescape(raw)
    raw = re.split(r'\s*[|·–—]\s*Bright Light Church',raw,flags=re.I)[0].strip()
    return PAGE_LABELS.get(stem,raw or stem.replace('-',' ').title())


def install():
    if not (MEMBERSHIP / 'blc-auto-markers.js').exists():
        raise SystemExit('Install the membership/ files from the package first.')
    pages=[]
    updated=[]
    for path in sorted(ROOT.glob('*.html')):
        if path.name.lower() in EXCLUDE or not re.fullmatch(r'[a-z0-9_-]{1,75}',path.stem.lower()):
            continue
        source=path.read_text(encoding='utf-8-sig')
        if not re.search(r'<main(?:\s|>)',source,re.I) or not re.search(r'</body\s*>',source,re.I):
            continue
        stem=path.stem.lower()
        pages.append({'key':page_key_from_name(stem),'label':title_from_html(source,stem),'file':path.name})
        needs=[]
        if not re.search(r'<script[^>]+src=["\'](?:https://cdn\.jsdelivr\.net/npm/)?@supabase/supabase-js',source,re.I):
            # More broadly, any existing Supabase CDN script is sufficient.
            if not re.search(r'<script[^>]+src=["\'][^"\']*supabase(?:-js)?[^"\']*\.js',source,re.I):
                needs.append(SUPABASE)
        if not re.search(r'<script[^>]+src=["\'](?:\./)?membership/config\.js["\']',source,re.I):
            needs.append(CONFIG)
        if stem!='index' and 'membership/blc-auto-markers.js' not in source:
            needs.append(MARKERS)
        if 'membership/blc-public-content.js' not in source:
            needs.append(LOADER)
        if needs:
            backup=path.with_suffix(path.suffix+'.bak')
            if not backup.exists(): shutil.copyfile(path, backup)
            modified=insert_before_body(source,'\n'+'\n'.join(needs))
            path.write_text(modified,encoding='utf-8')
            updated.append(path.name)
    if not pages:
        raise SystemExit('No root-level public pages with <main> were found; did you run this in the site repo?')
    (MEMBERSHIP / 'blc-pages.json').write_text(json.dumps({'pages':pages},indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print(f'Found {len(pages)} public pages. Updated {len(updated)} HTML pages: {", ".join(updated) or "none (already connected)"}.')
    print('Created membership/blc-pages.json. Review the changed files before committing to GitHub.')
    print('Do not upload the .html.bak files or this installer to the public site.')

if __name__=='__main__': install()
