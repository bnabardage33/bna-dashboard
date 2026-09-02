#!/bin/bash
sed -i -e '/{/\* PARTIE 1 : PLAQUE BRUTE MATIÈRE PREMIÈRE \*\//,/<\/div>/s/^.*$//' \
       -e '/{/\* PARTIE 2 : CALEPINAGE (MODULES) \*\//,/<\/div>/s/^.*$//' \
       components/ZoneCard.tsx
