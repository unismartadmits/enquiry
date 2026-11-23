# UniSmart Admits: enquiry form

Live link: **https://unismartadmits.github.io/enquiry/?src=<channel>**

`channel` tells the Enquiry Log where the student came from:
instagram, linkedin, facebook, website, qr, nfc, whatsapp, google, youtube, referral.

## What it does
A one-screen page where a student types their phone number. The number is saved to the
UniSmart **Enquiry Log** Google Sheet the moment it is complete, even if they never press Submit.
- One row per visit and per different number; repeat numbers are kept and marked "Repeat of row X".
- Unsent saves wait on the phone and go out when the internet is back.
- Spam guard (10 numbers a minute per phone, hidden bot trap, fake numbers marked "Check").
- Optional "Share your area?" card for the exact location.

## Files
| File | What it is |
|---|---|
| `index.html` | The page (logo is embedded) |
| `assets/style.css` | Look and feel: brand red #AC070D, Manrope font |
| `assets/app.js` | Behaviour. Line 10 (`EXEC`) is the Google Apps Script address the page sends numbers to |

## How it is hosted
GitHub Pages: Settings > Pages > Deploy from a branch > `main` / root.
Any change to these files is live in about a minute.

## The Google side (not in this repo)
Numbers go to the Apps Script project **"UniSmart Enquiry Page"**, which writes to the Enquiry Log sheet.
The script code is kept privately (not here) so the sheet details stay private.
If the script is moved to another Google account and redeployed, paste its new `/exec` address
into `EXEC` in `assets/app.js`. Nothing else needs to change.

## Old link
`https://atharavwork.github.io/unismart-enquiry/` forwards here (keeping `?src=`), so links
already printed or shared keep working.
