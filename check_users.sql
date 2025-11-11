-- Check if users exist in the database
SELECT 
  'user' as table_name, 
  COUNT(*) as total_records
FROM "user"
UNION ALL
SELECT 
  'session' as table_name, 
  COUNT(*) as total_records
FROM session
UNION ALL
SELECT 
  'account' as table_name,
  COUNT(*) as total_records  
FROM account;

-- Show first 5 users if any
SELECT id, email, name, "emailVerified", "createdAt"
FROM "user"
LIMIT 5;
