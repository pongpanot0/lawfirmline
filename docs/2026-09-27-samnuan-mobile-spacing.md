# Samnuan mobile: spacing adjustment

- Applied common page insets to 23 screens: horizontal 16, top 12, bottom 24 logical pixels. Keyboard-aware forms retain their keyboard inset.
- List cards use 12 logical pixels between items. Search pages use the same 12-pixel content inset.
- Gap-based expense, court-day and court-team forms no longer add the section label's bottom margin on top of the container gap.
- Calendar renders one horizontal row per week with 44-pixel day cells. This removes the large trailing gap in the wrapping grid and centers the selected date. Date heading and add button align vertically.

Verification: mobile TypeScript check, court workflow regression script, and whitespace check pass. Native iPhone 17 Pro preview with isolated local test data was visually checked for September 2026 (five weeks) and August 2026 (six weeks); dates and the trailing card inset display correctly. Four-week month and small-screen keyboard walkthrough were not completed in this round because Simulator window inspection stopped responding. Earlier keyboard checks do not prove this spacing revision.

These changes are in the mobile source/preview. The previously delivered 0.1.1 APK does not include this spacing revision; no replacement APK was built in this round.
