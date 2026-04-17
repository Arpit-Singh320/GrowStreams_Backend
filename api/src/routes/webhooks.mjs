import { Router } from 'express';
import crypto from 'crypto';
import {
  handlePROpened,
  handlePRSynchronized,
  handlePRMerged,
  handlePRClosed,
} from '../services/github-agent.mjs';
import { awardSeeds, isQuestCompleted } from '../services/quest-service.mjs';
import { queryOne } from '../services/db.mjs';

const router = Router();

// In-memory deduplication: track last 1000 delivery IDs
const recentDeliveries = new Set();
const deliveryQueue = [];
const MAX_DELIVERIES = 1000;

function trackDelivery(deliveryId) {
  if (recentDeliveries.has(deliveryId)) return false; // duplicate
  recentDeliveries.add(deliveryId);
  deliveryQueue.push(deliveryId);
  if (deliveryQueue.length > MAX_DELIVERIES) {
    const oldest = deliveryQueue.shift();
    recentDeliveries.delete(oldest);
  }
  return true; // new
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/github
// ---------------------------------------------------------------------------
router.post('/github', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];
  const deliveryId = req.headers['x-github-delivery'];

  // Verify webhook secret — MUST be configured, reject all if missing
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] GITHUB_WEBHOOK_SECRET not configured, rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  {
    if (!signature) {
      console.warn('[webhook] Missing X-Hub-Signature-256 header');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      console.warn('[webhook] Invalid HMAC signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // Deduplicate
  if (deliveryId && !trackDelivery(deliveryId)) {
    console.log(`[webhook] Duplicate delivery ${deliveryId}, skipping`);
    return res.status(200).json({ status: 'duplicate' });
  }

  // Parse body (it arrives as raw Buffer from express.raw())
  let payload;
  try {
    payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  } catch (err) {
    console.error('[webhook] Failed to parse body:', err.message);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Return 200 immediately, process async
  res.status(200).json({ status: 'accepted', event, delivery: deliveryId });

  // Route to handler
  try {
    console.log(`[webhook] Processing event: ${event}, delivery: ${deliveryId}`);
    
    if (event === 'pull_request') {
      const action = payload.action;
      const merged = payload.pull_request?.merged;
      const prNumber = payload.pull_request?.number;
      const author = payload.pull_request?.user?.login;

      console.log(`[webhook] pull_request.${action} #${prNumber} by @${author} (merged=${merged})`);

      if (action === 'opened') {
        console.log(`[webhook] Calling handlePROpened for PR #${prNumber}`);
        await handlePROpened(payload);
        console.log(`[webhook] handlePROpened completed for PR #${prNumber}`);
      } else if (action === 'synchronize') {
        console.log(`[webhook] Calling handlePRSynchronized for PR #${prNumber}`);
        await handlePRSynchronized(payload);
        console.log(`[webhook] handlePRSynchronized completed for PR #${prNumber}`);
      } else if (action === 'closed' && merged) {
        console.log(`[webhook] Calling handlePRMerged for PR #${prNumber}`);
        await handlePRMerged(payload);
        console.log(`[webhook] handlePRMerged completed for PR #${prNumber}`);
      } else if (action === 'closed' && !merged) {
        console.log(`[webhook] Calling handlePRClosed for PR #${prNumber}`);
        await handlePRClosed(payload);
        console.log(`[webhook] handlePRClosed completed for PR #${prNumber}`);
      } else {
        console.log(`[webhook] Ignoring pull_request.${action} for PR #${prNumber}`);
      }
      // Quest Q4: Award Seeds for PR opened by a quest-registered user
      if (action === 'opened' && author) {
        try {
          const questReg = await queryOne(
            `SELECT wallet FROM quest_registrations WHERE github_username = $1`,
            [author.toLowerCase()]
          );
          if (questReg) {
            const completion = await awardSeeds(questReg.wallet, 'raise-pr', { pr_number: prNumber, author });
            if (completion) {
              console.log(`[webhook] Quest Q4: Awarded Seeds to ${questReg.wallet} for PR #${prNumber}`);
            }
          }
        } catch (questErr) {
          console.warn(`[webhook] Quest PR award failed: ${questErr.message}`);
        }
      }
    } else if (event === 'star') {
      // Quest Q3: Star event
      const action = payload.action;
      const sender = payload.sender?.login;
      console.log(`[webhook] star.${action} by @${sender}`);

      if (action === 'created' && sender) {
        try {
          const questReg = await queryOne(
            `SELECT wallet FROM quest_registrations WHERE github_username = $1`,
            [sender.toLowerCase()]
          );
          if (questReg && !(await isQuestCompleted(questReg.wallet, 'star-repo'))) {
            await awardSeeds(questReg.wallet, 'star-repo', { github_user: sender });
            console.log(`[webhook] Quest Q3: Awarded Seeds to ${questReg.wallet} for starring repo`);
          }
        } catch (questErr) {
          console.warn(`[webhook] Quest star award failed: ${questErr.message}`);
        }
      }
    } else if (event === 'ping') {
      console.log('[webhook] Ping received, webhook configured correctly');
    } else {
      console.log(`[webhook] Ignoring event: ${event}`);
    }
  } catch (err) {
    console.error(`[webhook] Handler error for ${event}:`, err);
    console.error(`[webhook] Error stack:`, err.stack);
  }
});

export default router;
