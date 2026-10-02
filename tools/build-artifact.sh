#!/bin/sh
# Builds dist/: a publishable bundle (page at root, client/ and engine/ beside it).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp -r client dist/client && rm -f dist/client/showcase.html dist/client/index.html
mkdir -p dist/engine && cp engine/*.js dist/engine/ && cp -r engine/cards engine/data dist/engine/
python3 - <<'PY'
import re
s=open('client/index.html').read()
head=re.search(r'<head>(.*)</head>', s, re.S).group(1)
body=re.search(r'<body>(.*)</body>', s, re.S).group(1)
head=re.sub(r'<meta[^>]*>\n?','',head)
head=head.replace('href="css/','href="client/css/').replace('href="fonts/','href="client/fonts/').replace('href="art/','href="client/art/')
body=body.replace('src="js/','src="client/js/')
out=head.strip()+'\n<style>:root{color-scheme:dark} html,body{height:100%;background:#040406}</style>\n'+body.strip()+'\n'
open('dist/index.html','w').write(out)
PY
find dist -type f | wc -l
