const webpush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (publicKey && privateKey && !publicKey.startsWith('your-')) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@example.com',
    publicKey,
    privateKey
  );
} else {
  console.warn('[webpush] VAPID keys are not set. Browser push stays off until they are configured.');
}

module.exports = webpush;
