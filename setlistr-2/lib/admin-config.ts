// Interim test-account filter — replace with profiles.is_test column post-launch (Dev Board).
export const TEST_USER_IDS = new Set<string>([
  '668974bc-dce6-4f59-a8ab-999bfb3caa06', // Keith Urban — test account (jesse@boppermusic.com)
  '32faac83-bec1-44f9-9692-8387df692abc', // Thomas Rhett — test account (info@setlistr.ai)
  'fcb80623-0c6e-45a7-a5c2-7228fbefab5e', // Jesse Slack (Manager) — internal manager-flow test account
  '6ab2db5d-3a29-4b18-b913-f0816c32f365', // Dead signup — typo'd email domain (.con), null profile
])

// Single source of truth for admin panel access — used by both
// app/app/admin/page.tsx and app/app/admin/rd-log/page.tsx. Previously each
// page kept its own copy; rd-log's had drifted stale and was missing
// Spencer (srclarke7@gmail.com, CTO) after he was added to the main list.
export const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
  'srclarke7@gmail.com',
]
