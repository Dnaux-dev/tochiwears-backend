-- Default delivery fees: Lagos ₦3,000, everywhere else ₦4,000.
-- Only runs on a database with no delivery zones yet, so admin edits are never overwritten.
INSERT INTO "delivery_zones" ("id", "name", "states", "fee_kobo", "active")
SELECT gen_random_uuid(), z.name, z.states, z.fee_kobo, true
FROM (VALUES
  ('Lagos', ARRAY['Lagos']::text[], 300000),
  ('Outside Lagos', ARRAY[
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
    'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe',
    'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
    'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau',
    'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
  ]::text[], 400000)
) AS z(name, states, fee_kobo)
WHERE NOT EXISTS (SELECT 1 FROM "delivery_zones");
