const crypto = require('crypto');
const Razorpay = require('razorpay');

// Payment runs through Razorpay test mode: no real money moves, but the full
// checkout + signature verification flow is exercised end to end.
let razorpay = null;
let razorpayUnavailableReason = null;

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    razorpayUnavailableReason = 'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in server/.env';
    throw new Error(razorpayUnavailableReason);
  }
  if (!razorpay) {
    razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return razorpay;
}

function isConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

// amountPaise must already be in paise (rupees * 100).
async function createOrder({ amountPaise, receipt, notes = {} }) {
  const instance = getRazorpay();
  return instance.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes,
  });
}

// Razorpay signs: HMAC_SHA256(order_id + '|' + payment_id, KEY_SECRET)
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(String(signature), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

module.exports = { createOrder, verifyPaymentSignature, isConfigured };
