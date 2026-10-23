const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');
const webpush = require('../utils/webpush');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const User = require('../models/User');

function auth(req,res,next){
  const h = req.headers.authorization || '';
  const token = h.replace('Bearer ','');
  if(!token) return res.status(401).end();
  try { const payload = jwt.verify(token, process.env.JWT_SECRET); req.userId = payload.id; next(); } catch(e){ return res.status(401).end(); }
}

// Save subscription (from frontend)
router.post('/subscribe', auth, async (req,res)=>{
  const { token } = req.body; // subscription JSON string or object
  const subscription = (typeof token === 'string') ? JSON.parse(token) : token;
  await Subscription.findOneAndUpdate({ userId: req.userId }, { subscription }, { upsert: true });
  res.json({ ok: true });
});

// snooze placeholder
router.post('/snooze', auth, async (req,res)=>{
  // store snooze data if you want (not implemented)
  res.json({ ok: true });
});

// send notification right away (used by frontend)
router.post('/notify', auth, async (req,res)=>{
  const { title, body, email } = req.body;
  const subDoc = await Subscription.findOne({ userId: req.userId });
  if(subDoc && subDoc.subscription){
    try {
      await webpush.sendNotification(subDoc.subscription, JSON.stringify({ title, body }));
    } catch(e){ console.warn('push send failed', e.message); }
  }
  if(email){
    try {
      await sendEmail(email, title, body);
    } catch(e){ console.warn('email failed', e.message); }
  } else {
    // try to look up user's email and send it
    try {
      const user = await User.findById(req.userId);
      if(user?.email) await sendEmail(user.email, title, body);
    } catch(e){ console.warn('email send fallback failed', e.message); }
  }
  res.json({ ok: true });
});

module.exports = router;
