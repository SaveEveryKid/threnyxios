#!/bin/sh
# Builds site/: the game as a normal website (any static host). Same files as
# the artifact bundle, with a complete index.html at the root.
set -e
cd "$(dirname "$0")/.."
rm -rf site && mkdir -p site
cp -r client site/client && rm -f site/client/showcase.html site/client/index.html
mkdir -p site/engine && cp engine/*.js site/engine/ && cp -r engine/cards engine/data site/engine/
sed -e 's#href="css/#href="client/css/#g' -e 's#href="fonts/#href="client/fonts/#g' -e 's#href="art/#href="client/art/#g' -e 's#src="js/#src="client/js/#g' -e 's#href="manifest.webmanifest#href="client/manifest.webmanifest#g' client/index.html > site/index.html
# stamp the build so More shows which version is running
V="$(git rev-parse --short HEAD 2>/dev/null || echo unknown) · $(date -u +%Y-%m-%d\ %H:%M) UTC"
echo "export const VERSION = '$V';" > site/client/js/version.js
node tools/stamp-site.mjs "$(git rev-parse --short HEAD 2>/dev/null || date -u +%s)"
echo "site/ ready: $(find site -type f | wc -l) files"
