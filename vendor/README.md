# Third-party files

| File | Source | License |
|---|---|---|
| `pdf-lib.min.js` | pdf-lib 1.17.1 (npm) | MIT — `pdf-lib-LICENSE.md` |
| `fontkit.umd.min.js` | @pdf-lib/fontkit 1.1.1 (npm) | MIT |
| `../fonts/Pretendard-*.ttf` | Pretendard 1.3.9 (npm, static/alternative TTF) | SIL OFL 1.1 — `../fonts/OFL.txt` |

TTF is used on purpose: pdf-lib font subsetting fails on the CFF-based OTF files.

## Local patch: `fontkit.umd.min.js`

TrueType subsetting wrote the glyph index (`loca`) in the short format without padding glyph
data to even lengths, which truncated odd-length glyphs (characters missing in the PDF).
Patched `TTFSubset.encode` to always use the long format:

```
this.loca={offsets:[]}   ->   this.loca={offsets:[],version:1}
```
