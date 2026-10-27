# Site assets

`og-image.svg` is the source of the social share card served at
`https://devcodex-labs.github.io/schema-dsl/og-image.png` (1200x630).

Regenerate the PNG after editing the SVG (requires `sharp`, installed outside this repo):

```bash
node -e "require('sharp')('website/assets/og-image.svg').png({compressionLevel:9,palette:true}).toFile('docs/public/og-image.png')"
```
