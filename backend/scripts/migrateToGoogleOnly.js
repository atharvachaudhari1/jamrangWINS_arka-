/**
 * One-off migration: drops the legacy password-auth fields from the users
 * collection now that Google Sign-In is the only supported auth method.
 *
 * Run once, after deploying the code that removes email/password auth:
 *   node scripts/migrateToGoogleOnly.js
 *
 * Requires MONGODB_URI in the environment (or backend/.env).
 *
 * Any user document that has no googleId (i.e. was never linked to Google)
 * is reported but NOT deleted — sign in with Google using that same email
 * first (which links the account), then re-run this script to clean it up,
 * or delete it manually if the account should no longer exist.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const users = mongoose.connection.collection('users');

  const withoutGoogleId = await users.find({ googleId: { $in: [null, undefined] } }).toArray();
  if (withoutGoogleId.length > 0) {
    console.warn(`Skipping ${withoutGoogleId.length} account(s) with no googleId (sign in with Google first to link them):`);
    withoutGoogleId.forEach((u) => console.warn(`  - ${u.email}`));
  }

  const result = await users.updateMany(
    { googleId: { $nin: [null, undefined] } },
    { $unset: { passwordHash: '', authProviders: '' } }
  );

  console.log(`Cleaned password fields from ${result.modifiedCount} account(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
