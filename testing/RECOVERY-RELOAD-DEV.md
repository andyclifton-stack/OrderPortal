# Recovery reload follow-up

This follow-up is intended for DEV first. Do not publish live without Andy's
explicit approval. Update the newest recent-changes date if the release date changes.

Recovery labels and disabled states are reapplied after data rendering, tab
changes and order-mode changes. Normal invoice labels come from markup; order
labels retain edit/already-ordered modes. Preview and active-save restrictions
remain in place.

An in-memory snapshot identifies the original form, including attachment
metadata, when a submission starts. Recovery clears it only if the original
snapshot is known and still matches. After a reload, or when entries have
changed, recovery preserves the current entries and selected attachments and
explains that they have not been submitted as a new purchase. This deliberately
also preserves restored original entries when their identity cannot be proved;
the message tells the user to review them before saving to avoid repeating the
original purchase. No extra form contents are stored in recovery localStorage.

Browser coverage includes both forms after reload, visible recovery notice,
PENDING/DONE/CANCELLED responses, retained new entries and attachments, zero
order/invoice submit calls during a check, normal labels after completion,
unchanged same-session form reset, preview restrictions and busy buttons.
The mobile price marker is explicitly checked for visibility, dotted underline
and fit at every tested width, including 320px and the 768/769px boundary.

The upload inventory reads configured file extensions. Its negative test creates
a temporary unexpected .gs file, verifies rejection, removes its own probe, and
then the normal check requires exactly the 14 intended application files.
