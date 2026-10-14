# BDO Inquiry Autofill

Chrome/Edge extension: enter your buyer details once, save them locally, and fill matching contact fields on BDO's vehicle inquiry form with one click. No dependencies, server, analytics, automatic submission, or synced personal data.

## Install

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Turn on **Developer mode**, click **Load unpacked**, and select this folder.
3. Pin **BDO Inquiry Autofill** from the Extensions menu.
4. Open your BDO vehicle inquiry link and wait for its form to load.
5. Open the extension, enter your details, and click **Save my details**.
6. Click **Inspect form**, confirm each field's match, then **Fill matched fields**.
7. Review the BDO page and submit it yourself.

Clicking **Fill matched fields** also selects **Buy Now**, **Preferred Sales Officer: None**, **Source/Channel: BDO Website**, and **BDO Loan: No**. Native dropdowns/radios and accessible custom lookup menus are supported. Unavailable choices are reported for manual review. It also scrolls the privacy text to the bottom and selects the specific Data Privacy Consent checkbox as requested. Other checkboxes, vehicle/plate/brand/model fields, CAPTCHA, passwords, hidden fields, and read-only contact fields are not filled. Existing contact values are kept unless you select **Replace existing contact details**. Field mappings are saved for later inquiries. Use **Clear saved data** to remove your local profile and mappings. The extension has temporary access only to the tab you invoke it on; the code refuses pages outside the BDO vehicle inquiry path.

The live form fields could not be retrieved during development. Standard inputs, textareas, dropdowns, and same-origin embedded forms are supported and covered by fixture tests. A cross-origin embedded form or custom closed-shadow controls may need an update based on the actual page; no broad banking-site permissions are requested.

## Test

```sh
node --test tests/form.test.cjs
```

The extension is independent of the e-commerce repository and has not been published to an extension store or GitHub. This is a personal convenience tool, not an official BDO extension.
