-- Get all unused invite codes in GS-XXXX-XXXX format as comma-separated string
SELECT STRING_AGG(code, ', ' ORDER BY code) AS unused_codes
FROM quest_invites
WHERE current_uses < max_uses
  AND code LIKE 'GS-%';

-- Alternative: Get count and list separately
SELECT 
  COUNT(*) AS total_unused,
  STRING_AGG(code, ', ' ORDER BY code) AS codes
FROM quest_invites
WHERE current_uses < max_uses
  AND code LIKE 'GS-%';
