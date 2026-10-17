# Utopia-update

## Userscript split

The former combined userscript is separated into two independently installed scripts:

- **ChatGPT batch image generator**: [Ozon_ChatGPT.user.js](https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js) — runs only on ChatGPT domains. The existing Tampermonkey script identity is retained so updates can replace the existing entry.
- **Ozon SKU image crawler**: [Ozon_SKU_Image_Crawler.user.js](https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_SKU_Image_Crawler.user.js) — runs only on Ozon domains and owns the Excel-driven SKU crawler, local image download, queue state, and update UI.

## Install / migrate

1. Update the existing combined script through its normal Tampermonkey update flow. It will become ChatGPT-only and will no longer create the Ozon crawler panel.
2. Install [Ozon_SKU_Image_Crawler.user.js](https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_SKU_Image_Crawler.user.js) as a separate userscript.
3. On Ozon, re-import the Excel file into the new crawler. Tampermonkey GM storage is scoped to each script, so the old crawler queue/settings are not automatically copied. The existing Ozon-origin IndexedDB directory handle may remain available; re-authorize the folder if requested.

## Region-unavailable safety

The crawler recognizes a region-unavailable exception only when a visible region-delivery marker and visible similar-offers layout evidence are both present. It never uses the ordinary first-result fallback on such a page. Recovery checks, in order:

1. An exact Ozon product href matching the input SKU.
2. A native `[id^="state-webOutOfStock-"]` widget whose `data-state` parses as JSON, whose `common.action.behavior` is `BEHAVIOR_TYPE_REDIRECT`, and whose product ID exactly matches the input SKU.
3. A safe detail URL constructed from the input SKU only.

The target detail ID is verified again before the image is downloaded. An unverifiable or mismatched detail is rejected; that SKU is recorded as failed and the queue continues.

## Validation

GitHub Actions checks both userscripts' JavaScript syntax and verifies that their `@match` domains and module boundaries remain separated. Live Ozon browser acceptance is still required after installing the merged release.
