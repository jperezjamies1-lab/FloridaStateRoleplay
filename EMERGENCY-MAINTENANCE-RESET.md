# Emergency Maintenance Reset

This build automatically disables stale maintenance settings from previous safety versions.

## Immediate public bypass

Add this to the website address:

```text
?maintenance=off
```

Example:

```text
https://your-domain.pages.dev/?maintenance=off
```

## Manager bypass

Open:

```text
https://your-domain.pages.dev/#manager
```

Then set:

```text
Maintenance Mode: Off
Confirm Public Lock: No — keep website open
```

Publish to Cloud.

## Built-in escape

The maintenance screen includes **Continue to Website**. Pressing it stores a bypass for the current browser tab and immediately restores scrolling.

## Why the old screen cannot lock this build

Maintenance only appears when:

1. `maintenance.enabled` is true
2. `maintenance.publicLockConfirmed` is true
3. `maintenance.safetyVersion` is at least 3
4. The visitor has not selected a bypass

Old settings with safety version 1 or 2 are automatically reset to off.
