# Recovery reload follow-up

This follow-up is intended for DEV first. Do not publish live without Andy's
explicit approval. Update the newest recent-changes date if the release date changes.

Recovery labels and disabled states are reapplied after data rendering, tab
changes and order-mode changes. Normal invoice labels come from markup; order
labels retain edit/already-ordered modes. Preview and active-save restrictions
remain in place.

A versioned SHA-256 fingerprint of the submitted form and attachment metadata
is stored with the pending reference before dispatch. The snapshot is captured
before asynchronous file reading. Recovery clears the form only when its hash
matches and it has not changed during the comparison. Hashing uses Web Crypto;
no extra form contents are stored in recovery localStorage.

Changed forms, legacy records without a fingerprint, and unavailable hashes
preserve the entries. A separate persistent confirmation marker requires an
explicit choice before sending those entries as a new purchase. Cancel does
not submit. Confirmation applies to the exact current form and is re-requested
if it changes while the dialog is open. The marker survives another reload and
is removed when a new submission is safely remembered. Thus a normal next click
cannot silently repeat the original purchase, even when form identity is unknown.

Browser coverage includes both forms after reload, visible recovery notice,
PENDING/DONE/CANCELLED responses, retained new entries and attachments, zero
order/invoice submit calls during a check, normal labels after completion,
unchanged same-session form reset, preview restrictions and busy buttons.
The real-submit timeout matrix covers both forms, restored original entries,
changed entries, legacy references and failed hashing. It checks the NEXT click
after DONE, persistence of confirmation across another reload, cancelling, and
explicitly submitting a separate purchase. Restored originals must clear.
The mobile price marker is explicitly checked for visibility, dotted underline
and fit at every tested width, including 320px and the 768/769px boundary.

The upload inventory reads configured file extensions. Its negative test creates
a temporary project copy under ignored tmp/, adds an unexpected .gs file there,
verifies rejection, removes its own probe, and
then the normal check requires exactly the 14 intended application files.
